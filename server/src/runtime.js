import { createApp } from './app.js'
import { connectDatabase, pingDatabase } from './config/db.js'
import { getAuthConfig, getConfig, loadLocalEnvironment } from './config/env.js'
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

export async function initializeApplication() {
  loadLocalEnvironment()
  const config = getConfig()
  const authConfig = getAuthConfig()
  await connectDatabase(config)
  await Promise.all([User, Session, Patient, Doctor, Appointment, Visit, Medicine, StockMovement, Encounter, DoctorSchedule, ClinicService, DiagnosticOrder, DiagnosticReport, Invoice, Invitation, AuditEvent].map((model) => model.init()))
  return createApp({ pingDatabase, config: authConfig, authService: createAuthService(authConfig), trustProxy: process.env.VERCEL === '1' ? 1 : false })
}
