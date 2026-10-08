"""The community board: reading it, and sharing a shift to it.

Reading: the hub publishes one public board.json; the service fetches it
server-side, caches it briefly, and matches the hub's recent records to this
Möbius's shifts so the app knows which shares have been recorded.

Sharing is the owner's explicit, per-shift public action. ``preview`` builds
the exact public submission (allowlisted fields, credentials and personal
details scrubbed). ``prepare`` writes exactly that text to the outbox only
when its fingerprint matches what the owner saw, and returns the message for
an owner-visible chat whose agent posts it from the owner's own GitHub
account. The app itself never touches GitHub credentials.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import json
from pathlib import Path
import re
import sqlite3
import urllib.error
import urllib.request

from engine import catalog, iso, parse_iso
from engine import settings as settings_mod
from engine import submission
from engine.store import get_meta, log_event, row_dict, set_meta, write

BOARD_TTL = timedelta(minutes=3)
BOARD_MAX_BYTES = 4 * 1024 * 1024


class ShareError(ValueError):
  """A refused share, with a message for the owner."""


def _issue_url_pattern() -> re.Pattern:
  repo = re.escape(catalog.community()["hub_repo"])
  return re.compile(rf"^https://github\.com/{repo}/issues/\d+$")


def _fetch(url: str) -> dict:
  request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "math-at-home"})
  with urllib.request.urlopen(request, timeout=6) as response:
    raw = response.read(BOARD_MAX_BYTES + 1)
  if len(raw) > BOARD_MAX_BYTES:
    raise ValueError("board too large")
  board = json.loads(raw)
  if not isinstance(board, dict) or board.get("schema") != "math-at-home/board@1":
    raise ValueError("not a Math@Home board")
  return board


def board(conn: sqlite3.Connection, now: datetime, fetch=None) -> dict:
  """The community board, at most a few minutes old; stale copy on failure."""
  fetch = fetch or _fetch
  cached = get_meta(conn, "board_cache") or {}
  fetched_at = parse_iso(cached.get("fetched_at"))
  if cached.get("board") and fetched_at and now - fetched_at < BOARD_TTL:
    return {"board": cached["board"], "stale": False, "error": None, "fetched_at": cached["fetched_at"]}
  try:
    fresh = fetch(catalog.community()["board_url"])
  except urllib.error.HTTPError as exc:
    error = "The community board isn't live yet." if exc.code == 404 else f"The board answered {exc.code}."
    return {"board": cached.get("board"), "stale": True, "error": error, "fetched_at": cached.get("fetched_at")}
  except (urllib.error.URLError, TimeoutError, ValueError, OSError):
    return {"board": cached.get("board"), "stale": True, "error": "Couldn't reach the community board.",
            "fetched_at": cached.get("fetched_at")}
  with write(conn):
    set_meta(conn, "board_cache", {"fetched_at": iso(now), "board": fresh})
    _reconcile(conn, fresh)
  return {"board": fresh, "stale": False, "error": None, "fetched_at": iso(now)}


def _reconcile(conn: sqlite3.Connection, fresh: dict) -> None:
  """Mark local shifts the hub has recorded (inside a write transaction)."""
  recent = {item.get("shift_id"): item for item in fresh.get("recent_records") or [] if isinstance(item, dict)}
  pattern = _issue_url_pattern()
  rows = conn.execute(
    "SELECT id FROM shifts WHERE share_status IN ('prepared', 'posted') "
    "OR (share_status = 'recorded' AND (hub_verdict IS NULL OR hub_lean IS NULL))"
  ).fetchall()
  for row in rows:
    item = recent.get(row["id"])
    if not item:
      continue
    url = item.get("issue_url") if isinstance(item.get("issue_url"), str) and pattern.match(item["issue_url"]) else None
    points = item.get("points") if isinstance(item.get("points"), int) else None
    conn.execute(
      "UPDATE shifts SET share_status = 'recorded', hub_verdict = ?, hub_points = ?, share_url = COALESCE(?, share_url), "
      "hub_lean = COALESCE(?, hub_lean) WHERE id = ?",
      (str(item.get("verdict") or "")[:40], points, url, _lean_field(item.get("lean")), row["id"]),
    )
    login = item.get("login")
    if isinstance(login, str) and re.match(r"^[A-Za-z0-9-]{1,39}$", login) and not get_meta(conn, "github_login"):
      set_meta(conn, "github_login", login)


def _lean_field(value) -> str | None:
  """The board's Lean result for one record, reduced to known values."""
  if not isinstance(value, dict) or value.get("status") not in ("verified", "failed"):
    return None
  method = value.get("method") if value.get("method") in ("kernel", "native") else None
  toolchain = value.get("toolchain") if isinstance(value.get("toolchain"), str) else ""
  return json.dumps({"status": value["status"], "method": method, "toolchain": toolchain[:60]})


def _load_json(path: Path):
  try:
    return json.loads(path.read_text(encoding="utf-8"))
  except (OSError, ValueError):
    return None


