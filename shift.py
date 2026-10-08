#!/usr/bin/env python3
"""Math@Home's scheduled tick.

Runs every half hour. It settles stale shifts, records token usage, and starts
one background shift when consent, quiet hours, the daily allowance and the
last capacity reading all allow it. The capacity check itself happens inside
the shift, where the agent can read the owner's usage gauge.
"""

from __future__ import annotations

import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from engine import iso, launch, store, utcnow  # noqa: E402
from engine import shifts as shifts_mod  # noqa: E402


def main() -> int:
  if len(sys.argv) < 2:
    print("usage: shift.py <app-id>", file=sys.stderr)
    return 2
  token = os.environ.get("APP_TOKEN", "")
  if not token:
    print("APP_TOKEN missing", file=sys.stderr)
    return 2
  conn = store.connect(store.job_storage_dir(sys.argv[1]))
  now = utcnow()
  try:
    chats = launch.list_chats(token)
  except launch.PlatformError as exc:
    print(f"could not list chats: {exc}", file=sys.stderr)
    chats = None
  if chats is not None:
    shifts_mod.reconcile(conn, chats, now)
  result = launch.start(conn, token, now=now, trigger="schedule")
  line = result.get("reason") or f"started {result.get('shift_id')}"
  print(line)
  _log(f"{iso(now)} {line}")
  return 0


def _log(line: str, keep: int = 500) -> None:
  """One line per tick in the job's own state folder: the answer to "why didn't it run?"."""
  folder = os.environ.get("APP_JOB_STATE_DIR")
  if not folder:
    return
  path = Path(folder) / "shift.log"
  try:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    lines = (lines + [line])[-keep:]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
  except OSError:
    pass


if __name__ == "__main__":
  sys.exit(main())
