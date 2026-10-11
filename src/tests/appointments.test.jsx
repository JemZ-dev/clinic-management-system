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
  const router = createMemoryRouter([{ element: <AuthContext value={{ user: { name: 'Fictional Staff' }, logout: vi.fn() }}><AppLayout /></AuthContext>, children: [
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
})
