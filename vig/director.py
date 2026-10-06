from __future__ import annotations
import os
import time
import threading
from dataclasses import dataclass, field
from . import h3_spec as spec
from .llm import prompts
from .llm.base import (
    OPENING_SCHEMA,
    BackendError,
    CastRequest,
    PlaceRequest,
    PromptBackend,
)
from .llm.openai_client import OpenAIClientBackend
from .llm.offline import OfflineBackend
from .prompt.pipeline import DirectorRequest, run
from .styles import library
from .styles.schema import DirectorStyle
from .types import (
    CharacterBible,
    CharacterEntry,
    ClipPlan,
    DirectorPlan,
    RefBundle,
    without_labels,
)
BACKEND_GGUF = "gguf"
BACKEND_LOCAL = "local"
BACKEND_EXTERNAL = "external"
BACKEND_LMSTUDIO = "lmstudio"
BACKEND_ALIASES = {
    BACKEND_LMSTUDIO: BACKEND_EXTERNAL,
    BACKEND_GGUF: BACKEND_LOCAL,
}
BACKENDS = (BACKEND_LOCAL, BACKEND_EXTERNAL)
BACKEND_SUBSTITUTIONS = {
    BACKEND_GGUF: (
        "The 'gguf' backend ran the writing model inside ComfyUI's own process and took the "
        "whole server down on the second run of a session -- llama.cpp aborts rather than "
        "raising, so there was nothing to catch. It has been replaced by 'local', which runs "
        "the same .gguf in a child process that can be killed. Nothing else changes; re-save "
        "the workflow to stop seeing this."
    ),
}
def normalise_backend(value: str) -> str:
    value = (value or "").strip()
    return BACKEND_ALIASES.get(value, value)
LEVEL_WARNING = "warning"
LEVEL_INFO = "info"
@dataclass(frozen=True)
class Note:
    level: str
    text: str
    @classmethod
    def read(cls, text: str) -> Note:
        level = LEVEL_WARNING if text.startswith("WARNING") else LEVEL_INFO
        return cls(level=level, text=text)
@dataclass
class DirectorSettings:
    story: str = ""
    dialogue_language: str = "English"
    style_id: str = "neutral"
    mode: str = "auto"
    duration_seconds: float = 5.0
    shots_per_clip: int = 0
    width: int = 1344
    height: int = 768
    allow_music: bool = True
    repair_attempts: int = 2
    elaborate_short_shots: bool = True
    use_llm: bool = True
    llm_backend: str = BACKEND_LOCAL
    seed: int | None = None
    timeout: float = 600.0
    temperature_scale: float = 1.0
    extra_instruction: str = ""
    gguf_model: str = ""
    gguf_n_ctx: int = 16384
    gguf_n_threads: int = 0
    gguf_n_gpu_layers: int = -1
    gguf_extra_dir: str = ""
    server_url: str = "http://127.0.0.1:1234/v1"
    model: str = ""
    server_binary: str = ""
    server_ready_timeout: float = 300.0
    evict_comfy_models: bool = True
    keep_writer_loaded: bool = False
    skills: list = field(default_factory=list)
    written_by: dict = field(default_factory=dict)
    agent_max_turns: int = 24
    agent_max_seconds: int = 240
    refs: RefBundle | None = None
    style_override: str = ""
    warnings: list[str] = field(default_factory=list)
    opening_image: str = ""
    progress: object = None
def resolve_mode(requested: str, refs: RefBundle | None) -> str:
    requested = (requested or "auto").lower()
    if requested != "auto":
        return requested
    if refs is None or refs.is_empty():
        return spec.T2VA
    if refs.videos or refs.audios:
        return spec.REF2VA
    image_count = len(refs.images)
    if image_count >= 2:
        return spec.FL2VA
    if image_count == 1:
        return spec.I2VA
    return spec.T2VA
def resolve_style(settings: DirectorSettings) -> tuple[DirectorStyle, list[str]]:
    if settings.style_override.strip():
        import json
        try:
            return DirectorStyle.from_dict(json.loads(settings.style_override)), []
        except (ValueError, TypeError) as exc:
            return library.get(settings.style_id), [
                f"WARNING: style_override is not valid style JSON ({exc}); "
                f"used {settings.style_id!r} instead."
            ]
    return library.get(settings.style_id), []
def vram_used_mb() -> float | None:
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        free, total = torch.cuda.mem_get_info()
    except Exception:
        return None
    return (total - free) / (1024 * 1024)
