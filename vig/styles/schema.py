from __future__ import annotations
import json
from dataclasses import MISSING, asdict, dataclass, field
from pathlib import Path
from typing import Any
from .. import h3_spec as spec
SCHEMA_VERSION = 1
@dataclass
class CameraStyle:
    moves: list[str] = field(default_factory=list)
    amplitude: str | None = None
    speed: str | None = None
    shot_scale_bias: str = ""
    height: str = ""
    def validate(self) -> list[str]:
        problems = []
        for move in self.moves:
            if move not in spec.CAMERA_MOTIONS:
                problems.append(
                    f"camera move {move!r} is not in the H3 vocabulary {list(spec.CAMERA_MOTIONS)}"
                )
        if self.amplitude and self.amplitude not in spec.AMPLITUDES:
            problems.append(f"amplitude {self.amplitude!r} is not one of {list(spec.AMPLITUDES)}")
        if self.speed and self.speed not in spec.SPEEDS:
            problems.append(f"speed {self.speed!r} is not one of {list(spec.SPEEDS)}")
        return problems
@dataclass
class LensStyle:
    focal_bias: str = ""
    dof: str = ""
@dataclass
class LightingStyle:
    key_ratio: str = ""
    sources: list[str] = field(default_factory=list)
    practicals: str = ""
@dataclass
class PaletteStyle:
    dominant: list[str] = field(default_factory=list)
    contrast: str = ""
    grade: str = ""
@dataclass
class CompositionStyle:
    rules: list[str] = field(default_factory=list)
    movement_of_subject: str = ""
@dataclass
class EditingStyle:
    avg_shot_len_s: float = 4.0
    transition_pref: str = "hard cut"
@dataclass
class MusicStyle:
    instrumentation: str = ""
    tempo: str = ""
    dynamics: str = ""
@dataclass
class SoundStyle:
    ambience_bias: str = ""
    music: MusicStyle = field(default_factory=MusicStyle)
@dataclass
class PromptBias:
    must_include: list[str] = field(default_factory=list)
    avoid: list[str] = field(default_factory=list)
DEFAULT_OPENING_WORDS = 24
MIN_OPENING_WORDS = 14
def opening_budget(duration_seconds: float) -> int:
    if duration_seconds <= 0:
        return DEFAULT_OPENING_WORDS
    scaled = int(duration_seconds * 3)
    return max(MIN_OPENING_WORDS, min(DEFAULT_OPENING_WORDS, scaled))
def _word_count(text: str) -> int:
    return len(text.split())
_DANGLING = frozenset(
    """a an the and or with at for of in on to from by into over under through
    across against beside beneath around""".split()
)
def _drop_dangling_tail(text: str) -> str:
    words = text.split()
    while words:
        if words[-1].strip(",;.").lower() in _DANGLING:
            words.pop()
            continue
        tail = [w.strip(",;.").lower() for w in words[-3:]]
        cut_at = next((i for i, w in enumerate(tail[:-1]) if w in _DANGLING), None)
        if cut_at is None:
            break
        del words[len(words) - 3 + cut_at :]
    return " ".join(words).rstrip(",;. ")
