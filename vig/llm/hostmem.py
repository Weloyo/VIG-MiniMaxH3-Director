from __future__ import annotations
import gc
VRAM_OVERHEAD = 1 << 30
VRAM_MARGIN = 1.1
HOST_OVERHEAD = 1 << 30
HOST_MARGIN = 1.05
def comfy_model_management():
    try:
        import comfy.model_management as model_management
    except Exception:
        return None
    return model_management
def free_comfy_vram() -> None:
    model_management = comfy_model_management()
    if model_management is None:
        return
    for name in ("unload_all_models", "cleanup_models", "reset_cast_buffers"):
        step = getattr(model_management, name, None)
        if not callable(step):
            continue
        try:
            step()
        except Exception:
            pass
    gc.collect()
    try:
        model_management.soft_empty_cache(force=True)
    except Exception:
        pass
def reserve_host_ram(size_bytes: int) -> None:
    if size_bytes <= 0:
        return
    model_management = comfy_model_management()
    reserve = getattr(model_management, "ensure_pin_budget", None)
    if not callable(reserve):
        return
    try:
        reserve(size_bytes)
    except Exception:
        pass
def free_cuda_cache() -> None:
    model_management = comfy_model_management()
    if model_management is not None:
        try:
            model_management.soft_empty_cache(force=True)
            return
        except Exception:
            pass
    try:
        import torch
    except Exception:
        return
    try:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass
def free_ram_bytes() -> int | None:
    try:
        import psutil
        return int(psutil.virtual_memory().available)
    except Exception:
        return None
def free_vram_bytes() -> int | None:
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        free, _total = torch.cuda.mem_get_info()
    except Exception:
        return None
    return int(free)
def vram_needed(size_bytes: int) -> int:
    return int(size_bytes * VRAM_MARGIN) + VRAM_OVERHEAD
def host_needed(size_bytes: int) -> int:
    return int(size_bytes * HOST_MARGIN) + HOST_OVERHEAD
def reset_comfy_cuda_streams() -> None:
    model_management = comfy_model_management()
    if model_management is None:
        return
    reset_buffers = getattr(model_management, "reset_cast_buffers", None)
    if callable(reset_buffers):
        try:
            reset_buffers()
        except Exception:
            pass
    for name in ("STREAMS", "stream_counters"):
        cache = getattr(model_management, name, None)
        if isinstance(cache, dict):
            try:
                cache.clear()
            except Exception:
                pass