def _release_note(backend: PromptBackend) -> str:
    before = getattr(backend, "vig_vram_before_mb", None)
    loaded = getattr(backend, "vig_vram_loaded_mb", None)
    after = vram_used_mb()
    if before is None or after is None:
        return ""
    kept = after - before
    middle = ""
    if loaded is not None:
        held = loaded - before
        middle = f"{loaded:.0f} MiB while writing ({held:+.0f} MiB on the card, "
        middle += "which is the CPU) " if held < 256 else "), "
    return (
        f"Writing model VRAM: {before:.0f} MiB before, {middle}"
        f"{after:.0f} MiB after release ({kept:+.0f} MiB kept)."
    )
def make_backend(settings: DirectorSettings) -> tuple[PromptBackend, list[str]]:
    notes: list[str] = []
    if not settings.use_llm:
        return OfflineBackend(), ["Offline mode: prompt assembled without a model."]
    keep_key = ""
    backend_id = normalise_backend(settings.llm_backend)
    substitution = BACKEND_SUBSTITUTIONS.get((settings.llm_backend or "").strip())
    if substitution:
        notes.append(f"NOTE: {substitution}")
    if backend_id == BACKEND_LOCAL:
        from .llm.models import resolve
        from .llm.server import ManagedServerBackend, ServerSettings
        try:
            model = resolve(settings.gguf_model, settings.gguf_extra_dir)
        except (BackendError, FileNotFoundError, ValueError) as exc:
            notes.append(f"WARNING: {exc} Falling back to the offline writer.")
            return OfflineBackend(), notes
        key = "|".join(
            str(part)
            for part in (
                model.path,
                model.mmproj_path or "",
                settings.server_binary,
                settings.gguf_n_ctx,
                settings.gguf_n_threads,
                settings.gguf_n_gpu_layers,
            )
        )
        if settings.keep_writer_loaded:
            kept = _take_kept(key)
            if kept is not None:
                kept.seed = settings.seed
                kept.temperature_scale = settings.temperature_scale
                kept.extra_instruction = settings.extra_instruction
                kept.timeout = settings.timeout
                try:
                    kept.probe()
                except Exception:
                    stop_backend(kept)
                else:
                    kept.vig_keep_key = key
                    _set_live(kept)
                    notes.append(
                        f"The writing model was already loaded ({model.identifier}); "
                        "kept from the last press."
                    )
                    return kept, notes
        baseline = vram_used_mb()
        try:
            backend = ManagedServerBackend(
                ServerSettings(
                    model_path=model.path,
                    binary=settings.server_binary,
                    tool_calls=True,
                    n_ctx=settings.gguf_n_ctx,
                    n_threads=settings.gguf_n_threads,
                    n_gpu_layers=settings.gguf_n_gpu_layers,
                    ready_timeout=settings.server_ready_timeout,
                    mmproj_path=model.mmproj_path or "",
                    model_size_bytes=model.size_bytes,
                    evict_comfy_models=settings.evict_comfy_models,
                ),
                timeout=settings.timeout,
                seed=settings.seed,
                temperature_scale=settings.temperature_scale,
                extra_instruction=settings.extra_instruction,
            )
        except BackendError as exc:
            notes.append(f"WARNING: {exc} Falling back to the offline writer.")
            return OfflineBackend(), notes
        backend.vig_vram_before_mb = baseline
        keep_key = key if settings.keep_writer_loaded else ""
        label = f"local server ({backend.server.runner}) on {model.identifier}"
    else:
        from .llm.keys import remembered_key
        backend = OpenAIClientBackend(
            base_url=settings.server_url,
            model=settings.model,
            timeout=settings.timeout,
            seed=settings.seed,
            temperature_scale=settings.temperature_scale,
            extra_instruction=settings.extra_instruction,
            api_key=remembered_key(settings.server_url),
        )
        label = f"OpenAI-compatible server at {backend.base_url}"
    try:
        active = backend.probe()
    except BackendError as exc:
        release_backend(backend)
        notes.append(f"WARNING: {exc} Falling back to the offline writer.")
        return OfflineBackend(), notes
    notes.append(f"{label}; model {active!r}.")
    notes.extend(getattr(backend, "notes", ()))
    if keep_key:
        backend.vig_keep_key = keep_key
    _set_live(backend)
    return backend, notes
