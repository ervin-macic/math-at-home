"""Math@Home engine: consent, spare-capacity gating, shifts, checks and points.

Everything here is plain standard-library Python so the service, the scheduled
job and the tests share one implementation. State lives in one SQLite file in
the app's storage directory; per-problem research folders and result files sit
beside it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
DB_NAME = "math-at-home.sqlite3"


def utcnow() -> datetime:
  return datetime.now(UTC)


def iso(dt: datetime | None) -> str | None:
  return dt.astimezone(UTC).isoformat(timespec="seconds") if dt else None


def parse_iso(value) -> datetime | None:
  if not isinstance(value, str) or not value.strip():
    return None
  text = value.strip().replace("Z", "+00:00")
  try:
    parsed = datetime.fromisoformat(text)
  except ValueError:
    return None
  if parsed.tzinfo is None:
    parsed = parsed.replace(tzinfo=UTC)
  return parsed.astimezone(UTC)
