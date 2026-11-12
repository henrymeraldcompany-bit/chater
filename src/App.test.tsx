import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, reauthenticateWithCredential, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, reload, updateProfile } from 'firebase/auth'
import { getDoc, getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore'
import App, { extractChaterUsernameFromQR, matchChaterContactsByName, normalizeContactDisplayName } from './App'
import ConversationScreen from './components/ConversationScreen'
import { createConversationId, isValidChatMessage, normalizeChatMessage } from './lib/chat'

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  orderBy: vi.fn((...parts: unknown[]) => ({ parts })),
  onSnapshot: vi.fn((_reference: unknown, next: (snapshot: { docs: unknown[] }) => void) => { next({ docs: [] }); return vi.fn() }),
  limit: vi.fn((...parts: unknown[]) => ({ parts })),
  where: vi.fn((...parts: unknown[]) => ({ parts })),
  collection: vi.fn((...parts: unknown[]) => ({ parts })),
  addDoc: vi.fn(async () => ({ id: 'test-moment' })),
  doc: vi.fn((...parts: unknown[]) => ({ parts })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  deleteDoc: vi.fn(async () => undefined),
  setDoc: vi.fn(async () => undefined),
  runTransaction: vi.fn(async (_db: unknown, callback: (transaction: { get: (ref: unknown) => Promise<{ exists: () => boolean; data: () => Record<string, unknown> | undefined }>; set: (...args: unknown[]) => void; update: (...args: unknown[]) => void; delete: (ref: unknown) => void }) => Promise<void>) => callback({
    get: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
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
    reauthenticateWithCredential: vi.fn(async () => undefined),
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

describe('Chater QR profile codes', () => {
  it('extracts usernames from Chater QR links and handles while rejecting unrelated links', () => {
    expect(extractChaterUsernameFromQR('chater://user/mee_maw')).toBe('mee_maw')
    expect(extractChaterUsernameFromQR('https://henrymeraldcompany-bit.github.io/chater/?chater_user=mee_maw')).toBe('mee_maw')
    expect(extractChaterUsernameFromQR('https://chater.example/u/@mee_maw')).toBe('mee_maw')
    expect(extractChaterUsernameFromQR('@Mee_Maw')).toBe('mee_maw')
    expect(extractChaterUsernameFromQR('https://example.com/not-a-chater-profile')).toBe('')
    expect(extractChaterUsernameFromQR('ab')).toBe('')
  })
})

describe('Chater contact discovery', () => {
  it('normalizes selected contact names consistently', () => {
    expect(normalizeContactDisplayName('  Ada   Lovelace  ')).toBe('ada lovelace')
    expect(normalizeContactDisplayName('Élodie  Example')).toBe('élodie example')
  })

  it('returns exact display-name candidates, deduplicates selected names and excludes the signed-in account', () => {
    const profiles = [
      { uid: 'self', username: 'henry_cee', displayName: 'Henry Cee', photoURL: '' },
      { uid: 'ada-1', username: 'ada_lovelace', displayName: 'Ada Lovelace', photoURL: '' },
      { uid: 'ada-2', username: 'ada_example', displayName: 'ADA LOVELACE', photoURL: '' },
      { uid: 'grace', username: 'grace_hopper', displayName: 'Grace Hopper', photoURL: '' }
    ]
    const matches = matchChaterContactsByName(
      [' Ada Lovelace ', 'ada   lovelace', 'Grace Hopper', 'Ada'],
      profiles,
      'self'
    )
    expect(matches).toHaveLength(3)
    expect(matches[0].contactName).toBe('Ada Lovelace')
    expect(matches[0].matches.map(profile => profile.uid)).toEqual(['ada-1', 'ada-2'])
    expect(matches[1].matches.map(profile => profile.uid)).toEqual(['grace'])
    expect(matches[2].matches).toEqual([])
  })
})

describe('Chater direct-message rules', () => {
  it('creates the same private conversation ID for either participant order', () => {
    expect(createConversationId('alice_uid', 'bob_uid')).toBe(createConversationId('bob_uid', 'alice_uid'))
    expect(createConversationId('alice_uid', 'bob_uid')).not.toBe(createConversationId('alice_uid', 'charlie_uid'))
    expect(() => createConversationId('alice_uid', 'alice_uid')).toThrow('two different Chater accounts')
  })

  it('normalizes and validates direct messages before sending', () => {
    expect(normalizeChatMessage('  Hello\r\nthere  ')).toBe('Hello\nthere')
    expect(isValidChatMessage('  hello  ')).toBe(true)
    expect(isValidChatMessage('   ')).toBe(false)
    expect(isValidChatMessage('x'.repeat(4001))).toBe(false)
  })

  it('lets the recipient block a sender from the conversation screen', async () => {
    const onBlock = vi.fn(async () => undefined)
    const target = { uid: 'other-user', username: 'other_user', displayName: 'Other User', photoURL: '' }
    render(<ConversationScreen
      currentUserId="signed-in-user"
      target={target}
      isBlocked={false}
      onClose={vi.fn()}
      onBlock={onBlock}
      onUnblock={vi.fn(async () => undefined)}
    />)
    expect(await screen.findByText('No messages yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Block' }))
    fireEvent.click(screen.getByRole('button', { name: 'Block account' }))
    await waitFor(() => expect(onBlock).toHaveBeenCalledWith('other-user'))
  })

  it('shows the WhatsApp-style chat menu with its More submenu and contact search', async () => {
    const target = { uid: 'other-user', username: 'other_user', displayName: 'Other User', photoURL: '' }
    render(<ConversationScreen
      currentUserId="signed-in-user"
      target={target}
      isBlocked={false}
      onClose={vi.fn()}
      onBlock={vi.fn(async () => undefined)}
      onUnblock={vi.fn(async () => undefined)}
    />)

    await screen.findByText('No messages yet')
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    expect(screen.getByRole('menuitem', { name: 'View contact' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Report' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Mute notifications' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Chat theme' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Search' }))
    expect(screen.getByRole('textbox', { name: 'Search messages' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close message search' }))

    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'More' }))
    expect(screen.getByRole('menuitem', { name: 'Media, links, and docs' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Clear chat' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Export chat' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Add shortcut' })).toBeInTheDocument()
  })

  it('opens the contact card and lets members choose a chat theme', async () => {
    const target = { uid: 'other-user', username: 'other_user', displayName: 'Other User', photoURL: '' }
    render(<ConversationScreen
      currentUserId="signed-in-user"
      target={target}
      isBlocked={false}
      onClose={vi.fn()}
      onBlock={vi.fn(async () => undefined)}
      onUnblock={vi.fn(async () => undefined)}
    />)

    await screen.findByText('No messages yet')
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'View contact' }))
    expect(screen.getByRole('region', { name: 'Contact information' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chat theme' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Forest' }))
    expect(document.querySelector('.live-conversation-screen')).toHaveAttribute('data-chat-theme', 'forest')
  })

  it('clears chat only from this device without deleting the shared conversation', async () => {
    const target = { uid: 'other-user', username: 'other_user', displayName: 'Other User', photoURL: '' }
    render(<ConversationScreen
      currentUserId="signed-in-user"
      target={target}
      isBlocked={false}
      onClose={vi.fn()}
      onBlock={vi.fn(async () => undefined)}
      onUnblock={vi.fn(async () => undefined)}
    />)

    await screen.findByText('No messages yet')
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear chat' }))
    expect(screen.getByText(/other participant keeps their copy/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear chat' }))
    expect(window.localStorage.getItem('chater:chat-cleared-at:' + createConversationId('signed-in-user', 'other-user'))).toMatch(/^\d+$/)
    expect(screen.getByRole('status')).toHaveTextContent('Chat cleared on this device')
  })
})

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

  it('uses selected contact names for possible matches and saves only after profile review', async () => {
    const user = { uid: 'signed-in-user', email: 'member@example.com', emailVerified: true, photoURL: null, displayName: 'Signed In Member' }
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => { if (typeof callback === 'function') callback(user as never); return vi.fn() })
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ username: 'signed_in', displayName: 'Signed In Member' }) } as never)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({
        uid: 'ada-user', username: 'ada_lovelace', displayName: 'Ada Lovelace', photoURL: ''
      }) } as never)

    const contactPickerSelect = vi.fn().mockResolvedValue([{ name: ['Ada', 'Lovelace'] }])
    const secureContextDescriptor = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
    const contactsDescriptor = Object.getOwnPropertyDescriptor(navigator, 'contacts')
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(navigator, 'contacts', {
      configurable: true,
      value: { select: contactPickerSelect }
    })

    try {
      openApp()
      await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1))
      fireEvent.click(screen.getByRole('button', { name: 'Start a conversation' }))
      fireEvent.click(screen.getByRole('button', { name: 'Sync contacts' }))
      await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(2))
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [{
          id: 'ada-user',
          data: () => ({
            uid: 'ada-user',
            username: 'ada_lovelace',
            displayName: 'Ada Lovelace',
            displayNameLower: 'ada lovelace',
            photoURL: ''
          })
        }]
      } as never)

      expect(screen.getByText(/sent to Chater only as exact-match search terms/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' }))
      expect(contactPickerSelect).toHaveBeenCalledWith(['name'], { multiple: true })
      const possibleMatch = await screen.findByRole('button', { name: 'Review possible match Ada Lovelace' })
      expect(setDoc).not.toHaveBeenCalled()

      fireEvent.click(possibleMatch)
      expect(await screen.findByRole('dialog', { name: 'Ada Lovelace profile' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Add to contacts' }))
      await waitFor(() => expect(screen.getByText('Contact saved to your Chater account.')).toBeInTheDocument())
      expect(setDoc).toHaveBeenCalledWith(expect.anything(), {
        uid: 'ada-user',
        addedAt: 'SERVER_TIMESTAMP'
      })
    } finally {
      if (secureContextDescriptor) Object.defineProperty(window, 'isSecureContext', secureContextDescriptor)
      else Reflect.deleteProperty(window, 'isSecureContext')
      if (contactsDescriptor) Object.defineProperty(navigator, 'contacts', contactsDescriptor)
      else Reflect.deleteProperty(navigator, 'contacts')
    }
  })

  it('shows all five primary navigation destinations after the splash', () => {
    openApp()
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(2)
    for (const label of ['Chats', 'Moments', 'Groups', 'Calls', 'You']) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('opens the Start a conversation flow as a full-screen page from both entry points', () => {
    openApp()
    fireEvent.click(screen.getByRole('button', { name: 'Start a conversation' }))
    expect(screen.getByRole('dialog', { name: 'Start a conversation' })).toBeInTheDocument()
    expect(document.querySelector('.new-chat-screen.full-screen-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start a new chat', hidden: true }))
    expect(screen.getByRole('dialog', { name: 'Start a conversation' })).toBeInTheDocument()
    expect(document.querySelector('.new-chat-screen.full-screen-dialog')).toBeInTheDocument()
  })

  it('shows live partial matches by display name and username, including profile pictures', async () => {
    const user = { uid: 'signed-in-user', email: 'member@example.com', emailVerified: true, photoURL: null, displayName: 'Signed In Member' }
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => { if (typeof callback === 'function') callback(user as never); return vi.fn() })
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ username: 'signed_in', displayName: 'Signed In Member' }) } as never)
    openApp()
    await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1))
    const member = {
      id: 'target-user',
      data: () => ({
        uid: 'target-user',
        username: 'mee_maw',
        usernameLower: 'mee_maw',
        displayName: 'Mee Maw',
        displayNameLower: 'mee maw',
        photoURL: 'https://res.cloudinary.com/amzak6nf/image/upload/chater/profiles/target-user/avatar.jpg'
      })
    }
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [member] } as never)
      .mockResolvedValueOnce({ docs: [member] } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Find people by username' }))
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'e M' } })
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Mee Maw')).toBeInTheDocument())
    expect(screen.getByText('@mee_maw')).toBeInTheDocument()
    expect(document.querySelector('.username-search-result img')).toHaveAttribute('src', 'https://res.cloudinary.com/amzak6nf/image/upload/chater/profiles/target-user/avatar.jpg')
    const searchIcon = screen.getByRole('button', { name: 'Search people' })
    expect(searchIcon).toHaveClass('people-search-icon')
    expect(document.querySelector('.people-search-submit')).not.toBeInTheDocument()
    expect(document.querySelector('.people-search-input')).toBeInTheDocument()
    expect(document.querySelector('.people-search-toolbar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(document.querySelector('.username-search-result')).toBeInTheDocument()
    expect(document.querySelector('.username-search-avatar')).toHaveClass('username-search-avatar')
    fireEvent.click(searchIcon)
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(3))
    expect(document.querySelector('.people-search-screen')).toBeInTheDocument()
  })

  it('opens public profiles from people search and enters the selected conversation without exposing email', async () => {
    const user = { uid: 'signed-in-user', email: 'member@example.com', emailVerified: true, photoURL: null, displayName: 'Signed In Member' }
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => { if (typeof callback === 'function') callback(user as never); return vi.fn() })
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ username: 'signed_in', displayName: 'Signed In Member' }) } as never)
      .mockResolvedValue({ exists: () => true, data: () => ({
        uid: 'target-user', username: 'mee_maw', displayName: 'Mee Maw',
        photoURL: 'https://media.example/avatar.jpg', about: 'A Chater member',
        location: 'Onitsha', occupation: 'Designer', email: 'private@example.com'
      }) } as never)
    openApp()
    await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1))
    const member = { id: 'target-user', data: () => ({
      uid: 'target-user', username: 'mee_maw', displayName: 'Mee Maw',
      photoURL: 'https://media.example/avatar.jpg'
    }) }
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [member] } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Find people by username' }))
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'mee' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'View Mee Maw profile' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'View Mee Maw profile' }))
    const publicProfileDialog = await screen.findByRole('dialog', { name: 'Mee Maw profile' })
    expect(publicProfileDialog).toBeInTheDocument()
    expect(within(publicProfileDialog).getByText('@mee_maw')).toBeInTheDocument()
    expect(screen.getByText('A Chater member')).toBeInTheDocument()
    expect(screen.getByText('Onitsha')).toBeInTheDocument()
    expect(screen.getByText('Designer')).toBeInTheDocument()
    expect(screen.queryByText('private@example.com')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Message' }))
    expect(screen.getByRole('dialog', { name: 'Conversation with Mee Maw' })).toBeInTheDocument()
    const messageInput = screen.getByRole('textbox', { name: 'Message' })
    const sendButton = screen.getByRole('button', { name: 'Send message' })
    expect(messageInput).toBeEnabled()
    expect(sendButton).toBeDisabled()
    fireEvent.change(messageInput, { target: { value: 'Hello from Chater' } })
    expect(sendButton).toBeEnabled()
    fireEvent.click(sendButton)
    await waitFor(() => expect(runTransaction).toHaveBeenCalled())
    expect(messageInput).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Block' }))
    fireEvent.click(screen.getByRole('button', { name: 'Block account' }))
    await waitFor(() => expect(screen.getByText('You blocked this account. Unblock them to send messages again.')).toBeInTheDocument())
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ uid: 'target-user', createdAt: 'SERVER_TIMESTAMP' }))
  })

  it('opens a scanned Chater QR username as the matching public profile', async () => {
    const user = { uid: 'signed-in-user', email: 'member@example.com', emailVerified: true, photoURL: null, displayName: 'Signed In Member' }
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => { if (typeof callback === 'function') callback(user as never); return vi.fn() })
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ username: 'signed_in', displayName: 'Signed In Member' }) } as never)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'target-user' }) } as never)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({
        username: 'mee_maw', displayName: 'Mee Maw', photoURL: 'https://media.example/avatar.jpg',
        about: 'A public profile', location: 'Onitsha', occupation: 'Designer'
      }) } as never)
    openApp()
    await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Find people by username' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scan Chater QR code' }))
    expect(screen.getByRole('dialog', { name: 'Scan a Chater QR code' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Or enter a Chater username'), { target: { value: '@mee_maw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
    expect(await screen.findByRole('dialog', { name: 'Mee Maw profile' })).toBeInTheDocument()
    expect(screen.getByText('A public profile')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Scan a Chater QR code' })).not.toBeInTheDocument()
  })

  it('offers ten selectable accent colour presets in settings', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    expect(screen.getByRole('group', { name: 'Choose an accent colour' })).toBeInTheDocument()
    const cyan = screen.getByRole('button', { name: 'Cyan' })
    const violet = screen.getByRole('button', { name: 'Violet' })
    const gold = screen.getByRole('button', { name: 'Gold' })
    expect(cyan).toHaveAttribute('aria-pressed', 'true')
    expect(gold).toHaveAttribute('aria-pressed', 'false')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00fdff8b')
    fireEvent.click(violet)
    expect(violet).toHaveAttribute('aria-pressed', 'true')
    expect(gold).toHaveAttribute('aria-pressed', 'false')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#a78bfa')
    fireEvent.click(cyan)
    expect(cyan).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00fdff8b')
    fireEvent.click(gold)
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#eab308')
  })

  it('migrates the incorrectly saved Gold default back to original translucent cyan', () => {
    window.localStorage.setItem('chater:preferences:accent', '#eab308')
    openApp()
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00fdff8b')
    expect(window.localStorage.getItem('chater:preferences:accent')).toBe('#00fdff8b')
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
    fireEvent.change(hexInput, { target: { value: '#00fdff8b' } })
    expect(apply).toBeEnabled()
    fireEvent.click(apply)
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00fdff8b')
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

  it('keeps the selected accent colour when switching between dark and light themes', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Gold' }))
    const theme = screen.getByLabelText('General theme')
    fireEvent.change(theme, { target: { value: 'light' } })
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#eab308')
    fireEvent.change(theme, { target: { value: 'dark' } })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#eab308')
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
    const group = screen.getByRole('group', { name: 'Choose a general chat wallpaper' })
    expect(group).toBeInTheDocument()
    const ocean = screen.getByRole('button', { name: 'Ocean' })
    fireEvent.click(ocean)
    expect(ocean).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement).toHaveAttribute('data-wallpaper', 'ocean')
    expect(screen.getByLabelText('General chat theme preview')).toHaveAttribute('data-wallpaper', 'ocean')
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

  it('rejects a username already reserved by another Chater account', async () => {
    const user = { uid: 'duplicate-user', email: 'duplicate@example.com', emailVerified: false, photoURL: null, displayName: 'Duplicate User' }
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(runTransaction).mockRejectedValueOnce(Object.assign(new Error('That username is already taken. Choose another username.'), { code: 'chater/username-taken' }))
    vi.mocked(deleteUser).mockResolvedValue(undefined)
    vi.mocked(signOut).mockResolvedValue(undefined)
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Duplicate User' } })
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'duplicate@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('yourusername'), { target: { value: 'taken_name' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('That username is already taken'))
    expect(deleteUser).toHaveBeenCalledWith(user)
    expect(sendEmailVerification).not.toHaveBeenCalled()
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

  it('allows a signed-in user to edit and save the complete profile from the pencil control', async () => {
    const user = { uid: 'test-user', email: 'henry@example.com', emailVerified: true, photoURL: null, displayName: 'Henry Example' }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(updateProfile).mockResolvedValue(undefined)
    vi.mocked(setDoc).mockResolvedValue(undefined)
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'henry@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Henry Example' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Edit your profile' }))
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Henry Cee' } })
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'henry_cee' } })
    fireEvent.change(screen.getByLabelText('About you'), { target: { value: 'Building useful tools every day.' } })
    fireEvent.change(screen.getByLabelText('Occupation'), { target: { value: 'Software creator' } })
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Anambra, Nigeria' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Henry Cee' })).toBeInTheDocument())
    expect(updateProfile).toHaveBeenCalledWith(user, { displayName: 'Henry Cee' })
    expect(runTransaction).toHaveBeenCalled()
    expect(setDoc).toHaveBeenCalled()
    expect(screen.getByText('Building useful tools every day.')).toBeInTheDocument()
    expect(screen.getByText('Software creator')).toBeInTheDocument()
    expect(screen.getByText('Anambra, Nigeria')).toBeInTheDocument()
    expect(screen.queryByText(/These details are optional/)).not.toBeInTheDocument()
  })

  it('opens privacy and security directly from the You profile options', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: /Privacy and security/ }))
    expect(screen.getByRole('heading', { name: 'Privacy and security' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Appearance' })).not.toBeInTheDocument()
  })

  it('keeps Chat settings, Notifications, and Help separate from privacy and security', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: /Privacy and security/ }))
    expect(screen.getByRole('heading', { name: 'Privacy and security' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    for (const label of ['Chat settings', 'Notifications', 'Help and support']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))
      expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Change password' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    }
  })

  it('opens the privacy and security panel from settings', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Privacy and security/ }))
    expect(screen.getByRole('heading', { name: 'Privacy and security' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled()
  })

  it('requires the current password before permanently deleting the account from Chat settings', async () => {
    const user = { uid: 'test-user', email: 'henry@example.com', emailVerified: true, photoURL: null, displayName: 'Henry Example', getIdToken: vi.fn(async () => 'test-firebase-id-token') }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(reauthenticateWithCredential).mockResolvedValue(user as never)
    vi.mocked(deleteUser).mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    }))
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'henry@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Henry Example' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Chat settings' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Account' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' }))
    expect(screen.getByRole('heading', { name: 'Delete your account?' })).toBeInTheDocument()
    expect(screen.getByText(/This action is permanent/)).toBeInTheDocument()
    expect(deleteUser).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete' }))
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith(user))
    expect(reauthenticateWithCredential).toHaveBeenCalled()
    expect(getDocs).toHaveBeenCalled()
    expect(query).toHaveBeenCalled()
    expect(where).toHaveBeenCalledWith('uid', '==', user.uid)
    expect(runTransaction).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('heading', { name: /Chats/ })).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    expect(screen.getByRole('heading', { name: 'Your name' })).toBeInTheDocument()
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

  it('asks for confirmation before signing out from Chat settings', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Chat settings' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Account' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('heading', { name: 'Sign out?' })).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to sign out of your account?')).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'Sign out?' })).not.toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, sign out' }))
    await waitFor(() => expect(signOut).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your name' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Henry Example')).not.toBeInTheDocument()
  })

  it('shows only the horizontal Moments cards with blank space below', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Moments' })[0])
    expect(screen.getAllByRole('heading', { name: 'Moments' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('My Moments').length).toBeGreaterThan(0)
    expect(screen.getByText('Share a Moment')).toBeInTheDocument()
    expect(screen.queryByText('Recent Moments')).not.toBeInTheDocument()
    expect(screen.queryByText('No recent Moments yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()
    expect(screen.queryByText('Updates')).not.toBeInTheDocument()
    expect(screen.queryByText('Channels')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search conversations or @username')).not.toBeInTheDocument()
  })

  it('groups one person’s Moments together and opens the full-screen story viewer', async () => {
    const user = { uid: 'my-user', email: 'me@example.com', emailVerified: true, photoURL: null, displayName: 'My Name' }
    const timestamp = (value: number) => ({ toMillis: () => value })
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: 'other-1', data: () => ({ uid: 'other-user', displayName: 'Other Person', mediaUrl: 'https://media.example/one.jpg', mediaType: 'image', caption: 'First update', createdAt: timestamp(1000), expiresAt: Date.now() + 86400000 }) },
        { id: 'other-2', data: () => ({ uid: 'other-user', displayName: 'Other Person', mediaUrl: 'https://media.example/two.jpg', mediaType: 'image', caption: 'Second update', createdAt: timestamp(2000), expiresAt: Date.now() + 86400000 }) }
      ]
    } as never)

    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'me@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My Name' })).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'Moments' })[0])

    const otherMomentCards = await screen.findAllByRole('button', { name: /Other Person/ })
    expect(otherMomentCards).toHaveLength(1)
    expect(otherMomentCards[0]).toHaveTextContent('2 Moments')
    expect(screen.getAllByText('Other Person')).toHaveLength(1)
    fireEvent.click(otherMomentCards[0])
    expect(screen.getByRole('dialog', { name: 'Moment from Other Person' })).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    const momentViewer = screen.getByRole('dialog', { name: 'Moment from Other Person' })
    const nextMomentButton = screen.getByRole('button', { name: 'Next Moment' })
    fireEvent.pointerDown(nextMomentButton, { pointerId: 1, pointerType: 'touch', button: 0 })
    await waitFor(() => expect(momentViewer).toHaveAttribute('data-paused', 'true'), { timeout: 1500 })
    expect(screen.queryByText('Paused')).not.toBeInTheDocument()
    fireEvent.pointerUp(nextMomentButton, { pointerId: 1, pointerType: 'touch' })
    expect(momentViewer).toHaveAttribute('data-paused', 'false')
    // The browser's click after a long press must not skip the Moment.
    fireEvent.click(nextMomentButton)
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    // A normal tap still advances to the next Moment.
    fireEvent.click(nextMomentButton)
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Moment from Other Person' })).not.toBeInTheDocument()
  })

  it('opens the full-screen Moment creation flow with Text, Music, Layout and Voice choices', async () => {
    const user = { uid: 'create-user', email: 'create@example.com', emailVerified: true, photoURL: null, displayName: 'Creator' }
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user } as never)
    vi.mocked(reload).mockResolvedValue(undefined)
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'create@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Creator' })).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'Moments' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Add a moment' }))
    expect(screen.getByRole('dialog', { name: 'Add Moments' })).toBeInTheDocument()
    for (const label of ['Text', 'Music', 'Layout', 'Voice']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: /Text/ }))
    expect(screen.getByPlaceholderText('Type a Moment')).toBeInTheDocument()
    const shareTextMoment = screen.getByRole('button', { name: /Share Moment/ })
    expect(shareTextMoment).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Type a Moment'), { target: { value: 'Hello from Chater' } })
    expect(shareTextMoment).toBeEnabled()
  })

  it('hides the shared search field on Groups and You', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Groups' })[0])
    expect(screen.queryByPlaceholderText('Search conversations or @username')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'You' })[0])
    expect(screen.queryByPlaceholderText('Search conversations or @username')).not.toBeInTheDocument()
  })

  it('removes the keypad shortcut and keeps the Calls actions interactive', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Calls' })[0])
    expect(screen.queryByText('Keypad')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByRole('heading', { name: 'Schedule a call' })).toBeInTheDocument()
  })

  it('opens the phone call action from the Calls floating button', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Calls' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Make a call' }).find(button => button.classList.contains('compose-button'))!)
    expect(screen.getByRole('heading', { name: 'Make a call' })).toBeInTheDocument()
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument()
  })

  it('moves between tabs with a horizontal swipe', () => {
    openApp()
    const mainColumn = document.querySelector('#main-content')!
    fireEvent.touchStart(mainColumn, { touches: [{ clientX: 300, clientY: 300 }] })
    fireEvent.touchEnd(mainColumn, { changedTouches: [{ clientX: 190, clientY: 305 }] })
    expect(screen.getAllByRole('heading', { name: 'Moments' }).length).toBeGreaterThan(0)
    expect(document.querySelector('.content-wrap')).toHaveClass('tab-slide-forward')
    fireEvent.touchStart(mainColumn, { touches: [{ clientX: 180, clientY: 300 }] })
    fireEvent.touchEnd(mainColumn, { changedTouches: [{ clientX: 295, clientY: 302 }] })
    expect(screen.getAllByRole('button', { name: 'Chats' })[0]).toHaveAttribute('aria-current', 'page')
    expect(document.querySelector('.content-wrap')).toHaveClass('tab-slide-backward')
  })

  it('opens the sign-in flow when a signed-out user tries to add a Moment', () => {
    openApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Moments' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Add a moment' }))
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
