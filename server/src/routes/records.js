import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { requireStaff } from '../middleware/requireStaff.js'
import { Patient } from '../models/Patient.js'
import { Doctor } from '../models/Doctor.js'
import { validate } from '../validators/auth.js'
import { patientSchema, doctorSchema, patientUpdateSchema, doctorUpdateSchema, recordIdSchema, listSchema, versionSchema } from '../validators/records.js'
import { HttpError } from '../utils/errors.js'

function publicRecord(document) {
  const record = document.toObject()
  const result = { ...record, id: record._id.toString(), version: record.__v }
  for (const key of ['_id', '__v', 'createdBy', 'updatedBy']) delete result[key]
  return result
}

// Escape user input so search is literal rather than an executable regular expression.
const escapeSearch = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function recordRoutes(authService, kind) {
  const patient = kind === 'patients'
  const Model = patient ? Patient : Doctor
  const createSchema = patient ? patientSchema : doctorSchema
  const updateSchema = patient ? patientUpdateSchema : doctorUpdateSchema
  const searchFields = patient ? ['name', 'patientId', 'phone', 'email'] : ['name', 'specialty', 'phone', 'email']
  const projection = patient ? 'patientId name dateOfBirth phone email archivedAt createdAt updatedAt __v' : 'name specialty phone email archivedAt createdAt updatedAt __v'
  const router = Router()
  router.use(authenticate(authService), requireStaff)

  async function getRecord(id) {
    validate(recordIdSchema, id)
    const record = await Model.findById(id)
    if (!record) throw new HttpError(404, 'This record could not be found.')
    return record
  }

  router.get('/', async (request, response) => {
    const { q, status, page, limit } = validate(listSchema, request.query)
    const filter = status === 'all' ? {} : { archivedAt: status === 'active' ? null : { $ne: null } }
    if (q) filter.$or = searchFields.map((field) => ({ [field]: { $regex: escapeSearch(q), $options: 'i' } }))
    const total = await Model.countDocuments(filter)
    const pages = Math.max(1, Math.ceil(total / limit))
    const currentPage = Math.min(page, pages)
    const records = await Model.find(filter).select(projection).sort({ name: 1, _id: 1 }).skip((currentPage - 1) * limit).limit(limit)
    response.json({ records: records.map(publicRecord), pagination: { page: currentPage, limit, total, pages } })
  })
  router.post('/', async (request, response) => {
    const data = validate(createSchema, request.body)
    const record = await Model.create({ ...data, createdBy: request.auth.user.id, updatedBy: request.auth.user.id })
    response.status(201).json({ record: publicRecord(record) })
  })
  router.get('/:id', async (request, response) => response.json({ record: publicRecord(await getRecord(request.params.id)) }))

  async function mutate(request, mode) {
    validate(recordIdSchema, request.params.id)
    const { version, ...data } = validate(mode === 'edit' ? updateSchema : versionSchema, request.body)
    const active = mode !== 'restore'
    const changes = mode === 'edit' ? data : { archivedAt: active ? new Date() : null }
    const record = await Model.findOneAndUpdate({
      _id: request.params.id, __v: version, archivedAt: active ? null : { $ne: null },
    }, { $set: { ...changes, updatedBy: request.auth.user.id }, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true })
    if (record) return publicRecord(record)
    const existing = await getRecord(request.params.id)
    if (mode === 'edit' && existing.archivedAt) throw new HttpError(409, 'Restore this archived record before editing it.')
    throw new HttpError(409, 'This record changed since you opened it. Reload the latest record before trying again.')
  }
  router.patch('/:id', async (request, response) => response.json({ record: await mutate(request, 'edit') }))
  router.delete('/:id', async (request, response) => response.json({ record: await mutate(request, 'archive') }))
  router.post('/:id/restore', async (request, response) => response.json({ record: await mutate(request, 'restore') }))
  return router
}
