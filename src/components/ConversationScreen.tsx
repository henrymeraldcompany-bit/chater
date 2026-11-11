import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowUpRight, ShieldBan, ShieldCheck } from 'lucide-react'
import { collection, doc, onSnapshot, orderBy, query as firestoreQuery, runTransaction, serverTimestamp } from 'firebase/firestore'
import { firestoreDb } from '../lib/firebase'
import { createConversationId, isValidChatMessage, normalizeChatMessage, timestampToMillis, type ChatMessage, type ChatUser } from '../lib/chat'

type ConversationScreenProps = {
  currentUserId: string
  target: ChatUser
  isBlocked: boolean
  onClose: () => void
  onBlock: (targetUid: string) => Promise<void>
  onUnblock: (targetUid: string) => Promise<void>
}

function formatMessageTime(value: unknown): string {
  const millis = timestampToMillis(value)
  if (!millis) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(millis))
}

export default function ConversationScreen({
  currentUserId,
  target,
  isBlocked,
  onClose,
  onBlock,
  onUnblock
}: ConversationScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageDraft, setMessageDraft] = useState('')
  const [messagesBusy, setMessagesBusy] = useState(true)
  const [messageSending, setMessageSending] = useState(false)
  const [messageNotice, setMessageNotice] = useState('')
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const conversationId = createConversationId(currentUserId, target.uid)

  useEffect(() => {
    if (!firestoreDb) {
      setMessagesBusy(false)
      setMessageNotice('Chater cannot connect to its message database right now.')
      return
    }
    setMessages([])
    setMessagesBusy(true)
    const messagesQuery = firestoreQuery(
      collection(firestoreDb, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    )
    return onSnapshot(messagesQuery, snapshot => {
      const nextMessages = snapshot.docs.map(item => {
        const data = item.data() as Record<string, unknown>
        return {
          id: item.id,
          senderId: typeof data.senderId === 'string' ? data.senderId : '',
          recipientId: typeof data.recipientId === 'string' ? data.recipientId : '',
          text: typeof data.text === 'string' ? data.text : '',
          createdAt: data.createdAt
        }
      }).filter(message => message.senderId && message.recipientId && message.text)
      setMessages(nextMessages)
      setMessagesBusy(false)
    }, () => {
      setMessagesBusy(false)
      setMessageNotice('This conversation could not be loaded. Publish Chater’s latest Firestore rules and try again.')
    })
  }, [conversationId])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!firestoreDb || isBlocked || messageSending || !isValidChatMessage(messageDraft)) return
    const text = normalizeChatMessage(messageDraft)
    setMessageSending(true)
    setMessageNotice('')
    try {
      const db = firestoreDb
      const conversationRef = doc(db, 'conversations', conversationId)
      const messageRef = doc(collection(db, 'conversations', conversationId, 'messages'))
      const participants = [currentUserId, target.uid].sort()
      await runTransaction(db, async transaction => {
        const conversationSnapshot = await transaction.get(conversationRef)
        const messageSummary = text.replace(/\s+/g, ' ').slice(0, 180)
        const latestMessage = {
          lastMessageText: messageSummary,
          lastMessageSenderId: currentUserId,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
        if (conversationSnapshot.exists()) {
          const existingParticipants = conversationSnapshot.data()?.participants
          if (!Array.isArray(existingParticipants) ||
            existingParticipants.length !== 2 ||
            !participants.every(uid => existingParticipants.includes(uid))) {
            throw new Error('This conversation is not available for these accounts.')
          }
          transaction.update(conversationRef, latestMessage)
        } else {
          transaction.set(conversationRef, {
            participants,
            createdAt: serverTimestamp(),
            ...latestMessage
          })
        }
        transaction.set(messageRef, {
          senderId: currentUserId,
          recipientId: target.uid,
          text,
          createdAt: serverTimestamp()
        })
      })
      setMessageDraft('')
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : ''
      setMessageNotice(code === 'permission-denied'
        ? 'This message was not sent. The recipient may have blocked your account, or the latest Firestore rules have not been published yet.'
        : error instanceof Error && error.message
          ? error.message
          : 'Your message could not be sent. Check your connection and try again.')
    } finally {
      setMessageSending(false)
    }
  }

  const handleBlockAction = async () => {
    setBlockBusy(true)
    setMessageNotice('')
    try {
      if (isBlocked) await onUnblock(target.uid)
      else await onBlock(target.uid)
      setBlockConfirmOpen(false)
      setMessageNotice(isBlocked
        ? 'You have unblocked @' + target.username + '.'
        : '@' + target.username + ' can no longer contact you on Chater.')
    } catch {
      setMessageNotice('Chater could not update your block list. Check your connection and try again.')
    } finally {
      setBlockBusy(false)
    }
  }

  return <section className="public-profile-screen conversation-entry-screen live-conversation-screen" role="dialog" aria-modal="true" aria-label={'Conversation with ' + target.displayName}>
    <header className="public-profile-toolbar conversation-entry-toolbar">
      <button type="button" className="icon-button" aria-label="Back to chats" onClick={onClose}><ArrowLeft size={21}/></button>
      <span className="profile-avatar conversation-entry-avatar" aria-label={target.displayName + ' profile picture'}>
        {target.photoURL ? <img src={target.photoURL} alt="" /> : target.displayName.trim().charAt(0).toUpperCase()}
      </span>
      <div><strong>{target.displayName}</strong><span>@{target.username}</span></div>
      <button
        type="button"
        className={isBlocked ? 'conversation-unblock-button' : 'conversation-block-button'}
        aria-label={isBlocked ? 'Unblock ' + target.displayName : 'Block ' + target.displayName}
        onClick={() => setBlockConfirmOpen(open => !open)}
      >
        {isBlocked ? <ShieldCheck size={17}/> : <ShieldBan size={17}/>}
        <span>{isBlocked ? 'Unblock' : 'Block'}</span>
      </button>
    </header>

    {blockConfirmOpen && <div className="conversation-block-confirm" role="group" aria-label={isBlocked ? 'Confirm unblock' : 'Confirm block'}>
      <div><strong>{isBlocked ? 'Allow this account to contact you?' : 'Block this account?'}</strong><p>{isBlocked ? '@' + target.username + ' will be able to send you messages again.' : '@' + target.username + ' will no longer be able to send you messages. You can unblock them later.'}</p></div>
      <div className="conversation-block-actions">
        <button type="button" className="secondary-button" disabled={blockBusy} onClick={() => setBlockConfirmOpen(false)}>Cancel</button>
        <button type="button" className="primary-button" disabled={blockBusy} onClick={()=>void handleBlockAction()}>{blockBusy ? 'Saving…' : isBlocked ? 'Unblock account' : 'Block account'}</button>
      </div>
    </div>}

    <div className="conversation-thread" role="log" aria-label="Messages" aria-live="polite">
      {messagesBusy && <p className="conversation-thread-notice" role="status">Loading messages…</p>}
      {!messagesBusy && messages.length === 0 && <div className="conversation-start-note"><strong>No messages yet</strong><p>Start the conversation. There are no message requests or approval steps on Chater.</p></div>}
      {messages.map(message => {
        const sent = message.senderId === currentUserId
        return <article key={message.id} className={sent ? 'chat-message chat-message-sent' : 'chat-message chat-message-received'}>
          <p>{message.text}</p>
          <time>{formatMessageTime(message.createdAt)}</time>
        </article>
      })}
      <div ref={messageEndRef}/>
    </div>

    {messageNotice && <p className="conversation-message-notice" role="status">{messageNotice}</p>}
    {isBlocked
      ? <div className="conversation-blocked-state"><ShieldBan size={19}/><p>You blocked this account. Unblock them to send messages again.</p></div>
      : <form className="conversation-entry-composer live-conversation-composer" onSubmit={handleSendMessage}>
          <textarea
            aria-label="Message"
            placeholder="Write a message…"
            rows={1}
            maxLength={4000}
            value={messageDraft}
            onChange={event=>setMessageDraft(event.target.value)}
            disabled={messageSending}
          />
          <button type="submit" aria-label="Send message" disabled={messageSending || !isValidChatMessage(messageDraft)}>
            <ArrowUpRight size={19}/>
          </button>
        </form>}
  </section>
}