_LIVE_BACKEND: PromptBackend | None = None
_LIVE_LOCK = threading.Lock()
def live_backend() -> PromptBackend | None:
    with _LIVE_LOCK:
        return _LIVE_BACKEND
def _set_live(backend: PromptBackend) -> None:
    global _LIVE_BACKEND
    with _LIVE_LOCK:
        _LIVE_BACKEND = backend
_KEPT: PromptBackend | None = None
_KEPT_AT: float = 0.0
_KEPT_KEY: str = ""
_KEPT_LOCK = threading.Lock()
KEEP_SECONDS = 600.0
def kept_backend() -> PromptBackend | None:
    with _KEPT_LOCK:
        return _KEPT
def kept_idle_seconds() -> float:
    with _KEPT_LOCK:
        return time.time() - _KEPT_AT if _KEPT is not None else 0.0
def drop_kept_backend(why: str = "") -> str:
    global _KEPT, _KEPT_KEY, _KEPT_AT
    with _KEPT_LOCK:
        backend, _KEPT, _KEPT_KEY, _KEPT_AT = _KEPT, None, "", 0.0
    if backend is None:
        return ""
    stop_backend(backend)
    tail = f" ({why})" if why else ""
    return f"The writing model that was kept loaded has been put down{tail}."
def _park(backend: PromptBackend) -> bool:
    global _KEPT, _KEPT_KEY, _KEPT_AT
    key = str(getattr(backend, "vig_keep_key", "") or "")
    if not key:
        return False
    with _KEPT_LOCK:
        if _KEPT is not None and _KEPT is not backend:
            return False
        _KEPT, _KEPT_KEY, _KEPT_AT = backend, key, time.time()
    return True
def _take_kept(key: str) -> PromptBackend | None:
    global _KEPT, _KEPT_KEY, _KEPT_AT
    with _KEPT_LOCK:
        if _KEPT is None:
            return None
        if _KEPT_KEY == key:
            backend, _KEPT, _KEPT_KEY, _KEPT_AT = _KEPT, None, "", 0.0
            return backend
        stale, _KEPT, _KEPT_KEY, _KEPT_AT = _KEPT, None, "", 0.0
    stop_backend(stale)
    return None
def stop_backend(backend: PromptBackend) -> None:
    backend.vig_keep_key = ""
    release_backend(backend)
def release_backend(backend: PromptBackend) -> None:
    global _LIVE_BACKEND
    with _LIVE_LOCK:
        if _LIVE_BACKEND is backend:
            _LIVE_BACKEND = None
    if getattr(backend, "vig_keep_key", "") and _park(backend):
        if getattr(backend, "vig_vram_before_mb", None) is not None:
            backend.vig_vram_loaded_mb = vram_used_mb()
        return
    if getattr(backend, "vig_vram_before_mb", None) is not None:
        backend.vig_vram_loaded_mb = vram_used_mb()
    release = getattr(backend, "release", None)
    if callable(release):
        release()
_SEEN_FRAMES: dict = {}
_SEEN_LOCK = threading.Lock()
_SEEN_KEEP = 8
def _frame_identity(path: str):
    try:
        stat = os.stat(path)
    except OSError:
        return None
    return (os.path.abspath(path), stat.st_mtime_ns, stat.st_size)
