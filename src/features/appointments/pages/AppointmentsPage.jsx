import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import { Plus, Search } from 'lucide-react'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import useApiResource from '../../../hooks/useApiResource.js'
import AppointmentTable from '../components/AppointmentTable.jsx'
import { STATUS_LABELS } from '../appointments.constants.js'
import { clinicToday } from '../../../lib/clinicTime.js'

function SearchAppointments({ query, onSearch }) {
  const [value, setValue] = useState(query)
  return <Form role="search" className="record-search" onSubmit={(event) => { event.preventDefault(); onSearch(value.trim()) }}><Form.Label htmlFor="appointment-search" className="visually-hidden">Search patient, patient ID, or doctor</Form.Label><Form.Control id="appointment-search" type="search" value={value} maxLength={100} placeholder="Search patient, patient ID, or doctor" onChange={(event) => setValue(event.target.value)} /><Button type="submit" variant="outline-secondary"><Search size={16} aria-hidden="true" />Search</Button></Form>
}

export default function AppointmentsPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const query = params.get('q') || ''
  const date = params.has('date') ? params.get('date') : clinicToday()
  const status = Object.hasOwn(STATUS_LABELS, params.get('status')) ? params.get('status') : 'all'
  const request = new URLSearchParams({ q: query, date, status, page: params.get('page') || '1', limit: params.get('limit') || '10' })
  for (const field of ['patientId', 'doctorId']) if (params.has(field)) request.set(field, params.get(field))
  const resource = useApiResource(`/appointments?${request}`)
  function filter(changes) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('date', date); next.set('page', '1')
      for (const [key, value] of Object.entries(changes)) { if (value === null) next.delete(key); else next.set(key, value) }
      return next
    })
  }
  const scoped = params.has('patientId') || params.has('doctorId')
  const backTo = `${location.pathname}${location.search}`
  return <>
    <header className="page-heading"><div><h1>Appointments</h1><p>Book and manage the clinic schedule. All times are in Manila time.</p></div><Button as={Link} to="/appointments/new" state={{ backTo }}><Plus size={17} aria-hidden="true" />Book appointment</Button></header>
    <section className="directory-panel" aria-label="Appointment directory">
      <div className="appointment-toolbar"><SearchAppointments key={query} query={query} onSearch={(q) => filter({ q })} /><Form.Group controlId="appointment-date-filter"><Form.Label>Date</Form.Label><Form.Control type="date" value={date} onChange={(event) => filter({ date: event.target.value })} /></Form.Group><Form.Group controlId="appointment-status-filter"><Form.Label>Status</Form.Label><Form.Select value={status} onChange={(event) => filter({ status: event.target.value })}><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Form.Select></Form.Group></div>
      <div className="appointment-filter-actions"><Button variant="link" onClick={() => filter({ date: clinicToday() })}>Today</Button><Button variant="link" onClick={() => filter({ date: '' })}>All dates</Button>{scoped && <><span>Showing appointments for the selected record.</span><Button variant="link" onClick={() => filter({ patientId: null, doctorId: null })}>Clear record filter</Button></>}</div>
      {resource.loading ? <AsyncState loading title="Loading appointments" message="Fetching the latest schedule…" /> : resource.error ? <AsyncState title="Unable to load appointments" message={resource.error} onRetry={resource.reload} /> : !resource.data.records.length ? <div className="directory-empty" role="status"><h2>{query || status !== 'all' || scoped ? 'No matching appointments' : 'No appointments for this period'}</h2><p>{query || status !== 'all' || scoped ? 'Change the filters or search to see other appointments.' : 'Book an appointment to add it to the clinic schedule.'}</p><Button as={Link} to="/appointments/new" state={{ backTo }}>Book appointment</Button></div> : <>
        <AppointmentTable records={resource.data.records} backTo={backTo} />
        <div className="directory-pagination"><p role="status">{(resource.data.pagination.page - 1) * resource.data.pagination.limit + 1}–{Math.min(resource.data.pagination.page * resource.data.pagination.limit, resource.data.pagination.total)} of {resource.data.pagination.total} appointments</p><Form.Group controlId="appointment-page-size" className="page-size"><Form.Label>Per page</Form.Label><Form.Select value={String(resource.data.pagination.limit)} onChange={(event) => filter({ limit: event.target.value })}><option>10</option><option>25</option><option>50</option></Form.Select></Form.Group><nav aria-label="Appointment pages" className="page-controls"><Button variant="outline-secondary" disabled={resource.data.pagination.page <= 1} onClick={() => filter({ page: String(resource.data.pagination.page - 1) })}>Previous</Button><span>Page {resource.data.pagination.page} of {resource.data.pagination.pages}</span><Button variant="outline-secondary" disabled={resource.data.pagination.page >= resource.data.pagination.pages} onClick={() => filter({ page: String(resource.data.pagination.page + 1) })}>Next</Button></nav></div>
      </>}
    </section>
  </>
}
