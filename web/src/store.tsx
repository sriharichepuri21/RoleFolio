import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import { uid } from './lib'
import type { Application, Line, Resume, Settings, Stage } from './types'

interface Data { resumes: Resume[]; applications: Application[]; settings: Settings }
interface Store extends Data {
  ready: boolean
  saveResume(r: Resume): void
  saveApp(a: Application): void
  removeApp(id: string): void
  removeResume(id: string): void
  setSettings(s: Settings): void
  toast(message: string, tone?: 'ok' | 'error'): void
  toasts: { id: string; message: string; tone: string }[]
}

const Ctx = createContext<Store>(null!)
export const useStore = () => useContext(Ctx)
const upsert = <T extends { id: string }>(list: T[], item: T) => [item, ...list.filter(x => x.id !== item.id)]

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>({ resumes: [], applications: [], settings: {} as Settings })
  const [ready, setReady] = useState(false)
  const [toasts, setToasts] = useState<Store['toasts']>([])

  const toast = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = uid()
    setToasts(t => [...t, { id, message, tone }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'error' ? 7000 : 3500)
  }, [])
  const persist = useCallback((kind: string, rec: { id: string }) =>
    api.put(kind, rec).catch(e => toast('Not saved: ' + e.message, 'error')), [toast])

  useEffect(() => {
    api.get<Data>('/api/state').then(async d => {
      setData(d)
      setReady(true)
      if (!d.applications.length && !d.resumes.length && localStorage.applications && !localStorage.rfMigrated) {
        await migrateLegacy(d, setData).then(n => n && toast(`Imported ${n} applications from the previous version.`))
      }
    }).catch(e => toast('Could not reach the RoleFolio server: ' + e.message, 'error'))
  }, [toast])

  const store: Store = {
    ...data, ready, toasts, toast,
    saveResume: r => { setData(d => ({ ...d, resumes: upsert(d.resumes, r) })); persist('resume', r) },
    saveApp: a => { setData(d => ({ ...d, applications: upsert(d.applications, a) })); persist('application', a) },
    removeApp: id => { setData(d => ({ ...d, applications: d.applications.filter(x => x.id !== id) })); api.del('application', id) },
    removeResume: id => { setData(d => ({ ...d, resumes: d.resumes.filter(x => x.id !== id) })); api.del('resume', id) },
    setSettings: settings => setData(d => ({ ...d, settings })),
  }
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

/** One-time import of the localStorage data kept by the earlier single-file version of RoleFolio. */
async function migrateLegacy(d: Data, setData: (fn: (d: Data) => Data) => void) {
  type Old = { company: string; title: string; jd: string; stage: string; appliedDate?: string; submitted?: { kind: string; value: string }[] }
  const old: Old[] = JSON.parse(localStorage.applications || '[]')
  let resumeId = ''
  if (localStorage.baseProfile) {
    const parsed = await api.parseResume(localStorage.baseProfile, 'resume.txt')
    const resume: Resume = { id: uid(), name: 'Base resume', fileName: 'Imported', rows: parsed.rows, createdAt: new Date().toISOString() }
    await api.put('resume', resume)
    d.resumes = [resume]
    resumeId = resume.id
  }
  const stage = (s: string): Stage => (['Applied', 'Screen', 'Interview', 'Closed'].includes(s) ? s as Stage : 'Draft')
  const apps: Application[] = old.map(o => ({
    id: uid(), company: o.company, role: o.title, jd: o.jd, jdUrl: '', level: 'medium', resumeId, stage: stage(o.stage),
    createdAt: new Date().toISOString(), appliedAt: o.appliedDate,
    submitted: o.submitted?.map(r => [r.kind, r.value] as Line),
  }))
  await Promise.all(apps.map(a => api.put('application', a)))
  localStorage.rfMigrated = '1'
  setData(cur => ({ ...cur, resumes: d.resumes, applications: apps }))
  return apps.length
}
