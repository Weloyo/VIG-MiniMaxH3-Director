from __future__ import annotations
import re
from .. import h3_spec as spec
from ..types import ClipPlan, DialogueLine, ShotPlan
DIALOGUE_PLACEHOLDER = "{{DIALOGUE_%d}}"
PLACEHOLDER_RE = re.compile(r"\{\{DIALOGUE_(\d+)\}\}")
_D_BLOCK_RE = re.compile(r"<d>.*?</d>", re.DOTALL)
_INJECTED_SHOT_RE = re.compile(r"\[Shot\s+\d+\]\s*")
_INJECTED_TIME_RE = re.compile(r"\bAt\s+[\d]{1,3}(?::[\d]{2})+\.[\d]{1,3}\s*,?\s*")
_INJECTED_FIELD_RE = re.compile(
    r"\b(?:integrated_multimodal_description|overall_soundscape|non_diegetic_music"
    r"|subject_definitions|summary|retention_analysis|detailed_description)\s*:\s*"
)
def sanitize_prose(text: str) -> str:
    if not text:
        return ""
    text = _INJECTED_SHOT_RE.sub("", text)
    text = _INJECTED_TIME_RE.sub("", text)
    text = _INJECTED_FIELD_RE.sub("", text)
    for motion in sorted(spec.CAMERA_VERB_PHRASES, key=len, reverse=True):
        phrase = spec.CAMERA_VERB_PHRASES[motion]
        text = re.sub(
            rf"\b(?:(?P<the>[Tt]he)\s+camera\s+(?:(?:does|performs|uses)\s+)?"
            rf"|(?:does|performs|uses)\s+){re.escape(motion)}\b",
            lambda match, phrase=phrase: f"{match.group('the') or 'the'} camera {phrase}",
            text,
        )
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    return text.strip()
_SPEECH_VERB = (
    r"(?:says?|said|exclaims?|adds?|repl(?:ies|ied|y)|whispers?|shouts?|murmurs?|"
    r"announces?|states?|asks?|asked|calls?(?: out)?|answers?|mutters?|responds?|"
    r"insists?|warns?|snaps?|barks?|hisses|breathes|yells?|cries(?: out)?|"
    r"continues|begins|remarks?|observes?|declares?|orders?|pleads?)"
)
_PLACEHOLDER_AS_NOUN_RE = re.compile(
    r"\s*\b(?:when|as|while)\s+(\{\{DIALOGUE_\d+\}\})\s+is\s+"
    r"(?:spoken|said|heard|delivered|uttered)\b\.?",
)
_PLACEHOLDER_AS_OBJECT_RE = re.compile(
    r"\b(?:the |a )?(?:line|phrase|words?)\s+(\{\{DIALOGUE_\d+\}\})"
)
_LEADIN_CONJUNCTION_RE = re.compile(
    rf"[,;]?\s+(?:and|then|before)\s+(?:\w+\s+)?{_SPEECH_VERB}\s*[:,]?\s*(?=\{{\{{DIALOGUE_)",
    re.IGNORECASE,
)
_CLAUSE_CHAR = r"(?:(?!\s+(?:and|then|before)\b)[^.!?;:,{}])"
_LEADIN_CLAUSE_RE = re.compile(
    r"(?:^|(?<=[.!?;])|(?<=,)|(?P<conj>\s+(?:and|then|before)\b))"
    r"(?P<gap>\s*)"
    r"(?=[^.!?;:,{}]*[A-Za-z])"
    r"(?:"
    + _CLAUSE_CHAR + r"{1,120}:"
    + r"|"
    + _CLAUSE_CHAR + r"{0,120}\b" + _SPEECH_VERB + r"\s*,"
    + r")\s*"
    r"(?=\{\{DIALOGUE_)",
    re.IGNORECASE,
)
def _drop_leadin(match: re.Match) -> str:
    return ". " if match.group("conj") else match.group("gap")
def _repair_placeholder_grammar(prose: str) -> str:
    prose = _PLACEHOLDER_AS_NOUN_RE.sub(r". \1", prose)
    prose = _PLACEHOLDER_AS_OBJECT_RE.sub(r"\1", prose)
    prose = _LEADIN_CONJUNCTION_RE.sub(". ", prose)
    prose = _LEADIN_CLAUSE_RE.sub(_drop_leadin, prose)
    prose = re.sub(r"\s+\b(?:and|then|before)\s*\.", ".", prose)
    return re.sub(r"\s{2,}", " ", prose).strip()
def render_dialogue(line: DialogueLine) -> str:
    speaker = f"({line.speaker})"
    if line.voiceover:
        head = f"{speaker} {spec.VOICEOVER_PHRASE}"
        tail = f" while their {spec.VOICEOVER_LIPS_HINT}."
    else:
        verb = line.delivery.strip() or "says"
        head = f"{speaker} {verb}"
        tail = ""
    return f"{head}: {line.as_tag()}{tail}"
