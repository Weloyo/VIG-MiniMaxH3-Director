from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Any
from . import h3_spec as spec
from .text import has_pronoun, latinise
from .timing import Timing
_SINGULAR_S = frozenset(
    {"glass", "dress", "grass", "class", "bus", "canvas", "boss", "cross", "press", "chess"}
)
_SENTENCE_PUNCTUATION = frozenset(".,;:!?")
_IRREGULAR_PLURALS = frozenset({"children", "people", "men", "women", "police"})
_REF_LABEL = re.compile(
    r"\s*\b(?:shown\s+in|depicted\s+in|seen\s+in|from|in|of|on|at)?\s*"
    r"<\s*(?:Subject|Picture|Video|Audio)\s+\d+\s*>",
    re.IGNORECASE,
)
def without_labels(text: str) -> str:
    cleaned = _REF_LABEL.sub("", str(text or ""))
    cleaned = re.sub(r"\s+([,;.])", r"\1", cleaned)
    return " ".join(cleaned.split())
_HELD_POSE_RE = re.compile(
    r"\b(?:hold|keep|maintain|remain|sustain|stay)(?:s|ing)?\b[\w\s,'-]{0,40}?"
    r"\b(?:pose|posed|posture|position|stance|still|stillness|motionless|"
    r"immobile|expression|gaze|smile)\b",
    re.IGNORECASE,
)
def is_held_pose(behaviour: str) -> bool:
    return bool(_HELD_POSE_RE.search(str(behaviour or "")))
@dataclass
class CharacterEntry:
    name: str
    phrase: str
    head: str = ""
    aliases: list[str] = field(default_factory=list)
    behaviour: str = ""
    latin_name: str = ""
    @classmethod
    def build(
        cls,
        name: str,
        appearance: str,
        aliases: list[str] | None = None,
        behaviour: str = "",
        name_en: str = "",
    ) -> CharacterEntry:
        name = _tidy(without_labels(name))
        appearance = _tidy(without_labels(appearance))
        head = _head_of(name) or _head_of(appearance)
        spoken = _tidy(without_labels(name_en)) or latinise(name)
        if not appearance:
            phrase = spoken
        elif not name or (head and head in _words(appearance)):
            phrase = appearance
        else:
            phrase = f"{spoken}, {_uncapitalise_article(appearance)}"
        entry = cls(
            name=name or appearance,
            phrase=phrase,
            head=_head_of(appearance) or head,
            behaviour="" if is_held_pose(behaviour) else _tidy(behaviour),
            latin_name=spoken or latinise(appearance),
        )
        entry.aliases = _unique(
            [*(aliases or []), name, spoken, name_en, appearance, phrase]
        )
        return entry
    @property
    def determiner(self) -> str:
        first = self.phrase.split(" ", 1)[0].lower()
        return first if first in ("a", "an", "the") else ""
    @property
    def body(self) -> str:
        determiner = self.determiner
        return self.phrase[len(determiner) :].strip() if determiner else self.phrase
    def mention(self, determiner: str = "") -> str:
        body = self.body
        if not determiner or not body:
            return self.phrase
        article = determiner.lower()
        if article in ("a", "an"):
            article = "an" if body[:1].lower() in "aeiou" else "a"
        return f"{article} {body}"
    @property
    def is_appositive(self) -> bool:
        return "," in self.phrase
    def introduction(self) -> str:
        phrase = self.phrase
        verb = "are" if _is_plural(self.head) else "is"
        comma = "," if self.is_appositive else ""
        return f"{phrase[:1].upper()}{phrase[1:]}{comma} {verb} in frame."
    def states_appearance(self, text: str) -> bool:
        body = self.body
        return bool(body) and body.lower() in (text or "").lower()
    def appears_in(self, text: str) -> bool:
        return self.states_appearance(text) or self._first_alias(text) is not None
    def canonicalise(self, text: str, *, by_head: bool = False) -> str:
        if not text or self.states_appearance(text):
            return text
        match = self._first_alias(text, by_head=by_head)
        if match is None:
            return text
        replacement = self.mention(match.group(1) or "")
        if match.group(0)[:1].isupper():
            replacement = replacement[:1].upper() + replacement[1:]
        tail = text[match.end() :]
        following = tail.lstrip()[:1]
        if self.is_appositive and following and following not in _SENTENCE_PUNCTUATION:
            replacement += ","
        return text[: match.start()] + replacement + tail
    def heads(self) -> list[str]:
        found = [_head_of(alias) for alias in self.aliases]
        return _unique([head for head in found if head])
    def _first_alias(self, text: str, *, by_head: bool = False):
        best = None
        candidates = [*self.aliases, *self.heads()] if by_head else self.aliases
        for alias in sorted(candidates, key=len, reverse=True):
            pattern = _alias_pattern(alias)
            if pattern is None:
                continue
            match = pattern.search(text)
            if match is None:
                continue
            if best is None or match.start() < best.start():
                best = match
        return best
