from __future__ import annotations
import re
FRAME_PER_TOKEN = (1, 4, 4, 4, 4)
FPS = 24
AUDIO_HZ = 40.0
FRAME_RESCALE = 5.0 / 3.0
RUN_GRID = (124, 107, 90, 73, 56, 39, 22, 5, 1)
CONTEXT_CHOICES = (5, 22, 39, 56)
DEFAULT_CONTEXT_FRAMES = 22
DEFAULT_CONTEXT_AUDIO_FRAMES = 24
_LAYOUT_SUPPORT: bool | None = None
def layout_supports_runs() -> bool:
    global _LAYOUT_SUPPORT
    if _LAYOUT_SUPPORT is not None:
        return _LAYOUT_SUPPORT
    try:
        import inspect
        import torch
        from comfy.ldm.minimax.model import PackedLayout
        if "frame_count" in inspect.signature(PackedLayout.__init__).parameters:
            _LAYOUT_SUPPORT = False
            return _LAYOUT_SUPPORT
        block = torch.zeros(1, 24, 1, 2, 2)
        PackedLayout(
            8, 7, 2, 2, 40,
            keyframes=[
                {"resolved_frame_index": 0, "latent": block},
                {"resolved_frame_index": 1, "latent": block},
                {"resolved_frame_index": 5, "latent": block},
                {"resolved_frame_index": -1.8, "audio_latent": torch.zeros(1, 32, 2, 4)},
            ],
            refs=None,
        )
        _LAYOUT_SUPPORT = True
    except Exception:
        _LAYOUT_SUPPORT = False
    return _LAYOUT_SUPPORT
def pixel_frames(latent_t: int) -> int:
    return sum(FRAME_PER_TOKEN[k % 5] for k in range(int(latent_t)))
def step_offsets(latent_t: int) -> list[int]:
    out: list[int] = []
    acc = 0
    for k in range(int(latent_t)):
        out.append(acc)
        acc += FRAME_PER_TOKEN[k % 5]
    return out
def steps_for_frames(n: int) -> int | None:
    k = 0
    covered = 0
    while covered < n:
        covered += FRAME_PER_TOKEN[k % 5]
        k += 1
    return k if covered == n else None
def snap_to_grid(n: int) -> int:
    for point in RUN_GRID:
        if point <= n:
            return point
    return 1
def _streams(latent):
    samples = latent["samples"]
    if hasattr(samples, "unbind"):
        parts = list(samples.unbind())
    elif isinstance(samples, (tuple, list)):
        parts = list(samples)
    else:
        raise ValueError(
            "motion context: expected a MiniMax H3 AV latent (a nested video/audio "
            f"pair), got {type(samples)!r}"
        )
    if not parts:
        raise ValueError("motion context: the AV latent contains no streams")
    return parts
def video_stream(latent):
    video = _streams(latent)[0]
    if video.ndim == 4:
        video = video.unsqueeze(0)
    if video.ndim != 5:
        raise ValueError(
            f"motion context: expected a video latent [B,C,T,H,W], got {tuple(video.shape)}"
        )
    return video
def latent_geometry(latent) -> tuple[int, int, int]:
    video = video_stream(latent)
    return int(video.shape[4]) * 16, int(video.shape[3]) * 16, pixel_frames(int(video.shape[2]))
def cut_points(latent) -> list[int]:
    total = int(video_stream(latent).shape[2])
    return [pixel_frames(k) for k in range(2, total + 1) if k % 5 == 2]
