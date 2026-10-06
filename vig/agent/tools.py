from __future__ import annotations
import json
from dataclasses import dataclass, field
from typing import Any, Callable
from .. import guides
from .. import h3_spec as spec
from ..llm.prompts import NO_SOFTENING, cast_block
from ..prompt.validator import ValidationResult, validate
from ..styles import library
from ..styles.schema import DirectorStyle, opening_budget
from ..timing import Timing, resolve_timing
from ..types import RefBundle
class ToolError(RuntimeError):
    pass
@dataclass
class AgentContext:
    story: str
    mode: str
    duration_seconds: float
    style: DirectorStyle
    refs: RefBundle | None = None
    dialogue: list = field(default_factory=list)
    cast: list = field(default_factory=list)
    shot_count: int | None = None
    allow_music: bool = True
    skills: list = field(default_factory=list)
    extra_instruction: str = ""
    resolved_choices: dict[str, Any] = field(default_factory=dict)
    candidates: list[tuple[int, str]] = field(default_factory=list)
    submitted: str | None = None
    refusals: int = 0
    def resolved_timing(self, shot_count: int | None = None) -> Timing:
        return resolve_timing(
            self.duration_seconds,
            shot_count=shot_count or self.shot_count,
            avg_shot_seconds=self.style.editing.avg_shot_len_s,
        )
    def validate_prompt(self, prompt: str) -> ValidationResult:
        return validate(
            prompt,
            mode=self.mode,
            duration=self.resolved_timing().duration,
            available_labels=self.refs.available_labels() if self.refs else None,
            expected_dialogue=[d.text for d in self.dialogue],
        )
TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "list_skills",
            "description": "List the bundled MiniMax H3 skills with a one-line description of each.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_skill",
            "description": (
                "Read a skill's instructions. Pass a section heading to read only that part; "
                "omit it for the whole document. A read longer than one window comes back "
                "truncated, with the offset to continue from."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_id": {"type": "string"},
                    "section": {"type": "string"},
                    "offset": {
                        "type": "integer",
                        "description": "Resume a truncated read at this character offset.",
                    },
                },
                "required": ["skill_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_reference",
            "description": (
                "Read a reference file belonging to a skill. Pass a section heading -- a "
                "number like '4.4' or a title fragment like 'Case 1' both work -- to read "
                "only that part, because these files are several reads long. The official "
                "prompt guides are h3-prompt-writing/base-en.txt (T2VA, I2VA, FL2VA, L2VA) "
                "and ref-en.txt (Ref2VA)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_id": {"type": "string"},
                    "filename": {"type": "string"},
                    "section": {"type": "string"},
                    "offset": {
                        "type": "integer",
                        "description": "Resume a truncated read at this character offset.",
                    },
                },
                "required": ["skill_id", "filename"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_timing",
            "description": (
                "The clip's real frame count, duration and the exact timestamp for each shot. "
                "Never compute these yourself: the duration snaps to the model's frame grid, so "
                "the requested seconds and the actual seconds differ."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "shot_count": {
                        "type": "integer",
                        "description": "How many shots to lay out. Omit to use the style's rhythm.",
                    }
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_refs",
            "description": (
                "The reference material and the exact <Picture i>/<Video k>/<Audio j> labels to "
                "cite. Use these numbers verbatim; they are assigned by the tokenizer, not chosen."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_style",
            "description": "The visual style to shoot in, as concrete craft decisions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "style_id": {
                        "type": "string",
                        "description": "Omit for the style the user selected.",
                    }
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "validate",
            "description": (
                "Check a draft prompt against the official format. Returns each violation with "
                "the guide's own wording for the rule it breaks. Call this before submitting."
            ),
            "parameters": {
                "type": "object",
                "properties": {"prompt": {"type": "string"}},
                "required": ["prompt"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "submit",
            "description": (
                "Submit the finished prompt. It is validated again here: a prompt that still "
                "breaks the format is handed back with its violations for you to fix and "
                "submit again. Ends the task once it is accepted."
            ),
            "parameters": {
                "type": "object",
                "properties": {"prompt": {"type": "string"}},
                "required": ["prompt"],
                "additionalProperties": False,
            },
        },
    },
]
TOOL_NAMES = tuple(entry["function"]["name"] for entry in TOOL_SCHEMAS)
MAX_READ_CHARS = 6000
SUBMIT_REFUSALS = 3
class ToolBox:
    def __init__(self, context: AgentContext) -> None:
        self.context = context
        self._handlers: dict[str, Callable[..., Any]] = {
            "list_skills": self.list_skills,
            "read_skill": self.read_skill,
            "read_reference": self.read_reference,
            "get_timing": self.get_timing,
            "get_refs": self.get_refs,
            "get_style": self.get_style,
            "validate": self.validate,
            "submit": self.submit,
        }
    def call(self, name: str, arguments: dict) -> str:
        handler = self._handlers.get(name)
        if handler is None:
            return json.dumps(
                {"error": f"unknown tool {name!r}", "available": list(self._handlers)}
            )
        try:
            result = handler(**(arguments or {}))
        except TypeError as exc:
            return json.dumps({"error": f"wrong arguments for {name}: {exc}"})
        except ToolError as exc:
            return json.dumps({"error": str(exc)})
        except Exception as exc:
            return json.dumps({"error": f"{name} failed: {exc}"})
        return result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
    def list_skills(self) -> dict:
        return {"skills": _catalogue(self.context)}
    def read_skill(self, skill_id: str, section: str = "", offset: int = 0) -> dict:
        allowed = {entry["id"] for entry in _catalogue(self.context)}
        if skill_id not in allowed:
            if skill_id in guides.STYLE_SKILLS:
                raise ToolError(
                    f"{skill_id} is not available: what it briefs -- the genre and the "
                    "finish -- is what the director's STYLE profile already says, and "
                    "two briefs on one question contradict each other inside a single "
                    "prompt. The style for this clip is in your instructions above."
                )
            raise ToolError(
                f"{skill_id} is not one of the skills this clip may read. "
                f"The director narrowed it to: {', '.join(sorted(allowed))}."
            )
        try:
            skill = guides.get_skill(skill_id)
        except KeyError as exc:
            raise ToolError(str(exc)) from exc
        body = _narrow(skill.body(), section, f"skill {skill_id}")
        return {
            "skill_id": skill_id,
            "section": section or "(whole document)",
            "sections_available": list(skill.sections()),
            "references_available": skill.reference_files(),
            **_chunk(body, offset, {"skill_id": skill_id, "section": section}),
        }
    def read_reference(
        self, skill_id: str, filename: str, section: str = "", offset: int = 0
    ) -> dict:
        filename = filename.split("/")[-1].split("\\")[-1]
        try:
            skill = guides.get_skill(skill_id)
            whole = skill.reference(filename)
        except (KeyError, FileNotFoundError) as exc:
            raise ToolError(str(exc)) from exc
        body = _narrow(whole, section, f"{skill_id}/{filename}")
        resume = {"skill_id": skill_id, "filename": filename, "section": section}
        return {
            "skill_id": skill_id,
            "filename": filename,
            "section": section or "(whole file)",
            "sections_available": list(guides.sections_of(whole)),
            **_chunk(body, offset, resume),
        }
    def get_timing(self, shot_count: int | None = None) -> dict:
        timing = self.context.resolved_timing(shot_count)
        data = timing.as_dict()
        data["instruction"] = (
            "Shot 1 carries no timestamp. Every later shot opens with 'At <timestamp>,' using "
            "the value given here. Do not round them and do not invent others."
        )
        if not timing.in_trained_range:
            data["warning"] = (
                f"{timing.frame_count} frames is outside the model's trained range; quality "
                "there is untested."
            )
        return data
    def get_refs(self) -> dict:
        refs = self.context.refs
        if refs is None or refs.is_empty():
            return {
                "labels": [],
                "note": "No references are connected. Do not cite <Picture>, <Video> or <Audio>.",
            }
        return {
            "labels": [
                {
                    "tag": label.tag,
                    "kind": label.kind,
                    "description": label.description,
                    "cited_in_the_script_as": f"@{label.cite}" if label.cite else "",
                    "facts": label.facts,
                }
                for label in refs.labels
            ],
            "counts": refs.available_labels(),
            "note": (
                "These ordinals come from the tokenizer's presentation order, not from the "
                "order the inputs were connected. Cite them exactly."
            ),
        }
    def get_style(self, style_id: str = "") -> dict:
        style = library.get(style_id) if style_id else self.context.style
        budget = opening_budget(self.context.resolved_timing().duration)
        return {
            "id": style.id,
            "visual_style": style.visual_style,
            "opening_sentence": style.style_opening(budget),
            "clauses": style.render_clauses(),
            "camera_moves": style.camera.moves,
            "amplitude": style.camera.amplitude,
            "speed": style.camera.speed,
            "average_shot_seconds": style.editing.avg_shot_len_s,
            "ambience": style.sound.ambience_bias,
            "music": style.music_sentence(),
            "avoid": style.prompt_bias.avoid,
            "note": (
                "Describe the craft, never the name of a person or studio. The guide rejects "
                "abstract phrasing such as 'in the style of'."
            ),
        }
    def validate(self, prompt: str) -> dict:
        prompt = _prompt_argument("validate", prompt)
        context = self.context
        result = context.validate_prompt(prompt)
        context.candidates.append((len(result.errors), prompt))
        payload = result.as_dict()
        if result.errors:
            payload["guide_says"] = guides.quotes_for([v.code for v in result.errors])
        else:
            payload["next_step"] = "No errors. Call submit with this prompt."
        return payload
    def submit(self, prompt: str) -> dict:
        prompt = _prompt_argument("submit", prompt)
        context = self.context
        result = context.validate_prompt(prompt)
        context.candidates.append((len(result.errors), prompt))
        if result.errors and context.refusals < SUBMIT_REFUSALS:
            context.refusals += 1
            remaining = SUBMIT_REFUSALS - context.refusals
            payload = result.as_dict()
            payload["accepted"] = False
            payload["guide_says"] = guides.quotes_for([v.code for v in result.errors])
            payload["next_step"] = (
                f"Not accepted: {len(result.errors)} error(s) remain. Fix them and call submit "
                f"again. After {remaining} more attempt(s) the prompt is taken as it stands and "
                "the run is reported as breaking the guide."
            )
            return payload
        context.submitted = prompt
        note = "Prompt received. The task is complete."
        if result.errors:
            note = (
                f"Prompt received with {len(result.errors)} unfixed error(s); it is reported "
                "as breaking the guide rather than corrected."
            )
        return {"accepted": True, "note": note}
def _prompt_argument(tool: str, value: Any) -> str:
    if not isinstance(value, str):
        raise ToolError(
            f"{tool} expects prompt to be a string, got {type(value).__name__}; "
            "send the prompt text itself"
        )
    if not value.strip():
        raise ToolError(f"{tool} expects a prompt; write it first, then call {tool} again")
    return value
def _narrow(body: str, section: str, where: str) -> str:
    if not section:
        return body
    found = guides.section_of(body, section)
    if found is None:
        raise ToolError(
            f"{where} has no section matching {section!r}; available: "
            f"{list(guides.sections_of(body))[:16]}"
        )
    return found
def _chunk(body: str, offset: int = 0, resume: dict | None = None) -> dict:
    try:
        offset = max(0, int(offset))
    except (TypeError, ValueError):
        offset = 0
    if body and offset >= len(body):
        raise ToolError(
            f"offset {offset} is past the end of this document ({len(body)} characters)"
        )
    window = body[offset : offset + MAX_READ_CHARS]
    end = offset + len(window)
    if end >= len(body):
        return {"content": window, "truncated": False}
    same = ", ".join(f"{key}={value!r}" for key, value in (resume or {}).items() if value)
    return {
        "content": window,
        "truncated": True,
        "next_offset": end,
        "note": (
            f"Characters {offset}-{end} of {len(body)}. Call the same tool again with "
            f"offset={end}" + (f", {same}" if same else "") + " for the next part, or pass "
            "a section heading to go straight to the part you need."
        ),
    }
def _catalogue(context) -> list:
    chosen = [str(x) for x in (getattr(context, "skills", None) or []) if str(x).strip()]
    if not chosen:
        return guides.list_skills()
    keep = set(chosen) | {guides.DIRECTION_SKILL, guides.PROMPT_WRITING_SKILL}
    return [entry for entry in guides.list_skills() if entry["id"] in keep]
def system_prompt(context: AgentContext) -> str:
    catalogue = "\n".join(
        f"- {entry['id']}: {entry['description']}" for entry in _catalogue(context)
    )
    choices = (
        "\n".join(f"- {k}: {v}" for k, v in context.resolved_choices.items())
        or "- (none)"
    )
    if context.dialogue:
        lines = "\n".join(
            f'{i}. [{d.language}] "{d.text}"' + (" (off-screen voiceover)" if d.voiceover else "")
            for i, d in enumerate(context.dialogue, 1)
        )
        dialogue_block = f"""
DIALOGUE THAT MUST APPEAR, CHARACTER FOR CHARACTER:
{lines}

Each line goes inside <d>[Language] ... </d> with the speaker ID and delivery outside the tags.
Do not translate, rephrase, re-punctuate or merge them. Every line must appear exactly once.
"""
    else:
        dialogue_block = """
NO DIALOGUE WAS SUPPLIED.
Write <d> lines only if the story has someone speaking, singing, rapping, chanting or
reading aloud. If it does, write words that person would plausibly say -- your own words,
in the language the story is written in, and short enough for the clip to hold. The tag
names that language in English -- <d>[Russian] ... </d> for Russian words -- and holds
nothing but the tag and the words themselves.
Never put the director's description into a <d> tag: the story says what the camera sees,
not what the mouth says. "A man raps" is a description; the words he raps are lines you
write. If nobody in the story speaks, write no <d> tags at all.
"""
    cast_wording = f"\n{cast_block(context.cast, is_first=True)}\n" if context.cast else ""
    if context.cast and context.mode == spec.REF2VA:
        cast_wording += (
            "\nIn this mode that wording belongs in subject_definitions: a <Subject N> who is "
            "one of the cast above is defined in the cast's own words, followed by the picture "
            'it comes from -- "<Subject 1> is a young man with dark curly hair and a blue denim '
            'jacket, taken from <Picture 1>". That line is what H3 preserves, so a definition '
            "that names nothing to preserve preserves nothing.\n"
            "Every one of those lines BEGINS with <Subject N> and nothing else. The cast name "
            "is who they are, not what the line is called: it belongs inside the sentence, "
            "never in front of it.\n"
        )
    style = context.style
    style_block = f"""
SHOOT IT THIS WAY:
- opening style sentence, and it opens [Shot 1] as it stands -- do not extend it, the rest of
  the shot is what happens: {style.style_opening(opening_budget(context.resolved_timing().duration))}
- camera moves this style uses: {", ".join(style.camera.moves) or "no fixed preference"}
- amplitude / speed: {style.camera.amplitude or "unmodified"} / {style.camera.speed or "unmodified"}
- ambience TINT: {style.sound.ambience_bias or "whatever the location gives"} -- a colour for
  the room tone, never the soundscape itself. overall_soundscape names what THIS location
  sounds like (the script's place: its machines, weather, crowd, footsteps, fabric, voices
  without words); the tint only colours it, and copying this line into the field is wrong.
- score: {style.music_sentence()}
- avoid: {", ".join(style.prompt_bias.avoid) or "nothing in particular"}
Describe the craft, never the name of a person or studio.
"""
    extra_block = (
        f"\nTHE DIRECTOR'S STANDING INSTRUCTION, OUTRANKING THE STYLE:\n"
        f"{context.extra_instruction.strip()}\n"
        if context.extra_instruction.strip()
        else ""
    )
    return f"""You are writing a MiniMax H3 video prompt.

TASK MODE: {context.mode}
THE USER'S IDEA:
{context.story.strip() or "(empty)"}
{cast_wording}{dialogue_block}{style_block}{extra_block}
Work like this:
1. Call read_skill("{guides.DIRECTION_SKILL}") before writing anything. That is the operating
   manual for this run: the format rules you are checked against, the camera and sound
   vocabularies, and the preflight list. It is one read long. In {spec.REF2VA} also call
   read_reference("{guides.DIRECTION_SKILL}", "ref2va.md"); in the other modes
   read_reference("{guides.DIRECTION_SKILL}", "base-modes.md", section="<your mode>") carries a
   worked example that already passes the check.
2. Call get_timing and get_refs. Never work out timings yourself and never invent a reference
   label -- both come from those tools and both are exact. The style is already given below;
   get_style is only for looking up a different one.
3. Write the prompt in full, including the literal field names the guide requires.
4. Call validate. Fix exactly what it reports, leave the rest alone, and validate again.
5. Call submit. Submit checks the prompt too: if anything is still broken it comes back with
   the violations instead of being accepted, and you fix it and submit again. After
   {SUBMIT_REFUSALS} refusals the prompt is taken as it stands and the run is reported as
   breaking the guide, so use the attempts rather than resubmitting the same text.

One tool call per message. Asking for several at once is how a call arrives with the next
call's text inside its arguments, and the turn is spent on an error instead of an answer.

MiniMax's own wording is the h3-prompt-writing skill, reachable a section at a time -- e.g.
read_reference("h3-prompt-writing", "base-en.txt", section="4.4") for speakers and dialogue.

AVAILABLE SKILLS (read one with read_skill when it suits the task):
{catalogue}

DECISIONS ALREADY MADE BY THE USER -- treat these as settled and do not ask about them:
{choices}

Some skills are written as interactive workflows that would normally ask the user questions.
You cannot ask anyone anything. Where a skill calls for a choice that is not listed above,
make it yourself and state what you chose in your final message.

The prompt body is written in English regardless of the language the idea is written in.
Translate what the idea says; never transliterate it. A common noun stays a common noun --
"мужчина" is "a man", not a character called "Muzhchina" -- and a person the idea does not
name has no name in the prompt either.
Dialogue keeps its original language inside its tags.

{NO_SOFTENING}"""
