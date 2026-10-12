import mongoose from 'mongoose'
import { createHash } from 'node:crypto'
import { Medicine } from '../models/Medicine.js'
import { StockMovement } from '../models/StockMovement.js'
import { Visit } from '../models/Visit.js'
import { HttpError } from '../utils/errors.js'
import { medicineSnapshot } from './medicines.js'

export function publicMovement(document) {
  const value = document.toObject()
  return { id: value._id.toString(), medicineId: value.medicineId.toString(), medicine: value.medicineSnapshot,
    type: value.type, quantity: value.quantity, balanceAfter: value.balanceAfter, note: value.note,
    visitId: value.visitId?.toString() || null, prescriptionId: value.prescriptionId?.toString() || null,
    author: { name: value.author.name }, createdAt: value.createdAt }
}
function retryResult(existing, digest, userId) {
  if (existing.requestDigest !== digest || existing.author.id.toString() !== userId) throw new HttpError(409, 'This save was already used for a different stock movement. Reload before starting another movement.')
  return publicMovement(existing)
}
export async function recordStockMovement(medicineId, data, user) {
  const { version, visitVersion, requestId, ...fields } = data
  const digest = createHash('sha256').update(JSON.stringify({ medicineId, ...fields })).digest('hex')
  const existing = await StockMovement.findOne({ requestId })
  if (existing) return retryResult(existing, digest, user.id)
  let saved
  try {
    await mongoose.connection.transaction(async (session) => {
      const medicine = await Medicine.findById(medicineId).session(session)
      if (!medicine) throw new HttpError(404, 'This medicine could not be found.')
      if (medicine.archivedAt) throw new HttpError(409, 'Restore this archived medicine before changing its stock.')
      const change = data.type === 'dispense' ? -data.quantity : data.quantity
      if (medicine.quantity + change < 0) throw new HttpError(409, 'There is not enough stock for this movement.', { quantity: `Only ${medicine.quantity} ${medicine.stockUnit} available. Reload to check the current balance.` })
      if (medicine.quantity + change > 1000000000) throw new HttpError(400, 'This movement exceeds the supported stock balance.', { quantity: 'The resulting balance must not exceed 1,000,000,000 stock units.' })
      if (data.type === 'dispense') {
        const visit = await Visit.findById(data.visitId).session(session)
        if (!visit) throw new HttpError(404, 'The linked visit could not be found.')
        if (visit.__v !== visitVersion) throw new HttpError(409, 'This visit changed. Reload and review the latest prescription and corrections before dispensing.')
        const line = visit.prescriptions.id(data.prescriptionId)
        if (!line || line.medicineId.toString() !== medicineId) throw new HttpError(400, 'Select the medicine recorded in this prescription.', { prescriptionId: 'This prescription line does not match the medicine.' })
        if (line.dispensedQuantity + data.quantity > line.quantity) throw new HttpError(409, 'This quantity exceeds the remaining prescription.', { quantity: `Only ${line.quantity - line.dispensedQuantity} ${line.medicine.stockUnit} remain prescribed.` })
        const updated = await Visit.updateOne({ _id: data.visitId, __v: visit.__v, prescriptions: { $elemMatch: { _id: data.prescriptionId, dispensedQuantity: { $lte: line.quantity - data.quantity } } } }, { $inc: { 'prescriptions.$.dispensedQuantity': data.quantity, __v: 1 } }, { session })
        if (!updated.modifiedCount) throw new HttpError(409, 'This prescription changed. Reload the visit before dispensing again.')
      }
      const updated = await Medicine.findOneAndUpdate({ _id: medicineId, __v: version, archivedAt: null, quantity: { $gte: Math.max(0, -change), $lte: Math.min(1000000000, 1000000000 - change) } }, { $inc: { quantity: change, __v: 1 }, $set: { identityLocked: true, updatedBy: user.id } }, { session, returnDocument: 'after', runValidators: true })
      if (!updated) throw new HttpError(409, 'This medicine changed. Reload its current stock before saving again.')
      const records = await StockMovement.create([{ medicineId, medicineSnapshot: medicineSnapshot(medicine), type: data.type,
        quantity: change, balanceAfter: updated.quantity, note: data.note, visitId: data.visitId || null, prescriptionId: data.prescriptionId || null,
        author: { id: user.id, name: user.name }, requestId, requestDigest: digest }], { session })
      saved = records[0]
    })
    return publicMovement(saved)
  } catch (error) {
    if (error.status === 409 || error.code === 11000) {
      const retry = await StockMovement.findOne({ requestId })
      if (retry) return retryResult(retry, digest, user.id)
    }
    throw error
  }
}
