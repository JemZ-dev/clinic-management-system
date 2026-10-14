import { Access } from '../../../components/ui/Access.jsx'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'
import Form from 'react-bootstrap/Form'
import Modal from 'react-bootstrap/Modal'
import { ArrowLeft, Pencil } from 'lucide-react'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import useApiResource from '../../../hooks/useApiResource.js'
import { api, apiError } from '../../../lib/api.js'
import { formatClinicDate, formatClinicTime, formatClinicTimeRange } from '../../../lib/clinicTime.js'
import AppointmentStatus from '../components/AppointmentStatus.jsx'
import { STATUS_ACTIONS, STATUS_LABELS } from '../appointments.constants.js'

function AppointmentDetails({ record, reload, refreshing }) {
  const location = useLocation()
  const [action, setAction] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState('')
  const backTo = location.state?.backTo?.startsWith('/appointments') ? location.state.backTo : '/appointments'
  async function changeStatus() {
    setBusy(true); setError(''); setConflict(false); setNotice('')
    try {
      await api.patch(`/appointments/${record.id}/status`, { version: record.version, status: action, note })
      setNotice(`Appointment marked ${STATUS_LABELS[action].toLowerCase()}.`)
      setAction(''); reload()
    } catch (failure) { setError(apiError(failure)); setConflict(failure.response?.status === 409) }
    finally { setBusy(false) }
  }
  return <>
    <Link to={backTo} className="record-back"><ArrowLeft size={16} aria-hidden="true" />Back to appointments</Link>
    <header className="page-heading"><div><h1>Appointment details</h1><p>{formatClinicDate(record.startsAt)} · {formatClinicTimeRange(record.startsAt, record.endsAt)} · Manila time</p></div>{record.editable && <Access permission="reception"><Button disabled={refreshing} as={Link} role="link" to={`/appointments/${record.id}/edit`} state={{ backTo }}><Pencil size={16} aria-hidden="true" />Reschedule</Button></Access>}</header>
    {(notice || location.state?.notice) && <Alert variant="success" role="status">{notice || location.state.notice}</Alert>}
    {refreshing && <p className="record-meta" role="status">Refreshing appointment details…</p>}
    <section className="workspace-section" aria-labelledby="appointment-details-title"><div className="section-heading"><h2 id="appointment-details-title">Booking</h2><AppointmentStatus status={record.status} /></div><dl className="record-details">
      <div><dt>Patient</dt><dd>{record.patient ? <Link to={`/patients/${record.patient.id}`}>{record.patient.name}</Link> : 'Patient unavailable'}<span className="record-meta">{record.patient?.patientId}{record.patient?.archivedAt && ' · Archived'}</span></dd></div>
      <div><dt>Doctor</dt><dd>{record.doctor ? <Link to={`/doctors/${record.doctor.id}`}>{record.doctor.name}</Link> : 'Doctor unavailable'}<span className="record-meta">{record.doctor?.specialty}{record.doctor?.archivedAt && ' · Archived'}</span></dd></div>
      <div><dt>Date</dt><dd>{formatClinicDate(record.startsAt)}</dd></div><div><dt>Time (Manila)</dt><dd>{formatClinicTimeRange(record.startsAt, record.endsAt)}<span className="record-meta">{(new Date(record.endsAt) - new Date(record.startsAt)) / 60000} minutes</span></dd></div>
      <div className="detail-full-width"><dt>Reason for appointment</dt><dd>{record.reason || 'Not recorded'}</dd></div>
    </dl></section>
    {record.visitId && <Access permission="clinical"><p><Link to={`/visits/${record.visitId}`} state={{ backTo: `/appointments/${record.id}` }}>View saved visit</Link></p></Access>}
    {record.status === 'checked_in' && !record.visitId && <p><Link to={`/queue?appointmentId=${record.id}&stage=all`}>Open encounter queue</Link> · Continue through assessment and consultation in the patient queue.</p>}
    <Access permission="reception"><section className="workspace-section" aria-labelledby="appointment-actions-title"><h2 id="appointment-actions-title">Manage appointment</h2>

      {record.availableTransitions.length ? <><p className="section-description">Update the status as the patient moves through their appointment.</p><div className="record-actions">{record.availableTransitions.filter((status) => record.status !== 'checked_in' || status === 'completed' && record.visitId).map((status) => <Button disabled={refreshing || busy} variant={status === 'cancelled' || status === 'no_show' ? 'outline-secondary' : 'primary'} key={status} onClick={() => { setError(''); setConflict(false); setNote(''); setAction(status) }}>{STATUS_ACTIONS[status]}</Button>)}</div>{record.status === 'scheduled' && !record.availableTransitions.includes('checked_in') && <p className="record-meta mt-3 mb-0">Check-in becomes available on the appointment day.</p>}</> : <p className="mb-0">This appointment is {STATUS_LABELS[record.status].toLowerCase()}. Its booking details and status history are preserved.</p>}
    </section>
    </Access><section className="workspace-section" aria-labelledby="status-history-title"><h2 id="status-history-title">Status history</h2><ol className="appointment-history">{record.statusHistory.map((entry, index) => <li key={index}><div><AppointmentStatus status={entry.status} /><time dateTime={entry.at}>{formatClinicDate(entry.at)} · {formatClinicTime(entry.at)}</time></div>{entry.note && <p>{entry.note}</p>}</li>)}</ol></section>
    <Modal show={!!action} onHide={() => { if (!busy) setAction('') }} centered backdrop={busy ? 'static' : true} keyboard={!busy} aria-labelledby="appointment-action-title">
      <Modal.Header closeButton={!busy}><Modal.Title id="appointment-action-title">{STATUS_ACTIONS[action]}?</Modal.Title></Modal.Header>
      <Modal.Body><p>{action === 'cancelled' ? 'The booking will remain in the history and its time slot will become available again.' : action === 'no_show' ? 'Record that the patient did not attend this scheduled appointment.' : action === 'completed' ? 'Record that this checked-in appointment has finished.' : 'Add this appointment to the checked-in queue.'}</p><Form.Group controlId="appointment-status-note"><Form.Label>Scheduling note <span className="optional-label">Optional</span></Form.Label><Form.Control as="textarea" rows={3} value={note} maxLength={500} disabled={busy} onChange={(event) => setNote(event.target.value)} /></Form.Group>{error && <Alert variant="danger" role="alert" className="mt-3 mb-0">{error}{conflict && <Button variant="link" onClick={() => { setAction(''); reload() }}>Reload appointment</Button>}</Alert>}</Modal.Body>
      <Modal.Footer><Button variant="outline-secondary" disabled={busy} onClick={() => setAction('')}>Keep current status</Button><Button className="record-mutation-action" variant={action === 'cancelled' ? 'danger' : 'primary'} disabled={busy || conflict} aria-busy={busy} onClick={changeStatus}>{busy ? 'Saving…' : 'Confirm status change'}</Button></Modal.Footer>
    </Modal>
  </>
}

export default function AppointmentDetailsPage() {
  const { id } = useParams()
  const resource = useApiResource(`/appointments/${id}`)
  const [snapshot, setSnapshot] = useState(null)
  if (resource.data && resource.data !== snapshot) setSnapshot(resource.data)
  if (resource.error) return <><Link to="/appointments" className="record-back">Back to appointments</Link><AsyncState title="Unable to open appointment" message={resource.error} onRetry={resource.reload} /></>
  if (!snapshot || snapshot.record.id !== id) return <AsyncState loading title="Loading appointment" message="Fetching the latest booking…" />
  return <AppointmentDetails key={id} record={snapshot.record} reload={resource.reload} refreshing={resource.loading} />
}
