"""Binary-image helpers in pure numpy: box morphology and connected components.

Morphology uses an integral image, so dilation and erosion by a square of any radius cost the
same (Pillow's rank filters are quadratic in the kernel size, which rules them out for the
60 px erosion of the walkable area). Connected components use a vectorised union-find with
min-label hooking and pointer jumping: about two seconds for a 1600 x 1920 mask, no SciPy.
Everything here is deterministic.
"""

from __future__ import annotations

import numpy as np


def box_sum(a: np.ndarray, r: int) -> np.ndarray:
    """Sum over the (2r+1)^2 window centred on each pixel, zero padded; int64 or float64."""
    if r <= 0:
        return a.astype(np.int64 if a.dtype != np.float64 and a.dtype.kind in "biu" else np.float64)
    dt = np.float64 if a.dtype.kind == "f" else np.int64
    p = np.pad(a.astype(dt), r)
    c = np.zeros((p.shape[0] + 1, p.shape[1] + 1), dt)
    c[1:, 1:] = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    return box_sum(mask.astype(np.uint8), r) > 0 if r > 0 else mask.astype(bool)


def erode(mask: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask.astype(bool)
    return box_sum((~mask.astype(bool)).astype(np.uint8), r) == 0


def closing(mask: np.ndarray, r: int) -> np.ndarray:
    return erode(dilate(mask, r), r)


def opening(mask: np.ndarray, r: int) -> np.ndarray:
    return dilate(erode(mask, r), r)


def mean_filter(a: np.ndarray, r: int) -> np.ndarray:
    """Mean over the window, normalised by the number of in-image pixels (edges included)."""
    ones = np.ones(a.shape[:2], np.uint8)
    n = box_sum(ones, r).astype(np.float64)
    if a.ndim == 2:
        return box_sum(a.astype(np.float64), r) / n
    return np.stack([box_sum(a[..., c].astype(np.float64), r) / n for c in range(a.shape[2])], axis=-1)


def masked_mean_fill(values: np.ndarray, known: np.ndarray, fill: np.ndarray, r: int = 3, iterations: int = 16, return_reached: bool = False):
    """Fill ``fill`` pixels with the local mean of ``known`` pixels, growing inward each round.

    Used to put colour under tiny filled holes and body luminance under the face. Pixels the
    growth never reaches keep their ORIGINAL value; with ``return_reached`` the result is
    ``(values, reached)`` where ``reached`` marks the known pixels plus every filled one, so a
    caller can tell a real estimate from an untouched input.
    """
    v = values.astype(np.float64).copy()
    k = known.astype(bool).copy()
    todo = fill.astype(bool) & ~k
    for _ in range(iterations):
        if not todo.any():
            break
        w = k.astype(np.float64)
        num = mean_filter(v * (w[..., None] if v.ndim == 3 else w), r)
        den = mean_filter(w, r)
        got = todo & (den > 0)
        if not got.any():
            break
        if v.ndim == 3:
            v[got] = num[got] / den[got][:, None]
        else:
            v[got] = num[got] / den[got]
        k |= got
        todo &= ~got
    return (v, k) if return_reached else v


def _compress(parent: np.ndarray) -> np.ndarray:
    while True:
        q = parent[parent]
        if np.array_equal(q, parent):
            return parent
        parent = q


def label_components(mask: np.ndarray, connectivity: int = 4) -> tuple[np.ndarray, int]:
    """Label 4- or 8-connected components of a boolean mask: (labels int32, count); 0 = background."""
    mask = np.asarray(mask, dtype=bool)
    H, W = mask.shape
    labels = np.zeros((H, W), np.int32)
    if not mask.any():
        return labels, 0
    ys, xs = np.nonzero(mask.any(1))[0], np.nonzero(mask.any(0))[0]
    y0, y1, x0, x1 = ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
    m = mask[y0:y1, x0:x1]
    h, w = m.shape
    idx = np.arange(h * w, dtype=np.int64).reshape(h, w)
    parent = idx.ravel().copy()
    pairs_a, pairs_b = [], []
    hz = m[:, :-1] & m[:, 1:]
    vt = m[:-1, :] & m[1:, :]
    pairs_a += [idx[:, :-1][hz], idx[:-1, :][vt]]
    pairs_b += [idx[:, 1:][hz], idx[1:, :][vt]]
    if connectivity == 8:
        d1 = m[:-1, :-1] & m[1:, 1:]
        d2 = m[:-1, 1:] & m[1:, :-1]
        pairs_a += [idx[:-1, :-1][d1], idx[:-1, 1:][d2]]
        pairs_b += [idx[1:, 1:][d1], idx[1:, :-1][d2]]
    ea = np.concatenate(pairs_a)
    eb = np.concatenate(pairs_b)
    while ea.size:
        ra, rb = parent[ea], parent[eb]
        lo, hi = np.minimum(ra, rb), np.maximum(ra, rb)
        ch = lo != hi
        if not ch.any():
            break
        np.minimum.at(parent, hi[ch], lo[ch])
        parent = _compress(parent)
    roots = np.where(m, parent.reshape(h, w), -1)
    uniq, inv = np.unique(roots, return_inverse=True)
    inv = inv.reshape(h, w)
    sub = inv if uniq[0] == -1 else inv + 1
    labels[y0:y1, x0:x1] = sub
    count = int(uniq.size - (1 if uniq[0] == -1 else 0))
    return labels, count


def component_areas(labels: np.ndarray, count: int) -> np.ndarray:
    return np.bincount(labels.ravel(), minlength=count + 1)


def component_bboxes(labels: np.ndarray, count: int) -> np.ndarray:
    """Per label (row index = label): x0, y0, x1, y1 inclusive; row 0 is unused."""
    H, W = labels.shape
    ys, xs = np.nonzero(labels)
    l = labels[ys, xs]
    out = np.zeros((count + 1, 4), np.int64)
    out[:, 0] = W
    out[:, 1] = H
    out[:, 2] = -1
    out[:, 3] = -1
    np.minimum.at(out[:, 0], l, xs)
    np.minimum.at(out[:, 1], l, ys)
    np.maximum.at(out[:, 2], l, xs)
    np.maximum.at(out[:, 3], l, ys)
    return out


def component_centroids(labels: np.ndarray, count: int) -> np.ndarray:
    H, W = labels.shape
    areas = component_areas(labels, count).astype(np.float64)
    ys, xs = np.nonzero(labels)
    l = labels[ys, xs]
    cx = np.bincount(l, weights=xs, minlength=count + 1)
    cy = np.bincount(l, weights=ys, minlength=count + 1)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.stack([cx / areas, cy / areas], axis=1)


def border_touching(labels: np.ndarray, count: int) -> np.ndarray:
    """Boolean per label: does the component touch the image border?"""
    touch = np.zeros(count + 1, bool)
    for edge in (labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]):
        touch[np.unique(edge)] = True
    touch[0] = False
    return touch


