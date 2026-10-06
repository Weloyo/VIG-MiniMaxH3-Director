from __future__ import annotations
import re
from collections import Counter
from dataclasses import dataclass, field, replace
from .. import guides
from .. import h3_spec as spec
from ..interrupt import raise_if_interrupted
from ..llm.base import PlanRequest, PromptBackend, ShotRequest, SoundRequest
from ..llm.offline import OfflineBackend
from ..styles.schema import DEFAULT_STYLE, DirectorStyle
from ..text import sentences, shot_directions
from ..styles.schema import opening_budget
from ..timing import Timing, resolve_timing
from ..types import CharacterBible, CharacterEntry, ClipPlan, DialogueLine, RefBundle, ShotPlan
from . import ref_sections
from .renderer import (
    DIALOGUE_PLACEHOLDER,
    PLACEHOLDER_RE,
    render_dialogue,
    render_prompt,
    sanitize_prose,
)
from .validator import ValidationResult, field_words, validate
@dataclass
class DirectorRequest:
    story: str
    mode: str = spec.T2VA
    duration_seconds: float = 5.0
    shot_count: int | None = None
    style: DirectorStyle = field(default_factory=lambda: DEFAULT_STYLE)
    dialogue: list[DialogueLine] = field(default_factory=list)
    refs: RefBundle | None = None
    cast: CharacterBible | None = None
    allow_music: bool = True
    width: int = 1344
    height: int = 768
    repair_attempts: int = 2
    elaborate_short_shots: bool = True
@dataclass
class PipelineResult:
    clip: ClipPlan
    validation: ValidationResult
    stage_notes: list[str] = field(default_factory=list)
    @property
    def prompt(self) -> str:
        return self.clip.prompt
    def report(self) -> str:
        lines = list(self.stage_notes)
        lines.append(self.validation.report())
        return "\n".join(lines)
def run(
    request: DirectorRequest,
    backend: PromptBackend | None = None,
) -> PipelineResult:
    backend = backend or OfflineBackend()
    fallback = OfflineBackend()
    notes: list[str] = []
    style = request.style or DEFAULT_STYLE
    directions = shot_directions(request.story)
    requested_shots = request.shot_count or (len(directions) or None)
    timing = resolve_timing(
        request.duration_seconds,
        shot_count=requested_shots,
        avg_shot_seconds=style.editing.avg_shot_len_s,
    )
    if not timing.in_trained_range:
        notes.append(timing.out_of_range_warning())
    if requested_shots and timing.shot_count != requested_shots:
        notes.append(
            f"NOTE: {requested_shots} shots do not fit in {timing.duration:.2f}s; "
            f"reduced to {timing.shot_count}."
        )
    if directions:
        with_camera = sum(1 for d in directions if d.has_camera)
        notes.append(
            f"NOTE: the brief lays out {len(directions)} shot(s) itself; they are used as "
            "written and the planner only fills in subjects, camera and dialogue placement."
            + (
                f" {with_camera} of them name their own camera move, which overrides the style."
                if with_camera
                else ""
            )
            + (
                f" Only the first {timing.shot_count} fit the duration."
                if len(directions) > timing.shot_count
                else ""
            )
        )
    if request.shot_count and directions and request.shot_count != len(directions):
        notes.append(
            f"NOTE: the brief lays out {len(directions)} shot(s) but shots_per_clip is set to "
            f"{request.shot_count}; the widget wins. Set it to 0 to follow the brief."
        )
    cast = _clip_cast(request, notes)
    shots = _plan(request, timing, style, backend, fallback, notes, cast, directions)
    shots = _expand(request, timing, style, shots, backend, fallback, notes, cast)
    soundscape, music = _sound(request, timing, style, shots, backend, fallback, notes)
    clip = ClipPlan(
        mode=request.mode,
        timing=timing,
        shots=shots,
        style_id=style.id,
        soundscape=soundscape,
        music=music,
        style_opening=style.style_opening(opening_budget(timing.duration)),
        cast=cast,
        width=request.width,
        height=request.height,
    )
    if request.mode.lower() == spec.REF2VA:
        definitions, summary, retention = ref_sections.build(request.refs, timing.shot_count)
        if not definitions:
            notes.append(
                "WARNING: ref2va was requested but no references are connected. The three "
                "reference sections have nothing to describe; connect a Reference Analyzer "
                "or switch the mode to t2va."
            )
        clip.subject_definitions = definitions
        clip.summary = summary
        clip.retention_analysis = retention
    clip.prompt = render_prompt(clip)
    result = _validate_and_repair(clip, request, backend, fallback, notes)
    return result
