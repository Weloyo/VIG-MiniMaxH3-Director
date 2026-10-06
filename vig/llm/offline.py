from __future__ import annotations
import re
from .. import h3_spec as spec
from ..text import noun_phrases, sentences
from .base import CastRequest, PlanRequest, ShotRequest, SoundRequest
_MAX_CAST_PHRASE_WORDS = 8
_NOT_A_SUBJECT = frozenset(
    {
        "left", "right", "top", "bottom", "middle", "centre", "center",
        "side", "front", "back", "background", "foreground", "distance",
        "edge", "corner", "frame", "shot", "camera", "screen", "view",
        "beginning", "end", "moment", "time", "way",
    }
)
_PUNCTUATION = " \t.,;:!?-"
_DIALOGUE_BLOCK_RE = re.compile(r"<d>.*?</d>", re.DOTALL)
def _has_words(text: str) -> bool:
    return bool((text or "").strip(_PUNCTUATION))
def _clean(text: str) -> str:
    return re.sub(r"\s{2,}", " ", (text or "").replace("\n", " ")).strip()
def _end_sentence(part: str) -> str:
    part = (part or "").strip().rstrip(",;:-–— ").strip()
    if not part:
        return ""
    return part if part[-1] in ".!?…" else part + "."
def _limit_sentences(text: str, maximum: int) -> str:
    parts = sentences(text)
    if not parts:
        return ""
    kept = parts[:maximum]
    return " ".join(s if s[-1] in ".!?" else s + "." for s in kept)
def _camera_label_fix(phrase: str):
    def _replace(match: re.Match) -> str:
        head = match.string[: match.start()].rstrip()
        article = "The" if not head or head[-1] in ".!?:]" else "the"
        return f"{article} camera {phrase}"
    return _replace
