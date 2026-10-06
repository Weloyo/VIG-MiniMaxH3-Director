from __future__ import annotations
import hashlib
import json
import os
import re
import time
MANIFEST = "project.json"
BOARD = "board.json"
REPORT = "report.txt"
FILM_DIR = "film"
CLIPS_DIR = "clips"
STORYBOARD_DIR = "storyboard"
VIDEO_SUB = "video"
REFS_SUB = "references"
PROMPTS_SUB = "prompts"
_SUBDIRS = (FILM_DIR, CLIPS_DIR)
_CLIP_SUBDIRS = (VIDEO_SUB, REFS_SUB, PROMPTS_SUB)
def _slug(text: str, fallback: str = "clip") -> str:
    out = re.sub(r"[^\w\-]+", "_", str(text or "")).strip("_")
    return out[:48] or fallback
def clip_dir_name(index: int, name: str) -> str:
    return f"{index + 1:02d}_{_slug(name)}"
CLIP_ID_FILE = "clip.json"
def read_clip_id(folder: str):
    try:
        with open(os.path.join(folder, CLIP_ID_FILE), encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return None
    try:
        return int(data.get("id"))
    except (TypeError, ValueError):
        return None
def write_clip_id(folder: str, seg_id, index: int, name: str) -> None:
    try:
        _write_json(os.path.join(folder, CLIP_ID_FILE), {
            "id": int(seg_id), "index": int(index) + 1, "name": str(name or ""),
        })
    except (OSError, TypeError, ValueError):
        pass
def folder_by_id(clips_root: str, seg_id) -> str:
    if seg_id is None:
        return ""
    try:
        wanted = int(seg_id)
    except (TypeError, ValueError):
        return ""
    try:
        names = sorted(os.listdir(clips_root))
    except OSError:
        return ""
    for name in names:
        path = os.path.join(clips_root, name)
        if os.path.isdir(path) and read_clip_id(path) == wanted:
            return path
    return ""
def folder_for(root: str, index=None, name: str = "", seg_id=None, folder: str = "") -> str:
    folder = str(folder or "").strip()
    if folder:
        return folder
    clips_root = os.path.join(str(root or ""), CLIPS_DIR)
    if seg_id is not None:
        owned = folder_by_id(clips_root, seg_id)
        if owned:
            return os.path.basename(owned)
    if index is None:
        return ""
    try:
        guess = clip_dir_name(int(index), name or "")
    except (TypeError, ValueError):
        return ""
    owner = read_clip_id(os.path.join(clips_root, guess))
    if owner is None or seg_id is None:
        return guess
    try:
        return guess if int(owner) == int(seg_id) else ""
    except (TypeError, ValueError):
        return guess
def reconcile_clip_folders(root: str, segments) -> list:
    clips_root = os.path.join(root, CLIPS_DIR)
    if not os.path.isdir(clips_root):
        return []
    plan = []
    for index, seg in enumerate(segments):
        current = folder_by_id(clips_root, getattr(seg, "id", None))
        if not current:
            continue
        wanted = os.path.join(clips_root, clip_dir_name(index, getattr(seg, "name", "")))
        if os.path.normcase(current) != os.path.normcase(wanted):
            plan.append((current, wanted))
    if not plan:
        return []
    moved = []
    staged = []
    for current, wanted in plan:
        holding = current + ".moving"
        try:
            os.rename(current, holding)
            staged.append((holding, wanted, current))
        except OSError:
            pass
    for holding, wanted, original in staged:
        try:
            os.rename(holding, wanted)
            moved.append((os.path.basename(original), os.path.basename(wanted)))
        except OSError:
            try:
                os.rename(holding, original)
            except OSError:
                pass
    return moved
def _clip_folder(clips_root: str, index: int, name: str, seg_id=None) -> str:
    owned = folder_by_id(clips_root, seg_id)
    if owned:
        wanted = os.path.join(clips_root, clip_dir_name(index, name))
        if os.path.normcase(owned) != os.path.normcase(wanted) and not os.path.exists(wanted):
            try:
                os.rename(owned, wanted)
                return wanted
            except OSError:
                return owned
        return owned
    wanted = os.path.join(clips_root, clip_dir_name(index, name))
    if os.path.isdir(wanted):
        return wanted
    prefix = f"{index + 1:02d}_"
    try:
        existing = [
            d for d in os.listdir(clips_root)
            if d.startswith(prefix) and os.path.isdir(os.path.join(clips_root, d))
        ]
    except OSError:
        existing = []
    if len(existing) == 1:
        try:
            os.rename(os.path.join(clips_root, existing[0]), wanted)
            return wanted
        except OSError:
            return os.path.join(clips_root, existing[0])
    os.makedirs(wanted, exist_ok=True)
    return wanted
def version_id(segment, steps=None, index=None) -> str:
    key = str(getattr(segment, "cache_key", "") or "")[:12] or "nokey"
    seed = int(getattr(segment, "seed", 0) or 0)
    head = f"v{int(index):02d}_" if index is not None else ""
    tail = f"_steps{int(steps)}" if steps else ""
    return f"{head}seed{seed}{tail}_{key}"
def next_version(video_dir: str) -> int:
    try:
        names = [
            f for f in os.listdir(video_dir)
            if os.path.splitext(f)[1].lower() in {".mp4", ".webm", ".mov", ".mkv"}
        ]
    except OSError:
        return 1
    highest = 0
    for name in names:
        match = re.match(r"v(\d+)_", name)
        highest = max(highest, int(match.group(1)) if match else 0)
    return max(highest, len(names)) + 1
def clip_paths(root: str, index: int, name: str, seg_id=None) -> dict:
    require_root(root)
    folder = _clip_folder(os.path.join(root, CLIPS_DIR), index, name, seg_id)
    if seg_id is not None:
        write_clip_id(folder, seg_id, index, name)
    out = {"folder": folder}
    for sub in _CLIP_SUBDIRS:
        path = os.path.join(folder, sub)
        os.makedirs(path, exist_ok=True)
        out[sub] = path
    return out
def film_id(segments) -> str:
    parts = [version_id(s) for s in segments]
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:10]
    return f"{len(parts)}clips_{digest}"
