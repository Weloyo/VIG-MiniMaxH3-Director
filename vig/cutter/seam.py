from __future__ import annotations
MATCH_FRAMES = 12
MEASURE_FRAMES = 3
MIN_STEP = 0.002
MAX_STEP = 0.05
LIMITED_Y_SPAN = 219.0
def weight(i: int, n: int = MATCH_FRAMES) -> float:
    if n <= 0:
        return 0.0
    return max(0.0, 1.0 - (i / float(n)))
def correction(delta: float) -> float | None:
    return delta if MIN_STEP <= abs(delta) <= MAX_STEP else None
def fraction_from_yavg(delta_yavg: float) -> float:
    return delta_yavg / LIMITED_Y_SPAN
def geq_head(delta: float, n: int = MATCH_FRAMES) -> str:
    d8 = -delta * LIMITED_Y_SPAN
    return (
        f"geq=enable='lt(n,{n})'"
        f":lum='clip(lum(X,Y)+({d8:.4f})*(1-N/{n}),0,255)'"
        ":cb='cb(X,Y)':cr='cr(X,Y)'"
    )
