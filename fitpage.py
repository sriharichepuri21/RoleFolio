"""Fit a tailored resume to exactly one page by measuring the rendered layout and adjusting content in priority order.
No model calls: every step is deterministic, preserves existing figures, and is logged on the row it touched.

Too long: tighten wrapped wording, deduplicate skills, and trim secondary project and other-section bullets
          before cutting unprotected experience bullets. Synthetic drafts remove lower-value other-section
          bullets first so generated professional experience retains priority.
Room to spare: restore dropped experience bullets first, then the renderer uses larger text."""
import re

import layout
import pdfdoc
from engine import WEIGHT, has

COMFORT = 10.0   # V3 minimum readable body size.
READABLE = 10.0
TIGHTEN = [(r"\bin order to\b", "to"), (r"\bso as to\b", "to"), (r"\bfor the purpose of\b", "for"), (r"\bwith the goal of\b", "to"),
           (r"\bas well as\b", "and"), (r"\ba variety of\b", "various"), (r"\ba wide range of\b", "many"), (r"\ba number of\b", "several"),
           (r"\bthrough the use of\b", "using"), (r"\bby means of\b", "by"), (r"\bwith the help of\b", "with"),
           (r"\butiliz(e|es|ed|ing)\b", r"us\1"), (r"\bon a (daily|weekly|monthly) basis\b", r"\1"), (r"\bin a timely manner\b", "promptly"),
           (r"\bincluding but not limited to\b", "including"), (r"\bincreasing\b", "raising"), (r"\bapproximately\b", "about"),
           (r"\b(successfully|effectively|significantly) ", ""), (r"\bthat (?:was|were) used to\b", "to"), (r"\bthe overall\b", "overall")]


def text_of(r):
    return r["before"] if r.get("rejected") else r["after"]


def lines(rows):
    return [[r["kind"], text_of(r)] for r in rows if r["include"] and not (r.get("rejected") and not r["before"]) and text_of(r).strip()]


def size(rows):
    return pdfdoc.best_size(lines(rows))


def tighten(text):
    out = text
    for pattern, repl in TIGHTEN:
        out = re.sub(pattern, repl, out, flags=re.I)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out[:1].upper() + out[1:]


