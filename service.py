#!/usr/bin/env python3
"""Math@Home's reviewed service: the interface's routes and the shift tools.

Routes (signed-in Möbius only):
  GET  state                     everything the interface shows
  POST settings                  change donation settings
  POST consent                   accept the current consent terms
  POST consent/withdraw          withdraw consent and stop donating
  POST shift/start               run one shift now (still capacity-checked)
  GET  contribution?id=…         one result with its files
  POST contribution/confirm      mark a reviewed claim confirmed
  POST contribution/refute       mark a claim refuted
Agent tools:
  POST tools/begin               capacity gate + research brief
  POST tools/submit              report, certificate or claim
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from engine import catalog, gate, iso, parse_iso, points, store, utcnow  # noqa: E402
from engine import community, launch, records, verification  # noqa: E402
from engine import settings as settings_mod  # noqa: E402
from engine import shifts as shifts_mod  # noqa: E402

NO_STORE = {"Cache-Control": "private, no-store"}


class Problem(Exception):
  def __init__(self, status: int, message: str):
    super().__init__(message)
    self.status = status
    self.message = message


def first(query: dict, key: str) -> str | None:
  value = (query or {}).get(key)
  if isinstance(value, list):
    value = value[0] if value else None
  return value if isinstance(value, str) else None


def _shift_view(shift: dict) -> dict:
  problem = catalog.problem(shift["problem_id"]) or {}
  lane = catalog.lane(problem, shift.get("lane_id")) if problem else None
  return {
    **shift,
    "problem_title": problem.get("title"),
    "problem_short": problem.get("short"),
    "lane_title": (lane or {}).get("title"),
  }


def _contribution_view(row: dict) -> dict:
  item = dict(row)
  item.pop("details", None)
  problem = catalog.problem(item["problem_id"]) or {}
  item["problem_short"] = problem.get("short")
  item["tier"] = problem.get("tier")
  return item


def _problem_stats(conn) -> dict:
  stats = {item["id"]: {"shifts": 0, "results": 0, "best": None, "last_at": None} for item in catalog.problems()}
  for row in conn.execute(
    "SELECT problem_id, COUNT(*) AS n, MAX(created_at) AS last_at FROM shifts "
    "WHERE status IN ('running', 'done', 'abandoned') GROUP BY problem_id"
  ):
    if row["problem_id"] in stats:
      stats[row["problem_id"]].update(shifts=row["n"], last_at=row["last_at"])
  for row in conn.execute(
    "SELECT problem_id, COUNT(*) AS n FROM contributions GROUP BY problem_id"
  ):
    if row["problem_id"] in stats:
      stats[row["problem_id"]]["results"] = row["n"]
  for row in conn.execute(
    "SELECT problem_id, value, verdict, created_at FROM contributions "
    "WHERE kind = 'certificate' AND verdict IN ('valid', 'side_record', 'record') ORDER BY created_at"
  ):
    entry = stats.get(row["problem_id"])
    if entry is None:
      continue
    try:
      better = entry["best"] is None or float(row["value"]) > float(entry["best"]["value"])
    except (TypeError, ValueError):
      better = False
    if better:
      entry["best"] = {"value": row["value"], "verdict": row["verdict"], "at": row["created_at"]}
  return stats


def _share_view(conn, settings: dict, now) -> dict:
  """This week's donation share, from the latest weekly cycle a shift has seen."""
  row = conn.execute(
    "SELECT provider, cycle FROM shifts WHERE cycle IS NOT NULL ORDER BY created_at DESC LIMIT 1"
  ).fetchone()
  provider = row["provider"] if row else (settings["provider"] if settings["provider"] in ("claude", "codex") else "claude")
  cycle = row["cycle"] if row else None
  if cycle and (parse_iso(cycle) or now) <= now:
    cycle = None  # that week has already reset
  used = shifts_mod.share_usage(conn, provider, cycle, settings)
  limit = settings["share_percent"]
  donated = used["donated"] if cycle else 0.0
  return {
    "limit": limit,
    "donated": donated,
    "remaining": None if limit >= 100 else round(max(0.0, limit - donated), 2),
    "resets_at": cycle,
    "estimate": used["estimate"],
    "measured": used["measured"],
    "provider": provider,
  }