FILM_FPS = 24
FILM_EXTS = {".mp4", ".webm", ".mov", ".mkv"}
def film_record(clips, now=None) -> dict:
    rows = []
    for index, clip in enumerate(clips or []):
        frames = max(0, int(clip.get("frames") or 0))
        rows.append({
            "index": index + 1,
            "name": str(clip.get("name") or ""),
            "frames": frames,
            "seconds": round(frames / FILM_FPS, 3),
            "prompt": str(clip.get("prompt") or ""),
        })
    total = sum(row["frames"] for row in rows)
    return {
        "kind": "vig-h3-film",
        "written": now or time.strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(rows),
        "frames": total,
        "seconds": round(total / FILM_FPS, 3),
        "clips": rows,
    }
def write_film_record(root: str, stem: str, clips, now=None) -> str:
    if not root or not stem or os.path.basename(stem) != stem:
        return ""
    path = os.path.join(root, FILM_DIR, f"{stem}.json")
    try:
        require_root(root)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        _write_json(path, film_record(clips, now))
    except (OSError, TypeError, ValueError):
        return ""
    return path
def board_film_clips(board) -> list:
    spans = board.film_spans
    out = []
    for seg in board.segments:
        start, end = spans.get(seg.id, (0, 0))
        out.append({"name": seg.name or "", "frames": max(0, int(end) - int(start)),
                    "prompt": seg.prompt or ""})
    return out
FILMS_FILE = "films.json"
FILM_MIN_CLIPS = 2
def film_clip_count(name: str, record=None):
    if isinstance(record, dict) and isinstance(record.get("count"), int):
        return record["count"]
    found = re.match(r"^(\d+)clips_", os.path.basename(str(name or "")))
    return int(found.group(1)) if found else None
def is_gallery_film(name: str, record=None) -> bool:
    count = film_clip_count(name, record)
    return count is None or count >= FILM_MIN_CLIPS
def read_film_ratings(root: str) -> dict:
    try:
        with open(os.path.join(str(root or ""), FILM_DIR, FILMS_FILE), encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}
    films_data = data.get("films") if isinstance(data, dict) else None
    out = {}
    for name, entry in (films_data or {}).items():
        try:
            out[str(name)] = max(0, min(MAX_RATING, int((entry or {}).get("rating") or 0)))
        except (TypeError, ValueError, AttributeError):
            continue
    return out
def _write_film_ratings(root: str, ratings: dict) -> None:
    _write_json(os.path.join(root, FILM_DIR, FILMS_FILE),
                {"version": 1, "films": {name: {"rating": rating}
                                         for name, rating in sorted(ratings.items()) if rating}})
def rate_film(root: str, name: str, rating) -> dict:
    if not film_file_path(root, name) or not is_gallery_film(name):
        return {"ok": False, "error": "That film is not in this project's film gallery."}
    try:
        rating = max(0, min(MAX_RATING, int(rating or 0)))
    except (TypeError, ValueError):
        return {"ok": False, "error": "A rating is a number of stars."}
    ratings = read_film_ratings(root)
    ratings[name] = rating
    _write_film_ratings(root, ratings)
    return {"ok": True, "film": name, "rating": rating}