def _stage(attempts: list, default, subject: str, notes: list[str]):
    for i, attempt in enumerate(attempts):
        raise_if_interrupted()
        try:
            return attempt()
        except Exception as exc:
            used = "used offline output" if i + 1 < len(attempts) else "used a fixed default"
            notes.append(f"WARNING: {subject} failed ({exc}); {used}.")
    return default
def _reference_defines(entry: CharacterEntry, refs: RefBundle | None) -> bool:
    for label in (refs.labels if refs is not None else []):
        description = label.description or ""
        if not description:
            continue
        if entry.appears_in(description):
            return True
        if entry.head and re.search(rf"\b{re.escape(entry.head)}\b", description, re.IGNORECASE):
            return True
    return False
def _clip_cast(request, notes: list[str] | None = None) -> list[CharacterEntry]:
    if request.cast is None or request.cast.is_empty():
        return []
    entries = request.cast.entries_for(request.story)
    if request.mode.lower() != spec.REF2VA:
        return entries
    kept = [entry for entry in entries if not _reference_defines(entry, request.refs)]
    stood_aside = [entry.name for entry in entries if entry not in kept]
    if stood_aside and notes is not None:
        notes.append(
            "NOTE: the references define " + ", ".join(stood_aside) + ", so the character "
            "bible stands aside for them here; their appearance is <Subject N>'s to fix."
        )
    return kept
def _introduce_cast(shots: list[ShotPlan], cast: list[CharacterEntry], notes: list[str]) -> None:
    if not shots or not cast:
        return
    written = " ".join(shot.prose for shot in shots)
    for entry in cast:
        if entry.states_appearance(written):
            continue
        target = next((s for s in shots if entry.appears_in(s.prose)), shots[0])
        target.prose = f"{entry.introduction()} {target.prose}".strip()
        notes.append(
            f"NOTE: shot {target.index} did not describe {entry.name}; the cast wording "
            f"({entry.phrase}) was stated so this clip shows the same subject as the others."
        )
_BEAT_STOPWORDS = frozenset(
    """
    a an the and or but so then that this these those which who whom whose what
    is are was were be been being am has have had do does did will would can could
    of to from into onto at on in by for with without over under across through
    about after before during until since while when where as if not no
    he she it they them him her his hers its their we us our you your i me my
    """.split()
)
_BEAT_WORD_RE = re.compile(r"[a-z][a-z'-]*")
def _beat_words(text: str) -> set[str]:
    return {w for w in _BEAT_WORD_RE.findall((text or "").lower()) if w not in _BEAT_STOPWORDS}
_BEAT_OVERRUN_RATIO = 0.5
def _overrun_hits(shot: ShotPlan, later: ShotPlan) -> set[str]:
    prose = _beat_words(shot.prose)
    if not prose:
        return set()
    distinctive = _beat_words(later.beat) - _beat_words(shot.beat)
    if not distinctive:
        return set()
    hits = distinctive & prose
    return hits if len(hits) / len(distinctive) >= _BEAT_OVERRUN_RATIO else set()
