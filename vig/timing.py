from __future__ import annotations
from dataclasses import dataclass
FPS = 24
TRAINED_MIN_FRAMES = 107
TRAINED_MAX_FRAMES = 362
MIN_SHOT_SECONDS = 0.8
def _align_frame_count_local(n: int) -> int:
    while n % 17 != 5:
        n += 1
    return n
def latent_frames(frame_count: int) -> int:
    return 2 if frame_count <= 5 else ((frame_count - 5) // 17) * 5 + 2
def sequence_tokens(width: int, height: int, frame_count: int) -> int:
    if min(width, height, frame_count) <= 0:
        return 0
    return latent_frames(int(frame_count)) * (int(width) // 16) * (int(height) // 16)
CANVAS_STEP = 32
CANVAS_MIN = 32
def snap_canvas(width: int, height: int) -> tuple[int, int]:
    def snap(value) -> int:
        return max(CANVAS_MIN, int(round(float(value) / CANVAS_STEP)) * CANVAS_STEP)
    return snap(width), snap(height)
def canvas_for_ratio(ratio_width: int, ratio_height: int, budget_width: int,
                     budget_height: int) -> tuple[int, int]:
    if min(ratio_width, ratio_height) <= 0:
        return snap_canvas(budget_width, budget_height)
    budget = max(1.0, float(budget_width) * float(budget_height))
    ratio = float(ratio_width) / float(ratio_height)
    height = (budget / ratio) ** 0.5
    return snap_canvas(height * ratio, height)
try:
    from comfy_extras.nodes_minimax_h3 import align_frame_count as _align_upstream
except Exception:
    _align_upstream = None
def align_frame_count(n: int) -> int:
    n = max(5, int(n))
    if _align_upstream is not None:
        return _align_upstream(n)
    return _align_frame_count_local(n)
def seconds_to_frames(seconds: float) -> int:
    return align_frame_count(round(float(seconds) * FPS))
def frames_to_seconds(frames: int) -> float:
    return frames / FPS
def format_timestamp(seconds: float) -> str:
    if seconds < 0:
        raise ValueError(f"negative timestamp: {seconds}")
    total_ms = int(seconds * 1000)
    minutes, rem_ms = divmod(total_ms, 60_000)
    secs, ms = divmod(rem_ms, 1000)
    return f"{minutes:02d}:{secs:02d}.{ms:03d}"
def format_duration(seconds: float) -> str:
    return f"{seconds:.2f}"
@dataclass(frozen=True)
class Shot:
    index: int
    start_seconds: float
    end_seconds: float
    @property
    def duration(self) -> float:
        return self.end_seconds - self.start_seconds
    @property
    def timestamp(self) -> str | None:
        return None if self.index == 1 else format_timestamp(self.start_seconds)
@dataclass(frozen=True)
class Timing:
    frame_count: int
    duration: float
    shots: tuple[Shot, ...]
    requested_seconds: float
    @property
    def shot_count(self) -> int:
        return len(self.shots)
    @property
    def in_trained_range(self) -> bool:
        return TRAINED_MIN_FRAMES <= self.frame_count <= TRAINED_MAX_FRAMES
    def out_of_range_warning(self) -> str:
        return (
            f"WARNING: {self.frame_count} frames ({self.duration:.2f}s) is outside the "
            f"model's trained {TRAINED_MIN_FRAMES / FPS:.2f}-{TRAINED_MAX_FRAMES / FPS:.2f}s "
            "range; output quality is untested there."
        )
    def as_dict(self) -> dict:
        return {
            "frame_count": self.frame_count,
            "fps": FPS,
            "duration_seconds": round(self.duration, 3),
            "duration_ss": format_duration(self.duration),
            "requested_seconds": self.requested_seconds,
            "in_trained_range": self.in_trained_range,
            "shots": [
                {
                    "index": s.index,
                    "timestamp": s.timestamp,
                    "start_seconds": round(s.start_seconds, 3),
                    "end_seconds": round(s.end_seconds, 3),
                    "duration_seconds": round(s.duration, 3),
                }
                for s in self.shots
            ],
        }
def max_shots_for(duration: float) -> int:
    slot_ms = round(MIN_SHOT_SECONDS * 1000)
    return max(1, round(duration * 1000) // slot_ms)
def suggest_shot_count(duration: float, avg_shot_seconds: float | None = None) -> int:
    if not avg_shot_seconds or avg_shot_seconds <= 0:
        avg_shot_seconds = 4.0
    count = max(1, round(duration / avg_shot_seconds))
    return min(count, max_shots_for(duration))
def layout_shots(duration: float, shot_count: int) -> tuple[Shot, ...]:
    if duration <= 0:
        raise ValueError(f"duration must be positive, got {duration}")
    shot_count = max(1, int(shot_count))
    capacity = max_shots_for(duration)
    if shot_count > capacity:
        shot_count = capacity
    edges = [duration * i / shot_count for i in range(shot_count + 1)]
    edges[0] = 0.0
    edges[-1] = duration
    return tuple(
        Shot(index=i + 1, start_seconds=edges[i], end_seconds=edges[i + 1])
        for i in range(shot_count)
    )
def resolve_timing(
    requested_seconds: float,
    shot_count: int | None = None,
    avg_shot_seconds: float | None = None,
) -> Timing:
    frame_count = seconds_to_frames(requested_seconds)
    duration = frames_to_seconds(frame_count)
    if shot_count is None:
        shot_count = suggest_shot_count(duration, avg_shot_seconds)
    return Timing(
        frame_count=frame_count,
        duration=duration,
        shots=layout_shots(duration, shot_count),
        requested_seconds=float(requested_seconds),
    )
