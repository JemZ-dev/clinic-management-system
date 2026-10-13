import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionButton } from '../features/workflow/components/WorkflowUI.jsx'

describe('workflow confirmation dialogs', () => {
  it('only performs the action after confirming, and preserves it when cancelled', async () => {
    const action = vi.fn()
    const user = userEvent.setup()
    render(<ActionButton confirm="Finalize this consultation?" onAction={action}>Finalize consultation</ActionButton>)
    await user.click(screen.getByRole('button', { name: 'Finalize consultation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirm action' })
    expect(action).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(action).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Finalize consultation' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Finalize consultation' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
  })

  it('dismisses with Escape without performing an action', async () => {
    const action = vi.fn()
    const user = userEvent.setup()
    render(<ActionButton confirm="Continue?" onAction={action}>Continue action</ActionButton>)
    await user.click(screen.getByRole('button', { name: 'Continue action' }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(action).not.toHaveBeenCalled()
  })
})
