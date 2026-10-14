import assert from 'node:assert/strict'
import test from 'node:test'
import { patientSchema, doctorSchema, listSchema, validBirthDate, todayInClinic } from '../src/validators/records.js'
import { validate } from '../src/validators/auth.js'

test('date-only birth dates reject future dates and calendar overflow', () => {
  assert.equal(validBirthDate('2000-02-29'), true)
  for (const date of ['2001-02-29', '2020-04-31', '0000-01-01', '01/01/2000', '9999-01-01']) assert.equal(validBirthDate(date), false, date)
  assert.equal(validBirthDate(todayInClinic()), true)
})

test('record validation rejects injected fields and identifies nested errors', () => {
  const patient = { name: ' Fictional Patient ', dateOfBirth: '2000-01-01', gender: 'prefer_not_to_say' }
  const parsed = validate(patientSchema, patient)
  assert.equal(parsed.name, 'Fictional Patient')
  assert.equal(parsed.medicalHistory.allergies, '')
  for (const gender of ['', undefined, null, 'invalid']) {
    assert.throws(() => validate(patientSchema, { ...patient, gender }), (error) => error.status === 400 && !!error.fields.gender)
  }
  for (const gender of ['female', 'male', 'non_binary', 'other', 'prefer_not_to_say']) {
    assert.equal(validate(patientSchema, { ...patient, gender }).gender, gender)
  }
  assert.throws(() => validate(patientSchema, { ...patient, archivedAt: new Date() }), { status: 400 })
  assert.throws(() => validate(patientSchema, { ...patient, emergencyContact: { phone: 'invalid' } }), (error) => error.status === 400 && !!error.fields['emergencyContact.phone'])
  assert.throws(() => validate(patientSchema, { ...patient, medicalHistory: { allergies: 'x'.repeat(2001) } }), (error) => !!error.fields['medicalHistory.allergies'])
  assert.throws(() => validate(doctorSchema, { name: 'Fictional Doctor', specialty: '' }), { status: 400 })
  for (const query of [{ q: { $ne: '' } }, { page: '-1' }, { limit: '100' }, { status: 'hidden' }, { sort: '$where' }]) assert.throws(() => validate(listSchema, query), { status: 400 })
})