def video_tail(latent, frames: int, at_frame: int | None = None):
    video = video_stream(latent)
    total = int(video.shape[2])
    if at_frame is not None:
        end_steps = steps_for_frames(int(at_frame))
        if end_steps is None:
            raise ValueError(
                f"motion context: frame {at_frame} is not the end of a latent step, so a "
                "run cannot end there"
            )
        total = end_steps
    steps = steps_for_frames(frames)
    if steps is None:
        raise ValueError(
            f"motion context: a {frames} frame window is not a whole number of latent "
            "steps, so it cannot be sliced out of a latent"
        )
    if steps > total:
        raise ValueError(
            f"motion context: asked for {steps} latent steps, the clip has {total}"
        )
    start = total - steps
    if start % 5 != 0:
        raise RuntimeError(
            f"motion context: the {steps} step tail of a {total} step latent starts at "
            f"cycle position {start % 5}, not 0, so its frame spans would not match the "
            "positions written for them"
        )
    covered = pixel_frames(steps)
    if covered != frames:
        raise RuntimeError(
            f"motion context: {steps} steps cover {covered} frames, expected {frames}"
        )
    blocks = [video[:1, :, start + k : start + k + 1].clone() for k in range(steps)]
    return blocks, step_offsets(steps), covered
def arrival_points(latent_t: int) -> list[int]:
    return [17 * m for m in range(int(latent_t) // 5 + 1) if 17 * m + 5 <= pixel_frames(latent_t)]
def video_head(latent, frames: int, at_frame: int | None = None):
    video = video_stream(latent)
    steps = steps_for_frames(frames)
    if steps is None:
        raise ValueError(
            f"motion context: a {frames} frame window is not a whole number of latent "
            "steps, so it cannot be sliced out of a latent"
        )
    total = int(video.shape[2])
    start = 0
    if at_frame:
        start = steps_for_frames(int(at_frame))
        if start is None or start % 5 != 0:
            raise ValueError(
                f"motion context: a run cannot begin at frame {at_frame} -- a window is "
                "laid out from cycle position 0, and only every fifth latent step (frame "
                "17m) is one"
            )
    if start + steps > total:
        raise ValueError(
            f"motion context: asked for {steps} latent steps from step {start}, the clip "
            f"has {total}"
        )
    covered = pixel_frames(steps)
    if covered != frames:
        raise RuntimeError(
            f"motion context: {steps} steps cover {covered} frames, expected {frames}"
        )
    blocks = [video[:1, :, start + k : start + k + 1].clone() for k in range(steps)]
    return blocks, step_offsets(steps), covered
def audio_head(latent, frames: int, at_frame: int | None = None):
    parts = _streams(latent)
    if len(parts) < 2:
        raise ValueError(
            "motion context: this clip's latent has no audio stream, so there is no "
            "sound to carry across the cut"
        )
    audio = parts[1]
    if audio.ndim == 3:
        audio = audio.unsqueeze(0)
    if audio.ndim != 4:
        raise ValueError(
            f"motion context: expected an audio latent [B,C,2,T], got {tuple(audio.shape)}"
        )
    total = int(audio.shape[-1])
    begin = int(round(FRAME_RESCALE * int(at_frame or 0)))
    begin = max(0, min(begin, max(0, total - 1)))
    slip = (begin - FRAME_RESCALE * float(at_frame or 0)) / FRAME_RESCALE
    steps = max(1, min(int(round(frames / float(FPS) * AUDIO_HZ)), total - begin))
    return audio[:1, ..., begin : begin + steps].clone(), steps, float(slip)
def audio_tail(latent, frames: int, at_frame: int | None = None):
    parts = _streams(latent)
    if len(parts) < 2:
        raise ValueError(
            "motion context: this clip's latent has no audio stream, so there is no "
            "sound to carry across the cut"
        )
    video, audio = parts[0], parts[1]
    if video.ndim == 4:
        video = video.unsqueeze(0)
    if audio.ndim == 3:
        audio = audio.unsqueeze(0)
    if audio.ndim != 4:
        raise ValueError(
            f"motion context: expected an audio latent [B,C,2,T], got {tuple(audio.shape)}"
        )
    total = int(audio.shape[-1])
    overhang = total - FRAME_RESCALE * pixel_frames(int(video.shape[2]))
    if at_frame is not None:
        total = max(1, min(total, int(round(FRAME_RESCALE * int(at_frame)))))
        overhang = 0.0
    if not -0.5 < overhang < 0.5:
        overhang = 0.0
    steps = int(round(frames / float(FPS) * AUDIO_HZ))
    steps = max(1, min(steps, total))
    return audio[:1, ..., total - steps : total].clone(), steps, float(overhang)
def audio_index(span: int, steps: int, overhang: float) -> float:
    end_frame = float(span) + overhang / FRAME_RESCALE
    end_frame = round(FRAME_RESCALE * end_frame) / FRAME_RESCALE
    return end_frame - steps / FRAME_RESCALE
class Context:
    __slots__ = ("latent", "frames", "audio_frames", "at_frame", "available",
                 "source_index", "backward")
    def __init__(self, latent, frames, audio_frames, at_frame, available, source_index,
                 backward=False):
        self.latent = latent
        self.frames = int(frames)
        self.audio_frames = int(audio_frames)
        self.at_frame = int(at_frame) if at_frame else None
        self.available = int(available)
        self.source_index = int(source_index)
        self.backward = bool(backward)
def pin(conditioning, latent, context_latent, frames: int, audio_frames: int,
        at_frame: int | None = None, notes=None, backward: bool = False):
    notes = notes if notes is not None else []
    target = video_stream(latent)
    frame_count = pixel_frames(int(target.shape[2]))
    width, height = int(target.shape[4]) * 16, int(target.shape[3]) * 16
    src_w, src_h, clip_frames = latent_geometry(context_latent)
    available = (
        max(0, clip_frames - int(at_frame or 0))
        if backward
        else (int(at_frame) if at_frame else clip_frames)
    )
    if (src_w, src_h) != (width, height):
        raise ValueError(
            f"motion context: the clip being continued is {src_w}x{src_h} and this one "
            f"is {width}x{height}. A latent cannot be resized, so either render them at "
            "one size or start a fresh chain here."
        )
    if int(video_stream(context_latent).shape[1]) != int(target.shape[1]):
        raise ValueError("motion context: the two clips came from different models")
    wanted = min(int(frames), available)
    run = snap_to_grid(wanted)
    if run != int(frames):
        notes.append(
            f"NOTE: motion context pinned {run} frames rather than {frames} -- only "
            "whole latent steps can be sliced out of a clip (1, 5, 22, 39, 56)."
        )
    if run >= frame_count:
        raise ValueError(
            f"motion context: pinning {run} frames into a {frame_count} frame clip leaves "
            "nothing to generate. Carry a shorter run, or make the clip longer."
        )
    if backward:
        blocks, offsets, span = video_head(context_latent, run, at_frame=at_frame)
    else:
        blocks, offsets, span = video_tail(context_latent, run, at_frame=at_frame)
    base = (frame_count - span) if backward else 0
    keyframes = [
        {"resolved_frame_index": base + offset, "latent": block}
        for offset, block in zip(offsets, blocks)
    ]
    audio_steps = 0
    audio_kf = None
    if audio_frames > 0:
        if backward:
            head, audio_steps, slip = audio_head(
                context_latent, int(audio_frames), at_frame=at_frame
            )
            audio_kf = {
                "resolved_frame_index": round(FRAME_RESCALE * (base + slip)) / FRAME_RESCALE,
                "audio_latent": head,
            }
        else:
            tail, audio_steps, overhang = audio_tail(
                context_latent, int(audio_frames), at_frame=at_frame
            )
            audio_kf = {
                "resolved_frame_index": audio_index(span, audio_steps, overhang),
                "audio_latent": tail,
            }
    out = []
    dropped = 0
    for embedding, extra in conditioning:
        carried = extra.copy()
        prior = carried.get("minimax_keyframes") or []
        kept = []
        for keyframe in prior:
            inside = (
                float(keyframe.get("resolved_frame_index", 0)) >= base
                if backward
                else float(keyframe.get("resolved_frame_index", 0)) < span
            )
            if inside:
                dropped += 1
                continue
            kept.append(dict(keyframe))
        carried["minimax_keyframes"] = kept + keyframes + ([audio_kf] if audio_kf else [])
        out.append([embedding, carried])
    if dropped:
        notes.append(
            f"NOTE: the {'closing' if backward else 'opening'} frame anchor was dropped "
            f"-- the {span} pinned frames already decide how this clip "
            f"{'ends' if backward else 'opens'}."
        )
    return out, span
_AT_TIME_RE = re.compile(r"(At\s+)(\d{2}):(\d{2})\.(\d{3})")
def shift_timecodes(prompt: str, frames: int) -> tuple[str, int]:
    if frames <= 0 or not prompt:
        return prompt, 0
    offset = frames / float(FPS)
    moved = 0
    def move(match: "re.Match") -> str:
        nonlocal moved
        moved += 1
        seconds = int(match.group(2)) * 60 + int(match.group(3)) + int(match.group(4)) / 1000.0
        total_ms = int((seconds + offset) * 1000)
        minutes, rem = divmod(total_ms, 60_000)
        secs, ms = divmod(rem, 1000)
        return f"{match.group(1)}{minutes:02d}:{secs:02d}.{ms:03d}"
    return _AT_TIME_RE.sub(move, prompt), moved
_MARK_RE = re.compile(r"(\d+(?:\.\d+)?)-second mark")
_I2VA_HEAD = "For the target video, at 0.00 seconds"
_ALIGN_HEAD = "How the reference pictures align"
def realign_instruction(prompt: str, frames: int) -> tuple[str, str]:
    if frames <= 0 or not prompt:
        return prompt, ""
    head, sep, rest = prompt.partition("\n")
    line = head.strip()
    offset = frames / float(FPS)
    def shift(match: "re.Match") -> str:
        moved = float(match.group(1)) + offset
        return f"{round(moved * FPS) / FPS:.2f}-second mark"
    if line.startswith(_I2VA_HEAD):
        return rest.lstrip("\n"), "the opening picture's line was removed"
    if not line.startswith(_ALIGN_HEAD):
        return prompt, ""
    lead, dash, tail = line.partition("\u2014")
    if not dash:
        return prompt, ""
    clauses = [c.strip() for c in tail.split(";") if c.strip()]
    kept = [c for c in clauses if "0.00-second mark" not in c]
    dropped = len(clauses) - len(kept)
    if not kept:
        return rest.lstrip("\n"), "the opening picture's line was removed"
    body = "; ".join(_MARK_RE.sub(shift, c) for c in kept).rstrip(".") + "."
    what = f"the closing mark moved {offset:.2f} s later"
    if dropped:
        what = f"the opening picture's clause was removed and {what}"
    return f"{lead.strip()} {dash} {body}{sep}{rest}", what
def trim_run(images, audio, trim: int, backward: bool = False):
    if trim <= 0 or images is None:
        return images, audio
    if not backward:
        return trim_streams(images, audio, trim)
    return cut_streams(images, audio, max(0, len(images) - trim))
def cut_streams(images, audio, keep: int):
    if keep <= 0 or images is None or len(images) <= keep:
        return images, audio
    cut_images = images[:keep]
    cut_audio = audio
    if audio is not None and isinstance(audio, dict) and audio.get("waveform") is not None:
        waveform = audio["waveform"]
        rate = int(audio.get("sample_rate") or 0)
        if rate > 0:
            samples = int(round(keep / float(FPS) * rate))
            if 0 < samples < int(waveform.shape[-1]):
                cut_audio = {**audio, "waveform": waveform[..., :samples]}
    return cut_images, cut_audio
def trim_streams(images, audio, trim: int):
    if trim <= 0:
        return images, audio
    cut_images = images[trim:] if images is not None and len(images) > trim else images
    cut_audio = audio
    if audio is not None and isinstance(audio, dict) and audio.get("waveform") is not None:
        waveform = audio["waveform"]
        rate = int(audio.get("sample_rate") or 0)
        if rate > 0:
            samples = int(round(trim / float(FPS) * rate))
            if 0 < samples < int(waveform.shape[-1]):
                cut_audio = {**audio, "waveform": waveform[..., samples:]}
    return cut_images, cut_audio
