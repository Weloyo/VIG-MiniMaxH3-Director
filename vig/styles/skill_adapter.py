from __future__ import annotations
import functools
import re
from .. import guides
from .schema import (
    CameraStyle,
    CompositionStyle,
    DirectorStyle,
    EditingStyle,
    LightingStyle,
    MusicStyle,
    PaletteStyle,
    PromptBias,
    SoundStyle,
)
_STYLE_HEADING_HINTS = (
    "style lock",
    "style rules",
    "visual style",
    "core principles",
    "operating principles",
    "creative targets",
    "typography rules",
    "motion priority",
    "visual depth",
)
_SKIP_HEADING_HINTS = ("step ", "gate", "canvas", "intake", "tool coverage", "hub compatibility")
_BULLET_RE = re.compile(r"^\s*[-*]\s+(.+?)\s*$", re.MULTILINE)
_LABELLED_RE = re.compile(r"^([A-Z][A-Za-z /&-]{2,40}):\s*(.+)$")
_NEGATIVE_RE = re.compile(
    r"^\s*(?:negative[^:]*|avoid|do not use)[^:]*:\s*(.+)$", re.MULTILINE | re.IGNORECASE
)
MAX_CLAUSES = 8
MAX_AVOID = 6
MIN_USABLE_CLAUSES = 2
_IMPERATIVE_RE = re.compile(
    r"^(generate|build|create|produce|deliver|return|render the|ask|confirm|collect|"
    r"upload|call|select|choose|proceed|do not proceed|always ask|never ask|reuse the|"
    r"write the|save|export|check|verify|apply the tool)\b",
    re.IGNORECASE,
)
_WORKFLOW_NOUNS = (
    "canvas",
    "choice card",
    "confirmation card",
    "storyboard file",
    "shot table",
    "panel sheet",
    "4-panel",
    "node",
    "step ",
    "gate",
    "tool",
    "upload",
    "user provides",
    "the skill",
    "video model",
    "image model",
    "aspect ratio option",
    "deliverable",
    "artifact",
    "anchor photo",
    "storyboard copy",
)
_PRODUCTION_RULE_RE = re.compile(
    r"\b(?:do not|does not|must|should|never|always)\s+"
    r"(?:create|use|generate|include|add|merge|deliver|export|render|place|write|treat)\b",
    re.IGNORECASE,
)
_CRAFT_LABELS = (
    "rendering",
    "render",
    "character design",
    "proportion",
    "hair",
    "fur",
    "skin",
    "material",
    "texture",
    "acting",
    "motion style",
    "movement",
    "emotional range",
    "lighting",
    "light",
    "shadow",
    "colour",
    "color",
    "palette",
    "grade",
    "composition",
    "framing",
    "depth",
    "typography",
    "type",
    "camera",
    "shot",
    "style",
    "look",
    "medium",
    "surface",
    "edge",
)
_CRAFT_VOCAB = (
    "occluder",
    "plane",
    "depth",
    "parallax",
    "composition",
    "silhouette",
    "texture",
    "grain",
    "shadow",
    "highlight",
    "palette",
    "colour",
    "color",
    "lighting",
    "lit ",
    "backdrop",
    "foreground",
    "background",
    "midground",
    "frame",
    "lens",
    "focal",
    "contrast",
    "saturation",
    "material",
    "surface",
    "cutout",
    "paper",
    "render",
    "anatomy",
    "pose",
    "gesture",
    "expression",
)
def _is_craft_clause(text: str) -> bool:
    if len(text) < 12 or len(text) > 300:
        return False
    if _IMPERATIVE_RE.match(text):
        return False
    lowered = text.lower()
    if any(noun in lowered for noun in _WORKFLOW_NOUNS):
        return False
    if "the user" in lowered or "you may ask" in lowered:
        return False
    if _PRODUCTION_RULE_RE.search(text):
        return False
    return any(word in lowered for word in _CRAFT_VOCAB)
