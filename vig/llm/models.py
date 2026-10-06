from __future__ import annotations
import os
import re
from dataclasses import dataclass
from .base import BackendError
GGUF_SUFFIX = ".gguf"
COMFY_FOLDER_KEYS = ("LLM_checkpoints", "gguf")
_PROJECTOR_TOKEN = "mmproj"
MAX_SEARCH_DEPTH = 5
@dataclass(frozen=True)
class GGUFModel:
    identifier: str
    path: str
    mmproj_path: str = ""
    size_bytes: int = 0
    @property
    def filename(self) -> str:
        return os.path.basename(self.path)
    @property
    def has_vision(self) -> bool:
        return bool(self.mmproj_path)
    def describe(self) -> str:
        size = f"{self.size_bytes / (1024 ** 3):.1f} GB" if self.size_bytes else "unknown size"
        vision = f", vision via {os.path.basename(self.mmproj_path)}" if self.mmproj_path else ""
        return f"{self.identifier} ({size}{vision})"
def is_projector(filename: str) -> bool:
    stem = os.path.splitext(os.path.basename(filename))[0].lower()
    return _PROJECTOR_TOKEN in stem
_HELPER_ARCH_SUFFIXES = ("-assistant", "-mtp", "-draft")
_HEADER_BYTES = 1 << 16
def gguf_architecture(path: str) -> str:
    import struct
    try:
        with open(path, "rb") as handle:
            head = handle.read(_HEADER_BYTES)
    except OSError:
        return ""
    key = b"general.architecture"
    at = head.find(key)
    if head[:4] != b"GGUF" or at < 0 or at + len(key) + 12 > len(head):
        return ""
    at += len(key)
    if struct.unpack_from("<I", head, at)[0] != 8:
        return ""
    length = struct.unpack_from("<Q", head, at + 4)[0]
    return head[at + 12:at + 12 + length].decode("utf-8", "replace")
def is_helper(path: str) -> bool:
    arch = gguf_architecture(path).lower()
    return arch == "clip" or arch.endswith(_HELPER_ARCH_SUFFIXES)
def comfy_roots() -> list[str]:
    try:
        import folder_paths
    except Exception:
        return []
    from .. import paths
    roots: list[str] = []
    for key in COMFY_FOLDER_KEYS:
        registered: list[str] = []
        try:
            registered = list(folder_paths.get_folder_paths(key))
        except Exception:
            registered = []
        if not registered:
            registered = paths.model_folders(key)
        for path in registered:
            if path not in roots:
                roots.append(path)
    return roots
def comfy_models_dir() -> str:
    try:
        import folder_paths
    except Exception:
        return ""
    return str(getattr(folder_paths, "models_dir", "") or "")
def search_roots(extra_dir: str = "") -> list[str]:
    roots = comfy_roots()
    extra = (extra_dir or "").strip().strip('"')
    if extra and extra not in roots:
        roots.append(os.path.abspath(os.path.expanduser(extra)))
    return [r for r in roots if r]
def _walk(root: str) -> list[str]:
    if not os.path.isdir(root):
        return []
    found: list[str] = []
    root = os.path.abspath(root)
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath[len(root) :].count(os.sep)
        if depth >= MAX_SEARCH_DEPTH:
            dirnames[:] = []
        else:
            dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for name in sorted(filenames):
            if name.lower().endswith(GGUF_SUFFIX):
                found.append(os.path.join(dirpath, name))
    return found
def _pick_projector(model_path: str, candidates: list[str]) -> str:
    if not candidates:
        return ""
    stem = os.path.splitext(os.path.basename(model_path))[0].lower()
    def affinity(path: str) -> tuple[int, str]:
        other = os.path.splitext(os.path.basename(path))[0].lower()
        shared = 0
        for a, b in zip(stem, other.replace(_PROJECTOR_TOKEN, "").lstrip("-_")):
            if a != b:
                break
            shared += 1
        return (-shared, os.path.basename(path).lower())
    return sorted(candidates, key=affinity)[0]
