from __future__ import annotations
import os
import re
from .. import h3_spec as spec
from ..llm.base import (
    BackendError,
    EnrichRequest,
    TranslateRequest,
)
from ..types import RefBundle, RefLabel
from .state import (
    MAX_SEGMENT_SECONDS,
    MIN_SEGMENT_SECONDS,
    MODE_FIRST_FRAME,
    MODE_LAST_FRAME,
)
_H3_MODES = frozenset(spec.ALL_MODES)
def style_brief(style_id: str) -> str:
    from ..styles import library
    style = library.get((style_id or "").strip() or "neutral")
    parts: list[str] = []
    if style.display_name:
        parts.append(style.display_name)
    clauses = style.render_clauses()
    if clauses:
        parts.append("; ".join(clauses))
    if style.editing.avg_shot_len_s:
        parts.append(
            f"editing rhythm: about {style.editing.avg_shot_len_s:g} s per shot"
            + (f", {style.editing.transition_pref}" if style.editing.transition_pref else "")
        )
    if style.prompt_bias.avoid:
        parts.append("avoid: " + ", ".join(style.prompt_bias.avoid))
    return ". ".join(part.strip().rstrip(".") for part in parts if part.strip())
def camera_phrase(segment: dict) -> str:
    motion = str(segment.get("camera") or "").strip()
    if motion not in spec.CAMERA_MOTIONS:
        return ""
    amp = str(segment.get("camera_amplitude") or "").strip().lower()
    speed = str(segment.get("camera_speed") or "").strip().lower()
    amplitude = {"small": spec.AMPLITUDES[0], "large": spec.AMPLITUDES[1]}.get(amp)
    pace = {"slow": spec.SPEEDS[0], "fast": spec.SPEEDS[1]}.get(speed)
    try:
        return spec.camera_phrase(motion, amplitude, pace)
    except ValueError:
        return ""
_CAMERA_WORDS = (
    ("Tracking Shot", (
        "камера следит", "следит за", "следует за", "едет за", "идёт за", "идет за",
        "сопровожда", "tracks alongside", "tracking shot", "follows him",
        "follows her", "follows the", "camera follows",
    )),
    ("Arc Shot", ("облет", "облёт", "вокруг", "arc shot", "circles", "orbits")),
    ("POV", ("от первого лица", "глазами", "point of view", "pov")),
    ("Push In", ("наезд", "наезжа", "приближа", "push in", "pushes in", "moves closer")),
    ("Pull Out", ("отъезд", "отъезжа", "отдаля", "pull out", "pulls out", "moves back")),
    ("Pan Left", ("панорама влево", "pan left", "pans left")),
    ("Pan Right", ("панорама вправо", "pan right", "pans right")),
    ("Truck Left", ("truck left", "trucks left")),
    ("Truck Right", ("truck right", "trucks right")),
    ("Tilt Up", ("наклон вверх", "tilt up", "tilts up")),
    ("Tilt Down", ("наклон вниз", "tilt down", "tilts down")),
    ("Static Shot", (
        "камера неподвижна", "статичн", "неподвижн", "не двигается",
        "static shot", "camera holds", "locked off",
    )),
    ("Shake Strongly", ("сильная тряска", "shakes strongly")),
    ("Shake Slightly", ("тряска", "дрожит", "shake", "handheld")),
)
_VIEWPOINT_WORDS = (
    ("from a bird's-eye view, looking straight down", (
        "с высоты птичьего полёта", "с высоты птичьего полета",
        "bird's eye", "bird’s eye", "bird's-eye", "top-down view",
        "directly overhead",
    )),
    ("seen from above", (
        "вид сверху", "камера сверху", "верхний ракурс", "верхнего ракурса",
        "верхним ракурсом", "seen from above", "viewed from above",
        "shot from above", "high angle", "high-angle",
    )),
    ("seen from below, from a low angle", (
        "вид снизу", "камера снизу", "нижний ракурс", "нижнего ракурса",
        "нижним ракурсом", "low angle", "low-angle", "seen from below",
        "viewed from below", "shot from below", "worm's eye", "worm’s eye",
    )),
    ("seen from the side, in profile", (
        "вид сбоку", "вид с боку", "камера сбоку", "в профиль",
        "side view", "seen from the side", "viewed from the side",
        "shot from the side", "in profile",
    )),
    ("seen from behind", (
        "со спины", "вид сзади", "камера сзади", "seen from behind",
        "viewed from behind", "shot from behind", "view from behind",
    )),
    ("an over-the-shoulder view", (
        "из-за плеча", "over-the-shoulder", "over the shoulder view",
        "over the shoulder shot",
    )),
    ("seen from the front, head-on", (
        "анфас", "вид спереди", "камера спереди", "front view",
        "seen from the front", "viewed from the front", "head-on view",
    )),
)
_VIEWPOINT_STOPS = (
    "bird", "from above", "high angle", "high-angle",
    "from below", "low angle", "low-angle", "worm",
    "from the side", "in profile", "from behind",
    "over-the-shoulder", "over the shoulder",
    "from the front", "head-on", "overhead",
)
def viewpoint_from_script(script: str) -> str:
    text = _plain(str(script or "")).lower()
    if not text:
        return ""
    for phrase, words in _VIEWPOINT_WORDS:
        if any(word in text for word in words):
            return phrase
    return ""
def camera_from_script(script: str) -> str:
    text = _plain(str(script or "")).lower()
    if not text:
        return ""
    for motion, words in _CAMERA_WORDS:
        if any(word in text for word in words):
            return motion
    return ""
