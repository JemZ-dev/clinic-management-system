import assert from 'node:assert/strict'
import test from 'node:test'
import { billingListSchema, billingPipeline, listBills } from '../src/services/billingDirectory.js'
import { Invoice } from '../src/models/Operations.js'

test('billing filters validate statuses, date ranges, pagination, and injection attempts', () => {
  for (const status of ['all', 'unpaid', 'partially_paid', 'paid', 'no_charges']) assert.equal(billingListSchema.safeParse({ status }).success, true)
  for (const input of [{ from: '2026-10-15', through: '2026-10-14' }, { from: '2026-02-30' }, { status: 'hidden' }, { q: { $ne: '' } }, { page: '0' }, { limit: '200' }, { unexpected: 'x' }]) assert.equal(billingListSchema.safeParse(input).success, false)
})

test('billing query escapes search, uses inclusive Manila dates, and filters before pagination', () => {
  const filters = billingListSchema.parse({ q: '  Patient.*  ', status: 'no_charges', from: '2026-10-14', through: '2026-10-15', page: '2', limit: '25' })
  const pipeline = billingPipeline(filters)
  const match = pipeline.find((stage) => stage.$match?.$or).$match
  assert.equal(match.$or[0]['encounterId.patientName'].$regex, 'Patient\\.\\*')
  assert.equal(match['encounterId.arrivedAt'].$gte.toISOString(), '2026-10-13T16:00:00.000Z')
  assert.equal(match['encounterId.arrivedAt'].$lt.toISOString(), '2026-10-15T16:00:00.000Z')
  assert.ok(pipeline.findIndex((stage) => stage.$match?.billingStatus) < pipeline.findIndex((stage) => stage.$facet))
  assert.deepEqual(pipeline.at(-1).$facet.records, [{ $skip: 25 }, { $limit: 25 }])
})

test('billing directory returns total pages and public ids without truncating at 200', async (t) => {
  t.mock.method(Invoice, 'aggregate', async () => [{ records: [{ _id: 'invoice', __v: 3, billingStatus: 'paid' }], count: [{ total: 251 }] }])
  const result = await listBills(billingListSchema.parse({ page: '2', limit: '25' }))
  assert.deepEqual(result.pagination, { page: 2, limit: 25, total: 251, pages: 11 })
  assert.equal(result.records[0].id, 'invoice')
  assert.equal(result.records[0].version, 3)
})
