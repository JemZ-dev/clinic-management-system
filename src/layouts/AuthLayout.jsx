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
        <div className="auth-story"><h2>More time for care.<br /><span>Less time finding records.</span></h2><p>Patient histories, appointments, and medicine stock — together in your clinic workspace.</p></div>
        <ul className="auth-workflow-list"><li><UsersRound size={20} aria-hidden="true" /><div><strong>Patient records</strong><span>History and consultation notes, in one place.</span></div></li><li><CalendarDays size={20} aria-hidden="true" /><div><strong>Appointments & visits</strong><span>From a booking to a saved visit record.</span></div></li><li><Pill size={20} aria-hidden="true" /><div><strong>Medicine inventory</strong><span>Products, receipts, and actual dispensing.</span></div></li></ul>
        <p className="auth-intro-footer">Cliniqo · Clinic management system</p>
      </aside>
      <div className="auth-content"><div className="auth-panel"><Outlet /></div><p className="auth-footer">For authorized clinic staff. Use fictional patient data for coursework.</p></div>
    </div>
  </main>
}
