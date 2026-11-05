import { useEffect, useMemo, useState } from 'react'
import { api, download } from '../api'
import { useStore } from '../store'
import { baseLines, changedIndexes, exportLines, fmtDate, go, iso, money, safeName, sameCompany, sameRole, sentLines, selectedLines, tailoredDraft, STAGES } from '../lib'
import { Avatar, ConfirmButton, Empty, Icon, Pill, ResumePage, Segmented, Skeleton, Spinner, STAGE_TONE, STATUS_TONE } from '../ui'
import { LEVELS } from './NewApplication'
import type { Analysis, Application, Diff, Level, Line, Requirement, Row, Tailoring, TRow } from '../types'

type Mode = Tailoring['mode']
const visibleRows = (t: Tailoring) => t.rows.filter(r => r.include && !(r.rejected && !r.before) && (r.rejected ? r.before : r.after).trim())

export default function Workspace({ id, tab }: { id: string; tab?: string }) {
  const { applications, resumes, saveApp, toast, setSettings, settings } = useStore()
  const app = applications.find(a => a.id === id)
  const [busy, setBusy] = useState(false)
  if (!app) return <div className="page"><Empty icon="search" title="Application not found"><a href="#/">Back to overview</a></Empty></div>
  const rows = app.resumeRows ?? resumes.find(r => r.id === app.resumeId)?.rows
  const priors = applications.filter(a => a.id !== app.id && sameCompany(a, app))
    .sort((a, b) => (b.appliedAt || b.createdAt).localeCompare(a.appliedAt || a.createdAt))
  const current = (tab || (app.tailoring ? 'review' : 'analysis'))
  const lines = selectedLines(app, rows)
  const save = (patch: Partial<Application>) => saveApp({ ...app, ...patch })

  const tailor = async (level: Level, mode: Mode, prior?: Application) => {
    if (!rows || !app.analysis) return
    if (mode === 'reuse' && prior) {
      const from = !prior.submitted && prior.tailoring ? structuredClone(prior.tailoring) : null
      const priorLines = sentLines(prior, resumes.find(r => r.id === prior.resumeId)?.rows) ?? []
      const t: Tailoring = from ? { ...from, mode: 'reuse', usage: undefined } : {
        level, mode: 'reuse', title: '', verification: [], notes: [], scores: { fit: app.analysis.scores.fit, before: app.analysis.scores.visibility, after: app.analysis.scores.visibility },
        rows: priorLines.map(([kind, text], i) => ({ id: `p${i}`, kind, section: '', group: '', before: text, after: text, reason: `Reused from ${prior.role}.`, reqs: [], flag: '', include: true })),
      }
      save(tailoredDraft(t))
      toast(`Using the version you sent for ${prior.role}`)
      return go(`/app/${app.id}/review`)
    }
    setBusy(true)
    try {
      const lock = mode === 'locked' && prior ? sentLines(prior, resumes.find(r => r.id === prior.resumeId)?.rows) : null
      const t = await api.post<Tailoring>('/api/tailor', { rows, jd: app.jd, analysis: app.analysis, level, title: app.role, lock })
      save({ ...tailoredDraft({ ...t, level, mode }), cost: (app.cost || 0) + (t.usage?.cost || 0) })
      setSettings({ ...settings, spent: settings.spent + (t.usage?.cost || 0) })
      go(`/app/${app.id}/review`)
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false) }
  }

  const tabs = [
    { key: 'analysis', label: 'Match analysis' },
    { key: 'review', label: 'Tailored resume', off: !app.tailoring },
    { key: 'export', label: 'Export & track' },
    ...(priors.length ? [{ key: 'history', label: 'Company history', count: priors.length }] : []),
  ]
  return (
    <div className="page wide workspacePage">
      <div>
        <div className="crumb"><a href="#/">Overview</a><span>/</span>{app.company}</div>
        <header className="pageHead">
          <div className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'nowrap' }}><Avatar name={app.company} lg /><div><h1>{app.role}</h1><div className="row sub"><b style={{ color: 'var(--ink)', fontWeight: 550 }}>{app.company}</b><Pill tone={STAGE_TONE[app.stage]}>{app.stage}</Pill>
            {app.appliedAt && <span>Applied {fmtDate(app.appliedAt)}</span>}{app.jdUrl && <a href={/^https?:\/\//i.test(app.jdUrl) ? app.jdUrl : `https://${app.jdUrl}`} target="_blank" rel="noopener noreferrer" title={app.jdUrl}>JD link ↗</a>}</div></div></div>
          <div className="step"><span className="small">Exporting: {app.submitted && !app.editingSubmission ? 'previously downloaded version' : app.tailoring ? `current ${app.tailoring.level} draft` : 'base resume'}</span><ExportButtons app={app} lines={lines} save={save} /></div>
        </header>
      </div>
      {priors.length > 0 && current !== 'history' && !app.tailoring && (() => {
        const same = priors.filter(p => (app.jdUrl && p.jdUrl === app.jdUrl) || sameRole(p.role, app.role))
        const list = (ps: Application[]) => ps.map(p => `${p.role} (${p.appliedAt ? `applied ${fmtDate(p.appliedAt)}` : 'draft'})`).join('; ')
        return same.length
          ? <div className="notice warn"><Icon name="alert" /><div className="grow"><b>You already applied to this role at {app.company}</b>: {list(same)}. Tailor within locked facts so both versions tell the same story.</div><a href={`#/app/${app.id}/history`}>Compare</a></div>
          : <div className="notice info"><Icon name="building" /><div className="grow">You've also applied to {app.company} for other roles: {list(priors)}. Their system links your applications, so titles, dates and figures should match.</div><a href={`#/app/${app.id}/history`}>Compare</a></div>
      })()}
      <nav className="tabs" aria-label="Application sections">
        {tabs.map(t => t.off ? <a key={t.key} aria-disabled="true" style={{ opacity: .45, pointerEvents: 'none' }}>{t.label}</a> :
          <a key={t.key} href={`#/app/${app.id}/${t.key}`} aria-current={current === t.key ? 'page' : undefined}>{t.label}{'count' in t && <span className="count">{t.count}</span>}</a>)}
      </nav>
      {!rows && !app.tailoring && !app.submitted && <div className="notice bad"><Icon name="alert" />The base resume for this application was deleted. Pick another resume by starting a new application.</div>}
      {current === 'analysis' && rows && <AnalysisTab app={app} rows={rows} priors={priors} busy={busy} onTailor={tailor} />}
      {current === 'review' && app.tailoring && rows && <ReviewTab app={app} t={app.tailoring} rows={rows} busy={busy} save={save} onTailor={tailor} />}
      {current === 'export' && <ExportTab app={app} lines={lines} save={save} />}
      {current === 'history' && <HistoryTab app={app} lines={lines} priors={priors} busy={busy} onTailor={tailor} />}
    </div>
  )
}

