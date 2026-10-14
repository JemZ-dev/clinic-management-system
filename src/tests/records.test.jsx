import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AuthContext } from '../context/auth.js'
import AppLayout from '../layouts/AppLayout.jsx'
import RecordListPage from '../components/records/RecordListPage.jsx'
import RecordDetailPage from '../components/records/RecordDetailPage.jsx'
import RecordFormPage from '../components/records/RecordFormPage.jsx'
import { patientsConfig } from '../features/patients/patients.config.js'
import { doctorsConfig } from '../features/doctors/doctors.config.js'
import { api } from '../lib/api.js'

const id = '0123456789abcdef01234567'
const record = { ...structuredClone(patientsConfig.defaults), id, name: 'Fictional Patient', patientId: 'PT-000000000001', dateOfBirth: '2000-01-01', gender: 'prefer_not_to_say', version: 4, archivedAt: null, updatedAt: '2026-01-01T00:00:00Z' }
const list = (records = [], page = 1, total = records.length) => ({ data: { records, pagination: { page, total, limit: 10, pages: Math.max(1, Math.ceil(total / 10)) } } })
const detail = (value = record) => ({ data: { record: value } })

function mount(path = '/patients/new', logout = vi.fn()) {
  const user = userEvent.setup()
  const router = createMemoryRouter([{ element: <AuthContext value={{ user: { name: 'Fictional Staff', role: 'admin' }, logout }}><AppLayout /></AuthContext>, children: [
    { path: '/', element: <h1>Workspace</h1> },
    { path: '/patients', element: <RecordListPage config={patientsConfig} /> },
    { path: '/patients/new', element: <RecordFormPage config={patientsConfig} /> },
    { path: '/patients/:id/edit', element: <RecordFormPage config={patientsConfig} editing /> },
    { path: '/patients/:id', element: <RecordDetailPage config={patientsConfig} /> },
    { path: '/doctors', element: <RecordListPage config={doctorsConfig} /> },
  ] }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { user, router }
}

afterEach(() => vi.restoreAllMocks())

describe('patient and doctor workflows', () => {
  it('keeps unsaved values when navigation or sign-out is cancelled', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(list())
    const logout = vi.fn()
    const { user, router } = mount('/patients/new', logout)
    await user.type(screen.getByLabelText(/Full name/), 'Unsaved Patient')
    await user.click(screen.getByRole('link', { name: 'Doctors', exact: true }))
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText(/Full name/).value).toBe('Unsaved Patient')
    expect(router.state.location.pathname).toBe('/patients/new')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    const signout = await screen.findByRole('dialog', { name: 'Sign out?' })
    await user.click(within(signout).getByRole('button', { name: 'Cancel' }))
    expect(logout).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Full name/).value).toBe('Unsaved Patient')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Sign out?' })).getByRole('button', { name: 'Sign out' }))
    expect(logout).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }))
    await user.click(screen.getByRole('link', { name: 'Doctors', exact: true }))
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await screen.findByRole('heading', { name: 'Doctors', level: 1 })
    expect(router.state.location.pathname).toBe('/doctors')
  })

  it('preserves a rejected form, connects nested field errors, and redirects after a successful save', async () => {
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(path.startsWith('/visits?') ? list() : detail()))
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce({ response: { status: 400, data: { message: 'Please check the form and try again.', fields: { 'emergencyContact.phone': 'Enter a valid phone number.' } } } }).mockResolvedValueOnce(detail())
    const { user, router } = mount()
    await user.type(screen.getByLabelText(/Full name/), 'Fictional Patient')
    await user.type(screen.getByLabelText(/Birth date/), '2000-01-01')
    await user.selectOptions(screen.getByLabelText(/^Gender/), 'prefer_not_to_say')
    await user.type(screen.getByLabelText(/Contact phone number/), '5550100')
    await user.click(screen.getByRole('button', { name: 'Save patient' }))
    await screen.findByText('Enter a valid phone number.')
    expect(screen.getByLabelText(/Full name/).value).toBe('Fictional Patient')
    expect(screen.getByLabelText(/Contact phone number/).getAttribute('aria-describedby')).toBe('record-emergencyContact-phone-error')
    await waitFor(() => expect(document.activeElement.id).toBe('record-form-error'))
    await user.clear(screen.getByLabelText(/Contact phone number/))
    await user.type(screen.getByLabelText(/Contact phone number/), '5550101')
    await user.click(screen.getByRole('button', { name: 'Save patient' }))
    await screen.findByRole('heading', { name: 'Fictional Patient', level: 1 })
    expect(router.state.location.pathname).toBe(`/patients/${id}`)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(post.mock.calls[1][1].emergencyContact.phone).toBe('5550101')
    expect(screen.getByText('Patient added successfully.')).toBeTruthy()
  })

  it('prevents duplicate submissions and leaving while a save is pending', async () => {
    let resolveSave
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(path.startsWith('/visits?') ? list() : detail()))
    const post = vi.spyOn(api, 'post').mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
    const { user, router } = mount()
    await user.type(screen.getByLabelText(/Full name/), 'Fictional Patient')
    await user.type(screen.getByLabelText(/Birth date/), '2000-01-01')
    await user.selectOptions(screen.getByLabelText(/^Gender/), 'prefer_not_to_say')
    await user.click(screen.getByRole('button', { name: /Save patient/ }))
    expect(screen.getByRole('button', { name: /Save patient/ }).disabled).toBe(true)
    await user.click(screen.getByRole('link', { name: 'Doctors', exact: true }))
    await screen.findByRole('dialog', { name: 'Saving your changes' })
    expect(screen.queryByRole('button', { name: 'Discard changes' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Stay on page' }))
    await act(async () => resolveSave(detail()))
    await screen.findByRole('heading', { name: 'Fictional Patient', level: 1 })
    expect(post).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe(`/patients/${id}`)
  })

  it('preserves conflicting edits and warns before opening the latest record', async () => {
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(path.startsWith('/visits?') ? list() : detail()))
    const patch = vi.spyOn(api, 'patch').mockRejectedValue({ response: { status: 409, data: { message: 'This record changed since you opened it. Reload the latest record before trying again.' } } })
    const { user, router } = mount(`/patients/${id}/edit`)
    await screen.findByDisplayValue('Fictional Patient')
    await user.type(screen.getByLabelText(/Allergies/), 'Unsaved allergy note')
    await user.click(screen.getByRole('button', { name: 'Save patient' }))
    await screen.findByText(/This record changed since/)
    expect(screen.getByLabelText(/Allergies/).value).toBe('Unsaved allergy note')
    expect(patch.mock.calls[0][1].version).toBe(4)
    await user.click(screen.getByRole('link', { name: 'latest record' }))
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(router.state.location.pathname).toBe(`/patients/${id}/edit`)
  })

  it('recovers from list failure and keeps search/filter/pagination in the URL', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(list([record], 1, 11))
    const { user, router } = mount('/patients')
    await screen.findByRole('heading', { name: 'Unable to load records' })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: 'Fictional Patient', exact: true })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(router.state.location.search).toContain('page=2'))
    await user.type(screen.getByRole('searchbox'), 'Fictional')
    await waitFor(() => expect(router.state.location.search).toContain('q=Fictional'))
    expect(router.state.location.search).toContain('page=1')
    await user.selectOptions(screen.getByLabelText('Records'), 'archived')
    await waitFor(() => expect(router.state.location.search).toContain('status=archived'))
    expect(get.mock.calls.at(-1)[0]).toContain('status=archived')
  })

  it('clears an applied search from a later page while keeping the record filter and returning focus', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(list([record], 2, 21))
    const { user, router } = mount('/patients?q=Fictional&status=archived&page=2')
    await screen.findByRole('link', { name: 'Fictional Patient', exact: true })
    await user.click(screen.getByRole('button', { name: 'Clear search input' }))
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search)
      expect(params.has('q')).toBe(false)
      expect(params.get('page')).toBe('1')
      expect(params.get('status')).toBe('archived')
      expect(screen.getByRole('searchbox').value).toBe('')
      expect(document.activeElement).toBe(screen.getByRole('searchbox'))
    })
    expect(get.mock.calls.at(-1)[0]).toContain('q=&status=archived')
  })

  it('shows an honest empty state and a separate no-results state', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(list())
    const { user } = mount('/patients')
    await screen.findByRole('heading', { name: 'No patients yet' })
    await user.type(screen.getByRole('searchbox'), 'missing')
    await screen.findByRole('heading', { name: 'No matching records' })
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    await screen.findByRole('heading', { name: 'No patients yet' })
  })

  it('shows loading and ignores results from an older search request', async () => {
    let resolveOld
    const oldRequest = new Promise((resolve) => { resolveOld = resolve })
    vi.spyOn(api, 'get').mockReturnValueOnce(oldRequest).mockResolvedValueOnce(list())
    const { user } = mount('/patients')
    expect(screen.getByRole('heading', { name: 'Loading patients' })).toBeTruthy()
    await user.type(screen.getByRole('searchbox'), 'new search')
    await screen.findByRole('heading', { name: 'No matching records' })
    await act(async () => resolveOld(list([record])))
    expect(screen.queryByRole('link', { name: 'Fictional Patient', exact: true })).toBeNull()
    expect(screen.getByRole('heading', { name: 'No matching records' })).toBeTruthy()
  })

  it('explains why scheduled appointments block archiving and links to those appointments', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(detail())
    const message = 'This patient has scheduled appointments and cannot be archived. Cancel or resolve those appointments first.'
    const remove = vi.spyOn(api, 'delete').mockRejectedValue({ response: { status: 409, data: { message, fields: { appointments: 'Scheduled appointments must be resolved before archiving.' } } } })
    const { user } = mount(`/patients/${id}`)
    await screen.findByRole('heading', { name: 'Fictional Patient', level: 1 })
    await user.click(screen.getByRole('button', { name: 'Archive', exact: true }))
    await user.click(screen.getByRole('button', { name: 'Archive record' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining(message))
    expect(screen.getByRole('link', { name: 'View scheduled appointments' }).getAttribute('href')).toBe(`/appointments?patientId=${id}&status=scheduled&date=`)
    expect(screen.getByRole('button', { name: 'Archive record' }).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Reload record' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restore', exact: true })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Archive', exact: true })).toBeTruthy()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('archives only after confirmation and preserves history on the refreshed page', async () => {
    const withHistory = { ...record, medicalHistory: { ...record.medicalHistory, allergies: 'Fictional allergy' } }
    let detailReads = 0
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(path.startsWith('/visits?') ? list() : detail(detailReads++ === 0 ? withHistory : { ...withHistory, archivedAt: '2026-01-02T00:00:00Z', version: 5 })))
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(detail())
    const { user } = mount(`/patients/${id}`)
    await screen.findByRole('heading', { name: 'Fictional Patient', level: 1 })
    await user.click(screen.getByRole('button', { name: 'Archive', exact: true }))
    expect(remove).not.toHaveBeenCalled()
    await screen.findByRole('dialog', { name: 'Archive patient?' })
    await user.click(screen.getByRole('button', { name: 'Archive record' }))
    await screen.findByRole('button', { name: 'Restore', exact: true })
    expect(screen.getByText('Fictional allergy')).toBeTruthy()
    expect(remove).toHaveBeenCalledWith(`/patients/${id}`, { data: { version: 4 } })
    expect(screen.getByText('Fictional Patient archived successfully.')).toBeTruthy()
  })
})
