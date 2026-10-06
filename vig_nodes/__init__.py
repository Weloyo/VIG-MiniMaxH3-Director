from __future__ import annotations
import traceback
NODE_CLASS_MAPPINGS: dict = {}
NODE_DISPLAY_NAME_MAPPINGS: dict = {}
_MODULES = (
    "cutter",
    "film_director",
    "routes",
    "cutter_routes",
)
def _register(module_name: str) -> None:
    try:
        module = __import__(f"{__name__}.{module_name}", fromlist=["NODES"])
    except Exception:
        print(f"[VIG MiniMax H3 Director] failed to load node module {module_name!r}:")
        traceback.print_exc()
        return
    for node_id, (klass, display_name) in getattr(module, "NODES", {}).items():
        NODE_CLASS_MAPPINGS[node_id] = klass
        NODE_DISPLAY_NAME_MAPPINGS[node_id] = display_name
for _module in _MODULES:
    _register(_module)
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
