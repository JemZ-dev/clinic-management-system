import { Link } from 'react-router'
import Button from 'react-bootstrap/Button'
import { ArrowUpRight, Plus, UsersRound, Stethoscope, CalendarDays, Pill } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth.js'
import ClinicOverview from '../components/ClinicOverview.jsx'

export default function WorkspacePage() {
  const { user } = useAuth()

  return <>
    <header className="page-heading workspace-heading"><div><h1>Clinic workspace</h1><p>Welcome, {user.name}. Here’s what’s happening at the clinic.</p></div><Button as={Link} role="link" to="/appointments/new"><Plus size={16} aria-hidden="true" />Book appointment</Button></header>
    <ClinicOverview />
    <section className="workspace-section workspace-directory" aria-labelledby="records-title">
      <h2 id="records-title">Clinic records</h2>
      <div className="workspace-links"><Link to="/patients"><UsersRound size={20} className="workspace-link-icon" aria-hidden="true" /><span>Patients</span><p>Profiles and medical history.</p><ArrowUpRight size={16} aria-hidden="true" /></Link><Link to="/doctors"><Stethoscope size={20} className="workspace-link-icon" aria-hidden="true" /><span>Doctors</span><p>Directory and specialties.</p><ArrowUpRight size={16} aria-hidden="true" /></Link><Link to="/appointments"><CalendarDays size={20} className="workspace-link-icon" aria-hidden="true" /><span>Appointments</span><p>Bookings and check-in.</p><ArrowUpRight size={16} aria-hidden="true" /></Link><Link to="/medicines"><Pill size={20} className="workspace-link-icon" aria-hidden="true" /><span>Medicines</span><p>Products and stock balances.</p><ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    </section>
    <section className="workspace-account" aria-labelledby="account-title">
      <div className="section-heading"><h2 id="account-title">Your account</h2><Link to="/profile" className="inline-action">Edit profile <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      <dl className="account-overview"><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Access</dt><dd>Clinic staff</dd></div></dl>
    </section>
    <p className="workspace-footnote">Keep your account details current and sign out when you finish using a shared computer.</p>
  </>
}
