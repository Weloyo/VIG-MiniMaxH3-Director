from __future__ import annotations
import hashlib
import json
import re
from dataclasses import dataclass, field
from . import h3_spec as spec
from .cutter.motion import DEFAULT_CONTEXT_AUDIO_FRAMES
from .cutter.state import (
    DEFAULT_SEGMENT_SECONDS,
    MAX_SEGMENT_SECONDS,
    MAX_SEGMENTS,
    MIN_SEGMENT_SECONDS,
    Board,
    LibraryRef,
    Segment,
)
DEFAULT_BEAT_SECONDS = DEFAULT_SEGMENT_SECONDS
DEFAULT_CARRY = 22
MAX_BEATS = MAX_SEGMENTS
@dataclass
class Beat:
    index: int = 0
    seconds: int = DEFAULT_BEAT_SECONDS
    mode: str = spec.I2VA
    script: str = ""
    prompt: str = ""
    style: str = ""
    camera: str = ""
    characters: list[str] = field(default_factory=list)
    environment: str = ""
    carry: int = DEFAULT_CARRY
    notes: list[str] = field(default_factory=list)
    name: str = ""
    segment: dict = field(default_factory=dict)
    def to_json(self) -> dict:
        out = {
            "index": self.index,
            "seconds": int(self.seconds),
            "mode": self.mode,
            "script": self.script,
            "prompt": self.prompt,
            "style": self.style,
            "camera": self.camera,
            "characters": list(self.characters),
            "environment": self.environment,
            "carry": int(self.carry),
            "notes": list(self.notes),
        }
        if self.name:
            out["name"] = self.name
        if self.segment:
            out["segment"] = dict(self.segment)
        return out
    @classmethod
    def read(cls, data: dict) -> "Beat":
        data = data if isinstance(data, dict) else {}
        return cls(
            name=_text(data.get("name")),
            segment=segment_fields(data.get("segment")),
            index=_int(data.get("index"), 0),
            seconds=_clamp_seconds(_int(data.get("seconds"), DEFAULT_BEAT_SECONDS)),
            mode=str(data.get("mode") or spec.I2VA).lower(),
            script=_text(data.get("script")),
            prompt=_text(data.get("prompt")),
            style=_text(data.get("style")),
            camera=_text(data.get("camera")),
            characters=[_text(c) for c in data.get("characters") or [] if _text(c)],
            environment=_text(data.get("environment")),
            carry=_int(data.get("carry"), DEFAULT_CARRY),
            notes=[_text(n) for n in data.get("notes") or [] if _text(n)],
        )
@dataclass
class Storyboard:
    title: str = ""
    logline: str = ""
    style: str = "neutral"
    beats: list[Beat] = field(default_factory=list)
    cast: list[dict] = field(default_factory=list)
    environments: list[dict] = field(default_factory=list)
    references: list[dict] = field(default_factory=list)
    report: str = ""
    used_llm: bool = False
    author: str = ""
    @property
    def total_seconds(self) -> float:
        return float(sum(beat.seconds for beat in self.beats))
    def fingerprint(self) -> str:
        payload = json.dumps(self.to_json(with_id=False), sort_keys=True, ensure_ascii=False)
        return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]
    def to_json(self, with_id: bool = True) -> dict:
        out = {
            "version": 1,
            "title": self.title,
            "logline": self.logline,
            "style": self.style,
            "beats": [beat.to_json() for beat in self.beats],
            "cast": [dict(entry) for entry in self.cast],
            "environments": [dict(entry) for entry in self.environments],
            "references": [dict(entry) for entry in self.references],
            "used_llm": bool(self.used_llm),
        }
        if self.author:
            out["author"] = self.author
        if with_id:
            out["id"] = self.fingerprint()
            out["report"] = self.report
        return out
    @classmethod
    def read(cls, data: dict) -> "Storyboard":
        data = data if isinstance(data, dict) else {}
        beats = []
        for position, raw in enumerate(data.get("beats") or []):
            beat = Beat.read(raw)
            if not (isinstance(raw, dict) and "index" in raw):
                beat.index = position
            beats.append(beat)
        return cls(
            title=_text(data.get("title")),
            logline=_text(data.get("logline")),
            style=_text(data.get("style")) or "neutral",
            author=_text(data.get("author")),
            beats=beats,
            cast=[dict(c) for c in data.get("cast") or [] if isinstance(c, dict)],
            environments=[dict(e) for e in data.get("environments") or [] if isinstance(e, dict)],
            references=[dict(r) for r in data.get("references") or [] if isinstance(r, dict)],
            report=_text(data.get("report")),
            used_llm=bool(data.get("used_llm")),
        )
