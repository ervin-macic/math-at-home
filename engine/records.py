"""Live records for problems whose record moves faster than app releases.

A problem opts in with a ``live_record`` block in catalog.json. The record is
read from its upstream source at most once an hour, the last good copy is
kept, and the catalog's record is used whenever the source is unreachable or
malformed. Only an exact fraction, a pull-request number, a GitHub login and a
date are taken from the source; nothing from it is rendered as markup.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from fractions import Fraction
import json
import math
import re
import sqlite3
import urllib.error
import urllib.request

from engine import iso, parse_iso
from engine.store import get_meta, set_meta, write

LIVE_TTL = timedelta(hours=1)
RETRY_AFTER = timedelta(minutes=10)
MAX_BYTES = 256 * 1024
SUPERSCRIPT = str.maketrans("-0123456789.", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹·")
LOGIN = re.compile(r"^[A-Za-z0-9-]{1,39}$")
FRACTION = re.compile(r"^\s*(\d{1,60})\s*/\s*(\d{1,60})\s*$")
FETCH_ERRORS = (urllib.error.URLError, TimeoutError, ValueError, OSError, KeyError, TypeError, IndexError)


def _fetch(url: str):
  request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "math-at-home"})
  with urllib.request.urlopen(request, timeout=6) as response:
    raw = response.read(MAX_BYTES + 1)
  if len(raw) > MAX_BYTES:
    raise ValueError("record source too large")
  return json.loads(raw)


def format_kappa(value: Fraction) -> tuple[str, str]:
  """Readable forms of a small positive fraction: ('4.609169 × 10⁻⁴', '2⁻¹¹·⁰⁸')."""
  mantissa, exponent = f"{float(value):.6e}".split("e")
  mantissa = mantissa.rstrip("0").rstrip(".")
  power = int(exponent)
  shown = mantissa if power == 0 else f"{mantissa} × 10{str(power).translate(SUPERSCRIPT)}"
  log2 = math.log2(value.numerator) - math.log2(value.denominator)
  return shown, "2" + f"{log2:.2f}".translate(SUPERSCRIPT)


def _short_date(value) -> str | None:
  moment = parse_iso(value)
  return f"{moment.day} {moment.strftime('%b %Y')}" if moment else None


def _integer_mult_bounds(config: dict, fetch, details: dict | None) -> dict:
  """The maintainer-selected κ of CrocSwap/integer-mult-bounds (selected-result.json)."""
  repo, branch, path = config["repo"], config.get("branch", "main"), config["path"]
  data = fetch(f"https://raw.githubusercontent.com/{repo}/{branch}/{path}")
  match = FRACTION.match(str(data.get("kappa", ""))) if isinstance(data, dict) else None
  if not match or int(match[2]) == 0:
    raise ValueError("kappa is not an exact fraction")
  kappa = Fraction(int(match[1]), int(match[2]))
  if not 0 < kappa < 1:
    raise ValueError("kappa out of range")
  pr = data.get("source_pr")
  pr = pr if isinstance(pr, int) and not isinstance(pr, bool) and 0 < pr < 10**7 else None
  shown, approx = format_kappa(kappa)
  return {
    "value": shown,
    "approx": approx,
    "exact": f"{kappa.numerator}/{kappa.denominator}",
    "pr": pr,
    "pr_url": f"https://github.com/{repo}/pull/{pr}" if pr else None,
    "source_url": f"https://github.com/{repo}/blob/{branch}/{path}",
    "author": (details or {}).get("author"),
    "selected": (details or {}).get("selected"),
  }


def _integer_mult_bounds_details(config: dict, pr: int, fetch) -> dict:
  """Who wrote the selected pull request and when the maintainer selected it."""
  repo, branch, path = config["repo"], config.get("branch", "main"), config["path"]
  found = {}
  try:
    login = (fetch(f"https://api.github.com/repos/{repo}/pulls/{pr}").get("user") or {}).get("login")
    if isinstance(login, str) and LOGIN.match(login):
      found["author"] = login
  except FETCH_ERRORS:
    pass
  try:
    commits = fetch(f"https://api.github.com/repos/{repo}/commits?path={path}&sha={branch}&per_page=1")
    found["selected"] = _short_date(commits[0]["commit"]["committer"]["date"])
  except FETCH_ERRORS:
    pass
  return found


PARSERS = {"integer-mult-bounds": (_integer_mult_bounds, _integer_mult_bounds_details)}


def _as_record(problem: dict, live: dict, fetched_at: str, stale: bool) -> dict:
  base = problem["record"]
  holder = ", ".join(part for part in (live.get("author"), f"PR #{live['pr']}" if live.get("pr") else None) if part)
  return {
    "label": base["label"],
    "value": live["value"],
    "direction": base.get("direction", "raise"),
    "holder": holder or "maintainer selection",
    "date": live.get("selected") or "",
    "note": (f"κ = {live['exact']} ≈ {live['approx']}, the maintainer-selected record, read live from "
             f"{problem['live_record']['repo']}. Conditional on the OpenAI framework; checked by exact "
             "finite certificates and review, not a formal proof."),
    "live": {
      "fetched_at": fetched_at,
      "stale": stale,
      "exact": live["exact"],
      "approx": live["approx"],
      "pr_url": live.get("pr_url"),
      "source_url": live.get("source_url"),
      "tracker": problem["live_record"].get("tracker"),
    },
  }


def current(conn: sqlite3.Connection, problem: dict, now: datetime, *, fetch=None, refresh: bool = True,
            details: bool = True) -> dict:
  """The problem's record: the live one when it has a live source, else the catalog's.

  ``refresh=False`` never touches the network; ``details=False`` skips the
  GitHub API look-ups (author and selection date) so a caller with a tight
  time budget makes at most one request.
  """
  config = problem.get("live_record")
  parser = PARSERS.get((config or {}).get("kind"))
  if not parser:
    return problem["record"]
  fetch = fetch or _fetch
  key = f"live_record:{problem['id']}"
  cached = get_meta(conn, key) or {}
  fetched_at = parse_iso(cached.get("fetched_at"))
  failed_at = parse_iso(cached.get("failed_at"))
  fresh_enough = cached.get("live") and fetched_at and now - fetched_at < LIVE_TTL
  backing_off = failed_at and now - failed_at < RETRY_AFTER
  if fresh_enough or not refresh or backing_off:
    if cached.get("live"):
      return _as_record(problem, cached["live"], cached["fetched_at"], stale=not fresh_enough)
    return problem["record"]
  parse, look_up = parser
  known = cached.get("details") or {}
  try:
    live = parse(config, fetch, None)
    pr = live.get("pr")
    if pr and details and not known.get(str(pr)):
      known = {str(pr): look_up(config, pr, fetch)}
    if pr and str(pr) in known:
      live.update({k: v for k, v in known[str(pr)].items() if k in ("author", "selected")})
  except FETCH_ERRORS:
    with write(conn):
      set_meta(conn, key, {**cached, "failed_at": iso(now)})
    if cached.get("live"):
      return _as_record(problem, cached["live"], cached["fetched_at"], stale=True)
    return problem["record"]
  with write(conn):
    set_meta(conn, key, {"fetched_at": iso(now), "live": live, "details": known})
  return _as_record(problem, live, iso(now), stale=False)


def all_live(conn: sqlite3.Connection, problems: list[dict], now: datetime, *, fetch=None) -> dict:
  """Live records for every problem that has a live source, keyed by problem id."""
  return {p["id"]: current(conn, p, now, fetch=fetch) for p in problems if p.get("live_record")}
