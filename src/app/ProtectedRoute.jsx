import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import AsyncState from '../components/ui/AsyncState.jsx'

export function AuthReady({ children }) {
  const { status, error, refresh } = useAuth()
  if (status === 'loading') return <AsyncState loading title="Opening your workspace" message="Checking your session…" />
  if (status === 'error') return <AsyncState title="Unable to connect" message={error} onRetry={refresh} />
  return children
}

export default function ProtectedRoute() {
  const { user } = useAuth()
  const location = useLocation()
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />
}