def _cut_trespassing_sentences(shots: list[ShotPlan], backend, notes: list[str]) -> None:
    select = getattr(backend, "select_trespassing", None)
    if select is None:
        return
    for position, shot in enumerate(shots):
        later = [s for s in shots[position + 1 :] if _overrun_hits(shot, s)]
        if not later:
            continue
        lines = sentences(shot.prose)
        if len(lines) < 2:
            continue
        picked = _stage(
            [lambda: select(lines, [s.beat for s in later])],
            [],
            f"trespass check on shot {shot.index}",
            notes,
        )
        camera = (shot.camera_sentence() or "").strip().rstrip(".")
        cut: list[str] = []
        for number in dict.fromkeys(picked):
            if not 1 <= number <= len(lines):
                continue
            sentence = lines[number - 1]
            if PLACEHOLDER_RE.search(sentence):
                continue
            if camera and camera.lower() in sentence.lower():
                continue
            cut.append(sentence)
        if not cut or len(cut) >= len(lines):
            continue
        shot.prose = " ".join(line for line in lines if line not in cut)
        listed = "; ".join(f'"{s[:60]}..."' if len(s) > 60 else f'"{s}"' for s in cut)
        notes.append(
            f"NOTE: shot {shot.index} carried {len(cut)} sentence(s) belonging to shot "
            f"{', '.join(str(s.index) for s in later)}; removed here: {listed}"
        )
def _flag_beat_overrun(shots: list[ShotPlan], notes: list[str]) -> None:
    for position, shot in enumerate(shots):
        for later in shots[position + 1 :]:
            hits = _overrun_hits(shot, later)
            if not hits:
                continue
            notes.append(
                f"NOTE: shot {shot.index} already carries what shot {later.index}'s beat holds "
                f"({', '.join(sorted(hits))}); its own beat ends before that. Whatever those "
                "words are -- the action, or the subject the later shot introduces -- the clip "
                "spends two shots on it unless one of them is cut."
            )
def _short_reference(entry: CharacterEntry) -> str:
    words = (entry.latin_name or entry.name or "").strip().split()
    if words and words[0].lower() in ("a", "an", "the"):
        words = words[1:]
    if not words or len(words) > 3:
        return ""
    short = " ".join(words)
    return short if short[:1].isupper() else f"the {short}"
_DESCRIPTION_MIN_WORDS = 4
def _phrase_pattern(entry: CharacterEntry):
    described = [
        form
        for form in [entry.phrase, *entry.aliases]
        if len(form.split()) >= _DESCRIPTION_MIN_WORDS
    ]
    forms = sorted(set(described), key=len, reverse=True)
    alternatives = []
    for form in forms:
        words = form.split()
        if words[0].lower() in ("a", "an", "the"):
            lead, words = r"(?:a|an|the)\s+", words[1:]
        else:
            lead = r"(?:(?:a|an|the)\s+)?"
        if not words:
            continue
        spelled = r"\s+".join(re.escape(word) for word in words)
        tail = ",?" if "," in form else ""
        alternatives.append(rf"\b{lead}{spelled}\b{tail}")
    if not alternatives:
        return None
    return re.compile("|".join(alternatives), re.IGNORECASE)
def _canonicalise_offstage_cast(
    request, shots: list[ShotPlan], cast: list[CharacterEntry], notes: list[str]
) -> None:
    bible = getattr(request, "cast", None)
    if not shots or bible is None or bible.is_empty():
        return
    ref_mode = request.mode.lower() == spec.REF2VA
    seen: dict[str, int] = {}
    for other in bible.entries:
        for head in other.heads():
            seen[head] = seen.get(head, 0) + 1
    for entry in bible.entries:
        if entry in cast:
            continue
        if ref_mode and _reference_defines(entry, request.refs):
            continue
        if any(entry.states_appearance(shot.prose) for shot in shots):
            continue
        by_head = all(seen.get(head, 0) == 1 for head in entry.heads())
        for shot in shots:
            rewritten = entry.canonicalise(shot.prose, by_head=by_head)
            if rewritten == shot.prose:
                continue
            shot.prose = rewritten
            notes.append(
                f"NOTE: shot {shot.index} mentioned {entry.name}, which this clip's beats "
                f"do not cover; the cast wording ({entry.phrase}) was used so the subject "
                "matches the clip it came from."
            )
            break
