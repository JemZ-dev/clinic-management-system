import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { requireStaff } from '../middleware/requireStaff.js'
import { Visit } from '../models/Visit.js'
import { validate } from '../validators/auth.js'
import { recordIdSchema } from '../validators/records.js'
import { visitSchema, addendumSchema, visitListSchema } from '../validators/visits.js'
import { createVisit, getVisit, publicVisit, addVisitAddendum } from '../services/visits.js'

export function visitRoutes(authService) {
  const router = Router()
  router.use(authenticate(authService), requireStaff)
  router.get('/', async (request, response) => {
    const { q, patientId, doctorId, page, limit } = validate(visitListSchema, request.query)
    const filter = { ...(patientId ? { patientId } : {}), ...(doctorId ? { doctorId } : {}) }
    if (q) {
      const pattern = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      filter.$or = ['patientSnapshot.name', 'patientSnapshot.patientId', 'doctorSnapshot.name'].map((field) => ({ [field]: pattern }))
    }
    const total = await Visit.countDocuments(filter)
    const pages = Math.max(1, Math.ceil(total / limit))
    const currentPage = Math.min(page, pages)
    const records = await Visit.find(filter).select('patientId doctorId appointmentId patientSnapshot doctorSnapshot date createdAt updatedAt __v').sort({ date: -1, _id: -1 }).skip((currentPage - 1) * limit).limit(limit)
    response.json({ records: records.map((record) => publicVisit(record, true)), pagination: { page: currentPage, pages, limit, total } })
  })
  router.post('/', async (request, response) => response.status(201).json({ record: await createVisit(validate(visitSchema, request.body), request.auth.user) }))
  router.get('/:id', async (request, response) => {
    validate(recordIdSchema, request.params.id)
    response.json({ record: publicVisit(await getVisit(request.params.id)) })
  })
  router.post('/:id/addenda', async (request, response) => {
    validate(recordIdSchema, request.params.id)
    response.json({ record: await addVisitAddendum(request.params.id, validate(addendumSchema, request.body), request.auth.user) })
  })
  return router
}
