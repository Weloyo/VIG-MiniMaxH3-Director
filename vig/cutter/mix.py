from __future__ import annotations
from dataclasses import dataclass
@dataclass
class Placement:
    clip_id: int
    start: float
    seconds: float
    source: str
    gain: float = 1.0
    label: str = ""
    @property
    def end(self) -> float:
        return self.start + self.seconds
def placements(audio_clips, film_seconds: float | None = None) -> list:
    out: list = []
    cursor = 0.0
    for clip in audio_clips:
        start = cursor
        seconds = max(0.0, float(getattr(clip, "seconds", 0.0)))
        cursor += seconds
        if getattr(clip, "muted", False) or not getattr(clip, "source", ""):
            continue
        if film_seconds is not None:
            if start >= film_seconds:
                continue
            seconds = min(seconds, film_seconds - start)
        if seconds <= 0:
            continue
        out.append(
            Placement(
                clip_id=int(getattr(clip, "id", 0)),
                start=start,
                seconds=seconds,
                source=str(getattr(clip, "source", "")),
                gain=max(0.0, float(getattr(clip, "gain", 1.0))),
                label=str(getattr(clip, "label", "")),
            )
        )
    return out
def track_seconds(audio_clips) -> float:
    return sum(max(0.0, float(getattr(clip, "seconds", 0.0))) for clip in audio_clips)
def match_channels(block, channels: int):
    have = int(block.shape[0])
    if have == channels:
        return block
    if have == 1:
        return _repeat(block, channels)
    if channels == 1:
        return block.mean(axis=0, keepdims=True)
    if have > channels:
        return block[:channels]
    return _concat_rows([block] + [block[-1:]] * (channels - have))
def fit(block, samples: int):
    have = int(block.shape[-1])
    if have == samples:
        return block
    if have > samples:
        return block[..., :samples]
    return _pad_right(block, samples - have)
def mix(waveform, sample_rate: int, plan, load, headroom: float = 1.0):
    notes: list = []
    if waveform is None or not plan:
        return waveform, notes
    channels = int(waveform.shape[-2])
    total = int(waveform.shape[-1])
    mixed = _copy(waveform)
    for placement in plan:
        start = int(round(placement.start * sample_rate))
        samples = int(round(placement.seconds * sample_rate))
        if start >= total or samples <= 0:
            continue
        samples = min(samples, total - start)
        block = load(placement.source, sample_rate, placement.seconds)
        if block is None:
            notes.append(f"clip {placement.clip_id}: could not read {placement.source!r}")
            continue
        block = fit(match_channels(block, channels), samples)
        if placement.gain != 1.0:
            block = block * placement.gain
        mixed[..., start : start + samples] = mixed[..., start : start + samples] + block
        notes.append(
            f"clip {placement.clip_id}: {placement.label or placement.source} at "
            f"{placement.start:.2f}-{placement.end:.2f} s, gain {placement.gain:.2f}"
        )
    peak = float(abs(mixed).max()) if total else 0.0
    if peak > headroom:
        mixed = mixed * (headroom / peak)
        notes.append(
            f"the mix peaked at {peak:.2f} and was scaled by {headroom / peak:.3f} to fit. "
            "Turn a clip's gain down to keep the rest where it was."
        )
    return mixed, notes
def describe(plan, notes) -> str:
    if not plan and not notes:
        return "Audio track: nothing to mix."
    lines = [f"Audio track: {len(plan)} clip(s) mixed over the film's own sound."]
    lines.extend(f"  {note}" for note in notes)
    return "\n".join(lines)
def _copy(block):
    for name in ("clone", "copy"):
        method = getattr(block, name, None)
        if callable(method):
            return method()
    return block
def _repeat(block, times: int):
    try:
        import numpy
        if isinstance(block, numpy.ndarray):
            return numpy.repeat(block, times, axis=0)
    except ImportError:
        pass
    return block.repeat(times, 1)
def _concat_rows(blocks):
    try:
        import numpy
        if isinstance(blocks[0], numpy.ndarray):
            return numpy.concatenate(blocks, axis=0)
    except ImportError:
        pass
    import torch
    return torch.cat(blocks, dim=0)
def _pad_right(block, count: int):
    try:
        import numpy
        if isinstance(block, numpy.ndarray):
            pad = [(0, 0)] * (block.ndim - 1) + [(0, count)]
            return numpy.pad(block, pad, mode="constant")
    except ImportError:
        pass
    import torch
    return torch.nn.functional.pad(block, (0, count))
