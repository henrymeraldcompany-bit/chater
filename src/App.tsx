import { useEffect, useMemo, useState } from 'react'
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
function readSavedAccent(): string {
  try {
    const saved = window.localStorage.getItem(ACCENT_STORAGE_KEY)
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

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('Chats')
  const [filter, setFilter] = useState<Filter>('All')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<'new-chat' | 'search' | 'settings' | 'register' | null>(null)
  const [username, setUsername] = useState('')
  const [searchNotice, setSearchNotice] = useState('')
  const [registrationName, setRegistrationName] = useState('')
  const [registrationEmail, setRegistrationEmail] = useState('')
  const [registrationUsername, setRegistrationUsername] = useState('')
  const [registrationPassword, setRegistrationPassword] = useState('')
  const [registrationConfirm, setRegistrationConfirm] = useState('')
  const [registrationNotice, setRegistrationNotice] = useState('')
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
    try { window.localStorage.setItem(ACCENT_STORAGE_KEY, accent) } catch { /* Accent remains active for this session. */ }
  }, [accent])
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
  useEffect(() => { const timer = window.setTimeout(() => setShowSplash(false), 1500); return () => window.clearTimeout(timer) }, [])
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
      <div className="rail-bottom"><button className="rail-link" onClick={()=>setDialog('settings')}><Settings size={19}/><span>Settings</span></button><div className="rail-profile"><div className="profile-avatar">H</div><div><strong>Your profile</strong><small>Set up your account</small></div><MoreHorizontal size={18}/></div></div>
    </aside>
    <section className="main-column" id="main-content" tabIndex={-1}>
      <header className="topbar">
        <div className="mobile-brand"><BrandLogo className="brand-logo" /><span>Chater</span></div>
        <div className="topbar-title"><span className="eyebrow">CONNECT. CONVERSE. SHARE.</span><strong>{activeTab}</strong></div>
        <div className="top-actions"><button className="icon-button" aria-label="Search" onClick={()=>setDialog('search')}><Search size={20}/></button><button className="icon-button" aria-label="Settings" onClick={()=>setDialog('settings')}><Settings size={19}/></button><button className="profile-avatar top-avatar" aria-label="Your profile" onClick={()=>openTab('You')}>H</button></div>
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
        {activeTab==='You'&&<ProfileScreen onSettings={()=>setDialog('settings')} onRegister={()=>{setRegistrationNotice('');setDialog('register')}}/>}
      </div>
    </section>
    <button className="compose-button" aria-label="Start a new chat" onClick={()=>setDialog('new-chat')}><Plus size={25}/></button>
    <nav className="bottom-nav" aria-label="Main navigation">{tabs.map(({label,icon:Icon})=><button key={label} aria-current={activeTab===label ? 'page' : undefined} className={activeTab===label?'nav-item active':'nav-item'} onClick={()=>openTab(label)}><Icon size={21} strokeWidth={activeTab===label?2.3:1.8}/><span>{label}</span></button>)}</nav>
    {dialog&&<div className="dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null)}}><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><div><p className="eyebrow">CHATER</p><h2 id="dialog-title">{dialog==='new-chat'?'Start a conversation':dialog==='search'?'Find people':dialog==='register'?'Create your account':'Settings'}</h2></div><button className="icon-button" aria-label="Close" onClick={()=>setDialog(null)}><X size={20}/></button></div>{dialog==='settings'?<><section className="theme-settings" aria-labelledby="theme-title"><div className="accent-settings-heading"><h3 id="theme-title">Appearance</h3><span>{theme === 'system' ? 'Follows device' : theme === 'light' ? 'Light mode' : 'Dark mode'}</span></div><label className="theme-select-label" htmlFor="theme-preference">Theme</label><select id="theme-preference" className="theme-select" value={theme} onChange={e=>setTheme(e.target.value as ThemePreference)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select><p className="accent-help">System follows your device appearance setting and updates when it changes.</p></section><section className="wallpaper-settings" aria-labelledby="wallpaper-title"><div className="accent-settings-heading"><h3 id="wallpaper-title">Chat wallpaper</h3><span>{wallpapers.find(item => item.id === wallpaper)?.name}</span></div><div className="wallpaper-options" role="group" aria-label="Choose a chat wallpaper">{wallpapers.map(item=><button key={item.id} type="button" className={wallpaper === item.id ? 'wallpaper-option selected' : 'wallpaper-option'} data-wallpaper={item.id} aria-label={item.name} aria-pressed={wallpaper === item.id} onClick={()=>setWallpaper(item.id)}><span className="wallpaper-swatch"/><small>{item.name}</small></button>)}</div><div className="chat-wallpaper-preview" data-wallpaper={wallpaper} aria-label="Chat wallpaper preview"><span className="preview-day">TODAY</span><div className="preview-message received">Your conversations, your style.</div><div className="preview-message sent">Choose a wallpaper you like.</div></div><p className="accent-help">Preview your wallpaper here. It will be used on chat conversation backgrounds as messaging is connected.</p></section><section className="bubble-settings" aria-labelledby="bubble-title"><div className="accent-settings-heading"><h3 id="bubble-title">Message bubbles</h3><span>{bubbleStyles.find(item => item.id === bubbleStyle)?.name}</span></div><div className="bubble-style-options" role="group" aria-label="Choose a message bubble style">{bubbleStyles.map(item=><button key={item.id} type="button" className={bubbleStyle === item.id ? 'bubble-style-option selected' : 'bubble-style-option'} aria-label={item.name} aria-pressed={bubbleStyle === item.id} onClick={()=>setBubbleStyle(item.id)}><span className="bubble-style-sample" data-bubble-style={item.id}><i/><b/></span><small>{item.name}</small></button>)}</div><div className="bubble-preview" data-bubble-style={bubbleStyle} aria-label="Message bubble preview"><span className="bubble-preview-incoming">Hey! How's your day?</span><span className="bubble-preview-outgoing">Going well, thanks!</span></div><p className="accent-help">Choose the shape of message bubbles. Your choice is saved on this device and will style connected chats.</p></section><section className="accent-settings" aria-labelledby="accent-title"><div className="accent-settings-heading"><h3 id="accent-title">Accent colour</h3><span>{accentPresets.find(item=>item.value===accent)?.name ?? 'Custom'}</span></div><div className="accent-palette" role="group" aria-label="Choose an accent colour">{accentPresets.map(item=><button key={item.value} type="button" className="accent-swatch" style={{'--swatch':item.value} as React.CSSProperties} aria-label={item.name} aria-pressed={accent===item.value} onClick={()=>{setAccent(item.value);setCustomHex(item.value)}}><span/></button>)}</div><p className="accent-help">Choose a colour to personalize buttons, highlights and active navigation.</p><div className="custom-accent"><label htmlFor="custom-accent-hex">Custom HEX colour</label><div className="custom-accent-controls"><input id="custom-accent-hex" type="text" inputMode="text" autoCapitalize="characters" maxLength={7} value={customHex} onChange={e=>{setCustomHex(e.target.value);setCustomHexNotice('')}} placeholder="#RRGGBB" aria-describedby="custom-accent-help"/><button type="button" className="secondary-button" disabled={!normalizedCustomHex} onClick={()=>{setAccent(normalizedCustomHex.toLowerCase());setCustomHex(normalizedCustomHex.toLowerCase());setCustomHexNotice('Custom accent colour applied.')}}>Apply</button></div><p id="custom-accent-help" className="accent-help">Enter a six-digit HEX value, with or without #.</p>{customHexNotice&&<p className="custom-accent-notice" role="status">{customHexNotice}</p>}</div></section><div className="settings-list"><button onClick={()=>{setDialog(null);openTab('You')}}><UserRound/> Profile <ChevronRight/></button><button><Bell/> Notifications <ChevronRight/></button><button><ShieldCheck/> Privacy and security <ChevronRight/></button><button><HelpCircle/> Help <ChevronRight/></button></div><p className="dialog-copy">Account and privacy controls will be connected in a later implementation task.</p></>:dialog==='register'?<form className="registration-form" onSubmit={e=>{e.preventDefault();const validUsername=/^[a-z0-9_]{3,20}$/.test(registrationUsername);if(!validUsername){setRegistrationNotice('Username must be 3–20 characters using lowercase letters, numbers or underscores.');return}if(registrationPassword.length<8){setRegistrationNotice('Choose a password with at least 8 characters.');return}if(registrationPassword!==registrationConfirm){setRegistrationNotice('Your passwords do not match.');return}setRegistrationNotice('Your details are valid. Account creation and email verification will be connected in the next authentication tasks.')}}><p className="dialog-copy">Create a Chater identity. Your email stays private; your username is how people can find you.</p><label>Full name<input required autoComplete="name" value={registrationName} onChange={e=>setRegistrationName(e.target.value)} placeholder="Your name" maxLength={60}/></label><label>Email address<input required type="email" autoComplete="email" value={registrationEmail} onChange={e=>setRegistrationEmail(e.target.value)} placeholder="you@example.com"/></label><label>Username<input required autoComplete="username" value={registrationUsername} onChange={e=>{setRegistrationUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''));setRegistrationNotice('')}} placeholder="yourusername" maxLength={20}/><small>3–20 characters: lowercase letters, numbers and underscores.</small></label><label>Password<input required type="password" autoComplete="new-password" value={registrationPassword} onChange={e=>{setRegistrationPassword(e.target.value);setRegistrationNotice('')}} minLength={8} placeholder="At least 8 characters"/></label><label>Confirm password<input required type="password" autoComplete="new-password" value={registrationConfirm} onChange={e=>{setRegistrationConfirm(e.target.value);setRegistrationNotice('')}} minLength={8} placeholder="Enter your password again"/></label><button className="primary-button dialog-action" type="submit">Continue</button>{registrationNotice&&<p className="dialog-notice" role="status">{registrationNotice}</p>}<p className="registration-footnote">Email verification will be required when account services are connected.</p></form>:<><p className="dialog-copy">Search with someone's unique username. Their email address stays private.</p><label className="search-box dialog-search"><Search size={18}/><input autoFocus value={username} onChange={e=>{setUsername(e.target.value.replace(/^@/,''));setSearchNotice('')}} placeholder="@username"/><button aria-label="Clear username" onClick={()=>setUsername('')}><X size={15}/></button></label><button className="primary-button dialog-action" onClick={()=>setSearchNotice('Username discovery will be connected when account and discovery services are implemented.')} disabled={!username.trim()}><Search size={17}/> Search username</button>{searchNotice&&<p className="dialog-notice" role="status">{searchNotice}</p>}</>}</section></div>}
  </main>
}

