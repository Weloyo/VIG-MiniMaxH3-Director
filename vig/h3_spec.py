from __future__ import annotations
T2VA = "t2va"
I2VA = "i2va"
FL2VA = "fl2va"
L2VA = "l2va"
REF2VA = "ref2va"
BASE_MODES = (T2VA, I2VA, FL2VA, L2VA)
ALL_MODES = BASE_MODES + (REF2VA,)
BASE_FIELDS = (
    "integrated_multimodal_description",
    "overall_soundscape",
    "non_diegetic_music",
)
REF_FIELDS = (
    "subject_definitions",
    "summary",
    "retention_analysis",
    "detailed_description",
    "overall_soundscape",
    "non_diegetic_music",
)
DESCRIPTION_FIELD = "integrated_multimodal_description"
REF_DESCRIPTION_FIELD = "detailed_description"
SOUNDSCAPE_FIELD = "overall_soundscape"
MUSIC_FIELD = "non_diegetic_music"
def fields_for(mode: str) -> tuple[str, ...]:
    return REF_FIELDS if mode == REF2VA else BASE_FIELDS
def body_field_for(mode: str) -> str:
    return REF_DESCRIPTION_FIELD if mode == REF2VA else DESCRIPTION_FIELD
MODE_WITHOUT_OPENING = {I2VA: T2VA, FL2VA: L2VA}
def mode_without_opening(mode: str) -> str:
    mode = (mode or "").lower()
    return MODE_WITHOUT_OPENING.get(mode, mode)
def opens_on_picture(mode: str) -> bool:
    return (mode or "").lower() in MODE_WITHOUT_OPENING
MODE_WITHOUT_CLOSING = {L2VA: T2VA, FL2VA: I2VA}
def mode_without_closing(mode: str) -> str:
    mode = (mode or "").lower()
    return MODE_WITHOUT_CLOSING.get(mode, mode)
I2VA_INSTRUCTION = (
    "For the target video, at 0.00 seconds into the target video, "
    "<Picture 1> (from [Shot 1]) is fully referenced."
)
FL2VA_INSTRUCTION = (
    "How the reference pictures align with the target video — "
    "Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; "
    "Picture 2 (from Shot {last_shot}) aligns with the {duration}-second mark of the target video."
)
L2VA_INSTRUCTION = (
    "How the reference pictures align with the target video — "
    "<Picture 1> (from [Shot {last_shot}]) aligns with the {duration}-second mark of the target video."
)
def instruction_for(mode: str, last_shot: int, duration: str) -> str | None:
    if mode == I2VA:
        return I2VA_INSTRUCTION
    if mode == FL2VA:
        return FL2VA_INSTRUCTION.format(last_shot=last_shot, duration=duration)
    if mode == L2VA:
        return L2VA_INSTRUCTION.format(last_shot=last_shot, duration=duration)
    return None
