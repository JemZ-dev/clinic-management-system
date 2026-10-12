import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { requireStaff } from '../middleware/requireStaff.js'
import { Medicine } from '../models/Medicine.js'
import { validate } from '../validators/auth.js'
import { recordIdSchema, versionSchema } from '../validators/records.js'
import { medicineSchema, medicineUpdateSchema, medicineListSchema, stockMovementSchema } from '../validators/medicines.js'
import { getMedicine, publicMedicine, createMedicine, updateMedicine } from '../services/medicines.js'
import { recordStockMovement } from '../services/inventory.js'
import { HttpError } from '../utils/errors.js'

export function medicineRoutes(authService) {
  const router = Router()
  router.use(authenticate(authService), requireStaff)
  router.get('/', async (request, response) => {
    const { q, status, stock, page, limit } = validate(medicineListSchema, request.query)
    const filter = status === 'all' ? {} : { archivedAt: status === 'active' ? null : { $ne: null } }
    if (stock === 'low') filter.$expr = { $lte: ['$quantity', '$lowStockThreshold'] }
    if (stock === 'available') filter.quantity = { $gt: 0 }
    if (stock === 'out') filter.quantity = 0
    if (q) {
      const pattern = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      filter.$or = ['genericName', 'brandName', 'strength', 'dosageForm'].map((field) => ({ [field]: pattern }))
    }
    const total = await Medicine.countDocuments(filter)
    const pages = Math.max(1, Math.ceil(total / limit)), currentPage = Math.min(page, pages)
    const records = await Medicine.find(filter).sort({ genericName: 1, _id: 1 }).skip((currentPage - 1) * limit).limit(limit)
    response.json({ records: records.map(publicMedicine), pagination: { page: currentPage, pages, limit, total } })
  })
  router.post('/', async (request, response) => response.status(201).json({ record: await createMedicine(validate(medicineSchema, request.body), request.auth.user.id) }))
  router.get('/:id', async (request, response) => { validate(recordIdSchema, request.params.id); response.json({ record: publicMedicine(await getMedicine(request.params.id)) }) })
  router.patch('/:id', async (request, response) => { validate(recordIdSchema, request.params.id); response.json({ record: await updateMedicine(request.params.id, validate(medicineUpdateSchema, request.body), request.auth.user.id) }) })
  async function archive(request, restore = false) {
    validate(recordIdSchema, request.params.id)
    const { version } = validate(versionSchema, request.body)
    await getMedicine(request.params.id)
    const record = await Medicine.findOneAndUpdate({ _id: request.params.id, __v: version, archivedAt: restore ? { $ne: null } : null }, { $set: { archivedAt: restore ? null : new Date(), updatedBy: request.auth.user.id }, $inc: { __v: 1 } }, { returnDocument: 'after' })
    if (!record) throw new HttpError(409, 'This medicine changed. Reload the current record before continuing.')
    return publicMedicine(record)
  }
  router.delete('/:id', async (request, response) => response.json({ record: await archive(request) }))
  router.post('/:id/restore', async (request, response) => response.json({ record: await archive(request, true) }))
  router.post('/:id/movements', async (request, response) => { validate(recordIdSchema, request.params.id); response.status(201).json({ movement: await recordStockMovement(request.params.id, validate(stockMovementSchema, request.body), request.auth.user) }) })
  return router
}