function ExportButtons({ app, lines, save }: { app: Application; lines: Line[]; save(p: Partial<Application>): void }) {
  const { toast } = useStore()
  const name = `${safeName(app.company)} - ${safeName(app.role)}`
  const awaitingReview = !!app.tailoring?.generative && !app.tailoring?.exportApproval
  // Only verified resumes record an application; synthetic samples remain drafts.
  const get = (path: string, ext: string) => api.blob(path, { rows: lines, synthetic: app.tailoring?.generative ?? false, exportApproval: app.tailoring?.exportApproval }).then(b => {
    download(b, `${name}.${ext}`)
    if (!app.tailoring?.generative && (!app.submitted || app.editingSubmission)) {
      const history = app.submissions ?? (app.submitted ? [{ at: app.appliedAt || app.createdAt, lines: app.submitted }] : [])
      save({ stage: app.stage === 'Draft' ? 'Applied' : app.stage, appliedAt: app.appliedAt || iso(), submitted: structuredClone(lines), editingSubmission: false, submissions: [...history, { at: new Date().toISOString(), lines: structuredClone(lines) }] })
      toast(`Recorded in your dashboard: ${app.company} · ${app.role}`)
    }
  }).catch(e => toast(e.message, 'error'))
  return (
    <div className="row">
      {awaitingReview && <span className="small">Export awaits a passing draft review.</span>}
      <button className="btn" onClick={() => get('/api/word', 'docx')} disabled={!lines.length || awaitingReview} title={awaitingReview ? "Resolve the draft audit before exporting" : undefined}><Icon name="download" />Word</button>
      <button className="btn primary" onClick={() => get('/api/pdf', 'pdf')} disabled={!lines.length || awaitingReview} title={awaitingReview ? "Resolve the draft audit before exporting" : undefined}><Icon name="download" />PDF</button>
    </div>
  )
}

function ScoreCard({ fit, before, after, generative = false }: { fit: number; before: number; after?: number; generative?: boolean }) {
  const kw = after ?? before
  return (
    <div>
      <div className="scoreCard">
        <div><span>{generative ? 'JD coverage' : 'Requirements matched'}</span><b>{fit}%</b><div className="meter"><i style={{ width: `${fit}%` }} /></div><p className="method">{generative ? 'of this job’s requirements are coherently covered in the generated test resume.' : "of this job's requirements are backed by something on your resume."}</p></div>
        <div><span>Keyword visibility</span><b>{kw}%{after !== undefined && after !== before && <em>{after > before ? '+' : ''}{after - before}</em>}</b><div className="meter"><i style={{ width: `${kw}%` }} /></div><p className="method">weighted phrase overlap with {generative ? 'all JD requirements' : 'supported and transferable requirements'}. This is a wording diagnostic, not an ATS prediction.</p></div>
      </div>
      <details className="method"><summary>How these are calculated</summary>{generative ? 'JD coverage is model-reviewed across all requirements: required qualifications 3×, responsibilities 2× and nice-to-haves 1×, with partial coverage counting half. Keyword visibility measures exact phrase overlap across the same requirements. Neither is an ATS score.' : "Requirements matched counts required qualifications 3×, responsibilities 2× and nice-to-haves 1×. A related-but-not-identical skill counts half. Tailoring can't raise this number, because it never adds experience you don't have. It raises the second number by using the job's wording for things you've really done. Neither is an ATS score."}</details>
    </div>
  )
}

