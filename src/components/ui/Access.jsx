import { useContext } from 'react'
import { useLocation, Link } from 'react-router'
import { AuthContext } from '../../context/auth.js'
import { can } from '../../../shared/permissions.js'

export function Access({ permission, children }) {
  const context = useContext(AuthContext)
  return can(context?.user, permission) ? children : null
}
export default function AccessBoundary({ children }) {
  const { user } = useContext(AuthContext), { pathname } = useLocation()
  const section = pathname.split('/')[1]
  const editing = pathname.endsWith('/new') || pathname.endsWith('/edit')
  const permissions = { accounts: ['accounts'], schedules: ['schedule'], billing: ['billing'], diagnostics: ['clinical', 'diagnostics', 'reception'], services: ['directory'], inventory: ['dispense'], visits: editing ? ['clinical'] : ['clinical', 'dispense'], medicines: editing ? ['dispense'] : ['directory'], patients: editing ? ['reception'] : ['directory'], doctors: editing ? ['accounts'] : ['directory'], appointments: editing ? ['reception'] : ['directory'], queue: editing ? ['reception'] : ['directory'] }
  if (permissions[section] && !permissions[section].some((permission) => can(user, permission))) return <div className="directory-empty"><h1>Access restricted</h1><p>Your account is not assigned to this part of the clinic workflow.</p><Link to="/">Return to workspace</Link></div>
  return children
}