def reference_bundle(refs: list) -> RefBundle:
    bundle = RefBundle()
    counts = {"Picture": 0, "Video": 0, "Audio": 0}
    kind_names = {"image": "Picture", "video": "Video", "audio": "Audio"}
    listed = [r for r in (refs if isinstance(refs, list) else []) if isinstance(r, dict)]
    ordered = [r for r in listed if not _is_keyframe_ref(r)] + [
        r for r in listed if _is_keyframe_ref(r)
    ]
    for ref in ordered:
        kind = kind_names.get(str(ref.get("kind") or "").lower())
        if not kind:
            continue
        counts[kind] += 1
        label = str(ref.get("label") or "").strip()
        tag = str(ref.get("tag") or "").strip()
        described = _keyframe_role(ref) or ("" if _is_caption(label) else label)
        description = described or f"the {kind.lower()} the director attached"
        bundle.labels.append(
            RefLabel(
                kind=kind,
                number=counts[kind],
                description=description,
                cite=tag,
                described=bool(described),
            )
        )
    if bundle.labels:
        bundle.report = "\n".join(
            f"{label.tag}: {label.description}" for label in bundle.labels
        )
    return bundle
_SPEECH_CUES = (
    "рэп", "чита", "поет", "поёт", "пение", "напева", "говор", "сказ", "крич",
    "шепч", "кричит", "реч",
    "rap", "sing", "say", "speak", "shout", "whisper", "chant", "recite",
    "lyric", "verse", "aloud",
)
_FILE_SUFFIX = re.compile(r"\.[A-Za-z0-9]{2,4}$")
_CONSOLE_CAPTION = re.compile(r"\u00b7|\bframe @\s*[\d.]+\s*s\b", re.IGNORECASE)
def _is_filename(label: str) -> bool:
    return bool(_FILE_SUFFIX.search(label.strip()))
def _is_keyframe_ref(ref: dict) -> bool:
    uid = str(ref.get("uid") or "")
    return uid.startswith("first") or uid.startswith("last")
def _keyframe_role(ref: dict) -> str:
    uid = str(ref.get("uid") or "")
    if uid.startswith("first"):
        return "the frame this clip continues from, at the cut"
    if uid.startswith("last"):
        return "the frame this clip is built to arrive at, at the cut"
    return ""
def _is_caption(label: str) -> bool:
    text = label.strip()
    return not text or _is_filename(text) or bool(_CONSOLE_CAPTION.search(text))
def _plain(text: str) -> str:
    return " ".join(text.replace("@", " ").lower().split())
def cite_labels(story: str, bundle: RefBundle) -> tuple[str, list[str]]:
    if not story or not bundle.labels:
        return story, []
    lines: list[str] = []
    rewritten = story
    for label in bundle.labels:
        if not label.cite:
            continue
        pattern = re.compile(rf"@{re.escape(label.cite)}\b", re.IGNORECASE)
        if not pattern.search(rewritten):
            continue
        rewritten = pattern.sub(label.tag, rewritten)
        lines.append(f"{label.tag} in the idea above is {label.description}.")
    if lines:
        lines.append(
            "Those are the labels get_refs lists and the ones the render will feed. "
            "Define each in subject_definitions and cite it where it appears, by "
            "that exact tag. Write no other label and no file name."
        )
        lines.append(
            "Every subject_definitions line must name the picture it comes from, "
            'like "<Subject 1> is the young woman in <Picture 1>, with long blonde '
            'hair and a light-pink shirt". A definition set that names no '
            "<Picture N> cannot be kept and is replaced by a bare one, losing "
            "every appearance you wrote."
        )
        lines.append(
            "You cannot see these assets: say who or what they are from the story, and "
            "put no file name in the prompt."
        )
    return rewritten, lines
def repair_console_tags(prompt: str, bundle) -> str:
    fixed = prompt
    for label in getattr(bundle, "labels", []) or []:
        if not label.cite:
            continue
        fixed = re.sub(rf"@{re.escape(label.cite)}\b", label.tag, fixed, flags=re.IGNORECASE)
    return fixed
_CITE_WORDS = 3
_STEM_FLOOR = 4
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)
def _names_of(entry) -> list[str]:
    words = {entry.name, entry.latin_name, entry.head}
    words.update(a for a in entry.aliases if a and " " not in a)
    return sorted({w.strip().lower() for w in words if w and w.strip()}, key=len, reverse=True)
def _names_this(word: str, entry) -> bool:
    low = word.lower()
    for name in _names_of(entry):
        if low == name:
            return True
        if len(name) >= _STEM_FLOOR and low.startswith(name) and len(low) - len(name) <= 3:
            return True
    return False
def cast_pictures(script: str, bundle, cast) -> dict:
    text = str(script or "")
    if not text or not cast:
        return {}
    claims: dict[str, list] = {}
    for label in getattr(bundle, "labels", []) or []:
        if not label.cite:
            continue
        for match in re.finditer(rf"@{re.escape(label.cite)}\b", text, re.IGNORECASE):
            before = _WORD.findall(text[:match.start()])[-_CITE_WORDS:][::-1]
            for word in before:
                found = [entry for entry in cast if _names_this(word, entry)]
                if not found:
                    continue
                claims.setdefault(label.tag, [])
                for entry in found:
                    if entry not in claims[label.tag]:
                        claims[label.tag].append(entry)
                break
    mapped = {tag: found[0] for tag, found in claims.items() if len(found) == 1}
    taken: dict[int, list] = {}
    for tag, entry in mapped.items():
        taken.setdefault(id(entry), []).append(tag)
    return {
        tag: entry for tag, entry in mapped.items() if len(taken[id(entry)]) == 1
    }
def describe_refs_from_cast(bundle, mapping: dict) -> int:
    told = 0
    for label in getattr(bundle, "labels", []) or []:
        entry = mapping.get(label.tag)
        if entry is None or not entry.phrase:
            continue
        label.description = entry.phrase
        label.described = True
        told += 1
    return told
