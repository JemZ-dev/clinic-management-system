import { useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import { ArrowLeft } from 'lucide-react'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'
import RecordField from '../../../components/records/RecordField.jsx'
import UnsavedChanges from '../../../components/records/UnsavedChanges.jsx'
import useApiResource from '../../../hooks/useApiResource.js'
import { api, apiError } from '../../../lib/api.js'
import { formatClinicDate, formatClinicTime } from '../../../lib/clinicTime.js'

function VisitDetails({ record, reload, refreshing, refreshError }) {
  const location = useLocation()
  const [text, setText] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState('')
  const guard = useRef(true)
  const backTo = /^\/(visits|patients|appointments)(\/|\?|$)/.test(location.state?.backTo || '') ? location.state.backTo : '/visits'
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setErrors({}); setConflict(false)
    try {
      await api.post(`/visits/${record.id}/addenda`, { requestId, version: record.version, text })
      setText(''); setRequestId(crypto.randomUUID()); setNotice('Additional note saved. The original visit details are preserved.'); reload()
    } catch (failure) { setError(apiError(failure)); setErrors(failure.response?.data?.fields || {}); setConflict(failure.response?.status === 409) }
    finally { setBusy(false) }
  }
  return <>
    <UnsavedChanges dirty={!!text} busy={busy} guard={guard} />
    <Link to={backTo} className="record-back"><ArrowLeft size={16} aria-hidden="true" />Back to {backTo.startsWith('/patients') ? 'patient' : backTo.startsWith('/appointments') ? 'appointment' : 'visits'}</Link>
    <header className="page-heading"><div><h1>Visit details</h1><p>{formatClinicDate(record.date)} · {record.patient.name}</p></div>{record.appointmentId && <Button as={Link} role="link" variant="outline-secondary" to={`/appointments/${record.appointmentId}`}>View appointment</Button>}</header>
    {(notice || location.state?.notice) && <Alert variant="success" role="status">{notice || location.state.notice}</Alert>}
    {refreshing && <p role="status" className="record-meta">Refreshing visit details…</p>}
    {refreshError && <Alert variant="danger" role="alert">Unable to refresh this visit. {refreshError}<Button variant="link" onClick={reload}>Try again</Button></Alert>}
    <section className="workspace-section" aria-labelledby="saved-visit-context"><h2 id="saved-visit-context">Visit record</h2><dl className="record-details"><div><dt>Patient</dt><dd><Link to={`/patients/${record.patientId}`}>{record.patient.name}</Link><span className="record-meta">{record.patient.patientId}</span></dd></div><div><dt>Attending doctor</dt><dd><Link to={`/doctors/${record.doctorId}`}>{record.doctor.name}</Link><span className="record-meta">{record.doctor.specialty}</span></dd></div><div><dt>Visit date</dt><dd>{formatClinicDate(record.date)}</dd></div><div><dt>Recorded by</dt><dd>{record.author.name}<span className="record-meta">{formatClinicDate(record.createdAt)} · {formatClinicTime(record.createdAt)} (Manila)</span></dd></div></dl><p className="record-meta mb-0">Patient and doctor names are preserved as recorded for this visit.</p></section>
    <section className="workspace-section" aria-labelledby="saved-consultation"><h2 id="saved-consultation">Consultation and treatment</h2><dl className="visit-notes">{[['reason', 'Reason for visit'], ['diagnosis', 'Recorded diagnosis'], ['notes', 'Consultation notes'], ['treatment', 'Treatment provided'], ['prescribedMedicines', 'Prescribed medicines'], ['followUp', 'Follow-up instructions']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd className={record[key] ? '' : 'not-recorded'}>{record[key] || 'Not recorded'}</dd></div>)}</dl></section>
    <section className="workspace-section" aria-labelledby="visit-addenda-title"><h2 id="visit-addenda-title">Corrections and additional notes</h2><p className="section-description">Original details stay unchanged. Read dated notes below alongside the original consultation.</p>
      {record.addenda.length ? <ol className="appointment-history visit-addenda">{record.addenda.map((entry, index) => <li key={index}><div><strong>{entry.author.name}</strong><time dateTime={entry.at}>{formatClinicDate(entry.at)} · {formatClinicTime(entry.at)} (Manila)</time></div><p>{entry.text}</p></li>)}</ol> : <p className="record-meta">No additional notes recorded.</p>}
      {!record.canAddAddendum && <p role="status">This visit has reached the limit of 20 additional notes.</p>}
      {(record.canAddAddendum || text) && <Form onSubmit={save} className="visit-addendum-form">{error && <Alert variant="danger" role="alert">{error}{conflict && <Button type="button" variant="link" onClick={() => { reload(); setConflict(false) }}>Reload latest visit</Button>}</Alert>}<fieldset disabled={busy || refreshing || !!refreshError}><RecordField name="text" label="Correction or additional note" multiline required maxLength={2000} value={text} errors={errors} onChange={(_name, value) => { setText(value); setErrors({}) }} readOnly={!record.canAddAddendum} help="Explain what is corrected or added. Your name and the save time are recorded automatically." /><SubmitButton busy={busy} disabled={conflict || refreshing || !!refreshError || !record.canAddAddendum}>Save additional note</SubmitButton></fieldset></Form>}
    </section>
  </>
}
export default function VisitDetailsPage() {
  const { id } = useParams()
  const resource = useApiResource(`/visits/${id}`)
  const [snapshot, setSnapshot] = useState(null)
  if (resource.data && resource.data !== snapshot) setSnapshot(resource.data)
  if (resource.error && (!snapshot || snapshot.record.id !== id)) return <><Link to="/visits" className="record-back">Back to visits</Link><AsyncState title="Unable to open visit" message={resource.error} onRetry={resource.reload} /></>
  if (!snapshot || snapshot.record.id !== id) return <AsyncState loading title="Loading visit" message="Fetching saved consultation details…" />
  return <VisitDetails key={id} record={snapshot.record} reload={resource.reload} refreshing={resource.loading} refreshError={resource.error} />
}
