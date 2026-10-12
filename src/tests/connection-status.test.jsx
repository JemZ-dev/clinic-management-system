import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import ConnectionStatus from '../components/ui/ConnectionStatus.jsx'

const healthy = () => ({ ok: true, json: async () => ({ database: 'connected' }) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('header connection indicator', () => {
  it('shows checking until the database confirms the connection', async () => {
    let complete
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { complete = resolve })))
    render(<ConnectionStatus />)
    expect(screen.getByRole('status').textContent).toContain('Checking…')
    await act(async () => complete(healthy()))
    expect(screen.getByRole('status').textContent).toContain('Connected')
    expect(screen.getByRole('status').classList.contains('connected')).toBe(true)
  })

  it('detects a lost connection on the next check and recovers when the window regains focus', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(healthy()).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(healthy()))
    await act(async () => render(<ConnectionStatus />))
    expect(screen.getByRole('status').classList.contains('connected')).toBe(true)
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByRole('status').textContent).toContain('Disconnected')
    expect(screen.getByRole('status').classList.contains('unavailable')).toBe(true)
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(screen.getByRole('status').classList.contains('connected')).toBe(true)
  })

  it('does not turn green for a failing database or a response with no database confirmation', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ database: 'disconnected' }) }).mockResolvedValue({ ok: true, json: async () => ({}) }))
    await act(async () => render(<ConnectionStatus />))
    expect(screen.getByRole('status').textContent).toContain('Disconnected')
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByRole('status').classList.contains('unavailable')).toBe(true)
  })

  it('discards an in-flight success after going offline and checks again on reconnect', async () => {
    let complete
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise((resolve) => { complete = resolve })).mockResolvedValue(healthy()))
    render(<ConnectionStatus />)
    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('status').textContent).toContain('Disconnected')
    await act(async () => complete(healthy()))
    expect(screen.getByRole('status').classList.contains('unavailable')).toBe(true)
    await act(async () => window.dispatchEvent(new Event('online')))
    expect(screen.getByRole('status').classList.contains('connected')).toBe(true)
  })
})
