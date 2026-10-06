from __future__ import annotations
import base64
import io
import json
import re
from typing import Any
import requests
from .. import h3_spec as spec
from . import prompts
from .base import (
    CAST_SCHEMA,
    PLACES_SCHEMA,
    SHOT_LIST_SCHEMA,
    SHOT_LIST_SCHEMA_NO_BEAT,
    SOUND_SCHEMA,
    TRESPASS_SCHEMA,
    BackendError,
    CastRequest,
    PlaceRequest,
    PlanRequest,
    ShotRequest,
    SoundRequest,
)
DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1"
MAX_IMAGE_EDGE = 1024
MAX_ANSWER_TOKENS = 12288
TEMPERATURE = {
    "cast": 0.4,
    "places": 0.4,
    "plan": 0.7,
    "expand": 0.8,
    "sound": 0.6,
    "repair": 0.2,
    "vision": 0.1,
    "style": 0.4,
}
_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)
_FENCE_RE = re.compile(r"^\s*```(?:json|text)?\s*|\s*```\s*$", re.MULTILINE)
class HttpError(BackendError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code
def normalise_base_url(url: str) -> str:
    url = (url or DEFAULT_BASE_URL).strip().rstrip("/")
    if not url:
        return DEFAULT_BASE_URL
    if "://" not in url:
        url = f"http://{url}"
    for suffix in ("/chat/completions", "/completions"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
            break
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url
def auth_headers(api_key: str) -> dict:
    key = (api_key or "").strip()
    return {"Authorization": f"Bearer {key}"} if key else {}
def _model_ids(payload: Any) -> list[str]:
    entries = payload.get("data", []) if isinstance(payload, dict) else payload
    if not isinstance(entries, (list, tuple)):
        return []
    ids = []
    for entry in entries:
        value = entry.get("id") if isinstance(entry, dict) else entry
        if isinstance(value, str) and value.strip():
            ids.append(value)
    return sorted(ids)
def list_models(
    base_url: str = DEFAULT_BASE_URL, timeout: float = 5.0, api_key: str = ""
) -> list[str]:
    try:
        response = requests.get(
            f"{normalise_base_url(base_url)}/models",
            timeout=timeout,
            headers=auth_headers(api_key),
        )
        response.raise_for_status()
        return _model_ids(response.json())
    except Exception:
        return []
NON_TEXT_TYPES = frozenset({"image", "audio", "video", "embedding", "rerank"})
def list_model_entries(
    base_url: str = DEFAULT_BASE_URL, timeout: float = 5.0, api_key: str = ""
) -> list[dict]:
    try:
        response = requests.get(
            f"{normalise_base_url(base_url)}/models",
            timeout=timeout,
            headers=auth_headers(api_key),
        )
        response.raise_for_status()
        payload = response.json()
        entries = payload.get("data", []) if isinstance(payload, dict) else payload
        return [e for e in entries if isinstance(e, dict) and e.get("id")]
    except Exception:
        return []
def writers_among(entries: list[dict]) -> list[str]:
    declared = [e for e in entries if isinstance(e.get("capabilities"), dict) and e["capabilities"]]
    if not declared:
        return sorted(str(e["id"]) for e in entries)
    keep = [
        str(e["id"])
        for e in entries
        if (e.get("capabilities") or {}).get("tool_calling") is True
        and str(e.get("type") or "") not in NON_TEXT_TYPES
    ]
    return sorted(keep) if keep else sorted(str(e["id"]) for e in entries)
def encode_image(image: Any) -> str:
    import numpy as np
    from PIL import Image
    if isinstance(image, Image.Image):
        pil = image
    else:
        if hasattr(image, "detach"):
            array = image.detach().cpu().numpy()
        elif isinstance(image, np.ndarray):
            array = image
        else:
            raise BackendError(
                f"cannot encode image of type {type(image).__name__}; expected a torch "
                "tensor, a numpy array or a PIL image"
            )
        array = np.asarray(array)
        while array.ndim > 3:
            array = array[0]
        if array.ndim == 2:
            array = np.stack([array] * 3, axis=-1)
        if array.shape[-1] == 1:
            array = np.repeat(array, 3, axis=-1)
        array = array[..., :3]
        if np.issubdtype(array.dtype, np.integer):
            array = np.clip(array, 0, 255).astype(np.uint8)
        elif array.dtype != np.uint8:
            array = (np.clip(array, 0.0, 1.0) * 255.0).astype(np.uint8)
        pil = Image.fromarray(array)
    pil = pil.convert("RGB")
    if max(pil.size) > MAX_IMAGE_EDGE:
        pil.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.LANCZOS)
    buffer = io.BytesIO()
    pil.save(buffer, format="JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
class OpenAIClientBackend:
    name = "external"
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        model: str = "",
        timeout: float = 600.0,
        seed: int | None = None,
        max_tokens: int = MAX_ANSWER_TOKENS,
        temperature_scale: float = 1.0,
        extra_instruction: str = "",
        api_key: str = "",
    ) -> None:
        self.base_url = normalise_base_url(base_url)
        self.api_key = (api_key or "").strip()
        self.model = model or "local-model"
        self.timeout = timeout
        self.seed = seed
        self.max_tokens = max_tokens
        self.temperature_scale = max(0.0, temperature_scale)
        self.extra_instruction = extra_instruction or ""
        self._schema_supported: bool | None = None
        self._schema_dialect: str = ""
        self._last_cut_off = False
        self._last_reasoning = 0
        self.calls: list[dict] = []
    def _post(self, payload: dict) -> dict:
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                timeout=self.timeout,
                headers=auth_headers(self.api_key),
            )
        except requests.exceptions.ConnectionError as exc:
            raise BackendError(
                f"cannot reach the writing server at {self.base_url} -- is it running? ({exc})"
            ) from exc
        except requests.exceptions.Timeout as exc:
            raise BackendError(
                f"{self.base_url} did not respond within {self.timeout:.0f}s; raise the timeout or "
                "use a smaller model"
            ) from exc
        except requests.exceptions.RequestException as exc:
            raise BackendError(f"request to {self.base_url} failed: {exc}") from exc
        if response.status_code >= 400:
            raise HttpError(
                f"{self.base_url} returned HTTP {response.status_code}: {response.text[:400]}",
                response.status_code,
            )
        try:
            return response.json()
        except ValueError as exc:
            raise BackendError(f"{self.base_url} returned non-JSON: {response.text[:200]}") from exc
    def _chat(
        self,
        system: str,
        user: str | list,
        stage: str,
        schema: dict | None = None,
        schema_name: str = "response",
        max_tokens: int | None = None,
    ) -> str:
        temperature = TEMPERATURE.get(stage, 0.7) * self.temperature_scale
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": prompts.with_extra(system, self.extra_instruction)},
                {"role": "user", "content": user},
            ],
            "temperature": round(temperature, 3),
            "max_tokens": int(max_tokens or self.max_tokens),
            "stream": False,
        }
        if self.seed is not None:
            payload["seed"] = int(self.seed)
        dialects = [
            ("openai", {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            }),
            ("llamacpp", {"type": "json_object", "schema": schema}),
        ]
        if self._schema_dialect:
            dialects = [d for d in dialects if d[0] == self._schema_dialect]
        data = None
        use_schema = False
        if schema is not None and self._schema_supported is not False:
            for name, response_format in dialects:
                payload["response_format"] = response_format
                try:
                    data = self._post(payload)
                except BackendError as exc:
                    if getattr(exc, "status_code", None) is None:
                        raise
                    payload.pop("response_format", None)
                    continue
                self._schema_supported = True
                self._schema_dialect = name
                use_schema = True
                break
        if data is None:
            if schema is not None:
                payload.pop("response_format", None)
                payload["messages"][0]["content"] += (
                    "\n\nReturn a single JSON object matching this schema exactly, and nothing "
                    "else -- no prose, no markdown fences:\n"
                    + prompts.describe_schema(schema)
                )
            data = self._post(payload)
            if schema is not None:
                self._schema_supported = False
        self.calls.append({"stage": stage, "schema": use_schema})
        try:
            self._last_cut_off = data["choices"][0].get("finish_reason") == "length"
        except (KeyError, IndexError, TypeError, AttributeError):
            self._last_cut_off = False
        try:
            message = data["choices"][0]["message"]
            self._last_reasoning = len(str(message.get("reasoning_content") or ""))
        except (KeyError, IndexError, TypeError, AttributeError):
            self._last_reasoning = 0
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise BackendError(f"unexpected response shape from {self.base_url}: {str(data)[:300]}") from exc
        if content is None:
            raise BackendError(f"{self.base_url} returned an empty message")
        return str(content)
    def _parse_json(self, text: str, stage: str) -> dict:
        text = _FENCE_RE.sub("", text).strip()
        match = _JSON_BLOCK_RE.search(text)
        for candidate in (text, match.group(0) if match else None):
            if candidate is None:
                continue
            try:
                data = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict):
                return data
        if self._last_cut_off and self._last_reasoning and not text:
            raise BackendError(
                f"{stage} stage ran out of tokens while the model was still reasoning "
                f"({self._last_reasoning} characters of it) and never began its answer. "
                "Raise max_tokens for this stage: a thinking model spends the same budget "
                "on the reasoning, and only what is left becomes the answer."
            )
        if self._last_cut_off:
            raise BackendError(
                f"{stage} stage answer was cut off at max_tokens; raise the limit or ask "
                f"for fewer shots per clip. Got: {text[:200]}"
            )
        raise BackendError(f"{stage} stage did not return usable JSON: {text[:200]}")
    def probe(self) -> str:
        models = list_models(self.base_url, timeout=self.timeout, api_key=self.api_key)
        if not models:
            raise BackendError(f"no models available at {self.base_url}")
        if self.model in models:
            return self.model
        if self.model == "local-model":
            if len(models) == 1:
                self.model = models[0]
                return self.model
            raise BackendError(
                f"{self.base_url} offers {len(models)} models and none was chosen -- "
                f"pick one in the agent's model list (e.g. {', '.join(models[:3])})"
            )
        raise BackendError(
            f"model {self.model!r} is not loaded; available: {', '.join(models[:8])}"
        )
    def describe_cast(self, request: CastRequest) -> list[dict]:
        raw = self._chat(
            system=prompts.cast_system(request.max_characters),
            user=prompts.cast_user(
                story=request.story,
                dialogue_lines=request.dialogue_lines,
                max_characters=request.max_characters,
            ),
            stage="cast",
            schema=CAST_SCHEMA,
            schema_name="character_bible",
        )
        data = self._parse_json(raw, "cast")
        characters = data.get("characters")
        if not isinstance(characters, list):
            raise BackendError(f"cast stage returned no character list: {str(data)[:200]}")
        return [c for c in characters if isinstance(c, dict) and c.get("appearance")][
            : max(0, int(request.max_characters))
        ]
    def describe_places(self, request: PlaceRequest) -> list[dict]:
        raw = self._chat(
            system=prompts.places_system(request.max_places),
            user=prompts.places_user(
                story=request.story,
                max_places=request.max_places,
            ),
            stage="places",
            schema=PLACES_SCHEMA,
            schema_name="place_bible",
        )
        data = self._parse_json(raw, "places")
        places = data.get("places")
        if not isinstance(places, list):
            raise BackendError(f"places stage returned no place list: {str(data)[:200]}")
        return [p for p in places if isinstance(p, dict) and p.get("appearance")][
            : max(0, int(request.max_places))
        ]
    def plan_shots(self, request: PlanRequest) -> list[dict]:
        raw = self._chat(
            system=prompts.planner_system(
                request.mode, request.shot_count, request.duration_seconds
            ),
            user=prompts.planner_user(
                story=request.story,
                shot_count=request.shot_count,
                duration=request.duration_seconds,
                style_clauses=request.style_clauses,
                dialogue_lines=request.dialogue_lines,
                reference_facts=request.reference_facts,
                cast=request.cast,
                fixed_beats=request.fixed_beats,
            ),
            stage="plan",
            schema=(
                SHOT_LIST_SCHEMA_NO_BEAT if request.fixed_beats else SHOT_LIST_SCHEMA
            ),
            schema_name="shot_list",
            max_tokens=max(self.max_tokens, 300 * request.shot_count + 400),
        )
        data = self._parse_json(raw, "planner")
        shots = data.get("shots")
        if not isinstance(shots, list) or not shots:
            raise BackendError(f"planner returned no shots: {str(data)[:200]}")
        return shots
    def expand_shot(self, request: ShotRequest) -> str:
        if request.existing_prose:
            return self._elaborate(request)
        text = self._chat(
            system=prompts.expander_system(ref_mode=bool(request.word_target)),
            user=prompts.expander_user(
                index=request.index,
                total=request.total_shots,
                beat=request.beat,
                duration=request.duration_seconds,
                camera_sentence=request.camera_sentence,
                placeholders=request.dialogue_placeholders,
                continuity=request.continuity,
                reference_facts=request.reference_facts,
                is_first=request.is_first,
                is_last=request.is_last,
                word_target=request.word_target,
                cast=request.cast,
                later_beats=request.later_beats,
            ),
            stage="expand",
        )
        text = _FENCE_RE.sub("", text).strip()
        if not text:
            raise BackendError(f"expander returned nothing for shot {request.index}")
        return text
    def _elaborate(self, request: ShotRequest) -> str:
        current = len(request.existing_prose.split())
        deficit = max(30, request.word_target - current)
        text = self._chat(
            system=prompts.elaborator_system(),
            user=prompts.elaborator_user(
                request.existing_prose,
                deficit,
                request.word_target,
                request.reference_facts,
                continuity=request.continuity,
                cast=request.cast,
                is_first=request.is_first,
            ),
            stage="expand",
        )
        text = _FENCE_RE.sub("", text).strip()
        if len(text.split()) <= current:
            return request.existing_prose
        return text
    def select_trespassing(self, sentences: list[str], later_beats: list[str]) -> list[int]:
        if not sentences or not later_beats:
            return []
        raw = self._chat(
            system=prompts.trespass_system(),
            user=prompts.trespass_user(sentences, later_beats),
            stage="repair",
            schema=TRESPASS_SCHEMA,
            schema_name="trespassing_sentences",
        )
        data = self._parse_json(raw, "trespass")
        picked = data.get("sentences")
        if not isinstance(picked, list):
            raise BackendError(f"trespass stage returned no list: {str(data)[:200]}")
        return [int(n) for n in picked if isinstance(n, (int, float)) and not isinstance(n, bool)]
    def write_sound(self, request: SoundRequest) -> tuple[str, str]:
        raw = self._chat(
            system=prompts.sound_system(request.allow_music),
            user=prompts.sound_user(
                beats=request.beats,
                style_ambience=request.style_ambience,
                style_music=request.style_music,
                duration=request.duration_seconds,
            ),
            stage="sound",
            schema=SOUND_SCHEMA,
            schema_name="sound_fields",
        )
        data = self._parse_json(raw, "sound")
        soundscape = str(data.get("overall_soundscape", "")).strip()
        music = str(data.get("non_diegetic_music", "")).strip()
        if not soundscape:
            raise BackendError("sound stage returned an empty soundscape")
        return soundscape, music or spec.NA_VALUE
    def repair(self, text: str, violations: list[dict], quotes: str) -> str:
        fixed = self._chat(
            system=prompts.repair_system(),
            user=prompts.repair_user(text, violations, quotes),
            stage="repair",
        )
        fixed = _FENCE_RE.sub("", fixed).strip()
        if not fixed:
            raise BackendError("repair stage returned nothing")
        return fixed
    def enrich_scenario(self, request) -> str:
        text = self._chat(
            system=prompts.enrich_system(
                request.style_hint, getattr(request, "total_seconds", 0)
            ),
            user=prompts.enrich_user(request.scenario),
            stage="expand",
            max_tokens=max(self.max_tokens, len(request.scenario) // 3 + 1200),
        )
        text = _FENCE_RE.sub("", text).strip()
        if not text:
            raise BackendError("enrich stage returned nothing")
        return text
    def translate_text(self, request) -> str:
        text = self._chat(
            system=prompts.translate_system(request.source, request.target),
            user=prompts.translate_user(request.text),
            stage="repair",
            max_tokens=max(self.max_tokens, len(request.text) // 2 + 600),
        )
        text = _FENCE_RE.sub("", text).strip()
        if not text:
            raise BackendError("translate stage returned nothing")
        return text
    def chat_with_tools(self, messages: list[dict], tools: list[dict]) -> dict:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": round(TEMPERATURE["plan"] * self.temperature_scale, 3),
            "max_tokens": self.max_tokens,
            "stream": False,
        }
        if self.seed is not None:
            payload["seed"] = int(self.seed)
        data = self._post(payload)
        self.calls.append({"stage": "agent", "schema": False})
        try:
            message = data["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise BackendError(f"unexpected tool-call response: {str(data)[:300]}") from exc
        cleaned = {"role": message.get("role", "assistant")}
        if message.get("content"):
            cleaned["content"] = message["content"]
        if message.get("tool_calls"):
            cleaned["tool_calls"] = message["tool_calls"]
        if "content" not in cleaned:
            cleaned["content"] = ""
        return cleaned
    def supports_tools(self) -> bool:
        try:
            message = self.chat_with_tools(
                [{"role": "user", "content": "Call the ping tool. Do not reply with text."}],
                [
                    {
                        "type": "function",
                        "function": {
                            "name": "ping",
                            "description": "Answers a readiness check. Call it with no arguments.",
                            "parameters": {"type": "object", "properties": {}},
                        },
                    }
                ],
            )
        except BackendError:
            return False
        return bool(message.get("tool_calls"))
    def describe_frames(
        self,
        frames: list[Any],
        schema: dict,
        measured_facts: dict | None = None,
        instruction: str = "",
    ) -> dict:
        if not frames:
            raise BackendError("no frames to describe")
        content: list[dict] = []
        text = instruction or "Describe these frames."
        if measured_facts:
            text += "\n\nMEASURED CAMERA FACTS (established truth, do not contradict):\n" + json.dumps(
                measured_facts, indent=2
            )
        content.append({"type": "text", "text": text})
        for frame in frames:
            content.append({"type": "image_url", "image_url": {"url": encode_image(frame)}})
        raw = self._chat(
            system=prompts.vision_system(),
            user=content,
            stage="vision",
            schema=schema,
            schema_name="reference_facts",
        )
        return self._parse_json(raw, "vision")
