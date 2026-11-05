import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function openApp() {
  vi.useFakeTimers()
  render(<App />)
  act(() => { vi.advanceTimersByTime(1500) })
}

describe('Chater application shell', () => {
  it('shows the branded splash screen on launch', () => {
    vi.useFakeTimers()
    render(<App />)
    expect(screen.getByLabelText('Chater from GOZIE')).toBeInTheDocument()
    expect(screen.getByText('GOZIE')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Chater logo' })).toHaveAttribute('src', expect.stringContaining('icons/chater.svg'))
  })

  it('uses the original Chater logo in both responsive app headers', () => {
    openApp()
    const logos = screen.getAllByRole('img', { name: 'Chater logo' })
    expect(logos).toHaveLength(2)
    for (const logo of logos) {
      expect(logo).toHaveAttribute('src', expect.stringContaining('icons/chater.svg'))
    }
  })

  it('shows all five primary navigation destinations after the splash', () => {
    openApp()
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(2)
    for (const label of ['Chats', 'Moments', 'Groups', 'Calls', 'You']) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('opens and closes the username discovery dialog without pretending search is live', () => {
    openApp()
    fireEvent.click(screen.getByRole('button', { name: 'Find people by username' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('@username'), { target: { value: 'henry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search username' }))
    expect(screen.getByRole('status')).toHaveTextContent('Username discovery will be connected')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('offers ten selectable accent colour presets in settings', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    expect(screen.getByRole('group', { name: 'Choose an accent colour' })).toBeInTheDocument()
    const cyan = screen.getByRole('button', { name: 'Cyan' })
    const violet = screen.getByRole('button', { name: 'Violet' })
    expect(cyan).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(violet)
    expect(violet).toHaveAttribute('aria-pressed', 'true')
    expect(cyan).toHaveAttribute('aria-pressed', 'false')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#a78bfa')
  })

  it('switches to the Moments screen from bottom navigation', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Moments' })[0])
    expect(screen.getByRole('heading', { name: /Moments/ })).toBeInTheDocument()
    expect(screen.getByText(/disappear after 24 hours/)).toBeInTheDocument()
  })
})
