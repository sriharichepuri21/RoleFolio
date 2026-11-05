export type Kind = 'name' | 'contact' | 'links' | 'title' | 'section' | 'role' | 'bullet' | 'text'
export type Level = 'basic' | 'medium' | 'aggressive'
export type Stage = 'Draft' | 'Applied' | 'Screen' | 'Interview' | 'Offer' | 'Rejected' | 'Closed'
export type Line = [Kind, string]

export interface Row { id: string; kind: Kind; text: string; section: string; group: string }
export interface Resume { id: string; name: string; fileName: string; rows: Row[]; createdAt: string; originalPdf?: string }

export interface Requirement {
  id: string; text: string; type: 'required' | 'preferred' | 'responsibility'; keywords: string[]
  status: 'supported' | 'transferable' | 'unsupported'; evidence: string[]; note: string
}
export interface Usage { model: string; input: number; output: number; cache_read: number; cache_write: number; cost: number }
export interface Analysis {
  company: string; title: string; seniority: string; domain: string[]; role_summary: string
  requirements: Requirement[]; scores: { fit: number; visibility: number }; usage: Usage
}
export interface TRow {
  id: string; kind: Kind; section: string; group: string; before: string; after: string; reason: string
  reqs: string[]; flag: string; include: boolean; moved?: boolean; rejected?: boolean; fit?: boolean; userExcluded?: boolean; strategyExcluded?: boolean
}
export interface MetricRecord {
  name: string; baseline: string; final: string; unit: string; period: string
  calculation: string; validation: string; causality: string
}
export interface EngineeringRecord {
  target: string; row_id?: string; requirement_ids: string[]; problem: string; environment: string
  responsibility: string; implementation: string; validation?: string; outcome: string; metric_basis: string; metric?: MetricRecord; generated_details: string[]
}
export interface GenerationPlan {
  narrative: string; priorities: string[]; bullets: { row_id: string; requirements: string[]; direction: string }[]; matrix: EngineeringRecord[]
  blueprint?: {
    specialization: string; p0_requirements: string[]; p1_requirements: string[]; p2_requirements: string[]; p3_requirements: string[]
    architectural_themes: string[]; expected_ownership: string; seniority: string; mandatory_constraints: string[]; operational_metrics: string[]; project_evidence: string[]
  }
  candidate_timeline?: { role: string; start: string; end: string; seniority: string; technical_theme: string }[]
}
export interface Tailoring {
  level: Level; mode: 'free' | 'locked' | 'reuse'; generative?: boolean; rows: TRow[]; title: string; verification: string[]; notes: string[]
  quality?: { status: 'passed' | 'needs_review'; revised: boolean; issues: string[] }
  strategy?: string
  evidence_ledger?: EngineeringRecord[]
  generation_plan?: GenerationPlan
  coverage?: { score: number | null; complete: boolean; method: string; requirements: { requirement: string; text: string; status: 'covered' | 'partial' | 'missing'; rows: string[]; reason: string }[] }
  missing?: { requirement: string; text: string; category: string; detail: string; question: string }[]
  exportApproval?: string
  reviewSuggestions?: string[]
  alignment?: {
    initial: number; final: number; rationale: string
    initial_rubric?: { critical: number; experience: number; responsibilities: number; preferred: number; projects: number; formatting: number }
    rubric: { critical: number; experience: number; responsibilities: number; preferred: number; projects: number; formatting: number }
  }
  technical_quality?: number; recruiter_quality?: number; visual_quality?: number
  document_qa?: { pages: number; selectable: boolean; rasterized: boolean; visual_inspection?: boolean; visual_issues?: string[] }
  scores: { fit: number; before: number; after: number }; usage?: Usage
  fit?: { size: number | null; log: string[] }
}
export interface Application {
  resumeRows?: Row[]
  originalPdf?: string
  editingSubmission?: boolean
  submissions?: { at: string; lines: Line[] }[]
  id: string; company: string; role: string; jd: string; jdUrl: string; level: Level; resumeId: string; stage: Stage
  createdAt: string; appliedAt?: string; analysis?: Analysis; tailoring?: Tailoring; submitted?: Line[]; cost?: number
}
export interface Settings { offline: boolean; has_key: boolean; key_hint: string; from_env: boolean; model: string; effort: string; spent: number }
export interface Diff { level: 'fact' | 'wording' | 'emphasis'; before: string; after: string; note: string }