def name_the_subjects(prompt: str, bundle, mapping: dict) -> tuple[str, bool]:
    if not mapping:
        return prompt, False
    from ..prompt.validator import split_fields
    _, bodies = split_fields(prompt, spec.REF2VA)
    body = bodies.get("detailed_description", "")
    if not body or re.search(r"<Subject\s+\d+>", body):
        return prompt, False
    pictures = [l for l in getattr(bundle, "labels", []) if l.kind == "Picture"]
    changed = False
    for number, label in enumerate(sorted(pictures, key=lambda l: l.number), start=1):
        entry = mapping.get(label.tag)
        if entry is None:
            continue
        for name in (entry.latin_name, entry.name, entry.head):
            if not name:
                continue
            found = re.search(rf"\b{re.escape(name)}\b", body, re.IGNORECASE)
            if found is None:
                continue
            body = f"{body[:found.end()]} (<Subject {number}>){body[found.end():]}"
            changed = True
            break
    if not changed:
        return prompt, False
    bodies["detailed_description"] = body
    return (
        "\n\n".join(
            f"{name}:\n{bodies[name].strip()}"
            for name in spec.fields_for(spec.REF2VA)
            if bodies.get(name, "").strip()
        ),
        True,
    )
def enforce_reference_sections(prompt: str, bundle, shot_count: int) -> tuple[str, bool, str]:
    if bundle is None or getattr(bundle, "is_empty", lambda: True)():
        return prompt, False, ""
    from ..prompt import ref_sections
    from ..prompt.validator import split_fields
    names = ("subject_definitions", "summary", "retention_analysis")
    repaired = repair_console_tags(prompt, bundle)
    tags_fixed = repaired != prompt
    prompt = repaired
    _, bodies = split_fields(prompt, spec.REF2VA)
    if not bodies:
        return prompt, False, ""
    description = bodies.get("detailed_description", "")
    written = bodies.get("subject_definitions", "")
    shots = len(ref_sections.shot_numbers(description)) or max(1, shot_count)
    def assemble(definitions: str) -> tuple[str, bool]:
        fields = dict(bodies)
        built = dict(
            zip(
                names,
                ref_sections.build(
                    bundle, shots, definitions=definitions, description=description
                ),
            )
        )
        if not any(built.values()):
            return prompt, False
        changed = tags_fixed
        for name in names:
            text = built.get(name, "")
            if text and fields.get(name, "").strip() != text.strip():
                fields[name] = text
                changed = True
        promoted = ref_sections.promote_citations(
            bundle, fields.get("subject_definitions", ""), description
        )
        if promoted != description:
            fields["detailed_description"] = promoted
            changed = True
        if not changed:
            return prompt, False
        return (
            "\n\n".join(
                f"{name}:\n{fields[name].strip()}"
                for name in spec.fields_for(spec.REF2VA)
                if fields.get(name, "").strip()
            ),
            True,
        )
    was = _error_codes(prompt, bundle)
    why = ref_sections.refusal_reason(bundle, written)
    attempts: list[tuple[str, bool, str]] = []
    for definitions in (written, ""):
        text, changed = assemble(definitions)
        broke = _error_codes(text, bundle) - was
        attempts.append((text, changed, ", ".join(sorted(broke))))
        if not broke:
            if definitions == "" and written.strip() and not why:
                why = (
                    "keeping the model's own definitions would have broken the prompt "
                    f"({attempts[0][2]}), so a bare set was written instead"
                )
            return text, changed, why
    text, changed, broke = attempts[-1]
    return text, changed, (
        f"WARNING: the rebuilt sections still break the guide ({broke}); "
        f"{why}" if why else
        f"WARNING: the rebuilt sections still break the guide ({broke})"
    )
def _error_codes(prompt: str, bundle) -> set[str]:
    from ..prompt.validator import validate
    labels = bundle.available_labels() if hasattr(bundle, "available_labels") else None
    try:
        result = validate(prompt, spec.REF2VA, available_labels=labels)
    except Exception:
        return set()
    return {v.code for v in result.errors}
def ensure_shot_marker(prompt: str, mode: str) -> tuple[str, bool]:
    field = spec.body_field_for(mode)
    _, bodies = _split_prompt_fields(prompt, mode)
    body = bodies.get(field, "")
    if not body.strip() or re.search(r"\[Shot\s+\d+\]", body):
        return prompt, False
    bodies[field] = f"[Shot 1] {body.strip()}"
    blocks = [
        f"{name}:\n{bodies[name].strip()}"
        for name in spec.fields_for(mode)
        if bodies.get(name, "").strip()
    ]
    return "\n\n".join(blocks), True
def fix_shot_sequence(prompt: str, mode: str, duration: float) -> tuple[str, str]:
    field = spec.body_field_for(mode)
    _, bodies = _split_prompt_fields(prompt, mode)
    body = bodies.get(field, "")
    marks = list(re.finditer(r"\[Shot\s+(\d+)\]", body))
    if len(marks) < 2:
        return prompt, ""
    numbers = [int(m.group(1)) for m in marks]
    wanted = list(range(1, len(marks) + 1))
    timed = [bool(re.match(r"\s*At\s+[0-9:.]+\s*,", body[m.end():])) for m in marks]
    untimed = [i for i in range(1, len(marks)) if not timed[i]]
    if numbers == wanted and not untimed:
        return prompt, ""
    total = float(duration or 0)
    out, last = [], 0
    for i, m in enumerate(marks):
        out.append(body[last:m.start()])
        out.append(f"[Shot {i + 1}]")
        if i in untimed and total > 0:
            at = total * i / len(marks)
            minutes, seconds = divmod(at, 60)
            out.append(f" At {int(minutes):02d}:{seconds:06.3f},")
        last = m.end()
    out.append(body[last:])
    bodies[field] = "".join(out)
    notes = []
    if numbers != wanted:
        notes.append(f"shot numbers ran {numbers} and were renumbered {wanted}")
    if untimed:
        which = ", ".join(str(i + 1) for i in untimed)
        notes.append(
            f"shot(s) {which} had no cut time and were given one at an even split of "
            f"{total:g} s" if total > 0 else
            f"shot(s) {which} have no cut time and the clip's length is not known, so none was written"
        )
    blocks = [
        f"{name}:\n{bodies[name].strip()}"
        for name in spec.fields_for(mode)
        if bodies.get(name, "").strip()
    ]
    return "\n\n".join(blocks), "; ".join(notes)
