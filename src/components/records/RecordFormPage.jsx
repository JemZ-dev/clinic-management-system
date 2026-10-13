import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import { ArrowLeft } from 'lucide-react'
import useApiResource from '../../hooks/useApiResource.js'
import { api, apiError } from '../../lib/api.js'
import AsyncState from '../ui/AsyncState.jsx'
import SubmitButton from '../ui/SubmitButton.jsx'
import RecordField from './RecordField.jsx'
import UnsavedChanges from './UnsavedChanges.jsx'

function clinicToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function RecordForm({ config, record }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [initial] = useState(() => record ? Object.fromEntries(config.fields.map((field) => [field, record[field] ?? structuredClone(config.defaults[field])])) : structuredClone(config.defaults))
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false)
  const guard = useRef(true)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  const patient = config.kind === 'patients'
  const backTo = location.state?.backTo?.startsWith(`/${config.kind}`) ? location.state.backTo : `/${config.kind}`
  const cancelTo = record ? `/${config.kind}/${record.id}` : backTo
  function change(name, value) {
    const [group, field] = name.split('.')
    setValues((previous) => field ? { ...previous, [group]: { ...previous[group], [field]: value } } : { ...previous, [name]: value })
    setErrors((previous) => ({ ...previous, [name]: '' }))
  }
  function field(name, label, props = {}) {
    const [group, child] = name.split('.')
    return <RecordField name={name} label={label} value={child ? values[group][child] : values[name]} onChange={change} errors={errors} {...props} />
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true); setError(''); setErrors({}); setConflict(false)
    try {
      const response = record ? await api.patch(`/${config.kind}/${record.id}`, { ...values, version: record.version }) : await api.post(`/${config.kind}`, { ...values, ...(patient ? { duplicateAcknowledged } : {}) })
      guard.current = false
      navigate(`/${config.kind}/${response.data.record.id}`, { replace: true, state: { backTo, notice: `${config.singular === 'patient' ? 'Patient' : 'Doctor'} ${record ? 'updated' : 'added'} successfully.` } })
    } catch (failure) {
      setError(apiError(failure)); setErrors(failure.response?.data?.fields || {}); setConflict(failure.response?.status === 409)
      requestAnimationFrame(() => document.getElementById('record-form-error')?.focus())
    } finally { setBusy(false) }
  }
  return <>
    <UnsavedChanges dirty={dirty} busy={busy} guard={guard} />
    <Link to={cancelTo} state={{ backTo }} className="record-back"><ArrowLeft size={16} aria-hidden="true" />{record ? `Back to ${config.singular}` : `Back to ${config.kind}`}</Link>
    <header className="page-heading"><div><h1>{record ? 'Edit' : 'Add'} {config.singular}</h1><p>{patient ? 'Keep the patient’s details and medical history accurate.' : 'Maintain the doctor’s directory and contact details.'}</p></div></header>
    <Form onSubmit={save} className="record-form">
      {error && <Alert variant="danger" role="alert" tabIndex={-1} id="record-form-error">{error}{conflict && record && <p className="mb-0 mt-2">Your changes are still here. Open the <Link to={`/${config.kind}/${record.id}`} state={{ backTo }}>latest record</Link> before editing again.</p>}</Alert>}
      {errors.duplicate && <Alert variant="warning"><Link to={`/patients?q=${encodeURIComponent(values.name)}`}>Review existing patients</Link><Form.Check id="confirm-separate-patient" label="I verified that this is a different person" checked={duplicateAcknowledged} onChange={(event) => setDuplicateAcknowledged(event.target.checked)} /></Alert>}
      <fieldset disabled={busy}>
        <section className="workspace-section" aria-labelledby="basic-form-title"><h2 id="basic-form-title">{patient ? 'Patient details' : 'Doctor details'}</h2><p className="section-description">Fields marked * are required.</p><div className="record-form-grid">
          {field('name', 'Full name', { required: true, maxLength: 100, autoComplete: 'off' })}
          {patient ? field('dateOfBirth', 'Birth date', { required: true, type: 'date', min: '1900-01-01', max: clinicToday() }) : field('specialty', 'Specialty', { required: true, maxLength: 100, help: 'For example, Family medicine.' })}
          {patient && <Form.Group controlId="patient-gender"><Form.Label>Gender <span className="optional-label">Optional</span></Form.Label><Form.Select value={values.gender || ''} onChange={(event) => change('gender', event.target.value)}>{[['', 'Not recorded'], ['female', 'Female'], ['male', 'Male'], ['non_binary', 'Non-binary'], ['other', 'Other'], ['prefer_not_to_say', 'Prefer not to say']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Form.Group>}
          {field('phone', 'Phone number', { type: 'tel', maxLength: 30, autoComplete: 'off' })}
          {field('email', 'Email address', { type: 'email', maxLength: 254, autoComplete: 'off' })}
          {patient && field('address', 'Address', { multiline: true, maxLength: 500, autoComplete: 'off' })}
        </div></section>
        {patient && <>
          <section className="workspace-section"><h2>Guardian, if applicable</h2><div className="record-form-grid">{field('guardian.name', 'Guardian name', { maxLength: 100 })}{field('guardian.relationship', 'Relationship to patient', { maxLength: 80 })}{field('guardian.phone', 'Guardian phone', { maxLength: 30, type: 'tel' })}</div></section>
          <section className="workspace-section" aria-labelledby="emergency-form-title"><h2 id="emergency-form-title">Emergency contact</h2><div className="record-form-grid">
            {field('emergencyContact.name', 'Contact name', { maxLength: 100, autoComplete: 'off' })}
            {field('emergencyContact.relationship', 'Relationship', { maxLength: 80 })}
            {field('emergencyContact.phone', 'Contact phone number', { type: 'tel', maxLength: 30, autoComplete: 'off' })}
          </div></section>
          <section className="workspace-section" aria-labelledby="history-form-title"><h2 id="history-form-title">Medical history</h2><p className="section-description">Leave unknown information blank. Record “None reported” only when confirmed with the patient.</p><div className="record-form-grid">
            {field('medicalHistory.allergies', 'Allergies', { multiline: true, maxLength: 2000 })}
            {field('medicalHistory.conditions', 'Existing conditions', { multiline: true, maxLength: 2000 })}
            {field('medicalHistory.pastSurgeries', 'Past surgeries', { multiline: true, maxLength: 2000 })}
            {field('medicalHistory.currentMedications', 'Current medications', { multiline: true, maxLength: 2000 })}
          </div></section>
        </>}
        <div className="record-form-actions"><SubmitButton busy={busy}>Save {config.singular}</SubmitButton><Button variant="outline-secondary" as={Link} to={cancelTo} state={{ backTo }} aria-disabled={busy} onClick={(event) => { if (busy) event.preventDefault() }}>Cancel</Button></div>
      </fieldset>
    </Form>
  </>
}

function EditRecord({ config }) {
  const { id } = useParams()
  const resource = useApiResource(`/${config.kind}/${id}`)
  if (resource.loading) return <AsyncState loading title={`Loading ${config.singular}`} message="Fetching the latest record…" />
  if (resource.error) return <><Link to={`/${config.kind}`} className="record-back">Back to {config.kind}</Link><AsyncState title="Unable to open record" message={resource.error} onRetry={resource.reload} /></>
  if (resource.data.record.archivedAt) return <div className="directory-empty"><h1>This record is archived</h1><p>Restore it from the record page before editing.</p><Button as={Link} to={`/${config.kind}/${id}`}>View record</Button></div>
  return <RecordForm key={id} config={config} record={resource.data.record} />
}

export default function RecordFormPage({ config, editing = false }) {
  return editing ? <EditRecord config={config} /> : <RecordForm config={config} />
}
