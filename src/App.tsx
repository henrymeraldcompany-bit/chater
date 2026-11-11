import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential, reload, sendEmailVerification, updatePassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile, type User } from 'firebase/auth'
import { firebaseApp, firestoreDb } from './lib/firebase'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query as firestoreQuery, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { MessageCircle, CirclePlay, Users, Phone, PhoneCall, CalendarDays, Heart, Camera, UserRound, Search, Plus, MoreHorizontal, ChevronRight, Pencil, Settings, ShieldCheck, HelpCircle, Bell, X, ArrowUpRight, Type, Music2, LayoutGrid, Mic, ImagePlus, Video, Check, ArrowLeft, type LucideIcon } from 'lucide-react'

type Tab = 'Chats' | 'Moments' | 'Groups' | 'Calls' | 'You'
type Filter = 'All' | 'Unread' | 'Favorites' | 'Groups'
type ProfileDetails = { about: string; location: string; occupation: string }
type MomentEntry = { id: string; uid: string; displayName: string; mediaUrl: string; mediaType: 'image' | 'video' | 'audio'; caption: string; createdAt: number; expiresAt: number }
type MomentGroup = { uid: string; displayName: string; photoURL: string; previewURL: string; moments: MomentEntry[] }
type ScheduledCall = { id: string; phone: string; at: string }
type UsernameSearchResult = { uid: string; username: string; displayName: string; photoURL: string }
async function syncLegacyUsername(uid: string, rawUsername: string, rawDisplayName = ''): Promise<void> {
  const db = firestoreDb
  if (!db) return
  const normalized = rawUsername.trim().replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) return
  await runTransaction(db, async transaction => {
    const usernameRef = doc(db, 'usernames', normalized)
    const profileRef = doc(db, 'users', uid)
    const usernameSnapshot = await transaction.get(usernameRef)
    // Never claim a username that is already reserved by another account.
    if (usernameSnapshot.exists() && usernameSnapshot.data()?.uid !== uid) return
    if (!usernameSnapshot.exists()) {
      transaction.set(usernameRef, { uid, username: normalized, createdAt: serverTimestamp() })
    }
    transaction.set(profileRef, { uid, username: normalized, usernameLower: normalized, ...(rawDisplayName.trim() ? { displayName: rawDisplayName.trim(), displayNameLower: rawDisplayName.trim().toLowerCase() } : {}), updatedAt: serverTimestamp() }, { merge: true })
  })
}
const emptyProfileDetails: ProfileDetails = { about: '', location: '', occupation: '' }
const tabs: { label: Tab; icon: typeof MessageCircle }[] = [
  { label: 'Chats', icon: MessageCircle }, { label: 'Moments', icon: CirclePlay },
  { label: 'Groups', icon: Users }, { label: 'Calls', icon: Phone }, { label: 'You', icon: UserRound }
]
const filters: Filter[] = ['All', 'Unread', 'Favorites', 'Groups']
const accentPresets = [
  { name: 'Cyan', value: '#00fdff8b' },
  { name: 'Ocean blue', value: '#3b82f6' },
  { name: 'Violet', value: '#a78bfa' },
  { name: 'Pink', value: '#f472b6' },
  { name: 'Rose', value: '#fb7185' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Gold', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Lime', value: '#a3e635' }
]
const ACCENT_STORAGE_KEY = 'chater:preferences:accent'
const DEFAULT_ACCENT = '#00fdff8b'
const isValidHexAccent = (value: string): boolean => /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value)
function readSavedAccent(userId?: string | null): string {
  try {
    const storageKey = userId ? `${ACCENT_STORAGE_KEY}:${userId}` : ACCENT_STORAGE_KEY
    const migrationKey = `${storageKey}:migration-v1`
    const saved = window.localStorage.getItem(storageKey)
    const normalized = saved && isValidHexAccent(saved) ? saved.toLowerCase() : ''
    const migrationDone = window.localStorage.getItem(migrationKey) === 'done'
    if (!migrationDone) {
      window.localStorage.setItem(migrationKey, 'done')
      // Only migrate the legacy Gold value once. A user who chooses Gold afterwards
      // keeps that choice across launches.
      if (normalized === '#eab308') return DEFAULT_ACCENT
    }
    return normalized || DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}
const BUBBLE_STORAGE_KEY = 'chater:preferences:bubble-style'
type BubbleStyle = 'rounded' | 'soft' | 'square'
const bubbleStyles: { id: BubbleStyle; name: string }[] = [
  { id: 'rounded', name: 'Rounded' }, { id: 'soft', name: 'Soft' }, { id: 'square', name: 'Square' }
]
function readSavedBubbleStyle(): BubbleStyle {
  try {
    const saved = window.localStorage.getItem(BUBBLE_STORAGE_KEY)
    return bubbleStyles.some(item => item.id === saved) ? saved as BubbleStyle : 'rounded'
  } catch { return 'rounded' }
}
const WALLPAPER_STORAGE_KEY = 'chater:preferences:wallpaper'
type Wallpaper = 'default' | 'midnight' | 'ocean' | 'aurora' | 'sand' | 'rose'
const wallpapers: { id: Wallpaper; name: string }[] = [
  { id: 'default', name: 'Default' }, { id: 'midnight', name: 'Midnight' },
  { id: 'ocean', name: 'Ocean' }, { id: 'aurora', name: 'Aurora' },
  { id: 'sand', name: 'Sand' }, { id: 'rose', name: 'Rose' }
]
function readSavedWallpaper(): Wallpaper {
  try {
    const saved = window.localStorage.getItem(WALLPAPER_STORAGE_KEY)
    return wallpapers.some(item => item.id === saved) ? saved as Wallpaper : 'default'
  } catch { return 'default' }
}
const THEME_STORAGE_KEY = 'chater:preferences:theme'
type ThemePreference = 'dark' | 'light' | 'system'
function readSavedTheme(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    return saved === 'light' || saved === 'system' || saved === 'dark' ? saved : 'dark'
  } catch { return 'dark' }
}
function BrandLogo({ className }: { className: string }) {
  return <img className={className} src={`${import.meta.env.BASE_URL}icons/chater.svg`} alt="Chater logo" />
}

function SplashScreen() {
  return <div className="splash-screen" aria-label="Chater from GOZIE"><div className="splash-brand"><BrandLogo className="brand-logo" /><span>Chater</span></div><p>from <strong>GOZIE</strong></p></div>
}
function EmptyIllustration({ icon: Icon }: { icon: LucideIcon }) {
  return <div className="empty-art"><div className="empty-orbit orbit-one"/><div className="empty-orbit orbit-two"/><div className="empty-icon"><Icon size={34} strokeWidth={1.5}/></div><span className="sparkle sparkle-a">✦</span><span className="sparkle sparkle-b">✧</span></div>
}

