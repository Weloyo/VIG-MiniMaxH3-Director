from __future__ import annotations
import re
from .. import h3_spec as spec
FIELD_NAMES = tuple(dict.fromkeys(spec.BASE_FIELDS + spec.REF_FIELDS))
PATTERNS: tuple[tuple[str, str], ...] = (
    ("field", r"(?:" + "|".join(FIELD_NAMES) + r"):"),
    ("shot", r"\[Shot\s+\d+\]"),
    ("label", r"<(?:Subject|Picture|Video|Audio)\s+\d+>"),
    ("speech", r"</?d>"),
    ("language", r"\[(?:English|Russian|Chinese|Japanese|Korean|Spanish|French|German)\]"),
    ("speaker", r"\(S\d+\)\s*says:"),
    ("time", r"At\s+\d{2}:\d{2}\.\d{3}"),
    ("tag", r"@R\d+"),
    ("dialogue", r"\{\{DIALOGUE_\d+\}\}"),
)
_ALL = re.compile("|".join(f"(?:{pattern})" for _, pattern in PATTERNS))
_HOLE = re.compile(r"\[\[(\d+)\]\]")
def kind_of(span: str) -> str:
    for name, pattern in PATTERNS:
        if re.fullmatch(pattern, span):
            return name
    return "marker"
def shield(text: str) -> tuple[str, list[str]]:
    kept: list[str] = []
    def take(match: re.Match) -> str:
        kept.append(match.group(0))
        return f"[[{len(kept) - 1}]]"
    return _ALL.sub(take, text), kept
def restore(text: str, kept: list[str]) -> tuple[str, list[str]]:
    seen: dict[int, int] = {}
    def put(match: re.Match) -> str:
        index = int(match.group(1))
        seen[index] = seen.get(index, 0) + 1
        return kept[index] if 0 <= index < len(kept) else match.group(0)
    out = _HOLE.sub(put, text)
    trouble: list[str] = []
    lost = [i for i in range(len(kept)) if i not in seen]
    if lost:
        named = ", ".join(sorted({f"{kind_of(kept[i])} {kept[i]!r}" for i in lost}))
        trouble.append(f"the translation lost {len(lost)} format marker(s): {named}")
    twice = [i for i, count in seen.items() if count > 1 and 0 <= i < len(kept)]
    if twice:
        named = ", ".join(sorted({f"{kept[i]!r}" for i in twice}))
        trouble.append(f"the translation repeated {len(twice)} format marker(s): {named}")
    unknown = sorted({int(m.group(1)) for m in _HOLE.finditer(out)})
    if unknown:
        trouble.append(
            f"the translation invented {len(unknown)} placeholder(s) that were never sent"
        )
    return out, trouble
