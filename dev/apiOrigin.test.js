import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import test from 'node:test'
import { createServer as createViteServer } from 'vite'
import viteConfig from '../vite.config.js'
import { localApiOrigin } from './apiOrigin.js'

const listen = (server, port) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(port, 'localhost', resolve)
})
const close = (server) => new Promise((resolve) => server.close(resolve))

test('Vite skips occupied ports and forwards writes only from its actual browser origin', async (t) => {
  const configured = viteConfig({ mode: 'development', command: 'serve' })
  assert.equal(configured.server.port, 5173)
  assert.equal(configured.server.strictPort, false)

  const occupied = createHttpServer()
  await listen(occupied, 0)
  t.after(() => close(occupied))
  const preferredPort = occupied.address().port
  let calls = 0
  const backend = createHttpServer((request, response) => {
    calls += 1
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ origin: request.headers.origin, header: request.headers['x-clinic-request'] }))
  })
  await listen(backend, 0)
  t.after(() => close(backend))
  const frontend = await createViteServer({
    configFile: false,
    logLevel: 'silent',
    plugins: [localApiOrigin('http://localhost:5173')],
    server: {
      ...configured.server,
      port: preferredPort,
      proxy: { '/api': `http://localhost:${backend.address().port}` },
    },
  })
  t.after(() => frontend.close())
  await frontend.listen()
  const port = frontend.httpServer.address().port
  assert.ok(port > preferredPort)

  for (const hostname of ['localhost', '127.0.0.1']) {
    const response = await fetch(`http://localhost:${port}/api/example`, {
      method: 'POST',
      headers: { Origin: `http://${hostname}:${port}`, 'Content-Type': 'application/json', 'X-Clinic-Request': '1' },
      body: '{}',
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { origin: 'http://localhost:5173', header: '1' })
  }
  for (const origin of ['http://localhost:5173', `http://localhost:${preferredPort}`, `https://localhost:${port}`, `http://other.example:${port}`]) {
    const response = await fetch(`http://localhost:${port}/api/example`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Clinic-Request': '1' },
      body: '{}',
    })
    assert.equal(response.status, 403, origin)
  }
  assert.equal(calls, 2, 'Rejected origins never reach the API')
})
