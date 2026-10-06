from __future__ import annotations
import hashlib
import json
import os
from dataclasses import dataclass, field
from .state import Board, Segment
LATENT_FILE = "latent.safetensors"
LAST_FRAME_FILE = "last_frame.png"
POSTER_FILE = "poster.jpg"
CLIP_FILE = "clip.mp4"
META_FILE = "meta.json"
@dataclass
class RenderSettings:
    width: int = 832
    height: int = 480
    steps: int = 20
    sampler_name: str = "res_multistep"
    scheduler: str = "simple"
    denoise: float = 1.0
    shift_video: float = 0.0
    shift_audio: float = 0.0
    def digest(self) -> str:
        payload = json.dumps(self.__dict__, sort_keys=True, separators=(",", ":"))
        return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]
@dataclass
class SegmentJob:
    segment: Segment
    index: int
    key: str
    directory: str
    cached: bool = False
    opens_on: int = -1
    external: bool = False
    skipped_reason: str = ""
    take_dir: str = ""
    blocked: bool = False
    chain_from: str = ""
    chain_where: str = ""
    @property
    def will_render(self) -> bool:
        return not self.cached and not self.skipped_reason and not self.external
    @property
    def latent_path(self) -> str:
        return os.path.join(self.directory, LATENT_FILE)
    @property
    def take_latent_path(self) -> str:
        return os.path.join(self.take_dir, LATENT_FILE) if self.take_dir else ""
    @property
    def last_frame_path(self) -> str:
        return os.path.join(self.directory, LAST_FRAME_FILE)
    @property
    def poster_path(self) -> str:
        return os.path.join(self.directory, POSTER_FILE)
    @property
    def clip_path(self) -> str:
        return os.path.join(self.directory, CLIP_FILE)
@dataclass
class RenderPlan:
    jobs: list = field(default_factory=list)
    settings: RenderSettings = field(default_factory=RenderSettings)
    @property
    def to_render(self) -> list:
        return [job for job in self.jobs if job.will_render]
    @property
    def cached(self) -> list:
        return [job for job in self.jobs if job.cached]
    @property
    def skipped(self) -> list:
        return [job for job in self.jobs if job.skipped_reason]
def cache_root(base_dir: str, node_id) -> str:
    safe = "".join(ch for ch in str(node_id) if ch.isalnum() or ch in "-_") or "unknown"
    return os.path.join(base_dir, "vig_h3_cutter", f"node_{safe}")
def is_complete(directory: str) -> bool:
    return os.path.isfile(os.path.join(directory, LATENT_FILE)) and os.path.isfile(
        os.path.join(directory, LAST_FRAME_FILE)
    )
FILM_FROM_RENDER = "render"
FILM_FROM_LATENT = "latent"
FILM_FROM_FILE = "file"
def same_file(one: str, two: str) -> bool:
    if not one or not two:
        return False
    return os.path.normcase(os.path.abspath(one)) == os.path.normcase(
        os.path.abspath(two)
    )
def film_source(clip: str, take_dir: str, clip_path: str, has_render: bool):
    from_cache = os.path.join(take_dir, CLIP_FILE) if take_dir else ""
    if not clip:
        if has_render:
            return FILM_FROM_RENDER, ""
        return (FILM_FROM_LATENT, take_dir) if take_dir else ("", "")
    if has_render and same_file(clip, clip_path):
        return FILM_FROM_RENDER, ""
    if take_dir and same_file(clip, from_cache):
        return FILM_FROM_LATENT, take_dir
    return FILM_FROM_FILE, clip