def ensure_style_opening(prompt: str, mode: str, style_id: str, duration: float) -> tuple[str, bool]:
    if mode != spec.REF2VA:
        return prompt, False
    field = spec.body_field_for(mode)
    _, bodies = _split_prompt_fields(prompt, mode)
    body = bodies.get(field, "")
    marker = re.search(r"\[Shot\s+\d+\]", body)
    if not marker or body[: marker.start()].strip():
        return prompt, False
    from ..styles import library
    from ..styles.schema import opening_budget
    style = library.get((style_id or "").strip() or "neutral")
    opening = (style.style_opening(opening_budget(duration)) or "").strip()
    if not opening:
        return prompt, False
    rest = body[marker.end():].lstrip()
    stem = opening.rstrip(".")
    moved = ""
    if rest[: len(stem)].lower() == stem.lower():
        moved = rest[len(stem):].lstrip(" ,.;")
        if moved:
            moved = moved[:1].upper() + moved[1:]
    if moved:
        body = f"{body[: marker.end()]} {moved}"
    bodies[field] = f"{opening}\n{body.strip()}"
    blocks = [
        f"{name}:\n{bodies[name].strip()}"
        for name in spec.fields_for(mode)
        if bodies.get(name, "").strip()
    ]
    return "\n\n".join(blocks), True
def drop_repeated_style_opening(prompt: str, mode: str, keep=()) -> tuple[str, bool]:
    field = spec.body_field_for(mode)
    _, bodies = _split_prompt_fields(prompt, mode)
    body = bodies.get(field, "")
    marks = list(re.finditer(r"\[Shot\s+\d+\]", body))
    if len(marks) < 2:
        return prompt, False
    first = _style_head(body[marks[0].end(): marks[1].start()].strip(), keep)
    if not first:
        return prompt, False
    out, cut = body[: marks[1].start()], False
    for nth, mark in enumerate(marks[1:], start=1):
        end = marks[nth + 1].start() if nth + 1 < len(marks) else len(body)
        chunk = body[mark.start(): end]
        inner = chunk[mark.end() - mark.start():]
        stamp = re.match(r"\s*At\s+\d\d:\d\d\.\d\d\d\s*,\s*", inner)
        rest = inner[stamp.end():] if stamp else inner.lstrip()
        shared = _shared_opening(first, rest)
        if shared and rest[len(shared):].strip():
            tail = rest[len(shared):].lstrip(" ,.;")
            rest = (tail[:1].upper() + tail[1:]) if tail else tail
            chunk = (
                chunk[: mark.end() - mark.start()]
                + (stamp.group(0).rstrip() + " " if stamp else " ")
                + rest
            )
            cut = True
        out += chunk
    if not cut:
        return prompt, False
    bodies[field] = out.strip()
    blocks = [
        f"{name}:\n{bodies[name].strip()}"
        for name in spec.fields_for(mode)
        if bodies.get(name, "").strip()
    ]
    return "\n\n".join(blocks), True
_TRAILING_VOICE_RE = re.compile(
    r"(?P<who>[^.!?\n\]]+?)\s*\bsays\s*:\s*(?P<block><d>.*?</d>)\s*"
    r"\(\s*(?P<id>S\d+)\s*\)\s*says\s*:\s*\((?P<voice>[^)]*)\)\s*\.?",
    re.DOTALL,
)
_BARE_SAYS_RE = re.compile(r"(?P<who>[^.!?\n\]]+?)\s*\bsays\s*:\s*(?=<d>)")
def enforce_music_switch(prompt: str, mode: str, allow_music: bool) -> tuple[str, bool]:
    if allow_music:
        return prompt, False
    field = spec.MUSIC_FIELD
    if field not in spec.fields_for(mode):
        return prompt, False
    found = re.search(
        rf"(^|\n){re.escape(field)}:[ \t]*(.*?)(?=\n\s*\n|\n[a-z_]+:|$)",
        prompt,
        re.S,
    )
    if not found:
        return prompt, False
    said = found.group(2).strip()
    if not said or said.upper() == "N/A":
        return prompt, False
    return prompt[: found.start(2)] + "N/A" + prompt[found.end(2):], True
def bind_speech_lines(prompt: str, mode: str) -> tuple[str, int]:
    field = spec.body_field_for(mode)
    _, bodies = _split_prompt_fields(prompt, mode)
    body = bodies.get(field, "")
    if "<d>" not in body:
        return prompt, 0
    fixed = 0
    def fold(match: re.Match) -> str:
        nonlocal fixed
        fixed += 1
        raw = match.group("who")
        pad = raw[: len(raw) - len(raw.lstrip())]
        who = raw.strip()
        voice = " ".join(match.group("voice").split()).strip().rstrip(".")
        if voice:
            voice = voice[0].lower() + voice[1:]
        lead = f"{who}, {voice}" if voice else who
        return f"{pad}{lead} ({match.group('id')}) says: {match.group('block')}."
    body = _TRAILING_VOICE_RE.sub(fold, body)
    taken = [int(n) for n in re.findall(r"\(S(\d+)", body)]
    next_id = max(taken, default=0) + 1
    def name_it(match: re.Match) -> str:
        nonlocal fixed, next_id
        if re.search(r"\(S\d+", match.group("who")):
            return match.group(0)
        fixed += 1
        raw = match.group("who")
        pad = raw[: len(raw) - len(raw.lstrip())]
        given = next_id
        next_id += 1
        return f"{pad}{raw.strip()} (S{given}) says: "
    body = _BARE_SAYS_RE.sub(name_it, body)
    if not fixed:
        return prompt, 0
    bodies[field] = body.strip()
    blocks = [
        f"{name}:\n{bodies[name].strip()}"
        for name in spec.fields_for(mode)
        if bodies.get(name, "").strip()
    ]
    return "\n\n".join(blocks), fixed
def _style_head(shot: str, keep=()) -> str:
    lowered = shot.lower()
    at = [lowered.find(verb) for verb in spec.CAMERA_VERB_PHRASES.values()]
    at = [i for i in at if i >= 0]
    lens = lowered.find("the camera")
    if lens >= 0:
        at.append(lens)
    at.extend(i for i in (lowered.find(word) for word in keep) if i >= 0)
    return shot[: min(at)].rstrip() if at else shot
