import Button from 'react-bootstrap/Button'
import useApiResource from '../../../hooks/useApiResource.js'
export default function AvailableSlots({ doctorId, date, onSelect }) {
  const resource = useApiResource(doctorId && date ? `/operations/slots/${doctorId}?date=${date}` : null)
  if (!doctorId || !date) return <p className="record-meta">Select a doctor and date to view available times.</p>
  if (resource.error) return <p role="alert">Unable to check availability. <Button variant="link" onClick={resource.reload}>Try again</Button></p>
  if (resource.loading) return <p role="status">Checking available times…</p>
  return <div className="mb-3"><p className="record-meta">{!resource.data.configured ? 'The administrator must configure this doctor’s working hours before booking.' : (resource.data.slots || []).length ? 'Available 30-minute slots (Manila)' : 'No available slots on this date.'}</p><div className="record-actions">{(resource.data.slots || []).map((time) => <Button key={time} variant="outline-secondary" size="sm" onClick={() => onSelect(time)}>{time}</Button>)}</div></div>
}
