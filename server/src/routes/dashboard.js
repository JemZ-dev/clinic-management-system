import { Router } from 'express'
import mongoose from 'mongoose'
import { authenticate } from '../middleware/authenticate.js'
import { requireStaff } from '../middleware/requireStaff.js'
import { assignedPatients } from '../middleware/permissions.js'
import { Patient } from '../models/Patient.js'
import { Doctor } from '../models/Doctor.js'
import { Appointment } from '../models/Appointment.js'
import { Medicine } from '../models/Medicine.js'
import { publicMedicine } from '../services/medicines.js'
import { appointmentQuery, publicAppointment } from '../services/appointments.js'
import { clinicDate, clinicDayRange, CLINIC_TIME_ZONE } from '../utils/clinicTime.js'

export function dashboardRoutes(authService) {
  const router = Router()
  router.use(authenticate(authService), requireStaff)
  router.get('/', async (request, response) => {
    const doctorScope = request.auth.user.role === 'doctor' ? { doctorId: request.auth.user.doctorId ? new mongoose.Types.ObjectId(request.auth.user.doctorId) : null } : {}
    const patientIds = await assignedPatients(request.auth.user)
    const date = clinicDate()
    const { start, end } = clinicDayRange(date)
    const today = { ...doctorScope, startsAt: { $gte: start, $lt: end } }
    const lowStockFilter = { archivedAt: null, $expr: { $lte: ['$quantity', '$lowStockThreshold'] } }
    const [patients, doctors, grouped, waiting, next, lowStockCount, lowStockMedicines] = await Promise.all([
      Patient.countDocuments({ archivedAt: null, ...(patientIds ? { _id: { $in: patientIds } } : {}) }), Doctor.countDocuments({ archivedAt: null }),
      Appointment.aggregate([{ $match: today }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Appointment.countDocuments({ ...doctorScope, status: 'checked_in' }),
      appointmentQuery(Appointment.find({ ...today, status: { $in: ['scheduled', 'checked_in'] } }).sort({ startsAt: 1, _id: 1 }).limit(8)),
      Medicine.countDocuments(lowStockFilter), Medicine.find(lowStockFilter).sort({ quantity: 1, genericName: 1, _id: 1 }).limit(5),
    ])
    const statuses = Object.fromEntries(['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'].map((status) => [status, 0]))
    for (const item of grouped) statuses[item._id] = item.count
    response.json({ date, timeZone: CLINIC_TIME_ZONE, patients, doctors, waiting, statuses, todayTotal: Object.values(statuses).reduce((sum, count) => sum + count, 0), appointments: next.map((record) => publicAppointment(record, true)), lowStockCount, lowStockMedicines: lowStockMedicines.map(publicMedicine) })
  })
  return router
}
