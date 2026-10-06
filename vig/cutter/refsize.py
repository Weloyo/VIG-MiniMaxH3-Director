from __future__ import annotations
import math
MAX_FILL = 4.0
GRID = 32
def fill_size(width: int, height: int, canvas_w: int, canvas_h: int,
              cap: float = MAX_FILL) -> tuple[int, int] | None:
    width, height = int(width), int(height)
    target = int(canvas_w) * int(canvas_h)
    if width <= 0 or height <= 0 or target <= 0 or width * height >= target:
        return None
    scale = min(float(cap), math.sqrt(target / (width * height)))
    out_w = max(GRID, round(width * scale / GRID) * GRID)
    out_h = max(GRID, round(height * scale / GRID) * GRID)
    while out_w * out_h > target and out_w > GRID and out_h > GRID:
        if out_w / out_h > width / height:
            out_w -= GRID
        else:
            out_h -= GRID
    own_w = max(GRID, round(width / GRID) * GRID)
    own_h = max(GRID, round(height / GRID) * GRID)
    if (out_w, out_h) == (own_w, own_h) or out_w * out_h <= own_w * own_h:
        return None
    return out_w, out_h
