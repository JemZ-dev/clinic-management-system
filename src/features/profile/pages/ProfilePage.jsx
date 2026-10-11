import { useState } from 'react'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import { useAuth } from '../../../hooks/useAuth.js'
import { saveProfile } from '../../auth/auth.api.js'
import { apiError } from '../../../lib/api.js'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const [values, setValues] = useState({ name: user.name, phone: user.phone || '' })
  const [fields, setFields] = useState({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  function change(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFields((current) => ({ ...current, [name]: '' })); setSaved(false); setError('')
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setSaved(false); setFields({})
    try {
      const updated = await saveProfile(values)
      setUser(updated); setValues({ name: updated.name, phone: updated.phone }); setSaved(true)
    } catch (failure) { setError(apiError(failure)); setFields(failure.response?.data?.fields || {}) }
    finally { setBusy(false) }
  }

  return <>
    <header className="page-heading"><div><h1>My profile</h1><p>Manage the details associated with your staff account.</p></div></header>
    <div className="profile-layout">
      <section className="profile-form workspace-section" aria-labelledby="personal-details-title">
        <h2 id="personal-details-title">Personal details</h2><p className="section-description">Fields marked with * are required.</p>
        {error && <Alert variant="danger" role="alert">{error}</Alert>}
        {saved && <Alert variant="success" role="status">Your profile has been updated.</Alert>}
        <Form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
          <Form.Group className="mb-4" controlId="profile-name"><Form.Label>Full name <span className="required-marker">*</span></Form.Label><Form.Control name="name" autoComplete="name" value={values.name} onChange={change} required minLength={2} maxLength={100} isInvalid={!!fields.name} aria-describedby="profile-name-error" /><Form.Control.Feedback type="invalid" id="profile-name-error">{fields.name}</Form.Control.Feedback></Form.Group>
          <Form.Group className="mb-4" controlId="profile-phone"><Form.Label>Phone number <span className="optional-label">Optional</span></Form.Label><Form.Control name="phone" type="tel" autoComplete="tel" value={values.phone} onChange={change} maxLength={30} isInvalid={!!fields.phone} aria-describedby="profile-phone-help profile-phone-error" /><Form.Control.Feedback type="invalid" id="profile-phone-error">{fields.phone}</Form.Control.Feedback><Form.Text id="profile-phone-help">Include your country or area code where applicable.</Form.Text></Form.Group>
          <div className="form-actions"><SubmitButton busy={busy}>Save changes</SubmitButton></div>
        </fieldset></Form>
      </section>
      <aside className="profile-account" aria-labelledby="account-details-title"><h2 id="account-details-title">Account details</h2><dl><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Access</dt><dd>Clinic staff</dd></div><div><dt>Member since</dt><dd>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(user.createdAt))}</dd></div></dl><p>Email address and access level cannot be changed from this page.</p></aside>
    </div>
  </>
}