function Resolver({ priors, mode, setMode, prior, setPrior }: { priors: Application[]; mode: Mode; setMode(m: Mode): void; prior: string; setPrior(id: string): void }) {
  const options: { value: Mode; label: string; note: string }[] = [
    { value: 'locked', label: 'Tailor within locked facts', note: 'Recommended. Emphasis changes for this role; titles, dates and figures match what you sent.' },
    { value: 'reuse', label: 'Reuse the previous resume', note: 'Send exactly what you sent before. Safest, least targeted.' },
    { value: 'free', label: 'Tailor freely', note: 'Ignore the earlier submission. Recruiters may notice differences.' },
  ]
  return (
    <div className="resolver">
      <div className="label">Earlier submission to compare against</div>
      <select value={prior} onChange={e => setPrior(e.target.value)} aria-label="Earlier application">
        {priors.map(p => <option key={p.id} value={p.id}>{p.role} · {p.appliedAt ? fmtDate(p.appliedAt) : p.stage}</option>)}
      </select>
      <div role="radiogroup" aria-label="Consistency" className="resolver">
        {options.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={mode === o.value} className="choice" onClick={() => setMode(o.value)}>
            <div><b>{o.label}</b><small>{o.note}</small></div>
          </button>
        ))}
      </div>
    </div>
  )
}

function TailorControls({ app, priors, busy, onTailor, cta }: { app: Application; priors: Application[]; busy: boolean; onTailor(l: Level, m: Mode, p?: Application): void; cta: string }) {
  const [level, setLevel] = useState<Level>(app.level)
  const [mode, setMode] = useState<Mode>(priors.length ? 'locked' : 'free')
  const [prior, setPrior] = useState(priors[0]?.id ?? '')
  return (
    <div className="step">
      <div className="label">Tailoring depth</div>
      <Segmented label="Tailoring depth" value={level} onChange={setLevel} options={LEVELS.map(l => ({ value: l.value, label: l.label }))} />
      <p className="small">{LEVELS.find(l => l.value === level)!.note}</p>
      {priors.length > 0 && <Resolver priors={priors} mode={mode} setMode={setMode} prior={prior} setPrior={setPrior} />}
      <button className="btn primary lg" disabled={busy} onClick={() => onTailor(level, mode, priors.find(p => p.id === prior))}>
        {busy ? <><Spinner />Tailoring and checking quality…</> : <><Icon name="spark" />{cta}</>}
      </button>
    </div>
  )
}