def _collapse_repeat_introductions(
    shots: list[ShotPlan], cast: list[CharacterEntry], notes: list[str]
) -> None:
    if not shots or not cast:
        return
    for entry in cast:
        pattern = _phrase_pattern(entry)
        short = _short_reference(entry)
        if pattern is None or not short:
            continue
        kept = False
        collapsed: list[int] = []
        for shot in shots:
            out: list[str] = []
            position = 0
            for match in pattern.finditer(shot.prose):
                if not kept:
                    kept = True
                    continue
                replacement = short
                if match.group(0)[:1].isupper():
                    replacement = replacement[:1].upper() + replacement[1:]
                out.append(shot.prose[position : match.start()])
                out.append(replacement)
                position = match.end()
                collapsed.append(shot.index)
            if out:
                out.append(shot.prose[position:])
                shot.prose = "".join(out)
        if collapsed:
            where = ", ".join(str(index) for index in dict.fromkeys(collapsed))
            notes.append(
                f"NOTE: the cast wording for {entry.name} was written again in shot {where}; "
                f'shortened to "{short}", because the description belongs to the first '
                "mention and a repeat of it spends the shot's words saying nothing new."
            )
def _plan(
    request, timing: Timing, style, backend, fallback, notes, cast=None, directions=None
) -> list[ShotPlan]:
    directions = list(directions or [])[: timing.shot_count]
    plan_request = PlanRequest(
        story=request.story,
        shot_count=timing.shot_count,
        duration_seconds=timing.duration,
        style_clauses=style.render_clauses(),
        style_camera_moves=style.camera.moves,
        mode=request.mode,
        dialogue_lines=[d.text for d in request.dialogue],
        reference_facts=_ref_facts(request.refs),
        cast=list(cast or []),
        fixed_beats=[direction.text for direction in directions],
    )
    raw = _stage(
        [lambda: backend.plan_shots(plan_request), lambda: fallback.plan_shots(plan_request)],
        [],
        f"planner backend {backend.name!r}",
        notes,
    )
    raw = list(raw)[: timing.shot_count]
    while len(raw) < timing.shot_count:
        raw.append({"beat": "The scene continues.", "dialogue_indices": []})
    shots: list[ShotPlan] = []
    for i, entry in enumerate(raw, start=1):
        motion, amplitude, speed = style.preferred_camera(i)
        proposed = entry.get("camera_motion")
        if proposed in spec.CAMERA_MOTIONS:
            motion = proposed
        elif proposed:
            notes.append(
                f"NOTE: shot {i} proposed camera motion {proposed!r}, which is not in the H3 "
                f"vocabulary; used {motion!r} from the style instead."
            )
        direction = directions[i - 1] if i <= len(directions) else None
        if direction is not None and direction.has_camera:
            motion = direction.motion
            amplitude, speed = direction.amplitude, direction.speed
        elif direction is not None and direction.marker:
            notes.append(
                f"NOTE: shot {i} is marked {direction.marker!r}, which names no camera move "
                f"this format knows; used {motion!r} from the style instead. The vocabulary is "
                f"{list(spec.CAMERA_MOTIONS)}."
            )
        beat = (
            directions[i - 1].text
            if i <= len(directions)
            else str(entry.get("beat", "")).strip()
        )
        shots.append(
            ShotPlan(
                index=i,
                beat=beat,
                camera_motion=motion,
                camera_amplitude=amplitude,
                camera_speed=speed,
                subjects=[str(s) for s in entry.get("subjects", []) if s],
                diegetic_sound=str(entry.get("diegetic_sound", "")).strip(),
                dialogue=_dialogue_for(request.dialogue, entry.get("dialogue_indices"), i),
            )
        )
    _ensure_all_dialogue_placed(request.dialogue, shots, notes)
    _assign_speaker_ids(shots)
    return shots
