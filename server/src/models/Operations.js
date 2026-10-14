import mongoose from 'mongoose'
const ref = (model, required = false) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required })
const options = { timestamps: true, optimisticConcurrency: true }
const actor = { id: ref('User', true), name: String }
const scheduleSchema = new mongoose.Schema({
  doctorId: { ...ref('Doctor', true), unique: true },
  weekly: [{ _id: false, day: Number, start: String, end: String }],
  leave: [{ _id: false, from: String, through: String, reason: String }],
  revision: { type: Number, default: 0 }, updatedBy: ref('User', true),
}, options)
export const DoctorSchedule = mongoose.model('DoctorSchedule', scheduleSchema)
const serviceSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, name: { type: String, required: true },
  category: { type: String, enum: ['consultation', 'laboratory', 'imaging', 'diagnostic', 'procedure'], required: true },
  priceCentavos: { type: Number, required: true, min: 0 }, provider: String,
  external: { type: Boolean, default: false }, preparation: String, active: { type: Boolean, default: true }, updatedBy: ref('User', true),
}, options)
export const ClinicService = mongoose.model('ClinicService', serviceSchema)
const reportSchema = new mongoose.Schema({ name: String, mime: String, bytes: { type: Buffer, select: false }, provider: String, reportDate: String, uploadedAt: { type: Date, default: Date.now }, actor })
export const DiagnosticReport = mongoose.model('DiagnosticReport', reportSchema)
const diagnosticSchema = new mongoose.Schema({
  encounterId: ref('Encounter', true), patientId: ref('Patient', true), doctorId: ref('Doctor'),
  serviceId: ref('ClinicService', true), serviceName: String, category: String, priceCentavos: Number, external: Boolean, provider: String,
  stage: { type: String, enum: ['requested', 'scheduled', 'performed', 'result_available', 'reviewed', 'cancelled'], default: 'requested' },
  scheduledAt: Date, reports: [ref('DiagnosticReport')], reviewNote: String,
  history: [{ _id: false, action: String, note: String, at: Date, actor }],
  requestId: { type: String, required: true, unique: true }, requestDigest: String, createdBy: ref('User', true),
  repeatOf: ref('DiagnosticOrder'), repeatReason: { type: String, maxlength: 500, default: '' },
}, options)
diagnosticSchema.index({ encounterId: 1, createdAt: -1 })
diagnosticSchema.index({ patientId: 1, serviceId: 1, stage: 1, createdAt: -1 })
export const DiagnosticOrder = mongoose.model('DiagnosticOrder', diagnosticSchema)
const lineSchema = new mongoose.Schema({
  sourceKey: String, description: String, quantity: Number, unitCentavos: Number,
  voided: { type: Boolean, default: false }, voidReason: String, actor,
})
const paymentSchema = new mongoose.Schema({
  requestId: String, amountCentavos: Number, method: String, reference: String,
  refund: { type: Boolean, default: false }, reason: String, at: { type: Date, default: Date.now }, actor,
})
const invoiceSchema = new mongoose.Schema({
  encounterId: { ...ref('Encounter', true), unique: true }, patientId: ref('Patient', true),
  lines: { type: [lineSchema], default: [] }, payments: { type: [paymentSchema], default: [] },
}, options)
export const Invoice = mongoose.model('Invoice', invoiceSchema)
const invitationSchema = new mongoose.Schema({
  email: { type: String, required: true }, tokenHash: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'staff', 'doctor'], required: true }, permissions: [String], doctorId: ref('Doctor'),
  expiresAt: Date, usedAt: Date, revokedAt: Date, createdBy: ref('User', true),
}, options)
export const Invitation = mongoose.model('Invitation', invitationSchema)
export const AuditEvent = mongoose.model('AuditEvent', new mongoose.Schema({ action: String, target: String, actor, at: { type: Date, default: Date.now }, detail: String }))
