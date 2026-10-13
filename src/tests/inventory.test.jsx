import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import AppLayout from '../layouts/AppLayout.jsx'
import { AuthContext } from '../context/auth.js'
import MedicinesPage from '../features/medicines/pages/MedicinesPage.jsx'
import MedicineFormPage from '../features/medicines/pages/MedicineFormPage.jsx'
import MedicineDetailsPage from '../features/medicines/pages/MedicineDetailsPage.jsx'
import InventoryPage from '../features/inventory/pages/InventoryPage.jsx'
import VisitFormPage from '../features/visits/pages/VisitFormPage.jsx'
import VisitDetailsPage from '../features/visits/pages/VisitDetailsPage.jsx'
import ClinicOverview from '../features/dashboard/components/ClinicOverview.jsx'
import { api } from '../lib/api.js'
import { clinicToday } from '../lib/clinicTime.js'

const medId = '0123456789abcdef01234567', visitId = '0123456789abcdef01234568', lineId = '0123456789abcdef01234569'
const medicine = { id: medId, version: 3, genericName: 'Fictional medicine', brandName: 'Fictional brand', strength: 'label strength', dosageForm: 'tablet', stockUnit: 'tablet', quantity: 5, lowStockThreshold: 2, lowStock: false, identityLocked: true, archivedAt: null, notes: '', productKey: 'a'.repeat(64) }
const patient = { id: '0123456789abcdef01234570', name: 'Fictional Patient', patientId: 'PT-001', archivedAt: null }
const doctor = { id: '0123456789abcdef01234571', name: 'Fictional Doctor', specialty: 'Family medicine', archivedAt: null }
const visit = { id: visitId, version: 2, patient, doctor, patientId: patient.id, doctorId: doctor.id, appointmentId: null, date: clinicToday(), reason: 'Fictional consultation', author: { name: 'Fictional Staff' }, createdAt: new Date().toISOString(), addenda: [], canAddAddendum: true, prescriptions: [{ id: lineId, medicineId: medId, medicine, quantity: 3, instructions: 'Fictional clinician directions', dispensedQuantity: 0, remainingQuantity: 3 }] }
const paged = (records = [], pagination = {}) => ({ data: { records, pagination: { page: 1, limit: 10, pages: 1, total: records.length, ...pagination } } })
function getFixtures(overrides = {}) {
  return vi.spyOn(api, 'get').mockImplementation((path) => {
    if (overrides[path]) return overrides[path]()
    if (path === `/medicines/${medId}`) return Promise.resolve({ data: { record: medicine } })
    if (path.startsWith('/medicines?')) return Promise.resolve(paged([medicine]))
    if (path === `/visits/${visitId}`) return Promise.resolve({ data: { record: visit } })
    if (path.startsWith('/patients?')) return Promise.resolve(paged([patient]))
    if (path.startsWith('/doctors?')) return Promise.resolve(paged([doctor]))
    return Promise.resolve(paged())
  })
}
function mount(path) {
  const logout = vi.fn()
  const router = createMemoryRouter([{ element: <AuthContext value={{ user: { name: 'Fictional Staff', role: 'doctor', doctorId: doctor.id, permissions: ['dispense'] }, logout }}><AppLayout /></AuthContext>, children: [
    { path: '/', element: <ClinicOverview /> }, { path: '/medicines', element: <MedicinesPage /> }, { path: '/medicines/new', element: <MedicineFormPage /> }, { path: '/medicines/:id/edit', element: <MedicineFormPage editing /> }, { path: '/medicines/:id', element: <MedicineDetailsPage /> }, { path: '/inventory', element: <InventoryPage /> }, { path: '/visits/new', element: <VisitFormPage /> }, { path: '/visits/:id', element: <VisitDetailsPage /> },
  ] }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, logout, user: userEvent.setup() }
}
afterEach(() => vi.restoreAllMocks())
describe('medicine and inventory screens', () => {
  it('offers dosage forms and submits the selected label with medicine details', async () => {
    getFixtures()
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'))
    const { user } = mount('/medicines/new')
    await user.type(screen.getByLabelText(/^Generic name/), 'Fictional medicine')
    await user.type(screen.getByLabelText(/^Strength/), '500 mg')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Dosage form/ }), 'tablet')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Stock unit/ }), 'tablet')
    await user.click(screen.getByRole('button', { name: 'Save medicine' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1].dosageForm).toBe('tablet')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Dosage form/ }), 'other')
    await user.type(screen.getByLabelText(/^Specify dosage form/), 'buccal film')
    await user.click(screen.getByRole('button', { name: 'Save medicine' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect(post.mock.calls[1][1].dosageForm).toBe('buccal film')
  })

  it('preserves a legacy dosage form and locks its selector when history exists', async () => {
    getFixtures({ [`/medicines/${medId}`]: () => Promise.resolve({ data: { record: { ...medicine, dosageForm: 'legacy formulation' } } }) })
    mount(`/medicines/${medId}/edit`)
    const select = await screen.findByRole('combobox', { name: /^Dosage form/ })
    expect(select.disabled).toBe(true)
    expect(screen.getByLabelText(/^Specify dosage form/).value).toBe('legacy formulation')
    expect(screen.getByLabelText(/^Specify dosage form/).readOnly).toBe(true)
  })
  it('shows exact units and zero-stock status, and resets pagination when filtering', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(paged([{ ...medicine, quantity: 0, lowStock: true }]))
    const { user, router } = mount('/medicines?page=3')
    await screen.findByRole('link', { name: medicine.genericName })
    expect(within(screen.getByRole('table')).getByText('Out of stock')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Low-stock threshold' })).toBeTruthy()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Stock' }), 'low')
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('page')).toBe('1'))
    expect(get.mock.calls.at(-1)[0]).toContain('stock=low')
  })
  it('distinguishes unavailable catalog data from an empty catalog and offers retry', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(paged())
    const { user } = mount('/medicines')
    await screen.findByRole('heading', { name: 'Unable to load medicines' })
    expect(screen.queryByText('No medicines yet')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'No medicines yet' })
  })
  it('keeps used product identity read-only while allowing notes and threshold edits', async () => {
    getFixtures()
    const patch = vi.spyOn(api, 'patch').mockRejectedValue({ response: { status: 409, data: { message: 'This medicine changed.' } } })
    const { user } = mount(`/medicines/${medId}/edit`)
    await screen.findByRole('heading', { name: 'Edit medicine' })
    expect(screen.getByLabelText(/Generic name/).readOnly).toBe(true)
    expect(screen.getByRole('combobox', { name: /^Stock unit/ }).disabled).toBe(true)
    await user.type(screen.getByLabelText(/Inventory notes/), 'Updated note')
    await user.clear(screen.getByLabelText(/Low-stock threshold/)); await user.type(screen.getByLabelText(/Low-stock threshold/), '4')
    await user.click(screen.getByRole('button', { name: 'Save medicine' }))
    await screen.findByText('This medicine changed.')
    expect(screen.getByLabelText(/Inventory notes/).value).toBe('Updated note')
    expect(patch.mock.calls[0][1]).toMatchObject({ version: 3, lowStockThreshold: 4 })
    expect(patch.mock.calls[0][1].quantity).toBeUndefined()
  })
  it('preserves receipt entries across a failed refresh and retries with the original save identity', async () => {
    let reads = 0
    getFixtures({ [`/medicines/${medId}`]: () => ++reads === 2 ? Promise.reject(new Error('offline')) : Promise.resolve({ data: { record: { ...medicine, version: reads > 1 ? 4 : 3 } } }) })
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce({ response: { status: 409, data: { message: 'This medicine changed.' } } }).mockResolvedValueOnce({ data: { movement: {} } })
    const { user } = mount(`/medicines/${medId}`)
    await screen.findByRole('heading', { name: medicine.genericName })
    await user.type(screen.getByLabelText(/Quantity \(tablet\)/), '2')
    await user.type(screen.getByLabelText(/Receipt note/), 'Delivery note')
    expect(screen.getByRole('button', { name: 'Archive' }).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Save stock movement' }))
    await screen.findByText('This medicine changed.')
    await user.click(screen.getByRole('button', { name: 'Reload current stock' }))
    await screen.findByText(/Unable to refresh stock/)
    expect(screen.getByLabelText(/Receipt note/).value).toBe('Delivery note')
    expect(screen.getByRole('button', { name: 'Save stock movement' }).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save stock movement' }).disabled).toBe(false))
    await user.click(screen.getByRole('button', { name: 'Save stock movement' }))
    await screen.findByText(/Stock movement saved/)
    expect(post.mock.calls[0][1].requestId).toBe(post.mock.calls[1][1].requestId)
    expect(post.mock.calls[1][1]).toMatchObject({ quantity: 2, version: 4, type: 'receipt', note: 'Delivery note' })
    expect(screen.getByLabelText(/Quantity \(tablet\)/).value).toBe('')
  })
  it('selects exact catalog products for a visit without creating a stock movement', async () => {
    getFixtures()
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { record: visit } })
    const { user } = mount('/visits/new')
    await screen.findByRole('option', { name: /Fictional Patient/ })
    await user.selectOptions(screen.getByRole('combobox', { name: /^Patient/ }), patient.id)
    await user.selectOptions(screen.getByRole('combobox', { name: /Attending doctor/ }), doctor.id)
    await user.type(screen.getByLabelText(/Reason for visit/), 'Fictional consultation')
    await user.click(await screen.findByRole('button', { name: /^Add Fictional medicine/ }))
    expect(screen.getByRole('button', { name: /^Add Fictional medicine/ }).disabled).toBe(true)
    await user.type(screen.getByLabelText(/Prescribed quantity/), '3')
    await user.type(screen.getByLabelText(/Prescription instructions/), 'Fictional clinician directions')
    await user.click(screen.getByRole('button', { name: 'Save visit' }))
    await screen.findByRole('heading', { name: 'Visit details', level: 1 })
    expect(post.mock.calls).toHaveLength(1)
    expect(post.mock.calls[0][0]).toBe('/visits')
    expect(post.mock.calls[0][1].prescriptions).toEqual([{ medicineId: medId, productKey: medicine.productKey, quantity: 3, instructions: 'Fictional clinician directions' }])
  })
  it('retains dispensing entries, reloads stock and visit versions, and saves actual quantities once', async () => {
    let medicineReads = 0, visitReads = 0
    getFixtures({ [`/medicines/${medId}`]: () => Promise.resolve({ data: { record: { ...medicine, version: ++medicineReads > 1 ? 4 : 3 } } }), [`/visits/${visitId}`]: () => Promise.resolve({ data: { record: { ...visit, version: ++visitReads > 1 ? 3 : 2 } } }) })
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce({ response: { status: 409, data: { message: 'Review the updated visit.' } } }).mockResolvedValueOnce({ data: { movement: {} } })
    const { user } = mount(`/visits/${visitId}`)
    await user.click(await screen.findByRole('button', { name: 'Dispense Fictional medicine' }))
    await screen.findByText('5 tablet currently available.')
    await user.type(screen.getByLabelText(/Quantity to dispense/), '2')
    await user.type(screen.getByLabelText(/Dispensing note/), 'Fictional partial supply')
    await user.click(screen.getByRole('button', { name: 'Save dispensing' }))
    await screen.findByText('Review the updated visit.')
    await user.click(screen.getByRole('button', { name: 'Reload stock and visit' }))
    await screen.findByText('5 tablet currently available.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save dispensing' }).disabled).toBe(false))
    expect(screen.getByLabelText(/Dispensing note/).value).toBe('Fictional partial supply')
    await user.click(screen.getByRole('button', { name: 'Save dispensing' }))
    await screen.findByText(/Dispensing saved/)
    expect(post.mock.calls[0][1].requestId).toBe(post.mock.calls[1][1].requestId)
    expect(post.mock.calls[1][1]).toMatchObject({ type: 'dispense', quantity: 2, visitId, prescriptionId: lineId, version: 4, visitVersion: 3 })
  })
  it('blocks dispensing with unavailable stock and requires explicit discard of entered quantities', async () => {
    getFixtures({ [`/medicines/${medId}`]: () => Promise.resolve({ data: { record: { ...medicine, quantity: 0 } } }) })
    const post = vi.spyOn(api, 'post')
    const { user } = mount(`/visits/${visitId}`)
    await user.click(await screen.findByRole('button', { name: 'Dispense Fictional medicine' }))
    await screen.findByText('0 tablet currently available.')
    expect(screen.getByRole('button', { name: 'Save dispensing' }).disabled).toBe(true)
    expect(screen.getByLabelText(/Quantity to dispense/).readOnly).toBe(true)
    await user.type(screen.getByLabelText(/Dispensing note/), 'Unsaved explanation')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await screen.findByText('Discard these unsaved dispensing entries?')
    expect(post).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText(/Dispensing note/).value).toBe('Unsaved explanation')
    await user.click(screen.getByRole('button', { name: 'Cancel' })); await user.click(screen.getByRole('button', { name: 'Discard entries' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('shows archived product history without offering stock mutations and restores with a version', async () => {
    getFixtures({ [`/medicines/${medId}`]: () => Promise.resolve({ data: { record: { ...medicine, archivedAt: new Date().toISOString() } } }) })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { record: medicine } })
    const { user } = mount(`/medicines/${medId}`)
    await screen.findByRole('heading', { name: medicine.genericName })
    expect(screen.queryByRole('button', { name: 'Save stock movement' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Stock movement history' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restore medicine' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith(`/medicines/${medId}/restore`, { version: 3 }))
  })
  it('uses saved signed stock movements and visit filters without offering history edits', async () => {
    const movement = { id: lineId, medicineId: medId, medicine, type: 'dispense', quantity: -2, balanceAfter: 3, note: 'Fictional partial supply', author: { name: 'Fictional Staff' }, visitId, createdAt: new Date().toISOString() }
    const get = vi.spyOn(api, 'get').mockResolvedValue(paged([movement]))
    mount(`/inventory?visitId=${visitId}`)
    await screen.findByRole('link', { name: 'View visit' })
    expect(screen.getByText('-2')).toBeTruthy(); expect(screen.getByText('3')).toBeTruthy()
    expect(get.mock.calls[0][0]).toContain(`visitId=${visitId}`)
    expect(screen.queryByRole('button', { name: /Edit|Delete/ })).toBeNull()
  })
  it('protects dirty dispensing entries during route navigation and sign-out', async () => {
    getFixtures()
    const { user, router, logout } = mount(`/visits/${visitId}`)
    await user.click(await screen.findByRole('button', { name: 'Dispense Fictional medicine' }))
    await screen.findByText('5 tablet currently available.')
    await user.type(screen.getByLabelText(/Quantity to dispense/), '1')
    const navigation = router.navigate('/medicines')
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(router.state.location.pathname).toBe(`/visits/${visitId}`)
    await user.click(within(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).getByRole('button', { name: 'Keep editing' }))
    await navigation
    expect(screen.getByLabelText(/Quantity to dispense/).value).toBe('1')
    window.dispatchEvent(new CustomEvent('clinic-before-signout', { cancelable: true, detail: { proceed: logout } }))
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(logout).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText(/Quantity to dispense/).value).toBe('1')
  })
  it('requires an adjustment reason and sends a signed correction instead of directly editing the balance', async () => {
    getFixtures()
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { movement: {} } })
    const { user } = mount(`/medicines/${medId}`)
    await screen.findByRole('heading', { name: medicine.genericName })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Movement type' }), 'adjustment')
    await user.type(screen.getByLabelText(/Quantity \(tablet\)/), '-2')
    await user.click(screen.getByRole('button', { name: 'Save stock movement' }))
    expect(post).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText(/Reason for adjustment/), 'Fictional stock count correction')
    await user.click(screen.getByRole('button', { name: 'Save stock movement' }))
    await screen.findByText(/Stock movement saved/)
    expect(post.mock.calls[0][1]).toMatchObject({ type: 'adjustment', quantity: -2, note: 'Fictional stock count correction', version: 3 })
    expect(post.mock.calls[0][1].balanceAfter).toBeUndefined()
  })
  it('shows low-stock counts from saved data and excludes archived products in the displayed response', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { date: clinicToday(), patients: 0, doctors: 0, waiting: 0, todayTotal: 0, statuses: { scheduled: 0, checked_in: 0, completed: 0, cancelled: 0, no_show: 0 }, appointments: [], lowStockCount: 1, lowStockMedicines: [{ ...medicine, quantity: 0, lowStock: true }] } })
    mount('/')
    await screen.findByRole('heading', { name: 'Low stock (1)' })
    expect(screen.getByText('Out of stock')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View all low-stock medicines' }).getAttribute('href')).toBe('/medicines?stock=low')
  })
})
