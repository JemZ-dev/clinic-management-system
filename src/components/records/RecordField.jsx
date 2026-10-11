import Form from 'react-bootstrap/Form'

export default function RecordField({ name, label, value, onChange, errors, required = false, multiline = false, help, ...props }) {
  const id = `record-${name.replaceAll('.', '-')}`
  const error = errors[name]
  return <Form.Group className={`record-field ${multiline ? 'full-width' : ''}`} controlId={id}>
    <Form.Label>{label}{required ? <span className="required-marker"> *</span> : <span className="optional-label">Optional</span>}</Form.Label>
    <Form.Control name={name} value={value} onChange={(event) => onChange(name, event.target.value)} required={required}
      as={multiline ? 'textarea' : 'input'} rows={multiline ? 3 : undefined} isInvalid={!!error}
      aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} {...props} />
    {error && <Form.Control.Feedback type="invalid" id={`${id}-error`}>{error}</Form.Control.Feedback>}
    {help && <Form.Text id={`${id}-help`}>{help}</Form.Text>}
  </Form.Group>
}
