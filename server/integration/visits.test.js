import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import mongoose from 'mongoose'
import { createApp } from '../src/app.js'
import { connectDatabase, disconnectDatabase, pingDatabase } from '../src/config/db.js'
import { getConfig, loadLocalEnvironment } from '../src/config/env.js'
import { createAuthService } from '../src/services/auth.js'
import { User } from '../src/models/User.js'
import { Session } from '../src/models/Session.js'
import { Patient } from '../src/models/Patient.js'
import { Doctor } from '../src/models/Doctor.js'
import { Appointment } from '../src/models/Appointment.js'
import { Visit } from '../src/models/Visit.js'
import { appointmentStart, clinicDate, SLOT_MS } from '../src/utils/clinicTime.js'

test('visit HTTP workflows preserve history, link atomically, and reject conflicting clinical corrections', async (t) => {
  loadLocalEnvironment()
  const dbName = `visit_test_${Date.now()}_${randomBytes(6).toString('hex')}`
  const config = { jwtSecret: randomBytes(48).toString('hex'), registrationCode: randomBytes(16).toString('hex'), appOrigin: 'http://localhost:5173', secureCookies: false }
  let server, connected = false
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (connected && mongoose.connection.name === dbName && /^visit_test_\d+_[a-f0-9]{12}$/.test(dbName)) await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  })
  await connectDatabase({ ...getConfig(), dbName }); connected = true
  await Promise.all([User.init(), Session.init(), Patient.init(), Doctor.init(), Appointment.init(), Visit.init()])
  server = createApp({ pingDatabase, config, authService: createAuthService(config) }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api`
  let cookie
  async function call(path, method = 'GET', body, authenticated = true) {
    return fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: config.appOrigin, 'X-Clinic-Request': '1', ...(authenticated && cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  assert.equal((await call('/visits')).status, 401)
  const registration = await call('/auth/register', 'POST', { name: 'Fictional Visit Staff', email: 'visits@example.com', password: 'fictional-visits-passphrase', registrationCode: config.registrationCode })
  assert.equal(registration.status, 201)
  cookie = registration.headers.get('set-cookie').split(';')[0]
  const user = (await registration.json()).user
  const patient = await Patient.create({ name: 'Fictional [Patient]', dateOfBirth: '2000-01-01', createdBy: user.id, updatedBy: user.id })
  const otherPatient = await Patient.create({ name: 'Other Fictional Patient', dateOfBirth: '2000-01-01', createdBy: user.id, updatedBy: user.id })
  const doctor = await Doctor.create({ name: 'Fictional Doctor', specialty: 'Family medicine', createdBy: user.id, updatedBy: user.id })
  const today = clinicDate()
  const data = { requestId: randomUUID(), patientId: patient.id, doctorId: doctor.id, date: today, reason: 'Fictional reason', diagnosis: 'Fictional finding', notes: 'Fictional notes', treatment: 'Fictional treatment', prescribedMedicines: 'Fictional prescription', followUp: 'Fictional follow-up' }
  assert.equal((await call('/visits', 'POST', data, false)).status, 401)
  assert.equal((await call('/visits', 'POST', { ...data, date: '1999-01-01' })).status, 400)
  assert.equal((await call('/visits', 'POST', { ...data, date: '2999-01-01' })).status, 400)
  const sameSave = await Promise.all([call('/visits', 'POST', data), call('/visits', 'POST', data)])
  assert.deepEqual(sameSave.map((response) => response.status), [201, 201])
  const records = await Promise.all(sameSave.map((response) => response.json()))
  const visit = records[0].record
  assert.equal(visit.id, records[1].record.id)
  assert.equal(await Visit.countDocuments({ requestId: data.requestId }), 1)
  assert.equal(visit.author.name, user.name)
  assert.equal(visit.requestDigest, undefined)
  assert.equal(visit.createdBy, undefined)
  assert.equal((await call('/visits', 'POST', { ...data, notes: 'Different content' })).status, 409)
  assert.equal((await call(`/visits/${visit.id}`, 'PATCH', { notes: 'Overwrite original' })).status, 404)
  assert.equal((await call(`/visits/${visit.id}`, 'DELETE', {})).status, 404)
  assert.equal((await call(`/visits/${visit.id}` , 'GET', undefined, false)).status, 401)
  assert.equal((await call(`/visits/${visit.id}/addenda`, 'POST', { requestId: randomUUID(), version: 0, text: 'Fictional correction' }, false)).status, 401)
  const addenda = await Promise.all(['First correction', 'Second correction'].map((text) => call(`/visits/${visit.id}/addenda`, 'POST', { requestId: randomUUID(), version: 0, text })))
  assert.deepEqual(addenda.map((response) => response.status).sort(), [200, 409])
  let stored = (await (await call(`/visits/${visit.id}`)).json()).record
  assert.equal(stored.version, 1)
  assert.equal(stored.addenda.length, 1)
  assert.equal(stored.notes, data.notes)
  const correction = { requestId: randomUUID(), version: 1, text: 'Another dated correction' }
  const identicalCorrections = await Promise.all([call(`/visits/${visit.id}/addenda`, 'POST', correction), call(`/visits/${visit.id}/addenda`, 'POST', correction)])
  assert.deepEqual(identicalCorrections.map((response) => response.status), [200, 200])
  stored = (await (await call(`/visits/${visit.id}`)).json()).record
  assert.equal(stored.addenda.length, 2)
  assert.equal(stored.version, 2)
  assert.equal(stored.addenda[1].author.name, user.name)
  assert.equal(stored.addenda[1].author.id, undefined)
  assert.equal((await call(`/visits/${visit.id}/addenda`, 'POST', { ...correction, text: 'Changed on retry' })).status, 409)
  const list = (await (await call(`/visits?patientId=${patient.id}`)).json())
  assert.equal(list.pagination.total, 1)
  assert.equal(list.records[0].diagnosis, undefined)
  assert.equal(list.records[0].reason, undefined)
  assert.equal(list.records[0].addenda, undefined)
  assert.equal((await (await call('/visits?q=.*')).json()).pagination.total, 0)
  assert.equal((await (await call('/visits?q=%5BPatient%5D')).json()).pagination.total, 1)
  assert.equal((await call('/visits?patientId[$ne]=x')).status, 400)
  assert.equal((await call('/visits/not-an-id')).status, 400)
  assert.equal((await call(`/visits/${new mongoose.Types.ObjectId()}`)).status, 404)

  async function seedAppointment(time) {
    const start = appointmentStart(today, time)
    return Appointment.create({ patientId: patient.id, doctorId: doctor.id, startsAt: start, endsAt: new Date(start.valueOf() + SLOT_MS), status: 'checked_in', statusHistory: [{ status: 'scheduled', at: start, by: user.id }, { status: 'checked_in', at: start, by: user.id }], createdBy: user.id, updatedBy: user.id })
  }
  const appointment = await seedAppointment('00:00')
  assert.equal((await call(`/appointments/${appointment.id}/status`, 'PATCH', { status: 'completed', version: 0 })).status, 409)
  const linked = { ...data, requestId: randomUUID(), appointmentId: appointment.id, appointmentVersion: 0 }
  assert.equal((await call('/visits', 'POST', { ...linked, patientId: otherPatient.id })).status, 400)
  assert.equal((await call('/visits', 'POST', { ...linked, appointmentVersion: 999 })).status, 409)
  const originalCreate = Visit.create
  const failure = t.mock.method(Visit, 'create', () => { throw new Error('Injected failure after appointment link') })
  assert.equal((await call('/visits', 'POST', linked)).status, 500)
  failure.mock.restore()
  assert.equal(Visit.create, originalCreate)
  let booking = await Appointment.findById(appointment.id)
  assert.equal(booking.__v, 0, 'failed visit insert rolls back appointment version')
  assert.equal(booking.visitId, null, 'failed visit insert rolls back appointment link')
  const otherLinked = { ...linked, requestId: randomUUID() }
  const linkedSaves = await Promise.all([call('/visits', 'POST', linked), call('/visits', 'POST', otherLinked)])
  assert.deepEqual(linkedSaves.map((response) => response.status).sort(), [201, 409])
  const linkedVisit = (await linkedSaves.find((response) => response.status === 201).json()).record
  booking = (await (await call(`/appointments/${appointment.id}`)).json()).record
  assert.equal(booking.visitId, linkedVisit.id)
  assert.ok(booking.availableTransitions.includes('completed'))
  assert.equal(booking.version, 1)
  assert.equal((await call(`/appointments/${appointment.id}/status`, 'PATCH', { status: 'completed', version: 0 })).status, 409)
  assert.equal((await call(`/appointments/${appointment.id}/status`, 'PATCH', { status: 'completed', version: 1 })).status, 200)
  const winningData = linkedSaves[0].status === 201 ? linked : otherLinked
  const retryAfterCompletion = await call('/visits', 'POST', winningData)
  assert.equal(retryAfterCompletion.status, 201)
  assert.equal((await retryAfterCompletion.json()).record.id, linkedVisit.id, 'uncertain save retry succeeds after appointment completion')
  assert.equal(await Visit.countDocuments({ appointmentId: appointment.id }), 1)
  assert.equal((await call('/visits', 'POST', { ...linked, requestId: randomUUID(), appointmentVersion: 2 })).status, 409)

  const racing = await seedAppointment('00:30')
  const race = await Promise.all([
    call('/visits', 'POST', { ...data, requestId: randomUUID(), appointmentId: racing.id, appointmentVersion: 0 }),
    call(`/appointments/${racing.id}/status`, 'PATCH', { status: 'cancelled', version: 0 }),
  ])
  assert.equal(race.filter((response) => response.status === 409).length, 1)
  booking = await Appointment.findById(racing.id)
  const raceVisits = await Visit.countDocuments({ appointmentId: racing.id })
  assert.equal(raceVisits, booking.visitId ? 1 : 0)
  assert.equal(booking.status, booking.visitId ? 'checked_in' : 'cancelled')

  const retryBooking = await seedAppointment('01:00')
  const retryBookingData = { ...data, requestId: randomUUID(), appointmentId: retryBooking.id, appointmentVersion: 0 }
  const matchingLinkedSaves = await Promise.all([call('/visits', 'POST', retryBookingData), call('/visits', 'POST', retryBookingData)])
  assert.deepEqual(matchingLinkedSaves.map((response) => response.status), [201, 201])
  const matchedVisits = await Promise.all(matchingLinkedSaves.map((response) => response.json()))
  assert.equal(matchedVisits[0].record.id, matchedVisits[1].record.id)
  assert.equal(await Visit.countDocuments({ appointmentId: retryBooking.id }), 1)

  await Patient.findByIdAndUpdate(patient.id, { $set: { name: 'Changed Patient', archivedAt: new Date() } })
  await Doctor.findByIdAndUpdate(doctor.id, { $set: { name: 'Changed Doctor', specialty: 'Changed specialty', archivedAt: new Date() } })
  stored = (await (await call(`/visits/${visit.id}`)).json()).record
  assert.equal(stored.patient.name, 'Fictional [Patient]')
  assert.equal(stored.doctor.name, 'Fictional Doctor')
  assert.equal(stored.doctor.specialty, 'Family medicine')
  assert.equal((await call('/visits', 'POST', { ...data, requestId: randomUUID() })).status, 400)
  assert.equal((await call(`/visits/${visit.id}/addenda`, 'POST', { requestId: randomUUID(), version: 2, text: 'Correction after archive' })).status, 200)
  assert.equal((await (await call(`/visits?patientId=${otherPatient.id}`)).json()).pagination.total, 0)
  const original = await Visit.findById(visit.id)
  // Bounded correction history rejects a twenty-first entry without changing the original.
  await Visit.findByIdAndUpdate(visit.id, { $set: { addenda: Array.from({ length: 20 }, () => ({ requestId: randomUUID(), text: 'Fictional note', at: new Date(), author: { id: user.id, name: user.name } })) } })
  assert.equal((await call(`/visits/${visit.id}/addenda`, 'POST', { requestId: randomUUID(), version: original.__v, text: 'Excess note' })).status, 409)
  assert.equal((await Visit.findById(visit.id)).addenda.length, 20)
  // Separate dates and same-date IDs provide stable, descending patient history.
  await Patient.findByIdAndUpdate(patient.id, { $set: { archivedAt: null } })
  await Doctor.findByIdAndUpdate(doctor.id, { $set: { archivedAt: null } })
  for (let index = 0; index < 10; index++) assert.equal((await call('/visits', 'POST', { ...data, requestId: randomUUID(), date: index === 0 ? '2001-01-01' : today })).status, 201)
  const firstPage = (await (await call(`/visits?patientId=${patient.id}&limit=10`)).json())
  const secondPage = (await (await call(`/visits?patientId=${patient.id}&limit=10&page=2`)).json())
  assert.equal(new Set([...firstPage.records, ...secondPage.records].map((record) => record.id)).size, firstPage.pagination.total)
  assert.equal(secondPage.records.at(-1).date, '2001-01-01')
  assert.equal((await (await call('/visits?page=999')).json()).pagination.page, 2)
})
