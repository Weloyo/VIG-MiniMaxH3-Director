from __future__ import annotations
import re
from dataclasses import dataclass
from . import h3_spec as spec
_SENTENCE_RE = re.compile(
    r"(?<=[.!?])"
    r"(?<!\bMr\.)(?<!\bMrs\.)(?<!\bMs\.)(?<!\bDr\.)(?<!\bSt\.)(?<!\bMt\.)(?<!\bvs\.)"
    r"(?<!\be\.g\.)(?<!\bi\.e\.)"
    r"\s+"
)
def sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_RE.split((text or "").strip()) if s.strip()]
_STOP_WORDS = frozenset(
    """
    a an the and or but so nor yet then that this these those which who whom whose
    is are was were be been being am get gets got
    has have had do does did will would can could should shall may might must
    he she it they them him her his hers its their theirs we us our you your i me my
    of to from into onto at on in by for with without over under across through
    about after before during until since than though because while when where why how
    as if not no very just still again there here what all some any each every
    steps step walks walk runs run climbs climb stops stop opens open closes close
    checks check holds hold turns turn looks look sits sit stands stand enters enter
    leaves leave moves move reaches reach lifts lift places place sets set picks pick
    pulls pull pushes push waits wait watches watch speaks speak says say takes take
    gives give crosses cross passes pass arrives arrive appears appear begins begin
    continues continue drops drop falls fall rises rise raises raise carries carry
    wears wear points point waves wave knocks knock presses press drives drive
    rides ride flies fly jumps jump slides slide pauses pause kneels kneel leans lean
    breathes breathe smiles smile laughs laugh cries cry shouts shout whispers whisper
    nods nod shakes shake follows follow pulls hands hand throws throw catches catch
    """.split()
)
_APPEARANCE_PREPOSITIONS = frozenset({"in", "with", "wearing", "carrying", "holding"})
_INNER_DETERMINERS = frozenset({"a", "an", "the", "his", "her", "their", "its"})
_DETERMINER_RE = re.compile(r"\b(a|an|the)\b", re.IGNORECASE)
_NEXT_WORD_RE = re.compile(r"[ \t]+([a-z][a-z'’-]*)")
_MAX_BASE_WORDS = 4
_MAX_CLAUSE_WORDS = 3
_PRONOUN_RE = re.compile(r"\b(?:he|she|they|him|her|them|his|hers|their|theirs|its)\b", re.I)
@dataclass(frozen=True)
class NounPhrase:
    text: str
    determiner: str
    head: str
    start: int
    @property
    def body(self) -> str:
        return self.text[len(self.determiner) :].strip()
    @property
    def modified(self) -> bool:
        return len(self.text.split()) > 2
    @property
    def word_count(self) -> int:
        return len(self.text.split())
def _read_words(text: str, cursor: int, limit: int) -> tuple[list[str], int]:
    words: list[str] = []
    while len(words) < limit:
        match = _NEXT_WORD_RE.match(text, cursor)
        if match is None or match.group(1) in _STOP_WORDS:
            break
        words.append(match.group(1))
        cursor = match.end()
    return words, cursor
def _trim_trailing_verb(text: str, base: list[str], cursor: int) -> tuple[list[str], int]:
    if len(base) < 2:
        return base, cursor
    following = _NEXT_WORD_RE.match(text, cursor)
    if following is None or following.group(1) not in _INNER_DETERMINERS:
        return base, cursor
    trimmed = base[:-1]
    return trimmed, cursor - (len(base[-1]) + 1)
def _read_appearance_clause(text: str, cursor: int) -> int:
    preposition = _NEXT_WORD_RE.match(text, cursor)
    if preposition is None or preposition.group(1) not in _APPEARANCE_PREPOSITIONS:
        return cursor
    after = preposition.end()
    determiner = _NEXT_WORD_RE.match(text, after)
    if determiner is not None and determiner.group(1) in _INNER_DETERMINERS:
        after = determiner.end()
    words, after = _read_words(text, after, _MAX_CLAUSE_WORDS)
    return after if words else cursor