function AnalysisTab({ app, rows, priors, busy, onTailor }: { app: Application; rows: Row[]; priors: Application[]; busy: boolean; onTailor(l: Level, m: Mode, p?: Application): void }) {
  const { resumes } = useStore()
  const originalPdf = app.originalPdf ?? resumes.find(r => r.id === app.resumeId)?.originalPdf
  const a = app.analysis!
  const [filter, setFilter] = useState<'all' | 'supported' | 'gaps' | 'context'>('all')
  const [sel, setSel] = useState<string | null>(null)
  const index = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows])
  if (!a) return <RunAnalysis app={app} rows={rows} />
  const reqs = a.requirements.filter(r => filter === 'all' || (filter === 'gaps' ? r.status === 'unsupported' : r.status !== 'unsupported'))
  const evidence = (r: Requirement) => r.evidence.map(e => index.get(e)).filter((i): i is number => i !== undefined)
  const selected = a.requirements.find(r => r.id === sel)
  const highlight = selected ? evidence(selected) : a.requirements.filter(r => r.status !== 'unsupported').flatMap(evidence)
  const counts = { supported: a.requirements.filter(r => r.status === 'supported').length, transferable: a.requirements.filter(r => r.status === 'transferable').length, gaps: a.requirements.filter(r => r.status === 'unsupported').length }
  return (
    <div className="grid2">
      <div className="step">
        <div className="notice info"><Icon name="list" />{selected ? <span>Highlighting the evidence for <b>{selected.text}</b>. <a href="#" onClick={e => { e.preventDefault(); setSel(null) }}>Show all</a></span> : 'Highlighted lines are the evidence behind your matched requirements. Select a requirement to focus it.'}</div>
        {originalPdf ? <><iframe title="Original uploaded resume" src={originalPdf} style={{ width: '100%', height: '80vh', border: 0 }} /><details><summary>Extracted evidence view</summary><ResumePage lines={baseLines(rows)} highlight={highlight} /></details></> : <ResumePage lines={baseLines(rows)} highlight={highlight} />}
      </div>
      <aside className="card sticky step">
        <ScoreCard fit={a.scores.fit} before={a.scores.visibility} />
        <div className="tally"><Pill tone="good">{counts.supported} supported</Pill><Pill tone="warn">{counts.transferable} transferable</Pill><Pill tone="bad">{counts.gaps} gaps</Pill></div>
        <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'supported', label: 'Matched' }, { value: 'gaps', label: 'Gaps' }, { value: 'context', label: 'Context' }]} />
        {filter === 'context' ? (
          <div className="step">
            <div className="detected"><div><span>Seniority</span><b>{a.seniority}</b></div><div><span>Domain</span><b>{a.domain.join(' · ') || '—'}</b></div></div>
            <p className="small">{a.role_summary}</p>
            <details><summary className="small">Full job description</summary><pre className="jd">{app.jd}</pre></details>
          </div>
        ) : (
          <ul className="reqList">
            {reqs.map(r => (
              <li key={r.id}><button aria-pressed={sel === r.id} onClick={() => setSel(sel === r.id ? null : r.id)}>
                <div className="reqTop"><b>{r.text}</b><Pill tone={STATUS_TONE[r.status]}>{r.status === 'unsupported' ? 'gap' : r.status}</Pill></div>
                <div className="row"><span className="small" style={{ textTransform: 'capitalize' }}>{r.type}</span><div className="chips">{r.keywords.map(k => <span key={k} className="chip">{k}</span>)}</div></div>
                {sel === r.id && r.note && <p className="small">{r.note}</p>}
              </button></li>
            ))}
            {!reqs.length && <li className="small" style={{ padding: 12 }}>Nothing in this view.</li>}
          </ul>
        )}
        <TailorControls app={app} priors={priors} busy={busy} onTailor={onTailor} cta={app.tailoring ? 'Re-tailor resume' : 'Tailor resume'} />
        {a.usage && <p className="usage">{a.usage.model === 'offline' ? 'Analyzed with the offline engine · free' : `Analysis cost ${money(a.usage.cost)} · ${a.usage.cache_read ? `${a.usage.cache_read.toLocaleString()} tokens from cache` : 'cache warming'}`}</p>}
      </aside>
    </div>
  )
}

function RunAnalysis({ app, rows }: { app: Application; rows: Row[] }) {
  const { saveApp, toast } = useStore()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const analysis = await api.post<Analysis>('/api/analyze', { rows, jd: app.jd, company: app.company, title: app.role })
      saveApp({ ...app, analysis, cost: (app.cost || 0) + analysis.usage.cost })
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return <div className="card"><Empty icon="spark" title="Not analyzed yet"><p>Map this posting's requirements against your resume.</p>
    <button className="btn primary" onClick={run} disabled={busy}>{busy ? <><Spinner />Analyzing…</> : 'Run analysis'}</button></Empty></div>
}

const changeType = (r: TRow) => r.flag ? 'Kept by guard' : r.kind === 'section' ? (r.include && r.after !== r.before ? 'Renamed' : 'Unchanged') : !r.include ? (r.fit ? 'Removed to fit' : 'Removed') : r.fit && r.reason.startsWith('Restored') ? 'Restored' : !r.before ? 'Added' : r.after !== r.before ? 'Rewritten' : r.moved ? 'Moved' : 'Unchanged'
const TYPE_TONE: Record<string, string> = { 'Kept by guard': 'bad', Removed: 'neutral', Added: 'accent', Rewritten: 'accent', Moved: 'neutral', Renamed: 'neutral', 'Removed to fit': 'warn', Restored: 'good' }