def state(conn) -> dict:
  now = utcnow()
  token = os.environ.get("APP_TOKEN")
  if token:
    try:
      shifts_mod.reconcile(conn, launch.list_chats(token), now)
    except launch.PlatformError:
      pass
  settings = settings_mod.load(conn)
  consent_ok = settings_mod.consent_current(conn)
  active = shifts_mod.active_shift(conn, now)
  backoff = parse_iso(store.get_meta(conn, "backoff_until"))
  can_start, reason = gate.schedule_decision(
    settings={**settings, "window_start": "00:00", "window_end": "00:00"},
    consent_ok=consent_ok,
    now_utc=now,
    shifts_today=shifts_mod.shifts_today(conn, settings, now),
    active_shift=active,
    backoff_until=backoff,
  )
  shifts = [
    _shift_view(store.row_dict(row))
    for row in conn.execute("SELECT * FROM shifts ORDER BY created_at DESC LIMIT 40")
  ]
  contributions = [
    _contribution_view(dict(row))
    for row in conn.execute("SELECT * FROM contributions ORDER BY created_at DESC LIMIT 60")
  ]
  return {
    "now": iso(now),
    "settings": settings,
    "consent": {
      "record": settings_mod.consent(conn),
      "current": consent_ok,
      "terms": catalog.consent_terms(),
    },
    "window": {
      "open": gate.in_window(now, settings),
      "next_start": iso(gate.next_window_start(now, settings)),
    },
    "today": {
      "shifts": shifts_mod.shifts_today(conn, settings, now),
      "allowance": settings["shifts_per_day"],
      "eligible": can_start,
      "reason": reason,
    },
    "capacity": store.get_meta(conn, "capacity"),
    "share": _share_view(conn, settings, now),
    "backoff_until": iso(backoff) if backoff and backoff > now else None,
    "active": _shift_view(active) if active else None,
    "shifts": shifts,
    "contributions": contributions,
    "totals": points.summary(conn),
    "problems": _problem_stats(conn),
  }


