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

it('disables used days, adds the next available day, and releases a day when a row is removed', async () => {
  const user = await openSchedule([{ day: 1, start: '09:00', end: '12:00' }])
  await user.click(screen.getByRole('button', { name: 'Add working period' }))
  let rows = screen.getAllByLabelText('Day')
  expect(rows.map((row) => row.value)).toEqual(['1', '2'])
  expect(within(rows[0]).getByRole('option', { name: 'Monday' }).disabled).toBe(false)
  expect(within(rows[0]).getByRole('option', { name: 'Tuesday' }).disabled).toBe(true)
  expect(within(rows[1]).getByRole('option', { name: 'Monday' }).disabled).toBe(true)
  await user.selectOptions(rows[1], '1')
  expect(rows[1].value).toBe('2')
  await user.selectOptions(rows[1], '3')
  expect(within(rows[0]).getByRole('option', { name: 'Tuesday' }).disabled).toBe(false)
  expect(within(rows[0]).getByRole('option', { name: 'Wednesday' }).disabled).toBe(true)
  await user.click(screen.getByRole('button', { name: /Remove Monday working period/ }))
  rows = screen.getAllByLabelText('Day')
  expect(within(rows[0]).getByRole('option', { name: 'Monday' }).disabled).toBe(false)
})

it('disables adding when all seven days are used and preserves existing split periods', async () => {
  const user = await openSchedule([
    ...Array.from({ length: 7 }, (_, day) => ({ day, start: '09:00', end: '12:00' })),
    { day: 1, start: '13:00', end: '17:00' },
  ])
  expect(screen.getByRole('button', { name: 'Add working period' }).disabled).toBe(true)
  const mondays = screen.getAllByLabelText('Day').filter((row) => row.value === '1')
  expect(mondays).toHaveLength(2)
  for (const row of mondays) expect(within(row).getByRole('option', { name: 'Monday' }).disabled).toBe(false)
  await user.click(screen.getByRole('button', { name: /Remove Sunday working period/ }))
  expect(screen.getByRole('button', { name: 'Add working period' }).disabled).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Add working period' }))
  expect(screen.getAllByLabelText('Day').at(-1).value).toBe('0')
})
