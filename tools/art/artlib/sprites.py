"""The sprite manifest (OP-127): every published sprite's drawn area, trimmed of the transparent
padding most image exports carry, so the park places boxes and markers on what is drawn rather
than on the file's frame, and nobody types pixel values in by hand again.

For each PNG in the public art folder (its 1x file; the 2x file, when there is one, is measured
instead and halved, which is twice as exact): the logical ``size`` it is drawn at, the ``drawn``
box ``[x, y, w, h]`` in those pixels (rounded outward), the ``centre`` of that box, and the
``solid`` box: only the pixels at least half opaque, the object itself without the soft glow or
haze painted round it (an idol's light, a lamp's halo), which is what a finger aims at. A pixel
counts as drawn when its alpha is over ``ALPHA``; a file with no alpha is drawn edge to edge.
Deterministic: the same files give the same manifest, byte for byte.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

# A pixel at or under this alpha (of 255) is transparent padding: the faint fringe an export leaves
# around a keyed sprite is not part of what a player sees.
ALPHA = 8
# At least half opaque: the object, not its glow.
SOLID = 128
SCHEMA = 1


def drawn_box(img: Image.Image, alpha: int = ALPHA) -> tuple[int, int, int, int] | None:
    """The box ``(x, y, w, h)`` around every pixel of ``img`` whose alpha is over ``alpha``, or None if there is none."""
    if img.mode == "P" or "transparency" in img.info:
        img = img.convert("RGBA")  # a palette's transparent entries, or a transparent colour
    if "A" not in img.getbands():
        return (0, 0, img.width, img.height)
    a = np.asarray(img.getchannel("A"))
    ys, xs = np.nonzero(a > alpha)
    if len(xs) == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1 - int(xs.min()), int(ys.max()) + 1 - int(ys.min()))


def measure(one: Image.Image, two: Image.Image | None = None) -> dict:
    """The manifest entry of a sprite drawn at ``one``'s size, measured on ``two`` (its 2x file) when given."""
    W, H = one.size
    img, k = (two, 2) if two is not None and two.size == (2 * W, 2 * H) else (one, 1)
    box = drawn_box(img)
    if box is None:
        return {"size": [W, H], "drawn": None, "centre": None, "solid": None}
    # The centre from the exact (2x) edges, to the half pixel.
    cx = round((box[0] + box[2] / 2) / k * 2) / 2
    cy = round((box[1] + box[3] / 2) / k * 2) / 2
    return {"size": [W, H], "drawn": _outward(box, k), "centre": [_num(cx), _num(cy)], "solid": _outward(drawn_box(img, SOLID - 1), k)}


def _outward(box: tuple[int, int, int, int] | None, k: int) -> list[int] | None:
    """``box`` (in pixels of a ``k``-times file) in 1x pixels, rounded outward."""
    if box is None:
        return None
    x0, y0 = math.floor(box[0] / k), math.floor(box[1] / k)
    x1, y1 = math.ceil((box[0] + box[2]) / k), math.ceil((box[1] + box[3]) / k)
    return [x0, y0, x1 - x0, y1 - y0]


def _num(v: float) -> int | float:
    return int(v) if v == int(v) else v


def build(public: Path) -> dict:
    """The manifest of every sprite in ``public``: its 1x PNGs, keyed by name without the extension."""
    sprites: dict[str, dict] = {}
    for path in sorted(public.glob("*.png")):
        if path.stem.endswith("@2x"):
            continue
        two = public / f"{path.stem}@2x.png"
        with Image.open(path) as one:
            one.load()
            if two.exists():
                with Image.open(two) as big:
                    big.load()
                    sprites[path.stem] = measure(one, big)
            else:
                sprites[path.stem] = measure(one)
    return {"schema": SCHEMA, "alpha": ALPHA, "sprites": sprites}


def dumps(manifest: dict) -> str:
    """The manifest as JSON with one sprite per line, so a regenerated file diffs line by line."""
    lines = [f'  {json.dumps(k)}: {json.dumps(v, separators=(", ", ": "))}' for k, v in manifest["sprites"].items()]
    head = f'{{\n  "schema": {manifest["schema"]},\n  "alpha": {manifest["alpha"]},\n  "sprites": {{\n'
    return head + ",\n".join("  " + line for line in lines) + "\n  }\n}\n"
