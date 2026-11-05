import type { Application, Line, Row, Stage, Tailoring } from './types'

export const STAGES: Stage[] = ['Draft', 'Applied', 'Screen', 'Interview', 'Offer', 'Rejected', 'Closed']
export const SUBMITTED: Stage[] = ['Applied', 'Screen', 'Interview', 'Offer', 'Rejected', 'Closed']

export const TECH_ROLES = [
  'Software Engineer', 'Senior Software Engineer', 'Staff Software Engineer', 'Principal Engineer', 'Frontend Engineer',
  'Senior Frontend Engineer', 'Backend Engineer', 'Senior Backend Engineer', 'Full Stack Engineer', 'Mobile Engineer',
  'iOS Engineer', 'Android Engineer', 'React Native Engineer', 'Platform Engineer', 'Infrastructure Engineer',
  'Site Reliability Engineer', 'DevOps Engineer', 'Cloud Engineer', 'Cloud Architect', 'Solutions Architect',
  'Software Architect', 'Data Engineer', 'Senior Data Engineer', 'Analytics Engineer', 'Data Scientist',
  'Data Analyst', 'Business Intelligence Engineer', 'Machine Learning Engineer', 'AI Engineer', 'Applied Scientist',
  'Research Scientist', 'MLOps Engineer', 'LLM Engineer', 'Computer Vision Engineer', 'NLP Engineer',
  'Security Engineer', 'Application Security Engineer', 'Cloud Security Engineer', 'Embedded Software Engineer',
  'Firmware Engineer', 'Systems Engineer', 'Network Engineer', 'Database Administrator', 'Database Engineer',
  'QA Engineer', 'Software Development Engineer in Test', 'Test Automation Engineer', 'Game Developer',
  'Blockchain Engineer', 'Developer Advocate', 'Developer Experience Engineer', 'Build and Release Engineer',
  'Engineering Manager', 'Technical Lead', 'Technical Program Manager', 'Product Manager', 'Technical Product Manager',
  'UX Engineer', 'Design Engineer', 'Salesforce Developer', 'ERP Developer', 'Forward Deployed Engineer',
  'Solutions Engineer', 'Sales Engineer', 'Support Engineer', 'Software Engineer Intern', 'New Grad Software Engineer',
]

const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|company|technologies|technology|labs|group|holdings|plc|gmbh|hq)\b/g
export const normCompany = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(SUFFIX, '').replace(/[^a-z0-9]+/g, '')

export const sameCompany = (a: Application, b: Application) => {
  if (normCompany(a.company) && normCompany(a.company) === normCompany(b.company)) return true
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
  const generic = /greenhouse|lever|workday|ashby|linkedin|indeed|smartrecruiters|icims/
  return !!host(a.jdUrl) && host(a.jdUrl) === host(b.jdUrl) && !generic.test(host(a.jdUrl))
}

const roleWords = (s: string) => new Set(s.toLowerCase().replace(/\bsr\b\.?/g, 'senior').replace(/\bjr\b\.?/g, 'junior').split(/[^a-z0-9+#]+/).filter(w => w && !['the', 'of', 'and', 'a', 'an', 'for', 'in', 'at', 'to'].includes(w)))
/** Same role: one title's words contain the other's (e.g. "Software Engineer" vs "Software Engineer, Stores Finance"), or they mostly overlap. */
export const sameRole = (a: string, b: string) => {
  const x = roleWords(a), y = roleWords(b)
  if (!x.size || !y.size) return false
  const [small, big] = x.size <= y.size ? [x, y] : [y, x]
  const shared = [...small].filter(w => big.has(w)).length
  return shared === small.size || shared / new Set([...x, ...y]).size >= 0.6
}
export const recorded = (a: Application) => !!(a.submitted || a.appliedAt)

export const baseLines = (rows: Row[]): Line[] => rows.map(r => [r.kind, r.text])

/** The exact lines that will be exported: included rows, using the original text where a change was rejected. */
export const exportLines = (t: Tailoring): Line[] =>
  t.rows.filter(r => r.include && !(r.rejected && !r.before)).map(r => [r.kind, r.rejected ? r.before : r.after] as Line).filter(([, v]) => v.trim())

export const selectedLines = (a: Application, base?: Row[]): Line[] =>
  !a.editingSubmission && a.submitted ? a.submitted : a.tailoring ? exportLines(a.tailoring) : baseLines(base ?? a.resumeRows ?? [])

export const tailoredDraft = (tailoring: Tailoring) => ({ tailoring, level: tailoring.level, editingSubmission: true })

/** Rows whose visible text differs from the base resume (index into exportLines order). */
export const changedIndexes = (t: Tailoring) =>
  t.rows.filter(r => r.include && !(r.rejected && !r.before) && (r.rejected ? r.before : r.after).trim())
    .flatMap((r, i) => (!r.rejected && (r.after !== r.before || r.moved) ? [i] : []))

/** What a prior application actually sent (or would send). */
export const sentLines = (a: Application, base?: Row[]): Line[] | null =>
  a.submitted ?? (a.tailoring ? exportLines(a.tailoring) : a.resumeRows ? baseLines(a.resumeRows) : base ? baseLines(base) : null)

export const iso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const fmtDate = (s?: string) => s ? new Date(s + 'T00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
export const money = (n = 0) => n < 0.01 && n > 0 ? '<$0.01' : `$${n.toFixed(2)}`
export const uid = () => crypto.randomUUID()
export const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim() || 'Resume'
export const isUrl = (s: string) => /^(https?:\/\/|www\.)\S+$/i.test(s.trim())
export const go = (path: string) => { location.hash = '#' + path }
