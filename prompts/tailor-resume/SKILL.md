---
name: tailor-resume
description: Tailor a base resume to a specific job description for ATS alignment while preserving truthful, interview-defensible claims. Use for resume targeting, keyword and skill analysis, summaries, skills sections, experience or project bullets, and application-ready resume rewrites. Do not use for cover letters or fabricated credentials.
---

# Tailor Resume

Create the strongest truthful version of the candidate's existing resume for one target role. Optimize relevance and language without turning job-description requirements into unsupported candidate claims.

## Required inputs

Use the complete job description and the candidate's base resume or equivalent verified career history. Also use any verified metrics, portfolio material, or user corrections supplied in the conversation. If either required input is missing, ask only for the missing material. If a source is unreadable or incomplete, state that before drafting.

## Evidence boundary

Treat the base resume and user-provided facts as the only evidence for candidate claims.

- Never invent employers, titles, dates, education, certifications, tools, responsibilities, project scope, metrics, or outcomes.
- Never claim a job-description keyword merely because the employer requests it.
- Preserve exact metrics and scope. Do not estimate or strengthen them.
- Use a keyword in a candidate claim only when the evidence supports that skill or a genuinely equivalent method. Do not silently translate between materially different tools.
- Express soft skills through supported behavior rather than unsupported labels.
- List a valuable unsupported requirement as a gap or clarification question, not as resume content.
- Use a clearly marked placeholder such as `[verified metric]` only when the user requests a draft with placeholders. Otherwise use a concrete qualitative outcome supported by the source.

## Workflow

1. Parse the job description into exact ATS phrases, hard skills, soft skills, responsibilities, required qualifications, preferred qualifications, and business outcomes.
2. Map each target requirement to the specific resume fact that supports it. Classify it as **supported**, **transferable with careful wording**, or **unsupported**.
3. Identify the best-fit title from the posting. Prefer its exact title unless it contains location, level, requisition text, or other metadata that should be removed. Do not promote the candidate beyond the evidence.
4. Prioritize content by relevance and proof strength. Use high-value supported keywords naturally; keyword density is not a substitute for readability.
5. Draft only the sections requested. For a full tailoring request, produce the title, summary, categorized skills, rewritten experience and project bullets, then a short gap and verification report.
6. Run the final audit in [references/quality-standard.md](references/quality-standard.md) before delivering.

## Drafting rules

### Title and summary

- Use one best-fit title.
- Write exactly four sentences and no more than 75 words unless the user's template requires something else.
- Sentence 1 names the target title and accurately states the candidate's background or experience level.
- Sentence 2 integrates three to six supported technical or analytical strengths.
- Sentence 3 connects those strengths to supported value, outputs, or outcomes.
- Sentence 4 demonstrates one or two supported soft skills and connects them to the target team's impact.
- Use a confident third-person professional voice without “I” or “my,” empty buzzwords, or references to other job titles.

### Skills

- Target 25–40 skills only when enough relevant, supported skills exist; never pad to reach a quota.
- Organize skills into three to five role-relevant categories rather than a generic fixed taxonomy.
- Preserve the job description's exact wording when it truthfully matches the candidate's evidence.
- Include base-resume skills that improve credibility and role fit, even when not repeated verbatim in the posting.
- Do not place behavioral soft skills in a technical skills inventory unless the template explicitly requires it.

### Experience and project bullets

- Preserve employer, title, location, and date facts unless the user asks to omit them.
- Preserve the base resume's role and project structure. Change bullet counts only when requested or when fitting an agreed page limit.
- Start bullets with strong, varied action verbs; do not force novelty at the cost of accuracy.
- Communicate action, method or relevant skill, and a supported result, output, scope, or purpose.
- Prefer 15–30 words where practical, but clarity and source fidelity take priority.
- Use one or two important hard skills per bullet. Avoid keyword lists, repeated claims, first-person language, and company names inside bullets.
- Use metrics only when the evidence contains them. A concrete artifact, cadence, audience, scale, or decision enabled can make an unquantified bullet specific.
- Keep verb tense consistent: present for ongoing responsibilities and past for completed or previous work.
- Do not add a required skill to an unrelated role merely to increase ATS coverage.

## Output modes

Follow the user's requested format. If none is specified, use:

1. **Target role and match analysis** — exact job title; supported hard and soft skills; transferable skills; unsupported or missing requirements.
2. **Tailored resume content** — summary, categorized skills, and revised sections in the base resume's order.
3. **Verification needed** — placeholders, ambiguous claims, unsupported high-value requirements, or facts the candidate should confirm before applying.

For paste-ready content requests, omit analysis but never omit visible placeholders or warnings needed to prevent a false claim. Preserve the original template and section order when editing a supplied resume file.

## Final handoff

State that the result is tailored from supplied evidence, identify anything that still needs confirmation, and recommend a final human check for dates, metrics, titles, formatting, and interview defensibility. Do not claim an ATS score unless an actual scoring system was used and its method is explained.
