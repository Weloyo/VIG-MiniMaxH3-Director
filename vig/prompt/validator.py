from __future__ import annotations
import re
from dataclasses import dataclass, field
from .. import h3_spec as spec
from ..timing import FPS
KNOWN_DIALOGUE_LANGUAGES = (
    "English",
    "Chinese",
    "Spanish",
    "French",
    "German",
    "Japanese",
    "Korean",
    "Arabic",
    "Portuguese",
    "Italian",
    "Russian",
)
ERROR = "error"
WARNING = "warning"
@dataclass(frozen=True)
class Violation:
    code: str
    severity: str
    message: str
    field: str | None = None
    excerpt: str | None = None
    def __str__(self) -> str:
        where = f" [{self.field}]" if self.field else ""
        return f"{self.severity.upper()} {self.code}{where}: {self.message}"
@dataclass
class ValidationResult:
    violations: list[Violation] = field(default_factory=list)
    @property
    def ok(self) -> bool:
        return not self.errors
    @property
    def errors(self) -> list[Violation]:
        return [v for v in self.violations if v.severity == ERROR]
    @property
    def warnings(self) -> list[Violation]:
        return [v for v in self.violations if v.severity == WARNING]
    def add(self, code, severity, message, field=None, excerpt=None) -> None:
        self.violations.append(Violation(code, severity, message, field, excerpt))
    def report(self) -> str:
        if not self.violations:
            return "OK - no violations."
        lines = [f"{len(self.errors)} error(s), {len(self.warnings)} warning(s)"]
        lines.extend(str(v) for v in self.violations)
        return "\n".join(lines)
    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "violations": [
                {
                    "code": v.code,
                    "severity": v.severity,
                    "message": v.message,
                    "field": v.field,
                    "excerpt": v.excerpt,
                }
                for v in self.violations
            ],
        }
_SHOT_RE = re.compile(r"\[Shot (\d+)\]")
_TIMESTAMP_RE = re.compile(r"\[Shot (\d+)\]\s*At\s+(\d{2}):(\d{2})\.(\d{3})")
_ANY_TIME_RE = re.compile(r"\bAt\s+([0-9:.]+)\s*,")
_D_OPEN_RE = re.compile(r"<d>\s*\[([^\]]+)\]")
_LABEL_RE = re.compile(r"<(Subject|Picture|Video|Audio)\s+(\d+)>")
_SENTENCE_SPLIT_RE = re.compile(r"[.!?]+(?:\s|$)")
def split_fields(prompt: str, mode: str) -> tuple[str | None, dict[str, str]]:
    names = spec.fields_for(mode)
    positions: list[tuple[int, str]] = []
    for name in names:
        match = re.search(rf"^{re.escape(name)}\s*:", prompt, re.MULTILINE)
        if match:
            positions.append((match.start(), name))
    positions.sort()
    instruction = None
    if positions:
        head = prompt[: positions[0][0]].strip()
        if head:
            instruction = head.splitlines()[0].strip()
    bodies: dict[str, str] = {}
    for i, (start, name) in enumerate(positions):
        end = positions[i + 1][0] if i + 1 < len(positions) else len(prompt)
        chunk = prompt[start:end]
        bodies[name] = chunk.split(":", 1)[1].strip() if ":" in chunk else ""
    return instruction, bodies
def _count_sentences(text: str) -> int:
    stripped = text.strip()
    if not stripped or stripped == spec.NA_VALUE:
        return 0
    return len([p for p in _SENTENCE_SPLIT_RE.split(stripped) if p.strip()])
_WORD_RE = re.compile(r"\b[\w'-]+\b")
def field_words(text: str) -> int:
    return len(_WORD_RE.findall(text))
_VERBATIM_SPAN_RE = re.compile(r"<d>.*?</d>|\"[^\"]*\"", re.DOTALL)
def _without_verbatim_spans(text: str) -> str:
    return _VERBATIM_SPAN_RE.sub(" ", text)
def _is_probably_english(text: str) -> bool:
    stripped = _without_verbatim_spans(text)
    return not any(ord(ch) > 0x024F and ch.isalpha() for ch in stripped)