def plan_run(
    board: Board,
    settings: RenderSettings,
    root: str,
    only: set | None = None,
    force: set | None = None,
    exists=is_complete,
    mode_ids: dict | None = None,
    file_ids: dict | None = None,
) -> RenderPlan:
    only = {int(i) for i in only} if only else None
    force = {int(i) for i in force} if force else set()
    def in_run(seg):
        return (only is None or seg.id in only or seg.id in force) and not (
            seg.locked and seg.id not in force
        )
    def timeline_take(seg):
        take = str(seg.cache_key or "")
        has_material = take and (
            exists(os.path.join(root, take))
            or (seg.clip and os.path.isfile(seg.clip))
        )
        return take if has_material else ""
    def resolve(index, seg, candidate):
        if seg.external or in_run(seg):
            return candidate
        return timeline_take(seg) or candidate
    keys = board.fingerprints(
        settings.digest(), mode_ids, file_ids, unpinned=force, resolve=resolve
    )
    jobs = []
    for index, seg in enumerate(board.segments):
        key = keys.get(seg.id, "")
        directory = os.path.join(root, key)
        external = seg.external
        job = SegmentJob(
            segment=seg,
            index=index,
            key=key,
            directory=directory,
            external=external,
            cached=bool(key) and not external and exists(directory),
            opens_on=index - 1 if seg.takes_from_front and index > 0 else -1,
        )
        forced = seg.id in force
        if job.cached and forced:
            job.cached = False
        if job.cached and not external and not in_run(seg):
            take = timeline_take(seg)
            if take and take != key:
                job.cached = False
        if external:
            pass
        elif seg.locked and not job.cached and not forced:
            job.skipped_reason = (
                f"locked, and the take it keeps ({seg.cache_key}) is not in the cache"
                if seg.cache_key
                else "locked, and it has no take to keep"
            )
        elif only is not None and seg.id not in only and not job.cached:
            job.skipped_reason = "not in this run"
        jobs.append(job)
    carrying = False
    for job in jobs:
        if carrying and job.opens_on >= 0 and not job.segment.locked:
            if job.skipped_reason == "not in this run":
                job.skipped_reason = (
                    f"not in this run — it opens on clip {job.opens_on + 1}, which has "
                    "changed, so this take no longer matches the board"
                )
        carrying = job.will_render or job.skipped_reason.startswith("not in this run")
    for job in jobs:
        if job.cached or job.external or job.blocked:
            continue
        recorded = str(getattr(job.segment, "cache_key", "") or "")
        if recorded and recorded != job.key and exists(os.path.join(root, recorded)):
            job.take_dir = os.path.join(root, recorded)
    for job in jobs:
        if job.cached or job.external or not job.skipped_reason:
            continue
        what, where = film_source(
            job.segment.clip, job.take_dir, job.clip_path, has_render=False
        )
        if what == FILM_FROM_FILE and not os.path.isfile(where):
            what, where = "", ""
        job.chain_from, job.chain_where = what, where
    for job in jobs:
        if job.opens_on < 0 or job.skipped_reason:
            continue
        source = jobs[job.opens_on]
        if (
            not source.cached
            and not source.will_render
            and not source.external
            and not source.chain_from
        ):
            job.skipped_reason = (
                f"clip {source.index + 1} has never been rendered and its timeline "
                f"plays nothing, so there is no frame for clip {job.index + 1} to "
                f"open on -- render clip {source.index + 1} first, or press Run to "
                "render the film"
            )
            job.blocked = True
    return RenderPlan(jobs=jobs, settings=settings)
def write_meta(
    job: SegmentJob,
    opened_on_chain: bool = False,
    trim: int = 0,
    settings: "RenderSettings | None" = None,
    model: str = "",
) -> dict:
    payload = {
        "key": job.key,
        "index": job.index,
        "segment_id": job.segment.id,
        "mode": job.segment.mode,
        "frames": job.segment.frames,
        "seed": job.segment.seed,
        "prompt": job.segment.prompt,
        "opened_on_chain": bool(opened_on_chain),
        "trim": int(trim),
        "settings": dict(settings.__dict__) if settings is not None else None,
        "model": str(model or ""),
    }
    os.makedirs(job.directory, exist_ok=True)
    with open(os.path.join(job.directory, META_FILE), "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    return payload
def read_meta(directory: str) -> dict:
    try:
        with open(os.path.join(directory, META_FILE), encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}
def describe(plan: RenderPlan, board: Board) -> str:
    lines = []
    total = board.total_seconds
    lines.append(
        f"{len(board.segments)} clips, {total:.2f} s total "
        f"({board.total_frames} frames at 24 fps), {plan.settings.width}x{plan.settings.height}."
    )
    rendered = len(plan.to_render)
    cached = len(plan.cached)
    lines.append(f"{rendered} to render, {cached} reused from cache, {len(plan.skipped)} skipped.")
    for job in plan.jobs:
        seg = job.segment
        state = (
            f"footage ({seg.clip_name or seg.source_clip})"
            if job.external
            else "kept, locked"
            if job.cached and seg.locked
            else "cached"
            if job.cached
            else f"skipped ({job.skipped_reason}), its last take joins the film"
            if job.skipped_reason and job.take_dir
            else f"skipped ({job.skipped_reason})"
            if job.skipped_reason
            else "render"
        )
        opens = f", opens on clip {job.opens_on + 1}" if job.opens_on >= 0 else ""
        lines.append(
            f"  clip {job.index + 1}: {seg.mode} {seg.duration:.2f} s "
            f"seed {seg.seed} -- {state}{opens}"
        )
        for warning in seg.warnings:
            lines.append(f"      ! {warning}")
    return "\n".join(lines)
