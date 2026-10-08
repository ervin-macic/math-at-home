"""The problem pack, shared with the interface through catalog.json."""

from __future__ import annotations

from functools import lru_cache
import json

from engine import APP_ROOT


@lru_cache(maxsize=1)
def load() -> dict:
  with (APP_ROOT / "catalog.json").open(encoding="utf-8") as handle:
    return json.load(handle)


def problems() -> list[dict]:
  return sorted(load()["problems"], key=lambda item: item["rank"])


def problem(problem_id: str) -> dict | None:
  return next((item for item in problems() if item["id"] == problem_id), None)


def lane(problem_entry: dict, lane_id: str | None) -> dict | None:
  return next(
    (item for item in problem_entry.get("lanes", []) if item["id"] == lane_id),
    None,
  )


def points_rules() -> dict:
  return load()["points"]


def consent_terms() -> dict:
  return load()["consent"]


def community() -> dict:
  return load()["community"]


@lru_cache(maxsize=1)
def app_version() -> str:
  try:
    with (APP_ROOT / "mobius.json").open(encoding="utf-8") as handle:
      return str(json.load(handle).get("version") or "")
  except (OSError, ValueError):
    return ""
