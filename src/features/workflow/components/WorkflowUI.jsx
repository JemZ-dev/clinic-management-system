import useConfirmDialog from '../../../hooks/useConfirmDialog.jsx'
import { useId, useRef, useState } from 'react'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import AsyncState from '../../../components/ui/AsyncState.jsx'
import UnsavedChanges from '../../../components/records/UnsavedChanges.jsx'
import { apiError } from '../../../lib/api.js'
import PhoneInput from '../../../components/records/PhoneInput.jsx'

export function WorkflowResource({ resource, children }) {
  if (resource.error) return <AsyncState title="Unable to load records" message={resource.error} onRetry={resource.reload} />
  if (resource.loading || !resource.data) return <AsyncState loading title="Loading records" message="Fetching the latest clinic information…" />
  return children(resource.data)
}
export function Field({ label, value, onChange, options, multiline, help, error, ...props }) {
  const id = useId()
  if (props.type === 'tel') {
    return <Form.Group controlId={id} className="workflow-field"><Form.Label>{label}{props.required && <span className="required-marker"> *</span>}</Form.Label>
      <PhoneInput {...props} id={id} value={value ?? ''} error={error} help={help} onChange={(event) => onChange(event.target.value)} />
    </Form.Group>
  }
  return <Form.Group controlId={id} className="workflow-field"><Form.Label>{label}{props.required && <span className="required-marker"> *</span>}</Form.Label>
    {options ? <Form.Select {...props} value={value} onChange={(event) => onChange(event.target.value)} isInvalid={!!error} aria-describedby={help || error ? `${id}-help` : undefined}>{options.map((option) => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>)}</Form.Select> : <Form.Control {...props} as={multiline ? 'textarea' : 'input'} rows={multiline ? 3 : undefined} value={value ?? ''} onChange={(event) => onChange(event.target.value)} isInvalid={!!error} aria-describedby={help || error ? `${id}-help` : undefined} />}
    {(error || help) && <div id={`${id}-help`} className={error ? 'field-error' : 'form-text'}>{error || help}</div>}
  </Form.Group>
}
export function WorkflowForm({ initial, onSave, children, submitLabel = 'Save changes', guardChanges = true }) {
  const [values, setValues] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState({})
  const [notice, setNotice] = useState('')
  const guard = useRef(true)
  const alert = useRef(null)
  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  function change(key, value) { setValues((previous) => ({ ...previous, [key]: value })); setFields((previous) => ({ ...previous, [key]: '' })); setNotice('') }
  async function submit(event) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError(''); setFields({}); setNotice('')
    try { await onSave(values, () => { guard.current = false }); setSaved(values); setNotice('Saved successfully.') }
    catch (failure) { setError(apiError(failure)); setFields(failure.response?.data?.fields || {}); requestAnimationFrame(() => alert.current?.focus()) }
    finally { setBusy(false) }
  }
  return <Form onSubmit={submit} className="workflow-form" aria-busy={busy}>
    {guardChanges && <UnsavedChanges dirty={dirty} busy={busy} guard={guard} />}
    {error && <Alert ref={alert} tabIndex={-1} variant="danger" role="alert">{error}{Object.entries(fields).length > 0 && <ul className="mb-0">{Object.entries(fields).map(([field, message]) => <li key={field}>{field}: {message}</li>)}</ul>}</Alert>}
    {notice && <Alert variant="success" role="status">{notice}</Alert>}
    <fieldset disabled={busy}>{children({ values, change, fields, busy, dirty })}<div className="record-form-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button></div></fieldset>
  </Form>
}
export function ActionButton({ children, onAction, confirm, variant = 'outline-secondary', ...props }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const { confirm: askConfirmation, dialog } = useConfirmDialog()
  return <span className="workflow-action">{dialog}<Button {...props} variant={variant} disabled={busy || props.disabled} onClick={async () => {
    if (confirm && !await askConfirmation(confirm, { title: 'Confirm action', confirmLabel: typeof children === 'string' ? children : 'Continue', variant })) return
    setBusy(true); setError('')
    try { await onAction() } catch (failure) { setError(apiError(failure)) } finally { setBusy(false) }
  }}>{busy ? 'Saving…' : children}</Button>{error && <span role="alert" className="field-error">{error}</span>}</span>
}
