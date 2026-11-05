import { expect, test } from 'vitest'
import { changedIndexes, exportLines, normCompany, sameCompany, sameRole, sentLines, selectedLines, tailoredDraft } from './lib'
import type { Application, Tailoring, TRow } from './types'

const row = (id: string, before: string, after: string, extra: Partial<TRow> = {}): TRow =>
  ({ id, kind: 'bullet', section: 'Experience', group: '', before, after, reason: '', reqs: [], flag: '', include: true, ...extra })

test('re-tailoring exports the new draft while preserving the previous submission', () => {
  const prior = { submitted: [['bullet', 'Medium version']], editingSubmission: false } as Application
  const t = { level: 'aggressive', rows: [row('a', 'Base', 'Aggressive version')] } as Tailoring
  const updated = { ...prior, ...tailoredDraft(t) }
  expect(selectedLines(updated)).toEqual([['bullet', 'Aggressive version']])
  expect(sentLines(updated)).toEqual([['bullet', 'Medium version']])
  expect(selectedLines({ ...updated, editingSubmission: false })).toEqual([['bullet', 'Medium version']])
})

test('company comparisons preserve the sent version while a replacement is edited', () => {
  const app = { submitted: [['bullet', 'Actually sent']], editingSubmission: true,
    tailoring: { rows: [row('a', 'Original', 'Unsent edit')] } } as Application
  expect(sentLines(app)).toEqual([['bullet', 'Actually sent']])
})

test('application source snapshot survives library edits and deletion', () => {
  const app = { resumeRows: [{ id: 'r0', kind: 'name', text: 'Original', section: '', group: '' }] } as Application
  expect(sentLines(app, [{ id: 'r0', kind: 'name', text: 'Changed library', section: '', group: '' }])).toEqual([['name', 'Original']])
  expect(sentLines(app)).toEqual([['name', 'Original']])
})

test('company names normalize across legal suffixes', () => {
  expect(normCompany('Stripe, Inc.')).toBe(normCompany('stripe'))
  expect(normCompany('Halcyon Technologies LLC')).toBe('halcyon')
  const app = (company: string, jdUrl = '') => ({ company, jdUrl }) as Application
  expect(sameCompany(app('Google LLC'), app('Google'))).toBe(true)
  expect(sameCompany(app('', 'https://careers.halcyon.io/a'), app('', 'https://careers.halcyon.io/b'))).toBe(true)
  expect(sameCompany(app('', 'https://boards.greenhouse.io/a'), app('', 'https://boards.greenhouse.io/b'))).toBe(false)
})

test('role matching is about the job, not just the company', () => {
  expect(sameRole('Software Engineer', 'Software Engineer, Worldwide Amazon Stores Finance Technology')).toBe(true)
  expect(sameRole('Sr. Backend Engineer', 'Senior Backend Engineer')).toBe(true)
  expect(sameRole('Software Engineer', 'Product Manager')).toBe(false)
  expect(sameRole('Data Engineer', 'Data Scientist')).toBe(false)
})

test('export honours rejections, exclusions and added rows', () => {
  const t = {
    rows: [
      row('title', '', 'Backend Engineer', { kind: 'role' }),
      row('a', 'Old A', 'New A'),
      row('b', 'Old B', 'New B', { rejected: true }),
      row('c', 'Old C', 'Old C', { include: false }),
      row('s', '', 'Languages: Go', { rejected: true }),
      row('d', 'Same', 'Same', { moved: true }),
    ],
  } as Tailoring
  expect(exportLines(t).map(l => l[1])).toEqual(['Backend Engineer', 'New A', 'Old B', 'Same'])
  expect(changedIndexes(t)).toEqual([0, 1, 3])
})