def read_opening_frame(
    settings: DirectorSettings,
    backend: PromptBackend,
    notes: list[Note],
) -> dict:
    path = str(getattr(settings, "opening_image", "") or "").strip()
    if not path:
        return {}
    identity = _frame_identity(path)
    if identity is not None:
        with _SEEN_LOCK:
            remembered = _SEEN_FRAMES.get(identity)
        if remembered is not None:
            notes.append(
                Note.read(
                    "The opening frame was read earlier and has not changed since; "
                    "what it shows still stands: "
                    + "; ".join(
                        f"{s['name']}: {s['phrase']}"
                        for s in remembered.get("subjects") or []
                    )
                )
            )
            return dict(remembered)
    named = getattr(backend, "name", "?")
    describe = getattr(backend, "describe_frames", None)
    if not callable(describe):
        notes.append(
            Note.read(
                f"NOTE: backend {named!r} cannot look at pictures, so this clip's "
                "opening frame was not read and its subjects come from the script "
                "alone. Point the writer at a model with an mmproj beside it."
            )
        )
        return {}
    try:
        from PIL import Image
        with Image.open(path) as handle:
            frame = handle.convert("RGB")
    except Exception as exc:
        notes.append(
            Note.read(f"WARNING: the opening frame {path!r} would not open ({exc}).")
        )
        return {}
    try:
        facts = describe(
            [frame], OPENING_SCHEMA, instruction=prompts.opening_instruction()
        )
    except Exception as exc:
        notes.append(
            Note.read(
                f"WARNING: {named!r} could not read the opening frame ({exc}); the "
                "clip's subjects come from the script alone."
            )
        )
        return {}
    subjects = []
    for item in (facts or {}).get("subjects") or []:
        if not isinstance(item, dict):
            continue
        phrase = _place_phrase(item.get("appearance"))
        if not phrase:
            continue
        subjects.append({"name": _one_line(item.get("name")) or phrase, "phrase": phrase})
    scene = _place_phrase((facts or {}).get("scene"))
    if not subjects and not scene:
        notes.append(
            Note.read(f"NOTE: {named!r} saw nothing it could report in the opening frame.")
        )
        return {}
    notes.append(
        Note.read(
            "The opening frame was READ, and what it shows outranks the script: "
            + "; ".join(f"{s['name']}: {s['phrase']}" for s in subjects)
            + (f" -- {scene}" if scene else "")
        )
    )
    seen = {"subjects": subjects, "scene": scene}
    if identity is not None:
        with _SEEN_LOCK:
            _SEEN_FRAMES[identity] = dict(seen)
            while len(_SEEN_FRAMES) > _SEEN_KEEP:
                _SEEN_FRAMES.pop(next(iter(_SEEN_FRAMES)))
    return seen
def _bind_what_was_seen(
    bible: CharacterBible, seen: dict | None, notes: list[Note]
) -> CharacterBible:
    subjects = (seen or {}).get("subjects") or []
    if not subjects:
        return bible
    if len(subjects) > 1:
        notes.append(
            Note.read(
                f"NOTE: the opening frame showed {len(subjects)} subjects, so which of "
                "them the story means was left unanswered and the cast keeps its own "
                "wording. Name them in the script to pin them."
            )
        )
        return bible
    phrase = str(subjects[0].get("phrase") or "").strip()
    if not phrase:
        return bible
    if bible.is_empty():
        entry = CharacterEntry.build(
            name=str(subjects[0].get("name") or "").strip(), appearance=phrase
        )
        if not entry.phrase:
            return bible
        notes.append(
            Note.read(f"The cast comes from the opening frame alone: {entry.phrase}")
        )
        return CharacterBible(entries=[entry], source=f"{bible.source}+frame")
    was = bible.entries[0]
    bound = CharacterEntry.build(
        name=was.name, appearance=phrase,
        aliases=list(was.aliases), behaviour=was.behaviour,
        name_en=was.latin_name,
    )
    if not bound.phrase:
        return bible
    notes.append(
        Note.read(
            f"The opening frame OVERRULES the script for {bound.name or 'the subject'}: "
            f"{was.phrase!r} -> {bound.phrase!r}"
        )
    )
    return CharacterBible(
        entries=[bound, *bible.entries[1:]], source=f"{bible.source}+frame"
    )
def build_character_bible(
    settings: DirectorSettings,
    backend: PromptBackend,
    notes: list[Note],
    seen: dict | None = None,
) -> CharacterBible:
    request = CastRequest(story=without_labels(settings.story))
    offline = OfflineBackend()
    raw: list[dict] = []
    source = ""
    answered = False
    describe = getattr(backend, "describe_cast", None)
    if callable(describe):
        try:
            raw = list(describe(request) or [])
            source = getattr(backend, "name", "backend")
            answered = True
        except Exception as exc:
            notes.append(
                Note.read(
                    f"WARNING: the cast stage of backend {getattr(backend, 'name', '?')!r} "
                    f"failed ({exc}); read the cast from the story instead."
                )
            )
    if not raw and not answered:
        raw = offline.describe_cast(request)
        source = offline.name
    bible = CharacterBible.from_dicts(raw, source=source or offline.name)
    bible = _bind_what_was_seen(bible, seen, notes)
    if not bible.is_empty():
        notes.append(
            Note.read(
                f"Character bible ({bible.source}), applied to every clip: "
                + "; ".join(bible.as_lines())
            )
        )
    return bible
