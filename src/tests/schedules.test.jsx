import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AuthContext } from '../context/auth.js'
import { SchedulesPage } from '../features/workflow/pages/ManagementPages.jsx'
import { api } from '../lib/api.js'

afterEach(() => vi.restoreAllMocks())

async function openSchedule(weekly) {
  const doctor = { id: 'doctor-test', name: 'Fictional Doctor', specialty: 'Family medicine' }
  vi.spyOn(api, 'get').mockImplementation(async (path) => ({ data: path.startsWith('/doctors?')
    ? { records: [doctor], pagination: { page: 1, pages: 1 } }
    : { record: { weekly, leave: [], version: 0 } } }))
  const user = userEvent.setup()
  const router = createMemoryRouter([{ path: '/schedules', element: <AuthContext value={{ user: { role: 'admin' } }}><SchedulesPage /></AuthContext> }], { initialEntries: ['/schedules'] })
  render(<RouterProvider router={router} />)
  await screen.findByRole('option', { name: /Fictional Doctor/ })
  await user.selectOptions(screen.getByLabelText(/^Doctor/), doctor.id)
  await screen.findByRole('button', { name: 'Save schedule' })
  return user
}

it('shows a seven-day calendar and applies hours only after confirmation', async () => {
  const user = await openSchedule([{ day: 1, start: '09:00', end: '12:00' }])
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })
  expect(screen.getAllByRole('button', { name: /Edit .* working hours/ })).toHaveLength(7)
  expect(within(screen.getByRole('button', { name: 'Edit Monday working hours' })).getByText('9:00 AM')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Edit Tuesday working hours' }))
  const dialog = await screen.findByRole('dialog', { name: 'Tuesday working hours' })
  await user.clear(within(dialog).getByLabelText(/Start/))
  await user.type(within(dialog).getByLabelText(/Start/), '10:17')
  await user.click(within(dialog).getByRole('button', { name: 'Apply hours' }))
  expect(put).not.toHaveBeenCalled()
  expect(within(screen.getByRole('button', { name: 'Edit Tuesday working hours' })).getByText('10:17 AM')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Save schedule' }))
  expect(put.mock.calls[0][1].weekly).toEqual([{ day: 1, start: '09:00', end: '12:00' }, { day: 2, start: '10:17', end: '12:00' }])
})

it('preserves split periods, cancels local edits, and marks a day unavailable', async () => {
  const user = await openSchedule([{ day: 1, start: '09:00', end: '12:00' }, { day: 1, start: '13:00', end: '17:00' }])
  await user.click(screen.getByRole('button', { name: 'Edit Monday working hours' }))
  let dialog = await screen.findByRole('dialog', { name: 'Monday working hours' })
  expect(within(dialog).getAllByLabelText(/Start/)).toHaveLength(2)
  await user.click(within(dialog).getByRole('button', { name: 'Mark day unavailable' }))
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(within(screen.getByRole('button', { name: 'Edit Monday working hours' })).getByText('9:00 AM')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Edit Monday working hours' }))
  dialog = await screen.findByRole('dialog', { name: 'Monday working hours' })
  await user.click(within(dialog).getByRole('button', { name: 'Mark day unavailable' }))
  await user.click(within(dialog).getByRole('button', { name: 'Apply hours' }))
  expect(within(screen.getByRole('button', { name: 'Edit Monday working hours' })).getByText('Unavailable')).toBeTruthy()
})
