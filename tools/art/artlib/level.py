"""Levelling the recut's run rows (OP-251): one lightness from a row's left end to its right.

Each run of the recut (``kit.recut.runs``) was painted as one long piece lit from the moon in the
upper right and then cut across into a left cap, middles of three lengths and a right cap, so the
pieces taken from the left of the run came out darker than those from the right, and a row laid from
them steps in value at every seam (stone worst: its left cap about half as light as its long middle).
``level_piece`` takes the slow left-to-right drift out of one piece: the mean colour of each column of
its opaque pixels, smoothed wide so the texture and the joints stay, is brought to the row's own: its
lightness by a scale of the column's linear light, then its a and b by a shift (the left end of the
stone run also came out cooler). The small detail inside a piece, its rim light and its shadows,
stays; only the drift across it goes.
Deterministic (numpy only), and the alpha is never touched.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

from .grade import lab_to_srgb, srgb_to_lab

#: A pixel counts as opaque from this alpha (of 255).
OPAQUE = 128
#: How wide the column profile is smoothed, as a fraction of the row's height: wide enough that a
#: plank joint or a stone block is not levelled away, narrow enough to follow the ramp.
SMOOTH = 0.6
#: The most a column's light is scaled either way.
GAIN = (0.33, 4.5)


def _to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def _Y_of_L(L: np.ndarray | float) -> np.ndarray:
    L = np.asarray(L, dtype=np.float64)
    f = (L + 16.0) / 116.0
    return np.where(L > 8.0, f**3, L / 903.3)


def _split(img: Image.Image) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    arr = np.asarray(img.convert("RGBA"))
    rgb = arr[..., :3].astype(np.float64) / 255.0
    return rgb, arr[..., 3], arr[..., 3] >= OPAQUE


def mean_L(img: Image.Image) -> float:
    """The mean lightness (CIE L, 0 to 100) of a piece's opaque pixels."""
    rgb, _, mask = _split(img)
    return float(srgb_to_lab(rgb)[..., 0][mask].mean()) if mask.any() else 0.0


def _smooth(values: np.ndarray, weight: np.ndarray, sigma: float) -> np.ndarray:
    """A weighted gaussian smooth of a 1-D profile (edges reflected), so empty columns borrow from their neighbours."""
    r = max(1, int(round(sigma * 3)))
    x = np.arange(-r, r + 1, dtype=np.float64)
    k = np.exp(-0.5 * (x / max(sigma, 1e-6)) ** 2)
    pad = lambda a: np.pad(a, r, mode="reflect")  # noqa: E731
    num = np.convolve(pad(values * weight), k, mode="valid")
    den = np.convolve(pad(weight), k, mode="valid")
    return np.where(den > 1e-9, num / np.maximum(den, 1e-9), values.mean() if weight.any() else 0.0)


def column_profiles(img: Image.Image, smooth: float = SMOOTH) -> np.ndarray:
    """The smoothed mean L, a and b of each column's opaque pixels, shape (3, width)."""
    rgb, _, mask = _split(img)
    lab = srgb_to_lab(rgb)
    count = mask.sum(axis=0).astype(np.float64)
    out = []
    for ch in range(3):
        total = np.where(mask, lab[..., ch], 0.0).sum(axis=0)
        col = np.where(count > 0, total / np.maximum(count, 1), 0.0)
        out.append(_smooth(col, count, smooth * img.height))
    return np.stack(out)


def level_piece(img: Image.Image, target: tuple[float, float, float], smooth: float = SMOOTH, chroma: bool = True) -> tuple[Image.Image, dict]:
    """The piece with each column brought to the row's colour ``target`` (L, a, b): its light scaled so
    its smoothed mean L is the row's, then its smoothed mean a and b shifted to the row's, so a cap cut
    from the cooler end of a run takes the same stone colour as the middles. With ``chroma`` off only
    the light is levelled: for a row whose caps carry much green (an earth bank's ferns), where the
    column's mean colour is not the face's and the shift would redden it. Returns (image, parameters)."""
    rgb, alpha, mask = _split(img)
    prof = column_profiles(img, smooth)
    gain = np.clip(_Y_of_L(target[0]) / np.maximum(_Y_of_L(prof[0]), 1e-6), *GAIN)
    lin = np.clip(_to_linear(rgb) * gain[None, :, None], 0.0, 1.0)
    lab = srgb_to_lab(_to_srgb(lin))
    if chroma:
        lab[..., 1] += (target[1] - prof[1])[None, :]
        lab[..., 2] += (target[2] - prof[2])[None, :]
    out = np.round(np.clip(lab_to_srgb(lab), 0.0, 1.0) * 255.0).astype(np.uint8)
    res = Image.fromarray(np.dstack([out, alpha]), "RGBA")
    before = float(srgb_to_lab(rgb)[..., 0][mask].mean()) if mask.any() else 0.0
    return res, {
        "target_L": round(float(target[0]), 2),
        "gain_min": round(float(gain.min()), 3),
        "gain_max": round(float(gain.max()), 3),
        "ab_shift": round(float(np.abs(np.stack([target[1] - prof[1], target[2] - prof[2]])).max()), 2) if chroma else 0.0,
        "chroma": chroma,
        "L_before": round(before, 2),
        "L_after": round(mean_L(res), 2),
    }


def row_target(pieces: list[Image.Image]) -> tuple[float, float, float]:
    """A row's colour: the mean L, a and b over the opaque pixels of all its pieces (each weighted by its size)."""
    total = np.zeros(3)
    n = 0
    for p in pieces:
        rgb, _, mask = _split(p)
        if mask.any():
            total += srgb_to_lab(rgb)[mask].sum(axis=0)
            n += int(mask.sum())
    return tuple(float(v) for v in (total / n if n else total))  # type: ignore[return-value]


def tools_line(params: dict, smooth: float = SMOOTH) -> str:
    return f"level: row L {params['target_L']} (from {params['L_before']} to {params['L_after']}), column gain {params['gain_min']} to {params['gain_max']}, {'a/b shift up to ' + str(params['ab_shift']) if params.get('chroma', True) else 'light only, no a/b shift'}, smooth {smooth} x height (OP-251)"
