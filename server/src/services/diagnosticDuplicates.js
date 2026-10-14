import { DiagnosticOrder } from '../models/Operations.js'
import { Patient } from '../models/Patient.js'
import { can } from '../../../shared/permissions.js'
import { HttpError } from '../utils/errors.js'

export const pendingDiagnosticStages = ['requested', 'scheduled', 'performed', 'result_available']

export function checkDiagnosticRepeat(existing, input, user) {
  if (input.repeatAcknowledged && !can(user, 'clinical')) throw new HttpError(403, 'A doctor must authorize an intentional repeat test.')
  if (!existing) {
    if (input.repeatAcknowledged) throw new HttpError(409, 'The previous request is no longer pending. Clear the repeat confirmation and submit a normal request.')
    return
  }
  if (input.repeatAcknowledged && input.repeatOf === String(existing._id) && input.repeatReason?.trim().length >= 5) return
  const error = new HttpError(409, 'This patient already has the same diagnostic test pending. Review the existing request before creating another.', { serviceId: 'A pending request for this test already exists.' })
  error.duplicateOrder = { id: String(existing._id), encounterId: String(existing.encounterId), serviceId: String(existing.serviceId), serviceName: existing.serviceName, stage: existing.stage, createdAt: existing.createdAt }
  throw error
}

export async function guardDiagnosticRequest(patientId, input, user, session) {
  // All new requests for this patient share this write, including requests from
  // different encounters. Concurrent submissions cannot both miss the duplicate.
  const patient = await Patient.findOneAndUpdate({ _id: patientId }, { $inc: { __v: 1 } }, { session })
  if (!patient) throw new HttpError(404, 'Patient not found.')
  const existing = await DiagnosticOrder.findOne({ patientId, serviceId: input.serviceId, stage: { $in: pendingDiagnosticStages } }).sort({ createdAt: -1, _id: -1 }).session(session)
  checkDiagnosticRepeat(existing, input, user)
  return existing
}
