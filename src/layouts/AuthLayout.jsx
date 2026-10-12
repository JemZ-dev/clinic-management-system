import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import Brand from '../components/ui/Brand.jsx'
import { UsersRound, CalendarDays, Pill } from 'lucide-react'

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
        <div className="auth-story"><h2>Clinic records,<br />{' '}kept together.</h2><p>One staff workspace for patient profiles, consultations, and the clinic’s medicine stock.</p><ul className="auth-workflow-list"><li><UsersRound size={17} aria-hidden="true" />Patient profiles and medical history</li><li><CalendarDays size={17} aria-hidden="true" />Appointments and visit records</li><li><Pill size={17} aria-hidden="true" />Medicines and stock movements</li></ul></div>
        <p className="auth-intro-footer">Built around the clinic’s everyday records.</p>
      </aside>
      <div className="auth-content"><div className="auth-panel"><Outlet /></div><p className="auth-footer">For authorized clinic staff. Use fictional patient data for coursework.</p></div>
    </div>
  </main>
}
