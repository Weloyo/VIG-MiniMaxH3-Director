from __future__ import annotations
import functools
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
PACKAGE_ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = PACKAGE_ROOT / "skills"
OWN_SKILLS_DIR = PACKAGE_ROOT / "vig_skills"
USER_SUBDIR = "vig_h3_director"
def user_skills_dir() -> Path:
    from . import paths
    return paths.user_root() / "skills"
DOCS_DIR = PACKAGE_ROOT / "docs"
RULES_INDEX_PATH = DOCS_DIR / "rules_index.json"
PROMPT_WRITING_SKILL = "h3-prompt-writing"
DIRECTION_SKILL = "h3-direction"
TRANSFER_SKILL = "h3-reference-transfer"
STYLE_SKILLS = (
    "3d-animation-short-generator",
    "brand-promo-video-generator",
    "co-op-game-intro-generator",
    "handdrawn-live-video-generator",
    "minimalist-product-ad-generator",
    "music-video-subtitle-generator",
    "paper-collage-explainer-generator",
    "papercraft-stop-motion-explainer",
)
BASE_GUIDE = "base-en.txt"
REF_GUIDE = "ref-en.txt"
_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
def _parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    match = _FRONTMATTER_RE.match(text)
    if match is None:
        return {}, text
    meta: dict[str, str] = {}
    key: str | None = None
    in_block = False
    for line in match.group(1).splitlines():
        if not line.strip():
            continue
        indented = line[0] in " \t"
        if indented and key:
            meta[key] = f"{meta[key]} {line.strip()}".strip()
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        in_block = value in ("|", ">", "|-", ">-", "|+", ">+")
        meta[key] = "" if in_block else value.strip("\"'")
    return meta, text[match.end() :]
def _first_sentence(text: str, limit: int = 200) -> str:
    text = " ".join(text.split())
    if not text:
        return ""
    match = re.search(r"(?<=[.!?])\s", text)
    head = text[: match.start() + 1] if match else text
    if len(head) > limit:
        head = head[:limit].rsplit(" ", 1)[0] + "..."
    return head
def sections_of(text: str) -> dict[str, tuple[int, int]]:
    marks = [(m.start(), m.group(2)) for m in _HEADING_RE.finditer(text)]
    out: dict[str, tuple[int, int]] = {}
    for i, (start, title) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        out[title] = (start, end)
    return out
def section_of(text: str, title: str) -> str | None:
    sections = sections_of(text)
    if title in sections:
        start, end = sections[title]
        return text[start:end].strip()
    lowered = title.lower()
    for name, (start, end) in sections.items():
        if lowered in name.lower():
            return text[start:end].strip()
    return None
@dataclass
class Skill:
    skill_id: str
    path: Path
    name: str = ""
    description: str = ""
    compatibility: str = ""
    _body: str | None = field(default=None, repr=False)
    _sections: dict[str, tuple[int, int]] | None = field(default=None, repr=False)
    @property
    def is_prompt_authority(self) -> bool:
        return self.skill_id in (PROMPT_WRITING_SKILL, DIRECTION_SKILL)
    def body(self) -> str:
        if self._body is None:
            raw = (self.path / "SKILL.md").read_text(encoding="utf-8")
            _, self._body = _parse_frontmatter(raw)
        return self._body
    def sections(self) -> dict[str, tuple[int, int]]:
        if self._sections is None:
            self._sections = sections_of(self.body())
        return self._sections
    def section(self, title: str) -> str | None:
        return section_of(self.body(), title)
    def reference_files(self) -> list[str]:
        ref_dir = self.path / "references"
        if not ref_dir.is_dir():
            return []
        return sorted(p.name for p in ref_dir.iterdir() if p.is_file())
    def reference(self, filename: str) -> str:
        available = self.reference_files()
        if filename not in available:
            raise FileNotFoundError(
                f"{self.skill_id} has no reference {filename!r}; available: {available}"
            )
        return (self.path / "references" / filename).read_text(encoding="utf-8")
def _load_skills(root: Path, out: dict[str, Skill]) -> None:
    if not root.is_dir():
        return
    for entry in sorted(root.iterdir()):
        if not entry.is_dir() or not (entry / "SKILL.md").is_file():
            continue
        try:
            meta, _ = _parse_frontmatter((entry / "SKILL.md").read_text(encoding="utf-8"))
        except OSError as exc:
            print(f"[VIG MiniMax H3 Director] skipping unreadable skill {entry.name}: {exc}")
            continue
        out[entry.name] = Skill(
            skill_id=entry.name,
            path=entry,
            name=meta.get("name", entry.name),
            description=meta.get("description", ""),
            compatibility=meta.get("compatibility", ""),
        )
@functools.lru_cache(maxsize=1)
def registry() -> dict[str, Skill]:
    out: dict[str, Skill] = {}
    _load_skills(SKILLS_DIR, out)
    from . import upstream
    _load_skills(upstream.skills_dir(), out)
    _load_skills(OWN_SKILLS_DIR, out)
    _load_skills(user_skills_dir(), out)
    return out
def refresh() -> None:
    registry.cache_clear()
