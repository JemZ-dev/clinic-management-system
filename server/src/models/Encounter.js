import mongoose from 'mongoose'
const ref = (model, required = false) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required })
const actor = { id: ref('User', true), name: String }
const event = new mongoose.Schema({ action: String, note: String, at: { type: Date, default: Date.now }, actor }, { _id: false })
const assessment = new mongoose.Schema({
  weight: Number, height: Number, systolic: Number, diastolic: Number, temperature: Number, pulse: Number, oxygen: Number,
  notMeasuredReason: String, measuredAt: Date, at: { type: Date, default: Date.now }, actor,
}, { _id: false })
const schema = new mongoose.Schema({
  patientId: ref('Patient', true), doctorId: ref('Doctor'), appointmentId: ref('Appointment'), visitId: ref('Visit'),
  patientName: String, patientNumber: String, doctorName: String,
  kind: { type: String, enum: ['appointment', 'walk_in', 'external_test'], required: true },
  stage: { type: String, enum: ['awaiting_assessment', 'waiting', 'in_consultation', 'finished', 'left'], default: 'awaiting_assessment' },
  reason: { type: String, maxlength: 500 }, externalClinician: { type: String, maxlength: 160 },
  arrivedAt: { type: Date, default: Date.now }, priority: { type: Boolean, default: false },
  assessments: { type: [assessment], default: [] },
  draft: { type: mongoose.Schema.Types.Mixed, default: {} },
  followUpDate: { type: String, default: '' }, followUpAppointmentId: ref('Appointment'),
  history: { type: [event], default: [] },
  requestId: { type: String, required: true, unique: true }, requestDigest: String, createdBy: ref('User', true),
}, { timestamps: true, optimisticConcurrency: true })
schema.index({ appointmentId: 1 }, { unique: true, partialFilterExpression: { appointmentId: { $type: 'objectId' } } })
schema.index({ stage: 1, arrivedAt: 1 })
schema.index({ patientId: 1, arrivedAt: -1 })
export const Encounter = mongoose.model('Encounter', schema)
