import { Link } from 'react-router'
import Button from 'react-bootstrap/Button'
import { RefreshCw } from 'lucide-react'
import useApiResource from '../../../hooks/useApiResource.js'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import AppointmentTable from '../../appointments/components/AppointmentTable.jsx'
import { STATUS_LABELS } from '../../appointments/appointments.constants.js'
import { formatClinicDate } from '../../../lib/clinicTime.js'

export default function ClinicOverview() {
  const resource = useApiResource('/dashboard')
  if (resource.loading) return <section className="workspace-section dashboard-overview"><AsyncState loading title="Loading clinic overview" message="Fetching saved patients and appointments…" /></section>
  if (resource.error) return <section className="workspace-section dashboard-overview"><AsyncState title="Clinic overview unavailable" message={resource.error} onRetry={resource.reload} /></section>
  const data = resource.data
  return <>
    <section className="workspace-section dashboard-overview" aria-labelledby="overview-title"><div className="section-heading"><div><h2 id="overview-title">Clinic overview</h2><p className="record-meta mb-0">{formatClinicDate(data.date)} · Manila time</p></div><Button variant="outline-secondary" onClick={resource.reload}><RefreshCw size={16} aria-hidden="true" />Refresh</Button></div>
      <dl className="dashboard-summary"><div><dt>Active patients</dt><dd><Link to="/patients">{data.patients}</Link></dd></div><div><dt>Today's appointments</dt><dd><Link to={`/appointments?date=${data.date}`}>{data.todayTotal}</Link></dd></div><div><dt>Checked-in queue</dt><dd><Link to="/appointments?status=checked_in&date=">{data.waiting}</Link></dd></div><div><dt>Active doctors</dt><dd><Link to="/doctors">{data.doctors}</Link></dd></div></dl>
      <div className="dashboard-statuses" aria-label="Today's appointment status totals">{Object.entries(STATUS_LABELS).map(([status, label]) => <Link to={`/appointments?date=${data.date}&status=${status}`} key={status}><span>{label}</span><strong>{data.statuses[status]}</strong></Link>)}</div>
    </section>
    <section className="directory-panel dashboard-appointments" aria-labelledby="today-appointments-title"><div className="section-heading"><h2 id="today-appointments-title">Today's active appointments</h2><Link to={`/appointments?date=${data.date}`} className="inline-action">View schedule</Link></div>{data.appointments.length ? <><AppointmentTable records={data.appointments} backTo={`/appointments?date=${data.date}`} /><p className="dashboard-table-note">Showing up to 8 scheduled or checked-in appointments, ordered by time.</p></> : <div className="directory-empty"><h2>No active appointments today</h2><p>Scheduled and checked-in appointments will appear here.</p><Button as={Link} to="/appointments/new">Book appointment</Button></div>}</section>
  </>
}
