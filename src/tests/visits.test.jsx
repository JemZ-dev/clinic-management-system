import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import AppLayout from '../layouts/AppLayout.jsx'
import { AuthContext } from '../context/auth.js'
import VisitFormPage from '../features/visits/pages/VisitFormPage.jsx'
import VisitDetailsPage from '../features/visits/pages/VisitDetailsPage.jsx'
import VisitsPage from '../features/visits/pages/VisitsPage.jsx'
import AppointmentDetailsPage from '../features/appointments/pages/AppointmentDetailsPage.jsx'
import RecordDetailPage from '../components/records/RecordDetailPage.jsx'
import { patientsConfig } from '../features/patients/patients.config.js'
import { api } from '../lib/api.js'
import { clinicToday, formatClinicDate } from '../lib/clinicTime.js'

const patient = { ...structuredClone(patientsConfig.defaults), id: '0123456789abcdef01234567', name: 'Fictional Patient', patientId: 'PT-000000000001', dateOfBirth: '2000-01-01', archivedAt: null, version: 0, updatedAt: new Date().toISOString() }
const doctor = { id: '0123456789abcdef01234568', name: 'Fictional Doctor', specialty: 'Family medicine', archivedAt: null }
const id = '0123456789abcdef01234569'
const aptId = '0123456789abcdef01234570'
const record = { id, patientId: patient.id, doctorId: doctor.id, patient, doctor, appointmentId: null, date: clinicToday(), reason: 'Fictional consultation', diagnosis: '', notes: '', treatment: '', prescribedMedicines: '', followUp: '', author: { name: 'Fictional Staff' }, addenda: [], canAddAddendum: true, version: 0, createdAt: new Date().toISOString() }
const appointment = { id: aptId, patientId: patient.id, doctorId: doctor.id, patient, doctor, startsAt: `${clinicToday()}T09:00:00+08:00`, endsAt: `${clinicToday()}T09:30:00+08:00`, reason: 'Fictional follow-up', status: 'checked_in', visitId: null, editable: false, availableTransitions: ['cancelled'], statusHistory: [], version: 7 }
const paged = (records = [], page = 1, total = records.length) => ({ data: { records, pagination: { page, limit: 10, total, pages: Math.max(1, Math.ceil(total / 10)) } } })
function installGet() {
  return vi.spyOn(api, 'get').mockImplementation((path) => {
    if (path.startsWith('/patients?')) return Promise.resolve(paged([patient]))
    if (path.startsWith('/doctors?')) return Promise.resolve(paged([doctor]))
    if (path === `/patients/${patient.id}`) return Promise.resolve({ data: { record: patient } })
    if (path === `/appointments/${aptId}`) return Promise.resolve({ data: { record: appointment } })
    if (path === `/visits/${id}`) return Promise.resolve({ data: { record } })
    return Promise.resolve(paged())
  })
}
function mount(path) {
  const logout = vi.fn()
  const router = createMemoryRouter([{ element: <AuthContext value={{ user: { name: 'Fictional Staff', role: 'doctor', doctorId: doctor.id }, logout }}><AppLayout /></AuthContext>, children: [
    { path: '/visits', element: <VisitsPage /> }, { path: '/visits/new', element: <VisitFormPage /> }, { path: '/visits/:id', element: <VisitDetailsPage /> },
    { path: '/appointments/:id', element: <AppointmentDetailsPage /> }, { path: '/patients/:id', element: <RecordDetailPage config={patientsConfig} /> },
  ] }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, logout, user: userEvent.setup() }
}
afterEach(() => vi.restoreAllMocks())
describe('visit and treatment workflows', () => {
  it('preserves failed visit entries, retries with the same save identity, and leaves unknown findings blank', async () => {
    installGet()
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { record } })
    const { user, router } = mount('/visits/new')
    await screen.findByRole('option', { name: /Fictional Patient/ })
    await user.selectOptions(screen.getByRole('combobox', { name: /^Patient/ }), patient.id)
    await user.selectOptions(screen.getByRole('combobox', { name: /Attending doctor/ }), doctor.id)
    await user.type(screen.getByLabelText(/Reason for visit/), 'Fictional consultation')
    await user.type(screen.getByLabelText(/Treatment provided/), 'Fictional treatment notes')
    await user.click(screen.getByRole('button', { name: 'Save visit' }))
    await screen.findByText(/We could not reach the clinic server/)
    expect(screen.getByLabelText(/Treatment provided/).value).toBe('Fictional treatment notes')
    expect(screen.getByLabelText(/Recorded diagnosis/).value).toBe('')
    await user.click(screen.getByRole('button', { name: 'Save visit' }))
    await screen.findByRole('heading', { name: 'Visit details', level: 1 })
    expect(router.state.location.pathname).toBe(`/visits/${id}`)
    expect(post.mock.calls[0][1].requestId).toBe(post.mock.calls[1][1].requestId)
    expect(post.mock.calls[1][1].diagnosis).toBe('')
    expect(router.state.location.state.notice).toBe('Visit saved successfully.')
    expect(await screen.findByText('Visit saved successfully.')).toBeTruthy()
  })
  it('loads appointment context, fixes the selected records, and sends its current version with the visit', async () => {
    installGet()
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { record: { ...record, appointmentId: aptId } } })
    const { user } = mount(`/visits/new?appointmentId=${aptId}`)
    expect(screen.getByRole('heading', { name: 'Loading appointment' })).toBeTruthy()
    await screen.findByRole('heading', { name: 'Record visit' })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Fictional Patient')).toBeTruthy()
    expect(screen.getByLabelText(/Reason for visit/).value).toBe('Fictional follow-up')
    await user.click(screen.getByRole('button', { name: 'Save visit' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1]).toMatchObject({ patientId: patient.id, doctorId: doctor.id, appointmentId: aptId, appointmentVersion: 7 })
  })
  it('shows the saved visit link instead of creating another visit for the same appointment', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { record: { ...appointment, visitId: id } } })
    mount(`/visits/new?appointmentId=${aptId}`)
    await screen.findByRole('heading', { name: 'This appointment already has a visit' })
    expect(screen.getByRole('link', { name: 'View saved visit' }).getAttribute('href')).toBe(`/visits/${id}`)
    expect(screen.queryByRole('button', { name: 'Save visit' })).toBeNull()
  })
  it('directs checked-in appointments to assessment and consultation in the queue', async () => {
    installGet()
    mount(`/appointments/${aptId}`)
    await screen.findByRole('heading', { name: 'Appointment details' })
    expect(screen.queryByRole('button', { name: 'Mark completed' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open encounter queue' }).getAttribute('href')).toBe(`/queue?appointmentId=${aptId}&stage=all`)
    expect(screen.queryByRole('button', { name: 'Mark cancelled' })).toBeNull()
  })
  it('preserves unsaved corrections through conflict reload failures and uses the refreshed version', async () => {
    const get = installGet()
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce({ response: { status: 409, data: { message: 'This visit changed. Reload it.' } } }).mockResolvedValueOnce({ data: { record } })
    const { user } = mount(`/visits/${id}`)
    await screen.findByRole('heading', { name: 'Visit details', level: 1 })
    await user.type(screen.getByLabelText(/Correction or additional note/), 'Fictional correction')
    await user.click(screen.getByRole('button', { name: 'Save additional note' }))
    await screen.findByText(/This visit changed/)
    expect(screen.getByRole('button', { name: 'Save additional note' }).disabled).toBe(true)
    get.mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'Reload latest visit' }))
    await screen.findByText(/Unable to refresh this visit/)
    expect(screen.getByLabelText(/Correction or additional note/).value).toBe('Fictional correction')
    expect(screen.getByRole('button', { name: 'Save additional note' }).disabled).toBe(true)
    get.mockResolvedValue({ data: { record: { ...record, version: 1, addenda: [{ text: 'Earlier correction', author: { name: 'Another Fictional Staff' }, at: new Date().toISOString() }] } } })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Earlier correction')
    expect(screen.getByLabelText(/Correction or additional note/).value).toBe('Fictional correction')
    await user.click(screen.getByRole('button', { name: 'Save additional note' }))
    await screen.findByText(/Additional note saved/)
    expect(post.mock.calls[1][1].version).toBe(1)
    expect(post.mock.calls[1][1].requestId).toBe(post.mock.calls[0][1].requestId)
  })
  it('scopes patient visit history and provides honest empty and retry states', async () => {
    const get = installGet()
    mount(`/patients/${patient.id}`)
    const history = await screen.findByRole('region', { name: 'Patient visit history' })
    await within(history).findByRole('heading', { name: 'No visits recorded yet' })
    expect(get.mock.calls.some(([path]) => path.startsWith('/visits?') && path.includes(`patientId=${patient.id}`))).toBe(true)
    expect(screen.getByRole('link', { name: 'View encounter history, assessments, tests, and billing' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Register walk-in' })).toBeNull()
  })
  it('recovers from list failure and retains search and pagination in the URL', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(paged([record], 1, 11))
    const { user, router } = mount('/visits')
    await screen.findByRole('heading', { name: 'Unable to load visits' })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: `View visit on ${formatClinicDate(record.date)} for Fictional Patient` })
    expect(screen.queryByText('Fictional consultation')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(router.state.location.search).toContain('page=2')
    await user.type(screen.getByRole('searchbox'), 'Fictional')
    await waitFor(() => expect(router.state.location.search).toContain('q=Fictional'))
    expect(router.state.location.search).toContain('page=1')
  })
  it('warns before signing out with unsaved visit notes and keeps them when cancelled', async () => {
    installGet()
    const { user, logout } = mount('/visits/new')
    await user.type(screen.getByLabelText(/Consultation notes/), 'Unsaved fictional notes')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Sign out?' })).getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(logout).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Consultation notes/).value).toBe('Unsaved fictional notes')
  })
  it('preserves legacy saved visit navigation without giving doctors reception actions', async () => {
    let booking = { ...appointment }
    const savedVisit = { ...record, appointmentId: aptId }
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve({ data: { record: path.startsWith('/appointments/') ? booking : savedVisit } }))
    vi.spyOn(api, 'post').mockImplementation(() => {
      booking = { ...booking, version: 8, visitId: id, availableTransitions: ['completed', 'cancelled'] }
      return Promise.resolve({ data: { record: savedVisit } })
    })
    const patch = vi.spyOn(api, 'patch')
    const { user } = mount(`/visits/new?appointmentId=${aptId}`)
    await screen.findByRole('heading', { name: 'Record visit' })
    await user.type(screen.getByLabelText(/Treatment provided/), 'Fictional treatment')
    await user.click(screen.getByRole('button', { name: 'Save visit' }))
    await screen.findByRole('heading', { name: 'Visit details', level: 1 })
    await user.click(screen.getByRole('link', { name: 'View appointment' }))
    await screen.findByRole('heading', { name: 'Appointment details' })
    expect(screen.getByRole('link', { name: 'View saved visit' })).toBeTruthy()
    expect(patch).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Mark completed' })).toBeNull()
  })
  it('keeps unsaved correction text readable when the latest visit reaches the addendum limit', async () => {
    const get = installGet()
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 409, data: { message: 'The visit changed or reached its limit.' } } })
    const { user } = mount(`/visits/${id}`)
    await screen.findByRole('heading', { name: 'Visit details', level: 1 })
    await user.type(screen.getByLabelText(/Correction or additional note/), 'Keep this fictional correction')
    await user.click(screen.getByRole('button', { name: 'Save additional note' }))
    await screen.findByText(/The visit changed or reached/)
    get.mockResolvedValue({ data: { record: { ...record, version: 20, canAddAddendum: false } } })
    await user.click(screen.getByRole('button', { name: 'Reload latest visit' }))
    await screen.findByText(/This visit has reached the limit/)
    const input = screen.getByLabelText(/Correction or additional note/)
    expect(input.value).toBe('Keep this fictional correction')
    expect(input.readOnly).toBe(true)
    expect(input.disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Save additional note' }).disabled).toBe(true)
  })
})
