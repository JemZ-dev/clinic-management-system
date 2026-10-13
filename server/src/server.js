import { createApp } from './app.js'
import { connectDatabase, disconnectDatabase, pingDatabase } from './config/db.js'
import { failureMessage, getAuthConfig, getConfig, loadLocalEnvironment } from './config/env.js'
import { createAuthService } from './services/auth.js'
import { User } from './models/User.js'
import { Session } from './models/Session.js'
import { Patient } from './models/Patient.js'
import { Doctor } from './models/Doctor.js'
import { Appointment } from './models/Appointment.js'
import { Visit } from './models/Visit.js'
import { Medicine } from './models/Medicine.js'
import { StockMovement } from './models/StockMovement.js'
import { Encounter } from './models/Encounter.js'
import { DoctorSchedule, ClinicService, DiagnosticOrder, DiagnosticReport, Invoice, Invitation, AuditEvent } from './models/Operations.js'

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
  loadLocalEnvironment()
  const config = getConfig()
  const authConfig = getAuthConfig()
  await connectDatabase(config)
  await Promise.all([User, Session, Patient, Doctor, Appointment, Visit, Medicine, StockMovement, Encounter, DoctorSchedule, ClinicService, DiagnosticOrder, DiagnosticReport, Invoice, Invitation, AuditEvent].map((model) => model.init()))
  console.log('MongoDB connection verified.')

  const app = createApp({ pingDatabase, config: authConfig, authService: createAuthService(authConfig) })
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
