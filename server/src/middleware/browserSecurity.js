import { HttpError } from '../utils/errors.js'

export function browserSecurity(appOrigin, appOrigins = [appOrigin]) {
  return (request, _response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next()
    // A custom header requires a CORS preflight. This API never enables cross-origin CORS.
    if (request.get('X-Clinic-Request') !== '1' || request.get('Sec-Fetch-Site') === 'cross-site') {
      throw new HttpError(403, 'This request is not allowed.')
    }
    if (request.get('Origin') && !appOrigins.includes(request.get('Origin'))) {
      throw new HttpError(403, 'This request is not allowed.')
    }
    if (!request.is('application/json')) throw new HttpError(415, 'Send this request as JSON.')
    next()
  }
}
