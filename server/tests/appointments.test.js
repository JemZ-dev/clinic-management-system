import assert from 'node:assert/strict'
import test from 'node:test'
import { appointmentSchema, appointmentStatusSchema, appointmentUpdateSchema } from '../src/validators/appointments.js'
import { validate } from '../src/validators/auth.js'
import { appointmentStart, clinicDate, clinicDayRange, SLOT_MS } from '../src/utils/clinicTime.js'
import { assertNoBookingOverlap, validateTransition } from '../src/services/appointments.js'
import { Appointment } from '../src/models/Appointment.js'

test('Manila slots and day boundaries remain independent of the machine timezone', () => {
  assert.equal(appointmentStart('2030-01-02', '00:00').toISOString(), '2030-01-01T16:00:00.000Z')
  assert.equal(clinicDate(new Date('2030-01-01T16:00:00Z')), '2030-01-02')
  assert.equal(clinicDate(new Date('2030-01-01T15:59:59Z')), '2030-01-01')
  const range = clinicDayRange('2030-01-02')
  assert.equal(range.start.toISOString(), '2030-01-01T16:00:00.000Z')
  assert.equal(range.end.toISOString(), '2030-01-02T16:00:00.000Z')
  assert.equal(SLOT_MS, 1800000)
})
test('booking accepts any start minute and a chosen duration, and rejects invalid inputs', () => {
  const data = { patientId: '0123456789abcdef01234567', doctorId: '0123456789abcdef01234568', date: '2030-01-02', time: '09:30' }
  assert.equal(validate(appointmentSchema, data).reason, '')
  assert.equal(validate(appointmentSchema, { ...data, time: '09:17', durationMinutes: 23 }).durationMinutes, 23)
  assert.equal(validate(appointmentSchema, data).durationMinutes, 30)
  assert.equal(validate(appointmentUpdateSchema, { ...data, version: 0 }).durationMinutes, undefined)
  for (const durationMinutes of [0, -1, 1.5, 1441, '20', null]) assert.throws(() => validate(appointmentSchema, { ...data, durationMinutes }), { status: 400 })
  for (const input of [{ ...data, time: '09:60' }, { ...data, time: '09:15:00' }, { ...data, time: '24:00' }, { ...data, date: '2030-02-30' }, { ...data, status: 'completed' }, { ...data, createdBy: data.patientId }]) assert.throws(() => validate(appointmentSchema, input), { status: 400 })
  assert.throws(() => validate(appointmentStatusSchema, { version: 0, status: 'scheduled' }), { status: 400 })
})

test('overlap checks cover the whole interval in the booking transaction and exclude the edited record', async (t) => {
  const session = { fake: true }
  const details = { doctorId: 'doctor', startsAt: appointmentStart('2030-01-02', '09:17'), endsAt: appointmentStart('2030-01-02', '09:40') }
  let query
  let occupied = false
  t.mock.method(Appointment, 'exists', (value) => {
    query = value
    return { session: async (value) => { assert.equal(value, session); return occupied ? { _id: 'other' } : null } }
  })
  await assertNoBookingOverlap(details, session, 'edited')
  assert.deepEqual(query, { doctorId: 'doctor', status: { $in: ['scheduled', 'checked_in'] }, startsAt: { $lt: details.endsAt }, endsAt: { $gt: details.startsAt }, _id: { $ne: 'edited' } })
  occupied = true
  await assert.rejects(assertNoBookingOverlap(details, session), (error) => error.status === 409 && !!error.fields.time)
  assert.equal(query._id, undefined)
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
  assert.throws(() => validateTransition({ ...scheduled, status: 'checked_in' }, 'completed', startsAt), { status: 409 })
  assert.doesNotThrow(() => validateTransition({ ...scheduled, status: 'checked_in', visitId: '0123456789abcdef01234567' }, 'completed', startsAt))
  for (const status of ['completed', 'cancelled', 'no_show']) assert.throws(() => validateTransition({ ...scheduled, status }, 'checked_in', startsAt), { status: 409 })
})