def prune_films(root: str, at_or_below: int, dry_run: bool = True, keep: str = "") -> dict:
    at_or_below = max(0, min(MAX_RATING, int(at_or_below)))
    doomed, kept = [], 0
    for film in films(root):
        if (keep and film["name"] == keep) or film["rating"] > at_or_below:
            kept += 1
            continue
        doomed.append(film["name"])
    removed, refused = [], []
    if not dry_run:
        ratings = read_film_ratings(root)
        for name in doomed:
            path = film_file_path(root, name)
            trouble = _remove_video(path) if path else ""
            if trouble:
                refused.append(name)
                continue
            try:
                os.remove(os.path.join(root, FILM_DIR, os.path.splitext(name)[0] + ".json"))
            except OSError:
                pass
            ratings.pop(name, None)
            removed.append(name)
        _write_film_ratings(root, ratings)
    return {"at_or_below": at_or_below, "dry_run": bool(dry_run), "would_remove": doomed,
            "removed": removed, "refused": refused, "kept": kept}
def folder_bytes(root: str) -> tuple[int, int]:
    total = files = 0
    stack = [str(root or "")]
    while stack:
        folder = stack.pop()
        try:
            entries = os.scandir(folder)
        except OSError:
            continue
        with entries:
            for entry in entries:
                try:
                    if entry.is_dir(follow_symlinks=False):
                        stack.append(entry.path)
                    elif entry.is_file(follow_symlinks=False):
                        total += entry.stat(follow_symlinks=False).st_size
                        files += 1
                except OSError:
                    continue
    return total, files
def films(root: str) -> list:
    folder = os.path.join(str(root or ""), FILM_DIR)
    try:
        names = os.listdir(folder)
    except OSError:
        return []
    ratings = read_film_ratings(root)
    out = []
    for name in names:
        path = os.path.join(folder, name)
        stem, ext = os.path.splitext(name)
        if ext.lower() not in FILM_EXTS or not os.path.isfile(path):
            continue
        record = None
        try:
            with open(os.path.join(folder, f"{stem}.json"), encoding="utf-8") as handle:
                data = json.load(handle)
            record = data if isinstance(data, dict) else None
        except (OSError, ValueError):
            record = None
        if not is_gallery_film(name, record):
            continue
        info = os.stat(path)
        out.append({"name": name, "stem": stem, "size": info.st_size,
                    "modified": info.st_mtime, "record": record,
                    "clips": film_clip_count(name, record),
                    "rating": ratings.get(name, 0),
                    "seconds": _film_seconds(path, record)})
    out.sort(key=lambda film: film["modified"], reverse=True)
    return out
def _film_seconds(path: str, record=None):
    if isinstance(record, dict) and isinstance(record.get("seconds"), (int, float)):
        return float(record["seconds"])
    try:
        import av
        with av.open(path) as container:
            if container.duration:
                return round(container.duration / 1_000_000, 3)
    except Exception:
        return None
    return None
def films_hidden(root: str) -> int:
    try:
        names = os.listdir(os.path.join(str(root or ""), FILM_DIR))
    except OSError:
        return 0
    return sum(1 for name in names
               if os.path.splitext(name)[1].lower() in FILM_EXTS and not is_gallery_film(name))
def film_file_path(root: str, name: str) -> str:
    root = str(root or "").strip()
    if not root or os.path.basename(name) != name:
        return ""
    if os.path.splitext(name)[1].lower() not in FILM_EXTS:
        return ""
    folder = os.path.realpath(os.path.join(root, FILM_DIR))
    full = os.path.realpath(os.path.join(folder, name))
    try:
        if os.path.commonpath([folder, full]) != folder:
            return ""
    except ValueError:
        return ""
    return full if os.path.isfile(full) else ""
PROJECT_MEDIA_EXTS = (".mp4", ".webm", ".mov", ".mkv", ".png", ".jpg", ".jpeg", ".webp")
def project_media_path(root: str, path: str) -> str:
    root = str(root or "").strip()
    path = str(path or "").strip()
    if not root or not path or not os.path.isdir(root):
        return ""
    if not (os.path.isfile(os.path.join(root, "board.json"))
            or os.path.isdir(os.path.join(root, CLIPS_DIR))):
        return ""
    if os.path.splitext(path)[1].lower() not in PROJECT_MEDIA_EXTS:
        return ""
    folder = os.path.realpath(root)
    full = os.path.realpath(path if os.path.isabs(path) else os.path.join(root, path))
    try:
        if os.path.commonpath([folder, full]) != folder:
            return ""
    except ValueError:
        return ""
    return full if os.path.isfile(full) else ""
class ProjectMissing(FileNotFoundError):
    pass
def require_root(root: str) -> str:
    root = (root or "").strip()
    if root and not os.path.isdir(root):
        raise ProjectMissing(
            f"The project folder {root} does not exist any more -- deleted, renamed, "
            "or on a drive that is not mounted. Nothing was written. Open the project "
            "again, or start a new one; a run never creates the folder."
        )
    return root