def validate(
    prompt: str,
    mode: str,
    duration: float | None = None,
    frame_count: int | None = None,
    available_labels: dict[str, int] | None = None,
    expected_dialogue: list[str] | None = None,
) -> ValidationResult:
    result = ValidationResult()
    mode = mode.lower()
    if mode not in spec.ALL_MODES:
        result.add("MODE_UNKNOWN", ERROR, f"unknown task mode {mode!r}")
        return result
    if duration is None and frame_count is not None:
        duration = frame_count / FPS
    _check_fields(result, prompt, mode)
    instruction, bodies = split_fields(prompt, mode)
    _check_instruction(result, instruction, mode, prompt, duration, bodies)
    main_field = "detailed_description" if mode == spec.REF2VA else "integrated_multimodal_description"
    body = bodies.get(main_field, "")
    _check_shots(result, body, main_field, duration)
    _check_camera(result, body, main_field)
    _check_dialogue(result, body, main_field, expected_dialogue)
    label_limits = None if available_labels is None else dict(available_labels)
    if label_limits is not None:
        declared = _LABEL_RE.findall(bodies.get("subject_definitions", ""))
        subjects = [int(n) for kind, n in declared if kind == "Subject"]
        label_limits["Subject"] = max(subjects) if subjects else 0
    _check_labels(result, prompt, label_limits)
    _check_sound_fields(result, bodies)
    _check_language(result, bodies)
    if mode == spec.REF2VA:
        _check_ref_sections(result, bodies, available_labels)
    return result
def _check_fields(result: ValidationResult, prompt: str, mode: str) -> None:
    names = spec.fields_for(mode)
    seen: list[tuple[int, str]] = []
    for name in names:
        match = re.search(rf"^{re.escape(name)}\s*:", prompt, re.MULTILINE)
        if match is None:
            result.add(
                "FIELD_MISSING",
                ERROR,
                f"required field {name!r} is missing; the guide mandates it verbatim as "
                f"'{name}:'",
                field=name,
            )
        else:
            seen.append((match.start(), name))
    ordered = [name for _, name in sorted(seen)]
    expected = [n for n in names if n in ordered]
    if ordered != expected:
        result.add(
            "FIELD_ORDER",
            ERROR,
            f"fields are out of order: got {ordered}, the guide requires {expected}",
        )
def _check_instruction(
    result: ValidationResult,
    instruction: str | None,
    mode: str,
    prompt: str,
    duration: float | None,
    bodies: dict[str, str],
) -> None:
    if mode in (spec.T2VA, spec.REF2VA):
        if instruction:
            result.add(
                "INSTRUCTION_UNEXPECTED",
                ERROR,
                f"{mode} takes no image-alignment instruction but the prompt starts with "
                f"one: {instruction[:80]!r}",
            )
        return
    if not instruction:
        result.add(
            "INSTRUCTION_MISSING",
            ERROR,
            f"{mode} requires the alignment instruction as the first line of the prompt",
        )
        return
    if mode == spec.I2VA and instruction != spec.I2VA_INSTRUCTION:
        result.add(
            "INSTRUCTION_MISMATCH",
            ERROR,
            "I2VA uses a fixed instruction line; expected exactly "
            f"{spec.I2VA_INSTRUCTION!r}",
            excerpt=instruction,
        )
    if mode in (spec.FL2VA, spec.L2VA):
        indices = [int(n) for n in _SHOT_RE.findall(bodies.get(spec.BASE_FIELDS[0], ""))]
        last_shot = max(indices) if indices else 1
        if duration is None:
            head = spec.FL2VA_INSTRUCTION.split("—")[0].strip()
            if not instruction.startswith(head):
                result.add(
                    "INSTRUCTION_MISMATCH",
                    ERROR,
                    f"{mode} instruction must open with {head!r}",
                    excerpt=instruction,
                )
        else:
            expected_duration = f"{duration:.2f}"
            cited = re.findall(r"([\d.]+)-second mark", instruction)
            if not cited or cited[-1] != expected_duration:
                result.add(
                    "INSTRUCTION_DURATION",
                    ERROR,
                    f"instruction must cite the effective duration as {expected_duration} "
                    "(S.SS, exactly two decimals)",
                    excerpt=instruction,
                )
            expected = spec.instruction_for(
                mode=mode, last_shot=last_shot, duration=expected_duration
            )
            if instruction != expected:
                result.add(
                    "INSTRUCTION_MISMATCH",
                    ERROR,
                    f"{mode} uses the fixed instruction line of section 2.1; expected "
                    f"exactly {expected!r}",
                    excerpt=instruction,
                )
    first_field = spec.fields_for(mode)[0]
    gap = re.search(rf"{re.escape(instruction)}\s*\n(\s*)\n\s*{re.escape(first_field)}", prompt)
    if gap is None:
        result.add(
            "INSTRUCTION_SPACING",
            WARNING,
            "the instruction should be followed by one blank line before the core fields",
        )
