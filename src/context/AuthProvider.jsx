import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './auth.js'
import { api, apiError } from '../lib/api.js'
import { getCurrentUser, signOut } from '../features/auth/auth.api.js'

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, status: 'loading', error: '' })
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++generation.current
    setState((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const user = await getCurrentUser()
      if (requestId === generation.current) setState({ user, status: 'ready', error: '' })
    } catch (error) {
      if (requestId === generation.current) {
        setState({ user: null, status: error.response?.status === 401 ? 'ready' : 'error', error: apiError(error) })
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++generation.current
    getCurrentUser(controller.signal).then((user) => {
      if (requestId === generation.current) setState({ user, status: 'ready', error: '' })
    }).catch((error) => {
      if (controller.signal.aborted || requestId !== generation.current) return
      setState({ user: null, status: error.response?.status === 401 ? 'ready' : 'error', error: apiError(error) })
    })
    const interceptor = api.interceptors.response.use((response) => response, (error) => {
      if (error.response?.status === 401 && !['/auth/login', '/auth/register'].includes(error.config?.url)) {
        generation.current++
        setState({ user: null, status: 'ready', error: '' })
      }
      return Promise.reject(error)
    })
    return () => { controller.abort(); api.interceptors.response.eject(interceptor) }
  }, [])

  function setUser(user) {
    generation.current++
    setState({ user, status: 'ready', error: '' })
  }

  async function logout() {
    try { await signOut() } catch (error) {
      if (error.response?.status !== 401) throw error
    }
    setUser(null)
  }

  return <AuthContext value={{ ...state, refresh, setUser, logout }}>{children}</AuthContext>
}
