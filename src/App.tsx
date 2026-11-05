import { useEffect, useState } from 'react'
import { MessageCircle, CirclePlay, Users, Phone, UserRound, Search, Plus, MoreVertical, Camera, CheckCheck } from 'lucide-react'

type Tab = 'Chats' | 'Moments' | 'Communities' | 'Calls' | 'You'

const tabs: { label: Tab; icon: typeof MessageCircle }[] = [
  { label: 'Chats', icon: MessageCircle },
  { label: 'Moments', icon: CirclePlay },
  { label: 'Communities', icon: Users },
  { label: 'Calls', icon: Phone },
  { label: 'You', icon: UserRound }
]

const conversations = [
  { name: 'Alex Morgan', message: 'Are we still meeting today?', time: '11:42', initials: 'AM', color: 'avatar-gold', unread: 2 },
  { name: 'Family Circle', message: 'Mum: Good morning everyone ❤️', time: '10:15', initials: 'FC', color: 'avatar-rust', unread: 0 },
  { name: 'Daniel Okafor', message: 'Voice message · 0:18', time: 'Yesterday', initials: 'DO', color: 'avatar-olive', unread: 0 },
  { name: 'Project Team', message: 'You: The document is ready', time: 'Yesterday', initials: 'PT', color: 'avatar-blue', unread: 0 },
  { name: 'Ada', message: 'Thank you!', time: 'Tuesday', initials: 'A', color: 'avatar-pink', unread: 0 }
]

function SplashScreen() {
  return (
    <div className="splash-screen" aria-label="Chater from GOZIE">
      <div className="splash-brand">
        <img src="/icons/chater.svg" alt="Chater logo" />
        <span>Chater</span>
      </div>
      <p>from <strong>GOZIE</strong></p>
    </div>
  )
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('Chats')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1500)
    return () => window.clearTimeout(timer)
  }, [])

  const filtered = conversations.filter((chat) => chat.name.toLowerCase().includes(query.toLowerCase()))

  if (showSplash) return <SplashScreen />

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="wordmark">Chater<span>.</span></div>
        <div className="top-actions">
          <button className="icon-button" aria-label="Open camera"><Camera size={21} /></button>
          <button className="icon-button" aria-label="More options"><MoreVertical size={21} /></button>
        </div>
      </header>

      <section className="page-content">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR SPACE</p>
            <h1>{activeTab}</h1>
          </div>
          <span className="online-indicator"><i /> Connected</span>
        </div>

        {activeTab === 'Chats' ? (
          <>
            <label className="search-box">
              <Search size={19} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats or @username" />
              <kbd>/</kbd>
            </label>
            <div className="filter-row"><span className="filter-active">All chats</span><span>Unread</span><span>Favorites</span><span>Groups</span></div>
            <div className="chat-list">
              {filtered.map((chat) => (
                <button className="chat-row" key={chat.name} onClick={() => undefined}>
                  <div className={`avatar ${chat.color}`}>{chat.initials}</div>
                  <div className="chat-copy">
                    <div className="chat-title"><strong>{chat.name}</strong><time>{chat.time}</time></div>
                    <div className="chat-preview"><span><CheckCheck size={15} /> {chat.message}</span>{chat.unread > 0 && <b>{chat.unread}</b>}</div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <p className="empty-state">No matching conversations. Search a username to find someone.</p>}
            </div>
          </>
        ) : (
          <div className="placeholder-panel">
            <div className="placeholder-icon">{activeTab === 'Moments' ? <CirclePlay /> : activeTab === 'Communities' ? <Users /> : activeTab === 'Calls' ? <Phone /> : <UserRound />}</div>
            <h2>{activeTab}</h2>
            <p>This space is being prepared for Chater's {activeTab.toLowerCase()} experience.</p>
          </div>
        )}
      </section>

      <button className="compose-button" aria-label="Start a new chat"><Plus size={27} /></button>

      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map(({ label, icon: Icon }) => (
          <button key={label} className={activeTab === label ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab(label)}>
            <Icon size={21} strokeWidth={activeTab === label ? 2.4 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  )
}