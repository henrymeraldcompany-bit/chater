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
  const [dialog, setDialog] = useState<'new-chat' | 'search' | 'settings' | null>(null)
  const [username, setUsername] = useState('')
  const [searchNotice, setSearchNotice] = useState('')
  const [accent, setAccent] = useState(accentPresets[0].value)
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-bright', accent)
    document.documentElement.style.setProperty('--accent-soft', `${accent}22`)
  }, [accent])
  useEffect(() => { const timer = window.setTimeout(() => setShowSplash(false), 1500); return () => window.clearTimeout(timer) }, [])
  const pageCopy = useMemo(() => ({
    Moments: { eyebrow: 'LIFE IN LITTLE UPDATES', title: 'Moments', description: 'Share a little piece of your day. Moments disappear after 24 hours.', action: 'Share a Moment', icon: CirclePlay },
    Groups: { eyebrow: 'YOUR PEOPLE, TOGETHER', title: 'Groups', description: 'Create group chats, bring people together, and share with everyone in the group.', action: 'Create a group', icon: Users },
    Calls: { eyebrow: 'CLOSER, WHEREVER YOU ARE', title: 'Calls', description: 'Your voice and video call history will appear here.', action: 'Start a call', icon: Phone }
  }), [])
  if (showSplash) return <SplashScreen />
  const openTab = (tab: Tab) => { setActiveTab(tab); setDialog(null) }
  return <main className="app-shell">
    <aside className="desktop-rail">
      <div className="rail-brand"><BrandLogo className="brand-logo" /><span>Chater</span></div>
      <nav aria-label="Main navigation" className="rail-nav">{tabs.map(({label,icon:Icon}) => <button key={label} className={activeTab===label?'rail-link active':'rail-link'} onClick={()=>openTab(label)}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="rail-bottom"><button className="rail-link" onClick={()=>setDialog('settings')}><Settings size={19}/><span>Settings</span></button><div className="rail-profile"><div className="profile-avatar">H</div><div><strong>Your profile</strong><small>Set up your account</small></div><MoreHorizontal size={18}/></div></div>
    </aside>
    <section className="main-column">
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
        {activeTab==='You'&&<ProfileScreen onSettings={()=>setDialog('settings')}/>}
      </div>
    </section>
    <button className="compose-button" aria-label="Start a new chat" onClick={()=>setDialog('new-chat')}><Plus size={25}/></button>
    <nav className="bottom-nav" aria-label="Main navigation">{tabs.map(({label,icon:Icon})=><button key={label} className={activeTab===label?'nav-item active':'nav-item'} onClick={()=>openTab(label)}><Icon size={21} strokeWidth={activeTab===label?2.3:1.8}/><span>{label}</span></button>)}</nav>
    {dialog&&<div className="dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null)}}><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><div><p className="eyebrow">CHATER</p><h2 id="dialog-title">{dialog==='new-chat'?'Start a conversation':dialog==='search'?'Find people':'Settings'}</h2></div><button className="icon-button" aria-label="Close" onClick={()=>setDialog(null)}><X size={20}/></button></div>{dialog==='settings'?<><section className="accent-settings" aria-labelledby="accent-title"><div className="accent-settings-heading"><h3 id="accent-title">Accent colour</h3><span>{accentPresets.find(item=>item.value===accent)?.name ?? 'Custom'}</span></div><div className="accent-palette" role="group" aria-label="Choose an accent colour">{accentPresets.map(item=><button key={item.value} type="button" className="accent-swatch" style={{'--swatch':item.value} as React.CSSProperties} aria-label={item.name} aria-pressed={accent===item.value} onClick={()=>setAccent(item.value)}><span/></button>)}</div><p className="accent-help">Choose a colour to personalize buttons, highlights and active navigation.</p></section><div className="settings-list"><button onClick={()=>{setDialog(null);openTab('You')}}><UserRound/> Profile <ChevronRight/></button><button><Bell/> Notifications <ChevronRight/></button><button><ShieldCheck/> Privacy and security <ChevronRight/></button><button><HelpCircle/> Help <ChevronRight/></button></div><p className="dialog-copy">Account and privacy controls will be connected in a later implementation task.</p></>:<><p className="dialog-copy">Search with someone's unique username. Their email address stays private.</p><label className="search-box dialog-search"><Search size={18}/><input autoFocus value={username} onChange={e=>{setUsername(e.target.value.replace(/^@/,''));setSearchNotice('')}} placeholder="@username"/><button aria-label="Clear username" onClick={()=>setUsername('')}><X size={15}/></button></label><button className="primary-button dialog-action" onClick={()=>setSearchNotice('Username discovery will be connected when account and discovery services are implemented.')} disabled={!username.trim()}><Search size={17}/> Search username</button>{searchNotice&&<p className="dialog-notice" role="status">{searchNotice}</p>}</>}</section></div>}
  </main>
}

function FeatureEmpty({data,onAction}:{data:{eyebrow:string;title:string;description:string;action:string;icon:typeof MessageCircle};onAction:()=>void}) {
  const Icon=data.icon
  return <div className="feature-page"><div className="page-heading"><div><p className="eyebrow">{data.eyebrow}</p><h1>{data.title}<span className="heading-dot">.</span></h1><p className="subheading">{data.description}</p></div></div><div className="empty-state feature-empty"><EmptyIllustration icon={Icon}/><h2>Make this space<br/>your own.</h2><p className="empty-description">This is where your {data.title.toLowerCase()} will live. Get started when you're ready.</p><button className="primary-button" onClick={onAction}><Plus size={17}/>{data.action}</button></div></div>
}
function ProfileScreen({onSettings}:{onSettings:()=>void}) {
  return <div className="profile-page"><p className="eyebrow">YOUR CHATER IDENTITY</p><h1>You<span className="heading-dot">.</span></h1><div className="profile-card"><div className="profile-avatar large">H</div><h2>Your name</h2><p className="profile-handle">@yourusername</p><p className="profile-about">Add a little about yourself.</p><button className="secondary-button" onClick={onSettings}><Settings size={16}/> Profile settings</button></div><div className="profile-options"><button onClick={onSettings}><ShieldCheck/><span><strong>Privacy and security</strong><small>Choose who can reach you</small></span><ChevronRight/></button><button onClick={onSettings}><Bell/><span><strong>Notifications</strong><small>Make Chater yours</small></span><ChevronRight/></button><button onClick={onSettings}><HelpCircle/><span><strong>Help and support</strong><small>We're here to help</small></span><ChevronRight/></button></div></div>
}