CAMERA_MOTIONS = (
    "Zoom In",
    "Zoom Out",
    "Push In",
    "Pull Out",
    "Pan Left",
    "Pan Right",
    "Truck Left",
    "Truck Right",
    "Tilt Up",
    "Tilt Down",
    "Pedestal Up",
    "Pedestal Down",
    "Arc Shot",
    "Tracking Shot",
    "Static Shot",
    "Shake Slightly",
    "Shake Strongly",
    "POV",
    "Roll Clockwise",
    "Roll Counterclockwise",
)
AMPLITUDES = ("with small amplitude", "with large amplitude")
SPEEDS = ("at slow speed", "at fast speed")
MOTIONS_WITHOUT_MODIFIERS = frozenset({"Static Shot", "POV"})
CAMERA_VERB_PHRASES = {
    "Zoom In": "zooms in",
    "Zoom Out": "zooms out",
    "Push In": "pushes in",
    "Pull Out": "pulls out",
    "Pan Left": "pans left",
    "Pan Right": "pans right",
    "Truck Left": "trucks left",
    "Truck Right": "trucks right",
    "Tilt Up": "tilts up",
    "Tilt Down": "tilts down",
    "Pedestal Up": "pedestals up",
    "Pedestal Down": "pedestals down",
    "Arc Shot": "arcs around",
    "Tracking Shot": "tracks",
    "Static Shot": "holds a static shot",
    "Shake Slightly": "shakes slightly",
    "Shake Strongly": "shakes strongly",
    "POV": "takes the subject's point of view",
    "Roll Clockwise": "rolls clockwise",
    "Roll Counterclockwise": "rolls counterclockwise",
}
def camera_phrase(motion: str, amplitude: str | None = None, speed: str | None = None) -> str:
    if motion not in CAMERA_VERB_PHRASES:
        raise ValueError(f"unknown camera motion: {motion!r}")
    parts = [f"The camera {CAMERA_VERB_PHRASES[motion]}"]
    if motion in MOTIONS_WITHOUT_MODIFIERS:
        return parts[0]
    if amplitude:
        if amplitude not in AMPLITUDES:
            raise ValueError(f"unknown amplitude: {amplitude!r}")
        parts.append(amplitude)
    if speed:
        if speed not in SPEEDS:
            raise ValueError(f"unknown speed: {speed!r}")
        parts.append(speed)
    return " ".join(parts)
CUT_PHRASES = (
    "the camera cuts to",
    "the shot cuts to",
    "the shot transitions to",
    "the shot changes to",
    "the shot switches to",
)
OPTIONAL_TRANSITIONS = ("cross-dissolve", "fade", "wipe")
COMMON_STYLES = (
    "Cinematic",
    "live-action",
    "2D-animated",
    "3D CG",
    "claymation",
    "watercolor",
    "vintage film",
)
VOICEOVER_PHRASE = "says in an off-screen voiceover"
VOICEOVER_LIPS_HINT = "lips remain completely closed"
CONTINUITY_PHRASES = (
    "continues seamlessly across the cut",
    "continues uninterrupted into the next shot",
    "carries over from the previous shot",
    "remains audible across the transition",
)
SCENETRANS_TAG = "<scenetrans>"
CUTOFF_TAG = "<cutoff>"
SOUNDSCAPE_MIN_SENTENCES = 1
SOUNDSCAPE_MAX_SENTENCES = 4
MUSIC_MIN_SENTENCES = 1
MUSIC_MAX_SENTENCES = 3
NA_VALUE = "N/A"
ABSTRACT_MOOD_WORDS = (
    "melancholic",
    "melancholy",
    "nostalgic",
    "nostalgia",
    "uplifting",
    "haunting",
    "emotional",
    "poignant",
    "bittersweet",
    "hopeful",
    "ominous",
    "triumphant",
    "wistful",
    "somber",
    "eerie",
    "dreamy",
    "epic",
    "romantic",
    "tense",
    "suspenseful",
    "joyful",
    "sorrowful",
    "evokes",
    "evoking",
    "conveys",
    "underscores the emotion",
    "reinforces the mood",
    "creates a sense of",
    "sets the mood",
)
REF_TASK_TYPES = (
    "keyframe completion",
    "reference generation",
    "video editing",
    "video continuation",
    "audio reuse",
    "audio reference",
)
VIDEO_EDIT_OPENING = "The target video is an edited version of <Video 1>."
VISUAL_RETENTION_MARKERS = (
    "fully_preserved",
    "partially_preserved",
    "attribute_transfer",
    "weak_reference",
)
AUDIO_RETENTION_MARKERS = (
    "fully_copy",
    "partially_copy",
    "reference",
    "weak_reference",
)
LABEL_KINDS = ("Subject", "Picture", "Video", "Audio")
REF_DESCRIPTION_MIN_WORDS = 350
REF_DESCRIPTION_MAX_WORDS = 500
MAX_REF_IMAGES = 9
MAX_REF_VIDEOS = 3
MAX_REF_VIDEO_AUDIOS = 3
MAX_REF_AUDIOS = 3
MIN_REF_VIDEO_FRAMES = 5
