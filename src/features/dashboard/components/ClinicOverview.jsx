import { Link } from 'react-router'
import Button from 'react-bootstrap/Button'
import { RefreshCw, ArrowUpRight, CalendarDays, Check } from 'lucide-react'
import useApiResource from '../../../hooks/useApiResource.js'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import AppointmentTable from '../../appointments/components/AppointmentTable.jsx'
import { STATUS_LABELS } from '../../appointments/appointments.constants.js'
import { formatClinicDate } from '../../../lib/clinicTime.js'
import StockStatus from '../../medicines/components/StockStatus.jsx'

export default function ClinicOverview() {
  const resource = useApiResource('/dashboard')
  if (resource.loading) return <section className="workspace-section dashboard-overview"><AsyncState loading title="Loading clinic overview" message="Fetching saved patients and appointments…" /></section>
  if (resource.error) return <section className="workspace-section dashboard-overview"><AsyncState title="Clinic overview unavailable" message={resource.error} onRetry={resource.reload} /></section>
  const data = resource.data
  const needsPatient = data.patients === 0, needsDoctor = data.doctors === 0
  const actions = [
    { to: '/patients/new', label: 'Add patient', description: needsPatient ? 'Start with a profile and medical history.' : 'Register a new patient profile.' },
    ...(needsDoctor ? [{ to: '/doctors/new', label: 'Add doctor', description: 'Add a clinician to the clinic directory.' }] : [{ to: '/visits/new', label: 'Record visit', description: 'Save a consultation without an appointment.' }]),
    { to: '/medicines/new', label: 'Add medicine', description: 'Create a product, then record stock received.' },
  ]
  return <>
    <section className="dashboard-overview" aria-labelledby="overview-title"><div className="section-heading overview-heading"><h2 id="overview-title">Clinic overview</h2><div className="overview-tools"><p className="record-meta mb-0">{formatClinicDate(data.date)} · Manila time</p><Button variant="outline-secondary" onClick={resource.reload}><RefreshCw size={16} aria-hidden="true" />Refresh</Button></div></div>
      <dl className="dashboard-summary"><div><dt>Active patients</dt><dd><Link to="/patients">{data.patients}</Link></dd></div><div><dt>Today's appointments</dt><dd><Link to={`/appointments?date=${data.date}`}>{data.todayTotal}</Link></dd></div><div><dt>Checked-in queue</dt><dd><Link to="/appointments?status=checked_in&date=">{data.waiting}</Link></dd></div><div><dt>Active doctors</dt><dd><Link to="/doctors">{data.doctors}</Link></dd></div></dl>
    </section>
    <div className="dashboard-work-grid"><section className="directory-panel dashboard-appointments" aria-labelledby="today-appointments-title"><div className="section-heading"><div><h2 id="today-appointments-title">Today's active appointments</h2><p className="record-meta">Scheduled and checked-in patients</p></div><Link to={`/appointments?date=${data.date}`} className="inline-action">View schedule <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      {data.todayTotal > 0 && <div className="dashboard-statuses" aria-label="Today's appointment status totals">{Object.entries(STATUS_LABELS).map(([status, label]) => <Link to={`/appointments?date=${data.date}&status=${status}`} key={status}><span>{label}</span>{' '}<strong>{data.statuses[status]}</strong></Link>)}</div>}
      {data.appointments.length ? <><AppointmentTable records={data.appointments} backTo={`/appointments?date=${data.date}`} /><p className="dashboard-table-note">Showing up to 8 scheduled or checked-in appointments, ordered by time.</p></> : <div className="schedule-empty"><CalendarDays size={30} strokeWidth={1.5} aria-hidden="true" /><h3>No active appointments today</h3><p>{needsPatient || needsDoctor ? 'Add an active patient and doctor before booking your first appointment.' : 'Scheduled and checked-in appointments will appear here. Open the schedule to book a patient.'}</p><Button as={Link} role="link" variant="outline-secondary" to={needsPatient ? '/patients/new' : needsDoctor ? '/doctors/new' : '/appointments/new'}>{needsPatient ? 'Add your first patient' : needsDoctor ? 'Add your first doctor' : 'Book appointment'}</Button></div>}
    </section><aside className="dashboard-side"><section className="dashboard-actions" aria-labelledby="quick-actions-title"><h2 id="quick-actions-title">{needsPatient || needsDoctor ? 'Set up your clinic records' : 'Quick actions'}</h2>{(needsPatient || needsDoctor) && <p>Add the records you need for bookings and visits.</p>}<ul>{actions.map(({ to, label, description }) => <li key={to}><Link to={to}><span><strong>{label}</strong><span>{description}</span></span><ArrowUpRight size={18} aria-hidden="true" /></Link></li>)}</ul></section>
      {typeof data.lowStockCount === 'number' && <section className="dashboard-stock" aria-labelledby="low-stock-title"><div className="section-heading"><h2 id="low-stock-title">Low stock <span className="stock-count">({data.lowStockCount})</span></h2></div>{data.lowStockCount === 0 ? <div className="stock-clear"><Check size={19} aria-hidden="true" /><p role="status">No active medicines are at or below their stock threshold.</p></div> : <><ul className="medicine-picker-results">{data.lowStockMedicines.map((record) => <li key={record.id}><div><Link to={`/medicines/${record.id}`}>{record.genericName}{record.brandName ? ` (${record.brandName})` : ''}</Link><span className="record-meta">{record.strength} · {record.dosageForm}</span></div><div className="low-stock-quantity">{record.quantity.toLocaleString()} {record.stockUnit}<StockStatus record={record} /></div></li>)}</ul><p className="record-meta">Showing up to 5 active products.</p></>}<Link to="/medicines?stock=low" className="inline-action">View all low-stock medicines <ArrowUpRight size={16} aria-hidden="true" /></Link></section>}
    </aside></div>
  </>
}
