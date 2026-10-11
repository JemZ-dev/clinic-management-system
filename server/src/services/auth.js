import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { User, publicUser } from '../models/User.js'
import { Session } from '../models/Session.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { HttpError } from '../utils/errors.js'

export const SESSION_SECONDS = 60 * 60 * 8
export const COOKIE_NAME = 'clinic_session'
const issuer = 'clinic-api'
const audience = 'clinic-web'

export function createAuthService(config) {
  // Equalize password work for unknown accounts without storing a real credential.
  const dummyHash = hashPassword(randomBytes(32).toString('hex'))

  async function createSession(user) {
    const id = randomBytes(32).toString('hex')
    const token = jwt.sign({}, config.jwtSecret, {
      algorithm: 'HS256', subject: String(user._id), jwtid: id,
      issuer, audience, expiresIn: SESSION_SECONDS,
    })
    await Session.create({ _id: id, userId: user._id, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) })
    return { token, user: publicUser(user) }
  }

  return {
    async register(input) {
      const digest = (value) => createHmac('sha256', config.jwtSecret).update(value).digest()
      if (!timingSafeEqual(digest(input.registrationCode), digest(config.registrationCode))) {
        throw new HttpError(403, 'The clinic access code is incorrect.', { registrationCode: 'Check the code with your clinic administrator.' })
      }
      const passwordHash = await hashPassword(input.password)
      let user
      try {
        user = await User.create({ name: input.name, email: input.email, passwordHash })
      } catch (error) {
        if (error.code === 11000) throw new HttpError(409, 'An account with this email already exists.', { email: 'Use another email or sign in.' })
        throw error
      }
      return createSession(user)
    },
    async login(input) {
      const user = await User.findOne({ email: input.email }).select('+passwordHash')
      const matches = await verifyPassword(input.password, user?.passwordHash || await dummyHash)
      if (!user || !matches) throw new HttpError(401, 'The email or password is incorrect.')
      return createSession(user)
    },
    async authenticate(token) {
      let payload
      try {
        payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer, audience })
      } catch {
        throw new HttpError(401, 'Your session has expired. Please sign in again.')
      }
      if (!payload.sub || !/^[a-f0-9]{24}$/.test(payload.sub) || !/^[a-f0-9]{64}$/.test(payload.jti || '')) {
        throw new HttpError(401, 'Please sign in again.')
      }
      const session = await Session.findOne({ _id: payload.jti, userId: payload.sub, expiresAt: { $gt: new Date() } })
      if (!session) throw new HttpError(401, 'Your session has ended. Please sign in again.')
      const user = await User.findById(payload.sub)
      if (!user) throw new HttpError(401, 'Please sign in again.')
      return { user: publicUser(user), sessionId: session._id }
    },
    async logout(sessionId) {
      await Session.deleteOne({ _id: sessionId })
    },
    async updateProfile(id, input) {
      const user = await User.findByIdAndUpdate(id, { $set: input }, { returnDocument: 'after', runValidators: true })
      if (!user) throw new HttpError(401, 'Please sign in again.')
      return publicUser(user)
    },
  }
}
