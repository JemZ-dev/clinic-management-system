import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  specialty: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  email: { type: String, trim: true, maxlength: 254, default: '' },
  archivedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, optimisticConcurrency: true })
schema.index({ archivedAt: 1, name: 1, _id: 1 })
export const Doctor = mongoose.model('Doctor', schema)