def preview(conn: sqlite3.Connection, shift_id: str, app_version: str) -> dict:
  """The exact public submission for one finished shift."""
  shift = row_dict(conn.execute("SELECT * FROM shifts WHERE id = ?", (shift_id or "",)).fetchone())
  if shift is None:
    raise ShareError("That shift no longer exists.")
  if shift["status"] != "done":
    raise ShareError("Only finished shifts with a report can be shared.")
  rows = [dict(r) for r in conn.execute("SELECT * FROM contributions WHERE shift_id = ? ORDER BY created_at", (shift_id,))]
  report = next((r for r in rows if r["kind"] == "report"), None)
  if report is None:
    raise ShareError("This shift has no report to share.")
  try:
    report["details"] = json.loads(report["details"]) if report["details"] else {}
  except ValueError:
    report["details"] = {}
  extras = []
  for row in rows:
    if row["kind"] == "certificate" and row["result_dir"]:
      extras.append({**row, "payload": _load_json(Path(row["result_dir"]) / "certificate.json")})
    elif row["kind"] == "claim" and row["result_dir"]:
      extras.append({**row, "payload": _load_json(Path(row["result_dir"]) / "claim.json")})
  problem = catalog.problem(shift["problem_id"])
  settings = settings_mod.load(conn)
  built = submission.build(
    shift=shift, report=report, extras=extras, problem=problem,
    credit_name=settings["credit_name"], app_version=app_version,
  )
  payload = built["payload"]
  cert = payload.get("certificate")
  return {
    "shift_id": shift_id,
    "hub_repo": catalog.community()["hub_repo"],
    "title": built["title"],
    "body": built["body"],
    "sha256": built["sha256"],
    "redactions": built["redactions"],
    "public": {
      "credit_name": payload["credit_name"],
      "problem": problem["title"],
      "report": payload["report"],
      "minutes": payload["shift"]["minutes"],
      "tokens": payload["shift"]["tokens"],
      "certificate": None if cert is None else {
        "verdict": payload.get("local_verdict"),
        "bytes": len(json.dumps(cert, separators=(",", ":"))),
        "sha256": payload.get("certificate_sha256"),
      },
      "certificate_omitted": payload.get("certificate_omitted"),
      "claim": payload.get("claim"),
    },
    "already": shift.get("share_status"),
    "share_url": shift.get("share_url"),
  }


def prepare(conn: sqlite3.Connection, storage: Path, shift_id: str, expected_sha256: str, app_version: str) -> dict:
  """Write the previewed submission to the outbox and return the posting message."""
  view = preview(conn, shift_id, app_version)
  if view["already"] in ("posted", "recorded"):
    raise ShareError("This shift is already shared.")
  if view["sha256"] != expected_sha256:
    raise ShareError("The result changed since you looked at it. Review it again before sharing.")
  folder = storage / "outbox" / shift_id
  folder.mkdir(parents=True, exist_ok=True)
  (folder / "title.txt").write_text(view["title"], encoding="utf-8")
  (folder / "body.md").write_text(view["body"], encoding="utf-8")
  with write(conn):
    conn.execute(
      "UPDATE shifts SET share_status = 'prepared', share_sha256 = ? WHERE id = ?",
      (view["sha256"], shift_id),
    )
    log_event(conn, "share_prepared", {"shift": shift_id})
  message = (
    "Share a Math@Home result on the community board. I approved posting exactly this text publicly in the app just now.\n\n"
    "Follow the \"Sharing a result\" section of the math-at-home skill (/data/shared/skills/math-at-home.md):\n"
    f"- Hub repository: {view['hub_repo']}\n"
    f"- Shift: {shift_id}\n"
    f"- Title file: {folder / 'title.txt'}\n"
    f"- Body file: {folder / 'body.md'} (sha256 {view['sha256']})\n\n"
    "Post these files unchanged as one GitHub issue from my account, then record the link with the "
    "math_at_home_shared tool. Do not add anything to the text."
  )
  return {"scope": f"share-{shift_id}", "title": f"Share Math@Home result · {view['public']['problem']}", "draft": message}


def mark_shared(conn: sqlite3.Connection, shift_id: str, issue_url: str, login: str | None, now: datetime) -> dict:
  shift = row_dict(conn.execute("SELECT * FROM shifts WHERE id = ?", (shift_id or "",)).fetchone())
  if shift is None:
    raise ShareError("Unknown shift_id.")
  if shift.get("share_status") not in ("prepared", "posted", "recorded"):
    raise ShareError("This shift was not prepared for sharing in the app; nothing to record.")
  if not isinstance(issue_url, str) or not _issue_url_pattern().match(issue_url.strip()):
    raise ShareError(f"issue_url must be an issue on {catalog.community()['hub_repo']}.")
  with write(conn):
    conn.execute(
      "UPDATE shifts SET share_status = CASE WHEN share_status = 'recorded' THEN 'recorded' ELSE 'posted' END, "
      "share_url = ?, shared_at = ? WHERE id = ?",
      (issue_url.strip(), iso(now), shift_id),
    )
    if isinstance(login, str) and re.match(r"^[A-Za-z0-9-]{1,39}$", login):
      set_meta(conn, "github_login", login)
    log_event(conn, "share_posted", {"shift": shift_id})
  return {"recorded": True, "message": "Noted. The hub checks and records it within a few minutes."}
