"""When may a shift start, and is there spare capacity right now?

Two separate questions. The scheduled job answers the first from settings and
history alone. The second needs the owner's provider usage reading, which only
the owner-scoped shift agent can fetch; it passes that reading to the begin
tool, which applies the owner's limits here.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from engine import iso, parse_iso

NO_READING_RETRY = timedelta(minutes=60)
DISCONNECTED_RETRY = timedelta(hours=6)


def _minutes(clock: str) -> int:
  hours, minutes = clock.split(":")
  return int(hours) * 60 + int(minutes)


def local(now_utc: datetime, timezone: str) -> datetime:
  return now_utc.astimezone(ZoneInfo(timezone))


def in_window(now_utc: datetime, settings: dict) -> bool:
  start, end = _minutes(settings["window_start"]), _minutes(settings["window_end"])
  if start == end:
    return True
  here = local(now_utc, settings["timezone"])
  minute = here.hour * 60 + here.minute
  if start < end:
    return start <= minute < end
  return minute >= start or minute < end


def next_window_start(now_utc: datetime, settings: dict) -> datetime:
  """The next moment the quiet-hours window opens (now if it is open)."""
  if in_window(now_utc, settings):
    return now_utc
  here = local(now_utc, settings["timezone"])
  start = _minutes(settings["window_start"])
  candidate = here.replace(hour=start // 60, minute=start % 60, second=0, microsecond=0)
  if candidate <= here:
    candidate += timedelta(days=1)
  return candidate.astimezone(now_utc.tzinfo)


def local_day_bounds(now_utc: datetime, timezone: str) -> tuple[datetime, datetime]:
  here = local(now_utc, timezone)
  start = here.replace(hour=0, minute=0, second=0, microsecond=0)
  return start.astimezone(now_utc.tzinfo), (start + timedelta(days=1)).astimezone(now_utc.tzinfo)


def schedule_decision(
  *,
  settings: dict,
  consent_ok: bool,
  now_utc: datetime,
  shifts_today: int,
  active_shift: dict | None,
  backoff_until: datetime | None,
  manual: bool = False,
) -> tuple[bool, str]:
  """Whether the job (or the owner's Run-now tap) may start a shift."""
  if not consent_ok:
    return False, "Consent has not been given."
  if not manual and not settings["enabled"]:
    return False, "Donating is paused."
  if active_shift:
    return False, "A shift is already running."
  if not manual:
    if not in_window(now_utc, settings):
      return False, "Outside your quiet hours."
    if shifts_today >= settings["shifts_per_day"]:
      return False, "Today's shift allowance is used up."
    if backoff_until and backoff_until > now_utc:
      return False, f"Waiting for spare capacity until {iso(backoff_until)}."
  return True, "Ready."


def _is_weekly(window: dict) -> bool:
  """Weekly-type windows: the plan's weekly window and Claude's per-model ones."""
  return window.get("kind") == "weekly" or str(window.get("id") or "").startswith("seven_day")


def cycle_key(resets_at: datetime | None) -> str | None:
  """A weekly cycle's identity: its reset time to the nearest hour.

  Successive readings report the same reset with sub-second jitter, so the raw
  timestamp cannot be compared exactly.
  """
  if resets_at is None:
    return None
  rounded = resets_at.replace(minute=0, second=0, microsecond=0)
  if resets_at.minute >= 30:
    rounded += timedelta(hours=1)
  return iso(rounded)


def weekly_reading(usage) -> dict | None:
  """The plan's main weekly window from a usage reading: used percent and cycle."""
  if not isinstance(usage, dict) or usage.get("state") != "ready":
    return None
  windows = [w for w in (usage.get("windows") or []) if isinstance(w, dict)]
  main = next((w for w in windows if w.get("kind") == "weekly"), None)
  main = main or next((w for w in windows if w.get("id") == "seven_day"), None)
  if main is None:
    return None
  used = main.get("used_percent")
  if isinstance(used, bool) or not isinstance(used, (int, float)):
    return None
  resets_at = parse_iso(main.get("resets_at"))
  return {"used_percent": float(used), "resets_at": iso(resets_at), "cycle": cycle_key(resets_at)}


def share_decision(
  *,
  settings: dict,
  weekly: dict | None,
  donated: float,
  estimate: float,
  now_utc: datetime,
) -> dict:
  """Apply the owner's weekly donation share to one shift.

  ``donated`` is what earlier shifts in this weekly cycle already used, in
  percentage points of the weekly allowance; ``estimate`` is what a full shift
  typically uses. A shift starts only if a meaningful part of the share is
  left. It is shortened when less than a full shift remains, and gets a stop
  line on the weekly gauge so it can finish on its share.
  """
  limit = settings["share_percent"]
  minutes = settings["shift_minutes"]
  if limit >= 100:
    return {"ok": True, "limit": limit, "donated": donated, "remaining": None, "stop_at": None, "minutes": minutes}
  if weekly is None:
    return {
      "ok": False,
      "reason": "The usage reading has no weekly window to measure your donation share against.",
      "retry_at": iso(now_utc + DISCONNECTED_RETRY),
    }
  remaining = round(limit - donated, 2)
  needed = max(0.5, 0.5 * estimate)
  if remaining < needed:
    resets_at = parse_iso(weekly.get("resets_at"))
    return {
      "ok": False,
      "reason": f"This week's donation share is used up: {donated:.1f}% of your {limit}% donated.",
      "retry_at": iso(resets_at if resets_at and resets_at > now_utc else now_utc + DISCONNECTED_RETRY),
    }
  if remaining < estimate:
    minutes = max(10, int(round(minutes * remaining / estimate)))
  return {
    "ok": True,
    "limit": limit,
    "donated": donated,
    "remaining": remaining,
    "stop_at": round(min(weekly["used_percent"] + remaining, 100.0), 1),
    "minutes": minutes,
  }


def capacity_decision(usage, settings: dict, now_utc: datetime) -> dict:
  """Apply the owner's spare-capacity limits to one provider usage reading.

  Returns ``{"ok", "reason", "retry_at", "windows"}``. Unknown or missing
  readings are refused: spending someone's subscription is opt-in, so doubt
  resolves to waiting.
  """
  if not isinstance(usage, dict):
    return {
      "ok": False,
      "reason": "No usage reading was supplied.",
      "retry_at": iso(now_utc + NO_READING_RETRY),
      "windows": [],
    }
  state = usage.get("state")
  if state != "ready":
    retry = DISCONNECTED_RETRY if state == "disconnected" else NO_READING_RETRY
    return {
      "ok": False,
      "reason": (
        "This provider is not connected." if state == "disconnected"
        else "The usage reading is not available right now."
      ),
      "retry_at": iso(now_utc + retry),
      "windows": [],
    }
  windows = usage.get("windows") if isinstance(usage.get("windows"), list) else []
  checked, blocked = [], []
  for window in windows:
    if not isinstance(window, dict):
      continue
    used = window.get("used_percent")
    if isinstance(used, bool) or not isinstance(used, (int, float)):
      continue
    resets_at = parse_iso(window.get("resets_at"))
    weekly = _is_weekly(window)
    limit = settings["weekly_max"] if weekly else settings["five_hour_max"]
    boosted = False
    if (
      weekly and settings["boost"] and resets_at
      and resets_at - now_utc <= timedelta(hours=settings["boost_hours"])
      and settings["boost_weekly_max"] > limit
    ):
      limit, boosted = settings["boost_weekly_max"], True
    item = {
      "id": window.get("id"),
      "label": window.get("label") or window.get("id") or "window",
      "used_percent": used,
      "limit": limit,
      "boosted": boosted,
      "resets_at": iso(resets_at),
    }
    checked.append(item)
    if used > limit:
      blocked.append((item, resets_at))
  if not checked:
    return {
      "ok": False,
      "reason": "The usage reading had no windows to check.",
      "retry_at": iso(now_utc + NO_READING_RETRY),
      "windows": [],
    }
  if blocked:
    item, resets_at = max(blocked, key=lambda pair: pair[1] or now_utc)
    retry = resets_at if resets_at and resets_at > now_utc else now_utc + NO_READING_RETRY
    return {
      "ok": False,
      "reason": f"Your {item['label']} window is {item['used_percent']:g}% used (limit {item['limit']}%).",
      "retry_at": iso(retry),
      "windows": checked,
    }
  return {"ok": True, "reason": "Spare capacity available.", "retry_at": None, "windows": checked}
