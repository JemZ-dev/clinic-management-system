import { Access } from '../ui/Access.jsx'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'
import Modal from 'react-bootstrap/Modal'
import { ArrowLeft, Pencil, Archive, RotateCcw, CalendarDays } from 'lucide-react'
import useApiResource from '../../hooks/useApiResource.js'
import { api, apiError } from '../../lib/api.js'
import AsyncState from '../ui/AsyncState.jsx'
import ArchivedLabel from '../ui/ArchivedLabel.jsx'
import VisitList from '../../features/visits/components/VisitList.jsx'

function Detail({ label, value }) {
  return <div><dt>{label}</dt><dd className={!value ? 'not-recorded' : ''}>{value || 'Not recorded'}</dd></div>
}

const profileGenderLabels = { female: 'Female', male: 'Male', non_binary: 'Others', other: 'Others', prefer_not_to_say: 'Prefer not to say' }

function RecordDetails({ config, record, reload }) {
  const location = useLocation()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [archiveBlocked, setArchiveBlocked] = useState(false)
  const patient = config.kind === 'patients'
  const archived = !!record.archivedAt
  const backTo = location.state?.backTo?.startsWith(`/${config.kind}`) ? location.state.backTo : `/${config.kind}`
  async function changeStatus() {
    setBusy(true); setError(''); setNotice(''); setConflict(false); setArchiveBlocked(false)
    try {
      if (archived) await api.post(`/${config.kind}/${record.id}/restore`, { version: record.version })
      else await api.delete(`/${config.kind}/${record.id}`, { data: { version: record.version } })
      setConfirm(false)
      setNotice(`${record.name} ${archived ? 'restored' : 'archived'} successfully.`)
      reload()
    } catch (failure) {
      const blocked = !!failure.response?.data?.fields?.appointments
      setError(apiError(failure)); setArchiveBlocked(blocked); setConflict(failure.response?.status === 409 && !blocked)
    }
    finally { setBusy(false) }
  }
  return <>
    <Link to={backTo} className="record-back"><ArrowLeft size={16} aria-hidden="true" />Back to {config.kind}</Link>
    <header className="page-heading record-heading"><div><h1>{record.name}</h1><p>{patient ? record.patientId : record.specialty} · <span className={`record-status ${archived ? 'archived' : ''}`}>{archived ? <ArchivedLabel /> : 'Active'}</span></p></div><div className="record-actions">
      {!archived && <Access permission={patient ? 'reception' : 'accounts'}><Button as={Link} role="link" to={`/${config.kind}/${record.id}/edit`} state={{ backTo }}><Pencil size={16} aria-hidden="true" />Edit {config.singular}</Button></Access>}
      {!archived && <Access permission="reception"><Button as={Link} role="link" variant="outline-secondary" to="/appointments/new" state={{ [patient ? 'patient' : 'doctor']: record }}><CalendarDays size={16} aria-hidden="true" />Book appointment</Button></Access>}
      <Access permission={patient ? 'reception' : 'accounts'}><Button variant="outline-secondary" onClick={() => { setError(''); setConflict(false); setArchiveBlocked(false); setConfirm(true) }}>{archived ? <RotateCcw size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}{archived ? 'Restore' : 'Archive'}</Button></Access>
    </div></header>
    {(notice || location.state?.notice) && <Alert variant="success" role="status">{notice || location.state.notice}</Alert>}
    <p><Link to={`/appointments?${patient ? 'patientId' : 'doctorId'}=${record.id}&date=`} className="inline-action">View {config.singular} appointments</Link></p>
    {archived && <Alert variant="secondary">This record is archived. Its details are preserved; restore it before editing.</Alert>}
    <div className="record-detail-layout">
      <section className="workspace-section" aria-labelledby="details-title"><h2 id="details-title">{patient ? 'Patient details' : 'Doctor details'}</h2><dl className="record-details">
        <Detail label="Full name" value={record.name} />{patient ? <Detail label="Birth date" value={record.dateOfBirth} /> : <Detail label="Specialty" value={record.specialty} />}
        <Detail label="Phone number" value={record.phone} /><Detail label="Email address" value={record.email} />{patient && <><Detail label="Gender" value={record.gender?.replaceAll('_', ' ')} /><Detail label="Address" value={record.address} /></>}
      </dl></section>
      {!patient && <section className="workspace-section" aria-labelledby="doctor-profile-title"><h2 id="doctor-profile-title">Personal and work details</h2><p className="section-description">{record.profile ? 'From the doctor’s linked staff profile.' : 'No staff profile is linked to this doctor yet.'}</p><dl className="record-details">
        <Detail label="Profile name" value={record.profile?.name} /><Detail label="Gender" value={profileGenderLabels[record.profile?.gender]} />
        <Detail label="Birth date" value={record.profile?.dateOfBirth} /><Detail label="Profile phone number" value={record.profile?.phone} />
        <Detail label="Profile email address" value={record.profile?.email} /><Detail label="Job title" value={record.profile?.jobTitle} />
        <Detail label="Department" value={record.profile?.department} /><Detail label="Work location" value={record.profile?.workLocation} />
        <Detail label="Staff account status" value={record.profile ? record.profile.active === false ? 'Inactive' : 'Active' : undefined} />
      </dl></section>}
      {patient && <section className="workspace-section" aria-labelledby="emergency-title"><h2 id="emergency-title">Emergency contact</h2><dl className="record-details"><Detail label="Contact name" value={record.emergencyContact?.name} /><Detail label="Relationship" value={record.emergencyContact?.relationship} /><Detail label="Phone number" value={record.emergencyContact?.phone} /></dl></section>}
      {patient && <section className="workspace-section"><h2>Parent or guardian</h2><dl className="record-details"><Detail label="Guardian name" value={record.guardian?.name} /><Detail label="Relationship" value={record.guardian?.relationship} /><Detail label="Phone number" value={record.guardian?.phone} /></dl></section>}
    </div>
    {patient && <section className="workspace-section" aria-labelledby="history-title"><h2 id="history-title">Medical history</h2><p className="section-description">A blank field means the information has not been recorded.</p><dl className="medical-history-grid"><Detail label="Allergies" value={record.medicalHistory?.allergies} /><Detail label="Existing conditions" value={record.medicalHistory?.conditions} /><Detail label="Past surgeries" value={record.medicalHistory?.pastSurgeries} /><Detail label="Current medications" value={record.medicalHistory?.currentMedications} /></dl></section>}
    <p><Link to={`/queue?patientId=${record.id}&stage=all`}>View encounter history, assessments, tests, and billing</Link></p><p className="record-meta">Last updated {new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(record.updatedAt))} (Manila time).</p>
    {patient && <><div className="record-actions mb-3">{!archived && <Access permission="reception"><Button as={Link} role="link" to="/queue/new" state={{ patient: record }} variant="outline-secondary">Register walk-in</Button></Access>}</div><Access permission="clinical"><VisitList key={record.id} patientId={record.id} embedded /></Access></>}
    <Modal show={confirm} onHide={() => { if (!busy) setConfirm(false) }} centered backdrop={busy ? 'static' : true} keyboard={!busy} aria-labelledby="archive-title">
      <Modal.Header closeButton={!busy}><Modal.Title id="archive-title">{archived ? 'Restore' : 'Archive'} {config.singular}?</Modal.Title></Modal.Header>
      <Modal.Body><p className="mb-0">{archived ? `${record.name} will return to the active directory.` : `${record.name} will be removed from the active directory. Their record and history will be preserved, and you can restore them later.`}</p>{error && <Alert variant="danger" className="mt-3 mb-0" role="alert">{error}{conflict && <Button variant="link" onClick={() => { setConfirm(false); reload() }}>Reload record</Button>}{archiveBlocked && <div className="mt-2"><Link to={`/appointments?patientId=${record.id}&status=scheduled&date=`}>View scheduled appointments</Link></div>}</Alert>}</Modal.Body>
      <Modal.Footer><Button variant="outline-secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button><Button className="record-mutation-action" variant={archived ? 'primary' : 'danger'} disabled={busy || conflict || archiveBlocked} aria-busy={busy} onClick={changeStatus}>{busy ? 'Saving…' : archived ? 'Restore record' : 'Archive record'}</Button></Modal.Footer>
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
