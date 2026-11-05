import { useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { money } from '../lib'
import { Icon, Segmented } from '../ui'
import type { Settings } from '../types'

const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', price: '$4 / $20 per M tokens', note: 'Best judgment on what counts as evidence. Recommended.' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', price: '$2 / $10 per M tokens', note: 'About half the cost, strong for most postings.' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', price: '$0.10 / $0.50 per M tokens', note: 'Lowest cost, fastest. Review its drafts more closely.' },
  { id: 'offline', name: 'Offline engine', price: 'Free · no API', note: 'Keyword matching and light rewrites. Good for trying the workflow. Used automatically when no key is set.' },
]

export default function SettingsPage() {
  const { settings, setSettings, toast } = useStore()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (changes: Record<string, string>) => {
    setBusy(true)
    try { setSettings(await api.post<Settings>('/api/settings', changes)); toast('Settings saved') }
    catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false) }
  }
  return (
    <div className="page settingsPage">
      <header className="pageHead"><div><h1>Settings</h1><p className="sub">Your key, model and spend. Everything is stored on this machine.</p></div></header>

      <section className="card">
        <div className="cardHead"><h2>Anthropic API key</h2>{settings.has_key && <span className="pill good"><Icon name="check" size={12} />Connected · ••••{settings.key_hint}</span>}</div>
        <form className="row" onSubmit={e => { e.preventDefault(); if (key.trim()) save({ api_key: key.trim() }).then(() => setKey('')) }}>
          <input className="grow" type="password" placeholder={settings.has_key ? 'Replace key' : 'sk-ant-…'} value={key} onChange={e => setKey(e.target.value)} aria-label="Anthropic API key" autoComplete="off" />
          <button className="btn primary" disabled={!key.trim() || busy}>Save key</button>
          {settings.has_key && !settings.from_env && <button type="button" className="btn ghost danger" onClick={() => save({ api_key: '' })}>Remove</button>}
        </form>
        <p className="small" style={{ marginTop: 10 }}>
          {settings.from_env ? 'Using ANTHROPIC_API_KEY from the environment. A key saved here takes priority. ' : ''}
          Saved to <code>data/settings.json</code> with owner-only permissions. It is never sent to the browser. Get a key at console.anthropic.com.
        </p>
      </section>

      <section className="card">
        <div className="cardHead"><h2>Model</h2>{settings.offline && <span className="pill warn">Offline engine active</span>}</div>
        <div className="resolver" role="radiogroup" aria-label="Model">
          {MODELS.map(m => (
            <button key={m.id} type="button" role="radio" aria-checked={settings.model === m.id} className="choice" onClick={() => save({ model: m.id })}>
              <div className="grow"><b>{m.name}</b><small>{m.note}</small></div><small>{m.price}</small>
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <div><b style={{ fontWeight: 550 }}>Reasoning effort</b><p className="small">Lower effort costs less and returns faster. Medium is the best balance for tailoring.</p></div>
          <Segmented label="Reasoning effort" value={settings.effort as 'low' | 'medium' | 'high'} onChange={v => save({ effort: v })}
            options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
        </div>
      </section>

      <section className="card">
        <div className="cardHead"><h2>Spend</h2><b>{money(settings.spent)}</b></div>
        <p className="small">Total estimated API cost so far. Each application uses two calls: analysis, then tailoring. The instructions and your resume are cached between them, which cuts input cost on the second call.</p>
      </section>
    </div>
  )
}
