from __future__ import annotations
import traceback
NODE_CLASS_MAPPINGS: dict = {}
NODE_DISPLAY_NAME_MAPPINGS: dict = {}
WEB_DIRECTORY = "./js"
try:
    from .vig_nodes import NODE_CLASS_MAPPINGS as _classes
    from .vig_nodes import NODE_DISPLAY_NAME_MAPPINGS as _names
    NODE_CLASS_MAPPINGS.update(_classes)
    NODE_DISPLAY_NAME_MAPPINGS.update(_names)
except Exception:
    print("[VIG MiniMax H3 Director] node registration failed:")
    traceback.print_exc()
try:
    from .vig import upstream as _upstream
    _upstream.ensure_in_background()
except Exception:
    print("[VIG MiniMax H3 Director] could not start the MiniMax skills download:")
    traceback.print_exc()
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
