from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable
from .. import h3_spec as spec
from ..types import CharacterEntry
class BackendError(RuntimeError):
    pass
@dataclass
class CastRequest:
    story: str
    dialogue_lines: list[str] = field(default_factory=list)
    max_characters: int = 4
    language_hint: str = "English"
@dataclass
class PlaceRequest:
    story: str
    max_places: int = 4
    language_hint: str = "English"
@dataclass
class ShotRequest:
    index: int
    total_shots: int
    beat: str
    duration_seconds: float
    camera_sentence: str | None
    style_clauses: list[str]
    continuity: str = ""
    dialogue_placeholders: list[str] = field(default_factory=list)
    reference_facts: dict[str, Any] = field(default_factory=dict)
    is_first: bool = False
    is_last: bool = False
    cast: list[CharacterEntry] = field(default_factory=list)
    word_target: int = 0
    existing_prose: str = ""
    later_beats: list[str] = field(default_factory=list)
@dataclass
class PlanRequest:
    story: str
    shot_count: int
    duration_seconds: float
    style_clauses: list[str]
    style_camera_moves: list[str]
    mode: str
    dialogue_lines: list[str] = field(default_factory=list)
    reference_facts: dict[str, Any] = field(default_factory=dict)
    language_hint: str = "English"
    cast: list[CharacterEntry] = field(default_factory=list)
    fixed_beats: list[str] = field(default_factory=list)
@dataclass
class SoundRequest:
    beats: list[str]
    style_ambience: str
    style_music: str
    allow_music: bool = True
    duration_seconds: float = 5.0
@dataclass
class EnrichRequest:
    scenario: str
    style_hint: str = ""
    total_seconds: int = 0
@dataclass
class TranslateRequest:
    text: str
    source: str
    target: str
@runtime_checkable
class PromptBackend(Protocol):
    name: str
    def describe_cast(self, request: CastRequest) -> list[dict[str, Any]]:
        pass
    def describe_places(self, request: PlaceRequest) -> list[dict[str, Any]]:
        pass
    def plan_shots(self, request: PlanRequest) -> list[dict[str, Any]]:
        pass
    def expand_shot(self, request: ShotRequest) -> str:
        pass
    def repair(self, text: str, violations: list[dict[str, str]], quotes: str) -> str:
        pass
    def write_sound(self, request: SoundRequest) -> tuple[str, str]:
        pass
    def select_trespassing(self, sentences: list[str], later_beats: list[str]) -> list[int]:
        pass
