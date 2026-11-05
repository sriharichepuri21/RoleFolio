import io
import json
import sys
from pathlib import Path
import mimetypes
import os
import hashlib
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pypdf import PdfReader
from resume_links import extract_resume, destinations
from pdfdoc import render
import engine
import layout
import store

PORT = int(os.environ.get("PORT", 8765))
DIST = (Path(__file__).parent / "web" / "dist").resolve()
HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
ORIGINS = {None, *(f"http://{h}" for h in HOSTS), "http://localhost:5173", "http://127.0.0.1:5173"}  # Vite dev server


def export_request(body):
    data = json.loads(body)
    if isinstance(data, list):
        return data, False
    return data["rows"], bool(data.get("synthetic"))


class Handler(BaseHTTPRequestHandler):
    def send(self, data, typ, status=200):
        self.send_response(status)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def json(self, value, status=200):
        self.send(json.dumps(value).encode(), "application/json", status)

    def trusted(self):
        # Blocks other websites and DNS-rebinding pages from reaching the local API.
        return self.headers.get("Host") in HOSTS and self.headers.get("Origin") in ORIGINS

    def body(self):
        n = int(self.headers.get("Content-Length", 0))
        if not 0 <= n <= 5_000_000:
            raise ValueError("Upload a file smaller than 5 MB.")
        return self.rfile.read(n)

    def record_path(self):
        parts = self.path.strip("/").split("/")  # api/<kind>/<id>
        if len(parts) != 3 or parts[1] not in store.KINDS or not parts[2]:
            raise LookupError
        return parts[1], parts[2]

    def do_GET(self):
        if self.path.startswith("/api/"):
            if not self.trusted():
                return self.send_error(403)
            if self.path == "/api/state":
                return self.json(dict(resumes=store.all_records("resume"), applications=store.all_records("application"), settings=store.public_settings()))
            if re.fullmatch(r'/api/original/[a-f0-9]{64}', self.path):
                source = store.DATA / 'originals' / (self.path.rsplit('/', 1)[1] + '.pdf')
                if source.is_file():
                    return self.send(source.read_bytes(), 'application/pdf')
            return self.send_error(404)
        target = (DIST / self.path.split("?")[0].lstrip("/")).resolve()
        if not target.is_file() or DIST not in target.parents:
            target = DIST / "index.html"
        if not target.is_file():
            return self.send(b"Frontend not built. Run: cd web && npm install && npm run build", "text/plain", 503)
        self.send(target.read_bytes(), (mimetypes.guess_type(target.name)[0] or "application/octet-stream") + ("; charset=utf-8" if target.suffix in (".html", ".js", ".css") else ""))

    def do_PUT(self):
        if not self.trusted():
            return self.send_error(403)
        try:
            kind, id = self.record_path()
            data = json.loads(self.body())
            if not isinstance(data, dict) or data.get("id") != id:
                raise ValueError("Record id mismatch.")
            store.put(kind, id, data)
            self.json({"ok": True})
        except LookupError:
            self.send_error(404)
        except ValueError as e:
            self.send(str(e).encode(), "text/plain; charset=utf-8", 400)

    def do_DELETE(self):
        if not self.trusted():
            return self.send_error(403)
        try:
            store.delete(*self.record_path())
            self.json({"ok": True})
        except LookupError:
            self.send_error(404)

    def do_POST(self):
        if not self.trusted():
            return self.send_error(403)
        try:
            body = self.body()
            path = self.path
            if path == "/api/settings":
                changes = json.loads(body)
                if changes.get("model") and changes["model"] not in engine.PRICES:
                    raise ValueError("Unknown model.")
                if changes.get("effort") and changes["effort"] not in ("low", "medium", "high"):
                    raise ValueError("Unknown effort level.")
                store.save_settings(changes)
                return self.json(store.public_settings())
            if path == "/api/parse-resume":
                original = None
                name = (self.headers.get("X-File-Name") or "").lower()
                if name.endswith(".pdf"):
                    text = extract_resume(body)
                    digest = hashlib.sha256(body).hexdigest()
                    folder = store.DATA / 'originals'
                    folder.mkdir(exist_ok=True)
                    (folder / (digest + '.pdf')).write_bytes(body)
                    original = '/api/original/' + digest
                elif name.endswith(".docx"):
                    from formats import word_text
                    text = word_text(body)
                else:
                    text = body.decode("utf-8", "replace")
                if not text.strip():
                    raise ValueError("No selectable text found. Upload a text-based PDF or Word file, or paste the resume text.")
                return self.json(dict(text=text, rows=engine.structure(text), originalPdf=original))
            if path == "/api/posting":
                from formats import posting
                return self.json(posting(body.decode()))
            if path in ("/api/analyze", "/api/tailor"):
                req = json.loads(body)
                settings = store.settings()
                if path == "/api/analyze":
                    result = engine.analyze(settings, req["rows"], req["jd"], req.get("company", ""), req.get("title", ""))
                else:
                    if req["level"] not in engine.LEVELS:
                        raise ValueError("Unknown tailoring level.")
                    result = engine.tailor(settings, req["rows"], req["jd"], req["analysis"], req["level"], req["title"], req.get("lock"))
                store.add_spend(result["usage"]["cost"])
                return self.json(result)
            if path == "/api/fit":
                req = json.loads(body)
                rows, fit = __import__("fitpage").fit(req["rows"], req["requirements"], generative=req.get("generative", False))
                return self.json(dict(rows=rows, fit=fit))
            if path == "/api/compare":
                req = json.loads(body)
                return self.json(engine.compare(req["prior"], req["current"]))
            if path == "/api/word":
                from formats import word_file
                rows, synthetic = export_request(body)
                __import__('tailoring_quality').validate_export_accomplishments(rows)
                if synthetic:
                    __import__('export_quality').validate(rows, json.loads(body).get('exportApproval'))
                return self.send(word_file(rows, synthetic=synthetic), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            if path == "/api/page-preview":
                import base64
                import pypdfium2 as pdfium
                rows, synthetic = export_request(body)
                pdf, boxes, size = render(rows, preview=True, synthetic=synthetic)
                pages = []
                with pdfium.PdfDocument(pdf) as doc:
                    for page in doc:
                        bitmap = page.render(scale=1.7)
                        image = io.BytesIO()
                        bitmap.to_pil().save(image, format="PNG")
                        pages.append(base64.b64encode(image.getvalue()).decode())
                        bitmap.close()
                        page.close()
                return self.json(dict(pages=pages, boxes=boxes, size=size))
            if path == "/api/pdf":
                rows, synthetic = export_request(body)
                __import__('tailoring_quality').validate_export_accomplishments(rows)
                if synthetic:
                    __import__('export_quality').validate(rows, json.loads(body).get('exportApproval'))
                pdf = render(rows, synthetic=synthetic)
                __import__("pdfdoc").validate_pdf(pdf, rows, synthetic=synthetic)
                expected = [url for url in layout.link_map(rows).values()]
                reader = PdfReader(io.BytesIO(pdf))
                actual = [url for page in reader.pages for _, url in destinations(page)]
                if set(expected) - set(actual):
                    raise ValueError("A link is missing or invalid. Review the Links entry before exporting.")
                return self.send(pdf, "application/pdf")
            self.send_error(404)
        except (KeyError, TypeError, json.JSONDecodeError):
            self.send(b"Malformed request.", "text/plain; charset=utf-8", 400)
        except Exception as e:
            self.send(str(e).encode(), "text/plain; charset=utf-8", 400)


if __name__ == "__main__":
    print(f"RoleFolio is ready at http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