def ensure(root: str, create: bool = False) -> dict:
    paths = {"root": root}
    if create:
        os.makedirs(root, exist_ok=True)
    else:
        require_root(root)
    for name in _SUBDIRS:
        path = os.path.join(root, name)
        os.makedirs(path, exist_ok=True)
        paths[name] = path
    return paths
WORKFLOW = "workflow.json"
WORKFLOW_API = "workflow_api.json"
WORKFLOW_DIR = "workflow"
def workflow_fingerprint(prompt, cutter_class: str = "VigH3Cutter") -> str:
    if not isinstance(prompt, dict):
        return ""
    trimmed = {}
    for node_id, node in prompt.items():
        if not isinstance(node, dict):
            continue
        inputs = dict(node.get("inputs") or {})
        if node.get("class_type") == cutter_class:
            inputs.pop("board", None)
        trimmed[str(node_id)] = {"class_type": node.get("class_type"), "inputs": inputs}
    blob = json.dumps(trimmed, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:10]
def save_workflow(board, workflow, prompt, now=None, cutter_class: str = "VigH3Cutter") -> str:
    root = (getattr(board, "project_dir", "") or "").strip()
    if not root or (workflow is None and prompt is None):
        return ""
    try:
        require_root(root)
        wrote = []
        if isinstance(workflow, dict):
            _write_json(os.path.join(root, WORKFLOW), workflow)
            wrote.append(WORKFLOW)
        if isinstance(prompt, dict):
            _write_json(os.path.join(root, WORKFLOW_API), prompt)
            wrote.append(WORKFLOW_API)
        kept = ""
        digest = workflow_fingerprint(prompt, cutter_class)
        if digest and isinstance(workflow, dict):
            folder = os.path.join(root, WORKFLOW_DIR)
            os.makedirs(folder, exist_ok=True)
            already = sorted(n for n in os.listdir(folder) if n.endswith(f"_{digest}.json"))
            if already:
                kept = f"the graph is unchanged since {WORKFLOW_DIR}/{already[-1]}"
            else:
                stamp = re.sub(r"\D", "", now or "")[:14] if now else ""
                if len(stamp) < 14:
                    stamp = time.strftime("%Y%m%d%H%M%S")
                name = f"{stamp[:8]}-{stamp[8:14]}_{digest}.json"
                _write_json(os.path.join(folder, name), workflow)
                kept = f"a new version of the graph is kept as {WORKFLOW_DIR}/{name}"
        if not wrote:
            return ""
        return f"Workflow saved: {', '.join(wrote)}" + (f"; {kept}" if kept else "") + "."
    except Exception as exc:
        return (
            "WARNING: the workflow could not be saved into the project folder "
            f"({type(exc).__name__}: {exc})."
        )
def save_storyboard(root: str, storyboard, plan_id: str, now=None) -> str:
    if not isinstance(storyboard, dict) or not storyboard.get("beats"):
        return ""
    plan_id = str(plan_id or "").strip()
    if not plan_id:
        return ""
    folder = os.path.join(root, STORYBOARD_DIR)
    require_root(root)
    os.makedirs(folder, exist_ok=True)
    name = _slug(plan_id, "plan") + ".json"
    path = os.path.join(folder, name)
    if os.path.exists(path):
        return ""
    payload = dict(storyboard)
    payload.setdefault("id", plan_id)
    payload["kept"] = now or time.strftime("%Y-%m-%d %H:%M:%S")
    _write_json(path, payload)
    return name
