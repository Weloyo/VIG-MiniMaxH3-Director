from __future__ import annotations
import os
import threading
import time
import urllib.request
from pathlib import Path
REPO = "MiniMax-AI/MiniMax-H3"
COMMIT = "d21241f0a4b3acbb34c97dae47fa417b7065e438"
FILES = (
    "skills/3d-animation-short-generator/SKILL.cn.md",
    "skills/3d-animation-short-generator/SKILL.md",
    "skills/3d-animation-short-generator/meta.yaml",
    "skills/3d-animation-short-generator/references/fallback-policy.md",
    "skills/3d-animation-short-generator/references/model-selection.md",
    "skills/3d-animation-short-generator/references/qc-checklist.md",
    "skills/3d-animation-short-generator/references/shot-table-spec.md",
    "skills/3d-animation-short-generator/references/storyboard-guidelines.md",
    "skills/README.md",
    "skills/brand-promo-video-generator/SKILL.cn.md",
    "skills/brand-promo-video-generator/SKILL.md",
    "skills/brand-promo-video-generator/meta.yaml",
    "skills/co-op-game-intro-generator/SKILL.cn.md",
    "skills/co-op-game-intro-generator/SKILL.md",
    "skills/co-op-game-intro-generator/meta.yaml",
    "skills/co-op-game-intro-generator/references/h3-confirmation-image-template.md",
    "skills/co-op-game-intro-generator/references/h3-video-prompt-template.md",
    "skills/h3-prompt-writing/SKILL.md",
    "skills/h3-prompt-writing/agents/openai.yaml",
    "skills/h3-prompt-writing/references/base-en.txt",
    "skills/h3-prompt-writing/references/ref-en.txt",
    "skills/handdrawn-live-video-generator/SKILL.cn.md",
    "skills/handdrawn-live-video-generator/SKILL.md",
    "skills/handdrawn-live-video-generator/meta.yaml",
    "skills/minimalist-product-ad-generator/SKILL.cn.md",
    "skills/minimalist-product-ad-generator/SKILL.md",
    "skills/minimalist-product-ad-generator/meta.yaml",
    "skills/music-video-subtitle-generator/SKILL.cn.md",
    "skills/music-video-subtitle-generator/SKILL.md",
    "skills/music-video-subtitle-generator/meta.yaml",
    "skills/paper-collage-explainer-generator/SKILL.cn.md",
    "skills/paper-collage-explainer-generator/SKILL.md",
    "skills/paper-collage-explainer-generator/meta.yaml",
    "skills/papercraft-stop-motion-explainer/SKILL.cn.md",
    "skills/papercraft-stop-motion-explainer/SKILL.md",
    "skills/papercraft-stop-motion-explainer/meta.yaml",
)
_RAW = "https://raw.githubusercontent.com/{repo}/{commit}/{path}"
TRIES = 5
_LOCK = threading.Lock()
_STATE = {"started": False, "note": ""}
def root() -> Path:
    from . import paths
    return paths.user_root() / "minimax_h3" / COMMIT[:12]
def skills_dir() -> Path:
    return root() / "skills"
def missing() -> list[str]:
    base = root()
    return [p for p in FILES if not (base / p).is_file()]
def _what_is_missing(paths: list[str]) -> str:
    skills = sorted({p.split("/")[1] for p in paths if p.count("/") >= 2})
    if not skills:
        return "every skill arrived and only MiniMax's own index of them is missing"
    named = ", ".join(skills)
    if "h3-prompt-writing" in skills:
        return (f"{named} stay unavailable -- h3-prompt-writing among them, the "
                f"format authority the writer needs")
    return f"{named} stay unavailable (the prompt-writing skill arrived)"
def fetch(timeout: float = 20.0) -> str:
    todo = missing()
    if not todo:
        return ""
    base = root()
    failed = []
    for path in todo:
        url = _RAW.format(repo=REPO, commit=COMMIT, path=path)
        target = base / path
        error = None
        for attempt in range(TRIES):
            try:
                request = urllib.request.Request(
                    url, headers={"User-Agent": "VIG-MiniMaxH3-Director"}
                )
                with urllib.request.urlopen(request, timeout=timeout) as answer:
                    data = answer.read()
                target.parent.mkdir(parents=True, exist_ok=True)
                part = target.with_suffix(target.suffix + ".part")
                part.write_bytes(data)
                os.replace(part, target)
                error = None
                break
            except Exception as exc:
                error = exc
                if attempt + 1 < TRIES:
                    time.sleep(2.0 ** attempt)
        if error is not None:
            failed.append((path, f"{type(error).__name__}: {error}"))
    if failed:
        return (
            f"[VIG MiniMax H3 Director] could not download {len(failed)} of {len(todo)} "
            f"MiniMax H3 skill files from github.com/{REPO}; "
            f"{_what_is_missing([path for path, _ in failed])}; the missing files are "
            f"retried on the next start. First: {failed[0][0]} ({failed[0][1]})"
        )
    return (
        f"[VIG MiniMax H3 Director] downloaded MiniMax's H3 skills ({len(todo)} files, "
        f"github.com/{REPO} @ {COMMIT[:12]}) under the MiniMax H3 Community License."
    )
def ensure_in_background() -> None:
    with _LOCK:
        if _STATE["started"] or not missing():
            return
        _STATE["started"] = True
    def work() -> None:
        note = fetch()
        _STATE["note"] = note
        if note:
            print(note)
        try:
            from . import guides
            from .styles import library
            guides.refresh()
            library.refresh()
            from .styles import skill_adapter
            skill_adapter.adapted_styles.cache_clear()
        except Exception:
            pass
    threading.Thread(target=work, name="vig-minimax-skills", daemon=True).start()
