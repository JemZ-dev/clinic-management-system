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
