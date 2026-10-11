import mongoose from 'mongoose'

const historySchema = new mongoose.Schema({
  status: { type: String, enum: ['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'], required: true },
  at: { type: Date, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, maxlength: 500, default: '' },
}, { _id: false })
const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
  status: { type: String, enum: ['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'], default: 'scheduled', required: true },
  statusHistory: { type: [historySchema], required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, optimisticConcurrency: true })
// All bookings have a fixed, aligned 30-minute duration. Equal starts are the only
// possible overlap; a unique index also protects concurrent creates/reschedules.
schema.index({ doctorId: 1, startsAt: 1 }, {
  name: 'doctor_active_slot', unique: true,
  partialFilterExpression: { status: { $in: ['scheduled', 'checked_in'] } },
})
schema.index({ startsAt: 1, _id: 1 })
schema.index({ patientId: 1, startsAt: 1 })
export const Appointment = mongoose.model('Appointment', schema)
