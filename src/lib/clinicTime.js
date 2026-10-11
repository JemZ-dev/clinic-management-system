export const CLINIC_TIME_ZONE = 'Asia/Manila'
export function clinicToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
export function formatClinicDate(value) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: CLINIC_TIME_ZONE }).format(new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value))
}
export function formatClinicTime(value) {
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: CLINIC_TIME_ZONE }).format(new Date(value))
}
export function formatClinicTimeRange(start, end) {
  return `${formatClinicTime(start)}–${formatClinicTime(end)}${formatClinicDate(start) !== formatClinicDate(end) ? ' (next day)' : ''}`
}
export function appointmentFields(value) {
  const date = new Date(value)
  return {
    date: new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: CLINIC_TIME_ZONE }).format(date),
    time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: CLINIC_TIME_ZONE }).format(date),
  }
}
