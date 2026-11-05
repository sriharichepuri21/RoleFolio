"""Template renderer. One layout pass serves three jobs: measuring (no canvas), the on-screen preview, and the PDF export."""
import io
from xml.sax.saxutils import escape

from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

import layout
from resume_links import safe_url

W, H = 612, 792  # V3 US Letter page.
M, CW, TOP, BOTTOM = 40, 612 - 80, 40, 40
LINK = "#0B4F8A"
SIZES = (10.0,)  # V3 readable body size; overflow requires content selection, never smaller text.


def markup(runs):
    out = []
    for text, url, bold in runs:
        s = "&nbsp;" * (2 * len(text)) if not text.strip() else escape(text).replace("  ", "&nbsp; ")
        if bold:
            s = f"<b>{s}</b>"
        if url and (safe_url(url) or url.startswith(("mailto:", "tel:"))):
            s = f'<link href="{escape(url, {chr(34): "&quot;"})}" color="{LINK}"><u>{s}</u></link>'
        out.append(s)
    return "".join(out)


def style(kind, size):
    base = dict(fontName="Helvetica", fontSize=size, leading=size * 1.18, bulletFontName="Helvetica-Bold", bulletFontSize=8.6, splitLongWords=False)
    base.update({"name": dict(fontName="Helvetica-Bold", fontSize=17, leading=20, alignment=1),
                 "contact": dict(alignment=1, fontSize=9), "section": dict(fontName="Helvetica-Bold", fontSize=10.5, leading=14),
                 "title": dict(fontName="Helvetica-Bold", fontSize=11, leading=14, alignment=1), "summary": dict(fontSize=10, leading=11.8),
                 "skills": dict(fontSize=10, leading=11.8),
                 "entry": dict(fontSize=10, leading=12.3),
                 "bullet": dict(leftIndent=11, bulletIndent=2)}.get(kind, {}))
    return ParagraphStyle(kind, **base)


def layout_pass(items, size, canvas=None, paged=False, footer=""):
    """Place every item. Returns (fits_one_page, height_used, boxes_by_row). Draws only when a canvas is given."""
    boxes, page, y, prev = {}, 0, H - TOP, None

    def draw_footer():
        if canvas and footer:
            canvas.saveState()
            canvas.setFont("Helvetica-Bold", 6.5)
            canvas.setFillColorRGB(0.35, 0.35, 0.35)
            canvas.drawCentredString(W / 2, 8, footer)
            canvas.restoreState()

    draw_footer()
    for item in items:
        kind = item["kind"]
        y -= {"section": 8, "entry": size * 0.45 if prev not in ("section", None) else 1, "title": size * 0.35,
              "contact": 3}.get(kind, 0)
        st = style(kind, size)
        para = Paragraph(markup(item["runs"]) or "&nbsp;", st, bulletText="•" if kind == "bullet" else None)
        width, right, rw, rh = CW, None, 0, 0
        if item["right"]:
            rw = stringWidth(item["right"], "Helvetica", 8.4) + 3
            right = Paragraph(escape(item["right"]), ParagraphStyle("right", parent=st, fontSize=8.4, alignment=2))
            _, rh = right.wrap(rw, 800)
            width = CW - rw - 12  # the left text wraps before the dates, so they can never overlap
        _, ph = para.wrap(width, 800)
        h = max(ph, rh)
        if h > H - TOP - BOTTOM:
            raise ValueError("Split this long entry into shorter lines.")
        if y - h < BOTTOM:
            if not paged:
                return False, H - TOP - y + h, boxes
            if canvas:
                canvas.showPage()
                draw_footer()
            page, y = page + 1, H - TOP
        y -= h
        if canvas:
            if kind == 'section':
                canvas.setLineWidth(0.65)
                canvas.line(M, y - 0.5, W - M, y - 0.5)
            para.drawOn(canvas, M, y + h - ph)
            if right:
                right.drawOn(canvas, M + CW - rw, y + h - rh)
        for r in item["rows"]:
            boxes[r] = [page, M / W, (H - y - h) / H, CW / W, h / H]
        y -= 2.3 if kind == 'bullet' else 1.5
        prev = kind
    return page == 0, H - TOP - y, boxes


def best_size(rows):
    """Largest readable size at which the rows fit one page, or None."""
    items = layout.plan(rows)
    return next((s for s in SIZES if layout_pass(items, s)[0]), None)


def height(rows, size):
    return layout_pass(layout.plan(rows), size, paged=True)[1]


def render(rows, preview=False, synthetic=False):
    """PDF bytes at the largest size that fits one page. Preview also returns per-row boxes and may run past one page."""
    items = layout.plan(rows)
    size = next((s for s in SIZES if layout_pass(items, s)[0]), None)
    if size is None and not preview:
        raise ValueError("This draft is longer than one page. Use Fit to one page, or exclude a few lines.")
    buf = io.BytesIO()
    c = Canvas(buf, pagesize=(W, H), pdfVersion=(1, 4))
    footer = "SYNTHETIC SAMPLE — NOT FOR SUBMISSION" if synthetic else ""
    _, _, boxes = layout_pass(items, size or SIZES[-1], c, paged=True, footer=footer)
    c.save()
    if not preview:
        return buf.getvalue()
    last, ordered = [0, 0, 0, 0, 0], []
    for i in range(len(rows)):
        last = boxes.get(i, last)
        ordered.append(last)
    return buf.getvalue(), ordered, size


def validate_pdf(data, rows, synthetic=False):
    """Validate the finished export, including selectable content and an actual raster render."""
    import re
    from pypdf import PdfReader
    import pypdfium2 as pdfium

    reader = PdfReader(io.BytesIO(data))
    if len(reader.pages) != 1:
        raise ValueError("The exported PDF is not exactly one page. Use Fit to one page.")
    page = reader.pages[0]
    if list(page.mediabox) != [0, 0, W, H]:
        raise ValueError("The exported PDF does not use the approved page dimensions.")
    normalize = lambda text: re.sub(r"\s+", " ", text).strip()
    extracted = normalize(page.extract_text() or "")
    if not extracted:
        raise ValueError("The exported PDF has no selectable text.")
    expected = [text for item in layout.plan(rows) for text, _, _ in item["runs"] if text.strip()]
    expected += [item["right"] for item in layout.plan(rows) if item["right"]]
    missing = next((text for text in expected if normalize(text) not in extracted), None)
    if missing:
        raise ValueError(f"Text is missing or clipped in the exported PDF: {missing[:60]}")
    label = "SYNTHETIC SAMPLE — NOT FOR SUBMISSION"
    if synthetic and label not in extracted:
        raise ValueError("The synthetic disclosure is missing from the exported PDF.")
    if not synthetic and "SYNTHETIC SAMPLE" in extracted:
        raise ValueError("A verified PDF must not contain the synthetic disclosure.")
    from resume_links import destinations
    expected_links = set(layout.link_map(rows).values())
    actual_links = {url for _, url in destinations(page)}
    if expected_links - actual_links:
        raise ValueError("A link is missing or invalid in the exported PDF.")
    with pdfium.PdfDocument(data) as document:
        rendered = document[0]
        bitmap = rendered.render(scale=1)
        if bitmap.width < W or bitmap.height < H:
            bitmap.close()
            rendered.close()
            raise ValueError("The PDF preview rendered at unexpected dimensions.")
        bitmap.close()
        rendered.close()
    return dict(pages=1, selectable=True, rasterized=True)
