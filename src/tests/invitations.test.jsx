import { describe, it, afterEach, vi, expect } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../lib/api.js'
import EmployeeInvitations, { InvitationResult } from '../features/workflow/components/EmployeeInvitations.jsx'

afterEach(() => vi.restoreAllMocks())
const invitation = { id: 'invite-1', email: 'employee@example.com', role: 'staff', permissions: [], expiresAt: '2026-10-16T12:00:00Z', version: 0, status: 'expired' }
describe('employee invitations', () => {
  it('requires confirmation before replacing and gives the new code to the administrator', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { records: [invitation] } })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { code: 'new-code' } })
    const onCode = vi.fn(), user = userEvent.setup()
    render(<EmployeeInvitations revision={0} onCode={onCode} />)
    await user.click(await screen.findByRole('button', { name: 'Replace invitation' }))
    expect(post).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog', { name: 'Replace invitation?' })
    await user.click(within(dialog).getByRole('button', { name: 'Replace invitation' }))
    await waitFor(() => expect(onCode).toHaveBeenCalledWith({ code: 'new-code', email: invitation.email, role: 'staff', id: invitation.id }))
    expect(post).toHaveBeenCalledWith('/operations/invitations/invite-1/replace', { version: 0 })
  })
  it('cancels revocation without changing the invitation, then revokes on confirmation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { records: [invitation] } })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })
    const user = userEvent.setup()
    render(<EmployeeInvitations revision={0} onCode={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(post).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke invitation' }))
    await screen.findByText('Invitation revoked. Its code can no longer be used.')
    expect(post).toHaveBeenCalledWith('/operations/invitations/invite-1/revoke', { version: 0 })
  })
  it('explains manual sharing and the assigned role', () => {
    render(<InvitationResult invitation={{ code: 'test-code', email: 'doctor@example.com', role: 'doctor' }} />)
    expect(screen.getByText(/No email has been sent/)).toBeTruthy()
    expect(screen.getByText('Assigned role')).toBeTruthy()
    expect(screen.getByText('Doctor', { exact: true })).toBeTruthy()
    expect(screen.getByText('test-code')).toBeTruthy()
  })
})
