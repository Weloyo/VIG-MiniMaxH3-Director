from __future__ import annotations
import json
import os
import re
import shutil
import time
from ..vig import h3_spec as spec
from ..vig.cutter import motion
from ..vig.cutter import project as project_folder
from ..vig.cutter import mix as mixer
from ..vig.cutter.render import (
    SegmentJob,
    FILM_FROM_FILE,
    FILM_FROM_LATENT,
    FILM_FROM_RENDER,
    LATENT_FILE,
    RenderSettings,
    describe,
    cache_root,
    film_source,
    is_complete,
    plan_run,
    read_meta,
    same_file,
    write_meta,
)
from ..vig.cutter.state import MAX_SEGMENT_FRAMES, TINY_VAE_AUTO, Board
from ..vig.timing import FPS, TRAINED_MIN_FRAMES, sequence_tokens
from ..vig import director as _director
CATEGORY = "VIG/MiniMax H3"
_PHASES: dict = {}
PROGRESS_EVENT = "vig.h3.cutter.progress"
def _native():
    try:
        from comfy_extras import nodes_minimax_h3 as h3
    except ImportError as exc:
        raise RuntimeError(
            "ComfyUI's MiniMax H3 nodes are unavailable. They ship with ComfyUI 0.32.0 "
            "and newer; this extension delegates to them rather than duplicating them."
        ) from exc
    return h3
def _sampler_options():
    try:
        import comfy.samplers
        return list(comfy.samplers.SAMPLER_NAMES)
    except Exception:
        return ["res_multistep", "euler", "dpmpp_2m"]
def _scheduler_options():
    try:
        import comfy.samplers
        return list(comfy.samplers.SCHEDULER_NAMES)
    except Exception:
        return ["simple", "normal", "beta"]
def _output_directory() -> str:
    try:
        import folder_paths
        return folder_paths.get_output_directory()
    except Exception:
        return os.path.join(os.getcwd(), "output")
def _send(event: str, payload: dict) -> None:
    try:
        from server import PromptServer
        instance = getattr(PromptServer, "instance", None)
        if instance is not None:
            instance.send_sync(event, payload)
    except Exception:
        pass
def _frames_are_consumed(prompt_graph, node_id) -> bool:
    if not isinstance(prompt_graph, dict):
        return True
    me = str(node_id)
    for node in prompt_graph.values():
        inputs = node.get("inputs") if isinstance(node, dict) else None
        if not isinstance(inputs, dict):
            continue
        for value in inputs.values():
            if (
                isinstance(value, list)
                and len(value) == 2
                and str(value[0]) == me
                and value[1] in (0, 1, 2)
            ):
                return True
    return False
def _apply_storyboard(state, storyboard):
    if not isinstance(storyboard, dict) or not storyboard.get("beats"):
        return state, ""
    from ..vig import storyboard as storyboard_plan
    plan = storyboard_plan.Storyboard.read(storyboard)
    incoming = str(storyboard.get("id") or "") or plan.fingerprint()
    if incoming and incoming == state.storyboard_id:
        return state, (
            f"NOTE: the storyboard on the wire ({incoming}) is the one this board was "
            "laid out from, so the timeline is left exactly as it is. Change the film's "
            "script to plan a new one."
        )
    laid = storyboard_plan.to_board(plan, state)
    def shot(seg):
        return bool(seg.clip or seg.source_clip) or bool(seg.locked)
    kept = [i for i, seg in enumerate(state.segments) if shot(seg)]
    if kept:
        if len(laid.segments) != len(state.segments):
            return state, (
                f"WARNING: storyboard {incoming} has {len(laid.segments)} clip(s) and this "
                f"board has {len(state.segments)}, with clip(s) "
                f"{_clip_ranges([i + 1 for i in kept])} already shot -- a plan with clips "
                "added or removed cannot be laid over a shoot in progress without moving "
                "beats onto the wrong clips, so the timeline is left exactly as it is. "
                "Keep the clip count, or unplug the storyboard to start over."
            )
        merged = []
        for old, new in zip(state.segments, laid.segments):
            if shot(old):
                merged.append(old)
            else:
                new.id = old.id
                merged.append(new)
        laid.segments = merged
        laid.selected_id = state.selected_id
        laid.normalise()
        fresh = [i + 1 for i in range(len(merged)) if i not in kept]
        return laid, (
            f"NOTE: storyboard {laid.storyboard_id} was laid over a shoot in progress: "
            f"clip(s) {_clip_ranges([i + 1 for i in kept])} are shot (or locked) and keep "
            "their takes, prompts and settings; "
            + (f"clip(s) {_clip_ranges(fresh)} take the new storyboard's beats."
               if fresh else "no clip was left to update.")
        )
    written = sum(1 for beat in plan.beats if beat.prompt.strip())
    unwritten = len(plan.beats) - written
    note = (
        f"NOTE: the board was laid out from storyboard {laid.storyboard_id} -- "
        f"{len(plan.beats)} clip(s), {written} with a prompt already written"
    )
    if unwritten:
        note += (
            f", {unwritten} without one. Those are queued with their scripts; "
            "Process with agent in the console finishes them"
        )
    return laid, note + "."
def _encode_footage_tail(seg, loaded, models, notes: list, index: int, external: bool = True,
                         reason: str = ""):
    import comfy.nested_tensor
    import torch
    images, audio = loaded
    total = int(images.shape[0])
    cut = int(getattr(seg, "context_at", 0) or 0) or total
    cut = max(1, min(cut, total))
    wanted = int(getattr(seg, "context_frames", 0) or 0)
    grid = [g for g in sorted(motion.RUN_GRID) if g >= 5]
    window = next((g for g in grid if g >= wanted and g <= cut), 0)
    if not window:
        window = max((g for g in grid if g <= cut), default=0)
    if not window:
        notes.append(
            f"WARNING: clip {index + 1} continues loaded footage, but only {cut} frames of "
            "it sit before the cut -- too few to encode even the shortest run (5 frames). "
            "It opens on the last frame instead."
        )
        return None
    audio_frames = int(getattr(seg, "context_audio", 0) or 0)
    try:
        video = models["vae"].encode(images[cut - window : cut])
    except Exception as exc:
        notes.append(
            f"WARNING: clip {index + 1} could not encode the footage in front of it "
            f"({exc}); it opens on the last frame instead."
        )
        return None
    audio_latent = None
    audio_vae = models.get("audio_vae")
    if audio_frames > 0 and audio is not None and audio_vae is not None:
        try:
            import torchaudio
            rate = int(audio["sample_rate"])
            span = max(window, audio_frames)
            end = min(int(audio["waveform"].shape[-1]), int(round(cut / FPS * rate)))
            start = max(0, end - int(round(span / FPS * rate)))
            waveform = audio["waveform"][:1, ..., start:end]
            vae_rate = int(getattr(audio_vae, "audio_sample_rate", 32000))
            if rate != vae_rate:
                waveform = torchaudio.functional.resample(waveform, rate, vae_rate)
            audio_latent = audio_vae.encode(waveform.movedim(1, -1))
        except Exception as exc:
            notes.append(
                f"NOTE: clip {index + 1} carries the picture of the loaded clip in front of "
                f"it but not its sound ({exc})."
            )
            audio_latent = None
    if audio_latent is None:
        if audio_frames > 0:
            notes.append(
                f"NOTE: clip {index + 1} continues loaded footage that has no sound to "
                "carry, so only the movement crosses the cut."
            )
        audio_latent = torch.zeros(
            (int(video.shape[0]), 32, 2, 1), dtype=video.dtype, device=video.device
        )
        audio_frames = 0
    why = reason or (
        "A file has no latent of its own"
        if external
        else "The cut falls between latent steps, which a latent cannot be sliced at"
    )
    notes.append(
        f"NOTE: clip {index + 1} carries {window} frames encoded from pixels rather than "
        f"sliced from a latent. {why}, so this run is a VAE round trip rather than the "
        "clip itself."
    )
    return (
        {"samples": comfy.nested_tensor.NestedTensor((video, audio_latent))},
        window,
        audio_frames,
    )
def _encode_footage_head(seg, loaded, models, notes: list, index: int):
    import torch
    images, audio = loaded
    total = int(images.shape[0])
    arrive = max(0, min(int(getattr(seg, "tail_at", 0) or 0), max(0, total - 5)))
    room = total - arrive
    wanted = int(getattr(seg, "tail_frames", 0) or 0)
    grid = [g for g in sorted(motion.RUN_GRID) if g >= 5]
    window = next((g for g in grid if g >= wanted and g <= room), 0)
    if not window:
        window = max((g for g in grid if g <= room), default=0)
    if not window:
        notes.append(
            f"WARNING: clip {index + 1} is built to arrive at frame {arrive} of clip "
            f"{index + 2}, which leaves only {room} frames -- too few to encode even the "
            "shortest run (5 frames). It renders without one."
        )
        return None
    audio_frames = int(getattr(seg, "tail_audio", 0) or 0)
    try:
        video = models["vae"].encode(images[arrive : arrive + window])
    except Exception as exc:
        notes.append(
            f"WARNING: clip {index + 1} could not encode the footage it arrives at "
            f"({exc}); it renders without a pinned run."
        )
        return None
    audio_latent = None
    audio_vae = models.get("audio_vae")
    if audio_frames > 0 and audio is not None and audio_vae is not None:
        try:
            import torchaudio
            rate = int(audio["sample_rate"])
            span = max(window, audio_frames)
            start = max(0, int(round(arrive / FPS * rate)))
            end = min(
                int(audio["waveform"].shape[-1]), start + int(round(span / FPS * rate))
            )
            waveform = audio["waveform"][:1, ..., start:end]
            vae_rate = int(getattr(audio_vae, "audio_sample_rate", 32000))
            if rate != vae_rate:
                waveform = torchaudio.functional.resample(waveform, rate, vae_rate)
            audio_latent = audio_vae.encode(waveform.movedim(1, -1))
        except Exception as exc:
            notes.append(
                f"NOTE: clip {index + 1} could not encode the sound where it arrives "
                f"({exc}); the run carries picture only."
            )
            audio_latent = None
    if audio_latent is None:
        audio_latent = torch.zeros(
            (int(video.shape[0]), 32, 2, 1), dtype=video.dtype, device=video.device
        )
        audio_frames = 0
    import comfy.nested_tensor
    notes.append(
        f"NOTE: clip {index + 1} arrives at {window} frames encoded from the file's "
        "pixels rather than sliced from a latent -- a file has no latent of its own, "
        "so this run is a VAE round trip rather than the clip itself."
    )
    return (
        {"samples": comfy.nested_tensor.NestedTensor((video, audio_latent))},
        window,
        audio_frames,
    )
def _decode_anchor(latent, models, notes: list, index: int, ahead: int):
    try:
        images = _decode_video(models["vae"], latent)
    except Exception as exc:
        notes.append(
            f"WARNING: clip {index + 1} arrives between two latent steps of clip "
            f"{ahead + 1}, which needs that clip decoded -- and it would not decode "
            f"({exc}). It renders without a pinned run."
        )
        return None
    audio = None
    try:
        audio = _decode_audio(models.get("audio_vae"), latent)
    except Exception as exc:
        notes.append(
            f"NOTE: clip {index + 1} could not decode the sound at the point it arrives "
            f"({exc}); the run carries picture only."
        )
    notes.append(
        f"NOTE: clip {index + 1} arrives between two of clip {ahead + 1}'s latent steps, "
        "so its run is decoded and re-encoded rather than sliced -- a VAE pass each way. "
        "Dropping the arrival on a notch avoids it."
    )
    return images, audio
def _tail_context(job, run, seg, notes: list, loaded_av=None, models=None,
                  settings=None, decoded_rate=0):
    if not getattr(seg, "carried_tail", 0):
        return None
    ahead = job.index + 1
    if ahead >= len(run.jobs):
        notes.append(
            f"WARNING: clip {job.index + 1} is built to arrive at the clip after it, but "
            "it is the last clip on the board. It renders without a pinned run."
        )
        return None
    if not motion.layout_supports_runs():
        notes.append(
            f"WARNING: clip {job.index + 1} is built to arrive at clip {ahead + 1} with a "
            "pinned run, but this ComfyUI's H3 layout takes a conditioning block only at "
            "the first or last frame, so a run cannot be placed on the timeline. It "
            "renders without one. Carrying motion needs ComfyUI 0.33.5 or newer."
        )
        return None
    anchor = run.jobs[ahead]
    audio_frames = int(getattr(seg, "tail_audio", 0) or 0)
    if anchor.external:
        frames = loaded_av
        if frames is None and settings is not None:
            frames = _load_external_clip(anchor.segment, settings, decoded_rate, notes)
        if frames is None or models is None:
            notes.append(
                f"WARNING: clip {job.index + 1} arrives at loaded footage, but that file "
                "could not be read this run; it renders without a pinned run."
            )
            return None
        encoded = _encode_footage_head(seg, frames, models, notes, job.index)
        if encoded is None:
            return None
        context_latent, available, audio_frames = encoded
        at_frame = 0
    else:
        latent_from = "" if anchor.skipped_reason else anchor.latent_path
        if not os.path.isfile(latent_from) and anchor.chain_from == FILM_FROM_LATENT:
            latent_from = os.path.join(anchor.chain_where, LATENT_FILE)
            notes.append(
                f"NOTE: clip {job.index + 1} arrives at the take clip {ahead + 1}'s "
                "timeline plays -- that clip has moved since its last render, and this "
                "run does not re-render it."
            )
        if not os.path.isfile(latent_from):
            if (
                anchor.chain_from == FILM_FROM_FILE
                and models is not None
                and settings is not None
            ):
                try:
                    images, audio, _opened = _timeline_footage(
                        anchor.segment, anchor.chain_from, anchor.chain_where,
                        models, settings, f"clip {ahead + 1}", notes, lambda: False,
                    )
                except Exception as exc:
                    notes.append(
                        f"WARNING: clip {job.index + 1} is built to arrive at clip "
                        f"{ahead + 1}, and the take its timeline plays could not be "
                        f"read ({exc}). It renders without a pinned run."
                    )
                    return None
                encoded = _encode_footage_head(seg, (images, audio), models, notes, job.index)
                if encoded is None:
                    return None
                context_latent, available, audio_frames = encoded
                at_frame = 0
                return motion.Context(
                    latent=context_latent,
                    frames=int(seg.tail_frames),
                    audio_frames=audio_frames,
                    at_frame=at_frame,
                    available=available,
                    source_index=ahead,
                    backward=True,
                )
            notes.append(
                f"WARNING: clip {job.index + 1} is built to arrive at clip {ahead + 1}, but "
                f"that clip's latent is not in the cache -- render clip {ahead + 1} first, "
                "then this one. It renders without a pinned run for now."
            )
            return None
        try:
            context_latent = _load_latent(latent_from)
            _, _, available = motion.latent_geometry(context_latent)
        except Exception as exc:
            notes.append(
                f"WARNING: clip {job.index + 1} could not read clip {ahead + 1}'s latent "
                f"({exc}); it renders without a pinned run."
            )
            return None
        at_frame = max(0, min(int(getattr(seg, "tail_at", 0) or 0), max(0, available - 5)))
        steps = motion.steps_for_frames(int(available)) or 0
        if at_frame and at_frame not in set(motion.arrival_points(steps)):
            if models is None:
                notes.append(
                    f"WARNING: clip {job.index + 1} arrives at frame {at_frame} of clip "
                    f"{ahead + 1}, which is between two latent steps -- serving that needs "
                    "the VAE, and no models were loaded. It renders without a pinned run."
                )
                return None
            decoded = _decode_anchor(context_latent, models, notes, job.index, ahead)
            if decoded is None:
                return None
            encoded = _encode_footage_head(seg, decoded, models, notes, job.index)
            if encoded is None:
                return None
            context_latent, available, audio_frames = encoded
            at_frame = 0
        else:
            available = max(0, available - at_frame)
    return motion.Context(
        latent=context_latent,
        frames=int(seg.tail_frames),
        audio_frames=audio_frames,
        at_frame=at_frame,
        available=available,
        source_index=ahead,
        backward=True,
    )