def shot_list_schema(include_beat: bool = True) -> dict:
    item_properties = {
        "subjects": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Short names of the subjects visible in this shot -- 'Marina', "
                "'the workbench'. Never the full appearance: it is already fixed "
                "in the cast and repeating it here costs the answer its room."
            ),
        },
        "camera_motion": {
            "type": "string",
            "description": "One motion type from the H3 camera vocabulary.",
        },
        "diegetic_sound": {
            "type": "string",
            "description": "Sound produced inside the scene during this shot.",
        },
        "dialogue_indices": {
            "type": "array",
            "items": {"type": "integer"},
            "description": "1-based indices of the user's dialogue lines spoken here.",
        },
    }
    if include_beat:
        item_properties = {
            "beat": {
                "type": "string",
                "description": "What happens in this shot, one or two plain sentences.",
            },
            **item_properties,
        }
    return {
        "type": "object",
        "properties": {
            "shots": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": item_properties,
                    "required": ["beat"] if include_beat else [],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["shots"],
        "additionalProperties": False,
    }
SHOT_LIST_SCHEMA = shot_list_schema(include_beat=True)
SHOT_LIST_SCHEMA_NO_BEAT = shot_list_schema(include_beat=False)
CAST_SCHEMA = {
    "type": "object",
    "properties": {
        "characters": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": (
                            "How the story refers to this character, e.g. 'the courier'."
                        ),
                    },
                    "name_en": {
                        "type": "string",
                        "description": (
                            "The same name as ENGLISH prose writes it. Translate a role "
                            "word ('командир' -> 'the commander'); keep a personal name "
                            "as a name ('Марина' -> 'Marina'). Repeat the name unchanged "
                            "when the story is already in English."
                        ),
                    },
                    "appearance": {
                        "type": "string",
                        "description": (
                            "One English noun phrase fixing their visible identity: age, "
                            "build, hair, clothing and colour. No sentence, no punctuation "
                            "at the end, e.g. 'a woman in her mid-thirties with short dark "
                            "hair and a red jacket'."
                        ),
                    },
                    "aliases": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Other ways the story names this same character.",
                    },
                    "behaviour": {
                        "type": "string",
                        "description": (
                            "How this character carries themselves, as observable action: "
                            "posture, habitual gesture, how they move and handle things, "
                            "e.g. 'moves in short decisive steps and keeps one hand on the "
                            "bag strap'. No feelings, no motives. Empty if the brief says "
                            "nothing about it."
                        ),
                    },
                },
                "required": ["name", "name_en", "appearance"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["characters"],
    "additionalProperties": False,
}
OPENING_SCHEMA = {
    "type": "object",
    "properties": {
        "subjects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": (
                            "A short plain name for who or what this is, e.g. 'the woman'. "
                            "Never a proper name: the picture does not say one."
                        ),
                    },
                    "appearance": {
                        "type": "string",
                        "description": (
                            "One English noun phrase for what is VISIBLE of them: "
                            "approximate age, build, hair, clothing and its colour. No "
                            "sentence, no punctuation at the end, e.g. 'a woman in her "
                            "twenties with long dark hair and a dark green wrap dress'."
                        ),
                    },
                },
                "required": ["name", "appearance"],
                "additionalProperties": False,
            },
        },
        "scene": {
            "type": "string",
            "description": (
                "Where this is and what it looks like, in one English noun phrase: the "
                "setting, what is behind and beside the subject, and the light."
            ),
        },
    },
    "required": ["subjects", "scene"],
    "additionalProperties": False,
}
PLACES_SCHEMA = {
    "type": "object",
    "properties": {
        "places": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": (
                            "How the story refers to this place, e.g. 'the kitchen'."
                        ),
                    },
                    "appearance": {
                        "type": "string",
                        "description": (
                            "One English noun phrase fixing what a viewer sees of it: the "
                            "space, its surfaces, its light. No sentence, no punctuation at "
                            "the end, e.g. 'a narrow kitchen with yellow wall tiles and one "
                            "window over the sink'."
                        ),
                    },
                    "aliases": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Other ways the story names this same place.",
                    },
                    "sound": {
                        "type": "string",
                        "description": (
                            "What this place sounds like when nothing happens in it: its "
                            "continuous room tone, e.g. 'a fridge hum and traffic through "
                            "glass'. Empty if the story gives no basis for one."
                        ),
                    },
                },
                "required": ["name", "appearance"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["places"],
    "additionalProperties": False,
}
TRESPASS_SCHEMA = {
    "type": "object",
    "properties": {
        "sentences": {
            "type": "array",
            "items": {"type": "integer"},
            "description": (
                "1-based numbers of the sentences that describe what a LATER shot covers. "
                "Empty when every sentence belongs to this shot."
            ),
        }
    },
    "required": ["sentences"],
}
SOUND_SCHEMA = {
    "type": "object",
    "properties": {
        "overall_soundscape": {
            "type": "string",
            "description": "1-4 sentences of ambience and physical sound. No dialogue, no music.",
        },
        "non_diegetic_music": {
            "type": "string",
            "description": (
                "1-3 sentences on instrumentation, speed, rhythm and dynamics, or N/A. "
                "Never mood words, never the emotional function of the score."
            ),
        },
    },
    "required": ["overall_soundscape", "non_diegetic_music"],
    "additionalProperties": False,
}
