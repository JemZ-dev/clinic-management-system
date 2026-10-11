import assert from 'node:assert/strict'
import test from 'node:test'
import { appointmentSchema, appointmentStatusSchema } from '../src/validators/appointments.js'
import { validate } from '../src/validators/auth.js'
import { appointmentStart, clinicDate, clinicDayRange, SLOT_MS } from '../src/utils/clinicTime.js'
import { validateTransition } from '../src/services/appointments.js'

test('Manila slots and day boundaries remain independent of the machine timezone', () => {
  assert.equal(appointmentStart('2030-01-02', '00:00').toISOString(), '2030-01-01T16:00:00.000Z')
  assert.equal(clinicDate(new Date('2030-01-01T16:00:00Z')), '2030-01-02')
  assert.equal(clinicDate(new Date('2030-01-01T15:59:59Z')), '2030-01-01')
  const range = clinicDayRange('2030-01-02')
  assert.equal(range.start.toISOString(), '2030-01-01T16:00:00.000Z')
  assert.equal(range.end.toISOString(), '2030-01-02T16:00:00.000Z')
  assert.equal(SLOT_MS, 1800000)
})
test('booking input requires aligned slots and rejects writable status/audit fields', () => {
  const data = { patientId: '0123456789abcdef01234567', doctorId: '0123456789abcdef01234568', date: '2030-01-02', time: '09:30' }
  assert.equal(validate(appointmentSchema, data).reason, '')
  for (const input of [{ ...data, time: '09:15' }, { ...data, time: '24:00' }, { ...data, date: '2030-02-30' }, { ...data, status: 'completed' }, { ...data, createdBy: data.patientId }]) assert.throws(() => validate(appointmentSchema, input), { status: 400 })
  assert.throws(() => validate(appointmentStatusSchema, { version: 0, status: 'scheduled' }), { status: 400 })
})
test('status transitions reject terminal reopening, future no-shows, and wrong-day check-in', () => {
  const startsAt = appointmentStart('2030-01-02', '09:00')
  const scheduled = { status: 'scheduled', startsAt }
  const onDay = appointmentStart('2030-01-02', '08:00')
  assert.doesNotThrow(() => validateTransition(scheduled, 'checked_in', onDay))
  assert.throws(() => validateTransition(scheduled, 'checked_in', appointmentStart('2030-01-01', '09:00')), { status: 400 })
  assert.throws(() => validateTransition(scheduled, 'no_show', onDay), { status: 400 })
  assert.doesNotThrow(() => validateTransition(scheduled, 'no_show', startsAt))
  assert.throws(() => validateTransition(scheduled, 'completed', startsAt), { status: 409 })
  assert.doesNotThrow(() => validateTransition({ ...scheduled, status: 'checked_in' }, 'completed', startsAt))
  for (const status of ['completed', 'cancelled', 'no_show']) assert.throws(() => validateTransition({ ...scheduled, status }, 'checked_in', startsAt), { status: 409 })
})
