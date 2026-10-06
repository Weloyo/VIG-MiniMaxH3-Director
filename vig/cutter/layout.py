from __future__ import annotations
from dataclasses import replace
from ..timing import frames_to_seconds
from .state import (
    DEFAULT_SEGMENT_SECONDS,
    MAX_SEGMENT_SECONDS,
    MAX_SEGMENTS,
    MIN_SEGMENT_SECONDS,
    Segment,
    snap_seconds,
)
def total_frames(segments) -> int:
    return sum(int(seg.frames) for seg in segments)
def total_seconds(segments) -> float:
    return frames_to_seconds(total_frames(segments))
def requested_seconds(segments) -> int:
    return sum(int(seg.seconds) for seg in segments)
def drag_seam(segments, index: int, delta_seconds: int):
    segments = list(segments)
    if index < 0 or index + 1 >= len(segments):
        return segments
    left, right = segments[index], segments[index + 1]
    pair = int(left.seconds) + int(right.seconds)
    low = max(MIN_SEGMENT_SECONDS, pair - MAX_SEGMENT_SECONDS)
    high = min(MAX_SEGMENT_SECONDS, pair - MIN_SEGMENT_SECONDS)
    if low > high:
        return segments
    wanted = int(left.seconds) + int(delta_seconds)
    new_left = max(low, min(high, wanted))
    segments[index] = replace(left, seconds=new_left)
    segments[index + 1] = replace(right, seconds=pair - new_left)
    return segments
def split_at(segments, segment_id: int, new_id: int | None = None):
    segments = list(segments)
    if len(segments) >= MAX_SEGMENTS:
        return segments
    index = _index_of(segments, segment_id)
    if index < 0:
        return segments
    seg = segments[index]
    if int(seg.seconds) < MIN_SEGMENT_SECONDS * 2:
        return segments
    if getattr(seg, "source_clip", ""):
        return segments
    left_seconds = int(seg.seconds) // 2
    right_seconds = int(seg.seconds) - left_seconds
    if new_id is None:
        new_id = max(int(s.id) for s in segments) + 1
    left = replace(seg, seconds=left_seconds, status="queued", cache_key="")
    right = replace(
        seg,
        id=int(new_id),
        seconds=right_seconds,
        status="queued",
        cache_key="",
        poster="",
        clip="",
        seed=_derive_seed(seg.seed, new_id),
        mode="i2va" if seg.mode in {"t2va", "i2va"} else seg.mode,
    )
    segments[index : index + 1] = [left, right]
    return segments
def merge_at(segments, segment_id: int):
    segments = list(segments)
    index = _index_of(segments, segment_id)
    if index < 0 or index + 1 >= len(segments):
        return segments
    left, right = segments[index], segments[index + 1]
    if getattr(left, "source_clip", "") or getattr(right, "source_clip", ""):
        return segments
    seconds = min(MAX_SEGMENT_SECONDS, int(left.seconds) + int(right.seconds))
    prompt = left.prompt
    if right.prompt.strip() and right.prompt.strip() != left.prompt.strip():
        prompt = "\n\n".join(part for part in (left.prompt.strip(), right.prompt.strip()) if part)
    merged = replace(
        left,
        seconds=seconds,
        prompt=prompt,
        status="queued",
        cache_key="",
        audio=left.audio or right.audio,
        refs=list(left.refs) + [r for r in right.refs if r not in left.refs],
    )
    segments[index : index + 2] = [merged]
    return segments
def add_segment(segments, new_id: int | None = None, seconds: int | None = None, seed: int = 0):
    segments = list(segments)
    if len(segments) >= MAX_SEGMENTS:
        return segments
    if new_id is None:
        new_id = (max((int(s.id) for s in segments), default=0)) + 1
    return segments + [
        Segment(
            id=int(new_id),
            seconds=snap_seconds(DEFAULT_SEGMENT_SECONDS if seconds is None else seconds),
            mode="i2va" if segments else "t2va",
            seed=int(seed),
            status="queued",
        )
    ]
def remove_segment(segments, segment_id: int):
    segments = list(segments)
    if len(segments) <= 1:
        return segments
    index = _index_of(segments, segment_id)
    if index < 0:
        return segments
    del segments[index]
    return segments
def distribute_seconds(target_seconds: float, count: int | None = None):
    seconds = max(0, int(round(float(target_seconds))))
    if seconds <= 0:
        return []
    if count is None:
        count = max(1, -(-seconds // MAX_SEGMENT_SECONDS))
    count = max(1, min(MAX_SEGMENTS, int(count)))
    base = max(MIN_SEGMENT_SECONDS, seconds // count)
    lengths = [min(MAX_SEGMENT_SECONDS, base)] * count
    remainder = seconds - sum(lengths)
    while remainder > 0:
        placed = False
        for index in range(count):
            if remainder <= 0:
                break
            if lengths[index] < MAX_SEGMENT_SECONDS:
                lengths[index] += 1
                remainder -= 1
                placed = True
        if not placed:
            break
    return lengths
def fit_to_target(segments, target_seconds: float):
    segments = list(segments)
    if not segments:
        return segments
    lengths = distribute_seconds(target_seconds, len(segments))
    return [replace(seg, seconds=lengths[i]) for i, seg in enumerate(segments)]
def divide_long(seconds: int) -> list:
    seconds = max(MIN_SEGMENT_SECONDS, int(round(float(seconds))))
    count = max(1, -(-seconds // MAX_SEGMENT_SECONDS))
    return distribute_seconds(seconds, count)
def _index_of(segments, segment_id) -> int:
    for index, seg in enumerate(segments):
        if int(seg.id) == int(segment_id):
            return index
    return -1
def _derive_seed(seed: int, salt: int) -> int:
    return (int(seed) * 1103515245 + int(salt) * 12345 + 7) % 4294967296
