import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'
import Modal from 'react-bootstrap/Modal'
import { ArrowLeft, Pencil, Archive, RotateCcw, CalendarDays } from 'lucide-react'
import useApiResource from '../../hooks/useApiResource.js'
import { api, apiError } from '../../lib/api.js'
import AsyncState from '../ui/AsyncState.jsx'
import VisitList from '../../features/visits/components/VisitList.jsx'

function Detail({ label, value }) {
  return <div><dt>{label}</dt><dd className={!value ? 'not-recorded' : ''}>{value || 'Not recorded'}</dd></div>
}

function RecordDetails({ config, record, reload }) {
  const location = useLocation()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const patient = config.kind === 'patients'
  const archived = !!record.archivedAt
  const backTo = location.state?.backTo?.startsWith(`/${config.kind}`) ? location.state.backTo : `/${config.kind}`
  async function changeStatus() {
    setBusy(true); setError(''); setNotice(''); setConflict(false)
    try {
      if (archived) await api.post(`/${config.kind}/${record.id}/restore`, { version: record.version })
      else await api.delete(`/${config.kind}/${record.id}`, { data: { version: record.version } })
      setConfirm(false)
      setNotice(`${record.name} ${archived ? 'restored' : 'archived'} successfully.`)
      reload()
    } catch (failure) { setError(apiError(failure)); setConflict(failure.response?.status === 409) }
    finally { setBusy(false) }
  }
  return <>
    <Link to={backTo} className="record-back"><ArrowLeft size={16} aria-hidden="true" />Back to {config.kind}</Link>
    <header className="page-heading record-heading"><div><h1>{record.name}</h1><p>{patient ? record.patientId : record.specialty} · <span className={`record-status ${archived ? 'archived' : ''}`}>{archived ? 'Archived' : 'Active'}</span></p></div><div className="record-actions">
      {!archived && <Button as={Link} role="link" to={`/${config.kind}/${record.id}/edit`} state={{ backTo }}><Pencil size={16} aria-hidden="true" />Edit {config.singular}</Button>}
      {!archived && <Button as={Link} role="link" variant="outline-secondary" to="/appointments/new" state={{ [patient ? 'patient' : 'doctor']: record }}><CalendarDays size={16} aria-hidden="true" />Book appointment</Button>}
      <Button variant="outline-secondary" onClick={() => { setError(''); setConflict(false); setConfirm(true) }}>{archived ? <RotateCcw size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}{archived ? 'Restore' : 'Archive'}</Button>
    </div></header>
    {(notice || location.state?.notice) && <Alert variant="success" role="status">{notice || location.state.notice}</Alert>}
    <p><Link to={`/appointments?${patient ? 'patientId' : 'doctorId'}=${record.id}&date=`} className="inline-action">View {config.singular} appointments</Link></p>
    {archived && <Alert variant="secondary">This record is archived. Its details are preserved; restore it before editing.</Alert>}
    <div className="record-detail-layout">
      <section className="workspace-section" aria-labelledby="details-title"><h2 id="details-title">{patient ? 'Patient details' : 'Doctor details'}</h2><dl className="record-details">
        <Detail label="Full name" value={record.name} />{patient ? <Detail label="Birth date" value={record.dateOfBirth} /> : <Detail label="Specialty" value={record.specialty} />}
        <Detail label="Phone number" value={record.phone} /><Detail label="Email address" value={record.email} />{patient && <Detail label="Address" value={record.address} />}
      </dl></section>
      {patient && <section className="workspace-section" aria-labelledby="emergency-title"><h2 id="emergency-title">Emergency contact</h2><dl className="record-details"><Detail label="Contact name" value={record.emergencyContact?.name} /><Detail label="Relationship" value={record.emergencyContact?.relationship} /><Detail label="Phone number" value={record.emergencyContact?.phone} /></dl></section>}
    </div>
    {patient && <section className="workspace-section" aria-labelledby="history-title"><h2 id="history-title">Medical history</h2><p className="section-description">A blank field means the information has not been recorded.</p><dl className="medical-history-grid"><Detail label="Allergies" value={record.medicalHistory?.allergies} /><Detail label="Existing conditions" value={record.medicalHistory?.conditions} /><Detail label="Past surgeries" value={record.medicalHistory?.pastSurgeries} /><Detail label="Current medications" value={record.medicalHistory?.currentMedications} /></dl></section>}
    <p className="record-meta">Last updated {new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(record.updatedAt))} (Manila time).</p>
    {patient && <><div className="record-actions mb-3">{!archived && <Button as={Link} role="link" to="/visits/new" state={{ patient: record }} variant="outline-secondary">Record visit without appointment</Button>}</div><VisitList key={record.id} patientId={record.id} embedded /></>}
    <Modal show={confirm} onHide={() => { if (!busy) setConfirm(false) }} centered backdrop={busy ? 'static' : true} keyboard={!busy} aria-labelledby="archive-title">
      <Modal.Header closeButton={!busy}><Modal.Title id="archive-title">{archived ? 'Restore' : 'Archive'} {config.singular}?</Modal.Title></Modal.Header>
      <Modal.Body><p className="mb-0">{archived ? `${record.name} will return to the active directory.` : `${record.name} will be removed from the active directory. Their record and history will be preserved, and you can restore them later.`}</p>{error && <Alert variant="danger" className="mt-3 mb-0" role="alert">{error}{conflict && <Button variant="link" onClick={() => { setConfirm(false); reload() }}>Reload record</Button>}</Alert>}</Modal.Body>
      <Modal.Footer><Button variant="outline-secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button><Button className="record-mutation-action" variant={archived ? 'primary' : 'danger'} disabled={busy || conflict} aria-busy={busy} onClick={changeStatus}>{busy ? 'Saving…' : archived ? 'Restore record' : 'Archive record'}</Button></Modal.Footer>
    </Modal>
  </>
}

export default function RecordDetailPage({ config }) {
  const { id } = useParams()
  const resource = useApiResource(`/${config.kind}/${id}`)
  // Keep the details mounted while refreshing so mutation feedback is preserved.
  const [snapshot, setSnapshot] = useState(null)
  if (resource.data && resource.data !== snapshot) setSnapshot(resource.data)
  if (resource.error) return <><Link to={`/${config.kind}`} className="record-back">Back to {config.kind}</Link><AsyncState title="Unable to open record" message={resource.error} onRetry={resource.reload} /></>
  if (!snapshot || snapshot.record.id !== id) return <AsyncState loading title={`Loading ${config.singular}`} message="Fetching the record…" />
  return <RecordDetails key={id} config={config} record={snapshot.record} reload={resource.reload} />
}
