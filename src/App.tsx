import { useEffect, useMemo, useRef, useState } from 'react'
import { createUserWithEmailAndPassword, deleteUser, getAuth, onAuthStateChanged, reload, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile, type User } from 'firebase/auth'
import { firebaseApp, firestoreDb } from './lib/firebase'
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { MessageCircle, CirclePlay, Users, Phone, UserRound, Search, Plus, MoreHorizontal, ChevronRight, Settings, ShieldCheck, HelpCircle, Bell, X, ArrowUpRight, SlidersHorizontal } from 'lucide-react'

type Tab = 'Chats' | 'Moments' | 'Groups' | 'Calls' | 'You'
type Filter = 'All' | 'Unread' | 'Favorites' | 'Groups'
const accentPresets = [
  { name: 'Cyan', value: '#00fdff' },
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
const tabs: { label: Tab; icon: typeof MessageCircle }[] = [
  { label: 'Chats', icon: MessageCircle }, { label: 'Moments', icon: CirclePlay },
  { label: 'Groups', icon: Users }, { label: 'Calls', icon: Phone }, { label: 'You', icon: UserRound }
]
const filters: Filter[] = ['All', 'Unread', 'Favorites', 'Groups']
const ACCENT_STORAGE_KEY = 'chater:preferences:accent'
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
const isValidHexAccent = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value)
function readSavedAccent(userId?: string | null): string {
  try {
    const storageKey = userId ? `${ACCENT_STORAGE_KEY}:${userId}` : ACCENT_STORAGE_KEY
    const saved = window.localStorage.getItem(storageKey)
    return saved && isValidHexAccent(saved) ? saved.toLowerCase() : accentPresets[0].value
  } catch {
    return accentPresets[0].value
  }
}

function BrandLogo({ className }: { className: string }) {
  return <img className={className} src={`${import.meta.env.BASE_URL}icons/chater.svg`} alt="Chater logo" />
}

function SplashScreen() {
  return <div className="splash-screen" aria-label="Chater from GOZIE"><div className="splash-brand"><BrandLogo className="brand-logo" /><span>Chater</span></div><p>from <strong>GOZIE</strong></p></div>
}
function EmptyIllustration({ icon: Icon }: { icon: typeof MessageCircle }) {
  return <div className="empty-art"><div className="empty-orbit orbit-one"/><div className="empty-orbit orbit-two"/><div className="empty-icon"><Icon size={34} strokeWidth={1.5}/></div><span className="sparkle sparkle-a">✦</span><span className="sparkle sparkle-b">✧</span></div>
}

const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'amzak6nf'
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'chater_profiles'

