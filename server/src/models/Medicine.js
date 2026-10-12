import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  genericName: { type: String, required: true, maxlength: 100 }, brandName: { type: String, maxlength: 100, default: '' },
  strength: { type: String, required: true, maxlength: 80 }, dosageForm: { type: String, required: true, maxlength: 80 },
  stockUnit: { type: String, required: true, maxlength: 40 }, notes: { type: String, maxlength: 2000, default: '' },
  lowStockThreshold: { type: Number, min: 0, max: 1000000000, default: 0 },
  quantity: { type: Number, min: 0, max: 1000000000, default: 0 }, identityLocked: { type: Boolean, default: false },
  productKey: { type: String, required: true }, archivedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })
schema.index({ productKey: 1 }, { unique: true })
schema.index({ archivedAt: 1, genericName: 1, _id: 1 })
export const Medicine = mongoose.model('Medicine', schema)
