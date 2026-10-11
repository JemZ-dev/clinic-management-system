export const CLINIC_TIME_ZONE = 'Asia/Manila'
export const SLOT_MINUTES = 30
export const SLOT_MS = SLOT_MINUTES * 60 * 1000

export function clinicDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function clinicDayRange(date) {
  const start = new Date(`${date}T00:00:00+08:00`)
  return { start, end: new Date(start.valueOf() + 24 * 60 * 60 * 1000) }
}

export function appointmentStart(date, time) {
  return new Date(`${date}T${time}:00+08:00`)
}