def noun_phrases(text: str) -> list[NounPhrase]:
    source = text or ""
    found: list[NounPhrase] = []
    consumed_to = 0
    for match in _DETERMINER_RE.finditer(source):
        if match.start() < consumed_to:
            continue
        base, cursor = _read_words(source, match.end(), _MAX_BASE_WORDS)
        if not base:
            continue
        base, cursor = _trim_trailing_verb(source, base, cursor)
        cursor = _read_appearance_clause(source, cursor)
        found.append(
            NounPhrase(
                text=source[match.start() : cursor],
                determiner=match.group(1),
                head=base[-1],
                start=match.start(),
            )
        )
        consumed_to = cursor
    return found
_SHOT_HEAD_RE = re.compile(
    r"^[ \t]*(?:\[[ \t]*)?(?:shot|scene|кадр|шот|сцена)[ \t]*(\d{1,2})[ \t]*"
    r"(?P<close>\])?[ \t]*(?P<rest>.*)$",
    re.IGNORECASE | re.MULTILINE,
)
_NUMBERED_HEAD_RE = re.compile(
    r"^[ \t]*(\d{1,2})[ \t]*(?P<close>[.)])[ \t]*(?P<rest>.*)$", re.MULTILINE
)
_MARKER_RE = re.compile(r"^[(\[{]([^)\]}\n]{1,60})[)\]}][ \t]*")
_SEPARATOR_RE = re.compile(r"^[:.)\-–—][ \t]*")
_MIN_DIRECTIONS = 2
_CAMERA_ALIASES: dict[str, tuple[str, ...]] = {
    "Zoom In": ("зум ин", "зум на", "приближение зумом", "zoom in"),
    "Zoom Out": ("зум аут", "зум от", "отдаление зумом", "zoom out"),
    "Push In": ("наезд", "наплыв", "долли ин", "dolly in", "push in"),
    "Pull Out": ("отъезд", "долли аут", "dolly out", "pull out"),
    "Pan Left": ("панорама влево", "пан влево", "pan left"),
    "Pan Right": ("панорама вправо", "пан вправо", "pan right"),
    "Truck Left": ("проезд влево", "тревеллинг влево", "truck left"),
    "Truck Right": ("проезд вправо", "тревеллинг вправо", "truck right"),
    "Tilt Up": ("наклон вверх", "тилт вверх", "tilt up"),
    "Tilt Down": ("наклон вниз", "тилт вниз", "tilt down"),
    "Pedestal Up": ("подъём камеры", "подъем камеры", "кран вверх", "pedestal up"),
    "Pedestal Down": ("опускание камеры", "кран вниз", "pedestal down"),
    "Arc Shot": ("облёт", "облет", "дуга", "arc shot", "arc"),
    "Tracking Shot": ("проводка", "слежение", "tracking shot", "tracking"),
    "Static Shot": ("статика", "статичный", "статичная", "неподвижн", "static shot", "static"),
    "Shake Slightly": ("лёгкая тряска", "легкая тряска", "тряска", "shake slightly"),
    "Shake Strongly": ("сильная тряска", "shake strongly"),
    "POV": ("от первого лица", "субъективная камера", "субъективка", "pov"),
    "Roll Clockwise": ("крен по часовой", "roll clockwise"),
    "Roll Counterclockwise": ("крен против часовой", "roll counterclockwise"),
}
_SPEED_ALIASES: dict[str, tuple[str, ...]] = {
    spec.SPEEDS[0]: ("медленн", "плавн", "slow"),
    spec.SPEEDS[1]: ("быстр", "резк", "стремительн", "fast"),
}
_AMPLITUDE_ALIASES: dict[str, tuple[str, ...]] = {
    spec.AMPLITUDES[0]: ("небольш", "малая", "малый", "чуть", "slight", "small"),
    spec.AMPLITUDES[1]: ("сильн", "широк", "больш", "large", "wide"),
}
_CAMERA_LOOKUP: tuple[tuple[str, str], ...] = tuple(
    sorted(
        ((alias, motion) for motion, aliases in _CAMERA_ALIASES.items() for alias in aliases),
        key=lambda pair: -len(pair[0]),
    )
)
def _qualifier(marker: str, table: dict[str, tuple[str, ...]]) -> str | None:
    for value, prefixes in table.items():
        if any(prefix in marker for prefix in prefixes):
            return value
    return None
