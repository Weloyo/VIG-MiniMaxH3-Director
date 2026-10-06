from __future__ import annotations
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from .paths import user_root
USAGE_ROUTE = "/vig/h3/usage"
USAGE_READ_ROUTE = "/vig/h3/usage/read"
VERSION = 1
MAX_ELEMENTS = 4000
MAX_EVENTS = 2000
MAX_PRESENT = 2000
MAX_NAME = 120
MAX_COUNT = 100000
_LOCK = threading.Lock()
def store_path() -> Path:
    return user_root() / "usage" / "elements.json"
def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def clean_name(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    name = value.strip()
    if not name or len(name) > MAX_NAME:
        return ""
    if any(ch < " " or ch == "\x7f" for ch in name):
        return ""
    parts = name.split("/")
    if len(parts) not in (2, 3):
        return ""
    if not all(part.strip() for part in parts):
        return ""
    return name
def read() -> dict:
    blank = {"version": VERSION, "updated": "", "elements": {}}
    try:
        with open(store_path(), "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return blank
    if not isinstance(data, dict) or not isinstance(data.get("elements"), dict):
        return blank
    return data
def _write(data: dict) -> None:
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(temp, path)
def record(events: Any, present: Any = None, *, when: str = "") -> dict:
    stamp = when or _now()
    kept: list[tuple[str, int, bool]] = []
    shown: list[str] = []
    for name in present or []:
        clean = clean_name(name)
        if clean:
            shown.append(clean)
        if len(shown) >= MAX_PRESENT:
            break
    for event in events or []:
        if not isinstance(event, dict):
            continue
        name = clean_name(event.get("name"))
        if not name:
            continue
        try:
            count = int(event.get("count", 1))
        except (TypeError, ValueError):
            continue
        if count <= 0:
            continue
        kept.append((name, min(count, MAX_COUNT), bool(event.get("fresh"))))
        if len(kept) >= MAX_EVENTS:
            break
    if not kept and not shown:
        return {"stored": 0, "elements": len(read().get("elements") or {})}
    with _LOCK:
        data = read()
        elements = data.get("elements") or {}
        stored = 0
        def row(name: str):
            entry = elements.get(name)
            if entry is None:
                if len(elements) >= MAX_ELEMENTS:
                    return None
                entry = {
                    "count": 0,
                    "sessions": 0,
                    "present": 0,
                    "first": "",
                    "last": "",
                    "seen": "",
                }
                elements[name] = entry
            return entry
        for name in shown:
            entry = row(name)
            if entry is None:
                continue
            entry["present"] = int(entry.get("present", 0)) + 1
            entry["seen"] = stamp
        for name, count, fresh in kept:
            entry = row(name)
            if entry is None:
                continue
            entry["count"] = int(entry.get("count", 0)) + count
            if fresh:
                entry["sessions"] = int(entry.get("sessions", 0)) + 1
            if not entry.get("first"):
                entry["first"] = stamp
            entry["last"] = stamp
            stored += 1
        data["elements"] = elements
        data["version"] = VERSION
        data["updated"] = stamp
        _write(data)
    return {"stored": stored, "elements": len(elements)}
JOURNAL_ROUTE = "/vig/h3/usage/journal"
JOURNAL_KINDS = ("click", "change", "run")
JOURNAL_VALUE = 80
_JOURNAL_INTS = ("node", "clip")
_JOURNAL_WORDS = ("status",)
def journal_dir() -> Path:
    return user_root() / "usage" / "journal"
def _journal_line(entry: Any, session: str) -> dict | None:
    if not isinstance(entry, dict):
        return None
    name = clean_name(entry.get("name"))
    kind = entry.get("kind")
    at = entry.get("at")
    if not name or kind not in JOURNAL_KINDS:
        return None
    if not isinstance(at, str) or not (10 <= len(at) <= 40):
        return None
    line: dict[str, Any] = {"at": at, "kind": kind, "name": name}
    if session:
        line["session"] = session
    for key in _JOURNAL_INTS:
        value = entry.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            line[key] = value
    for key in _JOURNAL_WORDS:
        value = entry.get(key)
        if isinstance(value, str) and value and len(value) <= 60:
            line[key] = value
    clips = entry.get("clips")
    if isinstance(clips, list):
        line["clips"] = [c for c in clips[:200] if isinstance(c, int) and not isinstance(c, bool)]
    value = entry.get("value")
    if isinstance(value, bool):
        line["value"] = value
    elif isinstance(value, (int, float)):
        line["value"] = value
    elif isinstance(value, str):
        line["value"] = value[:JOURNAL_VALUE]
    return line
def record_journal(entries: Any, session: Any = "") -> int:
    if not isinstance(entries, list) or not entries:
        return 0
    tag = session if isinstance(session, str) and len(session) <= 16 else ""
    lines = []
    for entry in entries[:MAX_EVENTS]:
        line = _journal_line(entry, tag)
        if line:
            lines.append(json.dumps(line, ensure_ascii=False, sort_keys=True))
    if not lines:
        return 0
    path = journal_dir() / f"{datetime.now().strftime('%Y-%m-%d')}.jsonl"
    with _LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    return len(lines)
def read_journal(day: str = "", limit: int = 0) -> dict:
    folder = journal_dir()
    days = sorted(p.stem for p in folder.glob("*.jsonl")) if folder.is_dir() else []
    day = day if isinstance(day, str) and day in days else (days[-1] if days else "")
    entries: list[dict] = []
    if day:
        try:
            with open(folder / f"{day}.jsonl", "r", encoding="utf-8") as handle:
                for raw in handle:
                    try:
                        entries.append(json.loads(raw))
                    except ValueError:
                        continue
        except OSError:
            pass
    if limit and limit > 0:
        entries = entries[-limit:]
    return {"day": day, "days": days, "path": str(folder), "entries": entries}
def handle_usage(payload: Any) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "a usage report is an object"}
    journalled = record_journal(payload.get("journal"), payload.get("session"))
    return 200, {"ok": True, "journalled": journalled,
                 **record(payload.get("events"), payload.get("present"))}
def handle_usage_journal(payload: Any = None) -> tuple[int, dict]:
    payload = payload if isinstance(payload, dict) else {}
    try:
        limit = int(payload.get("limit") or 0)
    except (TypeError, ValueError):
        limit = 0
    return 200, {"ok": True, **read_journal(str(payload.get("day") or ""), limit)}
def handle_usage_read(_payload: Any = None) -> tuple[int, dict]:
    return 200, {"ok": True, "path": str(store_path()), **read()}
