import mongoose from 'mongoose'
import { randomBytes } from 'node:crypto'

const shortText = (max) => ({ type: String, trim: true, maxlength: max, default: '' })
const schema = new mongoose.Schema({
  patientId: { type: String, required: true, unique: true, immutable: true, default: () => `PT-${randomBytes(6).toString('hex').toUpperCase()}` },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  dateOfBirth: { type: String, required: true },
  phone: shortText(30), email: shortText(254), address: shortText(500),
  emergencyContact: { name: shortText(100), relationship: shortText(80), phone: shortText(30) },
  medicalHistory: { allergies: shortText(2000), conditions: shortText(2000), pastSurgeries: shortText(2000), currentMedications: shortText(2000) },
  archivedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, optimisticConcurrency: true })
schema.index({ archivedAt: 1, name: 1, _id: 1 })
export const Patient = mongoose.model('Patient', schema)
