import { can } from '../../../shared/permissions.js'
import { HttpError } from '../utils/errors.js'
import { Appointment } from '../models/Appointment.js'
import { Visit } from '../models/Visit.js'
import { Encounter } from '../models/Encounter.js'

export function requirePermission(...permissions) {
  return (request, _response, next) => {
    if (!permissions.some((permission) => can(request.auth.user, permission))) throw new HttpError(403, 'Your account does not have permission for this action.')
    next()
  }
}
export function assertAssigned(user, doctorId) {
  if (user.role === 'doctor' && (!user.doctorId || String(doctorId) !== user.doctorId)) throw new HttpError(403, 'This record is assigned to another doctor.')
}
export async function assignedPatients(user) {
  if (user.role !== 'doctor') return null
  if (!user.doctorId) return []
  const ids = await Promise.all([Appointment.distinct('patientId', { doctorId: user.doctorId }), Visit.distinct('patientId', { doctorId: user.doctorId }), Encounter.distinct('patientId', { doctorId: user.doctorId })])
  return [...new Set(ids.flat().map(String))]
}
