"""Encode a final under the PNG size budget with a deterministic quality ladder.

Order: truecolour (RGB/RGBA, optimize, compress level 9); then palettes of 256, 192, 160, 128,
96 and 64 colours (MEDIANCUT for RGB, FASTOCTREE for RGBA, or LIBIMAGEQUANT when Pillow was
compiled with it, because it is the only other quantizer that keeps alpha). The first result
under budget wins and its colour count is reported for provenance. LA images (the owl's white
tintable layers) bypass quantization: the game multiplies their grey levels by the visitor's
colour, so those levels must stay exact, and they are a few KB anyway.

Dithering (measured on Pillow 12.3): ``quantize(colors, dither=...)`` and
``convert('P', palette=ADAPTIVE, dither=...)`` ignore the dither flag; only
``quantize(palette=img, dither=FLOYDSTEINBERG)`` dithers, and it costs about ten times the bytes
on smooth gradients. The default is therefore no dither; ``ordered`` adds an 8 x 8 Bayer
perturbation of +-1.5 levels before quantization, which breaks sky banding and still compresses.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, features

from . import BUDGET_BYTES, ArtError
from .pngmeta import encode

LADDER = (256, 192, 160, 128, 96, 64)
_BAYER8 = np.array([
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
], np.float32)


class BudgetError(ArtError):
    pass


def has_libimagequant() -> bool:
    try:
        return bool(features.check("libimagequant"))
    except Exception:  # pragma: no cover
        return False


def ordered_predither(img: Image.Image, amplitude: float = 1.5) -> Image.Image:
    """Add a tiled Bayer offset of +-amplitude levels to the colour channels (alpha untouched)."""
    arr = np.asarray(img).astype(np.float32)
    H, W = arr.shape[:2]
    tile = np.tile(_BAYER8, (H // 8 + 1, W // 8 + 1))[:H, :W]
    offset = (tile / 64.0 - 0.5) * 2.0 * amplitude
    nch = 3 if img.mode in ("RGB", "RGBA") else 1
    if arr.ndim == 2:
        arr = np.clip(arr + offset, 0, 255)
    else:
        arr[..., :nch] = np.clip(arr[..., :nch] + offset[..., None], 0, 255)
    return Image.fromarray(np.round(arr).astype(np.uint8), img.mode)


def quantize(img: Image.Image, colors: int, dither: str = "none") -> Image.Image:
    if img.mode == "RGBA":
        method = Image.Quantize.LIBIMAGEQUANT if has_libimagequant() else Image.Quantize.FASTOCTREE
        return img.quantize(colors, method=method, dither=Image.Dither.NONE)
    if img.mode != "RGB":
        img = img.convert("RGB")
    pal = img.quantize(colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    if dither == "fs":
        return img.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG)
    return pal


def encode_under_budget(img: Image.Image, budget: int = BUDGET_BYTES, relaxed: int | None = None, dither: str = "none") -> tuple[bytes, dict]:
    """Returns (png bytes, info) with info = {mode, colors, bytes, budget, budget_relaxed, dither}."""
    if dither not in ("none", "ordered", "fs"):
        raise ArtError(f"unknown dither mode {dither!r}")
    mode = img.mode
    if mode in ("LA", "L", "P", "1"):
        data = encode(img)
        if len(data) > budget and (relaxed is None or len(data) > relaxed):
            raise BudgetError(f"{mode} image is {len(data)} bytes, over the {budget} budget")
        return data, {"mode": mode, "colors": None, "bytes": len(data), "budget": budget, "budget_relaxed": len(data) > budget, "dither": "none"}
    if mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in mode else "RGB")
        mode = img.mode

    attempts: list[tuple[int | None, bytes]] = []
    data = encode(img)
    attempts.append((None, data))
    if len(data) <= budget:
        return data, {"mode": mode, "colors": None, "bytes": len(data), "budget": budget, "budget_relaxed": False, "dither": "none"}

    src = ordered_predither(img) if dither == "ordered" else img
    for colors in LADDER:
        q = quantize(src, colors, dither)
        data = encode(q)
        attempts.append((colors, data))
        if len(data) <= budget:
            return data, {"mode": "P", "colors": colors, "bytes": len(data), "budget": budget, "budget_relaxed": False, "dither": dither, "source_mode": mode}

    if relaxed is not None and relaxed > budget:
        for colors, data in attempts:
            if len(data) <= relaxed:
                return data, {"mode": "P" if colors else mode, "colors": colors, "bytes": len(data), "budget": relaxed, "budget_relaxed": True, "dither": dither if colors else "none", "source_mode": mode}
    smallest = min(len(d) for _, d in attempts)
    raise BudgetError(f"nothing fits: smallest encoding is {smallest} bytes against a {budget} byte budget" + (f" (relaxed {relaxed})" if relaxed else ""))
