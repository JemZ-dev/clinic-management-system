import { inviteFixture } from './fixtures.js'
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

test('staff patient and doctor CRUD preserves history and rejects conflicting changes', async (t) => {
  loadLocalEnvironment()
  const dbName = `rec_test_${Date.now()}_${randomBytes(6).toString('hex')}`
  const config = { jwtSecret: randomBytes(48).toString('hex'), registrationCode: randomBytes(16).toString('hex'), appOrigin: 'http://localhost:5173', secureCookies: false }
  let server
  let connected = false
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (connected && mongoose.connection.name === dbName && /^rec_test_\d+_[a-f0-9]{12}$/.test(dbName)) await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  })
  await connectDatabase({ ...getConfig(), dbName })
  connected = true
  await Promise.all([User.init(), Session.init(), Patient.init(), Doctor.init()])
  await inviteFixture('records@example.com', config.registrationCode, 'admin', [])
  server = createApp({ pingDatabase, config, authService: createAuthService(config) }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api`
  let cookie
  async function call(path, method = 'GET', body, authenticated = true) {
    return fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: config.appOrigin, 'X-Clinic-Request': '1', ...(authenticated && cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  for (const kind of ['patients', 'doctors']) {
    assert.equal((await call(`/${kind}`)).status, 401)
    assert.equal((await call(`/${kind}`, 'POST', {})).status, 401)
  }
  const registration = await call('/auth/register', 'POST', { name: 'Fictional Staff', email: 'records@example.com', password: 'fictional-records-passphrase', registrationCode: config.registrationCode })
  assert.equal(registration.status, 201)
  cookie = registration.headers.get('set-cookie').split(';')[0]
  const patient = { name: 'Fictional [Patient]', dateOfBirth: '2000-02-29', phone: '+63 900 000 0000', email: 'PATIENT@EXAMPLE.COM', address: 'Fictional address', emergencyContact: { name: 'Fictional Contact', relationship: 'Sibling', phone: '555' }, medicalHistory: { allergies: 'Fictional allergy', conditions: 'Fictional condition', pastSurgeries: 'Fictional surgery', currentMedications: 'Fictional medication' } }
  assert.equal((await call('/patients', 'POST', { ...patient, dateOfBirth: '2001-02-29' })).status, 400)
  assert.equal((await call('/patients', 'POST', { ...patient, patientId: 'injected' })).status, 400)
  assert.equal((await call('/patients?q[$ne]=x')).status, 400)
  const nestedFailure = await call('/patients', 'POST', { ...patient, emergencyContact: { phone: 'letters' } })
  assert.equal(nestedFailure.status, 400)
  assert.ok((await nestedFailure.json()).fields['emergencyContact.phone'])
  const created = await call('/patients', 'POST', patient)
  assert.equal(created.status, 201)
  let record = (await created.json()).record
  assert.match(record.patientId, /^PT-[A-F0-9]{12}$/)
  assert.equal(record.email, 'patient@example.com')
  assert.equal(record.createdBy, undefined)
  assert.equal(record.version, 0)
  const id = record.id
  assert.equal((await call(`/patients/${id}`, 'PATCH', { ...patient, version: 0 }, false)).status, 401)
  assert.equal((await call(`/patients/${id}`, 'DELETE', { version: 0 }, false)).status, 401)
  assert.equal((await call(`/patients/${id}/restore`, 'POST', { version: 0 }, false)).status, 401)
  const detail = (await (await call(`/patients/${id}`)).json()).record
  assert.deepEqual(detail.medicalHistory, patient.medicalHistory)
  assert.deepEqual((await Patient.findById(id)).medicalHistory.toObject(), patient.medicalHistory)
  const literal = (await (await call('/patients?q=%5BPatient%5D')).json())
  assert.equal(literal.pagination.total, 1)
  assert.equal(literal.records[0].medicalHistory, undefined, 'list responses do not expose clinical history')
  assert.equal((await (await call('/patients?q=.*')).json()).pagination.total, 0, 'regex syntax is literal')
  assert.equal((await (await call(`/patients?q=${record.patientId}`)).json()).pagination.total, 1)
  assert.equal((await call('/patients/not-an-id')).status, 400)
  assert.equal((await call(`/patients/${new mongoose.Types.ObjectId()}`)).status, 404)
  assert.equal((await call(`/patients/${id}`, 'PATCH', { ...patient })).status, 400)
  const edits = await Promise.all(['Updated A', 'Updated B'].map((name) => call(`/patients/${id}`, 'PATCH', { ...patient, name, version: 0 })))
  assert.deepEqual(edits.map((response) => response.status).sort(), [200, 409])
  record = (await (await call(`/patients/${id}`)).json()).record
  assert.equal(record.version, 1)
  assert.equal((await call(`/patients/${id}`, 'DELETE', { version: 0 })).status, 409)
  const archived = await call(`/patients/${id}`, 'DELETE', { version: 1 })
  assert.equal(archived.status, 200)
  record = (await archived.json()).record
  assert.ok(record.archivedAt)
  assert.deepEqual(record.medicalHistory, patient.medicalHistory)
  assert.equal(await Patient.countDocuments({ _id: id }), 1, 'archive never physically deletes history')
  assert.equal((await (await call('/patients')).json()).pagination.total, 0)
  assert.equal((await (await call('/patients?status=archived')).json()).pagination.total, 1)
  assert.equal((await call(`/patients/${id}`, 'PATCH', { ...patient, version: 2 })).status, 409)
  assert.equal((await call(`/patients/${id}/restore`, 'POST', { version: 1 })).status, 409)
  const restored = await call(`/patients/${id}/restore`, 'POST', { version: 2 })
  assert.equal(restored.status, 200)
  record = (await restored.json()).record
  assert.equal(record.archivedAt, null)
  assert.equal(record.patientId, detail.patientId)
  assert.equal(record.version, 3)

  for (let index = 0; index < 10; index++) assert.equal((await call('/patients', 'POST', { name: `Fictional ${index}`, dateOfBirth: '1990-01-01' })).status, 201)
  const first = (await (await call('/patients?limit=10')).json())
  const second = (await (await call('/patients?limit=10&page=2')).json())
  assert.equal(first.records.length, 10)
  assert.equal(second.records.length, 1)
  assert.equal(first.pagination.total, 11)
  assert.equal(new Set([...first.records, ...second.records].map((item) => item.id)).size, 11)
  assert.equal((await (await call('/patients?page=999')).json()).pagination.page, 2, 'out-of-range pages recover to the last page')
  assert.equal((await call('/patients?limit=100')).status, 400)

  const doctorData = { name: 'Fictional Doctor', specialty: 'Family medicine', phone: '555', email: 'DOCTOR@EXAMPLE.COM' }
  assert.equal((await call('/doctors', 'POST', { ...doctorData, specialty: '' })).status, 400)
  assert.equal((await call('/doctors', 'POST', { ...doctorData, userId: id })).status, 400)
  const doctorResponse = await call('/doctors', 'POST', doctorData)
  assert.equal(doctorResponse.status, 201)
  let doctor = (await doctorResponse.json()).record
  assert.equal((await (await call('/doctors?q=Family')).json()).pagination.total, 1)
  const updateDoctor = await call(`/doctors/${doctor.id}`, 'PATCH', { ...doctorData, specialty: 'Internal medicine', version: 0 })
  assert.equal(updateDoctor.status, 200)
  doctor = (await updateDoctor.json()).record
  assert.equal((await Doctor.findById(doctor.id)).specialty, 'Internal medicine')
  assert.equal((await call(`/doctors/${doctor.id}`, 'PATCH', { ...doctorData, version: 0 })).status, 409)
  assert.equal((await call(`/doctors/${doctor.id}`, 'DELETE', { version: 1 })).status, 200)
  assert.equal((await (await call('/doctors')).json()).pagination.total, 0)
  assert.equal((await call(`/doctors/${doctor.id}/restore`, 'POST', { version: 2 })).status, 200)
  assert.equal(await User.countDocuments(), 1, 'doctor directory entries never create login accounts')
})
