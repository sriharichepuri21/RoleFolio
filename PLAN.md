# RoleFolio: Audit and Launch Plan

Date: 2026-11-03. Covers the current code (server.py, formats.py, job_page.py, resume_links.py, web/) checked against the product brief.

---

## 1. What exists today

A local, single-user app: a Python standard-library HTTP server and one vanilla-JS file of about 38 KB. All data lives in the browser (localStorage and IndexedDB).

| Brief requirement | Status | Notes |
|---|---|---|
| Upload resume (PDF/Word) | **Partial** | The UI accepts PDF only. A `/extract-word` endpoint exists but nothing in the UI calls it. |
| JD as text or link | **Done** | Greenhouse and Lever APIs, JSON-LD, then an HTML fallback. The URL fetch is protected against SSRF. Solid. |
| Role search + dropdown (tech roles) | **Weak** | A `<datalist>` of 8 roles, most of them not tech roles. |
| Tailoring level Basic/Medium/Aggressive | **Weak** | Chosen on a later screen, not at intake. The "rewrite" is a handful of regex phrase swaps. Aggressive barely differs from Medium. |
| Single intake layout + Submit + auto company parse | **Missing** | Split across 3 screens (Source resume, Add job, Prepare). Company is parsed only from links. |
| Parsed "before" resume + sidebar (requirements, matched, gaps, domain) | **Partial** | The logic exists (`diagnose`, `analysis`), but it's hidden under "Supporting details". |
| Tailored resume: section changes, score, before/after preview, change sidebar | **Partial** | A good per-line inspector with click-to-edit on the PDF. The score counts terms from a hard-coded list of about 100 keywords. |
| Editing | **Done** | Click-to-edit on the rendered PDF, plus include/exclude/restore. |
| Export Word + PDF | **Done** | One-page PDF with verified hyperlinks, plus DOCX. |
| Dashboard: live list, company, date, resume, score | **Partial** | The tracker has a list, filters, a daily bar chart and a 6-month view. There's no link to the exact resume that was sent, and no sorting. |
| Daily/monthly counts, day/month filters, company search | **Done** | Basic but working. |
| **Intelligence: same-company conflict detection + suggestions** | **Partial** | `comparison()` exists but only runs after a draft is made, sits on a hidden tab, matches company names exactly ("Google" ≠ "Google LLC"), ignores unsent drafts and never warns at intake. |

## 2. Audit findings (ranked)

**Blockers for going live**
1. **No accounts, no server-side storage.** Everything is in localStorage. Clearing the browser deletes the user's history, it doesn't sync across devices, and it hits the roughly 5 MB quota after about 50–100 applications because each application stores its full resume rows. `save()` has no error handling, so once the quota is full new saves fail silently.
2. **The server is bound to `127.0.0.1:8765`, and the POST host check is hard-coded to that value.** It can't be deployed as is, and even `localhost:8765` gets a 403.
3. **The tailoring engine is not good enough to be the core product.** A fixed list of about 100 keywords plus regex rewrites can't do "senior-recruiter-quality" tailoring, a real match score, domain detection or role inference. This needs an LLM with strict guardrails against invented content.
4. **Single-threaded `HTTPServer`.** One slow posting fetch (9 s timeout × up to 6 redirects) blocks every other request.

**Quality / maintainability**
5. `web/app.js` is 270 lines of packed one-liners holding all state, all screens and all logic. It's not maintainable at the size the brief needs, so the frontend has to be rebuilt.
6. There are no tests at all. The parsers (`structureImport`, `extract_resume`, `parse_page`) are the riskiest code and have none.
7. The resume line-type parsing is duplicated in `draft()` and `sourceRows()`.
8. `draft()` reads `#mode` from a DOM element that only `brief()` creates, so the two are hidden-coupled.
9. Download filenames use the raw company name, which can contain `/` or `:`.
10. Environment: the system `python3` is 3.15 and none of the deps are installed (`docx` missing), so a venv is required, as the README says.

**Keep as is (good code, reuse it unchanged)**
- `job_page.fetch_page`: SSRF-safe fetching with address pinning.
- `formats.posting`: Greenhouse/Lever API parsing.
- `resume_links.extract_resume`: PDF text with hyperlinks recovered.
- `server.render` and `formats.word_file`: one-page PDF and DOCX export.
- The "changed figures" check before export. It's the seed of the no-fabrication guard.

## 3. Product principles (the recruiter's view)

These drive every design decision below.

