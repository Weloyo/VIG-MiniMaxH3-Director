from __future__ import annotations
import json
from ..vig import storyboard as sb
from ..vig.director import BACKEND_EXTERNAL, DirectorSettings
from ..vig.llm.models import list_models
from ..vig.styles import library as style_library
CATEGORY = "VIG/MiniMax H3"
CARRY_CHOICES = ("22", "5", "39", "56", "0")
def _style_options() -> list[str]:
    try:
        names = sorted(style_library.all_styles().keys())
    except Exception:
        return ["neutral"]
    return ["neutral"] + [name for name in names if name != "neutral"]
def _known_models() -> str:
    try:
        found = list_models("")
    except Exception:
        found = []
    return ", ".join(found[:6]) if found else "none on the default path"
class VigH3FilmDirector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "script": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "tooltip": (
                            "The whole film, in your own words and any language. Blank "
                            "lines or a numbered list are taken as YOUR beat divisions "
                            "and kept; plain prose is split at sentence boundaries."
                        ),
                    },
                ),
                "beat_seconds": (
                    "INT",
                    {
                        "default": sb.DEFAULT_BEAT_SECONDS,
                        "min": 1,
                        "max": 15,
                        "tooltip": "How long one beat runs. H3 samples at most 15 s a clip.",
                    },
                ),
                "total_seconds": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 3600,
                        "tooltip": (
                            "A length to fit the film to, or 0 for as long as the story "
                            "needs. A target only ever MERGES beats -- a story is not "
                            "padded by cutting it."
                        ),
                    },
                ),
                "style": (_style_options(), {"default": "neutral"}),
                "carry_frames": (
                    CARRY_CHOICES,
                    {
                        "default": "22",
                        "tooltip": (
                            "Frames each beat hands the next one, so the cut continues "
                            "the movement instead of restarting it. 0 makes every beat "
                            "open on a still."
                        ),
                    },
                ),
                "allow_music": ("BOOLEAN", {"default": False}),
                "title": ("STRING", {"default": "", "multiline": False}),
                "references": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "tooltip": (
                            "One a line: @R1 = ivan.png -- Ivan, the courier. The file "
                            "is a path under ComfyUI's input folder; the words after "
                            "the dash are what the asset IS, which is what the writer "
                            "is told. They reach the Cutter's library as @tags."
                        ),
                    },
                ),
            },
            "optional": {
                "llm_model": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": (
                            "The .gguf to write with, by file name. Empty takes the "
                            "first model found. On the default path now: "
                            + _known_models()
                        ),
                    },
                ),
                "models_dir": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": "A folder to look in as well as ComfyUI's own.",
                    },
                ),
                "use_provider": ("BOOLEAN", {"default": False}),
                "provider_url": ("STRING", {"default": "http://localhost:1234/v1"}),
                "provider_model": ("STRING", {"default": ""}),
                "writer_seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 0xFFFFFFFF,
                        "tooltip": "Change it for another take of the same story.",
                    },
                ),
                "temperature": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05}),
                "video": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": (
                            "Footage to READ instead of writing a script: a file name "
                            "under ComfyUI's input folder, or a full path. Frames are "
                            "sampled and a vision model says what happens in them; that "
                            "becomes the script. With a script typed as well, what the "
                            "footage shows is added as context and your words lead."
                        ),
                    },
                ),
                "video_frames": (
                    "INT",
                    {
                        "default": 8,
                        "min": 2,
                        "max": 32,
                        "tooltip": (
                            "How many frames are sampled across the whole file. Each one "
                            "is a picture in the request, so this is the cost as well as "
                            "the detail."
                        ),
                    },
                ),
                "vision_model": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": (
                            "The model that LOOKS, when it is not the one that writes. "
                            "Locally a model that can see is a different file (it wants "
                            "an mmproj beside it). Empty uses the writing model."
                        ),
                    },
                ),
            },
        }
    RETURN_TYPES = ("VIG_H3_STORYBOARD", "STRING")
    RETURN_NAMES = ("storyboard", "report")
    OUTPUT_TOOLTIPS = (
        "The whole film as one value. Wire it into the Cutter's storyboard input.",
        "How the plan was made: the split, the cast, and what each beat cost.",
    )
    FUNCTION = "execute"
    CATEGORY = CATEGORY
    DESCRIPTION = (
        "Plans a whole film: splits the script into beats, fixes the cast once so the "
        "same person is described in the same words in every clip, and writes each "
        "beat's H3 prompt knowing what the beat before it sounded like. Wire the "
        "storyboard into the Cutter."
    )
    def execute(
        self,
        script,
        beat_seconds,
        total_seconds,
        style,
        carry_frames,
        allow_music,
        title,
        references,
        llm_model="",
        models_dir="",
        use_provider=False,
        provider_url="",
        provider_model="",
        writer_seed=0,
        temperature=1.0,
        video="",
        video_frames=8,
        vision_model="",
    ):
        settings = _writer_settings(
            llm_model, models_dir, use_provider, provider_url, provider_model,
            writer_seed, temperature,
        )
        script, observed_notes, observed = _read_footage(
            settings, str(video or ""), int(video_frames), str(vision_model or ""),
            str(script or ""),
        )
        board = sb.plan(
            settings,
            str(script or ""),
            beat_seconds=int(beat_seconds),
            total_seconds=int(total_seconds),
            style=str(style or "neutral"),
            carry=int(carry_frames or 0),
            references=str(references or ""),
            title=str(title or ""),
            allow_music=bool(allow_music),
            observed=observed,
            progress=None,
        )
        if observed_notes:
            board.report = "\n".join(observed_notes + [board.report]).strip()
        payload = board.to_json()
        report = _describe(board)
        print(f"[VIG H3 Film Director]\n{report}")
        return (payload, report)