def _write_json(path: str, payload) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv"}
def file_take(root: str, seg, index: int, source: str, copy, *, seed=None,
              cache_key=None, steps=None, continues="", settings=None, stack="",
              checkpoint="", now=None, variant=False, spent=None) -> str:
    root = (root or "").strip()
    if not root or not source or not os.path.isfile(source):
        return ""
    full_key = str(
        cache_key if cache_key is not None else getattr(seg, "cache_key", "") or ""
    )
    key = full_key[:12]
    paths_c = clip_paths(root, index, getattr(seg, "name", ""), getattr(seg, "id", None))
    video_dir = paths_c[VIDEO_SUB]
    if key and any(key in entry["name"] for entry in _listing(video_dir, VIDEO_EXTS)):
        return ""
    try:
        here = os.path.realpath(video_dir)
        if os.path.commonpath([here, os.path.realpath(source)]) == here:
            return ""
    except ValueError:
        pass
    stem = (
        f"v{next_version(video_dir):02d}"
        f"_seed{int(seed if seed is not None else getattr(seg, 'seed', 0) or 0)}"
        + (f"_steps{int(steps)}" if steps else "")
        + f"_{key or 'nokey'}"
    )
    ext = os.path.splitext(source)[1] or ".mp4"
    copy(source, os.path.join(video_dir, stem + ext))
    record = {
        "saved": now or time.strftime("%Y-%m-%d %H:%M:%S"),
        "seed": int(seed if seed is not None else getattr(seg, "seed", 0) or 0),
        "steps": steps,
        "mode": seg.mode, "seconds": seg.seconds, "frames": seg.frames,
        "delivered_frames": seg.delivered_frames,
        "carried_run": seg.carried_run,
        "context_frames": seg.context_frames,
        "context_audio": seg.context_audio,
        "context_at": seg.context_at,
        "tail_at": int(getattr(seg, "tail_at", 0) or 0) if getattr(seg, "carried_tail", 0) else 0,
        "continues": continues,
        "style": seg.style, "camera": seg.camera,
        "prompt": seg.prompt, "script": seg.script,
        **({"writer": dict(seg.written_by)} if getattr(seg, "written_by", None) else {}),
        "cache_key": full_key,
        "settings": dict(settings) if settings else None,
        "checkpoint": checkpoint,
        "stack": stack,
        **({"spent": dict(spent)} if spent else {}),
        "take": stem + ext,
    }
    if variant:
        record["batch_variant"] = True
    _write_json(os.path.join(paths_c[PROMPTS_SUB], stem + ".json"), record)
    return stem + ext
def export(board, film_path, payload, report, resolve, copy, steps=None, now=None,
           settings=None, stacks=None, checkpoints=None, extra_takes=None, filed=0,
           storyboard=None):
    root = (getattr(board, "project_dir", "") or "").strip()
    if not root:
        return ""
    stamp = now or time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        paths = ensure(root)
        counts = {"takes": int(filed), "films": 0, "refs": 0, "prompts": int(filed),
                  "plans": 0}
        renumbered = reconcile_clip_folders(root, board.segments)
        for index, seg in enumerate(board.segments):
            paths_c = clip_paths(root, index, seg.name, seg.id)
            after = board.segments[index - 1] if index else None
            continues = (
                after.cache_key
                if after is not None and seg.takes_from_front and not seg.external
                else ""
            )
            filed = file_take(
                root, seg, index, resolve(seg.source_clip or seg.clip), copy,
                steps=steps, continues=continues, settings=settings,
                stack=(stacks or {}).get(seg.mode, ""),
                checkpoint=(checkpoints or {}).get(seg.mode, ""),
                now=stamp,
            )
            if filed:
                counts["takes"] += 1
                counts["prompts"] += 1
            for variant in (extra_takes or {}).get(index, []):
                filed_v = file_take(
                    root, seg, index, variant.get("path") or "", copy,
                    seed=int(variant.get("seed") or 0),
                    cache_key=str(variant.get("cache_key") or ""),
                    steps=steps, continues=continues, settings=settings,
                    stack=(stacks or {}).get(seg.mode, ""),
                    checkpoint=(checkpoints or {}).get(seg.mode, ""),
                    now=stamp, variant=True,
                )
                if filed_v:
                    counts["takes"] += 1
                    counts["prompts"] += 1
            for ref in seg.refs:
                got = resolve(ref.source)
                if not got or not os.path.isfile(got):
                    continue
                target = os.path.join(
                    paths_c[REFS_SUB],
                    _slug(ref.uid or ref.label, "ref") + (os.path.splitext(got)[1] or ""),
                )
                if not os.path.exists(target):
                    copy(got, target)
                    counts["refs"] += 1
        pool = (
            clip_paths(root, 0, board.segments[0].name, board.segments[0].id)[REFS_SUB]
            if board.segments
            else None
        )
        for ref in (getattr(board, "library", []) if pool else []):
            got = resolve(ref.source)
            if not got or not os.path.isfile(got):
                continue
            target = os.path.join(
                pool,
                f"{_slug(ref.tag or ref.uid or ref.label, 'ref')}"
                + (os.path.splitext(got)[1] or ""),
            )
            if not os.path.exists(target):
                copy(got, target)
                counts["refs"] += 1
        if film_path and os.path.isfile(film_path) and len(board.segments) >= FILM_MIN_CLIPS:
            stem = film_id(board.segments)
            target = os.path.join(
                paths[FILM_DIR], stem + (os.path.splitext(film_path)[1] or ".mp4"),
            )
            if not os.path.exists(target):
                copy(film_path, target)
                counts["films"] += 1
            write_film_record(root, stem, board_film_clips(board), now=stamp)
        if save_storyboard(root, storyboard, getattr(board, "storyboard_id", ""),
                           now=stamp):
            counts["plans"] += 1
        _write_json(os.path.join(root, BOARD), payload)
        with open(os.path.join(root, REPORT), "w", encoding="utf-8") as handle:
            handle.write(str(report).rstrip() + "\n")
        manifest = read_manifest(root)
        manifest.update({
            "kind": "vig-h3-cutter-project",
            "version": 1,
            "created": manifest.get("created") or stamp,
            "updated": stamp,
            "clips": [
                {"index": i + 1, "name": s.name, "folder": clip_dir_name(i, s.name),
                 "current": version_id(s)}
                for i, s in enumerate(board.segments)
            ],
        })
        if getattr(board, "storyboard_id", ""):
            manifest["storyboard"] = board.storyboard_id
        _write_json(os.path.join(root, MANIFEST), manifest)
        added = ", ".join(f"{v} {k}" for k, v in counts.items() if v)
        return (
            f"Project folder updated: {root}"
            + (f" (new: {added})" if added else " (nothing new to add)")
            + "."
            + (
                " Clip folders renumbered to match the board: "
                + ", ".join(f"{was} -> {now}" for was, now in renumbered)
                + "."
                if renumbered
                else ""
            )
        )
    except Exception as exc:
        return f"WARNING: could not write the project folder {root!r}: {type(exc).__name__}: {exc}"
