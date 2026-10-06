from __future__ import annotations
PAD = 0.06
MINIMUM = 24
FILL = (128, 128, 128)
FEATHER = 3
def _span(lo: int, hi: int, limit: int, minimum: int):
    if limit <= 0:
        return 0, 0
    short = minimum - (hi - lo)
    if short > 0:
        lo -= short // 2
        hi += short - short // 2
    if hi - lo >= limit:
        return 0, limit
    if lo < 0:
        hi -= lo
        lo = 0
    if hi > limit:
        lo -= hi - limit
        hi = limit
    return max(0, lo), min(limit, hi)
def pad_box(box, width: int, height: int, pad: float = PAD, minimum: int = MINIMUM):
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    x0, x1 = min(x0, x1), max(x0, x1)
    y0, y1 = min(y0, y1), max(y0, y1)
    grow = int(round(max(x1 - x0, y1 - y0) * max(0.0, float(pad))))
    x0, x1 = _span(x0 - grow, x1 + grow, int(width), int(minimum))
    y0, y1 = _span(y0 - grow, y1 + grow, int(height), int(minimum))
    return x0, y0, x1, y1
def bounds_of(mask):
    import numpy
    rows = numpy.any(mask, axis=1)
    cols = numpy.any(mask, axis=0)
    if not rows.any() or not cols.any():
        return None
    ys = numpy.nonzero(rows)[0]
    xs = numpy.nonzero(cols)[0]
    return int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1
def _blur(alpha, radius: int):
    import numpy
    if radius <= 0:
        return alpha
    out = alpha
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (radius, radius)
        wide = numpy.pad(out, pad, mode="edge")
        sums = numpy.cumsum(wide, axis=axis)
        zero = numpy.zeros_like(numpy.take(sums, [0], axis=axis))
        sums = numpy.concatenate([zero, sums], axis=axis)
        width = 2 * radius + 1
        hi = numpy.take(sums, range(width, sums.shape[axis]), axis=axis)
        lo = numpy.take(sums, range(0, sums.shape[axis] - width), axis=axis)
        out = (hi - lo) / float(width)
    return out
SPECK = 0.0005
SHARE = 0.10
def solid(mask, speck: float = SPECK, share: float = SHARE):
    import numpy
    keep = numpy.asarray(mask).astype(bool)
    if not keep.any():
        return keep
    labels, sizes = _pieces(keep)
    if labels is None or len(sizes) < 2:
        return keep
    biggest = int(sizes.max())
    floor = speck * keep.size
    wanted = [index + 1 for index, size in enumerate(sizes)
              if size >= floor or size >= share * biggest]
    if not wanted or len(wanted) == len(sizes):
        return keep
    return numpy.isin(labels, wanted)
def _pieces(keep):
    import numpy
    try:
        import cv2
        count, labels, stats, _centroids = cv2.connectedComponentsWithStats(
            keep.astype(numpy.uint8), 8)
        return (labels, stats[1:, -1]) if count > 1 else (None, ())
    except Exception:
        pass
    try:
        from scipy import ndimage
        labels, count = ndimage.label(keep)
        if count < 1:
            return None, ()
        return labels, numpy.bincount(labels.ravel())[1:]
    except Exception:
        return None, ()
GROUND_NEAR = 120.0
GROUND_LEAST = 0.01
def _ground_holes(keep, holes, pixels, near: float, least: float):
    import numpy
    try:
        from scipy import ndimage
    except Exception:
        return None
    shot = numpy.asarray(pixels)
    if shot.ndim != 3 or shot.shape[:2] != keep.shape[:2]:
        return None
    rows, cols = numpy.where(keep)
    outside = numpy.ones(keep.shape[:2], dtype=bool)
    outside[rows.min():rows.max() + 1, cols.min():cols.max() + 1] = False
    if not outside.any():
        return None
    ground = numpy.median(shot[outside].reshape(-1, 3), axis=0)
    labels, count = ndimage.label(holes)
    if count < 1:
        return None
    floor = least * float(keep.sum())
    open_ones = numpy.zeros(keep.shape[:2], dtype=bool)
    for index in range(1, count + 1):
        spot = labels == index
        if spot.sum() < floor:
            continue
        hue = numpy.median(shot[spot].reshape(-1, 3), axis=0)
        if float(numpy.abs(hue - ground).sum()) < near:
            open_ones |= spot
    return open_ones
