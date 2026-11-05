"""Resume layout shared by the PDF and Word renderers: turns [kind, text] rows into template items with
bold leads, right-aligned dates and live hyperlinks reattached to the words they came from."""
import re

MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?"
DATE = rf"(?:{MONTH}\s+)?(?:\d{{1,2}}/)?(?:19|20)\d{{2}}"
RANGE = re.compile(rf"({DATE}\s*(?:[-–—]|to)\s*(?:{DATE}|Present|Current|Now|Ongoing)|{DATE})", re.I)
URL = re.compile(r"(?:https?://|www\.)[^\s|,;]+|\b(?:linkedin\.com|github\.com|gitlab\.com)/[^\s|,;]+", re.I)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
SECTION_NAMES = [(re.compile(r"summary|profile|objective", re.I), "summary"), (re.compile(r"skill|competenc", re.I), "skills"),
                 (re.compile(r"experience|employment|work history|internship", re.I), "experience"), (re.compile(r"project", re.I), "projects"),
                 (re.compile(r"educat", re.I), "education"), (re.compile(r"certif|licen", re.I), "certifications")]


def section_type(name):
    return next((t for rx, t in SECTION_NAMES if rx.search(name)), "other")


def split_entry(text):
    """'Software Engineer, Acme  Jan 2021 – Present | Seattle' -> ('Software Engineer, Acme', 'Jan 2021 – Present | Seattle')."""
    m = RANGE.search(text)
    if not m:
        return text, ""
    left = text[:m.start()].rstrip(" ,|/–—-(\t")
    rest = text[m.end():].strip(" ,|)–—-\t")
    if not left:
        return text, ""
    return left, m.group(1).strip() + (f" | {rest}" if rest else "")


def lead_length(text):
    """Length of the bold lead: 'Job Title' in 'Job Title, Company' (template style)."""
    m = re.search(r"\s*(?:,|\s[—–-]\s|\s\|\s|\sat\s)", text)
    return m.start() if m else len(text)


def link_map(rows):
    out = {}
    for kind, value in rows:
        if kind == "links":
            for item in value.split("|"):
                label, _, url = item.strip().rpartition(" ")
                if label and url.startswith(("http://", "https://")):
                    out.setdefault(label.strip(), url)
    return out


def href(raw):
    if EMAIL.fullmatch(raw):
        return "mailto:" + raw
    return raw if raw.lower().startswith("http") else "https://" + raw


def segments(text, labels=None, bold=0):
    """Split text into (text, url or None, bold) runs: labels from the source resume, raw URLs and emails become links."""
    spans = []
    for label, url in sorted((labels or {}).items(), key=lambda kv: -len(kv[0])):
        for m in re.finditer(rf"(?<!\w){re.escape(label)}(?!\w)", text, re.I):  # whole words only
            spans.append((m.start(), m.end(), url))
    spans += [(m.start(), m.end(), href(m.group().rstrip(".)"))) for rx in (URL, EMAIL) for m in rx.finditer(text)]
    chosen, end = [], 0
    for s in sorted(spans, key=lambda s: (s[0], -s[1])):
        if s[0] >= end:
            chosen.append(s)
            end = s[1]
    runs, pos = [], 0
    for start, stop, url in chosen:
        runs += [(text[pos:start], None), (text[start:stop], url)]
        pos = stop
    runs.append((text[pos:], None))
    out = []
    for piece, url in runs:  # apply the bold lead across run boundaries
        if not piece:
            continue
        cut = max(0, min(len(piece), bold))
        if cut:
            out.append((piece[:cut], url, True))
        if piece[cut:]:
            out.append((piece[cut:], url, False))
        bold -= len(piece)
    return out