def _writer_settings(
    llm_model, models_dir, use_provider, provider_url, provider_model, seed, temperature
) -> DirectorSettings:
    settings = DirectorSettings(
        use_llm=True,
        seed=int(seed) or None,
        temperature_scale=float(temperature),
    )
    if use_provider:
        settings.llm_backend = BACKEND_EXTERNAL
        settings.server_url = str(provider_url or "").strip() or settings.server_url
        settings.model = str(provider_model or "").strip()
        settings.evict_comfy_models = False
    else:
        chosen = str(llm_model or "").strip()
        if chosen:
            settings.gguf_model = chosen
        if models_dir:
            settings.gguf_extra_dir = str(models_dir)
    return settings
def _read_footage(settings, video: str, count: int, vision_model: str, script: str):
    video = video.strip()
    if not video:
        return script, [], ""
    frames, notes = _sample_frames(video, count)
    if not frames:
        return script, notes, ""
    from dataclasses import replace
    looking = settings
    if vision_model.strip():
        looking = replace(settings, gguf_model=vision_model.strip())
    observed, seen_notes = sb.observe_footage(looking, frames)
    notes.extend(seen_notes)
    if not observed:
        return script, notes, ""
    if not script.strip():
        return observed, notes, ""
    return script, notes, observed
def _sample_frames(video: str, count: int):
    import os
    path = video
    if not os.path.isabs(path):
        try:
            import folder_paths
            path = os.path.join(folder_paths.get_input_directory(), video)
        except Exception:
            path = video
    if not os.path.isfile(path):
        return [], [f"WARNING: no footage at {path!r}, so nothing was read."]
    try:
        from comfy_api.input_impl import VideoFromFile
        images = VideoFromFile(path).get_components().images
    except Exception as exc:
        return [], [f"WARNING: {os.path.basename(path)} would not decode ({exc})."]
    total = int(getattr(images, "shape", [0])[0] or 0)
    if not total:
        return [], [f"WARNING: {os.path.basename(path)} decoded to no frames."]
    count = max(2, min(int(count), total))
    step = (total - 1) / float(count - 1) if count > 1 else 1
    picked = [images[min(total - 1, int(round(i * step)))] for i in range(count)]
    return picked, [f"Footage: {os.path.basename(path)}, {total} frames, {count} sampled."]
