import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router'
import { AuthContext } from '../context/auth.js'
import ProfilePage from '../features/profile/pages/ProfilePage.jsx'
import { api } from '../lib/api.js'

const original = { name: 'Fictional Staff', phone: '', email: 'staff@example.com', role: 'staff', createdAt: '2026-01-01T00:00:00Z' }
function Harness() {
  const [user, setUser] = useState(original)
  return <AuthContext value={{ user, setUser }}><Link to="/other">Other page</Link><Outlet /></AuthContext>
}
function mount() {
  const router = createMemoryRouter([{ element: <Harness />, children: [{ path: '/profile', element: <ProfilePage /> }, { path: '/other', element: <h1>Other page</h1> }] }], { initialEntries: ['/profile'] })
  render(<RouterProvider router={router} />)
  return { user: userEvent.setup(), router }
}
afterEach(() => vi.restoreAllMocks())

describe('staff profile', () => {
  it('saves personal and work details and updates the account summary', async () => {
    const patch = vi.spyOn(api, 'patch').mockImplementation(async (_path, values) => ({ data: { user: { ...original, ...values, updatedAt: '2026-10-13T00:00:00Z' } } }))
    const { user } = mount()
    await user.selectOptions(screen.getByLabelText(/^Gender/), 'prefer_not_to_say')
    await user.type(screen.getByLabelText(/^Date of birth/), '2000-02-29')
    await user.type(screen.getByLabelText(/^Job title/), 'Receptionist')
    await user.type(screen.getByLabelText(/^Department/), 'Front desk')
    await user.type(screen.getByLabelText(/^Work location/), 'Main clinic')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Your profile has been updated.')
    expect(patch.mock.calls[0][0]).toBe('/auth/profile')
    expect(patch.mock.calls[0][1]).toEqual({ name: original.name, phone: '', gender: 'prefer_not_to_say', dateOfBirth: '2000-02-29', jobTitle: 'Receptionist', department: 'Front desk', workLocation: 'Main clinic' })
    expect(screen.getByText('Receptionist · Front desk')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true)
  })

  it('supports older accounts and resets edits to their saved values', async () => {
    const { user } = mount()
    expect(screen.getByLabelText(/^Gender/).value).toBe('')
    expect(screen.getByLabelText(/^Date of birth/).value).toBe('')
    await user.type(screen.getByLabelText(/^Department/), 'Unsaved department')
    await user.click(screen.getByRole('button', { name: 'Reset changes' }))
    expect(screen.getByLabelText(/^Department/).value).toBe('')
    expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true)
  })

  it('preserves rejected edits and connects API validation feedback to the field', async () => {
    vi.spyOn(api, 'patch').mockRejectedValue({ response: { data: { message: 'Please check your profile.', fields: { department: 'Check the department name.' } } } })
    const { user } = mount()
    await user.type(screen.getByLabelText(/^Department/), 'Draft department')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Check the department name.')
    expect(screen.getByLabelText(/^Department/).value).toBe('Draft department')
    expect(screen.getByLabelText(/^Department/).getAttribute('aria-describedby')).toBe('record-department-error')
  })

  it('protects unsaved profile details when navigating away', async () => {
    const { user, router } = mount()
    await user.type(screen.getByLabelText(/^Job title/), 'Draft title')
    await user.click(screen.getByRole('link', { name: 'Other page' }))
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/profile')
    expect(screen.getByLabelText(/^Job title/).value).toBe('Draft title')
  })
})
