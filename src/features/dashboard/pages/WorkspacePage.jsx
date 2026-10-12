import { Link } from 'react-router'
import Button from 'react-bootstrap/Button'
import { ArrowUpRight } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth.js'
import ClinicOverview from '../components/ClinicOverview.jsx'

export default function WorkspacePage() {
  const { user } = useAuth()

  return <>
    <header className="page-heading workspace-heading"><div><h1>Clinic workspace</h1><p>Welcome, {user.name}. Review the clinic’s records and today's schedule.</p></div><Button as={Link} role="link" to="/appointments/new">Book appointment</Button></header>
    <ClinicOverview />
    <section className="workspace-section workspace-directory" aria-labelledby="records-title">
      <h2 id="records-title">Clinic records</h2>
      <div className="workspace-links"><Link to="/patients"><span>Patients</span><p>Profiles, contact details, and medical history.</p><ArrowUpRight size={18} aria-hidden="true" /></Link><Link to="/doctors"><span>Doctors</span><p>The clinic’s doctor directory and specialties.</p><ArrowUpRight size={18} aria-hidden="true" /></Link><Link to="/appointments"><span>Appointments</span><p>Bookings, check-in, and appointment outcomes.</p><ArrowUpRight size={18} aria-hidden="true" /></Link><Link to="/medicines"><span>Medicines</span><p>Product catalog, stock balances, and receipts.</p><ArrowUpRight size={18} aria-hidden="true" /></Link></div>
    </section>
    <section className="workspace-account" aria-labelledby="account-title">
      <div className="section-heading"><h2 id="account-title">Your account</h2><Link to="/profile" className="inline-action">Edit profile <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      <dl className="account-overview"><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Access</dt><dd>Clinic staff</dd></div></dl>
    </section>
    <p className="workspace-footnote">Keep your account details current and sign out when you finish using a shared computer.</p>
  </>
}