def _trim_words(text: str, limit: int) -> str:
    words = text.split()
    if len(words) <= limit:
        return text
    cut = " ".join(words[:limit])
    for boundary in (";", ",", "."):
        head, sep, _ = cut.rpartition(boundary)
        if sep and _word_count(head) >= max(2, limit // 3):
            cut = head
            break
    return _drop_dangling_tail(cut)
@dataclass
class DirectorStyle:
    id: str
    display_name: str = ""
    origin: str = "director"
    attribution: str = ""
    visual_style: str = "Cinematic, live-action"
    era: str = ""
    camera: CameraStyle = field(default_factory=CameraStyle)
    lens: LensStyle = field(default_factory=LensStyle)
    lighting: LightingStyle = field(default_factory=LightingStyle)
    palette: PaletteStyle = field(default_factory=PaletteStyle)
    composition: CompositionStyle = field(default_factory=CompositionStyle)
    editing: EditingStyle = field(default_factory=EditingStyle)
    sound: SoundStyle = field(default_factory=SoundStyle)
    prompt_bias: PromptBias = field(default_factory=PromptBias)
    notes: str = ""
    schema_version: int = SCHEMA_VERSION
    def validate(self) -> list[str]:
        problems = list(self.camera.validate())
        if not self.id:
            problems.append("style has no id")
        if self.editing.avg_shot_len_s <= 0:
            problems.append("editing.avg_shot_len_s must be positive")
        if self.origin not in ("director", "skill", "user"):
            problems.append(f"unknown origin {self.origin!r}")
        return problems
    def render_clauses(self) -> list[str]:
        out: list[str] = []
        if self.lens.focal_bias or self.lens.dof:
            lens = " with ".join(p for p in (self.lens.focal_bias, self.lens.dof) if p)
            out.append(f"shot on {lens}")
        if self.camera.shot_scale_bias:
            out.append(self.camera.shot_scale_bias)
        if self.camera.height:
            out.append(f"at {self.camera.height}")
        if self.composition.rules:
            out.append("composition uses " + ", ".join(self.composition.rules))
        if self.lighting.sources or self.lighting.key_ratio:
            bits = []
            if self.lighting.key_ratio:
                bits.append(f"{self.lighting.key_ratio} key-to-fill ratio")
            if self.lighting.sources:
                bits.append("lit by " + ", ".join(self.lighting.sources))
            if self.lighting.practicals:
                bits.append(self.lighting.practicals)
            out.append("; ".join(bits))
        if self.palette.dominant or self.palette.grade:
            bits = []
            if self.palette.dominant:
                bits.append("a palette of " + ", ".join(self.palette.dominant))
            if self.palette.contrast:
                bits.append(f"{self.palette.contrast} contrast")
            if self.palette.grade:
                bits.append(f"graded {self.palette.grade}")
            out.append(", ".join(bits))
        if self.composition.movement_of_subject:
            out.append(self.composition.movement_of_subject)
        out.extend(self.prompt_bias.must_include)
        return [c for c in out if c]
    def style_opening(self, max_words: int = DEFAULT_OPENING_WORDS) -> str:
        head = _trim_words(self.visual_style.rstrip(". "), max_words)
        parts = [head] if head else []
        spent = _word_count(head)
        for clause in self.render_clauses()[:3]:
            remaining = max_words - spent
            if remaining <= 0:
                break
            cost = _word_count(clause)
            if cost > remaining:
                trimmed = _trim_words(clause, remaining)
                if trimmed:
                    parts.append(trimmed)
                break
            parts.append(clause)
            spent += cost
        return ", ".join(parts)
    def preferred_camera(self, shot_index: int) -> tuple[str | None, str | None, str | None]:
        if not self.camera.moves:
            return None, None, None
        move = self.camera.moves[(shot_index - 1) % len(self.camera.moves)]
        return move, self.camera.amplitude, self.camera.speed
    def music_sentence(self) -> str:
        music = self.sound.music
        if not (music.instrumentation or music.tempo):
            return spec.NA_VALUE
        bits = [music.instrumentation or "A sparse score"]
        if music.tempo:
            bits.append(f"at {music.tempo}")
        line = " ".join(bits)
        if music.dynamics:
            line = f"{line}, {music.dynamics}"
        return line.rstrip(".") + "."
    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DirectorStyle:
        data = dict(data)
        nested = {
            "camera": CameraStyle,
            "lens": LensStyle,
            "lighting": LightingStyle,
            "palette": PaletteStyle,
            "composition": CompositionStyle,
            "editing": EditingStyle,
            "prompt_bias": PromptBias,
        }
        for key, klass in nested.items():
            if isinstance(data.get(key), dict):
                data[key] = klass(**_known_fields(klass, data[key]))
        sound = data.get("sound")
        if isinstance(sound, dict):
            music = sound.get("music")
            if music is not None and not isinstance(music, dict):
                raise ValueError(f"sound.music must be an object, not {type(music).__name__}")
            data["sound"] = SoundStyle(
                **_known_fields(SoundStyle, {"ambience_bias": sound.get("ambience_bias")}),
                music=MusicStyle(**_known_fields(MusicStyle, music)),
            )
        return cls(**_known_fields(cls, data))
    @classmethod
    def load(cls, path: str | Path) -> DirectorStyle:
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))
    def save(self, path: str | Path) -> None:
        Path(path).write_text(self.to_json(), encoding="utf-8")
def _expected_type(info) -> type | None:
    if info.default is not MISSING and info.default is not None:
        return type(info.default)
    if info.default_factory is not MISSING:
        return type(info.default_factory())
    return None
def _check_value(klass, key: str, info, value: Any) -> None:
    expected = _expected_type(info)
    name = getattr(klass, "__name__", str(klass))
    if expected is None:
        if isinstance(value, (list, dict)):
            raise ValueError(f"{name}.{key} takes a single value, not a {type(value).__name__}")
        return
    if expected in (int, float):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{name}.{key} must be a number, not {value!r}")
        return
    if not isinstance(value, expected):
        raise ValueError(
            f"{name}.{key} must be {expected.__name__}, not {type(value).__name__} ({value!r})"
        )
def _known_fields(klass, data: dict | None) -> dict:
    if not data:
        return {}
    fields = getattr(klass, "__dataclass_fields__", {})
    out = {}
    for key, value in data.items():
        if key not in fields or value is None:
            continue
        _check_value(klass, key, fields[key], value)
        out[key] = value
    return out
DEFAULT_STYLE = DirectorStyle(
    id="neutral",
    display_name="Neutral cinematic",
    origin="director",
    visual_style="Cinematic, live-action",
    camera=CameraStyle(
        moves=["Push In", "Static Shot"],
        amplitude="with small amplitude",
        speed="at slow speed",
        shot_scale_bias="medium-wide framing",
        height="eye level",
    ),
    lens=LensStyle(focal_bias="a 35mm lens", dof="shallow depth of field"),
    lighting=LightingStyle(key_ratio="moderate", sources=["soft directional daylight"]),
    palette=PaletteStyle(dominant=["muted neutrals"], contrast="moderate", grade="slightly cool"),
    composition=CompositionStyle(rules=["rule-of-thirds placement"]),
    editing=EditingStyle(avg_shot_len_s=4.0, transition_pref="hard cut"),
    sound=SoundStyle(
        ambience_bias="quiet location room tone",
        music=MusicStyle(
            instrumentation="Sparse piano notes",
            tempo="a slow tempo",
            dynamics="joined by sustained low strings that fade out",
        ),
    ),
)
