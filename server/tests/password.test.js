import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../src/utils/password.js'
import { validate, registerSchema, loginSchema, profileSchema } from '../src/validators/auth.js'
import { getAuthConfig } from '../src/config/env.js'
import { profileFieldError, validateProfile } from '../../shared/profileValidation.js'
import { BLOCKED_EMAIL_DOMAINS, emailDomainError } from '../../shared/emailPolicy.js'
import { invitationInput } from '../src/validators/workflow.js'

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

test('sign-in and registration reject malformed emails and accept normal address formats', () => {
  const registration = { name: 'Fictional Staff', password: 'fictional passphrase', registrationCode: 'test-access-code' }
  for (const email of ['', 'plain-text', 'staff@', '@example.com', 'staff@example', 'staff@@example.com', 'staff name@example.com', 'staff@example..com', 'staff@example.com extra', `${'a'.repeat(255)}@example.com`]) {
    for (const [schema, base] of [[registerSchema, registration], [loginSchema, { password: registration.password }]]) {
      assert.throws(() => validate(schema, { ...base, email }), (error) => error.status === 400 && !!error.fields.email, email)
    }
  }
  for (const email of ['staff@example.com', 'staff.name+clinic@example.com', 'staff@clinic.example.com', ' STAFF@EXAMPLE.COM ']) {
    assert.equal(validate(registerSchema, { ...registration, email }).email, email.trim().toLowerCase())
    assert.equal(validate(loginSchema, { password: registration.password, email }).email, email.trim().toLowerCase())
  }
})

test('registration and employee invitations reject blocked domains and subdomains', () => {
  const registration = { name: 'Fictional Staff', password: 'fictional passphrase', registrationCode: 'test-access-code' }
  const invitation = { role: 'staff', permissions: [], doctorId: '' }
  for (const domain of BLOCKED_EMAIL_DOMAINS) {
    for (const email of [`name@${domain}`, `NAME@${domain.toUpperCase()}`, `name@mail.${domain}`]) {
      assert.ok(emailDomainError(email))
      assert.throws(() => validate(registerSchema, { ...registration, email }), (error) => error.status === 400 && !!error.fields.email)
      assert.equal(invitationInput.safeParse({ ...invitation, email }).success, false)
    }
  }
  for (const email of ['staff@gmail.com', 'staff@clinic.com.ph', 'pornhub.com@example.com', 'staff@notpornhub.com']) {
    assert.equal(emailDomainError(email), '')
    assert.equal(invitationInput.safeParse({ ...invitation, email }).success, true)
  }
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

test('staff profile requires birth date while allowing optional personal and work fields', () => {
  const base = { name: 'Fictional Staff', phone: '', dateOfBirth: '2000-02-29', gender: 'prefer_not_to_say' }
  assert.deepEqual(validate(profileSchema, base), base)
  const parsed = validate(profileSchema, { ...base, gender: 'prefer_not_to_say', dateOfBirth: '2000-02-29', jobTitle: ' Receptionist ', department: ' Front desk ', workLocation: ' Main clinic ' })
  assert.equal(parsed.jobTitle, 'Receptionist')
  assert.equal(parsed.department, 'Front desk')
  assert.equal(parsed.workLocation, 'Main clinic')
  for (const dateOfBirth of ['', '   ', undefined, '2001-02-29', '2000-04-31', '2999-01-01', '1899-12-31']) {
    assert.throws(() => validate(profileSchema, { ...base, dateOfBirth }), (error) => error.status === 400 && !!error.fields.dateOfBirth)
  }
  for (const gender of ['', undefined, 'administrator']) {
    assert.throws(() => validate(profileSchema, { ...base, gender }), (error) => error.status === 400 && !!error.fields.gender)
  }
  assert.throws(() => validate(profileSchema, { ...base, department: 'x'.repeat(101) }), { status: 400 })
  assert.throws(() => validate(profileSchema, { ...base, workLocation: 'x'.repeat(161) }), { status: 400 })
  assert.equal(validate(profileSchema, { ...base, jobTitle: '', department: '', workLocation: '' }).dateOfBirth, base.dateOfBirth)
  assert.throws(() => validate(profileSchema, { name: base.name, phone: '' }), (error) => error.status === 400 && !!error.fields.dateOfBirth)
})

test('profile birthdays validate calendar dates and the clinic date boundary', () => {
  const today = '2026-10-14'
  for (const value of ['1900-01-01', '2000-02-29', today]) assert.equal(profileFieldError('dateOfBirth', value, today), '')
  for (const value of ['', '   ', '1900-02-29', '2001-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '1899-12-31', '2026-10-15', 'invalid']) {
    assert.ok(profileFieldError('dateOfBirth', value, today), value)
  }
  assert.equal(profileFieldError('dateOfBirth', '2026-10-15', today), 'Date of birth cannot be in the future.')
})

test('profile identity and phone validation accepts real formats and rejects unusable values', () => {
  const base = { name: 'José 李', phone: '', dateOfBirth: '2000-02-29', gender: 'prefer_not_to_say' }
  assert.deepEqual(validateProfile(base), {})
  for (const phone of ['', '09171234567', '0281234567', '5550100']) {
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
