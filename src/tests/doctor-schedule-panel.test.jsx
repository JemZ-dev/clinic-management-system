import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DoctorSchedulePanel from '../features/appointments/components/DoctorSchedulePanel.jsx'
import { api } from '../lib/api.js'
import { formatClinicDate } from '../lib/clinicTime.js'

const doctor = { id: 'doctor-test', name: 'Fictional Doctor', specialty: 'Family medicine' }
const schedule = { weekly: Array.from({ length: 7 }, (_, day) => ({ day, start: '09:00', end: '17:00' })), leave: [{ from: '2030-01-16', through: '2030-01-16', reason: 'Private reason' }] }
afterEach(() => vi.restoreAllMocks())

it('accepts manually typed available times and blocks unavailable ones', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (path) => ({ data: path.startsWith('/operations/schedules/') ? { record: schedule } : { configured: true, slots: ['09:17'] } }))
  const { user, onUse } = mount()
  const input = await screen.findByLabelText('Type a start time')
  await user.type(input, '09:19')
  expect(screen.getByText(/This time is unavailable/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use this date and time' }).disabled).toBe(true)
  await user.clear(input)
  await user.type(input, '09:17')
  expect(screen.getByLabelText('Available time').value).toBe('09:17')
  await user.click(screen.getByRole('button', { name: 'Use this date and time' }))
  expect(onUse).toHaveBeenCalledWith('2030-01-15', '09:17')
})

function mount(overrides = {}) {
  const onUse = vi.fn(), onClose = vi.fn()
  render(<DoctorSchedulePanel doctor={doctor} date="2030-01-15" time="" durationMinutes={23} onUse={onUse} onClose={onClose} {...overrides} />)
  return { user: userEvent.setup(), onUse, onClose }
}

it('shows working hours and leave, clears old choices on changing dates, and applies a selected available time', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => ({ data: path.startsWith('/operations/schedules/') ? { record: schedule } : { configured: true, slots: ['09:17', '09:18'] } }))
  const post = vi.spyOn(api, 'post')
  const { user, onUse } = mount({ excludeId: 'booking-test' })
  await screen.findByLabelText('Available time')
  expect(screen.getByText(/Read-only/)).toBeTruthy()
  expect(screen.getByText(/Working hours/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use this date and time' }).disabled).toBe(true)
  await user.selectOptions(screen.getByLabelText('Available time'), '09:17')
  await user.click(screen.getByRole('button', { name: `${formatClinicDate('2030-01-16')}, on leave` }))
  await screen.findByText('Doctor is on leave or unavailable on this date.')
  expect(screen.queryByText('Private reason')).toBeNull()
  expect(screen.getByRole('button', { name: 'Use this date and time' }).disabled).toBe(true)
  expect(get.mock.calls.some(([path]) => path.includes('slots/') && path.includes('date=2030-01-16'))).toBe(false)
  await user.click(screen.getByRole('button', { name: `${formatClinicDate('2030-01-17')}, working day` }))
  await user.selectOptions(await screen.findByLabelText('Available time'), '09:18')
  expect(get.mock.calls.some(([path]) => path.includes('date=2030-01-17') && path.includes('durationMinutes=23') && path.includes('excludeId=booking-test'))).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Use this date and time' }))
  expect(onUse).toHaveBeenCalledWith('2030-01-17', '09:18')
  expect(post).not.toHaveBeenCalled()
})

it('browses months and allows closing without applying booking changes', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { record: null } })
  const { user, onClose, onUse } = mount()
  await screen.findByText(/Working hours have not been configured/)
  await user.click(screen.getByRole('button', { name: 'Next month' }))
  expect(screen.getByRole('heading', { name: 'February 2030' })).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Previous month' }))
  expect(screen.getByRole('heading', { name: 'January 2030' })).toBeTruthy()
  await user.click(screen.getAllByRole('button', { name: 'Close', exact: true }).at(-1))
  expect(onClose).toHaveBeenCalled()
  expect(onUse).not.toHaveBeenCalled()
})

it('keeps failed availability unavailable and retries without selecting a stale time', async () => {
  let attempts = 0
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path.startsWith('/operations/schedules/')) return { data: { record: schedule } }
    if (++attempts === 1) throw new Error('offline')
    return { data: { configured: true, slots: ['09:17'] } }
  })
  const { user } = mount()
  await screen.findByText(/Unable to check availability/)
  expect(screen.getByRole('button', { name: 'Use this date and time' }).disabled).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Check again' }))
  await screen.findByLabelText('Available time')
  expect(screen.getByRole('button', { name: 'Use this date and time' }).disabled).toBe(true)
})

it('clears a selection when duration changes and requests fresh availability', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => ({ data: path.startsWith('/operations/schedules/') ? { record: schedule } : { configured: true, slots: ['09:17'] } }))
  const onUse = vi.fn()
  const { rerender } = render(<DoctorSchedulePanel doctor={doctor} date="2030-01-15" time="" durationMinutes={23} onUse={onUse} onClose={vi.fn()} />)
  const user = userEvent.setup()
  await user.selectOptions(await screen.findByLabelText('Available time'), '09:17')
  rerender(<DoctorSchedulePanel doctor={doctor} date="2030-01-15" time="" durationMinutes={45} onUse={onUse} onClose={vi.fn()} />)
  await waitFor(() => expect(get.mock.calls.some(([path]) => path.includes('durationMinutes=45'))).toBe(true))
  await screen.findByLabelText('Available time')
  expect(screen.getByRole('button', { name: 'Use this date and time' }).disabled).toBe(true)
})