function ReviewTab({ app, t, rows, busy, save, onTailor }: { app: Application; t: Tailoring; rows: Row[]; busy: boolean; save(p: Partial<Application>): void; onTailor(l: Level, m: Mode, p?: Application): void }) {
  const [view, setView] = useState<'after' | 'before'>('after')
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const vis = visibleRows(t)
  const changes = t.rows.filter(r => changeType(r) !== 'Unchanged')
  const reqText = new Map(app.analysis?.requirements.map(r => [r.id, r.text]))
  const clearAudit = { exportApproval: undefined, reviewSuggestions: undefined, quality: undefined, coverage: undefined, missing: undefined, evidence_ledger: undefined, generation_plan: undefined, alignment: undefined, technical_quality: undefined, recruiter_quality: undefined, visual_quality: undefined, document_qa: undefined }
  const update = (id: string, patch: Partial<TRow>) => save(tailoredDraft({ ...t, ...clearAudit, rows: t.rows.map(r => r.id === id ? { ...r, ...patch } : r) }))
  const selRow = t.rows.find(r => r.id === sel)
  useEffect(() => { if (selRow) setDraft(selRow.rejected ? selRow.before : selRow.after) }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = [...new Set(changes.map(r => r.section || 'Header'))]
  const rejected = changes.filter(r => r.rejected).length
  const { toast } = useStore()
  const [fitting, setFitting] = useState(false)
  const refit = async () => {
    setFitting(true)
    try {
      const res = await api.post<{ rows: TRow[]; fit: NonNullable<Tailoring['fit']> }>('/api/fit', { rows: t.rows, requirements: app.analysis?.requirements ?? [], generative: t.generative })
      save(tailoredDraft({ ...t, ...clearAudit, rows: res.rows, fit: res.fit }))
      toast(res.fit.size ? `Fits one page at ${res.fit.size}pt` : 'Still over one page. Exclude a line yourself.', res.fit.size ? 'ok' : 'error')
    } catch (e) { toast((e as Error).message, 'error') } finally { setFitting(false) }
  }
  return (
    <div className="grid2">
      <div className="step">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Segmented label="Resume version" value={view} onChange={setView} options={[{ value: 'after', label: 'Tailored' }, { value: 'before', label: 'Original' }]} />
          <span className="small">{view === 'after' ? 'Highlighted lines changed. Click a line to review it, or edit it in place.' : 'Your base resume, unchanged.'}</span>
        </div>
        {view === 'after'
          ? <ResumePage lines={exportLines(t)} synthetic={t.generative} highlight={changedIndexes(t)} flagged={vis.flatMap((r, i) => r.flag ? [i] : [])} selected={vis.findIndex(r => r.id === sel)}
              onSelect={i => setSel(vis[i].id)} onEdit={(i, value) => update(vis[i].id, { after: value, rejected: false, reason: 'Edited by you.' })} onFit={refit} />
          : <ResumePage lines={baseLines(rows)} />}
      </div>
      <aside className="card sticky step">
        {t.alignment?.initial_rubric ? <div className="notice info"><Icon name="list" /><div><b>Estimated alignment: {t.alignment.initial}% → {t.alignment.final}%</b><p className="small">Original and tailored resume assessed with the same V3 rubric. Internal estimate, not an employer ATS prediction.</p><p className="small">{t.alignment.rationale}</p></div></div> : <ScoreCard fit={t.scores.fit} before={t.scores.before} after={t.scores.after} generative={t.generative} />}
        {t.generative && <p className="small">The original match score measures support in your source resume. This draft’s coverage score measures how fully its final wording addresses the JD. They are separate assessments, not a before/after improvement score.</p>}
        {t.strategy && <details><summary>Role-focused plan</summary><p className="small">{t.strategy}</p>{t.generation_plan?.blueprint && <details><summary>JD blueprint & candidate timeline</summary><p className="small"><b>Specialization:</b> {t.generation_plan.blueprint.specialization}</p><p className="small"><b>Seniority:</b> {t.generation_plan.blueprint.seniority}. <b>Ownership:</b> {t.generation_plan.blueprint.expected_ownership}</p>{(['p0_requirements', 'p1_requirements', 'p2_requirements', 'p3_requirements'] as const).map((key, i) => <p className="small" key={key}><b>P{i}:</b> {t.generation_plan?.blueprint?.[key].map(id => reqText.get(id) ?? id).join('; ') || 'None'}</p>)}<p className="small"><b>Architecture:</b> {t.generation_plan.blueprint.architectural_themes.join('; ')}</p>{!!t.generation_plan.candidate_timeline?.length && <ul>{t.generation_plan.candidate_timeline.map(role => <li key={`${role.role}-${role.start}`}><b>{role.role}</b><p className="small">{role.start}–{role.end} · {role.seniority}. {role.technical_theme}</p></li>)}</ul>}</details>}</details>}
        {t.coverage && <div className="notice info"><Icon name="list" /><div><b>{t.generative ? 'JD coverage' : 'Evidence presentation'}: {t.coverage.score === null ? 'not fully assessed' : `${t.coverage.score}%`}</b><p className="small">{t.coverage.method} Assessed on the generated draft.</p><details><summary>Requirement-by-requirement review</summary><ul>{t.coverage.requirements.map(r => <li key={r.requirement}><b>{r.status}: {r.text}</b><p className="small">{r.reason}</p></li>)}</ul></details></div></div>}
        {t.alignment && <details><summary>V3 quality & document review</summary><div className="detected"><div><span>Estimated alignment</span><b>{t.alignment.initial}% → {t.alignment.final}%</b></div><div><span>Technical quality</span><b>{t.technical_quality ?? '—'}</b></div><div><span>Recruiter quality</span><b>{t.recruiter_quality ?? '—'}</b></div><div><span>Visual quality</span><b>{t.visual_quality ?? '—'}</b></div></div><p className="small">Rubric: critical {t.alignment.rubric.critical}/30 · experience {t.alignment.rubric.experience}/25 · responsibilities {t.alignment.rubric.responsibilities}/20 · preferred {t.alignment.rubric.preferred}/10 · projects {t.alignment.rubric.projects}/10 · formatting {t.alignment.rubric.formatting}/5.</p><p className="small">{t.alignment.rationale} This is an internal model estimate, not an employer ATS prediction.</p>{t.document_qa && <p className="small"><b>Document QA:</b> {t.document_qa.pages} page · {t.document_qa.selectable ? 'selectable text' : 'text check failed'} · {t.document_qa.rasterized ? 'rasterized' : 'render check failed'} · {t.document_qa.visual_inspection ? 'image reviewed' : 'image not reviewed'}.</p>}{!!t.document_qa?.visual_issues?.length && <ul>{t.document_qa.visual_issues.map(issue => <li className="small" key={issue}>{issue}</li>)}</ul>}</details>}
        {t.missing && <details><summary>Missing or incomplete JD requirements ({t.missing.length})</summary>{t.missing.length ? <ul>{t.missing.map(m => <li key={m.requirement}><b>{m.text}</b><p className="small">{m.category}. {m.detail}</p><p className="small">{m.question}</p></li>)}</ul> : <p className="small">No additional gaps were identified in this review. Verify the result before applying.</p>}</details>}
        {!!t.evidence_ledger?.length && <details><summary>Synthetic evidence report ({t.evidence_ledger.length})</summary><p className="small">Hypothetical details used in this test draft, not verified experience.</p><div className="step">{t.evidence_ledger.map((e, i) => <div className="detail" key={`${e.row_id ?? e.target}-${i}`}><b>{e.row_id ?? e.target}</b><p className="small"><b>Problem:</b> {e.problem}</p><p className="small"><b>Environment:</b> {e.environment}</p><p className="small"><b>Responsibility:</b> {e.responsibility}</p><p className="small"><b>Implementation:</b> {e.implementation}</p>{e.validation && <p className="small"><b>Validation:</b> {e.validation}</p>}<p className="small"><b>Outcome:</b> {e.outcome}</p><p className="small"><b>Metric basis:</b> {e.metric_basis}</p>{e.metric && Object.values(e.metric).some(Boolean) && <div className="small"><b>Structured metric</b><p><b>{e.metric.name}:</b> {e.metric.baseline} → {e.metric.final} {e.metric.unit} · {e.metric.period}</p><p><b>Calculation:</b> {e.metric.calculation}</p><p><b>Validation:</b> {e.metric.validation}</p><p><b>Causality:</b> {e.metric.causality}</p></div>}{e.generated_details.length > 0 && <div className="small"><b>Generated details</b><ul>{e.generated_details.map(d => <li key={d}>{d}</li>)}</ul></div>}</div>)}</div></details>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{changes.length} changes</h2>
          <span className="small">{t.mode === 'locked' ? 'Facts locked to earlier submission · ' : t.mode === 'reuse' ? 'Reused version · ' : ''}{LEVELS.find(l => l.value === t.level)?.label}{rejected ? ` · ${rejected} rejected` : ''}</span>
        </div>
        <div className={`notice ${t.fit?.size ? 'good' : 'warn'}`}>
          <Icon name={t.fit?.size ? 'check' : 'alert'} />
          <div className="grow">
            <b>{t.fit?.size ? `Fits one page at ${t.fit.size}pt` : t.fit ? 'Over one page' : 'Not fitted yet'}</b>
            {t.fit && t.fit.log.length > 0 && <details><summary className="small">{t.fit.log.length} layout adjustments, measured on the rendered page</summary>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{t.fit.log.map((l, i) => <li key={i} className="small">{l}</li>)}</ul></details>}
          </div>
          <button className="btn sm" onClick={refit} disabled={fitting}>{fitting ? <Spinner /> : 'Fit to one page'}</button>
        </div>
        {t.quality && <div className={`notice ${t.quality.status === 'passed' ? 'good' : 'warn'}`}><Icon name={t.quality.status === 'passed' ? 'check' : 'alert'} /><div><b>Generated draft audit: {t.quality.status === 'passed' ? 'no outstanding findings' : 'needs review'}</b><p className="small">{t.quality.revised ? 'Revised after review. ' : ''}Checked after page fitting. Later manual edits are not audited. {t.generative ? 'Review all hypothetical details before using this sample.' : 'Confirm dates, metrics and interview defensibility before applying.'}</p></div></div>}
        {!!t.reviewSuggestions?.length && <details><summary>Optional refinements</summary><ul>{t.reviewSuggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
        {t.notes.length > 0 && <div className="notice bad"><Icon name="alert" /><div><b>Content guard</b><ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{t.notes.map(n => <li key={n}>{n}</li>)}</ul></div></div>}
        <div>
          {groups.map(g => (
            <div key={g}>
              <div className="group">{g}</div>
              <ul className="changeList">
                {changes.filter(r => (r.section || 'Header') === g).map(r => {
                  const type = changeType(r)
                  return (
                    <li key={r.id}>
                      <div role="button" tabIndex={0} className={`changeItem${sel === r.id ? ' sel' : ''}`} onClick={() => setSel(sel === r.id ? null : r.id)} onKeyDown={e => e.key === 'Enter' && setSel(sel === r.id ? null : r.id)}>
                        <div className="reqTop"><Pill tone={r.rejected ? 'neutral' : TYPE_TONE[type]}>{r.rejected ? 'Rejected' : type}</Pill>
                          {type !== 'Kept by guard' && <button className="btn sm ghost" onClick={e => { e.stopPropagation(); update(r.id, { rejected: !r.rejected }) }}>{r.rejected ? 'Restore' : 'Reject'}</button>}</div>
                        {r.before && r.after !== r.before && <span className="before">{r.before}</span>}
                        <span className="after">{r.rejected ? r.before : r.after || r.before}</span>
                      </div>
                      {sel === r.id && (
                        <div className="detail">
                          {r.flag && <div className="notice bad"><Icon name="alert" />{r.flag}{r.rejected || !r.before ? '.' : '. Your original wording was kept.'}</div>}
                          {r.reason && <p className="small"><b>Why:</b> {r.reason}</p>}
                          {r.reqs.length > 0 && <div className="chips">{r.reqs.map(q => <span key={q} className="chip">{reqText.get(q) ?? q}</span>)}</div>}
                          <textarea value={draft} onChange={e => setDraft(e.target.value)} aria-label="Edit line" />
                          <div className="row">
                            <button className="btn primary sm" onClick={() => update(r.id, { after: draft.trim(), rejected: false, reason: 'Edited by you.' })} disabled={!draft.trim()}>Save</button>
                            <button className="btn sm" onClick={() => update(r.id, { include: !r.include, userExcluded: r.include })}>{r.include ? 'Exclude line' : 'Include line'}</button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        {t.verification.length > 0 && (
          <div className="notice warn"><Icon name="alert" /><div><b>{t.generative ? 'Review synthetic details before use' : 'Confirm before applying'}</b><ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{t.verification.map(v => <li key={v}>{v}</li>)}</ul></div></div>
        )}
        <details><summary className="small">Re-tailor at a different depth</summary><TailorControls app={app} priors={[]} busy={busy} onTailor={onTailor} cta="Re-tailor" /></details>
        <button className="btn primary" onClick={() => go(`/app/${app.id}/export`)}>Continue to export<Icon name="arrow" /></button>
      </aside>
    </div>
  )
}

function ExportTab({ app, lines, save }: { app: Application; lines: Line[]; save(p: Partial<Application>): void }) {
  const { removeApp, toast } = useStore()
  const t = app.tailoring
  const synthetic = t?.generative ?? false
  const editable = !!t && (!app.submitted || !!app.editingSubmission)
  const visible = t ? visibleRows(t) : []
  const [fitting, setFitting] = useState(false)
  const clearAudit = { exportApproval: undefined, reviewSuggestions: undefined, quality: undefined, coverage: undefined, missing: undefined, evidence_ledger: undefined, generation_plan: undefined, alignment: undefined, technical_quality: undefined, recruiter_quality: undefined, visual_quality: undefined, document_qa: undefined }
  const editLine = (i: number, value: string) => {
    const row = visible[i]
    if (!t || !row) return
    save(tailoredDraft({ ...t, ...clearAudit, rows: t.rows.map(r => r.id === row.id ? { ...r, after: value, rejected: false, reason: 'Edited by you.' } : r) }))
  }
  const refit = async () => {
    if (!t) return
    setFitting(true)
    try {
      const res = await api.post<{ rows: TRow[]; fit: NonNullable<Tailoring['fit']> }>('/api/fit', { rows: t.rows, requirements: app.analysis?.requirements ?? [], generative: t.generative })
      save(tailoredDraft({ ...t, ...clearAudit, rows: res.rows, fit: res.fit }))
      toast(res.fit.size ? `Fits one page at ${res.fit.size}pt` : 'Still over one page. Exclude a line in the review tab.', res.fit.size ? 'ok' : 'error')
    } catch (e) { toast((e as Error).message, 'error') } finally { setFitting(false) }
  }
  return (
    <div className="grid2">
      <div className="step">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small">{editable ? 'Click any line to edit it in place. Downloads update automatically.' : app.submitted ? 'Previously downloaded version. Choose “Edit and download a new version” to make changes.' : 'Tailor the resume to enable inline editing.'}</span>
          {editable && <Pill tone="accent">Inline editing</Pill>}
        </div>
        <ResumePage lines={lines} synthetic={synthetic} onEdit={editable ? editLine : undefined} onFit={editable && !fitting ? refit : undefined} />
      </div>
      <aside className="card sticky step">
        <h2>Track this application</h2>
        {app.submitted
          ? <div className="notice good"><Icon name="check" /><div>Recorded on <b>{fmtDate(app.appliedAt)}</b>. This exact version is saved, and future applications to {app.company} are checked against it.</div></div>
          : <div className="notice info"><Icon name="download" /><div><b>Download the final resume to record this application.</b> It moves from Drafts to your dashboard, and the downloaded version is saved for consistency checks.</div></div>}
        <ExportButtons app={app} lines={lines} save={save} />
        {app.submitted && <label className="field">Stage
          <select value={app.stage} onChange={e => save({ stage: e.target.value as Application['stage'] })}>
            {STAGES.filter(s => s !== 'Draft').map(s => <option key={s}>{s}</option>)}
          </select>
        </label>}
        {app.appliedAt && <label className="field">Applied on<input type="date" value={app.appliedAt} max={iso()} onChange={e => e.target.value && save({ appliedAt: e.target.value })} /></label>}
        {app.submitted && <button className="btn sm ghost" onClick={() => save({ editingSubmission: !app.editingSubmission })}>{app.editingSubmission ? 'Return to sent version' : 'Edit and download a new version'}</button>}
        <div className="detected">
          <div><span>Version</span><b>{app.submitted && !app.editingSubmission ? 'Previously downloaded' : app.tailoring ? `Current draft · ${app.tailoring.level}` : 'Base resume'}</b></div>
          <div><span>Fit</span><b>{app.analysis ? `${app.analysis.scores.fit}%` : '—'}</b></div>
          <div><span>API cost</span><b>{money(app.cost)}</b></div>
        </div>
        <ConfirmButton label="Delete application" confirmLabel="Click again to delete" className="btn ghost danger" onConfirm={() => { removeApp(app.id); go('/') }} />
      </aside>
    </div>
  )
}

function HistoryTab({ app, lines, priors, busy, onTailor }: { app: Application; lines: Line[]; priors: Application[]; busy: boolean; onTailor(l: Level, m: Mode, p?: Application): void }) {
  const { resumes } = useStore()
  const [priorId, setPriorId] = useState(priors[0].id)
  const [diffs, setDiffs] = useState<Diff[] | null>(null)
  const prior = priors.find(p => p.id === priorId)!
  const priorLines = sentLines(prior, resumes.find(r => r.id === prior.resumeId)?.rows)
  const key = JSON.stringify([priorLines, lines])
  useEffect(() => {
    setDiffs(null)
    if (priorLines) api.post<Diff[]>('/api/compare', { prior: priorLines, current: lines }).then(setDiffs).catch(() => setDiffs([]))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const tally = (l: Diff['level']) => diffs?.filter(d => d.level === l).length ?? 0
  const TONE = { fact: 'bad', wording: 'warn', emphasis: 'neutral' }
  return (
    <div className="grid2">
      <div className="card">
        <div className="cardHead"><h2>This draft vs. what you sent for {prior.role}</h2>
          <select value={priorId} onChange={e => setPriorId(e.target.value)} aria-label="Earlier application">{priors.map(p => <option key={p.id} value={p.id}>{p.role} · {p.appliedAt ? fmtDate(p.appliedAt) : p.stage}</option>)}</select></div>
        {!priorLines ? <p className="muted">No saved version exists for that application.</p> : !diffs ? <Skeleton /> : diffs.length === 0
          ? <div className="notice good"><Icon name="check" />Identical to what you sent. Nothing to reconcile.</div>
          : <>
            <div className="tally" style={{ marginBottom: 8 }}><Pill tone="bad">{tally('fact')} fact conflicts</Pill><Pill tone="warn">{tally('wording')} wording</Pill><Pill tone="neutral">{tally('emphasis')} emphasis</Pill></div>
            {tally('fact') > 0 && <div className="notice bad" style={{ marginBottom: 8 }}><Icon name="alert" />Titles, dates or figures differ from what this company already has. Recruiters reviewing your profile will see both. Tailor within locked facts, or edit these lines to match.</div>}
            {[...diffs].sort((a, b) => ['fact', 'wording', 'emphasis'].indexOf(a.level) - ['fact', 'wording', 'emphasis'].indexOf(b.level)).map((d, i) => (
              <div key={i} className="diffItem">
                <div><Pill tone={TONE[d.level]}>{d.level}</Pill></div>
                <div className="step" style={{ gap: 4 }}>
                  <p className="small">{d.note}</p>
                  {d.before && <p className="before">{d.before}</p>}
                  {d.after && <p className="after">{d.after}</p>}
                </div>
              </div>
            ))}
          </>}
      </div>
      <aside className="card sticky step">
        <h2>Resolve</h2>
        <p className="small">Fact conflicts are what recruiters flag. Emphasis differences are expected when roles differ.</p>
        <TailorControls app={app} priors={priors} busy={busy} onTailor={onTailor} cta="Apply choice" />
        <div className="step">
          <div className="label">All applications to {app.company}</div>
          {priors.map(p => <a key={p.id} href={`#/app/${p.id}`} className="row" style={{ justifyContent: 'space-between' }}><span>{p.role}</span><Pill tone={STAGE_TONE[p.stage]}>{p.stage}</Pill></a>)}
        </div>
      </aside>
    </div>
  )
}
