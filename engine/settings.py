"""Donation settings and the versioned consent record.

Donating is off until the owner accepts the current consent terms; changing
the terms' version makes the old consent stale, which pauses donation.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from engine import catalog, iso, utcnow
from engine.store import get_meta, log_event, set_meta

DEFAULTS: dict = {
  "enabled": False,
  "provider": "auto",
  "window_start": "01:00",
  "window_end": "07:00",
  "timezone": "UTC",
  "share_percent": 10,
  "shifts_per_day": 2,
  "shift_minutes": 30,
  "cpu_minutes": 15,
  "five_hour_max": 50,
  "weekly_max": 70,
  "boost": True,
  "boost_weekly_max": 90,
  "boost_hours": 24,
  "problems": [],
  "credit_name": "",
}

RANGES = {
  "share_percent": (1, 100),
  "shifts_per_day": (1, 12),
  "shift_minutes": (10, 120),
  "cpu_minutes": (0, 240),
  "five_hour_max": (5, 95),
  "weekly_max": (5, 95),
  "boost_weekly_max": (5, 98),
  "boost_hours": (1, 72),
}
PROVIDERS = ("auto", "claude", "codex")
_CLOCK = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class SettingsError(ValueError):
  """A rejected settings change, with a message fit for the owner."""


def load(conn: sqlite3.Connection) -> dict:
  stored = get_meta(conn, "settings", {}) or {}
  merged = {**DEFAULTS, **{k: v for k, v in stored.items() if k in DEFAULTS}}
  if merged["enabled"] and not consent_current(conn):
    merged["enabled"] = False
  return merged


def consent(conn: sqlite3.Connection) -> dict | None:
  return get_meta(conn, "consent")


def terms_fingerprint() -> str:
  terms = catalog.consent_terms()
  payload = json.dumps(terms, ensure_ascii=False, sort_keys=True).encode("utf-8")
  return hashlib.sha256(payload).hexdigest()


def consent_current(conn: sqlite3.Connection) -> bool:
  record = consent(conn)
  return bool(
    record
    and record.get("version") == catalog.consent_terms()["version"]
    and record.get("terms_sha256") == terms_fingerprint()
  )


def _validated(current: dict, patch: dict) -> dict:
  if not isinstance(patch, dict):
    raise SettingsError("Settings must be an object.")
  unknown = sorted(set(patch) - set(DEFAULTS))
  if unknown:
    raise SettingsError(f"Unknown setting: {', '.join(unknown)}.")
  merged = {**current, **patch}
  for key in ("enabled", "boost"):
    if not isinstance(merged[key], bool):
      raise SettingsError(f"{key} must be true or false.")
  for key, (low, high) in RANGES.items():
    value = merged[key]
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
      raise SettingsError(f"{key} must be a whole number from {low} to {high}.")
  if merged["provider"] not in PROVIDERS:
    raise SettingsError("provider must be auto, claude or codex.")
  for key in ("window_start", "window_end"):
    if not isinstance(merged[key], str) or not _CLOCK.match(merged[key]):
      raise SettingsError(f"{key} must look like 01:30.")
  try:
    ZoneInfo(str(merged["timezone"]))
  except (ZoneInfoNotFoundError, ValueError):
    raise SettingsError("Unknown time zone.") from None
  known = {item["id"] for item in catalog.problems()}
  problems = merged["problems"]
  if not isinstance(problems, list) or any(p not in known for p in problems):
    raise SettingsError("Unknown problem in the selection.")
  merged["problems"] = [p for p in dict.fromkeys(problems)]
  name = merged["credit_name"]
  if not isinstance(name, str) or len(name.strip()) > 60:
    raise SettingsError("Credit name must be at most 60 characters.")
  merged["credit_name"] = " ".join(name.split())
  return merged


def update(conn: sqlite3.Connection, patch: dict) -> dict:
  current = load(conn)
  merged = _validated(current, patch)
  if merged["enabled"] and not consent_current(conn):
    raise SettingsError("Accept the consent terms before donating.")
  set_meta(conn, "settings", merged)
  changed = sorted(k for k in patch if current.get(k) != merged.get(k))
  if changed:
    log_event(conn, "settings_changed", {"keys": changed})
  return merged


def give_consent(conn: sqlite3.Connection, version: int, credit_name: str, timezone: str | None) -> dict:
  terms = catalog.consent_terms()
  if version != terms["version"]:
    raise SettingsError("The consent terms changed. Reload and review them again.")
  record = {
    "version": terms["version"],
    "terms_sha256": terms_fingerprint(),
    "at": iso(utcnow()),
  }
  set_meta(conn, "consent", record)
  patch = {"enabled": True, "credit_name": credit_name or ""}
  if timezone:
    patch["timezone"] = timezone
  merged = _validated(load(conn), patch)
  set_meta(conn, "settings", merged)
  log_event(conn, "consent_given", {"version": terms["version"]})
  return record


def withdraw_consent(conn: sqlite3.Connection) -> None:
  current = load(conn)
  set_meta(conn, "consent", None)
  set_meta(conn, "settings", {**current, "enabled": False})
  log_event(conn, "consent_withdrawn", {})
