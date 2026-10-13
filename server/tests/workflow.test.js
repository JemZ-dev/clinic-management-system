import assert from 'node:assert/strict'
import test from 'node:test'
import { can } from '../../shared/permissions.js'
import { assessmentInput, scheduleInput, accountInput } from '../src/validators/workflow.js'
import { scheduleAllows, invoiceTotals } from '../src/services/workflow.js'
import { decodeReport } from '../src/routes/operations.js'

test('administrative access does not imply clinical or dispensing access', () => {
  assert.equal(can({ role: 'admin' }, 'accounts'), true)
  assert.equal(can({ role: 'admin' }, 'clinical'), false)
  assert.equal(can({ role: 'staff' }, 'clinical'), false)
  assert.equal(can({ role: 'staff', permissions: ['assess'] }, 'assess'), true)
  assert.equal(can({ role: 'staff', permissions: ['dispense'], active: false }, 'dispense'), false)
  assert.equal(accountInput.safeParse({ role: 'doctor', permissions: [], doctorId: '' }).success, false)
})
test('assessment accepts documented omissions and rejects partial blood pressure and future readings', () => {
  const base = { version: 0, measuredAt: new Date().toISOString(), weight: 60, height: 165, systolic: 120, diastolic: 80 }
  assert.equal(assessmentInput.safeParse(base).success, true)
  assert.equal(assessmentInput.safeParse({ ...base, weight: null }).success, false)
  assert.equal(assessmentInput.safeParse({ ...base, weight: null, notMeasuredReason: 'Unable to stand for measurement' }).success, true)
  assert.equal(assessmentInput.safeParse({ ...base, diastolic: null, notMeasuredReason: 'Unavailable' }).success, false)
  assert.equal(assessmentInput.safeParse({ ...base, measuredAt: new Date(Date.now() + 3600000).toISOString() }).success, false)
})
test('schedules enforce full slot duration, breaks, leave, and non-overlapping periods', () => {
  const schedule = { weekly: [{ day: 1, start: '09:00', end: '12:00' }, { day: 1, start: '13:00', end: '17:00' }], leave: [] }
  assert.equal(scheduleAllows(schedule, '2026-10-19', '11:30'), true)
  assert.equal(scheduleAllows(schedule, '2026-10-19', '12:00'), false)
  assert.equal(scheduleAllows(schedule, '2026-10-19', '17:00'), false)
  assert.equal(scheduleAllows({ ...schedule, leave: [{ from: '2026-10-19', through: '2026-10-20' }] }, '2026-10-19', '10:00'), false)
  assert.equal(scheduleInput.safeParse({ ...schedule, weekly: [...schedule.weekly, { day: 1, start: '11:00', end: '13:00' }] }).success, false)
})
test('financial totals preserve voids and refunds in integer centavos', () => {
  const invoice = { lines: [{ quantity: 2, unitCentavos: 12550 }, { quantity: 1, unitCentavos: 5000, voided: true }], payments: [{ amountCentavos: 20000 }, { amountCentavos: 5000, refund: true }] }
  assert.deepEqual(invoiceTotals(invoice), { totalCentavos: 25100, paidCentavos: 15000, balanceCentavos: 10100, status: 'partially_paid' })
})
test('report uploads validate size and file signature rather than trusting MIME alone', () => {
  assert.equal(decodeReport({ mime: 'application/pdf', content: Buffer.from('%PDF-1.4\nexample').toString('base64') }).length, 16)
  assert.throws(() => decodeReport({ mime: 'application/pdf', content: Buffer.from('<script>bad</script>').toString('base64') }))
  assert.throws(() => decodeReport({ mime: 'image/png', content: 'bad data' }))
})