def build_place_bible(
    settings: DirectorSettings,
    backend: PromptBackend,
    notes: list[Note],
) -> list[dict]:
    named = getattr(backend, "name", "?")
    describe = getattr(backend, "describe_places", None)
    if not callable(describe):
        notes.append(
            Note.read(
                f"No place bible: backend {named!r} does not read places, so each beat "
                "describes its own location in its own words."
            )
        )
        return []
    request = PlaceRequest(story=without_labels(settings.story))
    try:
        raw = list(describe(request) or [])
    except Exception as exc:
        notes.append(
            Note.read(
                f"WARNING: the places stage of backend {named!r} failed ({exc}); "
                "the film's locations were not pinned."
            )
        )
        return []
    places: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        phrase = _place_phrase(item.get("appearance"))
        if not phrase:
            continue
        aliases = [
            _one_line(alias) for alias in item.get("aliases") or [] if _one_line(alias)
        ]
        places.append(
            {
                "name": _one_line(item.get("name")) or phrase,
                "phrase": phrase,
                "sound": _one_line(item.get("sound")),
                "aliases": list(dict.fromkeys(aliases)),
            }
        )
    if places:
        notes.append(
            Note.read(
                f"Place bible ({named}), applied to every beat: "
                + "; ".join(f"{p['name']}: {p['phrase']}" for p in places)
            )
        )
    else:
        notes.append(
            Note.read(f"The places stage ({named}) found no recurring location to pin.")
        )
    return places
def _one_line(value) -> str:
    return " ".join(str(value or "").split())
def _place_phrase(value) -> str:
    return _one_line(value).rstrip(" .;,")
def _request(
    settings: DirectorSettings,
    style: DirectorStyle,
    *,
    story: str,
    mode: str,
    duration_seconds: float,
    refs: RefBundle | None,
    cast: CharacterBible | None = None,
) -> DirectorRequest:
    return DirectorRequest(
        story=story,
        mode=mode,
        duration_seconds=duration_seconds,
        shot_count=settings.shots_per_clip or None,
        style=style,
        refs=refs,
        cast=cast,
        allow_music=settings.allow_music,
        elaborate_short_shots=settings.elaborate_short_shots,
        width=settings.width,
        height=settings.height,
        repair_attempts=settings.repair_attempts,
    )
def _finalize(plan: DirectorPlan, notes: list[Note]) -> DirectorPlan:
    plan.report = "\n".join(note.text for note in notes)
    plan.warnings = [note.text for note in notes if note.level == LEVEL_WARNING]
    return plan
def direct(settings: DirectorSettings, backend: PromptBackend | None = None) -> DirectorPlan:
    if backend is not None:
        return _direct(settings, backend, [])
    backend, backend_notes = make_backend(settings)
    plan = None
    try:
        plan = _direct(settings, backend, backend_notes)
        return plan
    finally:
        release_backend(backend)
        measured = _release_note(backend)
        if plan is not None and measured:
            plan.report = f"{plan.report}\n{measured}".strip() if plan.report else measured
def _direct(
    settings: DirectorSettings, backend: PromptBackend, backend_notes: list[str]
) -> DirectorPlan:
    notes = [Note.read(text) for text in settings.warnings]
    notes.extend(Note.read(text) for text in backend_notes)
    style, style_notes = resolve_style(settings)
    notes.extend(Note.read(text) for text in style_notes)
    mode = resolve_mode(settings.mode, settings.refs)
    plan = DirectorPlan(
        story=settings.story,
        style_id=style.id,
        mode=mode,
    )
    seen = read_opening_frame(settings, backend, notes)
    plan.character_bible = build_character_bible(settings, backend, notes, seen=seen)
    scene = str(seen.get("scene") or "").strip()
    if scene:
        from dataclasses import replace as _replace
        settings = _replace(
            settings,
            extra_instruction=(
                (settings.extra_instruction + "\n\n" if settings.extra_instruction else "")
                + "THE CLIP'S FIRST FRAME IS AN ACTUAL PICTURE, and it shows: "
                + scene
                + ". [Shot 1] opens on exactly this and develops forward from it. Do not "
                "describe a different place, and do not contradict what is in it."
            ),
        )
    return _direct_with_agent(settings, backend, style, mode, notes, plan)
def _notify(settings, stage: str, detail: str, step=None, total=None) -> None:
    callback = getattr(settings, "progress", None)
    if callback is None:
        return
    try:
        if step is None:
            callback(stage, detail)
        else:
            callback(stage, detail, step, total)
    except TypeError:
        try:
            callback(stage, detail)
        except Exception:
            pass
    except Exception:
        pass
