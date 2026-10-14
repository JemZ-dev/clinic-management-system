import assert from 'node:assert/strict'
import test from 'node:test'
import { can } from '../../shared/permissions.js'
import { assessmentInput, scheduleInput, accountInput, invitationInput, paymentInput } from '../src/validators/workflow.js'
import { paymentCentavos, paymentErrors } from '../../shared/paymentValidation.js'
import { availableStartTimes, scheduleAllows, invoiceTotals } from '../src/services/workflow.js'
import { decodeReport } from '../src/routes/operations.js'
import { requireStaff } from '../src/middleware/requireStaff.js'

test('payments enforce precision, limits, references, and supported methods', () => {
  assert.equal(paymentCentavos('125.5'), 12550)
  assert.equal(paymentCentavos('0.01'), 1)
  assert.equal(paymentCentavos('1000000.00'), 100000000)
  for (const value of ['0', '-1', '1e3', '1.234', '1000000.01']) assert.equal(paymentCentavos(value), null)
  assert.ok(paymentErrors({ amount: '301', method: 'cash', reference: '' }, 30000).amount)
  const base = { version: 0, requestId: '01234567-89ab-4cde-8fab-0123456789ab', amountCentavos: 12550, method: 'cash', reference: '' }
  assert.equal(paymentInput.safeParse(base).success, true)
  assert.equal(paymentInput.safeParse({ ...base, method: 'gcash', reference: 'GC-123/456' }).success, true)
  for (const change of [{ method: 'gcash' }, { method: 'card' }, { method: 'bank_transfer' }, { reference: 'x'.repeat(51) }, { reference: '<script>' }, { amountCentavos: 100000001 }, { amountCentavos: 1.5 }]) {
    assert.equal(paymentInput.safeParse({ ...base, ...change }).success, false)
  }
})

test('doctor invitations support a new directory record or an existing link', () => {
  const base = { email: 'doctor@example.com', role: 'doctor', permissions: [], doctorId: '' }
  assert.equal(invitationInput.safeParse(base).success, false)
  assert.equal(invitationInput.safeParse({ ...base, doctorId: '0123456789abcdef01234567' }).success, true)
  const newDoctor = { name: ' Fictional Doctor ', specialty: ' Neurology ', phone: '' }
  const parsed = invitationInput.parse({ ...base, newDoctor })
  assert.equal(parsed.newDoctor.name, 'Fictional Doctor')
  assert.equal(parsed.newDoctor.specialty, 'Neurology')
  assert.equal(invitationInput.safeParse({ ...base, newDoctor, doctorId: '0123456789abcdef01234567' }).success, false)
  assert.equal(invitationInput.safeParse({ ...base, role: 'staff', newDoctor }).success, false)
  assert.equal(invitationInput.safeParse({ ...base, newDoctor: { ...newDoctor, specialty: '' } }).success, false)
  assert.equal(invitationInput.safeParse({ ...base, newDoctor: { ...newDoctor, role: 'admin' } }).success, false)
})

test('administrators maintain medicine catalogs and stock', () => {
  const admin = { role: 'admin', active: true }
  assert.equal(can(admin, 'medicineCatalog'), true)
  assert.equal(can(admin, 'dispense'), true)
  assert.equal(can({ role: 'staff' }, 'medicineCatalog'), false)
  assert.equal(can({ role: 'staff', permissions: ['dispense'] }, 'medicineCatalog'), true)
  for (const [method, path] of [['POST', '/'], ['PATCH', '/medicine-id'], ['DELETE', '/medicine-id'], ['POST', '/medicine-id/restore']]) {
    let allowed = false
    requireStaff({ auth: { user: admin }, baseUrl: '/api/medicines', method, path }, {}, () => { allowed = true })
    assert.equal(allowed, true)
  }
  let allowed = false
  requireStaff({ auth: { user: admin }, baseUrl: '/api/medicines', method: 'POST', path: '/medicine-id/movements' }, {}, () => { allowed = true })
  assert.equal(allowed, true)
})

test('administrative access does not imply clinical access', () => {
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
  assert.equal(scheduleAllows(schedule, '2026-10-19', '11:37', 23), true)
  assert.equal(scheduleAllows(schedule, '2026-10-19', '11:37', 24), false)
  assert.equal(scheduleAllows(schedule, '2026-10-19', '12:45', 30), false)
  assert.equal(scheduleInput.safeParse({ weekly: [{ day: 1, start: '09:07', end: '12:23' }], leave: [] }).success, true)
  assert.equal(scheduleAllows(schedule, '2026-10-19', '12:00'), false)
  assert.equal(scheduleAllows(schedule, '2026-10-19', '17:00'), false)
  assert.equal(scheduleAllows({ ...schedule, leave: [{ from: '2026-10-19', through: '2026-10-20' }] }, '2026-10-19', '10:00'), false)
  assert.equal(scheduleInput.safeParse({ ...schedule, weekly: [...schedule.weekly, { day: 1, start: '11:00', end: '13:00' }] }).success, false)
})

test('available times use every minute and the full duration around existing bookings and breaks', () => {
  const date = '2026-10-19'
  const schedule = { weekly: [{ day: 1, start: '09:07', end: '10:00' }, { day: 1, start: '10:15', end: '11:00' }], leave: [] }
  const bookings = [{ startsAt: `${date}T09:25:00+08:00`, endsAt: `${date}T09:45:00+08:00` }]
  const slots = availableStartTimes(schedule, date, bookings, 10, 0)
  assert.equal(slots[0], '09:07')
  for (const time of ['09:15', '09:45', '09:50', '10:15', '10:50']) assert.ok(slots.includes(time), time)
  for (const time of ['09:16', '09:25', '09:44', '09:51', '10:00', '10:14', '10:51']) assert.equal(slots.includes(time), false, time)
  assert.deepEqual(availableStartTimes({ ...schedule, leave: [{ from: date, through: date }] }, date, [], 10, 0), [])
  assert.deepEqual(availableStartTimes(schedule, date, [], 10, Date.parse(`${date}T23:00:00+08:00`)), [])
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
