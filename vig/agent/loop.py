from __future__ import annotations
import json
import time
from dataclasses import dataclass, field
from .. import guides
from ..llm.base import BackendError
from ..prompt.validator import ValidationResult
from .tools import TOOL_SCHEMAS, AgentContext, ToolBox, system_prompt
from .trace import Trace
DEFAULT_MAX_TURNS = 24
DEFAULT_MAX_SECONDS = 240
IDLE_TURNS_BEFORE_NUDGE = 1
@dataclass
class AgentResult:
    prompt: str = ""
    validation: ValidationResult | None = None
    trace: Trace | None = None
    notes: list[str] = field(default_factory=list)
    outcome: str = "submitted"
    @property
    def ok(self) -> bool:
        return bool(self.prompt) and (self.validation is None or self.validation.ok)
def _interrupted() -> bool:
    try:
        import comfy.model_management as mm
        return bool(mm.processing_interrupted())
    except (ImportError, AttributeError):
        return False
def run_agent(
    backend,
    context: AgentContext,
    max_turns: int = DEFAULT_MAX_TURNS,
    max_seconds: int = DEFAULT_MAX_SECONDS,
    progress=None,
    on_tool=None,
) -> AgentResult:
    chat = getattr(backend, "chat_with_tools", None)
    if chat is None:
        raise BackendError(
            f"backend {getattr(backend, 'name', type(backend).__name__)!r} does not support "
            "tool calling; the agent engine needs a model and server that do"
        )
    toolbox = ToolBox(context)
    trace = Trace(
        run_id=f"{context.mode}-{max_turns}t",
        mode=context.mode,
        model=getattr(backend, "model", "unknown"),
    )
    messages = [
        {"role": "system", "content": system_prompt(context)},
        {
            "role": "user",
            "content": (
                "Write the prompt. Start by calling read_skill on "
                f"{guides.DIRECTION_SKILL!r}."
            ),
        },
    ]
    notes: list[str] = []
    started = time.monotonic()
    idle_turns = 0
    outcome = "exhausted"
    for turn in range(1, max_turns + 1):
        if _interrupted():
            outcome = "cancelled"
            notes.append("Agent run cancelled.")
            break
        elapsed = time.monotonic() - started
        if elapsed > max_seconds:
            outcome = "timeout"
            notes.append(
                f"Agent stopped after {elapsed:.0f}s (limit {max_seconds}s) on turn {turn}."
            )
            break
        if progress is not None:
            try:
                progress(turn, max_turns)
            except Exception:
                pass
        try:
            message = chat(messages, TOOL_SCHEMAS)
        except BackendError as exc:
            trace.record(error=str(exc), elapsed_seconds=round(elapsed, 2))
            notes.append(f"WARNING: agent turn {turn} failed ({exc}).")
            outcome = "backend_error"
            break
        messages.append(message)
        tool_calls = message.get("tool_calls") or []
        if not tool_calls:
            text = (message.get("content") or "").strip()
            trace.record(message=text[:400], elapsed_seconds=round(elapsed, 2))
            idle_turns += 1
            if idle_turns > IDLE_TURNS_BEFORE_NUDGE:
                outcome = "no_tool_calls"
                notes.append(
                    "Agent stopped calling tools without submitting; its last draft was used."
                )
                break
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Continue by calling a tool. When the prompt is finished, call validate "
                        "and then submit. Do not reply with the prompt as plain text."
                    ),
                }
            )
            continue
        idle_turns = 0
        for call in tool_calls:
            name, arguments = _parse_call(call)
            if on_tool is not None:
                try:
                    on_tool(name, arguments)
                except Exception:
                    pass
            result = toolbox.call(name, arguments)
            trace.record(
                tool=name,
                arguments=arguments,
                result_preview=result,
                elapsed_seconds=round(time.monotonic() - started, 2),
            )
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id", ""),
                    "name": name,
                    "content": result,
                }
            )
        if context.submitted:
            outcome = "submitted"
            break
    else:
        notes.append(f"Agent reached its {max_turns}-turn limit without submitting.")
    prompt, fallback_note = _choose_result(context)
    if fallback_note:
        notes.append(fallback_note)
    trace.outcome = outcome
    trace.note = "; ".join(notes)
    result = AgentResult(prompt=prompt, trace=trace, notes=notes, outcome=outcome)
    if prompt:
        result.validation = context.validate_prompt(prompt)
    return result
def _parse_call(call: dict) -> tuple[str, dict]:
    function = call.get("function") or {}
    name = function.get("name") or call.get("name") or ""
    raw = function.get("arguments", call.get("arguments", "{}"))
    if isinstance(raw, dict):
        return name, raw
    try:
        parsed = json.loads(raw or "{}")
    except (TypeError, json.JSONDecodeError):
        return name, {}
    return name, parsed if isinstance(parsed, dict) else {}
def _choose_result(context: AgentContext) -> tuple[str, str]:
    if context.submitted:
        return context.submitted, ""
    if not context.candidates:
        return "", (
            "WARNING: the agent produced no prompt at all. Switch the engine to pipeline, or "
            "use a model with more reliable tool calling."
        )
    errors, prompt = min(context.candidates, key=lambda item: item[0])
    return prompt, (
        f"NOTE: the agent never submitted, so its best validated draft was used "
        f"({errors} error(s) out of {len(context.candidates)} attempt(s))."
    )
