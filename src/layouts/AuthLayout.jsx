import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import Brand from '../components/ui/Brand.jsx'

export default function AuthLayout() {
  const { user } = useAuth()
  const location = useLocation()
  useEffect(() => {
    document.title = `${location.pathname === '/register' ? 'Create account' : 'Sign in'} | Cliniqo`
  }, [location.pathname])
  if (user) return <Navigate to="/" replace />
  return <main className="auth-layout">
    <div className="auth-shell">
      <aside className="auth-intro">
        <header className="auth-brand"><Brand /></header>
        <div className="auth-story"><h2>Your clinic.<br />{' '}<span>One workspace.</span></h2><p>Patient records, appointments, and medicine stock, together in your clinic workspace.</p></div>
        <p className="auth-intro-footer">Built around the clinic’s everyday records.</p>
      </aside>
      <div className="auth-content"><div className="auth-panel"><Outlet /></div><p className="auth-footer">For authorized clinic staff. Use fictional patient data for coursework.</p></div>
    </div>
  </main>
}
