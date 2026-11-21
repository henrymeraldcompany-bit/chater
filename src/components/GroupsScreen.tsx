import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft, Check, ChevronRight, Download, FileText, MessageCircle,
  MoreVertical, Palette, Pencil, Pin, Plus, Search, Send, ShieldCheck,
  Trash2, Users, X
} from 'lucide-react'
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc,
  getDocs, limit, onSnapshot, orderBy, query as firestoreQuery,
  runTransaction, serverTimestamp, updateDoc, where, writeBatch
} from 'firebase/firestore'
import { firestoreDb } from '../lib/firebase'

type ChaterGroup = {
  id: string
  name: string
  description: string
  ownerId: string
  adminIds: string[]
  memberIds: string[]
  photoURL: string
  lastMessageText: string
  lastMessageSenderId: string
  lastMessageAt: unknown
  onlyAdminsCanSend: boolean
}

type GroupMessage = {
  id: string
  senderId: string
  senderName: string
  text: string
  kind: 'text' | 'announcement'
  createdAt: unknown
  pinned: boolean
}

type GroupMember = {
  uid: string
  username: string
  displayName: string
  photoURL: string
}

type GroupsScreenProps = {
  userId: string
  displayName: string
}

function groupFromSnapshot(id: string, data: Record<string, unknown>): ChaterGroup {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Chater group',
    description: typeof data.description === 'string' ? data.description : '',
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    adminIds: Array.isArray(data.adminIds) ? data.adminIds.filter((item): item is string => typeof item === 'string') : [],
    memberIds: Array.isArray(data.memberIds) ? data.memberIds.filter((item): item is string => typeof item === 'string') : [],
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
    lastMessageText: typeof data.lastMessageText === 'string' ? data.lastMessageText : '',
    lastMessageSenderId: typeof data.lastMessageSenderId === 'string' ? data.lastMessageSenderId : '',
    lastMessageAt: data.lastMessageAt ?? null,
    onlyAdminsCanSend: data.onlyAdminsCanSend === true
  }
}

function formatGroupTime(value: unknown): string {
  if (!value || typeof value !== 'object' || !('toDate' in value)) return ''
  try {
    const date = (value as { toDate(): Date }).toDate()
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
  } catch {
    return ''
  }
}

function formatMemberName(profile: GroupMember | undefined, uid: string): string {
  return profile?.displayName || profile?.username || (uid === '' ? 'Chater member' : 'Member')
}

async function findPublicGroupMember(rawUsername: string, currentUserId: string): Promise<GroupMember> {
  const db = firestoreDb
  if (!db) throw new Error('Chater cannot connect to the member directory right now.')
  const username = rawUsername.trim().replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new Error('Enter a valid Chater username (3–20 letters, numbers or underscores).')
  }
  const usernameSnapshot = await getDoc(doc(db, 'usernames', username))
  if (!usernameSnapshot.exists()) throw new Error('No Chater account uses that username.')
  const uid = usernameSnapshot.data()?.uid
  if (typeof uid !== 'string' || !uid || uid === currentUserId) {
    throw new Error('Choose another Chater member.')
  }
  const profileSnapshot = await getDoc(doc(db, 'users', uid))
  if (!profileSnapshot.exists()) throw new Error('That Chater profile is not available.')
  const profile = profileSnapshot.data() as Record<string, unknown>
  return {
    uid,
    username,
    displayName: typeof profile.displayName === 'string' && profile.displayName.trim() ? profile.displayName.trim() : username,
    photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : ''
  }
}