def contribution(conn, contribution_id: str | None) -> dict:
  row = conn.execute("SELECT * FROM contributions WHERE id = ?", (contribution_id or "",)).fetchone()
  if row is None:
    raise Problem(404, "That result no longer exists.")
  item = _contribution_view(dict(row))
  try:
    item["details"] = json.loads(row["details"]) if row["details"] else None
  except ValueError:
    item["details"] = None
  preview = None
  if row["result_dir"]:
    folder = Path(row["result_dir"])
    for name in ("certificate.json", "claim.json"):
      path = folder / name
      if path.is_file():
        text = path.read_text(encoding="utf-8", errors="replace")
        preview = {"name": name, "text": text[:4000], "truncated": len(text) > 4000, "bytes": len(text)}
        break
  item["preview"] = preview
  shift = shifts_mod.get(conn, row["shift_id"]) if row["shift_id"] else None
  item["chat_id"] = (shift or {}).get("chat_id")
  certificate = None
  if row["kind"] == "certificate" and row["result_dir"]:
    try:
      certificate = json.loads((Path(row["result_dir"]) / "certificate.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
      certificate = None
  item["verification"] = verification.describe(dict(row), shift, catalog.problem(row["problem_id"]) or {}, certificate)
  return item


def settle_claim(conn, body: dict, verdict: str) -> dict:
  cid = body.get("id")
  row = conn.execute("SELECT * FROM contributions WHERE id = ?", (cid or "",)).fetchone()
  if row is None:
    raise Problem(404, "That result no longer exists.")
  if row["kind"] != "claim":
    raise Problem(409, "Only claims are settled by review; certificates are checked automatically.")
  link = body.get("link")
  if verdict == "confirmed" and (not isinstance(link, str) or not link.strip().startswith(("http://", "https://"))):
    raise Problem(422, "Add a link to the independent confirmation (a review, accepted record or paper).")
  problem = catalog.problem(row["problem_id"]) or {"tier": 1}
  side = bool(body.get("side"))
  earned = points.contribution_points("claim", verdict, problem["tier"], side=side) if verdict == "confirmed" else 0
  with store.write(conn):
    conn.execute(
      "UPDATE contributions SET verdict = ?, verdict_detail = ?, points = ?, confirmed_at = ?, external_link = ? "
      "WHERE id = ?",
      (
        verdict,
        "Confirmed by independent review." if verdict == "confirmed" else str(body.get("note") or "Refuted on review.")[:500],
        earned,
        iso(utcnow()),
        link.strip() if isinstance(link, str) else None,
        cid,
      ),
    )
    store.log_event(conn, f"claim_{verdict}", {"id": cid})
  return contribution(conn, cid)


def ui_request(req: dict, conn) -> dict:
  path = (req.get("path") or "").strip("/")
  method = req.get("method")
  query = req.get("query") or {}
  body = req.get("body") if isinstance(req.get("body"), dict) else {}
  if path == "state" and method == "GET":
    return state(conn)
  if path == "settings" and method == "POST":
    try:
      with store.write(conn):
        settings_mod.update(conn, body)
    except settings_mod.SettingsError as exc:
      raise Problem(422, str(exc))
    return state(conn)
  if path == "consent" and method == "POST":
    version = body.get("version")
    try:
      with store.write(conn):
        settings_mod.give_consent(
          conn,
          version if isinstance(version, int) else -1,
          body.get("credit_name") if isinstance(body.get("credit_name"), str) else "",
          body.get("timezone") if isinstance(body.get("timezone"), str) else None,
        )
    except settings_mod.SettingsError as exc:
      raise Problem(422, str(exc))
    return state(conn)
  if path == "consent/withdraw" and method == "POST":
    with store.write(conn):
      settings_mod.withdraw_consent(conn)
    return state(conn)
  if path == "shift/start" and method == "POST":
    token = os.environ.get("APP_TOKEN")
    if not token:
      raise Problem(503, "This Möbius did not give the app a token to start shifts.")
    problem_id = body.get("problem_id") if isinstance(body.get("problem_id"), str) else None
    if problem_id and catalog.problem(problem_id) is None:
      raise Problem(404, "Unknown problem.")
    result = launch.start(conn, token, now=utcnow(), trigger="manual", problem_id=problem_id)
    return {"result": result, "state": state(conn)}
  if path == "records" and method == "GET":
    # Records that move faster than app releases, read live (cached for an hour).
    return {"records": records.all_live(conn, catalog.problems(), utcnow())}
  if path == "community" and method == "GET":
    view = community.board(conn, utcnow())
    counts = {
      row["share_status"]: row["n"]
      for row in conn.execute(
        "SELECT share_status, COUNT(*) AS n FROM shifts WHERE share_status IS NOT NULL GROUP BY share_status"
      )
    }
    return {
      **view,
      "site_url": catalog.community()["site_url"],
      "hub_repo": catalog.community()["hub_repo"],
      "me": {"login": store.get_meta(conn, "github_login"), "shares": counts},
    }
  if path == "share/preview" and method == "GET":
    try:
      return community.preview(conn, first(query, "shift_id"), catalog.app_version())
    except community.ShareError as exc:
      raise Problem(409, str(exc))
  if path == "share/prepare" and method == "POST":
    try:
      return community.prepare(
        conn, store.storage_dir(), str(body.get("shift_id") or ""), str(body.get("sha256") or ""), catalog.app_version(),
      )
    except community.ShareError as exc:
      raise Problem(409, str(exc))
  if path == "contribution" and method == "GET":
    return contribution(conn, first(query, "id"))
  if path == "contribution/confirm" and method == "POST":
    return settle_claim(conn, body, "confirmed")
  if path == "contribution/refute" and method == "POST":
    return settle_claim(conn, body, "refuted")
  raise Problem(404, "Not found.")


def tool_request(req: dict, conn) -> dict:
  name = (req.get("path") or "").strip("/").split("/", 1)[-1]
  if req.get("method") != "POST" or name not in ("begin", "submit", "shared"):
    return {"status": 404, "body": {"detail": "Unknown Math@Home tool."}}
  body = req.get("body") if isinstance(req.get("body"), dict) else {}
  args = body.get("arguments") if isinstance(body.get("arguments"), dict) else {}
  call = body.get("call") if isinstance(body.get("call"), dict) else {}
  if not isinstance(call.get("chat_id"), str) or not call["chat_id"]:
    return {"status": 403, "body": {"detail": "Math@Home tools run only inside a shift chat."}}
  shift_id = args.get("shift_id")
  if not isinstance(shift_id, str) or not shift_id:
    return {"status": 422, "body": {"detail": "shift_id is required; copy it from the first message."}}
  usage = args.get("usage")
  if isinstance(usage, str):
    try:
      usage = json.loads(usage)
    except ValueError:
      usage = None
  storage = store.storage_dir()
  if name == "shared":
    try:
      output = community.mark_shared(conn, shift_id, args.get("issue_url"), args.get("login"), utcnow())
    except community.ShareError as exc:
      return {"status": 422, "body": {"detail": str(exc)}}
    return {"status": 200, "body": output}
  try:
    if name == "begin":
      output = shifts_mod.begin(conn, storage, shift_id=shift_id, usage=usage, call=call, now=utcnow())
    else:
      for key in ("report", "certificate", "claim", "usage"):
        if isinstance(args.get(key), str):
          try:
            args[key] = json.loads(args[key])
          except ValueError:
            return {"status": 422, "body": {"detail": f"{key} must be a JSON object."}}
      output = shifts_mod.submit(conn, storage, shift_id=shift_id, arguments=args, call=call, now=utcnow())
  except shifts_mod.ShiftError as exc:
    return {"status": 422, "body": {"detail": str(exc)}}
  return {"status": 200, "body": output}


def handle(req: dict) -> dict:
  if not isinstance(req, dict) or req.get("schema") != 1:
    return {"status": 400, "body": {"error": "Invalid service request."}}
  if req.get("public"):
    return {"status": 404, "body": {"error": "Not found."}}
  conn = store.connect(store.storage_dir())
  try:
    if (req.get("path") or "").lstrip("/").startswith("tools/"):
      return tool_request(req, conn)
    scope = (req.get("actor") or {}).get("scope")
    if scope not in ("owner", "app", "agent"):
      return {"status": 403, "body": {"error": "Open Math@Home from your signed-in Möbius."}}
    try:
      return {"status": 200, "body": ui_request(req, conn), "headers": NO_STORE}
    except Problem as exc:
      return {"status": exc.status, "body": {"error": exc.message}, "headers": NO_STORE}
  finally:
    conn.close()


# Möbius may run the module setup above once and fork each request from it.
# Setup only imports modules: no files, sockets, threads or per-request values.
MOBIUS_PRELOAD = True

if __name__ == "__main__":
  try:
    response = handle(json.load(sys.stdin))
  except Exception as exc:  # keep the envelope valid; details go to the platform log
    print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
    response = {"status": 500, "body": {"error": "Math@Home hit an unexpected error. Please retry."}}
  print(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
