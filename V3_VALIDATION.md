# Resume Architect V3 implementation and validation

Updated 2026-11-04.

## Implemented behavior

- Reconstruct wrapped source accomplishments before generation; retain/remap evidence IDs. Source records stay unchanged.
- Aggressive mode uses a JD blueprint, candidate timeline, engineering matrix and separate illustrative-detail/metric ledger. Basic/Medium retain their evidence restrictions.
- Select P0/P1 technical coverage and useful P2 details; avoid forcing all skills, metrics or projects into the document. Preserve immutable career facts and project identities.
- Score original and final content using the same six-category 30/25/20/10/10/5 rubric. Validate category ranges. Present this comparison as the primary tailored score; coverage remains a separate diagnostic. Legacy records without an initial rubric do not claim comparable scoring.
- Audit final fitted content. Run engineering and recruiter/image reviews concurrently, with independent result snapshots. The recruiter receives the evidence ledger.
- Attempt up to two corrections for aggressive mode, only when findings remain. Preserve the stronger candidate and its corresponding draft payload. Prioritize a passing audit and technical/recruiter quality before alignment/coverage.
- Preserve hard eligibility gaps as gaps rather than asking the writer to change credentials.
- PDF: US Letter, 10 pt body, 40 pt margins, explicit summary heading, centered contact details, selectable text and hyperlinks. Excess content must be selected/edited instead of reducing the font.
- Approve synthetic exports only after all reviews pass. Local signatures bind approval to exact lines and the renderer version. Manual content changes invalidate approval. Failed drafts remain visible for review. Synthetic downloads do not automatically mark an application as applied.

## Validation scope

- Python regression suite covers source reconstruction, protected facts, score schema/ranges, review concurrency, revision selection, metric checks, PDF checks and export approval binding.
- Frontend tests and production typecheck/build run separately.
- Live checks use a fictional test resume and JD with the configured model; no personal resume is transmitted.
- Inspect the rendered live-test PDF, not only extracted text.

## Limits

- Scores and semantic reviews are model estimates, not employer ATS predictions or proof that hypothetical work occurred.
- A bounded correction budget can end with unresolved findings. Such a draft is not approved for export; no passing score is manufactured.
- The live fictional fixture does not establish quality, latency, or page fit for every candidate and JD.
- DOCX exports are editable and Word may paginate differently; exact one-page enforcement is for PDF.
- Older saved drafts are not automatically rewritten. They need regeneration for the new rubric and approval flow.

## Latest validation result

- 75 Python tests passed; 6 frontend tests passed; production build passed.
- Full fictional analysis → planning → generation → bounded corrections → independent reviews: 98 seconds with the configured Sonnet model.
- Comparable rubric: original 47/100, final 88/100. This is one fictional fixture, not a general improvement guarantee.
- PDF: one Letter page, 10 pt body, selectable text and successful rasterization; rendered image inspected for alignment and clipping.
- Final audit still identified a release-metric/ledger-period inconsistency and a tenure-wording finding. Export approval was correctly absent. This is not a passing semantic-quality benchmark.
- Live local API smoke test confirmed rejection of an unaudited synthetic export.

## Metric and review follow-up

- Corrected rate-denominator and time-unit comparisons, zero-baseline percentages, and change-direction validation.
- Revision policy can repair provisional metric assumptions; the final ledger is authoritative. The final correction pass preserves unaffected content and introduces no new metrics or claims.
- Engineering findings now distinguish blocking defects from observations. Deterministic checks remain blocking; observations remain visible as optional refinements.
- 83 Python regression tests passed, including Aggressive deterministic audits, strongest-project-bullet retention, and leadership-bullet preservation.
- Live generation produced a fictional draft with alignment 46 → 89. Its follow-up review under the corrected finding schema completed in 11 seconds with no blocking findings. This review reused its recorded requirement texts and priority blueprint rather than regenerating the document.
- Successful approval was verified through the restarted `/api/pdf` endpoint (HTTP 200); one-page text extraction/rasterization checks passed and the exported page was visually inspected.
- This supersedes the prior unresolved status for the fictional fixture. It does not guarantee every future generation passes or prove any hypothetical achievement occurred.
