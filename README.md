# RoleFolio

A personal, local-first job application workspace. Upload your base resume, paste a job posting (text or link), and RoleFolio:

1. **Analyzes the match.** Each requirement is extracted with its exact ATS phrasing and mapped to the resume line that proves it, or marked as a gap.
2. **Tailors at the depth you choose** (Basic / Medium / Aggressive). Every change is shown before and after with its reason, and you accept, edit or reject each one.
3. **Enforces truth in code.** Any drafted line that adds a figure, an unsupported requirement keyword or an unevidenced skill is rejected, and your original wording is kept.
4. **Checks consistency per company.** A second application to the same company is compared with what you already sent. Differences are classed as fact conflicts, wording or emphasis, and you choose: tailor within locked facts, reuse the earlier version, or tailor freely.
5. **Records on download.** An application lands on the dashboard when you download its final resume. The exact version is saved, and drafts wait under *In progress*.
6. **Uses one template.** Every preview, PDF and Word export follows the same layout: centred name and contact line, bold target title over the summary, Skills, Professional Experience (**Title**, Company · dates right-aligned), Projects, Education, Certifications. Hyperlinks from your original resume stay live.

Exports are a one-page US Letter PDF (hyperlinks verified) and Word.

## Run

Requires Python 3.11+ and Node 20+.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd web && npm install && npm run build && cd ..
.venv/bin/python server.py          # http://127.0.0.1:8765
```

No API key yet? The **offline engine** (free, keyword-based) runs the whole workflow automatically, so you can try every screen. For real tailoring, add your Anthropic API key under **Settings**. It is stored in `data/settings.json` (mode 600) and never sent to the browser. You can also set `ANTHROPIC_API_KEY`. Pick the model and effort there. Opus 5.5 is the default; Sonnet 5.5 and Haiku 5.5 cost less.

**Development** (hot reload): run `server.py`, then `cd web && npm run dev` and open http://localhost:5173.

## Cost

Two Claude calls per application: analysis, then tailoring. The system prompt and your resume are a cached prefix shared by both calls, so the second call reads them from cache at about a tenth of the input price. Each application's cost is shown on it, and the running total is in Settings.

## Data

Everything lives in `data/`: `rolefolio.db` (SQLite) and `settings.json`. Back up that folder to keep your history. Data from the earlier single-file version (browser localStorage) is imported automatically on first launch.

## Tests

```sh
.venv/bin/python -m unittest -v      # parser, truth guard, tailoring assembly, company conflict classifier
cd web && npm test                   # export lines, change highlighting, company matching
```

## Layout

| File | Role |
|---|---|
| `server.py` | Local HTTP server, API routes, PDF renderer |
| `engine.py` | Resume structuring, Claude prompts and schemas, truth guard, scoring, company comparison |
| `store.py` | SQLite records and settings |
| `formats.py`, `job_page.py`, `resume_links.py` | Word import/export, posting import (SSRF-safe), PDF text and link extraction |
| `web/` | React + TypeScript UI (Vite) |
| `legacy-web/` | The previous single-file UI, kept for reference; safe to delete |
