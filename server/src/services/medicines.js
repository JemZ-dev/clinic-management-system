import { createHash } from 'node:crypto'
import { Medicine } from '../models/Medicine.js'
import { HttpError } from '../utils/errors.js'

export const IDENTITY_FIELDS = ['genericName', 'brandName', 'strength', 'dosageForm', 'stockUnit']
export function medicineSnapshot(record) { return Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, record[field]])) }
export function productKey(data) {
  return createHash('sha256').update(JSON.stringify(IDENTITY_FIELDS.map((field) => data[field].normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()))).digest('hex')
}
export function publicMedicine(document) {
  const value = document.toObject()
  return { id: value._id.toString(), version: value.__v, ...medicineSnapshot(value), notes: value.notes,
    quantity: value.quantity, lowStockThreshold: value.lowStockThreshold, lowStock: value.quantity <= value.lowStockThreshold,
    identityLocked: value.identityLocked, productKey: value.productKey, archivedAt: value.archivedAt, createdAt: value.createdAt, updatedAt: value.updatedAt }
}
export async function getMedicine(id) {
  const record = await Medicine.findById(id)
  if (!record) throw new HttpError(404, 'This medicine could not be found.')
  return record
}
function duplicate(error) {
  if (error.code === 11000) throw new HttpError(409, 'This product is already in the catalog. Search the existing records, including archived products.', { genericName: 'A product with these details already exists.' })
  throw error
}
export async function createMedicine(data, userId) {
  try { return publicMedicine(await Medicine.create({ ...data, productKey: productKey(data), createdBy: userId, updatedBy: userId })) }
  catch (error) { duplicate(error) }
}
export async function updateMedicine(id, data, userId) {
  const existing = await getMedicine(id)
  if (existing.archivedAt || existing.__v !== data.version) throw new HttpError(409, 'This medicine changed or is archived. Reload the latest record before editing.')
  if (existing.identityLocked && IDENTITY_FIELDS.some((field) => existing[field] !== data[field])) throw new HttpError(409, 'Product identity and stock units are fixed once used. Add a separate catalog entry for a different product.')
  const { version, ...fields } = data
  try {
    const record = await Medicine.findOneAndUpdate({ _id: id, __v: version, archivedAt: null }, { $set: { ...fields, productKey: productKey(fields), updatedBy: userId }, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true })
    if (!record) throw new HttpError(409, 'This medicine changed. Reload it before saving again.')
    return publicMedicine(record)
  } catch (error) { duplicate(error) }
}
