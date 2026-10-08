"""Talking to this Möbius: start a shift's background chat, read chat usage.

Used by both the scheduled job and the service's Run-now route, each with its
own short-lived app token.
"""

from __future__ import annotations

from datetime import datetime
import json
import os
import sqlite3
import urllib.error
import urllib.request

from engine import shifts


class PlatformError(RuntimeError):
  pass


def _base() -> str:
  return os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")


def _request(method: str, path: str, token: str, body: dict | None = None, timeout: float = 12.0):
  data = json.dumps(body).encode("utf-8") if body is not None else None
  request = urllib.request.Request(
    _base() + path,
    data=data,
    method=method,
    headers={
      "Authorization": f"Bearer {token}",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  )
  try:
    with urllib.request.urlopen(request, timeout=timeout) as response:
      raw = response.read()
  except urllib.error.HTTPError as exc:
    detail = exc.read().decode("utf-8", "replace")[:300]
    raise PlatformError(f"{method} {path} failed with {exc.code}: {detail}") from None
  except (urllib.error.URLError, TimeoutError) as exc:
    raise PlatformError(f"{method} {path} failed: {exc}") from None
  return json.loads(raw) if raw else None


def list_chats(token: str) -> list[dict]:
  result = _request("GET", "/api/app-chats", token)
  return result if isinstance(result, list) else []


def start(conn: sqlite3.Connection, token: str, *, now: datetime, trigger: str, problem_id: str | None = None) -> dict:
  """Plan a shift and, if allowed, start its background agent chat."""
  planned = shifts.plan(conn, now=now, trigger=trigger, problem_id=problem_id)
  if not planned["started"]:
    return planned
  shift = planned["shift"]
  payload = shifts.chat_payload(shift, planned["problem"], planned["lane"], planned["settings"], now)
  try:
    # The interface lane allows 15 s per request; stay inside it.
    response = _request("POST", "/api/app-chats/start", token, payload, timeout=12.0)
  except PlatformError as exc:
    shifts.mark_failed(conn, shift["id"], f"Could not start the agent: {exc}", now)
    return {"started": False, "reason": "Could not start the agent session.", "shift_id": shift["id"]}
  chat_id = (response or {}).get("chat_id")
  if chat_id:
    shifts.attach_chat(conn, shift["id"], chat_id)
  return {"started": True, "shift_id": shift["id"], "chat_id": chat_id, "problem_id": shift["problem_id"]}
