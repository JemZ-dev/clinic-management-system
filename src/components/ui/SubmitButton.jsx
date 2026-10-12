import Button from 'react-bootstrap/Button'
import Spinner from 'react-bootstrap/Spinner'

export default function SubmitButton({ busy, disabled = false, children, className = '', form }) {
  return <Button type="submit" form={form} className={`submit-button ${className}`} disabled={busy || disabled} aria-busy={busy}>
    <span className={busy ? 'invisible' : ''}>{children}</span>
    {busy && <span className="submit-progress"><Spinner animation="border" size="sm" aria-hidden="true" /><span className="visually-hidden">Saving, please wait</span></span>}
  </Button>
}
