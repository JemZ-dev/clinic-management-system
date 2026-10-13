import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

export function loadLocalEnvironment() {
  const path = fileURLToPath(new URL('../../.env', import.meta.url))
  try {
    loadEnvFile(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

export class ConfigurationError extends Error {}

export function getConfig(env = process.env) {
  const uri = env.MONGODB_URI?.trim()
  if (!uri) {
    throw new ConfigurationError('Set MONGODB_URI in server/.env before connecting.')
  }
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri) || /<[^>]+>|YOUR_ENCODED_PASSWORD/.test(uri)) {
    throw new ConfigurationError('MONGODB_URI must be a completed MongoDB connection string.')
  }

  const port = Number(env.PORT || 5000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError('PORT must be an integer between 1 and 65535.')
  }

  return { uri, dbName: env.MONGODB_DB_NAME?.trim() || 'clinic_management', port }
}

export function failureMessage(error) {
  if (error instanceof ConfigurationError) return error.message
  if (error.code === 18 || error.cause?.code === 18) {
    return 'Atlas authentication failed. Check the database username and password in server/.env.'
  }
  if (error.code === 'EADDRINUSE') return 'The configured PORT is already in use.'
  if (error.name === 'MongoParseError' || error.name === 'MongoInvalidArgumentError') {
    return 'Check the Atlas URI format and URL-encode special password characters.'
  }
  return 'Connection failed. Check the Atlas hostname, cluster status, IP access list, credentials, and internet connection.'
}

export function getAuthConfig(env = process.env) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new ConfigurationError('Set JWT_SECRET to a random value of at least 32 characters in server/.env.')
  }
  const appOrigin = env.APP_ORIGIN || 'http://localhost:5173'
  let url
  try { url = new URL(appOrigin) } catch { throw new ConfigurationError('APP_ORIGIN must be a valid website origin.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== appOrigin) {
    throw new ConfigurationError('APP_ORIGIN must be an HTTP(S) origin without a path or trailing slash.')
  }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new ConfigurationError('Use an HTTPS APP_ORIGIN for production.')
  }
  const appOrigins = [appOrigin]
  // Both loopback names refer to this local app. Never expand production origins.
  if (env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) {
    const alternate = new URL(appOrigin)
    alternate.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
    appOrigins.push(alternate.origin)
  }
  return {
    jwtSecret: env.JWT_SECRET, registrationCode: env.REGISTRATION_CODE,
    appOrigin, appOrigins, secureCookies: env.NODE_ENV === 'production',
  }
}
