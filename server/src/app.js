import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { browserSecurity } from './middleware/browserSecurity.js'
import { authRoutes } from './routes/auth.js'
import { recordRoutes } from './routes/records.js'
import { appointmentRoutes } from './routes/appointments.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { visitRoutes } from './routes/visits.js'
import { medicineRoutes } from './routes/medicines.js'
import { inventoryRoutes } from './routes/inventory.js'
import { HttpError } from './utils/errors.js'
import { operationRoutes } from './routes/operations.js'
import { encounterRoutes, billingRoutes } from './routes/encounters.js'

export function createApp({ pingDatabase, authService, config }) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cookieParser())
  app.use('/api/operations/orders/:id/reports', express.json({ limit: '7mb' }))
  app.use(express.json({ limit: '100kb' }))
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })
  if (authService) {
    app.use('/api', browserSecurity(config.appOrigin, config.appOrigins))
    app.use('/api/auth', authRoutes(authService, config))
    app.use('/api/operations', operationRoutes(authService))
    app.use('/api/encounters', encounterRoutes(authService))
    app.use('/api/billing', billingRoutes(authService))
    app.use('/api/patients', recordRoutes(authService, 'patients'))
    app.use('/api/doctors', recordRoutes(authService, 'doctors'))
    app.use('/api/appointments', appointmentRoutes(authService))
    app.use('/api/dashboard', dashboardRoutes(authService))
    app.use('/api/visits', visitRoutes(authService))
    app.use('/api/medicines', medicineRoutes(authService))
    app.use('/api/inventory', inventoryRoutes(authService))
  }

  app.get('/api/health', async (_request, response) => {
    response.set('Cache-Control', 'no-store')
    try {
      await pingDatabase()
      response.json({ status: 'ok', database: 'connected' })
    } catch {
      response.status(503).json({ status: 'unavailable', database: 'disconnected' })
    }
  })

  app.use((_request, response) => {
    response.status(404).json({ message: 'Endpoint not found.' })
  })

  app.use((error, _request, response, _next) => {
    if (error instanceof HttpError) {
      return response.status(error.status).json({ message: error.message, ...(error.fields ? { fields: error.fields } : {}), ...(error.duplicateOrder ? { duplicateOrder: error.duplicateOrder } : {}) })
    }
    if (error.name === 'VersionError' || error.code === 11000) return response.status(409).json({ message: 'This record changed or already exists. Reload before trying again.' })
    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({ message: 'Request body must be valid JSON.' })
    }
    if (error.type === 'entity.too.large') {
      return response.status(413).json({ message: 'Request body is too large.' })
    }
    if (['MongoNetworkError', 'MongoServerSelectionError', 'MongoNotConnectedError'].includes(error.name)) {
      return response.status(503).json({ message: 'The database is unavailable. Please try again shortly.' })
    }
    response.status(500).json({ message: 'An unexpected server error occurred. Please try again.' })
  })

  return app
}
