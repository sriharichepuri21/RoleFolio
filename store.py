"""Local persistence: SQLite for records, a private JSON file for settings (API key never leaves this machine)."""
import json
import os
import sqlite3
import threading
from pathlib import Path

DATA = Path(os.environ.get("ROLEFOLIO_DATA", Path(__file__).parent / "data"))
DATA.mkdir(exist_ok=True)
SETTINGS = DATA / "settings.json"
KINDS = ("resume", "application")
_lock = threading.Lock()
_db = sqlite3.connect(DATA / "rolefolio.db", check_same_thread=False)
_db.execute("PRAGMA journal_mode=WAL")
_db.execute("CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, data TEXT NOT NULL, updated TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (kind, id))")


def all_records(kind):
    with _lock:
        return [json.loads(d) for (d,) in _db.execute("SELECT data FROM records WHERE kind=? ORDER BY updated DESC", (kind,))]


def put(kind, id, data):
    with _lock, _db:
        _db.execute("INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data, updated=CURRENT_TIMESTAMP",
                    (kind, id, json.dumps(data)))


def delete(kind, id):
    with _lock, _db:
        _db.execute("DELETE FROM records WHERE kind=? AND id=?", (kind, id))


def settings():
    return json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {}


def save_settings(changes):
    current = settings()
    current.update({k: v for k, v in changes.items() if k in ("api_key", "model", "effort", "spent")})
    SETTINGS.write_text(json.dumps(current))
    SETTINGS.chmod(0o600)
    return current


def public_settings():
    s = settings()
    key = s.get("api_key") or os.environ.get("ANTHROPIC_API_KEY", "")
    model = s.get("model", "claude-opus-5-5")
    return dict(offline=model == "offline" or not key, has_key=bool(key), key_hint=key[-4:] if key else "", from_env=bool(key) and not s.get("api_key"),
                model=model, effort=s.get("effort", "medium"), spent=s.get("spent", 0))


def add_spend(cost):
    with _lock:
        save_settings({"spent": round(settings().get("spent", 0) + cost, 5)})