def get_skill(skill_id: str) -> Skill:
    skills = registry()
    if skill_id not in skills:
        raise KeyError(f"unknown skill {skill_id!r}; available: {sorted(skills)}")
    return skills[skill_id]
def list_skills(full: bool = False) -> list[dict[str, str]]:
    return [
        {
            "id": s.skill_id,
            "name": s.name,
            "description": s.description if full else _first_sentence(s.description),
        }
        for s in registry().values()
        if s.skill_id not in STYLE_SKILLS
    ]
def style_skills() -> list[Skill]:
    return [s for s in registry().values() if not s.is_prompt_authority]
@functools.lru_cache(maxsize=2)
def guide(mode: str) -> str:
    filename = REF_GUIDE if mode.lower() in ("ref", "ref2va") else BASE_GUIDE
    try:
        return get_skill(PROMPT_WRITING_SKILL).reference(filename)
    except (KeyError, FileNotFoundError):
        name = (
            "VIDEO_PROMPT_WRITING_GUIDE_ref_en.md"
            if filename == REF_GUIDE
            else "VIDEO_PROMPT_WRITING_GUIDE_base_en.md"
        )
        local = DOCS_DIR / name
        if local.is_file():
            return local.read_text(encoding="utf-8")
        raise FileNotFoundError(
            "MiniMax's H3 prompt guide is not downloaded yet: the extension fetches "
            "MiniMax's skills from github.com/MiniMax-AI/MiniMax-H3 on start-up. "
            "Check the network and restart ComfyUI."
        )
@functools.lru_cache(maxsize=1)
def rules_index() -> dict[str, dict[str, str]]:
    if not RULES_INDEX_PATH.is_file():
        return {}
    data = json.loads(RULES_INDEX_PATH.read_text(encoding="utf-8"))
    return data.get("rules", {})
def quote_for(code: str) -> str | None:
    entry = rules_index().get(code)
    if entry is None:
        return None
    return f"[{entry['guide']} guide, {entry['section']}] {entry['quote']}"
def quotes_for(codes) -> str:
    seen: list[str] = []
    for code in codes:
        text = quote_for(code)
        if text and text not in seen:
            seen.append(text)
    return "\n\n".join(seen)
STAGE_RULES: dict[str, tuple[str, ...]] = {
    "cast": ("BODY_NOT_ENGLISH",),
    "places": ("BODY_NOT_ENGLISH",),
    "plan": ("SHOT_MISSING", "BODY_NOT_ENGLISH"),
    "expand": (
        "CAMERA_LABEL_STACKED",
        "CAMERA_MODIFIER_ORPHAN",
        "CAMERA_AMPLITUDE_VOCAB",
        "CAMERA_SPEED_VOCAB",
        "DIALOGUE_WRAPPED_IN_QUOTES",
        "LABEL_OUT_OF_RANGE",
        "BODY_NOT_ENGLISH",
    ),
    "sound": (
        "SOUNDSCAPE_LENGTH",
        "SOUNDSCAPE_HAS_DIALOGUE",
        "MUSIC_LENGTH",
        "MUSIC_HAS_DIALOGUE",
        "MUSIC_ABSTRACT_MOOD",
    ),
    "style": ("CAMERA_AMPLITUDE_VOCAB", "CAMERA_SPEED_VOCAB"),
}
REF_STAGE_RULES: dict[str, tuple[str, ...]] = {
    "expand": ("REF_DESCRIPTION_SHORT",),
}
STAGE_GUIDANCE: dict[str, tuple[tuple[str, str], ...]] = {
    "cast": (("control.md", "Lock Identity By Feature"),),
    "places": (("control.md", "Lock Identity By Feature"),),
    "plan": (("control.md", "Budget The Clip"),),
    "expand": (("control.md", "Budget The Clip"),),
    "sound": (("camera-and-sound.md", "overall_soundscape"),),
}
REF_STAGE_GUIDANCE: dict[str, tuple[tuple[str, str], ...]] = {
    "cast": (("control.md", "Give Every Reference A Job"),),
    "expand": (
        ("control.md", "Give Every Reference A Job"),
        ("control.md", "Connect The Voice To The Right Character"),
    ),
}
@functools.lru_cache(maxsize=32)
def guidance_for(stage: str, mode: str = "") -> str:
    wanted = list(STAGE_GUIDANCE.get(stage, ()))
    if mode.lower() in ("ref", "ref2va"):
        wanted.extend(REF_STAGE_GUIDANCE.get(stage, ()))
    try:
        skill = get_skill(DIRECTION_SKILL)
    except KeyError:
        return ""
    seen: list[str] = []
    for filename, heading in wanted:
        try:
            text = section_of(skill.reference(filename), heading)
        except (FileNotFoundError, OSError):
            continue
        if text and text not in seen:
            seen.append(text)
    return "\n\n".join(seen)
def briefing_for(stage: str, mode: str = "") -> str:
    codes = list(STAGE_RULES.get(stage, ()))
    if mode.lower() in ("ref", "ref2va"):
        codes.extend(REF_STAGE_RULES.get(stage, ()))
    return quotes_for(codes)
def upstream_commit() -> str | None:
    from . import upstream
    return upstream.COMMIT
