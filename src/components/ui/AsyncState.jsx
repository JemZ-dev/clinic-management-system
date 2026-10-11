import Button from 'react-bootstrap/Button'
import Spinner from 'react-bootstrap/Spinner'
import { AlertCircle } from 'lucide-react'

export default function AsyncState({ loading, title, message, onRetry }) {
  return <div className="async-state" role={loading ? 'status' : 'alert'}>
    {loading ? <Spinner animation="border" size="sm" aria-hidden="true" /> : <AlertCircle size={24} aria-hidden="true" />}
    <h2>{title}</h2>
    {message && <p>{message}</p>}
    {onRetry && <Button variant="outline-primary" onClick={onRetry}>Try again</Button>}
  </div>
}
