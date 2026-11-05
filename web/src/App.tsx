import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { Avatar, CommandBar, Icon, Mark, type Command } from './ui'
import { go, recorded } from './lib'
import Dashboard from './pages/Dashboard'
import NewApplication from './pages/NewApplication'
import Workspace from './pages/Workspace'
import Resumes from './pages/Resumes'
import SettingsPage from './pages/Settings'

function useRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => { setHash(location.hash); document.querySelector('.content')?.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
}

const NAV = [
  { path: '', label: 'Overview', icon: 'home', group: 'Job search' },
  { path: 'new', label: 'New application', icon: 'plus', group: 'Job search' },
  { path: 'resumes', label: 'Resumes', icon: 'file', group: 'Library' },
]

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#17191c' : '#eef0f3')
    localStorage.rfTheme = theme
  }, [theme])
  return [theme, setTheme] as const
}

function Shell() {
  const [page, id, tab] = useRoute()
  const { applications, resumes, settings, toasts, ready } = useStore()
  const [cmd, setCmd] = useState(false)
  const [theme, setTheme] = useTheme()
  const drafts = applications.filter(a => !recorded(a)).length  // the one queue that needs action
  const owner = [...resumes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.rows[0]?.text || 'Your workspace'
  const commands: Command[] = [
    { id: 'theme', label: theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode', icon: theme === 'dark' ? 'sun' : 'moon', hint: 'Appearance', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'navsettings', label: 'Settings', icon: 'gear', hint: 'Go to', run: () => go('/settings') },
    ...NAV.map(n => ({ id: 'nav' + n.path, label: n.label, icon: n.icon, hint: 'Go to', run: () => go('/' + n.path) })),
    ...applications.map(a => ({ id: a.id, label: `${a.company} — ${a.role}`, hint: a.stage, icon: 'building', run: () => go(`/app/${a.id}`) })),
  ]
  const body = page === 'new' ? <NewApplication />
    : page === 'app' && id ? <Workspace id={id} tab={tab} />
    : page === 'resumes' ? <Resumes />
    : page === 'settings' ? <SettingsPage />
    : <Dashboard />
  return (
    <div className="shell">
      <a href="#main" className="skip">Skip to content</a>
      <aside className="sidebar">
        <a className="workspace" href="#/"><Mark /><div><b>RoleFolio</b><small>{owner}</small></div></a>
        <button className="searchTrigger" onClick={() => setCmd(true)}><Icon name="search" /><span>Search applications</span><kbd>⌘K</kbd></button>
        {['Job search', 'Library'].map(group => (
          <div key={group}>
            <div className="navLabel">{group}</div>
            <nav aria-label={group}>
              {NAV.filter(n => n.group === group).map(n => (
                <a key={n.path} href={'#/' + n.path} aria-current={(page || '') === n.path || (n.path === '' && page === 'app') ? 'page' : undefined}>
                  <Icon name={n.icon} />{n.label}{n.path === '' && drafts > 0 && <span className="navCount" title="Applications in progress">{drafts} draft{drafts === 1 ? '' : 's'}</span>}
                </a>
              ))}
            </nav>
          </div>
        ))}
        <div className="sideFoot">
          <nav aria-label="Utilities">
            <a href="#/settings" aria-current={page === 'settings' ? 'page' : undefined}><Icon name="gear" />Settings</a>
          </nav>
          <div className="themeToggle" role="group" aria-label="Appearance">
            <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Icon name="moon" size={14} />Night</button>
            <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Icon name="sun" size={14} />Day</button>
          </div>
          {ready && (
            <a href="#/settings" className="userRow" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Avatar name={owner} />
              <div className="grow"><b>{owner}</b><small><span className={`keyDot${settings.offline ? '' : ' ok'}`} />{settings.offline ? 'Offline engine' : settings.model.replace('claude-', '').replace(/-(\d)-(\d)/, ' $1.$2').replace(/^./, c => c.toUpperCase())}</small></div>
            </a>
          )}
        </div>
      </aside>
      <main id="main" className="content">
        <header className="topbar">
          <a className="mobileBrand" href="#/" aria-label="RoleFolio overview"><Mark /><span>RoleFolio</span></a>
          <button className="globalSearch" onClick={() => setCmd(true)}><Icon name="search" size={18} /><span>Search your workspace…</span><kbd>⌘ K</kbd></button>
          <a className="workspaceStatus" href="#/settings"><span className={`keyDot${settings.offline ? '' : ' ok'}`} />{settings.offline ? 'Offline workspace' : 'Connected workspace'}<Avatar name={owner} /></a>
          <button className="mobileTheme" aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        </header>
        {ready ? body : null}
        <nav className="mobileNav" aria-label="Mobile navigation">
          {[...NAV, { path: 'settings', label: 'Settings', icon: 'gear', group: 'Utilities' }].map(n => (
            <a key={n.path} href={'#/' + n.path} aria-current={(page || '') === n.path || (n.path === '' && page === 'app') ? 'page' : undefined}><Icon name={n.icon} />{n.label === 'New application' ? 'New' : n.label}</a>
          ))}
        </nav>
      </main>
      <CommandBar commands={commands} open={cmd} setOpen={setCmd} />
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={`toast ${t.tone}`}><Icon name={t.tone === 'error' ? 'alert' : 'check'} />{t.message}</div>)}
      </div>
    </div>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
