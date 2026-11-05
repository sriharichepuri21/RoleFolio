import { useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { fmtDate, go, isUrl, normCompany, sameRole, TECH_ROLES, uid } from '../lib'
import { Combobox, Icon, Spinner } from '../ui'
import { Dropzone, importResume } from './Resumes'
import type { Analysis, Application, Level } from '../types'

export const LEVELS: { value: Level; label: string; note: string }[] = [
  { value: 'basic', label: 'Basic', note: 'Reorder bullets and organize skills. Your wording stays.' },
  { value: 'medium', label: 'Medium', note: 'Rewrite only the bullets that prove a requirement, plus the summary.' },
  { value: 'aggressive', label: 'Aggressive', note: 'Synthetic demonstration: build a JD-to-engineering matrix, rewrite experience first, add coherent sample accomplishments and metrics, and keep a structured evidence ledger. Output is labeled not for submission.' },
]

export default function NewApplication() {
  const { resumes, applications, settings, saveResume, saveApp, toast } = useStore()
  const latest = [...resumes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const [resumeId, setResumeId] = useState(latest?.id ?? '')
  const [source, setSource] = useState<'previous' | 'new'>(latest ? 'previous' : 'new')
  const previous = resumes.find(r => r.id === resumeId) ?? latest
  const [jd, setJd] = useState('')
  const [jdUrl, setJdUrl] = useState('')
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [level, setLevel] = useState<Level>('medium')
  const [importing, setImporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  const priors = applications.filter(a => (jdUrl && a.jdUrl === jdUrl) || (company.trim() && normCompany(a.company) === normCompany(company)))
  const sameJob = priors.filter(a => (jdUrl && a.jdUrl === jdUrl) || (role.trim() && sameRole(a.role, role)))
  const otherRoles = priors.filter(a => !sameJob.includes(a))
  const when = (a: typeof priors[number]) => a.appliedAt ? `applied ${fmtDate(a.appliedAt)}` : 'draft, not downloaded yet'
  const ready = source === 'previous' && resumeId && jd.trim().length > 80 && !isUrl(jd)

  const importPosting = async (link: string) => {
    setImporting(true); setError('')
    try {
      const d = await api.post<{ company: string; title: string; jd: string }>('/api/posting', link.trim())
      setJd(d.jd.trim()); setJdUrl(link.trim())
      if (d.company) setCompany(c => c || d.company)
      if (d.title) setRole(r => r || d.title)
      toast(d.company ? `Imported ${d.title || 'posting'} at ${d.company}` : 'Description imported. Check the role and company.')
    } catch (e) { setError((e as Error).message) }
    finally { setImporting(false) }
  }

  const analyze = async () => {
    const resume = resumes.find(r => r.id === resumeId)!
    setAnalyzing(true); setError('')
    try {
      const analysis = await api.post<Analysis>('/api/analyze', { rows: resume.rows, jd, company, title: role })
      const app: Application = {
        id: uid(), company: company.trim() || analysis.company || 'Unknown company', role: role.trim() || analysis.title, jd, jdUrl, level,
        resumeId, resumeRows: structuredClone(resume.rows), originalPdf: resume.originalPdf, stage: 'Draft', createdAt: new Date().toISOString(), analysis, cost: analysis.usage.cost,
      }
      saveApp(app)
      go(`/app/${app.id}`)
    } catch (e) { setError((e as Error).message); setAnalyzing(false) }
  }

  return (
    <div className="page narrow intakePage">
      <header className="pageHead"><div><h1>New application</h1><p className="sub">One screen: your resume, the posting, the role. RoleFolio does the rest.</p></div></header>
      <div className="intake">
        <form className="card" onSubmit={e => { e.preventDefault(); if (ready) analyze() }}>
          <div className="step">
            <div className="stepHead"><span className="stepNo">1</span><h2>Resume</h2></div>
            <div className="resumeChoices" role="radiogroup" aria-label="Which resume">
              <button type="button" role="radio" aria-checked={source === 'previous'} className="choice" disabled={!previous} onClick={() => setSource('previous')}>
                <Icon name="file" /><div><b>Use previous upload</b><small>{previous ? `${previous.fileName} · ${new Date(previous.createdAt).toLocaleDateString()}` : 'No resume uploaded yet'}</small></div>
              </button>
              <button type="button" role="radio" aria-checked={source === 'new'} className="choice" onClick={() => setSource('new')}>
                <Icon name="upload" /><div><b>Upload a new resume</b><small>Replaces the previous one for new applications</small></div>
              </button>
            </div>
            {source === 'new' && <Dropzone busy={uploading} onFile={async f => {
              setUploading(true)
              try { setResumeId((await importResume(f, saveResume)).id); setSource('previous'); toast('New resume ready. It is now your previous upload.') }
              catch (e) { toast((e as Error).message, 'error') } finally { setUploading(false) }
            }} />}
          </div>

          <div className="step">
            <div className="stepHead"><span className="stepNo">2</span><h2>Job posting</h2></div>
            <label className="field">Job description or posting link
              <textarea rows={jd && !isUrl(jd) ? 12 : 4} value={jd} placeholder="Paste the full job description, or a link to the posting (Greenhouse, Lever, company career pages…)"
                onChange={e => { setJd(e.target.value); if (!e.target.value) setJdUrl('') }}
                onPaste={e => { const t = e.clipboardData.getData('text'); if (isUrl(t) && !jd.trim()) { e.preventDefault(); setJd(t.trim()); importPosting(t) } }} />
            </label>
            {isUrl(jd) && !importing && <button type="button" className="btn" onClick={() => importPosting(jd)}><Icon name="download" />Import from link</button>}
            {importing && <div className="notice info"><Spinner /> Reading the posting…</div>}
            {jdUrl && !importing && <p className="small">Imported from <a href={jdUrl} target="_blank" rel="noreferrer">{new URL(jdUrl.startsWith('http') ? jdUrl : 'https://' + jdUrl).hostname}</a></p>}
            <div className="split">
              <label className="field">Role<Combobox value={role} onChange={setRole} options={TECH_ROLES} placeholder="Search roles, e.g. Backend Engineer" /></label>
              <label className="field">Company<input value={company} onChange={e => setCompany(e.target.value)} placeholder="Detected from the posting" autoComplete="organization" /></label>
            </div>
            {sameJob.length > 0 && (
              <div className="notice warn"><Icon name="alert" /><div><b>You already applied to this role at {sameJob[0].company}.</b> {sameJob.map(a => `${a.role} (${when(a)})`).join('; ')}. <a href={`#/app/${sameJob[0].id}`}>Open it</a>, or continue to tailor a new version. RoleFolio keeps its facts consistent with what you sent.</div></div>
            )}
            {sameJob.length === 0 && otherRoles.length > 0 && (
              <div className="notice info"><Icon name="building" /><div>You've also applied to {otherRoles[0].company} for {otherRoles.map(a => a.role).join(', ')}. This is a different role, so tailoring can differ, but titles, dates and figures will stay consistent.</div></div>
            )}
          </div>

          <div className="step">
            <div className="stepHead"><span className="stepNo">3</span><h2>Tailoring depth</h2></div>
            <div className="levels" role="radiogroup" aria-label="Tailoring depth">
              {LEVELS.map(l => (
                <button key={l.value} type="button" role="radio" aria-checked={level === l.value} className="choice" onClick={() => setLevel(l.value)}><b>{l.label}</b><small>{l.note}</small></button>
              ))}
            </div>
          </div>

          <div className="step">
            {error && <div className="notice bad"><Icon name="alert" />{error}</div>}
            {settings.offline && <div className="notice info"><Icon name="spark" /><div><b>Offline engine</b>: free keyword matching and light rewrites, so you can try the whole workflow. For Claude-quality tailoring, {settings.has_key ? 'pick a Claude model' : 'add an API key'} in <a href="#/settings">Settings</a>.</div></div>}
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 16 }}>
              <p className="small" style={{ maxWidth: 460 }}>{level === 'aggressive' ? 'Aggressive creates a clearly labeled synthetic test resume. Review its evidence ledger and hypothetical details before use.' : "Every requirement is matched to a line of your resume. Drafts that add a figure or a skill you haven't shown are rejected, and your wording is kept."}</p>
              <button className="btn primary lg" disabled={!ready || analyzing}>{analyzing ? <><Spinner />Analyzing match…</> : <>Analyze match{settings.offline ? ' (offline)' : ''}<Icon name="arrow" /></>}</button>
            </div>
          </div>
        </form>

      </div>
    </div>
  )
}
