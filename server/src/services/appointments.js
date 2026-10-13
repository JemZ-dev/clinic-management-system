import mongoose from 'mongoose'
import { reserveSchedule } from './workflow.js'
import { Encounter } from '../models/Encounter.js'
import { Appointment } from '../models/Appointment.js'
import { Patient } from '../models/Patient.js'
import { Doctor } from '../models/Doctor.js'
import { HttpError } from '../utils/errors.js'
import { appointmentStart, clinicDate, SLOT_MS } from '../utils/clinicTime.js'

const transitions = {
  scheduled: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['completed', 'cancelled'],
  completed: [], cancelled: [], no_show: [],
}
const populate = (query) => query.populate('patientId', 'name patientId archivedAt').populate('doctorId', 'name specialty archivedAt')

export function publicAppointment(document, summary = false) {
  const value = document.toObject()
  const patient = value.patientId
  const doctor = value.doctorId
  return {
    id: value._id.toString(), version: value.__v,
    patientId: patient?._id.toString() || null, doctorId: doctor?._id.toString() || null,
    patient: patient ? { id: patient._id.toString(), name: patient.name, patientId: patient.patientId, archivedAt: patient.archivedAt } : null,
    doctor: doctor ? { id: doctor._id.toString(), name: doctor.name, specialty: doctor.specialty, archivedAt: doctor.archivedAt } : null,
    startsAt: value.startsAt, endsAt: value.endsAt, status: value.status,
    ...(!summary ? {
      reason: value.reason, editable: value.status === 'scheduled', visitId: value.visitId?.toString() || null,
      availableTransitions: transitions[value.status].filter((status) => {
        try { validateTransition(value, status); return true } catch { return false }
      }),
      statusHistory: value.statusHistory.map(({ status, at, note }) => ({ status, at, note })),
    } : {}),
    createdAt: value.createdAt, updatedAt: value.updatedAt,
  }
}

export async function getAppointment(id) {
  const appointment = await populate(Appointment.findById(id))
  if (!appointment) throw new HttpError(404, 'This appointment could not be found.')
  return appointment
}

async function bookingDetails(data, now) {
  const startsAt = appointmentStart(data.date, data.time)
  if (startsAt.valueOf() <= now.valueOf()) throw new HttpError(400, 'Choose an appointment time in the future.', { date: 'Choose a future date and time.' })
  const [patient, doctor] = await Promise.all([Patient.findById(data.patientId).select('archivedAt'), Doctor.findById(data.doctorId).select('archivedAt')])
  const fields = {}
  if (!patient || patient.archivedAt) fields.patientId = 'Choose an active patient.'
  if (!doctor || doctor.archivedAt) fields.doctorId = 'Choose an active doctor.'
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the selected patient and doctor.', fields)
  return { patientId: data.patientId, doctorId: data.doctorId, startsAt, endsAt: new Date(startsAt.valueOf() + SLOT_MS), reason: data.reason }
}

function slotError(error) {
  if (error.code === 11000 && error.keyPattern?.doctorId) throw new HttpError(409, 'This doctor is already booked for that time. Choose another time or doctor.', { time: 'This doctor is already booked for this slot.' })
  throw error
}

export async function createAppointment(data, userId, now = new Date()) {
  const details = await bookingDetails(data, now)
  try {
    let appointment
    await mongoose.connection.transaction(async (session) => {
      await reserveSchedule(data.doctorId, data.date, data.time, session)
      ;[appointment] = await Appointment.create([{ ...details, status: 'scheduled', createdBy: userId, updatedBy: userId, statusHistory: [{ status: 'scheduled', at: now, by: userId }] }], { session })
      if (data.followUpEncounterId) {
        const linked = await Encounter.updateOne({ _id: data.followUpEncounterId, stage: 'finished', patientId: data.patientId, doctorId: data.doctorId, followUpAppointmentId: null }, { $set: { followUpAppointmentId: appointment.id }, $inc: { __v: 1 } }, { session })
        if (!linked.modifiedCount) throw new HttpError(409, 'This encounter already has a follow-up or its patient and doctor do not match.')
      }
    })
    return publicAppointment(await getAppointment(appointment.id))
  } catch (error) { slotError(error) }
}

export async function updateAppointment(id, data, userId, now = new Date()) {
  const existing = await getAppointment(id)
  if (existing.__v !== data.version) throw new HttpError(409, 'This appointment changed. Open the latest appointment before saving again.')
  if (existing.status !== 'scheduled') throw new HttpError(409, 'Only scheduled appointments can be rescheduled or edited.')
  const details = await bookingDetails(data, now)
  try {
    await mongoose.connection.transaction(async (session) => {
      await reserveSchedule(data.doctorId, data.date, data.time, session)
      const result = await Appointment.findOneAndUpdate({ _id: id, __v: data.version, status: 'scheduled' }, {
        $set: { ...details, updatedBy: userId }, $inc: { __v: 1 },
      }, { session, returnDocument: 'after', runValidators: true })
      if (!result) throw new HttpError(409, 'This appointment changed. Open the latest appointment before saving again.')
    })
    return publicAppointment(await getAppointment(id))
  } catch (error) { slotError(error) }
}

export function validateTransition(appointment, status, now = new Date()) {
  if (!transitions[appointment.status]?.includes(status)) throw new HttpError(409, 'This status change is not allowed. Open the latest appointment.')
  if (status === 'completed' && !appointment.visitId) throw new HttpError(409, 'Save a visit record before completing this appointment.')
  if (status === 'checked_in' && clinicDate(appointment.startsAt) !== clinicDate(now)) throw new HttpError(400, 'Check-in is available only on the appointment day (Manila time).')
  if (status === 'no_show' && appointment.startsAt.valueOf() > now.valueOf()) throw new HttpError(400, 'Mark no-show only after the appointment start time.')
}

export async function changeAppointmentStatus(id, data, userId, now = new Date()) {
  const existing = await getAppointment(id)
  if (existing.__v !== data.version) throw new HttpError(409, 'This appointment changed. Reload it before updating the status.')
  if (await Encounter.exists({ appointmentId: id })) throw new HttpError(409, 'Manage this patient from the encounter queue. Consultation completion and departures update the appointment automatically.')
  validateTransition(existing, data.status, now)
  const result = await Appointment.findOneAndUpdate({ _id: id, __v: data.version, status: existing.status }, {
    $set: { status: data.status, updatedBy: userId }, $inc: { __v: 1 },
    $push: { statusHistory: { status: data.status, at: now, by: userId, note: data.note } },
  }, { returnDocument: 'after', runValidators: true })
  if (!result) throw new HttpError(409, 'This appointment changed. Reload it before updating the status.')
  return publicAppointment(await getAppointment(id))
}

export const appointmentQuery = populate