def fit(rows, reqs, generative=False):
    rows = [dict(r) for r in rows]
    log = []
    stype = lambda r: layout.section_type(r["section"])
    live = list(reqs) if generative else [q for q in reqs if q["status"] != "unsupported"]

    def relevance(r):
        t = text_of(r)
        return sum(WEIGHT[q["type"]] for q in live if q["id"] in r.get("reqs", []) or r["id"] in q["evidence"] or any(has(t, k) for k in q["keywords"]))

    # The single strongest bullet behind each required qualification is never cut.
    protected = set()
    for q in live:
        if q["type"] != "required":
            continue
        cover = [r for r in rows if r["kind"] == "bullet" and r["include"] and (q["id"] in r.get("reqs", []) or r["id"] in q["evidence"] or any(has(text_of(r), k) for k in q["keywords"]))]
        if cover:
            protected.add(max(cover, key=relevance)["id"])

    def cut(r, why):
        r.update(include=False, fit=True, reason=why)
        log.append(f"{why[:-1]}: “{text_of(r)[:60]}…”")

    def good(target):
        s = size(rows)
        return s is not None and s >= target

    # Room to spare: give it back to professional experience first.
    if good(COMFORT):
        dropped = sorted((r for r in rows if r["kind"] == "bullet" and not r["include"] and stype(r) == "experience"
                          and not r.get("userExcluded") and not r.get('strategyExcluded') and r["before"]), key=relevance, reverse=True)
        for r in dropped:
            r["include"] = True
            if good(COMFORT):
                r.update(fit=True, reason="Restored: there was room on the page.")
                log.append(f"Restored an experience bullet: “{text_of(r)[:60]}…”")
            else:
                r["include"] = False
        return rows, dict(size=size(rows), log=log)

    steps = []
    # 1. Tighten wording only where it removes a wrapped line.
    def tighten_step():
        for r in rows:
            if not r["include"] or r.get("rejected") or r.get("flag") or r["kind"] not in ("bullet", "text"):
                continue
            new = tighten(r["after"])
            if new == r["after"]:
                continue
            before_h = pdfdoc.height(lines(rows), READABLE)
            old = r["after"]
            r["after"] = new
            if pdfdoc.height(lines(rows), READABLE) < before_h:
                r.update(fit=True, reason=(r["reason"] + " " if r["reason"] else "") + "Tightened to remove a wrapped line.")
                log.append(f"Tightened: “{new[:60]}…”")
                yield
            else:
                r["after"] = old
    steps.append(tighten_step)

    # 2. Remove repeated skills, then trim skills the posting doesn't name from rows that wrap.
    def skills_step():
        wanted = {k.lower() for q in reqs for k in q["keywords"]}
        seen = set()
        skill_rows = [r for r in rows if r["include"] and stype(r) == "skills" and r["kind"] == "text" and ":" in text_of(r)]
        for r in skill_rows:
            cat, items = r["after"].split(":", 1)
            kept = []
            for i in (i.strip() for i in items.split(",")):
                if i and i.lower() not in seen:
                    kept.append(i)
                    seen.add(i.lower())
            if len(kept) < len([i for i in items.split(",") if i.strip()]):
                r.update(after=f"{cat}: {', '.join(kept)}", fit=True, reason="Removed skills repeated in another category.")
                log.append(f"Removed repeated skills in {cat}.")
                yield
        for r in sorted(skill_rows, key=lambda r: -len(r["after"])):
            cat, items = r["after"].split(":", 1)
            parts, original = [i.strip() for i in items.split(",") if i.strip()], r["after"]
            base_h, saved = pdfdoc.height(lines(rows), READABLE), False
            for k in range(1, max(1, len(parts) - 2)):
                if parts[-k].lower() in wanted:
                    break  # never trim a skill the posting names
                r["after"] = f"{cat}: {', '.join(parts[:-k])}"
                if pdfdoc.height(lines(rows), READABLE) < base_h:
                    saved = True
                    break
            if not saved:
                r["after"] = original
                continue
            r.update(fit=True, reason="Trimmed skills the posting doesn't mention to save a line.")
            log.append(f"Trimmed {cat}: {', '.join(parts[len(r['after'].split(':', 1)[1].split(',')):])}.")
            yield
    steps.append(skills_step)

    def bullets_by_group(section_types):
        groups = {}
        for r in rows:
            if r["kind"] == "bullet" and r["include"] and stype(r) in section_types:
                groups.setdefault((r["section"], r["group"]), []).append(r)
        return groups

    # 3. Secondary project bullets: every project keeps its first bullet.
    def projects_step():
        extra = [r for g in bullets_by_group({"projects"}).values() for r in g[1:] if r["id"] not in protected]
        for r in sorted(extra, key=relevance):
            cut(r, "Removed a secondary project bullet to fit one page.")
            yield
    steps.append(projects_step)

    # Verified drafts retain up to two other-section bullets until experience has been trimmed.
    # Synthetic drafts remove these lower-value bullets before generated professional experience.
    def other_step(keep):
        def step():
            extra = [r for g in bullets_by_group({"other"}).values() for r in g[keep:] if r["id"] not in protected]
            for r in sorted(extra, key=relevance):
                cut(r, "Removed a secondary bullet to fit one page.")
                yield
        return step
    steps.append(other_step(0 if generative else 2))

    # Experience last. Allocation: ~5 bullets for the latest role, ~3 for earlier ones. Trim the role furthest over
    #    its allocation first, least relevant bullet first; never protected requirement coverage; floor of 3 (latest) / 2 (earlier).
    TARGET, FLOOR = [5, 3, 3], [3, 2, 2]
    at = lambda arr, n: arr[n] if n < len(arr) else max(1, arr[-1] - 1)

    def experience_step():
        while True:
            groups = list(bullets_by_group({"experience"}).values())  # resume order: most recent role first
            options = [(len(g) - at(TARGET, n), -relevance(r), n, len(text_of(r)), r) for n, g in enumerate(groups)
                       for r in g if r["id"] not in protected and len(g) > at(FLOOR, n)]
            if not options:
                return
            cut(max(options, key=lambda o: o[:4])[4], "Removed a less relevant bullet to fit one page.")
            yield
    steps.append(experience_step)
    if not generative:
        steps.append(other_step(1))

    for step in steps:
        if good(READABLE):
            break
        for _ in step():
            if good(READABLE):
                break
    final = size(rows)
    if final is None:
        log.append("Still longer than one page. Exclude or shorten a line yourself.")
    elif final < READABLE:
        log.append(f"Kept core evidence by using {final}pt text.")
    return rows, dict(size=final, log=log)
