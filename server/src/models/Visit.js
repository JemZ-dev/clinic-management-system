import mongoose from 'mongoose'

const actor = { id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, name: { type: String, required: true, maxlength: 100 } }
const addendum = new mongoose.Schema({
  requestId: { type: String, required: true }, text: { type: String, required: true, maxlength: 2000 },
  at: { type: Date, required: true }, author: actor,
}, { _id: false })
const prescription = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicine: {
    genericName: { type: String, required: true }, brandName: { type: String, default: '' },
    strength: { type: String, required: true }, dosageForm: { type: String, required: true }, stockUnit: { type: String, required: true },
  },
  quantity: { type: Number, required: true, min: 1, max: 1000000 },
  instructions: { type: String, required: true, maxlength: 1000 }, dispensedQuantity: { type: Number, default: 0, min: 0 },
})
const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  patientSnapshot: { name: { type: String, required: true }, patientId: { type: String, required: true } },
  doctorSnapshot: { name: { type: String, required: true }, specialty: { type: String, required: true } },
  date: { type: String, required: true }, reason: { type: String, required: true, maxlength: 500 },
  diagnosis: { type: String, maxlength: 2000, default: '' }, notes: { type: String, maxlength: 4000, default: '' },
  treatment: { type: String, maxlength: 4000, default: '' }, prescribedMedicines: { type: String, maxlength: 2000, default: '' },
  followUp: { type: String, maxlength: 2000, default: '' },
  prescriptions: { type: [prescription], default: [] },
  author: actor, addenda: { type: [addendum], default: [] },
  requestId: { type: String, required: true }, requestDigest: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })
schema.index({ requestId: 1 }, { unique: true })
schema.index({ appointmentId: 1 }, { unique: true, partialFilterExpression: { appointmentId: { $type: 'objectId' } } })
schema.index({ patientId: 1, date: -1, _id: -1 })
schema.index({ date: -1, _id: -1 })
export const Visit = mongoose.model('Visit', schema)
