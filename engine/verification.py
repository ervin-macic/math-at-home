"""What each result has been verified by, stated plainly for people.

Three kinds of result, three honest answers:
- a certificate is checked by the built-in checker here, and proved in Lean 4
  on the community board once it is shared;
- a claim is not machine-verified: it waits for an independent review;
- a report is a log of what was tried, with nothing to verify.
"""

from __future__ import annotations

import json

from engine import lean

CHECKER_STATUS = {
  "valid": "passed", "side_record": "passed", "record": "passed",
  "invalid": "failed", "unsupported": "not_run",
}


def _hub_lean(shift: dict | None) -> dict | None:
  value = (shift or {}).get("hub_lean")
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except ValueError:
      return None
  return value if isinstance(value, dict) else None


def _review_rule(problem: dict) -> str:
  """What a pending claim waits for: the problem's own review rule when it has one."""
  verifier = problem.get("verifier") or {}
  if verifier.get("kind") == "review" and verifier.get("note"):
    return f"Waiting for review. {verifier['note']}"
  return "Waiting for someone to replay the computation or check the argument."


def describe(contribution: dict, shift: dict | None, problem: dict, certificate: dict | None) -> dict:
  kind, verdict = contribution["kind"], contribution["verdict"]
  if kind == "report":
    return {
      "headline": "A shift report: nothing to verify",
      "steps": [{"name": "Report", "status": "n/a",
                 "text": "Reports record what was tried and learned, dead ends included. They make no mathematical claim."}],
    }
  if kind == "claim":
    review = {"confirmed": "passed", "refuted": "failed"}.get(verdict, "pending")
    headline = {
      "passed": "Confirmed by independent review",
      "failed": "Refuted on review",
      "pending": "Not machine-verified: awaiting independent review",
    }[review]
    return {
      "headline": headline,
      "steps": [
        {"name": "Built-in checker", "status": "n/a", "text": "No automatic checker covers this kind of result."},
        {"name": "Lean 4", "status": "n/a",
         "text": "Not formalized. A claim counts only after an independent replay or review confirms it."},
        {"name": "Independent review", "status": review,
         "text": "Confirmed." if review == "passed" else "Refuted." if review == "failed"
         else _review_rule(problem)},
      ],
    }
  checker = CHECKER_STATUS.get(verdict, "not_run")
  kind_name = problem.get("verifier", {}).get("kind")
  rendered = lean.render(kind_name, certificate) if certificate and kind_name else None
  hub = _hub_lean(shift)
  share_status = (shift or {}).get("share_status")
  if hub and hub.get("status") == "verified":
    native = hub.get("method") == "native"
    toolchain = (hub.get("toolchain") or "Lean 4").split(":")[-1]
    lean_step = {"status": "passed", "text": (
      f"Proved on the community board with Lean {toolchain}" +
      (" by a compiled check (native_decide), which also trusts Lean's compiler." if native
       else " by Lean's kernel, with no extra axioms."))}
  elif hub and hub.get("status") == "failed":
    lean_step = {"status": "failed", "text": "Lean could not prove it on the community board."}
  elif rendered is None:
    lean_step = {"status": "n/a", "text": "No Lean statement exists for this certificate."}
  elif checker != "passed":
    lean_step = {"status": "n/a", "text": "Not run, because the built-in checker rejected the certificate."}
  elif share_status in ("prepared", "posted", "recorded"):
    lean_step = {"status": "pending", "text": "Shared: the community board proves it in Lean within a few minutes."}
  else:
    lean_step = {"status": "pending",
                 "text": "Runs on the community board when you share this result. This Möbius does not run Lean itself."}
  if checker == "failed":
    headline = "Rejected by the built-in checker"
  elif checker != "passed":
    headline = "Too large for the built-in checker: needs review"
  elif lean_step["status"] == "passed":
    headline = "Checked by the built-in checker and proved in Lean 4"
  else:
    headline = "Checked by the built-in checker; Lean proof pending"
  return {
    "headline": headline,
    "statement": rendered["statement"] if rendered else None,
    "consequence": rendered["consequence"] if rendered else None,
    "steps": [
      {"name": "Built-in checker", "status": checker,
       "text": contribution.get("verdict_detail") or "Exact arithmetic check of the certificate."},
      {"name": "Lean 4", **lean_step},
    ],
  }
