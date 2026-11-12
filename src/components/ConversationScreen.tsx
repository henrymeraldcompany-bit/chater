import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Download,
  Flag, FolderOpen, ImagePlus, MoreVertical, Palette, Search, ShieldBan,
  ShieldCheck, Smartphone, Trash2, UserRound, Volume2, VolumeX, X
} from 'lucide-react'
import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy,
  query as firestoreQuery, runTransaction, serverTimestamp, setDoc
} from 'firebase/firestore'
import { firestoreDb } from '../lib/firebase'
import { createConversationId, isValidChatMessage, normalizeChatMessage, timestampToMillis, type ChatMessage, type ChatUser } from '../lib/chat'

type ConversationScreenProps = {
  currentUserId: string
  target: ChatUser
  isBlocked: boolean
  onClose: () => void
  onBlock: (targetUid: string) => Promise<void>
  onUnblock: (targetUid: string) => Promise<void>
  generalWallpaper?: string
  generalWallpaperImageUrl?: string
  onWallpaperUpload?: (file: File, conversationId: string) => Promise<string>
}

type MenuPage = 'main' | 'more' | 'theme'
type ChatTheme = 'default' | 'midnight' | 'forest' | 'rose' | 'custom'

const chatThemes: { id: ChatTheme; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'forest', label: 'Forest' },
  { id: 'rose', label: 'Rose' },
  { id: 'custom', label: 'Custom image' }
]

function formatMessageTime(value: unknown): string {
  const millis = timestampToMillis(value)
  if (!millis) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(millis))
}

function chatPreferenceKey(userId: string, conversationId: string): string {
  return 'chater:chat-theme:' + userId + ':' + conversationId
}

function readChatTheme(userId: string, conversationId: string): ChatTheme {
  try {
    const stored = window.localStorage.getItem(chatPreferenceKey(userId, conversationId))
    return chatThemes.some(theme => theme.id === stored) ? stored as ChatTheme : 'default'
  } catch {
    return 'default'
  }
}

function readChatThemeImage(userId: string, conversationId: string): string {
  try {
    const stored = window.localStorage.getItem('chater:chat-theme-image:' + userId + ':' + conversationId) || ''
    return /^https:\/\/res\\.cloudinary\\.com\//i.test(stored) ? stored : ''
  } catch {
    return ''
  }
}

function readMutedPreference(conversationId: string): boolean {
  try {
    return window.localStorage.getItem('chater:chat-muted:' + conversationId) === 'true'
  } catch {
    return false
  }
}

function readChatClearBefore(conversationId: string): number {
  try {
    const stored = Number(window.localStorage.getItem('chater:chat-cleared-at:' + conversationId) || 0)
    return Number.isFinite(stored) && stored > 0 ? stored : 0
  } catch {
    return 0
  }
}

