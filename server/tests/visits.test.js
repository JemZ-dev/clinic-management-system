import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { visitSchema, addendumSchema, visitListSchema } from '../src/validators/visits.js'
import { validate } from '../src/validators/auth.js'
import { clinicDate } from '../src/utils/clinicTime.js'

const input = { requestId: randomUUID(), patientId: '0123456789abcdef01234567', doctorId: '0123456789abcdef01234568', date: clinicDate(), reason: 'Fictional consultation' }
test('visit validation accepts optional findings without inventing diagnoses or medicines', () => {
  const value = validate(visitSchema, input)
  for (const field of ['diagnosis', 'notes', 'treatment', 'prescribedMedicines', 'followUp']) assert.equal(value[field], '')
  for (const patch of [{ date: '2001-02-29' }, { date: '2999-01-01' }, { reason: ' ' }, { requestId: '' }, { status: 'completed' }, { createdBy: input.patientId }, { diagnosis: 'x'.repeat(2001) }, { appointmentId: input.patientId }, { appointmentVersion: 0 }]) assert.throws(() => validate(visitSchema, { ...input, ...patch }), { status: 400 })
  assert.equal(validate(visitSchema, { ...input, appointmentId: input.patientId, appointmentVersion: 0 }).appointmentVersion, 0)
})
test('corrections and visit filters reject injected fields, invalid versions, and oversized entries', () => {
  assert.equal(validate(addendumSchema, { requestId: randomUUID(), version: 0, text: ' Correction ' }).text, 'Correction')
  for (const patch of [{ version: -1 }, { text: ' ' }, { text: 'x'.repeat(2001) }, { author: 'Someone else' }]) assert.throws(() => validate(addendumSchema, { requestId: randomUUID(), version: 0, text: 'Correction', ...patch }), { status: 400 })
  for (const input of [{ 'patientId[$ne]': '' }, { limit: '100' }, { patientId: 'bad-id' }, { page: '-1' }]) assert.throws(() => validate(visitListSchema, input), { status: 400 })
})
