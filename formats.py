import io
import json
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit
from job_page import fetch_page, parse_page, plain
from zipfile import ZipFile

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.shared import Inches, Pt, RGBColor
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


def word_text(data):
    with ZipFile(io.BytesIO(data)) as package:
        if sum(item.file_size for item in package.infolist()) > 25000000:
            raise ValueError("Word document is too large to extract.")
    doc = Document(io.BytesIO(data))
    lines = []
    for block in doc.iter_inner_content():
        if hasattr(block, "rows"):
            lines.extend(" | ".join(c.text for c in row.cells) for row in block.rows)
            continue
        prefix = {"Heading 1": "# ", "Heading 2": "## ", "List Bullet": "• "}.get(block.style.name, "")
        if block.text.strip():
            lines.append(prefix + block.text.strip())
            links = [(" ".join(h.text.split()) or h.url, h.url) for h in block.hyperlinks if h.url and h.url.startswith(("http", "mailto:"))]
            if links:  # same "@ label url" convention as PDF import, so links follow their line into the output
                lines.append("@ " + " | ".join(f"{label.replace('|', ' ')} {url}" for label, url in links))
    return "\n".join(lines)


def add_link(p, text, url):
    link = OxmlElement("w:hyperlink")
    link.set(qn("r:id"), p.part.relate_to(url, RT.HYPERLINK, is_external=True))
    run = p.add_run(text)
    run.underline = True
    run.font.color.rgb = RGBColor(0x1A, 0x4F, 0xB5)
    link.append(run._r)
    p._p.append(link)
    return run


def word_file(rows, synthetic=False):
    """Word export in the same template as the PDF: Times, centred header, bold leads, right-aligned dates, live links."""
    import layout
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.top_margin = section.bottom_margin = Inches(.47)
    section.left_margin = section.right_margin = Inches(.56)
    if synthetic:
        footer = section.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = footer.add_run("SYNTHETIC SAMPLE — NOT FOR SUBMISSION")
        run.bold = True
        run.font.size = Pt(7)
        run.font.color.rgb = RGBColor(0x59, 0x59, 0x59)
    right_edge = section.page_width - section.left_margin - section.right_margin
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.0
    for item in layout.plan(rows):
        kind = item["kind"]
        p = doc.add_paragraph()
        fmt = p.paragraph_format
        if kind in ("name", "contact", "title"):
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if kind == "summary":
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        if kind == "section":
            fmt.space_before = Pt(8)
            fmt.space_after = Pt(2)
        if kind in ("entry", "title"):
            fmt.space_before = Pt(4)
        if kind == "entry":
            fmt.tab_stops.add_tab_stop(right_edge, WD_TAB_ALIGNMENT.RIGHT)
        if kind == "bullet":
            fmt.left_indent, fmt.first_line_indent = Inches(.22), Inches(-.16)
            fmt.tab_stops.add_tab_stop(Inches(.22))
            p.add_run("•\t")
        for text, url, bold in item["runs"]:
            run = add_link(p, text, url) if url else p.add_run(text)
            run.bold = bold or kind in ("name", "section")
            if kind == "name":
                run.font.size = Pt(17)
            if kind in ("section", "title"):
                run.font.size = Pt(11)
        if item["right"]:
            p.add_run("\t" + item["right"])
    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


class PostingText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_endtag(self, tag):
        if tag in ("p", "li", "div", "h2", "h3"):
            self.parts.append("\n")


GENERIC_HOSTS = re.compile(r"linkedin|indeed|glassdoor|ziprecruiter|monster|dice|wellfound|angel|builtin|simplyhired|google\.com/search")


