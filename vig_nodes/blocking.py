from __future__ import annotations
import base64
import json
import os
import shutil
import tempfile
import threading
import time
BEGIN_ROUTE = "/vig/h3/cutter/blocking/begin"
FRAMES_ROUTE = "/vig/h3/cutter/blocking/frames"
FINISH_ROUTE = "/vig/h3/cutter/blocking/finish"
SCENE_ROUTE = "/vig/h3/cutter/blocking/scene"
REFS_DIR = ("vig_h3_cutter", "refs")
SCENE_SUFFIX = ".blocking.json"
MAX_FRAMES = 600
MAX_SIDE = 4096
STALE_SECONDS = 3600
_LOCK = threading.Lock()
_SESSIONS: dict[str, dict] = {}
def _bad(message: str, status: int = 400) -> tuple[int, dict]:
    return status, {"ok": False, "error": message}
def _input_directory() -> str:
    import folder_paths
    return folder_paths.get_input_directory()
def _sweep() -> None:
    now = time.time()
    for token in [t for t, s in _SESSIONS.items() if now - s["started"] > STALE_SECONDS]:
        session = _SESSIONS.pop(token)
        shutil.rmtree(session["dir"], ignore_errors=True)
def _as_int(value, low: int, high: int):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if low <= number <= high else None
def handle_begin(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    width = _as_int(payload.get("width"), 16, MAX_SIDE)
    height = _as_int(payload.get("height"), 16, MAX_SIDE)
    frames = _as_int(payload.get("frames"), 1, MAX_FRAMES)
    fps = _as_int(payload.get("fps"), 1, 120)
    if None in (width, height, frames, fps):
        return _bad("A blocking render needs a width, a height, a frame count and a rate.")
    width -= width % 2
    height -= height % 2
    with _LOCK:
        _sweep()
        token = f"{int(time.time() * 1000):x}{len(_SESSIONS):02x}"
        _SESSIONS[token] = {
            "dir": tempfile.mkdtemp(prefix="vig_blocking_"),
            "width": width, "height": height, "frames": frames, "fps": fps,
            "got": set(), "started": time.time(),
        }
    return 200, {"ok": True, "token": token, "width": width, "height": height}
def _decode(url: str) -> bytes:
    head, _, data = str(url or "").partition(",")
    if not head.startswith("data:image/") or ";base64" not in head:
        raise ValueError("a frame must be an image data URL")
    return base64.b64decode(data)
def handle_frames(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    with _LOCK:
        session = _SESSIONS.get(str(payload.get("token") or ""))
    if session is None:
        return _bad("That render is not open any more -- start it again.", 404)
    start = _as_int(payload.get("start"), 0, session["frames"] - 1)
    frames = payload.get("frames")
    if start is None or not isinstance(frames, list):
        return _bad("A batch needs a start index and a list of frames.")
    if start + len(frames) > session["frames"]:
        return _bad("That batch runs past the end of the clip.")
    try:
        for offset, url in enumerate(frames):
            index = start + offset
            with open(os.path.join(session["dir"], f"{index:05d}.jpg"), "wb") as handle:
                handle.write(_decode(url))
            session["got"].add(index)
    except Exception as exc:
        return _bad(f"a frame could not be stored: {type(exc).__name__}: {exc}")
    return 200, {"ok": True, "have": len(session["got"]), "of": session["frames"]}
def _safe_stem(name: str) -> str:
    stem = "".join(c if c.isalnum() else "_" for c in str(name or ""))[:32].strip("_").lower()
    return stem or "blocking"
def encode(folder: str, frames: int, fps: int, width: int, height: int, target: str) -> None:
    import av
    from PIL import Image
    container = av.open(target, mode="w")
    try:
        stream = container.add_stream("libx264", rate=fps)
        stream.width = width
        stream.height = height
        stream.pix_fmt = "yuv420p"
        stream.options = {"crf": "16", "preset": "medium"}
        for index in range(frames):
            with Image.open(os.path.join(folder, f"{index:05d}.jpg")) as picture:
                picture = picture.convert("RGB")
                if picture.size != (width, height):
                    picture = picture.resize((width, height))
                frame = av.VideoFrame.from_image(picture)
            for packet in stream.encode(frame):
                container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)
    finally:
        container.close()
def handle_finish(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    token = str(payload.get("token") or "")
    with _LOCK:
        session = _SESSIONS.get(token)
    if session is None:
        return _bad("That render is not open any more -- start it again.", 404)
    missing = [i for i in range(session["frames"]) if i not in session["got"]]
    if missing:
        return _bad(f"{len(missing)} frame(s) never arrived (first: {missing[0]}); render again.")
    stem = f"{_safe_stem(payload.get('name'))}_{int(time.time() * 1000):x}"
    relative = "/".join(REFS_DIR + (f"{stem}.mp4",))
    target = os.path.join(_input_directory(), *REFS_DIR, f"{stem}.mp4")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    try:
        encode(session["dir"], session["frames"], session["fps"],
               session["width"], session["height"], target)
        scene = payload.get("scene")
        if isinstance(scene, dict):
            with open(target[: -len(".mp4")] + SCENE_SUFFIX, "w", encoding="utf-8") as handle:
                json.dump(scene, handle, ensure_ascii=False, indent=1)
    except Exception as exc:
        return _bad(f"the video could not be made: {type(exc).__name__}: {exc}", 500)
    finally:
        with _LOCK:
            _SESSIONS.pop(token, None)
        shutil.rmtree(session["dir"], ignore_errors=True)
    return 200, {
        "ok": True,
        "source": relative,
        "label": f"{stem}.mp4",
        "frames": session["frames"],
        "width": session["width"],
        "height": session["height"],
    }
def scene_path_for(source: str) -> str:
    source = str(source or "").replace("\\", "/").strip("/")
    if not source.lower().endswith(".mp4") or ".." in source.split("/"):
        return ""
    if not source.startswith("/".join(REFS_DIR) + "/"):
        return ""
    path = os.path.join(_input_directory(), *source.split("/"))
    return path[: -len(".mp4")] + SCENE_SUFFIX
def handle_scene(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    path = scene_path_for(payload.get("source"))
    if not path or not os.path.isfile(path):
        return 200, {"ok": True, "scene": None}
    try:
        with open(path, encoding="utf-8") as handle:
            return 200, {"ok": True, "scene": json.load(handle)}
    except Exception as exc:
        return _bad(f"the scene could not be read: {type(exc).__name__}: {exc}", 500)
