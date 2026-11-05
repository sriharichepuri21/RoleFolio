import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import type { Line } from './types'

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  x: 'M18 6 6 18M6 6l12 12',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  download: 'M12 4v12M7 11l5 5 5-5M4 19h16',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M3 21h18',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  chevron: 'M9 6l6 6-6 6',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
}
export const Icon = ({ name, size = 16 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
)

/** People and companies as neutral initials: identity, not data, so no colour. */
export const Avatar = ({ name, lg }: { name: string; lg?: boolean }) => (
  <span className={`avatar${lg ? ' lg' : ''}`} aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'}</span>
)

/** The original RoleFolio mark (from the first version), in ink. */
export const Mark = () => (
  <svg className="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 25 15 4h6L9 25zm9 0L24 4h5L17 25zm9 0 8-14v9l-3 5z" fill="currentColor" /></svg>
)

/** Two-step destructive action: first click arms it, second confirms; disarms after 3 s. No browser dialog. */
export function ConfirmButton({ onConfirm, label, confirmLabel = 'Click again to remove', className = 'btn sm ghost danger' }: { onConfirm(): void; label: string; confirmLabel?: string; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t) }, [armed])
  return (
    <button type="button" className={armed ? 'btn sm confirming' : className} aria-live="polite"
      onClick={e => { e.stopPropagation(); if (armed) onConfirm(); else setArmed(true) }}>
      <Icon name="trash" size={14} />{armed ? confirmLabel : label}
    </button>
  )
}

export const Pill = ({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) => <span className={`pill ${tone}`}>{children}</span>
export const STAGE_TONE: Record<string, string> = { Draft: 'neutral', Applied: 'neutral', Screen: 'neutral', Interview: 'good', Offer: 'good', Rejected: 'neutral', Closed: 'neutral' }  // colour only where a decision waits
export const STATUS_TONE: Record<string, string> = { supported: 'good', transferable: 'warn', unsupported: 'bad' }

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: NoInfer<T>; label: string }[]; onChange(v: NoInfer<T>): void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export const Spinner = () => <span className="spinner" aria-hidden="true" />
export const Skeleton = ({ lines = 3 }: { lines?: number }) => <div className="skeleton" aria-busy="true">{Array.from({ length: lines }, (_, i) => <i key={i} style={{ width: `${90 - i * 13}%` }} />)}</div>
export const Empty = ({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) => (
  <div className="empty"><span className="emptyIcon"><Icon name={icon} size={20} /></span><h3>{title}</h3>{children}</div>
)

export function Combobox({ value, onChange, options, placeholder, id }: { value: string; onChange(v: string): void; options: string[]; placeholder?: string; id?: string }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const matches = useMemo(() => {
    const q = value.toLowerCase().trim()
    return options.filter(o => o.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))).slice(0, 8)
  }, [value, options])
  const pick = (v: string) => { onChange(v); setOpen(false) }
  return (
    <div className="combo">
      <input id={id} role="combobox" aria-expanded={open && matches.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined} value={value} placeholder={placeholder} autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, matches.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
          if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active]) }
          if (e.key === 'Escape') setOpen(false)
        }} />
      {open && matches.length > 0 && (
        <ul id={listId} role="listbox" className="comboList">
          {matches.map((m, i) => (
            <li key={m} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseDown={e => { e.preventDefault(); pick(m) }} onMouseEnter={() => setActive(i)}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export interface Command { id: string; label: string; hint?: string; icon: string; run(): void }
export function CommandBar({ commands, open, setOpen }: { commands: Command[]; open: boolean; setOpen(v: boolean): void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!open) } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, setOpen])
  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])
  if (!open) return null
  const list = commands.filter(c => (c.label + ' ' + (c.hint || '')).toLowerCase().includes(q.toLowerCase())).slice(0, 9)
  const run = (c?: Command) => { if (c) { c.run(); setOpen(false) } }
  return (
    <div className="overlay" onMouseDown={() => setOpen(false)}>
      <div className="command" role="dialog" aria-label="Command menu" onMouseDown={e => e.stopPropagation()}>
        <label className="commandInput"><Icon name="search" />
          <input autoFocus placeholder="Search applications or jump to…" value={q} aria-label="Search commands"
            onChange={e => { setQ(e.target.value); setActive(0) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, list.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
              if (e.key === 'Enter') run(list[active])
              if (e.key === 'Escape') setOpen(false)
            }} />
          <kbd>esc</kbd>
        </label>
        <ul role="listbox" aria-label="Results">
          {list.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => run(c)}>
              <Icon name={c.icon} /><span>{c.label}</span>{c.hint && <small>{c.hint}</small>}
            </li>
          ))}
          {!list.length && <li className="muted">No matches</li>}
        </ul>
      </div>
    </div>
  )
}

