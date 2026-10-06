from __future__ import annotations
CARRY_FULL = 0.55
def carry_view(span: float, full: float = None) -> str:
    cut = CARRY_FULL if full is None else float(full)
    return "full" if float(span or 0.0) > cut else ""
def take_shape(span, identity, donor, full: float = None):
    wide, tall = (int(v) for v in (identity or (0, 0)))
    if not carry_view(span, full):
        return (wide, tall)
    other = tuple(int(v) for v in (donor or (0, 0)))
    return other if other[0] > 0 and other[1] > 0 else (wide, tall)
VIEWS: dict[str, dict[str, str]] = {
    "front": {
        "label": "анфас",
        "angle": "seen from the front, head-on",
        "pose": "facing the camera, upper body in frame",
        "framing": "medium framing, at eye level",
    },
    "profile": {
        "label": "в профиль",
        "angle": "seen from the side, in profile",
        "pose": "turned fully to one side, the head in profile, upper body in frame",
        "framing": "medium framing, at eye level",
    },
    "full": {
        "label": "в полный рост",
        "angle": "",
        "pose": "standing upright, facing the camera, the whole body from head to feet in frame",
        "framing": "full-length framing, at eye level",
    },
    "waist": {
        "label": "по пояс",
        "angle": "",
        "pose": "facing the camera, in frame from the waist up",
        "framing": "medium framing, at eye level",
    },
    "above": {
        "label": "вид сверху",
        "angle": "seen from above",
        "pose": "facing the camera, upper body in frame, looking up toward the lens",
        "framing": "medium framing",
    },
    "below": {
        "label": "вид снизу",
        "angle": "seen from below, from a low angle",
        "pose": "facing the camera, upper body in frame, the lens below the chin",
        "framing": "medium framing",
    },
}
_STYLE = "Photorealistic, live-action, soft even light"
_GROUND = "standing still against a plain neutral background"
def _filenameish(label: str) -> bool:
    stripped = label.strip()
    if not stripped:
        return True
    lowered = stripped.lower()
    digits = 0
    for character in stripped:
        digits = digits + 1 if character.isdigit() else 0
        if digits >= 4:
            return True
    return lowered.split()[0].rstrip(":") in (
        "screenshot", "img", "dsc", "photo", "image", "frame")
def _strip_extension(label: str) -> str:
    head, dot, tail = str(label or "").rpartition(".")
    return head if dot and 2 <= len(tail) <= 4 and tail.isalnum() else str(label or "")
def _join(words: list[str], last: str = "and") -> str:
    words = [w for w in words if w]
    if not words:
        return ""
    if len(words) == 1:
        return words[0]
    return f"{', '.join(words[:-1])} {last} {words[-1]}"
_ARTICLES = ("a ", "an ", "the ")
def as_noun_phrase(text: str) -> str:
    phrase = " ".join(str(text or "").split()).strip().rstrip(".")
    if not phrase:
        return ""
    lowered = phrase[0].lower() + phrase[1:]
    if lowered.lower().startswith(_ARTICLES):
        return lowered
    return f"a {lowered}"
def _fresh(phrase: str, name: str, share: float = 0.6) -> str:
    words = [w for w in " ".join(str(phrase or "").split()).strip(" .,").lower().split() if w]
    if not words:
        return ""
    known = set(str(name or "").lower().split())
    same = sum(1 for word in words if word.strip(",") in known)
    if same >= max(1, int(len(words) * share)):
        return ""
    return " ".join(str(phrase).split()).strip().rstrip(".")
def who_is(identity: dict, seen: dict | None = None) -> str:
    phrase = as_noun_phrase((seen or {}).get("subject"))
    if phrase:
        return phrase
    label = _strip_extension(str(identity.get("label") or "")).strip()
    return "the person" if _filenameish(label) else label
def transfer_prompt(identity: dict, donors: list, view: str = "",
                    seen: dict | None = None) -> str:
    who = who_is(identity, seen)
    shape = VIEWS.get(view or "", {})
    framing = shape.get("framing") or "medium framing, at eye level"
    angle = shape.get("angle") or ""
    pose = shape.get("pose") or "facing the camera, upper body in frame"
    named = []
    for donor in donors or []:
        traits = [str(t).strip() for t in (donor.get("traits") or []) if str(t).strip()]
        if not traits:
            traits = [f"the detail in picture {donor.get('picture', 2)}"]
        what = _join(traits)
        named.append({
            "picture": int(donor.get("picture") or 2),
            "traits": traits,
            "what": what,
            "phrase": _fresh(str(donor.get("phrase") or ""), what),
        })
    sources = "".join(
        f" and whose {d['what']} comes from <Picture {d['picture']}>" for d in named)
    if named:
        where = ("the donor pictures" if len(named) > 1
                 else f"<Picture {named[0]['picture']}>")
        face = (f" His face is the face in <Picture 1> and no other; the face in "
                f"{where} is never used.")
    else:
        face = ""
    donor_definitions = "\n".join(
        f"<Picture {d['picture']}> provides only the {d['what']}"
        + (f" -- {d['phrase']}" if d["phrase"] else "")
        + "; the person in it does not appear."
        for d in named)
    retention = [
        "<Subject 1> (appears in [Shot 1]): " + (
            "partially_preserved - the face and identity from <Picture 1> are kept; "
            "the traits listed above are replaced by their donor pictures."
            if named else
            "fully_preserved - the appearance established in <Picture 1> is carried unchanged."),
        "<Picture 1> (identity source): " + (
            "partially_preserved - face and identity carried unchanged; the replaced "
            "traits are not used." if named else "fully_preserved - carried unchanged."),
    ]
    retention += [
        f"<Picture {d['picture']}> ({d['what']} source): attribute_transfer - only the "
        f"{d['what']} is transferred onto <Subject 1>; nothing else of the picture appears."
        for d in named
    ]
    traits_prose = ""
    if named:
        traits_prose = " His " + _join(
            [f"{d['what']} comes from <Picture {d['picture']}>" for d in named],
            last="and his") + " exactly."
    summary_view = f", {angle}" if angle else ""
    composition = f"{_STYLE}, {framing}" + (f", {angle}" if angle else "")
    return "\n".join([
        "subject_definitions:",
        f"<Subject 1> is {who}, the man in <Picture 1> and no other person, whose face and "
        f"identity come from <Picture 1>{sources}.{face}"
        + (f"\n{donor_definitions}" if donor_definitions else ""),
        "",
        "summary:",
        f"[reference generation] A single still portrait of <Subject 1>{summary_view}, "
        "generated from the reference pictures. The person in frame is the man from "
        "<Picture 1>. Exactly one person is in frame.",
        "",
        "retention_analysis:",
        "\n".join(retention),
        "",
        "detailed_description:",
        f"{composition}. [Shot 1] A single portrait: exactly one person on screen, "
        f"<Subject 1> -- the man from <Picture 1> -- {pose}, {_GROUND}."
        + traits_prose
        + " The camera holds a static shot.",
        "",
        "overall_soundscape:",
        "Quiet room tone.",
        "",
        "non_diegetic_music:",
        "none",
    ])
