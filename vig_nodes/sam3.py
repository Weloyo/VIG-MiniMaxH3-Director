from __future__ import annotations
import os
import threading
MODEL_DIRS = ("sam3", "sams", "sam2", "SAM3")
CONCEPTS = (
    "hair",
    "beard",
    "moustache",
    "face",
    "hat",
    "glasses",
    "shirt",
    "necktie",
    "waistcoat",
    "jacket",
    "coat",
    "suit",
    "dress",
    "trousers",
    "shoes",
    "bag",
    "scarf",
    "necklace",
    "earring",
    "tattoo",
    "watch",
)
SCORE = 0.45
MASK_SCORE = 0.5
_LOCK = threading.Lock()
_LOADED: dict = {"path": "", "model": None, "processor": None, "device": ""}
_SEEN: dict = {"path": "", "stamp": 0.0, "embeds": None, "size": (0, 0)}
def model_root(name: str = "") -> str:
    try:
        import folder_paths
        return os.path.join(folder_paths.models_dir, "sam3", name)
    except Exception:
        return os.path.join("models", "sam3", name)
def _config(folder: str) -> dict:
    path = os.path.join(folder, "config.json")
    if not os.path.isfile(path):
        return {}
    try:
        import json
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}
def _is_sam3(folder: str) -> bool:
    text = _config(folder)
    kind = str(text.get("model_type", "")).lower()
    if kind == "sam3":
        return True
    if kind == "sam3_video":
        inner = text.get("detector_config") or {}
        return str(inner.get("model_type", "")).lower() == "sam3"
    if kind.startswith("sam3_"):
        return False
    return any(str(name).lower() in ("sam3model", "sam3forconditionalgeneration")
               for name in text.get("architectures") or [])
def _model_dirs() -> list[str]:
    from ..vig import paths
    return [os.path.join(root, where) for root in paths.model_bases() for where in MODEL_DIRS]
def find_checkpoint() -> str:
    for folder in _model_dirs():
        if not os.path.isdir(folder):
            continue
        if _is_sam3(folder):
            return folder
        try:
            names = sorted(os.listdir(folder))
        except OSError:
            continue
        for name in names:
            candidate = os.path.join(folder, name)
            if os.path.isdir(candidate) and _is_sam3(candidate):
                return candidate
    return ""
def _tensor_names(path: str, limit: int = 0) -> list[str]:
    try:
        import json
        import struct
        with open(path, "rb") as handle:
            size = struct.unpack("<Q", handle.read(8))[0]
            if size > 8 * 1024 * 1024:
                return []
            meta = json.loads(handle.read(size))
        names = [name for name in meta if name != "__metadata__"]
        return names[:limit] if limit else names
    except Exception:
        return []
def is_original_release(path: str) -> bool:
    names = _tensor_names(path)
    if any(name.startswith(("detector_model.", "tracker_model.")) for name in names):
        return False
    return any(name.startswith(("detector.", "tracker.")) for name in names)
def weights_fault(folder: str) -> str:
    try:
        names = sorted(os.listdir(folder))
    except OSError:
        return ""
    weights = [n for n in names if n.lower().endswith(".safetensors")]
    if not weights:
        if any(n.lower().endswith((".pt", ".pth", ".bin")) for n in names):
            return ("в папке только чекпоинт Meta (.pt) — transformers читает "
                    "model.safetensors из facebook/sam3")
        return "в папке нет весов (.safetensors) — нужен model.safetensors из facebook/sam3"
    for name in weights:
        if is_original_release(os.path.join(folder, name)):
            return (f"{name} — это выкладка Meta: тензоры называются detector./tracker., "
                    "а transformers ждёт detector_model./tracker_model.. Нужен именно "
                    "model.safetensors (3439.94 МБ) из facebook/sam3 — переименование "
                    "не конвертирует")
    return ""
def _strays() -> list[str]:
    found = []
    for folder in _model_dirs():
        if not os.path.isdir(folder):
            continue
        for base, _dirs, files in os.walk(folder):
            if _config(base):
                continue
            found += [os.path.join(base, name) for name in sorted(files)
                      if name.lower().endswith((".safetensors", ".pt", ".pth", ".bin"))]
    return found
def available() -> tuple[bool, str]:
    try:
        from transformers.models import sam3
    except Exception:
        return False, ("этот transformers не знает SAM 3 — нужна версия с "
                       "transformers.models.sam3")
    path = find_checkpoint()
    if path:
        fault = weights_fault(path)
        return (False, fault) if fault else (True, os.path.basename(path))
    for stray in _strays():
        if is_original_release(stray):
            return False, (
                f"{os.path.basename(stray)} — это выкладка Meta (тензоры "
                "detector./tracker.), transformers её не читает. Нужен "
                "model.safetensors из facebook/sam3 вместе с config.json, "
                "processor_config.json, tokenizer.json, tokenizer_config.json, "
                "special_tokens_map.json, vocab.json и merges.txt")
        return False, (
            f"рядом с {os.path.basename(stray)} нет config.json — transformers "
            "грузит ПАПКУ репозитория: нужны config.json, processor_config.json "
            "и файлы токенизатора из facebook/sam3")
    return False, ("нет весов: положите facebook/sam3 в " + model_root())