def _check_shots(
    result: ValidationResult, body: str, field_name: str, duration: float | None
) -> None:
    if not body:
        return
    indices = [int(n) for n in _SHOT_RE.findall(body)]
    if not indices:
        result.add(
            "SHOT_MISSING",
            ERROR,
            "the description contains no [Shot N] marker; it must open with [Shot 1]",
            field=field_name,
        )
        return
    if indices[0] != 1:
        result.add(
            "SHOT_FIRST_NOT_ONE",
            ERROR,
            f"the first shot marker is [Shot {indices[0]}]; the description must open "
            "with [Shot 1]",
            field=field_name,
        )
    expected = list(range(1, len(indices) + 1))
    if indices != expected:
        result.add(
            "SHOT_SEQUENCE",
            ERROR,
            f"shot numbers must run sequentially {expected}, got {indices}",
            field=field_name,
        )
    for match in re.finditer(r"At\s+\d{2}:\d{2}\.\d{3}", body):
        before = body[max(0, match.start() - 40) : match.start()]
        if not re.search(r"\[Shot \d+\]\s*$", before):
            result.add(
                "TIMESTAMP_WITHOUT_SHOT",
                ERROR,
                "a cut time has to open a shot: write '[Shot N] At MM:SS.mmm, ...' rather "
                "than a bare timestamp mid-paragraph",
                field=field_name,
                excerpt=body[match.start() : match.start() + 60],
            )
    shot1 = re.search(r"\[Shot 1\]\s*(.{0,40})", body, re.DOTALL)
    if shot1 and re.match(r"\s*At\s+\d", shot1.group(1)):
        result.add(
            "SHOT1_HAS_TIMESTAMP",
            ERROR,
            "do not add a timestamp to the first shot",
            field=field_name,
            excerpt=shot1.group(0),
        )
    stamped = _TIMESTAMP_RE.findall(body)
    stamped_by_index = {int(i): (int(mm), int(ss), int(ms)) for i, mm, ss, ms in stamped}
    for idx in indices:
        if idx == 1:
            continue
        if idx not in stamped_by_index:
            result.add(
                "SHOT_TIMESTAMP_MISSING",
                ERROR,
                f"[Shot {idx}] has no cut time; later shots need 'At MM:SS.mmm,'",
                field=field_name,
            )
    for raw in _ANY_TIME_RE.findall(body):
        if not re.fullmatch(r"\d{2}:\d{2}\.\d{3}", raw):
            result.add(
                "TIMESTAMP_FORMAT",
                ERROR,
                f"timestamp {raw!r} is malformed; the guide uses MM:SS.mmm, e.g. 00:03.500",
                field=field_name,
            )
    seconds = [
        (idx, mm * 60 + ss + ms / 1000.0)
        for idx, (mm, ss, ms) in sorted(stamped_by_index.items())
    ]
    for prev, curr in zip(seconds, seconds[1:]):
        if curr[1] <= prev[1]:
            result.add(
                "TIMESTAMP_NOT_INCREASING",
                ERROR,
                f"cut times must strictly increase, but [Shot {curr[0]}] at {curr[1]:.3f}s "
                f"does not follow [Shot {prev[0]}] at {prev[1]:.3f}s",
                field=field_name,
            )
    if duration is not None:
        for idx, value in seconds:
            if value >= duration:
                result.add(
                    "TIMESTAMP_OUT_OF_RANGE",
                    ERROR,
                    f"[Shot {idx}] cuts at {value:.3f}s but the clip is only "
                    f"{duration:.3f}s long",
                    field=field_name,
                )
