import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createUserWithEmailAndPassword, deleteUser, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, reload, updateProfile } from 'firebase/auth'
import { runTransaction } from 'firebase/firestore'
import App from './App'

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((...parts: unknown[]) => ({ parts })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  deleteDoc: vi.fn(async () => undefined),
  runTransaction: vi.fn(async (_db: unknown, callback: (transaction: { get: (ref: unknown) => Promise<{ exists: () => boolean }>; set: (...args: unknown[]) => void }) => Promise<void>) => callback({
    get: vi.fn(async () => ({ exists: () => false })),
    set: vi.fn()
  }))
}))

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>()
  return {
    ...actual,
    getAuth: vi.fn(() => ({})),
    onAuthStateChanged: vi.fn((_auth: unknown, callback: (user: null) => void) => { callback(null); return vi.fn() }),
    createUserWithEmailAndPassword: vi.fn(),
    deleteUser: vi.fn(async () => undefined),
    signInWithEmailAndPassword: vi.fn(),
    reload: vi.fn(),
    signOut: vi.fn(),
    sendEmailVerification: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    updateProfile: vi.fn()
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

function openApp() {
  vi.useFakeTimers()
  render(<App />)
  act(() => { vi.advanceTimersByTime(1500) })
  vi.useRealTimers()
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

  it('loads and saves accent colours separately for each signed-in account', async () => {
    const user = { uid: 'account-one', email: 'one@example.com', emailVerified: true, photoURL: null, displayName: 'Account One' }
    window.localStorage.setItem('chater:preferences:accent:account-one', '#f59e0b')
    window.localStorage.setItem('chater:preferences:accent:account-two', '#a78bfa')
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'one@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Account One' })).toBeInTheDocument())
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#f59e0b')
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Gold' }))
    expect(window.localStorage.getItem('chater:preferences:accent:account-one')).toBe('#eab308')
    expect(window.localStorage.getItem('chater:preferences:accent:account-two')).toBe('#a78bfa')
    expect(window.localStorage.getItem('chater:preferences:accent')).toBe('#00fdff')
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

  it('provides a keyboard skip link and marks the active navigation destination', () => {
    openApp()
    const skipLink = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skipLink).toHaveAttribute('href', '#main-content')
    expect(document.getElementById('main-content')).toHaveAttribute('tabindex', '-1')
    const chats = screen.getAllByRole('button', { name: 'Chats' })
    expect(chats[0]).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getAllByRole('button', { name: 'Groups' })[0])
    expect(screen.getAllByRole('button', { name: 'Groups' })[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('button', { name: 'Chats' })[0]).not.toHaveAttribute('aria-current')
  })

  it('validates registration details and creates a Firebase account for valid details', async () => {
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
      user: { uid: 'test-user', email: 'henry@example.com', displayName: 'Henry Example', photoURL: null, emailVerified: false }
    } as never)
    vi.mocked(updateProfile).mockResolvedValue(undefined)
    vi.mocked(signOut).mockResolvedValue(undefined)
    vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Henry Example' } })
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'henry@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('yourusername'), { target: { value: 'he' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('status')).toHaveTextContent('Username must be 3–20 characters')
    fireEvent.change(screen.getByPlaceholderText('yourusername'), { target: { value: 'henry_cee' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Your account has been created'))
    expect(screen.getByRole('status')).toHaveTextContent('Spam or Junk folder')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(signOut).toHaveBeenCalled()
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'henry@example.com', 'password123')
    expect(updateProfile).toHaveBeenCalled()
    expect(sendEmailVerification).toHaveBeenCalled()
  })

  it('blocks unverified sign-in, resends verification, and keeps the user signed out', async () => {
    const user = { uid: 'pending-user', email: 'pending@example.com', emailVerified: false, photoURL: null, displayName: 'Pending User' }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
    vi.mocked(signOut).mockResolvedValue(undefined)
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'pending@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Your email is not verified yet'))
    expect(screen.getByRole('status')).toHaveTextContent('Spam or Junk folder')
    expect(sendEmailVerification).toHaveBeenCalledWith(user)
    expect(signOut).toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lets an unverified user explicitly request another verification email', async () => {
    const user = { uid: 'pending-user', email: 'pending@example.com', emailVerified: false, photoURL: null, displayName: 'Pending User' }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(sendEmailVerification).mockResolvedValue(undefined)
    vi.mocked(signOut).mockResolvedValue(undefined)
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'pending@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('A new verification email has been sent'))
    expect(sendEmailVerification).toHaveBeenCalledTimes(2)
    expect(signOut).toHaveBeenCalledTimes(2)
  })

  it('sends a password reset email and gives inbox and spam-folder guidance', async () => {
    vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined)
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'henry@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('If an account exists for this email address'))
    expect(screen.getByRole('status')).toHaveTextContent('Spam or Junk folder')
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'henry@example.com')
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeInTheDocument()
  })

  it('shows a useful message when password reset is rate limited', async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValue({ code: 'auth/too-many-requests' })
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'henry@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Too many attempts'))
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1)
  })

  it('uploads a profile picture to Cloudinary and saves its URL to Firebase Auth', async () => {
    const user = { uid: 'test-user', email: 'henry@example.com', emailVerified: true, photoURL: null, displayName: 'Henry Example' }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(updateProfile).mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ secure_url: 'https://res.cloudinary.com/amzak6nf/image/upload/v1/chater/profiles/test-user/avatar.png' })
    }))
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'henry@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Henry Example' })).toBeInTheDocument())

    const file = new File(['image bytes'], 'avatar.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    await waitFor(() => expect(document.querySelector('.profile-avatar img')).toHaveAttribute('src', 'https://res.cloudinary.com/amzak6nf/image/upload/v1/chater/profiles/test-user/avatar.png'))
    expect(screen.queryByText('Your profile picture has been updated.')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.cloudinary.com/v1_1/amzak6nf/image/upload',
      expect.objectContaining({ method: 'POST' })
    )
    expect(updateProfile).toHaveBeenCalledWith(user, {
      photoURL: 'https://res.cloudinary.com/amzak6nf/image/upload/v1/chater/profiles/test-user/avatar.png'
    })
  })

  it('shows a clear Cloudinary upload error and resets the uploading state', async () => {
    const user = { uid: 'test-user', email: 'henry@example.com', emailVerified: true, photoURL: null, displayName: 'Henry Example' }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Upload preset is not allowed' } })
    }))
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'henry@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Henry Example' })).toBeInTheDocument())

    const file = new File(['image bytes'], 'avatar.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Upload preset is not allowed'))
    expect(screen.getByLabelText('Add or change profile picture')).toBeEnabled()
  })

  it('does not show an email verified label and asks for confirmation before signing out', async () => {
    const user = { uid: 'test-user', email: 'henry@example.com', emailVerified: true, photoURL: null, displayName: 'Henry Example' }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(signOut).mockResolvedValue(undefined)
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'henry@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Henry Example' })).toBeInTheDocument())
    expect(screen.queryByText('Email verified')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, sign out' }))
    await waitFor(() => expect(signOut).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your name' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Henry Example')).not.toBeInTheDocument()
  })

  it('switches to the Moments screen from bottom navigation', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Moments' })[0])
    expect(screen.getByRole('heading', { name: /Moments/ })).toBeInTheDocument()
    expect(screen.getByText(/disappear after 24 hours/)).toBeInTheDocument()
  })
})
