from __future__ import annotations
import contextlib
import os
import threading
import time
from collections import OrderedDict
from typing import Any
from ..vig.cutter import refmask
from ..vig.cutter import refwrite
from .cutter import _resolve_media
SEGMENT_ROUTE = "/vig/h3/cutter/segment"
SEGMENT_CROP_ROUTE = "/vig/h3/cutter/segment_crop"
SEGMENT_AUTO_ROUTE = "/vig/h3/cutter/segment_auto"
SEGMENT_METHODS_ROUTE = "/vig/h3/cutter/segment_methods"
SEGMENT_WARM_ROUTE = "/vig/h3/cutter/segment_warm"
REFERENCE_WRITE_ROUTE = "/vig/h3/cutter/reference_write"
REFERENCE_CROP_ROUTE = "/vig/h3/cutter/reference_crop"
SAM = "sam"
METHOD_LABELS = {
    SAM: "SAM",
}
DEFAULT_METHOD = SAM
WARM_SECONDS = {SAM: 3.3}
METHOD_ALIASES = {"sam2": SAM, "sam3": SAM,
                  "tagger": SAM, "sam_tagger": SAM, "wd14": SAM,
                  "florence2": SAM, "florence": SAM}
AUTO_POINTS = 12
AUTO_LONGEST = 768
AUTO_MIN_AREA = 0.3
AUTO_MAX_AREA = 60.0
CONCEPT_MIN_AREA = 0.05
AUTO_KEEP = 12
PREVIEW_DIR = ("vig_h3_cutter", "masks")
CROP_DIR = ("vig_h3_cutter", "crops")
REFS_DIR = ("vig_h3_cutter", "refs")
PREVIEW_KEEP = 60
CROP_MINIMUM = 32
PREVIEW_WIDTH = 640
_LOCK = threading.Lock()
_SESSION: dict = {"path": "", "stamp": 0.0, "predictor": None, "pixels": None,
             "checkpoint": ""}
_CANDIDATES: "OrderedDict[str, dict]" = OrderedDict()
_CANDIDATE_LIMIT = 24
def _bad(message: str, status: int = 400) -> tuple[int, dict]:
    return status, {"ok": False, "error": message}
def _input_directory() -> str:
    import folder_paths
    return folder_paths.get_input_directory()
def _config_names(name: str) -> list[str]:
    low = name.lower()
    size = next((s for s in ("tiny", "small", "base_plus", "large") if s in low), "tiny")
    short = {"tiny": "t", "small": "s", "base_plus": "b+", "large": "l"}[size]
    if "2.1" in low or "2_1" in low:
        return [f"sam2.1_hiera_{short}.yaml", f"sam2_1_hiera_{size}.yaml"]
    return [f"sam2_hiera_{short}.yaml", f"sam2_hiera_{size}.yaml"]
def _config_of(checkpoint: str) -> tuple[str, str]:
    import sam2
    package = os.path.dirname(os.path.abspath(sam2.__file__))
    roots = [
        os.path.join(package, "configs", "sam2.1"),
        os.path.join(package, "configs", "sam2"),
        os.path.join(package, "configs"),
        package,
        os.path.join(os.path.dirname(package), "sam2_configs"),
    ]
    for root in roots:
        for name in _config_names(os.path.basename(checkpoint)):
            if os.path.isfile(os.path.join(root, name)):
                return root, name
    raise RuntimeError(
        f"No SAM2 config for {os.path.basename(checkpoint)} beside the sam2 "
        f"package at {package}."
    )
def _sam2_missing() -> str:
    import importlib.util
    gone = []
    for name in ("sam2", "hydra"):
        try:
            if importlib.util.find_spec(name) is None:
                gone.append(name)
        except (ImportError, ValueError):
            gone.append(name)
    return " and ".join(gone)
def _checkpoint_rank(name: str):
    low = os.path.basename(name).lower()
    order = ("large", "base_plus", "small", "tiny")
    return (
        0 if ("2.1" in low or "2_1" in low) else 1,
        next((i for i, size in enumerate(order) if size in low), len(order)),
    )
def _checkpoint() -> str:
    from ..vig import paths
    folder, files = "", []
    for candidate in paths.model_folders("sam2"):
        files = [
            name for name in sorted(os.listdir(candidate))
            if name.lower().endswith((".pt", ".pth", ".safetensors"))
        ]
        if files:
            folder = candidate
            break
    if not files:
        return ""
    files.sort(key=_checkpoint_rank)
    return os.path.join(folder, files[0])
def _sam_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            free, _total = torch.cuda.mem_get_info()
            if free > 3.0 * 1024 ** 3:
                return "cuda"
    except Exception:
        pass
    return "cpu"
def _build_predictor():
    import torch
    from hydra import initialize_config_dir
    from hydra.core.global_hydra import GlobalHydra
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    path = _checkpoint()
    if not path:
        raise RuntimeError(
            "No SAM2 checkpoint in models/sam2 -- put sam2_hiera_tiny.pt there, "
            "or crop the donor by hand with the tile's pencil."
        )
    config_dir, config = _config_of(path)
    if GlobalHydra().is_initialized():
        GlobalHydra.instance().clear()
    initialize_config_dir(config_dir=config_dir, version_base=None)
    model = build_sam2(config, path, device=_sam_device())
    scripted = torch.jit.script
    torch.jit.script = lambda obj, *args, **kwargs: obj
    try:
        return SAM2ImagePredictor(model), os.path.basename(path)
    finally:
        torch.jit.script = scripted
