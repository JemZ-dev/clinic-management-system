import { COOKIE_NAME } from '../services/auth.js'
import { HttpError } from '../utils/errors.js'

export function authenticate(authService) {
  return async (request, _response, next) => {
    const token = request.cookies[COOKIE_NAME]
    if (!token) throw new HttpError(401, 'Please sign in to continue.')
    request.auth = await authService.authenticate(token)
    next()
  }
}