_REPEAT_FLOOR = 20
def _shared_opening(first: str, rest: str) -> str:
    limit = min(len(first), len(rest))
    same = 0
    while same < limit and first[same].lower() == rest[same].lower():
        same += 1
    stop = max(rest.rfind(",", 0, same), rest.rfind(".", 0, same))
    if stop < 0:
        return ""
    shared = rest[: stop + 1]
    return shared if len(shared) >= _REPEAT_FLOOR else ""
def _split_prompt_fields(prompt: str, mode: str):
    from ..prompt.validator import split_fields
    return split_fields(prompt, mode)
def _report(progress, stage: str, detail: str) -> None:
    if progress is None:
        return
    try:
        progress(stage, detail)
    except Exception:
        pass
def _same_line(a: str, b: str) -> bool:
    def tidy(s):
        return " ".join(str(s or "").lower().replace("\u2014", "-").split()).rstrip(" .;,")
    return bool(tidy(a)) and tidy(a) == tidy(b)
def _own_soundscape(prompt: str, settings, story: str, mode: str, backend) -> tuple:
    if not (prompt or "").strip():
        return None, "", ""
    from ..llm.base import SoundRequest
    from ..styles import library
    style = library.get((getattr(settings, "style_id", "") or "").strip() or "neutral")
    bias = (style.sound.ambience_bias or "").strip()
    field = "overall_soundscape"
    _, bodies = _split_prompt_fields(prompt, mode)
    if not bias or not _same_line(bodies.get(field, ""), bias):
        return None, "", ""
    said = (
        "overall_soundscape came back as the style's own ambience line word for word "
        f"(\"{bias}\") -- the brief copied, not the place the script is set in."
    )
    stage = getattr(backend, "write_sound", None)
    if _is_offline(backend) or not callable(stage):
        return None, "", (
            f"WARNING: {said} No model was there to ask again: write the sound of the "
            "place by hand, or run the writer again."
        )
    try:
        fresh, _score = stage(SoundRequest(
            beats=[story],
            style_ambience=bias,
            style_music=style.music_sentence(),
            allow_music=bool(getattr(settings, "allow_music", True)),
            duration_seconds=float(getattr(settings, "duration_seconds", 0) or 5.0),
        ))
    except Exception as exc:
        return None, "", (
            f"WARNING: {said} Asked again and the sound stage failed "
            f"({type(exc).__name__}: {exc})."
        )
    fresh = " ".join(str(fresh or "").split())
    if not fresh or _same_line(fresh, bias):
        return None, "", (
            f"WARNING: {said} Asked again and got the same line back: write the sound "
            "of the place by hand."
        )
    bodies[field] = fresh
    blocks = [
        f"{name}:\n{bodies[name].strip()}"
        for name in spec.fields_for(mode)
        if bodies.get(name, "").strip()
    ]
    note = f"{said} Asked the sound stage for the place in the script; it wrote: \"{fresh}\""
    return "\n\n".join(blocks), note, ""