def create(root: str, payload=None, now=None) -> dict:
    root = (root or "").strip()
    why = unfit_folder(root, for_new=True)
    if why:
        return {"ok": False, "error": why}
    stamp = now or time.strftime("%Y-%m-%d %H:%M:%S")
    existing = inventory(root) if os.path.isdir(root) else None
    had = bool(existing and existing.get("ok") and (
        existing["totals"]["takes"] or existing["totals"]["films"] or existing["has_board"]
    ))
    try:
        ensure(root, create=True)
        manifest = read_manifest(root)
        manifest.update({
            "kind": "vig-h3-cutter-project",
            "version": 1,
            "created": manifest.get("created") or stamp,
            "updated": stamp,
        })
        manifest.setdefault("clips", [])
        _write_json(os.path.join(root, MANIFEST), manifest)
        if payload is not None and not os.path.exists(os.path.join(root, BOARD)):
            _write_json(os.path.join(root, BOARD), payload)
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    return {
        "ok": True,
        "root": root,
        "created_structure": [MANIFEST] + list(_SUBDIRS),
        "already_had_work": had,
        "totals": (existing or {}).get("totals") if had else None,
    }
def scaffold(root: str, index: int = 0, name: str = "") -> dict:
    ensure(root)
    return clip_paths(root, index, name)
def save_reference(root: str, index: int, name: str, source: str, label: str, copy) -> dict:
    root = (root or "").strip()
    if not root:
        return {"ok": False, "error": "This cut has no project folder."}
    if not source or not os.path.isfile(source):
        return {"ok": False, "error": f"No such file: {source!r}"}
    try:
        refs = clip_paths(root, index, name)[REFS_SUB]
        target = os.path.join(
            refs, _slug(label, "ref") + (os.path.splitext(source)[1] or ""))
        if os.path.abspath(target) == os.path.abspath(source):
            return {"ok": True, "path": target, "copied": False}
        copy(source, target)
        return {"ok": True, "path": target, "copied": True}
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
def read_manifest(root: str) -> dict:
    try:
        with open(os.path.join(root, MANIFEST), encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}