def _describe(board: sb.Storyboard) -> str:
    lines = [
        f"{len(board.beats)} beat(s), {board.total_seconds:.0f} s of film"
        + (f" -- {board.title}" if board.title else ""),
    ]
    for beat in board.beats:
        head = " ".join(beat.script.split())[:64]
        state = "written" if beat.prompt.strip() else "NO PROMPT"
        carry = f", carries {beat.carry}" if beat.carry else ""
        where = f", names {beat.environment}" if beat.environment else ""
        lines.append(
            f"  {beat.index + 1:>2}. {beat.seconds:>2} s {beat.mode}{carry}{where}"
            f"  [{state}]  {head}"
        )
        for note in beat.notes[:2]:
            lines.append(f"        ! {note}")
    if board.cast:
        lines.append("Cast, pinned for every beat:")
        for entry in board.cast:
            lines.append(f"  - {entry.get('name') or ''}: {entry.get('phrase') or ''}")
    if board.environments:
        lines.append("Places, pinned for every beat:")
        for entry in board.environments:
            sound = str(entry.get("sound") or "").strip()
            tone = f" -- room tone: {sound}" if sound else ""
            lines.append(f"  - {entry.get('name') or ''}: {entry.get('phrase') or ''}{tone}")
    if board.references:
        lines.append(
            "References: " + ", ".join(f"{r['tag']} {r['kind']}" for r in board.references)
        )
    if board.report:
        lines.append("")
        lines.append(board.report)
    lines.append("")
    lines.append(f"storyboard id {board.fingerprint()}")
    return "\n".join(lines)
class VigH3StoryboardText:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"storyboard": ("VIG_H3_STORYBOARD",)}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("json",)
    FUNCTION = "execute"
    CATEGORY = CATEGORY
    DESCRIPTION = "The storyboard as JSON -- to read, to save, or to edit and feed back."
    def execute(self, storyboard):
        return (json.dumps(storyboard, ensure_ascii=False, indent=2),)
class VigH3StoryboardJSON:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "source": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "tooltip": (
                            "A path to the storyboard .json file, or the JSON itself. "
                            "Editing the plan lays the timeline out again on the next "
                            "Run, over anything edited by hand -- so once the shoot "
                            "has begun, change the plan only to start over."
                        ),
                    },
                ),
            },
        }
    RETURN_TYPES = ("VIG_H3_STORYBOARD", "STRING")
    RETURN_NAMES = ("storyboard", "report")
    OUTPUT_TOOLTIPS = (
        "The whole film as one value. Wire it into the Cutter's storyboard input.",
        "The plan read back: one line per clip, and what still needs doing by hand.",
    )
    FUNCTION = "execute"
    CATEGORY = CATEGORY
    DESCRIPTION = (
        "Reads a storyboard written as JSON -- every clip, its mode, its runs and its "
        "prompt -- checks it against the same rules the render applies, and hands it "
        "to the Cutter's storyboard input."
    )
    @classmethod
    def IS_CHANGED(cls, source=""):
        try:
            text = json.dumps(sb.load(source), sort_keys=True, ensure_ascii=False)
        except ValueError as exc:
            text = str(exc)
        import hashlib
        return hashlib.sha1(text.encode("utf-8")).hexdigest()
    def execute(self, source=""):
        payload, report = read_storyboard_json(source)
        print(f"[VIG H3 Storyboard JSON]\n{report}")
        return (payload, report)
def read_storyboard_json(source: str) -> tuple[dict, str]:
    data = sb.load(source)
    result = sb.check(data)
    if result["errors"]:
        raise ValueError(
            f"The storyboard has {len(result['errors'])} fault(s) and was not laid out:\n- "
            + "\n- ".join(result["errors"])
        )
    plan = result["storyboard"]
    lines = [f"storyboard {plan.title or '(untitled)'} by {plan.author or 'unknown'}",
             *result["clips"]]
    if result["warnings"]:
        lines.append("")
        lines.append("to do by hand before those clips render:")
        lines.extend(f"- {w}" for w in result["warnings"])
    lines.append("")
    lines.append(f"storyboard id {plan.fingerprint()}")
    return plan.to_json(), "\n".join(lines)
NODES = {
    "VigH3FilmDirector": (VigH3FilmDirector, "VIG H3 Film Director"),
    "VigH3StoryboardText": (VigH3StoryboardText, "VIG H3 Storyboard (text)"),
    "VigH3StoryboardJSON": (VigH3StoryboardJSON, "VIG H3 Storyboard (JSON)"),
}
