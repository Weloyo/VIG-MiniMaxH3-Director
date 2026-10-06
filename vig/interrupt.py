from __future__ import annotations
def _model_management():
    try:
        import comfy.model_management as model_management
    except Exception:
        return None
    return model_management
def interrupted() -> bool:
    model_management = _model_management()
    if model_management is None:
        return False
    try:
        return bool(model_management.processing_interrupted())
    except Exception:
        return False
def raise_if_interrupted() -> None:
    model_management = _model_management()
    if model_management is None:
        return
    try:
        thrower = model_management.throw_exception_if_processing_interrupted
    except AttributeError:
        return
    thrower()
