"""The shift lifecycle.

plan → (platform starts a background agent chat) → begin → submit, with
reconcile cleaning up shifts whose agent never checked in or never reported.

``begin`` is the consent boundary at run time: it applies the owner's
spare-capacity limits to the usage reading the agent just fetched and returns
either a refusal or the research brief. ``submit`` records the report, runs
the built-in checker on any certificate and stores claims for review.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import secrets
import shutil
import sqlite3

from engine import catalog, gate, iso, parse_iso, points
from engine import settings as settings_mod
from engine import verify
from engine.store import get_meta, log_event, row_dict, set_meta, write

ACTIVE = ("starting", "running")
COUNTED_TODAY = ("starting", "running", "done", "abandoned")
ESTIMATE_DEFAULT = 2.0  # weekly-gauge points a full shift is assumed to use before any is measured
ESTIMATE_FLOOR = 0.5
START_GRACE = timedelta(minutes=25)
ENDED_GRACE = timedelta(minutes=3)
LATE_GRACE = timedelta(minutes=30)
MINUTES_SLACK = 10
MAX_CERT_BYTES = 8 * 1024 * 1024
MAX_CLAIM_BYTES = 25 * 1024 * 1024
MAX_CLAIM_FILES = 40
TEXT_LIMITS = {"title": 120, "summary": 1500, "tried": 6000, "learned": 6000, "next": 3000}


class ShiftError(ValueError):
  """A refused tool call, with a message the agent can act on."""


def new_id(prefix: str, now: datetime) -> str:
  return f"{prefix}_{now:%Y%m%d%H%M%S}_{secrets.token_hex(3)}"


def get(conn: sqlite3.Connection, shift_id: str) -> dict | None:
  return row_dict(conn.execute("SELECT * FROM shifts WHERE id = ?", (shift_id,)).fetchone())


def active_shift(conn: sqlite3.Connection, now: datetime) -> dict | None:
  for row in conn.execute(
    "SELECT * FROM shifts WHERE status IN ('starting', 'running') ORDER BY created_at DESC"
  ):
    shift = row_dict(row)
    if shift["status"] == "starting":
      created = parse_iso(shift["created_at"])
      if created and now - created < START_GRACE:
        return shift
    else:
      deadline = parse_iso(shift["deadline_at"])
      if deadline and now < deadline + LATE_GRACE:
        return shift
  return None


def shifts_today(conn: sqlite3.Connection, settings: dict, now: datetime) -> int:
  start, end = gate.local_day_bounds(now, settings["timezone"])
  row = conn.execute(
    "SELECT COUNT(*) AS n FROM shifts WHERE trigger = 'schedule' AND status IN (%s) "
    "AND created_at >= ? AND created_at < ?" % ",".join("?" * len(COUNTED_TODAY)),
    (*COUNTED_TODAY, iso(start), iso(end)),
  ).fetchone()
  return int(row["n"])


def pick_problem(conn: sqlite3.Connection, settings: dict) -> dict:
  chosen = settings["problems"] or [item["id"] for item in catalog.problems()]
  last = {
    row["problem_id"]: row["at"]
    for row in conn.execute(
      "SELECT problem_id, MAX(created_at) AS at FROM shifts "
      "WHERE status NOT IN ('declined', 'failed') GROUP BY problem_id"
    )
  }
  ordered = sorted(
    (catalog.problem(pid) for pid in chosen if catalog.problem(pid)),
    key=lambda item: (last.get(item["id"]) or "", item["rank"]),
  )
  return ordered[0]


def pick_lane(conn: sqlite3.Connection, problem: dict) -> dict:
  lanes = problem["lanes"]
  done = conn.execute(
    "SELECT COUNT(*) AS n FROM shifts WHERE problem_id = ? AND status NOT IN ('declined', 'failed')",
    (problem["id"],),
  ).fetchone()["n"]
  return lanes[int(done) % len(lanes)]


def plan(conn: sqlite3.Connection, *, now: datetime, trigger: str, problem_id: str | None = None) -> dict:
  """Decide whether a shift may start and, if so, record it as starting."""
  settings = settings_mod.load(conn)
  with write(conn):
    ok, reason = gate.schedule_decision(
      settings=settings,
      consent_ok=settings_mod.consent_current(conn),
      now_utc=now,
      shifts_today=shifts_today(conn, settings, now),
      active_shift=active_shift(conn, now),
      backoff_until=parse_iso(get_meta(conn, "backoff_until")),
      manual=trigger == "manual",
    )
    if not ok:
      return {"started": False, "reason": reason}
    problem = catalog.problem(problem_id) if problem_id else pick_problem(conn, settings)
    if problem is None:
      return {"started": False, "reason": "Unknown problem."}
    lane = pick_lane(conn, problem)
    shift_id = new_id("s", now)
    conn.execute(
      "INSERT INTO shifts(id, problem_id, lane_id, trigger, status, created_at) "
      "VALUES(?, ?, ?, ?, 'starting', ?)",
      (shift_id, problem["id"], lane["id"], trigger, iso(now)),
    )
    log_event(conn, "shift_planned", {"shift": shift_id, "problem": problem["id"], "trigger": trigger})
  return {"started": True, "shift": get(conn, shift_id), "problem": problem, "lane": lane, "settings": settings}


def start_message(shift: dict, problem: dict, lane: dict) -> str:
  return (
    f"Math@Home shift {shift['id']}: {problem['title']}, lane \"{lane['title']}\".\n\n"
    "You are running a donated research shift on the owner's spare AI capacity. "
    "Read the `math-at-home` skill (/data/shared/skills/math-at-home.md) and follow it. In short:\n"
    "1. Check spare capacity first: run `mapi /api/settings/provider-usage/claude` if you are Claude, "
    "or `mapi /api/settings/provider-usage/codex` if you are Codex. Then call the `math_at_home_begin` "
    f"tool with shift_id \"{shift['id']}\" and that JSON as `usage`. If it answers go=false, reply with "
    "one line and stop. (If your tool list defers Möbius tools, load math_at_home_begin and "
    "math_at_home_submit with your tool search first; as a last resort run "
    "`python3 /data/platform/backend/scripts/mobius_control_mcp.py call math_at_home_begin --args-json -` "
    "with the arguments as JSON on stdin.)\n"
    "2. Work only on the brief it returns, inside its workspace folder, within its deadline and CPU budget.\n"
    f"3. Before the deadline, update NOTES.md there and call `math_at_home_submit` with shift_id \"{shift['id']}\", "
    "an honest report, and any certificate or claim.\n"
    "Never post, publish, contact anyone, create accounts or spend money during a shift."
  )


def chat_payload(shift: dict, problem: dict, lane: dict, settings: dict, now: datetime) -> dict:
  local_day = gate.local(now, settings["timezone"]).strftime("%d %b")
  payload = {
    "title": f"Math@Home · {problem['short']} · {local_day}",
    "scope": f"shift-{shift['id']}",
    "scope_label": f"{problem['short']} — {lane['title']}",
    "content": start_message(shift, problem, lane),
    "timezone": settings["timezone"],
  }
  if settings["provider"] in ("claude", "codex"):
    payload["provider"] = settings["provider"]
  return payload


def attach_chat(conn: sqlite3.Connection, shift_id: str, chat_id: str) -> None:
  with write(conn):
    conn.execute(
      "UPDATE shifts SET chat_id = COALESCE(chat_id, ?) WHERE id = ?",
      (chat_id, shift_id),
    )


def mark_failed(conn: sqlite3.Connection, shift_id: str, reason: str, now: datetime) -> None:
  with write(conn):
    conn.execute(
      "UPDATE shifts SET status = 'failed', reason = ?, ended_at = ? WHERE id = ? AND status IN ('starting', 'running')",
      (reason[:500], iso(now), shift_id),
    )
    log_event(conn, "shift_failed", {"shift": shift_id, "reason": reason[:500]})


def _workspace(storage: Path, problem: dict) -> Path:
  folder = storage / "workspace" / problem["id"]
  folder.mkdir(parents=True, exist_ok=True)
  notes = folder / "NOTES.md"
  if not notes.exists():
    record = problem["record"]
    notes.write_text(
      f"# {problem['title']}: shared research notes\n\n"
      "Every Math@Home shift on this problem reads and updates this file. Keep it short and current: "
      "what was tried, what failed and why, promising leads, and where code and data live in this folder.\n\n"
      f"## Status\n\n- {problem['known']} ({record['holder']}, {record['date']})\n"
      f"- Target: {problem['target']}\n\n## Log\n",
      encoding="utf-8",
    )
  return folder


def _history(conn: sqlite3.Connection, problem_id: str, limit: int = 8) -> list[dict]:
  rows = conn.execute(
    "SELECT created_at, kind, title, summary, verdict, value FROM contributions "
    "WHERE problem_id = ? ORDER BY created_at DESC LIMIT ?",
    (problem_id, limit),
  )
  return [dict(row) for row in rows]


def begin(
  conn: sqlite3.Connection,
  storage: Path,
  *,
  shift_id: str,
  usage,
  call: dict,
  now: datetime,
) -> dict:
  shift = get(conn, shift_id)
  if shift is None:
    raise ShiftError("Unknown shift_id. Copy it exactly from the first message of this chat.")
  chat_id = call.get("chat_id")
  if shift["chat_id"] and chat_id and shift["chat_id"] != chat_id:
    raise ShiftError("This shift belongs to a different chat.")
  problem = catalog.problem(shift["problem_id"])
  lane = catalog.lane(problem, shift["lane_id"]) or problem["lanes"][0]
  settings = settings_mod.load(conn)
  if shift["status"] == "running":
    return _brief(conn, storage, shift, problem, lane, settings)
  if shift["status"] != "starting":
    raise ShiftError(f"This shift is already {shift['status']}. End the turn.")
  if not settings_mod.consent_current(conn):
    with write(conn):
      conn.execute(
        "UPDATE shifts SET status = 'declined', reason = ?, ended_at = ? WHERE id = ?",
        ("Consent was withdrawn.", iso(now), shift_id),
      )
    return {"go": False, "reason": "The owner withdrew consent. Reply with one line and stop."}
  provider = _provider(call, settings)
  decision = gate.capacity_decision(usage, settings, now)
  weekly = gate.weekly_reading(usage)
  with write(conn):
    if decision["ok"]:
      used = share_usage(conn, provider, weekly["cycle"] if weekly else None, settings)
      share = gate.share_decision(
        settings=settings, weekly=weekly, donated=used["donated"], estimate=used["estimate"], now_utc=now,
      )
      decision = {**decision, "share": share}
      if not share["ok"]:
        decision.update(ok=False, reason=share["reason"], retry_at=share["retry_at"])
    if not decision["ok"]:
      conn.execute(
        "UPDATE shifts SET status = 'declined', reason = ?, capacity_json = ?, ended_at = ?, "
        "chat_id = COALESCE(chat_id, ?), provider = ? WHERE id = ?",
        (decision["reason"], json.dumps(decision), iso(now), chat_id, provider, shift_id),
      )
      set_meta(conn, "backoff_until", decision["retry_at"])
      set_meta(conn, "capacity", {**decision, "at": iso(now)})
      log_event(conn, "shift_declined", {"shift": shift_id, "reason": decision["reason"]})
      return {
        "go": False,
        "reason": decision["reason"],
        "retry_at": decision["retry_at"],
        "instruction": "Not within the owner's limits. Reply with one short line and end the turn. Do no other work.",
      }
    deadline = now + timedelta(minutes=decision["share"]["minutes"])
    conn.execute(
      "UPDATE shifts SET status = 'running', begun_at = ?, deadline_at = ?, capacity_json = ?, "
      "chat_id = COALESCE(chat_id, ?), provider = ?, cycle = ?, weekly_before = ? WHERE id = ?",
      (
        iso(now), iso(deadline), json.dumps(decision), chat_id, provider,
        weekly["cycle"] if weekly else None, weekly["used_percent"] if weekly else None, shift_id,
      ),
    )
    set_meta(conn, "backoff_until", None)
    set_meta(conn, "capacity", {**decision, "at": iso(now)})
    log_event(conn, "shift_begun", {"shift": shift_id})
  return _brief(conn, storage, get(conn, shift_id), problem, lane, settings)


def _provider(call: dict, settings: dict) -> str:
  provider = call.get("provider")
  if isinstance(provider, str) and provider:
    return provider
  return settings["provider"] if settings["provider"] in ("claude", "codex") else "claude"


def _rate(conn: sqlite3.Connection, provider: str) -> float:
  """Weekly-gauge points a shift uses per minute, from the last measured shifts."""
  rows = conn.execute(
    "SELECT charged, minutes FROM shifts WHERE provider = ? AND weekly_after IS NOT NULL "
    "AND charged IS NOT NULL AND minutes > 0 ORDER BY ended_at DESC LIMIT 5",
    (provider,),
  ).fetchall()
  if not rows:
    return ESTIMATE_DEFAULT / 30.0
  return sum(float(r["charged"]) for r in rows) / sum(float(r["minutes"]) for r in rows)


def share_usage(conn: sqlite3.Connection, provider: str, cycle: str | None, settings: dict) -> dict:
  """How much of this weekly cycle's donation share is used, and what a shift costs."""
  donated = 0.0
  if cycle:
    row = conn.execute(
      "SELECT COALESCE(SUM(charged), 0) AS donated FROM shifts WHERE provider = ? AND cycle = ?",
      (provider, cycle),
    ).fetchone()
    donated = float(row["donated"] or 0.0)
  measured = conn.execute(
    "SELECT COUNT(*) AS n FROM shifts WHERE provider = ? AND weekly_after IS NOT NULL",
    (provider,),
  ).fetchone()["n"]
  estimate = max(ESTIMATE_FLOOR, _rate(conn, provider) * settings["shift_minutes"])
  return {"donated": round(donated, 2), "estimate": round(estimate, 2), "measured": int(measured)}


