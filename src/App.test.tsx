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

  it('switches to the Moments screen from bottom navigation', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Moments' })[0])
    expect(screen.getByRole('heading', { name: /Moments/ })).toBeInTheDocument()
    expect(screen.getByText(/disappear after 24 hours/)).toBeInTheDocument()
  })
})