def _check_camera(result: ValidationResult, body: str, field_name: str) -> None:
    if not body:
        return
    body = _without_verbatim_spans(body)
    lowered = body.lower()
    for motion in spec.CAMERA_MOTIONS:
        if re.search(rf"\b{re.escape(motion)}\b", body):
            result.add(
                "CAMERA_LABEL_STACKED",
                WARNING,
                f"camera motion {motion!r} appears as a stacked label; the guide requires "
                "it written as a natural English action, e.g. 'The camera pushes in "
                "with small amplitude at slow speed'",
                field=field_name,
            )
    for sentence in _sentences_with(lowered, spec.AMPLITUDES + spec.SPEEDS):
        if _names_a_camera_motion(sentence):
            continue
        result.add(
            "CAMERA_MODIFIER_ORPHAN",
            ERROR,
            "an amplitude or speed modifies a motion type, and this sentence names none; "
            f"use one of {sorted(set(spec.CAMERA_VERB_PHRASES.values()))[:6]}... or drop "
            "the modifier",
            field=field_name,
            excerpt=sentence.strip()[:120],
        )
    for bad in re.findall(r"with (\w+) amplitude", lowered):
        if f"with {bad} amplitude" not in spec.AMPLITUDES:
            result.add(
                "CAMERA_AMPLITUDE_VOCAB",
                ERROR,
                f"'with {bad} amplitude' is not in the guide's vocabulary; use "
                f"{list(spec.AMPLITUDES)} or omit it for medium amplitude",
                field=field_name,
            )
    for bad in re.findall(r"at (\w+) speed", lowered):
        if f"at {bad} speed" not in spec.SPEEDS:
            result.add(
                "CAMERA_SPEED_VOCAB",
                ERROR,
                f"'at {bad} speed' is not in the guide's vocabulary; use "
                f"{list(spec.SPEEDS)} or omit it for normal speed",
                field=field_name,
            )
def _sentences_with(lowered: str, phrases) -> list[str]:
    found = []
    for sentence in _SENTENCE_SPLIT_RE.split(lowered):
        if any(phrase in sentence for phrase in phrases):
            found.append(sentence)
    return found
def _names_a_camera_motion(sentence: str) -> bool:
    for phrase in spec.CAMERA_VERB_PHRASES.values():
        if phrase in sentence:
            return True
    for motion in spec.CAMERA_MOTIONS:
        if motion.lower() in sentence:
            return True
    return False
def _statement_window(body: str, start: int) -> str:
    close = body.find("</d>", start)
    if close == -1:
        return body[start:]
    after = close + len("</d>")
    ends = [pos for pos in (body.find("<d>", after), body.find("[Shot", after)) if pos != -1]
    return body[after : min(ends)] if ends else body[after:]
