import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AuthContext } from '../context/auth.js'
import EncounterPage from '../features/workflow/pages/EncounterPage.jsx'
import QueuePage from '../features/workflow/pages/QueuePage.jsx'
import { AccountsPage } from '../features/workflow/pages/ManagementPages.jsx'
import InvoicePanel from '../features/workflow/components/InvoicePanel.jsx'
import AccessBoundary from '../components/ui/Access.jsx'
import { api } from '../lib/api.js'

const encounter = { id: '0123456789abcdef01234567', patientId: '0123456789abcdef01234568', doctorId: '0123456789abcdef01234569', patientName: 'Fictional Patient', patientNumber: 'PT-TEST', doctorName: 'Fictional Doctor', kind: 'walk_in', reason: 'Fictional consultation', stage: 'in_consultation', arrivedAt: new Date().toISOString(), assessmentCount: 1, assessments: [], history: [], draft: { reason: 'Fictional consultation', notes: 'Saved findings', prescriptions: [] }, hasDraft: true, version: 3 }
const doctor = { role: 'doctor', doctorId: encounter.doctorId, name: 'Fictional Doctor', permissions: [] }
function mount(element, user = doctor, path = `/queue/${encounter.id}?tab=consultation`) {
  const router = createMemoryRouter([{ path: '/queue/:id', element: <AuthContext value={{ user }}><AccessBoundary>{element}</AccessBoundary></AuthContext> }, { path: '/queue', element: <AuthContext value={{ user }}>{element}</AuthContext> }, { path: '/accounts', element: <AuthContext value={{ user }}><AccessBoundary>{element}</AccessBoundary></AuthContext> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { user: userEvent.setup(), router }
}
afterEach(() => vi.restoreAllMocks())
describe('clinic workflow screens', () => {
  it('allows administrators to manage their responsibilities with protected role and active status', async () => {
    const own = { id: 'admin', name: 'Fictional Admin', email: 'admin@example.com', role: 'admin', permissions: [], active: true, version: 0 }
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve({ data: { records: path.startsWith('/operations/accounts') ? [own] : [] } }))
    const { user } = mount(<AccountsPage />, own, '/accounts')
    const manage = await screen.findByRole('button', { name: 'Manage account for Fictional Admin' })
    expect(manage.disabled).toBe(false)
    await user.click(manage)
    expect(screen.getByLabelText('Role').disabled).toBe(true)
    expect(screen.getByLabelText('Account active').disabled).toBe(true)
    expect(screen.getByLabelText('Manage medicine stock and dispensing').checked).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(screen.getByRole('button', { name: 'Discard changes' }).className).toContain('btn-danger')
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('button', { name: 'Save access changes' })).toBeTruthy()
  })
  it('creates a doctor record as part of an employee invitation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { records: [] } })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { code: 'fictional-invitation-code' } })
    const { user } = mount(<AccountsPage />, { id: 'admin', role: 'admin', permissions: [] }, '/accounts')
    await user.click(screen.getByRole('button', { name: 'Invite employee' }))
    await user.type(screen.getByLabelText(/Employee email/), 'doctor@example.com')
    await user.selectOptions(screen.getByLabelText('Role'), 'doctor')
    expect(screen.getByLabelText('Doctor details').value).toBe('new')
    await user.type(screen.getByLabelText(/Doctor full name/), 'Fictional Doctor')
    await user.type(screen.getByLabelText(/Specialty/), 'Neurology')
    await user.click(screen.getByRole('button', { name: 'Create invitation' }))
    await screen.findByRole('heading', { name: 'Invitation created' })
    expect(post.mock.calls[0]).toEqual(['/operations/invitations', { email: 'doctor@example.com', role: 'doctor', permissions: [], doctorId: '', newDoctor: { name: 'Fictional Doctor', specialty: 'Neurology', phone: '' } }])
  })
  it('keeps failed draft edits and prevents finalizing unsaved consultation changes', async () => {
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve({ data: path.startsWith('/medicines?') ? { records: [] } : { record: encounter } }))
    vi.spyOn(api, 'put').mockRejectedValue(new Error('offline'))
    const post = vi.spyOn(api, 'post')
    const { user } = mount(<EncounterPage />)
    const finalize = await screen.findByRole('button', { name: 'Finalize saved consultation' })
    expect(finalize.disabled).toBe(false)
    await user.type(screen.getByLabelText('Findings and examination'), ' additional notes')
    expect(finalize.disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Findings and examination').value).toBe('Saved findings additional notes')
    expect(finalize.disabled).toBe(true)
    expect(post).not.toHaveBeenCalled()
  })
  it('preserves a saved prescription product when reopening a draft', async () => {
    const medicine = { genericName: 'Fictional medicine', brandName: '', strength: '10 mg', dosageForm: 'tablet', stockUnit: 'tablet' }
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve({ data: path.startsWith('/medicines?') ? { records: [] } : { record: { ...encounter, draft: { ...encounter.draft, prescriptions: [{ medicineId: '0123456789abcdef01234571', productKey: 'fictional', quantity: 3, instructions: 'Fictional instructions', medicine }] } } } }))
    mount(<EncounterPage />)
    expect(await screen.findByRole('button', { name: 'Remove Fictional medicine' })).toBeTruthy()
    expect(screen.getByLabelText(/Prescribed quantity/).value).toBe('3')
    expect(screen.getByLabelText(/Prescription instructions/).value).toBe('Fictional instructions')
  })
  it('submits measurements with units, current version, and explicitly blank optional readings', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { record: { ...encounter, stage: 'awaiting_assessment', version: 0 } } })
    const post = vi.spyOn(api, 'post').mockRejectedValue({ response: { data: { message: 'This record changed. Reload before saving.' } } })
    const { user } = mount(<EncounterPage />, { role: 'staff', permissions: ['assess'] }, `/queue/${encounter.id}?tab=assessment`)
    await screen.findByLabelText('Weight (kg)')
    for (const [label, value] of [['Weight (kg)', '62.5'], ['Height (cm)', '165'], ['Systolic BP (mmHg)', '120'], ['Diastolic BP (mmHg)', '80']]) await user.type(screen.getByLabelText(label), value)
    await user.click(screen.getByRole('button', { name: 'Save assessment' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1]).toMatchObject({ version: 0, weight: 62.5, height: 165, systolic: 120, diastolic: 80, temperature: null, pulse: null, oxygen: null })
    expect(screen.getByLabelText('Weight (kg)').value).toBe('62.5')
    expect(screen.queryByRole('link', { name: 'Consultation' })).toBeNull()
  })
  it('keeps clinical and assessment tabs unavailable to reception', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { record: encounter } })
    mount(<EncounterPage />, { role: 'staff', permissions: [] }, `/queue/${encounter.id}`)
    await screen.findByRole('heading', { name: 'Encounter overview' })
    expect(screen.queryByRole('link', { name: 'Consultation' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Assessment' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Billing' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start consultation' })).toBeNull()
  })
  it('denies employee administration to reception before rendering the page', () => {
    mount(<h1>Employee accounts</h1>, { role: 'staff', permissions: [] }, '/accounts')
    expect(screen.getByRole('heading', { name: 'Access restricted' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Employee accounts' })).toBeNull()
  })
  it('shows queue errors as unavailable and retains the search in the URL', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: { records: [], pagination: { total: 0, page: 1, pages: 1 } } })
    const { user, router } = mount(<QueuePage />, doctor, '/queue')
    await screen.findByRole('heading', { name: 'Unable to load records' })
    expect(screen.queryByText('0 encounters')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'No encounters in this view' })
    await user.type(screen.getByRole('searchbox'), 'Fictional')
    await waitFor(() => expect(router.state.location.search).toContain('q=Fictional'))
    expect(screen.queryByRole('link', { name: 'Register arrival' })).toBeNull()
  })
  it('formats amounts and limits payment methods and references', async () => {
    const invoice = { version: 2, totalCentavos: 25000, paidCentavos: 0, balanceCentavos: 25000, lines: [], payments: [] }
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve({ data: path.endsWith('/invoice') ? { record: invoice } : { records: [] } }))
    const post = vi.spyOn(api, 'post')
    const { user } = mount(<InvoicePanel encounter={encounter} />, { role: 'staff' })
    const amount = await screen.findByLabelText(/Amount \(PHP\)/)
    expect(amount.maxLength).toBe(10)
    await user.type(amount, '125.567')
    expect(amount.value).toBe('125.56')
    await user.clear(amount)
    await user.type(amount, '125.5')
    expect(screen.getByText('Amount: ₱125.50')).toBeTruthy()
    await user.tab()
    expect(amount.value).toBe('125.50')
    const method = screen.getByLabelText('Payment method')
    expect(Array.from(method.options).map((option) => option.value)).toEqual(['cash', 'gcash'])
    await user.selectOptions(method, 'gcash')
    const reference = screen.getByLabelText(/Payment reference/)
    expect(reference.maxLength).toBe(50)
    expect(reference.required).toBe(true)
    await user.type(reference, '<invalid>')
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('Use letters, numbers, spaces, hyphens, underscores, or slashes.')).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
  })
  it('converts payment amounts into integer centavos and reuses the request identity after failure', async () => {
    const invoice = { version: 2, totalCentavos: 25000, paidCentavos: 0, balanceCentavos: 25000, lines: [], payments: [] }
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve({ data: path.endsWith('/invoice') ? { record: invoice } : { records: [] } }))
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'))
    const { user } = mount(<InvoicePanel encounter={encounter} />, { role: 'staff' })
    await screen.findByLabelText(/Amount \(PHP\)/)
    await user.type(screen.getByLabelText(/Amount \(PHP\)/), '125.50')
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect(post.mock.calls[0][1]).toMatchObject({ version: 2, amountCentavos: 12550, refund: false })
    expect(post.mock.calls[0][1].requestId).toBe(post.mock.calls[1][1].requestId)
  })
})
