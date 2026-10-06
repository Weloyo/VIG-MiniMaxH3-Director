from __future__ import annotations
import json
import os
KEYS_FILE = "provider_keys.json"
ENV_NAMES = ("VIG_LLM_API_KEY", "OPENAI_API_KEY")
ENV_TOKEN_NAMES = ("VIG_LLM_MANAGEMENT_TOKEN",)
API_KEY = "api_key"
MANAGEMENT_TOKEN = "management_token"
def _path():
    from ..paths import user_root
    return user_root() / KEYS_FILE
def _provider_id(base_url: str) -> str:
    from .openai_client import normalise_base_url
    return normalise_base_url(base_url)
def _read() -> dict:
    try:
        data = json.loads(_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}
def _entry(provider: str) -> dict:
    stored = _read().get(provider)
    if isinstance(stored, str):
        return {API_KEY: stored} if stored.strip() else {}
    return stored if isinstance(stored, dict) else {}
def _stored(base_url: str, field: str) -> str:
    if not base_url:
        return ""
    value = _entry(_provider_id(base_url)).get(field)
    return value.strip() if isinstance(value, str) else ""
def _from_env(names) -> tuple[str, str]:
    for name in names:
        value = (os.environ.get(name) or "").strip()
        if value:
            return value, name
    return "", ""
def remembered_key(base_url: str) -> str:
    return _stored(base_url, API_KEY) or _from_env(ENV_NAMES)[0]
def remembered_token(base_url: str) -> str:
    return _stored(base_url, MANAGEMENT_TOKEN) or _from_env(ENV_TOKEN_NAMES)[0]
def has_key(base_url: str) -> bool:
    return bool(remembered_key(base_url))
def key_source(base_url: str) -> str:
    if _stored(base_url, API_KEY):
        return "saved"
    return _from_env(ENV_NAMES)[1]
def token_source(base_url: str) -> str:
    if _stored(base_url, MANAGEMENT_TOKEN):
        return "saved"
    return _from_env(ENV_TOKEN_NAMES)[1]
def _remember(base_url: str, field: str, value: str) -> bool:
    if not base_url:
        return False
    provider = _provider_id(base_url)
    keys = _read()
    entry = dict(_entry(provider))
    value = (value or "").strip()
    if value:
        entry[field] = value
    elif field in entry:
        del entry[field]
    else:
        return True
    if entry:
        keys[provider] = entry
    elif provider in keys:
        del keys[provider]
    try:
        path = _path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(keys, indent=2), encoding="utf-8")
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        return True
    except Exception:
        return False
def remember_key(base_url: str, api_key: str) -> bool:
    return _remember(base_url, API_KEY, api_key)
def remember_token(base_url: str, token: str) -> bool:
    return _remember(base_url, MANAGEMENT_TOKEN, token)