def _check_dialogue(
    result: ValidationResult,
    body: str,
    field_name: str,
    expected_dialogue: list[str] | None,
) -> None:
    if not body:
        return
    opens = body.count("<d>")
    closes = body.count("</d>")
    if opens != closes:
        result.add(
            "DIALOGUE_TAGS_UNBALANCED",
            ERROR,
            f"unbalanced dialogue tags: {opens} <d> vs {closes} </d>",
            field=field_name,
        )
    for match in re.finditer(r"<d>(.*?)</d>", body, re.DOTALL):
        inner = match.group(1)
        lang = _D_OPEN_RE.match(f"<d>{inner}")
        if lang is None:
            result.add(
                "DIALOGUE_LANGUAGE_TAG",
                ERROR,
                "every <d> block must open with a language tag, e.g. <d>[English] ...</d>",
                field=field_name,
                excerpt=inner[:80],
            )
            continue
        name = lang.group(1).strip()
        if name not in KNOWN_DIALOGUE_LANGUAGES:
            result.add(
                "DIALOGUE_LANGUAGE_UNKNOWN",
                WARNING,
                f"language tag {name!r} is not one of the language names this extension "
                "recognises; check the spelling, or ignore this if the language is right "
                "(the guides state no list of supported languages)",
                field=field_name,
            )
        if re.search(r"\(S\d+(?:,S\d+)*\)", inner):
            result.add(
                "DIALOGUE_ID_INSIDE",
                ERROR,
                "the speaker ID belongs outside <d>; inside <d> keep only the language "
                "tag and the spoken content",
                field=field_name,
                excerpt=inner[:80],
            )
    for match in re.finditer(re.escape(spec.VOICEOVER_PHRASE), body):
        if spec.VOICEOVER_LIPS_HINT not in _statement_window(body, match.end()):
            result.add(
                "VOICEOVER_LIPS_MISSING",
                ERROR,
                "every voiceover <d> block must be followed by a statement that the "
                f"character's {spec.VOICEOVER_LIPS_HINT}",
                field=field_name,
            )
    spoken = [
        _D_OPEN_RE.sub("", f"<d>{m.group(1)}", count=1).strip()
        for m in re.finditer(r"<d>(.*?)</d>", body, re.DOTALL)
    ]
    for content in spoken:
        if len(content) > 1 and content.startswith('"') and content.endswith('"'):
            result.add(
                "DIALOGUE_WRAPPED_IN_QUOTES",
                ERROR,
                "spoken content inside <d> must not be wrapped in double quotation marks; "
                "those mark text that is visibly on screen",
                field=field_name,
                excerpt=content[:80],
            )
    if expected_dialogue:
        for line in expected_dialogue:
            line = line.strip()
            if not line:
                continue
            if not any(content.strip() == line for content in spoken):
                loose = line in body
                result.add(
                    "DIALOGUE_TEXT_ALTERED",
                    ERROR,
                    "user dialogue must be carried over verbatim as the entire content of a "
                    "<d> block, but this line is not: "
                    f"{line[:80]!r}"
                    + (
                        " (it appears in the text but not as a clean <d> block)"
                        if loose
                        else ""
                    ),
                    field=field_name,
                )
    first_spoken = body.find("<d>")
    if first_spoken != -1 and not re.search(r"\(S\d+", body[:first_spoken]):
        result.add(
            "SPEAKER_ID_MISSING",
            ERROR,
            "spoken content needs a speaker ID: establish the voice before the <d> "
            "block, as in 'the young woman with a quiet, breathy voice (S1) says: "
            "<d>[English] ...</d>'",
            field=field_name,
            excerpt=body[max(0, first_spoken - 90):first_spoken].strip()[-90:],
        )
    ids = sorted({int(n) for n in re.findall(r"\(S(\d+)(?:,S\d+)*\)", body)})
    if ids and ids != list(range(1, len(ids) + 1)):
        result.add(
            "SPEAKER_ID_SEQUENCE",
            WARNING,
            f"speaker IDs should run S1..Sn in order of first vocal event, got {ids}",
            field=field_name,
        )
def _check_labels(
    result: ValidationResult, prompt: str, available: dict[str, int] | None
) -> None:
    if available is None:
        return
    for kind, number in {(k, int(n)) for k, n in _LABEL_RE.findall(prompt)}:
        limit = available.get(kind, 0)
        if number < 1 or number > limit:
            source = (
                "defined in subject_definitions"
                if kind == "Subject"
                else f"{kind.lower()} reference(s) are connected"
            )
            result.add(
                "LABEL_OUT_OF_RANGE",
                ERROR,
                f"<{kind} {number}> is cited but only {limit} {source}",
            )
