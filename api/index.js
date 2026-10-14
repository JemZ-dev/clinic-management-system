import { initializeApplication } from '../server/src/runtime.js'
import { connectDatabase } from '../server/src/config/db.js'
import { getConfig } from '../server/src/config/env.js'
import { createServerlessHandler } from '../server/src/services/serverless.js'

export default createServerlessHandler({
  initialize: initializeApplication,
  ensureConnected: () => connectDatabase(getConfig()),
})
