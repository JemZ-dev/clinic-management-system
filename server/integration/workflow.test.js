import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import mongoose from 'mongoose'
import { createApp } from '../src/app.js'
import { createAuthService } from '../src/services/auth.js'
import { connectDatabase, disconnectDatabase, pingDatabase } from '../src/config/db.js'
import { getConfig, loadLocalEnvironment } from '../src/config/env.js'
import { hashPassword } from '../src/utils/password.js'
import { User } from '../src/models/User.js'
import { Session } from '../src/models/Session.js'
import { Patient } from '../src/models/Patient.js'
import { Doctor } from '../src/models/Doctor.js'
import { Appointment } from '../src/models/Appointment.js'
import { Visit } from '../src/models/Visit.js'
import { Encounter } from '../src/models/Encounter.js'
import { Medicine } from '../src/models/Medicine.js'
import * as operations from '../src/models/Operations.js'
import { clinicDate } from '../src/utils/clinicTime.js'

test('clinic workflow: permissions, invitation, arrival, assessment, consultation, diagnostics, billing and scheduling', { timeout: 180000 }, async (t) => {
  loadLocalEnvironment()
  const dbName = `wf_test_${Date.now()}_${randomBytes(6).toString('hex')}`
  const config = { jwtSecret: randomBytes(48).toString('hex'), appOrigin: 'http://localhost:5173', secureCookies: false }
  let server, connected = false
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (connected && mongoose.connection.name === dbName && /^wf_test_\d+_[a-f0-9]{12}$/.test(dbName)) await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  })
  await connectDatabase({ ...getConfig(), dbName }); connected = true
  await Promise.all([User, Session, Patient, Doctor, Appointment, Visit, Encounter, Medicine, ...Object.values(operations)].map((model) => model.init()))
  const password = 'fictional-workflow-password'
  const passwordHash = await hashPassword(password)
  const admin = await User.create({ name: 'Test Administrator', email: 'admin@example.test', passwordHash, role: 'admin' })
  const doctorRecord = await Doctor.create({ name: 'Test Doctor', specialty: 'Family medicine', createdBy: admin.id, updatedBy: admin.id })
  await User.create({ name: 'Test Doctor', email: 'doctor@example.test', passwordHash, role: 'doctor', doctorId: doctorRecord.id })
  await User.create({ name: 'Test Reception', email: 'reception@example.test', passwordHash, role: 'staff' })
  await User.create({ name: 'Test Nurse', email: 'nurse@example.test', passwordHash, role: 'staff', permissions: ['assess', 'diagnostics', 'dispense'] })
  const otherDoctor = await Doctor.create({ name: 'Other Doctor', specialty: 'Family medicine', createdBy: admin.id, updatedBy: admin.id })
  await User.create({ name: 'Other Doctor', email: 'other@example.test', passwordHash, role: 'doctor', doctorId: otherDoctor.id })
  server = createApp({ pingDatabase, config, authService: createAuthService(config) }).listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api`, cookies = {}
  async function call(who, path, method = 'GET', body) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: config.appOrigin, 'X-Clinic-Request': '1', ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  async function ok(who, path, method = 'GET', body, expected = 200) {
    const response = await call(who, path, method, body); const json = await response.json()
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(json)}`)
    return json
  }
  for (const who of ['admin', 'doctor', 'reception', 'nurse', 'other']) {
    const response = await call(who, '/auth/login', 'POST', { email: `${who}@example.test`, password })
    assert.equal(response.status, 200); cookies[who] = response.headers.get('set-cookie').split(';')[0]
  }
  assert.equal((await call('reception', '/operations/accounts')).status, 403)
  let ownAccount = (await ok('admin', '/operations/accounts')).records.find((item) => item.id === admin.id)
  const ownAccess = { version: ownAccount.version, role: 'admin', permissions: ['assess'], doctorId: '', active: true }
  assert.equal((await call('admin', `/operations/accounts/${admin.id}`, 'PATCH', { ...ownAccess, active: false })).status, 400)
  assert.equal((await call('admin', `/operations/accounts/${admin.id}`, 'PATCH', { ...ownAccess, role: 'staff' })).status, 400)
  ownAccount = (await ok('admin', `/operations/accounts/${admin.id}`, 'PATCH', ownAccess)).record
  assert.deepEqual(ownAccount.permissions, ['assess'])
  assert.equal((await call('admin', '/auth/me')).status, 200, 'self-management preserves the current administrator session')
  const stockMedicine = (await ok('admin', '/medicines', 'POST', { genericName: 'Admin stock test', brandName: '', strength: '10 mg', dosageForm: 'tablet', stockUnit: 'tablet', notes: '', lowStockThreshold: 2 }, 201)).record
  await ok('admin', `/medicines/${stockMedicine.id}/movements`, 'POST', { requestId: randomUUID(), version: stockMedicine.version, type: 'receipt', quantity: 10, note: 'Test receipt' }, 201)
  assert.equal((await ok('admin', `/medicines/${stockMedicine.id}`)).record.quantity, 10)
  assert.equal((await call('admin', '/visits')).status, 200)
  assert.equal((await call('admin', '/visits', 'POST', {})).status, 403)
  assert.equal((await call('reception', '/visits')).status, 403)
  assert.equal((await call('reception', '/auth/register', 'POST', { name: 'No Invitation', email: 'no@example.test', password, registrationCode: 'shared-access-code' })).status, 403)
  const invite = await ok('admin', '/operations/invitations', 'POST', { email: 'invited@example.test', role: 'staff', permissions: ['assess'], doctorId: '' }, 201)
  let pendingInvites = (await ok('admin', '/operations/invitations')).records
  let pending = pendingInvites.find((item) => item.email === 'invited@example.test')
  assert.equal(pending.status, 'pending')
  assert.equal(pending.tokenHash, undefined)
  assert.equal((await call('reception', '/operations/invitations')).status, 403)
  const replacement = await ok('admin', `/operations/invitations/${pending.id}/replace`, 'POST', { version: pending.version })
  assert.equal((await call('admin', `/operations/invitations/${pending.id}/replace`, 'POST', { version: pending.version })).status, 409)
  assert.equal((await call('admin', '/auth/register', 'POST', { name: 'Invited Staff', email: pending.email, password, registrationCode: invite.code })).status, 403)
  invite.code = replacement.code
  const registration = { name: 'Invited Staff', email: 'invited@example.test', password, registrationCode: invite.code }
  assert.equal((await ok('admin', '/auth/register', 'POST', registration, 201)).user.permissions[0], 'assess')
  assert.equal((await call('admin', '/auth/register', 'POST', registration)).status, 403)
  assert.equal((await ok('admin', '/operations/invitations')).records.some((item) => item.id === pending.id), false)
  const doctorInvite = await ok('admin', '/operations/invitations', 'POST', { email: 'newdoctor@example.test', role: 'doctor', permissions: [], doctorId: '', newDoctor: { name: 'New Test Doctor', specialty: 'Family medicine', phone: '' } }, 201)
  pending = (await ok('admin', '/operations/invitations')).records.find((item) => item.email === 'newdoctor@example.test')
  assert.ok(pending.doctor.id)
  assert.equal((await call('admin', '/operations/invitations', 'POST', { email: 'duplicate@example.test', role: 'doctor', permissions: [], doctorId: pending.doctor.id })).status, 409)
  await ok('admin', `/operations/invitations/${pending.id}/revoke`, 'POST', { version: pending.version })
  assert.equal((await call('admin', '/auth/register', 'POST', { name: 'New Test Doctor', email: pending.email, password, registrationCode: doctorInvite.code })).status, 403)
  assert.equal((await ok('admin', '/operations/invitations')).records.some((item) => item.id === pending.id), false)
  await ok('admin', '/operations/invitations', 'POST', { email: 'expired@example.test', role: 'staff', permissions: [], doctorId: '' }, 201)
  await operations.Invitation.updateOne({ email: 'expired@example.test' }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
  pending = (await ok('admin', '/operations/invitations')).records.find((item) => item.email === 'expired@example.test')
  assert.equal(pending.status, 'expired')
  await ok('admin', `/operations/invitations/${pending.id}/replace`, 'POST', { version: pending.version })
  assert.equal((await ok('admin', '/operations/invitations')).records.find((item) => item.id === pending.id).status, 'pending')
  let patient = (await ok('reception', '/patients', 'POST', { name: 'Fictional Patient', dateOfBirth: '1990-01-01', gender: 'prefer_not_to_say' }, 201)).record
  let arrival = { requestId: randomUUID(), kind: 'walk_in', patientId: patient.id, doctorId: doctorRecord.id, reason: 'Fictional consultation' }
  let encounter = (await ok('reception', '/encounters', 'POST', arrival, 201)).record
  const retry = (await ok('reception', '/encounters', 'POST', arrival, 201)).record
  assert.equal(retry.id, encounter.id)
  assert.equal((await call('other', `/encounters/${encounter.id}`)).status, 403)
  assert.equal((await call('other', `/patients/${patient.id}`)).status, 403)
  assert.equal((await call('reception', `/encounters/${encounter.id}/assessment`, 'POST', {})).status, 403)
  assert.equal((await call('doctor', `/encounters/${encounter.id}/action`, 'POST', { version: 0, action: 'start' })).status, 403, 'assessment cannot be skipped')
  assert.equal((await ok('other', '/dashboard')).patients, 0, 'legacy dashboard is doctor-scoped')
  assert.equal((await ok('doctor', '/dashboard')).patients, 1)
  const assessment = { version: encounter.version, measuredAt: new Date().toISOString(), weight: 60, height: 165, systolic: 120, diastolic: 80 }
  encounter = (await ok('nurse', `/encounters/${encounter.id}/assessment`, 'POST', assessment)).record
  assert.equal(encounter.stage, 'waiting')
  assert.equal((await call('nurse', `/encounters/${encounter.id}/assessment`, 'POST', assessment)).status, 409)
  encounter = (await ok('doctor', `/encounters/${encounter.id}/action`, 'POST', { version: encounter.version, action: 'start' })).record
  const medicine = (await ok('nurse', '/medicines', 'POST', { genericName: 'Fictional medicine', brandName: '', strength: '10 mg', dosageForm: 'tablet', stockUnit: 'tablet', notes: '', lowStockThreshold: 0 }, 201)).record
  const draft = { version: encounter.version, reason: 'Fictional consultation', notes: 'Fictional clinical note', prescriptions: [{ medicineId: medicine.id, productKey: medicine.productKey, quantity: 3, instructions: 'Fictional directions' }], followUpDate: clinicDate(new Date(Date.now() + 86400000)) }
  encounter = (await ok('doctor', `/encounters/${encounter.id}/draft`, 'PUT', draft)).record
  assert.equal(encounter.draft.prescriptions[0].medicine.genericName, 'Fictional medicine')
  assert.equal((await ok('nurse', `/encounters/${encounter.id}`)).record.draft, undefined, 'assessment permission does not expose doctor drafts')
  assert.equal((await ok('reception', `/encounters/${encounter.id}`)).record.draft, undefined)
  encounter = (await ok('doctor', `/encounters/${encounter.id}/finalize`, 'POST', { version: encounter.version })).record
  assert.equal(encounter.stage, 'finished'); assert.ok(encounter.visitId)
  assert.equal((await ok('doctor', `/visits/${encounter.visitId}`)).record.prescriptions.length, 1)
  assert.equal((await ok('doctor', `/encounters/${encounter.id}/finalize`, 'POST', { version: 0 })).record.visitId, encounter.visitId, 'finalization retry does not duplicate the visit')
  assert.equal((await call('reception', `/visits/${encounter.visitId}`)).status, 403)
  const service = (await ok('admin', '/operations/services', 'POST', { code: 'CBC', name: 'Complete blood count', category: 'laboratory', priceCentavos: 25000, external: false, active: true }, 201)).record
  const orderInput = { encounterId: encounter.id, serviceId: service.id, requestId: randomUUID() }
  assert.equal((await call('reception', '/operations/orders', 'POST', orderInput)).status, 403)
  let order = (await ok('doctor', '/operations/orders', 'POST', orderInput, 201)).record
  await ok('admin', `/operations/services/${service.id}`, 'PATCH', { code: 'CBC', name: 'Complete blood count', category: 'laboratory', priceCentavos: 30000, external: false, active: true, version: service.version })
  let invoice = (await ok('reception', `/encounters/${encounter.id}/invoice`)).record
  assert.equal(invoice.totalCentavos, 25000, 'historical price is preserved')
  order = (await ok('nurse', `/operations/orders/${order.id}`, 'PATCH', { version: order.version, stage: 'performed' })).record
  const report = await ok('nurse', `/operations/orders/${order.id}/reports`, 'POST', { version: order.version, name: 'fictional.pdf', provider: 'Test Laboratory', reportDate: clinicDate(), mime: 'application/pdf', content: Buffer.from('%PDF-1.4\nFictional test report').toString('base64') }, 201)
  assert.equal((await call('reception', `/operations/reports/${report.id}`)).status, 403)
  assert.equal((await call('other', `/operations/reports/${report.id}`)).status, 403)
  assert.equal((await call('doctor', `/operations/reports/${report.id}`)).status, 200)
  order = (await ok('doctor', `/operations/orders?encounterId=${encounter.id}`)).records[0]
  await ok('doctor', `/operations/orders/${order.id}`, 'PATCH', { version: order.version, stage: 'reviewed', note: 'Fictional report reviewed.' })
  const payment = { version: invoice.version, requestId: randomUUID(), amountCentavos: 25000, method: 'cash' }
  const concurrent = await Promise.all([call('reception', `/encounters/${encounter.id}/payments`, 'POST', payment), call('reception', `/encounters/${encounter.id}/payments`, 'POST', { ...payment, requestId: randomUUID() })])
  assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 409])
  invoice = (await ok('reception', `/encounters/${encounter.id}/invoice`)).record
  assert.equal(invoice.balanceCentavos, 0); assert.equal(invoice.payments.length, 1)
  const winning = invoice.payments[0]
  await ok('reception', `/encounters/${encounter.id}/payments`, 'POST', { ...payment, requestId: winning.requestId })
  assert.equal((await call('reception', `/encounters/${encounter.id}/void-charge`, 'POST', { version: invoice.version, lineId: invoice.lines[0]._id, reason: 'Fictional correction' })).status, 409, 'refund precedes voiding a paid charge')
  await ok('reception', `/encounters/${encounter.id}/payments`, 'POST', { version: invoice.version, requestId: randomUUID(), amountCentavos: 25000, method: 'cash', refund: true, reason: 'Fictional refund' }, 201)
  invoice = (await ok('reception', `/encounters/${encounter.id}/invoice`)).record
  await ok('reception', `/encounters/${encounter.id}/void-charge`, 'POST', { version: invoice.version, lineId: invoice.lines[0]._id, reason: 'Fictional charge correction' })
  invoice = (await ok('reception', `/encounters/${encounter.id}/invoice`)).record
  assert.equal(invoice.totalCentavos, 0); assert.equal(invoice.paidCentavos, 0); assert.equal(invoice.payments.length, 2)
  const referral = (await ok('reception', '/encounters', 'POST', { patientId: patient.id, kind: 'external_test', externalClinician: 'Outside clinician', reason: 'External laboratory request', requestId: randomUUID() }, 201)).record
  const outside = (await ok('admin', '/operations/services', 'POST', { code: 'XRAY', name: 'Chest X-ray', category: 'imaging', priceCentavos: 50000, external: true, provider: 'Outside diagnostics', active: true }, 201)).record
  await ok('reception', '/operations/orders', 'POST', { encounterId: referral.id, serviceId: outside.id, requestId: randomUUID() }, 201)
  assert.equal((await ok('reception', `/encounters/${referral.id}/invoice`)).record.totalCentavos, 0, 'external-provider services do not become clinic charges')
  const weekly = Array.from({ length: 7 }, (_, day) => ({ day, start: '09:00', end: '17:00' }))
  await ok('admin', `/operations/schedules/${doctorRecord.id}`, 'PUT', { weekly, leave: [] })
  const future = clinicDate(new Date(Date.now() + 86400000))
  const booking = { patientId: patient.id, doctorId: doctorRecord.id, date: future, time: '09:00', reason: 'Follow-up', followUpEncounterId: encounter.id }
  const appointment = (await ok('reception', '/appointments', 'POST', booking, 201)).record
  assert.equal((await ok('reception', `/encounters/${encounter.id}`)).record.followUpAppointmentId, appointment.id)
  assert.equal((await call('reception', '/appointments', 'POST', { ...booking, time: '08:00' })).status, 400)
  assert.equal((await call('reception', '/appointments', 'POST', { ...booking, time: '10:00' })).status, 409)
  const schedules = (await ok('admin', `/operations/schedules/${doctorRecord.id}`)).record
  assert.equal((await call('admin', `/operations/schedules/${doctorRecord.id}`, 'PUT', { version: schedules.version, weekly, leave: [{ from: future, through: future, reason: 'Leave' }] })).status, 409)
  const accounts = await ok('admin', '/operations/accounts')
  const receptionist = accounts.records.find((item) => item.email === 'reception@example.test')
  await ok('admin', `/operations/accounts/${receptionist.id}`, 'PATCH', { version: receptionist.version, role: 'staff', permissions: [], doctorId: '', active: false })
  assert.equal((await call('reception', '/auth/me')).status, 401)
})