def discover(extra_dir: str = "") -> list[GGUFModel]:
    models: list[GGUFModel] = []
    taken: dict[str, str] = {}
    for root in search_roots(extra_dir):
        files = _walk(root)
        projectors: dict[str, list[str]] = {}
        for path in files:
            if is_projector(path):
                projectors.setdefault(os.path.dirname(path), []).append(path)
        for path in files:
            if is_projector(path) or is_helper(path):
                continue
            identifier = os.path.relpath(path, root).replace(os.sep, "/")
            if taken.get(identifier, path) != path:
                identifier = path.replace(os.sep, "/")
            if identifier in taken:
                continue
            taken[identifier] = path
            try:
                size = os.path.getsize(path)
            except OSError:
                size = 0
            models.append(
                GGUFModel(
                    identifier=identifier,
                    path=path,
                    mmproj_path=_pick_projector(path, projectors.get(os.path.dirname(path), [])),
                    size_bytes=size,
                )
            )
    return sorted(models, key=lambda m: m.identifier)
AUTO_MODEL = "auto (smallest found)"
_QUANT_RE = re.compile(r"(?:^|[-_. ])i?q(\d)", re.IGNORECASE)
MIN_QUANT_BITS = 4
def quant_bits(identifier: str) -> int | None:
    match = _QUANT_RE.search(os.path.basename(identifier or ""))
    return int(match.group(1)) if match else None
def is_auto(identifier: str) -> bool:
    return (identifier or "").strip() in ("", AUTO_MODEL)
REMEMBERED_FILE = "model_dir.json"
def _remembered_path():
    from ..paths import user_root
    return user_root() / REMEMBERED_FILE
def remembered_dir() -> str:
    try:
        import json
        data = json.loads(_remembered_path().read_text(encoding="utf-8"))
        return str(data.get("gguf_dir") or "")
    except Exception:
        return ""
def remember_dir(extra_dir: str) -> None:
    directory = (extra_dir or "").strip().strip('"')
    if not directory or directory == remembered_dir():
        return
    try:
        if not discover(directory):
            return
    except Exception:
        return
    try:
        import json
        path = _remembered_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"gguf_dir": directory}, indent=2), encoding="utf-8")
    except Exception:
        pass
def dropdown_models(extra_dir: str = "") -> list[str]:
    return [AUTO_MODEL] + list_models(extra_dir or remembered_dir())
def list_models(extra_dir: str = "") -> list[str]:
    try:
        return [model.identifier for model in discover(extra_dir)]
    except Exception:
        return []
def resolve(identifier: str, extra_dir: str = "") -> GGUFModel:
    wanted = (identifier or "").strip().strip('"')
    available = discover(extra_dir)
    if wanted and wanted.lower().endswith(GGUF_SUFFIX) and os.path.isfile(wanted):
        path = os.path.abspath(wanted)
        for model in available:
            if os.path.normcase(model.path) == os.path.normcase(path):
                return model
        directory = os.path.dirname(path)
        siblings = [
            os.path.join(directory, n)
            for n in sorted(os.listdir(directory))
            if n.lower().endswith(GGUF_SUFFIX) and is_projector(n)
        ]
        try:
            size = os.path.getsize(path)
        except OSError:
            size = 0
        return GGUFModel(
            identifier=path.replace(os.sep, "/"),
            path=path,
            mmproj_path=_pick_projector(path, siblings),
            size_bytes=size,
        )
    if not available:
        roots = search_roots(extra_dir)
        where = "\n  ".join(roots) if roots else "(no search directories are configured)"
        raise BackendError(
            "no GGUF model was found. Put one in a directory below, or set the extra "
            f"model directory to where yours lives:\n  {where}"
        )
    if not wanted:
        usable = [m for m in available if (quant_bits(m.identifier) or 8) >= MIN_QUANT_BITS]
        return min(usable or available, key=lambda m: (m.size_bytes or 0, m.identifier))
    for model in available:
        if model.identifier == wanted:
            return model
    for model in available:
        if model.filename == os.path.basename(wanted):
            return model
    raise BackendError(
        f"GGUF model {wanted!r} was not found; available: "
        + ", ".join(m.identifier for m in available[:8])
    )
