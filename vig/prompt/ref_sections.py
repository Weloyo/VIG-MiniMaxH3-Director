from __future__ import annotations
import re
from .. import h3_spec as spec
from ..types import RefBundle
_LABEL_RE = re.compile(r"<(Subject|Picture|Video|Audio)\s+(\d+)>")
_SOURCE_RE = re.compile(r"<(Picture|Video|Audio)\s+(\d+)>")
_SHOT_RE = re.compile(r"\[Shot\s+(\d+)\]")
_SUBJECT_BOUNDARY = re.compile(r"(?=<Subject\s+\d+>)")
_ENTRY_BOUNDARY = re.compile(r"(?=<(?:Subject|Picture|Video|Audio)\s+\d+>)")
_TRAILING_JOIN = re.compile(r"[\s,;.]+(?:and|then)?[\s,;.]*$", re.IGNORECASE)
DEFAULT_VISUAL_MARKER = "fully_preserved"
VIDEO_STRUCTURE_MARKER = "weak_reference"
DEFAULT_AUDIO_MARKER = "reference"
def task_types(bundle: RefBundle) -> list[str]:
    types: list[str] = []
    if bundle.images or bundle.videos:
        types.append("reference generation")
    if bundle.audios or bundle.video_audios:
        types.append("audio reference")
    return types or ["reference generation"]
def _subject_entries(bundle: RefBundle) -> list[tuple[str, str, str]]:
    entries = []
    number = 0
    for label in bundle.labels:
        if label.kind not in ("Picture", "Video"):
            continue
        facts = label.facts or {}
        told = label.description if getattr(label, "described", True) else ""
        description = told or facts.get("summary") or ""
        number += 1
        entries.append((f"<Subject {number}>", label.tag, str(description).rstrip(".")))
    return entries
def shot_numbers(description: str) -> list[int]:
    seen: list[int] = []
    for number in _SHOT_RE.findall(description or ""):
        value = int(number)
        if value not in seen:
            seen.append(value)
    return seen
def shots_citing(description: str) -> dict[str, list[int]]:
    parts = _SHOT_RE.split(description or "")
    found: dict[str, list[int]] = {}
    for i in range(1, len(parts) - 1, 2):
        number = int(parts[i])
        for kind, ordinal in _LABEL_RE.findall(parts[i + 1]):
            shots = found.setdefault(f"<{kind} {ordinal}>", [])
            if number not in shots:
                shots.append(number)
    return found
def adopt_definitions(bundle: RefBundle, definitions: str) -> list[tuple[str, str, str]] | None:
    return _adopt(bundle, definitions)[0]
def refusal_reason(bundle: RefBundle, definitions: str) -> str:
    return _adopt(bundle, definitions)[1]
def _adopt(
    bundle: RefBundle, definitions: str
) -> tuple[list[tuple[str, str, str]] | None, str]:
    text = (definitions or "").strip()
    if not text:
        return None, ""
    if bundle.videos or bundle.audios or any(l.kind != "Picture" for l in bundle.labels):
        return None, ""
    wired = {label.tag for label in bundle.labels}
    if not wired:
        return None, ""
    converted, why = _from_picture_entries(bundle, text, wired)
    if converted is not None or why:
        return converted, why
    subjects: dict[int, tuple[str, str, str]] = {}
    cited: set[str] = set()
    chunks = _SUBJECT_BOUNDARY.split(text)
    if chunks and chunks[0].strip():
        return None, (
            f"a definition does not open on a <Subject N>: {chunks[0].strip()[:70]!r}"
        )
    for chunk in chunks[1:]:
        line = " ".join(chunk.split())
        if not line:
            continue
        for extra in chunk.splitlines()[1:]:
            stray = _LABEL_RE.match(extra.strip())
            if stray is not None and stray.group(1) != "Subject":
                return None, (
                    f"a definition does not open on a <Subject N>: {extra.strip()[:70]!r}"
                )
        head = _LABEL_RE.search(line)
        if head is None or head.group(1) != "Subject":
            return None, (
                f"a definition does not open on a <Subject N>: {line[:70]!r}"
            )
        number = int(head.group(2))
        if number in subjects:
            return None, f"<Subject {number}> is defined twice"
        sources = [f"<{k} {n}>" for k, n in _SOURCE_RE.findall(line)]
        kept = [tag for tag in sources if tag in wired]
        if not kept:
            return None, (
                f"<Subject {number}> names no attached picture, so nothing here can "
                f"say which one it carries: {line[:70]!r}"
            )
        cited.update(kept)
        subjects[number] = (f"<Subject {number}>", kept[0], line)
    if not subjects or sorted(subjects) != list(range(1, len(subjects) + 1)):
        return None, (
            f"the subjects are numbered {sorted(subjects)} rather than 1..n"
        )
    if not wired <= cited:
        missing = ", ".join(sorted(wired - cited))
        return None, f"{missing} is attached to the clip but no subject says what it is"
    return [subjects[n] for n in sorted(subjects)], ""
