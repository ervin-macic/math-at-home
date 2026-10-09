"""Points, ranks and badges.

The rules live in catalog.json so the interface can explain exactly what is
counted. Discoveries dominate: one machine-checked record outweighs months of
routine shifts, while honest dead ends still earn something.
"""

from __future__ import annotations

import json
import sqlite3

from engine import catalog

COUNTED_VERDICTS = ("logged", "valid", "side_record", "record", "confirmed")


def contribution_points(kind: str, verdict: str, tier: int, side: bool = False) -> int:
  rules = catalog.points_rules()
  if verdict == "logged" and kind == "report":
    return rules["report"]
  if verdict == "valid":
    return rules["certificate"]
  if verdict == "side_record":
    return rules["side_record_per_tier"] * tier
  if verdict == "record":
    return rules["record_per_tier"] * tier
  if verdict == "confirmed":
    per_tier = rules["side_record_per_tier"] if side else rules["record_per_tier"]
    return per_tier * tier
  return 0


def minutes_points(minutes: float) -> int:
  return int(max(0.0, minutes or 0.0) // catalog.points_rules()["minutes_per_point"])


def rank_for(points: int) -> dict:
  ranks = catalog.points_rules()["ranks"]
  current = ranks[0]
  following = None
  for index, rank in enumerate(ranks):
    if points >= rank["min"]:
      current = rank
      following = ranks[index + 1] if index + 1 < len(ranks) else None
  return {"name": current["name"], "min": current["min"], "next": following}


def summary(conn: sqlite3.Connection) -> dict:
  """Totals for this Möbius: points, donated time, rank and badges."""
  by_problem = {item["id"]: {"points": 0, "shifts": 0, "minutes": 0.0} for item in catalog.problems()}
  for row in conn.execute(
    "SELECT problem_id, COALESCE(SUM(points), 0) AS points FROM contributions "
    "WHERE verdict IN (%s) GROUP BY problem_id" % ",".join("?" * len(COUNTED_VERDICTS)),
    COUNTED_VERDICTS,
  ):
    if row["problem_id"] in by_problem:
      by_problem[row["problem_id"]]["points"] += int(row["points"])
  shifts_done = 0
  minutes_total = 0.0
  tokens_total = 0
  for row in conn.execute(
    "SELECT problem_id, status, minutes, tokens_json FROM shifts "
    "WHERE status IN ('done', 'abandoned')"
  ):
    minutes = float(row["minutes"] or 0.0)
    minutes_total += minutes
    shifts_done += 1 if row["status"] == "done" else 0
    if row["problem_id"] in by_problem:
      by_problem[row["problem_id"]]["shifts"] += 1
      by_problem[row["problem_id"]]["minutes"] += minutes
    if row["tokens_json"]:
      try:
        total = (json.loads(row["tokens_json"]) or {}).get("total_tokens")
      except ValueError:
        total = None
      if isinstance(total, int):
        tokens_total += total
  time_points = minutes_points(minutes_total)
  result_points = sum(item["points"] for item in by_problem.values())
  total = result_points + time_points
  verdicts = {
    row["verdict"]: row["n"]
    for row in conn.execute("SELECT verdict, COUNT(*) AS n FROM contributions GROUP BY verdict")
  }
  touched = sum(1 for item in by_problem.values() if item["shifts"])
  badges = [
    {"id": "first-shift", "name": "First shift", "earned": shifts_done >= 1,
     "hint": "Complete one shift."},
    {"id": "ten-shifts", "name": "Ten shifts", "earned": shifts_done >= 10,
     "hint": "Complete ten shifts."},
    {"id": "checked", "name": "Checked certificate",
     "earned": any(verdicts.get(v) for v in ("valid", "side_record", "record", "confirmed")),
     "hint": "Submit a certificate that passes a checker."},
    {"id": "record", "name": "Record breaker",
     "earned": any(verdicts.get(v) for v in ("side_record", "record", "confirmed")),
     "hint": "Beat a record."},
    {"id": "every-problem", "name": "Every problem", "earned": touched == len(by_problem),
     "hint": "Work a shift on every problem."},
  ]
  return {
    "points": total,
    "result_points": result_points,
    "time_points": time_points,
    "minutes": round(minutes_total, 1),
    "tokens": tokens_total,
    "shifts_done": shifts_done,
    "by_problem": by_problem,
    "rank": rank_for(total),
    "badges": badges,
    "records": sum(verdicts.get(v, 0) for v in ("side_record", "record", "confirmed")),
    "pending_claims": verdicts.get("pending_review", 0),
  }
