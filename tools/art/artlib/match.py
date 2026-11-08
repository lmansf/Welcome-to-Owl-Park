"""Match one keyed layer's colours to another's (OP-159).

Two screens' overlays are painted on their own and can come back in different keys of the palette:
level 4's overlook drew its leaves pale and grey where the stair landing's are dark and blue, and the
pair showed side by side as the camera panned. ``match_colours`` moves the props of a candidate (its
pixels well away from the key colour) to the reference's mean and spread, channel by channel, and
leaves the key colour and the blended rim next to it as they are, so the finish keys it as before.
Deterministic.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

#: How far (RGB distance) from the key colour a pixel must be to count as the props, not the rim.
SOLID_DISTANCE = 160.0


def solid_mask(rgb: np.ndarray, key_colour: tuple[int, int, int], distance: float = SOLID_DISTANCE) -> np.ndarray:
    """Where ``rgb`` (H x W x 3) is more than ``distance`` from ``key_colour``: the painted props."""
    d = np.sqrt(((rgb.astype(np.float32) - np.asarray(key_colour, np.float32)) ** 2).sum(axis=2))
    return d > distance


def match_colours(img: Image.Image, ref: Image.Image, key_colour: tuple[int, int, int],
                  ref_key_colour: tuple[int, int, int] | None = None, distance: float = SOLID_DISTANCE) -> tuple[Image.Image, dict]:
    """``img`` with its props moved to ``ref``'s props' mean and spread per RGB channel, and a report."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    b = np.asarray(ref.convert("RGB")).astype(np.float32)
    ma = solid_mask(a, key_colour, distance)
    mb = solid_mask(b, ref_key_colour or key_colour, distance)
    if not ma.any():
        raise ValueError(f"the candidate has no pixels over {distance:g} from its key colour to match")
    if not mb.any():
        raise ValueError(f"the reference has no pixels over {distance:g} from its key colour to match to")
    mu_a, sd_a = a[ma].mean(axis=0), a[ma].std(axis=0) + 1e-3
    mu_b, sd_b = b[mb].mean(axis=0), b[mb].std(axis=0)
    out = a.copy()
    out[ma] = (a[ma] - mu_a) / sd_a * sd_b + mu_b
    report = {
        "distance": distance,
        "matched_px": int(ma.sum()),
        "from_mean": [round(float(v), 1) for v in mu_a],
        "to_mean": [round(float(v), 1) for v in mu_b],
        "from_spread": [round(float(v), 1) for v in sd_a],
        "to_spread": [round(float(v), 1) for v in sd_b],
    }
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)), report