def _from_picture_entries(
    bundle: RefBundle, text: str, wired: set[str]
) -> tuple[list[tuple[str, str, str]] | None, str]:
    chunks = [c.strip() for c in _ENTRY_BOUNDARY.split(text) if c.strip()]
    if not chunks:
        return None, ""
    kinds = []
    for chunk in chunks:
        head = _LABEL_RE.match(chunk)
        if head is None:
            return None, ""
        kinds.append(head.group(1))
    if not kinds or any(kind != "Picture" for kind in kinds):
        return None, ""
    prose: dict[str, str] = {}
    for chunk in chunks:
        head = _LABEL_RE.match(chunk)
        tag = f"<{head.group(1)} {head.group(2)}>"
        if tag not in wired or tag in prose:
            return None, ""
        said = chunk[head.end():].strip()
        said = re.sub(r"^(?:is|are|shows?|depicts?)\b", "", said).strip()
        prose[tag] = _TRAILING_JOIN.sub("", said).strip()
    if set(prose) != wired or not all(prose.values()):
        return None, ""
    entries = []
    for number, label in enumerate(
        sorted((l for l in bundle.labels if l.kind == "Picture"), key=lambda l: l.number),
        start=1,
    ):
        entries.append((
            f"<Subject {number}>",
            label.tag,
            f"<Subject {number}> is {prose[label.tag]}, taken from {label.tag}.",
        ))
    return entries, ""
def _entries(
    bundle: RefBundle, definitions: str
) -> tuple[list[tuple[str, str, str]], bool]:
    adopted = adopt_definitions(bundle, definitions)
    if adopted is not None:
        return adopted, True
    derived = []
    for subject_tag, source_tag, description in _subject_entries(bundle):
        label = next(l for l in bundle.labels if l.tag == source_tag)
        features = _feature_clause(label.facts or {})
        if description:
            head = f"{subject_tag} is {description}, taken from {source_tag}"
        else:
            head = f"{subject_tag} is the content carried over from {source_tag}"
        suffix = f", with {features}" if features else ""
        derived.append((subject_tag, source_tag, f"{head}{suffix}."))
    return derived, False
def promote_citations(bundle: RefBundle, definitions: str, description: str) -> str:
    owner: dict[str, list[str]] = {}
    for subject_tag, source_tag, _ in _entries(bundle, definitions)[0]:
        owner.setdefault(source_tag, []).append(subject_tag)
    out = description or ""
    for source_tag, subjects in owner.items():
        if len(subjects) == 1:
            out = out.replace(source_tag, subjects[0])
    return out
def _feature_clause(facts: dict) -> str:
    bits = []
    subjects = facts.get("subjects")
    if isinstance(subjects, list) and subjects:
        bits.append(", ".join(str(s).rstrip(".") for s in subjects[:3]))
    for key in ("palette", "lighting", "environment"):
        value = facts.get(key)
        if value:
            bits.append(str(value).rstrip("."))
    return "; ".join(bits[:3])