def _session(path: str):
    import numpy
    from PIL import Image, ImageOps
    stamp = os.path.getmtime(path)
    if _SESSION["path"] == path and _SESSION["stamp"] == stamp and _SESSION["predictor"]:
        return _SESSION["predictor"], _SESSION["pixels"]
    predictor, _ = _session_model()
    with Image.open(path) as handle:
        pixels = numpy.array(ImageOps.exif_transpose(handle).convert("RGB"))
    predictor.set_image(pixels)
    _SESSION.update(
        {"path": path, "stamp": stamp, "predictor": predictor, "pixels": pixels})
    return predictor, pixels
def _sweep(folder: str, keep: int) -> None:
    try:
        files = [
            os.path.join(folder, name) for name in os.listdir(folder)
            if name.lower().endswith(".png")
        ]
    except OSError:
        return
    if len(files) <= keep:
        return
    files.sort(key=os.path.getmtime, reverse=True)
    for stale in files[keep:]:
        try:
            os.remove(stale)
        except OSError:
            pass
def _filed(parts: tuple, name: str) -> tuple[str, str]:
    relative = os.path.join(*parts, name)
    target = os.path.join(_input_directory(), relative)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    return target, relative.replace(os.sep, "/")
def _remember(entry: dict) -> str:
    token = f"{int(time.time() * 1000):x}{len(_CANDIDATES):02x}"
    _CANDIDATES[token] = entry
    while len(_CANDIDATES) > _CANDIDATE_LIMIT:
        _CANDIDATES.popitem(last=False)
    return token
def _as_box(value, width: int, height: int):
    try:
        x0, y0, x1, y1 = (float(v) for v in value)
    except (TypeError, ValueError):
        return None
    x0, x1 = sorted((max(0.0, min(x0, width)), max(0.0, min(x1, width))))
    y0, y1 = sorted((max(0.0, min(y0, height)), max(0.0, min(y1, height))))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    return [x0, y0, x1, y1]
def _sam3_region(source: str, drawn, coords: list, phrase: str = ""):
    import numpy
    from PIL import Image, ImageOps
    from . import sam3
    with Image.open(source) as handle:
        picture = ImageOps.exif_transpose(handle).convert("RGB")
    pixels = numpy.array(picture)
    height, width = pixels.shape[:2]
    asked = _as_box(drawn, width, height) if drawn else None
    note = ""
    if asked is None:
        if not coords:
            return None, pixels, "That box is too small to read."
        span = 0.12 * min(width, height)
        x, y = coords[0]
        asked = _as_box([x - span, y - span, x + span, y + span], width, height)
        note = ("SAM 3 reads a rectangle, not a point -- a square around the "
                "click was used; drag a box for something tighter")
    found = sam3.box_mask(picture, asked, path=source, phrase=phrase)
    if not found:
        note = ((note + "; ") if note else "") + (
            f"\"{phrase}\" was not found in that box -- try another word, or another box"
            if phrase else "no outline came back -- try a smaller box")
    return found, pixels, note
def _cut_part(pixels, entry, matte: bool):
    import numpy
    if matte:
        return refmask.cut_out(pixels, entry["mask"], entry["box"])
    x0, y0, x1, y1 = (int(v) for v in entry["box"])
    window = numpy.asarray(pixels)[y0:y1, x0:x1, :3]
    return window.copy() if window.size else None
DIALS = {
    "score":     (None,                        0.05,   0.95),
    "speck":     (None,                        0.0,    5.0),
    "holes":     (None,                        0.0,    400.0),
    "carry":     (None,                        0.1,    0.95),
}
def _dials(payload):
    from . import sam3
    floors = {
        "score": float(sam3.SCORE),
        "speck": float(refmask.SPECK) * 100.0,
        "holes": float(refmask.GROUND_NEAR),
        "carry": float(refwrite.CARRY_FULL),
    }
    asked = (payload or {}).get("dials")
    asked = asked if isinstance(asked, dict) else {}
    out = {}
    for name, value in floors.items():
        _unused, low, high = DIALS[name]
        try:
            given = float(asked[name])
        except (KeyError, TypeError, ValueError):
            out[name] = value
            continue
        out[name] = min(max(given, low), high)
    return out
def _solid(entries, pixels=None, dials=None):
    held = dials or {}
    speck = float(held.get("speck", refmask.SPECK * 100.0)) / 100.0
    near = float(held.get("holes", refmask.GROUND_NEAR))
    for entry in entries:
        entry["mask"] = refmask.whole(
            refmask.solid(entry["mask"], speck), pixels, near)
        if "area" in entry:
            entry["area"] = round(refmask.coverage(entry["mask"]) * 100, 2)
        entry.pop("box", None)
    return entries
def _matted(mask, box, pixels=None) -> float:
    import numpy
    keep = refmask.kept(mask, pixels)
    x0, y0, x1, y1 = (int(v) for v in box)
    inside = numpy.asarray(keep)[y0:y1, x0:x1]
    return round(100.0 * (1.0 - float(inside.mean() if inside.size else 1.0)), 1)
_CONCEPT_MASKS: OrderedDict = OrderedDict()
_CONCEPT_KEEP = 3
CONCEPT_HOLDS = 0.6
def _concept_key(source: str) -> str:
    try:
        return f"{source}|{os.path.getmtime(source)}"
    except OSError:
        return source
