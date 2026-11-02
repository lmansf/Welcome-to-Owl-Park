"""Split a picked painting into layers by a colour-coded edit of it (OP-173's six layers, OP-159).

From level 4 on, each screen of the tree is painted once, as one scene of everything at the camera's
pace, and cut into three layers: the back scenery (the scene itself, which the game draws a step
quieter), the platforms and the front props (the scene's own pixels, drawn again over it). Which
pixels are which is asked of the model as an edit of the scene: a colour-coded map of the same
picture in which every surface a visitor stands on is filled with one flat code colour and every
thing in front of the walkway with another. ``code_mask`` reads one code colour out of that map;
``split`` cleans it (specks dropped, small gaps closed, small holes filled, then grown a few pixels
so a top edge is never lost to the quieter copy underneath) and keeps the scene's pixels inside it,
the key colour everywhere else, for the finish step to key out as any keyed layer.

The kept pixels are the scene's own, byte for byte: the map only says where. So the three layers
stay in register however loosely the model redrew the rest of the map. Deterministic.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

from .labels import bbox_of, closing, dilate, fill_holes, label_components, remove_specks

#: How far (RGB distance) a pixel of the map may be from the code colour and still count as coded.
#: A shaded fill of pure green (40, 200, 40) is 79 away; moss #6E8B4E is 178 and bark 218.
CODE_TOLERANCE = 110.0


def code_mask(code_map: Image.Image, colour: tuple[int, int, int], tolerance: float = CODE_TOLERANCE,
              size: tuple[int, int] | None = None) -> np.ndarray:
    """Where ``code_map`` is filled with ``colour`` (within ``tolerance``), at ``size`` (default its own).

    A map at another size than the painting it codes (the edit is asked at the painting's size, but a
    model may answer a step off) is resized first, smoothly, so the decision is made at the
    painting's own pixels."""
    img = code_map.convert("RGB")
    if size is not None and img.size != tuple(size):
        img = img.resize(tuple(size), Image.Resampling.BILINEAR)
    a = np.asarray(img).astype(np.float32)
    d = np.sqrt(((a - np.asarray(colour, np.float32)) ** 2).sum(axis=2))
    return d <= tolerance


def split(base: Image.Image, code_map: Image.Image, colour: tuple[int, int, int], key_colour: tuple[int, int, int],
          tolerance: float = CODE_TOLERANCE, min_area: int = 400, close: int = 4, max_hole: int = 2000,
          grow: int = 3) -> tuple[Image.Image, dict]:
    """``base`` where ``code_map`` is coded ``colour``, ``key_colour`` everywhere else, and a report.

    The mask is cleaned in this order: components under ``min_area`` px dropped (the map's stray
    flecks), gaps up to ``close`` px closed, enclosed holes under ``max_hole`` px filled, then grown by
    ``grow`` px. Growing past a thing's outline costs nothing where the scene is sky (it is keyed out
    either way) and only repeats the scene's own pixels elsewhere."""
    rgb = base.convert("RGB")
    m = code_mask(code_map, colour, tolerance, rgb.size)
    coded = int(m.sum())
    if not coded:
        raise ValueError(f"the map has no pixels within {tolerance:g} of the code colour {colour}")
    m, specks = remove_specks(m, min_area, keep_inside_largest=False)
    m = closing(m, close) if close > 0 else m
    m, holes = fill_holes(m, max_hole)
    m = dilate(m, grow) if grow > 0 else m
    a = np.asarray(rgb)
    out = np.empty_like(a)
    out[...] = np.asarray(key_colour, np.uint8)
    out[m] = a[m]
    _, parts = label_components(m)
    bb = bbox_of(m)
    report = {
        "colour": list(colour),
        "tolerance": tolerance,
        "coded_px": coded,
        "kept_px": int(m.sum()),
        "parts": int(parts),
        "specks_dropped": int(specks),
        "holes_filled_px": int(holes.sum()),
        "kept_bbox": list(bb) if bb else None,
        "min_area": min_area, "close": close, "max_hole": max_hole, "grow": grow,
    }
    return Image.fromarray(out), report
