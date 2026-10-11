import { STATUS_LABELS } from '../appointments.constants.js'

export default function AppointmentStatus({ status }) {
  return <span className={`appointment-status status-${status}`}>{STATUS_LABELS[status]}</span>
}