def _named_masks(picture, source: str, notes: list, step, score=None) -> list:
    key = _concept_key(source)
    held = _CONCEPT_MASKS.get(key)
    if held is not None:
        _CONCEPT_MASKS.move_to_end(key)
        return held
    try:
        entries = _sam3_auto(picture, source, notes, step, score)
    except Exception as exc:
        notes.append(f"naming: {type(exc).__name__}: {exc}")
        return []
    kept = [{"name": one["name"], "mask": one["mask"], "area": one["area"]}
            for one in entries]
    _CONCEPT_MASKS[key] = kept
    while len(_CONCEPT_MASKS) > _CONCEPT_KEEP:
        _CONCEPT_MASKS.popitem(last=False)
    return kept
def _name_by_concept(mask, parts: list) -> str:
    import numpy
    total = float(numpy.count_nonzero(mask)) or 1.0
    best = None
    for part in parts:
        inside = float(numpy.count_nonzero(mask & part["mask"])) / total
        if inside < CONCEPT_HOLDS:
            continue
        if best is None or part["area"] < best["area"]:
            best = part
    return best["name"] if best else ""
def _name_a_click(found: list, coords: list, pixels, source: str,
                  notes: list, dials: dict) -> list:
    from PIL import Image
    try:
        from . import sam3
        ready, _why = sam3.available()
    except Exception:
        return found
    if not ready:
        return found
    parts = _named_masks(Image.fromarray(pixels), source, notes,
                         lambda *a, **k: None, (dials or {}).get("score"))
    if not parts:
        return found
    height, width = pixels.shape[:2]
    x = min(max(int(coords[0][0]), 0), width - 1)
    y = min(max(int(coords[0][1]), 0), height - 1)
    under = sorted((part for part in parts if bool(part["mask"][y, x])),
                   key=lambda part: part["area"])
    for entry in found:
        if not entry.get("label"):
            entry["label"] = _name_by_concept(entry["mask"], parts)
    offers = [{"mask": part["mask"], "score": None, "label": part["name"],
               "by_phrase": False, "cutter": "sam3"} for part in under]
    return offers + found
def handle_segment(payload: Any) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    source = _resolve_media(str(payload.get("source") or ""))
    if not source:
        return _bad("That picture is not on disk any more.")
    method = _method_of(payload)
    points = payload.get("points") or []
    drawn = payload.get("box")
    if not isinstance(points, list):
        points = []
    if not points and not drawn:
        return _bad("Click the detail you want, or drag a box round it.")
    import numpy
    from PIL import Image
    coords, labels = [], []
    for point in points:
        try:
            coords.append([float(point[0]), float(point[1])])
        except (TypeError, ValueError, IndexError):
            return _bad("A click must be a pair of numbers.")
        labels.append(int(point[2]) if len(point) > 2 else 1)
    dials = _dials(payload)
    phrase = " ".join(str(payload.get("prompt") or "").split())[:120]
    if True:
        cutters, sam_note = sam_cutters(REGION)
        if not cutters:
            return _bad(sam_note, 503)
        if not drawn and "sam2" in cutters and not phrase:
            cutters = ["sam2"]
        elif not drawn and phrase:
            pass
    notes: list[str] = []
    with _LOCK:
        try:
            started = time.monotonic()
            found: list[dict] = []
            pixels = None
            for who in cutters:
                if who == "sam3":
                    rows, pixels, said = _sam3_region(source, drawn, coords, phrase)
                    if said:
                        notes.append(f"SAM 3: {said}")
                    if rows is None:
                        continue
                    found.extend({"mask": numpy.asarray(item["mask"]).astype(bool),
                                  "score": float(item["score"]),
                                  "label": str(item.get("label") or ""),
                                  "by_phrase": bool(phrase),
                                  "cutter": who} for item in rows)
                    continue
                if True:
                    predictor, pixels = _session(source)
                    height, width = pixels.shape[:2]
                    one_point = not drawn and len(coords) == 1
                    if drawn:
                        asked = _as_box(drawn, width, height)
                        if asked is None:
                            notes.append("SAM 2: that box is too small to read")
                            continue
                        masks, scores, _ = predictor.predict(
                            box=numpy.array(asked, dtype=numpy.float32),
                            multimask_output=one_point,
                        )
                    else:
                        masks, scores, _ = predictor.predict(
                            point_coords=numpy.array(coords, dtype=numpy.float32),
                            point_labels=numpy.array(labels, dtype=numpy.int32),
                            multimask_output=one_point,
                        )
                found.extend({
                    "mask": numpy.asarray(masks[int(index)]).astype(bool),
                    "score": float(scores[int(index)]),
                    "label": "",
                    "by_phrase": False,
                    "cutter": who,
                } for index in numpy.argsort(-numpy.asarray(scores)))
            if pixels is None or not found:
                return _bad("; ".join(notes) or sam_note, 503 if pixels is None else 200)
            height, width = pixels.shape[:2]
        except Exception as exc:
            return _bad(f"the picture would not segment: {type(exc).__name__}: {exc}", 500)
        if not phrase and not drawn and coords:
            found = _name_a_click(found, coords, pixels, source, notes, dials)
        found = refmask.merge_candidates(
            _solid(found, pixels, dials), _as_box(drawn, width, height) if drawn else None)
        candidates = []
        for entry in found:
            mask = entry["mask"]
            tight = refmask.bounds_of(mask)
            if tight is None:
                continue
            box = refmask.pad_box(tight, width, height)
            shade = pixels.copy()
            shade[~mask] = (shade[~mask].astype(numpy.float32) * 0.22).astype(numpy.uint8)
            preview = Image.fromarray(shade)
            if width > PREVIEW_WIDTH:
                preview = preview.resize(
                    (PREVIEW_WIDTH, max(1, round(height * PREVIEW_WIDTH / width))))
            token = _remember({"source": source, "mask": mask, "box": box})
            target, relative = _filed(PREVIEW_DIR, f"mask_{token}.png")
            preview.save(target, compress_level=3)
            candidates.append({
                "token": token,
                "score": (round(entry["score"], 3)
                          if entry.get("score") is not None else None),
                "cutter": entry["cutter"],
                "match": (round(float(entry["rect_iou"]), 3)
                          if "rect_iou" in entry else None),
                "area": round(refmask.coverage(mask) * 100, 2),
                "box": [int(v) for v in box],
                "outline": refmask.outline(mask, box),
                "matted": _matted(mask, box, pixels),
                "preview": relative,
                "name": "",
                "said": "",
            })
        _sweep(os.path.join(_input_directory(), *PREVIEW_DIR), PREVIEW_KEEP)
        cut = time.monotonic()
    if candidates and payload.get("name", True):
        named = [entry.get("label", "") for entry in found]
        if phrase:
            notes.append("named by the cutter -- you said what to look for")
        elif not all(named):
            notes.append(
                "some readings sit in no named part -- double-click a tag to name it"
                if not drawn else
                "a box is not named by the writer -- type a word beside it, "
                "or press Break apart to have every part named")
        for candidate, name in zip(candidates, named):
            candidate["name"] = _short(name)
            candidate["said"] = ""
            entry = _CANDIDATES.get(candidate["token"])
            if entry is not None:
                entry["name"] = name
    return 200, {
        "ok": True,
        "width": int(width),
        "height": int(height),
        "method": method,
        "cutters": cutters,
        "seconds": round(time.monotonic() - started, 2),
        "cut_seconds": round(cut - started, 2),
        "candidates": candidates,
        "notes": notes,
    }