def _text(value) -> str:
    return str(value).strip() if value is not None else ""
SEGMENT_FIELDS = (
    "name", "seconds", "mode", "script", "prompt", "prompt_lang", "style",
    "camera", "camera_amplitude", "camera_speed", "max_shots", "skills",
    "seed", "locked", "audio", "music",
    "context_frames", "context_audio", "context_at",
    "tail_frames", "tail_audio", "tail_at",
    "refs", "source_clip",
)
def segment_fields(raw) -> dict:
    if not isinstance(raw, dict):
        return {}
    return {key: raw[key] for key in SEGMENT_FIELDS if key in raw}
def _int(value, fallback: int) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return fallback
def _clamp_seconds(value: int) -> int:
    return max(MIN_SEGMENT_SECONDS, min(MAX_SEGMENT_SECONDS, int(value)))
_BULLET_RE = re.compile(r"^\s*(?:\d+[.)]|[-*•])\s+", re.M)
_SENTENCE_RE = re.compile(r"(?<=[.!?…])\s+")
def split_script(script: str, beat_seconds: int = DEFAULT_BEAT_SECONDS,
                 total_seconds: int = 0) -> list[str]:
    script = (script or "").strip()
    if not script:
        return []
    if _BULLET_RE.search(script):
        parts = [p.strip() for p in _BULLET_RE.split(script) if p.strip()]
    else:
        parts = [p.strip() for p in re.split(r"\n\s*\n", script) if p.strip()]
    if len(parts) <= 1:
        sentences = [s.strip() for s in _SENTENCE_RE.split(script) if s.strip()]
        if not sentences:
            return [script]
        wanted = _beat_count(len(sentences), beat_seconds, total_seconds)
        parts = _group(sentences, wanted)
    if total_seconds > 0:
        allowed = max(1, int(total_seconds // max(1, beat_seconds)))
        if len(parts) > allowed:
            parts = _group(parts, allowed)
    return parts[:MAX_BEATS]
def _beat_count(sentences: int, beat_seconds: int, total_seconds: int) -> int:
    if total_seconds > 0:
        return max(1, min(MAX_BEATS, int(round(total_seconds / max(1, beat_seconds)))))
    return max(1, min(MAX_BEATS, (sentences + 1) // 2))
def _group(parts: list[str], wanted: int) -> list[str]:
    wanted = max(1, min(wanted, len(parts)))
    if wanted == len(parts):
        return list(parts)
    per = len(parts) / float(wanted)
    out: list[str] = []
    for i in range(wanted):
        start = int(round(i * per))
        end = int(round((i + 1) * per)) if i + 1 < wanted else len(parts)
        chunk = [p for p in parts[start:end] if p]
        if chunk:
            out.append(" ".join(chunk))
    return [p for p in out if p]
def beats_from_scripts(scripts: list[str], beat_seconds: int, style: str,
                       carry: int) -> list[Beat]:
    out: list[Beat] = []
    for index, script in enumerate(scripts):
        out.append(
            Beat(
                index=index,
                seconds=_clamp_seconds(beat_seconds),
                mode=spec.T2VA if index == 0 else spec.I2VA,
                script=script,
                style=style,
                carry=0 if index == 0 else int(carry),
            )
        )
    return out
def to_board(storyboard: Storyboard, base: Board | None = None) -> Board:
    from dataclasses import replace
    board = replace(base) if base is not None else Board.empty()
    library = list(board.library)
    known = {ref.tag for ref in library if ref.tag}
    for entry in storyboard.references:
        tag = _text(entry.get("tag")).lstrip("@")
        source = _text(entry.get("source"))
        label = _text(entry.get("label"))
        if not tag or not (source or label) or tag in known:
            continue
        known.add(tag)
        library.append(
            LibraryRef(
                uid=f"sb-{tag.lower()}",
                kind=_text(entry.get("kind")) or "image",
                label=label or source,
                source=source,
                tag=tag,
                origin="library",
            )
        )
    segments: list[Segment] = []
    for beat in storyboard.beats:
        data = {
            "id": beat.index + 1,
            "name": beat.name or _beat_name(beat),
            "seconds": _clamp_seconds(beat.seconds),
            "mode": beat.mode,
            "script": beat.script,
            "prompt": beat.prompt,
            "style": beat.style or storyboard.style,
            "camera": beat.camera,
            "context_frames": int(beat.carry or 0),
        }
        data.update(beat.segment)
        if int(data.get("context_frames") or 0) > 1 and "context_audio" not in beat.segment:
            data["context_audio"] = DEFAULT_CONTEXT_AUDIO_FRAMES
        data["status"] = "queued"
        data["id"] = beat.index + 1
        seg = Segment.from_json(data, beat.index)
        seg.seconds = _clamp_seconds(seg.seconds)
        if (seg.prompt or "").strip():
            seg.prompt_from = seg.prompt_inputs(None)
            seg.written_by = {
                "model": storyboard.author or ("film director" if storyboard.used_llm else "storyboard"),
                "via": "storyboard",
                "seed": None,
                "temperature": None,
                "skills": [],
                "max_shots": int(seg.max_shots or 0),
                "camera_amplitude": seg.camera_amplitude or "",
                "camera_speed": seg.camera_speed or "",
                "music": bool(seg.music),
                "style": seg.style or "",
                "mode": seg.effective_mode,
            }
        segments.append(seg)
    board.segments = segments or [Segment(id=1)]
    board.library = library
    board.selected_id = board.segments[0].id
    if storyboard.title and not board.film_name:
        board.film_name = storyboard.title
    board.storyboard_id = storyboard.fingerprint()
    board.normalise()
    return board
_TOP_KEYS = {"version", "title", "logline", "style", "author", "beats", "cast",
             "environments", "references", "used_llm", "id", "report", "notes"}
_BEAT_KEYS = {"index", "name", "seconds", "mode", "script", "prompt", "style",
              "camera", "characters", "environment", "carry", "notes", "segment"}
def load(source: str) -> dict:
    import os
    text = (source or "").strip()
    if not text:
        raise ValueError("No storyboard: give a path to a .json file, or paste the JSON.")
    if not text.startswith("{"):
        path = os.path.expanduser(text.strip('"'))
        if not os.path.isfile(path):
            raise ValueError(f"No storyboard file at {path}.")
        with open(path, "r", encoding="utf-8-sig") as handle:
            text = handle.read()
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise ValueError(f"The storyboard is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("A storyboard is a JSON object with a `beats` list.")
    return data
def _keyframe_needs(seg, position: int) -> list[str]:
    from .cutter.state import MODE_FIRST_FRAME, MODE_LAST_FRAME
    mode = seg.effective_mode
    need = []
    has_first = any(r.is_opening and r.resolved for r in seg.refs)
    has_last = any(r.is_closing and r.resolved for r in seg.refs)
    chained = position > 0 and int(seg.context_frames or 0) == 1
    if mode in MODE_FIRST_FRAME and not has_first and not chained:
        need.append("first frame")
    if mode in MODE_LAST_FRAME and not has_last:
        need.append("last frame")
    return need
def check(data: dict) -> dict:
    from . import h3_spec
    from .cutter.state import cited_tag_names
    from .prompt.validator import validate
    errors: list[str] = []
    warnings: list[str] = []
    data = data if isinstance(data, dict) else {}
    for key in sorted(set(data) - _TOP_KEYS):
        errors.append(f"unknown top-level key `{key}` -- it would be ignored")
    raw_beats = data.get("beats")
    if not isinstance(raw_beats, list) or not raw_beats:
        errors.append("`beats` must be a non-empty list")
        raw_beats = []
    if len(raw_beats) > MAX_BEATS:
        errors.append(f"{len(raw_beats)} beats; the most a storyboard takes is {MAX_BEATS}")
    for position, raw in enumerate(raw_beats):
        where = f"beat {position + 1}"
        if not isinstance(raw, dict):
            errors.append(f"{where} is not an object")
            continue
        for key in sorted(set(raw) - _BEAT_KEYS):
            errors.append(f"{where}: unknown key `{key}` -- put clip fields under `segment`")
        extra = raw.get("segment")
        if extra is not None and not isinstance(extra, dict):
            errors.append(f"{where}: `segment` must be an object")
        elif isinstance(extra, dict):
            for key in sorted(set(extra) - set(SEGMENT_FIELDS)):
                errors.append(
                    f"{where}: `segment.{key}` is not a field a storyboard may set "
                    f"(allowed: {', '.join(SEGMENT_FIELDS)})"
                )
        mode = str((extra or {}).get("mode") or raw.get("mode") or "").lower()
        if mode and mode not in h3_spec.ALL_MODES:
            errors.append(f"{where}: unknown mode `{mode}`")
        if "index" in raw and _int(raw.get("index"), -1) != position:
            errors.append(f"{where}: `index` is {raw.get('index')}, but it stands at {position}")
    try:
        from .styles.library import style_ids
        known_styles = set(style_ids()) | {"neutral", ""}
    except Exception:
        known_styles = None
    plan = Storyboard.read(data)
    board = to_board(plan)
    library = {ref.tag: ref for ref in board.library}
    for ref in board.library:
        if not ref.source:
            warnings.append(
                f"@{ref.tag} has no picture yet ({ref.label}) -- fill it in the console "
                "before any clip citing it renders"
            )
    clips: list[str] = []
    total = 0.0
    for position, seg in enumerate(board.segments):
        name = f"clip {position + 1}"
        total += seg.duration
        if known_styles is not None and seg.style not in known_styles:
            errors.append(f"{name}: unknown style `{seg.style}`")
        cited = cited_tag_names(seg.prompt) + [
            t for t in cited_tag_names(seg.script) if t not in cited_tag_names(seg.prompt)
        ]
        for tag in cited:
            if tag not in library:
                errors.append(f"{name}: cites @{tag}, which is not in `references`")
        if cited_tag_names(seg.prompt) and seg.mode != h3_spec.REF2VA:
            errors.append(
                f"{name}: the prompt cites @{', @'.join(cited_tag_names(seg.prompt))} but the "
                f"clip is {seg.mode} -- only ref2va attaches references; the tags would be stripped"
            )
        if position == 0 and (seg.context_frames or seg.context_audio):
            errors.append(f"{name}: the first clip has nothing in front of it to carry a run from")
        if seg.tail_frames and position + 1 >= len(board.segments):
            errors.append(f"{name}: arrives at the next clip, and there is none")
        if seg.tail_frames and seg.carried_run:
            errors.append(f"{name}: a run at both ends does not stack -- carry or arrive, not both")
        for need in _keyframe_needs(seg, position):
            warnings.append(f"{name}: {seg.effective_mode} needs a {need} picture -- put it on the clip in the console")
        if not (seg.prompt or "").strip():
            warnings.append(f"{name}: no prompt -- the console's writer will write it from the script")
        else:
            result = validate(seg.prompt, seg.effective_mode, duration=seg.duration)
            for v in result.errors:
                errors.append(f"{name}: [{v.code}] {v.message}")
            for v in result.violations:
                if v not in result.errors:
                    warnings.append(f"{name}: [{v.code}] {v.message}")
        run = f" carries {seg.carried_run}" if seg.carried_run else ""
        run += f" arrives {seg.carried_tail}@{seg.tail_at}" if seg.carried_tail else ""
        mode = seg.mode if seg.mode == seg.effective_mode else f"{seg.mode}->{seg.effective_mode}"
        clips.append(
            f"{position + 1:>2}  {mode:<13} {seg.seconds:>2}s -> {seg.duration:5.2f}s"
            f"{run}  {seg.name}"
        )
    clips.append(f"film {total:.2f} s over {len(board.segments)} clip(s)")
    return {"storyboard": plan, "board": board, "errors": errors,
            "warnings": warnings, "clips": clips}
def _beat_name(beat: Beat) -> str:
    text = " ".join((beat.script or "").split())
    if len(text) <= 34:
        return text
    return text[:34].rsplit(" ", 1)[0] + "…"
_SPEAKER_RE = re.compile(r"\(S\d+(?:\s*,\s*S\d+)*\)")
_SHOT_TIME_RE = re.compile(r"^at\s+\d{1,2}:\d{2}(?:[:.]\d+)*\s*,?\s*", re.I)
_DIALOGUE_SPAN_RE = re.compile(r"<d>[\s\S]*?</d>")
def speaker_lines(prompt: str) -> list[dict]:
    bodies = _bodies(prompt)
    body = bodies.get("detailed_description") or bodies.get(
        "integrated_multimodal_description", ""
    )
    if not body:
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for hit in _SPEAKER_RE.finditer(body):
        ident = re.sub(r"\s+", "", hit.group(0))
        if ident in seen or len(out) >= 4:
            continue
        seen.add(ident)
        before = body[: hit.start()]
        cut = 0
        for mark, width in ((". ", 2), ("] ", 2), ("</d>", 4), ("\n", 1)):
            at = before.rfind(mark)
            if at >= 0 and at + width > cut:
                cut = at + width
        phrase = _DIALOGUE_SPAN_RE.sub(" ", before[cut:])
        phrase = _SHOT_TIME_RE.sub("", phrase)
        phrase = " ".join(phrase.split()).strip()
        if phrase and len(phrase) <= 140:
            out.append({"id": ident, "as": phrase})
    return out
def _bodies(prompt: str) -> dict:
    if not prompt:
        return {}
    from .prompt.validator import split_fields
    for mode in (spec.T2VA, spec.REF2VA):
        try:
            _, bodies = split_fields(prompt, mode)
        except Exception:
            continue
        if bodies:
            return bodies
    return {}
def previous_sound(prompt: str) -> dict | None:
    bodies = _bodies(prompt)
    room = (bodies.get("overall_soundscape") or "").strip()
    music = (bodies.get("non_diegetic_music") or "").strip()
    speakers = speaker_lines(prompt)
    if not room and not music and not speakers:
        return None
    return {"room": room, "music": music, "speakers": speakers}
def cast_brief(cast: list[dict]) -> str:
    lines = []
    for entry in cast:
        name = str(entry.get("name") or "").strip()
        phrase = str(entry.get("phrase") or "").strip()
        if not phrase:
            continue
        lines.append(f"- {name or phrase}: always described as \"{phrase}\"")
    if not lines:
        return ""
    return (
        "THE FILM'S CAST. These people appear across several clips of one film, and "
        "each clip is written on its own. Whenever one of them is on screen, describe "
        "them in EXACTLY these words -- H3 renders a re-worded description as a "
        "different person:\n" + "\n".join(lines)
    )
def places_brief(places: list[dict]) -> str:
    lines = []
    for entry in places:
        phrase = str(entry.get("phrase") or "").strip()
        if not phrase:
            continue
        name = str(entry.get("name") or "").strip()
        line = f"- {name or phrase}: always described as \"{phrase}\""
        sound = str(entry.get("sound") or "").strip()
        if sound:
            line += f"; its room tone is {sound}"
        lines.append(line)
    if not lines:
        return ""
    return (
        "THE FILM'S PLACES. The film returns to these locations across several clips, and "
        "each clip is written on its own. Whenever a clip is set in one of them, describe "
        "it in EXACTLY these words -- H3 renders a re-worded room as a different room:\n"
        + "\n".join(lines)
        + "\nA clip set somewhere else is not bound by this list; do not move it into one "
        "of these places to satisfy it."
    )
_STEM_FLOOR = 4
_STEM_TAIL = 3
_STEM_CUT = 2
_WORD_RE = re.compile(r"\w+", re.UNICODE)
_ARTICLES = ("the ", "a ", "an ")
def place_named_in(script: str, places: list[dict]) -> str:
    text = " ".join(str(script or "").split()).lower()
    if not text:
        return ""
    words = set(_WORD_RE.findall(text))
    for entry in places:
        name = str(entry.get("name") or "").strip()
        for form in [name, *(str(a) for a in entry.get("aliases") or [])]:
            form = " ".join(str(form).split()).lower()
            for article in _ARTICLES:
                if form.startswith(article):
                    form = form[len(article):]
                    break
            if not form:
                continue
            if " " in form:
                if form in text:
                    return name or form
                form = form.rsplit(" ", 1)[-1]
            if form in words or any(_same_stem(form, word) for word in words):
                return name or form
    return ""
def _same_stem(form: str, word: str) -> bool:
    for cut in range(_STEM_CUT + 1):
        stem = form[: len(form) - cut]
        if len(stem) < _STEM_FLOOR:
            return False
        if word.startswith(stem) and len(word) - len(stem) <= _STEM_TAIL:
            return True
    return False
_IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")
_VIDEO_EXT = (".mp4", ".mov", ".mkv", ".webm", ".avi")
_AUDIO_EXT = (".wav", ".mp3", ".flac", ".ogg", ".m4a")
_REF_LINE_RE = re.compile(r"^\s*(@?\w+)\s*[=:]\s*(.+?)\s*$")
def parse_references(text: str) -> list[dict]:
    out: list[dict] = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = _REF_LINE_RE.match(line)
        if not match:
            continue
        tag = match.group(1)
        tag = tag if tag.startswith("@") else "@" + tag
        rest = match.group(2)
        source, label = rest, ""
        for dash in ("—", "--", " – ", " - "):
            if dash in rest:
                source, label = rest.split(dash, 1)
                break
        source, label = source.strip(), label.strip()
        if not source:
            continue
        lowered = source.lower()
        if lowered.endswith(_VIDEO_EXT):
            kind = "video"
        elif lowered.endswith(_AUDIO_EXT):
            kind = "audio"
        else:
            kind = "image"
        out.append({"tag": tag, "kind": kind, "source": source, "label": label or source})
    return out
def plan(
    settings,
    script: str,
    *,
    beat_seconds: int = DEFAULT_BEAT_SECONDS,
    total_seconds: int = 0,
    style: str = "neutral",
    carry: int = DEFAULT_CARRY,
    references: str = "",
    title: str = "",
    allow_music: bool = True,
    observed: str = "",
    progress=None,
) -> Storyboard:
    from dataclasses import replace
    from .cutter.writer import write_segment
    from .director import (
        build_character_bible,
        build_place_bible,
        make_backend,
        release_backend,
    )
    notes: list[str] = []
    cast: list[dict] = []
    places: list[dict] = []
    refs = parse_references(references)
    scripts = split_script(script, beat_seconds, total_seconds)
    if not scripts:
        return Storyboard(
            title=title, style=style, references=refs,
            report="Nothing to plan: the script is empty.",
        )
    beats = beats_from_scripts(scripts, beat_seconds, style, carry)
    target = f"to a {total_seconds} s target" if total_seconds else "as long as the story needs"
    notes.append(f"{len(beats)} beat(s) of {beat_seconds} s, {target}.")
    base = replace(settings, story=script, style_id=style, allow_music=allow_music)
    _say(progress, "model", "starting the writing model")
    backend, backend_notes = make_backend(base)
    notes.extend(n for n in backend_notes if n)
    offline = type(backend).__name__ == "OfflineBackend"
    answered = 0
    try:
        _say(progress, "cast", "reading the film's cast")
        bible_notes: list = []
        bible = build_character_bible(base, backend, bible_notes)
        cast = [
            {"name": entry.name, "phrase": entry.phrase, "head": entry.head}
            for entry in getattr(bible, "entries", [])
        ]
        _say(progress, "places", "reading the film's places")
        places = build_place_bible(base, backend, bible_notes)
        notes.extend(str(getattr(note, "text", note)) for note in bible_notes)
        brief = _joined(cast_brief(cast), places_brief(places), _footage_brief(observed))
        if observed:
            notes.append("The footage was read as context; the typed script leads.")
        if cast:
            named = ", ".join(entry["name"] or entry["phrase"] for entry in cast)
            notes.append(f"Cast pinned: {named}.")
        previous_prompt = ""
        for beat in beats:
            _say(progress, "beat", f"writing beat {beat.index + 1} of {len(beats)}")
            beat.environment = place_named_in(beat.script, places)
            per_beat = replace(
                base,
                story="",
                duration_seconds=float(beat.seconds),
                extra_instruction=_joined(base.extra_instruction, brief),
            )
            payload = {
                "name": "",
                "mode": beat.mode,
                "seconds": beat.seconds,
                "music": allow_music,
                "style": beat.style or style,
                "camera": beat.camera,
                "max_shots": 0,
                "script": beat.script,
                "prompt": "",
                "refs": [],
                "carried_run": beat.carry,
                "opening": (
                    {"origin": "run", "previous": beats[beat.index - 1].script[:300]}
                    if beat.carry and beat.index > 0
                    else {"origin": "none"}
                ),
            }
            try:
                prompt, _report, warnings, used = write_segment(
                    per_beat,
                    payload,
                    beat.script,
                    previous=previous_sound(previous_prompt),
                    backend=backend,
                )
            except Exception as exc:
                beat.notes.append(f"not written: {type(exc).__name__}: {exc}")
                notes.append(f"WARNING: beat {beat.index + 1} was not written -- {exc}")
                continue
            beat.prompt = prompt or ""
            beat.notes.extend(w for w in (warnings or []) if w)
            answered += 1 if used else 0
            if prompt:
                previous_prompt = prompt
    finally:
        release_backend(backend)
    written = sum(1 for beat in beats if beat.prompt.strip())
    how = ", all on the offline floor." if offline else f", {answered} of them from a model."
    notes.append(f"{written} of {len(beats)} beat(s) came back with a prompt{how}")
    return Storyboard(
        title=title,
        logline=scripts[0][:200],
        style=style,
        beats=beats,
        cast=cast,
        environments=places,
        references=refs,
        report="\n".join(note for note in notes if note),
        used_llm=answered > 0,
    )
def _footage_brief(observed: str) -> str:
    observed = " ".join((observed or "").split())
    if not observed:
        return ""
    if len(observed) > 1200:
        observed = observed[:1200].rsplit(" ", 1)[0] + "…"
    return (
        "FOOTAGE THE DIRECTOR SUPPLIED, for reference only. This is what is visible in "
        "it -- the look of the place, the people and the way it is shot. Match it where "
        "the script does not say otherwise, and never treat it as something that "
        "happens in this clip:\n" + observed
    )
def _joined(*parts: str) -> str:
    return "\n".join(part.strip() for part in parts if part and part.strip())
def _say(progress, stage: str, detail: str) -> None:
    if not callable(progress):
        return
    try:
        progress(stage, detail)
    except Exception:
        pass
OBSERVE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "beats": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["beats"],
}
OBSERVE_INSTRUCTION = (
    "These frames are sampled in order from one video. Write what HAPPENS in it, as a "
    "shot list: one entry per distinct action or camera move, in order, each a sentence "
    "or two of plain description. Describe only what is visible -- who is on screen and "
    "what they look like, where it is, what moves and how the camera moves. No mood, no "
    "story, no guesses about what it is 'about'."
)
def observe_footage(settings, frames, progress=None) -> tuple[str, list[str]]:
    from .director import make_backend, release_backend
    notes: list[str] = []
    if not frames:
        return "", notes
    _say(progress, "vision", f"reading {len(frames)} frame(s) of footage")
    backend, backend_notes = make_backend(settings)
    notes.extend(n for n in backend_notes if n)
    try:
        describe = getattr(backend, "describe_frames", None)
        if not callable(describe):
            notes.append(
                "NOTE: the writing backend cannot look at pictures, so the footage was "
                "not read. Point the director at a vision model (locally that means a "
                "GGUF with an mmproj beside it) or at a provider whose model takes "
                "images."
            )
            return "", notes
        try:
            facts = describe(frames, OBSERVE_SCHEMA, instruction=OBSERVE_INSTRUCTION)
        except Exception as exc:
            notes.append(f"WARNING: the footage could not be read ({exc}).")
            return "", notes
    finally:
        release_backend(backend)
    beats = [str(b).strip() for b in (facts or {}).get("beats") or [] if str(b).strip()]
    summary = str((facts or {}).get("summary") or "").strip()
    if not beats:
        if not summary:
            notes.append("WARNING: the vision model returned nothing usable about the footage.")
            return "", notes
        notes.append("NOTE: the footage came back as one description rather than a shot list.")
        return summary, notes
    notes.append(f"Footage read as {len(beats)} beat(s).")
    return "\n\n".join(beats), notes
