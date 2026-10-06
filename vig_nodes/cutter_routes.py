from __future__ import annotations
import os
import pathlib
import re
import shutil
import sys
import threading
import time
from typing import Any
from ..vig import usage
from ..vig.cutter import motion
from ..vig.cutter import project as project_folder
from ..vig.cutter import seam
from ..vig.cutter import writer as film_writer
from . import refseg
from .cutter import PROGRESS_EVENT, _resolve_media
WRITE_ROUTE = "/vig/h3/cutter/write"
ENRICH_ROUTE = "/vig/h3/cutter/enrich"
TRANSLATE_ROUTE = "/vig/h3/cutter/translate"
REBUILD_ROUTE = "/vig/h3/cutter/rebuild"
PLAN_ROUTE = "/vig/h3/cutter/plan"
FRAME_ROUTE = "/vig/h3/cutter/frame"
STRIP_ROUTE = "/vig/h3/cutter/strip"
REVEAL_ROUTE = "/vig/h3/cutter/reveal"
PROJECT_SIZE_ROUTE = "/vig/h3/cutter/project_size"
VALIDATE_ROUTE = "/vig/h3/cutter/validate"
FILMS_ROUTE = "/vig/h3/cutter/films"
ENVELOPES_ROUTE = "/vig/h3/cutter/envelopes"
FILM_FILE_ROUTE = "/vig/h3/cutter/film_file"
PROJECT_FILE_ROUTE = "/vig/h3/cutter/project_file"
FILM_JUDGE_ROUTE = "/vig/h3/cutter/film_judge"
FILMS_PRUNE_ROUTE = "/vig/h3/cutter/films_prune"
MODELS_ROUTE = "/vig/h3/cutter/llm_models"
SKILLS_ROUTE = "/vig/h3/cutter/skills"
TINY_VAE_ROUTE = "/vig/h3/cutter/tiny_vae"
SKILL_ADD_ROUTE = "/vig/h3/cutter/skill_add"
PROVIDER_KEY_ROUTE = "/vig/h3/cutter/provider_key"
PROJECT_ROUTE = "/vig/h3/cutter/project"
PROJECT_NEW_ROUTE = "/vig/h3/cutter/project_new"
PROJECT_REF_ROUTE = "/vig/h3/cutter/project_ref"
TAKES_ROUTE = "/vig/h3/cutter/takes"
TAKE_JUDGE_ROUTE = "/vig/h3/cutter/take_judge"
TAKES_PRUNE_ROUTE = "/vig/h3/cutter/takes_prune"
TAKE_DELETE_ROUTE = "/vig/h3/cutter/take_delete"
TAKE_ADOPT_ROUTE = "/vig/h3/cutter/take_adopt"
CLIPS_RECONCILE_ROUTE = "/vig/h3/cutter/clips_reconcile"
AGENT_STOP_ROUTE = "/vig/h3/cutter/agent_stop"
FILM_REBUILD_ROUTE = "/vig/h3/cutter/film_rebuild"
TAKE_FILE_ROUTE = "/vig/h3/cutter/take_file"
_REGISTERED = False
_LLM_FIELDS = (
    "use_llm",
    "llm_backend",
    "server_url",
    "model",
    "seed",
    "timeout",
    "temperature_scale",
    "extra_instruction",
    "gguf_model",
    "gguf_n_ctx",
    "gguf_n_threads",
    "gguf_n_gpu_layers",
    "gguf_extra_dir",
    "server_binary",
    "server_ready_timeout",
)
def handle_project(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    if not root:
        return 400, {"ok": False, "error": "No folder was given."}
    try:
        found = project_folder.inventory(root)
        if found.get("ok") and found.get("board"):
            found["missing"] = project_folder.stand_ins(
                root, found["board"], _resolve_media, servable=_servable)
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return (200 if found.get("ok") else 400), found
def _servable(path: str) -> bool:
    try:
        import folder_paths
    except Exception:
        return True
    real = os.path.normcase(os.path.realpath(path))
    for getter in ("get_output_directory", "get_input_directory", "get_temp_directory"):
        try:
            root = os.path.normcase(os.path.realpath(getattr(folder_paths, getter)()))
            if os.path.commonpath([real, root]) == root:
                return True
        except (AttributeError, OSError, ValueError):
            continue
    return False
def _folder_of(payload: dict) -> str:
    return project_folder.folder_for(
        payload.get("path"),
        payload.get("index"),
        payload.get("name") or "",
        payload.get("id"),
        payload.get("folder"),
    )
def _key_after(board, index: int, made: dict, previous_key: str) -> str:
    from dataclasses import replace
    from ..vig.cutter.render import RenderSettings
    if board is None or index <= 0 or index >= len(board.segments) or not previous_key:
        return ""
    seg = board.segments[index]
    if not seg.takes_from_front or seg.external:
        return ""
    settings = made.get("settings")
    if not isinstance(settings, dict):
        return ""
    try:
        digest = RenderSettings(**settings).digest()
    except TypeError:
        return ""
    stand_in = replace(board.segments[index - 1], locked=True, cache_key=previous_key)
    taken = replace(
        seg,
        seed=int(made.get("seed") or 0),
        prompt=str(made.get("prompt") or ""),
        mode=str(made.get("mode") or seg.mode),
        seconds=int(made.get("seconds") or seg.seconds),
        context_frames=int(made.get("context_frames") or 0),
        context_audio=int(made.get("context_audio") or 0),
        locked=False,
        cache_key="",
    )
    try:
        keys = replace(board, segments=[stand_in, taken]).fingerprints(
            digest, {taken.mode: str(made.get("stack") or "")}, {}
        )
    except Exception:
        return ""
    return keys.get(taken.id, "")
def _holding(root: str, board, index: int) -> dict:
    if board is None or index < 0 or index >= len(board.segments):
        return {}
    seg = board.segments[index]
    if not seg.cache_key or seg.locked:
        return {}
    try:
        folder = project_folder.clip_dir_name(index, seg.name or "")
        for take in project_folder.take_details(root, folder):
            if str((take.get("made") or {}).get("cache_key") or "") == seg.cache_key:
                return take["made"]
    except Exception:
        return {}
    return {}
def _verdicts(board, index: int, made: dict, behind: dict):
    def link(papers):
        told = papers.get("continues")
        return str(told) if isinstance(told, str) and told else None
    follows = None
    if board is not None and 0 < index < len(board.segments):
        before = str(board.segments[index - 1].cache_key or "")
        key = str(made.get("cache_key") or "")
        told = link(made)
        if told and before:
            follows = told == before
        elif key and before:
            got = _key_after(board, index, made, before)
            follows = True if got and got == key else None
    precedes = None
    if board is not None and behind and 0 <= index < len(board.segments) - 1:
        mine = str(made.get("cache_key") or "")
        wanted = str(board.segments[index + 1].cache_key or "")
        told = link(behind)
        if told and mine:
            precedes = told == mine
        elif mine and wanted:
            got = _key_after(board, index + 1, behind, mine)
            precedes = True if got and got == wanted else None
    return follows, precedes
def _neighbour(root: str, board, index: int) -> dict:
    if board is None or index < 0 or index >= len(board.segments):
        return {}
    seg = board.segments[index]
    key = str(seg.cache_key or "")
    out = {"index": index, "id": seg.id, "name": seg.name or "", "key": key,
           "file": ""}
    if not key:
        return out
    try:
        folder = project_folder.clip_dir_name(index, seg.name or "")
        for take in project_folder.take_details(root, folder):
            if str((take.get("made") or {}).get("cache_key") or "") == key:
                out["file"] = take["file"]
                break
    except Exception:
        return out
    return out
def handle_takes(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    folder = _folder_of(payload)
    if not root or not folder:
        return 400, {"ok": False, "error": "Both the project folder and the clip are needed."}
    try:
        takes = project_folder.take_details(root, folder)
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    from ..vig.cutter.state import Board
    board = None
    if payload.get("board"):
        try:
            board = Board.from_json(payload["board"])
        except Exception:
            board = None
    index = payload.get("index")
    behind = _holding(root, board, int(index) + 1) if board is not None and index is not None else {}
    for take in takes:
        follows, precedes = (
            _verdicts(board, int(index), take.get("made") or {}, behind)
            if board is not None and index is not None
            else (None, None)
        )
        take["follows"] = follows
        take["precedes"] = precedes
        take["by_hand"] = bool((take.get("made") or {}).get("continues_by_hand"))
    ahead = (_neighbour(root, board, int(index) - 1)
             if board is not None and index is not None and int(index) > 0 else {})
    behind_clip = (_neighbour(root, board, int(index) + 1)
                   if board is not None and index is not None else {})
    if not str((behind or {}).get("continues") or ""):
        if not any(take["precedes"] for take in takes):
            for take in takes:
                take["precedes"] = None
    return 200, {"ok": True, "folder": folder, "takes": takes, "count": len(takes),
                 "ahead": ahead, "behind": behind_clip}
def handle_take_judge(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    folder = _folder_of(payload)
    name = str(payload.get("file") or "").strip()
    if not root or not folder or not name:
        return 400, {"ok": False, "error": "The project folder, the clip and the take are needed."}
    if os.path.basename(name) != name:
        return 400, {"ok": False, "error": "A take is named by its filename alone."}
    clip_folder = os.path.join(root, project_folder.CLIPS_DIR, folder)
    if not os.path.isdir(clip_folder):
        return 400, {"ok": False, "error": "That clip is not in this project folder."}
    try:
        takes = project_folder.write_take(
            clip_folder, name,
            rating=payload.get("rating"),
            note=payload.get("note"),
            continues=payload.get("continues"),
        )
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return 200, {"ok": True, "takes": takes}
def handle_takes_prune(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    folder = _folder_of(payload)
    if not root or not folder:
        return 400, {"ok": False, "error": "Both the project folder and the clip are needed."}
    if os.path.basename(folder) != folder:
        return 400, {"ok": False, "error": "A clip is named by its folder alone."}
    try:
        result = project_folder.prune_takes(
            root, folder,
            at_or_below=payload.get("at_or_below", payload.get("below", 3)),
            dry_run=not bool(payload.get("confirm")),
            keep=str(payload.get("keep") or "").strip(),
        )
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return 200, {"ok": True, **result}
def handle_take_delete(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    folder = _folder_of(payload)
    name = str(payload.get("file") or "").strip()
    if not root or not folder or not name:
        return 400, {"ok": False, "error": "The project folder, the clip and the take are needed."}
    if not bool(payload.get("confirm")):
        return 400, {"ok": False, "error": "Deleting a take needs confirm: true."}
    try:
        result = project_folder.delete_take(
            root, folder, name, keep=str(payload.get("keep") or "").strip(),
        )
    except (ValueError, FileNotFoundError) as exc:
        return 400, {"ok": False, "error": str(exc)}
    except PermissionError as exc:
        return 409, {"ok": False, "error": str(exc)}
    except OSError as exc:
        return 409, {"ok": False, "error": (
            f"That take is still on disk ({exc}). Something has the file open -- "
            "close anything playing it, then try again."
        )}
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return 200, {"ok": True, **result}
def handle_agent_stop(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    token = str(payload.get("token") or "").strip()
    if not token:
        return 400, {"ok": False, "error": "No job token was given."}
    _abandon(token)
    stopped = False
    if _WRITER_HOLDER == token:
        try:
            from ..vig import director as _director
            live = _director.live_backend()
            if live is not None:
                _director.stop_backend(live)
                stopped = True
        except Exception as exc:
            return 200, {"ok": True, "stopped": False, "error": f"{type(exc).__name__}: {exc}"}
    return 200, {"ok": True, "stopped": stopped}
def handle_clips_reconcile(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    if not root:
        return 400, {"ok": False, "error": "No project folder was given."}
    segments = payload.get("segments")
    if not isinstance(segments, list):
        return 400, {"ok": False, "error": "The board's segments are needed."}
    from types import SimpleNamespace
    clips = [
        SimpleNamespace(id=item.get("id"), name=str(item.get("name") or ""))
        for item in segments
        if isinstance(item, dict)
    ]
    try:
        moved = project_folder.reconcile_clip_folders(root, clips)
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return 200, {"ok": True, "moved": moved}
def handle_take_adopt(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    folder = _folder_of(payload)
    name = str(payload.get("file") or "").strip()
    source = take_file_path(root, folder, name)
    if not source:
        return 400, {"ok": False, "error": "That take is not in this project folder."}
    try:
        import folder_paths
        out_root = folder_paths.get_output_directory()
        sub = os.path.join("vig_h3_cutter", "takes")
        target_dir = os.path.join(out_root, sub)
        os.makedirs(target_dir, exist_ok=True)
        target = os.path.join(target_dir, name)
        if not (
            os.path.isfile(target)
            and os.path.getsize(target) == os.path.getsize(source)
            and abs(os.path.getmtime(target) - os.path.getmtime(source)) < 2
        ):
            shutil.copy2(source, target)
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return 200, {"ok": True, "clip": target, "file": name}
def _seam_boundary_levels(path: str, drop: int, keep: int):
    import subprocess
    cut = f"start_frame={drop}" + (f":end_frame={keep}" if keep else "")
    try:
        done = subprocess.run(
            ["ffmpeg", "-v", "info", "-i", path, "-vf",
             f"fps={motion.FPS},trim={cut},setpts=PTS-STARTPTS,signalstats,"
             "metadata=print:key=lavfi.signalstats.YAVG:file=-",
             "-f", "null", "-"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=120, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return None
    values = []
    for line in (done.stdout or "").splitlines():
        if "YAVG" in line:
            try:
                values.append(float(line.rsplit("=", 1)[-1]))
            except ValueError:
                continue
    if len(values) < seam.MEASURE_FRAMES:
        return None
    k = seam.MEASURE_FRAMES
    return (sum(values[:k]) / k, sum(values[-k:]) / k)
_EXPLORER_WAIT_S = 2.0
def _show_explorer(target: str) -> None:
    if os.name != "nt":
        return
    from ..vig import winapi
    want = os.path.basename(os.path.normpath(target)).lower()
    deadline = time.monotonic() + _EXPLORER_WAIT_S
    while time.monotonic() < deadline:
        try:
            found = [
                hwnd for hwnd in winapi.top_windows("CabinetWClass")
                if (title := winapi.window_text(hwnd).lower()) == want
                or title.startswith(want + " ")
            ]
        except Exception:
            return
        if found:
            flags = winapi.SWP_NOMOVE | winapi.SWP_NOSIZE | winapi.SWP_NOACTIVATE
            try:
                winapi.user32.SetWindowPos(found[0], winapi.HWND_TOPMOST, 0, 0, 0, 0, flags)
                winapi.user32.SetWindowPos(found[0], winapi.HWND_NOTOPMOST, 0, 0, 0, 0, flags)
                winapi.user32.FlashWindow(found[0], True)
            except Exception:
                pass
            return
        time.sleep(0.05)
def handle_reveal(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    if not root:
        return 400, {"ok": False, "error": "This board has no project folder yet."}
    if not os.path.isdir(root):
        return 400, {"ok": False,
                     "error": f"The project folder {root} does not exist any more."}
    if str(payload.get("what") or "") == "project":
        try:
            if os.name == "nt":
                os.startfile(root)
                _show_explorer(root)
            else:
                import subprocess
                subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", root])
        except OSError as exc:
            return 500, {"ok": False, "error": f"The folder could not be opened: {exc}"}
        return 200, {"ok": True, "opened": root}
    clips = os.path.join(root, project_folder.CLIPS_DIR)
    tried = []
    folder = ""
    if str(payload.get("what") or "") == "film":
        folder = project_folder.FILM_DIR
        tried += [os.path.join(root, project_folder.FILM_DIR)]
    else:
        folder = _folder_of(payload)
        if folder and os.path.basename(folder) == folder:
            tried += [os.path.join(clips, folder, project_folder.VIDEO_SUB),
                      os.path.join(clips, folder)]
        tried += [clips]
    tried += [root]
    target = next((path for path in tried if os.path.isdir(path)), root)
    try:
        base = os.path.normcase(os.path.realpath(root))
        if os.path.commonpath([os.path.normcase(os.path.realpath(target)), base]) != base:
            return 400, {"ok": False, "error": "That folder is not inside the project."}
    except ValueError:
        return 400, {"ok": False, "error": "That folder is not inside the project."}
    try:
        if os.name == "nt":
            os.startfile(target)
            _show_explorer(target)
        else:
            import subprocess
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", target])
    except OSError as exc:
        return 500, {"ok": False, "error": f"The folder could not be opened: {exc}"}
    return 200, {"ok": True, "opened": target, "clip_folder": target == (tried[0] if folder else "")}
ENVELOPE_FLOOR_DB = -50.0
ENVELOPE_CEIL_DB = -6.0
ENVELOPE_POWER = 2.0
ENVELOPE_ACCENT_DB = 6.0
ENVELOPE_RATE = 16000
ENVELOPE_MOST_BARS = 120
_ENVELOPES: dict = {}
def audio_envelope(path: str, bars: int, start: float = 0.0, end: float = 0.0):
    try:
        stamp = os.path.getmtime(path)
    except OSError:
        return None
    bars = max(1, min(ENVELOPE_MOST_BARS, int(bars)))
    key = (path, stamp, bars, round(float(start or 0), 3), round(float(end or 0), 3))
    if key in _ENVELOPES:
        return _ENVELOPES[key]
    import av
    import numpy
    with av.open(path) as container:
        if not container.streams.audio:
            return None
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format="flt", layout="mono", rate=ENVELOPE_RATE)
        pieces = []
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                pieces.append(out.to_ndarray().reshape(-1))
        for out in resampler.resample(None):
            pieces.append(out.to_ndarray().reshape(-1))
    samples = numpy.concatenate(pieces).astype(numpy.float64) if pieces else numpy.zeros(0)
    first = max(0, int(round(float(start or 0) * ENVELOPE_RATE)))
    last = int(round(float(end) * ENVELOPE_RATE)) if end else len(samples)
    samples = samples[first:max(first, min(last, len(samples)))]
    if not len(samples):
        return None
    def db(values) -> float:
        rms = float(numpy.sqrt(numpy.mean(numpy.square(values)))) if len(values) else 0.0
        return 20.0 * numpy.log10(rms) if rms > 1e-9 else -120.0
    edges = numpy.linspace(0, len(samples), bars + 1).astype(int)
    slices = [samples[edges[i]:max(edges[i] + 1, edges[i + 1])] for i in range(bars)]
    levels = [db(piece) for piece in slices]
    median = float(numpy.median(levels))
    peak = float(numpy.max(numpy.abs(samples)))
    answer = {
        "bars": [round(float(max(0.0, min(1.0, (level - ENVELOPE_FLOOR_DB)
                                          / (ENVELOPE_CEIL_DB - ENVELOPE_FLOOR_DB))) ** ENVELOPE_POWER), 3)
                 for level in levels],
        "accents": [bool(level >= median + ENVELOPE_ACCENT_DB and level > -60.0) for level in levels],
        "floor_db": ENVELOPE_FLOOR_DB,
        "ceil_db": ENVELOPE_CEIL_DB,
        "power": ENVELOPE_POWER,
        "accent_db": ENVELOPE_ACCENT_DB,
        "rms_db": round(float(db(samples)), 1),
        "peak_db": round(float(20.0 * numpy.log10(peak)), 1) if peak > 1e-9 else -120.0,
    }
    if len(_ENVELOPES) > 512:
        _ENVELOPES.clear()
    _ENVELOPES[key] = answer
    return answer
def handle_envelopes(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        return 400, {"ok": False, "error": "items must be a list."}
    out = []
    for item in payload["items"][:64]:
        item = item if isinstance(item, dict) else {}
        path = _resolve_media(str(item.get("clip") or ""))
        try:
            out.append(audio_envelope(path, _as_count(item.get("bars"), 24),
                                      float(item.get("start") or 0), float(item.get("end") or 0))
                       if path else None)
        except Exception:
            out.append(None)
    return 200, {"ok": True, "envelopes": out}
def handle_validate(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    from ..vig.prompt.validator import validate
    out = []
    for clip in payload.get("clips") or []:
        if not isinstance(clip, dict):
            continue
        prompt = str(clip.get("prompt") or "")
        mode = str(clip.get("mode") or "t2va")
        try:
            seconds = float(clip.get("seconds") or 0) or None
        except (TypeError, ValueError):
            seconds = None
        errors = []
        if prompt.strip():
            try:
                result = validate(prompt, mode, duration=seconds)
            except Exception as exc:
                return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
            errors = [{"code": v.code, "message": v.message} for v in result.errors]
        out.append({"id": clip.get("id"), "errors": errors})
    return 200, {"ok": True, "clips": out}
def handle_project_size(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    if not root:
        return 400, {"ok": False, "error": "This board has no project folder yet."}
    if not os.path.isdir(root):
        return 200, {"ok": True, "missing": True, "bytes": 0, "files": 0}
    size, files = project_folder.folder_bytes(root)
    return 200, {"ok": True, "bytes": size, "files": files}
def handle_films(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    if not root or not os.path.isdir(root):
        return 400, {"ok": False, "error": "This board has no project folder yet."}
    return 200, {"ok": True, "films": project_folder.films(root),
                 "hidden": project_folder.films_hidden(root)}
def handle_film_judge(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    answer = project_folder.rate_film(root, str(payload.get("file") or ""), payload.get("rating"))
    return (200 if answer.get("ok") else 400), answer
def handle_films_prune(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    if not root or not os.path.isdir(root):
        return 400, {"ok": False, "error": "This board has no project folder yet."}
    try:
        result = project_folder.prune_films(
            root, payload.get("at_or_below", 0), dry_run=not bool(payload.get("confirm")),
            keep=str(payload.get("keep") or "").strip(),
        )
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return 200, {"ok": True, **result}
def _film_size(payload: dict, paths: list) -> tuple[int, int] | None:
    width = _as_count(payload.get("width"), 0)
    height = _as_count(payload.get("height"), 0)
    if width >= 32 and height >= 32:
        return width - width % 2, height - height % 2
    try:
        import av
        with av.open(paths[0]) as container:
            stream = container.streams.video[0]
            return stream.width - stream.width % 2, stream.height - stream.height % 2
    except Exception:
        return None
def _fit_filter(size) -> str:
    grid = f"fps={motion.FPS},"
    if not size:
        return grid
    width, height = size
    return (grid + f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,")
def handle_film_rebuild(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    clips = payload.get("clips")
    if not isinstance(clips, list) or not clips:
        return 400, {"ok": False, "error": "No clips to join."}
    specs = []
    for index, item in enumerate(clips):
        given = item if isinstance(item, dict) else {}
        raw = str((given.get("path") if given else item) or "")
        path = _resolve_media(raw)
        if not path or not os.path.isfile(path):
            return 400, {"ok": False, "error": f"This clip has no file yet: {raw}"}
        specs.append({
            "path": path,
            "keep": max(0, _as_count(given.get("keep"), 0)),
            "drop_head": max(0, _as_count(given.get("drop_head"), 0)),
            "drop_first": bool(given.get("drop_first")) if given else index > 0,
            "mute": bool(given.get("mute")),
            "seed": _as_count(given.get("seed"), 0),
            "cache_key": str(given.get("cache_key") or ""),
            "continues": bool(given.get("continues")) if given else False,
        })
    paths = [spec["path"] for spec in specs]
    size = _film_size(payload, paths)
    import subprocess
    try:
        import folder_paths
        out_dir = os.path.join(folder_paths.get_output_directory(), "vig_h3_cutter", "films")
        os.makedirs(out_dir, exist_ok=True)
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    import hashlib
    from types import SimpleNamespace
    if all(spec["cache_key"] for spec in specs):
        stem = project_folder.film_id(
            [SimpleNamespace(seed=spec["seed"], cache_key=spec["cache_key"]) for spec in specs]
        )
    else:
        stamp = []
        for path in paths:
            try:
                info = os.stat(path)
                stamp.append(f"{path}:{info.st_size}:{int(info.st_mtime)}")
            except OSError:
                stamp.append(path)
        digest = hashlib.sha1("|".join(stamp).encode("utf-8"))
        stem = f"{len(paths)}clips_files{digest.hexdigest()[:10]}"
    target = os.path.join(out_dir, f"{stem}.mp4")
    fps = motion.FPS
    args = ["ffmpeg", "-y", "-v", "error"]
    for path in paths:
        args += ["-i", path]
    def _at(frames: int) -> str:
        import math
        return f"{math.floor(frames / fps * 1e9) / 1e9:.9f}"
    trims = []
    for n, spec in enumerate(specs):
        drop = max(1 if spec["drop_first"] else 0, spec["drop_head"])
        trims.append((drop, spec["keep"]))
    levels: dict = {}
    for n, spec in enumerate(specs):
        beside = n + 1 < len(specs) and specs[n + 1]["continues"]
        if spec["continues"] or beside:
            levels[n] = _seam_boundary_levels(spec["path"], *trims[n])
    fixes: dict = {}
    seam_lines = []
    for n, spec in enumerate(specs):
        if n == 0 or not spec["continues"]:
            continue
        before, here = levels.get(n - 1), levels.get(n)
        if before is None or here is None:
            seam_lines.append(
                f"the seam into clip {n + 1} could not be measured, so it was left alone"
            )
            continue
        delta = seam.fraction_from_yavg(here[0] - before[1])
        fix = seam.correction(delta)
        if fix is None:
            if abs(delta) > seam.MAX_STEP:
                seam_lines.append(
                    f"the seam into clip {n + 1} steps {delta * 100:+.1f}% of the "
                    "luma range, which is content rather than grade, so it was left alone"
                )
            continue
        fixes[n] = fix
        seam_lines.append(
            f"the seam into clip {n + 1} stepped {delta * 100:+.1f}% of the luma "
            f"range; its head was eased onto the previous clip's level over "
            f"{seam.MATCH_FRAMES} frames"
        )
    chains, labels = [], []
    for n, spec in enumerate(specs):
        drop, keep = trims[n]
        cut = f"start_frame={drop}" + (f":end_frame={keep}" if keep else "")
        acut = f"start={_at(drop)}" + (f":end={_at(keep)}" if keep else "")
        eased = f",{seam.geq_head(fixes[n])}" if n in fixes else ""
        chains.append(f"[{n}:v]{_fit_filter(size)}trim={cut},setpts=PTS-STARTPTS{eased}[v{n}]")
        gain = ",volume=0" if spec["mute"] else ""
        chains.append(f"[{n}:a]atrim={acut},asetpts=PTS-STARTPTS{gain}[a{n}]")
        labels.append(f"[v{n}][a{n}]")
    chains.append(f"{''.join(labels)}concat=n={len(paths)}:v=1:a=1[v][a]")
    args += ["-filter_complex", ";".join(chains), "-map", "[v]", "-map", "[a]",
             "-r", str(fps), "-c:v", "libx264", "-preset", "medium", "-crf", "17",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", target]
    try:
        done = subprocess.run(
            args, capture_output=True, text=True, timeout=900,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except FileNotFoundError:
        return 500, {"ok": False, "error": "ffmpeg is not on PATH, so the film cannot be re-joined."}
    except subprocess.TimeoutExpired:
        return 500, {"ok": False, "error": "ffmpeg took too long and was stopped."}
    if done.returncode != 0 or not os.path.isfile(target):
        tail = (done.stderr or "").strip().splitlines()[-3:]
        return 500, {"ok": False, "error": "ffmpeg failed: " + " / ".join(tail)}
    kept = ""
    root = str(payload.get("path") or "").strip()
    if root and os.path.isdir(root) and len(specs) >= project_folder.FILM_MIN_CLIPS:
        try:
            films_dir = os.path.join(root, project_folder.FILM_DIR)
            os.makedirs(films_dir, exist_ok=True)
            kept = os.path.join(films_dir, f"{stem}.mp4")
            shutil.copy2(target, kept)
            project_folder.write_film_record(root, stem, [
                {"name": str((clips[n] if isinstance(clips[n], dict) else {}).get("name") or ""),
                 "prompt": str((clips[n] if isinstance(clips[n], dict) else {}).get("prompt") or ""),
                 "frames": max(0, trims[n][1] - trims[n][0]) if trims[n][1] else 0}
                for n in range(len(specs))
            ])
        except Exception:
            kept = ""
    return 200, {
        "ok": True, "film": target, "kept": kept, "clips": len(paths),
        "seams": seam_lines,
    }
def take_file_path(root: str, folder: str, name: str) -> str:
    root = (root or "").strip()
    if not root or os.path.basename(folder) != folder or os.path.basename(name) != name:
        return ""
    if os.path.splitext(name)[1].lower() not in {".mp4", ".webm", ".mov", ".mkv"}:
        return ""
    video_dir = os.path.realpath(
        os.path.join(root, project_folder.CLIPS_DIR, folder, project_folder.VIDEO_SUB)
    )
    full = os.path.realpath(os.path.join(video_dir, name))
    if os.path.commonpath([video_dir, full]) != video_dir:
        return ""
    return full if os.path.isfile(full) else ""
def handle_project_new(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("path") or "").strip()
    if not root:
        return 400, {"ok": False, "error": "No folder was given."}
    board = payload.get("board") if isinstance(payload.get("board"), dict) else None
    try:
        result = project_folder.create(root, board)
        if result.get("ok"):
            made = project_folder.scaffold(root, 0, str(payload.get("first_clip") or ""))
            result["first_clip"] = {k: os.path.basename(v) for k, v in made.items()}
    except Exception as exc:
        return 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return (200 if result.get("ok") else 400), result
def handle_project_ref(payload: dict) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    root = str(payload.get("project_dir") or "").strip()
    source = _resolve_media(str(payload.get("source") or ""))
    try:
        index = max(0, int(payload.get("index") or 0))
    except (TypeError, ValueError):
        index = 0
    result = project_folder.save_reference(
        root, index, str(payload.get("clip_name") or ""), source,
        str(payload.get("label") or "ref"), shutil.copyfile,
    )
    return (200 if result.get("ok") else 400), result
def _bad(message: str, status: int = 400) -> tuple[int, dict]:
    return status, {"ok": False, "error": message}
class _Abandoned(Exception):
    pass
_WRITER_LOCK = threading.Lock()
_ABANDONED: set = set()
_ABANDONED_LOCK = threading.Lock()
_WRITER_HOLDER: str = ""
def _abandon(token: str) -> None:
    if not token:
        return
    with _ABANDONED_LOCK:
        _ABANDONED.add(token)
def _is_abandoned(token: str) -> bool:
    with _ABANDONED_LOCK:
        return token in _ABANDONED
def _forget(token: str) -> None:
    with _ABANDONED_LOCK:
        _ABANDONED.discard(token)
def _emitter(job, kind: str):
    if not isinstance(job, dict):
        return None
    started = time.monotonic()
    node_id = str(job.get("node") or "")
    segment_id = job.get("segment")
    def emit(state: str, detail: str = "", step=None, total=None) -> None:
        try:
            from server import PromptServer
            instance = getattr(PromptServer, "instance", None)
            if instance is None:
                return
            message = {
                "phase": "agent",
                "node_id": node_id,
                "segment_id": segment_id,
                "kind": kind,
                "state": state,
                "detail": detail,
                "elapsed": round(time.monotonic() - started, 1),
            }
            if step is not None and total:
                try:
                    message["step"] = int(step)
                    message["total"] = int(total)
                except (TypeError, ValueError):
                    pass
            instance.send_sync(PROGRESS_EVENT, message)
        except Exception:
            pass
    return emit
def _heartbeat(emit, period: float = 4.0) -> threading.Event:
    stop = threading.Event()
    def beat():
        while not stop.wait(period):
            emit("alive")
    threading.Thread(target=beat, daemon=True, name="vig-agent-heartbeat").start()
    return stop
def _queue_is_idle() -> bool:
    try:
        from server import PromptServer
        queue = getattr(getattr(PromptServer, "instance", None), "prompt_queue", None)
        if queue is None:
            return False
        return int(queue.get_tasks_remaining()) == 0
    except Exception:
        return False
def _queue_is_busy() -> bool:
    try:
        from server import PromptServer
        queue = getattr(getattr(PromptServer, "instance", None), "prompt_queue", None)
        if queue is None:
            return False
        return int(queue.get_tasks_remaining()) > 0
    except Exception:
        return False
_WATCH_TICK = 2.0
_WATCHING = threading.Lock()
def _watch_kept_writer() -> None:
    if _WATCHING.locked():
        return
    def watch() -> None:
        from ..vig import director as _director
        with _WATCHING:
            while True:
                time.sleep(_WATCH_TICK)
                if _director.kept_backend() is None:
                    return
                why = ""
                if _queue_is_busy():
                    why = "a render started"
                elif _director.kept_idle_seconds() > _director.KEEP_SECONDS:
                    why = f"unused for {int(_director.KEEP_SECONDS // 60)} minutes"
                if not why:
                    continue
                try:
                    note = _director.drop_kept_backend(why)
                except Exception as exc:
                    print(f"[VIG H3 Cutter] could not put the writing model down: {exc}")
                    return
                if note:
                    print(f"[VIG H3 Cutter] {note}")
                return
    threading.Thread(target=watch, name="vig-h3-writer-watch", daemon=True).start()
def _opening_picture(segment: dict) -> str:
    from ..vig.cutter.state import SegmentRef
    if not isinstance(segment, dict):
        return ""
    for raw in segment.get("refs") or []:
        if not isinstance(raw, dict):
            continue
        ref = SegmentRef.from_json(raw, fallback_kind="image")
        if ref.is_opening and ref.kind == "image":
            return _resolve_media(ref.source)
    return ""
def _writer_settings(payload: dict):
    from ..vig.director import DirectorSettings
    from ..vig.director import BACKEND_EXTERNAL
    idle = _queue_is_idle()
    settings = DirectorSettings(evict_comfy_models=idle, keep_writer_loaded=idle)
    writer = payload.get("writer") if isinstance(payload.get("writer"), dict) else {}
    provider = str(writer.get("provider_url") or "").strip()
    via_provider = bool(
        provider and (writer.get("use_provider", True) not in (False, 0, "", "false", "0"))
    )
    if via_provider:
        settings.llm_backend = BACKEND_EXTERNAL
        settings.server_url = provider
        settings.model = str(writer.get("provider_model") or "")
        settings.evict_comfy_models = False
        settings.keep_writer_loaded = False
    elif writer.get("llm_model"):
        settings.gguf_model = str(writer["llm_model"])
    if writer.get("models_dir"):
        settings.gguf_extra_dir = str(writer["models_dir"])
    if writer.get("seed"):
        settings.seed = int(writer["seed"])
    if writer.get("temperature") is not None:
        try:
            settings.temperature_scale = max(0.0, min(2.0, float(writer["temperature"])))
        except (TypeError, ValueError):
            pass
    if payload.get("width"):
        settings.width = max(32, int(payload["width"]))
    if payload.get("height"):
        settings.height = max(32, int(payload["height"]))
    for name in _LLM_FIELDS:
        if payload.get(name) is not None:
            setattr(settings, name, payload[name])
    settings.opening_image = _opening_picture(_segment_of(payload))
    return settings
def _segment_of(payload: dict) -> dict:
    return payload.get("segment") if isinstance(payload.get("segment"), dict) else {}
def _unfixed_errors(report: str) -> int:
    text = str(report or "")
    delivered = re.search(r"^after repair: (\d+) error\(s\)", text, re.M)
    if delivered is not None:
        return int(delivered.group(1))
    match = re.search(r"^(\d+) error\(s\)", text, re.M)
    return int(match.group(1)) if match else 0
def write(payload: Any, progress=None) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    segment = _segment_of(payload)
    script = str(payload.get("script") or segment.get("script") or "").strip()
    if not script:
        return _bad(
            "There is no script to process. Write what happens in this clip into "
            "its script field."
        )
    settings = _writer_settings(payload)
    try:
        prompt, report, warnings, used_llm = film_writer.write_segment(
            settings, segment, script, progress=progress,
            previous=payload.get("previous") if isinstance(payload.get("previous"), dict) else None,
        )
    except Exception as exc:
        return _bad(f"{type(exc).__name__}: {exc}", 500)
    if not prompt:
        return _bad("The agent produced no prompt.", 500)
    return 200, {
        "ok": True,
        "prompt": prompt,
        "report": report,
        "warnings": warnings,
        "used_llm": used_llm,
        "errors": _unfixed_errors(report),
        "written_by": dict(getattr(settings, "written_by", None) or {}),
    }
def enrich(payload: Any, progress=None) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    segment = _segment_of(payload)
    script = str(payload.get("script") or segment.get("script") or "").strip()
    if not script:
        return _bad("There is no script to enrich.")
    settings = _writer_settings(payload)
    try:
        text, notes, used_llm = film_writer.enrich(
            settings,
            script,
            style_hint=film_writer.style_brief(str(segment.get("style") or "")),
            total_seconds=segment.get("seconds") or 0,
            progress=progress,
        )
    except Exception as exc:
        return _bad(f"{type(exc).__name__}: {exc}", 500)
    return 200, {"ok": True, "script": text, "report": "\n".join(notes), "used_llm": used_llm}
_LANGS = ("EN", "ZH", "RU")
def translate(payload: Any, progress=None) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    text = str(payload.get("prompt") or "").strip()
    if not text:
        return _bad("There is no prompt to translate.")
    source = str(payload.get("source") or "").upper()
    target = str(payload.get("target") or "").upper()
    if source not in _LANGS or target not in _LANGS or source == target:
        return _bad(f"Languages must differ and be one of {', '.join(_LANGS)}.")
    settings = _writer_settings(payload)
    try:
        translated, notes = film_writer.translate(settings, text, source, target, progress=progress)
    except Exception as exc:
        return _bad(f"{type(exc).__name__}: {exc}", 500)
    return 200, {"ok": True, "prompt": translated, "report": "\n".join(notes)}
def rebuild(payload: Any, progress=None) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    segment = _segment_of(payload)
    if not str(segment.get("prompt") or "").strip() and not str(
        segment.get("script") or ""
    ).strip():
        return _bad(
            "Nothing to rebuild from: the segment has neither a prompt nor a script."
        )
    settings = _writer_settings(payload)
    try:
        prompt, report, warnings, used_llm = film_writer.rebuild_prompt(
            settings, segment, progress=progress,
            previous=payload.get("previous") if isinstance(payload.get("previous"), dict) else None,
        )
    except Exception as exc:
        return _bad(f"{type(exc).__name__}: {exc}", 500)
    if not prompt:
        return _bad("The rebuild produced no prompt.", 500)
    return 200, {
        "ok": True,
        "prompt": prompt,
        "report": report,
        "warnings": warnings,
        "used_llm": used_llm,
        "written_by": dict(getattr(settings, "written_by", None) or {}),
    }
def plan_film(payload: Any, progress=None) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    film = payload.get("film") if isinstance(payload.get("film"), dict) else {}
    if "json_source" in film:
        from .cutter import _apply_storyboard
        from .film_director import read_storyboard_json
        from ..vig.cutter.state import Board
        try:
            plan, report = read_storyboard_json(str(film.get("json_source") or ""))
        except ValueError as exc:
            return _bad(str(exc))
        laid, note = _apply_storyboard(Board.from_json(payload.get("board")), plan)
        beats = plan.get("beats") or []
        return 200, {
            "ok": True,
            "board": laid.to_json(),
            "storyboard": plan,
            "storyboard_id": laid.storyboard_id,
            "applied": bool(note and "left exactly as it is" not in note),
            "beats": len(beats),
            "written": sum(1 for beat in beats if str(beat.get("prompt") or "").strip()),
            "report": "\n".join(n for n in (report, note) if n).strip(),
        }
    script = str(film.get("script") or "")
    video = str(film.get("video") or "").strip()
    if not script.strip() and not video:
        return _bad(
            "There is no film to plan. Write the story into the Film Director's "
            "script field, or point it at footage to read."
        )
    from ..vig import storyboard as sb
    from .cutter import _apply_storyboard
    from .film_director import _read_footage
    settings = _writer_settings(payload)
    notes: list[str] = []
    try:
        script, observed_notes, observed = _read_footage(
            settings, video, _as_count(film.get("video_frames"), 8),
            str(film.get("vision_model") or ""), script,
        )
        notes.extend(n for n in observed_notes if n)
        board = sb.plan(
            settings,
            script,
            beat_seconds=_as_count(film.get("beat_seconds"), sb.DEFAULT_BEAT_SECONDS),
            total_seconds=_as_count(film.get("total_seconds"), 0),
            style=str(film.get("style") or "neutral"),
            carry=_as_count(film.get("carry_frames"), sb.DEFAULT_CARRY),
            references=str(film.get("references") or ""),
            title=str(film.get("title") or ""),
            allow_music=bool(film.get("allow_music")),
            observed=observed,
            progress=progress,
        )
    except Exception as exc:
        return _bad(f"{type(exc).__name__}: {exc}", 500)
    if not board.beats:
        return _bad(board.report or "The plan came back with no beats.", 500)
    from ..vig.cutter.state import Board
    laid, note = _apply_storyboard(Board.from_json(payload.get("board")), board.to_json())
    written = sum(1 for beat in board.beats if beat.prompt.strip())
    return 200, {
        "ok": True,
        "board": laid.to_json(),
        "storyboard": board.to_json(),
        "storyboard_id": laid.storyboard_id,
        "applied": bool(note and "left exactly as it is" not in note),
        "beats": len(board.beats),
        "written": written,
        "report": "\n".join([n for n in notes if n] + [board.report, note]).strip(),
    }
def _as_count(value, fallback: int) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return int(fallback)
def _input_directory() -> str:
    import folder_paths
    return folder_paths.get_input_directory()
def extract_frame(payload: Any) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    source = _resolve_media(str(payload.get("clip") or ""))
    if not source:
        return _bad("That clip is not on disk any more. Generate or reload it first.")
    try:
        seconds = max(0.0, float(payload.get("time") or 0.0))
    except (TypeError, ValueError):
        seconds = 0.0
    try:
        import av
        best = None
        with av.open(source) as container:
            stream = container.streams.video[0]
            if seconds > 0 and stream.time_base:
                try:
                    container.seek(
                        int(seconds / stream.time_base), stream=stream, backward=True
                    )
                except Exception:
                    pass
            for frame in container.decode(stream):
                at = frame.time
                if best is None or at is None or at <= seconds + 1e-6:
                    best = frame
                if at is not None and at >= seconds:
                    break
        if best is None:
            return _bad("The clip decoded to no frames.", 500)
        image = best.to_image()
    except Exception as exc:
        return _bad(f"could not read the clip: {type(exc).__name__}: {exc}", 500)
    stamp = f"{int(best.time or seconds) :d}_{int(time.time() * 1000) % 100000:05d}"
    relative = os.path.join("vig_h3_cutter", "frames", f"frame_{stamp}.png")
    target = os.path.join(_input_directory(), relative)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    image.save(target, compress_level=4)
    label = f"frame @ {best.time if best.time is not None else seconds:.2f} s"
    return 200, {
        "ok": True,
        "source": relative.replace(os.sep, "/"),
        "label": label,
        "time": round(float(best.time if best.time is not None else seconds), 3),
    }
STRIP_HEIGHT = 180
STRIP_QUALITY = 82
STRIP_MOST = 64
def strip_frames(payload: Any) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    source = _resolve_media(str(payload.get("clip") or ""))
    if not source:
        return 200, {"ok": True, "gone": True, "frames": {}}
    try:
        points = sorted({max(1, int(p)) for p in (payload.get("points") or [])})
    except (TypeError, ValueError):
        return _bad("points must be frame numbers.")
    if not points:
        return _bad("No points were asked for.")
    if len(points) > STRIP_MOST:
        return _bad(f"A strip is at most {STRIP_MOST} cells.")
    import base64
    import io
    started = time.perf_counter()
    wanted: dict[int, list[int]] = {}
    for point in points:
        wanted.setdefault(point - 1, []).append(point)
    furthest = max(wanted)
    frames: dict[str, str] = {}
    def keep(frame, asked: list[int]) -> None:
        width = max(2, round(STRIP_HEIGHT * frame.width / max(1, frame.height) / 2) * 2)
        picture = frame.reformat(
            width=width, height=STRIP_HEIGHT, format="rgb24", interpolation="AREA",
        ).to_image()
        buffer = io.BytesIO()
        picture.save(buffer, "JPEG", quality=STRIP_QUALITY)
        url = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
        for point in asked:
            frames[str(point)] = url
    try:
        import av
        last = None
        index = -1
        with av.open(source) as container:
            stream = container.streams.video[0]
            stream.thread_type = "AUTO"
            for frame in container.decode(stream):
                index += 1
                last = frame
                if index in wanted:
                    keep(frame, wanted.pop(index))
                if index >= furthest:
                    break
            if wanted and last is not None:
                keep(last, [point for asked in wanted.values() for point in asked])
    except Exception as exc:
        return _bad(f"could not read the clip: {type(exc).__name__}: {exc}", 500)
    if not frames:
        return _bad("The clip decoded to no frames.", 500)
    return 200, {
        "ok": True,
        "frames": frames,
        "decoded": index + 1,
        "ms": round((time.perf_counter() - started) * 1000),
    }
def _provider_trouble(base_url: str) -> str:
    from ..vig.llm.openai_client import normalise_base_url
    from ..vig.llm.keys import remembered_key
    from ..vig.llm.openai_client import auth_headers
    url = normalise_base_url(base_url)
    try:
        import requests
        response = requests.get(
            f"{url}/models", timeout=5.0, headers=auth_headers(remembered_key(base_url))
        )
        response.raise_for_status()
        return f"{url} answered, but offered no models."
    except Exception as exc:
        import requests
        if isinstance(exc, requests.exceptions.ConnectTimeout):
            return f"{url} did not answer in time — is it starting up?"
        if isinstance(exc, requests.exceptions.ConnectionError):
            return f"nothing is listening at {url}"
        if isinstance(exc, requests.exceptions.Timeout):
            return f"{url} accepted the connection but did not answer in time."
        if isinstance(exc, requests.exceptions.HTTPError):
            response = getattr(exc, "response", None)
            code = getattr(response, "status_code", "?")
            said = ""
            try:
                body = response.json()
                said = str((body.get("error") or {}).get("message") or body.get("message") or "")
            except Exception:
                said = ""
            return f"{url} answered {code}: {said[:120]}" if said else f"{url} answered {code}."
        reason = str(exc).strip() or type(exc).__name__
        return f"{url}: {reason[:120]}"
def _tiny_vae_channels(path: str) -> int:
    import json
    try:
        with open(path, "rb") as handle:
            size = int.from_bytes(handle.read(8), "little")
            if size <= 0 or size > 64 * 1024 * 1024:
                return 0
            header = json.loads(handle.read(size).decode("utf-8"))
    except Exception:
        return 0
    for key in ("1.weight", "decoder.1.weight"):
        shape = (header.get(key) or {}).get("shape") or []
        if len(shape) >= 2:
            return int(shape[1])
    return 0
def handle_tiny_vae(_payload: Any = None) -> tuple[int, dict]:
    import folder_paths
    from .cutter import _kj_tiny_vae
    out = []
    for name in folder_paths.get_filename_list("vae_approx"):
        path = folder_paths.get_full_path("vae_approx", name) or ""
        out.append({"name": name, "channels": _tiny_vae_channels(path)})
    return 200, {"ok": True, "loader": _kj_tiny_vae() is not None, "decoders": out}
def handle_skills(_payload: Any = None) -> tuple[int, dict]:
    from ..vig import guides
    guides.refresh()
    own = {p.name for p in guides.OWN_SKILLS_DIR.iterdir()} if guides.OWN_SKILLS_DIR.is_dir() else set()
    mine = guides.user_skills_dir()
    added = {p.name for p in mine.iterdir()} if mine.is_dir() else set()
    skills = []
    for entry in guides.list_skills():
        where = "yours" if entry["id"] in added else "this extension" if entry["id"] in own else "MiniMax"
        skills.append({**entry, "where": where})
    return 200, {
        "ok": True,
        "skills": skills,
        "always": [guides.DIRECTION_SKILL, guides.PROMPT_WRITING_SKILL],
        "folder": str(mine),
    }
def handle_skill_add(payload: dict) -> tuple[int, dict]:
    from ..vig import guides
    if not isinstance(payload, dict):
        return 400, {"ok": False, "error": "The request body must be a JSON object."}
    given = str(payload.get("path") or "").strip()
    if not given:
        return 400, {"ok": False, "error": "No folder was given."}
    source = pathlib.Path(given)
    if not source.is_dir():
        return _bad(f"{given} is not a folder.")
    if not (source / "SKILL.md").is_file():
        return _bad(
            f"{source.name} has no SKILL.md in it, so nothing here can read it. "
            "A skill is a folder holding SKILL.md, and usually a references/ "
            "folder beside it."
        )
    target = guides.user_skills_dir() / source.name
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
    except Exception as exc:
        return _bad(f"could not install the skill: {type(exc).__name__}: {exc}", 500)
    guides.refresh()
    try:
        skill = guides.get_skill(source.name)
        name, description = skill.name, skill.description
    except KeyError:
        name, description = source.name, ""
    return 200, {
        "ok": True,
        "id": source.name,
        "name": name,
        "description": description,
        "folder": str(target),
    }
def llm_models(payload: Any) -> tuple[int, dict]:
    payload = payload if isinstance(payload, dict) else {}
    extra_dir = str(payload.get("models_dir") or "")
    provider = str(payload.get("provider_url") or "").strip()
    trouble = ""
    key_from = ""
    token_from = ""
    offered = 0
    owners = set()
    if provider:
        from ..vig.llm.keys import key_source, remembered_key, remembered_token, token_source
        from ..vig.llm.openai_client import list_model_entries, writers_among
        from ..vig.llm.router import connected_owners, owned_by_connected
        key_from = key_source(provider)
        token_from = token_source(provider)
        entries = list_model_entries(provider, api_key=remembered_key(provider))
        offered = len(entries)
        owners = connected_owners(provider, remembered_token(provider))
        reachable = set(owned_by_connected(entries, owners))
        names = [name for name in writers_among(entries) if name in reachable]
        if not names:
            trouble = _provider_trouble(provider)
    else:
        try:
            from ..vig.llm.models import list_models
            names = list_models(extra_dir)
        except Exception as exc:
            return _bad(f"{type(exc).__name__}: {exc}", 500)
    try:
        from ..vig.styles import library
        styles = list(library.writer_style_ids())
    except Exception:
        styles = []
    return 200, {
        "ok": True,
        "models": names,
        "styles": styles,
        "source": "provider" if provider else "folder",
        "trouble": trouble,
        "key_source": key_from,
        "token_source": token_from,
        "connected": len(owners) if provider else 0,
        "offered": offered,
    }
def provider_key(payload: Any) -> tuple[int, dict]:
    if not isinstance(payload, dict):
        return _bad("The request body must be a JSON object.")
    provider = str(payload.get("provider_url") or "").strip()
    if not provider:
        return _bad("No provider address was given, so there is nothing to file a credential under.")
    from ..vig.llm.keys import key_source, remember_key, remember_token, token_source
    if "api_key" in payload and not remember_key(provider, str(payload.get("api_key") or "")):
        return _bad("The key could not be written to this machine's settings.", 500)
    if "management_token" in payload and not remember_token(
        provider, str(payload.get("management_token") or "")
    ):
        return _bad("The token could not be written to this machine's settings.", 500)
    return 200, {
        "ok": True,
        "key_source": key_source(provider),
        "token_source": token_source(provider),
    }
def register_routes() -> bool:
    global _REGISTERED
    if _REGISTERED:
        return True
    try:
        from aiohttp import web
        from server import PromptServer
        routes = PromptServer.instance.routes
    except Exception:
        return False
    import asyncio
    def _register(path, handler, kind=None):
        @routes.post(path)
        async def run(request, _handler=handler, _kind=kind):
            try:
                payload = await request.json()
            except Exception:
                payload = None
            emit = (
                _emitter(payload.get("job"), _kind)
                if _kind and isinstance(payload, dict)
                else None
            )
            stop = None
            job = payload.get("job") if isinstance(payload, dict) else None
            token = str((job or {}).get("token") or "") or (
                f"{path}-{id(request)}-{time.monotonic_ns()}"
            )
            if emit is not None:
                emit("start", "request received")
                stop = _heartbeat(emit)
            def guarded(state, detail="", step=None, total=None):
                if _is_abandoned(token):
                    raise _Abandoned()
                emit(state, detail, step, total)
            def work():
                if _kind is None:
                    return _handler(payload)
                if not _WRITER_LOCK.acquire(blocking=False):
                    guarded("stage", "waiting for the writer already running…")
                    _WRITER_LOCK.acquire()
                try:
                    if _is_abandoned(token):
                        raise _Abandoned()
                    global _WRITER_HOLDER
                    _WRITER_HOLDER = token
                    return _handler(payload, guarded)
                finally:
                    _WRITER_HOLDER = ""
                    _WRITER_LOCK.release()
                    _forget(token)
                    _watch_kept_writer()
            try:
                status, body = await asyncio.to_thread(work)
            except asyncio.CancelledError:
                _abandon(token)
                if _WRITER_HOLDER == token:
                    try:
                        from ..vig import director as _director
                        live = _director.live_backend()
                        if live is not None:
                            _director.stop_backend(live)
                    except Exception:
                        pass
                raise
            except Exception as exc:
                status, body = 500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
            finally:
                if stop is not None:
                    stop.set()
            if emit is not None:
                if status == 200:
                    emit("done", "finished")
                else:
                    emit("error", str(body.get("error") or f"HTTP {status}"))
            return web.json_response(body, status=status)
    _register(WRITE_ROUTE, write, kind="write")
    _register(ENRICH_ROUTE, enrich, kind="enrich")
    _register(TRANSLATE_ROUTE, translate, kind="translate")
    _register(REBUILD_ROUTE, rebuild, kind="rebuild")
    _register(PLAN_ROUTE, plan_film, kind="plan")
    _register(FRAME_ROUTE, extract_frame)
    _register(STRIP_ROUTE, strip_frames)
    _register(REVEAL_ROUTE, handle_reveal)
    _register(PROJECT_SIZE_ROUTE, handle_project_size)
    _register(VALIDATE_ROUTE, handle_validate)
    _register(FILMS_ROUTE, handle_films)
    _register(FILM_JUDGE_ROUTE, handle_film_judge)
    _register(FILMS_PRUNE_ROUTE, handle_films_prune)
    _register(ENVELOPES_ROUTE, handle_envelopes)
    _register(MODELS_ROUTE, llm_models)
    _register(SKILLS_ROUTE, handle_skills)
    _register(TINY_VAE_ROUTE, handle_tiny_vae)
    _register(SKILL_ADD_ROUTE, handle_skill_add)
    _register(PROVIDER_KEY_ROUTE, provider_key)
    _register(PROJECT_ROUTE, handle_project)
    @routes.get(FILM_FILE_ROUTE)
    async def film_file(request):
        found = project_folder.film_file_path(
            request.query.get("path", ""), request.query.get("file", ""),
        )
        if not found:
            return web.Response(status=404, text="no such film")
        return web.FileResponse(found)
    @routes.get(PROJECT_FILE_ROUTE)
    async def project_file(request):
        found = project_folder.project_media_path(
            request.query.get("root", ""), request.query.get("path", ""),
        )
        if not found:
            return web.Response(status=404, text="no such project file")
        return web.FileResponse(found)
    @routes.get(TAKE_FILE_ROUTE)
    async def take_file(request):
        found = take_file_path(
            request.query.get("path", ""),
            request.query.get("folder", ""),
            request.query.get("file", ""),
        )
        if not found:
            return web.Response(status=404, text="no such take")
        return web.FileResponse(found)
    _register(TAKES_ROUTE, handle_takes)
    _register(TAKE_JUDGE_ROUTE, handle_take_judge)
    _register(TAKES_PRUNE_ROUTE, handle_takes_prune)
    _register(TAKE_DELETE_ROUTE, handle_take_delete)
    _register(TAKE_ADOPT_ROUTE, handle_take_adopt)
    _register(CLIPS_RECONCILE_ROUTE, handle_clips_reconcile)
    _register(AGENT_STOP_ROUTE, handle_agent_stop)
    _register(FILM_REBUILD_ROUTE, handle_film_rebuild)
    _register(PROJECT_NEW_ROUTE, handle_project_new)
    _register(PROJECT_REF_ROUTE, handle_project_ref)
    _register(refseg.SEGMENT_ROUTE, refseg.handle_segment)
    _register(refseg.SEGMENT_CROP_ROUTE, refseg.handle_segment_crop)
    _register(refseg.REFERENCE_CROP_ROUTE, refseg.handle_reference_crop)
    _register(refseg.SEGMENT_AUTO_ROUTE, refseg.handle_segment_auto)
    _register(refseg.REFERENCE_WRITE_ROUTE, refseg.handle_reference_write)
    _register(refseg.SEGMENT_METHODS_ROUTE, refseg.handle_segment_methods)
    _register(refseg.SEGMENT_WARM_ROUTE, refseg.handle_segment_warm)
    _register(usage.USAGE_ROUTE, usage.handle_usage)
    _register(usage.USAGE_READ_ROUTE, usage.handle_usage_read)
    _register(usage.JOURNAL_ROUTE, usage.handle_usage_journal)
    _REGISTERED = True
    return True
register_routes()
NODES: dict = {}
