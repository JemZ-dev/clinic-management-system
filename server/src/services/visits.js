import mongoose from 'mongoose'
import { createHash } from 'node:crypto'
import { Visit } from '../models/Visit.js'
import { Patient } from '../models/Patient.js'
import { Doctor } from '../models/Doctor.js'
import { Appointment } from '../models/Appointment.js'
import { HttpError } from '../utils/errors.js'
import { clinicDate } from '../utils/clinicTime.js'

export function publicVisit(document, summary = false) {
  const value = document.toObject()
  return {
    id: value._id.toString(), version: value.__v,
    patientId: value.patientId.toString(), doctorId: value.doctorId.toString(), appointmentId: value.appointmentId?.toString() || null,
    patient: value.patientSnapshot, doctor: value.doctorSnapshot, date: value.date,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
    ...(!summary ? {
      reason: value.reason, diagnosis: value.diagnosis, notes: value.notes, treatment: value.treatment,
      prescribedMedicines: value.prescribedMedicines, followUp: value.followUp,
      author: { name: value.author.name },
      addenda: value.addenda.map(({ text, at, author }) => ({ text, at, author: { name: author.name } })),
      canAddAddendum: value.addenda.length < 20,
    } : {}),
  }
}
export async function getVisit(id) {
  const visit = await Visit.findById(id)
  if (!visit) throw new HttpError(404, 'This visit could not be found.')
  return visit
}
function retryResult(existing, digest, userId) {
  if (existing.requestDigest !== digest || existing.createdBy.toString() !== userId) throw new HttpError(409, 'This save was already used for a different visit. Start a new visit before saving changed entries.')
  return publicVisit(existing)
}

export async function createVisit(data, user) {
  const { requestId, appointmentVersion, appointmentId, ...fields } = data
  const digest = createHash('sha256').update(JSON.stringify({ ...fields, appointmentId: appointmentId || null })).digest('hex')
  const existing = await Visit.findOne({ requestId })
  if (existing) return retryResult(existing, digest, user.id)
  let saved
  try {
    await mongoose.connection.transaction(async (session) => {
      const patient = await Patient.findById(data.patientId).session(session)
      const doctor = await Doctor.findById(data.doctorId).session(session)
      const errors = {}
      if (!patient || patient.archivedAt) errors.patientId = 'Choose an active patient. Restore archived records before adding a visit.'
      if (!doctor || doctor.archivedAt) errors.doctorId = 'Choose an active doctor. Restore archived records before adding a visit.'
      if (patient && data.date < patient.dateOfBirth) errors.date = 'The visit date cannot be before the patient’s birth date.'
      if (Object.keys(errors).length) throw new HttpError(400, 'Please check the visit details.', errors)
      const visitId = new mongoose.Types.ObjectId()
      if (appointmentId) {
        const appointment = await Appointment.findById(appointmentId).session(session)
        if (!appointment) throw new HttpError(404, 'This appointment could not be found.')
        if (appointment.patientId.toString() !== data.patientId || appointment.doctorId.toString() !== data.doctorId) throw new HttpError(400, 'Use the patient and doctor assigned to this appointment.', { appointmentId: 'The selected records do not match this appointment.' })
        if (data.date < clinicDate(appointment.startsAt)) throw new HttpError(400, 'The visit cannot precede the appointment day.', { date: 'Choose the appointment day or a later date through today.' })
        const linked = await Appointment.findOneAndUpdate({ _id: appointmentId, __v: appointmentVersion, status: 'checked_in', visitId: null }, { $set: { visitId, updatedBy: user.id }, $inc: { __v: 1 } }, { session, returnDocument: 'after' })
        if (!linked) throw new HttpError(409, 'This appointment changed or already has a visit. Reload the appointment before continuing.')
      }
      const records = await Visit.create([{
        _id: visitId, ...fields, appointmentId: appointmentId || null,
        patientSnapshot: { name: patient.name, patientId: patient.patientId }, doctorSnapshot: { name: doctor.name, specialty: doctor.specialty },
        author: { id: user.id, name: user.name }, createdBy: user.id, requestId, requestDigest: digest,
      }], { session })
      saved = records[0]
    })
    return publicVisit(saved)
  } catch (error) {
    if (error.status === 409) {
      const retry = await Visit.findOne({ requestId })
      if (retry) return retryResult(retry, digest, user.id)
    }
    if (error.code === 11000) {
      const retry = await Visit.findOne({ requestId })
      if (retry) return retryResult(retry, digest, user.id)
      throw new HttpError(409, 'This appointment already has a saved visit. Open the appointment to view it.')
    }
    throw error
  }
}

export async function addVisitAddendum(id, data, user) {
  const existing = await getVisit(id)
  const retry = existing.addenda.find((entry) => entry.requestId === data.requestId)
  if (retry) {
    if (retry.text !== data.text || retry.author.id.toString() !== user.id) throw new HttpError(409, 'This save was already used for a different correction. Reload the visit.')
    return publicVisit(existing)
  }
  const result = await Visit.findOneAndUpdate({ _id: id, __v: data.version, 'addenda.19': { $exists: false } }, {
    $push: { addenda: { requestId: data.requestId, text: data.text, at: new Date(), author: { id: user.id, name: user.name } } }, $inc: { __v: 1 },
  }, { returnDocument: 'after', runValidators: true })
  if (!result) {
    const latest = await getVisit(id)
    const saved = latest.addenda.find((entry) => entry.requestId === data.requestId)
    if (saved && saved.text === data.text && saved.author.id.toString() === user.id) return publicVisit(latest)
    throw new HttpError(409, 'This visit changed or reached its correction limit. Reload the latest visit before continuing.')
  }
  return publicVisit(result)
}