def read_camera_marker(marker: str) -> tuple[str | None, str | None, str | None]:
    text = " ".join((marker or "").lower().split())
    if not text:
        return None, None, None
    motion = next((m for alias, m in _CAMERA_LOOKUP if alias in text), None)
    if motion is None:
        return None, None, None
    if motion in spec.MOTIONS_WITHOUT_MODIFIERS:
        return motion, None, None
    return motion, _qualifier(text, _AMPLITUDE_ALIASES), _qualifier(text, _SPEED_ALIASES)
_CYRILLIC_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
    "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i",
    "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
    "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch",
    "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "",
    "э": "e", "ю": "yu", "я": "ya",
}
def latinise(name: str) -> str:
    if not name or all(ord(ch) < 0x0400 for ch in name):
        return name or ""
    out: list[str] = []
    for ch in name:
        mapped = _CYRILLIC_LATIN.get(ch.lower())
        if mapped is None:
            out.append(ch)
            continue
        out.append(mapped.upper() if ch.isupper() and len(mapped) == 1 else
                   mapped.capitalize() if ch.isupper() else mapped)
    return "".join(out)
@dataclass(frozen=True)
class ShotDirection:
    text: str
    motion: str | None = None
    amplitude: str | None = None
    speed: str | None = None
    marker: str = ""
    @property
    def has_camera(self) -> bool:
        return self.motion is not None
def _peel(rest: str, ended: bool) -> tuple[str, str] | None:
    marker = ""
    for _ in range(2):
        found = _MARKER_RE.match(rest)
        if found and not marker:
            marker = found.group(1).strip()
            rest = rest[found.end() :]
            continue
        separator = _SEPARATOR_RE.match(rest)
        if separator:
            rest = rest[separator.end() :]
            ended = True
            continue
        break
    return (marker, rest.strip()) if ended or not rest.strip() else None
def _continuation(tail: str, has_inline_beat: bool) -> str:
    rest = tail.splitlines()
    if rest and not rest[0].strip():
        rest = rest[1:]
    lines: list[str] = []
    for line in rest:
        if not line.strip():
            if lines or has_inline_beat:
                break
            continue
        if _SHOT_HEAD_RE.match(line) or _NUMBERED_HEAD_RE.match(line):
            break
        lines.append(line.strip())
    return " ".join(lines)
def shot_directions(text: str) -> list[ShotDirection]:
    body = text or ""
    for pattern in (_SHOT_HEAD_RE, _NUMBERED_HEAD_RE):
        found: list[tuple[int, ShotDirection]] = []
        matches = list(pattern.finditer(body))
        for position, match in enumerate(matches):
            peeled = _peel(match.group("rest"), bool(match.group("close")))
            if peeled is None:
                continue
            marker, beat = peeled
            limit = matches[position + 1].start() if position + 1 < len(matches) else len(body)
            trailing = _continuation(body[match.end() : limit], bool(beat))
            beat = f"{beat} {trailing}".strip() if trailing else beat
            if not beat:
                continue
            motion, amplitude, speed = read_camera_marker(marker)
            found.append(
                (
                    int(match.group(1)),
                    ShotDirection(
                        text=beat,
                        motion=motion,
                        amplitude=amplitude,
                        speed=speed,
                        marker=marker,
                    ),
                )
            )
        if len(found) < _MIN_DIRECTIONS:
            continue
        if pattern is _NUMBERED_HEAD_RE:
            if [n for n, _ in found] != list(range(1, len(found) + 1)):
                continue
        return [direction for _, direction in found]
    return []
def has_pronoun(text: str) -> bool:
    return bool(_PRONOUN_RE.search(text or ""))
