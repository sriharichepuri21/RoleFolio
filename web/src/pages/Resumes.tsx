import { useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { baseLines, uid } from '../lib'
import { ConfirmButton, Empty, Icon, ResumePage, Spinner } from '../ui'
import type { Resume } from '../types'

/** Parse an uploaded file or pasted text into a saved resume. Shared with the intake screen. */
export async function importResume(source: File | string, save: (r: Resume) => void): Promise<Resume> {
  const isFile = typeof source !== 'string'
  if (isFile && source.size > 5_000_000) throw new Error('Choose a file smaller than 5 MB.')
  if (isFile && !/\.(pdf|docx)$/i.test(source.name)) throw new Error('Upload a PDF or Word (.docx) file.')
  const parsed = await api.parseResume(source, isFile ? source.name : 'pasted.txt')
  const resume: Resume = {
    id: uid(), name: parsed.rows[0]?.text ? `${parsed.rows[0].text} — ${isFile ? source.name.replace(/\.\w+$/, '') : 'pasted'}` : 'Resume',
    fileName: isFile ? source.name : 'Pasted text', rows: parsed.rows, originalPdf: parsed.originalPdf || undefined, createdAt: new Date().toISOString(),
  }
  save(resume)
  return resume
}

export function Dropzone({ onFile, busy }: { onFile(f: File): void; busy: boolean }) {
  const [over, setOver] = useState(false)
  return (
    <label className={`drop${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}>
      {busy ? <Spinner /> : <Icon name="upload" />}
      <span>{busy ? 'Reading your resume…' : <>Drop a PDF or Word file, or <u>browse</u></>}</span>
      <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
    </label>
  )
}

export default function Resumes() {
  const { resumes, saveResume, removeResume, toast } = useStore()
  const [selected, setSelected] = useState<string | undefined>(resumes[0]?.id)
  const [busy, setBusy] = useState(false)
  const [paste, setPaste] = useState<string | null>(null)
  const current = resumes.find(r => r.id === selected) ?? resumes[0]
  const run = async (src: File | string) => {
    setBusy(true)
    try { const r = await importResume(src, saveResume); setSelected(r.id); setPaste(null); toast('Resume parsed. Click any line on the page to correct it.') }
    catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false) }
  }
  return (
    <div className="page narrow resumePage">
      <header className="pageHead">
        <div><h1>Resumes</h1><p className="sub">Your base resume is the source of truth. Tailoring never adds anything that isn't in it.</p></div>
        <button className="btn" onClick={() => setPaste(paste === null ? '' : null)}>{paste === null ? 'Paste text instead' : 'Cancel paste'}</button>
      </header>
      <section className="card step">
        <Dropzone onFile={run} busy={busy} />
        {paste !== null && (
          <form className="step" onSubmit={e => { e.preventDefault(); if (paste.trim()) run(paste) }}>
            <textarea rows={8} placeholder="Paste your resume text. First line: your name. Second: contact details." value={paste} onChange={e => setPaste(e.target.value)} aria-label="Resume text" />
            <div className="row end"><button className="btn primary" disabled={busy || !paste.trim()}>Parse resume</button></div>
          </form>
        )}
        {resumes.length > 0 && (
          <div className="resumeChoices" role="radiogroup" aria-label="Saved resumes">
            {[...resumes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => (
              <button key={r.id} type="button" role="radio" aria-checked={r.id === current?.id} className="choice" onClick={() => setSelected(r.id)}>
                <Icon name="file" /><div className="grow" style={{ minWidth: 0 }}><b>{r.name}</b><small>{r.fileName} · {new Date(r.createdAt).toLocaleDateString()}</small></div>
              </button>
            ))}
          </div>
        )}
      </section>
      {!current ? (
        <div className="card"><Empty icon="file" title="No resume yet"><p>Upload your base resume as a text-based PDF or a Word file. RoleFolio reads its sections, roles, bullets and links.</p></Empty></div>
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <label className="field grow" style={{ minWidth: 220 }}>Name
              <input value={current.name} onChange={e => saveResume({ ...current, name: e.target.value })} />
            </label>
            <span className="small" style={{ paddingBottom: 8 }}>{current.rows.filter(r => r.kind === 'bullet').length} bullets, {current.rows.filter(r => r.kind === 'role').length} roles</span>
            <ConfirmButton label="Delete" confirmLabel="Click again to delete" className="btn ghost" onConfirm={() => { removeResume(current.id); setSelected(undefined) }} />
          </div>
          {current.originalPdf && <iframe title="Original uploaded resume" src={current.originalPdf} style={{ width: '100%', height: '80vh', border: 0 }} />}
          <details open={!current.originalPdf}><summary>Review and edit extracted text</summary>
          <p className="small">These edits affect tailoring, not the original PDF.</p>
          <ResumePage lines={baseLines(current.rows)} onEdit={(i, value) => saveResume({ ...current, rows: current.rows.map((r, n) => n === i ? { ...r, text: value } : r) })} />
          </details>
        </>
      )}
    </div>
  )
}
