import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Plus } from 'lucide-react'
import { collection, doc, getDoc, onSnapshot, query as firestoreQuery, where } from 'firebase/firestore'
import { firestoreDb } from '../lib/firebase'
import { timestampToMillis, type ChatConversation, type ChatUser } from '../lib/chat'

type ConversationListProps = {
  userId: string | null
  search: string
  onOpen: (user: ChatUser) => void
  onStartConversation: () => void
  onFindPeople: () => void
}

function formatConversationTime(value: unknown): string {
  const millis = timestampToMillis(value)
  if (!millis) return ''
  const date = new Date(millis)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function ConversationAvatar({ user }: { user: ChatUser }) {
  return <span className="profile-avatar conversation-list-avatar" aria-label={user.displayName + ' profile picture'}>
    {user.photoURL ? <img src={user.photoURL} alt="" /> : user.displayName.trim().charAt(0).toUpperCase()}
  </span>
}

export default function ConversationList({ userId, search, onOpen, onStartConversation, onFindPeople }: ConversationListProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!userId || !firestoreDb) {
      setConversations([])
      setBusy(false)
      return
    }
    const db = firestoreDb
    let active = true
    setBusy(true)
    setNotice('')
    const conversationsQuery = firestoreQuery(
      collection(db, 'conversations'),
      where('participants', 'array-contains', userId)
    )
    const unsubscribe = onSnapshot(conversationsQuery, snapshot => {
      void (async () => {
        const items = await Promise.all(snapshot.docs.map(async item => {
          const data = item.data() as Record<string, unknown>
          const participants = Array.isArray(data.participants)
            ? data.participants.filter((value): value is string => typeof value === 'string')
            : []
          const otherUid = participants.find(uid => uid !== userId)
          if (!otherUid || participants.length !== 2) return null
          let profile: Record<string, unknown> = {}
          try {
            const profileSnapshot = await getDoc(doc(db, 'users', otherUid))
            if (profileSnapshot.exists()) profile = profileSnapshot.data() as Record<string, unknown>
          } catch {
            // Keep the conversation visible even if a profile read is temporarily unavailable.
          }
          const username = typeof profile.username === 'string' ? profile.username : ''
          const displayName = typeof profile.displayName === 'string' && profile.displayName.trim()
            ? profile.displayName.trim()
            : username || 'Chater member'
          return {
            id: item.id,
            user: {
              uid: otherUid,
              username,
              displayName,
              photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : ''
            },
            lastMessageText: typeof data.lastMessageText === 'string' ? data.lastMessageText : '',
            lastMessageSenderId: typeof data.lastMessageSenderId === 'string' ? data.lastMessageSenderId : '',
            lastMessageAt: data.lastMessageAt
          } satisfies ChatConversation
        }))
        if (!active) return
        setConversations(items.filter((item): item is ChatConversation => item !== null)
          .sort((left, right) => timestampToMillis(right.lastMessageAt) - timestampToMillis(left.lastMessageAt)))
        setBusy(false)
      })().catch(() => {
        if (active) {
          setBusy(false)
          setNotice('Your conversations could not be loaded. Check your connection and try again.')
        }
      })
    }, () => {
      if (!active) return
      setBusy(false)
      setNotice('Your conversations could not be loaded. Publish Chater’s latest Firestore rules and try again.')
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [userId])

  const filteredConversations = useMemo(() => {
    const term = search.trim().replace(/^@/, '').toLowerCase()
    if (!term) return conversations
    return conversations.filter(item =>
      item.user.displayName.toLowerCase().includes(term) ||
      item.user.username.toLowerCase().includes(term) ||
      item.lastMessageText.toLowerCase().includes(term)
    )
  }, [conversations, search])

  if (!userId) {
    return <section className="conversation-list-section" aria-label="Your conversations">
      <h1 className="a11y-heading">Chats</h1>
      <div className="empty-state chat-empty">
        <div className="conversation-empty-icon"><MessageCircle size={34}/></div>
        <p className="eyebrow">YOUR CHATER INBOX</p>
        <h2>Conversations start here.</h2>
        <p className="empty-description">Find any Chater member. Sign in to send a message, reply whenever you want, or block an account from contacting you.</p>
        <button className="primary-button" onClick={onStartConversation}><Plus size={17}/> Start a conversation</button>
        <button className="text-button" onClick={onFindPeople}>Find people by username</button>
      </div>
    </section>
  }

  return <section className="conversation-list-section" aria-label="Your conversations">
    <h1 className="a11y-heading">Chats</h1>
    {notice && <p className="conversation-list-notice" role="status">{notice}</p>}
    {busy && conversations.length === 0 && <p className="conversation-list-loading" role="status">Loading your conversations…</p>}
    {!busy && !notice && conversations.length === 0 && <div className="empty-state chat-empty conversation-list-empty">
      <div className="conversation-empty-icon"><MessageCircle size={34}/></div>
      <p className="eyebrow">YOUR CHATS</p>
      <h2>Your conversations<br/>start here.</h2>
      <p className="empty-description">Anyone can message you directly. You can reply whenever you want or block an account from contacting you.</p>
      <button className="primary-button" onClick={onStartConversation}><Plus size={17}/> Start a conversation</button>
      <button className="text-button" onClick={onFindPeople}>Find people by username</button>
    </div>}
    {!busy && conversations.length > 0 && filteredConversations.length === 0 && <p className="conversation-list-loading">No conversations match this search.</p>}
    <div className="conversation-list">
      {filteredConversations.map(item => <button
        type="button"
        className="conversation-list-item"
        key={item.id}
        onClick={() => onOpen(item.user)}
        aria-label={'Open conversation with ' + item.user.displayName}
      >
        <ConversationAvatar user={item.user}/>
        <span className="conversation-list-copy">
          <strong>{item.user.displayName}</strong>
          <span>{item.lastMessageSenderId === userId ? 'You: ' : ''}{item.lastMessageText || 'Start chatting'}</span>
        </span>
        <time>{formatConversationTime(item.lastMessageAt)}</time>
      </button>)}
    </div>
  </section>
}
