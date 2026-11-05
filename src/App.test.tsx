import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from './App'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Chater application shell', () => {
  it('shows the branded splash screen on launch', () => {
    vi.useFakeTimers()
    render(<App />)
    expect(screen.getByLabelText('Chater from GOZIE')).toBeInTheDocument()
    expect(screen.getByText('GOZIE')).toBeInTheDocument()
  })

  it('shows the five primary navigation destinations after the splash', () => {
    vi.useFakeTimers()
    render(<App />)
    vi.advanceTimersByTime(1500)
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    for (const label of ['Chats', 'Moments', 'Communities', 'Calls', 'You']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })
})