def _dialogue_for(lines: list[DialogueLine], indices, shot_index: int) -> list[DialogueLine]:
    out: list[DialogueLine] = []
    for raw in indices or []:
        try:
            idx = int(raw) - 1
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(lines):
            out.append(replace(lines[idx], shot_index=shot_index))
    return out
def _ensure_all_dialogue_placed(lines, shots, notes) -> None:
    if not lines:
        return
    placed = Counter(d.text for shot in shots for d in shot.dialogue)
    missing = []
    for line in lines:
        if placed[line.text] > 0:
            placed[line.text] -= 1
        else:
            missing.append(line)
    if not missing:
        return
    notes.append(
        f"NOTE: the planner left {len(missing)} dialogue line(s) unassigned; appended to the "
        "last shot so nothing is dropped."
    )
    for line in missing:
        shots[-1].dialogue.append(replace(line, shot_index=shots[-1].index))
def _assign_speaker_ids(shots: list[ShotPlan]) -> None:
    mapping: dict[str, str] = {}
    for shot in shots:
        for line in shot.dialogue:
            key = line.speaker or "default"
            if key not in mapping:
                mapping[key] = f"S{len(mapping) + 1}"
            line.speaker = mapping[key]
def _expand(
    request, timing, style, shots, backend, fallback, notes, cast_entries=None
) -> list[ShotPlan]:
    clauses = style.render_clauses()
    running: list[str] = []
    cast_entries = list(cast_entries or [])
    ref_mode = request.mode.lower() == spec.REF2VA
    opening = style.style_opening(opening_budget(timing.duration)) if ref_mode else ""
    overhead = _ref_overhead(shots, opening) if ref_mode else 0
    word_target = _ref_word_target(len(shots), overhead) if ref_mode else 0
    cast = _cast_list(shots, [entry.phrase for entry in cast_entries])
    for position, shot in enumerate(shots):
        slot = timing.shots[shot.index - 1]
        placeholders = [
            DIALOGUE_PLACEHOLDER % (i + 1) for i in range(len(shot.dialogue))
        ]
        shot_request = ShotRequest(
            index=shot.index,
            total_shots=len(shots),
            beat=shot.beat,
            duration_seconds=slot.duration,
            camera_sentence=shot.camera_sentence(),
            style_clauses=clauses,
            continuity=_continuity_note(cast, running),
            dialogue_placeholders=placeholders,
            reference_facts=_ref_facts(request.refs),
            is_first=shot.index == 1,
            is_last=shot.index == len(shots),
            word_target=word_target,
            cast=cast_entries,
            later_beats=[s.beat for s in shots[position + 1 :] if s.beat],
        )
        prose = _stage(
            [
                lambda: backend.expand_shot(shot_request),
                lambda: fallback.expand_shot(shot_request),
            ],
            " ".join(["The scene holds."] + placeholders),
            f"expander on shot {shot.index}",
            notes,
        )
        shot.prose = _latin_names(
            _renumber_placeholders(sanitize_prose(prose), len(shot.dialogue)), cast_entries
        )
        running.append(shot.beat or shot.prose[:80])
    _cut_trespassing_sentences(shots, backend, notes)
    if word_target and request.elaborate_short_shots:
        _elaborate_short_shots(
            request,
            shots,
            backend,
            word_target,
            notes,
            overhead=overhead,
            cast_entries=cast_entries,
            cast_names=cast,
        )
    elif word_target:
        notes.append(
            "NOTE: short-shot elaboration is off; the description may fall under the "
            f"{spec.REF_DESCRIPTION_MIN_WORDS}-word minimum the guide asks for in ref2va."
        )
    _introduce_cast(shots, cast_entries, notes)
    _collapse_repeat_introductions(shots, cast_entries, notes)
    _canonicalise_offstage_cast(request, shots, cast_entries, notes)
    _flag_beat_overrun(shots, notes)
    return shots
