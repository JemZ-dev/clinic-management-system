import { api } from '../../lib/api.js'

export async function getCurrentUser(signal) {
  return (await api.get('/auth/me', { signal })).data.user
}
export async function signIn(values) {
  return (await api.post('/auth/login', values)).data.user
}
export async function register(values) {
  return (await api.post('/auth/register', values)).data.user
}
export async function signOut() {
  await api.post('/auth/logout', {})
}
export async function saveProfile(values) {
  return (await api.patch('/auth/profile', values)).data.user
}
