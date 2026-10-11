import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import Brand from '../components/ui/Brand.jsx'

export default function AuthLayout() {
  const { user } = useAuth()
  const location = useLocation()
  useEffect(() => {
    document.title = `${location.pathname === '/register' ? 'Create account' : 'Sign in'} | Clinic management`
  }, [location.pathname])
  if (user) return <Navigate to="/" replace />
  return <main className="auth-layout">
    <header className="auth-brand"><Brand /></header>
    <div className="auth-panel"><Outlet /></div>
    <p className="auth-footer">For authorized clinic staff. Use fictional patient data for coursework.</p>
  </main>
}