def _check_sound_fields(result: ValidationResult, bodies: dict[str, str]) -> None:
    soundscape = bodies.get("overall_soundscape", spec.NA_VALUE).strip()
    if soundscape != spec.NA_VALUE:
        count = _count_sentences(soundscape)
        if not (spec.SOUNDSCAPE_MIN_SENTENCES <= count <= spec.SOUNDSCAPE_MAX_SENTENCES):
            result.add(
                "SOUNDSCAPE_LENGTH",
                ERROR,
                f"overall_soundscape must be {spec.SOUNDSCAPE_MIN_SENTENCES}-"
                f"{spec.SOUNDSCAPE_MAX_SENTENCES} sentences, got {count}",
                field="overall_soundscape",
            )
        if "<d>" in soundscape:
            result.add(
                "SOUNDSCAPE_HAS_DIALOGUE",
                ERROR,
                "dialogue, singing and diegetic music belong in the description, not in "
                "overall_soundscape",
                field="overall_soundscape",
            )
    music = bodies.get("non_diegetic_music", "").strip()
    if soundscape != spec.NA_VALUE and music and music != spec.NA_VALUE:
        shared = _shared_sentences(soundscape, music)
        if shared:
            result.add(
                "SOUNDSCAPE_REPEATS_MUSIC",
                ERROR,
                "the score is described in overall_soundscape as well as non_diegetic_music; "
                "the soundscape carries ambience and action sounds only",
                field="overall_soundscape",
                excerpt=shared[0][:100],
            )
    if music and music != spec.NA_VALUE:
        count = _count_sentences(music)
        if not (spec.MUSIC_MIN_SENTENCES <= count <= spec.MUSIC_MAX_SENTENCES):
            result.add(
                "MUSIC_LENGTH",
                ERROR,
                f"non_diegetic_music must be {spec.MUSIC_MIN_SENTENCES}-"
                f"{spec.MUSIC_MAX_SENTENCES} sentences, got {count}",
                field="non_diegetic_music",
            )
        if "<d>" in music:
            result.add(
                "MUSIC_HAS_DIALOGUE",
                ERROR,
                "lyrics belong inside <d> in the description, not in non_diegetic_music",
                field="non_diegetic_music",
            )
        lowered = music.lower()
        for word in spec.ABSTRACT_MOOD_WORDS:
            if re.search(rf"\b{re.escape(word)}\b", lowered):
                result.add(
                    "MUSIC_ABSTRACT_MOOD",
                    ERROR,
                    f"non_diegetic_music must not use abstract mood words or explain the "
                    f"score's emotional function; found {word!r}. Describe instrumentation, "
                    "speed, rhythm and dynamic changes instead",
                    field="non_diegetic_music",
                )
                break
def _shared_sentences(left: str, right: str) -> list[str]:
    def sentences(text: str) -> dict[str, str]:
        out = {}
        for part in _SENTENCE_SPLIT_RE.split(text):
            key = " ".join(part.lower().split())
            if len(key) > 25:
                out[key] = part.strip()
        return out
    a, b = sentences(left), sentences(right)
    return [a[key] for key in a if key in b]
def _check_language(result: ValidationResult, bodies: dict[str, str]) -> None:
    for name, body in bodies.items():
        if body and not _is_probably_english(body):
            result.add(
                "BODY_NOT_ENGLISH",
                ERROR,
                f"{name} must be written in English; only dialogue inside <d> and visible "
                "on-screen text keep their original language",
                field=name,
            )
