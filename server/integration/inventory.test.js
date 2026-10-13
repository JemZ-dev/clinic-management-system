import { inviteFixture } from './fixtures.js'
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
import { Medicine } from '../src/models/Medicine.js'
import { StockMovement } from '../src/models/StockMovement.js'
import { clinicDate } from '../src/utils/clinicTime.js'

test('inventory HTTP workflows keep stock and prescription dispensing atomic, bounded, and retry-safe', async (t) => {
  loadLocalEnvironment()
  const dbName = `inv_test_${Date.now()}_${randomBytes(6).toString('hex')}`
  const config = { jwtSecret: randomBytes(48).toString('hex'), registrationCode: randomBytes(16).toString('hex'), appOrigin: 'http://localhost:5173', secureCookies: false }
  let server, connected = false, cookie
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (connected && mongoose.connection.name === dbName && /^inv_test_\d+_[a-f0-9]{12}$/.test(dbName)) await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  })
  await connectDatabase({ ...getConfig(), dbName }); connected = true
  await Promise.all([User.init(), Session.init(), Patient.init(), Doctor.init(), Appointment.init(), Visit.init(), Medicine.init(), StockMovement.init()])
  await inviteFixture('inventory@example.com', config.registrationCode, 'staff', ["dispense"])
  server = createApp({ pingDatabase, config, authService: createAuthService(config) }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api`
  async function call(path, method = 'GET', body, authenticated = true) {
    return fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: config.appOrigin, 'X-Clinic-Request': '1', ...(authenticated && cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  async function json(path) { const response = await call(path); assert.equal(response.status, 200); return response.json() }
  async function post(path, body, expected = 201) { const response = await call(path, 'POST', body); assert.equal(response.status, expected, JSON.stringify(await response.clone().json())); return response.json() }
  for (const path of ['/medicines', '/inventory']) assert.equal((await call(path)).status, 401)
  const registration = await post('/auth/register', { name: 'Fictional Inventory Staff', email: 'inventory@example.com', password: 'fictional-inventory-passphrase', registrationCode: config.registrationCode })
  // A separate login obtains the cookie without storing any actual project credentials.
  const login = await call('/auth/login', 'POST', { email: 'inventory@example.com', password: 'fictional-inventory-passphrase' })
  assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0]
  const user = registration.user
  const input = { genericName: 'Fictional [product]', brandName: 'Fictional brand', strength: 'label strength', dosageForm: 'tablet', stockUnit: 'tablet', notes: 'Fictional inventory notes', lowStockThreshold: 2 }
  let medicine = (await post('/medicines', input)).record
  assert.equal(medicine.quantity, 0); assert.equal(medicine.lowStock, true)
  assert.equal(medicine.createdBy, undefined)
  assert.equal((await call('/medicines', 'POST', { ...input, quantity: 99 })).status, 400)
  assert.equal((await call('/medicines', 'POST', { ...input, genericName: ' FICTIONAL   [PRODUCT] ' })).status, 409)
  const second = (await post('/medicines', { ...input, strength: 'other strength' })).record
  assert.equal((await json('/medicines?q=.*')).pagination.total, 0)
  assert.equal((await json('/medicines?q=%5Bproduct%5D')).pagination.total, 2)
  for (const path of ['/medicines?quantity[$ne]=0', '/inventory?medicineId[$ne]=x', '/medicines/bad-id']) assert.equal((await call(path)).status, 400)
  const receipt = { requestId: randomUUID(), version: medicine.version, type: 'receipt', quantity: 5, note: 'Fictional delivery' }
  const retries = await Promise.all([call(`/medicines/${medicine.id}/movements`, 'POST', receipt), call(`/medicines/${medicine.id}/movements`, 'POST', receipt)])
  assert.deepEqual(retries.map((response) => response.status), [201, 201])
  const receipts = await Promise.all(retries.map((response) => response.json()))
  assert.equal(receipts[0].movement.id, receipts[1].movement.id)
  assert.equal(receipts[0].movement.balanceAfter, 5)
  assert.equal(receipts[0].movement.requestDigest, undefined)
  medicine = (await json(`/medicines/${medicine.id}`)).record
  assert.equal(medicine.quantity, 5); assert.equal(medicine.identityLocked, true); assert.equal(medicine.version, 1)
  assert.equal(await StockMovement.countDocuments({ requestId: receipt.requestId }), 1)
  assert.equal((await call(`/medicines/${medicine.id}/movements`, 'POST', { ...receipt, quantity: 6 })).status, 409)
  assert.equal((await call(`/medicines/${medicine.id}`, 'PATCH', { ...input, strength: 'changed strength', version: medicine.version })).status, 409)
  const metadata = await call(`/medicines/${medicine.id}`, 'PATCH', { ...input, notes: 'Updated stock note', lowStockThreshold: 3, version: medicine.version })
  assert.equal(metadata.status, 200); medicine = (await metadata.json()).record
  assert.equal((await call(`/medicines/${medicine.id}`, 'PATCH', { ...input, version: 0 })).status, 409)
  const patient = await Patient.create({ name: 'Fictional Inventory Patient', dateOfBirth: '2000-01-01', createdBy: user.id, updatedBy: user.id })
  const doctor = await Doctor.create({ name: 'Fictional Inventory Doctor', specialty: 'Family medicine', createdBy: user.id, updatedBy: user.id })
  await User.updateOne({ _id: user.id }, { $set: { role: 'doctor', doctorId: doctor.id } })
  const visitInput = { requestId: randomUUID(), patientId: patient.id, doctorId: doctor.id, date: clinicDate(), reason: 'Fictional visit', prescriptions: [{ medicineId: medicine.id, productKey: medicine.productKey, quantity: 4, instructions: 'Fictional clinician instructions only' }] }
  let visit = (await post('/visits', visitInput)).record
  assert.equal(visit.prescriptions[0].remainingQuantity, 4)
  assert.equal(visit.prescriptions[0].medicine.strength, input.strength)
  assert.equal(visit.prescriptions[0].dispensedQuantity, 0)
  medicine = (await json(`/medicines/${medicine.id}`)).record
  assert.equal(medicine.quantity, 5, 'prescribing never dispenses stock')
  assert.equal((await json('/visits')).records[0].prescriptions, undefined, 'list excludes clinical prescriptions')
  const dispense = { requestId: randomUUID(), version: medicine.version, visitVersion: visit.version, type: 'dispense', quantity: 3, note: 'Fictional supply', visitId: visit.id, prescriptionId: visit.prescriptions[0].id }
  assert.equal((await call(`/medicines/${second.id}/movements`, 'POST', { ...dispense, version: second.version })).status, 409, 'zero stock cannot be dispensed')
  const competing = await Promise.all([call(`/medicines/${medicine.id}/movements`, 'POST', dispense), call(`/medicines/${medicine.id}/movements`, 'POST', { ...dispense, requestId: randomUUID() })])
  assert.deepEqual(competing.map((response) => response.status).sort(), [201, 409])
  // Exactly one concurrent movement is accepted, regardless of which save wins.
  const winner = (await competing.find((response) => response.status === 201).json()).movement
  medicine = (await json(`/medicines/${medicine.id}`)).record; visit = (await json(`/visits/${visit.id}`)).record
  assert.equal(medicine.quantity, 2); assert.equal(visit.prescriptions[0].dispensedQuantity, 3); assert.equal(visit.prescriptions[0].remainingQuantity, 1)
  assert.equal(winner.quantity, -3); assert.equal(winner.balanceAfter, 2)
  assert.equal(await StockMovement.countDocuments({ type: 'dispense' }), 1)
  assert.equal((await call(`/medicines/${medicine.id}/movements`, 'POST', { ...dispense, requestId: randomUUID(), version: medicine.version, visitVersion: visit.version, quantity: 2 })).status, 409)
  const latest = { ...dispense, requestId: randomUUID(), version: medicine.version, visitVersion: visit.version, quantity: 1 }
  const failure = t.mock.method(StockMovement, 'create', () => { throw new Error('Injected movement insert failure') })
  assert.equal((await call(`/medicines/${medicine.id}/movements`, 'POST', latest)).status, 500)
  failure.mock.restore()
  assert.equal((await json(`/medicines/${medicine.id}`)).record.quantity, 2, 'failed history insert rolls back stock')
  assert.equal((await json(`/medicines/${medicine.id}`)).record.version, medicine.version)
  assert.equal((await json(`/visits/${visit.id}`)).record.prescriptions[0].dispensedQuantity, 3, 'failed history insert rolls back dispensed total')
  assert.equal((await json(`/visits/${visit.id}`)).record.version, visit.version)
  const correction = await post(`/visits/${visit.id}/addenda`, { requestId: randomUUID(), version: visit.version, text: 'Fictional clarification to review' }, 200)
  assert.equal((await call(`/medicines/${medicine.id}/movements`, 'POST', latest)).status, 409, 'review changed visit before dispensing')
  const finalData = { ...latest, visitVersion: correction.record.version }
  const final = await post(`/medicines/${medicine.id}/movements`, finalData)
  const retry = await post(`/medicines/${medicine.id}/movements`, finalData)
  assert.equal(final.movement.id, retry.movement.id)
  medicine = (await json(`/medicines/${medicine.id}`)).record; visit = (await json(`/visits/${visit.id}`)).record
  assert.equal(medicine.quantity, 1); assert.equal(visit.prescriptions[0].remainingQuantity, 0)
  assert.equal(visit.prescriptions[0].quantity, 4); assert.equal(visit.prescriptions[0].instructions, visitInput.prescriptions[0].instructions)
  const receiptRace = { requestId: randomUUID(), version: medicine.version, type: 'receipt', quantity: 2 }
  const adjustmentRace = { requestId: randomUUID(), version: medicine.version, type: 'adjustment', quantity: -1, note: 'Fictional count correction' }
  const raced = await Promise.all([call(`/medicines/${medicine.id}/movements`, 'POST', receiptRace), call(`/medicines/${medicine.id}/movements`, 'POST', adjustmentRace)])
  assert.deepEqual(raced.map((response) => response.status).sort(), [201, 409])
  medicine = (await json(`/medicines/${medicine.id}`)).record
  const movements = await StockMovement.find({ medicineId: medicine.id })
  assert.equal(movements.reduce((total, entry) => total + entry.quantity, 0), medicine.quantity)
  assert.ok(medicine.quantity >= 0)
  const dashboard = await json('/dashboard')
  assert.equal(dashboard.lowStockCount, 2)
  assert.equal(dashboard.lowStockMedicines.length, 2)
  const archived = await call(`/medicines/${medicine.id}`, 'DELETE', { version: medicine.version })
  assert.equal(archived.status, 200); medicine = (await archived.json()).record
  assert.equal((await call(`/medicines/${medicine.id}/movements`, 'POST', { requestId: randomUUID(), version: medicine.version, type: 'receipt', quantity: 1 })).status, 409)
  assert.equal((await call('/visits', 'POST', { ...visitInput, requestId: randomUUID() })).status, 400)
  assert.equal((await json('/dashboard')).lowStockCount, 1)
  assert.equal((await json('/medicines?status=archived')).pagination.total, 1)
  assert.equal((await post(`/medicines/${medicine.id}/movements`, finalData)).movement.id, final.movement.id, 'historical retry after archive does not dispense again')
  assert.equal((await post('/visits', visitInput)).record.id, visit.id, 'prescription save retry survives archive')
  medicine = (await post(`/medicines/${medicine.id}/restore`, { version: medicine.version }, 200)).record
  assert.equal(medicine.archivedAt, null)
  const history = await json(`/inventory?medicineId=${medicine.id}&limit=10`)
  assert.equal(history.pagination.total, movements.length)
  assert.equal((await json(`/inventory?visitId=${visit.id}&type=dispense`)).pagination.total, 2)
  assert.equal((await json('/inventory?q=.*')).pagination.total, 0)
  assert.equal((await call(`/inventory/${history.records[0].id}`, 'DELETE', {})).status, 404)
  // A changed unused product cannot silently replace the strength selected in a visit form.
  const oldKey = second.productKey
  const changed = await call(`/medicines/${second.id}`, 'PATCH', { ...input, strength: 'new unused strength', version: second.version })
  assert.equal(changed.status, 200)
  assert.equal((await call('/visits', 'POST', { ...visitInput, requestId: randomUUID(), prescriptions: [{ ...visitInput.prescriptions[0], medicineId: second.id, productKey: oldKey }] })).status, 400)
  const storedSecond = (await json(`/medicines/${second.id}`)).record
  assert.equal(storedSecond.identityLocked, false, 'failed prescription save leaves product editable')
  // A receipt history failure also rolls back the initial identity lock and balance.
  const receiptFailure = t.mock.method(StockMovement, 'create', () => { throw new Error('Injected receipt failure') })
  assert.equal((await call(`/medicines/${second.id}/movements`, 'POST', { requestId: randomUUID(), version: storedSecond.version, type: 'receipt', quantity: 1 })).status, 500)
  receiptFailure.mock.restore()
  const rolledBack = (await json(`/medicines/${second.id}`)).record
  assert.equal(rolledBack.quantity, 0); assert.equal(rolledBack.identityLocked, false); assert.equal(rolledBack.version, storedSecond.version)
  assert.equal((await call(`/medicines/${medicine.id}/movements`, 'POST', finalData, false)).status, 401)
})
