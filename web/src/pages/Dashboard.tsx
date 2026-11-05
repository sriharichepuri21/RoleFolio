import { Fragment, useMemo, useState } from 'react'
import { useStore } from '../store'
import { fmtDate, go, iso, recorded, STAGES } from '../lib'
import { Avatar, BarChart, ConfirmButton, Empty, Icon, Pill, Segmented, STAGE_TONE } from '../ui'
import type { Application } from '../types'

/* Overview — the screen's one question: "What should I do next, and is my search moving?"
   Grid: 12 columns in a 1100px column. Row 1: four pipeline tiles (3+3+3+3). Row 2: in progress (12).
   Row 3: sent per day (8) + recently sent (4), both ~270px so the row ends level. Row 4: all applications (12). */
type SortKey = 'company' | 'role' | 'appliedAt' | 'fit' | 'stage'
const fitOf = (a: Application) => a.analysis?.scores.fit ?? -1
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const daysAgo = (d: string) => Math.round((Date.parse(iso()) - Date.parse(d)) / 864e5)
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }
const INTERVIEWING = ['Screen', 'Interview']

export default function Dashboard() {
  const { applications, resumes, removeApp, toast } = useStore()
  const today = iso()
  const [view, setView] = useState<'daily' | 'monthly'>('daily')
  const [month, setMonth] = useState('')  // '' = the last 30 days
  const [q, setQ] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [stage, setStage] = useState('All')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'appliedAt', dir: -1 })
  const [leaving, setLeaving] = useState<string | null>(null)
  const [showAllDrafts, setShowAllDrafts] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const sent = applications.filter(recorded)
  const drafts = applications.filter(a => !recorded(a)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const ready = drafts.filter(a => a.tailoring)
  const thisMonth = today.slice(0, 7)
  const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7) })()
  const sentThisMonth = sent.filter(a => a.appliedAt?.startsWith(thisMonth)).length
  const sentLastMonth = sent.filter(a => a.appliedAt?.startsWith(lastMonth)).length
  const interviewing = sent.filter(a => INTERVIEWING.includes(a.stage)).length
  const offers = sent.filter(a => a.stage === 'Offer').length
  const rejected = sent.filter(a => a.stage === 'Rejected').length
  const lastSent = sent.map(a => a.appliedAt!).filter(Boolean).sort().at(-1)
  const owner = ([...resumes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.rows[0]?.text || '').split(/\s+/)[0]

  // The finding: the fact that most needs attention, stated under the title.
  const finding = ready.length
    ? `${plural(ready.length, 'tailored resume')} ready to download: ${ready.slice(0, 2).map(a => a.company).join(', ')}${ready.length > 2 ? '…' : ''}.`
    : drafts.length ? `${plural(drafts.length, 'application')} waiting to be tailored.`
    : lastSent && daysAgo(lastSent) >= 3 ? `Nothing sent in ${daysAgo(lastSent)} days. Your last application went out ${fmtDate(lastSent)}.`
    : sent.length ? `${plural(sentThisMonth, 'application')} sent this month, ${interviewing} in interviews.` : 'Add a job posting to tailor your first resume.'

  const tiles = [
    { label: 'In progress', value: drafts.length, caption: drafts.length ? `${ready.length} ready to download` : 'Ready when you are' },
    { label: 'Sent this month', value: sentThisMonth, caption: `${sentLastMonth} in ${new Date(lastMonth + '-01T00:00').toLocaleString('en', { month: 'long' })}` },
    { label: 'Interviewing', value: interviewing, caption: sent.length ? `${Math.round((100 * (interviewing + offers)) / sent.length)}% of ${sent.length} sent reached a call` : 'No applications sent yet' },
    { label: 'Offers', value: offers, caption: rejected ? `${rejected} closed without an offer` : 'None closed yet' },
  ]

  const series = useMemo(() => {
    if (view === 'daily' && !month) {
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - 29 + i)
        const date = iso(d)
        return { label: i % 7 === 1 ? d.toLocaleString('en', { month: 'short', day: 'numeric' }) : '', full: fmtDate(date), value: sent.filter(a => a.appliedAt === date).length }
      })
    }
    if (view === 'daily') {
      const [y, m] = month.split('-').map(Number)
      return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`
        return { label: [1, 8, 15, 22, 29].includes(i + 1) ? String(i + 1) : '', full: fmtDate(date), value: sent.filter(a => a.appliedAt === date).length }
      })
    }
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11 + i)
      const key = iso(d).slice(0, 7)
      return { label: i % 2 === 1 ? d.toLocaleString('en', { month: 'short' }) : '', full: d.toLocaleString('en', { month: 'long', year: 'numeric' }), value: sent.filter(a => a.appliedAt?.startsWith(key)).length }
    })
  }, [view, month, sent])
  const periodTotal = series.reduce((n, d) => n + d.value, 0)

  const recent = [...sent].sort((a, b) => (b.appliedAt || '').localeCompare(a.appliedAt || '')).slice(0, 5)

  // Table: counts follow the current search and month, recomputed for every view.
  const scoped = sent.filter(a => (a.company + ' ' + a.role).toLowerCase().includes(q.toLowerCase().trim()))
    .filter(a => !filterMonth || a.appliedAt?.startsWith(filterMonth))
  const stageTabs = ['All', 'Applied', 'Screen', 'Interview', 'Offer', 'Rejected'].map(s => ({ s, n: s === 'All' ? scoped.length : scoped.filter(a => a.stage === s).length }))
  const rows = scoped.filter(a => stage === 'All' || a.stage === stage).sort((a, b) => {
    const v = (x: Application) => sort.key === 'fit' ? fitOf(x) : sort.key === 'appliedAt' ? x.appliedAt || '' : sort.key === 'stage' ? STAGES.indexOf(x.stage) : x[sort.key].toLowerCase()
    return (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * sort.dir
  })
  const head = (key: SortKey, label: string, cls = '') => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort(s => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === 'company' || key === 'role' ? 1 : -1 }))}>
        {label}{sort.key === key && <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}
      </button>
    </th>
  )
  const remove = (a: Application) => {
    setLeaving(a.id)
    setTimeout(() => { removeApp(a.id); setLeaving(null); toast(`Removed ${a.company} · ${a.role}`) }, 200)
  }
  const shownDrafts = showAllDrafts ? drafts : drafts.slice(0, 4)

  return (
    <div className="page overview">
      <section className="hero" aria-label="Your job search">
        <div className="heroTop">
          <div>
            <h1>{greeting()}{owner ? `, ${owner}` : ''}</h1>
            <p className="sub">{new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}. {finding}</p>
          </div>
          <div className="row">
            {ready[0] && <button className="btn" onClick={() => go(`/app/${ready[0].id}/export`)}><Icon name="download" />Download {ready[0].company}</button>}
            <button className="btn primary" onClick={() => go('/new')}><Icon name="plus" />New application</button>
          </div>
        </div>
        <div className="pipeline">
          {tiles.map((t, i) => (
            <div key={t.label} className={`stage${i === 1 ? ' lead' : ''}`}>
              <span>{t.label}</span>
              <b className={t.value ? '' : 'zero'}>{t.value}</b>
              <small title={t.caption}>{t.caption}</small>
            </div>
          ))}
        </div>
      </section>

      {drafts.length > 0 && (
        <section className="tray">
          <div className="trayHead">
            <h2>In progress<span className="countChip">{drafts.length}</span></h2>
            <span className="small">Downloading the final resume records the application</span>
          </div>
          <div className="card" style={{ padding: 8 }}>
          <div className="rowCards">
            {shownDrafts.map(a => (
              <article key={a.id} className={`rowCard${leaving === a.id ? ' leaving' : ''}`}>
                <Avatar name={a.company} />
                <div className="who"><b>{a.company}</b><small title={a.role}>{a.role}</small></div>
                <span className="rcStatus">{a.tailoring ? <Pill tone="good">Ready to download</Pill> : a.analysis ? <Pill>Needs tailoring</Pill> : <Pill tone="warn">Not analyzed</Pill>}</span>
                <span className="meta rcMatch">{a.analysis ? `${a.analysis.scores.fit}% match` : <span className="dash">—</span>}</span>
                <span className="meta rcDate">Started {fmtDate(a.createdAt.slice(0, 10)).replace(/, \d{4}$/, '')}</span>
                <div className="rowActions">
                  <button className="btn primary sm" onClick={() => go(`/app/${a.id}${a.tailoring ? '/export' : ''}`)}>{a.tailoring ? 'Download' : 'Continue'}</button>
                  <ConfirmButton label="Remove" confirmLabel="Remove?" className="btn sm ghost" onConfirm={() => remove(a)} />
                </div>
              </article>
            ))}
          </div>
          {drafts.length > 4 && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setShowAllDrafts(v => !v)}>{showAllDrafts ? 'Show fewer' : `View all ${drafts.length}`}</button>}
          </div>
        </section>
      )}

      <section className="grid12 even">
        <div className="card span8">
          <div className="cardHead">
            <div>
              <h2>Applications sent</h2>
              <p className="small" style={{ marginTop: 2 }}>{plural(periodTotal, 'application')} {view === 'monthly' ? 'in the last 12 months' : month ? `in ${new Date(month + '-01T00:00').toLocaleString('en', { month: 'long', year: 'numeric' })}` : 'in the last 30 days'}</p>
            </div>
            <div className="row">
              {view === 'daily' && (
                <select value={month} onChange={e => setMonth(e.target.value)} aria-label="Period" style={{ height: 32, minHeight: 32, padding: '4px 8px' }}>
                  <option value="">Last 30 days</option>
                  {Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return iso(d).slice(0, 7) })
                    .map(m => <option key={m} value={m}>{new Date(m + '-01T00:00').toLocaleString('en', { month: 'long', year: 'numeric' })}</option>)}
                </select>
              )}
              <Segmented label="Period" value={view} onChange={setView} options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }]} />
            </div>
          </div>
          <BarChart height={172} data={series} label={view === 'daily' ? 'Applications sent per day' : 'Applications sent per month'} />
        </div>
        <div className="card span4" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="cardHead"><h2>Recently sent</h2></div>
          {recent.length ? (
            <ul className="feed">
              {recent.map(a => (
                <li key={a.id} onClick={() => go(`/app/${a.id}`)} style={{ cursor: 'pointer' }}>
                  <Avatar name={a.company} />
                  <div className="grow"><b>{a.company}</b><div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.role}</div></div>
                  <small>{a.appliedAt === today ? 'Today' : daysAgo(a.appliedAt!) === 1 ? 'Yesterday' : `${daysAgo(a.appliedAt!)} days`}</small>
                </li>
              ))}
            </ul>
          ) : <p className="emptyLine">Nothing sent yet. Applications appear here when you download their final resume.</p>}
          {sent.length > recent.length && <a className="viewAll" href="#all" style={{ marginTop: 'auto', paddingTop: 12 }} onClick={e => { e.preventDefault(); document.getElementById('all')?.scrollIntoView({ behavior: 'smooth' }) }}>View all {sent.length} sent</a>}
        </div>
      </section>

      <section className="card flush" id="all">
        <div className="cardHead pad" style={{ marginBottom: 6 }}><h2>All applications</h2><span className="small">{rows.length} of {sent.length}</span></div>
        <div className="filters">
          <div className="row" style={{ gap: 2 }} role="group" aria-label="Stage">
            {stageTabs.map(t => <button key={t.s} className="chipBtn" aria-pressed={stage === t.s} onClick={() => setStage(t.s)}>{t.s}<small>{t.n}</small></button>)}
          </div>
          <div className="grow" />
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} aria-label="Applied in month">
            <option value="">Any month</option>
            {[...new Set(sent.map(a => a.appliedAt?.slice(0, 7)).filter(Boolean) as string[])].sort().reverse()
              .map(m => <option key={m} value={m}>{new Date(m + '-01T00:00').toLocaleString('en', { month: 'long', year: 'numeric' })}</option>)}
          </select>
          <label className="search"><Icon name="search" /><input placeholder="Search company or role" value={q} onChange={e => setQ(e.target.value)} aria-label="Search company or role" /></label>
        </div>
        {sent.length === 0 ? (
          <Empty icon="building" title="No applications sent yet"><p>An application is recorded here when you download its final resume.</p><button className="btn primary" onClick={() => go('/new')}>Start an application</button></Empty>
        ) : rows.length === 0 ? (
          <p className="emptyLine" style={{ margin: 16 }}>No applications match this view.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr>{head('company', 'Company')}{head('role', 'Role')}<th>Posting</th><th>Resume sent</th>{head('fit', 'Match', 'num')}{head('appliedAt', 'Applied', 'num')}{head('stage', 'Stage')}</tr></thead>
              <tbody>
                {rows.map(a => (
                  <Fragment key={a.id}>
                  <tr className={expanded === a.id ? 'expandedRow' : ''} onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                    <td className="id"><button className="rowDisclosure" aria-expanded={expanded === a.id} aria-controls={`details-${a.id}`} onClick={e => { e.stopPropagation(); setExpanded(expanded === a.id ? null : a.id) }}><Avatar name={a.company} />{a.company}<Icon name="chevron" size={14} /></button></td>
                    <td className="roleCell" title={a.role}>{a.role}</td>
                    <td>{a.jdUrl
                      ? <a href={/^https?:\/\//i.test(a.jdUrl) ? a.jdUrl : `https://${a.jdUrl}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={a.jdUrl}>JD link ↗</a>
                      : <span className="dash" title="Pasted as text, no link saved">—</span>}</td>
                    <td><a href={`#/app/${a.id}/export`} onClick={e => e.stopPropagation()}>{a.tailoring ? `Tailored, ${a.tailoring.level}` : 'Base resume'}</a></td>
                    <td className="num">{a.analysis ? <span className="score">{a.analysis.scores.fit}%</span> : <span className="dash">—</span>}</td>
                    <td className="num">{a.appliedAt ? fmtDate(a.appliedAt) : <span className="dash">—</span>}</td>
                    <td><Pill tone={STAGE_TONE[a.stage]}>{a.stage}</Pill></td>
                  </tr>
                  {expanded === a.id && <tr className="applicationDetail" id={`details-${a.id}`}><td colSpan={6}>
                    <div className="applicationDetailBody">
                      <div className="grow"><h3>{a.role}</h3><p className="small">{a.company} · Started {fmtDate(a.createdAt.slice(0, 10))}</p>
                        <div className="detailFacts"><span>Resume version <b>{a.submissions?.length || (a.submitted ? 1 : 0)}</b></span><span>Tailoring <b>{a.tailoring?.level || 'Base resume'}</b></span><span>Stage <b>{a.stage}</b></span></div>
                      </div>
                      {a.analysis && <div className="matchRing" style={{ '--match': `${Math.max(0, Math.min(100, a.analysis.scores.fit))}%` } as React.CSSProperties}><div><b>{a.analysis.scores.fit}%</b><small>Match</small></div></div>}
                    </div>
                    <div className="detailActions"><a className="btn primary" href={`#/app/${a.id}`}>Open application<Icon name="arrow" /></a><a className="btn" href={`#/app/${a.id}/export`}><Icon name="file" />View resume</a></div>
                  </td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