def _video_structure_clause(label) -> str:
    motion = (label.facts or {}).get("camera_motion")
    if motion:
        return f"whose measured camera movement ({motion}), pacing and cut rhythm"
    return "whose pacing and cut rhythm"
def subject_definitions(bundle: RefBundle, definitions: str = "") -> str:
    entries, adopted = _entries(bundle, definitions)
    lines = [line for _, _, line in entries]
    if adopted:
        return "\n".join(lines)
    for label in bundle.labels:
        if label.kind != "Video":
            continue
        lines.append(
            f"{label.tag} is the reference video {_video_structure_clause(label)} the "
            "target video follows."
        )
    for label in bundle.labels:
        if label.kind != "Audio":
            continue
        role = label.description or "an audio reference for the target video's sound"
        lines.append(f"{label.tag} is {role.rstrip('.')}.")
    return "\n".join(lines)
def _listed(tags: list[str]) -> str:
    if len(tags) == 1:
        return tags[0]
    return f"{', '.join(tags[:-1])} and {tags[-1]}"
def summary(bundle: RefBundle, shot_count: int, definitions: str = "") -> str:
    prefix = " + ".join(task_types(bundle))
    subjects = [tag for tag, _, _ in _entries(bundle, definitions)[0]]
    audio_tags = [l.tag for l in bundle.labels if l.kind == "Audio"]
    if subjects:
        body = f"The target video is generated using {_listed(subjects)} as visual references."
    else:
        body = "The target video is generated from the written brief alone."
    shots = max(1, int(shot_count))
    if shots == 1:
        body += " It plays as a single continuous shot."
    else:
        body += f" It plays as a {shots}-shot sequence, [Shot 1] through [Shot {shots}]."
    if subjects:
        body += (
            " Each referenced subject keeps the appearance defined above in every shot "
            "where it appears."
        )
    if audio_tags:
        body += f" {_listed(audio_tags)} guides the target video's sound without being copied."
    return f"[{prefix}] {body}"
def retention_analysis(
    bundle: RefBundle, shot_count: int, definitions: str = "", description: str = ""
) -> str:
    every = list(range(1, max(1, shot_count) + 1))
    all_shots = ", ".join(f"[Shot {i}]" for i in every)
    where = shots_citing(description)
    lines = []
    for subject_tag, source_tag, _ in _entries(bundle, definitions)[0]:
        seen = [n for n in where.get(subject_tag, []) if n in every]
        shots = ", ".join(f"[Shot {i}]" for i in seen) if seen else all_shots
        lines.append(
            f"{subject_tag} (appears in {shots}): {DEFAULT_VISUAL_MARKER} - the appearance "
            f"established in {source_tag} is carried into the target video unchanged."
        )
    for label in bundle.labels:
        if label.kind == "Video":
            motion = (label.facts or {}).get("camera_motion")
            detail = (
                f"its measured camera movement ({motion}) informs the target video's pacing"
                if motion
                else "its pacing and structure inform the target video"
            )
            lines.append(
                f"{label.tag} (camera movement and pacing): {VIDEO_STRUCTURE_MARKER} - {detail}."
            )
        elif label.kind == "Audio":
            lines.append(
                f"{label.tag}: {DEFAULT_AUDIO_MARKER} - only its character is referenced; the "
                "original signal is not copied."
            )
    return "\n".join(lines)
def build(
    bundle: RefBundle | None,
    shot_count: int,
    *,
    definitions: str = "",
    description: str = "",
) -> tuple[str, str, str]:
    if bundle is None or bundle.is_empty():
        return "", "", ""
    return (
        subject_definitions(bundle, definitions),
        summary(bundle, shot_count, definitions),
        retention_analysis(bundle, shot_count, definitions, description),
    )
