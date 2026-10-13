import { randomUUID } from 'node:crypto'
import { createEncounter } from '../services/workflow.js'
import { assertAssigned } from '../middleware/permissions.js'
import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { requireStaff } from '../middleware/requireStaff.js'
import { Appointment } from '../models/Appointment.js'
import { Patient } from '../models/Patient.js'
import { Doctor } from '../models/Doctor.js'
import { validate } from '../validators/auth.js'
import { recordIdSchema } from '../validators/records.js'
import { appointmentSchema, appointmentUpdateSchema, appointmentStatusSchema, appointmentListSchema } from '../validators/appointments.js'
import { appointmentQuery, publicAppointment, getAppointment, createAppointment, updateAppointment, changeAppointmentStatus } from '../services/appointments.js'
import { clinicDayRange } from '../utils/clinicTime.js'

export function appointmentRoutes(authService) {
  const router = Router()
  router.use(authenticate(authService), requireStaff)
  router.get('/', async (request, response) => {
    const { q, status, date, patientId, doctorId, page, limit } = validate(appointmentListSchema, request.query)
    const filter = {}
    if (status !== 'all') filter.status = status
    if (patientId) filter.patientId = patientId
    if (doctorId) filter.doctorId = doctorId
    if (request.auth.user.role === 'doctor') filter.doctorId = request.auth.user.doctorId || null
    if (date) { const { start, end } = clinicDayRange(date); filter.startsAt = { $gte: start, $lt: end } }
    if (q) {
      const pattern = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      const [patients, doctors] = await Promise.all([Patient.find({ $or: [{ name: pattern }, { patientId: pattern }] }).distinct('_id'), Doctor.find({ $or: [{ name: pattern }, { specialty: pattern }] }).distinct('_id')])
      filter.$or = [{ patientId: { $in: patients } }, { doctorId: { $in: doctors } }]
    }
    const total = await Appointment.countDocuments(filter)
    const pages = Math.max(1, Math.ceil(total / limit))
    const currentPage = Math.min(page, pages)
    const records = await appointmentQuery(Appointment.find(filter).sort({ startsAt: 1, _id: 1 }).skip((currentPage - 1) * limit).limit(limit))
    response.json({ records: records.map((record) => publicAppointment(record, true)), pagination: { page: currentPage, pages, limit, total } })
  })
  router.post('/', async (request, response) => response.status(201).json({ record: await createAppointment(validate(appointmentSchema, request.body), request.auth.user.id) }))
  router.get('/:id', async (request, response) => {
    validate(recordIdSchema, request.params.id)
    const record = await getAppointment(request.params.id)
    assertAssigned(request.auth.user, record.doctorId?._id)
    response.json({ record: publicAppointment(record) })
  })
  router.patch('/:id', async (request, response) => {
    validate(recordIdSchema, request.params.id)
    response.json({ record: await updateAppointment(request.params.id, validate(appointmentUpdateSchema, request.body), request.auth.user.id) })
  })
  router.patch('/:id/status', async (request, response) => {
    validate(recordIdSchema, request.params.id)
    const input = validate(appointmentStatusSchema, request.body)
    if (input.status === 'checked_in') {
      const appointment = await getAppointment(request.params.id)
      await createEncounter({ requestId: randomUUID(), kind: 'appointment', appointmentId: appointment.id, appointmentVersion: input.version, patientId: String(appointment.patientId._id), doctorId: String(appointment.doctorId._id), reason: appointment.reason || 'Clinic consultation', externalClinician: '' }, request.auth.user)
      return response.json({ record: publicAppointment(await getAppointment(request.params.id)) })
    }
    response.json({ record: await changeAppointmentStatus(request.params.id, input, request.auth.user.id) })
  })
  return router
}
