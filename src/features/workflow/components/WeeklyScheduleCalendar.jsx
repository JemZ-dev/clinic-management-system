import { useId, useState } from 'react'
import Modal from 'react-bootstrap/Modal'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function timeLabel(time) {
  const [hour, minute] = time.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

export default function WeeklyScheduleCalendar({ weekly, onChange }) {
  const id = useId()
  const [day, setDay] = useState(null), [draft, setDraft] = useState([]), [error, setError] = useState('')
  function open(day) {
    setDay(day); setError('')
    const periods = weekly.filter((period) => period.day === day).map((period) => ({ ...period }))
    setDraft(periods.length ? periods : [{ day, start: '09:00', end: '12:00' }])
  }
  function apply(event) {
    event.preventDefault(); event.stopPropagation()
    if (draft.some((period, index) => period.start >= period.end || draft.some((other, i) => i < index && other.start < period.end && period.start < other.end))) {
      setError('End time must follow start time. Working periods must not overlap.'); return
    }
    onChange([...weekly.filter((period) => period.day !== day), ...draft].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)))
    setDay(null)
  }
  return <>
    <div className="weekly-calendar-heading"><h3>Weekly working hours</h3><p>Click a day to set its hours. This pattern repeats every week.</p></div>
    <div className="weekly-calendar-scroll" role="region" aria-label="Weekly schedule, Monday to Sunday" tabIndex={0}>
      <div className="weekly-calendar-grid">{[1, 2, 3, 4, 5, 6, 0].map((day) => {
        const periods = weekly.filter((period) => period.day === day).sort((a, b) => a.start.localeCompare(b.start))
        return <button key={day} type="button" className="weekly-calendar-cell" data-working={!!periods.length} aria-label={`Edit ${days[day]} working hours`} onClick={() => open(day)}>
          <span className="weekly-calendar-weekday">{days[day]}</span>
          <span className="weekly-calendar-periods">{periods.length ? periods.map((period, index) => <span className="weekly-calendar-period" key={index}>{timeLabel(period.start)}<span>to {timeLabel(period.end)}</span></span>) : <span className="weekly-calendar-off">Unavailable</span>}</span>
          <span className="weekly-calendar-edit">{periods.length ? 'Edit hours' : '+ Set hours'}</span>
        </button>
      })}</div>
    </div>
    {day !== null && <Modal show centered onHide={() => setDay(null)} aria-labelledby={`${id}-title`}>
      <Modal.Header closeButton><Modal.Title id={`${id}-title`}>{days[day]} working hours</Modal.Title></Modal.Header>
      <Modal.Body><p>All times are in Manila time. Apply changes here, then save the schedule.</p>{error && <Alert variant="danger" role="alert">{error}</Alert>}
        <Form id={`${id}-form`} onSubmit={apply}>
          {draft.length ? draft.map((period, index) => <div className="weekly-calendar-time-fields" key={index}>{['start', 'end'].map((field) => <Form.Group key={field} controlId={`${id}-${index}-${field}`}><Form.Label>{field === 'start' ? 'Start' : 'End'}{draft.length > 1 ? ` ${index + 1}` : ''} *</Form.Label><Form.Control autoFocus={index === 0 && field === 'start'} type="time" step={60} required value={period[field]} onChange={(event) => { setError(''); setDraft(draft.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item)) }} /></Form.Group>)}</div>) : <p>This day will be unavailable.</p>}
        </Form>
        {draft.length > 0 && <Button type="button" variant="outline-danger" className="mt-3" onClick={() => { setDraft([]); setError('') }}>Mark day unavailable</Button>}
      </Modal.Body>
      <Modal.Footer><Button type="button" variant="outline-secondary" onClick={() => setDay(null)}>Cancel</Button><Button type="submit" form={`${id}-form`}>Apply hours</Button></Modal.Footer>
    </Modal>}
  </>
}
