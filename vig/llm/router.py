from __future__ import annotations
CONNECTIONS_PATH = "/api/providers"
def _management_root(base_url: str) -> str:
    from .openai_client import normalise_base_url
    url = normalise_base_url(base_url)
    return url[: -len("/v1")] if url.endswith("/v1") else url
def connected_owners(base_url: str, token: str, timeout: float = 10.0) -> set:
    if not token:
        return set()
    try:
        import requests
        response = requests.get(
            _management_root(base_url) + CONNECTIONS_PATH,
            timeout=timeout,
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return set()
    entries = payload.get("connections") if isinstance(payload, dict) else payload
    if not isinstance(entries, (list, tuple)):
        return set()
    owners = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("provider") or "").strip()
        if not name:
            continue
        if entry.get("isActive") is False:
            continue
        if str(entry.get("testStatus") or "").lower() in {"failed", "error", "inactive"}:
            continue
        owners.add(name)
    return owners
def owned_by_connected(entries: list, owners: set) -> list:
    if not owners:
        return [str(e["id"]) for e in entries if e.get("id")]
    kept = []
    for entry in entries:
        if not entry.get("id"):
            continue
        owner = str(entry.get("owned_by") or "").strip()
        if not owner or owner in owners:
            kept.append(str(entry["id"]))
    return kept
