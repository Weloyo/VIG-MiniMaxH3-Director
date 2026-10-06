from __future__ import annotations
from ..vig.cutter import seam
from ..vig.timing import FPS
def _batch_shape(images) -> tuple:
    shape = getattr(images, "shape", None)
    if shape is None:
        raise ValueError(
            "[VIG H3 Cutter] a clip is not an image batch "
            f"({type(images).__name__} has no shape)."
        )
    return tuple(shape)
def _concat(batches):
    if len(batches) == 1:
        return batches[0]
    try:
        import torch
        if torch.is_tensor(batches[0]):
            return torch.cat(batches, dim=0)
    except ImportError:
        pass
    import numpy
    return numpy.concatenate(batches, axis=0)
def _concat_audio(tracks):
    tracks = [track for track in tracks if track is not None]
    if not tracks:
        return None
    if len(tracks) == 1:
        return tracks[0]
    rate = 0
    for track in tracks:
        this = int(track.get("sample_rate") or 0)
        if rate and this and rate != this:
            raise ValueError(
                f"[VIG H3 Cutter] two clips were decoded at different sample rates "
                f"({rate} and {this}). Every audio decode should read the same VAE."
            )
        rate = rate or this
    waves = [track["waveform"] for track in tracks]
    try:
        import torch
        if torch.is_tensor(waves[0]):
            return {"waveform": torch.cat(waves, dim=-1), "sample_rate": rate}
    except ImportError:
        pass
    import numpy
    return {"waveform": numpy.concatenate(waves, axis=-1), "sample_rate": rate}
def track_level(audio):
    wave = (audio or {}).get("waveform")
    samples = int(getattr(wave, "shape", [0])[-1] or 0) if wave is not None else 0
    if not samples:
        return None
    import math
    mean_square = float((wave * wave).mean())
    if mean_square <= 0.0:
        return None
    rms_db = 10.0 * math.log10(mean_square)
    if rms_db < -70.0:
        return None
    return float(abs(wave).max()), rms_db
LEVEL_STEP_DB = 8.0
def levels_report(named_tracks) -> str:
    rows = [(label, track_level(audio)) for label, audio in named_tracks]
    heard = sum(1 for _, level in rows if level is not None)
    if heard < 2:
        return ""
    lines = ["Sound at the joins:"]
    for label, level in rows:
        if level is None:
            lines.append(f"  {label}: silence")
        else:
            peak, rms_db = level
            lines.append(f"  {label}: {rms_db:.1f} dBFS rms, peak {peak:.3f}")
    for (label_a, level_a), (label_b, level_b) in zip(rows, rows[1:]):
        if level_a is None or level_b is None:
            continue
        step = abs(level_a[1] - level_b[1])
        if step >= LEVEL_STEP_DB:
            lines.append(
                f"WARNING: the sound level steps {step:.1f} dB at the cut from "
                f"{label_a} ({level_a[1]:.1f} dBFS) to {label_b} ({level_b[1]:.1f} dBFS) "
                f"-- the join will be heard. Even the gain out with the clips' audio "
                f"toggles or an audio-track bed, or re-take the quiet clip."
            )
    return "\n".join(lines)
def _trim_repeat(images, audio):
    shape = _batch_shape(images)
    if len(shape) != 4 or int(shape[0]) <= 1:
        return images, audio
    images = images[1:]
    rate = int((audio or {}).get("sample_rate") or 0)
    samples = round(rate / FPS)
    if samples:
        audio = {"waveform": audio["waveform"][..., samples:], "sample_rate": rate}
    return images, audio
def match_seam_luma(previous_images, images, position: int):
    total = int(_batch_shape(images)[0])
    k = min(seam.MEASURE_FRAMES, int(_batch_shape(previous_images)[0]), total)
    if k <= 0:
        return images, ""
    delta = float(images[:k].mean()) - float(previous_images[-k:].mean())
    fix = seam.correction(delta)
    if fix is None:
        if abs(delta) > seam.MAX_STEP:
            return images, (
                f"the seam into clip {position} steps {delta * 100:+.1f}% of the "
                "luma range, which is content rather than grade, so it was left alone"
            )
        return images, ""
    n = min(seam.MATCH_FRAMES, total)
    head = [
        (images[i:i + 1] - fix * seam.weight(i)).clip(0.0, 1.0) for i in range(n)
    ]
    if total > n:
        head.append(images[n:])
    return _concat(head), (
        f"the seam into clip {position} stepped {delta * 100:+.1f}% of the luma "
        f"range; its head was eased onto the previous clip's level over {n} frames"
    )
def join_all(clips):
    parts = []
    notes = []
    for index, clip in enumerate(clips):
        images, audio, drop_repeat, *rest = clip
        continues = bool(rest[0]) if rest else False
        if index > 0 and drop_repeat:
            images, audio = _trim_repeat(images, audio)
        if index > 0 and continues:
            images, note = match_seam_luma(parts[-1][0], images, index + 1)
            if note:
                notes.append(note)
        parts.append((images, audio))
    images = _concat([images for images, _ in parts])
    audio = _concat_audio([audio for _, audio in parts])
    return images, audio, int(_batch_shape(images)[0]), notes
def join_clips(images_a, audio_a, images_b, audio_b, drop_repeated_frame: bool = True):
    images, audio, frames, _ = join_all(
        [(images_a, audio_a, False), (images_b, audio_b, bool(drop_repeated_frame))]
    )
    return images, audio, frames