def _brief(conn, storage, shift, problem, lane, settings) -> dict:
  folder = _workspace(storage, problem)
  begun = parse_iso(shift["begun_at"])
  deadline = parse_iso(shift["deadline_at"])
  minutes = int(round((deadline - begun).total_seconds() / 60)) if begun and deadline else settings["shift_minutes"]
  share = ((shift.get("capacity") or {}).get("share")) or {}
  stop_at = share.get("stop_at")
  share_rules = [
    f"Your donation share for this shift ends when the weekly usage gauge reaches {stop_at}%. "
    "Re-run the usage check about every 10 minutes; once it is at or above that, stop and submit.",
  ] if stop_at is not None else []
  return {
    "go": True,
    "shift_id": shift["id"],
    "deadline": shift["deadline_at"],
    "minutes": minutes,
    "share": {
      "limit_percent": share.get("limit"),
      "donated_before_percent": share.get("donated"),
      "remaining_percent": share.get("remaining"),
      "stop_at_weekly_percent": stop_at,
    } if stop_at is not None else None,
    "cpu_minutes": settings["cpu_minutes"],
    "workspace": str(folder),
    "notes_file": str(folder / "NOTES.md"),
    "problem": {
      key: problem[key]
      for key in (
        "id", "title", "area", "statement", "known", "record", "target", "discovery",
        "side_quest", "certificate_help", "credit", "recent", "sources",
      )
    },
    "automatic_checker": verify.supports(problem),
    "lane": lane,
    "previous_results": _history(conn, problem["id"]),
    "rules": [
      "Stay inside the workspace folder; keep code, data and notes there.",
      f"Finish and submit before the deadline ({shift['deadline_at']}); check `date -u` as you go.",
      f"Keep heavy computation under {settings['cpu_minutes']} CPU-minutes in total: run it with `timeout` and `nice -n 15`.",
      "Never claim a record you have not checked. Certificates go through the built-in checker; anything else is a claim for review.",
      "Do not post, publish, email, open issues or pull requests, create accounts or spend money.",
      "Install Python packages only into a virtual environment inside the workspace.",
      *share_rules,
    ],
    "finish": (
      "Update NOTES.md, run the usage check once more, then call math_at_home_submit with shift_id, "
      "usage (that fresh reading), report (title, summary, tried, learned, next) and an optional "
      "certificate, certificate_file or claim."
    ),
  }


