import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.localStorage.clear()
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

  it('applies a valid custom HEX accent and rejects incomplete values', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    const hexInput = screen.getByLabelText('Custom HEX colour')
    const apply = screen.getByRole('button', { name: 'Apply' })
    fireEvent.change(hexInput, { target: { value: '#12ab' } })
    expect(apply).toBeDisabled()
    fireEvent.change(hexInput, { target: { value: '12ABEF' } })
    expect(apply).toBeEnabled()
    fireEvent.click(apply)
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#12abef')
    expect(screen.getByRole('status')).toHaveTextContent('Custom accent colour applied')
  })

  it('remembers the selected accent colour after the app is reopened', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Gold' }))
    expect(window.localStorage.getItem('chater:preferences:accent')).toBe('#eab308')

    cleanup()
    openApp()
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#eab308')
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    expect(screen.getByRole('button', { name: 'Gold' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ignores an invalid saved accent and safely uses the default cyan', () => {
    window.localStorage.setItem('chater:preferences:accent', 'not-a-colour')
    openApp()
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00fdff')
    expect(window.localStorage.getItem('chater:preferences:accent')).toBe('#00fdff')
  })

  it('offers dark, light and system appearance choices and persists them', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    const theme = screen.getByLabelText('Theme')
    expect(theme).toHaveValue('dark')
    fireEvent.change(theme, { target: { value: 'light' } })
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('chater:preferences:theme')).toBe('light')
    fireEvent.change(theme, { target: { value: 'dark' } })
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    fireEvent.change(theme, { target: { value: 'system' } })
    expect(document.documentElement).toHaveAttribute('data-theme-preference', 'system')
    expect(['light', 'dark']).toContain(document.documentElement.getAttribute('data-theme'))
    expect(window.localStorage.getItem('chater:preferences:theme')).toBe('system')
  })

  it('restores the saved light appearance on the next launch', () => {
    window.localStorage.setItem('chater:preferences:theme', 'light')
    openApp()
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('uses dark appearance when the saved theme preference is invalid', () => {
    window.localStorage.setItem('chater:preferences:theme', 'sepia')
    openApp()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('chater:preferences:theme')).toBe('dark')
  })

  it('offers chat wallpaper presets and updates the preview', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    const group = screen.getByRole('group', { name: 'Choose a chat wallpaper' })
    expect(group).toBeInTheDocument()
    const ocean = screen.getByRole('button', { name: 'Ocean' })
    fireEvent.click(ocean)
    expect(ocean).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement).toHaveAttribute('data-wallpaper', 'ocean')
    expect(screen.getByLabelText('Chat wallpaper preview')).toHaveAttribute('data-wallpaper', 'ocean')
    expect(window.localStorage.getItem('chater:preferences:wallpaper')).toBe('ocean')
  })

  it('restores the saved chat wallpaper preference on launch', () => {
    window.localStorage.setItem('chater:preferences:wallpaper', 'aurora')
    openApp()
    expect(document.documentElement).toHaveAttribute('data-wallpaper', 'aurora')
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    expect(screen.getByRole('button', { name: 'Aurora' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to the default wallpaper for an invalid saved value', () => {
    window.localStorage.setItem('chater:preferences:wallpaper', 'unknown')
    openApp()
    expect(document.documentElement).toHaveAttribute('data-wallpaper', 'default')
    expect(window.localStorage.getItem('chater:preferences:wallpaper')).toBe('default')
  })

  it('offers message bubble styles and updates the preview', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    const group = screen.getByRole('group', { name: 'Choose a message bubble style' })
    expect(group).toBeInTheDocument()
    const soft = screen.getByRole('button', { name: 'Soft' })
    fireEvent.click(soft)
    expect(soft).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement).toHaveAttribute('data-bubble-style', 'soft')
    expect(screen.getByLabelText('Message bubble preview')).toHaveAttribute('data-bubble-style', 'soft')
    expect(window.localStorage.getItem('chater:preferences:bubble-style')).toBe('soft')
  })

  it('restores the saved message bubble style on launch', () => {
    window.localStorage.setItem('chater:preferences:bubble-style', 'square')
    openApp()
    expect(document.documentElement).toHaveAttribute('data-bubble-style', 'square')
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    expect(screen.getByRole('button', { name: 'Square' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to rounded message bubbles for an invalid saved value', () => {
    window.localStorage.setItem('chater:preferences:bubble-style', 'unknown')
    openApp()
    expect(document.documentElement).toHaveAttribute('data-bubble-style', 'rounded')
    expect(window.localStorage.getItem('chater:preferences:bubble-style')).toBe('rounded')
  })

  it('switches to the Moments screen from bottom navigation', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Moments' })[0])
    expect(screen.getByRole('heading', { name: /Moments/ })).toBeInTheDocument()
    expect(screen.getByText(/disappear after 24 hours/)).toBeInTheDocument()
  })
})