def _prompt_for_run(prompt: str, trim: int, index: int, notes: list) -> str:
    if not trim:
        return prompt
    prompt, moved = motion.shift_timecodes(prompt, trim)
    if moved:
        notes.append(
            f"NOTE: clip {index + 1} carries a {trim} frame head, so its "
            f"{moved} cut time(s) were moved {trim / motion.FPS:.2f} s later for "
            "the model; they land where they were written in the delivered clip."
        )
    prompt, realigned = motion.realign_instruction(prompt, trim)
    if realigned:
        notes.append(
            f"NOTE: clip {index + 1} opens on the carried run, so its "
            f"picture-alignment line was corrected -- {realigned}. The run "
            "occupies frame 0, and the anchor a first-frame mode would have "
            "opened on is dropped before sampling."
        )
    return prompt
def _motion_context(job, run, seg, notes: list, loaded_av=None, models=None):
    if int(getattr(seg, "context_frames", 0) or 0) <= 1 or job.opens_on < 0:
        return None
    if not motion.layout_supports_runs():
        notes.append(
            f"WARNING: clip {job.index + 1} is set to continue the clip in front with "
            "carried motion, but this ComfyUI's H3 layout takes a conditioning block only "
            "at the first or last frame, so a run cannot be placed on the timeline. The "
            "clip opens on the previous one's final frame instead. Carrying motion needs "
            "ComfyUI 0.33.5 or newer."
        )
        return None
    source = run.jobs[job.opens_on]
    audio_frames = int(getattr(seg, "context_audio", 0) or 0)
    if source.external:
        if loaded_av is None or models is None:
            notes.append(
                f"WARNING: clip {job.index + 1} continues loaded footage, but that clip's "
                "frames were not read this run; it opens on the last frame instead."
            )
            return None
        encoded = _encode_footage_tail(seg, loaded_av, models, notes, job.index)
        if encoded is None:
            return None
        context_latent, available, audio_frames = encoded
        at_frame = 0
    else:
        latent_from = "" if source.skipped_reason else source.latent_path
        if not os.path.isfile(latent_from) and source.chain_from == FILM_FROM_LATENT:
            latent_from = os.path.join(source.chain_where, LATENT_FILE)
            notes.append(
                f"NOTE: clip {job.index + 1} continues the take clip {source.index + 1}'s "
                "timeline plays -- that clip has moved since its last render, and this "
                "run does not re-render it."
            )
        if not os.path.isfile(latent_from):
            if loaded_av is not None and models is not None:
                encoded = _encode_footage_tail(
                    seg, loaded_av, models, notes, job.index, external=False,
                    reason="The take on the timeline is a file with no cache latent",
                )
                if encoded is None:
                    return None
                context_latent, available, audio_frames = encoded
                return motion.Context(
                    latent=context_latent,
                    frames=int(seg.context_frames),
                    audio_frames=audio_frames,
                    at_frame=0,
                    available=available,
                    source_index=source.index,
                )
            notes.append(
                f"WARNING: clip {job.index + 1} is set to continue clip {source.index + 1}, but "
                "that clip's latent is not in the cache -- render it first. This clip opens on "
                "its last frame instead."
            )
            return None
        try:
            context_latent = _load_latent(latent_from)
            _, _, available = motion.latent_geometry(context_latent)
        except Exception as exc:
            notes.append(
                f"WARNING: clip {job.index + 1} could not read clip {source.index + 1}'s latent "
                f"({exc}); it opens on the last frame instead."
            )
            return None
        at_frame = int(getattr(seg, "context_at", 0) or 0)
        if at_frame and at_frame > available:
            at_frame = 0
        if at_frame and at_frame not in set(motion.cut_points(context_latent)):
            if loaded_av is None or models is None:
                notes.append(
                    f"WARNING: clip {job.index + 1} cuts clip {source.index + 1} between latent "
                    "steps, which needs that clip's frames to encode -- and they were not read "
                    "this run. It opens on the last frame instead."
                )
                return None
            encoded = _encode_footage_tail(seg, loaded_av, models, notes, job.index,
                                           external=False)
            if encoded is None:
                return None
            context_latent, available, audio_frames = encoded
            at_frame = 0
    return motion.Context(
        latent=context_latent,
        frames=int(seg.context_frames),
        audio_frames=audio_frames,
        at_frame=at_frame,
        available=at_frame or available,
        source_index=source.index,
    )
def _conditioning_for(job, board: Board, models: dict, settings: RenderSettings, first_frame,
                      notes: list | None = None, context=None, ref_size: str = "match"):
    from ..vig.cutter.state import substitute_tags
    h3 = _native()
    seg = job.segment
    notes = notes if notes is not None else []
    opened_on_chain = False
    trim = 0
    length = seg.frames
    run = 0
    if context is not None:
        run = seg.pinned_run
        if run != motion.snap_to_grid(int(context.frames)):
            notes.append(
                f"WARNING: clip {job.index + 1} asked to "
                + ("arrive with " if context.backward else "carry ")
                + f"{motion.snap_to_grid(int(context.frames))} frames, but a {seg.frames} "
                f"frame clip cannot be sampled that much longer -- H3 stops at "
                f"{MAX_SEGMENT_FRAMES} frames. "
                + (
                    f"The run was shortened to {run} frames."
                    if run
                    else (
                        "No run fits, so the clip is rendered without one. Shorten it to "
                        "make room."
                        if context.backward
                        else "No run fits, so the clip opens on the previous one's last "
                        "frame instead. Shorten the clip to carry motion into it."
                    )
                )
            )
        capped = motion.snap_to_grid(int(context.available))
        if run and capped < run:
            notes.append(
                f"WARNING: clip {job.index + 1} carries {capped} frames rather than {run}: "
                f"clip {context.source_index + 1} only has {context.available} to give. It is "
                f"still sampled at the length the longer run asked for, so {run - capped} "
                "frames are sampled and thrown away; the film keeps the length the timeline "
                "states. Shorten this clip's carry, or continue it from further into the "
                "clip in front, to stop paying for them."
            )
            run = capped
        if not run:
            context = None
        else:
            length = seg.sample_frames
            trim = run
    common = dict(
        clip=models["clip"],
        vae=models["vae"],
        prompt=seg.prompt,
        width=settings.width,
        height=settings.height,
        length=length,
    )
    if seg.mode == spec.REF2VA:
        if models.get("audio_vae") is None:
            raise RuntimeError(
                f"Clip {job.index + 1} is a ref2va task, which encodes reference audio, but no "
                "audio_vae is connected. Connect the audio VAE or change the clip's mode."
            )
        images, videos, video_audios, audios, labels = _reference_bundles(job, board, models)
        images = _fill_references(images, labels, settings.width, settings.height, notes)
        prompt, stripped = substitute_tags(seg.prompt, labels)
        common["prompt"] = _prompt_for_run(prompt, trim, job.index, notes)
        if stripped:
            notes.append(
                f"WARNING: clip {job.index + 1} cites "
                + ", ".join(f"@{t}" for t in stripped)
                + " but no such reference resolved to a file; the tags were removed."
            )
        output = h3.MiniMaxH3ReferenceToVideo.execute(
            audio_vae=models["audio_vae"],
            ref_image_size=ref_size,
            ref_images=images,
            ref_videos=videos,
            ref_video_audios=video_audios,
            ref_audios=audios,
            **common,
        )
    else:
        opening = _keyframe_asset(seg, models, "first") if seg.wants_first_frame else None
        labels: dict[str, str] = {}
        if seg.wants_first_frame and opening is None and context is None:
            opening, adopted = _cited_opening(board, seg, models)
            if opening is not None:
                labels[adopted] = "<Picture 1>"
                notes.append(
                    f"NOTE: clip {job.index + 1} opens on @{adopted} -- the cited "
                    "image was adopted as the first frame because the slot was "
                    "empty. Drop a different image on the clip to override it."
                )
        prompt, stripped = substitute_tags(seg.prompt, labels)
        common["prompt"] = _prompt_for_run(prompt, trim, job.index, notes)
        if stripped:
            if context is not None:
                hint = (
                    "This clip opens on the run carried from the one before it, which "
                    "takes frame 0, so no image can open it; ref2va attaches them all"
                )
            elif not seg.wants_first_frame:
                hint = "Switch the clip to ref2va to attach them"
            else:
                hint = (
                    "Only the first cited image can open the clip; ref2va attaches them all"
                )
            notes.append(
                f"WARNING: clip {job.index + 1} cites "
                + ", ".join(f"@{t}" for t in stripped)
                + f" but its mode is {seg.mode}, which attaches no references -- the "
                f"tags were removed and those files never reached the model. {hint}."
            )
        effective_first = opening if opening is not None else (
            first_frame if seg.wants_first_frame else None
        )
        effective_first = _cover_canvas(
            effective_first, settings.width, settings.height, notes, job.index + 1, "opening"
        )
        opened_on_chain = opening is None and effective_first is not None
        closing = _keyframe_asset(seg, models, "last") if seg.wants_last_frame else None
        if seg.wants_first_frame and effective_first is None:
            notes.append(
                f"NOTE: clip {job.index + 1} is {seg.mode} but has no opening frame -- "
                "nothing rendered before it and no image is attached -- so its opening "
                "is unpinned and renders as t2va does. Drop a first-frame image on the "
                "clip to pin it."
            )
        if (
            (effective_first is not None or closing is not None)
            and settings.width * settings.height < 200_000
            and seg.frames < TRAINED_MIN_FRAMES
        ):
            notes.append(
                f"WARNING: clip {job.index + 1} pins a keyframe at "
                f"{settings.width}x{settings.height} over {seg.frames} frames. Measured: "
                "with the canvas AND the length both this far under the trained regime "
                "the keyframe does not bind and the clip opens on something else. "
                "Render at 832x480+ or lengthen the clip past 4 s."
            )
        output = h3.MiniMaxH3ImageToVideo.execute(
            first_frame=effective_first,
            last_frame=closing,
            **common,
        )
    conditioning, latent = output.args
    if context is not None:
        conditioning, span = motion.pin(
            conditioning,
            latent,
            context.latent,
            run,
            int(context.audio_frames),
            at_frame=context.at_frame,
            notes=notes,
            backward=context.backward,
        )
        if not context.backward:
            opened_on_chain = False
        notes.append(
            f"NOTE: clip {job.index + 1} "
            + ("arrives at" if context.backward else "continues")
            + f" clip {context.source_index + 1} with "
            f"{span} frames of motion ({span / motion.FPS:.2f} s) and "
            f"{context.audio_frames / motion.FPS:.2f} s of sound carried across the cut"
            + (f", from frame {context.at_frame} of it" if context.at_frame else "")
            + f". {trim} frames are trimmed back off the "
            + ("end" if context.backward else "head")
            + f", and the clip delivers {length - trim} frames rather than {seg.frames}: "
            "the grid's own padding is kept so no story time is lost at the join."
        )
    return conditioning, latent, opened_on_chain, trim
def _reference_bundles(job, board: Board, models: dict):
    loader = models.get("load_asset")
    images, videos, video_audios, audios = {}, {}, {}, {}
    labels: dict[str, str] = {}
    seen: dict[str, str] = {}
    def take(ref):
        if not ref.resolved or loader is None:
            return
        tag = getattr(ref, "tag", "")
        if ref.source in seen:
            if tag and tag not in labels:
                labels[tag] = seen[ref.source]
            return
        asset = loader(ref)
        if asset is None:
            return
        label = ""
        if ref.kind == "image" and len(images) < spec.MAX_REF_IMAGES:
            images[f"ref_image_{len(images) + 1}"] = asset
            label = f"<Picture {len(images)}>"
        elif ref.kind == "video" and len(videos) < spec.MAX_REF_VIDEOS:
            frames, track = asset if isinstance(asset, tuple) else (asset, None)
            videos[f"ref_video_{len(videos) + 1}"] = frames
            if track is not None and len(video_audios) < spec.MAX_REF_VIDEO_AUDIOS:
                video_audios[f"ref_video_audio_{len(videos)}"] = track
            label = f"<Video {len(videos)}>"
        elif ref.kind == "audio" and len(audios) < spec.MAX_REF_AUDIOS:
            audios[f"ref_audio_{len(audios) + 1}"] = asset
            label = f"<Audio {len(audios)}>"
        if not label:
            return
        seen[ref.source] = label
        if tag and tag not in labels:
            labels[tag] = label
    for ref in job.segment.refs:
        if not ref.is_keyframe:
            take(ref)
    for ref in job.segment.refs:
        if ref.is_keyframe:
            take(ref)
    tags = set(board.cited_tags(job.segment))
    for ref in board.library:
        if ref.tag in tags:
            take(ref)
    return images, videos, video_audios, audios, labels
