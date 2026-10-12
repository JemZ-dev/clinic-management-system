import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { medicineSchema, stockMovementSchema, movementListSchema } from '../src/validators/medicines.js'
import { visitSchema } from '../src/validators/visits.js'
import { validate } from '../src/validators/auth.js'
import { productKey } from '../src/services/medicines.js'
import { clinicDate } from '../src/utils/clinicTime.js'

const id = '0123456789abcdef01234567'
const medicine = { genericName: 'Fictional product', brandName: '', strength: 'label strength', dosageForm: 'tablet', stockUnit: 'tablet' }
const movement = { requestId: randomUUID(), version: 0, type: 'receipt', quantity: 5 }
test('catalog validation fixes stock ownership and separates normalized product identities', () => {
  assert.equal(validate(medicineSchema, medicine).lowStockThreshold, 0)
  for (const patch of [{ quantity: 12 }, { identityLocked: false }, { lowStockThreshold: -1 }, { lowStockThreshold: 1.5 }, { stockUnit: '' }, { genericName: { $ne: '' } }]) assert.throws(() => validate(medicineSchema, { ...medicine, ...patch }), { status: 400 })
  assert.equal(productKey(medicine), productKey({ ...medicine, genericName: '  FICTIONAL   product ' }))
  assert.notEqual(productKey(medicine), productKey({ ...medicine, strength: 'different strength' }))
  assert.notEqual(productKey(medicine), productKey({ ...medicine, stockUnit: 'pack' }))
})
test('stock validation requires whole units, adjustment reasons, and saved prescription versions', () => {
  assert.equal(validate(stockMovementSchema, movement).quantity, 5)
  assert.equal(validate(stockMovementSchema, { ...movement, type: 'adjustment', quantity: -2, note: 'Count correction' }).quantity, -2)
  assert.equal(validate(stockMovementSchema, { ...movement, type: 'dispense', visitId: id, prescriptionId: id, visitVersion: 0 }).visitVersion, 0)
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1.2 }, { type: 'adjustment', note: '' }, { type: 'dispense' }, { type: 'dispense', visitId: id, prescriptionId: id }, { visitId: id }, { balanceAfter: 100 }, { version: -1 }, { quantity: 1000001 }]) assert.throws(() => validate(stockMovementSchema, { ...movement, ...patch }), { status: 400 })
  for (const filter of [{ 'medicineId[$ne]': '' }, { page: '0' }, { limit: '100' }, { visitId: 'bad' }]) assert.throws(() => validate(movementListSchema, filter), { status: 400 })
})
test('catalog prescriptions reject duplicates, invented stock counters, and invalid quantities', () => {
  const line = { medicineId: id, productKey: productKey(medicine), quantity: 3, instructions: 'Fictional clinician instructions' }
  const visit = { requestId: randomUUID(), patientId: id, doctorId: id, date: clinicDate(), reason: 'Fictional visit', prescriptions: [line] }
  assert.equal(validate(visitSchema, visit).prescriptions.length, 1)
  for (const prescriptions of [[line, line], [{ ...line, quantity: 0 }], [{ ...line, quantity: 1.5 }], [{ ...line, dispensedQuantity: 3 }], [{ ...line, medicine: medicine }], [{ ...line, instructions: '' }], [{ ...line, productKey: '' }]]) assert.throws(() => validate(visitSchema, { ...visit, prescriptions }), { status: 400 })
})