def handle_segment_crop(payload: Any) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    entry = _CANDIDATES.get(str(payload.get("token") or ""))
    if entry is None:
        return _bad("That selection has expired -- click the detail again.")
    entry["matte"] = bool(payload.get("matte", True))
    trait = str(payload.get("trait") or "").strip()
    safe = "".join(c if c.isalnum() else "_" for c in trait).strip("_").lower()[:24]
    token = str(payload.get("token") or "")
    import numpy
    from PIL import Image, ImageOps
    with _LOCK:
        try:
            with Image.open(entry["source"]) as handle:
                pixels = numpy.array(ImageOps.exif_transpose(handle).convert("RGB"))
            cut = _cut_part(pixels, entry, entry["matte"])
            if cut is None:
                return _bad("That selection holds no pixels.")
            target, relative = _filed(CROP_DIR, f"{safe or 'detail'}_{token}.png")
            Image.fromarray(cut).save(target, compress_level=4)
        except Exception as exc:
            return _bad(f"the crop failed: {type(exc).__name__}: {exc}", 500)
    x0, y0, x1, y1 = entry["box"]
    return 200, {
        "ok": True,
        "source": relative,
        "label": trait or "detail",
        "trait": trait,
        "box": [int(x0), int(y0), int(x1), int(y1)],
        "width": int(x1 - x0),
        "height": int(y1 - y0),
    }
def handle_reference_crop(payload: Any) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    source = _resolve_media(str(payload.get("source") or ""))
    if not source:
        return _bad("That picture is not on disk any more.")
    from PIL import Image, ImageOps
    with _LOCK:
        try:
            with Image.open(source) as handle:
                picture = ImageOps.exif_transpose(handle).convert("RGB")
            width, height = picture.size
            asked = _as_box(payload.get("box"), width, height)
            if asked is None:
                return _bad("That rectangle is too small to crop.")
            x0, y0, x1, y1 = (int(round(v)) for v in asked)
            if x1 - x0 < CROP_MINIMUM or y1 - y0 < CROP_MINIMUM:
                return _bad(f"A crop must be at least {CROP_MINIMUM} pixels each way.")
            cut = picture.crop((x0, y0, x1, y1))
            stem = os.path.splitext(os.path.basename(source))[0][:32]
            safe = "".join(c if c.isalnum() else "_" for c in stem).strip("_").lower()
            target, relative = _filed(
                REFS_DIR, f"{safe or 'ref'}_crop_{int(time.time() * 1000):x}.png")
            cut.save(target, compress_level=4)
        except Exception as exc:
            return _bad(f"the crop failed: {type(exc).__name__}: {exc}", 500)
    return 200, {
        "ok": True,
        "source": relative,
        "label": os.path.basename(relative),
        "box": [x0, y0, x1, y1],
        "width": int(x1 - x0),
        "height": int(y1 - y0),
        "was": [int(width), int(height)],
    }