function ProfileAvatar({ photoURL, displayName, className = '' }: { photoURL?: string | null; displayName?: string | null; className?: string }) {
  const initial = displayName?.trim().charAt(0).toUpperCase()
  return <span className={`profile-avatar ${className}`} aria-label={displayName ? `${displayName} profile picture` : 'Default profile picture'}>
    {photoURL ? <img src={photoURL} alt="" /> : initial || <UserRound size={20} />}
  </span>
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('Chats')
  const [filter, setFilter] = useState<Filter>('All')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<'new-chat' | 'search' | 'settings' | 'register' | 'login' | 'recover' | null>(null)
  const [username, setUsername] = useState('')
  const [searchNotice, setSearchNotice] = useState('')
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
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoNotice, setPhotoNotice] = useState('')
  const [accent, setAccent] = useState(readSavedAccent)
  const [theme, setTheme] = useState<ThemePreference>(readSavedTheme)
  const [wallpaper, setWallpaper] = useState<Wallpaper>(readSavedWallpaper)
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>(readSavedBubbleStyle)
  const [customHex, setCustomHex] = useState(readSavedAccent)
  const [customHexNotice, setCustomHexNotice] = useState('')
  const normalizedCustomHex = /^#?[0-9a-fA-F]{6}$/.test(customHex.trim()) ? (customHex.trim().startsWith('#') ? customHex.trim() : `#${customHex.trim()}`) : ''
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-bright', accent)
    document.documentElement.style.setProperty('--accent-soft', `${accent}22`)
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
      root.dataset.theme = resolved
      root.dataset.themePreference = theme
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
        return
      }
      try {
        await reload(user)
        if (!user.emailVerified) {
          setAuthUser(null)
          setProfilePhotoUrl('')
          await signOut(firebaseAuth)
          return
        }
        setAuthUser(user)
        const savedAccent = readSavedAccent(user.uid)
        setAccent(savedAccent)
        setCustomHex(savedAccent)
        setProfilePhotoUrl(user.photoURL || '')
        const profileSnapshot = firestoreDb ? await getDoc(doc(firestoreDb, 'users', user.uid)) : null
        const storedUsername = profileSnapshot?.data()?.username
        const localUsername = window.localStorage.getItem(`chater:profile:username:${user.uid}`) || ''
        const resolvedUsername = typeof storedUsername === 'string' ? storedUsername : localUsername
        setProfileUsername(resolvedUsername)
        if (resolvedUsername) window.localStorage.setItem(`chater:profile:username:${user.uid}`, resolvedUsername)
      } catch {
        setAuthUser(null)
        await signOut(firebaseAuth).catch(() => undefined)
      }
    })
  }, [])
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
      transaction.set(userRef, { uid: authUser.uid, username: normalized, updatedAt: serverTimestamp() }, { merge: true })
    })
    setProfileUsername(normalized)
    try { window.localStorage.setItem(`chater:profile:username:${authUser.uid}`, normalized) } catch { /* Firestore remains the source of truth. */ }
  }
  const handleDisplayNameChange = async (nextName: string) => {
    if (!authUser) throw new Error('Sign in to edit your profile name.')
    const normalized = nextName.trim().replace(/\s+/g, ' ')
    if (normalized.length < 2 || normalized.length > 50) throw new Error('Your profile name must be 2–50 characters.')
    if (normalized === (authUser.displayName || '')) return
    await updateProfile(authUser, { displayName: normalized })
    if (firestoreDb) {
      await runTransaction(firestoreDb, async transaction => {
        transaction.set(doc(firestoreDb, 'users', authUser.uid), {
          uid: authUser.uid, username: profileUsername, displayName: normalized, updatedAt: serverTimestamp()
        }, { merge: true })
      })
    }
    setAuthUser({ ...authUser, displayName: normalized } as User)
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
    Moments: { eyebrow: 'LIFE IN LITTLE UPDATES', title: 'Moments', description: 'Share a little piece of your day. Moments disappear after 24 hours.', action: 'Share a Moment', icon: CirclePlay },
    Groups: { eyebrow: 'YOUR PEOPLE, TOGETHER', title: 'Groups', description: 'Create group chats, bring people together, and share with everyone in the group.', action: 'Create a group', icon: Users },
    Calls: { eyebrow: 'CLOSER, WHEREVER YOU ARE', title: 'Calls', description: 'Your voice and video call history will appear here.', action: 'Start a call', icon: Phone }
  }), [])
  if (showSplash) return <SplashScreen />
  const openTab = (tab: Tab) => { setActiveTab(tab); setDialog(null) }
  return <main className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className="desktop-rail">
      <div className="rail-brand"><BrandLogo className="brand-logo" /><span>Chater</span></div>
      <nav aria-label="Main navigation" className="rail-nav">{tabs.map(({label,icon:Icon}) => <button key={label} aria-current={activeTab===label ? 'page' : undefined} className={activeTab===label?'rail-link active':'rail-link'} onClick={()=>openTab(label)}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="rail-bottom"><button className="rail-link" onClick={()=>setDialog('settings')}><Settings size={19}/><span>Settings</span></button><div className="rail-profile"><ProfileAvatar photoURL={profilePhotoUrl} displayName={authUser?.displayName}/><div><strong>{authUser?.displayName || 'Your profile'}</strong><small>{authUser ? 'Chater account' : 'Set up your account'}</small></div><MoreHorizontal size={18}/></div></div>
    </aside>
    <section className="main-column" id="main-content" tabIndex={-1}>
      <header className="topbar">
        <div className="mobile-brand"><BrandLogo className="brand-logo" /><span>Chater</span></div>
        <div className="topbar-title"><span className="eyebrow">CONNECT. CONVERSE. SHARE.</span><strong>{activeTab}</strong></div>
        <div className="top-actions"><button className="icon-button" aria-label="Search" onClick={()=>setDialog('search')}><Search size={20}/></button><button className="icon-button" aria-label="Settings" onClick={()=>setDialog('settings')}><Settings size={19}/></button><button className="avatar-button" aria-label="Your profile" onClick={()=>openTab('You')}><ProfileAvatar className="top-avatar" photoURL={profilePhotoUrl} displayName={authUser?.displayName}/></button></div>
      </header>
      <div className="content-wrap">
        {activeTab==='Chats' && <>
          <div className="page-heading"><div><p className="eyebrow">YOUR CONVERSATIONS</p><h1>Chats<span className="heading-dot">.</span></h1><p className="subheading">Your people are just a message away.</p></div><button className="primary-button desktop-new" onClick={()=>setDialog('new-chat')}><Plus size={17}/> New chat</button></div>
          <div className="chat-toolbar"><label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search conversations or @username"/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={15}/></button>}</label><button className="filter-button" aria-label="More filters"><SlidersHorizontal size={18}/></button></div>
          <div className="filter-row" role="group" aria-label="Chat filters">{filters.map(item=><button key={item} className={filter===item?'filter-chip selected':'filter-chip'} onClick={()=>setFilter(item)}>{item}</button>)}</div>
          <div className="empty-state chat-empty"><EmptyIllustration icon={MessageCircle}/><p className="eyebrow">A FRESH START</p><h2>Your conversations<br/>start here.</h2><p className="empty-description">{query?'No conversations match that search yet.':'Find someone by their unique Chater username and say hello.'}</p><button className="primary-button" onClick={()=>setDialog('new-chat')}><Plus size={17}/> Start a conversation</button><button className="text-button" onClick={()=>setDialog('search')}>Find people by username <ArrowUpRight size={15}/></button></div>
        </>}
        {activeTab==='Moments'&&<FeatureEmpty data={pageCopy.Moments} onAction={()=>setDialog('new-chat')}/>}
        {activeTab==='Groups'&&<FeatureEmpty data={pageCopy.Groups} onAction={()=>setDialog('new-chat')}/>}
        {activeTab==='Calls'&&<FeatureEmpty data={pageCopy.Calls} onAction={()=>setDialog('new-chat')}/>}
        {activeTab==='You'&&<ProfileScreen user={authUser} photoURL={profilePhotoUrl} username={profileUsername} onUsernameChange={handleUsernameChange} onDisplayNameChange={handleDisplayNameChange} onPhotoUpload={handleProfilePhotoUpload} photoBusy={photoBusy} photoNotice={photoNotice} onSettings={()=>setDialog('settings')} onRegister={()=>{setRegistrationNotice('');setDialog('register')}} onLogin={()=>{setLoginNotice('');setDialog('login')}} onSignOut={async()=>{
          if(!firebaseAuth)return
          try {
            await signOut(firebaseAuth)
            setAuthUser(null)
            setProfilePhotoUrl('')
            setProfileUsername('')
            setPhotoNotice('')
            setLoginPassword('')
            setLoginNotice('')
            const savedAccent=readSavedAccent()
            setAccent(savedAccent)
            setCustomHex(savedAccent)
          } catch {
            setPhotoNotice('We could not sign you out. Check your connection and try again.')
          }
        }}/>}
      </div>
    </section>
    <button className="compose-button" aria-label="Start a new chat" onClick={()=>setDialog('new-chat')}><Plus size={25}/></button>
    <nav className="bottom-nav" aria-label="Main navigation">{tabs.map(({label,icon:Icon})=><button key={label} aria-current={activeTab===label ? 'page' : undefined} className={activeTab===label?'nav-item active':'nav-item'} onClick={()=>openTab(label)}><Icon size={21} strokeWidth={activeTab===label?2.3:1.8}/><span>{label}</span></button>)}</nav>
    {dialog&&<div className="dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null)}}><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><div><p className="eyebrow">CHATER</p><h2 id="dialog-title">{dialog==='new-chat'?'Start a conversation':dialog==='search'?'Find people':dialog==='register'?'Create your account':dialog==='login'?'Sign in':dialog==='recover'?'Reset your password':'Settings'}</h2></div><button className="icon-button" aria-label="Close" onClick={()=>setDialog(null)}><X size={20}/></button></div>{dialog==='settings'?<><section className="theme-settings" aria-labelledby="theme-title"><div className="accent-settings-heading"><h3 id="theme-title">Appearance</h3><span>{theme === 'system' ? 'Follows device' : theme === 'light' ? 'Light mode' : 'Dark mode'}</span></div><label className="theme-select-label" htmlFor="theme-preference">Theme</label><select id="theme-preference" className="theme-select" value={theme} onChange={e=>setTheme(e.target.value as ThemePreference)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select><p className="accent-help">System follows your device appearance setting and updates when it changes.</p></section><section className="wallpaper-settings" aria-labelledby="wallpaper-title"><div className="accent-settings-heading"><h3 id="wallpaper-title">Chat wallpaper</h3><span>{wallpapers.find(item => item.id === wallpaper)?.name}</span></div><div className="wallpaper-options" role="group" aria-label="Choose a chat wallpaper">{wallpapers.map(item=><button key={item.id} type="button" className={wallpaper === item.id ? 'wallpaper-option selected' : 'wallpaper-option'} data-wallpaper={item.id} aria-label={item.name} aria-pressed={wallpaper === item.id} onClick={()=>setWallpaper(item.id)}><span className="wallpaper-swatch"/><small>{item.name}</small></button>)}</div><div className="chat-wallpaper-preview" data-wallpaper={wallpaper} aria-label="Chat wallpaper preview"><span className="preview-day">TODAY</span><div className="preview-message received">Your conversations, your style.</div><div className="preview-message sent">Choose a wallpaper you like.</div></div><p className="accent-help">Preview your wallpaper here. It will be used on chat conversation backgrounds as messaging is connected.</p></section><section className="bubble-settings" aria-labelledby="bubble-title"><div className="accent-settings-heading"><h3 id="bubble-title">Message bubbles</h3><span>{bubbleStyles.find(item => item.id === bubbleStyle)?.name}</span></div><div className="bubble-style-options" role="group" aria-label="Choose a message bubble style">{bubbleStyles.map(item=><button key={item.id} type="button" className={bubbleStyle === item.id ? 'bubble-style-option selected' : 'bubble-style-option'} aria-label={item.name} aria-pressed={bubbleStyle === item.id} onClick={()=>setBubbleStyle(item.id)}><span className="bubble-style-sample" data-bubble-style={item.id}><i/><b/></span><small>{item.name}</small></button>)}</div><div className="bubble-preview" data-bubble-style={bubbleStyle} aria-label="Message bubble preview"><span className="bubble-preview-incoming">Hey! How's your day?</span><span className="bubble-preview-outgoing">Going well, thanks!</span></div><p className="accent-help">Choose the shape of message bubbles. Your choice is saved on this device and will style connected chats.</p></section><section className="accent-settings" aria-labelledby="accent-title"><div className="accent-settings-heading"><h3 id="accent-title">Accent colour</h3><span>{accentPresets.find(item=>item.value===accent)?.name ?? 'Custom'}</span></div><div className="accent-palette" role="group" aria-label="Choose an accent colour">{accentPresets.map(item=><button key={item.value} type="button" className="accent-swatch" style={{'--swatch':item.value} as React.CSSProperties} aria-label={item.name} aria-pressed={accent===item.value} onClick={()=>{setAccent(item.value);setCustomHex(item.value)}}><span/></button>)}</div><p className="accent-help">Choose a colour to personalize buttons, highlights and active navigation.</p><div className="custom-accent"><label htmlFor="custom-accent-hex">Custom HEX colour</label><div className="custom-accent-controls"><input id="custom-accent-hex" type="text" inputMode="text" autoCapitalize="characters" maxLength={7} value={customHex} onChange={e=>{setCustomHex(e.target.value);setCustomHexNotice('')}} placeholder="#RRGGBB" aria-describedby="custom-accent-help"/><button type="button" className="secondary-button" disabled={!normalizedCustomHex} onClick={()=>{setAccent(normalizedCustomHex.toLowerCase());setCustomHex(normalizedCustomHex.toLowerCase());setCustomHexNotice('Custom accent colour applied.')}}>Apply</button></div><p id="custom-accent-help" className="accent-help">Enter a six-digit HEX value, with or without #.</p>{customHexNotice&&<p className="custom-accent-notice" role="status">{customHexNotice}</p>}</div></section><div className="settings-list"><button onClick={()=>{setDialog(null);openTab('You')}}><UserRound/> Profile <ChevronRight/></button><button><Bell/> Notifications <ChevronRight/></button><button><ShieldCheck/> Privacy and security <ChevronRight/></button><button><HelpCircle/> Help <ChevronRight/></button></div><p className="dialog-copy">Account and privacy controls will be connected in a later implementation task.</p></>:dialog==='register'?<form className="registration-form" onSubmit={async e=>{
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
            transaction.set(userProfileRef, { uid: credential.user.uid, username: registrationUsername, displayName: registrationName.trim(), createdAt: serverTimestamp() }, { merge: true })
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
        const profileSnapshot = firestoreDb ? await getDoc(doc(firestoreDb, 'users', credential.user.uid)) : null
        const storedUsername = profileSnapshot?.data()?.username
        const localUsername = window.localStorage.getItem(`chater:profile:username:${credential.user.uid}`) || ''
        const resolvedUsername = typeof storedUsername === 'string' ? storedUsername : localUsername
        setProfileUsername(resolvedUsername)
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
    </form>:<><p className="dialog-copy">Search with someone's unique username. Their email address stays private.</p><label className="search-box dialog-search"><Search size={18}/><input autoFocus value={username} onChange={e=>{setUsername(e.target.value.replace(/^@/,''));setSearchNotice('')}} placeholder="@username"/><button aria-label="Clear username" onClick={()=>setUsername('')}><X size={15}/></button></label><button className="primary-button dialog-action" onClick={()=>setSearchNotice('Username discovery will be connected when account and discovery services are implemented.')} disabled={!username.trim()}><Search size={17}/> Search username</button>{searchNotice&&<p className="dialog-notice" role="status">{searchNotice}</p>}</>}</section></div>}
  </main>
}

function FeatureEmpty({data,onAction}:{data:{eyebrow:string;title:string;description:string;action:string;icon:typeof MessageCircle};onAction:()=>void}) {
  const Icon=data.icon
  return <div className="feature-page"><div className="page-heading"><div><p className="eyebrow">{data.eyebrow}</p><h1>{data.title}<span className="heading-dot">.</span></h1><p className="subheading">{data.description}</p></div></div><div className="empty-state feature-empty"><EmptyIllustration icon={Icon}/><h2>Make this space<br/>your own.</h2><p className="empty-description">This is where your {data.title.toLowerCase()} will live. Get started when you're ready.</p><button className="primary-button" onClick={onAction}><Plus size={17}/>{data.action}</button></div></div>
}
function ProfileScreen({user,photoURL,username,onUsernameChange,onDisplayNameChange,onPhotoUpload,photoBusy,photoNotice,onSettings,onRegister,onLogin,onSignOut}:{user:User|null;photoURL:string;username:string;onUsernameChange:(username:string)=>Promise<void>;onDisplayNameChange:(name:string)=>Promise<void>;onPhotoUpload:(file:File)=>void;photoBusy:boolean;photoNotice:string;onSettings:()=>void;onRegister:()=>void;onLogin:()=>void;onSignOut:()=>void}) {
  const [confirmSignOut,setConfirmSignOut] = useState(false)
  const [editingName,setEditingName] = useState(false)
  const [nameDraft,setNameDraft] = useState(user?.displayName || '')
  const [nameBusy,setNameBusy] = useState(false)
  const [nameNotice,setNameNotice] = useState('')
  useEffect(() => { setNameDraft(user?.displayName || '') }, [user?.displayName])
  const [editingUsername,setEditingUsername] = useState(false)
  const [usernameDraft,setUsernameDraft] = useState(username)
  const [usernameBusy,setUsernameBusy] = useState(false)
  const [usernameNotice,setUsernameNotice] = useState('')
  useEffect(() => { setUsernameDraft(username) }, [username])
  return <div className="profile-page">
    <style>{`.profile-avatar-wrap{position:relative;width:max-content;margin:0 auto 1rem}.profile-avatar-add{position:absolute;right:2px;bottom:2px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#111;border:3px solid var(--surface, #111);box-shadow:0 2px 10px #0005;cursor:pointer;z-index:2}.profile-avatar-add input{display:none}.profile-avatar-add:has(input:disabled){opacity:.75;cursor:wait}.profile-avatar-spinner{width:15px;height:15px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:profile-avatar-spin .7s linear infinite}@keyframes profile-avatar-spin{to{transform:rotate(360deg)}}`}</style><p className="eyebrow">YOUR CHATER IDENTITY</p><h1>You<span className="heading-dot">.</span></h1><div className="profile-card">
    <div className="profile-avatar-wrap">
      <ProfileAvatar className="large" photoURL={photoURL} displayName={user?.displayName}/>
      {user && <label className="profile-avatar-add" aria-label={photoBusy ? 'Uploading profile picture' : 'Add or change profile picture'} title={photoBusy ? 'Uploading picture…' : 'Add or change profile picture'}>
        {photoBusy ? <span className="profile-avatar-spinner" aria-hidden="true"/> : <Plus size={17} strokeWidth={2.5}/>}
        <input type="file" accept="image/*" disabled={photoBusy} onChange={e=>{const file=e.target.files?.[0];if(file)onPhotoUpload(file);e.currentTarget.value=''}}/>
      </label>}
    </div>
    {!user ? <h2>Your name</h2> : !editingName ? <><h2>{user.displayName || 'Your name'}</h2><button className="secondary-button" type="button" onClick={()=>{setNameDraft(user.displayName || '');setNameNotice('');setEditingName(true)}}>Edit profile name</button></> : <form className="registration-form" aria-label="Edit profile name" onSubmit={async event=>{
      event.preventDefault()
      setNameNotice('')
      const normalized=nameDraft.trim().replace(/\s+/g,' ')
      if(normalized.length<2||normalized.length>50){setNameNotice('Your profile name must be 2–50 characters.');return}
      setNameBusy(true)
      try{await onDisplayNameChange(normalized);setEditingName(false);setNameNotice('Your profile name has been updated.')}
      catch(error){setNameNotice(error instanceof Error?error.message:'We could not update your profile name. Please try again.')}
      finally{setNameBusy(false)}
    }}><label htmlFor="profile-name-edit">Profile name<input id="profile-name-edit" autoComplete="name" maxLength={50} value={nameDraft} onChange={event=>{setNameDraft(event.target.value);setNameNotice('')}} placeholder="Your name"/></label><div className="dialog-actions"><button className="secondary-button" type="button" disabled={nameBusy} onClick={()=>{setEditingName(false);setNameDraft(user.displayName||'');setNameNotice('')}}>Cancel</button><button className="primary-button" type="submit" disabled={nameBusy}>{nameBusy?'Saving…':'Save name'}</button></div></form>}
    {nameNotice&&<p className="dialog-notice" role="status">{nameNotice}</p>}
    <p className="profile-handle">{user ? (username ? `@${username}` : user.email) : '@yourusername'}</p>
    {user && <div className="profile-username-editor">
      {!editingUsername ? <button className="secondary-button" type="button" onClick={()=>{setUsernameDraft(username);setUsernameNotice('');setEditingUsername(true)}}>Edit username</button> : <form className="registration-form" onSubmit={async event=>{
        event.preventDefault()
        setUsernameNotice('')
        const normalized=usernameDraft.trim().toLowerCase()
        if(!/^[a-z0-9_]{3,20}$/.test(normalized)){setUsernameNotice('Username must be 3–20 characters using lowercase letters, numbers or underscores.');return}
        setUsernameBusy(true)
        try { await onUsernameChange(normalized); setEditingUsername(false); setUsernameNotice('Your username has been updated.') }
        catch(error){setUsernameNotice(error instanceof Error?error.message:'We could not update your username. Please try again.')}
        finally {setUsernameBusy(false)}
      }}>
        <label htmlFor="profile-username-edit">Username<input id="profile-username-edit" autoComplete="username" maxLength={20} value={usernameDraft} onChange={event=>{setUsernameDraft(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''));setUsernameNotice('')}} placeholder="yourusername"/></label>
        <small>3–20 characters: lowercase letters, numbers and underscores.</small>
        <div className="dialog-actions"><button className="secondary-button" type="button" disabled={usernameBusy} onClick={()=>{setEditingUsername(false);setUsernameDraft(username);setUsernameNotice('')}}>Cancel</button><button className="primary-button" type="submit" disabled={usernameBusy}>{usernameBusy?'Saving…':'Save username'}</button></div>
      </form>}
      {usernameNotice&&<p className="dialog-notice" role="status">{usernameNotice}</p>}
    </div>}
    {(!user || !user.emailVerified) && <p className="profile-about">{user ? 'Please verify your email address.' : 'Add a little about yourself.'}</p>}
    {user ? <>
      {photoNotice&&<p className="dialog-notice profile-photo-notice" role="alert">{photoNotice}</p>}
      <button className="secondary-button profile-settings-button" onClick={onSettings}><Settings size={16}/> Profile settings</button>
      <button className="text-button profile-signout" onClick={()=>setConfirmSignOut(true)}>Sign out</button>
      {confirmSignOut && <div className="dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setConfirmSignOut(false)}}><section className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description"><div className="dialog-head"><div><p className="eyebrow">CHATER</p><h2 id="signout-title">Sign out?</h2></div><button className="icon-button" aria-label="Close confirmation" onClick={()=>setConfirmSignOut(false)}><X size={18}/></button></div><p className="dialog-copy" id="signout-description">Are you sure you want to sign out of your account?</p><div className="dialog-actions"><button className="secondary-button" onClick={()=>setConfirmSignOut(false)}>Cancel</button><button className="primary-button" onClick={onSignOut}>Yes, sign out</button></div></section></div>}
    </> : <>
      <button className="primary-button profile-create-button" onClick={onRegister}>Create account</button>
      <button className="secondary-button profile-settings-button" onClick={onLogin}>Sign in</button>
      <button className="secondary-button profile-settings-button" onClick={onSettings}><Settings size={16}/> Profile settings</button>
    </>}
  </div><div className="profile-options"><button onClick={onSettings}><ShieldCheck/><span><strong>Privacy and security</strong><small>Choose who can reach you</small></span><ChevronRight/></button><button onClick={onSettings}><Bell/><span><strong>Notifications</strong><small>Make Chater yours</small></span><ChevronRight/></button><button onClick={onSettings}><HelpCircle/><span><strong>Help and support</strong><small>We're here to help</small></span><ChevronRight/></button></div></div>
}