def _cited_opening(board: Board, segment, models):
    loader = models.get("load_asset")
    if loader is None:
        return None, ""
    from ..vig.cutter.state import cited_tag_names
    by_tag = {ref.tag: ref for ref in board.library if ref.tag}
    for tag in cited_tag_names(segment.prompt):
        ref = by_tag.get(tag)
        if ref is not None and ref.kind == "image" and ref.resolved:
            asset = loader(ref)
            if asset is not None:
                return asset, tag
    return None, ""
def _derived_opens_on_chain(board: Board, segment, job) -> bool:
    if not segment.wants_first_frame or job.opens_on < 0:
        return False
    for ref in segment.refs:
        if ref.kind == "image" and ref.resolved and ref.uid.startswith("first"):
            return False
    from ..vig.cutter.state import cited_tag_names
    by_tag = {ref.tag: ref for ref in board.library if ref.tag}
    for tag in cited_tag_names(segment.prompt):
        ref = by_tag.get(tag)
        if ref is not None and ref.kind == "image" and ref.resolved:
            return False
    return True
def _cover_canvas(image, width: int, height: int, notes: list, clip_no: int, slot: str):
    import comfy.utils
    if image is None:
        return None
    shape = getattr(image, "shape", None)
    if not shape or len(shape) < 3:
        return image
    src_h, src_w = int(shape[-3]), int(shape[-2])
    if src_w <= 0 or src_h <= 0:
        return image
    if src_w == width and src_h == height:
        return image
    samples = image[..., :3].movedim(-1, 1)
    samples = comfy.utils.common_upscale(samples, width, height, "lanczos", "center")
    fitted = samples.movedim(1, -1)
    if abs((src_w / src_h) - (width / height)) > 0.01:
        notes.append(
            f"NOTE: clip {clip_no}'s {slot} frame is {src_w}x{src_h} and the canvas is "
            f"{width}x{height}. It was scaled to cover the canvas and cropped at the "
            "edges, keeping its proportions. To keep all of it, give the canvas the "
            "image's shape (the canvas row's image button)."
        )
    return fitted
def _keyframe_asset(segment, models, slot: str):
    loader = models.get("load_asset")
    if loader is None:
        return None
    for ref in segment.refs:
        if ref.kind == "image" and ref.resolved and ref.uid.startswith(slot):
            return loader(ref)
    return None