def _measure(conn: sqlite3.Connection, shift: dict, usage, minutes: float) -> tuple[float | None, float]:
  """What a finished shift used of the weekly allowance, in gauge points.

  Measured as the weekly gauge's rise between the begin reading and a fresh
  reading at submit, when both fall in the same weekly cycle. Anything else
  the owner used meanwhile is included, so the share errs toward donating
  less. Without an end reading the shift is charged the usual rate per minute.
  """
  after = gate.weekly_reading(usage)
  if after and shift.get("cycle") and after["cycle"] == shift["cycle"] and shift.get("weekly_before") is not None:
    return after["used_percent"], round(max(0.0, after["used_percent"] - float(shift["weekly_before"])), 2)
  return None, round(_rate(conn, shift.get("provider") or "claude") * minutes, 2)


def _clean_text(report: dict, key: str, required: bool) -> str:
  value = report.get(key)
  if value is None and not required:
    return ""
  if not isinstance(value, str) or (required and not value.strip()):
    raise ShiftError(f"report.{key} is required.")
  value = value.strip()
  if len(value) > TEXT_LIMITS[key]:
    raise ShiftError(f"report.{key} must be at most {TEXT_LIMITS[key]} characters.")
  return value


def _inside(folder: Path, relative: str) -> Path:
  if not isinstance(relative, str) or not relative.strip():
    raise ShiftError("File paths must be non-empty strings relative to the workspace.")
  candidate = (folder / relative).resolve()
  if folder.resolve() not in candidate.parents and candidate != folder.resolve():
    raise ShiftError(f"{relative} is outside the workspace.")
  if not candidate.is_file():
    raise ShiftError(f"{relative} does not exist in the workspace.")
  return candidate