@dataclass
class CharacterBible:
    entries: list[CharacterEntry] = field(default_factory=list)
    source: str = ""
    @classmethod
    def from_dicts(cls, raw: list[dict] | None, source: str = "") -> CharacterBible:
        entries: list[CharacterEntry] = []
        for item in raw or []:
            if not isinstance(item, dict):
                continue
            entry = CharacterEntry.build(
                name=str(item.get("name", "")),
                appearance=str(item.get("appearance", "")),
                aliases=[str(a) for a in item.get("aliases", []) if a],
                behaviour=str(item.get("behaviour", "")),
                name_en=str(item.get("name_en", "")),
            )
            if entry.phrase:
                entries.append(entry)
        return cls(entries=entries, source=source)
    def is_empty(self) -> bool:
        return not self.entries
    @property
    def primary(self) -> CharacterEntry | None:
        return self.entries[0] if self.entries else None
    def entries_for(self, text: str) -> list[CharacterEntry]:
        matched = [entry for entry in self.entries if entry.appears_in(text)]
        primary = self.primary
        if primary is not None and primary not in matched and has_pronoun(text):
            matched.insert(0, primary)
        return matched
    def canonicalise(self, text: str) -> str:
        for entry in self.entries:
            text = entry.canonicalise(text)
        return text
    def as_lines(self) -> list[str]:
        return [
            f"{entry.name}: {entry.phrase}"
            + (f" (behaviour: {entry.behaviour})" if entry.behaviour else "")
            for entry in self.entries
        ]
    def as_dicts(self) -> list[dict]:
        return [
            {
                "name": e.name,
                "appearance": e.phrase,
                "aliases": list(e.aliases),
                "behaviour": e.behaviour,
                "name_en": e.latin_name,
            }
            for e in self.entries
        ]
def _uncapitalise_article(phrase: str) -> str:
    first, _, rest = phrase.partition(" ")
    return f"{first.lower()} {rest}" if rest and first in ("A", "An", "The") else phrase
def _tidy(text: str) -> str:
    text = re.sub(r"\s{2,}", " ", (text or "").replace("\n", " ")).strip()
    return text.strip(" .;,")
def _words(text: str) -> list[str]:
    return [w for w in re.split(r"[^\w'’-]+", (text or "").lower()) if w]
_PARTICIPLES = frozenset(
    """
    wrapped bound tied secured fastened strapped laced buckled zipped
    covered draped lined trimmed topped framed mounted propped wedged tucked
    filled stuffed loaded packed
    painted coated finished stained streaked splattered dusted marked stamped
    printed embroidered engraved etched decorated adorned
    dressed clad wearing worn made held carried folded wound sealed
    """.split()
)
_PARTICIPLE_JOINERS = frozenset(("and", "or", "then"))
def _head_of(phrase: str) -> str:
    words = _words(phrase)
    if not words:
        return ""
    for i, word in enumerate(words):
        if i and word in ("in", "with", "wearing", "carrying", "holding", "and"):
            return _before_clause(words, i)
    return words[-1]
def _before_clause(words: list[str], marker: int) -> str:
    position = marker - 1
    while position > 0 and (
        words[position] in _PARTICIPLES or words[position] in _PARTICIPLE_JOINERS
    ):
        position -= 1
    return words[position] if position > 0 else words[marker - 1]
def _is_plural(head: str) -> bool:
    head = (head or "").lower()
    if head in _IRREGULAR_PLURALS:
        return True
    return head.endswith("s") and head not in _SINGULAR_S