def _compose(
    settings, segment: dict, story: str, progress=None, previous: dict | None = None,
    backend=None,
) -> tuple[str, str, list[str], bool]:
    from ..director import direct, make_backend, release_backend
    name = str(segment.get("name") or "").strip()
    if name and _plain(name) not in _plain(story):
        story = f"{name}. {story}"
    settings.story = story
    settings.duration_seconds = float(
        max(MIN_SEGMENT_SECONDS, min(MAX_SEGMENT_SECONDS, _int_or(segment.get("seconds"), 5)))
    )
    mode = str(segment.get("mode") or "").lower()
    if _int_or(segment.get("carried_run"), 0) > 0:
        mode = spec.mode_without_opening(mode)
    settings.mode = mode if mode in _H3_MODES else "auto"
    if not spec.opens_on_picture(mode):
        settings.opening_image = ""
    settings.allow_music = bool(segment.get("music", True))
    settings.skills = [
        str(x) for x in (segment.get("skills") or []) if str(x).strip()
    ] if isinstance(segment.get("skills"), list) else []
    settings.style_id = str(segment.get("style") or "").strip() or "neutral"
    standing: list[str] = []
    if not settings.allow_music:
        standing.append(
            "MUSIC IS SWITCHED OFF for this clip. non_diegetic_music must be exactly "
            "N/A -- no score, no instrumentation, no tempo, not one sentence about it. "
            "Sound the characters can hear belongs in overall_soundscape as usual."
        )
    if not bool(segment.get("audio", True)):
        standing.append(
            "This clip is SILENT in the film: its sound is muted when the film is put "
            "together. Write overall_soundscape as usual -- the format requires it and "
            "H3 uses it to move the picture -- but spend no words on sound that carries "
            "the story, because nobody will hear it."
        )
    if any(cue in story.lower() for cue in _SPEECH_CUES):
        standing.append(
            "This story has speech in it -- someone speaks, sings or raps. Write the "
            "words they say, "
            "inside <d>[Language] ... </d> at the moment they say them -- your own "
            "words, in the language the story is written in. If the story says nobody "
            "speaks, write no line at all. The story's own sentence "
            "is description and is never the line. With speech in the clip the spoken "
            "timeline sets the length of the description, not a word count."
        )
        standing.append(
            "Name the voice. The first time anyone speaks, give them an identifying "
            "phrase and an ID outside the <d> block, in the shape "
            "'<who they are, and how they sound> (S1) says: <d>[Language] ...</d>' -- "
            "describing the voice itself and not only the person: pitch, timbre, pace "
            "or accent. Take those words from THIS clip's own story; where it says "
            "nothing about the voice, infer it from who is speaking and where, and "
            "never carry over the wording of an example. IDs run (S1), (S2) in the "
            "order people first speak, and the same person keeps theirs. A clip that "
            "continues this one repeats that phrase word for word to keep the same "
            "voice, so it has to say something a listener could match."
        )
    camera = camera_phrase(segment)
    pinned_motion = str(segment.get("camera") or "").strip() if camera else ""
    from_story = ""
    if not camera:
        motion = camera_from_script(story)
        if motion:
            try:
                from_story = spec.camera_phrase(
                    motion,
                    None if motion in spec.MOTIONS_WITHOUT_MODIFIERS else spec.AMPLITUDES[0],
                    None if motion in spec.MOTIONS_WITHOUT_MODIFIERS else spec.SPEEDS[0],
                )
            except ValueError:
                from_story = ""
            camera = from_story
            pinned_motion = motion if from_story else ""
    if camera:
        standing.append(
            (
                f"The story asks for this clip's camera: \"{camera}\"."
                if from_story
                else f"The director pinned this clip's camera: \"{camera}\"."
            )
            + " Use exactly this "
            "camera move, phrased per the guide, and let it outrank the style's habit. "
            "It REPLACES any camera language already in the material you are working "
            "from: delete the old motion, amplitude and speed wording wherever it "
            "appears and write each shot's action around the new move, so the shot "
            "reads as one description rather than a sentence added to an older one. "
            "No shot ever carries two camera behaviours. It holds for EVERY shot of "
            "this clip: a camera asked for once does not stop applying at the first "
            "cut, so shot two does not go back to the style's usual move."
        )
        if pinned_motion in spec.MOTIONS_WITHOUT_MODIFIERS:
            standing.append(
                "This move takes no amplitude and no speed: remove any \"with ... "
                "amplitude\" or \"at ... speed\" wording the prompt already has."
            )
    viewpoint = viewpoint_from_script(story) if not spec.opens_on_picture(mode) else ""
    if viewpoint:
        standing.append(
            f"The story fixes this clip's point of view: \"{viewpoint}\". Write "
            "these exact words into every shot's composition, at the head of the "
            "shot beside the framing, and let them outrank the style's usual "
            "angle where the two disagree. This is composition, not a camera "
            "move: it is not a second camera behaviour, and it changes nothing "
            "about the camera instruction. It REPLACES any contrary angle "
            "wording already in the material you are working from. It holds for "
            "EVERY shot of this clip: a later shot is composed from the same "
            "point of view, so shot two does not drift back to the style's "
            "habit."
        )
    max_shots = max(0, min(8, _int_or(segment.get("max_shots"), 0)))
    if max_shots:
        from .. import timing
        capacity = timing.max_shots_for(settings.duration_seconds)
        wanted = min(max_shots, capacity)
        settings.shots_per_clip = wanted
        standing.append(
            f"The director set this clip to {wanted} shot(s): write exactly {wanted} "
            f"[Shot] block(s), no more and no fewer. This outranks the style's own "
            "editing rhythm."
        )
        if wanted < max_shots:
            standing.append(
                f"({max_shots} were asked for, but a {settings.duration_seconds:.0f} s "
                f"clip only holds {capacity} -- each shot needs at least "
                f"{timing.MIN_SHOT_SECONDS} s.)"
            )
    def _slot_ref(prefix: str):
        for ref in segment.get("refs") or []:
            if (
                isinstance(ref, dict)
                and str(ref.get("kind")) == "image"
                and str(ref.get("uid") or "").startswith(prefix)
            ):
                return ref
        return None
    opening = segment.get("opening") if isinstance(segment.get("opening"), dict) else {}
    origin = str(opening.get("origin") or "").strip().lower()
    if origin == "run":
        previous = str(opening.get("previous") or "").strip()[:300]
        standing.append(
            "The clip OPENS IN MID-MOTION: the end of the clip before it is pinned at "
            "the head of this one, so the first instant is that movement still running "
            "-- not a photograph, not an establishing shot and not a new framing. Write "
            "[Shot 1] as the continuation of an action already under way, and reach new "
            "ground later in the clip through camera or subject motion, or a cut."
            + (
                f' The previous clip, as the director put it: "{previous}".'
                if previous
                else ""
            )
        )
    if mode in MODE_FIRST_FRAME:
        opening_ref = _slot_ref("first")
        if opening_ref is not None:
            label = str(opening_ref.get("label") or "").strip()
            named = "" if _is_filename(label) else label
            standing.append(
                "The clip OPENS on a supplied photograph"
                + (f" ({named})" if named else "")
                + ": frame 0 is fixed, pixel for pixel. Write [Shot 1] as motion "
                "CONTINUING that image -- the same scene and framing at the first "
                "instant, never a different opening. If the script's action lies "
                "elsewhere, reach it through camera or subject motion, or a cut LATER "
                "in the clip."
            )
            standing.append(
                "You cannot see that photograph and no description of it exists, so "
                "[Shot 1] must not invent what it shows: no location, no clothing, no "
                "hair, no time of day, no weather and no lighting of your own. Write "
                "the movement, the camera and the sound, and let the image supply "
                "everything the eye sees at that instant. Anything you add that the "
                "photograph contradicts is rendered as a cut away from it one frame in."
            )
        elif origin == "cited":
            label = str(opening.get("label") or "").strip() or "a cited library image"
            standing.append(
                f"The clip OPENS on the library image it cites ({label}): with the "
                "first-frame slot empty, the render adopts that image as frame 0, pixel "
                "for pixel. Write [Shot 1] as motion CONTINUING that image, never a "
                "different opening. You cannot see it either: write the movement, the "
                "camera and the sound, and invent no location, clothing or light of "
                "your own for that first instant."
            )
        elif origin == "chain":
            previous = str(opening.get("previous") or "").strip()[:300]
            standing.append(
                "The clip OPENS on the final frame of the clip before it: frame 0 is "
                "that exact frame. Write [Shot 1] as motion continuing straight out of "
                "the previous clip's closing moment -- never a fresh opening elsewhere; "
                "reach new ground through camera or subject motion, or a cut LATER in "
                "the clip."
                + (
                    f' The previous clip, in the director\'s words: "{previous}".'
                    if previous
                    else ""
                )
            )
    if mode in MODE_LAST_FRAME:
        closing_ref = _slot_ref("last")
        if closing_ref is not None:
            label = str(closing_ref.get("label") or "").strip() or "an attached image"
            standing.append(
                f"The clip LANDS on a supplied photograph ({label}): the final frame is "
                "fixed. Write the closing moments so the action arrives at that exact "
                "image."
            )
    carried = max(0, _int_or(segment.get("context_frames"), 0))
    if carried > 1:
        held = carried / 24.0
        standing.append(
            f"This clip CONTINUES the one before it: its last {carried} frames "
            f"({held:.2f} s) of picture and the sound under them are pinned at the head "
            "of this clip, and this clip's first delivered moment carries straight on "
            "from them."
        )
        standing.append(
            "The model renders a contradiction as a UNION, not a replacement: prose "
            "that opens on a different arrangement of people or a different place adds "
            "them to the pinned ones instead of replacing them -- two rooms and three "
            "people at once. So [Shot 1] opens on exactly what the previous clip was "
            "showing at its last instant: the same place, the same cast, the same "
            "framing and the same light."
        )
        standing.append(
            "Hold that for about two seconds before anything changes, and write no "
            "dialogue inside the hold. A held framing with nothing happening renders "
            "as a literal freeze, so give it a breath, a shift of weight, an eyeline "
            "moving -- the camera holds still, the performer does not. Whatever is new "
            "arrives after the hold, on a cut or through motion."
        )
        standing.append(
            "The score does not restart at a join: non_diegetic_music continues the "
            "piece already playing, in the same instruments, key and tempo, and "
            "overall_soundscape keeps the same room."
        )
        standing.append(
            "Do NOT restage what the previous clip already showed. This clip does not "
            "begin at the start of that action: it begins in the MIDDLE of it, at the "
            "instant that clip stopped. Never write an entrance, an approach, or a "
            "starting position that has already been played -- no 'enters', no 'begins "
            "to', no 'from the left edge'. Name where things ARE at that instant, and "
            "what they do NEXT."
        )
        prev_music = str((previous or {}).get("music") or "").strip()
        prev_room = str((previous or {}).get("room") or "").strip()
        if prev_music or prev_room:
            carried_over = []
            if prev_room:
                carried_over.append(f"overall_soundscape was: {prev_room}")
            if prev_music:
                carried_over.append(f"non_diegetic_music was: {prev_music}")
            standing.append(
                "The clip before this one is still sounding, so carry its sound rather "
                "than inventing one. " + " ".join(carried_over)
            )
        voices = []
        for entry in ((previous or {}).get("speakers") or [])[:4]:
            if not isinstance(entry, dict):
                continue
            speaker = str(entry.get("id") or "").strip()[:12]
            voice = str(entry.get("as") or "").strip()[:160]
            if not speaker:
                continue
            voices.append(f'{speaker} was "{voice}"' if voice else f"{speaker} spoke")
        if voices:
            standing.append(
                "The same people are still speaking. Reuse each speaker's id AND the "
                "words that established their voice, unchanged, at this clip's first "
                "vocal event -- " + "; ".join(voices) + ". Their lines here are new: "
                "carry the voice and the id, never the words."
            )
    if standing:
        block = "\n".join(standing)
        settings.extra_instruction = (
            f"{settings.extra_instruction}\n{block}".strip()
            if settings.extra_instruction
            else block
        )
    tagged_script = ""
    if mode == "ref2va":
        bundle = reference_bundle(segment.get("refs"))
        if bundle.labels:
            settings.refs = bundle
            tagged_script = settings.story
            settings.story, cite_lines = cite_labels(settings.story, bundle)
            if cite_lines:
                block = "\n".join(cite_lines)
                settings.extra_instruction = (
                    f"{settings.extra_instruction}\n{block}".strip()
                    if settings.extra_instruction
                    else block
                )
    settings.progress = progress
    _report(progress, "model", "starting the writing model…")
    owned = backend is None
    backend_notes: list[str] = []
    if owned:
        backend, backend_notes = make_backend(settings)
    have_model = not _is_offline(backend)
    _report(
        progress,
        "model",
        "model ready — writing" if have_model else "no model — writing on the offline floor",
    )
    sound_fix = (None, "", "")
    try:
        plan = direct(settings, backend=backend)
        sound_fix = _own_soundscape(
            plan.clips[0].prompt if plan.clips else "", settings, story, mode, backend,
        )
    finally:
        if owned:
            release_backend(backend)
        settings.progress = None
    _report(progress, "stage", "validating and finishing")
    used_llm = have_model and bool(getattr(backend, "calls", None))
    settings.written_by = writer_identity(settings, segment, backend, used_llm)
    prompt = plan.clips[0].prompt if plan.clips else ""
    report = "\n".join(note for note in backend_notes if note)
    report = f"{report}\n{plan.report}".strip() if plan.report else report
    if sound_fix[0]:
        prompt = sound_fix[0]
    if sound_fix[1]:
        report = f"{report}\n{sound_fix[1]}".strip() if report else sound_fix[1]
    extra_warnings = [sound_fix[2]] if sound_fix[2] else []
    if mode == "ref2va" and getattr(settings, "refs", None) is not None:
        cast = list(getattr(plan, "character_bible", None).entries) if getattr(
            plan, "character_bible", None
        ) else []
        mapping = cast_pictures(tagged_script, settings.refs, cast)
        told = describe_refs_from_cast(settings.refs, mapping)
        if told:
            note = (
                f"the cast wording was tied to {told} attachment(s) by the @tags in the "
                "script, so a definition the model does not write is still the bible's."
            )
            report = f"{report}\n{note}".strip() if report else note
        prompt, rebuilt, why = enforce_reference_sections(prompt, settings.refs, 1)
        prompt, named = name_the_subjects(prompt, settings.refs, mapping)
        if named:
            note = (
                "the description named the cast but cited no label, so each subject was "
                "cited beside the person it is."
            )
            report = f"{report}\n{note}".strip() if report else note
        rebuilt = rebuilt or named
        prompt, marked = ensure_shot_marker(prompt, mode)
        prompt, opened = ensure_style_opening(
            prompt, mode, str(segment.get("style") or ""), float(segment.get("seconds") or 0) or 4.0
        )
        rebuilt = rebuilt or marked or opened
        if rebuilt:
            note = (
                "summary and retention_analysis were rebuilt from the wired references."
            )
            if why:
                note = (
                    "subject_definitions was replaced with a bare one: "
                    f"{why}. " + note
                )
            report = f"{report}\n{note}".strip() if report else note
    prompt, deduped = drop_repeated_style_opening(
        prompt, mode, keep=_VIEWPOINT_STOPS if viewpoint else ()
    )
    if deduped:
        note = (
            "a later shot opened by repeating shot 1's style clause word for word; "
            "the copy was removed so the shot opens on its own cut."
        )
        report = f"{report}\n{note}".strip() if report else note
    prompt, silenced = enforce_music_switch(prompt, mode, bool(settings.allow_music))
    if silenced:
        note = (
            "music is switched off for this clip and the model wrote a score anyway; "
            "non_diegetic_music was set to N/A."
        )
        report = f"{report}\n{note}".strip() if report else note
    prompt, bound = bind_speech_lines(prompt, mode)
    if bound:
        note = (
            f"{bound} spoken line(s) were bound to their speaker: the voice and its "
            "(SN) id moved in front of the <d> block, which is what makes H3 give "
            "the line to the person on screen instead of a voiceover."
        )
        report = f"{report}\n{note}".strip() if report else note
    prompt, renumbered = fix_shot_sequence(
        prompt, mode,
        float(getattr(settings, "duration_seconds", 0) or segment.get("seconds") or 0),
    )
    if renumbered:
        report = f"{report}\n{renumbered}".strip() if report else renumbered
    from ..prompt.validator import validate as _validate
    try:
        final = _validate(
            prompt,
            mode=mode,
            duration=float(segment.get("seconds") or 0) or None,
            available_labels=(
                settings.refs.available_labels()
                if getattr(settings, "refs", None) is not None
                else None
            ),
        )
        left = len(final.errors)
        line = f"after repair: {left} error(s) remain in the prompt as delivered."
        if left:
            line += "\n" + "\n".join(str(v) for v in final.errors)
        report = f"{report}\n{line}".strip() if report else line
    except Exception:
        pass
    return prompt, report, list(plan.warnings) + extra_warnings, used_llm
