import { useId, useState } from 'react'
import Offcanvas from 'react-bootstrap/Offcanvas'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import useApiResource from '../../../hooks/useApiResource.js'
import { clinicToday, formatClinicDate, formatClinicTimeRange } from '../../../lib/clinicTime.js'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const asDate = (date) => new Date(`${date}T12:00:00Z`)
const iso = (date) => date.toISOString().slice(0, 10)
const weekday = (date) => asDate(date).getUTCDay()
const leaveOn = (schedule, date) => (schedule?.leave || []).find((leave) => leave.from <= date && leave.through >= date)
const hoursOn = (schedule, date) => (schedule?.weekly || []).filter((period) => period.day === weekday(date)).sort((a, b) => a.start.localeCompare(b.start))

export default function DoctorSchedulePanel({ doctor, date, time, durationMinutes, excludeId, onClose, onUse }) {
  const titleId = useId(), monthId = useId(), timeId = useId()
  const today = clinicToday()
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today ? date : today
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [month, setMonth] = useState(initialDate.slice(0, 7))
  const [choice, setChoice] = useState({ date: initialDate, time, durationMinutes })
  const scheduleResource = useApiResource(`/operations/schedules/${doctor.id}`)
  const schedule = scheduleResource.data?.record
  const validDuration = Number.isInteger(durationMinutes) && durationMinutes >= 1 && durationMinutes <= 1440
  const leave = leaveOn(schedule, selectedDate)
  const hours = hoursOn(schedule, selectedDate)
  const query = new URLSearchParams({ date: selectedDate, durationMinutes: String(durationMinutes), ...(excludeId ? { excludeId } : {}) })
  const availability = useApiResource(schedule && !leave && hours.length && validDuration ? `/operations/slots/${doctor.id}?${query}` : null)
  const slots = availability.data?.slots || []
  const selectedTime = choice.date === selectedDate && choice.durationMinutes === durationMinutes && slots.includes(choice.time) ? choice.time : ''
  const enteredTime = choice.date === selectedDate && choice.durationMinutes === durationMinutes ? choice.time : ''
  const unavailableTime = !!enteredTime && !availability.loading && !availability.error && !slots.includes(enteredTime)
  const firstDay = asDate(`${month}-01`)
  const offset = (firstDay.getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0)).getUTCDate()
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1
    return day >= 1 && day <= count ? `${month}-${String(day).padStart(2, '0')}` : null
  })
  function changeMonth(amount) {
    setMonth(iso(new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + amount, 1))).slice(0, 7))
  }
  const monthLabel = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(firstDay)
  return <Offcanvas show placement="end" onHide={onClose} className="doctor-schedule-panel" aria-labelledby={titleId}>
    <Offcanvas.Header closeButton><Offcanvas.Title id={titleId}>Doctor’s schedule</Offcanvas.Title></Offcanvas.Header>
    <Offcanvas.Body>
      <div className="schedule-panel-doctor"><h2>{doctor.name}</h2><p>{doctor.specialty}</p><span className="record-meta">Read-only · Manila time</span></div>
      {scheduleResource.loading ? <p role="status">Loading working hours…</p> : scheduleResource.error ? <Alert variant="danger" role="alert">Unable to load the schedule. <Button variant="link" onClick={scheduleResource.reload}>Try again</Button></Alert> : <>
        {!schedule && <Alert variant="secondary">Working hours have not been configured for this doctor. Ask an administrator to set the schedule.</Alert>}
        <div className="schedule-calendar-heading"><Button type="button" variant="outline-secondary" aria-label="Previous month" disabled={month <= today.slice(0, 7)} onClick={() => changeMonth(-1)}><ChevronLeft size={18} aria-hidden="true" /></Button><h3 id={monthId} aria-live="polite">{monthLabel}</h3><Button type="button" variant="outline-secondary" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={18} aria-hidden="true" /></Button></div>
        <div className="schedule-calendar" role="group" aria-labelledby={monthId}>
          {weekdays.map((day) => <span className="schedule-calendar-weekday" key={day}>{day}</span>)}
          {cells.map((cell, index) => cell ? <button key={cell} type="button" className="schedule-calendar-day" disabled={cell < today} aria-label={`${formatClinicDate(cell)}${leaveOn(schedule, cell) ? ', on leave' : !hoursOn(schedule, cell).length ? ', no working hours' : ', working day'}`} aria-pressed={cell === selectedDate} aria-current={cell === today ? 'date' : undefined} data-unavailable={!!leaveOn(schedule, cell) || !hoursOn(schedule, cell).length} onClick={() => setSelectedDate(cell)}><span>{Number(cell.slice(-2))}</span><span className="schedule-calendar-dot" aria-hidden="true" /></button> : <span key={`blank-${index}`} />)}
        </div>
        <p className="record-meta schedule-calendar-legend">Dots mark working days. Grey dates have no working hours or are on leave.</p>
        <section className="schedule-panel-day" aria-labelledby={`${titleId}-day`}><h3 id={`${titleId}-day`}>{formatClinicDate(selectedDate)}</h3>
          {leave ? <p role="status">Doctor is on leave or unavailable on this date.</p> : hours.length ? <><p className="record-meta">Working hours</p><ul>{hours.map((period, index) => <li key={index}>{formatClinicTimeRange(`${selectedDate}T${period.start}:00+08:00`, `${selectedDate}T${period.end}:00+08:00`)}</li>)}</ul></> : <p>No working hours on this date.</p>}
          {!validDuration ? <p role="status">Enter a duration in the booking form to check available times.</p> : hours.length > 0 && !leave && <>
            <p className="record-meta">Availability for a {durationMinutes}-minute appointment</p>
            {availability.loading ? <p role="status">Checking available times…</p> : availability.error ? <Alert variant="danger" role="alert">Unable to check availability. <Button variant="link" onClick={availability.reload}>Check again</Button></Alert> : slots.length ? <>
              <Form.Group controlId={`${timeId}-manual`} className="mb-3"><Form.Label>Type a start time</Form.Label><Form.Control type="time" step={60} value={enteredTime} isInvalid={unavailableTime} aria-describedby={`${timeId}-manual-help`} onChange={(event) => setChoice({ date: selectedDate, time: event.target.value, durationMinutes })} />{unavailableTime ? <Form.Control.Feedback type="invalid" id={`${timeId}-manual-help`}>This time is unavailable for the selected duration. Try another time.</Form.Control.Feedback> : <Form.Text id={`${timeId}-manual-help`}>Enter a time manually, or choose from the available times below.</Form.Text>}</Form.Group>
              <Form.Group controlId={timeId}><Form.Label>Available time</Form.Label><Form.Select value={selectedTime} onChange={(event) => setChoice({ date: selectedDate, time: event.target.value, durationMinutes })}><option value="" disabled>Choose a start time</option>{slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</Form.Select></Form.Group>
            </> : <p role="status">No available times for this duration. Try another date.</p>}
          </>}
        </section>
      </>}
    </Offcanvas.Body>
    <div className="schedule-panel-footer"><Button type="button" variant="outline-secondary" onClick={onClose}>Close</Button><Button type="button" disabled={!selectedTime || !!scheduleResource.error || !!availability.error || availability.loading} onClick={() => onUse(selectedDate, selectedTime)}>Use this date and time</Button></div>
  </Offcanvas>
}