/** Server-rendered resume page (same renderer as the PDF export) with clickable, highlightable lines. */
export function ResumePage({ lines, highlight = [], flagged = [], selected, onSelect, onEdit, onFit, synthetic = false }: {
  lines: Line[]; highlight?: number[]; flagged?: number[]; selected?: number; onSelect?(i: number): void; onEdit?(i: number, value: string): void; onFit?(): void; synthetic?: boolean
}) {
  const [data, setData] = useState<{ pages: string[]; boxes: number[][]; size: number | null } | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const key = JSON.stringify([lines, synthetic])
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    let live = true
    setError('')
    if (!lines.length) { setData(null); return }
    const t = setTimeout(() => api.post<{ pages: string[]; boxes: number[][]; size: number | null }>('/api/page-preview', { rows: lines, synthetic })
      .then(d => live && setData(d)).catch(e => live && setError(e.message)), 150)
    return () => { live = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected === undefined || !data?.boxes[selected]) return
    pageRefs.current[data.boxes[selected][0]]?.querySelector<HTMLElement>(`[data-line="${selected}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected, data])
  if (error) return <div className="notice bad"><Icon name="alert" /> {error}</div>
  if (!data) return <div className="sheet loading"><Skeleton lines={12} /></div>
  const hl = new Set(highlight), fl = new Set(flagged)
  return (
    <div className="pages">
      {data.pages.length > 1 && <div className="notice warn"><Icon name="alert" /><div className="grow">This runs to {data.pages.length} pages, even at the smallest readable size. Exports must be exactly one page.</div>{onFit && <button className="btn sm" onClick={onFit}>Fit to one page</button>}</div>}
      {data.pages.map((src, n) => (
        <div key={n} className="sheet" ref={el => { pageRefs.current[n] = el }}>
          <img src={`data:image/png;base64,${src}`} alt={`Resume page ${n + 1}`} />
          {data.boxes.map(([page, x, y, w, h], i) => page === n && (
            <button key={i} data-line={i} type="button" className={`hit${hl.has(i) ? ' hl' : ''}${fl.has(i) ? ' flag' : ''}${selected === i ? ' sel' : ''}`}
              style={{ left: `${100 * x}%`, top: `${100 * y}%`, width: `${100 * w}%`, height: `${100 * h}%` }}
              aria-label={`${onEdit ? 'Edit' : 'Select'}: ${lines[i]?.[1]}`} tabIndex={onSelect || onEdit ? 0 : -1}
              onClick={() => { onSelect?.(i); if (onEdit) { setEditing(i); setDraft(lines[i][1]) } }} />
          ))}
          {editing !== null && data.boxes[editing]?.[0] === n && (
            <form className="lineEditor" style={{ top: `${Math.min(80, 100 * (data.boxes[editing][2] + data.boxes[editing][4]))}%` }}
              onSubmit={e => { e.preventDefault(); if (draft.trim()) { onEdit?.(editing, draft.trim()); setEditing(null) } }}>
              <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} aria-label="Line text" rows={3}
                onKeyDown={e => { if (e.key === 'Escape') setEditing(null) }} />
              <div className="row end"><button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary">Save line</button></div>
            </form>
          )}
        </div>
      ))}
    </div>
  )
}

/** Single-series bar chart: rounded data-ends on a baseline, 2px gaps, hover tooltip, table fallback. */
export function BarChart({ data, label, height = 150 }: { data: { label: string; full: string; value: number }[]; label: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const H = height, peak = Math.max(0, ...data.map(d => d.value)), step = 100 / data.length
  const tickStep = peak <= 4 ? 1 : peak <= 10 ? 2 : peak <= 25 ? 5 : 10
  const max = Math.max(tickStep, Math.ceil((peak + 1) / tickStep) * tickStep)  // top tick sits above the maximum
  const ticks = Array.from({ length: max / tickStep + 1 }, (_, i) => i * tickStep).filter((_, i, all) => all.length <= 6 || i % 2 === 0 || i === all.length - 1)
  return (
    <figure className="chart" aria-label={label}>
      <div className="plot" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {ticks.map(t => <div key={t} className="grid" style={{ bottom: `${(t / max) * 100}%` }}><span>{t}</span></div>)}
        <div className="bars" role="img" aria-label={`${label}: ${data.reduce((a, d) => a + d.value, 0)} total`}>
          {data.map((d, i) => (
            <div key={i} className="slot" onMouseEnter={() => setHover(i)}>
              {d.value > 0 && <i className={hover === i ? 'on' : ''} style={{ height: `${(d.value / max) * 100}%` }} />}
            </div>
          ))}
        </div>
        {hover !== null && (
          <div className="tip" style={{ left: `${(hover + 0.5) * step}%` }}>{data[hover].value} sent<small>{data[hover].full}</small></div>
        )}
      </div>
      {data.every(d => !d.value) && <p className="chartEmpty">No applications in this period yet.</p>}
      <div className="xaxis">{data.map((d, i) => <span key={i} style={{ width: `${step}%` }}>{d.label}</span>)}</div>
      <details className="tableView"><summary>View as table</summary>
        <table><tbody>{data.map(d => <tr key={d.full}><td>{d.full}</td><td className="num">{d.value}</td></tr>)}</tbody></table>
      </details>
    </figure>
  )
}