_SHOT_MARKER_WORDS = 2
_CUT_TIME_WORDS = 4
_MIN_SHOT_WORD_TARGET = 40
def _ref_overhead(shots: list[ShotPlan], opening: str) -> int:
    words = field_words(opening)
    for position, shot in enumerate(shots):
        words += _SHOT_MARKER_WORDS
        if position:
            words += _CUT_TIME_WORDS
        for line in shot.dialogue:
            words += max(0, field_words(render_dialogue(line)) - 1)
    return words
def _ref_word_target(shot_count: int, overhead: int) -> int:
    budget = (spec.REF_DESCRIPTION_MIN_WORDS + spec.REF_DESCRIPTION_MAX_WORDS) / 2 - overhead
    return max(_MIN_SHOT_WORD_TARGET, round(budget / max(1, shot_count)))
def _cast_list(shots: list[ShotPlan], leading: list[str] | None = None) -> list[str]:
    cast: list[str] = list(dict.fromkeys(s for s in (leading or []) if s))
    for shot in shots:
        for subject in shot.subjects:
            if subject and subject not in cast:
                cast.append(subject)
    return cast
def _continuity_note(cast: list[str], running: list[str]) -> str:
    parts = []
    if cast:
        parts.append(
            "Recurring subjects, and the only wording for each. Never describe one of them "
            "differently, and never describe one again once an earlier shot has introduced "
            "it -- a few words are enough after that: " + ", ".join(cast)
        )
    if running:
        parts.append("Earlier beats: " + "; ".join(running[-2:]))
    return "\n".join(parts)
def _words(text: str) -> int:
    return len(text.split())
_ELABORATE_THRESHOLD = 0.9
_ELABORATE_MAX_PASSES = 3
def _elaborate_short_shots(
    request,
    shots,
    backend,
    word_target,
    notes,
    overhead: int = 0,
    cast_entries=None,
    cast_names=None,
) -> None:
    cast_entries = list(cast_entries or [])
    cast_names = list(cast_names or [])
    continuity = {
        shot.index: _continuity_note(
            cast_names, [s.beat or s.prose[:80] for s in shots[:position]]
        )
        for position, shot in enumerate(shots)
    }
    threshold = word_target * _ELABORATE_THRESHOLD
    ceiling = max(word_target, spec.REF_DESCRIPTION_MAX_WORDS - overhead)
    opened = {shot.index: _words(shot.prose) for shot in shots}
    rounds = {shot.index: 0 for shot in shots}
    failed: set[int] = set()
    for _ in range(_ELABORATE_MAX_PASSES):
        raise_if_interrupted()
        if sum(_words(shot.prose) for shot in shots) >= ceiling:
            break
        short = sorted(
            (s for s in shots if _words(s.prose) < threshold and s.index not in failed),
            key=lambda s: _words(s.prose),
        )
        if not short:
            break
        grew = False
        for shot in short:
            current = _words(shot.prose)
            try:
                expanded = backend.expand_shot(
                    ShotRequest(
                        index=shot.index,
                        total_shots=len(shots),
                        beat=shot.beat,
                        duration_seconds=0.0,
                        camera_sentence=None,
                        style_clauses=[],
                        word_target=word_target,
                        existing_prose=shot.prose,
                        continuity=continuity.get(shot.index, ""),
                        cast=cast_entries,
                        is_first=shot.index == 1,
                        reference_facts=_ref_facts(request.refs),
                        dialogue_placeholders=[
                            DIALOGUE_PLACEHOLDER % (i + 1) for i in range(len(shot.dialogue))
                        ],
                    )
                )
            except Exception as exc:
                failed.add(shot.index)
                notes.append(
                    f"NOTE: could not elaborate shot {shot.index} ({exc}); kept as written."
                )
                continue
            expanded = _renumber_placeholders(sanitize_prose(expanded), len(shot.dialogue))
            if _words(expanded) > current:
                shot.prose = expanded
                rounds[shot.index] += 1
                grew = True
        if not grew:
            break
    for shot in shots:
        if rounds[shot.index]:
            passes = rounds[shot.index]
            notes.append(
                f"NOTE: shot {shot.index} was {opened[shot.index]} words against a "
                f"{word_target}-word target; {passes} elaboration "
                f"pass{'es' if passes > 1 else ''} brought it to {_words(shot.prose)}."
            )