def _turn_progress(settings):
    if getattr(settings, "progress", None) is None:
        return None
    def report(turn, max_turns):
        _notify(settings, "turn", f"agent turn {turn}/{max_turns}", turn, max_turns)
    return report
def _tool_progress(settings):
    if getattr(settings, "progress", None) is None:
        return None
    def report(name: str, arguments) -> None:
        detail = str(name or "tool")
        if isinstance(arguments, dict):
            skill = str(arguments.get("skill_id") or "").strip()
            section = str(arguments.get("section") or "").strip()
            if skill:
                detail = f"{detail} {skill}" + (f" § {section}" if section else "")
        _notify(settings, "tool", detail)
    return report
def _direct_with_agent(settings, backend, style, mode, notes, plan) -> DirectorPlan:
    from .agent.loop import run_agent
    from .agent.tools import AgentContext
    from .styles.schema import opening_budget
    context = AgentContext(
        story=settings.story,
        mode=mode,
        duration_seconds=settings.duration_seconds,
        style=style,
        refs=settings.refs,
        cast=list(plan.character_bible.entries),
        shot_count=settings.shots_per_clip or None,
        allow_music=settings.allow_music,
        skills=list(settings.skills or []),
        extra_instruction=settings.extra_instruction,
    )
    timing = context.resolved_timing()
    context.resolved_choices = _resolved_choices(settings, style, timing)
    clip = ClipPlan(
        mode=mode,
        timing=timing,
        style_id=style.id,
        style_opening=style.style_opening(opening_budget(timing.duration)),
        cast=list(plan.character_bible.entries),
        width=settings.width,
        height=settings.height,
    )
    probe = getattr(backend, "supports_tools", None)
    if probe is not None and not probe():
        notes.append(
            Note.read(
                "WARNING: this model and server did not return a tool call, so the agent "
                "engine has nothing to drive. Used the pipeline engine instead. A llama.cpp "
                "'llama-server' binary in a model folder is the reliable route; the pure "
                "Python runner only manages tool calls through a chat format the model may "
                "not be trained on."
            )
        )
        return _direct_with_pipeline_fallback(settings, backend, style, mode, notes, plan)
    try:
        _notify(
            settings,
            "stage",
            f"agent engine: writing (up to {settings.agent_max_turns} turns)",
        )
        result = run_agent(
            backend,
            context,
            max_turns=settings.agent_max_turns,
            max_seconds=settings.agent_max_seconds,
            progress=_turn_progress(settings),
            on_tool=_tool_progress(settings),
        )
    except BackendError as exc:
        notes.append(
            Note.read(f"WARNING: {exc} Fell back to the pipeline engine for this run.")
        )
        return _direct_with_pipeline_fallback(settings, backend, style, mode, notes, plan)
    notes.extend(Note.read(text) for text in result.notes)
    if result.trace is not None:
        notes.append(Note.read(result.trace.summary()))
        result.trace.write()
    if not result.prompt:
        notes.append(
            Note.read("WARNING: the agent returned nothing; used the pipeline engine instead.")
        )
        return _direct_with_pipeline_fallback(settings, backend, style, mode, notes, plan)
    clip.prompt = result.prompt
    if result.validation is not None and result.validation.violations:
        notes.append(Note.read(result.validation.report()))
    if not timing.in_trained_range:
        notes.append(Note.read(timing.out_of_range_warning()))
    plan.clips.append(clip)
    return _finalize(plan, notes)
def _direct_with_pipeline_fallback(settings, backend, style, mode, notes, plan) -> DirectorPlan:
    _notify(settings, "stage", "writing the prompt (pipeline engine)")
    result = run(
        _request(
            settings,
            style,
            story=settings.story,
            mode=mode,
            duration_seconds=settings.duration_seconds,
            refs=settings.refs,
            cast=plan.character_bible,
        ),
        backend=backend,
    )
    notes.extend(Note.read(text) for text in result.stage_notes)
    if result.validation.violations:
        notes.append(Note.read(result.validation.report()))
    plan.clips.append(result.clip)
    return _finalize(plan, notes)
def _resolved_choices(settings, style, timing) -> dict:
    return {
        "aspect ratio": f"{settings.width}x{settings.height}",
        "total duration": f"{timing.duration:.2f}s ({timing.frame_count} frames at 24 fps)",
        "shot count": timing.shot_count,
        "visual style": style.visual_style,
        "background music": "yes" if settings.allow_music else "no, use N/A",
        "dialogue language": settings.dialogue_language,
        "output language": "English body, dialogue in its original language",
    }
