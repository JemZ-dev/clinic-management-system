import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../src/app.js'

async function startTestServer(t, pingDatabase) {
  const server = createApp({ pingDatabase }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('health checks the database and reports a later outage without exposing errors', async (t) => {
  let available = true
  let calls = 0
  const url = await startTestServer(t, async () => {
    calls++
    if (!available) throw new Error('Sensitive database connection information')
  })

  const healthy = await fetch(`${url}/api/health`)
  assert.equal(healthy.status, 200)
  assert.equal(healthy.headers.get('cache-control'), 'no-store')
  assert.equal(healthy.headers.get('x-powered-by'), null)
  assert.deepEqual(await healthy.json(), { status: 'ok', database: 'connected' })

  available = false
  const outage = await fetch(`${url}/api/health`)
  assert.equal(outage.status, 503)
  assert.deepEqual(await outage.json(), { status: 'unavailable', database: 'disconnected' })
  assert.equal(calls, 2)

  const unknown = await fetch(`${url}/api/unknown`)
  assert.equal(unknown.status, 404)
})

test('malformed JSON receives a useful response without reflecting request contents', async (t) => {
  const url = await startTestServer(t, async () => {})
  const response = await fetch(`${url}/api/unknown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"secret":',
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { message: 'Request body must be valid JSON.' })
})
