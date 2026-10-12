import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../src/utils/password.js'
import { validate, registerSchema, profileSchema } from '../src/validators/auth.js'
import { getAuthConfig } from '../src/config/env.js'

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
