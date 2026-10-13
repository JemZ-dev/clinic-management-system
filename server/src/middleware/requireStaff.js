import { HttpError } from '../utils/errors.js'
import { can } from '../../../shared/permissions.js'

export function requireStaff(request, _response, next) {
  const user = request.auth.user
  const kind = request.baseUrl.split('/').at(-1)
  const read = request.method === 'GET'
  const allowed = {
    patients: read ? can(user, 'directory') : can(user, 'reception'),
    doctors: read ? can(user, 'directory') : can(user, 'accounts'),
    appointments: read ? can(user, 'directory') : can(user, 'reception'),
    visits: can(user, 'clinical') || (read && can(user, 'dispense')),
    medicines: read ? can(user, 'directory') : can(user, request.path.endsWith('/movements') ? 'dispense' : 'medicineCatalog'),
    inventory: can(user, 'dispense') || (read && can(user, 'billing')),
    dashboard: can(user, 'directory'),
  }
  if (!allowed[kind]) throw new HttpError(403, 'Your account does not have permission for this action.')
  next()
}