export default function GroupsScreen({ userId, displayName }: GroupsScreenProps) {
  const [groups, setGroups] = useState<ChaterGroup[]>([])
  const [activeGroup, setActiveGroup] = useState<ChaterGroup | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [groupsBusy, setGroupsBusy] = useState(true)
  const [messageDraft, setMessageDraft] = useState('')
  const [messageSearchOpen, setMessageSearchOpen] = useState(false)
  const [messageSearch, setMessageSearch] = useState('')
  const [announcementMode, setAnnouncementMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [createUsername, setCreateUsername] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<GroupMember[]>([])
  const [memberLookupBusy, setMemberLookupBusy] = useState(false)
  const [memberLookupNotice, setMemberLookupNotice] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [memberUsername, setMemberUsername] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState('')
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState('')
  const [editMessageId, setEditMessageId] = useState('')
  const [editMessageDraft, setEditMessageDraft] = useState('')
  const [groupTheme, setGroupTheme] = useState<'default' | 'midnight' | 'forest'>('default')
  const [editOnlyAdminsCanSend, setEditOnlyAdminsCanSend] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editInfoOpen, setEditInfoOpen] = useState(false)
  const [editGroupName, setEditGroupName] = useState('')
  const [editGroupDescription, setEditGroupDescription] = useState('')
  const activeGroupId = activeGroup?.id ?? ''
  const activeGroupMemberIds = activeGroup?.memberIds.join('|') ?? ''

  useEffect(() => {
    const db = firestoreDb
    if (!db || !userId) {
      setGroups([])
      setGroupsBusy(false)
      return
    }
    setGroupsBusy(true)
    return onSnapshot(
      firestoreQuery(collection(db, 'groups'), where('memberIds', 'array-contains', userId)),
      snapshot => {
        const next = snapshot.docs
          .map(item => groupFromSnapshot(item.id, item.data() as Record<string, unknown>))
          .filter(group => group.memberIds.includes(userId))
          .sort((left, right) => left.name.localeCompare(right.name))
        setGroups(next)
        setActiveGroup(current => current ? next.find(group => group.id === current.id) || null : null)
        setGroupsBusy(false)
      },
      () => {
        setGroups([])
        setGroupsBusy(false)
        setNotice('Your groups could not be loaded. Check that the latest Chater group security rules are published.')
      }
    )
  }, [userId])

  useEffect(() => {
    const db = firestoreDb
    if (!db || !activeGroupId) {
      setMessages([])
      setMembers([])
      return
    }
    let active = true
    const messagesQuery = firestoreQuery(
      collection(db, 'groups', activeGroupId, 'messages'),
      orderBy('createdAt', 'asc')
    )
    const stopMessages = onSnapshot(messagesQuery, snapshot => {
      if (!active) return
      setMessages(snapshot.docs.map(item => {
        const data = item.data() as Record<string, unknown>
        return {
          id: item.id,
          senderId: typeof data.senderId === 'string' ? data.senderId : '',
          senderName: typeof data.senderName === 'string' ? data.senderName : 'Chater member',
          text: typeof data.text === 'string' ? data.text : '',
          kind: data.kind === 'announcement' ? 'announcement' as const : 'text' as const,
          createdAt: data.createdAt,
          pinned: data.pinned === true
        }
      }).filter(message => message.senderId && message.text))
    }, () => {
      if (active) setNotice('Group messages could not be loaded. Check your connection and group permissions.')
    })
    void Promise.all(activeGroupMemberIds.split('|').filter(Boolean).map(async uid => {
      try {
        const profileSnapshot = await getDoc(doc(db, 'users', uid))
        if (!profileSnapshot.exists()) return {
          uid, username: '', displayName: uid === userId ? displayName : 'Chater member', photoURL: ''
        }
        const profile = profileSnapshot.data() as Record<string, unknown>
        return {
          uid,
          username: typeof profile.username === 'string' ? profile.username : '',
          displayName: typeof profile.displayName === 'string' && profile.displayName.trim()
            ? profile.displayName.trim()
            : (typeof profile.username === 'string' ? profile.username : 'Chater member'),
          photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : ''
        }
      } catch {
        return { uid, username: '', displayName: uid === userId ? displayName : 'Chater member', photoURL: '' }
      }
    })).then(profiles => {
      if (active) setMembers(profiles)
    })
    return () => {
      active = false
      stopMessages()
    }
  }, [activeGroupId, activeGroupMemberIds, displayName, userId])

  const filteredGroupMessages = useMemo(() => {
    const term = messageSearch.trim().toLowerCase()
    if (!term) return messages
    return messages.filter(message =>
      message.text.toLowerCase().includes(term) || message.senderName.toLowerCase().includes(term)
    )
  }, [messages, messageSearch])

  const visibleGroups = useMemo(() => {
    const search = groupSearch.trim().toLowerCase()
    return groups.filter(group => !search || group.name.toLowerCase().includes(search) || group.description.toLowerCase().includes(search))
  }, [groups, groupSearch])

  const isAdmin = Boolean(activeGroup && activeGroup.adminIds.includes(userId))
  const isOwner = Boolean(activeGroup && activeGroup.ownerId === userId)

  const resetCreate = () => {
    setCreateOpen(false)
    setGroupName('')
    setGroupDescription('')
    setCreateUsername('')
    setSelectedMembers([])
    setMemberLookupNotice('')
    setNotice('')
  }

  const addMemberToSelection = async () => {
    if (!createUsername.trim()) return
    setMemberLookupBusy(true)
    setMemberLookupNotice('')
    try {
      const profile = await findPublicGroupMember(createUsername, userId)
      if (selectedMembers.some(member => member.uid === profile.uid)) {
        setMemberLookupNotice('That member has already been added.')
      } else if (selectedMembers.length >= 19) {
        setMemberLookupNotice('A new group can start with up to 20 members.')
      } else {
        setSelectedMembers(current => [...current, profile])
        setCreateUsername('')
      }
    } catch (error) {
      setMemberLookupNotice(error instanceof Error ? error.message : 'The member could not be found.')
    } finally {
      setMemberLookupBusy(false)
    }
  }

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const db = firestoreDb
    const name = groupName.trim().replace(/\s+/g, ' ')
    const description = groupDescription.trim().replace(/\s+/g, ' ')
    if (!db || !userId) {
      setMemberLookupNotice('Sign in to create a Chater group.')
      return
    }
    if (name.length < 2 || name.length > 50) {
      setMemberLookupNotice('Group names must be 2–50 characters.')
      return
    }
    if (description.length > 180) {
      setMemberLookupNotice('Group descriptions must be 180 characters or fewer.')
      return
    }
    if (selectedMembers.length < 1) {
      setMemberLookupNotice('Add at least one other Chater member to create a group.')
      return
    }
    setBusy(true)
    setMemberLookupNotice('')
    try {
      await addDoc(collection(db, 'groups'), {
        name,
        description,
        photoURL: '',
        ownerId: userId,
        adminIds: [userId],
        memberIds: [userId, ...selectedMembers.map(member => member.uid)],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessageText: '',
        lastMessageSenderId: '',
        lastMessageAt: null,
        onlyAdminsCanSend: false
      })
      resetCreate()
      setNotice('Your group has been created.')
    } catch (error) {
      setMemberLookupNotice(error instanceof Error ? error.message : 'Chater could not create this group. Check the group security rules and try again.')
    } finally {
      setBusy(false)
    }
  }

  const sendGroupMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const db = firestoreDb
    const group = activeGroup
    const text = messageDraft.replace(/\r\n?/g, '\n').trim()
    if (!db || !group || !group.memberIds.includes(userId) || (group.onlyAdminsCanSend && !isAdmin) || !text || text.length > 4000 || busy) return
    setBusy(true)
    setNotice('')
    try {
      const groupRef = doc(db, 'groups', group.id)
      const messageRef = doc(collection(db, 'groups', group.id, 'messages'))
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(groupRef)
        const data = snapshot.data()
        if (!snapshot.exists() || !Array.isArray(data?.memberIds) || !data.memberIds.includes(userId)) {
          throw new Error('You are no longer a member of this group.')
        }
        transaction.set(messageRef, {
          senderId: userId,
          senderName: displayName.trim() || 'Chater member',
          text,
          kind: announcementMode && isAdmin ? 'announcement' : 'text',
          createdAt: serverTimestamp()
        })
        transaction.update(groupRef, {
          lastMessageText: text.replace(/\s+/g, ' ').slice(0, 180),
          lastMessageSenderId: userId,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      })
      setMessageDraft('')
      setAnnouncementMode(false)
    } catch (error) {
      setNotice(error instanceof Error && error.message
        ? error.message
        : 'The group message could not be sent. Check your connection and group permissions.')
    } finally {
      setBusy(false)
    }
  }

  const editGroupMessage = async () => {
    const db = firestoreDb
    const group = activeGroup
    const message = messages.find(item => item.id === editMessageId)
    const text = editMessageDraft.trim()
    if (!db || !group || !message || message.senderId !== userId || !text || text.length > 4000) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'groups', group.id, 'messages', message.id), { text })
      setEditMessageId('')
      setEditMessageDraft('')
      setSelectedMessageId('')
    } catch {
      setNotice('This message could not be edited. Check that the updated Chater group rules are published.')
    } finally { setBusy(false) }
  }

  const togglePinnedMessage = async (message: GroupMessage) => {
    const db = firestoreDb
    const group = activeGroup
    if (!db || !group || !isAdmin) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'groups', group.id, 'messages', message.id), { pinned: !message.pinned })
      setSelectedMessageId('')
    } catch {
      setNotice('This message could not be pinned. Check that the updated Chater group rules are published.')
    } finally { setBusy(false) }
  }

  const exportGroupChat = () => {
    const contents = messages.map(message => '[' + formatGroupTime(message.createdAt) + '] ' + message.senderName + ': ' + message.text).join('\\n')
    const file = new Blob([contents || 'No messages in this group.'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'chater-' + (activeGroup?.name || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-chat.txt'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setGroupMenuOpen(false)
  }

  const deleteGroupMessage = async (messageId: string) => {
    const db = firestoreDb
    const group = activeGroup
    if (!db || !group || !pendingDeleteMessageId || !messages.some(message => message.id === messageId)) return
    const message = messages.find(item => item.id === messageId)
    if (!message || (message.senderId !== userId && !isAdmin)) return
    setBusy(true)
    setNotice('')
    try {
      await deleteDoc(doc(db, 'groups', group.id, 'messages', messageId))
      setPendingDeleteMessageId('')
    } catch {
      setNotice('Chater could not delete that group message. Check your connection and permissions.')
    } finally {
      setBusy(false)
    }
  }

  const addMemberToGroup = async () => {
    const db = firestoreDb
    const group = activeGroup
    if (!db || !group || !isAdmin || !memberUsername.trim()) return
    setMemberLookupBusy(true)
    setMemberLookupNotice('')
    try {
      const profile = await findPublicGroupMember(memberUsername, userId)
      if (group.memberIds.includes(profile.uid)) {
        setMemberLookupNotice('That person is already in this group.')
      } else if (group.memberIds.length >= 200) {
        setMemberLookupNotice('This group has reached its current 200-member limit.')
      } else {
        await updateDoc(doc(db, 'groups', group.id), {
          memberIds: arrayUnion(profile.uid),
          updatedAt: serverTimestamp()
        })
        setMemberUsername('')
        setMemberLookupNotice('Member added to the group.')
      }
    } catch (error) {
      setMemberLookupNotice(error instanceof Error ? error.message : 'Chater could not add this member.')
    } finally {
      setMemberLookupBusy(false)
    }
  }

  const saveGroupInfo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const db = firestoreDb
    const group = activeGroup
    const name = editGroupName.trim().replace(/\s+/g, ' ')
    const description = editGroupDescription.trim().replace(/\s+/g, ' ')
    if (!db || !group || !isAdmin) return
    if (name.length < 2 || name.length > 50 || description.length > 180) {
      setMemberLookupNotice('Use a group name of 2–50 characters and a description up to 180 characters.')
      return
    }
    setBusy(true)
    setMemberLookupNotice('')
    try {
      await updateDoc(doc(db, 'groups', group.id), {
        name,
        description,
        onlyAdminsCanSend: editOnlyAdminsCanSend,
        updatedAt: serverTimestamp()
      })
      setEditInfoOpen(false)
      setMemberLookupNotice('Group information updated.')
    } catch {
      setMemberLookupNotice('Chater could not save the group information.')
    } finally {
      setBusy(false)
    }
  }

  const changeMemberRole = async (member: GroupMember) => {
    const db = firestoreDb
    const group = activeGroup
    if (!db || !group || !isOwner || member.uid === userId) return
    setMemberLookupNotice('')
    try {
      await updateDoc(doc(db, 'groups', group.id), {
        adminIds: group.adminIds.includes(member.uid) ? arrayRemove(member.uid) : arrayUnion(member.uid),
        updatedAt: serverTimestamp()
      })
    } catch {
      setMemberLookupNotice('Only the group owner can change administrator roles.')
    }
  }

  const removeMember = async (member: GroupMember) => {
    const db = firestoreDb
    const group = activeGroup
    if (!db || !group || !isOwner || member.uid === userId) return
    setMemberLookupNotice('')
    try {
      await updateDoc(doc(db, 'groups', group.id), {
        memberIds: arrayRemove(member.uid),
        adminIds: arrayRemove(member.uid),
        updatedAt: serverTimestamp()
      })
    } catch {
      setMemberLookupNotice('Chater could not remove that member. Check your group permissions.')
    }
  }

  const leaveGroup = async () => {
    const db = firestoreDb
    const group = activeGroup
    if (!db || !group || isOwner) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'groups', group.id), {
        memberIds: arrayRemove(userId),
        adminIds: arrayRemove(userId),
        updatedAt: serverTimestamp()
      })
      setActiveGroup(null)
      setDetailsOpen(false)
      setNotice('You have left the group.')
    } catch {
      setNotice('Chater could not remove you from this group. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const deleteGroup = async () => {
    const db = firestoreDb
    const group = activeGroup
    if (!db || !group || !isOwner) return
    setBusy(true)
    setNotice('')
    try {
      const messagesRef = collection(db, 'groups', group.id, 'messages')
      while (true) {
        const page = await getDocs(firestoreQuery(messagesRef, limit(400)))
        if (page.empty) break
        const batch = writeBatch(db)
        page.docs.forEach(item => batch.delete(item.ref))
        await batch.commit()
      }
      await deleteDoc(doc(db, 'groups', group.id))
      setActiveGroup(null)
      setDeleteConfirmOpen(false)
      setDetailsOpen(false)
      setNotice('The group and its messages have been deleted.')
    } catch {
      setNotice('Chater could not delete every group message. The group has been kept so you can retry.')
    } finally {
      setBusy(false)
    }
  }

  if (!firestoreDb || !userId) {
    return <div className="empty-state feature-empty"><Users size={38}/><h1>Groups</h1><p>Sign in with a verified Chater account to create and join group conversations.</p></div>
  }

  if (activeGroup) {
    return <section className="groups-area group-chat-area">
      <header className="group-chat-toolbar">
        <button type="button" className="icon-button" aria-label="Back to groups" onClick={() => { setActiveGroup(null); setDetailsOpen(false); setNotice('') }}><ArrowLeft size={21}/></button>
        <button type="button" className="group-chat-heading" onClick={() => setDetailsOpen(open => !open)} aria-expanded={detailsOpen}>
          <span className="group-avatar">{activeGroup.name.slice(0, 1).toUpperCase()}</span>
          <span><strong>{activeGroup.name}</strong><small>{activeGroup.memberIds.length} members · tap for group info</small></span>
        </button>
        <button type="button" className="icon-button" aria-label={messageSearchOpen ? 'Close group message search' : 'Search group messages'} onClick={() => { setMessageSearchOpen(open => !open); setMessageSearch('') }}><Search size={19}/></button>
        <div className="group-menu-anchor">
          <button type="button" className="icon-button" aria-label="Group chat options" aria-haspopup="menu" aria-expanded={groupMenuOpen} onClick={() => setGroupMenuOpen(open => !open)}><MoreVertical size={21}/></button>
          {groupMenuOpen && <div className="group-chat-dropdown" role="menu" aria-label="Group chat options">
            <button type="button" role="menuitem" onClick={() => { setDetailsOpen(true); setGroupMenuOpen(false) }}><Users size={17}/>Group info</button>
            <button type="button" role="menuitem" onClick={() => { setMessageSearchOpen(true); setMessageSearch(''); setGroupMenuOpen(false) }}><Search size={17}/>Search</button>
            <button type="button" role="menuitem" onClick={() => { setGroupTheme(current => current === 'default' ? 'midnight' : current === 'midnight' ? 'forest' : 'default'); setGroupMenuOpen(false) }}><Palette size={17}/>Change chat theme</button>
            <button type="button" role="menuitem" onClick={() => { setNotice('Media, links and documents shared in this group will appear here when group attachments are enabled.'); setGroupMenuOpen(false) }}><FileText size={17}/>Media, links and docs</button>
            <button type="button" role="menuitem" onClick={exportGroupChat}><Download size={17}/>Export chat</button>
          </div>}
        </div>
      </header>
      {messageSearchOpen && <label className="group-message-search"><Search size={16}/><input aria-label="Search messages in this group" value={messageSearch} onChange={event => setMessageSearch(event.target.value)} placeholder="Search messages or people"/><button type="button" aria-label="Close search" onClick={() => { setMessageSearch(''); setMessageSearchOpen(false) }}><X size={16}/></button></label>}
      {detailsOpen && <section className="group-info-panel" aria-label="Group information">
        <div className="group-info-title"><strong>{activeGroup.name}</strong><span>{activeGroup.description || 'No group description yet.'}</span></div>
        {isAdmin && <button type="button" className="text-button group-edit-info-trigger" onClick={() => { setEditGroupName(activeGroup.name); setEditGroupDescription(activeGroup.description); setEditInfoOpen(open => !open) }}>{editInfoOpen ? 'Cancel edit' : 'Edit group information'}</button>}
        {editInfoOpen && <form className="group-edit-info-form" onSubmit={saveGroupInfo}>
          <label>Group name<input value={editGroupName} onChange={event => setEditGroupName(event.target.value)} minLength={2} maxLength={50} required/></label>
          <label>Description<textarea value={editGroupDescription} onChange={event => setEditGroupDescription(event.target.value)} maxLength={180} rows={2}/></label>
          <label className="group-admin-only-setting"><input type="checkbox" checked={editOnlyAdminsCanSend} onChange={event => setEditOnlyAdminsCanSend(event.target.checked)}/>Only administrators can send messages</label>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save group information'}</button>
        </form>}
        <div className="group-info-heading"><strong>Members ({members.length || activeGroup.memberIds.length})</strong>{isOwner && <span>Group owner</span>}</div>
        <input aria-label="Search group members" className="group-member-search" value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="Search members by name or username"/>
        <div className="group-member-list">
          {activeGroup.memberIds.filter(uid => {
            const profile = members.find(item => item.uid === uid)
            const term = memberSearch.trim().toLowerCase()
            return !term || formatMemberName(profile, uid).toLowerCase().includes(term) || profile?.username.toLowerCase().includes(term)
          }).map(uid => {
            const profile = members.find(item => item.uid === uid)
            const memberIsAdmin = activeGroup.adminIds.includes(uid)
            return <div className="group-member-row" key={uid}>
              <span className="group-member-avatar">{formatMemberName(profile, uid).slice(0, 1).toUpperCase()}</span>
              <span className="group-member-name"><strong>{formatMemberName(profile, uid)}</strong><small>{uid === activeGroup.ownerId ? 'Owner' : memberIsAdmin ? 'Administrator' : 'Member'}</small></span>
              {isOwner && uid !== userId && <div className="group-member-actions">
                <button type="button" className="text-button" onClick={() => void changeMemberRole(profile || { uid, username: '', displayName: 'Member', photoURL: '' })}>{memberIsAdmin ? 'Demote' : 'Make admin'}</button>
                <button type="button" className="text-button danger-text" onClick={() => void removeMember(profile || { uid, username: '', displayName: 'Member', photoURL: '' })}>Remove</button>
              </div>}
            </div>
          })}
        </div>
        {isAdmin && <div className="group-add-member">
          <label htmlFor="group-add-username">Add a Chater member by username</label>
          <div><input id="group-add-username" value={memberUsername} onChange={event => setMemberUsername(event.target.value)} placeholder="@username" autoCapitalize="none" autoCorrect="off"/><button type="button" className="primary-button" disabled={memberLookupBusy || !memberUsername.trim()} onClick={() => void addMemberToGroup()}>{memberLookupBusy ? 'Adding…' : 'Add'}</button></div>
        </div>}
        {memberLookupNotice && <p className="group-inline-notice" role="status">{memberLookupNotice}</p>}
        <div className="group-admin-actions">
          {!isOwner && <button type="button" className="secondary-button" disabled={busy} onClick={() => void leaveGroup()}>Leave group</button>}
          {isOwner && <button type="button" className="secondary-button danger-button" onClick={() => setDeleteConfirmOpen(true)}><Trash2 size={16}/>Delete group</button>}
        </div>
        {deleteConfirmOpen && <div className="group-delete-confirm" role="group" aria-label="Confirm group deletion">
          <strong>Delete this group?</strong><p>This permanently removes the group and its Chater group messages for every member.</p>
          <div><button type="button" className="secondary-button" disabled={busy} onClick={() => setDeleteConfirmOpen(false)}>Cancel</button><button type="button" className="primary-button danger-button" disabled={busy} onClick={() => void deleteGroup()}>{busy ? 'Deleting…' : 'Delete group'}</button></div>
        </div>}
      </section>}
      <div className={'group-message-list group-theme-' + groupTheme} role="log" aria-label={activeGroup.name + ' messages'} aria-live="polite">
        {messages.some(message => message.pinned) && <button type="button" className="group-pinned-banner" onClick={() => { const pinned = messages.find(message => message.pinned); if (pinned) document.getElementById('group-message-' + pinned.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}><Pin size={15}/><span>{messages.find(message => message.pinned)?.text || 'Pinned message'}</span></button>}
        {messages.length === 0 ? <div className="group-empty-chat"><MessageCircle size={30}/><strong>No group messages yet</strong><span>Send the first message to everyone in this group.</span></div> : filteredGroupMessages.length === 0 ? <p className="group-inline-notice" role="status">No messages match your search.</p> : filteredGroupMessages.map(message => <article
          id={'group-message-' + message.id}
          key={message.id}
          className={(message.senderId === userId ? 'group-message own-group-message' : 'group-message') + (message.kind === 'announcement' ? ' group-announcement' : '') + (message.pinned ? ' group-message-pinned' : '')}
          onContextMenu={event => { event.preventDefault(); setSelectedMessageId(message.id); setEditMessageId(''); setPendingDeleteMessageId('') }}
        >
          {message.kind === 'announcement' && <span className="group-announcement-label"><ShieldCheck size={13}/>Group announcement</span>}
          {message.pinned && <span className="group-message-pin-label"><Pin size={12}/>Pinned</span>}
          {message.senderId !== userId && <strong>{message.senderName}</strong>}
          <p>{message.text}</p><time>{formatGroupTime(message.createdAt)}</time>
        </article>)}
      </div>
      {selectedMessageId && (() => {
        const selected = messages.find(message => message.id === selectedMessageId)
        if (!selected) return null
        return <div className="group-message-action-sheet" role="dialog" aria-label="Message actions">
          <div className="group-message-action-sheet-head"><strong>Message options</strong><button type="button" aria-label="Close message options" onClick={() => setSelectedMessageId('')}><X size={17}/></button></div>
          {selected.senderId === userId && <button type="button" onClick={() => { setEditMessageId(selected.id); setEditMessageDraft(selected.text) }}><Pencil size={17}/>Edit message</button>}
          {isAdmin && <button type="button" onClick={() => void togglePinnedMessage(selected)}><Pin size={17}/>{selected.pinned ? 'Unpin message' : 'Pin message'}</button>}
          {(selected.senderId === userId || isAdmin) && <button type="button" className="danger-text" onClick={() => setPendingDeleteMessageId(selected.id)}><Trash2 size={17}/>Delete message</button>}
          {pendingDeleteMessageId === selected.id && <div className="group-message-delete-confirm"><span>Delete this message?</span><button type="button" disabled={busy} onClick={() => void deleteGroupMessage(selected.id)}>Confirm</button><button type="button" onClick={() => setPendingDeleteMessageId('')}>Cancel</button></div>}
          <button type="button" onClick={() => setSelectedMessageId('')}>Close</button>
        </div>
      })()}
      {editMessageId && <form className="group-message-edit-sheet" onSubmit={event => { event.preventDefault(); void editGroupMessage() }}>
        <label>Edit message<textarea autoFocus rows={3} maxLength={4000} value={editMessageDraft} onChange={event => setEditMessageDraft(event.target.value)}/></label>
        <div><button type="button" className="secondary-button" onClick={() => { setEditMessageId(''); setEditMessageDraft('') }}>Cancel</button><button type="submit" className="primary-button" disabled={busy || !editMessageDraft.trim()}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>}
      {notice && <p className="group-notice" role="status">{notice}</p>}
      {activeGroup.onlyAdminsCanSend && !isAdmin && <p className="group-read-only-note">Only group administrators can send messages here.</p>}
      <form className="group-message-composer" onSubmit={sendGroupMessage}>
        <textarea aria-label="Group message" rows={1} maxLength={4000} value={messageDraft} onChange={event => setMessageDraft(event.target.value)} placeholder="Message the group…" disabled={busy || (activeGroup.onlyAdminsCanSend && !isAdmin)}/>
        <div className="group-message-send-actions">{isAdmin && <label><input type="checkbox" checked={announcementMode} onChange={event => setAnnouncementMode(event.target.checked)}/>Announcement</label>}<button type="submit" aria-label="Send group message" disabled={busy || !messageDraft.trim() || (activeGroup.onlyAdminsCanSend && !isAdmin)}><Send size={19}/></button></div>
      </form>
    </section>
  }

  return <section className="groups-area">
    <div className="groups-heading-row"><div><p className="eyebrow">YOUR PEOPLE, TOGETHER</p><h1>Groups</h1><p>Create a shared space for conversations with friends and teams.</p></div><button type="button" className="primary-button group-create-trigger" onClick={() => { setCreateOpen(true); setNotice('') }}><Plus size={17}/>Create group</button></div>
    <label className="group-search"><Users size={18}/><input value={groupSearch} onChange={event => setGroupSearch(event.target.value)} placeholder="Search your groups"/></label>
    {notice && <p className="group-notice" role="status">{notice}</p>}
    {groupsBusy ? <p className="group-loading" role="status">Loading your groups…</p> : visibleGroups.length === 0 ? <div className="group-empty-state"><span><Users size={28}/></span><strong>{groups.length ? 'No matching groups' : 'Your group chats start here'}</strong><p>{groups.length ? 'Try another group name.' : 'Create a group, add members by username, and start a conversation together.'}</p><button type="button" className="secondary-button" onClick={() => setCreateOpen(true)}><Plus size={16}/>Create your first group</button></div> : <div className="group-list">{visibleGroups.map(group => <button type="button" className="group-list-item" key={group.id} onClick={() => { setActiveGroup(group); setNotice('') }}>
      <span className="group-list-avatar">{group.name.slice(0, 1).toUpperCase()}</span>
      <span className="group-list-copy"><strong>{group.name}</strong><small>{group.lastMessageText || group.description || (group.memberIds.length + ' members')}</small></span>
      <span className="group-list-meta"><small>{formatGroupTime(group.lastMessageAt)}</small><ChevronRight size={17}/></span>
    </button>)}</div>}
    {createOpen && <div className="group-create-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) resetCreate() }}>
      <form className="group-create-panel" role="dialog" aria-modal="true" aria-labelledby="group-create-title" onSubmit={createGroup}>
        <header><div><p className="eyebrow">CHATER GROUPS</p><h2 id="group-create-title">Create a group</h2></div><button type="button" className="icon-button" aria-label="Close group creation" onClick={resetCreate}><X size={20}/></button></header>
        <label>Group name<input value={groupName} onChange={event => setGroupName(event.target.value)} minLength={2} maxLength={50} required placeholder="e.g. Weekend plans"/></label>
        <label>Description (optional)<textarea value={groupDescription} onChange={event => setGroupDescription(event.target.value)} maxLength={180} rows={2} placeholder="What is this group for?"/></label>
        <label>Add members by username<input value={createUsername} onChange={event => setCreateUsername(event.target.value)} placeholder="@username" autoCapitalize="none" autoCorrect="off"/></label>
        <button type="button" className="secondary-button group-add-selected" disabled={!createUsername.trim() || memberLookupBusy} onClick={() => void addMemberToSelection()}>{memberLookupBusy ? 'Looking up member…' : 'Add member'}</button>
        {selectedMembers.length > 0 && <div className="group-selected-members"><strong>Members to add ({selectedMembers.length})</strong>{selectedMembers.map(member => <div key={member.uid}><span>{member.displayName} <small>@{member.username}</small></span><button type="button" aria-label={'Remove ' + member.displayName} onClick={() => setSelectedMembers(current => current.filter(item => item.uid !== member.uid))}><X size={16}/></button></div>)}</div>}
        {memberLookupNotice && <p className="group-inline-notice" role="alert">{memberLookupNotice}</p>}
        <p className="group-create-footnote">You will be the group owner and first administrator. Groups can contain up to 200 members.</p>
        <button type="submit" className="primary-button" disabled={busy || memberLookupBusy || selectedMembers.length === 0}>{busy ? 'Creating group…' : 'Create group'} <Check size={16}/></button>
      </form>
    </div>}
  </section>
}
