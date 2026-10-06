from __future__ import annotations
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
TRACE_FILENAME = "agent_trace.jsonl"
MAX_LOGGED_CHARS = 600
MAX_TRACE_BYTES = 5 * (1 << 20)
@dataclass
class Turn:
    index: int
    tool: str = ""
    arguments: dict[str, Any] = field(default_factory=dict)
    result_preview: str = ""
    result_chars: int = 0
    message: str = ""
    error: str = ""
    elapsed_seconds: float = 0.0
@dataclass
class Trace:
    run_id: str
    mode: str
    model: str
    turns: list[Turn] = field(default_factory=list)
    outcome: str = "running"
    note: str = ""
    def record(self, **kwargs) -> Turn:
        turn = Turn(index=len(self.turns) + 1, **kwargs)
        if turn.result_preview and len(turn.result_preview) > MAX_LOGGED_CHARS:
            turn.result_chars = len(turn.result_preview)
            turn.result_preview = turn.result_preview[:MAX_LOGGED_CHARS] + "..."
        elif turn.result_preview:
            turn.result_chars = len(turn.result_preview)
        self.turns.append(turn)
        return turn
    def tool_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for turn in self.turns:
            if turn.tool:
                counts[turn.tool] = counts.get(turn.tool, 0) + 1
        return counts
    def summary(self) -> str:
        counts = self.tool_counts()
        listed = ", ".join(f"{name}x{n}" for name, n in sorted(counts.items())) or "no tool calls"
        return f"agent {self.outcome} after {len(self.turns)} turn(s): {listed}"
    def as_dicts(self) -> list[dict]:
        return [asdict(turn) for turn in self.turns]
    def write(self, directory: Path | None = None) -> Path | None:
        if directory is None:
            try:
                from ..styles.library import user_root
                directory = user_root()
            except Exception:
                return None
        try:
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / TRACE_FILENAME
            try:
                if path.stat().st_size > MAX_TRACE_BYTES:
                    path.replace(directory / (TRACE_FILENAME + ".1"))
            except OSError:
                pass
            record = {
                "run_id": self.run_id,
                "mode": self.mode,
                "model": self.model,
                "outcome": self.outcome,
                "note": self.note,
                "turns": self.as_dicts(),
            }
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            return path
        except OSError:
            return None
