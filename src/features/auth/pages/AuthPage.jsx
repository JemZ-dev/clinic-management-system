import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth.js'
import { apiError } from '../../../lib/api.js'
import { register, signIn } from '../auth.api.js'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'

export default function AuthPage({ registration = false }) {
  const [values, setValues] = useState({ name: '', email: '', password: '', registrationCode: '' })
  const [fields, setFields] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const change = (event) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFields((current) => ({ ...current, [name]: '' }))
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setFields({})
    try {
      const user = registration ? await register(values) : await signIn({ email: values.email, password: values.password })
      setUser(user)
      const destination = location.state?.from
      navigate(typeof destination === 'string' && destination.startsWith('/') && !destination.startsWith('//') ? destination : '/', { replace: true })
    } catch (failure) {
      setError(apiError(failure)); setFields(failure.response?.data?.fields || {})
    } finally { setBusy(false) }
  }

  return <>
    {registration && <Link to="/login" className="auth-back-link"><ArrowLeft size={18} aria-hidden="true" /><span>Back to sign in</span></Link>}
    <div className="auth-heading">
      <h1>{registration ? 'Create your staff account' : 'Welcome back'}</h1>
      <p>{registration ? 'Register using the access code supplied by your clinic administrator.' : 'Sign in to your clinic workspace.'}</p>
    </div>
    {error && <Alert variant="danger" role="alert">{error}</Alert>}
    <Form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy}>
        {registration && <Form.Group className="mb-3" controlId="staff-name">
          <Form.Label>Full name <span className="required-marker">*</span></Form.Label>
          <Form.Control name="name" autoComplete="name" autoFocus value={values.name} onChange={change} required minLength={2} maxLength={100} isInvalid={!!fields.name} aria-describedby="name-error" />
          <Form.Control.Feedback type="invalid" id="name-error">{fields.name}</Form.Control.Feedback>
        </Form.Group>}
        <Form.Group className="mb-3" controlId="staff-email">
          <Form.Label>Email address <span className="required-marker">*</span></Form.Label>
          <Form.Control name="email" type="email" autoComplete="username" autoFocus={!registration} value={values.email} onChange={change} required maxLength={254} isInvalid={!!fields.email} aria-describedby="email-error" />
          <Form.Control.Feedback type="invalid" id="email-error">{fields.email}</Form.Control.Feedback>
        </Form.Group>
        <Form.Group className="mb-3" controlId="staff-password">
          <Form.Label>Password <span className="required-marker">*</span></Form.Label>
          <div className="password-control">
            <Form.Control name="password" type={showPassword ? 'text' : 'password'} autoComplete={registration ? 'new-password' : 'current-password'} value={values.password} onChange={change} required minLength={registration ? 12 : 1} maxLength={128} isInvalid={!!fields.password} aria-describedby="password-help password-error" />
            <Button type="button" variant="link" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </Button>
          </div>
          {fields.password && <div className="field-error" id="password-error">{fields.password}</div>}
          <Form.Text id="password-help">{registration ? 'Use at least 12 characters. A longer passphrase works well.' : 'Your password is case-sensitive.'}</Form.Text>
        </Form.Group>
        {registration && <Form.Group className="mb-4" controlId="clinic-code">
          <Form.Label>Clinic access code <span className="required-marker">*</span></Form.Label>
          <Form.Control name="registrationCode" type="password" autoComplete="off" value={values.registrationCode} onChange={change} required maxLength={128} isInvalid={!!fields.registrationCode} aria-describedby="code-help code-error" />
          <Form.Control.Feedback type="invalid" id="code-error">{fields.registrationCode}</Form.Control.Feedback>
          <Form.Text id="code-help">This code is required to register a staff account.</Form.Text>
        </Form.Group>}
        <SubmitButton busy={busy} className="w-100">{registration ? 'Create account' : 'Sign in'}</SubmitButton>
      </fieldset>
    </Form>
    <p className="auth-switch">{registration ? 'Already have an account?' : 'Joining the clinic?'}{' '}
      <Link to={registration ? '/login' : '/register'}>{registration ? 'Sign in' : 'Create an account'}</Link>
    </p>
  </>
}
