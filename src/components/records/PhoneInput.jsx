import { useState } from 'react'
import Form from 'react-bootstrap/Form'
import { MAX_PHONE_CHARACTERS, PHONE_HELP, phoneError } from '../../../shared/phoneValidation.js'

export default function PhoneInput({ id, value = '', error, help, onChange, onBlur, onInvalid, ...props }) {
  const [touched, setTouched] = useState(false)
  const validation = phoneError(value)
  const message = error || (touched ? validation : '')
  return <>
    <Form.Control {...props} type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={MAX_PHONE_CHARACTERS} value={value}
      onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, '').slice(0, MAX_PHONE_CHARACTERS))}
      ref={(input) => { input?.setCustomValidity(validation) }}
      onBlur={(event) => { setTouched(true); onBlur?.(event) }}
      onInvalid={(event) => { setTouched(true); onInvalid?.(event) }}
      isInvalid={!!message} aria-invalid={!!message} aria-describedby={message ? `${id}-error` : help === false ? undefined : `${id}-help`} />
    {message && <Form.Control.Feedback type="invalid" id={`${id}-error`}>{message}</Form.Control.Feedback>}
    {help !== false && <Form.Text id={`${id}-help`}>{PHONE_HELP}{help ? ` ${help}` : ''}</Form.Text>}
  </>
}