- **The 6-second skim.** Recruiters read the top third first: title, latest role and the first 2 bullets. Tailoring should put most of its effort there.
- **ATS keywords count only in context.** A matched skill should appear inside an achievement bullet, not only in the skills list.
- **Never invent anything.** Tailoring may rephrase, reorder, emphasise or drop. It must never add an employer, title, date, metric or skill that isn't in the source. This is enforced in code, not left to the model's good behaviour.
- **Consistency across one company.** ATS tools (Greenhouse, Lever, Workday) merge a candidate's applications into one profile. Recruiters do see that you sent a different resume for another role. Differing *facts* (titles, dates, metrics) are a red flag. Differing *emphasis* is fine. This is the core of the intelligence feature.
- **The user approves every change.** Borrowed from Mercury's "review and approve every action" and Hobbes' "Approve update / Edit guidance".

## 4. Target architecture

| Layer | Choice | Why |
|---|---|---|
| Backend | **FastAPI** (Python) | The existing Python modules move over unchanged. It's async, so slow posting fetches don't block other requests. |
| DB | **Postgres** (Supabase or Neon) | Relational data (resumes → versions → applications), with JSON columns for resume rows. |
| Auth | Email magic link + Google (Supabase Auth or Clerk) | Job seekers won't create yet another password. |
| Files | S3-compatible storage (Supabase Storage or R2) | Original resume uploads. |
| AI | Claude Sonnet 5.5 via the Anthropic API, with structured JSON output | Requirement extraction, role inference, tailoring and conflict explanations. |
| Frontend | **React + Vite + TypeScript, Tailwind + Radix/shadcn** | The brief needs comboboxes, split panes, diff views, a command bar and charts. Recharts handles the dashboard charts. |
| Hosting | Fly.io or Render (API) + Vercel or Cloudflare Pages (web) | Cheap, with preview deploys. |
| Ops | Sentry, uptime check, daily DB backups, per-user AI rate limit and spend cap | |

### Data model
```
users(id, email, created_at)
resumes(id, user_id, name, original_file_key, created_at)        -- a user may keep several base resumes
resume_facts(id, resume_id, kind[employer|title|date|degree|metric|skill], value, source_line)
resume_versions(id, resume_id, application_id?, rows jsonb, created_at)  -- immutable snapshots
companies(id, user_id, name, normalized_name, domain)            -- "Google LLC" = "google" = google.com
applications(id, user_id, company_id, role, jd_text, jd_url, tailoring_level,
             stage[saved|draft|applied|screen|interview|offer|rejected|closed],
             resume_version_id, match_score, applied_at, created_at)
analyses(application_id, requirements jsonb, matched jsonb, gaps jsonb, domain jsonb)
```

### AI pipeline (each step is one structured call; the server validates every step)
1. **Parse the JD** → `{company, role, seniority, domain, requirements:[{text, type: required|preferred|responsibility, skills[]}]}`. This replaces the hard-coded keyword list and the regex bucketing.
2. **Parse the resume** → rows (the current row format) plus a **fact ledger** (employers, titles, dates, degrees, numbers, skills). The deterministic parser stays as a fallback.
3. **Match** → each requirement gets an evidence line or "gap". Score = weighted coverage (required ×3, responsibility ×2, preferred ×1). It's shown with the reasoning, not as a bare number.
4. **Tailor** at the chosen level:
   - *Basic*: reorder skills and bullets only.
   - *Medium*: plus rephrase bullets to surface matched terms.
   - *Aggressive*: plus rewrite the summary, drop low-relevance bullets and tighten for one page.
   Every changed line returns `{row_id, before, after, reason, requirement_ids}`.
5. **Guard (code, not a prompt):** reject any output line that brings in a number, employer, title, date or skill missing from the fact ledger. Rejected lines fall back to the original wording and are flagged. This builds on the existing changed-figures check.

## 5. Screens (Mercury-style layout)

Global: a **left sidebar** (Dashboard · New application · Applications · Resumes · Settings), a **⌘K command bar** to search companies and roles or jump to any application, a light neutral surface with one accent colour, dense tables with status pills, and skeleton loaders instead of spinners.

1. **New application (one screen, matching the brief)**
   - Left column: resume (pick a saved one, or drag in PDF/DOCX), JD (paste text *or* URL, auto-detected), role (a searchable combobox of about 60 tech roles, pre-filled from the JD), tailoring level (3-option segmented control with a one-line explanation each), **Analyze**.
   - Company is parsed automatically and shown as an editable chip.
   - **Conflict banner appears right here**, before any tailoring, if the company has been seen before (see screen 5).