def plan(rows):
    """[[kind, text], ...] -> template items, each covering one or more source rows (for click-to-edit boxes)."""
    labels = link_map(rows)
    items, section = [], "other"
    header_done = False
    for i, (kind, value) in enumerate(rows):
        value = value.strip()
        if kind == "section":
            header_done, section = True, section_type(value)
            items.append(dict(kind="section", runs=[(value.upper(), None, True)], right="", rows=[i]))
            continue
        if kind == "title":
            header_done = True
        if kind == "links":
            own = [item.strip().rpartition(" ") for item in value.split("|")]
            prev = items[-1] if items else None
            prev_text = "".join(r[0] for r in prev["runs"]).lower() if prev else ""
            if prev and prev["kind"] in ("contact", "name") and not header_done:
                if prev["kind"] == "name":  # no contact line: links become the contact line
                    items.append(dict(kind="contact", runs=[], right="", rows=[i]))
                    prev = items[-1]
                present = {l.lower() for l, _, _ in own if l.lower() in prev_text}
                for label, _, url in own:
                    if label and label.lower() not in present:
                        prev["runs"] += [("     ", None, False), (label, url, False)]
                prev["runs"] = contact_runs("".join(t for t, _, _ in prev["runs"]), labels)
                prev["rows"].append(i)
            elif prev and own and all(l.lower() in prev_text for l, _, _ in own if l):
                prev["runs"] = relink(prev["runs"], {l: u for l, _, u in own if l})  # only this line's own links
                prev["rows"].append(i)
            else:
                runs = []
                for label, _, url in own:
                    runs += ([("   |   ", None, False)] if runs else []) + [(label or url, url, False)]
                items.append(dict(kind="text", runs=runs, right="", rows=[i]))
            continue
        if kind == "name":
            merged = re.match(r"^([A-Z][A-Z .'-]+)\s+([A-Z][a-z].+)$", value) if EMAIL.search(value) and '|' in value else None
            if merged:
                items.append(dict(kind="name", runs=[(merged[1].strip(), None, True)], right="", rows=[i]))
                items.append(dict(kind="contact", runs=contact_runs(merged[2], labels), right="", rows=[i]))
            else:
                items.append(dict(kind="name", runs=[(value.upper(), None, True)], right="", rows=[i]))
        elif kind == "contact" or (kind == 'text' and not header_done and EMAIL.search(value)):
            items.append(dict(kind="contact", runs=contact_runs(value, labels), right="", rows=[i]))
        elif kind == "title":
            items.append(dict(kind="title", runs=segments(value.upper(), bold=len(value)), right="", rows=[i]))
        elif kind == "bullet":
            items.append(dict(kind="bullet", runs=segments(value), right="", rows=[i]))
        elif kind == "role" or (kind == "text" and section in ("education", "certifications") and RANGE.search(value)):
            left, right = split_entry(value)
            source_rows = [i]
            if section == 'experience' and right and items and items[-1]['kind'] == 'text':
                employer_line = ''.join(t for t, _, _ in items[-1]['runs'])
                employer = re.fullmatch(r'(.+?)\s+(?:/|[-–—])\s+(.+)', employer_line)
                if employer:
                    source_rows = items.pop()['rows'] + [i]
                    left += ', ' + employer[1].strip()
                    right += ' | ' + employer[2].strip()
            items.append(dict(kind="entry", runs=segments(left, bold=len(left) if section == 'experience' else lead_length(left)), right=right, rows=source_rows))
        elif kind == "text" and section == "skills" and 0 < value.find(":") < 40:
            items.append(dict(kind="skills", runs=segments(value, bold=value.find(":") + 1), right="", rows=[i]))
        elif kind == 'text' and section == 'education' and re.match(r'(?:Master|Bachelor|Doctor|M\.?S\.?|B\.?S\.?|MBA|Ph\.?D\.?)\b', value, re.I) and items and items[-1]['kind'] == 'text':
            institution = items.pop()
            school = ''.join(t for t, _, _ in institution['runs'])
            parts = re.split(r'\s+/\s+', school, maxsplit=1)
            items.append(dict(kind='entry', runs=segments(value, bold=len(value)), right='', rows=[i]))
            items.append(dict(kind='text', runs=segments(parts[0]), right=parts[1] if len(parts) > 1 else '', rows=institution['rows']))
        elif kind == 'text' and section == 'projects':
            if items and items[-1]['kind'] == 'bullet' and not re.search(r'[.!?]$', ''.join(t for t, _, _ in items[-1]['runs'])):
                items[-1]['runs'] += [(' ', None, False)] + segments(value)
                items[-1]['rows'].append(i)
            else:
                items.append(dict(kind='bullet', runs=segments(value), right='', rows=[i]))
        else:
            items.append(dict(kind="summary" if section == "summary" or (kind == "text" and items and items[-1]["kind"] == "title") else "text",
                              runs=segments(value), right="", rows=[i]))
    return items


def contact_runs(text, labels):
    """Contact items (phone, email, each link) spaced apart as in the template, whatever separators the source used."""
    pieces = []
    for t, url, _ in segments(text, labels):
        pieces += [(t.strip(), url)] if url else [(p.strip(), None) for p in re.split(r"\s*[|•·]\s*|\s{2,}", t) if p.strip()]
    runs = []
    for t, url in pieces:
        if not url and re.fullmatch(r'\+?[\d ()-]{10,}', t):
            url = 'tel:' + re.sub(r'[^\d+]', '', t)
        runs += ([("  |  ", None, False)] if runs else []) + [(t, url, False)]
    return runs


def relink(runs, labels):
    text_runs = []
    for text, url, bold in runs:
        text_runs += [(text, url, bold)] if url else [(t, u, bold) for t, u, _ in segments(text, labels)]
    return text_runs