def _is_craft_label(label: str) -> bool:
    lowered = label.lower()
    return any(term in lowered for term in _CRAFT_LABELS)
_FIELD_HINTS = {
    "palette": ("colour", "color", "palette", "grade"),
    "lighting": ("lighting", "light", "shadow"),
    "camera": ("camera", "motion style", "shot", "framing", "composition"),
    "visual_style": ("rendering", "render", "visual style", "medium", "look"),
}
def _classify(label: str) -> str | None:
    lowered = label.lower()
    for field, hints in _FIELD_HINTS.items():
        if any(hint in lowered for hint in hints):
            return field
    return None
def _style_sections(skill) -> list[str]:
    out = []
    for heading in skill.sections():
        lowered = heading.lower()
        if any(hint in lowered for hint in _SKIP_HEADING_HINTS):
            continue
        if any(hint in lowered for hint in _STYLE_HEADING_HINTS):
            section = skill.section(heading)
            if section:
                out.append(section)
    return out
def _clean_clause(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip().rstrip(".")
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    return text
def adapt(skill) -> DirectorStyle | None:
    sections = _style_sections(skill)
    if not sections:
        return None
    body = "\n\n".join(sections)
    clauses: list[str] = []
    typed: dict[str, list[str]] = {}
    for bullet in _BULLET_RE.findall(body):
        bullet = _clean_clause(bullet)
        if not bullet or len(bullet) > 400:
            continue
        labelled = _LABELLED_RE.match(bullet)
        if labelled:
            label, value = labelled.group(1), _clean_clause(labelled.group(2))
            if not _is_craft_label(label):
                continue
            field = _classify(label)
            if field:
                typed.setdefault(field, []).append(value)
                continue
            clauses.append(f"{label.lower()}: {value}")
        elif _is_craft_clause(bullet):
            clauses.append(bullet)
    avoid = []
    for raw in _NEGATIVE_RE.findall(body):
        avoid.extend(
            _clean_clause(part) for part in re.split(r",|;", raw) if len(_clean_clause(part)) > 2
        )
    signals = len(clauses) + sum(len(v) for v in typed.values())
    if signals < MIN_USABLE_CLAUSES:
        return None
    visual_style = typed.get("visual_style", [""])[0] or _title(skill.skill_id).lower()
    return DirectorStyle(
        id=skill.skill_id,
        display_name=_title(skill.skill_id),
        origin="skill",
        visual_style=_clean_clause(visual_style)[:160],
        camera=CameraStyle(
            moves=[],
            shot_scale_bias=_first(typed.get("camera"), 120),
        ),
        lighting=LightingStyle(sources=[_first(typed.get("lighting"), 160)] if typed.get("lighting") else []),
        palette=PaletteStyle(grade=_first(typed.get("palette"), 160)),
        composition=CompositionStyle(),
        editing=EditingStyle(avg_shot_len_s=4.0),
        sound=SoundStyle(ambience_bias="", music=MusicStyle()),
        prompt_bias=PromptBias(
            must_include=clauses[:MAX_CLAUSES],
            avoid=avoid[:MAX_AVOID],
        ),
        notes=f"Adapted from the bundled skill {skill.skill_id!r}; craft clauses only, "
        "its STEP workflow does not apply to a ComfyUI node.",
    )
def _first(values: list[str] | None, limit: int) -> str:
    return values[0][:limit] if values else ""
def _title(skill_id: str) -> str:
    words = skill_id.replace("-", " ").replace("generator", "").replace("explainer", "").split()
    return " ".join(w.capitalize() for w in words) or skill_id
@functools.lru_cache(maxsize=1)
def adapted_styles() -> tuple[DirectorStyle, ...]:
    out = []
    for skill in guides.style_skills():
        try:
            style = adapt(skill)
        except Exception as exc:
            print(f"[VIG MiniMax H3 Director] could not adapt skill {skill.skill_id!r}: {exc}")
            continue
        if style is not None:
            out.append(style)
    return tuple(out)