NAMING_SCHEMA = {
    "type": "object",
    "properties": {
        "parts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {
                        "type": "integer",
                        "description": "1 for the first picture, 2 for the second, and so on",
                    },
                    "name": {
                        "type": "string",
                        "description": (
                            "Two to four English words naming this part itself, e.g. "
                            "'dreadlock ponytail', 'short beard', 'floral shirt', "
                            "'stone wall'. Never a sentence, never the person."
                        ),
                    },
                },
                "required": ["index", "name"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["parts"],
    "additionalProperties": False,
}
SEEN_SCHEMA = {
    "type": "object",
    "properties": {
        "subject": {
            "type": "string",
            "description": (
                "One English noun phrase for the person in the FIRST picture -- "
                "approximate age, build, hair, clothing and its colour, e.g. 'a man in "
                "his thirties with short brown hair, in a white t-shirt'. No sentence."
            ),
        },
        "parts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "the part's name, as given to you"},
                    "phrase": {
                        "type": "string",
                        "description": (
                            "Two to eight words for what that part LOOKS like in the second "
                            "picture, e.g. 'long brown dreadlocks tied back'. No sentence."
                        ),
                    },
                },
                "required": ["name", "phrase"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["subject"],
    "additionalProperties": False,
}
_NAME_BATCH = 6
def _skill_says(title: str, fallback: str) -> str:
    try:
        from ..vig import guides
        text = guides.get_skill(guides.TRANSFER_SKILL).section(title)
    except Exception:
        return fallback
    return (text or "").strip() or fallback
def _writer_lock():
    from .cutter_routes import _WRITER_LOCK
    return _WRITER_LOCK
@contextlib.contextmanager
def _as_writer(payload: Any):
    from . import cutter_routes as routes
    job = payload.get("job") if isinstance(payload, dict) else None
    token = str((job or {}).get("token") or "") if isinstance(job, dict) else ""
    with _writer_lock():
        held = routes._WRITER_HOLDER
        if token:
            routes._WRITER_HOLDER = token
        try:
            yield
        finally:
            if token:
                routes._WRITER_HOLDER = held
            routes._watch_kept_writer()
_DANGLING = ("in", "on", "of", "with", "and", "a", "an", "the", "at", "to", "for",
             "wearing", "from", "over", "under")
def _short(name: str, words: int = 4) -> str:
    clean = " ".join(str(name or "").replace("\n", " ").split())
    clean = clean.strip(" .,:;-").replace("/", " or ")
    parts = [word for word in clean.lower().split(" ") if word][:words]
    while parts and parts[-1] in _DANGLING:
        parts.pop()
    return " ".join(parts)
def _name_parts(settings, crops: list, note) -> list:
    from ..vig.director import make_backend, release_backend
    names = ["" for _ in crops]
    if not crops:
        return names
    backend, notes = make_backend(settings)
    try:
        describe = getattr(backend, "describe_frames", None)
        if not callable(describe):
            note(f"the writer ({getattr(backend, 'name', '?')}) cannot look at pictures, "
                 "so the parts are unnamed -- point it at a model with an mmproj beside it")
            return names
        for start in range(0, len(crops), _NAME_BATCH):
            batch = crops[start:start + _NAME_BATCH]
            try:
                answer = describe(batch, NAMING_SCHEMA, instruction=(
                    f"These {len(batch)} pictures are parts cut out of ONE photograph.\n\n"
                    + _skill_says("Naming the parts", (
                        "Name what each part IS -- the thing itself, not the person it "
                        "belongs to and not the grey field. Two to four words each, once "
                        "per picture, in the order given."))))
            except Exception as exc:
                note(f"the parts in {start + 1}-{start + len(batch)} went unnamed ({exc})")
                continue
            for item in (answer or {}).get("parts") or []:
                try:
                    index = int(item.get("index")) - 1
                except (TypeError, ValueError):
                    continue
                if 0 <= index < len(batch):
                    names[start + index] = _short(item.get("name"))
    finally:
        release_backend(backend)
    return names
def _auto_generator():
    import torch
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    predictor, _ = _session_model()
    scripted = torch.jit.script
    torch.jit.script = lambda obj, *args, **kwargs: obj
    try:
        return SAM2AutomaticMaskGenerator(
            predictor.model,
            points_per_side=AUTO_POINTS,
            points_per_batch=64,
            pred_iou_thresh=0.7,
            stability_score_thresh=0.9,
        )
    finally:
        torch.jit.script = scripted
def _session_model():
    if _SESSION["predictor"] is None:
        predictor, name = _build_predictor()
        _SESSION["predictor"] = predictor
        _SESSION["checkpoint"] = name
    return _SESSION["predictor"], _SESSION.get("checkpoint", "")
def _at_source(mask, width: int, height: int):
    import numpy
    from PIL import Image
    if mask.shape[0] == height and mask.shape[1] == width:
        return mask
    grown = Image.fromarray((mask.astype(numpy.uint8) * 255)).resize(
        (width, height), Image.BILINEAR)
    return numpy.asarray(grown) >= 128
def _method_of(payload: dict) -> str:
    asked = str((payload or {}).get("method") or "").strip().lower()
    asked = METHOD_ALIASES.get(asked, asked)
    return asked if asked in METHOD_LABELS else DEFAULT_METHOD
CONCEPTS = "concepts"
REGION = "region"
def sam_cutter(job: str = CONCEPTS) -> tuple[str, str]:
    cutters, note = sam_cutters(job)
    return (cutters[0] if cutters else ""), note
def sam_cutters(job: str = CONCEPTS) -> tuple[list[str], str]:
    try:
        from . import sam3
        three, three_note = sam3.available()
    except Exception as exc:
        three, three_note = False, f"{type(exc).__name__}: {exc}"
    two = _checkpoint()
    lacking = _sam2_missing() if two else ""
    if lacking:
        plural = "packages" if " and " in lacking else "package"
        two_note = (f"SAM 2: {os.path.basename(two)} is here but this Python has no "
                    f"{lacking} {plural}, so SAM 2 is not used")
        two = ""
    else:
        two_note = "SAM 2: no checkpoint in models/sam2 (sam2_hiera_tiny.pt, for one)"
    absent = f"SAM 3: {three_note}; {two_note}"
    if job == REGION:
        both = [name for name, there in (("sam3", three), ("sam2", bool(two))) if there]
        if not both:
            return [], absent
        if len(both) == 2:
            return both, (f"a box goes to both -- SAM 3 and SAM 2 "
                          f"({os.path.basename(two)}) -- and the readings are "
                          "merged by the rectangle you drew")
        if both == ["sam3"]:
            return both, (f"{three_note} · {two_note if lacking else 'no SAM 2 here'}, "
                          "so a box goes to SAM 3 "
                          "alone -- it reads one as an EXEMPLAR rather than a "
                          "region, so draw it tightly round one whole thing")
        return both, f"{os.path.basename(two)} · a box and a click go to SAM 2"
    if three:
        return ["sam3"], three_note
    if two:
        return ["sam2"], f"{os.path.basename(two)} · SAM 3: {three_note}"
    return [], absent
_SAM_NAMES = {"sam3": "SAM 3", "sam2": "SAM 2", "": "SAM"}
def handle_segment_warm(payload: Any) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    method = _method_of(payload)
    started = time.monotonic()
    with _LOCK:
        try:
            if True:
                kind, note = sam_cutter(CONCEPTS)
                if kind == "sam3":
                    from . import sam3
                    sam3.load()
                elif kind == "sam2":
                    _session_model()
                else:
                    return _bad(note, 503)
                which = kind
        except Exception as exc:
            return _bad(f"{method}: {type(exc).__name__}: {exc}", 500)
    return 200, {"ok": True, "method": method, "cutter": which,
                 "seconds": round(time.monotonic() - started, 2)}
def handle_segment_methods(payload: Any) -> tuple[int, dict]:
    kind, sam_note = sam_cutter(CONCEPTS)
    regions, region_note = sam_cutters(REGION)
    sam_name = _SAM_NAMES.get(kind, "SAM")
    region_name = " + ".join(_SAM_NAMES.get(one, "SAM") for one in regions) or "SAM"
    methods = [
        {
            "id": SAM,
            "label": region_name,
            "ready": bool(kind),
            "note": ((sam_note if regions == [kind] else f"{sam_note} · {region_note}")
                     + " · box with a word, or press Break apart for the whole donor"),
            "cutter": kind,
            "region_cutter": "+".join(regions),
            "namer": "model" if kind == "sam3" else "writer",
            "warm_seconds": WARM_SECONDS[SAM],
            "auto": True,
        },
    ]
    ranges = {}
    measured = _dials({})
    for name, (_unused, low, high) in DIALS.items():
        ranges[name] = {
            "low": low,
            "high": high,
            "step": round((high - low) / 100.0, 6),
            "default": measured[name],
        }
    return 200, {"ok": True, "methods": methods, "default": DEFAULT_METHOD,
                 "sam": kind, "sam_region": "+".join(regions), "dials": ranges}
def _sam_auto(picture, pixels, step) -> list:
    import numpy
    step("stage", "SAM2 \u0438\u0449\u0435\u0442 \u0447\u0430\u0441\u0442\u0438\u2026")
    height, width = pixels.shape[:2]
    scale = AUTO_LONGEST / max(width, height)
    small = (picture.resize((max(1, round(width * scale)), max(1, round(height * scale))))
             if scale < 1 else picture)
    board = numpy.array(small)
    found = _auto_generator().generate(board)
    frame = float(board.shape[0] * board.shape[1]) or 1.0
    keep = [m for m in sorted(found, key=lambda m: -m["area"])
            if AUTO_MIN_AREA <= m["area"] * 100 / frame <= AUTO_MAX_AREA][:AUTO_KEEP]
    entries = []
    for item in keep:
        mask = _at_source(numpy.asarray(item["segmentation"]).astype(bool), width, height)
        tight = refmask.bounds_of(mask)
        if tight is None:
            continue
        entries.append({
            "mask": mask,
            "box": refmask.pad_box(tight, width, height),
            "name": "",
            "area": round(refmask.coverage(mask) * 100, 2),
        })
    return entries
def _overlap(one, other) -> float:
    both = int((one & other).sum())
    if not both:
        return 0.0
    either = int((one | other).sum()) or 1
    return both / either
def _sam3_auto(picture, source: str, notes: list, step, score=None) -> list:
    from . import sam3
    score = sam3.SCORE if score is None else float(score)
    entries: list = []
    total = len(sam3.CONCEPTS)
    for index, phrase in enumerate(sam3.CONCEPTS):
        step("stage", f"SAM 3 looking for \"{phrase}\" ({index + 1}/{total})...")
        try:
            found = sam3.concept(picture, phrase, path=source, score=score)
        except Exception as exc:
            notes.append(f"{phrase}: {type(exc).__name__}: {exc}")
            continue
        for item in found:
            area = refmask.coverage(item["mask"]) * 100
            if not (CONCEPT_MIN_AREA <= area <= AUTO_MAX_AREA):
                continue
            twin = next((e for e in entries if _overlap(e["mask"], item["mask"]) > 0.6), None)
            if twin is not None:
                if item["score"] > twin["score"]:
                    twin.update({"mask": item["mask"], "name": phrase, "said": phrase,
                                 "score": item["score"], "area": round(area, 2)})
                continue
            entries.append({"mask": item["mask"], "name": phrase, "said": phrase,
                            "score": item["score"], "area": round(area, 2)})
    _CONCEPT_MASKS[_concept_key(source)] = [
        {"name": one["name"], "mask": one["mask"], "area": one["area"]}
        for one in entries
    ]
    while len(_CONCEPT_MASKS) > _CONCEPT_KEEP:
        _CONCEPT_MASKS.popitem(last=False)
    entries.sort(key=lambda entry: -entry["score"])
    return entries[:AUTO_KEEP]
def handle_segment_auto(payload: Any, progress=None) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    source = _resolve_media(str(payload.get("source") or ""))
    if not source:
        return _bad("That picture is not on disk any more.")
    method = _method_of(payload)
    dials = _dials(payload)
    import numpy
    from PIL import Image, ImageOps
    notes: list[str] = []
    say = lambda text: notes.append(text)
    step = progress if callable(progress) else (lambda *a, **k: None)
    with _LOCK, _as_writer(payload):
        started = time.monotonic()
        try:
            with Image.open(source) as handle:
                picture = ImageOps.exif_transpose(handle).convert("RGB")
            pixels = numpy.array(picture)
            height, width = pixels.shape[:2]
            kind, sam_note = sam_cutter(CONCEPTS)
            if kind == "sam3":
                entries = _sam3_auto(picture, source, notes, step, dials["score"])
            elif kind == "sam2":
                entries = _sam_auto(picture, pixels, step)
            else:
                return _bad(sam_note, 503)
        except Exception as exc:
            return _bad(f"the picture would not segment: {type(exc).__name__}: {exc}", 500)
        _solid(entries, pixels, dials)
        cut = time.monotonic()
        names = [entry.get("name", "") for entry in entries]
        if entries and not all(names):
            step("stage", f"naming {len(entries)} parts…")
            crops = [Image.fromarray(refmask.cut_out(pixels, entry["mask"], entry["box"]))
                     for entry in entries]
            names = _name_parts(_settings_for(payload), crops, say)
        named = time.monotonic()
        segments = []
        folder = os.path.join(_input_directory(), *PREVIEW_DIR)
        for index, entry in enumerate(entries):
            entry.setdefault("box", refmask.pad_box(
                refmask.bounds_of(entry["mask"]), width, height))
            token = _remember({"source": source, "mask": entry["mask"], "box": entry["box"],
                               "name": names[index] if index < len(names) else ""})
            shade = pixels.copy()
            shade[~entry["mask"]] = (
                shade[~entry["mask"]].astype(numpy.float32) * 0.22).astype(numpy.uint8)
            preview = Image.fromarray(shade)
            if width > PREVIEW_WIDTH:
                preview = preview.resize(
                    (PREVIEW_WIDTH, max(1, round(height * PREVIEW_WIDTH / width))))
            target, relative = _filed(PREVIEW_DIR, f"mask_{token}.png")
            preview.save(target, compress_level=3)
            segments.append({
                "token": token,
                "name": names[index] if index < len(names) else "",
                "said": entry.get("said", ""),
                "area": entry["area"],
                "box": [int(v) for v in entry["box"]],
                "outline": refmask.outline(entry["mask"], entry["box"]),
                "matted": _matted(entry["mask"], entry["box"], pixels),
                "preview": relative,
            })
        _sweep(folder, PREVIEW_KEEP)
        return 200, {
            "ok": True,
            "width": int(width),
            "height": int(height),
            "segments": segments,
            "method": method,
            "cutter": kind,
            "notes": notes,
            "seconds": round(time.monotonic() - started, 1),
            "cut_seconds": round(cut - started, 1),
            "name_seconds": round(named - cut, 1),
        }
def _settings_for(payload: dict):
    from .cutter_routes import _writer_settings
    return _writer_settings(payload if isinstance(payload, dict) else {})
def compose_donor(tokens: list, trait: str = "") -> tuple[str, str, list]:
    import numpy
    from PIL import Image, ImageOps
    chosen = [(_CANDIDATES.get(str(t)) or {}) for t in tokens or []]
    chosen = [c for c in chosen if c]
    if not chosen:
        return "", "", []
    sources = {c["source"] for c in chosen}
    if len(sources) > 1:
        raise ValueError("those parts come from different pictures")
    source = chosen[0]["source"]
    with Image.open(source) as handle:
        pixels = numpy.array(ImageOps.exif_transpose(handle).convert("RGB"))
    height, width = pixels.shape[:2]
    union = numpy.zeros((height, width), dtype=bool)
    for entry in chosen:
        if entry.get("matte", True):
            union |= numpy.asarray(entry["mask"]).astype(bool)
        else:
            x0, y0, x1, y1 = (int(v) for v in entry["box"])
            union[y0:y1, x0:x1] = True
    box = refmask.pad_box(refmask.bounds_of(union), width, height)
    window = refmask.cut_out(pixels, union, box)
    safe = "".join(c if c.isalnum() else "_" for c in trait).strip("_").lower()[:24]
    target, relative = _filed(
        CROP_DIR, f"{safe or 'parts'}_{int(time.time() * 1000):x}.png")
    Image.fromarray(window).save(target, compress_level=4)
    return relative, target, [int(v) for v in box]
def handle_reference_write(payload: Any, progress=None) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    identity = payload.get("identity") if isinstance(payload.get("identity"), dict) else {}
    main = _resolve_media(str(identity.get("source") or ""))
    if not main:
        return _bad("The main picture is not on disk any more.")
    tokens = [str(t) for t in (payload.get("segments") or []) if str(t)]
    for token in [str(t) for t in (payload.get("boxes") or []) if str(t)]:
        held = _CANDIDATES.get(token)
        if held is not None:
            held["matte"] = False
    view = str(payload.get("view") or "").strip()
    if view and view not in refwrite.VIEWS:
        return _bad(f"There is no such view as {view!r}.")
    from PIL import Image, ImageOps
    notes: list[str] = []
    step = progress if callable(progress) else (lambda *a, **k: None)
    renamed = payload.get("names")
    renamed = renamed if isinstance(renamed, dict) else {}
    names = []
    for token in tokens:
        typed = " ".join(str(renamed.get(token) or "").split())
        if typed:
            names.append(typed[:60])
            continue
        names.append(_short((_CANDIDATES.get(token) or {}).get("name", "")))
    names = [n for n in names if n]
    with _LOCK, _as_writer(payload):
        donor_source = ""
        carry = 0.0
        donor_shape = None
        try:
            if tokens:
                step("stage", "cutting the parts out…")
                donor_source, donor_path, carried = compose_donor(
                    tokens, names[0] if names else "parts")
                held = _CANDIDATES.get(str(tokens[0])) or {}
                if carried and held.get("source"):
                    with Image.open(held["source"]) as handle:
                        donor_shape = ImageOps.exif_transpose(handle).size
                    carry = (carried[3] - carried[1]) / float(donor_shape[1] or 1)
        except Exception as exc:
            return _bad(f"the parts would not cut out: {type(exc).__name__}: {exc}", 500)
        pictures = []
        try:
            with Image.open(main) as handle:
                pictures.append(ImageOps.exif_transpose(handle).convert("RGB"))
            if donor_source:
                with Image.open(donor_path) as handle:
                    pictures.append(ImageOps.exif_transpose(handle).convert("RGB"))
        except Exception as exc:
            return _bad(f"a picture would not open: {type(exc).__name__}: {exc}", 500)
        step("stage", "looking at the pictures…")
        seen = _look(_settings_for(payload), pictures, names, notes)
    donors = []
    if tokens:
        phrase = ""
        for part in (seen or {}).get("parts") or []:
            if isinstance(part, dict) and part.get("phrase"):
                phrase = f"{phrase}, {part['phrase']}" if phrase else str(part["phrase"])
        donors.append({"picture": 2, "traits": names or ["the detail"],
                       "phrase": _short(phrase, 12) if phrase else ""})
    inferred = refwrite.carry_view(carry, _dials(payload)["carry"])
    if not view and inferred:
        view = inferred
        notes.append("these parts run down the figure, so the take is framed full length")
    prompt = refwrite.transfer_prompt(identity, donors, view=view, seen=seen)
    refs = [{"source": identity.get("source") or "", "label": identity.get("label") or "identity"}]
    if donor_source:
        refs.append({"source": donor_source, "label": ", ".join(names) or "the detail"})
    identity_shape = None
    try:
        with Image.open(main) as handle:
            identity_shape = ImageOps.exif_transpose(handle).size
    except Exception:
        identity_shape = None
    shape = None
    if identity_shape:
        wide, tall = refwrite.take_shape(
            carry, identity_shape, donor_shape, _dials(payload)["carry"])
        shape = {"width": int(wide), "height": int(tall)}
        if donor_shape and (wide, tall) != tuple(identity_shape):
            notes.append(f"and rendered upright, {wide}x{tall}, so the head fits in it")
    return 200, {
        "ok": True,
        "prompt": prompt,
        "refs": refs,
        "seen": seen,
        "view": view,
        "shape": shape,
        "carry": round(carry, 3),
        "traits": names,
        "notes": notes,
    }
def _look(settings, pictures: list, names: list, notes: list) -> dict:
    from ..vig.director import make_backend, release_backend
    backend, _ = make_backend(settings)
    try:
        describe = getattr(backend, "describe_frames", None)
        if not callable(describe):
            notes.append(
                f"the writer ({getattr(backend, 'name', '?')}) cannot look at pictures, so "
                "the prompt describes the subject by its label rather than by what is in it")
            return {}
        asked = (
            (f"The second picture holds only {', '.join(names)}, cut out of another "
             "photograph and standing on a flat grey field -- nobody else is in it.\n\n"
             if len(pictures) > 1 else "There is no donor picture this time.\n\n")
            + _skill_says("Looking before writing", (
                "Answer with one noun phrase for the person in the FIRST picture -- age, "
                "build, hair, clothing and its colour -- and one short phrase for what "
                "each named part looks like in the second.")))
        try:
            answer = describe(pictures, SEEN_SCHEMA, instruction=asked)
        except Exception as exc:
            notes.append(f"the pictures were not read ({exc}); the prompt uses the label")
            return {}
    finally:
        release_backend(backend)
    if not isinstance(answer, dict):
        return {}
    subject = " ".join(str(answer.get("subject") or "").split()).strip().rstrip(".")
    parts = [p for p in (answer.get("parts") or []) if isinstance(p, dict)]
    return {"subject": subject, "parts": parts}
def release() -> None:
    with _LOCK:
        _SESSION.update({"path": "", "stamp": 0.0, "predictor": None, "pixels": None})
        _CANDIDATES.clear()
    for name in ("sam3",):
        try:
            module = __import__(f"{__package__}.{name}", fromlist=["release"])
            module.release()
        except Exception:
            pass
