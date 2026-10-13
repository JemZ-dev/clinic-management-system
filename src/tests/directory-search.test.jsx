import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import DirectorySearch from '../components/ui/DirectorySearch.jsx'

const props = { id: 'test-search', label: 'Search patient records' }
const advance = (ms) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('automatic directory search', () => {
  it('waits for a typing pause, batches changes, and uses the latest filter callback', () => {
    const first = vi.fn(), latest = vi.fn()
    const view = render(<DirectorySearch {...props} onSearch={first} />)
    expect(screen.queryByRole('button', { name: 'Search', exact: true })).toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Fi' } })
    advance(299)
    expect(first).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' Fictional ' } })
    advance(150)
    view.rerender(<DirectorySearch {...props} onSearch={latest} />)
    advance(150)
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledExactlyOnceWith('Fictional')
  })

  it('searches immediately with Enter and cancels the delayed duplicate', () => {
    const onSearch = vi.fn()
    render(<DirectorySearch {...props} onSearch={onSearch} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Fictional' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('Fictional')
    advance(600)
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('keeps input focus when its query reaches the URL and syncs external navigation without another search', () => {
    const onSearch = vi.fn()
    const view = render(<DirectorySearch {...props} onSearch={onSearch} />)
    const input = screen.getByRole('searchbox')
    input.focus()
    fireEvent.change(input, { target: { value: 'Fictional' } })
    advance(300)
    view.rerender(<DirectorySearch {...props} onSearch={onSearch} initialValue="Fictional" />)
    expect(document.activeElement).toBe(input)
    expect(screen.getByRole('searchbox')).toBe(input)
    view.rerender(<DirectorySearch {...props} onSearch={onSearch} initialValue="Previous query" />)
    expect(input.value).toBe('Previous query')
    advance(600)
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('does not submit unfinished composition and cancels pending work on unmount', () => {
    const onSearch = vi.fn()
    const view = render(<DirectorySearch {...props} onSearch={onSearch} />)
    const input = screen.getByRole('searchbox')
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '名前' } })
    fireEvent.submit(screen.getByRole('search'))
    advance(600)
    expect(onSearch).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)
    advance(300)
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('名前')
    fireEvent.change(input, { target: { value: 'Another query' } })
    view.unmount()
    advance(600)
    expect(onSearch).toHaveBeenCalledTimes(1)
  })
})