function FeatureEmpty({data,onAction}:{data:{eyebrow:string;title:string;description:string;action:string;icon:typeof MessageCircle};onAction:()=>void}) {
  const Icon=data.icon
  return <div className="feature-page"><div className="page-heading"><div><p className="eyebrow">{data.eyebrow}</p><h1>{data.title}<span className="heading-dot">.</span></h1><p className="subheading">{data.description}</p></div></div><div className="empty-state feature-empty"><EmptyIllustration icon={Icon}/><h2>Make this space<br/>your own.</h2><p className="empty-description">This is where your {data.title.toLowerCase()} will live. Get started when you're ready.</p><button className="primary-button" onClick={onAction}><Plus size={17}/>{data.action}</button></div></div>
}
function ProfileScreen({onSettings,onRegister}:{onSettings:()=>void;onRegister:()=>void}) {
  return <div className="profile-page"><p className="eyebrow">YOUR CHATER IDENTITY</p><h1>You<span className="heading-dot">.</span></h1><div className="profile-card"><div className="profile-avatar large">H</div><h2>Your name</h2><p className="profile-handle">@yourusername</p><p className="profile-about">Add a little about yourself.</p><button className="primary-button" onClick={onRegister}>Create account</button><button className="secondary-button" onClick={onSettings}><Settings size={16}/> Profile settings</button></div><div className="profile-options"><button onClick={onSettings}><ShieldCheck/><span><strong>Privacy and security</strong><small>Choose who can reach you</small></span><ChevronRight/></button><button onClick={onSettings}><Bell/><span><strong>Notifications</strong><small>Make Chater yours</small></span><ChevronRight/></button><button onClick={onSettings}><HelpCircle/><span><strong>Help and support</strong><small>We're here to help</small></span><ChevronRight/></button></div></div>
}
