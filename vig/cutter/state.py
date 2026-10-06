from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field, replace
from .. import h3_spec as spec
from .motion import RUN_GRID, snap_to_grid
from ..timing import (
    FPS,
    TRAINED_MAX_FRAMES,
    TRAINED_MIN_FRAMES,
    align_frame_count,
    frames_to_seconds,
)
MODES = spec.ALL_MODES
MODE_FIRST_FRAME = frozenset({spec.I2VA, spec.FL2VA})
MODE_LAST_FRAME = frozenset({spec.FL2VA, spec.L2VA})
STATUSES = ("queued", "generating", "ready", "stale", "error")
REF_KINDS = ("image", "video", "audio")
PROMPT_LANGS = ("EN", "ZH", "RU")
REF_ORIGINS = ("library", "segment")
PREVIEW_RES = ("draft", "half", "full")
PREVIEW_RES_PIXELS = {"draft": 512, "half": 1024, "full": 0}
TINY_VAE_AUTO = "auto"
PREVIEW_FPS = (8, 12, 24)
PREVIEW_EVERY = (0, 1, 2, 4)
MAX_BATCH_TAKES = 4
SEED_MODES = ("random", "increment", "fixed")
DEFAULT_SEED_MODE = "random"
PROMPT_INPUTS = (
    "script", "style", "camera", "camera_amplitude", "camera_speed",
    "mode", "seconds", "prompt_lang",
    "max_shots", "skills", "writer_model", "writer_seed", "writer_temperature",
)
WRITER_INPUTS = ("writer_model", "writer_seed", "writer_temperature")
def _number_text(value) -> str:
    try:
        rounded = round(float(value), 3)
    except (TypeError, ValueError):
        return ""
    return str(int(rounded)) if rounded == int(rounded) else repr(rounded)
def writer_inputs(board) -> dict:
    w = getattr(board, "writer", None)
    if w is None:
        return {}
    model = (
        f"provider:{w.provider_url}|{w.provider_model or ''}" if w.via_provider
        else f"local:{w.llm_model or ''}"
    )
    return {
        "writer_model": model,
        "writer_seed": str(max(0, int(w.seed or 0))),
        "writer_temperature": _number_text(w.temperature if w.temperature is not None else 1),
    }
def seed_moves_by_itself(board) -> bool:
    return board is not None and (getattr(board, "writer_seed_mode", "") or "fixed") != "fixed"
CAMERA_AMPLITUDES = ("", "small", "large")
CAMERA_SPEEDS = ("", "slow", "fast")
MAX_SEGMENTS = 60
MIN_SEGMENT_SECONDS = 1
MAX_SEGMENT_SECONDS = 15
MAX_LOADED_SECONDS = 60
MIN_SEGMENT_FRAMES = align_frame_count(MIN_SEGMENT_SECONDS * FPS)
MAX_SEGMENT_FRAMES = align_frame_count(MAX_SEGMENT_SECONDS * FPS)
MAX_LOADED_FRAMES = align_frame_count(MAX_LOADED_SECONDS * FPS)
GRID_STEP = 17
MAX_LIBRARY_REFS = 24
SEGMENT_REF_CAPS = {
    "image": spec.MAX_REF_IMAGES,
    "video": spec.MAX_REF_VIDEOS,
    "audio": spec.MAX_REF_AUDIOS,
}
MAX_SEGMENT_REFS = 3
MAX_AUDIO_CLIPS = 12
DEFAULT_SEGMENT_SECONDS = 8
DEFAULT_SEGMENT_FRAMES = align_frame_count(DEFAULT_SEGMENT_SECONDS * FPS)
def _made_at(value) -> int | None:
    if value is None or value == "":
        return None
    return max(0, _as_int(value, 0))
def _made_or(made, wanted) -> int:
    return max(0, int(wanted or 0)) if made is None else max(0, int(made))
