"""Small fixes to a picked painting: edit a crop of it, then paste back only what the edit changed.

A detail of an approved painting sometimes needs repainting (a weathervane, a stray sign). Sending
the whole painting for an edit risks the model re-rendering all of it, so ``cut`` takes a crop
around the detail (the generator sends it as ``@canvas:<key>``), the model edits the crop, and
``patch`` pastes the edit back into the painting only where it differs from the crop, inside a box:
the changed pixels, cleaned of specks, closed over small gaps, with enclosed holes filled, grown a
few pixels and feathered, and tone-matched to the original around the patch. Everything outside
the patch is the original painting, byte for byte. Deterministic.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Box = tuple[int, int, int, int]


def cut(base: Image.Image, box: Box) -> Image.Image:
    """The crop of ``base`` to send for an edit (RGB)."""
    x0, y0, x1, y1 = box
    if not (0 <= x0 < x1 <= base.width and 0 <= y0 < y1 <= base.height):
        raise ValueError(f"box {box} is not inside the {base.width}x{base.height} image")
    return base.convert("RGB").crop(box)


def _grow(m: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return m
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * px + 1))) > 0


def _shrink(m: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return m
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(2 * px + 1))) > 0


def _fill_holes(m: np.ndarray) -> np.ndarray:
    """``m`` with every region of background not connected to the border filled in."""
    h, w = m.shape
    pad = Image.new("L", (w + 2, h + 2), 0)
    pad.paste(Image.fromarray((m * 255).astype(np.uint8)), (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    outside = np.asarray(pad)[1:-1, 1:-1] == 128
    return ~outside


def patch(base: Image.Image, edit: Image.Image, at: tuple[int, int], box: Box | None = None,
          threshold: float = 30.0, grow: int = 6, close: int = 8, feather: float = 2.5) -> tuple[Image.Image, dict]:
    """``base`` with ``edit`` (an edit of the crop of ``base`` whose top-left corner is ``at``)
    pasted back where the two differ by more than ``threshold`` (0..255, any channel), inside
    ``box`` (edit pixels; default the whole edit). Returns the patched image and a report."""
    ax, ay = at
    ew, eh = edit.size
    region = cut(base, (ax, ay, ax + ew, ay + eh))
    a = np.asarray(region).astype(np.float32)
    b = np.asarray(edit.convert("RGB")).astype(np.float32)
    inside = np.zeros((eh, ew), bool)
    x0, y0, x1, y1 = box or (0, 0, ew, eh)
    inside[y0:y1, x0:x1] = True
    changed = (np.abs(a - b).max(axis=2) > threshold) & inside
    m = _grow(_shrink(changed, 1), 1)  # open: drop specks of re-render noise
    m = _shrink(_grow(m, close), close)  # close: bridge small gaps
    m = _grow(_fill_holes(m), grow) & inside
    if not m.any():
        raise ValueError("the edit does not differ from the painting inside the box")
    ring = _grow(m, 12) & ~m & inside
    shift = (a[ring].mean(axis=0) - b[ring].mean(axis=0)) if ring.any() else np.zeros(3, np.float32)
    alpha = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))).astype(np.float32)[..., None] / 255
    alpha *= inside[..., None]
    out = a * (1 - alpha) + np.clip(b + shift, 0, 255) * alpha
    patched = base.convert("RGB").copy()
    patched.paste(Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)), (ax, ay))
    ys, xs = np.nonzero(m)
    report = {
        "at": [ax, ay],
        "box": [x0, y0, x1, y1],
        "patched_px": int(m.sum()),
        "patch_bbox": [int(xs.min()) + ax, int(ys.min()) + ay, int(xs.max()) + 1 + ax, int(ys.max()) + 1 + ay],
        "tone_shift": [round(float(v), 2) for v in shift],
        "threshold": threshold, "grow": grow, "close": close, "feather": feather,
    }
    return patched, report
