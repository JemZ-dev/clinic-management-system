import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import { useId } from 'react'
import useApiResource from '../../../hooks/useApiResource.js'
export default function AvailableSlots({ doctorId, date, durationMinutes = 30, excludeId, onSelect }) {
  const id = useId()
  const validDuration = Number.isInteger(durationMinutes) && durationMinutes >= 1 && durationMinutes <= 1440
  const query = new URLSearchParams({ date: date || '', durationMinutes: String(durationMinutes), ...(excludeId ? { excludeId } : {}) })
  const resource = useApiResource(doctorId && date && validDuration ? `/operations/slots/${doctorId}?${query}` : null)
  if (!doctorId || !date) return <p className="record-meta">Select a doctor and date to view available times.</p>
  if (!validDuration) return <p className="record-meta">Enter a duration to check available times.</p>
  if (resource.error) return <p role="alert">Unable to check availability. <Button variant="link" onClick={resource.reload}>Try again</Button></p>
  if (resource.loading) return <p role="status">Checking available times…</p>
  const slots = resource.data?.slots || []
  return <div className="mb-3"><p className="record-meta">{!resource.data?.configured ? 'The administrator must configure this doctor’s working hours before booking.' : slots.length ? `Available start times for ${durationMinutes} minutes (Manila)` : 'No available times for this duration on this date.'}</p>{slots.length > 0 && <Form.Group controlId={id}><Form.Label>Available start times</Form.Label><Form.Select value="" onChange={(event) => onSelect(event.target.value)}><option value="" disabled>Choose an available time</option>{slots.map((time) => <option key={time} value={time}>{time}</option>)}</Form.Select></Form.Group>}</div>
}