def _check_ref_sections(
    result: ValidationResult, bodies: dict[str, str], available: dict[str, int] | None
) -> None:
    definitions = bodies.get("subject_definitions", "")
    summary = bodies.get("summary", "")
    retention = bodies.get("retention_analysis", "")
    description = bodies.get("detailed_description", "")
    defined = {f"{k} {n}" for k, n in _LABEL_RE.findall(definitions)}
    if summary:
        prefix = re.match(r"\s*\[([^\]]+)\]", summary)
        if prefix is None:
            result.add(
                "SUMMARY_PREFIX_MISSING",
                ERROR,
                "summary must open with a square-bracketed task-type prefix, e.g. "
                "[reference generation + audio reference]",
                field="summary",
            )
        else:
            parts = [p.strip() for p in prefix.group(1).split("+")]
            for part in parts:
                if part not in spec.REF_TASK_TYPES:
                    result.add(
                        "SUMMARY_TASK_TYPE",
                        ERROR,
                        f"{part!r} is not a valid task type; choose from "
                        f"{list(spec.REF_TASK_TYPES)}",
                        field="summary",
                    )
            if len(parts) != len(set(parts)):
                result.add(
                    "SUMMARY_TASK_TYPE_REPEATED",
                    ERROR,
                    "task types are combined with ' + ' and must not repeat",
                    field="summary",
                )
        for label in {f"{k} {n}" for k, n in _LABEL_RE.findall(summary)} - defined:
            result.add(
                "SUMMARY_NEW_LABEL",
                ERROR,
                f"<{label}> is introduced in summary; new reference labels may only be "
                "defined in subject_definitions",
                field="summary",
            )
    if retention:
        for label in {f"{k} {n}" for k, n in _LABEL_RE.findall(retention)} - defined:
            result.add(
                "RETENTION_NEW_LABEL",
                ERROR,
                f"<{label}> is introduced in retention_analysis; new reference labels may "
                "only be defined in subject_definitions",
                field="retention_analysis",
            )
        if re.search(r"\(S\d+\)", retention):
            result.add(
                "RETENTION_HAS_SPEAKER_ID",
                ERROR,
                "do not write (Sx) in retention_analysis",
                field="retention_analysis",
            )
        for line in retention.splitlines():
            line = line.strip()
            if not line:
                continue
            label = _LABEL_RE.search(line)
            if label is None:
                continue
            kind = label.group(1)
            markers = spec.AUDIO_RETENTION_MARKERS if kind == "Audio" else spec.VISUAL_RETENTION_MARKERS
            if not any(re.search(rf"\b{m}\b", line) for m in markers):
                result.add(
                    "RETENTION_MARKER_INVALID",
                    ERROR,
                    f"the entry for <{kind} {label.group(2)}> carries no valid relationship "
                    f"marker; {kind} entries use {list(markers)}",
                    field="retention_analysis",
                    excerpt=line[:100],
                )
    for label in sorted(defined):
        kind = label.split()[0]
        markers = (
            spec.AUDIO_RETENTION_MARKERS
            if kind == "Audio"
            else spec.VISUAL_RETENTION_MARKERS
        )
        carried = any(
            f"<{label}>" in line and any(re.search(rf"\b{m}\b", line) for m in markers)
            for line in retention.splitlines()
        )
        if not carried:
            result.add(
                "RETENTION_LABEL_MISSING",
                ERROR,
                f"<{label}> is defined in subject_definitions but has no line in "
                f"retention_analysis saying what becomes of it; one line per label, "
                f"with one of {list(markers)}",
                field="retention_analysis",
            )
    if description:
        head = description.split("[Shot 1]")[0].strip()
        if not head:
            result.add(
                "REF_STYLE_OPENING_MISSING",
                ERROR,
                "full-reference mode establishes the style in one or two English sentences "
                "before [Shot 1]",
                field="detailed_description",
            )
        words = field_words(description)
        if words < spec.REF_DESCRIPTION_MIN_WORDS:
            result.add(
                "REF_DESCRIPTION_SHORT",
                WARNING,
                f"detailed_description is {words} words; generation tasks are normally "
                f"{spec.REF_DESCRIPTION_MIN_WORDS}-{spec.REF_DESCRIPTION_MAX_WORDS}. The "
                "guide qualifies that: dialogue-dense content fits the spoken timeline "
                "rather than mechanically reaching a word count. Add detail that is new, "
                "never the same pose or light said again",
                field="detailed_description",
            )
        elif words > spec.REF_DESCRIPTION_MAX_WORDS:
            result.add(
                "REF_DESCRIPTION_LONG",
                WARNING,
                f"detailed_description is {words} words; generation tasks are normally "
                f"{spec.REF_DESCRIPTION_MIN_WORDS}-{spec.REF_DESCRIPTION_MAX_WORDS}",
                field="detailed_description",
            )
    if available:
        for kind in ("Picture", "Video", "Audio"):
            for i in range(1, available.get(kind, 0) + 1):
                if f"{kind} {i}" not in defined:
                    result.add(
                        "REF_LABEL_UNDEFINED",
                        ERROR,
                        f"<{kind} {i}> is connected but never defined in subject_definitions",
                        field="subject_definitions",
                    )
