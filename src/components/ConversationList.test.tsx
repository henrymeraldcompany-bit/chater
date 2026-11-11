import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDoc, onSnapshot } from 'firebase/firestore'
import ConversationList from './ConversationList'

vi.mock('../lib/firebase', () => ({ firestoreDb: {} }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...parts: string[]) => ({ path: parts.slice(1).join('/') })),
  doc: vi.fn((...parts: string[]) => ({ path: parts.slice(1).join('/') })),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((reference: unknown) => reference),
  where: vi.fn(() => ({}))
}))

describe('ConversationList saved contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows saved contacts in Chats and opens a direct conversation when tapped', async () => {
    const contactProfile = {
      uid: 'ada-user',
      username: 'ada_lovelace',
      displayName: 'Ada Lovelace',
      photoURL: 'https://media.example/ada.jpg'
    }
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => contactProfile
    } as never)
    vi.mocked(onSnapshot).mockImplementation(((reference: { path: string }, next: (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) => {
      if (reference.path === 'conversations') {
        next({ docs: [] })
      } else {
        next({ docs: [{ id: 'ada-user', data: () => ({ uid: 'ada-user' }) }] })
      }
      return vi.fn()
    }) as never)

    const onOpen = vi.fn()
    render(
      <ConversationList
        userId="signed-in-user"
        search=""
        onOpen={onOpen}
        onStartConversation={vi.fn()}
        onFindPeople={vi.fn()}
      />
    )

    const contactRow = await screen.findByRole('button', { name: 'Open conversation with Ada Lovelace' })
    expect(contactRow).toBeInTheDocument()
    expect(contactRow).toHaveTextContent('Start chatting')
    expect(contactRow.querySelector('img')).toHaveAttribute('src', contactProfile.photoURL)

    fireEvent.click(contactRow)
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith({
      uid: 'ada-user',
      username: 'ada_lovelace',
      displayName: 'Ada Lovelace',
      photoURL: 'https://media.example/ada.jpg'
    }))
  })

  it('does not list a saved contact twice when a conversation already exists', async () => {
    const contactProfile = {
      uid: 'ada-user',
      username: 'ada_lovelace',
      displayName: 'Ada Lovelace',
      photoURL: ''
    }
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => contactProfile
    } as never)
    vi.mocked(onSnapshot).mockImplementation(((reference: { path: string }, next: (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) => {
      if (reference.path === 'conversations') {
        next({ docs: [{
          id: 'conversation-id',
          data: () => ({
            participants: ['signed-in-user', 'ada-user'],
            lastMessageText: 'Hello',
            lastMessageSenderId: 'signed-in-user',
            lastMessageAt: 1
          })
        }] })
      } else {
        next({ docs: [{ id: 'ada-user', data: () => ({ uid: 'ada-user' }) }] })
      }
      return vi.fn()
    }) as never)

    render(
      <ConversationList
        userId="signed-in-user"
        search=""
        onOpen={vi.fn()}
        onStartConversation={vi.fn()}
        onFindPeople={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Open conversation with Ada Lovelace' })).toHaveLength(1)
      expect(screen.getByText('You: Hello')).toBeInTheDocument()
    })
  })
})
