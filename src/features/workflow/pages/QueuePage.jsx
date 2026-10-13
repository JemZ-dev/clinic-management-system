import { useState } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router'
import Button from 'react-bootstrap/Button'
import Table from 'react-bootstrap/Table'
import { Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth.js'
import { can } from '../../../../shared/permissions.js'
import useApiResource from '../../../hooks/useApiResource.js'
import DirectorySearch from '../../../components/ui/DirectorySearch.jsx'
import RecordPicker from '../../appointments/components/RecordPicker.jsx'
import { api } from '../../../lib/api.js'
import { WorkflowResource, WorkflowForm, Field } from '../components/WorkflowUI.jsx'
import { STAGES, dateTime } from '../workflow.js'

export default function QueuePage({ embedded = false }) {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const query = new URLSearchParams({ q: params.get('q') || '', stage: params.get('stage') || 'active', page: params.get('page') || '1', ...(params.get('patientId') ? { patientId: params.get('patientId') } : {}), ...(params.get('appointmentId') ? { appointmentId: params.get('appointmentId') } : {}) })
  const resource = useApiResource(`/encounters?${query}`)
  function filter(key, value) { setParams((old) => { const next = new URLSearchParams(old); next.set(key, value); next.set('page', '1'); return next }, { replace: true }) }
  return <>
    <header className="page-heading"><div><h1>{embedded ? 'Today’s workspace' : 'Patient queue'}</h1><p>{user.role === 'doctor' ? 'Your assigned patients, assessments, and consultations.' : 'Track each arrival from assessment through consultation. Times shown in Manila time.'}</p></div><div className="record-actions">{can(user, 'reception') && <><Button as={Link} to="/appointments/new" variant="outline-secondary">Book appointment</Button><Button as={Link} to="/queue/new"><Plus size={16} />Register arrival</Button></>}</div></header>
    <section className="workspace-section workflow-table-panel">
      <div className="workflow-toolbar"><DirectorySearch id="queue-search" label="Search patient, ID, or doctor" initialValue={query.get('q')} onSearch={(value) => filter('q', value)} loading={resource.loading} /><Field label="Stage" value={query.get('stage')} onChange={(value) => filter('stage', value)} options={[{ value: 'active', label: 'Active queue' }, { value: 'all', label: 'All encounters' }, ...Object.entries(STAGES).map(([value, label]) => ({ value, label }))]} /><Button variant="outline-secondary" onClick={resource.reload} aria-label="Refresh queue"><RefreshCw size={16} /></Button></div>
      <WorkflowResource resource={resource}>{({ records, pagination }) => <>{records.length ? <Table responsive hover><thead><tr><th>Patient</th><th>Doctor</th><th>Arrival</th><th>Stage</th><th><span className="visually-hidden">Open encounter</span></th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.patientName}</strong><span className="record-meta">{record.patientNumber}{record.priority ? ' · Priority' : ''}</span></td><td>{record.doctorName || 'External test request'}</td><td>{dateTime(record.arrivedAt)}<span className="record-meta">{record.kind.replaceAll('_', ' ')}{!['finished', 'left'].includes(record.stage) && ` · ${Math.max(0, Math.floor((Date.now() - new Date(record.arrivedAt)) / 60000))} min since arrival`}</span></td><td><span className="record-status">{STAGES[record.stage]}</span>{record.hasDraft && <span className="record-meta">Draft saved</span>}</td><td><Link to={`/queue/${record.id}`}>Open</Link></td></tr>)}</tbody></Table> : <div className="directory-empty"><h2>No encounters in this view</h2><p>Check in a booked patient or register a walk-in to begin.</p></div>}<div className="workflow-pagination"><span>{pagination.total} encounters</span><Button variant="link" disabled={pagination.page <= 1} onClick={() => setParams({ ...Object.fromEntries(params), page: String(pagination.page - 1) })}>Previous</Button><span>Page {pagination.page} of {pagination.pages}</span><Button variant="link" disabled={pagination.page >= pagination.pages} onClick={() => setParams({ ...Object.fromEntries(params), page: String(pagination.page + 1) })}>Next</Button></div></>}</WorkflowResource>
    </section>
  </>
}
export function ArrivalPage() {
  const navigate = useNavigate(), location = useLocation()
  const [patient, setPatient] = useState(location.state?.patient || null), [doctor, setDoctor] = useState(null)
  const [requestId] = useState(() => crypto.randomUUID())
  return <><Link className="record-back" to="/queue">Back to queue</Link><header className="page-heading"><div><h1>Register arrival</h1><p>For a booked patient, use Check in from their appointment. Search existing patients before adding a new record.</p></div></header><section className="workspace-section"><WorkflowForm initial={{ patientId: patient?.id || '', doctorId: '', kind: 'walk_in', reason: '', externalClinician: '' }} submitLabel="Register arrival" onSave={async (values, allowNavigation) => {
    const { data } = await api.post('/encounters', { ...values, doctorId: values.doctorId || undefined, requestId })
    allowNavigation(); navigate(`/queue/${data.record.id}`)
  }}>{({ values, change, fields }) => <><div className="record-form-grid"><Field label="Arrival type" value={values.kind} onChange={(value) => change('kind', value)} options={[{ value: 'walk_in', label: 'Walk-in consultation' }, { value: 'external_test', label: 'Outside clinician’s test request' }]} /><RecordPicker kind="patients" label="Patient" selected={patient} value={values.patientId} error={fields.patientId} onChange={(value, record) => { change('patientId', value); setPatient(record) }} />{values.kind === 'walk_in' ? <RecordPicker kind="doctors" label="Doctor" selected={doctor} value={values.doctorId} error={fields.doctorId} onChange={(value, record) => { change('doctorId', value); setDoctor(record) }} /> : <Field label="Referring clinician" required maxLength={160} value={values.externalClinician} onChange={(value) => change('externalClinician', value)} />}<Field label="Reason for attendance" multiline required maxLength={500} value={values.reason} onChange={(value) => change('reason', value)} /></div><Link to="/patients/new">Patient not registered? Add a patient</Link></>}</WorkflowForm></section></>
}
