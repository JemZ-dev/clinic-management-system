import assert from 'node:assert/strict'
import test from 'node:test'
import { diagnosticListSchema, diagnosticPipeline, listDiagnosticOrders } from '../src/services/diagnosticDirectory.js'
import { DiagnosticOrder } from '../src/models/Operations.js'

test('diagnostic filters reject invalid values, date ranges, and injected queries', () => {
  for (const input of [{ status: 'paid' }, { category: 'unknown' }, { provider: 'other' }, { q: { $ne: '' } }, { page: '0' }, { limit: '200' }, { from: '2026-02-30' }, { from: '2026-10-15', through: '2026-10-14' }]) assert.equal(diagnosticListSchema.safeParse(input).success, false)
})
test('diagnostic query combines filters, escapes search, and preserves doctor/encounter scope before paging', () => {
  const doctorId = '111111111111111111111111', encounterId = '222222222222222222222222'
  const filters = diagnosticListSchema.parse({ q: 'X-ray.*', status: 'reviewed', category: 'imaging', provider: 'in_house', from: '2026-10-14', through: '2026-10-15', page: '2', limit: '25', encounterId })
  const pipeline = diagnosticPipeline(filters, { role: 'doctor', doctorId })
  const match = pipeline[0].$match
  assert.equal(String(match.doctorId), doctorId)
  assert.equal(String(match.encounterId), encounterId)
  assert.equal(match.external, false)
  assert.equal(match.stage, 'reviewed')
  assert.equal(match.category, 'imaging')
  assert.equal(match.createdAt.$gte.toISOString(), '2026-10-13T16:00:00.000Z')
  assert.equal(match.createdAt.$lt.toISOString(), '2026-10-15T16:00:00.000Z')
  assert.equal(pipeline.find((stage) => stage.$match?.$or).$match.$or[0].serviceName.$regex, 'X-ray\\.\\*')
  assert.deepEqual(pipeline.at(-1).$facet.records, [{ $skip: 25 }, { $limit: 25 }])
})
test('diagnostic pagination retains permissions and never leaks clinical reports to reception', async (t) => {
  let queries = 0
  t.mock.method(DiagnosticOrder, 'aggregate', async () => {
    queries++
    return [{ count: [{ total: 251 }], records: [{ _id: 'order', __v: 1, encounterId: 'encounter', encounter: { patientName: 'Fictional Patient', patientNumber: 'PT-TEST' }, requestDigest: 'private', reviewNote: 'private', reports: ['report'], history: [] }] }]
  })
  const filters = diagnosticListSchema.parse({})
  const result = await listDiagnosticOrders(filters, { role: 'staff' })
  assert.equal(result.pagination.pages, 26)
  assert.equal(result.records[0].patientNumber, 'PT-TEST')
  for (const field of ['requestDigest', 'reviewNote', 'reports', 'history']) assert.equal(result.records[0][field], undefined)
  const empty = await listDiagnosticOrders(filters, { role: 'doctor', doctorId: null })
  assert.equal(empty.pagination.total, 0)
  assert.equal(queries, 1)
})

import { checkDiagnosticRepeat, guardDiagnosticRequest, pendingDiagnosticStages } from '../src/services/diagnosticDuplicates.js'
import { Patient } from '../src/models/Patient.js'
import { orderInput } from '../src/validators/workflow.js'

const pending = { _id: '111111111111111111111111', encounterId: '222222222222222222222222', serviceId: '333333333333333333333333', serviceName: 'Chest X-ray', stage: 'requested' }
const normal = { encounterId: pending.encounterId, serviceId: pending.serviceId, requestId: '44444444-4444-4444-8444-444444444444' }
test('pending diagnostic duplicates require explicit doctor confirmation tied to the existing request', () => {
  for (const role of ['doctor', 'staff', 'admin']) {
    assert.throws(() => checkDiagnosticRepeat(pending, normal, { role }), (error) => error.status === 409 && error.duplicateOrder.id === pending._id)
    assert.doesNotThrow(() => checkDiagnosticRepeat(null, normal, { role }))
  }
  const repeat = { ...normal, repeatAcknowledged: true, repeatOf: pending._id, repeatReason: 'Additional view required' }
  assert.doesNotThrow(() => checkDiagnosticRepeat(pending, repeat, { role: 'doctor' }))
  assert.throws(() => checkDiagnosticRepeat(pending, repeat, { role: 'staff' }), { status: 403 })
  assert.throws(() => checkDiagnosticRepeat(pending, { ...repeat, repeatOf: 'outdated' }, { role: 'doctor' }), { status: 409 })
  assert.throws(() => checkDiagnosticRepeat(null, repeat, { role: 'doctor' }), { status: 409 })
  assert.equal(orderInput.safeParse(normal).success, true)
  assert.equal(orderInput.safeParse(repeat).success, true)
  for (const change of [{ repeatReason: 'x' }, { repeatOf: undefined }, { repeatAcknowledged: false }]) assert.equal(orderInput.safeParse({ ...repeat, ...change }).success, false)
})
test('diagnostic guard serializes requests per patient and searches pending tests across encounters', async (t) => {
  const session = {}, patientId = 'patient'; let locked = false
  t.mock.method(Patient, 'findOneAndUpdate', async (filter, update, options) => {
    assert.deepEqual(filter, { _id: patientId }); assert.deepEqual(update, { $inc: { __v: 1 } }); assert.equal(options.session, session); locked = true; return {}
  })
  t.mock.method(DiagnosticOrder, 'findOne', (filter) => {
    assert.equal(locked, true)
    assert.deepEqual(filter, { patientId, serviceId: normal.serviceId, stage: { $in: pendingDiagnosticStages } })
    assert.deepEqual(pendingDiagnosticStages, ['requested', 'scheduled', 'performed', 'result_available'])
    return { sort: () => ({ session: async (current) => { assert.equal(current, session); return pending } }) }
  })
  await assert.rejects(guardDiagnosticRequest(patientId, normal, { role: 'doctor' }, session), { status: 409 })
})
