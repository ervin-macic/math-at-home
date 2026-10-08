"""SQLite state shared by the service, its agent tools and the scheduled job.

The tool lane is not serialized by the platform, so every write runs inside a
``BEGIN IMMEDIATE`` transaction; WAL keeps readers unblocked meanwhile.
"""

from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
import sqlite3

from engine import DB_NAME, iso, utcnow

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL,
  lane_id TEXT,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  begun_at TEXT,
  deadline_at TEXT,
  ended_at TEXT,
  chat_id TEXT,
  provider TEXT,
  capacity_json TEXT,
  reason TEXT,
  tokens_json TEXT,
  minutes REAL,
  cycle TEXT,
  weekly_before REAL,
  weekly_after REAL,
  charged REAL,
  share_status TEXT,
  share_sha256 TEXT,
  share_url TEXT,
  shared_at TEXT,
  hub_verdict TEXT,
  hub_points INTEGER,
  hub_lean TEXT
);
CREATE INDEX IF NOT EXISTS shifts_created ON shifts(created_at);
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  shift_id TEXT,
  problem_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  result_dir TEXT,
  fingerprint TEXT,
  claimed_value TEXT,
  value TEXT,
  verdict TEXT NOT NULL,
  verdict_detail TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  credit_name TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  external_link TEXT
);
CREATE INDEX IF NOT EXISTS contributions_created ON contributions(created_at);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT
);
"""


def storage_dir() -> Path:
  """The app's storage directory for the service (set by the platform)."""
  value = os.environ.get("APP_STORAGE_DIR")
  if not value:
    raise RuntimeError("APP_STORAGE_DIR is not set")
  return Path(value)


def job_storage_dir(app_id: str) -> Path:
  """Scheduled jobs get DATA_DIR and the app id, not APP_STORAGE_DIR."""
  return Path(os.environ.get("DATA_DIR", "/data")) / "apps" / str(app_id)


# Columns added after the first release. Fresh databases get them from SCHEMA;
# existing ones are upgraded in place on the next connect.
ADDED_COLUMNS = {
  "shifts": {
    "cycle": "TEXT", "weekly_before": "REAL", "weekly_after": "REAL", "charged": "REAL",
    "share_status": "TEXT", "share_sha256": "TEXT", "share_url": "TEXT", "shared_at": "TEXT",
    "hub_verdict": "TEXT", "hub_points": "INTEGER", "hub_lean": "TEXT",
  },
}


def _upgrade(conn: sqlite3.Connection) -> None:
  for table, columns in ADDED_COLUMNS.items():
    present = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, kind in columns.items():
      if name in present:
        continue
      try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")
      except sqlite3.OperationalError as exc:
        if "duplicate column" not in str(exc).lower():  # another process won the race
          raise


def connect(storage: Path) -> sqlite3.Connection:
  storage.mkdir(parents=True, exist_ok=True)
  conn = sqlite3.connect(storage / DB_NAME, timeout=15, isolation_level=None)
  conn.row_factory = sqlite3.Row
  conn.execute("PRAGMA journal_mode=WAL")
  conn.execute("PRAGMA busy_timeout=15000")
  conn.executescript(SCHEMA)
  _upgrade(conn)
  return conn


@contextmanager
def write(conn: sqlite3.Connection):
  conn.execute("BEGIN IMMEDIATE")
  try:
    yield conn
  except BaseException:
    conn.execute("ROLLBACK")
    raise
  else:
    conn.execute("COMMIT")


def get_meta(conn: sqlite3.Connection, key: str, default=None):
  row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
  if row is None:
    return default
  try:
    return json.loads(row["value"])
  except ValueError:
    return default


def set_meta(conn: sqlite3.Connection, key: str, value) -> None:
  conn.execute(
    "INSERT INTO meta(key, value) VALUES(?, ?) "
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    (key, json.dumps(value, ensure_ascii=False)),
  )


def log_event(conn: sqlite3.Connection, kind: str, data: dict | None = None) -> None:
  conn.execute(
    "INSERT INTO events(at, kind, data) VALUES(?, ?, ?)",
    (iso(utcnow()), kind, json.dumps(data or {}, ensure_ascii=False)),
  )


def row_dict(row: sqlite3.Row | None) -> dict | None:
  if row is None:
    return None
  item = dict(row)
  if isinstance(item.get("hub_lean"), str):
    try:
      item["hub_lean"] = json.loads(item["hub_lean"])
    except ValueError:
      item["hub_lean"] = None
  for key in ("capacity_json", "tokens_json"):
    if key in item:
      raw = item.pop(key)
      try:
        item[key.removesuffix("_json")] = json.loads(raw) if raw else None
      except ValueError:
        item[key.removesuffix("_json")] = None
  return item
