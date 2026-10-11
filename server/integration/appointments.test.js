import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
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
import { clinicDate, clinicDayRange, appointmentStart, SLOT_MS } from '../src/utils/clinicTime.js'

test('appointment HTTP workflows reject concurrent conflicts and preserve cancelled/history records', async (t) => {
  loadLocalEnvironment()
  const dbName = `apt_test_${Date.now()}_${randomBytes(6).toString('hex')}`
  const config = { jwtSecret: randomBytes(48).toString('hex'), registrationCode: randomBytes(16).toString('hex'), appOrigin: 'http://localhost:5173', secureCookies: false }
  let connected = false
  let server
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (connected && mongoose.connection.name === dbName && /^apt_test_\d+_[a-f0-9]{12}$/.test(dbName)) await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  })
  await connectDatabase({ ...getConfig(), dbName }); connected = true
  await Promise.all([User.init(), Session.init(), Patient.init(), Doctor.init(), Appointment.init()])
  server = createApp({ pingDatabase, config, authService: createAuthService(config) }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api`
  let cookie
  async function call(path, method = 'GET', body, authenticated = true) {
    return fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: config.appOrigin, 'X-Clinic-Request': '1', ...(authenticated && cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  assert.equal((await call('/appointments')).status, 401)
  assert.equal((await call('/dashboard')).status, 401)
  const registered = await call('/auth/register', 'POST', { name: 'Fictional Scheduling Staff', email: 'scheduling@example.com', password: 'fictional-scheduling-passphrase', registrationCode: config.registrationCode })
  assert.equal(registered.status, 201)
  cookie = registered.headers.get('set-cookie').split(';')[0]
  const userId = (await registered.json()).user.id
  const patients = await Promise.all(['Fictional Alpha', 'Fictional Beta'].map((name) => Patient.create({ name, dateOfBirth: '2000-01-01', createdBy: userId, updatedBy: userId })))
  const doctors = await Promise.all(['Fictional Doctor One', 'Fictional Doctor Two'].map((name) => Doctor.create({ name, specialty: 'Family medicine', createdBy: userId, updatedBy: userId })))
  const tomorrow = clinicDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
  const booking = { patientId: patients[0].id, doctorId: doctors[0].id, date: tomorrow, time: '09:00', reason: 'Fictional follow-up' }
  assert.equal((await call('/appointments', 'POST', booking, false)).status, 401)
  assert.equal((await call('/appointments', 'POST', { ...booking, time: '09:15' })).status, 400)
  assert.equal((await call('/appointments', 'POST', { ...booking, date: '2000-01-01' })).status, 400)
  assert.equal((await call('/appointments', 'POST', { ...booking, patientId: new mongoose.Types.ObjectId().toString() })).status, 400)
  assert.equal((await call('/appointments', 'POST', { ...booking, status: 'completed' })).status, 400)

  const competing = await Promise.all(Array.from({ length: 5 }, () => call('/appointments', 'POST', booking)))
  assert.deepEqual(competing.map((response) => response.status).sort(), [201, 409, 409, 409, 409])
  const first = (await competing.find((response) => response.status === 201).json()).record
  assert.equal(first.patient.name, patients[0].name)
  assert.equal(first.doctor.name, doctors[0].name)
  assert.equal(first.version, 0)
  assert.equal(new Date(first.endsAt) - new Date(first.startsAt), SLOT_MS)
  assert.equal(first.createdBy, undefined)
  assert.deepEqual(first.availableTransitions, ['cancelled'])
  assert.equal((await call(`/appointments/${first.id}/status`, 'PATCH', { status: 'checked_in', version: 0 })).status, 400)
  assert.equal((await call(`/appointments/${first.id}/status`, 'PATCH', { status: 'no_show', version: 0 })).status, 400)
  assert.equal((await call(`/appointments/${first.id}/status`, 'PATCH', { status: 'completed', version: 0 })).status, 409)
  const sameTimeOtherDoctor = await call('/appointments', 'POST', { ...booking, doctorId: doctors[1].id, patientId: patients[1].id })
  assert.equal(sameTimeOtherDoctor.status, 201)
  const adjacent = await call('/appointments', 'POST', { ...booking, time: '09:30' })
  assert.equal(adjacent.status, 201)
  const second = (await adjacent.json()).record
  const conflict = await call(`/appointments/${second.id}`, 'PATCH', { ...booking, version: 0 })
  assert.equal(conflict.status, 409)
  assert.ok((await conflict.json()).fields.time)
  assert.equal((await Appointment.findById(second.id)).startsAt.toISOString(), new Date(second.startsAt).toISOString(), 'failed reschedule retains its original slot')

  const target = { ...booking, time: '10:00', version: 0 }
  const reschedules = await Promise.all([first, second].map((record) => call(`/appointments/${record.id}`, 'PATCH', target)))
  assert.deepEqual(reschedules.map((response) => response.status).sort(), [200, 409])
  const winner = (await reschedules.find((response) => response.status === 200).json()).record
  assert.equal(winner.version, 1)
  assert.equal((await call(`/appointments/${winner.id}`, 'PATCH', target)).status, 409, 'stale edits cannot overwrite a reschedule')
  assert.equal((await call(`/appointments/${winner.id}/status`, 'PATCH', { status: 'cancelled', version: 1 }, false)).status, 401)
  const cancelled = await call(`/appointments/${winner.id}/status`, 'PATCH', { status: 'cancelled', version: 1, note: 'Fictional cancellation note' })
  assert.equal(cancelled.status, 200)
  const cancelledRecord = (await cancelled.json()).record
  assert.equal(cancelledRecord.statusHistory.at(-1).note, 'Fictional cancellation note')
  assert.equal(await Appointment.countDocuments({ _id: winner.id }), 1)
  assert.equal((await call(`/appointments/${winner.id}`, 'PATCH', { ...booking, time: '11:00', version: 2 })).status, 409)
  assert.equal((await call(`/appointments/${winner.id}/status`, 'PATCH', { status: 'checked_in', version: 2 })).status, 409)
  assert.equal((await call('/appointments', 'POST', { ...booking, time: '10:00' })).status, 201, 'cancellation releases the slot')

  await Patient.findByIdAndUpdate(patients[1].id, { $set: { archivedAt: new Date() } })
  const invalidPatient = await call('/appointments', 'POST', { ...booking, patientId: patients[1].id, time: '11:00' })
  assert.equal(invalidPatient.status, 400)
  assert.ok((await invalidPatient.json()).fields.patientId)
  await Doctor.findByIdAndUpdate(doctors[1].id, { $set: { archivedAt: new Date() } })
  assert.equal((await call('/appointments', 'POST', { ...booking, doctorId: doctors[1].id, time: '11:00' })).status, 400)
  const archivedLinked = (await (await call('/appointments?q=Fictional%20Beta&date=')).json()).records[0]
  assert.equal(archivedLinked.patient.name, patients[1].name)
  assert.ok(archivedLinked.patient.archivedAt)
  assert.ok(archivedLinked.doctor.archivedAt)
  const searched = (await (await call(`/appointments?q=${patients[0].patientId}&date=${tomorrow}`)).json())
  assert.equal(searched.pagination.total, 3)
  assert.equal(searched.records[0].reason, undefined, 'list summaries omit the visit reason')
  assert.equal(searched.records[0].statusHistory, undefined, 'list summaries omit scheduling notes')
  assert.equal((await (await call('/appointments?q=.*')).json()).pagination.total, 0)
  assert.equal((await call('/appointments?status=hidden')).status, 400)
  assert.equal((await call('/appointments?patientId[$ne]=x')).status, 400)
  assert.equal((await call('/appointments/not-an-id')).status, 400)
  assert.equal((await call(`/appointments/${new mongoose.Types.ObjectId()}`)).status, 404)

  // Fixed, historical fixtures exercise same-day lifecycle and dashboard boundaries.
  const today = clinicDate()
  const range = clinicDayRange(today)
  const start = appointmentStart(today, '00:00')
  const seeded = await Appointment.create({ patientId: patients[0].id, doctorId: doctors[0].id, startsAt: start, endsAt: new Date(start.valueOf() + SLOT_MS), reason: '', status: 'scheduled', statusHistory: [{ status: 'scheduled', at: start, by: userId }], createdBy: userId, updatedBy: userId })
  const checkIn = await call(`/appointments/${seeded.id}/status`, 'PATCH', { status: 'checked_in', version: 0 })
  assert.equal(checkIn.status, 200)
  let dashboard = (await (await call('/dashboard')).json())
  assert.equal(dashboard.patients, 1)
  assert.equal(dashboard.doctors, 1)
  assert.equal(dashboard.waiting, 1)
  assert.equal(dashboard.statuses.checked_in, 1)
  assert.equal(dashboard.todayTotal, 1)
  assert.equal(dashboard.appointments[0].id, seeded.id)
  const completion = await call(`/appointments/${seeded.id}/status`, 'PATCH', { status: 'completed', version: 1 })
  assert.equal(completion.status, 200)
  assert.equal((await completion.json()).record.statusHistory.length, 3)
  const noShowStart = new Date(range.start.valueOf() + SLOT_MS)
  const missed = await Appointment.create({ patientId: patients[0].id, doctorId: doctors[0].id, startsAt: noShowStart, endsAt: new Date(noShowStart.valueOf() + SLOT_MS), status: 'scheduled', statusHistory: [{ status: 'scheduled', at: noShowStart, by: userId }], createdBy: userId, updatedBy: userId })
  // At the first half-hour of a day this no-show fixture is not yet due.
  if (noShowStart.valueOf() <= Date.now()) assert.equal((await call(`/appointments/${missed.id}/status`, 'PATCH', { status: 'no_show', version: 0 })).status, 200)
  dashboard = (await (await call('/dashboard')).json())
  assert.equal(dashboard.waiting, 0)
  assert.equal(dashboard.statuses.completed, 1)
  assert.equal(dashboard.todayTotal, 2)
  assert.equal(dashboard.timeZone, 'Asia/Manila')
  assert.equal((await (await call(`/appointments?patientId=${patients[0].id}&date=${today}`)).json()).pagination.total, 2)

  for (let hour = 12; hour < 22; hour++) assert.equal((await call('/appointments', 'POST', { ...booking, time: `${hour}:00` })).status, 201)
  const pageOne = (await (await call('/appointments?limit=10&date=')).json())
  const pageTwo = (await (await call('/appointments?limit=10&page=2&date=')).json())
  assert.equal(new Set([...pageOne.records, ...pageTwo.records].map((record) => record.id)).size, pageOne.pagination.total)
  assert.equal((await (await call('/appointments?page=999&date=')).json()).pagination.page, 2)
})