def _unique(values: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for value in values:
        cleaned = _tidy(value)
        if cleaned:
            seen.setdefault(cleaned, None)
    return list(seen)
def _alias_pattern(alias: str):
    words = alias.split()
    has_article = bool(words) and words[0].lower() in ("a", "an", "the")
    if has_article:
        words = words[1:]
    if not words:
        return None
    body = r"\s+".join(re.escape(w) for w in words)
    if has_article:
        return re.compile(rf"\b(a|an|the)\s+{body}\b", re.IGNORECASE)
    return re.compile(rf"\b(?:(a|an|the)\s+)?{body}\b", re.IGNORECASE)
@dataclass
class DialogueLine:
    text: str
    language: str = "English"
    speaker: str = "S1"
    voiceover: bool = False
    shot_index: int = 1
    delivery: str = ""
    def as_tag(self) -> str:
        return f"<d>[{self.language}] {self.text}</d>"
@dataclass
class ShotPlan:
    index: int
    beat: str = ""
    prose: str = ""
    camera_motion: str | None = None
    camera_amplitude: str | None = None
    camera_speed: str | None = None
    subjects: list[str] = field(default_factory=list)
    labels: list[str] = field(default_factory=list)
    dialogue: list[DialogueLine] = field(default_factory=list)
    diegetic_sound: str = ""
    cut_phrase: str = spec.CUT_PHRASES[0]
    def camera_sentence(self) -> str | None:
        if not self.camera_motion:
            return None
        return spec.camera_phrase(
            self.camera_motion, self.camera_amplitude, self.camera_speed
        )
@dataclass
class RefLabel:
    kind: str
    number: int
    source: str = ""
    description: str = ""
    facts: dict[str, Any] = field(default_factory=dict)
    cite: str = ""
    described: bool = True
    @property
    def tag(self) -> str:
        return f"<{self.kind} {self.number}>"
@dataclass
class RefBundle:
    images: list[Any] = field(default_factory=list)
    videos: list[Any] = field(default_factory=list)
    video_audios: dict[int, Any] = field(default_factory=dict)
    audios: list[Any] = field(default_factory=list)
    labels: list[RefLabel] = field(default_factory=list)
    report: str = ""
    def available_labels(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for label in self.labels:
            counts[label.kind] = max(counts.get(label.kind, 0), label.number)
        return counts
    def is_empty(self) -> bool:
        return not (self.labels or self.images or self.videos or self.audios)
    def to_native_kwargs(self) -> dict[str, dict]:
        return {
            "ref_images": {f"ref_image_{i}": t for i, t in enumerate(self.images, 1)},
            "ref_videos": {f"ref_video_{i}": t for i, t in enumerate(self.videos, 1)},
            "ref_video_audios": {
                f"ref_video_audio_{i}": a for i, a in sorted(self.video_audios.items())
            },
            "ref_audios": {f"ref_audio_{i}": a for i, a in enumerate(self.audios, 1)},
        }
@dataclass
class ClipPlan:
    mode: str
    timing: Timing
    shots: list[ShotPlan] = field(default_factory=list)
    style_id: str = ""
    soundscape: str = ""
    music: str = spec.NA_VALUE
    style_opening: str = ""
    cast: list[CharacterEntry] = field(default_factory=list)
    subject_definitions: str = ""
    summary: str = ""
    retention_analysis: str = ""
    prompt: str = ""
    width: int = 1344
    height: int = 768
    @property
    def frame_count(self) -> int:
        return self.timing.frame_count
    @property
    def duration(self) -> float:
        return self.timing.duration
@dataclass
class DirectorPlan:
    clips: list[ClipPlan] = field(default_factory=list)
    story: str = ""
    style_id: str = ""
    mode: str = spec.T2VA
    report: str = ""
    warnings: list[str] = field(default_factory=list)
    character_bible: CharacterBible = field(default_factory=CharacterBible)
    @property
    def segment_count(self) -> int:
        return len(self.clips)
    def clip(self, index: int) -> ClipPlan:
        if not self.clips:
            raise IndexError("plan contains no clips")
        return self.clips[max(0, min(index, len(self.clips) - 1))]