def _latin_names(prose: str, cast_entries) -> str:
    for entry in cast_entries or []:
        latin = getattr(entry, "latin_name", "")
        for spelling in sorted({entry.name, *entry.aliases}, key=len, reverse=True):
            if not spelling or not latin or spelling == latin:
                continue
            if all(ord(ch) < 0x0400 for ch in spelling):
                continue
            prose = re.sub(rf"\b{re.escape(spelling)}\b", latin, prose)
    return prose
def _renumber_placeholders(prose: str, count: int) -> str:
    def _swap(match):
        idx = int(match.group(1))
        return match.group(0) if 1 <= idx <= count else ""
    return PLACEHOLDER_RE.sub(_swap, prose)
def _sound(request, timing, style, shots, backend, fallback, notes) -> tuple[str, str]:
    sound_request = SoundRequest(
        beats=[s.beat for s in shots],
        style_ambience=style.sound.ambience_bias,
        style_music=style.music_sentence(),
        allow_music=request.allow_music,
        duration_seconds=timing.duration,
    )
    default = ("Quiet location room tone continues throughout the video.", spec.NA_VALUE)
    soundscape, music = _stage(
        [
            lambda: backend.write_sound(sound_request),
            lambda: fallback.write_sound(sound_request),
        ],
        default,
        "sound stage",
        notes,
    )
    if not soundscape.strip():
        notes.append(
            f"NOTE: {backend.name!r} returned no overall_soundscape; used the offline one. "
            "N/A was not substituted: the guide reserves it for a requested silence."
        )
        soundscape = _stage(
            [lambda: fallback.write_sound(sound_request)[0]],
            default[0],
            "the offline sound stage",
            notes,
        )
    if not request.allow_music:
        music = spec.NA_VALUE
    return soundscape.strip(), (music or spec.NA_VALUE).strip()
def _validate_and_repair(clip, request, backend, fallback, notes) -> PipelineResult:
    labels = request.refs.available_labels() if request.refs else None
    expected = [d.text for d in request.dialogue]
    def _check(text: str) -> ValidationResult:
        return validate(
            text,
            mode=clip.mode,
            duration=clip.duration,
            frame_count=clip.frame_count,
            available_labels=labels,
            expected_dialogue=expected,
        )
    result = _check(clip.prompt)
    attempts = max(0, int(request.repair_attempts))
    for attempt in range(attempts):
        if result.ok:
            break
        codes = [v.code for v in result.errors]
        payload = [
            {"code": v.code, "message": v.message, "field": v.field or "", "excerpt": v.excerpt or ""}
            for v in result.errors
        ]
        quotes = guides.quotes_for(codes)
        repaired = _stage(
            [
                lambda: backend.repair(clip.prompt, payload, quotes),
                lambda: fallback.repair(clip.prompt, payload, quotes),
            ],
            clip.prompt,
            f"repair pass {attempt + 1}",
            notes,
        )
        candidate = _check(repaired)
        if len(candidate.errors) < len(result.errors):
            clip.prompt, result = repaired, candidate
            notes.append(
                f"NOTE: repair pass {attempt + 1} resolved "
                f"{len(payload) - len(candidate.errors)} of {len(payload)} error(s)."
            )
        else:
            notes.append(
                f"NOTE: repair pass {attempt + 1} did not reduce errors; kept the previous text."
            )
            break
    if not result.ok:
        notes.append(
            "WARNING: the prompt still violates the guide; see the violations below. "
            "It was NOT silently altered."
        )
    return PipelineResult(clip=clip, validation=result, stage_notes=notes)
def _ref_facts(refs: RefBundle | None) -> dict:
    if refs is None:
        return {}
    return {
        "labels": [
            {"tag": label.tag, "kind": label.kind, "description": label.description}
            for label in refs.labels
        ],
        "counts": refs.available_labels(),
    }