def write_segment(
    settings, segment: dict, script: str, progress=None, previous: dict | None = None,
    backend=None,
) -> tuple[str, str, list[str], bool]:
    return _compose(settings, segment, script.strip(), progress=progress, previous=previous,
                    backend=backend)
def rebuild_prompt(settings, segment: dict, progress=None,
                   previous: dict | None = None) -> tuple[str, str, list[str], bool]:
    story = str(segment.get("prompt") or "").strip() or str(segment.get("script") or "").strip()
    return _compose(settings, segment, story, progress=progress, previous=previous)
def writer_identity(settings, segment: dict, backend, used_llm: bool) -> dict:
    if not used_llm:
        model, via = "", "offline"
    else:
        server = getattr(backend, "server", None)
        path = getattr(getattr(server, "settings", None), "model_path", "") if server else ""
        if path:
            model, via = os.path.basename(str(path)), "local"
        else:
            model, via = str(getattr(settings, "model", "") or getattr(backend, "model", "") or ""), "provider"
    segment = segment if isinstance(segment, dict) else {}
    out = {
        "model": model,
        "via": via,
        "seed": int(settings.seed) if getattr(settings, "seed", None) is not None else None,
        "temperature": round(float(getattr(settings, "temperature_scale", 1.0) or 0.0), 3),
        "skills": [str(x) for x in (getattr(settings, "skills", None) or [])],
        "max_shots": max(0, min(8, _int_or(segment.get("max_shots"), 0))),
        "camera_amplitude": str(segment.get("camera_amplitude") or ""),
        "camera_speed": str(segment.get("camera_speed") or ""),
        "music": bool(getattr(settings, "allow_music", True)),
        "style": str(getattr(settings, "style_id", "") or ""),
        "mode": str(getattr(settings, "mode", "") or ""),
    }
    if via == "provider":
        out["provider"] = str(getattr(settings, "server_url", "") or "")
    return out
