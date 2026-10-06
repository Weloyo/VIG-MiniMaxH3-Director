from __future__ import annotations
import os
from pathlib import Path
PACKAGE_ROOT = Path(__file__).resolve().parent.parent
USER_SUBDIR = "vig_h3_director"
def model_bases() -> list[str]:
    try:
        import folder_paths
    except Exception:
        return []
    bases: list[str] = []
    own = str(getattr(folder_paths, "models_dir", "") or "")
    if own:
        bases.append(os.path.normpath(own))
    for folders, _extensions in getattr(folder_paths, "folder_names_and_paths", {}).values():
        for folder in folders:
            base = os.path.dirname(os.path.normpath(folder))
            if base and base not in bases:
                bases.append(base)
    return bases
def model_folders(name: str) -> list[str]:
    return [folder for folder in (os.path.join(base, name) for base in model_bases())
            if os.path.isdir(folder)]
def user_root() -> Path:
    try:
        import folder_paths
        base = Path(folder_paths.get_user_directory())
    except Exception:
        base = PACKAGE_ROOT / ".user"
    return base / USER_SUBDIR