const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'amzak6nf'
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'chater_profiles'
const CHATER_ACCOUNT_DELETION_URL = 'https://chater-account-deletion.henrymeraldcompany.workers.dev'
function ProfileAvatar({ photoURL, displayName, className = '' }: { photoURL?: string | null; displayName?: string | null; className?: string }) {
  const initial = displayName?.trim().charAt(0).toUpperCase()
  return <span className={`profile-avatar ${className}`} aria-label={displayName ? `${displayName} profile picture` : 'Default profile picture'}>
    {photoURL ? <img src={photoURL} alt="" /> : initial || <UserRound size={20} />}
  </span>
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('Chats')
  const [slideDirection, setSlideDirection] = useState<'forward' | 'backward'>('forward')
  const [filter, setFilter] = useState<Filter>('All')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<'new-chat' | 'search' | 'settings' | 'register' | 'login' | 'recover' | 'moment' | 'call' | 'schedule' | null>(null)
  const [moments, setMoments] = useState<MomentEntry[]>([])
  const [momentViewerIndex, setMomentViewerIndex] = useState<number | null>(null)
  const [momentBusy, setMomentBusy] = useState(false)
  const [momentNotice, setMomentNotice] = useState('')
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCall[]>(() => {
    try { const saved = JSON.parse(window.localStorage.getItem('chater:scheduled-calls') || '[]'); return Array.isArray(saved) ? saved : [] } catch { return [] }
  })
  const touchStartRef = useRef<{ x: number; y: number; target: HTMLElement } | null>(null)
  const [accountPanel, setAccountPanel] = useState<'closed' | 'choices' | 'signout' | 'delete'>('closed')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountNotice, setAccountNotice] = useState('')
  const [securityPanel, setSecurityPanel] = useState(false)
  const [securityCurrentPassword, setSecurityCurrentPassword] = useState('')
  const [securityNewPassword, setSecurityNewPassword] = useState('')
  const [securityConfirmPassword, setSecurityConfirmPassword] = useState('')
  const [securityBusy, setSecurityBusy] = useState(false)
  const [securityNotice, setSecurityNotice] = useState('')
  const [securityNoticeType, setSecurityNoticeType] = useState<'success' | 'error'>('success')
  const [securityVerificationBusy, setSecurityVerificationBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [searchNotice, setSearchNotice] = useState('')
  const [usernameSearchBusy, setUsernameSearchBusy] = useState(false)
  const [usernameSearchResults, setUsernameSearchResults] = useState<UsernameSearchResult[]>([])
  const [showAllPeopleResults, setShowAllPeopleResults] = useState(false)
  const usernameSearchRequest = useRef(0)
  const [registrationName, setRegistrationName] = useState('')
  const [registrationEmail, setRegistrationEmail] = useState('')
  const [registrationUsername, setRegistrationUsername] = useState('')
  const [registrationPassword, setRegistrationPassword] = useState('')
  const [registrationConfirm, setRegistrationConfirm] = useState('')
  const [registrationNotice, setRegistrationNotice] = useState('')
  const [registrationBusy, setRegistrationBusy] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginNotice, setLoginNotice] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [verificationResendBusy, setVerificationResendBusy] = useState(false)
  const [passwordRecoveryBusy, setPasswordRecoveryBusy] = useState(false)
  const [passwordRecoveryNotice, setPasswordRecoveryNotice] = useState('')
  const registrationInProgress = useRef(false)
  const loginInProgress = useRef(false)
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('')
  const [profileUsername, setProfileUsername] = useState('')
  const [profileDetails, setProfileDetails] = useState<ProfileDetails>(emptyProfileDetails)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoNotice, setPhotoNotice] = useState('')
  const [accent, setAccent] = useState(readSavedAccent)
  const [customHex, setCustomHex] = useState(readSavedAccent)
  const [customHexNotice, setCustomHexNotice] = useState('')
  const normalizedCustomHex = /^#?[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(customHex.trim()) ? (customHex.trim().startsWith('#') ? customHex.trim() : `#${customHex.trim()}`) : ''
  const [theme, setTheme] = useState<ThemePreference>(readSavedTheme)
  const [wallpaper, setWallpaper] = useState<Wallpaper>(readSavedWallpaper)
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>(readSavedBubbleStyle)
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-bright', accent)
    document.documentElement.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 13%, transparent)`)
  }, [accent])
  useEffect(() => {
    try {
      const storageKey = authUser?.uid ? `${ACCENT_STORAGE_KEY}:${authUser.uid}` : ACCENT_STORAGE_KEY
      window.localStorage.setItem(storageKey, accent)
    } catch { /* Accent remains active for this session. */ }
  }, [accent, authUser?.uid])
  useEffect(() => {
    const root = document.documentElement
    let media: MediaQueryList | undefined
    const applyTheme = () => {
      const resolved = theme === 'system' ? (media?.matches ? 'dark' : 'light') : theme
      const themeColor = resolved === 'dark' ? '#0B1014' : '#f5f6f8'
      root.dataset.theme = resolved
      root.dataset.themePreference = theme
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', themeColor)
    }
    try { media = window.matchMedia?.('(prefers-color-scheme: dark)') } catch { media = undefined }
    applyTheme()
    media?.addEventListener?.('change', applyTheme)
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* Theme remains active for this session. */ }
    return () => media?.removeEventListener?.('change', applyTheme)
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.bubbleStyle = bubbleStyle
    try { window.localStorage.setItem(BUBBLE_STORAGE_KEY, bubbleStyle) } catch { /* Bubble style remains active for this session. */ }
  }, [bubbleStyle])
  useEffect(() => {
    document.documentElement.dataset.wallpaper = wallpaper
    try { window.localStorage.setItem(WALLPAPER_STORAGE_KEY, wallpaper) } catch { /* Wallpaper remains active for this session. */ }
  }, [wallpaper])
  useEffect(() => { const timer = window.setTimeout(() => setShowSplash(false), 600); return () => window.clearTimeout(timer) }, [])
  useEffect(() => {
    if (!firebaseAuth) return
    return onAuthStateChanged(firebaseAuth, async user => {
      if (registrationInProgress.current || loginInProgress.current) return
      if (!user) {
        setAuthUser(null)
        const savedAccent = readSavedAccent()
        setAccent(savedAccent)
        setCustomHex(savedAccent)
        setProfilePhotoUrl('')
        setProfileUsername('')
        setProfileDetails(emptyProfileDetails)
        return
      }
      try {
        await reload(user)
        if (!user.emailVerified) {
          setAuthUser(null)
          setProfilePhotoUrl('')
          setProfileDetails(emptyProfileDetails)
          await signOut(firebaseAuth)
          return
        }
        setAuthUser(user)
        const savedAccent = readSavedAccent(user.uid)
        setAccent(savedAccent)
        setCustomHex(savedAccent)
        setProfilePhotoUrl(user.photoURL || '')
        const profileSnapshot = firestoreDb ? await getDoc(doc(firestoreDb, 'users', user.uid)) : null
        const storedProfile = profileSnapshot?.data() || {}
        if (user.photoURL && storedProfile.photoURL !== user.photoURL && firestoreDb) {
          void setDoc(doc(firestoreDb, 'users', user.uid), {
            uid: user.uid,
            photoURL: user.photoURL,
            updatedAt: serverTimestamp()
          }, { merge: true }).catch(() => undefined)
        }
        const storedUsername = storedProfile.username
        setProfileDetails({
          about: typeof storedProfile.about === 'string' ? storedProfile.about : '',
          location: typeof storedProfile.location === 'string' ? storedProfile.location : '',
          occupation: typeof storedProfile.occupation === 'string' ? storedProfile.occupation : ''
        })
        const localUsername = window.localStorage.getItem(`chater:profile:username:${user.uid}`) || ''
        const resolvedUsername = typeof storedUsername === 'string' ? storedUsername : localUsername
        if (resolvedUsername) void syncLegacyUsername(user.uid, resolvedUsername, typeof storedProfile.displayName === 'string' ? storedProfile.displayName : (user.displayName || '')).catch(() => undefined)
        setProfileUsername(resolvedUsername)
        if (resolvedUsername) window.localStorage.setItem(`chater:profile:username:${user.uid}`, resolvedUsername)
      } catch {
        // Keep the authenticated session if only the Firestore profile lookup is denied.
        setAuthUser(user)
        const savedAccent = readSavedAccent(user.uid)
        setAccent(savedAccent)
        setCustomHex(savedAccent)
        setProfilePhotoUrl(user.photoURL || '')
        setProfileDetails(emptyProfileDetails)
        const localUsername = window.localStorage.getItem(`chater:profile:username:${user.uid}`) || ''
        setProfileUsername(localUsername)
      }
    })
  }, [])
  useEffect(() => {
    if (!authUser || !firestoreDb) { setMoments([]); return }
    let active = true
    getDocs(collection(firestoreDb, 'moments')).then(snapshot => {
      const now = Date.now()
      const entries = snapshot.docs.map(item => {
        const data = item.data()
        const expiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : 0
        const savedAt = data.createdAt && typeof data.createdAt.toMillis === 'function'
          ? data.createdAt.toMillis()
          : typeof data.createdAt === 'number' ? data.createdAt : 0
        return {
          id: item.id,
          uid: typeof data.uid === 'string' ? data.uid : '',
          displayName: typeof data.displayName === 'string' ? data.displayName : 'Chater member',
          mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : '',
          mediaType: data.mediaType === 'audio' ? 'audio' as const : data.mediaType === 'video' ? 'video' as const : 'image' as const,
          caption: typeof data.caption === 'string' ? data.caption : '',
          createdAt: savedAt || (expiresAt ? expiresAt - 86400000 : 0),
          expiresAt
        }
      }).filter(item => item.mediaUrl && item.expiresAt > now).sort((left, right) => right.createdAt - left.createdAt)
      if (active) setMoments(entries)
    }).catch(() => { if (active) setMoments([]) })
    return () => { active = false }
  }, [authUser])


  const handleShareMoment = async (file: File, caption: string) => {
    if (!authUser || !firestoreDb) {
      setMomentNotice('Sign in to publish a Moment. Your selected file has not been uploaded.')
      return
    }
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const isAudio = file.type.startsWith('audio/')
    if (!isImage && !isVideo && !isAudio) { setMomentNotice('Choose an image, video or audio file.'); return }
    setMomentBusy(true)
    setMomentNotice('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10 * 60 * 1000)
    let stage: 'Cloudinary upload' | 'Firestore save' = 'Cloudinary upload'
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
      formData.append('folder', 'chater/moments/' + authUser.uid)
      const response = await fetch(
        'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/' + (isVideo || isAudio ? 'video' : 'image') + '/upload',
        { method: 'POST', body: formData, signal: controller.signal }
      )
      const uploaded = await response.json().catch(() => ({})) as { secure_url?: string; error?: { message?: string } }
      if (!response.ok || !uploaded.secure_url) throw new Error(uploaded.error?.message || 'The Moment could not be uploaded. Please try again.')
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000
      const mediaType: MomentEntry['mediaType'] = isAudio ? 'audio' : isVideo ? 'video' : 'image'
      const data = {
        uid: authUser.uid,
        displayName: authUser.displayName || 'Chater member',
        mediaUrl: uploaded.secure_url,
        mediaType,
        caption: caption.trim().slice(0, 180),
        createdAt: serverTimestamp(),
        expiresAt
      }
      stage = 'Firestore save'
      const saved = await addDoc(collection(firestoreDb, 'moments'), data)
      setMoments(current => [{ id: saved.id, ...data, createdAt: Date.now() }, ...current])
      setDialog(null)
      setMomentNotice('')
    } catch (error) {
      const errorCode = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : ''
      const detail = error instanceof Error ? error.message : 'Please try again.'
      setMomentNotice(error instanceof Error && error.name === 'AbortError'
        ? 'The upload took too long. Check your connection and try again.'
        : stage === 'Firestore save'
          ? `Cloudinary upload succeeded, but Firestore could not save the Moment${errorCode ? ` (${errorCode})` : ''}: ${detail}`
          : detail)
    } finally {
      window.clearTimeout(timeout)
      setMomentBusy(false)
    }
  }

  const handleScheduleCall = (phone: string, at: string) => {
    const next: ScheduledCall[] = [{ id: String(Date.now()), phone, at }, ...scheduledCalls]
    setScheduledCalls(next)
    try { window.localStorage.setItem('chater:scheduled-calls', JSON.stringify(next)) } catch { /* The schedule remains in the current session. */ }
    setDialog(null)
  }

  const uploadPhotoForUser = async (user: User, file: File) => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      throw new Error('Profile picture uploads are not configured yet. Please try again later.')
    }
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
    if (file.size > 5 * 1024 * 1024) throw new Error('Your profile picture must be 5 MB or smaller.')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
    formData.append('folder', `chater/profiles/${user.uid}`)

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 45000)
    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData, signal: controller.signal }
      )
      const result = await response.json().catch(() => ({})) as {
        secure_url?: string
        error?: { message?: string }
      }
      if (!response.ok || !result.secure_url) {
        throw new Error(result.error?.message || 'Cloudinary could not upload this picture. Please try again.')
      }
      const photoURL = result.secure_url
      await updateProfile(user, { photoURL })
      if (firestoreDb) {
        await setDoc(doc(firestoreDb, 'users', user.uid), {
          uid: user.uid,
          photoURL,
          updatedAt: serverTimestamp()
        }, { merge: true })
      }
      setProfilePhotoUrl(photoURL)
      return photoURL
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('The upload took too long. Check your connection and try again.')
      }
      throw error
    } finally {
      window.clearTimeout(timeout)
    }
  }
  const handleUsernameChange = async (nextUsername: string) => {
    if (!authUser || !firestoreDb) throw new Error('Sign in and connect to Chater to change your username.')
    const normalized = nextUsername.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
      throw new Error('Username must be 3–20 characters using lowercase letters, numbers or underscores.')
    }
    if (normalized === profileUsername) return
    const oldUsername = profileUsername
    const oldRef = oldUsername ? doc(firestoreDb, 'usernames', oldUsername) : null
    const newRef = doc(firestoreDb, 'usernames', normalized)
    const userRef = doc(firestoreDb, 'users', authUser.uid)
    await runTransaction(firestoreDb, async transaction => {
      const newSnapshot = await transaction.get(newRef)
      const oldSnapshot = oldRef ? await transaction.get(oldRef) : null
      if (newSnapshot.exists()) {
        throw Object.assign(new Error('That username is already taken. Choose another username.'), { code: 'chater/username-taken' })
      }
      if (oldSnapshot?.exists() && oldSnapshot.data()?.uid !== authUser.uid) {
        throw new Error('Your current username is not owned by this account. Contact support before changing it.')
      }
      transaction.set(newRef, { uid: authUser.uid, username: normalized, createdAt: serverTimestamp() })
      if (oldRef && oldSnapshot?.exists()) transaction.delete(oldRef)
      transaction.set(userRef, { uid: authUser.uid, username: normalized, usernameLower: normalized, updatedAt: serverTimestamp() }, { merge: true })
    })
    setProfileUsername(normalized)
    try { window.localStorage.setItem(`chater:profile:username:${authUser.uid}`, normalized) } catch { /* Firestore remains the source of truth. */ }
  }
  const handleUsernameSearch = useCallback(async (rawInput: string) => {
    const normalized = rawInput.trim().replace(/^@/, '').toLowerCase().replace(/\s+/g, ' ')
    const requestId = ++usernameSearchRequest.current
    setSearchNotice('')
    setUsernameSearchResults([])
    if (!normalized.length) {
      setUsernameSearchBusy(false)
      return
    }
    if (!authUser || !firestoreDb) {
      setSearchNotice('Sign in with a verified Chater account to find people.')
      return
    }
    setUsernameSearchBusy(true)
    try {
      // Read the public member directory, then perform substring matching locally.
      // This supports matches anywhere in a name or username, including from the
      // very first typed character; prefix-only Firestore ranges cannot do that.
      const snapshot = await getDocs(collection(firestoreDb, 'users'))
      if (requestId !== usernameSearchRequest.current) return
      const unique = new Map<string, UsernameSearchResult>()
      for (const member of snapshot.docs) {
        const profile = member.data() as Record<string, unknown>
        const uid = typeof profile.uid === 'string' ? profile.uid : member.id
        const savedUsername = typeof profile.username === 'string' ? profile.username.trim().toLowerCase() : ''
        const displayName = typeof profile.displayName === 'string' && profile.displayName.trim() ? profile.displayName.trim() : savedUsername
        const searchableName = displayName.toLowerCase()
        if (!uid || uid === authUser.uid || !savedUsername) continue
        if (!searchableName.includes(normalized) && !savedUsername.includes(normalized)) continue
        unique.set(uid, {
          uid,
          username: savedUsername,
          displayName: displayName || savedUsername,
          photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : ''
        })
      }
      const results = [...unique.values()].sort((a, b) => {
        const aStarts = a.displayName.toLowerCase().startsWith(normalized) || a.username.startsWith(normalized)
        const bStarts = b.displayName.toLowerCase().startsWith(normalized) || b.username.startsWith(normalized)
        return Number(bStarts) - Number(aStarts) || a.displayName.localeCompare(b.displayName)
      })
      setUsernameSearchResults(results)
      if (!results.length) setSearchNotice('No matching Chater members yet. Try another spelling.')
    } catch {
      if (requestId === usernameSearchRequest.current) {
        setUsernameSearchResults([])
        setSearchNotice('People search is temporarily unavailable. Check your connection and try again.')
      }
    } finally {
      if (requestId === usernameSearchRequest.current) setUsernameSearchBusy(false)
    }
  }, [authUser])
  useEffect(() => {
    if (dialog !== 'new-chat' && dialog !== 'search') return
    usernameSearchRequest.current += 1
    const timer = window.setTimeout(() => { void handleUsernameSearch(username) }, 180)
    return () => window.clearTimeout(timer)
  }, [username, dialog, authUser, handleUsernameSearch])
  const handleDisplayNameChange = async (nextName: string) => {
    if (!authUser) throw new Error('Sign in to edit your profile name.')
    const normalized = nextName.trim().replace(/\s+/g, ' ')
    if (normalized.length < 2 || normalized.length > 50) throw new Error('Your profile name must be 2–50 characters.')
    if (normalized === (authUser.displayName || '')) return
    await updateProfile(authUser, { displayName: normalized })
    const db = firestoreDb
    if (db) {
      await runTransaction(db, async transaction => {
        transaction.set(doc(db, 'users', authUser.uid), {
          uid: authUser.uid, ...(profileUsername ? { username: profileUsername, usernameLower: profileUsername.toLowerCase() } : {}), displayName: normalized, displayNameLower: normalized.toLowerCase(), updatedAt: serverTimestamp()
        }, { merge: true })
      })
    }
    setAuthUser({ ...authUser, displayName: normalized } as User)
  }
  const handleProfileDetailsChange = async (nextDetails: ProfileDetails) => {
    if (!authUser || !firestoreDb) throw new Error('Sign in and connect to Chater to edit your profile details.')
    const normalized: ProfileDetails = {
      about: nextDetails.about.trim().replace(/\s+/g, ' '),
      location: nextDetails.location.trim().replace(/\s+/g, ' '),
      occupation: nextDetails.occupation.trim().replace(/\s+/g, ' ')
    }
    if (normalized.about.length > 160) throw new Error('Your About description must be 160 characters or fewer.')
    if (normalized.location.length > 60) throw new Error('Location must be 60 characters or fewer.')
    if (normalized.occupation.length > 60) throw new Error('Occupation must be 60 characters or fewer.')
    const db = firestoreDb
    try {
      await setDoc(doc(db, 'users', authUser.uid), {
        uid: authUser.uid,
        ...(profileUsername ? { username: profileUsername } : {}),
        ...normalized,
        updatedAt: serverTimestamp()
      }, { merge: true })
      setProfileDetails(normalized)
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'permission-denied') {
        throw new Error("Firebase blocked this profile update. The latest Chater Firestore security rules must be published in the chater-8f834 project. Open Firebase Console → Firestore Database → Rules, publish the rules from Chater's firestore.rules file, then try again.")
      }
      throw error
    }
  }
  const handleAccountDeletion = async (password: string) => {
    if (!authUser || !firebaseAuth || !authUser.email) throw new Error('Sign in with an email account before deleting it.')
    if (!firestoreDb) throw new Error('Chater cannot connect to the account database. Try again when connected.')
    const credential = EmailAuthProvider.credential(authUser.email, password)
    await reauthenticateWithCredential(authUser, credential)
    // Delete this user's Cloudinary media first. If cleanup fails, stop here so
    // the Firestore profile and Firebase sign-in account remain available for retry.
    const idToken = await authUser.getIdToken(true)
    let cleanupResponse: Response
    try {
      cleanupResponse = await fetch(CHATER_ACCOUNT_DELETION_URL + '/delete-media', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + idToken }
      })
    } catch {
      throw new Error('Chater could not reach its secure media-cleanup service. Your account has not been deleted. Check your connection and try again.')
    }
    const cleanupResult = await cleanupResponse.json().catch(() => ({})) as { error?: string; success?: boolean }
    if (!cleanupResponse.ok || cleanupResult.success !== true) {
      throw new Error(cleanupResult.error || 'Chater could not confirm deletion of your profile pictures and Moments. Your account has not been deleted. Please try again later.')
    }
    const db = firestoreDb
    // Remove this account's Moment records while the user is still authenticated.
    // Firestore rules only allow an owner to delete their own Moment documents.
    const momentsSnapshot = await getDocs(firestoreQuery(collection(db, 'moments'), where('uid', '==', authUser.uid)))
    const ownedMoments = momentsSnapshot.docs
    await Promise.all(ownedMoments.map(moment => deleteDoc(doc(db, 'moments', moment.id))))
    const usernameRef = profileUsername ? doc(db, 'usernames', profileUsername) : null
    const profileRef = doc(db, 'users', authUser.uid)
    await runTransaction(db, async transaction => {
      if (usernameRef) {
        const usernameSnapshot = await transaction.get(usernameRef)
        if (usernameSnapshot.exists() && usernameSnapshot.data()?.uid === authUser.uid) transaction.delete(usernameRef)
      }
      transaction.delete(profileRef)
    })
    try {
      await deleteUser(authUser)
    } catch {
      throw new Error('Your profile records were removed, but Firebase could not finish deleting the sign-in account. Sign in again and contact support to complete deletion.')
    }
    try {
      window.localStorage.removeItem(`chater:profile:username:${authUser.uid}`)
      window.localStorage.removeItem(`${ACCENT_STORAGE_KEY}:${authUser.uid}`)
    } catch { /* Account deletion remains complete even if local cleanup is unavailable. */ }
    setAuthUser(null)
    const savedAccent = readSavedAccent()
    setAccent(savedAccent)
    setCustomHex(savedAccent)
    setProfilePhotoUrl('')
    setProfileUsername('')
    setProfileDetails(emptyProfileDetails)
    setPhotoNotice('')
    setActiveTab('Chats')
  }
  const handleProfilePhotoUpload = async (file: File) => {
    if (!authUser) { setPhotoNotice('Create an account first to save your profile picture.'); return }
    setPhotoBusy(true)
    setPhotoNotice('')
    try {
      await uploadPhotoForUser(authUser, file)
    } catch (error) {
      setPhotoNotice(error instanceof Error ? error.message : 'The picture could not be uploaded. Please try again.')
    } finally { setPhotoBusy(false) }
  }
  const pageCopy = useMemo(() => ({
    Moments: { eyebrow: 'LIFE IN MOMENTS', title: 'Moments', description: 'Share a little piece of your day. Moments disappear after 24 hours.', action: 'Share a Moment', icon: CirclePlay },
    Groups: { eyebrow: 'YOUR PEOPLE, TOGETHER', title: 'Groups', description: 'Create group chats, bring people together, and share with everyone in the group.', action: 'Create a group', icon: Users },
    Calls: { eyebrow: 'CLOSER, WHEREVER YOU ARE', title: 'Calls', description: 'Your voice and video call history will appear here.', action: 'Start a call', icon: Phone }
  }), [])
  const momentGroups = useMemo<MomentGroup[]>(() => {
    const byOwner = new Map<string, MomentEntry[]>()
    moments.forEach(moment => {
      const ownerMoments = byOwner.get(moment.uid) || []
      ownerMoments.push(moment)
      byOwner.set(moment.uid, ownerMoments)
    })
    const groups = Array.from(byOwner.entries()).map(([uid, entries]) => {
      const ordered = [...entries].sort((left, right) => left.createdAt - right.createdAt)
      const latest = ordered[ordered.length - 1]
      const imagePreview = [...ordered].reverse().find(item => item.mediaType === 'image')
      return {
        uid,
        displayName: latest?.displayName || 'Chater member',
        photoURL: uid === authUser?.uid ? profilePhotoUrl : '',
        previewURL: imagePreview?.mediaUrl || '',
        moments: ordered
      }
    }).sort((left, right) => {
      const leftLatest = left.moments[left.moments.length - 1]?.createdAt || 0
      const rightLatest = right.moments[right.moments.length - 1]?.createdAt || 0
      return rightLatest - leftLatest
    })
    const ownGroup = groups.find(group => group.uid === authUser?.uid) || {
      uid: authUser?.uid || 'my-moments',
      displayName: authUser?.displayName || 'My Moments',
      photoURL: profilePhotoUrl,
      previewURL: '',
      moments: []
    }
    return [ownGroup, ...groups.filter(group => group.uid !== authUser?.uid)]
  }, [moments, authUser?.uid, authUser?.displayName, profilePhotoUrl])
  const closeMomentViewer = useCallback(() => setMomentViewerIndex(null), [])
  if (showSplash) return <SplashScreen />
  const openTab = (tab: Tab) => {
    const currentIndex = tabs.findIndex(item => item.label === activeTab)
    const nextIndex = tabs.findIndex(item => item.label === tab)
    if (nextIndex !== currentIndex) setSlideDirection(nextIndex > currentIndex ? 'forward' : 'backward')
    setActiveTab(tab)
    setDialog(null)
    setMomentViewerIndex(null)
  }
  return <main className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className="desktop-rail">
      <div className="rail-brand"><BrandLogo className="brand-logo" /><span>Chater</span></div>
      <nav aria-label="Main navigation" className="rail-nav">{tabs.map(({label,icon:Icon}) => <button key={label} aria-current={activeTab===label ? 'page' : undefined} className={activeTab===label?'rail-link active':'rail-link'} onClick={()=>openTab(label)}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="rail-bottom"><button className="rail-link" onClick={()=>{setSecurityPanel(false);setDialog('settings')}}><Settings size={19}/><span>Settings</span></button><div className="rail-profile"><ProfileAvatar photoURL={profilePhotoUrl} displayName={authUser?.displayName}/><div><strong>{authUser?.displayName || 'Your profile'}</strong><small>{authUser ? 'Chater account' : 'Set up your account'}</small></div><MoreHorizontal size={18}/></div></div>
    </aside>
    <section className="main-column" id="main-content" tabIndex={-1}
      onTouchStart={event=>{
        const touch=event.touches[0]
        const target=event.target as HTMLElement
        touchStartRef.current=target ? {x:touch.clientX,y:touch.clientY,target} : null
      }}
      onTouchEnd={event=>{
        const start=touchStartRef.current
        touchStartRef.current=null
        if(!start)return
        if(start.target.closest('button,a,input,textarea,select,label,[contenteditable="true"],.status-strip,.moment-story-overlay'))return
        const touch=event.changedTouches[0]
        const dx=touch.clientX-start.x
        const dy=touch.clientY-start.y
        if(Math.abs(dx)<65 || Math.abs(dx)<Math.abs(dy)*1.25)return
        const current=tabs.findIndex(item=>item.label===activeTab)
        const next=current+(dx<0?1:-1)
        if(next>=0 && next<tabs.length)openTab(tabs[next].label)
      }}>
      <header className={activeTab==='Moments' ? 'topbar moments-topbar' : 'topbar'}>
        {activeTab==='Moments'
          ? <div className="moments-top-title">Moments</div>
          : <div className="mobile-brand"><BrandLogo className="brand-logo" /><span>Chater</span></div>}
        <div className="topbar-title"><span className="eyebrow">CONNECT. CONVERSE. SHARE.</span><strong>{activeTab}</strong></div>
        <div className="top-actions"><button className="icon-button" aria-label="Search" onClick={()=>setDialog('search')}><Search size={20}/></button><button className="icon-button" aria-label="More options" onClick={()=>{setSecurityPanel(false);setDialog('settings')}}><MoreHorizontal size={21}/></button><button className="avatar-button" aria-label="Your profile" onClick={()=>openTab('You')}><ProfileAvatar className="top-avatar" photoURL={profilePhotoUrl} displayName={authUser?.displayName}/></button></div>
      </header>
      {activeTab !== 'Groups' && activeTab !== 'You' && activeTab !== 'Moments' && <div className="section-search-wrap">
        <div className="chat-toolbar"><label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search conversations or @username"/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={15}/></button>}</label></div>
      </div>}
      <div key={activeTab} className={`content-wrap tab-slide tab-slide-${slideDirection}`}>
        {activeTab==='Chats' && <>
          <div className="filter-row" role="group" aria-label="Chat filters">{filters.map(item=><button key={item} className={filter===item?'filter-chip selected':'filter-chip'} onClick={()=>setFilter(item)}>{item}</button>)}</div>
          <div className="empty-state chat-empty"><h1 className="a11y-heading">Chats</h1><EmptyIllustration icon={MessageCircle}/><p className="eyebrow">A FRESH START</p><h2>Your conversations<br/>start here.</h2><p className="empty-description">{query?'No conversations match that search yet.':'Find someone by their unique Chater username and say hello.'}</p><button className="primary-button" onClick={()=>setDialog('new-chat')}><Plus size={17}/> Start a conversation</button><button className="text-button" onClick={()=>setDialog('search')}>Find people by username <ArrowUpRight size={15}/></button></div>
        </>}
        {activeTab==='Moments'&&<><h1 className="a11y-heading">Moments</h1><p className="a11y-heading">Share photos and videos that disappear after 24 hours.</p><MomentsScreen groups={momentGroups} userId={authUser?.uid || ''} photoURL={profilePhotoUrl} displayName={authUser?.displayName || 'My Moments'} onAdd={()=>{setMomentNotice('');setDialog(authUser ? 'moment' : 'login')}} onView={groupIndex=>setMomentViewerIndex(groupIndex)}/></>}
        {activeTab==='Groups'&&<FeatureEmpty data={pageCopy.Groups} onAction={()=>setDialog('new-chat')}/>}
        {activeTab==='Calls'&&<CallsScreen scheduledCalls={scheduledCalls} onStartCall={()=>setDialog('call')} onScheduleCall={()=>setDialog('schedule')}/>}
        {activeTab==='You'&&<ProfileScreen user={authUser} photoURL={profilePhotoUrl} username={profileUsername} details={profileDetails} onUsernameChange={handleUsernameChange} onDisplayNameChange={handleDisplayNameChange} onDetailsChange={handleProfileDetailsChange} onPhotoUpload={handleProfilePhotoUpload} photoBusy={photoBusy} photoNotice={photoNotice} onSettings={()=>{setSecurityPanel(false);setDialog('settings')}} onSecurity={()=>{setSecurityPanel(true);setSecurityNotice('');setSecurityCurrentPassword('');setSecurityNewPassword('');setSecurityConfirmPassword('');setDialog('settings')}} onRegister={()=>{setRegistrationNotice('');setDialog('register')}} onLogin={()=>{setLoginNotice('');setDialog('login')}}/>}
      </div>
    </section>
    {activeTab==='Chats'&&<button className="compose-button" aria-label="Start a new chat" onClick={()=>setDialog('new-chat')}><Plus size={25}/></button>}
    {activeTab==='Moments'&&<button className="compose-button compose-moment" aria-label="Add a moment" onClick={()=>{setMomentNotice('');setDialog(authUser?'moment':'login')}}><Camera size={24}/><span className="compose-plus"><Plus size={15}/></span></button>}
    {dialog==='moment' && authUser && <MomentComposer busy={momentBusy} notice={momentNotice} onClose={()=>setDialog(null)} onShare={handleShareMoment}/>}

    {activeTab==='Calls'&&<button className="compose-button compose-call" aria-label="Make a call" onClick={()=>setDialog('call')}><Phone size={24}/><span className="compose-plus"><Plus size={15}/></span></button>}
    <nav className="bottom-nav" aria-label="Main navigation">{tabs.map(({label,icon:Icon})=><button key={label} aria-current={activeTab===label ? 'page' : undefined} className={activeTab===label?'nav-item active':'nav-item'} onClick={()=>openTab(label)}><Icon size={21} strokeWidth={activeTab===label?2.3:1.8}/><span>{label}</span></button>)}</nav>
    {dialog && dialog !== 'moment' && <div className="dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null)}}><section className={dialog==='search'?'dialog-card people-search-screen full-screen-dialog':dialog==='new-chat'?'dialog-card new-chat-screen full-screen-dialog':'dialog-card'} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><div><p className="eyebrow">CHATER</p><h2 id="dialog-title">{dialog==='new-chat'?'Start a conversation':dialog==='search'?'Find people':dialog==='register'?'Create your account':dialog==='login'?'Sign in':dialog==='recover'?'Reset your password':dialog==='call'?'Make a call':dialog==='schedule'?'Schedule a call':'Settings'}</h2></div><button className="icon-button" aria-label="Close" onClick={()=>setDialog(null)}><X size={20}/></button></div>{dialog==='call'?<CallComposer/>:dialog==='schedule'?<ScheduleComposer onSave={handleScheduleCall}/>:dialog==='settings'?<>{!securityPanel&&<><section className="theme-settings" aria-labelledby="theme-title"><div className="accent-settings-heading"><h3 id="theme-title">Appearance</h3><span>{theme === 'system' ? 'Follows device' : theme === 'light' ? 'Light mode' : 'Dark mode'}</span></div><label className="theme-select-label" htmlFor="theme-preference">Theme</label><select id="theme-preference" className="theme-select" value={theme} onChange={e=>setTheme(e.target.value as ThemePreference)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select><p className="accent-help">System follows your device appearance setting and updates when it changes.</p></section><section className="wallpaper-settings" aria-labelledby="wallpaper-title"><div className="accent-settings-heading"><h3 id="wallpaper-title">Chat wallpaper</h3><span>{wallpapers.find(item => item.id === wallpaper)?.name}</span></div><div className="wallpaper-options" role="group" aria-label="Choose a chat wallpaper">{wallpapers.map(item=><button key={item.id} type="button" className={wallpaper === item.id ? 'wallpaper-option selected' : 'wallpaper-option'} data-wallpaper={item.id} aria-label={item.name} aria-pressed={wallpaper === item.id} onClick={()=>setWallpaper(item.id)}><span className="wallpaper-swatch"/><small>{item.name}</small></button>)}</div><div className="chat-wallpaper-preview" data-wallpaper={wallpaper} aria-label="Chat wallpaper preview"><span className="preview-day">TODAY</span><div className="preview-message received">Your conversations, your style.</div><div className="preview-message sent">Choose a wallpaper you like.</div></div><p className="accent-help">Preview your wallpaper here. It will be used on chat conversation backgrounds as messaging is connected.</p></section><section className="bubble-settings" aria-labelledby="bubble-title"><div className="accent-settings-heading"><h3 id="bubble-title">Message bubbles</h3><span>{bubbleStyles.find(item => item.id === bubbleStyle)?.name}</span></div><div className="bubble-style-options" role="group" aria-label="Choose a message bubble style">{bubbleStyles.map(item=><button key={item.id} type="button" className={bubbleStyle === item.id ? 'bubble-style-option selected' : 'bubble-style-option'} aria-label={item.name} aria-pressed={bubbleStyle === item.id} onClick={()=>setBubbleStyle(item.id)}><span className="bubble-style-sample" data-bubble-style={item.id}><i/><b/></span><small>{item.name}</small></button>)}</div><div className="bubble-preview" data-bubble-style={bubbleStyle} aria-label="Message bubble preview"><span className="bubble-preview-incoming">Hey! How's your day?</span><span className="bubble-preview-outgoing">Going well, thanks!</span></div><p className="accent-help">Choose the shape of message bubbles. Your choice is saved on this device and will style connected chats.</p></section><section className="accent-settings" aria-labelledby="accent-title"><div className="accent-settings-heading"><h3 id="accent-title">Accent colour</h3><span>{accentPresets.find(item=>item.value===accent)?.name ?? 'Custom'}</span></div><div className="accent-palette" role="group" aria-label="Choose an accent colour">{accentPresets.map(item=><button key={item.value} type="button" className="accent-swatch" style={{'--swatch':item.value} as React.CSSProperties} aria-label={item.name} aria-pressed={accent===item.value} onClick={()=>{setAccent(item.value);setCustomHex(item.value);setCustomHexNotice('')}}><span/></button>)}</div><p className="accent-help">Choose a colour to personalize buttons, highlights and active navigation.</p><div className="custom-accent"><label htmlFor="custom-accent-hex">Custom HEX colour</label><div className="custom-accent-controls"><input id="custom-accent-hex" type="text" inputMode="text" autoCapitalize="characters" maxLength={9} value={customHex} onChange={e=>{setCustomHex(e.target.value);setCustomHexNotice('')}} placeholder="#RRGGBB or #RRGGBBAA" aria-describedby="custom-accent-help"/><button type="button" className="secondary-button" disabled={!normalizedCustomHex} onClick={()=>{setAccent(normalizedCustomHex.toLowerCase());setCustomHex(normalizedCustomHex.toLowerCase());setCustomHexNotice('Custom accent colour applied.')}}>Apply</button></div><p id="custom-accent-help" className="accent-help">Enter a six- or eight-digit HEX value, with or without #.</p>{customHexNotice&&<p className="custom-accent-notice" role="status">{customHexNotice}</p>}</div></section><div className="settings-list"><button onClick={()=>{setDialog(null);openTab('You')}}><UserRound/> Profile <ChevronRight/></button><button><Bell/> Notifications <ChevronRight/></button><button onClick={()=>{setSecurityPanel(true);setSecurityNotice('');setSecurityCurrentPassword('');setSecurityNewPassword('');setSecurityConfirmPassword('')}}><ShieldCheck/> Privacy and security <ChevronRight/></button><button><HelpCircle/> Help <ChevronRight/></button><button onClick={()=>{setAccountPanel('choices');setAccountNotice('');setAccountPassword('')}}><Settings/> Account <ChevronRight/></button></div></>}{securityPanel&&<section className="account-settings-panel security-settings-panel" aria-label="Privacy and security settings">
  <div className="dialog-head"><div><p className="eyebrow">ACCOUNT PROTECTION</p><h3>Privacy and security</h3></div><button className="icon-button" aria-label="Close security settings" onClick={()=>{setSecurityPanel(false);setSecurityNotice('')}}><X size={18}/></button></div>
  <div className="security-status-card"><div><strong>Email address</strong><span>{authUser?.email || 'No email address available'}</span></div><span className={authUser?.emailVerified?'security-status verified':'security-status pending'}>{authUser?.emailVerified?'Verified':'Not verified'}</span></div>
  <div className="security-divider"/>
  {!authUser?.emailVerified&&<div className="security-action-row"><p className="accent-help">Verify your email to help protect your account and confirm that you control this address.</p><button className="secondary-button" type="button" disabled={securityVerificationBusy||!authUser} onClick={async()=>{if(!authUser)return;setSecurityVerificationBusy(true);setSecurityNotice('');try{await sendEmailVerification(authUser);setSecurityNoticeType('success');setSecurityNotice('A verification email has been sent. Check your inbox and Spam or Junk folder.')}catch(error){const code=(error as {code?:string})?.code;setSecurityNoticeType('error');setSecurityNotice(code==='auth/too-many-requests'?'Too many requests. Wait before trying again.':'We could not send the verification email. Check your connection and try again.')}finally{setSecurityVerificationBusy(false)}}}>{securityVerificationBusy?'Sending…':'Resend verification email'}</button></div>}
  <div className="security-divider"/>
  <h4>Change password</h4>
  <p className="accent-help">Confirm your current password, then choose a new password with at least 8 characters.</p>
  <form className="registration-form security-password-form" onSubmit={async event=>{event.preventDefault();setSecurityNotice('');if(!authUser||!authUser.email){setSecurityNoticeType('error');setSecurityNotice('Sign in with an email account before changing your password.');return}if(securityNewPassword.length<8){setSecurityNoticeType('error');setSecurityNotice('Your new password must contain at least 8 characters.');return}if(securityNewPassword!==securityConfirmPassword){setSecurityNoticeType('error');setSecurityNotice('The new passwords do not match.');return}if(securityCurrentPassword===securityNewPassword){setSecurityNoticeType('error');setSecurityNotice('Choose a new password different from your current password.');return}setSecurityBusy(true);try{const credential=EmailAuthProvider.credential(authUser.email,securityCurrentPassword);await reauthenticateWithCredential(authUser,credential);await updatePassword(authUser,securityNewPassword);setSecurityCurrentPassword('');setSecurityNewPassword('');setSecurityConfirmPassword('');setSecurityNoticeType('success');setSecurityNotice('Your password has been changed successfully.')}catch(error){const code=(error as {code?:string})?.code;setSecurityNoticeType('error');const messages:Record<string,string>={'auth/invalid-credential':'Your current password is incorrect. Check it and try again.','auth/wrong-password':'Your current password is incorrect. Check it and try again.','auth/weak-password':'Choose a stronger password with at least 8 characters.','auth/too-many-requests':'Too many attempts. Wait a little before trying again.','auth/requires-recent-login':'Please sign out and sign in again, then retry the password change.','auth/network-request-failed':'Network connection failed. Check your connection and try again.'};setSecurityNotice(messages[code||'']||'We could not change your password. Please check your details and try again.')}finally{setSecurityBusy(false)}}}>
    <label htmlFor="security-current-password">Current password<input id="security-current-password" type="password" autoComplete="current-password" required value={securityCurrentPassword} onChange={event=>{setSecurityCurrentPassword(event.target.value);setSecurityNotice('')}}/></label>
    <label htmlFor="security-new-password">New password<input id="security-new-password" type="password" autoComplete="new-password" minLength={8} required value={securityNewPassword} onChange={event=>{setSecurityNewPassword(event.target.value);setSecurityNotice('')}}/></label>
    <label htmlFor="security-confirm-password">Confirm new password<input id="security-confirm-password" type="password" autoComplete="new-password" minLength={8} required value={securityConfirmPassword} onChange={event=>{setSecurityConfirmPassword(event.target.value);setSecurityNotice('')}}/></label>
    <button className="primary-button" type="submit" disabled={securityBusy||!authUser}>{securityBusy?'Updating password…':'Change password'}</button>
  </form>
  {securityNotice&&<p className={securityNoticeType==='success'?'dialog-notice security-success':'dialog-notice'} role="status">{securityNotice}</p>}
</section>}{accountPanel!=='closed'&&<section className="account-settings-panel" aria-label="Account actions"><div className="dialog-head"><div><p className="eyebrow">ACCOUNT CONTROL</p><h3>{accountPanel==='choices'?'Account actions':accountPanel==='signout'?'Sign out?':'Delete your account?'}</h3></div><button className="icon-button" aria-label="Back to settings" onClick={()=>{setAccountPanel('closed');setAccountNotice('');setAccountPassword('')}}><X size={18}/></button></div>{accountPanel==='choices'?<div className="settings-list"><button onClick={()=>setAccountPanel('signout')}>Sign out <ChevronRight/></button><button onClick={()=>setAccountPanel('delete')}>Delete account <ChevronRight/></button></div>:accountPanel==='signout'?<><p className="dialog-copy">Are you sure you want to sign out of your account?</p><div className="dialog-actions"><button className="secondary-button" onClick={()=>setAccountPanel('choices')}>Cancel</button><button className="primary-button" disabled={accountBusy} onClick={async()=>{if(!firebaseAuth)return;setAccountBusy(true);setAccountNotice('');try{await signOut(firebaseAuth);setAuthUser(null);setProfilePhotoUrl('');setProfileUsername('');setProfileDetails(emptyProfileDetails);setPhotoNotice('');setLoginPassword('');setLoginNotice('');setAccountPanel('closed');setDialog(null);const savedAccent=readSavedAccent();setAccent(savedAccent);setCustomHex(savedAccent);}catch{setAccountNotice('We could not sign you out. Check your connection and try again.')}finally{setAccountBusy(false)}}}>{accountBusy?'Signing out…':'Yes, sign out'}</button></div></>:<><p className="dialog-copy">This action is permanent. Chater will remove your profile, username reservation, and Moment records, then delete your sign-in account. Enter your current password to confirm.</p><form className="registration-form" onSubmit={async event=>{event.preventDefault();setAccountNotice('');if(!accountPassword){setAccountNotice('Enter your current password to continue.');return}setAccountBusy(true);try{await handleAccountDeletion(accountPassword);setAccountPanel('closed');setDialog(null);setAccountPassword('')}catch(error){setAccountNotice(error instanceof Error?error.message:'We could not delete your account. Please try again.')}finally{setAccountBusy(false)}}}><label htmlFor="settings-delete-password">Current password<input id="settings-delete-password" type="password" autoComplete="current-password" required value={accountPassword} onChange={event=>{setAccountPassword(event.target.value);setAccountNotice('')}}/></label><div className="dialog-actions"><button className="secondary-button" type="button" disabled={accountBusy} onClick={()=>setAccountPanel('choices')}>Cancel</button><button className="primary-button" type="submit" disabled={accountBusy}>{accountBusy?'Deleting…':'Permanently delete'}</button></div></form></>}{accountNotice&&<p className="dialog-notice" role="alert">{accountNotice}</p>}</section>}</>:dialog==='register'?<form className="registration-form" onSubmit={async e=>{
      e.preventDefault()
      setRegistrationNotice('')
      const validUsername=/^[a-z0-9_]{3,20}$/.test(registrationUsername)
      if(!validUsername){setRegistrationNotice('Username must be 3–20 characters using lowercase letters, numbers or underscores.');return}
      if(registrationPassword.length<8){setRegistrationNotice('Choose a password with at least 8 characters.');return}
      if(registrationPassword!==registrationConfirm){setRegistrationNotice('Your passwords do not match.');return}
      if(!firebaseAuth){setRegistrationNotice('Firebase is not configured correctly. Please try again later.');return}
      setRegistrationBusy(true)
      registrationInProgress.current = true
      try {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, registrationEmail.trim(), registrationPassword)
        if (!firestoreDb) throw new Error('Chater could not connect to the username service. Please try again later.')
        const usernameRef = doc(firestoreDb, 'usernames', registrationUsername)
        const userProfileRef = doc(firestoreDb, 'users', credential.user.uid)
        try {
          await runTransaction(firestoreDb, async transaction => {
            const usernameSnapshot = await transaction.get(usernameRef)
            if (usernameSnapshot.exists()) {
              throw Object.assign(new Error('That username is already taken. Choose another username.'), { code: 'chater/username-taken' })
            }
            transaction.set(usernameRef, { uid: credential.user.uid, username: registrationUsername, createdAt: serverTimestamp() })
            transaction.set(userProfileRef, { uid: credential.user.uid, username: registrationUsername, usernameLower: registrationUsername.toLowerCase(), displayName: registrationName.trim(), displayNameLower: registrationName.trim().toLowerCase(), createdAt: serverTimestamp() }, { merge: true })
          })
        } catch (reservationError) {
          await deleteDoc(userProfileRef).catch(() => undefined)
          await deleteUser(credential.user).catch(() => undefined)
          throw reservationError
        }
        await updateProfile(credential.user, { displayName: registrationName.trim() })
        try { window.localStorage.setItem(`chater:profile:username:${credential.user.uid}`, registrationUsername) } catch { /* Username can be entered again after sign-in. */ }
        await sendEmailVerification(credential.user)
        await signOut(firebaseAuth)
        setAuthUser(null)
        setProfilePhotoUrl('')
        setProfileUsername('')
        setRegistrationPassword('')
        setRegistrationConfirm('')
        setLoginEmail(registrationEmail.trim())
        setLoginPassword('')
        setLoginNotice(`Your account has been created. We sent a verification link to ${registrationEmail.trim()}. Check your inbox and, if you cannot find it, check your Spam or Junk folder. Open the link to verify your email, then return here and sign in.`)
        setDialog('login')
      } catch(error) {
        const code = (error as {code?: string})?.code
        const messages: Record<string,string> = {
          'auth/email-already-in-use':'An account already exists with this email address. Try signing in instead.',
          'chater/username-taken':'That username is already taken. Choose another username.',
          'auth/invalid-email':'Enter a valid email address.',
          'auth/weak-password':'Choose a stronger password with at least 8 characters.',
          'auth/operation-not-allowed':'Email/Password sign-up is not enabled yet. In Firebase Console, open Authentication → Sign-in method and enable Email/Password.',
          'auth/unauthorized-domain':'This website domain is not authorized. Add henrymeraldcompany-bit.github.io under Firebase Authentication → Settings → Authorized domains.',
          'auth/network-request-failed':'Network connection failed. Check your internet connection and try again.',
          'auth/too-many-requests':'Too many attempts. Wait a little and try again.'
        }
        if (firebaseAuth.currentUser) await signOut(firebaseAuth).catch(() => undefined)
        setRegistrationNotice(messages[code || ''] || (error instanceof Error ? error.message : 'Account creation failed. Please try again.'))
      } finally {
        registrationInProgress.current = false
        setRegistrationBusy(false)
      }
    }}>
      <p className="dialog-copy">Create a Chater identity. Your email stays private; your username is how people can find you.</p>
      <label>Full name<input required autoComplete="name" value={registrationName} onChange={e=>setRegistrationName(e.target.value)} placeholder="Your name" maxLength={60}/></label>
      <label>Email address<input required type="email" autoComplete="email" value={registrationEmail} onChange={e=>setRegistrationEmail(e.target.value)} placeholder="you@example.com"/></label>
      <label>Username<input required autoComplete="username" value={registrationUsername} onChange={e=>{setRegistrationUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''));setRegistrationNotice('')}} placeholder="yourusername" maxLength={20}/><small>3–20 characters: lowercase letters, numbers and underscores.</small></label>
      <label>Password<input required type="password" autoComplete="new-password" value={registrationPassword} onChange={e=>{setRegistrationPassword(e.target.value);setRegistrationNotice('')}} minLength={8} placeholder="At least 8 characters"/></label>
      <label>Confirm password<input required type="password" autoComplete="new-password" value={registrationConfirm} onChange={e=>{setRegistrationConfirm(e.target.value);setRegistrationNotice('')}} minLength={8} placeholder="Enter your password again"/></label>
      <button className="primary-button dialog-action" type="submit" disabled={registrationBusy}>{registrationBusy ? 'Creating account…' : 'Continue'}</button>
      {registrationNotice&&<p className="dialog-notice" role="status">{registrationNotice}</p>}
      <p className="registration-footnote">After creating your account, check your inbox for the verification email. If it is missing, check your Spam or Junk folder. Verify your email, then return to Chater and sign in. Add your profile picture after signing in.</p>
    </form>:dialog==='login'?<form className="registration-form" onSubmit={async e=>{
      e.preventDefault()
      setLoginNotice('')
      if(!firebaseAuth){setLoginNotice('Firebase is not configured correctly. Please try again later.');return}
      setLoginBusy(true)
      loginInProgress.current = true
      try {
        const credential = await signInWithEmailAndPassword(firebaseAuth, loginEmail.trim(), loginPassword)
        await reload(credential.user)
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user).catch(() => undefined)
          await signOut(firebaseAuth)
          setLoginNotice('Your email is not verified yet. We have sent another verification email if possible. Check your inbox and Spam or Junk folder, open the verification link, then return here and sign in again.')
          return
        }
        setAuthUser(credential.user)
        const savedAccent = readSavedAccent(credential.user.uid)
        setAccent(savedAccent)
        setCustomHex(savedAccent)
        setProfilePhotoUrl(credential.user.photoURL || '')
        // Authentication has already succeeded. A profile-read failure must never
        // keep the sign-in dialog open or make a successful sign-in look unsuccessful.
        let storedProfile: Record<string, unknown> = {}
        try {
          const profileSnapshot = firestoreDb ? await getDoc(doc(firestoreDb, 'users', credential.user.uid)) : null
          storedProfile = (profileSnapshot?.data() || {}) as Record<string, unknown>
        } catch {
          // The profile can be repaired/loaded later; Firebase Auth remains valid.
        }
        const storedUsername = storedProfile.username
        const localUsername = window.localStorage.getItem(`chater:profile:username:${credential.user.uid}`) || ''
        const resolvedUsername = typeof storedUsername === 'string' ? storedUsername : localUsername
        if (resolvedUsername) void syncLegacyUsername(credential.user.uid, resolvedUsername, typeof storedProfile.displayName === 'string' ? storedProfile.displayName : (credential.user.displayName || '')).catch(() => undefined)
        setProfileUsername(resolvedUsername)
        setProfileDetails({
          about: typeof storedProfile.about === 'string' ? storedProfile.about : '',
          location: typeof storedProfile.location === 'string' ? storedProfile.location : '',
          occupation: typeof storedProfile.occupation === 'string' ? storedProfile.occupation : ''
        })
        if (resolvedUsername) window.localStorage.setItem(`chater:profile:username:${credential.user.uid}`, resolvedUsername)
        setLoginPassword('')
        setDialog(null)
      } catch(error) {
        const code = (error as {code?: string})?.code
        const messages: Record<string,string> = {
          'auth/invalid-credential':'Email or password is incorrect.',
          'auth/user-not-found':'No account was found for this email address.',
          'auth/wrong-password':'Email or password is incorrect.',
          'auth/too-many-requests':'Too many attempts. Wait a little and try again.',
          'auth/network-request-failed':'Network connection failed. Check your internet connection and try again.'
        }
        setLoginNotice(messages[code || ''] || (error instanceof Error ? error.message : 'Sign-in failed. Please try again.'))
      } finally {
        loginInProgress.current = false
        setLoginBusy(false)
      }
    }}>
      <p className="dialog-copy">Sign in only after confirming your email address. If you are waiting for a verification email, check your inbox and Spam or Junk folder. Chater checks verification before opening your account.</p>
      <label>Email address<input required type="email" autoComplete="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="you@example.com"/></label>
      <label>Password<input required type="password" autoComplete="current-password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Your password"/></label>
      <button className="primary-button dialog-action" type="submit" disabled={loginBusy}>{loginBusy ? 'Checking account…' : 'Sign in'}</button>
      {loginNotice&&<p className="dialog-notice" role="status">{loginNotice}</p>}
      {loginNotice.includes('not verified yet')&&<button className="secondary-button dialog-action" type="button" disabled={verificationResendBusy||loginBusy} onClick={async()=>{
        if(!firebaseAuth){setLoginNotice('Firebase is not configured correctly. Please try again later.');return}
        if(!loginEmail.trim()||!loginPassword){setLoginNotice('Enter your email address and password first so we can safely resend your verification email.');return}
        setVerificationResendBusy(true)
        loginInProgress.current=true
        let pendingUser: User | null=null
        try {
          const credential=await signInWithEmailAndPassword(firebaseAuth,loginEmail.trim(),loginPassword)
          pendingUser=credential.user
          await reload(pendingUser)
          if(pendingUser.emailVerified){
            await signOut(firebaseAuth)
            setLoginNotice('Your email is now verified. You can sign in normally.')
          } else {
            await sendEmailVerification(pendingUser)
            await signOut(firebaseAuth)
            setLoginNotice('A new verification email has been sent. Check your inbox and Spam or Junk folder, open the link, then return here to sign in.')
          }
        } catch(error) {
          if(pendingUser&&firebaseAuth.currentUser) await signOut(firebaseAuth).catch(()=>undefined)
          const code=(error as {code?:string})?.code
          setLoginNotice(code==='auth/too-many-requests'?'Too many attempts. Wait a little before requesting another email.':code==='auth/network-request-failed'?'Network connection failed. Check your internet connection and try again.':error instanceof Error?error.message:'We could not resend the verification email. Please try again.')
        } finally {
          loginInProgress.current=false
          setVerificationResendBusy(false)
        }
      }}>{verificationResendBusy?'Sending verification email…':'Resend verification email'}</button>}
      <button className="text-button" type="button" onClick={()=>{setPasswordRecoveryNotice('');setDialog('recover')}}>Forgot password?</button>
      <button className="text-button" type="button" onClick={()=>{setRegistrationNotice('');setDialog('register')}}>Create a new account</button>
    </form>:dialog==='recover'?<form className="registration-form" onSubmit={async e=>{
      e.preventDefault()
      setPasswordRecoveryNotice('')
      const email=loginEmail.trim()
      if(!email){setPasswordRecoveryNotice('Enter the email address for your Chater account.');return}
      if(!firebaseAuth){setPasswordRecoveryNotice('Firebase is not configured correctly. Please try again later.');return}
      setPasswordRecoveryBusy(true)
      try {
        await sendPasswordResetEmail(firebaseAuth,email)
        setPasswordRecoveryNotice('If an account exists for this email address, a password reset link has been sent. Check your inbox and Spam or Junk folder.')
      } catch(error) {
        const code=(error as {code?:string})?.code
        const messages:Record<string,string>={
          'auth/invalid-email':'Enter a valid email address.',
          'auth/too-many-requests':'Too many attempts. Wait a little before requesting another reset email.',
          'auth/network-request-failed':'Network connection failed. Check your internet connection and try again.',
          'auth/unauthorized-continue-uri':'Password reset is not configured for this website. Please contact support.'
        }
        setPasswordRecoveryNotice(messages[code||'']||'We could not send the reset email right now. Check the address and try again.')
      } finally { setPasswordRecoveryBusy(false) }
    }}>
      <p className="dialog-copy">Enter the email address linked to your Chater account. We will send a secure password-reset link if an account is registered with it.</p>
      <label>Email address<input required type="email" autoComplete="email" value={loginEmail} onChange={e=>{setLoginEmail(e.target.value);setPasswordRecoveryNotice('')}} placeholder="you@example.com"/></label>
      <button className="primary-button dialog-action" type="submit" disabled={passwordRecoveryBusy}>{passwordRecoveryBusy?'Sending reset email…':'Send reset link'}</button>
      {passwordRecoveryNotice&&<p className="dialog-notice" role="status">{passwordRecoveryNotice}</p>}
      <button className="text-button" type="button" onClick={()=>{setLoginNotice('');setDialog('login')}}>Back to sign in</button>
    </form>:<><label className="search-box dialog-search people-search-input"><input autoFocus value={username} onChange={e=>{setUsername(e.target.value.replace(/^@/,''));setSearchNotice('');setShowAllPeopleResults(false)}} placeholder="Search names or @username"/>{username&&<button aria-label="Clear username" type="button" onClick={()=>{setUsername('');setSearchNotice('');setShowAllPeopleResults(false)}}><X size={15}/></button>}<button className="people-search-icon" type="button" aria-label="Search people" disabled={!username.trim()||usernameSearchBusy} onClick={()=>{setShowAllPeopleResults(true);void handleUsernameSearch(username)}}><Search size={19}/></button></label>{usernameSearchBusy&&<p className="search-progress" role="status">Finding members…</p>}{usernameSearchResults.length>0&&<div className="username-search-results" aria-label="Matching Chater members">{usernameSearchResults.slice(0,showAllPeopleResults?100:10).map(result=><div className="username-search-result" key={result.uid}><ProfileAvatar photoURL={result.photoURL} displayName={result.displayName} className="username-search-avatar"/><div><strong>{result.displayName}</strong><span>@{result.username}</span></div></div>)}</div>}{usernameSearchResults.length>10&&!showAllPeopleResults&&<button className="secondary-button people-search-more" type="button" onClick={()=>setShowAllPeopleResults(true)}>See more results ({usernameSearchResults.length-10} more)</button>}{searchNotice&&!usernameSearchResults.length&&<p className="dialog-notice" role="status">{searchNotice}</p>}</>}</section></div>}
    {activeTab==='Moments' && momentViewerIndex !== null && <MomentViewer groups={momentGroups} initialGroupIndex={momentViewerIndex} onClose={closeMomentViewer}/>}
  </main>
}

function FeatureEmpty({data,onAction}:{data:{eyebrow:string;title:string;description:string;action:string;icon:LucideIcon};onAction:()=>void}) {
  const Icon=data.icon
  return <div className="empty-state feature-empty"><EmptyIllustration icon={Icon}/><p className="eyebrow">{data.eyebrow}</p><h1>{data.title}</h1><p className="empty-description">{data.description}</p><button className="primary-button" onClick={onAction}><Plus size={17}/>{data.action}</button></div>
}
function formatMomentTime(timestamp: number) {
  if (!timestamp) return 'Recently'
  const date = new Date(timestamp)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function MomentsScreen({groups,userId,photoURL,displayName,onAdd,onView}:{groups:MomentGroup[];userId:string;photoURL:string;displayName:string;onAdd:()=>void;onView:(groupIndex:number)=>void}) {
  const myGroup = groups.find(group => group.uid === userId)
  const people = groups.filter(group => group.uid !== userId)
  const ownCount = myGroup?.moments.length || 0
  const previewOf = (group:MomentGroup) => group.moments[group.moments.length - 1]
  return <div className="moments-screen">
    <section className="moments-rail-section" aria-labelledby="moments-rail-title">
      <div className="moments-section-heading">
        <h2 id="moments-rail-title">Moments</h2>
        <span className="moments-expiry-note">Visible for 24 hours</span>
      </div>
      <div className="moment-card-rail">
        <button type="button" className="moment-person-card my-moment-person-card" onClick={()=>ownCount ? onView(0) : onAdd()}>
          <span className="moment-person-image">
            {myGroup?.previewURL ? <img src={myGroup.previewURL} alt=""/> : photoURL ? <img src={photoURL} alt=""/> : <ProfileAvatar displayName={displayName}/>}
          </span>
          <span className="moment-card-shade"/>
          <span className="moment-person-name">My Moments</span>
          <span className="moment-card-add" onClick={event=>{event.stopPropagation();onAdd()}} aria-label="Add a Moment"><Plus size={19}/></span>
          <span className="moment-card-count">{ownCount ? ownCount + (ownCount===1?' Moment':' Moments') : 'Share a Moment'}</span>
        </button>
        {people.map(group=>{
          const latest=previewOf(group)
          const groupIndex=groups.indexOf(group)
          return <button type="button" className="moment-person-card" key={group.uid} onClick={()=>onView(groupIndex)}>
            <span className="moment-person-image">
              {latest?.mediaType==='video'
                ? <video src={latest.mediaUrl} muted playsInline preload="metadata"/>
                : latest?.mediaType==='audio'
                  ? <span className="moment-audio-card-icon"><Mic size={30}/></span>
                  : latest?.mediaUrl ? <img src={latest.mediaUrl} alt=""/> : <ProfileAvatar displayName={group.displayName}/>}
            </span>
            <span className="moment-card-shade"/>
            <span className="moment-person-ring"><span>{group.displayName.slice(0,1).toUpperCase()}</span></span>
            <span className="moment-person-name">{group.displayName}</span>
            <span className="moment-card-count">{group.moments.length} {group.moments.length===1?'Moment':'Moments'}</span>
          </button>
        })}
      </div>
    </section>

  </div>
}

function MomentViewer({groups,initialGroupIndex,onClose}:{groups:MomentGroup[];initialGroupIndex:number;onClose:()=>void}) {
  const [groupIndex,setGroupIndex] = useState(initialGroupIndex)
  const [momentIndex,setMomentIndex] = useState(0)
  const [progress,setProgress] = useState(0)
  const touchStart = useRef<{x:number;y:number}|null>(null)
  const group = groups[groupIndex]
  const moment = group?.moments[momentIndex]
  const avatarURL = group?.photoURL || group?.previewURL || ''

  const nextStory = useCallback(() => {
    if (group && momentIndex < group.moments.length - 1) {
      setMomentIndex(current => current + 1)
      return
    }
    for (let index = groupIndex + 1; index < groups.length; index += 1) {
      if (groups[index].moments.length > 0) {
        setGroupIndex(index)
        setMomentIndex(0)
        return
      }
    }
    onClose()
  }, [group, momentIndex, groupIndex, groups, onClose])

  const previousStory = useCallback(() => {
    if (momentIndex > 0) {
      setMomentIndex(current => current - 1)
      return
    }
    for (let index = groupIndex - 1; index >= 0; index -= 1) {
      if (groups[index].moments.length > 0) {
        setGroupIndex(index)
        setMomentIndex(groups[index].moments.length - 1)
        return
      }
    }
  }, [momentIndex, groupIndex, groups])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') nextStory()
      if (event.key === 'ArrowLeft') previousStory()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, nextStory, previousStory])

  const currentMomentId = moment?.id
  const currentMomentType = moment?.mediaType
  useEffect(() => {
    setProgress(0)
    if (!currentMomentId || currentMomentType !== 'image') return
    const startedAt = Date.now()
    const duration = 6000
    const timer = window.setInterval(() => {
      const nextProgress = Math.min(((Date.now() - startedAt) / duration) * 100, 100)
      setProgress(nextProgress)
      if (nextProgress >= 100) {
        window.clearInterval(timer)
        nextStory()
      }
    }, 80)
    return () => window.clearInterval(timer)
  }, [currentMomentId, currentMomentType, nextStory])

  if (!group || !moment) return null
  return <div className="moment-story-overlay" role="dialog" aria-modal="true" aria-label={`Moment from ${group.displayName}`}
    onTouchStart={event=>{const touch=event.touches[0];touchStart.current={x:touch.clientX,y:touch.clientY}}}
    onTouchEnd={event=>{
      const start=touchStart.current
      touchStart.current=null
      if(!start)return
      const touch=event.changedTouches[0]
      const dx=touch.clientX-start.x
      const dy=touch.clientY-start.y
      if(Math.abs(dx)>65 && Math.abs(dx)>Math.abs(dy)*1.2){if(dx<0)nextStory();else previousStory()}
      else if(dy>90 && Math.abs(dy)>Math.abs(dx))onClose()
    }}>
    <div className="moment-story-progress" aria-label={`Moment ${momentIndex+1} of ${group.moments.length}`}>
      {group.moments.map((item,index)=><span className="moment-story-track" key={item.id}><i style={{width:index<momentIndex?'100%':index===momentIndex?`${progress}%`:'0%'}}/></span>)}
    </div>
    <header className="moment-story-header">
      <span className="moment-story-avatar">{avatarURL ? <img src={avatarURL} alt=""/> : <ProfileAvatar displayName={group.displayName}/>}</span>
      <span className="moment-story-identity"><strong>{group.displayName}</strong><small>{formatMomentTime(moment.createdAt)}</small></span>
      <button type="button" className="moment-story-close" onClick={onClose} aria-label="Close Moments viewer"><X size={25}/></button>
    </header>
    <div className="moment-story-media">
      {moment.mediaType==='video'
        ? <video key={moment.id} src={moment.mediaUrl} autoPlay controls playsInline onTimeUpdate={event=>{
            const video=event.currentTarget
            if(video.duration>0)setProgress((video.currentTime/video.duration)*100)
          }} onEnded={nextStory}/>
        : moment.mediaType==='audio'
          ? <div className="moment-audio-playback"><audio key={moment.id} src={moment.mediaUrl} autoPlay controls onTimeUpdate={event=>{
              const audio=event.currentTarget
              if(audio.duration>0)setProgress((audio.currentTime/audio.duration)*100)
            }} onEnded={nextStory}/><span>Audio Moment</span></div>
          : <img src={moment.mediaUrl} alt={moment.caption || `Moment from ${group.displayName}`}/>}
    </div>
    <button type="button" className="moment-story-tap moment-story-tap-left" aria-label="Previous Moment" onClick={previousStory}/>
    <button type="button" className="moment-story-tap moment-story-tap-right" aria-label="Next Moment" onClick={nextStory}/>
    {moment.caption && <div className="moment-story-caption">{moment.caption}</div>}
    <div className="moment-story-footer"><span>{momentIndex+1} of {group.moments.length}</span><span>Available for 24 hours after sharing</span></div>
  </div>
}
function CallsScreen({scheduledCalls,onStartCall,onScheduleCall}:{scheduledCalls:ScheduledCall[];onStartCall:()=>void;onScheduleCall:()=>void}) {
  const [showFavorites,setShowFavorites]=useState(false)
  const actions = [
    {label:'Call',icon:PhoneCall,action:onStartCall},
    {label:'Schedule',icon:CalendarDays,action:onScheduleCall},
    {label:'Favorites',icon:Heart,action:()=>setShowFavorites(true)}
  ]
  return <div className="calls-screen">
    <section className="call-shortcuts" aria-label="Call shortcuts">
      {actions.map(({label,icon:Icon,action})=><button type="button" className="call-shortcut" key={label} onClick={action}>
        <span><Icon size={28} strokeWidth={2}/></span><strong>{label}</strong>
      </button>)}
    </section>
    <section className="recent-calls" aria-labelledby="recent-calls-heading">
      <div className="recent-calls-heading"><h2 id="recent-calls-heading">{showFavorites?'Favorites':'Recent'}</h2>{showFavorites&&<button type="button" className="text-button" onClick={()=>setShowFavorites(false)}>Back to recent</button>}</div>
      {showFavorites
        ? <div className="recent-calls-empty"><div className="recent-calls-icon"><Heart size={26}/></div><strong>No favorite contacts yet</strong><p>Contacts you mark as favorites will appear here.</p></div>
        : <><div className="recent-calls-empty"><div className="recent-calls-icon"><Phone size={26}/></div><strong>No recent calls</strong><p>Your incoming, outgoing and missed calls will appear here.</p><button type="button" className="secondary-button" onClick={onStartCall}>Make a call</button></div>
          {scheduledCalls.length>0&&<div className="scheduled-calls-list"><h3>Scheduled calls</h3>{scheduledCalls.map(item=><div className="scheduled-call-item" key={item.id}><span><strong>{item.phone}</strong><small>{new Date(item.at).toLocaleString()}</small></span><CalendarDays size={18}/></div>)}</div>}
        </>}
    </section>
  </div>
}
function MomentComposer({busy,notice,onClose,onShare}:{busy:boolean;notice:string;onClose:()=>void;onShare:(file:File,caption:string)=>void}) {
  const [mode,setMode]=useState<'gallery'|'text'|'layout'|'music'|'voice'>('gallery')
  const [file,setFile]=useState<File|null>(null)
  const [layoutFiles,setLayoutFiles]=useState<File[]>([])
  const [caption,setCaption]=useState('')
  const [textDraft,setTextDraft]=useState('')
  const [background,setBackground]=useState('#9dba3d')
  const [fontStyle,setFontStyle]=useState<'clean'|'serif'|'bold'>('clean')
  const [localNotice,setLocalNotice]=useState('')
  const [previewURL,setPreviewURL]=useState('')
  const [layoutURLs,setLayoutURLs]=useState<string[]>([])
  const galleryInput=useRef<HTMLInputElement|null>(null)
  const layoutInput=useRef<HTMLInputElement|null>(null)

  useEffect(()=>{
    if(!file){setPreviewURL('');return}
    const url=URL.createObjectURL(file)
    setPreviewURL(url)
    return ()=>URL.revokeObjectURL(url)
  },[file])
  useEffect(()=>{
    const urls=layoutFiles.map(item=>URL.createObjectURL(item))
    setLayoutURLs(urls)
    return ()=>urls.forEach(url=>URL.revokeObjectURL(url))
  },[layoutFiles])

  const shareFile=(nextFile:File,nextCaption=caption)=>{
    setLocalNotice('')
    onShare(nextFile,nextCaption)
  }
  const createTextMoment=()=>{
    if(!textDraft.trim()){setLocalNotice('Write something before sharing your text Moment.');return}
    const canvas=document.createElement('canvas')
    canvas.width=1080
    canvas.height=1920
    const context=canvas.getContext('2d')
    if(!context){setLocalNotice('This device could not prepare the text Moment.');return}
    context.fillStyle=background
    context.fillRect(0,0,canvas.width,canvas.height)
    const family=fontStyle==='serif'?'Georgia, serif':'Arial, sans-serif'
    const weight=fontStyle==='bold'?'700':'500'
    const fontSize=fontStyle==='bold'?82:74
    context.font=weight+' '+fontSize+'px '+family
    context.fillStyle='#ffffff'
    context.textAlign='center'
    context.textBaseline='middle'
    const maxWidth=850
    const words=textDraft.trim().split(/\s+/)
    const lines:string[]=[]
    let line=''
    words.forEach(word=>{
      const candidate=line ? line+' '+word : word
      if(context.measureText(candidate).width>maxWidth && line){lines.push(line);line=word}else line=candidate
    })
    if(line)lines.push(line)
    const lineHeight=fontSize*1.3
    const startY=(canvas.height-(lines.length*lineHeight))/2+lineHeight/2
    lines.forEach((item,index)=>context.fillText(item,canvas.width/2,startY+index*lineHeight,maxWidth))
    canvas.toBlob(blob=>{
      if(!blob){setLocalNotice('Could not prepare your text Moment. Try again.');return}
      shareFile(new File([blob],'chater-text-moment.png',{type:'image/png'}),'')
    },'image/png')
  }
  const createLayoutMoment=async()=>{
    if(layoutFiles.length<2){setLocalNotice('Choose at least two photos for your Moments layout.');return}
    try{
      const photos=await Promise.all(layoutFiles.slice(0,4).map(item=>createImageBitmap(item)))
      const canvas=document.createElement('canvas')
      canvas.width=1080
      canvas.height=1350
      const context=canvas.getContext('2d')
      if(!context)throw new Error('Could not prepare the layout.')
      context.fillStyle='#080d10'
      context.fillRect(0,0,canvas.width,canvas.height)
      const gap=12
      const count=photos.length
      const columns=count===2?2:2
      const rows=Math.ceil(count/columns)
      const cellWidth=(canvas.width-gap*(columns+1))/columns
      const cellHeight=(canvas.height-gap*(rows+1))/rows
      photos.forEach((photo,index)=>{
        const x=gap+(index%columns)*(cellWidth+gap)
        const y=gap+Math.floor(index/columns)*(cellHeight+gap)
        const scale=Math.max(cellWidth/photo.width,cellHeight/photo.height)
        const sourceWidth=cellWidth/scale
        const sourceHeight=cellHeight/scale
        const sx=(photo.width-sourceWidth)/2
        const sy=(photo.height-sourceHeight)/2
        context.save()
        context.beginPath()
        context.roundRect(x,y,cellWidth,cellHeight,24)
        context.clip()
        context.drawImage(photo,sx,sy,sourceWidth,sourceHeight,x,y,cellWidth,cellHeight)
        context.restore()
        photo.close()
      })
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'))
      if(!blob)throw new Error('Could not prepare the Moments layout.')
      shareFile(new File([blob],'chater-moments-layout.png',{type:'image/png'}),'')
    }catch(error){setLocalNotice(error instanceof Error?error.message:'Could not create the Moments layout.')}
  }

  const actions=[
    {id:'text' as const,label:'Text',icon:Type},
    {id:'music' as const,label:'Music',icon:Music2},
    {id:'layout' as const,label:'Layout',icon:LayoutGrid},
    {id:'voice' as const,label:'Voice',icon:Mic}
  ]
  return <div className="moment-create-overlay" role="dialog" aria-modal="true" aria-label="Add Moments">
    <header className="moment-create-header">
      <button type="button" className="moment-create-close" onClick={onClose} aria-label="Close"><X size={23}/></button>
      <div><strong>{mode==='text'?'Text Moment':mode==='layout'?'Moments layout':mode==='music'?'Music Moment':mode==='voice'?'Voice Moment':'Add Moments'}</strong><small>Share something from your day</small></div>
      {mode!=='gallery' && <button type="button" className="moment-create-back" onClick={()=>setMode('gallery')} aria-label="Back"><ArrowLeft size={20}/></button>}
    </header>
    {mode==='gallery' && <>
      <div className="moment-create-actions">
        {actions.map(({id,label,icon:Icon})=><button type="button" key={id} className="moment-create-action" onClick={()=>{setMode(id);setLocalNotice('')}}><span><Icon size={21}/></span><strong>{label}</strong></button>)}
      </div>
      <div className="moment-gallery-heading"><strong>Recent</strong><button type="button" onClick={()=>galleryInput.current?.click()}>Choose from gallery <ChevronRight size={15}/></button></div>
      <input ref={galleryInput} className="moment-hidden-input" type="file" accept="image/*,video/*,audio/*" onChange={event=>{setFile(event.target.files?.[0]||null);setMode('gallery')}}/>
      <div className="moment-gallery-grid">
        <button type="button" className="moment-gallery-tile moment-camera-tile" onClick={()=>galleryInput.current?.click()}><ImagePlus size={28}/><strong>Gallery</strong><small>Select a photo or video</small></button>
        <button type="button" className="moment-gallery-tile moment-camera-tile" onClick={()=>{const input=document.getElementById('moment-camera-capture') as HTMLInputElement|null;input?.click()}}><Camera size={28}/><strong>Camera</strong><small>Take a new photo</small></button>
        {file && <button type="button" className="moment-gallery-tile moment-selected-tile" onClick={()=>setMode('gallery')}>{file.type.startsWith('video/')?<Video size={30}/>:<img src={previewURL} alt="Selected Moment"/>}<strong>Selected</strong></button>}
      </div>
      <input id="moment-camera-capture" className="moment-hidden-input" type="file" accept="image/*" capture="environment" onChange={event=>setFile(event.target.files?.[0]||null)}/>
      {file && <div className="moment-selected-preview">
        {file.type.startsWith('video/')?<video src={previewURL} controls playsInline/>:<img src={previewURL} alt="Selected Moment"/>}
        <label>Caption (optional)<textarea value={caption} onChange={event=>setCaption(event.target.value)} maxLength={180} placeholder="Add a caption…"/></label>
        <button type="button" className="moment-publish-button" disabled={busy} onClick={()=>shareFile(file)}>{busy?'Sharing…':'Share Moment'} <Check size={17}/></button>
      </div>}
    </>}
    {mode==='text' && <div className="moment-text-editor">
      <div className="moment-text-canvas" style={{background}}><textarea value={textDraft} onChange={event=>setTextDraft(event.target.value)} maxLength={500} placeholder="Type a Moment" style={{fontFamily:fontStyle==='serif'?'Georgia,serif':'Arial,sans-serif',fontWeight:fontStyle==='bold'?800:500}}/></div>
      <div className="moment-editor-toolbar">
        <div className="moment-color-palette" aria-label="Moment background colours">{['#9dba3d','#c18b49','#8f79c6','#cc7782','#287b82','#253b62','#101619'].map(color=><button type="button" key={color} style={{background:color}} aria-label={'Background '+color} aria-pressed={background===color} onClick={()=>setBackground(color)}/>)}</div>
        <div className="moment-editor-tools"><button type="button" className={fontStyle==='clean'?'selected':''} onClick={()=>setFontStyle('clean')}>Aa</button><button type="button" className={fontStyle==='serif'?'selected':''} onClick={()=>setFontStyle('serif')}>Serif</button><button type="button" className={fontStyle==='bold'?'selected':''} onClick={()=>setFontStyle('bold')}>Bold</button></div>
        <div className="moment-emoji-row">{['😊','❤️','🙏','😂','✨','🔥','👍'].map(emoji=><button type="button" key={emoji} onClick={()=>setTextDraft(value=>value+emoji)}>{emoji}</button>)}</div>
        <button type="button" className="moment-publish-button" disabled={!textDraft.trim()||busy} onClick={createTextMoment}>{busy?'Sharing…':'Share Moment'} <Check size={17}/></button>
      </div>
    </div>}
    {mode==='layout' && <div className="moment-layout-editor">
      <div className="moment-layout-preview"><LayoutGrid size={34}/><strong>Create a photo layout</strong><small>Choose two to four photos. Chater will arrange them into one Moment.</small></div>
      <label className="moment-gallery-picker">Choose photos<input ref={layoutInput} type="file" accept="image/*" multiple onChange={event=>setLayoutFiles(Array.from(event.target.files||[]).slice(0,4))}/></label>
      {layoutURLs.length>0 && <div className="moment-layout-thumbs">{layoutURLs.map((url,index)=><img key={url} src={url} alt={'Layout photo '+(index+1)}/>)}</div>}
      <button type="button" className="moment-publish-button" disabled={layoutFiles.length<2||busy} onClick={createLayoutMoment}>{busy?'Creating…':'Create and share layout'} <Check size={17}/></button>
    </div>}
    {(mode==='music'||mode==='voice') && <div className="moment-audio-unavailable">
      <span>{mode==='music'?<Music2 size={34}/>:<Mic size={34}/>}</span>
      <strong>{mode==='music'?'Music Moments':'Voice Moments'}</strong>
      <p>{mode==='music'?'Adding music requires Chater to save an audio track alongside a photo.':'Voice Moments require Chater to save an audio recording as its own Moment type.'}</p>
      <small>That needs a small Firestore rules and data-format update. I have not changed those rules for this redesign.</small>
      <button type="button" className="moment-audio-back" onClick={()=>setMode('gallery')}>Back to Moments</button>
    </div>}
    {(notice||localNotice) && <p className="moment-create-notice" role="alert">{localNotice||notice}</p>}
  </div>
}
function CallComposer() {
  const [phone,setPhone]=useState('')
  const normalized=phone.replace(/[^+0-9]/g,'')
  const valid=/^\+?[0-9]{7,15}$/.test(normalized)
  return <div className="registration-form">
    <p className="dialog-copy">Enter a phone number to open your device's normal calling service. Chater in-app voice and video calling are not connected yet.</p>
    <label>Phone number<input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={event=>setPhone(event.target.value)} placeholder="+234…" /></label>
    <a className={valid?'primary-button dialog-action':'primary-button dialog-action disabled-link'} aria-disabled={!valid} href={valid?'tel:'+normalized:undefined}>Call now <PhoneCall size={16}/></a>
  </div>
}
function ScheduleComposer({onSave}:{onSave:(phone:string,at:string)=>void}) {
  const [phone,setPhone]=useState('')
  const [date,setDate]=useState('')
  const [time,setTime]=useState('')
  const number=phone.replace(/[^+0-9]/g,'')
  const at=date&&time?new Date(date+'T'+time):null
  const validNumber=/^\+?[0-9]{7,15}$/.test(number)
  const validTime=!!at && !Number.isNaN(at.getTime()) && at.getTime()>Date.now()
  return <form className="registration-form" onSubmit={event=>{event.preventDefault();if(validNumber&&validTime)onSave(number,at!.toISOString())}}>
    <p className="dialog-copy">Save a call reminder on this device. Chater notifications are not connected yet, so this does not send an alert.</p>
    <label>Phone number<input type="tel" inputMode="tel" value={phone} onChange={event=>setPhone(event.target.value)} placeholder="+234…"/></label>
    <label>Date<input type="date" min={new Date().toISOString().slice(0,10)} value={date} onChange={event=>setDate(event.target.value)}/></label>
    <label>Time<input type="time" value={time} onChange={event=>setTime(event.target.value)}/></label>
    <button className="primary-button dialog-action" type="submit" disabled={!validNumber||!validTime}>Save call reminder</button>
  </form>
}
function ProfileScreen({user,photoURL,username,details,onUsernameChange,onDisplayNameChange,onDetailsChange,onPhotoUpload,photoBusy,photoNotice,onSettings,onSecurity,onRegister,onLogin}:{user:User|null;photoURL:string;username:string;details:ProfileDetails;onUsernameChange:(username:string)=>Promise<void>;onDisplayNameChange:(name:string)=>Promise<void>;onDetailsChange:(details:ProfileDetails)=>Promise<void>;onPhotoUpload:(file:File)=>void;photoBusy:boolean;photoNotice:string;onSettings:()=>void;onSecurity:()=>void;onRegister:()=>void;onLogin:()=>void;}) {
  const [editingProfile,setEditingProfile] = useState(false)
  const [nameDraft,setNameDraft] = useState(user?.displayName || '')
  const [usernameDraft,setUsernameDraft] = useState(username)
  const [detailsDraft,setDetailsDraft] = useState(details)
  const [profileSaveBusy,setProfileSaveBusy] = useState(false)
  const [profileEditNotice,setProfileEditNotice] = useState('')
  useEffect(() => { setNameDraft(user?.displayName || '') }, [user?.displayName])
  useEffect(() => { setUsernameDraft(username) }, [username])
  useEffect(() => { setDetailsDraft(details) }, [details])
  return <div className="profile-page">
    <style>{`.profile-card{position:relative}.profile-card-heading{position:static;display:flex;align-items:flex-start;justify-content:center}.profile-edit-trigger{position:absolute;right:1rem;top:1rem;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--border, #ffffff22);background:var(--surface-raised, #ffffff0a);color:var(--text, inherit);cursor:pointer}.profile-edit-trigger:hover{border-color:var(--accent);color:var(--accent)}.profile-avatar-wrap{position:relative;width:max-content;margin:0 auto 1rem}.profile-avatar-add{position:absolute;right:2px;bottom:2px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#111;border:3px solid var(--surface, #111);box-shadow:0 2px 10px #0005;cursor:pointer;z-index:2}.profile-avatar-add input{display:none}.profile-avatar-add:has(input:disabled){opacity:.75;cursor:wait}.profile-avatar-spinner{width:15px;height:15px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:profile-avatar-spin .7s linear infinite}@keyframes profile-avatar-spin{to{transform:rotate(360deg)}}`}</style><p className="eyebrow">YOUR CHATER IDENTITY</p><h1>You<span className="heading-dot">.</span></h1><div className="profile-card">
    <div className="profile-card-heading">
      <div className="profile-avatar-wrap">
        <ProfileAvatar className="large" photoURL={photoURL} displayName={user?.displayName}/>
        {user && <label className="profile-avatar-add" aria-label={photoBusy ? 'Uploading profile picture' : 'Add or change profile picture'} title={photoBusy ? 'Uploading picture…' : 'Add or change profile picture'}>
          {photoBusy ? <span className="profile-avatar-spinner" aria-hidden="true"/> : <Plus size={17} strokeWidth={2.5}/>}
          <input type="file" accept="image/*" disabled={photoBusy} onChange={e=>{const file=e.target.files?.[0];if(file)onPhotoUpload(file);e.currentTarget.value=''}}/>
        </label>}
      </div>
      {user && <button className="profile-edit-trigger" type="button" aria-label="Edit your profile" title="Edit your profile" onClick={()=>{
        setNameDraft(user.displayName || '')
        setUsernameDraft(username)
        setDetailsDraft(details)
        setProfileEditNotice('')
        setEditingProfile(true)
      }}><Pencil size={18}/></button>}
    </div>
    {!user ? <><h2>Your name</h2><p className="profile-handle">@yourusername</p></> : <>
      <h2>{user.displayName || 'Your name'}</h2>
      <p className="profile-handle">{username ? `@${username}` : user.email}</p>
      {!editingProfile ? <>
        {details.about ? <p className="profile-bio">{details.about}</p> : <p className="profile-details-empty">Add a short description to introduce yourself.</p>}
        {(details.location || details.occupation) && <dl className="profile-detail-list">
          {details.occupation && <div><dt>Occupation</dt><dd>{details.occupation}</dd></div>}
          {details.location && <div><dt>Location</dt><dd>{details.location}</dd></div>}
        </dl>}
      </> : <form className="registration-form profile-details-form profile-edit-form" aria-label="Edit your complete profile" onSubmit={async event=>{
        event.preventDefault()
        setProfileEditNotice('')
        const normalizedName=nameDraft.trim().replace(/\s+/g,' ')
        const normalizedUsername=usernameDraft.trim().toLowerCase()
        const normalizedDetails={
          about:detailsDraft.about.trim().replace(/\s+/g,' '),
          location:detailsDraft.location.trim().replace(/\s+/g,' '),
          occupation:detailsDraft.occupation.trim().replace(/\s+/g,' ')
        }
        if(normalizedName.length<2||normalizedName.length>50){setProfileEditNotice('Your profile name must be 2–50 characters.');return}
        if(!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)){setProfileEditNotice('Username must be 3–20 characters using lowercase letters, numbers or underscores.');return}
        if(normalizedDetails.about.length>160||normalizedDetails.location.length>60||normalizedDetails.occupation.length>60){setProfileEditNotice('Please check the character limits: About 160, Location 60, Occupation 60.');return}
        setProfileSaveBusy(true)
        try {
          await onDisplayNameChange(normalizedName)
          await onUsernameChange(normalizedUsername)
          await onDetailsChange(normalizedDetails)
          setEditingProfile(false)
          setProfileEditNotice('')
        } catch(error) {
          setProfileEditNotice(error instanceof Error?error.message:'We could not save your profile. Please try again.')
        } finally { setProfileSaveBusy(false) }
      }}>
        <label htmlFor="profile-name-edit">Profile name<input id="profile-name-edit" autoComplete="name" maxLength={50} value={nameDraft} onChange={event=>{setNameDraft(event.target.value);setProfileEditNotice('')}} placeholder="Your name"/></label>
        <label htmlFor="profile-username-edit">Username<input id="profile-username-edit" autoComplete="username" maxLength={20} value={usernameDraft} onChange={event=>{setUsernameDraft(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''));setProfileEditNotice('')}} placeholder="yourusername"/></label>
        <small>Username: 3–20 characters, lowercase letters, numbers and underscores.</small>
        <label htmlFor="profile-about-edit">About you<textarea id="profile-about-edit" rows={3} maxLength={160} value={detailsDraft.about} onChange={event=>{setDetailsDraft(current=>({...current,about:event.target.value}));setProfileEditNotice('')}} placeholder="A little about yourself…"/></label>
        <small className="profile-character-count">{detailsDraft.about.length}/160 characters</small>
        <label htmlFor="profile-occupation-edit">Occupation<input id="profile-occupation-edit" maxLength={60} value={detailsDraft.occupation} onChange={event=>{setDetailsDraft(current=>({...current,occupation:event.target.value}));setProfileEditNotice('')}} placeholder="What do you do?"/></label>
        <label htmlFor="profile-location-edit">Location<input id="profile-location-edit" maxLength={60} value={detailsDraft.location} onChange={event=>{setDetailsDraft(current=>({...current,location:event.target.value}));setProfileEditNotice('')}} placeholder="City or general area"/></label>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" disabled={profileSaveBusy} onClick={()=>{setEditingProfile(false);setNameDraft(user.displayName||'');setUsernameDraft(username);setDetailsDraft(details);setProfileEditNotice('')}}>Cancel</button>
          <button className="primary-button" type="submit" disabled={profileSaveBusy}>{profileSaveBusy?'Saving…':'Save profile'}</button>
        </div>
      </form>}
      {profileEditNotice&&<p className="dialog-notice" role="status">{profileEditNotice}</p>}
    </>}
    {(!user || !user.emailVerified) && <p className="profile-about">{user ? 'Please verify your email address.' : 'Add a little about yourself.'}</p>}
    {user ? <>
      {photoNotice&&<p className="dialog-notice profile-photo-notice" role="alert">{photoNotice}</p>}
      <button className="secondary-button profile-settings-button" onClick={onSettings}><Settings size={16}/> Chat settings</button>
    </> : <>
      <button className="primary-button profile-create-button" onClick={onRegister}>Create account</button>
      <button className="secondary-button profile-settings-button" onClick={onLogin}>Sign in</button>
      <button className="secondary-button profile-settings-button" onClick={onSettings}><Settings size={16}/> Chat settings</button>
    </>}
  </div><div className="profile-options"><button onClick={onSecurity}><ShieldCheck/><span><strong>Privacy and security</strong><small>Choose who can reach you</small></span><ChevronRight/></button><button onClick={onSettings}><Bell/><span><strong>Notifications</strong><small>Make Chater yours</small></span><ChevronRight/></button><button onClick={onSettings}><HelpCircle/><span><strong>Help and support</strong><small>We're here to help</small></span><ChevronRight/></button></div></div>
}