_KJ_TINY_VAE = "kjnodes"
_kj_tiny_vae_module = None
def _kj_tiny_vae():
    global _kj_tiny_vae_module
    if _kj_tiny_vae_module is not None:
        return _kj_tiny_vae_module or None
    _kj_tiny_vae_module = False
    try:
        import importlib.util
        import folder_paths
        for root in folder_paths.get_folder_paths("custom_nodes"):
            for name in sorted(os.listdir(root)) if os.path.isdir(root) else []:
                if "kjnodes" not in name.lower():
                    continue
                path = os.path.join(root, name, "nodes", "tiny_vae.py")
                if not os.path.isfile(path):
                    continue
                spec = importlib.util.spec_from_file_location("vig_kj_tiny_vae", path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                _kj_tiny_vae_module = module
                return module
    except Exception as exc:
        print(f"[VIG H3 Cutter] tiny_vae loader unavailable: {exc}")
    return None
REFERENCE_TAKE_CANVASES = 4
_FILED_TAKES: list = []
def _file_take_now(state, seg, job, settings, mode_ids, checkpoints,
                   source=None, seed=None, cache_key=None, variant=False, spent=None):
    root = (getattr(state, "project_dir", "") or "").strip()
    if not root:
        return ""
    ahead = state.segments[job.index - 1] if job.index else None
    continues = (
        ahead.cache_key
        if ahead is not None and seg.takes_from_front and not seg.external
        else ""
    )
    try:
        filed = project_folder.file_take(
            root, seg, job.index, source or job.clip_path, _copy_current,
            seed=seed, cache_key=cache_key, steps=settings.steps,
            continues=continues, settings=dict(settings.__dict__),
            stack=(mode_ids or {}).get(seg.mode, ""),
            checkpoint=(checkpoints or {}).get(seg.mode, ""),
            variant=variant, spent=spent,
        )
        if filed:
            _FILED_TAKES.append(filed)
        return filed or ""
    except Exception as exc:
        print(f"[VIG H3 Cutter] could not file a take as it was made: {exc}")
        return ""
class _SegmentPreview:
    def __init__(self, node_id, segment_id, board, settings, seconds: float):
        self.node_id = str(node_id)
        self.segment_id = segment_id
        self.fps = max(1, int(board.preview_fps))
        self.cap = max(0, int(getattr(board, "preview_max_res", 0) or 0))
        self.quality = max(30, min(100, int(getattr(board, "preview_quality", 80) or 80)))
        self.want_frames = max(0, int(getattr(board, "preview_frames", 0) or 0))
        self.frame_budget = max(1, int(round(seconds * self.fps)))
        self.tiny_vae_name = str(getattr(board, "tiny_vae", "") or "").strip()
        self._tiny = None
        self.inside = False
        self.drew = 0
        self.latent_shapes = None
        self.riders = "not asked"
        self.called = 0
        self.nothing_to_draw = 0
        self.shapes_warned = False
        self.shapes: list[str] = []
        self.every = int(getattr(board, "preview_every", 1))
        self.steps = max(1, int(settings.steps))
        self.notes: list[str] = []
        self._replay_warned = False
        self._factors = None
    def _tiny_decoder(self, channels: int):
        if self._tiny is not None:
            return self._tiny or None
        self._tiny = False
        if not self.tiny_vae_name:
            return None
        module = _kj_tiny_vae()
        if module is None:
            self.notes.append(
                f"the live preview was asked for the tiny decoder "
                f"'{self.tiny_vae_name}', but comfyui-kjnodes is not installed and "
                "its loader is what can build one for H3's latent; latent2rgb "
                "is drawing instead."
            )
            return None
        try:
            import folder_paths
            if self.tiny_vae_name == TINY_VAE_AUTO:
                names = list(folder_paths.get_filename_list("vae_approx"))
                names.sort(key=lambda one: ("h3" not in one.lower(), one.lower()))
            else:
                names = [self.tiny_vae_name]
            for name in names:
                decoder = module.load_tiny_vae_decoder(name)
                if decoder is None:
                    continue
                if int(getattr(decoder, "latent_channels", 0)) != int(channels):
                    if len(names) == 1:
                        self.notes.append(
                            f"the live preview's decoder '{name}' takes "
                            f"{decoder.latent_channels}-channel latents and this "
                            f"model's are {channels}-channel; latent2rgb is drawing "
                            "instead."
                        )
                    continue
                self._tiny = decoder
                self.notes.append(
                    f"the live preview is decoded by '{name}', built by "
                    f"{_KJ_TINY_VAE}'s own loader, rather than by latent2rgb."
                )
                return decoder
            if self.tiny_vae_name == TINY_VAE_AUTO:
                self.notes.append(
                    f"no decoder under models/vae_approx takes {channels}-channel "
                    "latents, so the live preview is latent2rgb. taeh3.safetensors "
                    "is the one that does for H3."
                )
            else:
                self.notes.append(
                    f"the live preview's decoder '{self.tiny_vae_name}' could not be "
                    "loaded from models/vae_approx; latent2rgb is drawing instead."
                )
        except Exception as exc:
            self.notes.append(
                f"the live preview's tiny decoder could not be loaded ({exc}); "
                "latent2rgb is drawing instead."
            )
        return None
    def _rgb_factors(self):
        if self._factors is None:
            import torch
            from comfy.latent_formats import MiniMaxH3Video
            fmt = MiniMaxH3Video()
            self._factors = (
                torch.tensor(fmt.latent_rgb_factors, dtype=torch.float32),
                torch.tensor(fmt.latent_rgb_factors_bias, dtype=torch.float32),
            )
        return self._factors
    def _unpacked(self, x0):
        if x0 is None:
            return None
        part = _video_part(x0)
        if getattr(part, "ndim", 0) == 5 or not self.latent_shapes:
            return part
        try:
            import comfy.utils
            pieces = comfy.utils.unpack_latents(x0, self.latent_shapes)
            channels = int(self._rgb_factors()[0].shape[0])
            for piece in pieces:
                if getattr(piece, "ndim", 0) == 5 and int(piece.shape[1]) == channels:
                    return piece
            for piece in pieces:
                if (getattr(piece, "ndim", 0) == 5
                        and int(piece.shape[-2]) > 1 and int(piece.shape[1]) > 1):
                    return piece
        except Exception as exc:
            if not self.shapes_warned:
                self.shapes_warned = True
                self.notes.append(
                    f"the live preview could not unpack the sampler's latent ({exc}); "
                    "it draws from the outermost callback instead."
                )
            return None
        return None
    def _frames_of(self, x0):
        import numpy
        import torch
        from PIL import Image
        video = self._unpacked(x0)
        if getattr(video, "ndim", 0) != 5:
            return [], []
        video = video[:1].detach().float()
        factors, bias = self._rgb_factors()
        channels = factors.shape[0]
        if video.shape[1] != channels:
            return [], []
        total = int(video.shape[2])
        decoder = self._tiny_decoder(int(video.shape[1]))
        wanted = self.want_frames or self.frame_budget
        count = max(1, min(total, wanted))
        indices = torch.linspace(0, total - 1, count).round().long()
        if decoder is not None:
            frames = self._decode_tiny(decoder, video, indices)
            if frames:
                return frames, self._holds(indices, total)
        cells = video[0][:, indices].movedim(0, -1).cpu()
        rgb = torch.nn.functional.linear(cells, factors.transpose(0, 1), bias)
        rgb = rgb.mul(127.5).add(127.5).clamp(0, 255).to(torch.uint8).numpy()
        frames = [
            Image.fromarray(numpy.ascontiguousarray(rgb[i])) for i in range(rgb.shape[0])
        ]
        return frames, self._holds(indices, total)
    def _decode_tiny(self, decoder, video, indices):
        import numpy
        import torch
        from PIL import Image
        try:
            rgb = decoder.decode_video(video[:1], frame_indices=[int(i) for i in indices])
            u8 = rgb.clamp(0, 1).mul(255).to(torch.uint8).cpu().numpy()
            return [
                Image.fromarray(numpy.ascontiguousarray(u8[i])) for i in range(u8.shape[0])
            ]
        except Exception as exc:
            self._tiny = False
            self.notes.append(
                f"the live preview's tiny decoder stopped ({exc}); the rest of this "
                "clip is drawn with latent2rgb."
            )
            return []
    def _holds(self, indices, total):
        picked = [int(i) for i in indices.tolist()]
        holds = []
        for nth, start in enumerate(picked):
            stop = picked[nth + 1] if nth + 1 < len(picked) else total
            covered = sum(
                motion.FRAME_PER_TOKEN[k % len(motion.FRAME_PER_TOKEN)]
                for k in range(start, max(stop, start + 1))
            )
            holds.append(max(1, int(round(1000.0 * covered / FPS))))
        return holds
    def _encode(self, frames, holds=None):
        import base64
        import io
        from PIL import ImageOps
        if self.cap > 0:
            frames = [
                ImageOps.contain(f, (self.cap, self.cap)) if max(f.size) > self.cap else f
                for f in frames
            ]
        buffer = io.BytesIO()
        if len(frames) > 1:
            frames[0].save(
                buffer,
                format="WEBP",
                save_all=True,
                append_images=frames[1:],
                duration=(
                    [max(1, int(h)) for h in holds]
                    if holds and len(holds) == len(frames)
                    else max(1, int(round(1000 / self.fps)))
                ),
                loop=0,
                quality=self.quality,
                method=0,
            )
            mime = "image/webp"
        else:
            frames[0].save(buffer, format="JPEG", quality=self.quality)
            mime = "image/jpeg"
        return base64.b64encode(buffer.getvalue()).decode("ascii"), mime, frames[0].size
    def wrap(self, callback, inside=False):
        def wrapped(step, x0, x, total_steps):
            self.called += 1
            if len(self.shapes) < 2:
                part = self._unpacked(x0)
                self.shapes.append(
                    f"{'inside' if inside else 'outside'}: "
                    + ("None" if x0 is None else str(tuple(getattr(part, "shape", ()))) or "?")
                )
            if inside:
                self.inside = True
            elif self.inside:
                if callback is not None:
                    callback(step, x0, x, total_steps)
                return
            if callback is not None:
                callback(step, x0, x, total_steps)
            total = int(total_steps)
            last = int(step) + 1 >= total
            if total > self.steps and not self._replay_warned:
                self._replay_warned = True
                self.notes.append(
                    f"the live preview reported {total} steps for a {self.steps}-step "
                    "clip, which means a two-pass accelerator is running and is "
                    "feeding previews from its second pass -- they arrive AFTER "
                    "sampling, not during it. Turn offline_smoothing_replay off on "
                    "the Spectrum node to get the preview back while the clip is "
                    "still killable."
                )
            if self.every <= 0:
                return
            if not last and (int(step) + 1) % self.every:
                return
            try:
                frames, holds = self._frames_of(x0)
                if not frames:
                    self.nothing_to_draw += 1
                    return
                self.drew += 1
                at_step, of_steps = int(step) + 1, int(total_steps)
                def post(frames=frames, holds=holds, at_step=at_step, of_steps=of_steps):
                    image, mime, (width, height) = self._encode(frames, holds)
                    _send(
                        PROGRESS_EVENT,
                        {
                            "node_id": self.node_id,
                            "phase": "preview",
                            "segment_id": self.segment_id,
                            "image": image,
                            "mime": mime,
                            "w": width,
                            "h": height,
                            "fps": self.fps,
                            "step": at_step,
                            "total": of_steps,
                        },
                    )
                _preview_encoder().submit(post)
            except Exception as exc:
                print(f"[VIG H3 Cutter] live preview failed: {exc}")
        return wrapped
class _PreviewEncoder:
    def __init__(self):
        import queue
        import threading
        self._queue = queue.Queue(maxsize=1)
        self._empty = queue.Empty
        self._full = queue.Full
        self._thread = threading.Thread(
            target=self._serve, name="vig_h3_preview", daemon=True
        )
        self._thread.start()
    def submit(self, job) -> None:
        try:
            self._queue.put_nowait(job)
        except self._full:
            try:
                self._queue.get_nowait()
            except self._empty:
                pass
            try:
                self._queue.put_nowait(job)
            except self._full:
                pass
    def _serve(self) -> None:
        while True:
            job = self._queue.get()
            try:
                job()
            except Exception as exc:
                print(f"[VIG H3 Cutter] live preview encode failed: {exc}")
_PREVIEW_ENCODER = None
def _preview_encoder():
    global _PREVIEW_ENCODER
    if _PREVIEW_ENCODER is None:
        _PREVIEW_ENCODER = _PreviewEncoder()
    return _PREVIEW_ENCODER
def _preview_wrapper(preview):
    def wrapper(executor, *args, **kwargs):
        shapes = kwargs.get("latent_shapes")
        if shapes is not None:
            preview.latent_shapes = shapes
        if "callback" in kwargs:
            kwargs["callback"] = preview.wrap(kwargs.get("callback"), inside=True)
        elif len(args) > 5:
            args = list(args)
            args[5] = preview.wrap(args[5], inside=True)
        return executor(*args, **kwargs)
    return wrapper
def _sample(model, conditioning, latent, seed: int, settings: RenderSettings, preview=None,
            on_step=None):
    import comfy.model_management
    import comfy.sample
    import comfy.samplers
    import comfy.utils
    import latent_preview
    from comfy_extras.nodes_custom_sampler import Guider_Basic, Noise_RandomNoise
    if preview is not None:
        try:
            import comfy.patcher_extension
            model = model.clone()
            model.add_wrapper_with_key(
                comfy.patcher_extension.WrappersMP.OUTER_SAMPLE,
                "vig_h3_preview",
                _preview_wrapper(preview),
            )
        except Exception as exc:
            preview.notes.append(
                f"the live preview could not be put inside the sampler ({exc}), so it "
                "draws from the outermost callback and an accelerator that samples "
                "twice will hold it back to its second pass."
            )
        else:
            try:
                riders = model.wrappers.get(
                    comfy.patcher_extension.WrappersMP.OUTER_SAMPLE, {}
                )
                preview.riders = ", ".join(riders.keys()) or "none"
            except Exception:
                preview.riders = "unknown"
    guider = Guider_Basic(model)
    guider.set_conds(conditioning)
    sampler = comfy.samplers.sampler_object(settings.sampler_name)
    steps = max(1, int(settings.steps))
    total = steps if settings.denoise >= 1.0 else int(steps / max(1e-6, settings.denoise))
    sigmas = comfy.samplers.calculate_sigmas(
        model.get_model_object("model_sampling"), settings.scheduler, total
    ).cpu()[-(steps + 1) :]
    noise = Noise_RandomNoise(int(seed))
    work = dict(latent)
    samples_in = comfy.sample.fix_empty_latent_channels(
        guider.model_patcher,
        work["samples"],
        work.get("downscale_ratio_spacial"),
        work.get("downscale_ratio_temporal"),
    )
    work["samples"] = samples_in
    callback = latent_preview.prepare_callback(guider.model_patcher, sigmas.shape[-1] - 1, {})
    if preview is not None:
        callback = preview.wrap(callback)
    if on_step is not None:
        inner = callback
        def callback(step, x0, x, total_steps, _inner=inner):
            try:
                on_step(int(step) + 1, int(total_steps))
            except Exception:
                pass
            return _inner(step, x0, x, total_steps) if _inner else None
    samples = guider.sample(
        noise.generate_noise(work),
        samples_in,
        sampler,
        sigmas,
        denoise_mask=work.get("noise_mask"),
        callback=callback,
        disable_pbar=not comfy.utils.PROGRESS_BAR_ENABLED,
        seed=noise.seed,
    )
    out = dict(work)
    out.pop("downscale_ratio_spacial", None)
    out.pop("downscale_ratio_temporal", None)
    out["samples"] = samples.to(comfy.model_management.intermediate_device())
    return out
def _decode_video(vae, latent):
    images = vae.decode(_video_part(latent["samples"]))
    if len(getattr(images, "shape", ())) == 5:
        images = images.reshape(-1, images.shape[-3], images.shape[-2], images.shape[-1])
    return images
def _decode_audio(audio_vae, latent):
    if audio_vae is None:
        return None
    from comfy_extras.nodes_audio import vae_decode_audio
    return vae_decode_audio(audio_vae, latent)
def _video_part(samples):
    return samples.unbind()[0] if getattr(samples, "is_nested", False) else samples
class VigH3Cutter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": (
                    "MODEL",
                    {
                        "tooltip": (
                            "The H3 base diffusion model, after any patches. Samples the "
                            "four base modes: t2va, i2va, fl2va, l2va (the fl2va "
                            "checkpoint covers them all)."
                        )
                    },
                ),
                "board": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "tooltip": "The timeline, as JSON. Edited through the panel above.",
                    },
                ),
                "width": ("INT", {"default": 832, "min": 32, "max": 8192, "step": 32}),
                "height": ("INT", {"default": 480, "min": 32, "max": 8192, "step": 32}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 200}),
                "sampler_name": (_sampler_options(), {"default": "res_multistep"}),
                "scheduler": (_scheduler_options(), {"default": "simple"}),
                "join": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "join into one film",
                        "label_off": "clips only",
                        "tooltip": (
                            "Joining holds every frame of every clip in memory at once -- "
                            "3.6 GB a clip at 1344x768. Off gives the clips and nothing else."
                        ),
                    },
                ),
            },
            "optional": {
                "ref_model": (
                    "MODEL",
                    {
                        "tooltip": (
                            "The H3 ref2va diffusion model. Needed only when a clip is "
                            "in REF2VA mode; the base modes never touch it."
                        )
                    },
                ),
                "clip": ("CLIP", {"tooltip": "The minimax CLIP (Qwen3-VL). Required."}),
                "vae": ("VAE", {"tooltip": "The H3 video VAE. Required."}),
                "audio_vae": (
                    "VAE",
                    {"tooltip": "The H3 audio VAE. Required for sound, and for ref2va."},
                ),
                "latent_image": (
                    "LATENT",
                    {
                        "tooltip": (
                            "Sets the canvas: the latent's own proportions override "
                            "width/height. Wire an Empty Latent Image sized how you "
                            "want the frame."
                        )
                    },
                ),
                "storyboard": (
                    "VIG_H3_STORYBOARD",
                    {
                        "tooltip": (
                            "A whole film from the Film Director. Applied ONCE: the "
                            "board records which storyboard it was laid out from, so a "
                            "re-run never puts the plan back over clips you have edited "
                            "since. Change the script and the new plan applies."
                        )
                    },
                ),
            },
            "hidden": {"node_id": "UNIQUE_ID", "prompt_graph": "PROMPT",
                       "extra_pnginfo": "EXTRA_PNGINFO"},
        }
    OUTPUT_NODE = True
    RETURN_TYPES = ("IMAGE", "AUDIO", "INT", "STRING", "STRING")
    RETURN_NAMES = ("images", "audio", "frame_count", "board", "report")
    OUTPUT_TOOLTIPS = (
        "Every clip's frames, in order, with the repeated frame at each join removed. "
        "Wire to Create Video.",
        "The film's soundtrack, in step with the frames.",
        "How many frames came out.",
        "The board as JSON, after the run -- what rendered and what it is cached as.",
        "What ran, what was reused, and every warning the clips raised.",
    )
    FUNCTION = "execute"
    CATEGORY = CATEGORY
    DESCRIPTION = (
        "A video editor's console for MiniMax H3: several clips on one timeline, each with "
        "its own mode, prompt, seed and length, rendered in one pass and re-rendered one at "
        "a time. Drag a boundary to move time between two clips; edit a prompt and only that "
        "clip and the ones that open on it are rendered again."
    )
    def execute(
        self,
        model,
        board,
        width,
        height,
        steps,
        sampler_name,
        scheduler,
        join,
        ref_model=None,
        clip=None,
        vae=None,
        audio_vae=None,
        latent_image=None,
        storyboard=None,
        node_id=None,
        prompt_graph=None,
        extra_pnginfo=None,
        scenario=None,
        plan=None,
    ):
        missing = [name for name, value in (("clip", clip), ("vae", vae)) if value is None]
        if missing:
            raise ValueError(
                f"Wire the {' and '.join(missing)} input{'s' if len(missing) > 1 else ''}: "
                "the Cutter cannot encode prompts or decode frames without "
                f"{'them' if len(missing) > 1 else 'it'}."
            )
        started = time.time()
        writer_note = _director.drop_kept_backend("the render needs the card")
        state = Board.from_json(board)
        project_folder.require_root(getattr(state, "project_dir", ""))
        state, storyboard_note = _apply_storyboard(state, storyboard)
        canvas_source = "widgets"
        canvas_note = ""
        canvas = (
            _canvas_from_opening_image(state, int(width), int(height))
            if state.aspect_from_image
            else None
        )
        if canvas is not None:
            width, height = canvas
            canvas_source = "image"
            canvas_note = (
                f"Canvas {width}x{height}: shape from clip 1's opening image, "
                "pixel budget from width x height."
            )
        else:
            if state.aspect_from_image:
                canvas_note = (
                    "NOTE: the canvas is set to follow clip 1's opening image, but no "
                    "opening image resolved (empty first-frame slot, no cited @R image) "
                    "-- the widgets decide the shape."
                )
            canvas = _canvas_from_latent(latent_image)
            if canvas is not None:
                width, height = canvas
                canvas_source = "latent"
                latent_note = f"Canvas {width}x{height}, from latent_image."
                canvas_note = f"{canvas_note}\n{latent_note}".strip()
        settings = RenderSettings(
            width=int(width),
            height=int(height),
            steps=int(steps),
            sampler_name=str(sampler_name),
            scheduler=str(scheduler),
        )
        base_file = loader_file_for(prompt_graph, node_id, "model")
        ref_file = loader_file_for(prompt_graph, node_id, "ref_model")
        base_identity = model_stack_identity(prompt_graph, node_id, "model") or _model_identity(model)
        models_by_mode = {mode: model for mode in spec.BASE_MODES}
        models_by_mode[spec.REF2VA] = ref_model
        mode_ids = {mode: base_identity for mode in spec.BASE_MODES}
        mode_ids[spec.REF2VA] = (
            (model_stack_identity(prompt_graph, node_id, "ref_model")
             or _model_identity(ref_model))
            if ref_model is not None
            else "none"
        )
        root = cache_root(_output_directory(), node_id)
        directives = _directives(board)
        asked_reference = directives.get("reference_take")
        if asked_reference is not None:
            models = {"clip": clip, "vae": vae, "audio_vae": audio_vae,
                      "load_asset": _asset_loader()}
            return self._reference_takes(
                asked_reference, state, directives, models, models_by_mode,
                settings, node_id, started, ref_file=ref_file,
            )
        run = plan_run(
            state,
            settings,
            root,
            only=directives.get("only"),
            force=directives.get("force"),
            mode_ids=mode_ids,
            file_ids=_external_file_ids(state, settings),
        )
        _send(
            PROGRESS_EVENT,
            {
                "node_id": str(node_id),
                "phase": "start",
                "to_render": [job.segment.id for job in run.to_render],
                "cached": [job.segment.id for job in run.cached],
                "tokens_per_step": sequence_tokens(
                    settings.width, settings.height, state.total_frames
                ),
                "canvas": {
                    "width": settings.width,
                    "height": settings.height,
                    "source": canvas_source,
                },
            },
        )
        models = {"clip": clip, "vae": vae, "audio_vae": audio_vae, "load_asset": _asset_loader()}
        film_by_console = (
            bool(join)
            and not state.audio_clips
            and not _frames_are_consumed(prompt_graph, node_id)
        )
        if film_by_console:
            run_notes_pre = [
                "NOTE: nothing in the graph takes this node's frames, so the run decoded "
                "nothing for the film; the console re-joins it from the timeline's files, "
                "and only if the cut moved."
            ]
        else:
            run_notes_pre = []
        run_notes: list[str] = checkpoint_family_notes(prompt_graph, node_id, state)
        run_notes.extend(model_walk_notes(prompt_graph, node_id, "model"))
        run_notes.extend(model_walk_notes(prompt_graph, node_id, "ref_model"))
        run_notes.extend(run_notes_pre)
        if storyboard_note:
            run_notes.insert(0, storyboard_note)
        if writer_note:
            run_notes.insert(0, writer_note)
        rendered, chain_repeats, batch_takes = self._run(
            run, state, models, models_by_mode, settings, node_id, run_notes,
            join=bool(join) and not film_by_console,
            frames_needed=not film_by_console or not run.to_render,
            mode_ids=mode_ids, file_ids=_external_file_ids(state, settings),
            checkpoints={
                **{mode: base_file for mode in spec.BASE_MODES},
                spec.REF2VA: ref_file,
            },
        )
        run_joins = bool(join) and not film_by_console
        images, audio, frames, sound_report = _assemble(rendered, state, run_joins, chain_repeats)
        audio, mix_report = _mix_track(audio, state, run_joins)
        film_path = ""
        if run_joins and images is not None and frames:
            import hashlib
            made_of = "|".join(
                [state.film_signature]
                + [str(seg.cache_key or "") for seg in state.segments]
                + [json.dumps([clip.to_json() for clip in state.audio_clips],
                              sort_keys=True, default=str)]
            )
            stamp = hashlib.sha1(made_of.encode("utf-8")).hexdigest()[:10]
            film_path = os.path.join(
                root, f"film_{len(rendered)}x_{int(round(frames / FPS))}s_{stamp}.mp4"
            )
            try:
                _save_clip(film_path, images, audio)
            except Exception as exc:
                print(f"[VIG H3 Cutter] could not write the joined film: {exc}")
                film_path = ""
        report = describe(run, state)
        report += "\n" + models_report_line(base_file, ref_file, ref_model is not None)
        report += f"\n\n{mix_report}"
        if sound_report:
            report += f"\n\n{sound_report}"
        if canvas_note:
            report += f"\n{canvas_note}"
        for note in dict.fromkeys(run_notes):
            report += f"\n{note}"
        if film_path and os.path.isfile(film_path):
            report += f"\nFilm written: {film_path}"
        report += f"\n\nRun took {time.time() - started:.1f} s."
        state.selected_id = state.selected_id or (state.segments[0].id if state.segments else 0)
        payload = state.to_json()
        payload["cache_root"] = root
        if not (film_path and os.path.isfile(film_path)):
            carried = str(directives.get("film") or "")
            film_path = carried if os.path.isfile(carried) else ""
        payload["film"] = film_path
        if film_path and os.path.isfile(film_path):
            payload["film_of"] = state.film_signature
        report += (
            "\n"
            + f"Phases: conditioning {_PHASES['cond']:.1f} s, sampling {_PHASES['sample']:.1f} s, "
            f"decode {_PHASES['decode']:.1f} s"
            + (
                " ("
                + ", ".join(
                    f"clip {i}: video {v} s + audio {a} s"
                    for i, v, a in _PHASES.get("per_clip", [])
                )
                + ")."
                if _PHASES.get("per_clip")
                else "."
            )
        )
        project_note = project_folder.export(
            state, film_path, payload, report, _resolve_media, _copy_current,
            steps=settings.steps,
            filed=len(_FILED_TAKES),
            settings=dict(settings.__dict__),
            stacks=mode_ids,
            extra_takes=batch_takes,
            checkpoints={
                **{mode: base_file for mode in spec.BASE_MODES},
                spec.REF2VA: ref_file,
            },
            storyboard=storyboard,
        )
        if project_note:
            report += f"\n{project_note}"
        workflow_note = project_folder.save_workflow(
            state,
            (extra_pnginfo or {}).get("workflow") if isinstance(extra_pnginfo, dict) else None,
            prompt_graph if isinstance(prompt_graph, dict) else None,
            cutter_class=type(self).__name__,
        )
        if workflow_note:
            report += f"\n{workflow_note}"
        _send(
            PROGRESS_EVENT,
            {"node_id": str(node_id), "phase": "done", "board": payload, "report": report,
             "film_by_console": film_by_console},
        )
        trouble = [note for note in run_notes if note.startswith(("WARNING", "ERROR"))]
        if trouble:
            print(f"[VIG H3 Cutter] {len(trouble)} warning(s) this run:")
            for note in trouble:
                print(f"[VIG H3 Cutter]   {note}")
        if images is None and film_by_console:
            import torch
            images = torch.zeros(1, settings.height, settings.width, 3)
            audio = {"waveform": torch.zeros(1, 2, 1600), "sample_rate": 16000}
            frames = 0
        if images is None:
            reasons = [
                f"clip {job.index + 1}: "
                + (job.skipped_reason or job.segment.error or "did not render")
                for job in run.jobs
            ]
            raise RuntimeError(
                "\n  ".join(
                    ["VIG H3 Cutter: nothing rendered, so there are no frames to hand on."]
                    + (reasons or ["the board has no clips."])
                )
            )
        return {
            "ui": {"vig_h3_cutter": [{"board": payload, "report": report}]},
            "result": (images, audio, frames, json.dumps(payload, ensure_ascii=False), report),
        }
    @staticmethod
    def _take_canvas(settings, ask, notes):
        import dataclasses
        try:
            want_w = int(ask.get("width") or 0)
            want_h = int(ask.get("height") or 0)
        except (TypeError, ValueError):
            want_w = want_h = 0
        if want_w < 32 or want_h < 32:
            return settings
        asked = f"{want_w}x{want_h}"
        ceiling = settings.width * settings.height * REFERENCE_TAKE_CANVASES
        area = want_w * want_h
        if area > ceiling:
            scale = (ceiling / area) ** 0.5
            want_w, want_h = want_w * scale, want_h * scale
        width = max(32, int((want_w + 16) // 32) * 32)
        height = max(32, int((want_h + 16) // 32) * 32)
        while width * height > ceiling and max(width, height) > 32:
            if width >= height:
                width -= 32
            else:
                height -= 32
        if (width, height) == (settings.width, settings.height):
            return settings
        over = (f", scaled down from {asked} to stay inside "
                f"{REFERENCE_TAKE_CANVASES}x the film's canvas" if area > ceiling else "")
        notes.append(
            f"NOTE: the reference take renders at {width}x{height} -- the identity "
            f"picture's own proportions{over} -- rather than the clip canvas "
            f"{settings.width}x{settings.height}, and its references are fed whole "
            "(ref_image_size=max) so the face keeps its detail. That is "
            f"{(width * height) / max(1, settings.width * settings.height):.1f}x the "
            "clip's pixels."
        )
        return dataclasses.replace(settings, width=width, height=height)
    def _reference_takes(
        self, ask, state, directives, models, models_by_mode, settings, node_id, started,
        ref_file="",
    ):
        import json as json_module
        import comfy.model_management
        import torch
        def answer(report_text, image=None):
            payload = state.to_json()
            payload["cache_root"] = cache_root(_output_directory(), node_id)
            carried = str(directives.get("film") or "")
            payload["film"] = carried if os.path.isfile(carried) else ""
            _send(
                PROGRESS_EVENT,
                {"node_id": str(node_id), "phase": "done", "board": payload,
                 "report": report_text},
            )
            if image is None:
                image = torch.zeros((1, 8, 8, 3))
            silence = {"waveform": torch.zeros((1, 1, 32)), "sample_rate": 32000}
            return {
                "ui": {"vig_h3_cutter": [{"board": payload, "report": report_text}]},
                "result": (
                    image, silence, int(image.shape[0]),
                    json_module.dumps(payload, ensure_ascii=False), report_text,
                ),
            }
        _send(
            PROGRESS_EVENT,
            {"node_id": str(node_id), "phase": "start", "to_render": [], "cached": []},
        )
        prompt_text = str(ask.get("prompt") or "").strip()
        refs = [
            {"uid": f"image-{i + 1}", "kind": "image", "tag": "",
             "label": str(r.get("label") or f"reference {i + 1}"),
             "source": str(r.get("source") or "")}
            for i, r in enumerate(ask.get("refs") or [])
            if isinstance(r, dict) and str(r.get("source") or "").strip()
        ]
        sampler_model = models_by_mode.get(spec.REF2VA)
        if sampler_model is None:
            return answer(
                "Editing a reference renders through ref2va, and no ref2va model is "
                "connected. Wire the H3 ref2va checkpoint into ref_model."
            )
        if not prompt_text or not refs:
            return answer(
                "Editing a reference needs a prompt and at least one reference "
                "image; the panel sends both."
            )
        try:
            takes = max(1, min(6, int(ask.get("takes") or 1)))
        except (TypeError, ValueError):
            takes = 1
        try:
            seed = int(ask.get("seed") or 0)
        except (TypeError, ValueError):
            seed = 0
        pseudo = Board.from_json(json_module.dumps({"segments": [{
            "id": 1, "mode": spec.REF2VA, "seconds": 1,
            "seed": seed, "prompt": prompt_text,
            "music": False, "refs": refs,
        }]}))
        cond_notes: list = []
        take_settings = self._take_canvas(settings, ask, cond_notes)
        seg = pseudo.segments[0]
        job = SegmentJob(segment=seg, index=0, key="", directory="")
        _t0 = time.time()
        conditioning, empty, _opened, _trim = _conditioning_for(
            job, pseudo, models, take_settings, None, notes=cond_notes,
            ref_size="max",
        )
        cond_took = time.time() - _t0
        import folder_paths
        stamp = time.strftime("%H%M%S")
        made: list = []
        frame = None
        for index in range(takes):
            comfy.model_management.throw_exception_if_processing_interrupted()
            take_seed = seed + index
            _send(
                PROGRESS_EVENT,
                {"node_id": str(node_id), "phase": "reference",
                 "status": "generating", "take": index + 1, "takes": takes,
                 "seed": take_seed},
            )
            _t1 = time.time()
            def stepped(step, total, _take=index + 1):
                _send(
                    PROGRESS_EVENT,
                    {"node_id": str(node_id), "phase": "reference", "status": "step",
                     "take": _take, "takes": takes, "step": step, "total": total},
                )
            latent = _sample(sampler_model, conditioning, empty, take_seed, take_settings,
                             on_step=stepped)
            frames = _decode_video(models["vae"], latent)
            frame = frames[-1:]
            relative = os.path.join(
                "vig_h3_cutter", "refs", f"ref_{stamp}_s{take_seed}.png"
            )
            target = os.path.join(folder_paths.get_input_directory(), relative)
            _save_png(target, frame)
            source = relative.replace(os.sep, "/")
            made.append((source, take_seed, time.time() - _t1))
            _send(
                PROGRESS_EVENT,
                {"node_id": str(node_id), "phase": "reference",
                 "status": "ready", "take": index + 1, "takes": takes,
                 "seed": take_seed, "source": source},
            )
        lines = [
            f"{len(made)} reference take(s) rendered through ref2va at "
            f"{settings.width}x{settings.height}, {settings.steps} steps, one "
            "second sampled each, the final frame kept.",
            "Sampled on the ref2va checkpoint: "
            + (str(ref_file) or "the model wired into ref_model") + ".",
        ]
        lines += [
            f"  take {i + 1}: seed {take_seed}, {took:.1f} s -- {source}"
            for i, (source, take_seed, took) in enumerate(made)
        ]
        lines += [note if isinstance(note, str) else str(note) for note in cond_notes]
        lines.append(
            "Pick one in the panel to make it the reference; the files stay in "
            "the input folder either way."
        )
        lines.append(
            f"Conditioning {cond_took:.1f} s; whole run {time.time() - started:.1f} s."
        )
        return answer("\n".join(lines), image=frame)
    def _run(
        self, run, state, models, models_by_mode, settings, node_id, run_notes=None, join=True,
        mode_ids=None, file_ids=None, checkpoints=None, frames_needed=True,
    ):
        import comfy.model_management
        results = {}
        chain_repeats: dict = {}
        produced: dict = {}
        previous_last = None
        run_notes = run_notes if run_notes is not None else []
        failed_indices: set = set()
        trims: dict = {}
        _PHASES.clear()
        _PHASES.update(cond=0.0, sample=0.0, decode=0.0)
        _FILED_TAKES.clear()
        batch_takes: dict = {}
        file_ids = file_ids or {}
        unfilmed: list = []
        for job in run.jobs:
            seg = job.segment
            spent = {}
            filed_now = ""
            if job.skipped_reason:
                _send(
                    PROGRESS_EVENT,
                    {
                        "node_id": str(node_id),
                        "phase": "segment",
                        "segment_id": seg.id,
                        "status": "error" if job.blocked else "queued",
                        "detail": job.skipped_reason,
                    },
                )
                if job.blocked:
                    failed_indices.add(job.index)
                kept_from, kept_where = film_source(
                    seg.clip, job.take_dir, job.clip_path, has_render=False
                )
                nxt = run.jobs[job.index + 1] if job.index + 1 < len(run.jobs) else None
                feeds_chain = bool(
                    nxt is not None and nxt.will_render and nxt.opens_on == job.index
                )
                if (join or feeds_chain) and kept_from:
                    _t0 = time.time()
                    try:
                        images, audio, opened = _timeline_footage(
                            seg,
                            kept_from,
                            kept_where,
                            models,
                            settings,
                            f"clip {job.index + 1}",
                            run_notes,
                            lambda: _derived_opens_on_chain(state, seg, job),
                        )
                        chain_repeats[seg.id] = opened
                        if join:
                            results[seg.id] = (images, audio)
                        produced[seg.id] = (images, audio)
                        previous_last = images[-1:]
                        if feeds_chain:
                            run_notes.append(
                                f"NOTE: clip {nxt.index + 1} continues the take clip "
                                f"{job.index + 1}'s timeline plays; clip {job.index + 1} "
                                "itself is not re-rendered."
                            )
                        _PHASES['decode'] += time.time() - _t0
                    except Exception as err:
                        previous_last = None
                        if feeds_chain:
                            failed_indices.add(job.index)
                        run_notes.append(
                            f"WARNING: clip {job.index + 1} is not in this run and what the "
                            f"timeline plays for it could not be read back ({err}), so the "
                            "film below is missing it"
                            + (
                                " and the clip that continues it cannot start"
                                if feeds_chain
                                else ""
                            )
                            + ". Press Run to rebuild the whole film."
                        )
                elif join:
                    previous_last = None
                    unfilmed.append(job.index + 1)
                else:
                    previous_last = None
                continue
            if not job.cached and not job.external and (seg.prompt or "").strip():
                broken = _prompt_errors(seg)
                if broken:
                    seg.status = "error"
                    seg.error = (
                        f"clip {job.index + 1}'s prompt breaks the format, so nothing of it "
                        f"was rendered: {broken}. Fix the prompt, or write it again."
                    )
                    run_notes.append(f"WARNING: {seg.error}")
                    _send(
                        PROGRESS_EVENT,
                        {
                            "node_id": str(node_id),
                            "phase": "segment",
                            "segment_id": seg.id,
                            "status": "error",
                            "detail": seg.error,
                        },
                    )
                    failed_indices.add(job.index)
                    previous_last = None
                    continue
            if job.will_render and is_complete(job.directory):
                same = _take_already(state, seg, job) or str(job.key)[:12]
                run_notes.append(
                    f"WARNING: clip {job.index + 1}: this press would repeat take {same} exactly -- "
                    "the seed is kept and nothing else changed, so the fingerprint is the same. "
                    "Nothing was sampled; the take already made is used. For a new take change "
                    "the seed (or its mode), the steps, the prompt or the style."
                )
                _send(
                    PROGRESS_EVENT,
                    {
                        "node_id": str(node_id),
                        "phase": "segment",
                        "segment_id": seg.id,
                        "status": "queued",
                        "detail": f"would repeat take {same}; taken from the cache instead",
                    },
                )
                job.cached = True
            if job.opens_on >= 0 and job.opens_on in failed_indices and not job.cached:
                source = run.jobs[job.opens_on]
                seg.status = "error"
                seg.error = (
                    f"clip {source.index + 1} did not render, so there is no frame for "
                    f"clip {job.index + 1} to open on"
                )
                run_notes.append(f"WARNING: {seg.error}")
                _send(
                    PROGRESS_EVENT,
                    {
                        "node_id": str(node_id),
                        "phase": "segment",
                        "segment_id": seg.id,
                        "status": "error",
                        "detail": seg.error,
                    },
                )
                failed_indices.add(job.index)
                previous_last = None
                continue
            if job.external:
                decoded_rate = _decoded_audio_rate(models)
                loaded = _load_external_clip(seg, settings, decoded_rate, run_notes)
                if loaded is None:
                    seg.status = "error"
                    seg.error = f"could not read the loaded video {seg.source_clip!r}"
                    _send(
                        PROGRESS_EVENT,
                        {
                            "node_id": str(node_id),
                            "phase": "segment",
                            "segment_id": seg.id,
                            "status": "error",
                            "detail": seg.error,
                        },
                    )
                    failed_indices.add(job.index)
                    previous_last = None
                    continue
                images, audio = loaded
                held = int(images.shape[0]) * int(images.shape[1]) * int(images.shape[2]) * 12
                if held > 2 * 1024**3:
                    run_notes.append(
                        f"NOTE: clip {job.index + 1} is {images.shape[0]} frames of loaded "
                        f"footage -- about {held / 1024**3:.1f} GB of frames held in memory, "
                        "and the joined film holds them a second time. Shorten it, or turn "
                        "join off, if the run runs out of room."
                    )
                results[seg.id] = (images, audio)
                produced[seg.id] = (images, audio)
                previous_last = images[-1:]
                try:
                    _save_jpg(job.poster_path, images[:1])
                except Exception:
                    pass
                seg.status = "ready"
                seg.cache_key = job.key
                seg.error = ""
                seg.poster = job.poster_path if os.path.isfile(job.poster_path) else ""
                seg.clip = ""
                _send(
                    PROGRESS_EVENT,
                    {
                        "node_id": str(node_id),
                        "phase": "segment",
                        "segment_id": seg.id,
                        "status": "ready",
                        "detail": "footage",
                        "poster": seg.poster,
                    },
                )
                continue
            needs_frames = True
            had_take = bool(seg.clip) and os.path.isfile(seg.clip)
            if job.cached:
                nxt = run.jobs[job.index + 1] if job.index + 1 < len(run.jobs) else None
                needs_frames = (
                    join
                    or (not results and frames_needed)
                    or (nxt is not None and nxt.will_render and nxt.opens_on >= 0)
                )
                latent = _load_latent(job.latent_path) if needs_frames else None
                meta = read_meta(job.directory)
                trims[seg.id] = int(
                    meta.get("trim", seg.sample_frames - seg.delivered_frames)
                )
                recorded = meta.get("opened_on_chain")
                chain_repeats[seg.id] = (
                    bool(recorded)
                    if recorded is not None
                    else _derived_opens_on_chain(state, seg, job)
                )
                _send(
                    PROGRESS_EVENT,
                    {
                        "node_id": str(node_id),
                        "phase": "segment",
                        "segment_id": seg.id,
                        "status": "ready",
                        "detail": "reused",
                    },
                )
            else:
                sampler_model = models_by_mode.get(seg.mode)
                if sampler_model is None:
                    seg.status = "error"
                    socket = "ref_model" if seg.mode == "ref2va" else "model"
                    family = "H3 ref2va" if seg.mode == "ref2va" else "H3 base (fl2va)"
                    seg.error = (
                        f"clip {job.index + 1} is in {seg.mode}, and no {seg.mode} model is "
                        f"connected. Wire the {family} checkpoint into {socket}, or "
                        "change the clip's mode."
                    )
                    run_notes.append(f"WARNING: {seg.error}")
                    _send(
                        PROGRESS_EVENT,
                        {
                            "node_id": str(node_id),
                            "phase": "segment",
                            "segment_id": seg.id,
                            "status": "error",
                            "detail": seg.error,
                        },
                    )
                    failed_indices.add(job.index)
                    previous_last = None
                    continue
                comfy.model_management.throw_exception_if_processing_interrupted()
                asked_takes = max(1, int(getattr(state, "batch_takes", 1)))
                _send(
                    PROGRESS_EVENT,
                    {
                        "node_id": str(node_id),
                        "phase": "segment",
                        "segment_id": seg.id,
                        "status": "generating",
                        "take": 1,
                        "takes": asked_takes,
                    },
                )
                first_frame = previous_last if job.opens_on >= 0 else None
                ahead = run.jobs[job.opens_on] if job.opens_on >= 0 else None
                context = _tail_context(
                    job, run, seg, run_notes, models=models,
                    settings=settings, decoded_rate=0,
                ) or _motion_context(
                    job,
                    run,
                    seg,
                    run_notes,
                    loaded_av=(produced.get(ahead.segment.id) if ahead is not None else None),
                    models=models,
                )
                _t0 = time.time()
                conditioning, empty, opened_on_chain, trim = _conditioning_for(
                    job, state, models, settings, first_frame, notes=run_notes,
                    context=context,
                )
                chain_repeats[seg.id] = opened_on_chain
                run_notes.extend(_prompt_findings(seg, job.index))
                drift = seg.prompt_drift(state)
                if drift:
                    readable = {
                        "prompt_lang": "language", "camera_amplitude": "camera amplitude",
                        "camera_speed": "camera speed", "seconds": "length",
                        "max_shots": "shot count", "skills": "skills",
                        "writer_model": "writing model", "writer_seed": "writer seed",
                        "writer_temperature": "writer temperature",
                    }
                    took = max(1, int(getattr(state, "batch_takes", 1)))
                    run_notes.append(
                        f"WARNING: clip {job.index + 1}'s prompt was written before "
                        + ", ".join(readable.get(name, name) for name in drift)
                        + " changed, so this render"
                        + (f" (all {took} takes)" if took > 1 else "")
                        + " uses the older prompt. Press Process with agent to rewrite it."
                    )
                _PHASES['cond'] += time.time() - _t0
                preview = _SegmentPreview(node_id, seg.id, state, settings, seg.duration)
                _t0 = time.time()
                latent = _sample(
                    sampler_model, conditioning, empty, seg.seed, settings, preview=preview
                )
                if not preview.drew:
                    preview.notes.append(
                        "the live preview drew nothing for this clip: the callback ran "
                        f"{preview.called} time(s)"
                        + (f" and had nothing readable in it {preview.nothing_to_draw} "
                           "time(s)" if preview.nothing_to_draw else "")
                        + (f" [{'; '.join(preview.shapes)}]" if preview.shapes else "")
                        + f"; wrappers on the model: {preview.riders}."
                    )
                elif not preview.inside:
                    preview.notes.append(
                        f"the live preview drew {preview.drew} pictures from the "
                        "outermost callback rather than from inside the sampler, so an "
                        "accelerator that samples twice holds them back to its second "
                        "pass."
                    )
                spent["sampled"] = round(time.time() - _t0, 2)
                _PHASES['sample'] += time.time() - _t0
                for note in preview.notes:
                    run_notes.append(f"NOTE: {note}")
                _store_latent(job.latent_path, latent)
                write_meta(
                    job,
                    opened_on_chain=opened_on_chain,
                    trim=trim,
                    settings=settings,
                    model=(mode_ids or {}).get(seg.mode, ""),
                )
                trims[seg.id] = trim
            if needs_frames:
                _t0 = time.time()
                images = _decode_video(models["vae"], latent)
                height, width = int(images.shape[1]), int(images.shape[2])
                if (width, height) != (settings.width, settings.height):
                    seg.status = "error"
                    seg.error = (
                        f"clip {job.index + 1} keeps a take rendered at {width}x{height}, "
                        f"and the board is {settings.width}x{settings.height}. Unlock the "
                        "clip to render it at this canvas, or put the canvas back."
                    )
                    run_notes.append(f"WARNING: {seg.error}")
                    _send(
                        PROGRESS_EVENT,
                        {
                            "node_id": str(node_id),
                            "phase": "segment",
                            "segment_id": seg.id,
                            "status": "error",
                            "detail": seg.error,
                        },
                    )
                    failed_indices.add(job.index)
                    previous_last = None
                    continue
                _tv = time.time()
                audio = _decode_audio(models.get("audio_vae"), latent)
                _PHASES.setdefault("per_clip", []).append(
                    (job.index + 1, round(_tv - _t0, 1), round(time.time() - _tv, 1))
                )
                images, audio = motion.trim_run(
                    images, audio, trims.get(seg.id, 0), backward=bool(seg.carried_tail)
                )
                if spent:
                    spent["decoded"] = round(time.time() - _t0, 2)
                _PHASES['decode'] += time.time() - _t0
                results[seg.id] = (images, audio)
                produced[seg.id] = (images, audio)
                previous_last = images[-1:] if getattr(images, "shape", None) is not None else None
            else:
                previous_last = None
            if not job.cached:
                _write_artifacts(job, images, audio)
                filed_now = _file_take_now(state, seg, job, settings, mode_ids, checkpoints,
                                           cache_key=job.key, spent=spent)
                extra = max(1, int(getattr(state, "batch_takes", 1))) - 1
                for offset in range(1, extra + 1):
                    if not needs_frames:
                        break
                    comfy.model_management.throw_exception_if_processing_interrupted()
                    variant_seed = int(seg.seed) + offset
                    variant = _variant_job(
                        job, state, variant_seed, settings, mode_ids, file_ids
                    )
                    if variant is None or os.path.isfile(variant.clip_path):
                        continue
                    _send(
                        PROGRESS_EVENT,
                        {"node_id": str(node_id), "phase": "segment",
                         "segment_id": seg.id, "status": "generating",
                         "take": offset + 1, "takes": extra + 1,
                         "detail": f"take {offset + 1} of {extra + 1}, seed {variant_seed}"},
                    )
                    _t0 = time.time()
                    v_latent = _sample(
                        sampler_model, conditioning, empty, variant_seed, settings,
                        preview=_SegmentPreview(node_id, seg.id, state, settings, seg.duration),
                    )
                    v_spent = {"sampled": round(time.time() - _t0, 2)}
                    _PHASES['sample'] += time.time() - _t0
                    _t0 = time.time()
                    v_images = _decode_video(models["vae"], v_latent)
                    v_audio = _decode_audio(models.get("audio_vae"), v_latent)
                    v_images, v_audio = motion.trim_run(
                        v_images, v_audio, trims.get(seg.id, 0),
                        backward=bool(seg.carried_tail),
                    )
                    v_spent["decoded"] = round(time.time() - _t0, 2)
                    _PHASES['decode'] += time.time() - _t0
                    _store_latent(variant.latent_path, v_latent)
                    _write_artifacts(variant, v_images, v_audio)
                    write_meta(
                        variant, opened_on_chain=opened_on_chain, trim=trims.get(seg.id, 0),
                        settings=settings, model=(mode_ids or {}).get(seg.mode, ""),
                    )
                    batch_takes.setdefault(job.index, []).append(
                        {"path": variant.clip_path, "seed": variant_seed,
                         "cache_key": variant.key}
                    )
                    _file_take_now(
                        state, seg, job, settings, mode_ids, checkpoints,
                        source=variant.clip_path, seed=variant_seed,
                        cache_key=variant.key, variant=True, spent=v_spent,
                    )
            seg.error = ""
            if not job.cached:
                seg.take_key = job.key
            takes_render = bool(state.new_take_to_timeline) and not job.cached and not seg.locked
            keeps_take = had_take and not takes_render
            played_before = seg.clip
            if keeps_take:
                if not job.cached and filed_now:
                    run_notes.append(
                        f"Clip {job.index + 1}: the new take ({filed_now}) is in the "
                        "gallery and the timeline still plays the one it had"
                        + (" (the lock is holding it)" if seg.locked else "")
                        + " — open the gallery on this clip to watch them side by side and "
                        "put this one on the timeline if you want it."
                    )
                elif not job.cached:
                    run_notes.append(
                        f"WARNING: Clip {job.index + 1}: the render repeated a take the gallery "
                        f"already holds ({str(job.key)[:12]}), so nothing new was filed."
                    )
            else:
                seg.status = "ready"
                seg.cache_key = job.key
                seg.poster = job.poster_path if os.path.isfile(job.poster_path) else ""
                seg.clip = job.clip_path if os.path.isfile(job.clip_path) else ""
                seg.made_tail_at = seg.tail_at if seg.carried_tail else 0
                seg.made_context_at = seg.context_at if seg.takes_from_front else 0
                seg.made_frames = seg.delivered_frames
            film_from, film_where = film_source(
                seg.clip, job.take_dir, job.clip_path, has_render=True
            )
            if join and keeps_take and film_from != FILM_FROM_RENDER:
                try:
                    keep_images, keep_audio, opened = _timeline_footage(
                        seg,
                        film_from,
                        film_where,
                        models,
                        settings,
                        f"clip {job.index + 1}",
                        run_notes,
                        lambda: _derived_opens_on_chain(state, seg, job),
                    )
                    results[seg.id] = (keep_images, keep_audio)
                    chain_repeats[seg.id] = opened
                except Exception as err:
                    run_notes.append(
                        f"NOTE: clip {job.index + 1} keeps the take the timeline plays"
                        + (" because it is locked" if seg.locked else "")
                        + f", and that take could not be read back for the film ({err}), "
                        "so the film below carries this run's own frames instead. The "
                        "timeline is unchanged."
                    )
            elif not job.cached and same_file(played_before, job.clip_path):
                run_notes.append(
                    f"WARNING: clip {job.index + 1} rendered under the same key as the "
                    f"take the timeline was playing ({job.key}), so it wrote over it "
                    "instead of standing beside it in the gallery. Change the seed for a "
                    "take that keeps the old one."
                )
            _send(
                PROGRESS_EVENT,
                {
                    "node_id": str(node_id),
                    "phase": "segment",
                    "segment_id": seg.id,
                    "status": seg.status if keeps_take else "ready",
                    "poster": seg.poster,
                    "clip": seg.clip,
                    **({"cost": {
                        "tokens": sequence_tokens(
                            settings.width, settings.height, seg.sample_frames
                        ),
                        "seconds": spent["sampled"],
                        "steps": int(settings.steps),
                    }} if spent.get("sampled") else {}),
                },
            )
        if unfilmed:
            many = len(unfilmed) > 1
            run_notes.append(
                f"WARNING: the film below is missing clip{'s' if many else ''} "
                f"{_clip_ranges(unfilmed)} -- {'they are' if many else 'it is'} not in "
                f"this run, the timeline names no file for {'them' if many else 'it'} "
                "and there is no take in the cache."
            )
        return results, chain_repeats, batch_takes
def _directives(raw) -> dict:
    try:
        data = json.loads(raw) if isinstance(raw, str) and raw.strip() else {}
    except (ValueError, TypeError):
        return {}
    if not isinstance(data, dict):
        return {}
    out = {}
    for name in ("only", "force"):
        value = data.get(name)
        if isinstance(value, list) and value:
            ids = set()
            for item in value:
                try:
                    ids.add(int(item))
                except (TypeError, ValueError):
                    continue
            if ids:
                out[name] = ids
    if isinstance(data.get("reference_take"), dict):
        out["reference_take"] = data["reference_take"]
    film = data.get("film")
    if isinstance(film, str) and film:
        out["film"] = film
    return out
def _fill_references(images: dict, labels: dict, width: int, height: int, notes) -> dict:
    from ..vig.cutter.refsize import fill_size
    named = {label: tag for tag, label in labels.items()}
    out = {}
    for index, (name, image) in enumerate(images.items(), start=1):
        size = None
        if image is not None and getattr(image, "ndim", 0) == 4:
            size = fill_size(image.shape[2], image.shape[1], width, height)
        if not size:
            out[name] = image
            continue
        import comfy.utils
        to_w, to_h = size
        samples = image[:1, :, :, :3].movedim(-1, 1)
        grown = comfy.utils.common_upscale(samples, to_w, to_h, "lanczos", "disabled")
        out[name] = grown.movedim(1, -1).clamp(0.0, 1.0)
        tag = named.get(f"<Picture {index}>", "")
        if notes is not None:
            notes.append(
                f"{'@' + tag if tag else f'<Picture {index}>'} is {image.shape[2]}x{image.shape[1]}, "
                f"smaller than the {width}x{height} frame, so it was enlarged to {to_w}x{to_h} "
                "before H3 -- H3 only shrinks a reference, and at its own size its finer "
                "features would not survive the VAE. A larger picture is still better."
            )
    return out
def _reference_fills(board: Board, settings) -> dict:
    from PIL import Image
    from ..vig.cutter.refsize import fill_size
    width = int(getattr(settings, "width", 0) or 0)
    height = int(getattr(settings, "height", 0) or 0)
    fills: dict = {}
    if not width or not height:
        return fills
    for seg in board.segments:
        if seg.mode != spec.REF2VA:
            continue
        tags = set(board.cited_tags(seg))
        pictures = [ref for ref in seg.refs if ref.kind == "image"]
        pictures += [ref for ref in board.library if ref.tag in tags and ref.kind == "image"]
        seen, grown = set(), []
        for ref in pictures:
            if not ref.source or ref.source in seen:
                continue
            seen.add(ref.source)
            path = _resolve_media(ref.source)
            if not path:
                continue
            try:
                with Image.open(path) as handle:
                    w, h = handle.size
                    if (handle.getexif() or {}).get(0x0112) in (5, 6, 7, 8):
                        w, h = h, w
            except Exception:
                continue
            if fill_size(w, h, width, height):
                grown.append(f"{ref.source}:{w}x{h}")
        if grown:
            fills[f"refs:{seg.id}"] = ";".join(grown)
    return fills
def _external_file_ids(board: Board, settings=None) -> dict:
    ids: dict = {}
    for seg in board.segments:
        if not seg.external:
            continue
        path = _resolve_media(seg.source_clip)
        identity = f"file:{seg.source_clip}"
        if path:
            try:
                stat = os.stat(path)
                identity = f"file:{seg.source_clip}:{stat.st_mtime_ns}:{stat.st_size}"
            except OSError:
                pass
        ids[seg.id] = identity
    if settings is not None:
        try:
            ids.update(_reference_fills(board, settings))
        except Exception:
            pass
    return ids
def _take_already(state, seg, job) -> str:
    root = (getattr(state, "project_dir", "") or "").strip()
    if not root or not os.path.isdir(root):
        return ""
    try:
        folder = project_folder.folder_for(root, job.index, seg.name, seg.id)
        if not folder:
            return ""
        video_dir = os.path.join(root, project_folder.CLIPS_DIR, folder, project_folder.VIDEO_SUB)
        return project_folder.take_for_key(video_dir, job.key)
    except Exception:
        return ""
def _clip_ranges(numbers) -> str:
    numbers = sorted(set(int(n) for n in numbers))
    runs: list = []
    for n in numbers:
        if runs and n == runs[-1][1] + 1:
            runs[-1][1] = n
        else:
            runs.append([n, n])
    return ", ".join(
        str(a) if a == b else f"{a}–{b}" if b > a + 1 else f"{a}, {b}" for a, b in runs
    )
def _prompt_errors(segment) -> str:
    try:
        from ..vig.prompt.validator import validate
        result = validate(segment.prompt, segment.effective_mode, duration=segment.duration)
    except Exception:
        return ""
    errors = list(result.errors)
    if not errors:
        return ""
    said = "; ".join(f"[{v.code}] {v.message}" for v in errors[:3])
    return said + (f" (+{len(errors) - 3} more)" if len(errors) > 3 else "")
def _prompt_findings(segment, index: int) -> list[str]:
    out: list[str] = []
    try:
        from ..vig.prompt.validator import validate
        result = validate(segment.prompt, segment.effective_mode, duration=segment.duration)
        for violation in result.violations[:3]:
            out.append(
                f"Clip {index + 1} prompt: [{violation.code}] {violation.message}"
            )
        if len(result.violations) > 3:
            out.append(
                f"Clip {index + 1} prompt: {len(result.violations) - 3} more finding(s)."
            )
    except Exception:
        pass
    return out
def _canvas_from_opening_image(board: Board, budget_width: int, budget_height: int):
    seg = board.segments[0] if board.segments else None
    if seg is None:
        return None
    source = ""
    for ref in seg.refs:
        if ref.kind == "image" and ref.resolved and ref.uid.startswith("first"):
            source = ref.source
            break
    if not source:
        from ..vig.cutter.state import cited_tag_names
        by_tag = {ref.tag: ref for ref in board.library if ref.tag}
        for tag in cited_tag_names(seg.prompt):
            ref = by_tag.get(tag)
            if ref is not None and ref.kind == "image" and ref.resolved:
                source = ref.source
                break
    if not source:
        return None
    path = _resolve_media(source)
    if not path:
        return None
    try:
        from PIL import Image, ImageOps
        with Image.open(path) as handle:
            image_width, image_height = ImageOps.exif_transpose(handle).size
    except Exception:
        return None
    from ..vig.timing import canvas_for_ratio
    return canvas_for_ratio(image_width, image_height, budget_width, budget_height)
def _canvas_from_latent(latent):
    if not isinstance(latent, dict):
        return None
    shape = getattr(latent.get("samples"), "shape", None)
    if shape is None or len(shape) < 3:
        return None
    try:
        ratio = int(latent.get("downscale_ratio_spacial") or 8)
    except (TypeError, ValueError):
        ratio = 8
    from ..vig.timing import snap_canvas
    return snap_canvas(int(shape[-1]) * ratio, int(shape[-2]) * ratio)
def _assemble(results: dict, state: Board, join: bool, chain_repeats: dict | None = None):
    from .chaining import join_all, levels_report
    chain_repeats = chain_repeats or {}
    spans = state.film_spans
    ordered = [
        (seg, results[seg.id]) for seg in state.segments if seg.id in results
    ]
    if not ordered:
        return None, None, 0, ""
    def voice(seg, pair):
        images, audio = pair
        start, end = spans.get(seg.id, (0, 0))
        images, audio = motion.cut_streams(images, audio, int(end))
        images, audio = motion.trim_streams(images, audio, int(start))
        return images, (audio if seg.audio else _silence(audio))
    if not join:
        images, audio = voice(*ordered[0])
        return images, audio, int(getattr(images, "shape", [0])[0]), ""
    voiced = [(seg, voice(seg, pair)) for seg, pair in ordered]
    positions = {seg.id: i + 1 for i, seg in enumerate(state.segments)}
    sound_report = levels_report(
        [
            (
                f"clip {positions.get(seg.id, '?')}"
                + (f" '{seg.name}'" if seg.name else ""),
                audio,
            )
            for seg, (_, audio) in voiced
        ]
    )
    clips = []
    for at, (seg, (images, audio)) in enumerate(voiced):
        before = voiced[at - 1][0] if at else None
        adjacent = before is not None and (
            positions.get(seg.id, 0) == positions.get(before.id, -2) + 1
        )
        continues = adjacent and (
            seg.takes_from_front or bool(getattr(before, "carried_tail", 0))
        )
        clips.append((
            images,
            audio,
            bool(chain_repeats.get(seg.id)) and not spans.get(seg.id, (0, 0))[0],
            continues,
        ))
    images, audio, frames, seam_notes = join_all(clips)
    if seam_notes:
        lines = "\n".join(seam_notes)
        sound_report = f"{sound_report}\n{lines}".strip() if sound_report else lines
    return images, audio, frames, sound_report
def _mix_track(audio, state: Board, join: bool):
    if not state.audio_clips:
        return audio, "Audio track: empty."
    if audio is None:
        return audio, "Audio track: skipped -- the film has no soundtrack to lay it over."
    if not join:
        return audio, (
            "Audio track: skipped -- it is laid over the whole film, and `join` is off, "
            "so there is no whole film to lay it over."
        )
    rate = int(audio.get("sample_rate") or 0)
    waveform = audio.get("waveform")
    if not rate or waveform is None:
        return audio, "Audio track: skipped -- the film's soundtrack has no sample rate."
    film_seconds = int(waveform.shape[-1]) / rate
    plan = mixer.placements(state.audio_clips, film_seconds)
    track = mixer.track_seconds(state.audio_clips)
    lines = []
    if abs(track - film_seconds) > 0.5:
        lines.append(
            f"  the track runs {track:.2f} s against the film's {film_seconds:.2f} s; "
            "what falls past the end is not mixed."
        )
    mixed, notes = mixer.mix(waveform[0], rate, plan, _overlay_loader())
    report = mixer.describe(plan, notes)
    if lines:
        report = "\n".join([report] + lines)
    if not plan:
        return audio, report
    return {"waveform": mixed[None], "sample_rate": rate}, report
def _overlay_loader():
    def load(source, sample_rate, seconds):
        try:
            waveform, rate = _read_audio_file(source)
            if int(rate) == int(sample_rate):
                return waveform
            import torchaudio
            return torchaudio.functional.resample(waveform, int(rate), int(sample_rate))
        except Exception as exc:
            print(f"[VIG H3 Cutter] could not read the audio {source!r}: {exc}")
            return None
    return load
def _read_audio_file(source: str):
    from comfy_extras.nodes_audio import load as read
    path = _resolve_media(source)
    if not path:
        raise FileNotFoundError(source)
    return read(path)
def _silence(audio):
    if audio is None:
        return None
    try:
        return {"waveform": audio["waveform"] * 0, "sample_rate": audio["sample_rate"]}
    except Exception:
        return audio
def loader_file_for(graph: dict, node_id, socket: str) -> str:
    if not isinstance(graph, dict):
        return ""
    for _origin, node, _selector, _warning in _walk_model(graph, node_id, socket):
        inputs = node.get("inputs") or {}
        for key in ("unet_name", "ckpt_name", "model_name"):
            name = inputs.get(key)
            if isinstance(name, str) and name:
                return name
    return ""
def _is_link(value) -> bool:
    return (
        isinstance(value, (list, tuple))
        and len(value) == 2
        and isinstance(value[0], (str, int))
        and not isinstance(value[0], bool)
        and isinstance(value[1], int)
        and not isinstance(value[1], bool)
    )
_SELECTOR_KEYS = ("select", "Input", "input", "index", "selected", "selection", "switch")
def _selector_value(graph: dict, value):
    if _is_link(value):
        source = (graph.get(str(value[0])) or {}).get("inputs") or {}
        scalars = [v for v in source.values() if not _is_link(v) and not isinstance(v, (dict, list))]
        value = scalars[0] if len(scalars) == 1 else None
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip()
    if text.isdigit():
        return int(text)
    tail = re.search(r"(\d+)$", text)
    return int(tail.group(1)) if tail else text
def _model_wire(graph: dict, node: dict) -> tuple:
    inputs = node.get("inputs") or {}
    if _is_link(inputs.get("model")):
        return inputs["model"], "", ""
    links = {key: value for key, value in inputs.items() if _is_link(value)}
    if not links:
        return None, "", ""
    if len(links) == 1:
        return next(iter(links.values())), "", ""
    cls = str(node.get("class_type") or "?")
    for key in _SELECTOR_KEYS:
        if key not in inputs:
            continue
        chosen = _selector_value(graph, inputs[key])
        if chosen is None or isinstance(chosen, bool):
            break
        if isinstance(chosen, int):
            for name, link in sorted(links.items()):
                tail = re.search(r"(\d+)$", name)
                if tail and int(tail.group(1)) == chosen:
                    return link, f"{key}={chosen}", ""
        elif str(chosen) in links:
            return links[str(chosen)], f"{key}={chosen}", ""
        break
    flags = [(key, _selector_value(graph, value) if _is_link(value) else value)
             for key, value in inputs.items() if _is_link(value) or isinstance(value, bool)]
    for key, flag in flags:
        if not isinstance(flag, bool):
            continue
        want = "true" if flag else "false"
        for name, link in sorted(links.items()):
            if want in name.lower():
                return link, f"{key}={flag}", ""
    name, link = sorted(links.items())[0]
    if "any switch" in cls.lower():
        return link, f"first={name}", ""
    return link, f"first={name}", (
        f"{cls} has {len(links)} wires in and no selector this walk understands, "
        f"so the one on `{name}` was followed -- the models behind the others are "
        "not in the fingerprint."
    )
def _walk_model(graph: dict, node_id, socket: str):
    link = ((graph.get(str(node_id)) or {}).get("inputs") or {}).get(socket)
    seen: set = set()
    while isinstance(link, (list, tuple)) and link:
        origin_id = str(link[0])
        if origin_id in seen:
            return
        seen.add(origin_id)
        node = graph.get(origin_id) or {}
        link, selector, warning = _model_wire(graph, node)
        yield origin_id, node, selector, warning
def model_walk_notes(graph: dict, node_id, socket: str) -> list:
    if not isinstance(graph, dict):
        return []
    return [f"WARNING: `{socket}`: {warning}"
            for _origin, _node, _selector, warning in _walk_model(graph, node_id, socket)
            if warning]
def _stack_settings(inputs: dict, prefix: str = "") -> list:
    out = []
    for key, value in sorted((inputs or {}).items()):
        if not prefix and key == "model":
            continue
        if _is_link(value):
            continue
        name = f"{prefix}{key}"
        if isinstance(value, dict):
            out.extend(_stack_settings(value, f"{name}."))
        elif isinstance(value, (list, tuple)):
            out.extend(
                _stack_settings({str(at): item for at, item in enumerate(value)}, f"{name}.")
            )
        elif value is None:
            continue
        else:
            out.append(f"{name}={value}")
    return out
def model_stack_identity(graph: dict, node_id, socket: str) -> str:
    if not isinstance(graph, dict):
        return ""
    parts: list = []
    for _origin, node, selector, _warning in _walk_model(graph, node_id, socket):
        inputs = node.get("inputs") or {}
        settings = _stack_settings(inputs)
        if selector:
            settings.append(selector)
        parts.append(str(node.get("class_type") or "?") + "(" + ",".join(settings) + ")")
    return "stack:" + "|".join(parts)
def models_report_line(base_file: str, ref_file: str, ref_wired: bool) -> str:
    base = base_file or "the connected model"
    ref = ref_file or ("the connected model" if ref_wired else "not wired")
    return f"Models: t2va/i2va/fl2va/l2va <- {base} | ref2va <- {ref}"
def checkpoint_family_notes(graph: dict, node_id, board: Board) -> list:
    notes = []
    base_modes_used = sorted(
        {seg.mode for seg in board.segments if seg.mode != spec.REF2VA and not seg.external}
    )
    ref_used = any(seg.mode == spec.REF2VA and not seg.external for seg in board.segments)
    base_file = loader_file_for(graph, node_id, "model")
    if base_file and "ref2va" in base_file.lower() and base_modes_used:
        notes.append(
            f"WARNING: the `model` socket carries {base_file!r} -- the ref2va "
            f"checkpoint -- and this board has {', '.join(base_modes_used)} clips. "
            "Sampled on those weights, an opening frame binds as a loose reference "
            "(same subject, different scene), not as frame 0. Wire the "
            "minimax_h3_fl2va checkpoint into `model`; the ref2va file belongs on "
            "`ref_model`."
        )
    ref_file = loader_file_for(graph, node_id, "ref_model")
    if ref_file and "ref2va" not in ref_file.lower() and ref_used:
        notes.append(
            f"WARNING: the `ref_model` socket carries {ref_file!r}, which does not "
            "look like the ref2va checkpoint, and this board has ref2va clips. "
            "Reference conditioning sampled on base weights loses the references; "
            "wire the minimax_h3_ref2va checkpoint here."
        )
    return notes
def _model_identity(model) -> str:
    for attr in ("model", "patcher"):
        inner = getattr(model, attr, None)
        if inner is not None:
            return f"{type(inner).__name__}:{id(type(inner))}"
    return type(model).__name__
def _resolve_media(path: str) -> str:
    if not path:
        return ""
    if os.path.isabs(path):
        return path if os.path.isfile(path) else ""
    try:
        import folder_paths
        candidate = os.path.join(folder_paths.get_input_directory(), path)
    except Exception:
        return ""
    return candidate if os.path.isfile(candidate) else ""
def _copy_current(source: str, target: str) -> None:
    try:
        if (
            os.path.isfile(target)
            and os.path.getsize(target) == os.path.getsize(source)
            and os.path.getmtime(target) >= os.path.getmtime(source)
        ):
            return
    except OSError:
        pass
    shutil.copy2(source, target)
def _asset_loader():
    def load(ref):
        try:
            path = _resolve_media(ref.source)
            if not path:
                return None
            if ref.kind == "audio":
                return _load_audio(path)
            if ref.kind == "video":
                images, audio, _ = _load_video(path)
                return images, audio
            return _load_image(path)
        except Exception:
            return None
    return load
def _load_image(path):
    import numpy
    import torch
    from PIL import Image, ImageOps
    with Image.open(path) as handle:
        image = ImageOps.exif_transpose(handle).convert("RGB")
        array = numpy.array(image).astype(numpy.float32) / 255.0
    return torch.from_numpy(array)[None,]
def _load_audio(path):
    waveform, rate = _read_audio_file(path)
    return {"waveform": waveform.unsqueeze(0), "sample_rate": int(rate)}
def _load_video(path):
    from comfy_api.input_impl import VideoFromFile
    video = VideoFromFile(path)
    components = video.get_components()
    return components.images, components.audio, float(components.frame_rate or FPS)
def _decoded_audio_rate(models) -> int:
    audio_vae = models.get("audio_vae") if models else None
    if audio_vae is None:
        return 0
    return int(
        getattr(
            audio_vae,
            "audio_sample_rate_output",
            getattr(audio_vae, "audio_sample_rate", 0),
        )
        or 0
    )
def _fit_canvas(frames, settings, label, notes):
    import torch
    have_h, have_w = int(frames.shape[1]), int(frames.shape[2])
    want_w, want_h = int(settings.width), int(settings.height)
    if (have_w, have_h) == (want_w, want_h):
        return frames
    scale = min(want_w / have_w, want_h / have_h)
    new_w = max(1, int(round(have_w * scale)))
    new_h = max(1, int(round(have_h * scale)))
    work = frames.movedim(-1, 1).float()
    work = torch.nn.functional.interpolate(
        work, size=(new_h, new_w), mode="bilinear",
        align_corners=False, antialias=scale < 1,
    )
    out = work.movedim(1, -1)
    bars = ""
    if (new_w, new_h) != (want_w, want_h):
        board = torch.zeros(
            (int(frames.shape[0]), want_h, want_w, int(frames.shape[3])),
            dtype=out.dtype,
        )
        top = (want_h - new_h) // 2
        left = (want_w - new_w) // 2
        board[:, top:top + new_h, left:left + new_w] = out
        bars = f"{top}px of black above and below" if top else f"{left}px of black either side"
        out = board
    if notes is not None:
        notes.append(
            f"NOTE: {label}'s take is {have_w}x{have_h} and the film is "
            f"{want_w}x{want_h}, so it was scaled to {new_w}x{new_h}"
            + (f" with {bars}" if bars else "")
            + " to go into the film. The take itself is untouched."
        )
    return out
def _timeline_footage(seg, what, where, models, settings, label, notes, derive_chain):
    if what == FILM_FROM_LATENT:
        kept = _load_latent(os.path.join(where, LATENT_FILE))
        images = _decode_video(models["vae"], kept)
        audio = _decode_audio(models.get("audio_vae"), kept)
        images = _fit_canvas(images, settings, label, notes)
        meta = read_meta(where)
        images, audio = motion.trim_run(
            images,
            audio,
            int(meta.get("trim", seg.sample_frames - seg.delivered_frames)),
            backward=bool(seg.carried_tail),
        )
        recorded = meta.get("opened_on_chain")
        return images, audio, (
            bool(recorded) if recorded is not None else derive_chain()
        )
    if what != FILM_FROM_FILE:
        raise ValueError(f"there is no footage of this kind to read ({what!r})")
    wanted = _resolve_media(where)
    if not wanted:
        raise ValueError(f"{where} is not a file this server can read")
    frames, audio, _fps = _load_video(wanted)
    if frames is None or int(getattr(frames, "shape", [0])[0]) == 0:
        raise ValueError(f"{os.path.basename(wanted)} has no frames")
    frames = _fit_canvas(frames, settings, label, notes)
    have = int(frames.shape[0])
    if have != seg.delivered_frames and notes is not None:
        notes.append(
            f"NOTE: {label} plays a take of {have} frames where the board says "
            f"{seg.delivered_frames}. The film uses the take as it is, so it "
            f"runs {(have - seg.delivered_frames) / FPS:+.2f} s against the cut."
        )
    rate = int((audio or {}).get("sample_rate") or 0)
    wants = _decoded_audio_rate(models)
    if (
        audio is not None
        and audio.get("waveform") is not None
        and rate
        and wants
        and rate != wants
    ):
        import torchaudio
        audio = {
            "waveform": torchaudio.functional.resample(audio["waveform"], rate, wants),
            "sample_rate": wants,
        }
    return frames.clamp(0, 1), audio, derive_chain()
def _load_external_clip(segment, settings: RenderSettings, sample_rate: int = 0, notes=None):
    try:
        import torch
        path = _resolve_media(segment.source_clip)
        if not path:
            return None
        frames, audio, source_fps = _load_video(path)
        if frames is None or int(getattr(frames, "shape", [0])[0]) == 0:
            return None
        wanted = segment.frames
        have = int(frames.shape[0])
        source_fps = float(source_fps) or FPS
        indices = (torch.arange(wanted, dtype=torch.float64) * (source_fps / FPS)).round().long()
        short = int((indices > have - 1).sum())
        frames = frames[indices.clamp(max=have - 1)]
        if notes is not None:
            file_seconds = have / source_fps
            clip_seconds = wanted / FPS
            if short:
                notes.append(
                    f"WARNING: {segment.source_clip!r} is {file_seconds:.2f} s and clip "
                    f"{segment.id} is {clip_seconds:.2f} s, so its last {short / FPS:.2f} s "
                    "hold on the file's final frame. Shorten the clip to match the file."
                )
            elif file_seconds - clip_seconds > 1.0 / FPS:
                notes.append(
                    f"NOTE: {segment.source_clip!r} is {file_seconds:.2f} s; clip "
                    f"{segment.id} plays its first {clip_seconds:.2f} s at the file's own "
                    "speed. Lengthen the clip to keep more of it."
                )
        height, width = int(frames.shape[1]), int(frames.shape[2])
        if (width, height) != (settings.width, settings.height):
            resized = torch.nn.functional.interpolate(
                frames.movedim(-1, 1),
                size=(settings.height, settings.width),
                mode="bilinear",
                antialias=True,
            )
            frames = resized.movedim(1, -1).clamp(0, 1)
        seconds = wanted / FPS
        if audio is not None and audio.get("waveform") is not None:
            rate = int(audio.get("sample_rate") or 0)
            if rate and sample_rate and rate != sample_rate:
                try:
                    import torchaudio
                    audio = {
                        "waveform": torchaudio.functional.resample(
                            audio["waveform"], rate, int(sample_rate)
                        ),
                        "sample_rate": int(sample_rate),
                    }
                    rate = int(sample_rate)
                except Exception as exc:
                    if notes is not None:
                        notes.append(
                            f"WARNING: the sound of {segment.source_clip!r} is at {rate} Hz "
                            f"and this render decodes at {sample_rate} Hz, and it could not "
                            f"be resampled ({exc}). The clip is laid in without its sound."
                        )
                    audio, rate = None, 0
            if rate:
                span = int(round(seconds * rate))
                waveform = audio["waveform"]
                if waveform.shape[-1] > span:
                    waveform = waveform[..., :span]
                elif waveform.shape[-1] < span:
                    pad = torch.zeros(
                        (*waveform.shape[:-1], span - waveform.shape[-1]),
                        dtype=waveform.dtype,
                    )
                    waveform = torch.cat([waveform, pad], dim=-1)
                audio = {"waveform": waveform, "sample_rate": rate}
            else:
                audio = None
        return frames, audio
    except Exception as exc:
        print(f"[VIG H3 Cutter] could not read the loaded video {segment.source_clip!r}: {exc}")
        return None
def _store_latent(path: str, latent) -> None:
    import comfy.utils
    import torch
    os.makedirs(os.path.dirname(path), exist_ok=True)
    samples = latent["samples"]
    if getattr(samples, "is_nested", False):
        video, audio = samples.unbind()
        payload = {"video": video.contiguous(), "audio": audio.contiguous()}
    else:
        payload = {"video": samples.contiguous()}
    comfy.utils.save_torch_file(
        {key: value.to(torch.float32).cpu() for key, value in payload.items()}, path
    )
def _load_latent(path: str):
    import comfy.nested_tensor
    import comfy.utils
    data = comfy.utils.load_torch_file(path, safe_load=True)
    if "audio" in data:
        return {"samples": comfy.nested_tensor.NestedTensor((data["video"], data["audio"]))}
    return {"samples": data["video"]}
def _variant_job(job, board, seed: int, settings, mode_ids, file_ids):
    from dataclasses import replace
    segments = list(board.segments)
    try:
        at = next(i for i, s in enumerate(segments) if s.id == job.segment.id)
    except StopIteration:
        return None
    segments[at] = replace(segments[at], seed=int(seed))
    keys = replace(board, segments=segments).fingerprints(
        settings.digest(), mode_ids, file_ids
    )
    key = keys.get(job.segment.id) or ""
    if not key or key == job.key:
        return None
    root = os.path.dirname(job.directory)
    return replace(job, key=key, directory=os.path.join(root, key), cached=False)
def _write_artifacts(job, images, audio) -> None:
    try:
        _save_png(job.last_frame_path, images[-1:])
        _save_jpg(job.poster_path, images[:1])
        _save_clip(job.clip_path, images, audio)
    except Exception as exc:
        print(f"[VIG H3 Cutter] could not write the previews for clip {job.index + 1}: {exc}")
def _save_png(path: str, image) -> None:
    import numpy
    from PIL import Image
    os.makedirs(os.path.dirname(path), exist_ok=True)
    array = (image[0].cpu().numpy() * 255.0).clip(0, 255).astype(numpy.uint8)
    Image.fromarray(array).save(path, compress_level=4)
def _save_jpg(path: str, image, width: int = 320) -> None:
    import numpy
    from PIL import Image
    os.makedirs(os.path.dirname(path), exist_ok=True)
    array = (image[0].cpu().numpy() * 255.0).clip(0, 255).astype(numpy.uint8)
    frame = Image.fromarray(array)
    if frame.width > width:
        frame = frame.resize((width, max(1, round(frame.height * width / frame.width))))
    frame.save(path, quality=82)
def _save_clip(path: str, images, audio) -> None:
    from fractions import Fraction
    from comfy_api.latest import InputImpl, Types
    os.makedirs(os.path.dirname(path), exist_ok=True)
    InputImpl.VideoFromComponents(
        Types.VideoComponents(images=images, audio=audio, frame_rate=Fraction(FPS))
    ).save_to(path)
NODES = {"VigH3Cutter": (VigH3Cutter, "VIG H3 Cutter")}
