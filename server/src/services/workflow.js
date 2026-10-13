import mongoose from 'mongoose'
import { createHash } from 'node:crypto'
import { Encounter } from '../models/Encounter.js'
import { Patient } from '../models/Patient.js'
import { Doctor } from '../models/Doctor.js'
import { Medicine } from '../models/Medicine.js'
import { publicMedicine } from './medicines.js'
import { Appointment } from '../models/Appointment.js'
import { DoctorSchedule, Invoice } from '../models/Operations.js'
import { HttpError } from '../utils/errors.js'
import { clinicDate, clinicDayRange } from '../utils/clinicTime.js'
import { can, clinicalAccess } from '../../../shared/permissions.js'
import { assertAssigned } from '../middleware/permissions.js'
import { createVisit } from './visits.js'
import { validate } from '../validators/auth.js'
import { visitSchema } from '../validators/visits.js'

export const actor = (user) => ({ id: user.id, name: user.name })
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function conflict() { throw new HttpError(409, 'This record changed. Reload the latest version before trying again.') }
export function plain(document) { const item = document.toObject(); const { _id, __v, ...rest } = item; return { ...rest, id: String(_id), version: __v } }
export function checkVersion(document, version) { if (document.__v !== version) conflict() }
export async function saveVersion(document, session) {
  try { await document.save({ session }) } catch (error) { if (error.name === 'VersionError' || error.code === 11000) conflict(); throw error }
}
export function event(user, action, note = '') { return { actor: actor(user), action, note, at: new Date() } }
export async function getEncounter(id, user, session = null) {
  const record = await Encounter.findById(id).session(session)
  if (!record) throw new HttpError(404, 'Encounter not found.')
  assertAssigned(user, record.doctorId)
  return record
}
export function publicEncounter(record, user, summary = false) {
  const item = plain(record)
  item.assessmentCount = item.assessments.length
  item.hasDraft = Object.keys(item.draft || {}).length > 0
  if (summary || !clinicalAccess(user)) delete item.assessments
  if (summary || !can(user, 'clinical')) delete item.draft
  if (!clinicalAccess(user)) item.history = item.history.map((entry) => entry.action === 'assessment_recorded' ? { ...entry, note: '' } : entry)
  if (summary) delete item.history
  delete item.requestDigest
  return item
}
export function scheduleAllows(schedule, date, time) {
  if (!schedule) return false
  if (schedule.leave.some((leave) => leave.from <= date && leave.through >= date)) return false
  const day = new Date(`${date}T12:00:00+08:00`).getUTCDay()
  const [hour, minute] = time.split(':').map(Number)
  const end = `${String(Math.floor((hour * 60 + minute + 30) / 60)).padStart(2, '0')}:${String((minute + 30) % 60).padStart(2, '0')}`
  return schedule.weekly.some((slot) => slot.day === day && slot.start <= time && slot.end >= end)
}
// The schedule write serializes bookings against concurrent changes to hours/leave.
export async function reserveSchedule(doctorId, date, time, session) {
  const schedule = await DoctorSchedule.findOne({ doctorId }).session(session)
  if (!scheduleAllows(schedule, date, time)) throw new HttpError(400, 'The doctor is unavailable at this time. Ask the administrator to configure working hours or select another slot.', { time: 'Choose an available 30-minute slot.' })
  await DoctorSchedule.updateOne({ _id: schedule.id }, { $inc: { revision: 1 } }, { session })
}
export async function createEncounter(data, user) {
  const requestDigest = digest(data)
  const retry = await Encounter.findOne({ requestId: data.requestId })
  if (retry) {
    if (retry.requestDigest !== requestDigest || String(retry.createdBy) !== user.id) conflict()
    return retry
  }
  let saved
  try {
    await mongoose.connection.transaction(async (session) => {
      const patient = await Patient.findById(data.patientId).session(session)
      const doctor = data.doctorId ? await Doctor.findById(data.doctorId).session(session) : null
      if (!patient || patient.archivedAt || (data.kind !== 'external_test' && (!doctor || doctor.archivedAt))) throw new HttpError(400, 'Select active patient and doctor records.')
      let appointment
      if (data.kind === 'appointment') {
        appointment = await Appointment.findById(data.appointmentId).session(session)
        if (!appointment || String(appointment.patientId) !== data.patientId || String(appointment.doctorId) !== data.doctorId) throw new HttpError(400, 'The selected records do not match the appointment.')
        checkVersion(appointment, data.appointmentVersion)
        if (!['scheduled', 'checked_in'].includes(appointment.status) || appointment.visitId) throw new HttpError(409, 'Only scheduled or checked-in appointments without a saved visit can check in.')
        if (clinicDate(appointment.startsAt) !== clinicDate()) throw new HttpError(400, 'Check in on the appointment date.')
        const updated = await Appointment.updateOne({ _id: appointment.id, __v: appointment.__v }, { $set: { status: 'checked_in', updatedBy: user.id }, $inc: { __v: 1 }, ...(appointment.status === 'scheduled' ? { $push: { statusHistory: { status: 'checked_in', at: new Date(), by: user.id, note: 'Arrival registered' } } } : {}) }, { session })
        if (!updated.modifiedCount) conflict()
      }
      ;[saved] = await Encounter.create([{ ...data, appointmentVersion: undefined, doctorId: doctor?.id, patientName: patient.name, patientNumber: patient.patientId, doctorName: doctor?.name || '', stage: data.kind === 'external_test' ? 'finished' : 'awaiting_assessment', requestDigest, createdBy: user.id, history: [event(user, 'arrived')] }], { session })
      await Invoice.create([{ encounterId: saved.id, patientId: patient.id }], { session })
    })
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = await Encounter.findOne({ requestId: data.requestId })
      if (duplicate?.requestDigest === requestDigest && String(duplicate.createdBy) === user.id) return duplicate
      throw new HttpError(409, 'This appointment already has an arrival. Open it from the queue.')
    }
    throw error
  }
  return saved
}
export async function assessEncounter(id, input, user) {
  const record = await getEncounter(id, user)
  checkVersion(record, input.version)
  if (['finished', 'left'].includes(record.stage)) throw new HttpError(409, 'This encounter is closed.')
  if (record.assessments.length >= 20) throw new HttpError(409, 'The assessment history is full.')
  if (new Date(input.measuredAt) < record.arrivedAt) throw new HttpError(400, 'Record a measurement taken during this encounter.')
  const measurements = { ...input }; delete measurements.version
  record.assessments.push({ ...measurements, actor: actor(user) })
  if (record.stage === 'awaiting_assessment') record.stage = 'waiting'
  record.history.push(event(user, 'assessment_recorded', input.notMeasuredReason))
  await saveVersion(record)
  return record
}
export async function encounterAction(id, input, user) {
  let record
  await mongoose.connection.transaction(async (session) => {
    record = await getEncounter(id, user, session)
    checkVersion(record, input.version)
    if (['finished', 'left'].includes(record.stage)) throw new HttpError(409, 'This encounter is closed.')
    if (input.action === 'start') {
      if (!can(user, 'clinical') || record.stage !== 'waiting') throw new HttpError(403, 'A doctor can start consultation after the initial assessment.')
      record.stage = 'in_consultation'
    } else if (input.action === 'left') {
      if (!can(user, 'reception') || !input.note) throw new HttpError(400, 'Reception must record why the patient left.')
      record.stage = 'left'
      if (record.appointmentId) await Appointment.updateOne({ _id: record.appointmentId, status: 'checked_in', visitId: null }, { $set: { status: 'cancelled', updatedBy: user.id }, $inc: { __v: 1 }, $push: { statusHistory: { status: 'cancelled', at: new Date(), by: user.id, note: input.note } } }, { session })
    } else {
      if (!can(user, 'assess') || !input.note) throw new HttpError(400, 'Clinical staff must record a reason for changing queue priority.')
      record.priority = input.action === 'priority'
    }
    record.history.push(event(user, input.action, input.note)); await saveVersion(record, session)
  })
  return record
}
export async function saveDraft(id, input, user) {
  const record = await getEncounter(id, user)
  checkVersion(record, input.version)
  if (record.stage !== 'in_consultation') throw new HttpError(409, 'Start the consultation before saving a draft.')
  const { followUpDate, ...draft } = input; delete draft.version
  draft.prescriptions = await Promise.all(draft.prescriptions.map(async (line) => {
    const medicine = await Medicine.findById(line.medicineId)
    if (!medicine || medicine.archivedAt || medicine.productKey !== line.productKey) throw new HttpError(409, 'A prescription product changed. Select the current product from the catalog.')
    return { ...line, medicine: publicMedicine(medicine) }
  }))
  record.draft = draft; record.followUpDate = followUpDate
  record.history.push(event(user, 'draft_saved')); await saveVersion(record)
  return record
}
export async function finalizeEncounter(id, version, user) {
  let record
  await mongoose.connection.transaction(async (session) => {
    record = await getEncounter(id, user, session)
    if (record.visitId && record.stage === 'finished') return
    checkVersion(record, version)
    if (record.stage !== 'in_consultation' || !record.draft.reason) throw new HttpError(409, 'Save the consultation draft before finalizing.')
    const appointment = record.appointmentId ? await Appointment.findById(record.appointmentId).session(session) : null
    const requestId = `${record.id.slice(0, 8)}-${record.id.slice(8, 12)}-4${record.id.slice(13, 16)}-8${record.id.slice(17, 20)}-${record.id.slice(12, 24)}`
    const prescriptions = (record.draft.prescriptions || []).map(({ medicineId, productKey, quantity, instructions }) => ({ medicineId, productKey, quantity, instructions }))
    const input = validate(visitSchema, { ...record.draft, prescriptions, patientId: String(record.patientId), doctorId: String(record.doctorId), date: clinicDate(record.arrivedAt), requestId, ...(appointment ? { appointmentId: appointment.id, appointmentVersion: appointment.__v } : {}) })
    const visit = await createVisit(input, user, session)
    record.visitId = visit.id; record.stage = 'finished'; record.draft = {}
    record.history.push(event(user, 'consultation_finalized')); await saveVersion(record, session)
    if (appointment) await Appointment.updateOne({ _id: appointment.id, visitId: visit.id, status: 'checked_in' }, { $set: { status: 'completed', updatedBy: user.id }, $inc: { __v: 1 }, $push: { statusHistory: { status: 'completed', at: new Date(), by: user.id, note: 'Consultation finalized' } } }, { session })
  })
  return record
}
export function invoiceTotals(invoice) {
  const totalCentavos = invoice.lines.filter((line) => !line.voided).reduce((sum, line) => sum + line.quantity * line.unitCentavos, 0)
  const paidCentavos = invoice.payments.reduce((sum, payment) => sum + (payment.refund ? -payment.amountCentavos : payment.amountCentavos), 0)
  return { totalCentavos, paidCentavos, balanceCentavos: totalCentavos - paidCentavos, status: totalCentavos === paidCentavos ? 'paid' : paidCentavos === 0 ? 'unpaid' : 'partially_paid' }
}
export async function availableSlots(doctorId, date) {
  const schedule = await DoctorSchedule.findOne({ doctorId })
  const { start, end } = clinicDayRange(date)
  const booked = await Appointment.find({ doctorId, startsAt: { $gte: start, $lt: end }, status: { $in: ['scheduled', 'checked_in'] } }).select('startsAt')
  const occupied = new Set(booked.map((item) => new Date(item.startsAt).valueOf()))
  const slots = []
  for (let minutes = 0; minutes < 1440; minutes += 30) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    const at = new Date(`${date}T${time}:00+08:00`).valueOf()
    if (scheduleAllows(schedule, date, time) && at > Date.now() && !occupied.has(at)) slots.push(time)
  }
  return { configured: !!schedule, slots }
}
