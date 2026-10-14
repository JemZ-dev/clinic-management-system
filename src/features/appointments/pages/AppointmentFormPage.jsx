import AvailableSlots from '../../workflow/components/AvailableSlots.jsx'
import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'
import { ArrowLeft } from 'lucide-react'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import RecordField from '../../../components/records/RecordField.jsx'
import UnsavedChanges from '../../../components/records/UnsavedChanges.jsx'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'
import useApiResource from '../../../hooks/useApiResource.js'
import { api, apiError } from '../../../lib/api.js'
import { appointmentFields, clinicToday } from '../../../lib/clinicTime.js'
import RecordPicker from '../components/RecordPicker.jsx'
import NewPatientDialog from '../components/NewPatientDialog.jsx'

function AppointmentForm({ record }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [initial] = useState(() => record ? { patientId: record.patientId || '', doctorId: record.doctorId || '', ...appointmentFields(record.startsAt), reason: record.reason } : { patientId: location.state?.patient?.id || '', doctorId: location.state?.doctor?.id || '', date: location.state?.followUpDate || clinicToday(), time: '', reason: '' })
  const [values, setValues] = useState(initial)
  const [patient, setPatient] = useState(record?.patient || location.state?.patient || null)
  const [doctor, setDoctor] = useState(record?.doctor || location.state?.doctor || null)
  const [busy, setBusy] = useState(false)
  const [addingPatient, setAddingPatient] = useState(false)
  const [savingPatient, setSavingPatient] = useState(false)
  const [patientNotice, setPatientNotice] = useState('')
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [conflict, setConflict] = useState(false)
  const guard = useRef(true)
  const backTo = location.state?.backTo?.startsWith('/appointments') ? location.state.backTo : '/appointments'
  const cancelTo = record ? `/appointments/${record.id}` : backTo
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  function change(field, value) { setValues((previous) => ({ ...previous, [field]: value })); setErrors((previous) => ({ ...previous, [field]: '' })) }
  async function save(event) {
    if (addingPatient || busy) { event.preventDefault(); return }
    event.preventDefault(); setBusy(true); setError(''); setErrors({}); setConflict(false)
    try {
      const response = record ? await api.patch(`/appointments/${record.id}`, { ...values, version: record.version }) : await api.post('/appointments', { ...values, ...(location.state?.encounterId ? { followUpEncounterId: location.state.encounterId } : {}) })
      guard.current = false
      navigate(`/appointments/${response.data.record.id}`, { replace: true, state: { backTo, notice: record ? 'Appointment updated successfully.' : 'Appointment booked successfully.' } })
    } catch (failure) {
      setError(apiError(failure)); setErrors(failure.response?.data?.fields || {})
      setConflict(failure.response?.status === 409 && !failure.response?.data?.fields?.time)
      requestAnimationFrame(() => document.getElementById('appointment-form-error')?.focus())
    } finally { setBusy(false) }
  }
  return <>
    <UnsavedChanges dirty={dirty || addingPatient} busy={busy || savingPatient} guard={guard} />
    {addingPatient && <NewPatientDialog onBusyChange={setSavingPatient} onClose={() => {
      setAddingPatient(false)
      requestAnimationFrame(() => document.getElementById('appointment-patients-select')?.focus())
    }} onSaved={(created) => {
      change('patientId', created.id); setPatient(created); setAddingPatient(false)
      setPatientNotice('Patient record saved. Complete the appointment details and book below.')
    }} />}
    <Link className="record-back" to={cancelTo} state={{ backTo }}><ArrowLeft size={16} aria-hidden="true" />{record ? 'Back to appointment' : 'Back to appointments'}</Link>
    <header className="page-heading"><div><h1>{record ? 'Reschedule appointment' : 'Book appointment'}</h1><p>Appointments last 30 minutes. All dates and times use Manila time.</p></div></header>
    <Form className="record-form" onSubmit={save}>{error && <Alert variant="danger" role="alert" tabIndex={-1} id="appointment-form-error">{error}{conflict && record && <p className="mb-0 mt-2">Your entries are still here. Open the <Link to={`/appointments/${record.id}`} state={{ backTo }}>latest appointment</Link> before editing again.</p>}</Alert>}
      <fieldset disabled={busy}>
        <section className="workspace-section" aria-labelledby="appointment-people-title"><h2 id="appointment-people-title">Patient and doctor</h2><p className="section-description">Search the active directories, then select a record. Fields marked * are required.</p><div className="record-form-grid">
          <div><RecordPicker kind="patients" label="Patient" value={values.patientId} selected={patient} error={errors.patientId} onChange={(value, selected) => { change('patientId', value); setPatient(selected); setPatientNotice('') }} />
            {!record && !location.state?.encounterId && <Button type="button" className="mt-2" variant="outline-secondary" onClick={() => setAddingPatient(true)}>New patient</Button>}
          </div>
          <RecordPicker kind="doctors" label="Doctor" value={values.doctorId} selected={doctor} error={errors.doctorId} onChange={(value, selected) => { change('doctorId', value); setDoctor(selected) }} />
        </div>{patientNotice && <Alert variant="success" role="status" className="mt-3 mb-0">{patientNotice}</Alert>}</section>
        <section className="workspace-section" aria-labelledby="appointment-time-title"><h2 id="appointment-time-title">Schedule</h2><AvailableSlots doctorId={values.doctorId} date={values.date} onSelect={(time) => change('time', time)} /><div className="record-form-grid">
          <RecordField name="date" label="Date" value={values.date} onChange={change} errors={errors} required type="date" min={clinicToday()} />
          <RecordField name="time" label="Start time" value={values.time} onChange={change} errors={errors} required type="time" step={1800} help="Choose a time on the hour or half-hour, such as 09:00 or 09:30." />
          <RecordField name="reason" label="Reason for appointment" value={values.reason} onChange={change} errors={errors} multiline maxLength={500} help="Add a short reason for the visit, if known." />
        </div></section>
        <div className="record-form-actions"><SubmitButton busy={busy}>{record ? 'Save appointment' : 'Book appointment'}</SubmitButton><Button variant="outline-secondary" as={Link} to={cancelTo} state={{ backTo }} onClick={(event) => { if (busy) event.preventDefault() }}>Cancel</Button></div>
      </fieldset>
    </Form>
  </>
}

function EditAppointment() {
  const { id } = useParams()
  const resource = useApiResource(`/appointments/${id}`)
  if (resource.loading) return <AsyncState loading title="Loading appointment" message="Fetching the latest booking…" />
  if (resource.error) return <><Link to="/appointments" className="record-back">Back to appointments</Link><AsyncState title="Unable to open appointment" message={resource.error} onRetry={resource.reload} /></>
  if (!resource.data.record.editable) return <div className="directory-empty"><h1>This appointment cannot be edited</h1><p>Only scheduled appointments can be rescheduled.</p><Button as={Link} to={`/appointments/${id}`}>View appointment</Button></div>
  return <AppointmentForm key={id} record={resource.data.record} />
}
export default function AppointmentFormPage({ editing = false }) { return editing ? <EditAppointment /> : <AppointmentForm /> }
