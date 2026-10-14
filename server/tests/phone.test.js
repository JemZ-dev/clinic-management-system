import assert from 'node:assert/strict'
import test from 'node:test'
import examples from '../../shared/phoneExamples.json' with { type: 'json' }
import { phoneError } from '../../shared/phoneValidation.js'
import { patientSchema, doctorSchema } from '../src/validators/records.js'
import { profileSchema } from '../src/validators/auth.js'
import { invitationInput } from '../src/validators/workflow.js'

test('mobile and landline phones accept only 7 to 11 digits and preserve leading zeroes', () => {
  for (const phone of examples.valid) assert.equal(phoneError(phone), '', phone)
  for (const phone of examples.invalid) assert.ok(phoneError(phone), phone)
  for (const phone of [null, 1234567, {}, true]) assert.ok(phoneError(phone))
})

test('all API phone fields enforce the same policy including nested patient and invitation contacts', () => {
  const schemas = [
    (phone) => patientSchema.safeParse({ name: 'Fictional Patient', dateOfBirth: '2000-01-01', gender: 'prefer_not_to_say', phone }),
    (phone) => patientSchema.safeParse({ name: 'Fictional Patient', dateOfBirth: '2000-01-01', gender: 'prefer_not_to_say', guardian: { phone } }),
    (phone) => patientSchema.safeParse({ name: 'Fictional Patient', dateOfBirth: '2000-01-01', gender: 'prefer_not_to_say', emergencyContact: { phone } }),
    (phone) => doctorSchema.safeParse({ name: 'Fictional Doctor', specialty: 'Family medicine', phone }),
    (phone) => profileSchema.safeParse({ name: 'Fictional Staff', phone, dateOfBirth: '2000-01-01', gender: 'prefer_not_to_say' }),
    (phone) => invitationInput.safeParse({ email: 'doctor@example.test', role: 'doctor', permissions: [], doctorId: '', newDoctor: { name: 'Fictional Doctor', specialty: 'Family medicine', phone } }),
  ]
  for (const validate of schemas) {
    for (const phone of examples.valid) assert.equal(validate(phone).success, true, phone)
    for (const phone of examples.invalid) assert.equal(validate(phone).success, false, phone)
  }
  const nested = patientSchema.safeParse({ name: 'Fictional Patient', dateOfBirth: '2000-01-01', gender: 'prefer_not_to_say', guardian: { phone: '123' } })
  assert.deepEqual(nested.error.issues[0].path, ['guardian', 'phone'])
})
