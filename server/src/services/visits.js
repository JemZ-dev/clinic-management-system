import mongoose from 'mongoose'
import { createHash } from 'node:crypto'
import { Encounter } from '../models/Encounter.js'
import { Visit } from '../models/Visit.js'
import { Patient } from '../models/Patient.js'
import { Doctor } from '../models/Doctor.js'
import { Appointment } from '../models/Appointment.js'
import { Medicine } from '../models/Medicine.js'
import { medicineSnapshot } from './medicines.js'
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
      prescriptions: (value.prescriptions || []).map((line) => ({ id: line._id.toString(), medicineId: line.medicineId.toString(), medicine: line.medicine, quantity: line.quantity, instructions: line.instructions, dispensedQuantity: line.dispensedQuantity, remainingQuantity: line.quantity - line.dispensedQuantity })),
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

export async function createVisit(data, user, outerSession = null) {
  const { requestId, appointmentVersion, appointmentId, prescriptions, ...fields } = data
  // Omit an empty catalog list from the digest so earlier text-only save retries remain valid.
  const digest = createHash('sha256').update(JSON.stringify({ ...fields, ...(prescriptions.length ? { prescriptions } : {}), appointmentId: appointmentId || null })).digest('hex')
  if (!outerSession && appointmentId && await Encounter.exists({ appointmentId })) throw new HttpError(409, 'Save and finalize the consultation from its encounter.')
  const existing = await Visit.findOne({ requestId }).session(outerSession)
  if (existing) return retryResult(existing, digest, user.id)
  let saved
  try {
    const write = async (session) => {
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
      const savedPrescriptions = []
      for (const [index, line] of prescriptions.entries()) {
        const medicine = await Medicine.findOneAndUpdate({ _id: line.medicineId, archivedAt: null, productKey: line.productKey }, { $set: { identityLocked: true, updatedBy: user.id }, $inc: { __v: 1 } }, { session, returnDocument: 'after' })
        if (!medicine) throw new HttpError(400, 'A selected medicine changed or is archived. Re-select it before saving.', { [`prescriptions.${index}.medicineId`]: 'Choose the current active catalog product.' })
        savedPrescriptions.push({ medicineId: medicine.id, medicine: medicineSnapshot(medicine), quantity: line.quantity, instructions: line.instructions, dispensedQuantity: 0 })
      }
      const records = await Visit.create([{
        _id: visitId, ...fields, prescriptions: savedPrescriptions, appointmentId: appointmentId || null,
        patientSnapshot: { name: patient.name, patientId: patient.patientId }, doctorSnapshot: { name: doctor.name, specialty: doctor.specialty },
        author: { id: user.id, name: user.name }, createdBy: user.id, requestId, requestDigest: digest,
      }], { session })
      saved = records[0]
    }
    if (outerSession) await write(outerSession)
    else await mongoose.connection.transaction(write)
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
