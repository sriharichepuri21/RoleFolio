import io
import re
from urllib.parse import urlsplit

import pypdfium2 as pdfium
from pypdf import PdfReader


def safe_url(value):
    return isinstance(value, str) and urlsplit(value).scheme in ('http','https') and bool(urlsplit(value).hostname) and not re.search(r'[\s<>"|]', value)


def destinations(page):
    for ref in page.get('/Annots', []):
        annotation = ref.get_object()
        action = annotation.get('/A')
        if not action:
            continue
        url = action.get_object().get('/URI')
        if safe_url(url) and annotation.get('/Rect'):
            yield tuple(map(float, annotation['/Rect'])), url


def extract_resume(data):
    reader = PdfReader(io.BytesIO(data))
    parts = []
    with pdfium.PdfDocument(data) as doc:
        for n, source in enumerate(reader.pages):
            links = list(destinations(source))
            if not links:
                parts.append(source.extract_text() or '')
                continue
            page = doc[n]
            text = page.get_textpage()
            width, top = page.get_size()
            # Place each annotation immediately after the visual line it came from.
            bands = []
            for rect, url in sorted(links, key=lambda item: (-item[0][3], item[0][0])):
                x,y,right,high = rect
                label = ' '.join(text.get_text_bounded(x,y,right,high).split()).replace('|',' ').strip() or urlsplit(url).hostname
                if not bands or abs(bands[-1][0]-y)>4:
                    bands.append([y,[]])
                bands[-1][1].append(f'{label} {url}')
            for bottom, items in bands:
                cut = max(0,min(top,bottom-1))
                lines = text.get_text_bounded(0,cut,width,top).splitlines()
                # The clickable row already carries these labels.
                labels = [item.rsplit(' ',1)[0] for item in items]
                if lines and re.sub(r'[ |·]+','',lines[-1]) == re.sub(r'[ |·]+','',''.join(labels)):
                    lines.pop()
                parts.append('\n'.join(lines))
                parts.append('@ '+' | '.join(items))
                top = cut
            parts.append(text.get_text_bounded(0,0,width,top))
            text.close()
            page.close()
    return '\n'.join(parts).strip()