def _device():
    import torch
    try:
        if torch.cuda.is_available():
            free, _total = torch.cuda.mem_get_info()
            if free > 4.0 * 1024 ** 3:
                return "cuda", torch.float16
    except Exception:
        pass
    return "cpu", torch.float32
def _image_processor(path: str):
    from transformers import AutoProcessor
    from transformers.models.sam3 import Sam3Processor
    held = AutoProcessor.from_pretrained(path)
    if isinstance(held, Sam3Processor):
        return held
    pictures = getattr(held, "image_processor", None)
    words = getattr(held, "tokenizer", None)
    if pictures is None or words is None:
        raise RuntimeError(
            f"{type(held).__name__} в {os.path.basename(path)} не даёт "
            "image_processor и tokenizer, из которых собирается Sam3Processor")
    return Sam3Processor(image_processor=pictures, tokenizer=words)
def load():
    path = find_checkpoint()
    if not path:
        raise RuntimeError(available()[1])
    if _LOADED["model"] is not None and _LOADED["path"] == path:
        return _LOADED["model"], _LOADED["processor"], _LOADED["device"]
    from transformers import AutoConfig
    from transformers.models.sam3 import Sam3Model
    device, dtype = _device()
    held = AutoConfig.from_pretrained(path)
    if str(getattr(held, "model_type", "")).lower() == "sam3_video":
        from transformers.models.sam3_video import Sam3VideoModel
        whole = Sam3VideoModel.from_pretrained(path, dtype=dtype)
        model = whole.detector_model
        whole.tracker_model = None
    else:
        model = Sam3Model.from_pretrained(path, dtype=dtype)
    model = model.to(device).eval()
    processor = _image_processor(path)
    _LOADED.update({"path": path, "model": model, "processor": processor, "device": device})
    _SEEN.update({"path": "", "stamp": 0.0, "embeds": None, "size": (0, 0)})
    return model, processor, device
def release() -> None:
    with _LOCK:
        _LOADED.update({"path": "", "model": None, "processor": None, "device": ""})
        _SEEN.update({"path": "", "stamp": 0.0, "embeds": None, "size": (0, 0)})
def _vision(image, path: str):
    import torch
    model, processor, device = load()
    stamp = 0.0
    if path and os.path.isfile(path):
        try:
            stamp = os.path.getmtime(path)
        except OSError:
            stamp = 0.0
    if (_SEEN["embeds"] is not None and _SEEN["path"] == path
            and _SEEN["stamp"] == stamp and path):
        return model, processor, _SEEN["embeds"]
    inputs = _as_model_dtype(processor(images=image, return_tensors="pt").to(device), model)
    with torch.inference_mode():
        embeds = model.get_vision_features(pixel_values=inputs["pixel_values"])
    _SEEN.update({"path": path, "stamp": stamp, "embeds": embeds,
                  "size": (image.width, image.height)})
    return model, processor, embeds
def _as_model_dtype(inputs, model):
    import torch
    dtype = next(model.parameters()).dtype
    for key in ("pixel_values", "input_boxes"):
        held = inputs.get(key)
        if isinstance(held, torch.Tensor) and held.is_floating_point():
            inputs[key] = held.to(dtype)
    return inputs
def _instances(processor, outputs, image, score: float) -> list[dict]:
    import numpy
    results = processor.post_process_instance_segmentation(
        outputs, threshold=score, mask_threshold=MASK_SCORE,
        target_sizes=[(image.height, image.width)],
    )
    if not results:
        return []
    first = results[0]
    masks = first.get("masks")
    boxes = first.get("boxes")
    scores = first.get("scores")
    found = []
    for index in range(0 if masks is None else len(masks)):
        mask = numpy.asarray(masks[index].detach().cpu().numpy()).astype(bool)
        box = [float(v) for v in boxes[index].detach().cpu().tolist()] if boxes is not None else None
        found.append({
            "mask": mask,
            "box": box,
            "score": float(scores[index]) if scores is not None else 0.0,
        })
    return found
def concept(image, phrase: str, path: str = "", score: float = SCORE) -> list[dict]:
    import torch
    model, processor, embeds = _vision(image, path)
    device = _LOADED["device"] or "cpu"
    text = processor(text=phrase, return_tensors="pt").to(device)
    with torch.inference_mode():
        outputs = model(
            vision_embeds=embeds,
            input_ids=text["input_ids"],
            attention_mask=text.get("attention_mask"),
        )
    found = _instances(processor, outputs, image, score)
    for item in found:
        item["label"] = phrase
    return found
def box_mask(image, box, path: str = "", phrase: str = "") -> list[dict]:
    import torch
    model, processor, device = load()
    x0, y0, x1, y1 = (float(v) for v in box)
    asked = {
        "images": image,
        "input_boxes": [[[x0, y0, x1, y1]]],
        "input_boxes_labels": [[1]],
        "return_tensors": "pt",
    }
    said = " ".join(str(phrase or "").split())
    if said:
        asked["text"] = [said]
    inputs = _as_model_dtype(processor(**asked).to(device), model)
    with torch.inference_mode():
        outputs = model(**inputs)
    found = _instances(processor, outputs, image, 0.2)
    if said:
        for item in found:
            item["label"] = said
    return found
