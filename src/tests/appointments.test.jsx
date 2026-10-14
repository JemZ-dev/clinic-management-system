import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import AppLayout from '../layouts/AppLayout.jsx'
import { AuthContext } from '../context/auth.js'
import AppointmentFormPage from '../features/appointments/pages/AppointmentFormPage.jsx'
import AppointmentDetailsPage from '../features/appointments/pages/AppointmentDetailsPage.jsx'
import AppointmentsPage from '../features/appointments/pages/AppointmentsPage.jsx'
import ClinicOverview from '../features/dashboard/components/ClinicOverview.jsx'
import { api } from '../lib/api.js'
import { clinicToday } from '../lib/clinicTime.js'

const patient = { id: '0123456789abcdef01234567', name: 'Fictional Patient', patientId: 'PT-000000000001', archivedAt: null }
const doctor = { id: '0123456789abcdef01234568', name: 'Fictional Doctor', specialty: 'Family medicine', archivedAt: null }
const id = '0123456789abcdef01234569'
const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000))
const record = { id, patientId: patient.id, doctorId: doctor.id, patient, doctor, startsAt: `${tomorrow}T09:00:00+08:00`, endsAt: `${tomorrow}T09:30:00+08:00`, reason: '', status: 'scheduled', editable: true, availableTransitions: ['cancelled'], statusHistory: [{ status: 'scheduled', at: new Date().toISOString(), note: '' }], version: 0 }
const paged = (records = [], page = 1, total = records.length) => ({ data: { records, pagination: { page, pages: Math.max(1, Math.ceil(total / 10)), total, limit: 10 } } })
function installGet() {
  return vi.spyOn(api, 'get').mockImplementation((path) => {
    if (path.startsWith('/patients?')) return Promise.resolve(paged([patient]))
    if (path.startsWith('/doctors?')) return Promise.resolve(paged([doctor]))
    if (path === `/appointments/${id}`) return Promise.resolve({ data: { record } })
    return Promise.resolve(paged())
  })
}
function mount(path) {
  const router = createMemoryRouter([{ element: <AuthContext value={{ user: { name: 'Fictional Staff', role: 'staff' }, logout: vi.fn() }}><AppLayout /></AuthContext>, children: [
    { path: '/', element: <ClinicOverview /> }, { path: '/appointments', element: <AppointmentsPage /> },
    { path: '/appointments/new', element: <AppointmentFormPage /> }, { path: '/appointments/:id', element: <AppointmentDetailsPage /> },
    { path: '/appointments/:id/edit', element: <AppointmentFormPage editing /> },
    { path: '/patients', element: <h1>Patients</h1> },
  ] }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}
async function fillBooking(user) {
  await screen.findByRole('option', { name: /Fictional Patient/ })
  await user.selectOptions(screen.getByRole('combobox', { name: /^Patient/ }), patient.id)
  await user.selectOptions(screen.getByRole('combobox', { name: /^Doctor/ }), doctor.id)
  await user.clear(screen.getByLabelText(/^Date/))
  await user.type(screen.getByLabelText(/^Date/), tomorrow)
  await user.type(screen.getByLabelText(/Start time/), '09:00')
}
afterEach(() => vi.restoreAllMocks())

describe('appointment and dashboard components', () => {
  it('lets reception view a doctor’s schedule and apply a time without losing booking details', async () => {
    const get = installGet()
    const fallback = get.getMockImplementation()
    get.mockImplementation((path) => {
      if (path.startsWith('/operations/schedules/')) return Promise.resolve({ data: { record: { weekly: Array.from({ length: 7 }, (_, day) => ({ day, start: '09:00', end: '17:00' })), leave: [] } } })
      if (path.startsWith('/operations/slots/')) return Promise.resolve({ data: { configured: true, slots: ['09:17'] } })
      return fallback(path)
    })
    const post = vi.spyOn(api, 'post')
    const { user } = mount('/appointments/new')
    expect(screen.getByRole('button', { name: 'View doctor’s schedule' }).disabled).toBe(true)
    await fillBooking(user)
    await user.type(screen.getByLabelText(/Reason for appointment/), 'Fictional follow-up')
    await user.click(screen.getByRole('button', { name: 'View doctor’s schedule' }))
    await screen.findByRole('dialog', { name: 'Doctor’s schedule' })
    await user.selectOptions(await screen.findByLabelText('Available time'), '09:17')
    await user.click(screen.getByRole('button', { name: 'Use this date and time' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Doctor’s schedule' })).toBeNull())
    expect(screen.getByLabelText(/Start time/).value).toBe('09:17')
    expect(screen.getByLabelText(/^Date/).value).toBe(tomorrow)
    expect(screen.getByRole('combobox', { name: /^Patient/ }).value).toBe(patient.id)
    expect(screen.getByRole('combobox', { name: /^Doctor/ }).value).toBe(doctor.id)
    expect(screen.getByLabelText(/Reason for appointment/).value).toBe('Fictional follow-up')
    expect(post).not.toHaveBeenCalled()
  })
  it('books an arbitrary start minute and chosen duration, refreshing availability for that duration', async () => {
    const get = installGet()
    const fallback = get.getMockImplementation()
    get.mockImplementation((path) => path.startsWith('/operations/slots/')
      ? Promise.resolve({ data: { configured: true, slots: ['09:17', '09:18'] } }) : fallback(path))
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { record } })
    const { user } = mount('/appointments/new')
    await fillBooking(user)
    const duration = screen.getByLabelText(/Duration \(minutes\)/)
    await user.clear(duration)
    await user.type(duration, '23')
    await waitFor(() => expect(get.mock.calls.some(([path]) => path.includes('durationMinutes=23'))).toBe(true))
    await screen.findByRole('option', { name: '09:17' })
    await user.selectOptions(screen.getByLabelText('Available start times'), '09:17')
    expect(screen.getByLabelText(/Start time/).value).toBe('09:17')
    expect(screen.getByLabelText(/Start time/).step).toBe('60')
    await user.click(screen.getByRole('button', { name: 'Book appointment', exact: true }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).toMatchObject({ time: '09:17', durationMinutes: 23 })
  })

  it('preserves the actual duration on rescheduling and displays it on the detail page', async () => {
    const get = installGet()
    const fallback = get.getMockImplementation()
    get.mockImplementation((path) => path === `/appointments/${id}`
      ? Promise.resolve({ data: { record: { ...record, endsAt: `${tomorrow}T09:23:00+08:00` } } }) : fallback(path))
    const { router } = mount(`/appointments/${id}/edit`)
    expect((await screen.findByLabelText(/Duration \(minutes\)/)).value).toBe('23')
    await waitFor(() => expect(get.mock.calls.some(([path]) => path.includes(`excludeId=${id}`))).toBe(true))
    await router.navigate(`/appointments/${id}`)
    expect(await screen.findByText('23 minutes')).toBeTruthy()
  })
  it('confirms discarding a new patient while preserving the appointment', async () => {
    installGet()
    const post = vi.spyOn(api, 'post')
    const { user } = mount('/appointments/new')
    await fillBooking(user)
    await user.click(screen.getByRole('button', { name: 'New patient', exact: true }))
    const dialog = await screen.findByRole('dialog', { name: 'New patient' })
    await user.type(within(dialog).getByLabelText(/Full name/), 'Unsaved Fictional Patient')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel', exact: true }))
    await screen.findByRole('dialog', { name: 'Discard new patient details?' })
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(within(dialog).getByLabelText(/Full name/).value).toBe('Unsaved Fictional Patient')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Discard details' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New patient' })).toBeNull())
    expect(screen.getByLabelText(/Start time/).value).toBe('09:00')
    expect(post).not.toHaveBeenCalled()
  })

  it('creates a patient within booking and reuses it after a booking conflict', async () => {
    installGet()
    const created = { ...patient, id: '2223456789abcdef01234567', name: 'New Fictional Patient', patientId: 'PT-NEW' }
    let bookings = 0
    const post = vi.spyOn(api, 'post').mockImplementation((path) => {
      if (path === '/patients') return Promise.resolve({ data: { record: created } })
      bookings += 1
      return bookings === 1 ? Promise.reject({ response: { status: 409, data: { message: 'Time unavailable.', fields: { time: 'Choose another time.' } } } }) : Promise.resolve({ data: { record: { ...record, patientId: created.id, patient: created } } })
    })
    const { user } = mount('/appointments/new')
    await fillBooking(user)
    await user.type(screen.getByLabelText(/Reason for appointment/), 'New patient consultation')
    await user.click(screen.getByRole('button', { name: 'New patient', exact: true }))
    const dialog = await screen.findByRole('dialog', { name: 'New patient' })
    await user.type(within(dialog).getByLabelText(/Full name/), created.name)
    await user.type(within(dialog).getByLabelText(/Birth date/), '2000-01-01')
    expect(within(dialog).getByLabelText(/^Gender/).required).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: 'Save patient and continue' }))
    expect(post).not.toHaveBeenCalled()
    await user.selectOptions(within(dialog).getByLabelText(/^Gender/), 'prefer_not_to_say')
    await user.click(within(dialog).getByRole('button', { name: 'Save patient and continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New patient' })).toBeNull())
    expect(screen.getByRole('combobox', { name: /^Patient/ }).value).toBe(created.id)
    expect(screen.getByRole('combobox', { name: /^Doctor/ }).value).toBe(doctor.id)
    expect(screen.getByLabelText(/Start time/).value).toBe('09:00')
    expect(screen.getByLabelText(/Reason for appointment/).value).toBe('New patient consultation')
    await user.click(screen.getByRole('button', { name: 'Book appointment', exact: true }))
    await screen.findByText('Choose another time.')
    await user.clear(screen.getByLabelText(/Start time/))
    await user.type(screen.getByLabelText(/Start time/), '09:30')
    await user.click(screen.getByRole('button', { name: 'Book appointment', exact: true }))
    await screen.findByRole('heading', { name: 'Appointment details', level: 1 })
    expect(post.mock.calls.filter(([path]) => path === '/patients')).toHaveLength(1)
    expect(post.mock.calls.at(-1)[1]).toMatchObject({ patientId: created.id, doctorId: doctor.id, time: '09:30' })
  })

  it('retains a duplicate patient warning and returns to the existing picker without losing booking entries', async () => {
    installGet()
    const post = vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 409, data: { message: 'Matching patient already exists.', fields: { duplicate: 'Review existing records.' } } } })
    const { user } = mount('/appointments/new')
    await fillBooking(user)
    await user.click(screen.getByRole('button', { name: 'New patient', exact: true }))
    const dialog = await screen.findByRole('dialog', { name: 'New patient' })
    await user.type(within(dialog).getByLabelText(/Full name/), patient.name)
    await user.type(within(dialog).getByLabelText(/Birth date/), '2000-01-01')
    await user.selectOptions(within(dialog).getByLabelText(/^Gender/), 'prefer_not_to_say')
    await user.click(within(dialog).getByRole('button', { name: 'Save patient and continue' }))
    await screen.findByText('Matching patient already exists.')
    expect(within(dialog).getByLabelText(/Full name/).value).toBe(patient.name)
    expect(post.mock.calls[0][1].duplicateAcknowledged).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'Choose existing patient' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New patient' })).toBeNull())
    expect(screen.getByLabelText(/Start time/).value).toBe('09:00')
    expect(screen.getByRole('combobox', { name: /^Patient/ }).value).toBe(patient.id)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('preserves a conflicting booking, allows a new time, and redirects after saving', async () => {
    installGet()
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce({ response: { status: 409, data: { message: 'This doctor is already booked for that time.', fields: { time: 'Choose another time.' } } } }).mockResolvedValueOnce({ data: { record } })
    const { user, router } = mount('/appointments/new')
    await fillBooking(user)
    await user.type(screen.getByLabelText(/Reason for appointment/), 'Fictional follow-up')
    await user.click(screen.getByRole('button', { name: 'Book appointment', exact: true }))
    await screen.findByText('Choose another time.')
    expect(screen.getByRole('combobox', { name: /^Patient/ }).value).toBe(patient.id)
    expect(screen.getByLabelText(/Reason for appointment/).value).toBe('Fictional follow-up')
    expect(screen.getByLabelText(/Start time/).getAttribute('aria-describedby')).toBe('record-time-error')
    await user.clear(screen.getByLabelText(/Start time/))
    await user.type(screen.getByLabelText(/Start time/), '09:30')
    await user.click(screen.getByRole('button', { name: 'Book appointment', exact: true }))
    await screen.findByRole('heading', { name: 'Appointment details', level: 1 })
    expect(router.state.location.pathname).toBe(`/appointments/${id}`)
    expect(post.mock.calls[1][1].time).toBe('09:30')
    expect(screen.getByText('Appointment booked successfully.')).toBeTruthy()
  })

  it('searches paginated choices and preserves a selected patient outside the new results', async () => {
    const get = installGet()
    const other = { ...patient, id: '1123456789abcdef01234567', name: 'Another Fictional Patient' }
    get.mockImplementation((path) => {
      if (path.startsWith('/patients?') && path.includes('q=Another')) return Promise.resolve(paged([other]))
      if (path.startsWith('/patients?')) return Promise.resolve(paged([patient]))
      return Promise.resolve(paged([doctor]))
    })
    const { user } = mount('/appointments/new')
    await screen.findByRole('option', { name: /Fictional Patient/ })
    await user.selectOptions(screen.getByRole('combobox', { name: /^Patient/ }), patient.id)
    await user.type(screen.getByLabelText('Search patients'), 'Another')
    await user.click(within(screen.getByLabelText('Search patients').closest('.record-picker')).getByRole('button', { name: 'Find' }))
    await screen.findByRole('option', { name: /Another Fictional Patient/ })
    expect(screen.getByRole('combobox', { name: /^Patient/ }).value).toBe(patient.id)
    expect(screen.getByRole('option', { name: /^Fictional Patient/ })).toBeTruthy()
    expect(get.mock.calls.at(-1)[0]).toContain('q=Another')
  })

  it('shows retry controls when doctor choices are unavailable', async () => {
    const get = installGet()
    let failDoctor = true
    get.mockImplementation((path) => path.startsWith('/doctors?') && failDoctor ? Promise.reject(new Error('offline')) : Promise.resolve(paged(path.startsWith('/doctors?') ? [doctor] : [patient])))
    const { user } = mount('/appointments/new')
    await screen.findByText(/We could not reach the clinic server/)
    failDoctor = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('option', { name: /Fictional Doctor/ })
  })

  it('blocks navigation with unsaved scheduling entries and preserves stale reschedule values', async () => {
    installGet()
    const patch = vi.spyOn(api, 'patch').mockRejectedValue({ response: { status: 409, data: { message: 'This appointment changed. Open the latest appointment before saving again.' } } })
    const { user, router } = mount(`/appointments/${id}/edit`)
    await screen.findByRole('heading', { name: 'Reschedule appointment', level: 1 })
    await user.type(screen.getByLabelText(/Reason for appointment/), 'Unsaved scheduling note')
    await user.click(screen.getByRole('button', { name: 'Save appointment' }))
    await screen.findByText(/This appointment changed/)
    expect(screen.getByLabelText(/Reason for appointment/).value).toBe('Unsaved scheduling note')
    expect(patch.mock.calls[0][1].version).toBe(0)
    await user.click(screen.getByRole('link', { name: 'latest appointment' }))
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe(`/appointments/${id}/edit`)
  })

  it('confirms cancellation, saves its note, and replaces actions with preserved history', async () => {
    const get = installGet()
    const cancelled = { ...record, status: 'cancelled', editable: false, availableTransitions: [], version: 1, statusHistory: [...record.statusHistory, { status: 'cancelled', at: new Date().toISOString(), note: 'Fictional scheduling note' }] }
    const patch = vi.spyOn(api, 'patch').mockImplementation(() => { get.mockResolvedValue({ data: { record: cancelled } }); return Promise.resolve({ data: { record: cancelled } }) })
    const { user } = mount(`/appointments/${id}`)
    await screen.findByRole('heading', { name: 'Appointment details' })
    expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }))
    expect(patch).not.toHaveBeenCalled()
    await screen.findByRole('dialog', { name: 'Cancel appointment?' })
    await user.type(screen.getByLabelText(/Scheduling note/), 'Fictional scheduling note')
    await user.click(screen.getByRole('button', { name: 'Confirm status change' }))
    await screen.findByText('Appointment marked cancelled.')
    await screen.findByText('Fictional scheduling note')
    expect(screen.queryByRole('link', { name: 'Reschedule' })).toBeNull()
    expect(patch).toHaveBeenCalledWith(`/appointments/${id}/status`, { version: 0, status: 'cancelled', note: 'Fictional scheduling note' })
  })

  it('filters by clinic date/status and distinguishes genuine empty schedules', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(paged())
    const { user, router } = mount('/appointments')
    await screen.findByRole('heading', { name: 'No appointments for this period' })
    expect(get.mock.calls[0][0]).toContain(`date=${clinicToday()}`)
    await user.click(screen.getByRole('button', { name: 'All dates' }))
    expect(router.state.location.search).toContain('date=')
    await user.selectOptions(screen.getByLabelText('Status'), 'checked_in')
    await screen.findByRole('heading', { name: 'No matching appointments' })
    expect(router.state.location.search).toContain('status=checked_in')
  })

  it('keeps dashboard counts unavailable on failure and displays genuine zero totals after retry', async () => {
    const data = { date: clinicToday(), patients: 0, doctors: 0, todayTotal: 0, waiting: 0, statuses: { scheduled: 0, checked_in: 0, completed: 0, cancelled: 0, no_show: 0 }, appointments: [] }
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data })
    const { user } = mount('/')
    await screen.findByRole('heading', { name: 'Clinic overview unavailable' })
    expect(screen.queryByText('Active patients')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Active patients')
    expect(screen.getByText('Active patients').nextElementSibling.textContent).toBe('0')
    expect(screen.getByText('Checked-in queue').nextElementSibling.textContent).toBe('0')
    expect(screen.getByRole('heading', { name: 'No active appointments today' })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('link', { name: 'View schedule' }).getAttribute('href')).toContain(`date=${data.date}`))
  })
  it('guides staff to the missing doctor directory before booking and updates the action after refresh', async () => {
    const data = { date: clinicToday(), patients: 1, doctors: 0, todayTotal: 0, waiting: 0, statuses: { scheduled: 0, checked_in: 0, completed: 0, cancelled: 0, no_show: 0 }, appointments: [] }
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data }).mockResolvedValueOnce({ data: { ...data, doctors: 1 } })
    const { user } = mount('/')
    await screen.findByRole('heading', { name: 'Set up your clinic records' })
    expect(screen.getByRole('link', { name: 'Add your first doctor' }).getAttribute('href')).toBe('/doctors/new')
    expect(screen.queryByRole('link', { name: 'Book appointment', exact: true })).toBeNull()
    expect(screen.queryByLabelText("Today's appointment status totals")).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByRole('heading', { name: 'Quick actions' })
    expect(screen.getByRole('link', { name: 'Book appointment', exact: true }).getAttribute('href')).toBe('/appointments/new')
    expect(screen.queryByRole('link', { name: 'Add your first doctor' })).toBeNull()
  })
  it('keeps populated schedules and outcome filters available alongside the new action column', async () => {
    const todayRecord = { ...record, startsAt: `${clinicToday()}T09:00:00+08:00`, endsAt: `${clinicToday()}T09:30:00+08:00` }
    const data = { date: clinicToday(), patients: 1, doctors: 1, todayTotal: 1, waiting: 0, statuses: { scheduled: 1, checked_in: 0, completed: 0, cancelled: 0, no_show: 0 }, appointments: [todayRecord] }
    vi.spyOn(api, 'get').mockResolvedValue({ data })
    mount('/')
    const table = await screen.findByRole('table')
    expect(within(table).getByText(patient.name)).toBeTruthy()
    expect(within(table).getByRole('link', { name: `View appointment for ${patient.name}` }).getAttribute('href')).toBe(`/appointments/${id}`)
    const outcomes = screen.getByLabelText("Today's appointment status totals")
    expect(within(outcomes).getByRole('link', { name: 'Scheduled 1' }).getAttribute('href')).toContain('status=scheduled')
    expect(screen.getByRole('heading', { name: 'Quick actions' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'No active appointments today' })).toBeNull()
  })
})