2. **Analysis (before)**
   - Centre: the parsed resume rendered as a page.
   - Right sidebar tabs: Requirements · Matched (each with its evidence line highlighted in the page) · Gaps · Domain & seniority.
   - Primary action: "Tailor resume".
3. **Tailor and review**
   - Centre: tailored page with changed lines highlighted. Toggle Before / After / Side-by-side.
   - Right sidebar: score before → after, then a change list grouped by section. Each change has accept / reject / edit and the requirement it targets.
   - Inline editing on the page (reuse the existing click-to-edit). Export Word / PDF from the top bar.
   - Marking "Applied" freezes the resume version.
4. **Dashboard**
   - KPI row: today, this week, this month, response rate.
   - Bar chart with a day/month toggle.
   - Applications table: company · role · date applied · resume version (click to open) · score · stage pill.
   - Filters: date range, month, stage, company search. Sortable columns.
5. **Company intelligence (conflict resolver)**
   - Triggers when a new application's company matches a previous one (normalized name or domain).
   - Shows previous applications there: role, date, stage, the resume sent.
   - Every difference is classified:
     - 🟢 *Emphasis*: reorder or keyword choice. Safe.
     - 🟡 *Wording*: same bullet, different phrasing. Usually fine.
     - 🔴 *Fact*: title, date, metric or scope differs. Recruiters will notice.
   - Options, each with a one-line consequence:
     - **Reuse** the previous resume as is.
     - **Tailor within locked facts** (recommended): the previous submission's facts are frozen and only emphasis changes.
     - **Tailor freely**: allowed, with an explicit warning.
   - The user approves before anything changes.

## 6. Execution phases

Each phase ends with something deployable and demoable.

| # | Phase | Scope | Done when |
|---|---|---|---|
| **0** | Stabilize current app (1–2 days) | `ThreadingHTTPServer`; make the host check configurable; try/catch in `save()`; wire DOCX upload to `/extract-word`; tests for `structureImport`, `parse_page`, `posting`, `render` | Tests pass, and two slow imports don't block each other |
| **1** | Backend foundation (1 wk) | Repo + git, FastAPI app that imports the existing modules, Postgres schema above, auth, file storage, migrate the existing endpoints, CI (lint + tests) | Logged-in user can upload a resume, import a JD and export a PDF via the API |
| **2** | Frontend shell + design system (1 wk) | Vite/React/TS, tokens (colour, type, spacing), sidebar, ⌘K, table, pill, combobox, segmented control, empty states | Static screens 1–5 clickable with mock data |
| **3** | Intake + analysis (1 wk) | Screen 1 and screen 2; AI steps 1–3; tech role catalogue; company normalization | Paste a URL and see requirements, matches, gaps and score in under 15 s |
| **4** | Tailoring + review + export (1.5 wk) | AI step 4 and the guard (step 5); screen 3; version freeze on Applied | Three levels produce visibly different, fabrication-free drafts, and every change has a reason |
| **5** | Dashboard (4 days) | Screen 4; stage updates; localStorage import tool for existing users | Counts and charts match the DB, and filters combine |
| **6** | Company intelligence (1 wk) | Screen 5: fact diff, classification, three resolution options, banner at intake | A second application to the same company always shows the resolver |
| **7** | Launch (4 days) | Deploy, domain, HTTPS, Sentry, backups, rate limits and AI spend cap, privacy policy (resumes are personal data), delete-my-data, onboarding empty states | Public URL, a new user reaches a first export in under 3 minutes |

Total: about 7 weeks for one engineer.

### Test plan per phase
- Golden-file tests for the parsers: 5 real resumes (PDF and DOCX) and 10 real postings (Greenhouse, Lever, Workday, Ashby, plain HTML).
- Guard tests: feed the model's output with invented metrics, skills and titles, and assert they're rejected.
- Conflict tests: same company under different spellings, and fact versus emphasis differences.
- One Playwright run of the main path: intake → analyze → tailor → export → mark applied → second application to the same company → resolver.

## 7. Decisions needed from the owner
1. **Multi-user SaaS vs a single-user personal tool.** This plan assumes SaaS. A personal tool drops auth and multi-tenancy, saving about a week.
2. **LLM budget.** Roughly 4 calls per application. Pick a per-user monthly cap.
3. **Frontend rewrite to React** (recommended) **vs extending the vanilla JS.** The plan assumes the rewrite.
