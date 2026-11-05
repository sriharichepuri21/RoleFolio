"""Bind a successful synthetic review to the exact exported content."""
import hashlib
import hmac
import json
import secrets
import os
from pathlib import Path

_path = Path(os.environ.get('ROLEFOLIO_DATA', Path(__file__).parent / 'data')) / '.review-key'
_path.parent.mkdir(parents=True, exist_ok=True)
try:
    fd = os.open(_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    pass
else:
    with os.fdopen(fd, 'wb') as stream:
        stream.write(secrets.token_bytes(32))
_KEY = _path.read_bytes()
if len(_KEY) != 32:
    raise ValueError('The local review key is invalid; restore it from your workspace backup.')


def approval(lines):
    content = b'v3-letter-10pt:' + json.dumps(lines, ensure_ascii=False, separators=(',', ':')).encode()
    return hmac.new(_KEY, content, hashlib.sha256).hexdigest()


def validate(lines, token):
    if not isinstance(token, str) or not hmac.compare_digest(approval(lines), token):
        raise ValueError('This synthetic draft has not passed review for its current content. Regenerate and resolve the audit findings before exporting.')
