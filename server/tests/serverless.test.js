import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { createServerlessHandler } from '../src/services/serverless.js'

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
