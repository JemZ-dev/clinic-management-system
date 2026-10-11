import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, 64, options)
  return `scrypt$${salt}$${key.toString('hex')}`
}

export async function verifyPassword(password, encoded) {
  const [algorithm, salt, hash] = encoded.split('$')
  if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/.test(hash || '')) return false
  const key = await scrypt(password, salt, 64, options)
  return timingSafeEqual(Buffer.from(hash, 'hex'), key)
}
