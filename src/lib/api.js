import axios from 'axios'

export const api = axios.create({
  baseURL: '/api', timeout: 15000, withCredentials: true,
  headers: { 'X-Clinic-Request': '1' },
})

export function apiError(error) {
  if (error.response?.data?.message) return error.response.data.message
  if (error.code === 'ECONNABORTED') return 'The request took too long. Please try again.'
  return 'We could not reach the clinic server. Check your connection and try again.'
}
