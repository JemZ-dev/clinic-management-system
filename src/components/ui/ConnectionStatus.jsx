import { useEffect, useState } from 'react'

export default function ConnectionStatus() {
  const [connection, setConnection] = useState('loading')

  useEffect(() => {
    let active = true
    let pending = false
    let controller

    async function checkConnection() {
      if (!active || pending) return
      if (!navigator.onLine) { setConnection('unavailable'); return }
      pending = true
      controller = new AbortController()
      const signal = controller.signal
      const timeout = window.setTimeout(() => controller.abort(), 10000)
      try {
        const response = await fetch('/api/health', { signal, cache: 'no-store' })
        const data = await response.json()
        if (active && !signal.aborted) setConnection(response.ok && data.database === 'connected' ? 'connected' : 'unavailable')
      } catch {
        if (active) setConnection('unavailable')
      } finally {
        window.clearTimeout(timeout)
        pending = false
      }
    }

    function handleOffline() { controller?.abort(); setConnection('unavailable') }
    function handleVisibility() { if (document.visibilityState === 'visible') checkConnection() }

    checkConnection()
    const interval = window.setInterval(checkConnection, 30000)
    window.addEventListener('online', checkConnection)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', checkConnection)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      active = false
      controller?.abort()
      window.clearInterval(interval)
      window.removeEventListener('online', checkConnection)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', checkConnection)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return <span className={`connection-status ${connection}`} role="status" title="Clinic database connection. Checked automatically every 30 seconds.">
    <span className="status-dot" aria-hidden="true" /><span className="visually-hidden">Clinic connection: </span>{connection === 'loading' ? 'Checking…' : connection === 'connected' ? 'Connected' : 'Disconnected'}
  </span>
}
