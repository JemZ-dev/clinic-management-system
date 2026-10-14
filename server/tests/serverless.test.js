import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { createServerlessHandler, normalizeServerlessQuery } from '../src/services/serverless.js'

test('concurrent cold requests share initialization and warm requests keep the app', async () => {
  let starts = 0, connections = 0
  const urls = []
  const handler = createServerlessHandler({
    initialize: async () => { starts++; await Promise.resolve(); return (request) => urls.push(request.url) },
    ensureConnected: async () => { connections++ },
  })
  await Promise.all(['/api/health', '/api/patients?page=2'].map((url) => handler({ url }, {})))
  await handler({ url: '/api/operations/orders' }, {})
  assert.equal(starts, 1)
  assert.equal(connections, 3)
  assert.deepEqual(urls, ['/api/health', '/api/patients?page=2', '/api/operations/orders'])
})

test('failed initialization is redacted and retried; a later connection outage can recover', async () => {
  let starts = 0, offline = false, called = 0
  const handler = createServerlessHandler({
    initialize: async () => { if (++starts === 1) throw new Error('private secret'); return () => { called++ } },
    ensureConnected: async () => { if (offline) throw new Error('private URI') },
  })
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.body = value } }
  await handler({}, response)
  assert.equal(response.code, 503)
  assert.equal(JSON.stringify(response.body).includes('private'), false)
  await handler({}, response)
  offline = true
  await handler({}, response)
  assert.equal(response.code, 503)
  offline = false
  await handler({}, response)
  assert.equal(starts, 2)
  assert.equal(called, 2)
})

test('hosted handler serves API health, secure login cookies, and JSON API errors', async (t) => {
  const origin = 'https://clinic.example.test'
  const app = createApp({
    pingDatabase: async () => {}, trustProxy: 1,
    config: { appOrigin: origin, appOrigins: [origin], secureCookies: true },
    authService: { login: async () => ({ token: 'fictional-test-session', user: { name: 'Test Staff' } }) },
  })
  const handler = createServerlessHandler({ initialize: async () => app, ensureConnected: async () => {} })
  const server = createServer(handler).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`
  const health = await fetch(`${url}/api/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).database, 'connected')
  const login = await fetch(`${url}/api/auth/login`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Clinic-Request': '1', 'X-Forwarded-For': '192.0.2.1', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ email: 'staff@example.test', password: 'fictional-password' }),
  })
  assert.equal(login.status, 200)
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api']) assert.ok(login.headers.get('set-cookie').includes(flag))
  const unknown = await fetch(`${url}/api/unknown`)
  assert.equal(unknown.status, 404)
  assert.equal((await unknown.json()).message, 'Endpoint not found.')
})

test('Vercel installs both packages and routes API before the React fallback', async () => {
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url)))
  assert.equal(config.installCommand, 'npm ci --include=dev && npm ci --prefix server --omit=dev')
  assert.equal(config.outputDirectory, 'dist')
  assert.equal(config.functions['api/index.js'].maxDuration, 60)
  assert.deepEqual(config.rewrites.slice(0, 2).map((rule) => rule.destination), ['/api/index', '/api/index'])
  const fallback = new RegExp(`^${config.rewrites[2].source}$`)
  for (const path of ['/patients', '/appointments/new', '/queue/record']) assert.equal(fallback.test(path), true)
  for (const path of ['/api', '/api/unknown', '/assets/file.js']) assert.equal(fallback.test(path), false)
})


import { diagnosticListSchema } from '../src/services/diagnosticDirectory.js'
import { Encounter } from '../src/models/Encounter.js'
import { DiagnosticOrder } from '../src/models/Operations.js'

test('Vercel routing metadata does not become a directory filter', async (t) => {
  t.mock.method(Encounter, 'countDocuments', async () => 0)
  t.mock.method(Encounter, 'find', () => ({ sort: () => ({ skip: () => ({ limit: async () => [] }) }) }))
  t.mock.method(DiagnosticOrder, 'aggregate', async () => [{ count: [], records: [] }])
  const app = createApp({ pingDatabase: async () => {}, config: { appOrigin: 'https://clinic.example.test' }, authService: {
    authenticate: async () => ({ user: { id: 'test-user', role: 'admin', active: true } }),
  } })
  const handler = createServerlessHandler({ initialize: async () => app, ensureConnected: async () => {} })
  const server = createServer((request, response) => {
    const original = Object.fromEntries(new URL(request.url, 'http://localhost').searchParams)
    Object.defineProperty(request, 'query', { configurable: true, get: () => original })
    return handler(request, response)
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const root = `http://127.0.0.1:${server.address().port}`
  const headers = { Cookie: 'clinic_session=fictional' }
  for (const path of [
    '/api/operations/orders?q=&status=all&category=all&provider=all&from=&through=&page=1&limit=10&path=operations%2Forders',
    '/api/encounters?q=&stage=active&page=1&path=encounters',
    '/api/encounters?q=&stage=active&page=1',
  ]) {
    const response = await fetch(`${root}${path}`, { headers })
    assert.equal(response.status, 200, path)
    assert.deepEqual((await response.json()).records, [])
  }
  const invalid = await fetch(`${root}/api/encounters?page=1&unexpected=value&path=encounters`, { headers })
  assert.equal(invalid.status, 400)
  assert.equal(diagnosticListSchema.safeParse({ path: 'operations/orders' }).success, false)
})

test('query normalization preserves filters, mismatching and repeated path parameters', () => {
  for (const extra of ['path=not-the-route', 'path=encounters&path=encounters']) {
    const request = { url: `/api/encounters?q=Jamie&page=2&${extra}` }
    normalizeServerlessQuery(request)
    assert.ok(request.url.includes(extra))
  }
  const request = { url: '/api/encounters?q=Jamie&page=2&path=encounters' }
  normalizeServerlessQuery(request)
  assert.equal(request.url, '/api/encounters?q=Jamie&page=2')
})