def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return default
def _as_float(value, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return default if result != result else result
def _as_str(value, default: str = "") -> str:
    return value if isinstance(value, str) else default
def _as_bool(value, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default
def _one_of(value, options, default: str) -> str:
    text = _as_str(value).strip().lower()
    return text if text in options else default
def _status_at_rest(status: str, clip: str) -> str:
    if status != "generating":
        return status
    return "stale" if clip else "queued"
def _lang_of(value) -> str:
    text = _as_str(value).strip().upper()
    return text if text in PROMPT_LANGS else "EN"
def _preview_res_of(data) -> int:
    if data.get("preview_max_res") is not None:
        return max(0, min(8192, _as_int(data.get("preview_max_res"), 1024)))
    old = _as_str(data.get("preview_res")).strip().lower()
    if old in PREVIEW_RES_PIXELS:
        return PREVIEW_RES_PIXELS[old]
    return 1024
def _tiny_vae_of(value) -> str:
    if isinstance(value, bool):
        return TINY_VAE_AUTO if value else ""
    if value is None:
        return TINY_VAE_AUTO
    return _as_str(value).strip()
def _fps_of(value) -> int:
    n = _as_int(value, 12)
    return min(PREVIEW_FPS, key=lambda option: abs(option - n))
def _every_of(value) -> int:
    n = _as_int(value, 1)
    if n < 0:
        n = 0
    return min(PREVIEW_EVERY, key=lambda option: abs(option - n))
def _read_refs(raw) -> list["SegmentRef"]:
    taken: dict[str, int] = {kind: 0 for kind in REF_KINDS}
    out: list[SegmentRef] = []
    for item in raw if isinstance(raw, list) else []:
        ref = SegmentRef.from_json(item)
        if taken[ref.kind] >= SEGMENT_REF_CAPS[ref.kind]:
            continue
        taken[ref.kind] += 1
        out.append(ref)
    return out
def snap_frames(frames, ceiling: int = MAX_SEGMENT_FRAMES) -> int:
    n = _as_int(frames, DEFAULT_SEGMENT_FRAMES)
    n = max(MIN_SEGMENT_FRAMES, min(ceiling, n))
    below = ((n - 5) // GRID_STEP) * GRID_STEP + 5
    above = below + GRID_STEP
    nearest = below if (n - below) <= (above - n) else above
    return max(MIN_SEGMENT_FRAMES, min(ceiling, nearest))
def snap_seconds(seconds, ceiling: int = MAX_SEGMENT_SECONDS) -> int:
    value = _as_int(round(_as_float(seconds, DEFAULT_SEGMENT_SECONDS)), DEFAULT_SEGMENT_SECONDS)
    return max(MIN_SEGMENT_SECONDS, min(ceiling, value))
def frames_for(seconds, ceiling: int = MAX_SEGMENT_SECONDS) -> int:
    return align_frame_count(snap_seconds(seconds, ceiling) * FPS)
def overshoot(seconds, ceiling: int = MAX_SEGMENT_SECONDS) -> float:
    whole = snap_seconds(seconds, ceiling)
    return frames_to_seconds(frames_for(whole, ceiling)) - whole
def seconds_to_grid_frames(seconds) -> int:
    return snap_frames(round(_as_float(seconds, 0.0) * FPS))
_MUSIC_MARKER_RE = None
def _music_marker():
    global _MUSIC_MARKER_RE
    if _MUSIC_MARKER_RE is None:
        import re
        _MUSIC_MARKER_RE = re.compile(
            rf"^{spec.MUSIC_FIELD}\s*:", flags=re.MULTILINE
        )
    return _MUSIC_MARKER_RE
def strip_music(prompt: str) -> tuple[str, str]:
    text = prompt or ""
    match = _music_marker().search(text)
    if not match:
        return text, ""
    body = text[match.end() :].strip()
    if not body or body == spec.NA_VALUE:
        return text, ""
    return f"{text[: match.end()]} {spec.NA_VALUE}\n", body
def restore_music(prompt: str, stash: str) -> str:
    text = prompt or ""
    if not (stash or "").strip():
        return text
    match = _music_marker().search(text)
    if not match:
        return text
    return f"{text[: match.end()]} {stash.strip()}\n"
_TAG_RE = None
def _tag_pattern():
    global _TAG_RE
    if _TAG_RE is None:
        import re
        _TAG_RE = re.compile(r"@(R\d+)\b")
    return _TAG_RE
def cited_tag_names(prompt: str) -> list[str]:
    seen: list[str] = []
    for match in _tag_pattern().finditer(prompt or ""):
        if match.group(1) not in seen:
            seen.append(match.group(1))
    return seen
def substitute_tags(prompt: str, labels: dict) -> tuple[str, list[str]]:
    stripped: list[str] = []
    def replace(match):
        tag = match.group(1)
        label = labels.get(tag)
        if label:
            return label
        stripped.append(tag)
        return ""
    text = _tag_pattern().sub(replace, prompt or "")
    if stripped:
        import re
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r" +([.,;:!?])", r"\1", text)
    return text, stripped
@dataclass
class SegmentRef:
    uid: str = ""
    kind: str = "video"
    label: str = ""
    source: str = ""
    tag: str = ""
    frame: str = ""
    @classmethod
    def from_json(cls, data, fallback_kind: str = "video") -> "SegmentRef":
        data = data if isinstance(data, dict) else {}
        return cls(
            uid=_as_str(data.get("uid")),
            kind=_one_of(data.get("kind"), REF_KINDS, fallback_kind),
            label=_as_str(data.get("label")),
            source=_as_str(data.get("source")),
            tag=_as_str(data.get("tag")),
            frame=_as_str(data.get("frame")),
        )
    def to_json(self) -> dict:
        return {
            "uid": self.uid,
            "kind": self.kind,
            "label": self.label,
            "source": self.source,
            "tag": self.tag,
            "frame": self.frame,
        }
    @property
    def is_opening(self) -> bool:
        return str(self.uid or "").startswith("first")
    @property
    def is_closing(self) -> bool:
        return str(self.uid or "").startswith("last")
    @property
    def is_keyframe(self) -> bool:
        return self.is_opening or self.is_closing
    @property
    def resolved(self) -> bool:
        return bool(self.source)
@dataclass
class LibraryRef(SegmentRef):
    origin: str = "segment"
    @classmethod
    def from_json(cls, data, fallback_kind: str = "image") -> "LibraryRef":
        base = SegmentRef.from_json(data, fallback_kind)
        data = data if isinstance(data, dict) else {}
        raw_origin = _as_str(data.get("origin")).strip().lower()
        origin = "library" if raw_origin in ("writer", "library") else "segment"
        return cls(
            uid=base.uid,
            kind=base.kind,
            label=base.label,
            source=base.source,
            tag=base.tag,
            frame=base.frame,
            origin=origin,
        )
    def to_json(self) -> dict:
        payload = super().to_json()
        payload["origin"] = self.origin
        return payload
@dataclass
class Segment:
    id: int = 1
    name: str = ""
    seconds: int = DEFAULT_SEGMENT_SECONDS
    mode: str = spec.T2VA
    script: str = ""
    style: str = ""
    camera: str = ""
    camera_amplitude: str = ""
    camera_speed: str = ""
    prompt: str = ""
    seed: int = 0
    locked: bool = False
    audio: bool = True
    music: bool = True
    music_stash: str = ""
    prompt_lang: str = "EN"
    prompt_from: dict = field(default_factory=dict)
    written_by: dict = field(default_factory=dict)
    prompt_pre: str = ""
    lang_pre: str = ""
    prompt_edited: bool = False
    rebuilt: bool = False
    max_shots: int = 0
    skills: list = field(default_factory=list)
    context_frames: int = 0
    context_audio: int = 0
    context_at: int = 0
    tail_frames: int = 0
    tail_audio: int = 0
    made_tail_at: int | None = None
    made_context_at: int | None = None
    made_frames: int | None = None
    tail_at: int = 0
    status: str = "queued"
    refs: list[SegmentRef] = field(default_factory=list)
    source_clip: str = ""
    clip_name: str = ""
    cache_key: str = ""
    take_key: str = ""
    error: str = ""
    poster: str = ""
    clip: str = ""
    @classmethod
    def from_json(cls, data, index: int = 0) -> "Segment":
        data = data if isinstance(data, dict) else {}
        if data.get("seconds") is not None:
            seconds = data.get("seconds")
        elif data.get("frames") is not None:
            seconds = frames_to_seconds(_as_int(data.get("frames"), DEFAULT_SEGMENT_FRAMES))
        else:
            seconds = data.get("duration", DEFAULT_SEGMENT_SECONDS)
        raw_refs = data.get("refs")
        camera = _as_str(data.get("camera")).strip()
        return cls(
            id=_as_int(data.get("id"), index + 1),
            name=_as_str(data.get("name")),
            seconds=snap_seconds(
                seconds,
                MAX_LOADED_SECONDS if _as_str(data.get("source_clip")) else MAX_SEGMENT_SECONDS,
            ),
            mode=_one_of(data.get("mode"), MODES, spec.T2VA),
            script=_as_str(data.get("script")),
            style=_as_str(data.get("style")).strip(),
            camera=camera if camera in spec.CAMERA_MOTIONS else "",
            camera_amplitude=_one_of(data.get("camera_amplitude"), CAMERA_AMPLITUDES, ""),
            camera_speed=_one_of(data.get("camera_speed"), CAMERA_SPEEDS, ""),
            prompt=_as_str(data.get("prompt")),
            seed=max(0, _as_int(data.get("seed"), 0)),
            locked=_as_bool(data.get("locked")),
            audio=_as_bool(data.get("audio"), True),
            music=_as_bool(data.get("music"), True),
            music_stash=_as_str(data.get("music_stash")),
            prompt_lang=_lang_of(data.get("prompt_lang")),
            prompt_from=(
                {k: v for k, v in (data.get("prompt_from") or {}).items()
                 if k in PROMPT_INPUTS}
                if isinstance(data.get("prompt_from"), dict) else {}
            ),
            written_by=(
                dict(data.get("written_by")) if isinstance(data.get("written_by"), dict) else {}
            ),
            prompt_pre=_as_str(data.get("prompt_pre")),
            lang_pre=_as_str(data.get("lang_pre")),
            prompt_edited=_as_bool(data.get("prompt_edited")),
            rebuilt=_as_bool(data.get("rebuilt")),
            max_shots=max(0, min(8, _as_int(data.get("max_shots"), 0))),
            skills=[str(x) for x in (data.get("skills") or []) if str(x).strip()]
            if isinstance(data.get("skills"), list) else [],
            context_frames=max(0, min(56, _as_int(data.get("context_frames"), 0))),
            context_audio=max(0, min(240, _as_int(data.get("context_audio"), 0))),
            context_at=max(0, _as_int(data.get("context_at"), 0)),
            tail_frames=max(0, min(56, _as_int(data.get("tail_frames"), 0))),
            tail_audio=max(0, min(240, _as_int(data.get("tail_audio"), 0))),
            tail_at=max(0, _as_int(data.get("tail_at"), 0)),
            made_tail_at=_made_at(data.get("made_tail_at")),
            made_context_at=_made_at(data.get("made_context_at")),
            made_frames=_made_at(data.get("made_frames")),
            status=_status_at_rest(
                _one_of(data.get("status"), STATUSES, "queued"),
                _as_str(data.get("clip")),
            ),
            refs=_read_refs(raw_refs),
            source_clip=_as_str(data.get("source_clip")),
            clip_name=_as_str(data.get("clip_name")),
            cache_key=_as_str(data.get("cache_key")),
            take_key=_as_str(data.get("take_key")),
            error=_as_str(data.get("error")),
            poster=_as_str(data.get("poster")),
            clip=_as_str(data.get("clip")),
        )
    def to_json(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "seconds": self.seconds,
            "frames": self.frames,
            "duration": round(self.duration, 3),
            "mode": self.mode,
            "script": self.script,
            "style": self.style,
            "camera": self.camera,
            "camera_amplitude": self.camera_amplitude,
            "camera_speed": self.camera_speed,
            "prompt": self.prompt,
            "seed": self.seed,
            "locked": self.locked,
            "audio": self.audio,
            "music": self.music,
            "music_stash": self.music_stash,
            "prompt_lang": self.prompt_lang,
            "prompt_from": dict(self.prompt_from or {}),
            "written_by": dict(self.written_by or {}),
            "prompt_pre": self.prompt_pre,
            "lang_pre": self.lang_pre,
            "prompt_edited": self.prompt_edited,
            "rebuilt": self.rebuilt,
            "max_shots": self.max_shots,
            "skills": list(self.skills or []),
            "context_frames": self.context_frames,
            "context_audio": self.context_audio,
            "context_at": self.context_at,
            "tail_frames": self.tail_frames,
            "tail_audio": self.tail_audio,
            "tail_at": self.tail_at,
            "made_tail_at": self.made_tail_at,
            "made_context_at": self.made_context_at,
            "made_frames": self.made_frames,
            "status": self.status,
            "refs": [ref.to_json() for ref in self.refs],
            "source_clip": self.source_clip,
            "clip_name": self.clip_name,
            "cache_key": self.cache_key,
            "take_key": self.take_key,
            "error": self.error,
            "poster": self.poster,
            "clip": self.clip,
        }
    @property
    def frames(self) -> int:
        return frames_for(self.seconds, self.max_seconds)
    @property
    def carried_run(self) -> int:
        if self.context_frames <= 1 or self.external:
            return 0
        headroom = MAX_SEGMENT_FRAMES - self.frames
        if headroom < RUN_GRID[-1]:
            return 0
        return min(snap_to_grid(int(self.context_frames)), snap_to_grid(headroom))
    @property
    def carried_tail(self) -> int:
        if not self.tail_frames or self.external or self.carried_run:
            return 0
        headroom = MAX_SEGMENT_FRAMES - self.frames
        if headroom < RUN_GRID[-1]:
            return 0
        return min(snap_to_grid(int(self.tail_frames)), snap_to_grid(headroom))
    @property
    def pinned_run(self) -> int:
        return self.carried_run or self.carried_tail
    @property
    def sample_frames(self) -> int:
        run = self.pinned_run
        if not run:
            return self.frames
        want = self.frames + run
        grid = ((want - 5 + GRID_STEP - 1) // GRID_STEP) * GRID_STEP + 5
        return min(MAX_SEGMENT_FRAMES, max(want, grid))
    @property
    def film_frames(self) -> int:
        if self.external:
            return self.delivered_frames
        made = _made_at(self.made_frames)
        return made if made else self.delivered_frames
    @property
    def delivered_frames(self) -> int:
        run = self.pinned_run
        return self.sample_frames - run if run else self.frames
    @property
    def duration(self) -> float:
        return frames_to_seconds(self.delivered_frames)
    @property
    def overshoot(self) -> float:
        return self.duration - self.seconds
    def refs_of(self, kind: str) -> list[SegmentRef]:
        return [ref for ref in self.refs if ref.kind == kind][
            : SEGMENT_REF_CAPS.get(kind, MAX_SEGMENT_REFS)
        ]
    @property
    def external(self) -> bool:
        return bool(self.source_clip)
    @property
    def max_seconds(self) -> int:
        if self.external:
            return MAX_LOADED_SECONDS
        run = snap_to_grid(int(self.context_frames)) if self.context_frames > 1 else 0
        if run <= 0:
            return MAX_SEGMENT_SECONDS
        room = MAX_SEGMENT_FRAMES - run
        for whole in range(MAX_SEGMENT_SECONDS, MIN_SEGMENT_SECONDS, -1):
            if align_frame_count(whole * FPS) <= room:
                return whole
        return MIN_SEGMENT_SECONDS
    def prompt_inputs(self, board=None) -> dict:
        writer = writer_inputs(board) if board is not None else {}
        out = {}
        for name in PROMPT_INPUTS:
            if name in WRITER_INPUTS:
                if name in writer:
                    out[name] = writer[name]
            elif name == "skills":
                out[name] = ",".join(sorted(str(x) for x in (self.skills or []) if str(x).strip()))
            else:
                out[name] = getattr(self, name, "")
        return out
    def prompt_drift(self, board=None) -> list:
        if not (self.prompt or "").strip() or not self.prompt_from:
            return []
        now = self.prompt_inputs(board)
        loose = seed_moves_by_itself(board)
        return [
            name for name in PROMPT_INPUTS
            if name in self.prompt_from
            and not (name in WRITER_INPUTS and name not in now)
            and not (name == "writer_seed" and loose)
            and str(now.get(name, "")) != str(self.prompt_from.get(name, ""))
        ]
    @property
    def wants_first_frame(self) -> bool:
        return self.mode in MODE_FIRST_FRAME
    @property
    def wants_last_frame(self) -> bool:
        return self.mode in MODE_LAST_FRAME
    @property
    def takes_from_front(self) -> bool:
        if self.external:
            return False
        return self.wants_first_frame or bool(self.carried_run)
    @property
    def effective_mode(self) -> str:
        if self.carried_run:
            return spec.mode_without_opening(self.mode)
        if self.carried_tail:
            return spec.mode_without_closing(self.mode)
        return self.mode
    @property
    def warnings(self) -> list[str]:
        if self.external:
            return []
        out: list[str] = []
        if self.frames < TRAINED_MIN_FRAMES:
            out.append(
                f"{self.seconds} s renders {self.duration:.2f} s, under the "
                f"{frames_to_seconds(TRAINED_MIN_FRAMES):.2f} s the model was trained on; "
                "motion tends to stall."
            )
        if self.mode == spec.REF2VA and not any(r.resolved for r in self.refs):
            out.append("ref2va with no reference attached falls back to plain text-to-video.")
        if int(self.context_frames or 0) == 1 and not self.wants_first_frame:
            out.append(
                f"A single frame is handed over to this clip, but {self.mode} has no "
                "first-frame slot to pin it in, so nothing is carried across the cut. "
                "Choose a run of 5 frames or more, which any mode can carry, or switch "
                "the clip to I2VA."
            )
        if self.carried_run and any(
            r.kind == "image" and r.resolved and str(r.uid or "").startswith("first")
            for r in self.refs
        ):
            out.append(
                f"This clip carries {self.carried_run} frames from the one before it, and "
                "that run occupies frame 0: the attached opening image is dropped before "
                f"sampling and the prompt is written as {self.effective_mode}. Turn the "
                "carry off to open on the picture instead."
            )
        if not self.prompt.strip():
            out.append("No prompt: this clip has nothing to generate from.")
        if self.prompt_lang == "RU" and self.prompt.strip():
            out.append(
                "The prompt is shown in RU, which H3 does not read. Switch back to "
                "EN or 中文 so the agent rebuilds it before rendering."
            )
        if self.mode != spec.REF2VA and cited_tag_names(self.prompt):
            tags = ", ".join(f"@{t}" for t in cited_tag_names(self.prompt))
            if self.carried_run:
                out.append(
                    f"The prompt cites {tags}, but this clip opens on the run carried "
                    "from the one before it -- that takes frame 0, so no image can open "
                    "the clip and the tags are stripped at render. Switch to REF2VA to "
                    "attach them, or turn the carry off."
                )
            elif self.wants_first_frame:
                out.append(
                    f"The prompt cites {tags}. In {self.mode} the FIRST cited image "
                    "opens the clip as its first frame (when the slot below is "
                    "empty); any other tag is stripped at render. To attach several "
                    "references, switch the clip to REF2VA."
                )
            else:
                out.append(
                    f"The prompt cites {tags}, but {self.mode} attaches no references "
                    "-- the tags are stripped at render and those files never reach "
                    "the model. Switch to I2VA to open on the image, or to REF2VA to "
                    "attach them all."
                )
        if self.prompt_lang != "RU":
            import re
            body = re.sub(r"<d>.*?</d>|" + chr(34) + "[^" + chr(34) + "]*" + chr(34), " ", self.prompt, flags=re.DOTALL)
            if re.search(r"[А-Яа-яЁё]", body):
                out.append(
                    "The prompt carries Russian text, which H3 does not read -- "
                    "that sentence will be ignored. Switch to RU, edit there, and "
                    "back to EN so the agent rebuilds it in the model's language."
                )
        return out
@dataclass
class AudioClip:
    id: int = 1
    seconds: float = 5.0
    muted: bool = False
    locked: bool = False
    label: str = ""
    source: str = ""
    gain: float = 1.0
    @classmethod
    def from_json(cls, data, index: int = 0) -> "AudioClip":
        data = data if isinstance(data, dict) else {}
        seconds = data.get("seconds", data.get("duration", 5.0))
        return cls(
            id=_as_int(data.get("id"), index + 1),
            seconds=max(0.25, min(600.0, _as_float(seconds, 5.0))),
            muted=_as_bool(data.get("muted")),
            locked=_as_bool(data.get("locked")),
            label=_as_str(data.get("label")),
            source=_as_str(data.get("source")),
            gain=max(0.0, min(4.0, _as_float(data.get("gain"), 1.0))),
        )
    def to_json(self) -> dict:
        return {
            "id": self.id,
            "seconds": round(self.seconds, 3),
            "muted": self.muted,
            "locked": self.locked,
            "label": self.label,
            "source": self.source,
            "gain": round(self.gain, 3),
        }
@dataclass
class WriterSettings:
    llm_model: str = ""
    models_dir: str = ""
    seed: int = 0
    temperature: float = 1.0
    use_provider: bool = False
    provider_url: str = ""
    provider_model: str = ""
    @property
    def via_provider(self) -> bool:
        return bool(self.use_provider and self.provider_url)
    @classmethod
    def from_json(cls, data) -> "WriterSettings":
        data = data if isinstance(data, dict) else {}
        url = _as_str(data.get("provider_url")).strip()
        local_model = _as_str(data.get("llm_model"))
        legacy = url and "use_provider" not in data
        provider_model = _as_str(data.get("provider_model"))
        if legacy and not provider_model:
            provider_model, local_model = local_model, ""
        return cls(
            llm_model=local_model,
            models_dir=_as_str(data.get("models_dir")),
            seed=max(0, _as_int(data.get("seed"), 0)),
            temperature=max(0.0, min(2.0, _as_float(data.get("temperature"), 1.0))),
            use_provider=_as_bool(data.get("use_provider"), bool(legacy)),
            provider_url=url,
            provider_model=provider_model,
        )
    def to_json(self) -> dict:
        return {
            "llm_model": self.llm_model,
            "models_dir": self.models_dir,
            "seed": self.seed,
            "temperature": round(self.temperature, 3),
            "use_provider": self.use_provider,
            "provider_url": self.provider_url,
            "provider_model": self.provider_model,
        }
@dataclass
class Board:
    segments: list[Segment] = field(default_factory=list)
    audio_clips: list[AudioClip] = field(default_factory=list)
    library: list[LibraryRef] = field(default_factory=list)
    writer: WriterSettings = field(default_factory=WriterSettings)
    seed: int = 0
    aspect_from_image: bool = False
    project_dir: str = ""
    film_name: str = ""
    film_of: str = ""
    selected_id: int = 0
    preview_max_res: int = 1024
    preview_quality: int = 80
    preview_frames: int = 0
    preview_fps: int = 12
    preview_every: int = 1
    batch_takes: int = 1
    new_take_to_timeline: bool = False
    seed_mode: str = DEFAULT_SEED_MODE
    film_seed_mode: str = "fixed"
    writer_seed_mode: str = "fixed"
    tiny_vae: str = TINY_VAE_AUTO
    storyboard_id: str = ""
    version: int = 1
    @classmethod
    def from_json(cls, data) -> "Board":
        if isinstance(data, (bytes, bytearray)):
            data = data.decode("utf-8", "replace")
        if isinstance(data, str):
            text = data.strip()
            if not text:
                return cls.empty()
            try:
                data = json.loads(text)
            except (ValueError, TypeError):
                return cls.empty()
        if not isinstance(data, dict):
            return cls.empty()
        raw_segments = data.get("segments")
        segments = [
            Segment.from_json(item, i)
            for i, item in enumerate(raw_segments if isinstance(raw_segments, list) else [])
        ][:MAX_SEGMENTS]
        if not segments:
            segments = [Segment(id=1)]
        raw_audio = data.get("audio_clips")
        audio_clips = [
            AudioClip.from_json(item, i)
            for i, item in enumerate(raw_audio if isinstance(raw_audio, list) else [])
        ][:MAX_AUDIO_CLIPS]
        raw_library = data.get("library")
        library = [
            LibraryRef.from_json(item)
            for item in (raw_library if isinstance(raw_library, list) else [])
        ][:MAX_LIBRARY_REFS]
        board = cls(
            segments=segments,
            audio_clips=audio_clips,
            library=library,
            writer=WriterSettings.from_json(data.get("writer")),
            aspect_from_image=_as_bool(data.get("aspect_from_image")),
            project_dir=_as_str(data.get("project_dir")),
            film_name=_as_str(data.get("film_name")),
            film_of=_as_str(data.get("film_of")),
            selected_id=_as_int(data.get("selected_id"), 0),
            preview_max_res=_preview_res_of(data),
            preview_quality=max(30, min(100, _as_int(data.get("preview_quality"), 80))),
            preview_frames=max(0, min(1024, _as_int(data.get("preview_frames"), 0))),
            preview_fps=_fps_of(data.get("preview_fps")),
            preview_every=_every_of(data.get("preview_every")),
            batch_takes=max(1, min(MAX_BATCH_TAKES, _as_int(data.get("batch_takes"), 1))),
            new_take_to_timeline=bool(data.get("new_take_to_timeline")),
            seed_mode=(_as_str(data.get("seed_mode")) if _as_str(data.get("seed_mode"))
                       in SEED_MODES else DEFAULT_SEED_MODE),
            writer_seed_mode=(_as_str(data.get("writer_seed_mode"))
                              if _as_str(data.get("writer_seed_mode")) in SEED_MODES else "fixed"),
            tiny_vae=_tiny_vae_of(data.get("tiny_vae")),
            storyboard_id=_as_str(data.get("storyboard_id")),
            version=max(1, _as_int(data.get("version"), 1)),
        )
        board.adopt_legacy(data)
        board.normalise()
        return board
    def adopt_legacy(self, data: dict) -> None:
        scenario = _as_str(data.get("scenario")).strip()
        if scenario and self.segments and not self.segments[0].script.strip():
            self.segments[0].script = scenario
        raw_writer = data.get("writer") if isinstance(data.get("writer"), dict) else {}
        style = _as_str(raw_writer.get("style")).strip()
        if style:
            for seg in self.segments:
                if not seg.style:
                    seg.style = style
        shots = max(0, min(8, _as_int(data.get("max_shots"), 0)))
        if shots:
            for seg in self.segments:
                if not seg.max_shots:
                    seg.max_shots = shots
    @classmethod
    def empty(cls) -> "Board":
        board = cls(segments=[Segment(id=1)])
        board.normalise()
        return board
    def to_json(self) -> dict:
        return {
            "version": self.version,
            "segments": [seg.to_json() for seg in self.segments],
            "audio_clips": [clip.to_json() for clip in self.audio_clips],
            "library": [ref.to_json() for ref in self.library],
            "writer": self.writer.to_json(),
            "aspect_from_image": self.aspect_from_image,
            "project_dir": self.project_dir,
            "film_name": self.film_name,
            "film_of": self.film_of,
            "selected_id": self.selected_id,
            "preview_max_res": self.preview_max_res,
            "preview_quality": self.preview_quality,
            "preview_frames": self.preview_frames,
            "preview_fps": self.preview_fps,
            "preview_every": self.preview_every,
            "batch_takes": self.batch_takes,
            "new_take_to_timeline": self.new_take_to_timeline,
            "seed_mode": self.seed_mode,
            "writer_seed_mode": self.writer_seed_mode,
            "tiny_vae": self.tiny_vae,
            "storyboard_id": self.storyboard_id,
            "total_frames": self.total_frames,
            "total_seconds": round(self.total_seconds, 3),
            "requested_seconds": self.requested_seconds,
        }
    def dumps(self) -> str:
        return json.dumps(self.to_json(), ensure_ascii=False, separators=(",", ":"))
    def normalise(self) -> None:
        seen: set[int] = set()
        next_id = 1
        for seg in self.segments:
            if seg.id <= 0 or seg.id in seen:
                while next_id in seen:
                    next_id += 1
                seg.id = next_id
            seen.add(seg.id)
            next_id = max(next_id, seg.id + 1)
            seg.seconds = snap_seconds(seg.seconds, seg.max_seconds)
        seen_audio: set[int] = set()
        next_audio = 1
        for clip in self.audio_clips:
            if clip.id <= 0 or clip.id in seen_audio:
                while next_audio in seen_audio:
                    next_audio += 1
                clip.id = next_audio
            seen_audio.add(clip.id)
            next_audio = max(next_audio, clip.id + 1)
        used_tags = set()
        for index, ref in enumerate(self.library):
            if not ref.uid:
                ref.uid = f"lib{index + 1}"
            if not ref.tag or ref.tag in used_tags:
                candidate = index + 1
                while f"R{candidate}" in used_tags:
                    candidate += 1
                ref.tag = f"R{candidate}"
            used_tags.add(ref.tag)
        ids = {seg.id for seg in self.segments}
        if self.selected_id not in ids:
            self.selected_id = self.segments[0].id if self.segments else 0
    @property
    def film_signature(self) -> str:
        spans = self.film_spans
        out = []
        for seg in self.segments:
            start, end = spans.get(seg.id, (0, 0))
            name = str(seg.source_clip or seg.clip or "")
            name = name.replace("\\", "/").rsplit("/", 1)[-1]
            out.append(":".join([
                name,
                str(int(start)),
                str(int(end)),
                str(seg.mode or ""),
                "0" if seg.audio else "1",
            ]))
        return "|".join(["2"] + out)
    @property
    def film_spans(self) -> dict:
        spans = {}
        for index, seg in enumerate(self.segments):
            end = seg.film_frames
            after = self.segments[index + 1] if index + 1 < len(self.segments) else None
            made_cut = _made_or(after.made_context_at, after.context_at) if after else 0
            if (
                after is not None
                and after.takes_from_front
                and made_cut
            ):
                end = min(end, made_cut)
            end = max(1, end)
            start = 0
            before = self.segments[index - 1] if index else None
            if before is not None and before.carried_tail:
                start = max(0, min(end - 1, _made_or(before.made_tail_at, before.tail_at)))
            spans[seg.id] = (start, end)
        return spans
    @property
    def film_lengths(self) -> dict:
        return {key: max(1, end - start) for key, (start, end) in self.film_spans.items()}
    @property
    def total_frames(self) -> int:
        return sum(self.film_lengths.values())
    @property
    def total_seconds(self) -> float:
        return frames_to_seconds(self.total_frames)
    @property
    def requested_seconds(self) -> int:
        return sum(seg.seconds for seg in self.segments)
    @property
    def overshoot(self) -> float:
        return self.total_seconds - self.requested_seconds
    def segment(self, segment_id: int):
        for seg in self.segments:
            if seg.id == int(segment_id):
                return seg
        return None
    def index_of(self, segment_id: int) -> int:
        for index, seg in enumerate(self.segments):
            if seg.id == int(segment_id):
                return index
        return -1
    def next_segment_id(self) -> int:
        return max((seg.id for seg in self.segments), default=0) + 1
    def cited_tags(self, segment: Segment) -> list[str]:
        cited = set(cited_tag_names(segment.prompt))
        return [ref.tag for ref in self.library if ref.tag and ref.tag in cited]
    def fingerprints(
        self, extra: str = "", mode_ids: dict | None = None, file_ids: dict | None = None,
        unpinned=None, resolve=None,
    ) -> dict:
        mode_ids = mode_ids or {}
        file_ids = file_ids or {}
        keys: dict = {}
        settled: dict = {}
        for index in self._key_order():
            seg = self.segments[index]
            previous = settled.get(index - 1, "")
            if seg.locked and seg.cache_key and seg.id not in (unpinned or ()):
                keys[seg.id] = seg.cache_key
                settled[index] = seg.cache_key
                continue
            cited = set(cited_tag_names(seg.prompt))
            parts = [
                extra,
                seg.mode,
                mode_ids.get(seg.mode, ""),
                str(seg.frames),
                str(seg.seed),
                seg.prompt,
                (
                    f"ctx:{seg.context_frames}:{seg.context_audio}:{seg.context_at}"
                    f":{seg.delivered_frames}"
                    if seg.context_frames
                    else ""
                ),
                (file_ids.get(seg.id) or f"file:{seg.source_clip}") if seg.external else "",
                "|".join(f"{r.kind}:{r.source or r.label}" for r in seg.refs),
                "|".join(
                    f"{r.tag}:{r.source or r.label}"
                    for r in self.library
                    if r.tag and r.tag in cited
                ),
            ]
            if (
                seg.takes_from_front
                and not (index and self.segments[index - 1].carried_tail)
            ):
                parts.append(f"from:{previous}")
            enlarged = (file_ids or {}).get(f"refs:{seg.id}") if seg.mode == spec.REF2VA else ""
            if enlarged:
                parts.append(f"refup:{enlarged}")
            if seg.tail_frames:
                parts.append(
                    f"tail:{seg.tail_frames}:{seg.tail_audio}:{seg.delivered_frames}"
                )
                if seg.tail_at:
                    parts.append(f"tailat:{seg.tail_at}")
                ahead = settled.get(index + 1, "")
                if ahead:
                    parts.append(f"to:{ahead}")
            digest = hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()[:16]
            keys[seg.id] = digest
            settled[index] = (resolve(index, seg, digest) or digest) if resolve else digest
        return keys
    def _key_order(self) -> list:
        order: list = []
        placed: set = set()
        pending = list(range(len(self.segments)))
        while pending:
            moved = False
            for index in list(pending):
                seg = self.segments[index]
                needs = set()
                if (
                    index
                    and seg.takes_from_front
                    and not self.segments[index - 1].carried_tail
                ):
                    needs.add(index - 1)
                if seg.carried_tail and index + 1 < len(self.segments):
                    needs.add(index + 1)
                if not needs <= placed:
                    continue
                order.append(index)
                placed.add(index)
                pending.remove(index)
                moved = True
            if not moved:
                order.extend(pending)
                break
        return order
    def with_statuses(self, fingerprints: dict) -> "Board":
        segments = []
        for seg in self.segments:
            key = fingerprints.get(seg.id, "")
            status = seg.status
            if seg.status == "ready" and seg.cache_key and seg.cache_key != key:
                status = "stale"
            segments.append(replace(seg, status=status))
        return replace(self, segments=segments)