def company_from_host(link):
    """amazon.jobs -> Amazon, careers.google.com -> Google, nvidia.wd5.myworkdayjobs.com -> Nvidia."""
    host = (urlsplit(link).hostname or "").lower()
    if not host or GENERIC_HOSTS.search(host):
        return ""
    if re.search(r"lever\.co|greenhouse\.io|ashbyhq\.com|smartrecruiters\.com|workable\.com|recruitee\.com", host):
        org = urlsplit(link).path.strip("/").split("/")[0]  # ATS boards put the employer in the path
        return org.replace("-", " ").title()
    labels = [l for l in host.split(".") if l not in ("www", "jobs", "careers", "career", "apply", "boards", "job-boards", "hire", "talent", "work")]
    if "myworkdayjobs" in host or "icims" in host or "taleo" in host:
        return labels[0].replace("-", " ").title() if labels else ""
    core = labels[-2] if len(labels) >= 2 else (labels[0] if labels else "")
    return core.replace("-", " ").title()


def posting(link):
    link = link.strip()
    if link and "://" not in link:
        link = "https://" + link
    data = fetch_posting(link)
    if not data.get("company"):
        data["company"] = company_from_host(link)
    return data


def fetch_posting(link, _depth=0):
    from job_portals import portal_posting, embedded_links
    found = portal_posting(link, fetch_page)
    if found:
        return found
    u = urlsplit(link)
    path = u.path.strip("/")
    workday = re.fullmatch(r'([\w-]+)\.wd\d+\.myworkdayjobs\.com', u.hostname or '')
    if workday and u.scheme == 'https' and not u.username and not u.password and u.port in (None, 443):
        match = re.fullmatch(r'(?:[a-z]{2}-[A-Z]{2}/)?([\w-]+)/job/(.+)', path)
        if not match:
            raise ValueError('Open an individual Workday job posting, then import its link.')
        site, job_path = match.groups()
        endpoint = f'https://{u.hostname}/wday/cxs/{workday[1]}/{site}/job/{job_path}'
        data = json.loads(fetch_page(endpoint))
        info = data.get('jobPostingInfo') or {}
        description = info.get('jobDescription')
        if not isinstance(description, str) or not description.strip():
            raise ValueError('Workday did not return an active job description. The posting may have closed; paste its text to continue.')
        from lxml import html
        company = (data.get('hiringOrganization') or {}).get('name', '') if isinstance(data.get('hiringOrganization'), dict) else ''
        return dict(title=info.get('title') or '', company=company, jd=plain(html.fragment_fromstring(description, create_parent='div')))
    greenhouse = u.hostname in ("job-boards.greenhouse.io", "boards.greenhouse.io")
    pattern = r"([\w-]+)/jobs/(\d+)" if greenhouse else r"([\w-]+)/([a-fA-F0-9-]{36})"
    match = re.fullmatch(pattern, path)
    if u.scheme != "https" or not match or not (greenhouse or u.hostname in ("jobs.lever.co", "jobs.eu.lever.co")):
        body = fetch_page(link)
        try:
            return parse_page(body)
        except ValueError:
            links = embedded_links(body, link) if _depth < 2 else []
            if len(links) == 1:
                return fetch_posting(links[0], _depth + 1)
            if len(links) > 1:
                raise ValueError('This page links to several postings. Import the individual job link, not the careers index.')
            raise
    org, key = match.groups()
    api = (f"https://boards-api.greenhouse.io/v1/boards/{org}/jobs/{key}" if greenhouse
           else f"https://{'api.eu.lever.co' if u.hostname == 'jobs.eu.lever.co' else 'api.lever.co'}/v0/postings/{org}/{key}?mode=json")
    data = json.loads(fetch_page(api))
    if greenhouse:
        from html import unescape
        parser = PostingText()
        parser.feed(unescape(data["content"]))
        return dict(company=data.get("company_name") or org, title=data["title"], jd="".join(parser.parts))
    parser = PostingText()
    for item in data.get("lists", []):
        parser.parts.append("\n" + item["text"] + "\n")
        parser.feed(item["content"])
    return dict(company=org, title=data["text"], jd=data.get("descriptionPlain", "")+"\n"+"".join(parser.parts)+"\n"+data.get("additionalPlain", ""))