export default function ConversationScreen({
  currentUserId,
  target,
  isBlocked,
  onClose,
  onBlock,
  onUnblock,
  generalWallpaper = 'default',
  generalWallpaperImageUrl = '',
  onWallpaperUpload
}: ConversationScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageDraft, setMessageDraft] = useState('')
  const [messagesBusy, setMessagesBusy] = useState(true)
  const [messageSending, setMessageSending] = useState(false)
  const [messageNotice, setMessageNotice] = useState('')
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPage, setMenuPage] = useState<MenuPage>('main')
  const [contactInfoOpen, setContactInfoOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [messageSearch, setMessageSearch] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('spam')
  const [reportBusy, setReportBusy] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearBusy, setClearBusy] = useState(false)
  const [chatTheme, setChatTheme] = useState<ChatTheme>(() => readChatTheme(currentUserId, createConversationId(currentUserId, target.uid)))
  const [chatThemeImageUrl, setChatThemeImageUrl] = useState(() => readChatThemeImage(currentUserId, createConversationId(currentUserId, target.uid)))
  const [wallpaperUploadBusy, setWallpaperUploadBusy] = useState(false)
  const [muted, setMuted] = useState(() => readMutedPreference(createConversationId(currentUserId, target.uid)))
  const [clearBefore, setClearBefore] = useState(() => readChatClearBefore(createConversationId(currentUserId, target.uid)))
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const chatWallpaperInputRef = useRef<HTMLInputElement | null>(null)
  const conversationId = createConversationId(currentUserId, target.uid)

  useEffect(() => {
    const image = readChatThemeImage(currentUserId, conversationId)
    const theme = readChatTheme(currentUserId, conversationId)
    setChatTheme(theme)
    setChatThemeImageUrl(image)
    setMuted(readMutedPreference(conversationId))
    setClearBefore(readChatClearBefore(conversationId))
    if (!firestoreDb) return
    let active = true
    void getDoc(doc(firestoreDb, 'users', currentUserId, 'chatPreferences', conversationId)).then(snapshot => {
      if (!active || !snapshot.exists()) return
      const saved = snapshot.data() as Record<string, unknown>
      const savedTheme = chatThemes.some(item => item.id === saved.theme) ? saved.theme as ChatTheme : theme
      const savedImage = typeof saved.imageUrl === 'string' && /^https:\/\/res\\.cloudinary\\.com\//i.test(saved.imageUrl) ? saved.imageUrl : image
      setChatTheme(savedTheme)
      setChatThemeImageUrl(savedImage)
      try {
        window.localStorage.setItem(chatPreferenceKey(currentUserId, conversationId), savedTheme)
        const key = 'chater:chat-theme-image:' + currentUserId + ':' + conversationId
        if (savedImage) window.localStorage.setItem(key, savedImage)
        else window.localStorage.removeItem(key)
      } catch { /* Firestore remains the source of truth. */ }
    }).catch(() => {
      // Local account-scoped preferences remain available if chat preference rules are not published yet.
    })
    return () => { active = false }
  }, [currentUserId, conversationId])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setMenuPage('main')
      }
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
        setMenuPage('main')
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOutside)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [menuOpen])

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

  const closeMenu = () => {
    setMenuOpen(false)
    setMenuPage('main')
  }

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
        const messageSummary = text.replace(/\\s+/g, ' ').slice(0, 180)
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

  const handleReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!firestoreDb || reportBusy) return
    setReportBusy(true)
    try {
      await addDoc(collection(firestoreDb, 'reports'), {
        reporterUid: currentUserId,
        reportedUid: target.uid,
        conversationId,
        reason: reportReason,
        createdAt: serverTimestamp()
      })
      setReportOpen(false)
      setMessageNotice('Thank you. Your report has been submitted for review.')
    } catch {
      setMessageNotice('Your report could not be submitted. Publish Chater’s latest Firestore rules and try again.')
    } finally {
      setReportBusy(false)
    }
  }

  const handleClearChat = async () => {
    if (clearBusy) return
    setClearBusy(true)
    setMessageNotice('')
    try {
      // Clear only this member's local view. Never delete the shared message
      // documents or erase the other participant's copy of the conversation.
      const clearedAt = Date.now()
      window.localStorage.setItem('chater:chat-cleared-at:' + conversationId, String(clearedAt))
      setClearBefore(clearedAt)
      setClearConfirmOpen(false)
      setMessageNotice('Chat cleared on this device. The other participant keeps their copy.')
    } catch {
      setMessageNotice('This device could not save the cleared-chat preference. Check your browser storage and try again.')
    } finally {
      setClearBusy(false)
    }
  }

  const handleExportChat = () => {
    const exported = messages.map(message => {
      const sender = message.senderId === currentUserId ? 'You' : target.displayName
      const timestamp = formatMessageTime(message.createdAt)
      return '[' + timestamp + '] ' + sender + ': ' + message.text
    }).join('\\n')
    const file = new Blob([exported || 'No messages in this conversation.'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'chater-' + target.username + '-chat.txt'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    closeMenu()
    setMessageNotice('Chat export prepared.')
  }

  const saveChatAppearance = async (theme: ChatTheme, imageUrl: string) => {
    setChatTheme(theme)
    setChatThemeImageUrl(imageUrl)
    try {
      window.localStorage.setItem(chatPreferenceKey(currentUserId, conversationId), theme)
      const imageKey = 'chater:chat-theme-image:' + currentUserId + ':' + conversationId
      if (imageUrl) window.localStorage.setItem(imageKey, imageUrl)
      else window.localStorage.removeItem(imageKey)
    } catch {
      // Keep the selection active in this conversation if local storage is unavailable.
    }
    if (!firestoreDb) {
      setMessageNotice('This chat theme is active on this device, but cannot sync without the Chater database.')
      return
    }
    try {
      await setDoc(doc(firestoreDb, 'users', currentUserId, 'chatPreferences', conversationId), {
        theme,
        imageUrl,
        updatedAt: serverTimestamp()
      }, { merge: true })
      setMessageNotice('This chat theme is saved to your Chater account.')
    } catch {
      setMessageNotice('This chat theme is active on this device, but could not sync to your account. Publish the latest Firestore rules and check your connection.')
    }
  }

  const handleThemeChange = async (theme: ChatTheme) => {
    await saveChatAppearance(theme, '')
    closeMenu()
  }

  const handleChatWallpaperFile = async (file: File) => {
    if (!onWallpaperUpload) {
      setMessageNotice('Image wallpapers are not configured yet.')
      return
    }
    setWallpaperUploadBusy(true)
    setMessageNotice('Uploading this chat wallpaper…')
    try {
      const imageUrl = await onWallpaperUpload(file, conversationId)
      await saveChatAppearance('custom', imageUrl)
      closeMenu()
    } catch (error) {
      setMessageNotice(error instanceof Error ? error.message : 'The chat wallpaper could not be uploaded.')
    } finally {
      setWallpaperUploadBusy(false)
    }
  }

  const handleRemoveChatWallpaper = async () => {
    await saveChatAppearance('default', '')
    closeMenu()
  }

  const handleMuteToggle = () => {
    const nextMuted = !muted
    setMuted(nextMuted)
    try {
      window.localStorage.setItem('chater:chat-muted:' + conversationId, String(nextMuted))
    } catch {
      // The local preference remains active in this view.
    }
    closeMenu()
    setMessageNotice(nextMuted
      ? 'Muted preference saved. Push notifications are not active in Chater yet.'
      : 'Chat unmuted. Push notifications are not active in Chater yet.')
  }

  const visibleMessages = messages.filter(message => timestampToMillis(message.createdAt) > clearBefore)
  const filteredMessages = searchOpen && messageSearch.trim()
    ? visibleMessages.filter(message => message.text.toLowerCase().includes(messageSearch.trim().toLowerCase()))
    : visibleMessages

  const activeWallpaperImage = chatThemeImageUrl || (chatTheme === 'default' ? generalWallpaperImageUrl : '')
  const conversationThreadStyle = activeWallpaperImage
    ? { backgroundImage: `linear-gradient(#0005,#0005), url("${activeWallpaperImage}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined

  return <section className="public-profile-screen conversation-entry-screen live-conversation-screen" role="dialog" aria-modal="true" aria-label={'Conversation with ' + target.displayName} data-chat-theme={chatTheme} data-general-wallpaper={generalWallpaper}>
    <header className="public-profile-toolbar conversation-entry-toolbar">
      <button type="button" className="icon-button" aria-label="Back to chats" onClick={onClose}><ArrowLeft size={21}/></button>
      <span className="profile-avatar conversation-entry-avatar" aria-label={target.displayName + ' profile picture'}>
        {target.photoURL ? <img src={target.photoURL} alt="" /> : target.displayName.trim().charAt(0).toUpperCase()}
      </span>
      <div><strong>{target.displayName}</strong><span>@{target.username}</span></div>
      <div className="conversation-menu-anchor" ref={menuRef}>
        <button
          type="button"
          className="conversation-menu-trigger"
          aria-label="Chat options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen(open => !open); setMenuPage('main') }}
        ><MoreVertical size={22}/></button>
        {menuOpen && <div className="conversation-dropdown" role="menu" aria-label="Chat options menu">
          {menuPage === 'main' && <>
            <button type="button" role="menuitem" onClick={() => { setContactInfoOpen(open => !open); closeMenu() }}><UserRound size={18}/>View contact</button>
            <button type="button" role="menuitem" onClick={() => { setSearchOpen(true); setMessageSearch(''); closeMenu() }}><Search size={18}/>Search</button>
            <button type="button" role="menuitem" onClick={() => { setReportOpen(true); closeMenu() }}><Flag size={18}/>Report</button>
            <button type="button" role="menuitem" onClick={() => { setBlockConfirmOpen(true); closeMenu() }}>{isBlocked ? <ShieldCheck size={18}/> : <ShieldBan size={18}/>} {isBlocked ? 'Unblock' : 'Block'}</button>
            <button type="button" role="menuitem" onClick={handleMuteToggle}>{muted ? <Volume2 size={18}/> : <VolumeX size={18}/>} {muted ? 'Unmute notifications' : 'Mute notifications'}</button>
            <button type="button" role="menuitem" onClick={() => setMenuPage('theme')}><Palette size={18}/>Chat theme</button>
            <button type="button" role="menuitem" onClick={() => setMenuPage('more')}><FolderOpen size={18}/>More <ChevronRight className="conversation-menu-chevron" size={17}/></button>
          </>}
          {menuPage === 'theme' && <>
            <button type="button" className="conversation-menu-back" onClick={() => setMenuPage('main')}><ChevronLeft size={18}/>Back</button>
            {chatThemes.filter(theme => theme.id !== 'custom').map(theme => <button type="button" role="menuitemradio" aria-checked={chatTheme === theme.id && !chatThemeImageUrl} key={theme.id} onClick={() => void handleThemeChange(theme.id)}><span className={'conversation-theme-dot theme-' + theme.id}/>{theme.label}{chatTheme === theme.id && !chatThemeImageUrl && <Check size={17}/>}</button>)}
            <button type="button" role="menuitem" disabled={wallpaperUploadBusy || !onWallpaperUpload} onClick={() => chatWallpaperInputRef.current?.click()}><ImagePlus size={18}/>{wallpaperUploadBusy ? 'Uploading image…' : chatThemeImageUrl ? 'Change wallpaper image' : 'Add image as chat theme'}</button>
            {chatThemeImageUrl && <button type="button" role="menuitem" onClick={() => void handleRemoveChatWallpaper()}><X size={18}/>Remove personal image</button>}
          </>}
          {menuPage === 'more' && <>
            <button type="button" className="conversation-menu-back" onClick={() => setMenuPage('main')}><ChevronLeft size={18}/>Back</button>
            <button type="button" role="menuitem" onClick={() => { closeMenu(); setMessageNotice('Media, links, and documents will appear here when chat attachments are available.') }}><FolderOpen size={18}/>Media, links, and docs</button>
            <button type="button" role="menuitem" onClick={() => { closeMenu(); setClearConfirmOpen(true) }}><Trash2 size={18}/>Clear chat</button>
            <button type="button" role="menuitem" onClick={handleExportChat}><Download size={18}/>Export chat</button>
            <button type="button" role="menuitem" onClick={() => { closeMenu(); setMessageNotice('To add Chater to your home screen, open your browser menu and choose “Add to Home screen”. Individual chat shortcuts are not supported yet.') }}><Smartphone size={18}/>Add shortcut</button>
          </>}
        </div>}
      </div>
    </header>
    <input
      ref={chatWallpaperInputRef}
      className="wallpaper-hidden-input"
      type="file"
      accept="image/*"
      aria-label="Choose this chat wallpaper image"
      disabled={wallpaperUploadBusy}
      onChange={event => {
        const file = event.target.files?.[0]
        if (file) void handleChatWallpaperFile(file)
        event.currentTarget.value = ''
      }}
    />

    {contactInfoOpen && <section className="conversation-contact-card" aria-label="Contact information">
      <button type="button" className="conversation-panel-close" aria-label="Close contact information" onClick={() => setContactInfoOpen(false)}><X size={17}/></button>
      <span className="profile-avatar conversation-contact-avatar">{target.photoURL ? <img src={target.photoURL} alt=""/> : target.displayName.trim().charAt(0).toUpperCase()}</span>
      <strong>{target.displayName}</strong>
      <span>@{target.username}</span>
      <small>Chater member</small>
    </section>}

    {searchOpen && <div className="conversation-search-bar">
      <Search size={18}/>
      <input autoFocus aria-label="Search messages" placeholder="Search in this chat" value={messageSearch} onChange={event => setMessageSearch(event.target.value)}/>
      <span>{messageSearch.trim() ? filteredMessages.length + ' found' : ''}</span>
      <button type="button" aria-label="Close message search" onClick={() => { setSearchOpen(false); setMessageSearch('') }}><X size={18}/></button>
    </div>}

    {blockConfirmOpen && <div className="conversation-block-confirm" role="group" aria-label={isBlocked ? 'Confirm unblock' : 'Confirm block'}>
      <div><strong>{isBlocked ? 'Allow this account to contact you?' : 'Block this account?'}</strong><p>{isBlocked ? '@' + target.username + ' will be able to send you messages again.' : '@' + target.username + ' will no longer be able to send you messages. You can unblock them later.'}</p></div>
      <div className="conversation-block-actions">
        <button type="button" className="secondary-button" disabled={blockBusy} onClick={() => setBlockConfirmOpen(false)}>Cancel</button>
        <button type="button" className="primary-button" disabled={blockBusy} onClick={()=>void handleBlockAction()}>{blockBusy ? 'Saving…' : isBlocked ? 'Unblock account' : 'Block account'}</button>
      </div>
    </div>}

    {clearConfirmOpen && <div className="conversation-block-confirm" role="group" aria-label="Confirm clear chat">
      <div><strong>Clear this chat?</strong><p>This clears the messages from your view on this device only. The other participant keeps their copy, and new messages will appear here.</p></div>
      <div className="conversation-block-actions">
        <button type="button" className="secondary-button" disabled={clearBusy} onClick={() => setClearConfirmOpen(false)}>Cancel</button>
        <button type="button" className="primary-button" disabled={clearBusy} onClick={() => void handleClearChat()}>{clearBusy ? 'Clearing…' : 'Clear chat'}</button>
      </div>
    </div>}

    {reportOpen && <form className="conversation-block-confirm conversation-report-form" onSubmit={handleReport} aria-label="Report this account">
      <div><strong>Report @{target.username}</strong><p>Choose the reason that best describes your report. Our team can review the account and conversation.</p></div>
      <label htmlFor="conversation-report-reason">Reason</label>
      <select id="conversation-report-reason" value={reportReason} onChange={event => setReportReason(event.target.value)}>
        <option value="spam">Spam</option>
        <option value="harassment">Harassment or bullying</option>
        <option value="impersonation">Impersonation</option>
        <option value="inappropriate">Inappropriate content</option>
        <option value="other">Something else</option>
      </select>
      <div className="conversation-block-actions">
        <button type="button" className="secondary-button" disabled={reportBusy} onClick={() => setReportOpen(false)}>Cancel</button>
        <button type="submit" className="primary-button" disabled={reportBusy}>{reportBusy ? 'Submitting…' : 'Submit report'}</button>
      </div>
    </form>}

    <div className="conversation-thread" role="log" aria-label="Messages" aria-live="polite" style={conversationThreadStyle}>
      {messagesBusy && <p className="conversation-thread-notice" role="status">Loading messages…</p>}
      {!messagesBusy && messages.length === 0 && <div className="conversation-start-note"><strong>No messages yet</strong><p>Start the conversation. There are no message requests or approval steps on Chater.</p></div>}
      {searchOpen && messageSearch.trim() && filteredMessages.length === 0 && <p className="conversation-thread-notice" role="status">No matching messages found.</p>}
      {filteredMessages.map(message => {
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
