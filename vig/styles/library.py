from __future__ import annotations
import functools
import json
from pathlib import Path
from .. import paths
from .schema import DEFAULT_STYLE, DirectorStyle
PACKAGE_ROOT = Path(__file__).resolve().parent.parent.parent
BUNDLED_DIR = PACKAGE_ROOT / "styles" / "directors"
USER_SUBDIR = "vig_h3_director"
def user_root() -> Path:
    return paths.user_root()
def user_styles_dir() -> Path:
    return user_root() / "styles"
def pending_dir() -> Path:
    return user_root() / "pending"
def _load_dir(path: Path, origin: str) -> dict[str, DirectorStyle]:
    out: dict[str, DirectorStyle] = {}
    if not path.is_dir():
        return out
    for entry in sorted(path.glob("*.json")):
        try:
            style = DirectorStyle.load(entry)
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            print(f"[VIG MiniMax H3 Director] skipping malformed style {entry.name}: {exc}")
            continue
        if not style.id:
            style.id = entry.stem
        if not style.origin or style.origin == "director":
            style.origin = origin
        out[style.id] = style
    return out
@functools.lru_cache(maxsize=1)
def _cached_library() -> dict[str, DirectorStyle]:
    library: dict[str, DirectorStyle] = {DEFAULT_STYLE.id: DEFAULT_STYLE}
    library.update(_load_dir(BUNDLED_DIR, "director"))
    try:
        from .skill_adapter import adapted_styles
        library.update({s.id: s for s in adapted_styles()})
    except Exception as exc:
        print(f"[VIG MiniMax H3 Director] skill style adapter unavailable: {exc}")
    library.update(_load_dir(user_styles_dir(), "user"))
    return library
def refresh() -> None:
    _cached_library.cache_clear()
def all_styles() -> dict[str, DirectorStyle]:
    return dict(_cached_library())
def style_ids() -> list[str]:
    order = {"director": 0, "skill": 1, "user": 2}
    styles = _cached_library().values()
    return [
        s.id
        for s in sorted(styles, key=lambda s: (order.get(s.origin, 3), s.display_name or s.id))
    ]
def writer_style_ids() -> list[str]:
    keep = {"universal": 0, "skill": 1, "user": 2}
    styles = [
        s
        for s in _cached_library().values()
        if not (s.attribution or "").strip()
    ]
    def bucket(style: DirectorStyle) -> int:
        if style.origin == "skill":
            return keep["skill"]
        if style.origin == "user":
            return keep["user"]
        return keep["universal"]
    return [
        s.id for s in sorted(styles, key=lambda s: (bucket(s), s.display_name or s.id))
    ]
def get(style_id: str) -> DirectorStyle:
    library = _cached_library()
    if style_id in library:
        return library[style_id]
    print(
        f"[VIG MiniMax H3 Director] unknown style {style_id!r}; using {DEFAULT_STYLE.id!r}. "
        f"Available: {', '.join(sorted(library))}"
    )
    return DEFAULT_STYLE
def save_user_style(style: DirectorStyle, overwrite: bool = False) -> Path:
    problems = style.validate()
    if problems:
        raise ValueError("cannot save an invalid style: " + "; ".join(problems))
    style.origin = "user"
    directory = user_styles_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{style.id}.json"
    if path.exists() and not overwrite:
        raise FileExistsError(f"style {style.id!r} already exists at {path}")
    style.save(path)
    refresh()
    return path
def save_pending(style: DirectorStyle, note: str = "", learner: dict | None = None) -> Path:
    directory = pending_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{style.id}.json"
    payload = style.to_dict()
    payload["_note"] = note
    if learner:
        payload["_learner"] = learner
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path
def list_pending() -> list[str]:
    directory = pending_dir()
    return sorted(p.stem for p in directory.glob("*.json")) if directory.is_dir() else []
def promote_pending(style_id: str, overwrite: bool = False) -> Path:
    source = pending_dir() / f"{style_id}.json"
    if not source.is_file():
        raise FileNotFoundError(f"no pending style {style_id!r}")
    data = json.loads(source.read_text(encoding="utf-8"))
    data.pop("_note", None)
    data.pop("_learner", None)
    path = save_user_style(DirectorStyle.from_dict(data), overwrite=overwrite)
    source.unlink()
    return path
