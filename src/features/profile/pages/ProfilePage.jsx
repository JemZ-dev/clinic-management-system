import { ROLE_LABELS } from '../../../../shared/permissions.js'
import { profileFields, profileFieldError, validateProfile } from '../../../../shared/profileValidation.js'
import { useRef, useState } from 'react'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import { LockKeyhole, Pencil } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth.js'
import { saveProfile } from '../../auth/auth.api.js'
import { apiError } from '../../../lib/api.js'
import { clinicToday, formatClinicDate } from '../../../lib/clinicTime.js'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'
import RecordField from '../../../components/records/RecordField.jsx'
import UnsavedChanges from '../../../components/records/UnsavedChanges.jsx'

const editableFields = profileFields
const profileValues = (user) => Object.fromEntries(editableFields.map((key) => [key, key === 'gender' && user[key] === 'non_binary' ? 'other' : user[key] || '']))
const accountDate = (value) => value && !Number.isNaN(new Date(value).valueOf()) ? formatClinicDate(value) : 'Not available'
const genderLabels = { female: 'Female', male: 'Male', non_binary: 'Others', other: 'Others', prefer_not_to_say: 'Prefer not to say' }

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const [values, setValues] = useState(() => profileValues(user))
  const [fields, setFields] = useState({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const editButton = useRef(null)
  const guard = useRef(true)
  const initial = profileValues(user)
  const dirty = editableFields.some((key) => values[key] !== initial[key])
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  function change(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setFields((current) => ({ ...current, [name]: '' })); setSaved(false); setError('')
  }
  function reset() { setValues(initial); setFields({}); setError(''); setSaved(false) }
  function validateField(event) {
    const { name, value, validity } = event.target
    const message = validity.badInput ? 'Enter a complete, valid date of birth.' : profileFieldError(name, value, clinicToday())
    setFields((current) => ({ ...current, [name]: message }))
  }
  function startEditing() {
    reset(); setEditing(true)
    requestAnimationFrame(() => document.getElementById('record-name')?.focus())
  }
  function cancelEditing() {
    reset(); setEditing(false)
    requestAnimationFrame(() => editButton.current?.focus())
  }
  function detail(name, label, value = values[name]) {
    return <dl className={`profile-read-field${value ? '' : ' is-empty'}`}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></dl>
  }
  function field(name, label, props = {}) {
    if (!editing) return detail(name, label, name === 'dateOfBirth' && values[name] ? formatClinicDate(values[name]) : values[name])
    return <RecordField name={name} label={label} value={values[name]} onChange={change} errors={fields} onBlur={validateField} aria-invalid={!!fields[name]} {...props} />
  }
  async function submit(event) {
    event.preventDefault()
    if (busy || !editing || !dirty) return
    const validation = validateProfile(values, clinicToday())
    const birthDateInput = event.currentTarget.elements.namedItem('dateOfBirth')
    if (birthDateInput?.validity.badInput) validation.dateOfBirth = 'Enter a complete, valid date of birth.'
    if (Object.keys(validation).length) {
      setFields(validation); setError('Please check the highlighted fields before saving.'); setSaved(false)
      const first = editableFields.find((name) => validation[name])
      requestAnimationFrame(() => document.getElementById(first === 'gender' ? 'profile-gender' : `record-${first}`)?.focus())
      return
    }
    setBusy(true); setError(''); setSaved(false); setFields({})
    try {
      const updated = await saveProfile(values)
      setUser(updated); setValues(profileValues(updated)); setSaved(true); setEditing(false)
      requestAnimationFrame(() => editButton.current?.focus())
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
      <div className="profile-identity"><h2>{user.name}</h2><p>{[user.jobTitle || ROLE_LABELS[user.role], user.department].filter(Boolean).join(' · ')}</p><span>{user.email}</span></div>
      <span className="profile-access">{ROLE_LABELS[user.role]}</span>
    </section>
    <div className="profile-layout">
      <Form onSubmit={submit} noValidate aria-busy={busy} className="profile-form workspace-section">
        {error && <Alert variant="danger" role="alert" tabIndex={-1} id="profile-error">{error}</Alert>}
        {saved && <Alert variant="success" role="status">Your profile has been updated.</Alert>}
        <fieldset disabled={busy}>
          <section className="profile-field-section" aria-labelledby="personal-details-title">
            <div className="profile-section-heading"><h2 id="personal-details-title">Personal details</h2><p>{editing ? 'Full name, date of birth, and gender are required. Other details are optional.' : 'Your personal and contact information.'}</p></div>
            <div className="profile-field-grid">
              {field('name', 'Full name', { autoComplete: 'name', required: true, minLength: 2, maxLength: 100 })}
              {field('phone', 'Phone number', { type: 'tel', autoComplete: 'tel', maxLength: 30, help: false })}
              {field('dateOfBirth', 'Date of birth', { required: true, type: 'date', autoComplete: 'bday', min: '1900-01-01', max: clinicToday() })}
              {editing ? <Form.Group className="record-field" controlId="profile-gender"><Form.Label>Gender <span className="required-marker">*</span></Form.Label><Form.Select name="gender" required value={values.gender} onChange={(event) => change('gender', event.target.value)} onBlur={validateField} isInvalid={!!fields.gender} aria-invalid={!!fields.gender} aria-describedby={fields.gender ? 'profile-gender-error' : undefined}><option value="" disabled>Select gender</option><option value="female">Female</option><option value="male">Male</option><option value="other">Others</option><option value="prefer_not_to_say">Prefer not to say</option></Form.Select>{fields.gender && <Form.Control.Feedback type="invalid" id="profile-gender-error">{fields.gender}</Form.Control.Feedback>}</Form.Group> : detail('gender', 'Gender', genderLabels[values.gender])}
            </div>
          </section>
          <section className="profile-field-section" aria-labelledby="work-details-title">
            <div className="profile-section-heading"><h2 id="work-details-title">Work details</h2><p>{editing ? 'Help describe your work in the clinic.' : 'Your role and location in the clinic.'}</p></div>
            <div className="profile-field-grid">
              {field('jobTitle', 'Job title', { maxLength: 100, autoComplete: 'organization-title' })}
              {field('department', 'Department', { maxLength: 100 })}
              <div className="full-width">{field('workLocation', 'Work location', { maxLength: 160, help: 'Enter where you usually work in the clinic, such as the front desk or consultation room.' })}</div>
            </div>
          </section>
        </fieldset>
        <div className="profile-save-bar"><span role="status">{busy ? 'Saving your profile…' : dirty ? 'You have unsaved changes.' : editing ? 'Editing your profile.' : 'Your details are up to date.'}</span><div>{editing ? <><Button type="button" variant="link" onClick={cancelEditing} disabled={busy}>Cancel</Button><SubmitButton busy={busy} disabled={!dirty}>Save changes</SubmitButton></> : <Button type="button" ref={editButton} onClick={startEditing}><Pencil size={16} aria-hidden="true" />Edit profile</Button>}</div></div>
      </Form>
      <aside className="profile-account workspace-section" aria-labelledby="account-details-title">
        <div className="profile-account-heading"><LockKeyhole size={18} aria-hidden="true" /><h2 id="account-details-title">Account details</h2></div>
        <dl><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Access level</dt><dd>{ROLE_LABELS[user.role]}</dd></div><div><dt>Member since</dt><dd>{accountDate(user.createdAt)}</dd></div><div><dt>Last profile update</dt><dd>{accountDate(user.updatedAt)}</dd></div></dl>
        <p>Email address and access level cannot be changed from this page.</p>
      </aside>
    </div>
  </>
}