def _fingerprint(data: bytes) -> str:
  return hashlib.sha256(data).hexdigest()


def submit(
  conn: sqlite3.Connection,
  storage: Path,
  *,
  shift_id: str,
  arguments: dict,
  call: dict,
  now: datetime,
) -> dict:
  shift = get(conn, shift_id)
  if shift is None:
    raise ShiftError("Unknown shift_id.")
  if shift["status"] not in ("running", "abandoned"):
    raise ShiftError(f"This shift is {shift['status']}; only a begun shift can submit.")
  chat_id = call.get("chat_id")
  if shift["chat_id"] and chat_id and shift["chat_id"] != chat_id:
    raise ShiftError("This shift belongs to a different chat.")
  if conn.execute("SELECT 1 FROM contributions WHERE shift_id = ? AND kind = 'report'", (shift_id,)).fetchone():
    raise ShiftError("This shift already submitted. End the turn.")
  problem = catalog.problem(shift["problem_id"])
  settings = settings_mod.load(conn)
  credit = settings["credit_name"] or "Anonymous contributor"
  report = arguments.get("report")
  if not isinstance(report, dict):
    raise ShiftError("report is required: {title, summary, tried, learned, next}.")
  title = _clean_text(report, "title", True)
  summary = _clean_text(report, "summary", True)
  details = {key: _clean_text(report, key, key == "learned") for key in ("tried", "learned", "next")}
  folder = _workspace(storage, problem)

  certificate = arguments.get("certificate")
  certificate_file = arguments.get("certificate_file")
  if certificate is not None and certificate_file is not None:
    raise ShiftError("Send certificate or certificate_file, not both.")
  if certificate_file is not None:
    path = _inside(folder, certificate_file)
    if path.stat().st_size > MAX_CERT_BYTES:
      raise ShiftError("The certificate file is larger than 8 MB; submit it as a claim instead.")
    try:
      certificate = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
      raise ShiftError(f"certificate_file is not valid JSON: {exc}") from None
  claim = arguments.get("claim")
  if claim is not None and not isinstance(claim, dict):
    raise ShiftError("claim must be an object: {statement, value, files, check_command}.")
  claim_files: list[Path] = []
  if claim is not None:
    statement = claim.get("statement")
    if not isinstance(statement, str) or not statement.strip():
      raise ShiftError("claim.statement is required.")
    files = claim.get("files") or []
    if not isinstance(files, list) or len(files) > MAX_CLAIM_FILES:
      raise ShiftError(f"claim.files must list at most {MAX_CLAIM_FILES} workspace paths.")
    claim_files = [_inside(folder, item) for item in files]
    if sum(path.stat().st_size for path in claim_files) > MAX_CLAIM_BYTES:
      raise ShiftError("Claim files exceed 25 MB in total.")

  results = []
  with write(conn):
    report_id = new_id("c", now)
    conn.execute(
      "INSERT INTO contributions(id, shift_id, problem_id, kind, title, summary, details, verdict, "
      "verdict_detail, points, credit_name, created_at) VALUES(?, ?, ?, 'report', ?, ?, ?, 'logged', ?, ?, ?, ?)",
      (
        report_id, shift_id, problem["id"], title, summary, json.dumps(details, ensure_ascii=False),
        "Shift report recorded.", points.contribution_points("report", "logged", problem["tier"]),
        credit, iso(now),
      ),
    )
    results.append({"id": report_id, "kind": "report", "verdict": "logged"})

    if certificate is not None:
      outcome = verify.check(problem, certificate)
      verdict = {"record": "record", "side_record": "side_record", "valid": "valid"}.get(outcome["status"], "invalid")
      if outcome["status"] == "unsupported":
        verdict = "unsupported"
      cert_id = new_id("c", now)
      blob = json.dumps(certificate, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
      result_dir = storage / "results" / cert_id
      result_dir.mkdir(parents=True, exist_ok=True)
      (result_dir / "certificate.json").write_bytes(blob)
      fingerprint = _fingerprint(blob)
      earned = points.contribution_points("certificate", verdict, problem["tier"])
      conn.execute(
        "INSERT INTO contributions(id, shift_id, problem_id, kind, title, summary, result_dir, fingerprint, "
        "value, verdict, verdict_detail, points, credit_name, created_at) "
        "VALUES(?, ?, ?, 'certificate', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
          cert_id, shift_id, problem["id"], f"Certificate: {title}"[:160], summary,
          str(result_dir), fingerprint, outcome.get("value"), verdict, outcome["detail"], earned,
          credit, iso(now),
        ),
      )
      results.append({
        "id": cert_id, "kind": "certificate", "verdict": verdict, "detail": outcome["detail"],
        "value": outcome.get("value"), "points": earned, "fingerprint": fingerprint,
      })
      log_event(conn, "certificate_checked", {"shift": shift_id, "verdict": verdict})

    if claim is not None:
      claim_id = new_id("c", now)
      result_dir = storage / "results" / claim_id
      result_dir.mkdir(parents=True, exist_ok=True)
      manifest = []
      for path in claim_files:
        relative = path.relative_to(folder.resolve())
        target = result_dir / "files" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        manifest.append({"path": str(relative), "sha256": _fingerprint(path.read_bytes())})
      claim_record = {
        "statement": claim["statement"].strip()[:4000],
        "value": str(claim.get("value") or "")[:200],
        "check_command": str(claim.get("check_command") or "")[:1000],
        "files": manifest,
      }
      blob = json.dumps(claim_record, ensure_ascii=False, sort_keys=True).encode("utf-8")
      (result_dir / "claim.json").write_bytes(blob)
      fingerprint = _fingerprint(blob)
      conn.execute(
        "INSERT INTO contributions(id, shift_id, problem_id, kind, title, summary, details, result_dir, "
        "fingerprint, claimed_value, verdict, verdict_detail, points, credit_name, created_at) "
        "VALUES(?, ?, ?, 'claim', ?, ?, ?, ?, ?, ?, 'pending_review', ?, 0, ?, ?)",
        (
          claim_id, shift_id, problem["id"], f"Claim: {title}"[:160], claim_record["statement"][:1500],
          json.dumps(claim_record, ensure_ascii=False), str(result_dir), fingerprint,
          claim_record["value"], "Waiting for an independent replay and review.", credit, iso(now),
        ),
      )
      results.append({"id": claim_id, "kind": "claim", "verdict": "pending_review", "fingerprint": fingerprint})
      log_event(conn, "claim_recorded", {"shift": shift_id})

    begun = parse_iso(shift["begun_at"]) or now
    minutes = round(max(min((now - begun).total_seconds() / 60.0, settings["shift_minutes"] + MINUTES_SLACK), 0.0), 2)
    weekly_after, charged = _measure(conn, shift, arguments.get("usage"), minutes)
    conn.execute(
      "UPDATE shifts SET status = 'done', ended_at = ?, minutes = ?, reason = NULL, weekly_after = ?, "
      "charged = ? WHERE id = ?",
      (iso(now), minutes, weekly_after, charged, shift_id),
    )
    log_event(conn, "shift_done", {"shift": shift_id, "charged": charged})

  total = points.summary(conn)
  return {
    "recorded": results,
    "points_total": total["points"],
    "message": "Recorded. Thank you. End the turn with a two-line summary for the owner.",
  }