def bbox_of(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """(x0, y0, x1, y1) exclusive, or None for an empty mask."""
    if not mask.any():
        return None
    ys = np.nonzero(mask.any(1))[0]
    xs = np.nonzero(mask.any(0))[0]
    return int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1


def remove_specks(mask: np.ndarray, min_area: int, keep_inside_largest: bool = True, keep_border_touching: bool = False,
                  largest_frac: float = 0.0, removed_areas: list | None = None) -> tuple[np.ndarray, int]:
    """Drop components smaller than the threshold unless they sit inside the largest component's bbox.

    The threshold is ``max(min_area, largest_frac * area of the largest component)``, so it scales
    with the subject, never with the frame. With ``keep_border_touching`` a component that touches
    the image border is never a speck (hanging strands, posts and vines are frame elements by
    definition). ``removed_areas``, when given, receives the areas of the dropped components.
    """
    labels, n = label_components(mask)
    if n <= 1:
        return mask.astype(bool), 0
    areas = component_areas(labels, n)
    boxes = component_bboxes(labels, n)
    big = int(np.argmax(areas[1:]) + 1)
    threshold = max(int(min_area), int(round(float(largest_frac) * float(areas[big]))))
    keep = areas >= threshold
    keep[big] = True
    if keep_inside_largest:
        bx0, by0, bx1, by1 = boxes[big]
        inside = (boxes[:, 0] >= bx0) & (boxes[:, 1] >= by0) & (boxes[:, 2] <= bx1) & (boxes[:, 3] <= by1)
        keep |= inside
    if keep_border_touching:
        keep |= border_touching(labels, n)
    keep[0] = False
    if removed_areas is not None:
        removed_areas.extend(int(a) for a in areas[1:][~keep[1:]])
    out = keep[labels]
    return out, int(n - keep[1:].sum())


def fill_holes(mask: np.ndarray, max_hole: int) -> tuple[np.ndarray, np.ndarray]:
    """Fill enclosed background components smaller than max_hole px; returns (mask, filled)."""
    mask = mask.astype(bool)
    bb = bbox_of(mask)
    filled = np.zeros_like(mask)
    if bb is None or max_hole <= 0:
        return mask, filled
    x0, y0, x1, y1 = bb
    sub = ~mask[y0:y1, x0:x1]
    labels, n = label_components(sub)
    if n == 0:
        return mask, filled
    areas = component_areas(labels, n)
    touch = border_touching(labels, n)
    small = (areas < max_hole) & ~touch
    small[0] = False
    f = small[labels]
    filled[y0:y1, x0:x1] = f
    return mask | filled, filled


def enclosed_by(component: np.ndarray) -> np.ndarray:
    """Pixels fully enclosed by ``component`` (not reachable from its bbox border through non-component pixels)."""
    bb = bbox_of(component)
    out = np.zeros_like(component, dtype=bool)
    if bb is None:
        return out
    x0, y0, x1, y1 = bb
    x0, y0 = max(0, x0 - 1), max(0, y0 - 1)
    x1, y1 = min(component.shape[1], x1 + 1), min(component.shape[0], y1 + 1)
    sub = ~component[y0:y1, x0:x1]
    labels, n = label_components(sub)
    if n == 0:
        return out
    touch = border_touching(labels, n)
    inner = ~touch
    inner[0] = False
    out[y0:y1, x0:x1] = inner[labels]
    return out
