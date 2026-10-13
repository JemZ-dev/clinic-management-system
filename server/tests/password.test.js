import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../src/utils/password.js'
import { validate, registerSchema, profileSchema } from '../src/validators/auth.js'
import { getAuthConfig } from '../src/config/env.js'
import { profileFieldError, validateProfile } from '../../shared/profileValidation.js'

test('passwords use salted hashes and reject wrong or corrupt credentials', async () => {
  const password = 'fictional long passphrase 🌱'
  const first = await hashPassword(password)
  const second = await hashPassword(password)
  assert.notEqual(first, second)
  assert.equal(first.includes(password), false)
  assert.equal(await verifyPassword(password, first), true)
  assert.equal(await verifyPassword('incorrect passphrase', first), false)
  assert.equal(await verifyPassword(password, 'scrypt$invalid$broken'), false)
})

test('validation normalizes identities and rejects self-assigned roles', () => {
  const input = { name: '  Fictional Staff  ', email: '  STAFF@EXAMPLE.COM ', password: 'fictional passphrase', registrationCode: 'test-access-code' }
  const parsed = validate(registerSchema, input)
  assert.equal(parsed.name, 'Fictional Staff')
  assert.equal(parsed.email, 'staff@example.com')
  assert.throws(() => validate(registerSchema, { ...input, role: 'admin' }), { status: 400 })
  assert.throws(() => validate(profileSchema, { name: 'Staff', phone: '555', email: 'different@example.com' }), { status: 400 })
  assert.throws(() => validate(registerSchema, { ...input, password: 'short' }), { status: 400 })
})

test('production requires HTTPS and secrets cannot be empty', () => {
  assert.throws(() => getAuthConfig({}), /JWT_SECRET/)
  const env = { JWT_SECRET: 'a'.repeat(64), REGISTRATION_CODE: 'b'.repeat(24), NODE_ENV: 'production' }
  assert.throws(() => getAuthConfig(env), /HTTPS/)
  const production = getAuthConfig({ ...env, APP_ORIGIN: 'https://clinic.example' })
  assert.equal(production.secureCookies, true)
  assert.deepEqual(production.appOrigins, ['https://clinic.example'])
  assert.deepEqual(getAuthConfig({ ...env, NODE_ENV: 'development' }).appOrigins, ['http://localhost:5173', 'http://127.0.0.1:5173'])
})

test('staff profile validates personal and work details without requiring optional fields', () => {
  const base = { name: 'Fictional Staff', phone: '' }
  assert.deepEqual(validate(profileSchema, base), base)
  const parsed = validate(profileSchema, { ...base, gender: 'prefer_not_to_say', dateOfBirth: '2000-02-29', jobTitle: ' Receptionist ', department: ' Front desk ', workLocation: ' Main clinic ' })
  assert.equal(parsed.jobTitle, 'Receptionist')
  assert.equal(parsed.department, 'Front desk')
  assert.equal(parsed.workLocation, 'Main clinic')
  for (const dateOfBirth of ['2001-02-29', '2000-04-31', '2999-01-01', '1899-12-31']) {
    assert.throws(() => validate(profileSchema, { ...base, dateOfBirth }), (error) => error.status === 400 && !!error.fields.dateOfBirth)
  }
  assert.throws(() => validate(profileSchema, { ...base, gender: 'administrator' }), { status: 400 })
  assert.throws(() => validate(profileSchema, { ...base, department: 'x'.repeat(101) }), { status: 400 })
  assert.throws(() => validate(profileSchema, { ...base, workLocation: 'x'.repeat(161) }), { status: 400 })
  assert.equal(validate(profileSchema, { ...base, dateOfBirth: '', gender: '', jobTitle: '', department: '', workLocation: '' }).dateOfBirth, '')
})

test('profile birthdays validate calendar dates and the clinic date boundary', () => {
  const today = '2026-10-14'
  for (const value of ['1900-01-01', '2000-02-29', today, '']) assert.equal(profileFieldError('dateOfBirth', value, today), '')
  for (const value of ['1900-02-29', '2001-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '1899-12-31', '2026-10-15', 'invalid']) {
    assert.ok(profileFieldError('dateOfBirth', value, today), value)
  }
  assert.equal(profileFieldError('dateOfBirth', '2026-10-15', today), 'Date of birth cannot be in the future.')
})

test('profile identity and phone validation accepts real formats and rejects unusable values', () => {
  const base = { name: 'José 李', phone: '' }
  assert.deepEqual(validateProfile(base), {})
  for (const phone of ['', '0917 123 4567', '+63 917 123 4567', '(555) 123-4567']) {
    assert.equal(validate(profileSchema, { ...base, phone }).phone, phone)
  }
  for (const phone of ['---', '123', '1234567890123456', '123+4567890', 'call me', '+63+9171234567']) {
    assert.throws(() => validate(profileSchema, { ...base, phone }), (error) => error.status === 400 && !!error.fields.phone)
  }
  for (const name of ['', '   ', 'A', '12345', '---']) {
    assert.throws(() => validate(profileSchema, { ...base, name }), (error) => error.status === 400 && !!error.fields.name)
  }
  for (const [field, limit] of Object.entries({ name: 100, jobTitle: 100, department: 100, workLocation: 160 })) {
    assert.throws(() => validate(profileSchema, { ...base, [field]: 'x'.repeat(limit + 1) }), (error) => error.status === 400 && !!error.fields[field])
  }
})