class OfflineBackend:
    name = "offline"
    def describe_cast(self, request: CastRequest) -> list[dict]:
        groups: dict[str, list] = {}
        for phrase in noun_phrases(request.story):
            groups.setdefault(phrase.head, []).append(phrase)
        candidates = []
        for head, group in groups.items():
            richest = max(group, key=lambda p: (p.word_count, -p.start))
            if head in _NOT_A_SUBJECT:
                continue
            if not richest.modified or richest.word_count > _MAX_CAST_PHRASE_WORDS:
                continue
            candidates.append(
                {
                    "name": f"the {head}",
                    "appearance": richest.text,
                    "aliases": list(dict.fromkeys(p.text for p in group)),
                    "_rank": (-len(group), -richest.word_count, group[0].start),
                }
            )
        candidates.sort(key=lambda c: c["_rank"])
        limit = max(0, int(request.max_characters))
        return [
            {k: v for k, v in candidate.items() if k != "_rank"}
            for candidate in candidates[:limit]
        ]
    def plan_shots(self, request: PlanRequest) -> list[dict]:
        if request.fixed_beats:
            beats = list(request.fixed_beats)
        else:
            beats = sentences(request.story) or [_clean(request.story) or "The scene continues."]
        count = max(1, request.shot_count)
        grouped: list[str] = []
        per_shot = max(1, len(beats) // count)
        cursor = 0
        for i in range(count):
            take = per_shot if i < count - 1 else len(beats) - cursor
            chunk = beats[cursor : cursor + max(1, take)]
            cursor += len(chunk)
            grouped.append(" ".join(chunk) if chunk else beats[-1])
        moves = request.style_camera_moves or ["Static Shot"]
        dialogue_per_shot = self._spread_dialogue(len(request.dialogue_lines), count)
        return [
            {
                "beat": grouped[i],
                "subjects": [e.phrase for e in request.cast if e.appears_in(grouped[i])],
                "camera_motion": moves[i % len(moves)],
                "diegetic_sound": "",
                "dialogue_indices": dialogue_per_shot[i],
            }
            for i in range(count)
        ]
    @staticmethod
    def _spread_dialogue(line_count: int, shot_count: int) -> list[list[int]]:
        per_shot = max(1, -(-line_count // shot_count))
        return [
            list(range(i * per_shot + 1, min((i + 1) * per_shot, line_count) + 1))
            for i in range(shot_count)
        ]
    def expand_shot(self, request: ShotRequest) -> str:
        if request.existing_prose:
            return request.existing_prose
        parts: list[str] = []
        beat = _clean(request.beat)
        for entry in request.cast:
            beat = entry.canonicalise(beat)
        if beat:
            parts.append(beat)
        if request.camera_sentence:
            parts.append(request.camera_sentence)
        parts.extend(request.dialogue_placeholders)
        text = " ".join(closed for p in parts if p and (closed := _end_sentence(p)))
        return _clean(text) if text else "The scene holds."
    CAMERA_FIELDS = ("integrated_multimodal_description", "detailed_description")
    def repair(self, text: str, violations: list[dict], quotes: str) -> str:
        codes = {v.get("code") for v in violations}
        fields = self._camera_fields(violations)
        if "CAMERA_AMPLITUDE_VOCAB" in codes:
            text = self._sub_in_fields(text, fields, r"with \w+ amplitude", "with small amplitude")
        if "CAMERA_SPEED_VOCAB" in codes:
            text = self._sub_in_fields(text, fields, r"at \w+ speed", "at slow speed")
        if "CAMERA_LABEL_STACKED" in codes:
            for motion, phrase in spec.CAMERA_VERB_PHRASES.items():
                text = self._sub_in_fields(
                    text, fields, rf"\b{re.escape(motion)}\b", _camera_label_fix(phrase)
                )
        if "SOUNDSCAPE_LENGTH" in codes:
            text = self._trim_field(text, "overall_soundscape", spec.SOUNDSCAPE_MAX_SENTENCES)
        if "MUSIC_LENGTH" in codes:
            text = self._trim_field(text, "non_diegetic_music", spec.MUSIC_MAX_SENTENCES)
        if "MUSIC_ABSTRACT_MOOD" in codes:
            text = self._replace_field(text, "non_diegetic_music", spec.NA_VALUE)
        return text
    @classmethod
    def _camera_fields(cls, violations: list[dict]) -> tuple[str, ...]:
        named = tuple(
            dict.fromkeys(
                v.get("field") for v in violations if v.get("field") in cls.CAMERA_FIELDS
            )
        )
        return named or cls.CAMERA_FIELDS
    @classmethod
    def _sub_in_fields(cls, text: str, names, pattern: str, replacement) -> str:
        for name in names:
            span = cls._field_span(text, name)
            if span is None:
                continue
            start, end = span
            body = text[start:end]
            out: list[str] = []
            cursor = 0
            for block in _DIALOGUE_BLOCK_RE.finditer(body):
                out.append(re.sub(pattern, replacement, body[cursor : block.start()]))
                out.append(block.group(0))
                cursor = block.end()
            out.append(re.sub(pattern, replacement, body[cursor:]))
            text = text[:start] + "".join(out) + text[end:]
        return text
    @staticmethod
    def _field_span(text: str, name: str) -> tuple[int, int] | None:
        match = re.search(rf"^{re.escape(name)}\s*:[ \t]*\n?", text, re.MULTILINE)
        if match is None:
            return None
        start = match.end()
        nxt = re.search(r"\n\s*\n", text[start:])
        return start, start + nxt.start() if nxt else len(text)
    @classmethod
    def _trim_field(cls, text: str, name: str, maximum: int) -> str:
        span = cls._field_span(text, name)
        if span is None:
            return text
        start, end = span
        return text[:start] + _limit_sentences(text[start:end], maximum) + text[end:]
    @classmethod
    def _replace_field(cls, text: str, name: str, value: str) -> str:
        span = cls._field_span(text, name)
        if span is None:
            return text
        start, end = span
        return text[:start] + value + text[end:]
    def write_sound(self, request: SoundRequest) -> tuple[str, str]:
        ambience = _clean(request.style_ambience).rstrip(".")
        if not _has_words(ambience):
            ambience = "quiet location room tone"
        ambience = ambience[0].upper() + ambience[1:]
        soundscape = (
            f"{ambience} continues throughout the video. "
            "Movement, footsteps and handled objects register as close physical detail."
        )
        soundscape = _limit_sentences(soundscape, spec.SOUNDSCAPE_MAX_SENTENCES)
        if not request.allow_music:
            return soundscape, spec.NA_VALUE
        if not _has_words(request.style_music):
            return soundscape, spec.NA_VALUE
        music = _limit_sentences(request.style_music, spec.MUSIC_MAX_SENTENCES)
        return soundscape, music or spec.NA_VALUE
