import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import { ArrowLeft } from 'lucide-react'
import RecordField from '../../../components/records/RecordField.jsx'
import UnsavedChanges from '../../../components/records/UnsavedChanges.jsx'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import RecordPicker from '../../appointments/components/RecordPicker.jsx'
import PrescriptionEditor from '../components/PrescriptionEditor.jsx'
import useApiResource from '../../../hooks/useApiResource.js'
import { api, apiError } from '../../../lib/api.js'
import { clinicToday, appointmentFields, formatClinicDate } from '../../../lib/clinicTime.js'

function VisitForm({ appointment }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [initial] = useState(() => ({ patientId: appointment?.patientId || location.state?.patient?.id || '', doctorId: appointment?.doctorId || '', date: clinicToday(), reason: appointment?.reason || '', diagnosis: '', notes: '', treatment: '', prescribedMedicines: '', followUp: '', prescriptions: [] }))
  const [values, setValues] = useState(initial)
  const [patient, setPatient] = useState(appointment?.patient || location.state?.patient || null)
  const [doctor, setDoctor] = useState(appointment?.doctor || null)
  const [requestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [conflict, setConflict] = useState(false)
  const guard = useRef(true)
  const backTo = appointment ? `/appointments/${appointment.id}` : location.state?.patient ? `/patients/${location.state.patient.id}` : '/visits'
  const dirty = JSON.stringify(initial) !== JSON.stringify(values)
  function change(field, value) { setValues((previous) => ({ ...previous, [field]: value })); setErrors((previous) => ({ ...previous, [field]: '' })) }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setErrors({}); setConflict(false)
    try {
      const { data } = await api.post('/visits', { ...values, prescriptions: values.prescriptions.map(({ medicineId, productKey, quantity, instructions }) => ({ medicineId, productKey, quantity: Number(quantity), instructions })), requestId, ...(appointment ? { appointmentId: appointment.id, appointmentVersion: appointment.version } : {}) })
      guard.current = false
      navigate(`/visits/${data.record.id}`, { replace: true, state: { backTo, notice: 'Visit saved successfully.' } })
    } catch (failure) {
      setError(apiError(failure)); setErrors(failure.response?.data?.fields || {}); setConflict(failure.response?.status === 409)
      requestAnimationFrame(() => document.getElementById('visit-form-error')?.focus())
    } finally { setBusy(false) }
  }
  function field(name, label, maxLength, help) { return <RecordField name={name} label={label} value={values[name]} errors={errors} onChange={change} multiline maxLength={maxLength} help={help} required={name === 'reason'} /> }
  return <>
    <UnsavedChanges dirty={dirty} busy={busy} guard={guard} />
    <Link to={backTo} className="record-back"><ArrowLeft size={16} aria-hidden="true" />Back to {appointment ? 'appointment' : location.state?.patient ? 'patient' : 'visits'}</Link>
    <header className="page-heading"><div><h1>Record visit</h1><p>Record what happened during the consultation. Fields marked * are required.</p></div></header>
    <Form className="record-form" onSubmit={save}>
      {error && <Alert variant="danger" role="alert" tabIndex={-1} id="visit-form-error">{error}{conflict && <p className="mb-0 mt-2">Your entries are still here. Open the <Link to={backTo}>latest {appointment ? 'appointment' : 'visit list'}</Link> to check whether the visit was saved before trying again.</p>}</Alert>}
      <fieldset disabled={busy}>
        <section className="workspace-section" aria-labelledby="visit-context-title"><h2 id="visit-context-title">Visit details</h2>
          {appointment ? <><p className="section-description">Linked to the appointment on {formatClinicDate(appointment.startsAt)}. The patient and doctor are fixed for this visit.</p><dl className="record-details"><div><dt>Patient</dt><dd>{patient?.name}<span className="record-meta">{patient?.patientId}</span></dd></div><div><dt>Attending doctor</dt><dd>{doctor?.name}<span className="record-meta">{doctor?.specialty}</span></dd></div></dl><p><Link to={`/patients/${appointment.patientId}`}>Review patient medical history</Link></p></> : <><p className="section-description">This visit will be saved without an appointment. To link a booking, use Record visit from its checked-in appointment.</p><div className="record-form-grid"><RecordPicker kind="patients" label="Patient" selected={patient} value={values.patientId} error={errors.patientId} onChange={(value, record) => { change('patientId', value); setPatient(record) }} /><RecordPicker kind="doctors" label="Attending doctor" selected={doctor} value={values.doctorId} error={errors.doctorId} onChange={(value, record) => { change('doctorId', value); setDoctor(record) }} /></div>{patient && <p><Link to={`/patients/${patient.id}`}>Review patient medical history</Link></p>}</>}
          {appointment && (errors.patientId || errors.doctorId) && <Alert variant="danger">{errors.patientId || errors.doctorId}</Alert>}
          <RecordField name="date" label="Visit date" value={values.date} onChange={change} errors={errors} required type="date" min={appointment ? appointmentFields(appointment.startsAt).date : '1900-01-01'} max={clinicToday()} help="Use the date of the consultation in Manila time." />
        </section>
        <section className="workspace-section" aria-labelledby="visit-notes-title"><h2 id="visit-notes-title">Consultation</h2><p className="section-description">Leave unknown details blank. Enter only findings supplied by the attending clinician.</p><div className="record-form-grid">{field('reason', 'Reason for visit', 500)}{field('diagnosis', 'Recorded diagnosis', 2000)}{field('notes', 'Consultation notes', 4000)}</div></section>
        <section className="workspace-section" aria-labelledby="visit-treatment-title"><h2 id="visit-treatment-title">Treatment and follow-up</h2><div className="record-form-grid">{field('treatment', 'Treatment provided', 4000)}{field('prescribedMedicines', 'Prescribed medicines', 2000, 'Record the clinician’s prescription details. This entry does not dispense stock.')}{field('followUp', 'Follow-up instructions', 2000)}</div></section>
        <PrescriptionEditor value={values.prescriptions} errors={errors} onChange={(value) => change('prescriptions', value)} />
        <p className="record-meta">Saved details are preserved. Use a dated correction or additional note to clarify a saved visit.</p>
        <div className="record-form-actions"><SubmitButton busy={busy}>Save visit</SubmitButton><Button variant="outline-secondary" as={Link} role="link" to={backTo} onClick={(event) => { if (busy) event.preventDefault() }}>Cancel</Button></div>
      </fieldset>
    </Form>
  </>
}
function AppointmentVisit({ id }) {
  const resource = useApiResource(`/appointments/${id}`)
  if (resource.loading) return <AsyncState loading title="Loading appointment" message="Fetching the booking for this visit…" />
  if (resource.error) return <AsyncState title="Unable to open appointment" message={resource.error} onRetry={resource.reload} />
  const record = resource.data.record
  if (record.visitId) return <div className="directory-empty"><h1>This appointment already has a visit</h1><Button as={Link} role="link" to={`/visits/${record.visitId}`}>View saved visit</Button></div>
  if (record.status !== 'checked_in') return <div className="directory-empty"><h1>Check in before recording a visit</h1><p>A linked visit can be saved only for a checked-in appointment.</p><Button as={Link} role="link" to={`/appointments/${id}`}>View appointment</Button></div>
  if (!record.patient || !record.doctor || record.patient.archivedAt || record.doctor.archivedAt) return <div className="directory-empty"><h1>Restore the linked records first</h1><p>The patient and doctor must be active before a new visit can be saved.</p><Button as={Link} role="link" to={`/appointments/${id}`}>View appointment</Button></div>
  return <VisitForm key={id} appointment={record} />
}
export default function VisitFormPage() {
  const [params] = useSearchParams()
  return params.has('appointmentId') ? <AppointmentVisit id={params.get('appointmentId')} /> : <VisitForm />
}