def _tidy_around_dialogue(text: str) -> str:
    def tidy(chunk: str) -> str:
        chunk = re.sub(r"\s{2,}", " ", chunk)
        return re.sub(r"\s+\.", ".", chunk)
    out: list[str] = []
    cursor = 0
    for block in _D_BLOCK_RE.finditer(text):
        out.append(tidy(text[cursor : block.start()]))
        out.append(block.group(0))
        cursor = block.end()
    out.append(tidy(text[cursor:]))
    return "".join(out)
def _drop_doubled_terminator(match: re.Match) -> str:
    spoken = match.group(1).rstrip()
    if spoken.endswith((".", "!", "?")):
        return f"<d>{match.group(1)}</d>"
    return match.group(0)
_CLOSING_TERMINATOR_RE = re.compile(r"<d>(.*?)</d>\s*\.(?=\s|$)", re.DOTALL)
def splice_dialogue(prose: str, lines: list[DialogueLine]) -> str:
    used: set[int] = set()
    def _swap(match: re.Match) -> str:
        idx = int(match.group(1)) - 1
        if 0 <= idx < len(lines):
            used.add(idx)
            return render_dialogue(lines[idx])
        return ""
    prose = _repair_placeholder_grammar(prose)
    out = PLACEHOLDER_RE.sub(_swap, prose)
    missing = [line for i, line in enumerate(lines) if i not in used]
    if missing:
        tail = " ".join(render_dialogue(line) for line in missing)
        out = f"{out.rstrip()} {tail}"
    out = _CLOSING_TERMINATOR_RE.sub(_drop_doubled_terminator, out)
    return _tidy_around_dialogue(out).strip()
def render_shot(shot: ShotPlan, timestamp: str | None, opening: str = "") -> str:
    marker = f"[Shot {shot.index}] {opening}".rstrip() if opening else f"[Shot {shot.index}]"
    body = splice_dialogue(shot.prose.strip(), shot.dialogue)
    if timestamp is None:
        return f"{marker} {body}".strip()
    lowered = body.lower()
    if any(p in lowered[:80] for p in spec.CUT_PHRASES):
        return f"{marker} At {timestamp}, {body}".strip()
    cut = shot.cut_phrase.rstrip()
    if not cut.endswith(("to", "into")):
        cut = f"{cut} to"
    return f"{marker} At {timestamp}, {cut} a new framing. {body}".strip()
def render_description(clip: ClipPlan, opening: str = "") -> str:
    stamps = {s.index: s.timestamp for s in clip.timing.shots}
    blocks = [
        render_shot(shot, stamps.get(shot.index), opening if i == 0 else "")
        for i, shot in enumerate(clip.shots)
    ]
    return " ".join(b for b in blocks if b).strip()
def _field(name: str, body: str, own_line: bool, default: str = spec.NA_VALUE) -> str:
    body = (body or "").strip() or default
    return f"{name}:\n{body}" if own_line else f"{name}: {body}"
def render_prompt(clip: ClipPlan) -> str:
    mode = clip.mode.lower()
    if mode == spec.REF2VA:
        return _render_ref(clip)
    return _render_base(clip)
def _render_base(clip: ClipPlan) -> str:
    style = clip.style_opening.strip().rstrip(".,")
    opening = f"{style}." if style else ""
    description = render_description(clip, opening)
    if opening and not clip.shots:
        description = f"[Shot 1] {opening}"
    parts = [
        _field(spec.BASE_FIELDS[0], description, own_line=False),
        _field(spec.BASE_FIELDS[1], clip.soundscape, own_line=False, default=""),
        _field(spec.BASE_FIELDS[2], clip.music, own_line=False),
    ]
    body = "\n\n".join(parts)
    instruction = spec.instruction_for(
        mode=clip.mode.lower(),
        last_shot=clip.shots[-1].index if clip.shots else 1,
        duration=f"{clip.duration:.2f}",
    )
    return f"{instruction}\n\n{body}" if instruction else body
def _render_ref(clip: ClipPlan) -> str:
    description = render_description(clip)
    if clip.style_opening:
        opening = clip.style_opening.strip()
        if not opening.endswith("."):
            opening += "."
        description = f"{opening}\n{description}"
    parts = [
        _field("subject_definitions", clip.subject_definitions, own_line=True),
        _field("summary", clip.summary, own_line=True),
        _field("retention_analysis", clip.retention_analysis, own_line=True),
        _field("detailed_description", description, own_line=True),
        _field("overall_soundscape", clip.soundscape, own_line=True, default=""),
        _field("non_diegetic_music", clip.music, own_line=True),
    ]
    return "\n\n".join(parts)
