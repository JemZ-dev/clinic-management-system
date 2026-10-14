import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AuthContext } from '../context/auth.js'
import OrdersPanel from '../features/workflow/components/OrdersPanel.jsx'
import { api } from '../lib/api.js'

afterEach(() => vi.restoreAllMocks())
it('combines diagnostic filters, pages results, and clears filters without losing encounter scope', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    const query = new URLSearchParams(path.split('?')[1])
    return { data: { records: [], pagination: { page: Number(query.get('page') || 1), pages: 3, total: 51 } } }
  })
  const router = createMemoryRouter([{ path: '/', element: <AuthContext value={{ user: { role: 'doctor' } }}><OrdersPanel encounter={{ id: 'encounter-test', stage: 'finished' }} /></AuthContext> }])
  render(<RouterProvider router={router} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('searchbox'), 'X-ray')
  await user.selectOptions(screen.getByLabelText('Status'), 'reviewed')
  await user.selectOptions(screen.getByLabelText('Category'), 'imaging')
  await user.selectOptions(screen.getByLabelText('Provider'), 'in_house')
  await user.type(screen.getByLabelText('Requested from'), '2026-10-01')
  await user.type(screen.getByLabelText('Requested through'), '2026-10-15')
  await waitFor(() => expect(get.mock.calls.some(([path]) => path.includes('q=X-ray'))).toBe(true))
  await user.selectOptions(screen.getByLabelText('Per page'), '25')
  await user.click(await screen.findByRole('button', { name: 'Next' }))
  await waitFor(() => expect(get.mock.calls.at(-1)[0]).toContain('page=2'))
  expect(get.mock.calls.at(-1)[0]).toContain('category=imaging')
  expect(get.mock.calls.at(-1)[0]).toContain('status=reviewed')
  expect(get.mock.calls.at(-1)[0]).toContain('provider=in_house')
  expect(get.mock.calls.at(-1)[0]).toContain('from=2026-10-01')
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(get.mock.calls.at(-1)[0]).toContain('q=&status=all'))
  expect(get.mock.calls.at(-1)[0]).toContain('encounterId=encounter-test')
  expect(get.mock.calls.at(-1)[0]).toContain('page=1')
})

it.each(['doctor', 'staff'])('shows a duplicate warning and restricts the repeat override for %s', async (role) => {
  vi.spyOn(api, 'get').mockImplementation(async (path) => ({ data: { records: path === '/operations/services' ? [{ id: 'xray', name: 'Chest X-ray', active: true, category: 'imaging', priceCentavos: 30000 }] : [] } }))
  const post = vi.spyOn(api, 'post').mockRejectedValueOnce({ response: { data: { message: 'This test is already pending.', duplicateOrder: { id: 'pending-test', encounterId: 'previous-visit', serviceId: 'xray', serviceName: 'Chest X-ray', stage: 'requested', createdAt: '2026-10-15T00:00:00Z' } } } }).mockResolvedValue({ data: {} })
  const router = createMemoryRouter([{ path: '/', element: <AuthContext value={{ user: { role } }}><OrdersPanel encounter={{ id: 'visit', kind: 'external_test', stage: 'waiting' }} /></AuthContext> }])
  render(<RouterProvider router={router} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Request test' }))
  await user.selectOptions(await screen.findByLabelText(/Diagnostic service/), 'xray')
  await user.click(screen.getByRole('button', { name: 'Create test request' }))
  expect((await screen.findByRole('link', { name: 'View existing request' })).getAttribute('href')).toBe('/queue/previous-visit?tab=tests')
  if (role === 'doctor') {
    await user.click(screen.getByRole('checkbox', { name: 'I confirm this repeat test is intentional' }))
    await user.type(screen.getByLabelText(/Reason for repeat test/), 'Additional view required')
    await user.click(screen.getByRole('button', { name: 'Create test request' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect(post.mock.calls[1][1]).toMatchObject({ repeatAcknowledged: true, repeatOf: 'pending-test', repeatReason: 'Additional view required' })
  } else {
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('A doctor must authorize an intentional repeat test.')).toBeTruthy()
  }
})