def _is_offline(backend) -> bool:
    from ..llm.offline import OfflineBackend
    return isinstance(backend, OfflineBackend)
def _int_or(value, fallback: int) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return fallback
def enrich(
    settings, script: str, style_hint: str = "", total_seconds: int = 0, progress=None
) -> tuple[str, list[str], bool]:
    from ..director import make_backend, release_backend
    notes: list[str] = []
    _report(progress, "model", "starting the writing model…")
    backend, backend_notes = make_backend(settings)
    notes.extend(backend_notes)
    try:
        stage = getattr(backend, "enrich_scenario", None)
        if not callable(stage) or _is_offline(backend):
            notes.append(
                "NOTE: no writing model answered, so the script is unchanged -- "
                "enrichment is the model's judgement, not a template's."
            )
            return script, notes, False
        _report(progress, "stage", "the model is enriching the script")
        enriched = stage(
            EnrichRequest(
                scenario=script,
                style_hint=style_hint,
                total_seconds=max(0, _int_or(total_seconds, 0)),
            )
        )
        return enriched, notes, True
    finally:
        release_backend(backend)
def translate(
    settings, text: str, source: str, target: str, progress=None
) -> tuple[str, list[str]]:
    from ..director import make_backend, release_backend
    from . import tags
    notes: list[str] = []
    _report(progress, "model", "starting the writing model…")
    backend, backend_notes = make_backend(settings)
    notes.extend(backend_notes)
    try:
        stage = getattr(backend, "translate_text", None)
        if not callable(stage):
            raise BackendError(
                "translation needs a writing model, and this backend has none."
            )
        _report(progress, "stage", f"translating {source} → {target}")
        shielded, kept = tags.shield(text)
        answer = stage(TranslateRequest(text=shielded, source=source, target=target))
        answer, trouble = tags.restore(answer, kept)
        notes.extend(f"WARNING: {line}" for line in trouble)
        return answer, notes
    finally:
        release_backend(backend)
