import { connectDatabase, disconnectDatabase } from '../src/config/db.js'
import { failureMessage, getConfig, loadLocalEnvironment } from '../src/config/env.js'

try {
  loadLocalEnvironment()
  await connectDatabase(getConfig())
  console.log('Atlas connection and database ping succeeded. No records were created.')
} catch (error) {
  console.error(failureMessage(error))
  process.exitCode = 1
} finally {
  await disconnectDatabase()
}
