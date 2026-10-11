import { HttpError } from '../utils/errors.js'

export function requireStaff(request, _response, next) {
  if (request.auth.user.role !== 'staff') throw new HttpError(403, 'Clinic staff access is required.')
  next()
}
