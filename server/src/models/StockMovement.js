import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineSnapshot: {
    genericName: { type: String, required: true }, brandName: { type: String, default: '' },
    strength: { type: String, required: true }, dosageForm: { type: String, required: true }, stockUnit: { type: String, required: true },
  },
  type: { type: String, enum: ['receipt', 'adjustment', 'dispense'], required: true },
  quantity: { type: Number, required: true }, balanceAfter: { type: Number, min: 0, required: true },
  note: { type: String, maxlength: 500, default: '' },
  visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null }, prescriptionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  author: { id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, name: { type: String, required: true } },
  requestId: { type: String, required: true }, requestDigest: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } })
schema.index({ requestId: 1 }, { unique: true })
schema.index({ medicineId: 1, createdAt: -1, _id: -1 })
schema.index({ visitId: 1, prescriptionId: 1 })
schema.index({ createdAt: -1, _id: -1 })
export const StockMovement = mongoose.model('StockMovement', schema)
