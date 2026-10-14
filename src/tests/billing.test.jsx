import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { BillingPage } from '../features/workflow/pages/ManagementPages.jsx'
import { api } from '../lib/api.js'

afterEach(() => vi.restoreAllMocks())
it('combines patient, status, inclusive date filters, page sizes, and pagination, and clears them', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    const params = new URLSearchParams(path.split('?')[1])
    return { data: { records: [], pagination: { page: Number(params.get('page')), limit: Number(params.get('limit')), total: 51, pages: 3 } } }
  })
  const router = createMemoryRouter([{ path: '/billing', element: <BillingPage /> }], { initialEntries: ['/billing'] })
  render(<RouterProvider router={router} />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('searchbox'), 'PT-TEST')
  await user.selectOptions(screen.getByLabelText('Payment status'), 'partially_paid')
  await user.type(screen.getByLabelText('Encounter from'), '2026-10-01')
  await user.type(screen.getByLabelText('Encounter through'), '2026-10-15')
  await waitFor(() => expect(router.state.location.search).toContain('q=PT-TEST'))
  await screen.findByText('51 billing records')
  await user.selectOptions(screen.getByLabelText('Per page'), '25')
  await user.click(await screen.findByRole('button', { name: 'Next' }))
  await waitFor(() => expect(router.state.location.search).toContain('page=2'))
  expect(get.mock.calls.at(-1)[0]).toContain('status=partially_paid')
  expect(get.mock.calls.at(-1)[0]).toContain('from=2026-10-01')
  expect(get.mock.calls.at(-1)[0]).toContain('through=2026-10-15')
  await user.selectOptions(screen.getByLabelText('Payment status'), 'paid')
  await waitFor(() => expect(router.state.location.search).toContain('page=1'))
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(router.state.location.search).toBe(''))
  expect(screen.getByRole('searchbox').value).toBe('')
})
