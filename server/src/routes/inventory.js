import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { requireStaff } from '../middleware/requireStaff.js'
import { StockMovement } from '../models/StockMovement.js'
import { validate } from '../validators/auth.js'
import { movementListSchema } from '../validators/medicines.js'
import { publicMovement } from '../services/inventory.js'

export function inventoryRoutes(authService) {
  const router = Router()
  router.use(authenticate(authService), requireStaff)
  router.get('/', async (request, response) => {
    const { q, type, medicineId, visitId, page, limit } = validate(movementListSchema, request.query)
    const filter = { ...(type !== 'all' ? { type } : {}), ...(medicineId ? { medicineId } : {}), ...(visitId ? { visitId } : {}) }
    if (q) {
      const pattern = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      filter.$or = ['medicineSnapshot.genericName', 'medicineSnapshot.brandName'].map((field) => ({ [field]: pattern }))
    }
    const total = await StockMovement.countDocuments(filter)
    const pages = Math.max(1, Math.ceil(total / limit)), currentPage = Math.min(page, pages)
    const records = await StockMovement.find(filter).sort({ createdAt: -1, _id: -1 }).skip((currentPage - 1) * limit).limit(limit)
    response.json({ records: records.map(publicMovement), pagination: { page: currentPage, pages, limit, total } })
  })
  return router
}
