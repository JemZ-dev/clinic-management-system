import { useId, useRef, useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'
import RecordField from '../../../components/records/RecordField.jsx'
import SubmitButton from '../../../components/ui/SubmitButton.jsx'
import useConfirmDialog from '../../../hooks/useConfirmDialog.jsx'
import { api, apiError } from '../../../lib/api.js'
import { clinicToday } from '../../../lib/clinicTime.js'

const empty = { name: '', dateOfBirth: '', gender: '', phone: '', email: '' }

export default function NewPatientDialog({ onSaved, onClose, onBusyChange }) {
  const id = useId()
  const errorRef = useRef(null)
  const [values, setValues] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [acknowledged, setAcknowledged] = useState(false)
  const { confirm, dialog } = useConfirmDialog()
  const dirty = Object.values(values).some((value) => value !== '')
  function change(name, value) {
    setValues((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => {
      const next = { ...previous, [name]: '' }
      if (['name', 'dateOfBirth'].includes(name)) delete next.duplicate
      return next
    })
    if (['name', 'dateOfBirth'].includes(name)) setAcknowledged(false)
  }
  async function close() {
    if (busy) return
    if (dirty) {
      setConfirming(true)
      const accepted = await confirm('The new patient has not been saved. Your appointment entries will be kept.', {
        title: 'Discard new patient details?', confirmLabel: 'Discard details', cancelLabel: 'Keep editing', variant: 'danger',
      })
      setConfirming(false)
      if (!accepted) return
    }
    onClose()
  }
  async function save(event) {
    event.preventDefault()
    event.stopPropagation()
    if (busy) return
    setBusy(true); onBusyChange(true); setError(''); setErrors({})
    try {
      const response = await api.post('/patients', { ...values, duplicateAcknowledged: acknowledged })
      onSaved(response.data.record)
    } catch (failure) {
      setError(apiError(failure))
      setErrors(failure.response?.data?.fields || {})
      requestAnimationFrame(() => errorRef.current?.focus())
    } finally { setBusy(false); onBusyChange(false) }
  }
  const field = (name, label, props = {}) => <RecordField name={name} label={label} value={values[name]} onChange={change} errors={errors} {...props} />
  return <>{dialog}<Modal show onHide={close} backdrop="static" keyboard={!busy} enforceFocus={!confirming} centered scrollable aria-labelledby={`${id}-title`}>
    <Modal.Header closeButton={!busy}><Modal.Title id={`${id}-title`}>New patient</Modal.Title></Modal.Header>
    <Modal.Body>
      <p>Save their basic details, then continue booking. You can add other patient information later.</p>
      <Form id={`${id}-form`} onSubmit={save}>
        {error && <Alert variant="danger" role="alert" tabIndex={-1} ref={errorRef}>{error}</Alert>}
        <fieldset disabled={busy}>
          <div className="record-form-grid">
            {field('name', 'Full name', { required: true, minLength: 2, maxLength: 100, autoFocus: true })}
            {field('dateOfBirth', 'Birth date', { required: true, type: 'date', min: '1900-01-01', max: clinicToday() })}
            <Form.Group controlId={`${id}-gender`}>
              <Form.Label>Gender <span className="required-marker">*</span></Form.Label>
              <Form.Select required value={values.gender} onChange={(event) => change('gender', event.target.value)} isInvalid={!!errors.gender} aria-describedby={errors.gender ? `${id}-gender-error` : undefined}>
                <option value="" disabled>Select gender</option>
                {[['female', 'Female'], ['male', 'Male'], ['non_binary', 'Non-binary'], ['other', 'Other'], ['prefer_not_to_say', 'Prefer not to say']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Form.Select>
              {errors.gender && <Form.Control.Feedback type="invalid" id={`${id}-gender-error`}>{errors.gender}</Form.Control.Feedback>}
            </Form.Group>
            {field('phone', 'Phone number', { type: 'tel', maxLength: 30 })}
            {field('email', 'Email address', { type: 'email', maxLength: 254 })}
          </div>
          {errors.duplicate && <Alert variant="warning" className="mt-3">
            <p>Review the existing patient before creating another record.</p>
            <Button type="button" variant="outline-secondary" onClick={onClose}>Choose existing patient</Button>
            <Form.Check className="mt-3" id={`${id}-duplicate`} label="I reviewed existing records and confirm this is a different person" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
          </Alert>}
        </fieldset>
      </Form>
    </Modal.Body>
    <Modal.Footer>
      <Button type="button" variant="outline-secondary" disabled={busy} onClick={close}>Cancel</Button>
      <SubmitButton form={`${id}-form`} busy={busy}>Save patient and continue</SubmitButton>
    </Modal.Footer>
  </Modal></>
}
