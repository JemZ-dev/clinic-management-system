import { initializeApplication } from './runtime.js'
import { disconnectDatabase } from './config/db.js'
import { failureMessage, getConfig } from './config/env.js'

let server
let stopping = false

async function shutdown() {
  if (stopping) return
  stopping = true
  const timer = setTimeout(() => process.exit(1), 10000)
  timer.unref()
  if (server) await new Promise((resolve) => server.close(resolve))
  await disconnectDatabase()
  clearTimeout(timer)
}

try {
  const app = await initializeApplication()
  const config = getConfig()
  console.log('MongoDB connection verified.')
  server = app.listen(config.port)
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  console.log(`Clinic API running at http://localhost:${config.port}/api/health`)

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      shutdown().catch(() => {
        console.error('Could not close the backend cleanly.')
        process.exitCode = 1
      })
    })
  }
} catch (error) {
  console.error(failureMessage(error))
  await disconnectDatabase()
  process.exitCode = 1
}
