import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import Button from 'react-bootstrap/Button'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth.js'
import { api } from '../../../lib/api.js'

export default function WorkspacePage() {
  const { user } = useAuth()
  const [connection, setConnection] = useState('loading')
  const [check, setCheck] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api.get('/health', { signal: controller.signal }).then(() => setConnection('connected')).catch(() => {
      if (!controller.signal.aborted) setConnection('unavailable')
    })
    return () => controller.abort()
  }, [check])

  return <>
    <header className="page-heading"><div><h1>Clinic workspace</h1><p>Welcome, {user.name}. Your staff account is ready.</p></div></header>
    <section className="workspace-section" aria-labelledby="account-title">
      <div className="section-heading"><h2 id="account-title">Your account</h2><Link to="/profile" className="inline-action">Edit profile <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      <dl className="account-overview"><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Access</dt><dd>Clinic staff</dd></div></dl>
    </section>
    <section className="workspace-section connection-section" aria-labelledby="connection-title">
      <div><h2 id="connection-title">Clinic connection</h2><p>Check that the clinic database is available before you begin.</p></div>
      <div className="connection-actions"><span className={`connection-status ${connection}`} role="status"><span className="status-dot" aria-hidden="true" />{connection === 'loading' ? 'Checking connection…' : connection === 'connected' ? 'Database connected' : 'Connection unavailable'}</span><Button variant="outline-secondary" disabled={connection === 'loading'} onClick={() => { setConnection('loading'); setCheck((current) => current + 1) }}><RefreshCw size={16} aria-hidden="true" /> Check again</Button></div>
    </section>
    <p className="workspace-footnote">Keep your account details current and sign out when you finish using a shared computer.</p>
  </>
}