def reconcile(conn: sqlite3.Connection, chats: list[dict] | None, now: datetime) -> dict:
  """Settle stale shifts and copy token usage from the platform's chat list."""
  by_id = {chat.get("id"): chat for chat in (chats or []) if isinstance(chat, dict)}
  settled = 0
  settings = settings_mod.load(conn)
  with write(conn):
    for row in conn.execute("SELECT * FROM shifts WHERE status IN ('starting', 'running')").fetchall():
      shift = row_dict(row)
      chat = by_id.get(shift["chat_id"]) if shift["chat_id"] else None
      created = parse_iso(shift["created_at"]) or now
      ended = chat is not None and not chat.get("running") and now - created > ENDED_GRACE
      if shift["status"] == "starting" and (ended or now - created > START_GRACE):
        conn.execute(
          "UPDATE shifts SET status = 'failed', reason = ?, ended_at = ? WHERE id = ?",
          ("The agent ended without checking in." if ended else "The agent never checked in.", iso(now), shift["id"]),
        )
        settled += 1
      elif shift["status"] == "running":
        deadline = parse_iso(shift["deadline_at"]) or now
        begun = parse_iso(shift["begun_at"]) or now
        if now > deadline + LATE_GRACE or (ended and now - begun > ENDED_GRACE):
          minutes = round(max(min((now - begun).total_seconds() / 60.0, settings["shift_minutes"] + MINUTES_SLACK), 0.0), 2)
          _, charged = _measure(conn, shift, None, minutes)
          conn.execute(
            "UPDATE shifts SET status = 'abandoned', reason = ?, ended_at = ?, minutes = ?, charged = ? WHERE id = ?",
            ("The shift ended without a report.", iso(now), minutes, charged, shift["id"]),
          )
          settled += 1
    for shift_id, chat_id in conn.execute(
      "SELECT id, chat_id FROM shifts WHERE chat_id IS NOT NULL AND created_at >= ?",
      (iso(now - timedelta(days=3)),),
    ).fetchall():
      chat = by_id.get(chat_id)
      totals = ((chat or {}).get("usage") or {}).get("totals") if chat else None
      if isinstance(totals, dict):
        conn.execute("UPDATE shifts SET tokens_json = ? WHERE id = ?", (json.dumps(totals), shift_id))
  return {"settled": settled}