def read_board(root: str) -> dict | None:
    try:
        with open(os.path.join(root, BOARD), encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None
def _listing(path: str, exts=None) -> list:
    try:
        names = sorted(os.listdir(path))
    except OSError:
        return []
    out = []
    for name in names:
        full = os.path.join(path, name)
        if not os.path.isfile(full):
            continue
        if exts and os.path.splitext(name)[1].lower() not in exts:
            continue
        out.append({"name": name, "path": full, "size": os.path.getsize(full),
                    "modified": os.path.getmtime(full)})
    return out
def _latest_prompt(prompts_dir: str) -> dict:
    entries = _listing(prompts_dir, {".json"})
    if not entries:
        return {}
    def rank(entry):
        match = re.match(r"v(\d+)_", entry["name"])
        return (int(match.group(1)) if match else -1, entry["modified"])
    for entry in sorted(entries, key=rank, reverse=True):
        try:
            with open(entry["path"], encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict) or not str(data.get("prompt") or "").strip():
            continue
        data["file"] = entry["name"]
        return data
    return {}
TAKES_FILE = "takes.json"
MIN_RATING = 0
MAX_RATING = 5
def _takes_path(clips_root: str, folder: str) -> str:
    return os.path.join(clips_root, folder, TAKES_FILE)
def read_takes(clip_folder: str) -> dict:
    try:
        with open(os.path.join(clip_folder, TAKES_FILE), encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}
    takes = data.get("takes") if isinstance(data, dict) else None
    return takes if isinstance(takes, dict) else {}
def write_take(clip_folder: str, filename: str, rating=None, note=None,
               continues=None) -> dict:
    takes = read_takes(clip_folder)
    entry = dict(takes.get(filename) or {})
    if rating is not None:
        entry["rating"] = max(MIN_RATING, min(MAX_RATING, int(rating)))
    if note is not None:
        entry["note"] = str(note)
    if continues is not None:
        told = str(continues or "")
        if told:
            entry["continues"] = told
        else:
            entry.pop("continues", None)
    takes[filename] = entry
    os.makedirs(clip_folder, exist_ok=True)
    _write_json(os.path.join(clip_folder, TAKES_FILE), {"version": 1, "takes": takes})
    return takes
def take_details(root: str, folder: str) -> list:
    clip_folder = os.path.join(root, CLIPS_DIR, folder)
    video_dir = os.path.join(clip_folder, VIDEO_SUB)
    prompts_dir = os.path.join(clip_folder, PROMPTS_SUB)
    judged = read_takes(clip_folder)
    out = []
    for entry in _listing(video_dir, {".mp4", ".webm", ".mov", ".mkv"}):
        name = entry["name"]
        stem = os.path.splitext(name)[0]
        made = {}
        try:
            with open(os.path.join(prompts_dir, stem + ".json"), encoding="utf-8") as handle:
                made = json.load(handle)
        except (OSError, ValueError):
            made = {}
        state = judged.get(name) or {}
        by_hand = str(state.get("continues") or "")
        if by_hand:
            made = dict(made)
            made["continues"] = by_hand
            made["continues_by_hand"] = True
        out.append({
            "file": name,
            "path": entry["path"],
            "size": entry["size"],
            "modified": entry["modified"],
            "rating": int(state.get("rating") or 0),
            "note": str(state.get("note") or ""),
            "made": made,
        })
    return out
def _remove_video(path: str) -> str:
    import time
    for attempt in (0, 1):
        try:
            os.remove(path)
            return ""
        except FileNotFoundError:
            return ""
        except OSError as exc:
            if attempt == 0:
                time.sleep(0.4)
                continue
            return getattr(exc, "strerror", None) or str(exc)
    return ""
def _erase_take(clip_folder: str, name: str) -> str:
    trouble = _remove_video(os.path.join(clip_folder, VIDEO_SUB, name))
    if trouble:
        return trouble
    try:
        os.remove(os.path.join(clip_folder, PROMPTS_SUB, os.path.splitext(name)[0] + ".json"))
    except OSError:
        pass
    return ""
def delete_take(root: str, folder: str, name: str, keep: str = "") -> dict:
    clip_folder = os.path.join(root, CLIPS_DIR, folder)
    if not os.path.isdir(clip_folder):
        raise FileNotFoundError(f"no such clip folder: {clip_folder}")
    if os.path.basename(name) != name:
        raise ValueError("a take is named by its filename alone")
    if keep and name == keep:
        raise PermissionError(
            "this take is the clip the timeline plays -- put another take on "
            "the timeline first, and this one can go"
        )
    video = os.path.join(clip_folder, VIDEO_SUB, name)
    existed = os.path.isfile(video)
    trouble = _erase_take(clip_folder, name)
    if trouble:
        raise OSError(trouble)
    judged = read_takes(clip_folder)
    was = judged.pop(name, None)
    _write_json(os.path.join(clip_folder, TAKES_FILE), {"version": 1, "takes": judged})
    return {"folder": folder, "file": name, "existed": existed,
            "was_rated": int((was or {}).get("rating") or 0),
            "remaining": len(take_details(root, folder))}
def prune_takes(root: str, folder: str, at_or_below: int, dry_run: bool = True,
                keep: str = "") -> dict:
    at_or_below = max(0, min(MAX_RATING, int(at_or_below)))
    doomed, kept = [], []
    for take in take_details(root, folder):
        if (keep and take["file"] == keep) or take["rating"] > at_or_below:
            kept.append(take["file"])
            continue
        doomed.append(take["file"])
    removed, refused = [], []
    if not dry_run:
        clip_folder = os.path.join(root, CLIPS_DIR, folder)
        judged = read_takes(clip_folder)
        for name in doomed:
            if _erase_take(clip_folder, name):
                refused.append(name)
                continue
            judged.pop(name, None)
            removed.append(name)
        _write_json(os.path.join(clip_folder, TAKES_FILE), {"version": 1, "takes": judged})
    return {"folder": folder, "at_or_below": at_or_below, "dry_run": bool(dry_run),
            "would_remove": doomed, "removed": removed, "refused": refused,
            "kept": len(kept)}
def take_for_key(video_dir: str, key: str) -> str:
    short = str(key or "")[:12]
    if not video_dir or len(short) < 12:
        return ""
    try:
        names = sorted(os.listdir(video_dir))
    except OSError:
        return ""
    found = [name for name in names
             if os.path.splitext(name)[0].endswith("_" + short)
             and os.path.isfile(os.path.join(video_dir, name))]
    return found[-1] if found else ""
def stand_ins(root: str, board, resolve, servable=None) -> dict:
    def missing(path: str) -> bool:
        if not path:
            return False
        found = resolve(path)
        return not found or (servable is not None and not servable(found))
    segments = (board or {}).get("segments") or []
    clips_root = os.path.join(str(root or ""), CLIPS_DIR)
    found = []
    for index, seg in enumerate(segments):
        if not isinstance(seg, dict):
            continue
        folder = folder_for(root, index, seg.get("name") or "", seg.get("id"))
        video_dir = os.path.join(clips_root, folder, VIDEO_SUB) if folder else ""
        entry = {"id": seg.get("id"), "folder": folder}
        for field, label in (("clip", "clip"), ("source_clip", "source")):
            path = str(seg.get(field) or "")
            gone = missing(path)
            entry[f"{label}_gone"] = gone
            take = take_for_key(video_dir, seg.get("cache_key")) if gone else ""
            entry[f"{label}_take"] = take
            entry[f"{label}_take_path"] = os.path.join(video_dir, take) if take else ""
        poster = str(seg.get("poster") or "")
        entry["poster_gone"] = missing(poster)
        found.append(entry)
    film = str((board or {}).get("film") or "")
    found_film = resolve(film) if film else ""
    inside = bool(found_film) and _is_inside(found_film, root)
    why = "" if not film or inside else ("gone" if not found_film else "shared")
    return {"segments": found, "film_gone": bool(why), "film_why": why}
def _is_inside(path: str, root: str) -> bool:
    try:
        path = os.path.normcase(os.path.realpath(path))
        root = os.path.normcase(os.path.realpath(root))
        return os.path.commonpath([path, root]) == root
    except (OSError, ValueError):
        return False
def unfit_folder(root: str, for_new: bool = False) -> str:
    root = (root or "").strip().strip('"')
    if not root:
        return "No folder was given."
    full = os.path.abspath(root)
    if os.path.isfile(full):
        return "That is a file, not a folder — choose the folder that holds it."
    if not for_new and not os.path.isdir(full):
        return "That folder does not exist."
    trimmed = full.rstrip("\\/")
    if not trimmed or os.path.dirname(trimmed) == trimmed or os.path.splitdrive(full)[1] in ("", "\\", "/"):
        return "A drive's root cannot be a project — choose or make a folder inside it."
    parent = os.path.dirname(trimmed)
    while parent and os.path.dirname(parent) != parent:
        manifest = os.path.join(parent, MANIFEST)
        if os.path.isfile(manifest):
            return (
                f"That folder is inside the project \"{os.path.basename(parent)}\" "
                f"({parent}) — choose the project's own folder."
            )
        parent = os.path.dirname(parent)
    if for_new:
        for key in ("SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramData"):
            system = (os.environ.get(key) or "").rstrip("\\/")
            if system and (trimmed.lower() + "\\").startswith(system.lower() + "\\"):
                return "That is a system folder — choose a folder of your own."
    return ""
def inventory(root: str) -> dict:
    root = (root or "").strip()
    why = unfit_folder(root)
    if why:
        return {"ok": False, "error": why}
    clips = []
    prompts_total = 0
    clips_root = os.path.join(root, CLIPS_DIR)
    if os.path.isdir(clips_root):
        for folder in sorted(os.listdir(clips_root)):
            full = os.path.join(clips_root, folder)
            if not os.path.isdir(full):
                continue
            takes = _listing(os.path.join(full, VIDEO_SUB),
                             {".mp4", ".webm", ".mov", ".mkv"})
            refs = _listing(os.path.join(full, REFS_SUB))
            prompts = _listing(os.path.join(full, PROMPTS_SUB), {".json"})
            prompts_total += len(prompts)
            clips.append({"folder": folder, "takes": takes, "count": len(takes),
                          "references": len(refs), "reference_files": refs,
                          "prompts": len(prompts),
                          "latest_prompt": _latest_prompt(os.path.join(full, PROMPTS_SUB))})
    board = read_board(root)
    return {
        "ok": True,
        "root": root,
        "manifest": read_manifest(root),
        "board": board,
        "has_board": board is not None,
        "films": _listing(os.path.join(root, FILM_DIR)),
        "clips": clips,
        "references": sum(c["references"] for c in clips),
        "totals": {
            "films": len(_listing(os.path.join(root, FILM_DIR))),
            "takes": sum(c["count"] for c in clips),
            "references": sum(c["references"] for c in clips),
            "prompt_variants": prompts_total,
        },
    }
