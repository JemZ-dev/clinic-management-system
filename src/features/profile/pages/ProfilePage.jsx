import { useRef, useState } from 'react'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import { LockKeyhole } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth.js'
import { saveProfile } from '../../auth/auth.api.js'
import { apiError } from '../../../lib/api.js'
import { clinicToday, formatClinicDate } from '../../../lib/clinicTime.js'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'
import RecordField from '../../../components/records/RecordField.jsx'
import UnsavedChanges from '../../../components/records/UnsavedChanges.jsx'

const editableFields = ['name', 'phone', 'gender', 'dateOfBirth', 'jobTitle', 'department', 'workLocation']
const profileValues = (user) => Object.fromEntries(editableFields.map((key) => [key, user[key] || '']))
const accountDate = (value) => value && !Number.isNaN(new Date(value).valueOf()) ? formatClinicDate(value) : 'Not available'

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const [values, setValues] = useState(() => profileValues(user))
  const [fields, setFields] = useState({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const guard = useRef(true)
  const initial = profileValues(user)
  const dirty = editableFields.some((key) => values[key] !== initial[key])
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  function change(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setFields((current) => ({ ...current, [name]: '' })); setSaved(false); setError('')
  }
  function reset() { setValues(initial); setFields({}); setError(''); setSaved(false) }
  function field(name, label, props = {}) {
    return <RecordField name={name} label={label} value={values[name]} onChange={change} errors={fields} {...props} />
  }
  async function submit(event) {
    event.preventDefault()
    if (busy || !dirty) return
    setBusy(true); setError(''); setSaved(false); setFields({})
    try {
      const updated = await saveProfile(values)
      setUser(updated); setValues(profileValues(updated)); setSaved(true)
    } catch (failure) {
      setError(apiError(failure)); setFields(failure.response?.data?.fields || {})
      requestAnimationFrame(() => document.getElementById('profile-error')?.focus())
    } finally { setBusy(false) }
  }

  return <>
    <UnsavedChanges dirty={dirty} busy={busy} guard={guard} />
    <header className="page-heading"><div><h1>My profile</h1><p>Your personal details and place in the clinic.</p></div></header>
    <section className="profile-summary" aria-label="Your staff profile">
      <span className="profile-avatar" aria-hidden="true">{initials}</span>
      <div className="profile-identity"><h2>{user.name}</h2><p>{[user.jobTitle || 'Clinic staff', user.department].filter(Boolean).join(' · ')}</p><span>{user.email}</span></div>
      <span className="profile-access">Clinic staff</span>
    </section>
    <div className="profile-layout">
      <Form onSubmit={submit} aria-busy={busy} className="profile-form workspace-section">
        {error && <Alert variant="danger" role="alert" tabIndex={-1} id="profile-error">{error}</Alert>}
        {saved && <Alert variant="success" role="status">Your profile has been updated.</Alert>}
        <fieldset disabled={busy}>
          <section className="profile-field-section" aria-labelledby="personal-details-title">
            <div className="profile-section-heading"><h2 id="personal-details-title">Personal details</h2><p>Full name is required. Other details are optional.</p></div>
            <div className="profile-field-grid">
              {field('name', 'Full name', { autoComplete: 'name', required: true, minLength: 2, maxLength: 100 })}
              {field('phone', 'Phone number', { type: 'tel', autoComplete: 'tel', maxLength: 30 })}
              {field('dateOfBirth', 'Date of birth', { type: 'date', autoComplete: 'bday', min: '1900-01-01', max: clinicToday() })}
              <Form.Group className="record-field" controlId="profile-gender"><Form.Label>Gender <span className="optional-label">Optional</span></Form.Label><Form.Select name="gender" value={values.gender} onChange={(event) => change('gender', event.target.value)} isInvalid={!!fields.gender} aria-describedby={fields.gender ? 'profile-gender-error' : undefined}><option value="">Not provided</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="other">Another identity</option><option value="prefer_not_to_say">Prefer not to say</option></Form.Select>{fields.gender && <Form.Control.Feedback type="invalid" id="profile-gender-error">{fields.gender}</Form.Control.Feedback>}</Form.Group>
            </div>
          </section>
          <section className="profile-field-section" aria-labelledby="work-details-title">
            <div className="profile-section-heading"><h2 id="work-details-title">Work details</h2><p>Help describe your work in the clinic.</p></div>
            <div className="profile-field-grid">
              {field('jobTitle', 'Job title', { maxLength: 100, autoComplete: 'organization-title' })}
              {field('department', 'Department', { maxLength: 100 })}
              <div className="full-width">{field('workLocation', 'Work location', { maxLength: 160, help: 'For example, Reception or Consultation room. These details do not change your account access.' })}</div>
            </div>
          </section>
          <div className="profile-save-bar"><span role="status">{busy ? 'Saving your profile…' : dirty ? 'You have unsaved changes.' : 'Your details are up to date.'}</span><div><Button variant="link" onClick={reset} disabled={!dirty || busy}>Reset changes</Button><SubmitButton busy={busy} disabled={!dirty}>Save changes</SubmitButton></div></div>
        </fieldset>
      </Form>
      <aside className="profile-account workspace-section" aria-labelledby="account-details-title">
        <div className="profile-account-heading"><LockKeyhole size={18} aria-hidden="true" /><h2 id="account-details-title">Account details</h2></div>
        <dl><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Access level</dt><dd>Clinic staff</dd></div><div><dt>Member since</dt><dd>{accountDate(user.createdAt)}</dd></div><div><dt>Last profile update</dt><dd>{accountDate(user.updatedAt)}</dd></div></dl>
        <p>Email address and access level cannot be changed from this page.</p>
      </aside>
    </div>
  </>
}