def whole(mask, pixels=None, near: float = GROUND_NEAR, least: float = GROUND_LEAST):
    import numpy
    keep = numpy.asarray(mask).astype(bool)
    if not keep.any():
        return keep
    try:
        from scipy import ndimage
        disc = numpy.hypot(*numpy.ogrid[-FEATHER:FEATHER + 1, -FEATHER:FEATHER + 1]) <= FEATHER
        closed = ndimage.binary_closing(keep, structure=disc)
        shut = ndimage.binary_fill_holes(closed)
        if pixels is None:
            return shut
        wall = _ground_holes(closed, shut & ~closed, pixels, near, least)
        return shut & ~wall if wall is not None else shut
    except Exception:
        pass
    outside = ~keep
    reach = numpy.zeros_like(outside)
    reach[0, :] = outside[0, :]
    reach[-1, :] = outside[-1, :]
    reach[:, 0] = outside[:, 0]
    reach[:, -1] = outside[:, -1]
    while True:
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= outside
        if grown.sum() == reach.sum():
            return ~grown
        reach = grown
def kept(mask, pixels=None):
    return whole(solid(mask), pixels)
def outline(mask, box=None, most: int = 6, step: float = 0.004):
    import numpy
    keep = numpy.asarray(mask).astype(bool)
    if not keep.any():
        return []
    height, width = keep.shape[:2]
    x0, y0, x1, y1 = (0, 0, width, height) if box is None else [int(v) for v in box]
    try:
        import cv2
    except Exception:
        return []
    found, _ = cv2.findContours(keep.astype(numpy.uint8), cv2.RETR_CCOMP,
                                cv2.CHAIN_APPROX_SIMPLE)
    scale = float(max(x1 - x0, y1 - y0) or 1)
    paths = []
    for contour in sorted(found, key=len, reverse=True)[:most]:
        eased = cv2.approxPolyDP(contour, step * scale, True)
        if len(eased) < 3:
            continue
        paths.append([[round(float(px) / width, 5), round(float(py) / height, 5)]
                      for px, py in eased.reshape(-1, 2)])
    return paths
def cut_out(pixels, mask, box=None, feather: int = FEATHER, fill=FILL):
    import numpy
    keep = kept(mask, pixels)
    height, width = keep.shape[:2]
    if box is None:
        tight = bounds_of(keep)
        if tight is None:
            return None
        box = pad_box(tight, width, height)
    x0, y0, x1, y1 = box
    window = numpy.asarray(pixels)[y0:y1, x0:x1, :3].astype(numpy.float32)
    alpha = _blur(keep[y0:y1, x0:x1].astype(numpy.float32), int(feather))
    alpha = alpha.clip(0.0, 1.0)[..., None]
    field = numpy.asarray(fill, dtype=numpy.float32).reshape(1, 1, 3)
    blended = window * alpha + field * (1.0 - alpha)
    return numpy.rint(blended).clip(0, 255).astype(numpy.uint8)
def coverage(mask) -> float:
    import numpy
    keep = numpy.asarray(mask)
    return float(keep.astype(bool).mean()) if keep.size else 0.0
SAME = 0.80
KEEP = 6
def _alike(first, first_area: int, second, second_area: int) -> float:
    import numpy
    shared = int(numpy.logical_and(first, second).sum())
    union = first_area + second_area - shared
    return shared / union if union > 0 else 0.0
def merge_candidates(entries, rect, same: float = SAME, keep: int = KEEP):
    import numpy
    listed = list(entries)
    scored = []
    for entry in listed:
        mask = numpy.asarray(entry["mask"]).astype(bool)
        area = int(mask.sum())
        if not area:
            continue
        carried = dict(entry)
        if rect is not None:
            x0, y0, x1, y1 = (int(v) for v in rect)
            drawn = max(1, (x1 - x0) * (y1 - y0))
            shared = int(mask[y0:y1, x0:x1].sum())
            if not shared:
                continue
            carried["rect_iou"] = shared / (area + drawn - shared)
        scored.append((carried, mask, area))
    if rect is not None:
        scored.sort(key=lambda row: (not row[0].get("by_phrase"), -row[0]["rect_iou"]))
    kept: list = []
    for carried, mask, area in scored:
        if any(_alike(mask, area, held, held_area) >= same
               for _, held, held_area in kept):
            continue
        kept.append((carried, mask, area))
        if len(kept) >= keep:
            break
    return [carried for carried, _, _ in kept]
