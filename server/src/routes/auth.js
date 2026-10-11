import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { authenticate } from '../middleware/authenticate.js'
import { COOKIE_NAME, SESSION_SECONDS } from '../services/auth.js'
import { loginSchema, registerSchema, profileSchema, validate } from '../validators/auth.js'

export function authRoutes(authService, config) {
  const router = Router()
  const requireAuth = authenticate(authService)
  const cookieOptions = { httpOnly: true, secure: config.secureCookies, sameSite: 'strict', path: '/api' }
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    skipSuccessfulRequests: true, message: { message: 'Too many attempts. Please try again in 15 minutes.' },
  })

  const sendSession = (response, result, status = 200) => {
    response.cookie(COOKIE_NAME, result.token, { ...cookieOptions, maxAge: SESSION_SECONDS * 1000 })
    response.status(status).json({ user: result.user })
  }

  router.post('/register', loginLimit, async (request, response) => {
    sendSession(response, await authService.register(validate(registerSchema, request.body)), 201)
  })
  router.post('/login', loginLimit, async (request, response) => {
    sendSession(response, await authService.login(validate(loginSchema, request.body)))
  })
  router.get('/me', requireAuth, (request, response) => response.json({ user: request.auth.user }))
  router.patch('/profile', requireAuth, async (request, response) => {
    const user = await authService.updateProfile(request.auth.user.id, validate(profileSchema, request.body))
    response.json({ user })
  })
  router.post('/logout', requireAuth, async (request, response) => {
    await authService.logout(request.auth.sessionId)
    response.clearCookie(COOKIE_NAME, cookieOptions)
    response.status(204).end()
  })
  return router
}
