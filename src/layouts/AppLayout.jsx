import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import Offcanvas from 'react-bootstrap/Offcanvas'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'
import { LayoutDashboard, UserRound, UsersRound, Stethoscope, CalendarDays, ClipboardList, Pill, Package, Menu, LogOut } from 'lucide-react'
import { can } from '../../shared/permissions.js'
import AccessBoundary from '../components/ui/Access.jsx'
import Brand from '../components/ui/Brand.jsx'
import AsyncState from '../components/ui/AsyncState.jsx'
import ConnectionStatus from '../components/ui/ConnectionStatus.jsx'
import { useAuth } from '../hooks/useAuth.js'
import useConfirmDialog from '../hooks/useConfirmDialog.jsx'
import { apiError } from '../lib/api.js'

const navigation = [{ to: '/', label: 'Workspace', icon: LayoutDashboard }, { to: '/patients', label: 'Patients', icon: UsersRound }, { to: '/doctors', label: 'Doctors', icon: Stethoscope }, { to: '/appointments', label: 'Appointments', icon: CalendarDays }, { to: '/visits', label: 'Visits', icon: ClipboardList, permissions: ['clinical', 'dispense'] }, { to: '/medicines', label: 'Medicines', icon: Pill }, { to: '/inventory', label: 'Inventory', icon: Package, permissions: ['dispense'] }, { to: '/queue', label: 'Patient queue', icon: UsersRound }, { to: '/services', label: 'Services & pricing', icon: ClipboardList }, { to: '/diagnostics', label: 'Diagnostics', icon: ClipboardList, permissions: ['clinical', 'diagnostics', 'reception'] }, { to: '/billing', label: 'Billing', icon: ClipboardList, permissions: ['billing'] }, { to: '/schedules', label: 'Schedules', icon: CalendarDays, permissions: ['schedule'] }, { to: '/accounts', label: 'Accounts', icon: UsersRound, permissions: ['accounts'] }, { to: '/profile', label: 'My profile', icon: UserRound }]

function Navigation({ onNavigate }) {
  const { user } = useAuth()
  return <nav className="clinic-nav" aria-label="Main navigation">{navigation.filter((item) => !item.permissions || item.permissions.some((permission) => can(user, permission))).map(({ to, label, icon: Icon }) =>
    <NavLink key={to} to={to} end={to === '/' || to === '/profile'} onClick={onNavigate}><Icon size={19} aria-hidden="true" /><span>{label}</span></NavLink>
  )}</nav>
}

function SidebarFooter({ busy, onSignOut }) {
  return <div className="sidebar-footer">
    <Button variant="link" className="logout-button" onClick={onSignOut} disabled={busy}><LogOut size={19} aria-hidden="true" /><span>{busy ? 'Signing out…' : 'Sign out'}</span></Button>
  </div>
}

export default function AppLayout() {
  const { confirm, dialog } = useConfirmDialog()
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { user, logout } = useAuth()
  const location = useLocation()
  const section = navigation.find(({ to }) => to !== '/' && location.pathname.startsWith(to))?.label || 'Workspace'
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  useEffect(() => {
    const section = navigation.find(({ to }) => to !== '/' && location.pathname.startsWith(to))?.label || 'Workspace'
    const action = location.pathname.endsWith('/new') ? 'Add · ' : location.pathname.endsWith('/edit') ? 'Edit · ' : ''
    document.title = `${action}${section} | Cliniqo`
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [location.pathname])

  async function handleLogout() {
    if (busy) return
    setMenuOpen(false)
    if (!await confirm('Are you sure you want to sign out?', { title: 'Sign out?', confirmLabel: 'Sign out', cancelLabel: 'Cancel', variant: 'danger' })) return
    const event = new CustomEvent('clinic-before-signout', { cancelable: true, detail: { proceed: performLogout } })
    if (window.dispatchEvent(event)) await performLogout()
  }

  async function performLogout() {
    setBusy(true); setError('')
    try { await logout() } catch (failure) { setError(apiError(failure)) } finally { setBusy(false) }
  }

  return <div className="app-layout">
    {dialog}
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className="desktop-sidebar">
      <Brand />
      <Navigation />
      <SidebarFooter busy={busy} onSignOut={handleLogout} />
    </aside>
    <Offcanvas show={menuOpen} onHide={() => setMenuOpen(false)} className="mobile-nav" aria-labelledby="mobile-menu-title">
      <Offcanvas.Header closeButton><Offcanvas.Title id="mobile-menu-title"><Brand /></Offcanvas.Title></Offcanvas.Header>
      <Offcanvas.Body><Navigation onNavigate={() => setMenuOpen(false)} />{error && <Alert variant="danger" role="alert">Sign-out failed. {error}</Alert>}<SidebarFooter busy={busy} onSignOut={handleLogout} /></Offcanvas.Body>
    </Offcanvas>
    <div className="app-body">
      <header className="topbar">
        <div className="topbar-context"><Button variant="link" className="mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={23} aria-hidden="true" /></Button><span className="topbar-clinic">Cliniqo</span><span className="topbar-separator" aria-hidden="true">/</span><span className="topbar-section">{section}</span></div>
        <div className="topbar-account"><ConnectionStatus /><span className="avatar" aria-hidden="true">{initials}</span><NavLink to="/profile" className="account-name">{user.name}</NavLink></div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {error && <Alert variant="danger" role="alert">Sign-out failed. {error}</Alert>}
        <Suspense fallback={<AsyncState loading title="Loading page" message="Opening this clinic screen…" />}><AccessBoundary><Outlet /></AccessBoundary></Suspense>
      </main>
    </div>
  </div>
}
