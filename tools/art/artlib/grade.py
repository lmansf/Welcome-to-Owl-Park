"""Deterministic per-realm palette grade: a chroma pull toward palette anchors in CIE Lab.

``grade(img, palette, strength)`` converts sRGB to Lab (D65) in numpy, moves each pixel's (a, b)
toward the nearest anchor's (a, b) by ``strength`` (luminance is ignored when choosing the anchor,
so painterly shading survives), remaps L linearly so the darkest and brightest percentiles reach
the realm's black and white, scales chroma by ``chroma_boost`` and converts back. Every effect is
weighted by ``strength`` so 0 is the identity and 1 the full grade. Alpha is never touched. There
is no randomness: the same input, palette and parameters give byte-identical output, so the art
director can edit a palette JSON and rerun a room from the cached raw in seconds.

Palette JSON (tools/art/palettes/<realm>.json): {"anchors": ["#RRGGBB", ...], "black": "#..",
"white": "#..", "strength": 0.35, "chroma_boost": 1.1, "levels_percentiles": [0.5, 99.5]}.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from . import PALETTES_DIR, ArtError, parse_hex, sha256_file

_M_RGB2XYZ = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]], np.float64)
_M_XYZ2RGB = np.linalg.inv(_M_RGB2XYZ)
_WHITE = np.array([0.95047, 1.0, 1.08883], np.float64)
_DELTA = 6.0 / 29.0


def load_palette(realm_or_path: str | Path) -> tuple[dict, str]:
    """Returns (palette dict, 'sha256:<hex>' of the file)."""
    p = Path(realm_or_path)
    if not p.suffix:
        p = PALETTES_DIR / f"{realm_or_path}.json"
    if not p.exists():
        raise ArtError(f"no palette {realm_or_path!r} (looked for {p})")
    pal = json.loads(p.read_text(encoding="utf-8"))
    for field in ("anchors", "black", "white"):
        if field not in pal:
            raise ArtError(f"palette {p.name} lacks {field!r}")
    pal.setdefault("strength", 0.35)
    pal.setdefault("chroma_boost", 1.0)
    pal.setdefault("levels_percentiles", [0.5, 99.5])
    pal["_file"] = p.name
    return pal, "sha256:" + sha256_file(p)


def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """rgb float in 0..1, shape (..., 3) -> Lab (L 0..100)."""
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    xyz = c @ _M_RGB2XYZ.T / _WHITE
    f = np.where(xyz > _DELTA ** 3, np.cbrt(xyz), xyz / (3 * _DELTA ** 2) + 4.0 / 29.0)
    L = 116.0 * f[..., 1] - 16.0
    a = 500.0 * (f[..., 0] - f[..., 1])
    b = 200.0 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


def lab_to_srgb(lab: np.ndarray) -> np.ndarray:
    fy = (lab[..., 0] + 16.0) / 116.0
    fx = fy + lab[..., 1] / 500.0
    fz = fy - lab[..., 2] / 200.0
    f = np.stack([fx, fy, fz], axis=-1)
    xyz = np.where(f > _DELTA, f ** 3, 3 * _DELTA ** 2 * (f - 4.0 / 29.0)) * _WHITE
    c = xyz @ _M_XYZ2RGB.T
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def _lab_of_hex(h: str) -> np.ndarray:
    return srgb_to_lab(np.array(parse_hex(h), np.float64)[None, :] / 255.0)[0]


def grade(img: Image.Image, palette: dict, strength: float | None = None, chroma_boost: float | None = None) -> Image.Image:
    s = float(palette.get("strength", 0.35) if strength is None else strength)
    s = min(1.0, max(0.0, s))
    boost = float(palette.get("chroma_boost", 1.0) if chroma_boost is None else chroma_boost)
    if s == 0.0:
        return img.copy()
    mode = img.mode
    has_alpha = mode in ("RGBA", "LA")
    src = img.convert("RGBA" if has_alpha else "RGB")
    arr = np.asarray(src)
    rgb = arr[..., :3].astype(np.float64) / 255.0
    H, W = rgb.shape[:2]
    lab = srgb_to_lab(rgb)

    anchors = np.array([_lab_of_hex(a)[1:] for a in palette["anchors"]], np.float64)
    if anchors.size == 0:
        raise ArtError("palette has no anchors")
    Lb, Lw = _lab_of_hex(palette["black"])[0], _lab_of_hex(palette["white"])[0]
    plo, phi = palette.get("levels_percentiles", [0.5, 99.5])

    L = lab[..., 0]
    valid = arr[..., 3] > 0 if has_alpha else np.ones((H, W), bool)
    Lv = L[valid] if valid.any() else L.ravel()
    lo, hi = np.percentile(Lv, plo), np.percentile(Lv, phi)
    if hi - lo > 1e-6:
        L_target = Lb + (L - lo) * (Lw - Lb) / (hi - lo)
        L_new = L + s * (np.clip(L_target, 0.0, 100.0) - L)
    else:
        L_new = L

    ab = lab[..., 1:].reshape(-1, 2)
    out_ab = np.empty_like(ab)
    step = 262144
    for i in range(0, ab.shape[0], step):
        chunk = ab[i : i + step]
        d2 = ((chunk[:, None, :] - anchors[None, :, :]) ** 2).sum(-1)
        near = anchors[np.argmin(d2, axis=1)]
        out_ab[i : i + step] = chunk + s * (near - chunk)
    boost_eff = 1.0 + s * (boost - 1.0)
    out_ab *= boost_eff
    new_lab = np.concatenate([L_new.reshape(-1, 1), out_ab], axis=1).reshape(H, W, 3)
    out_rgb = np.round(np.clip(lab_to_srgb(new_lab), 0.0, 1.0) * 255.0).astype(np.uint8)
    if has_alpha:
        out = np.dstack([out_rgb, arr[..., 3]])
        out[arr[..., 3] == 0, :3] = arr[arr[..., 3] == 0, :3]
        res = Image.fromarray(out, "RGBA")
        return res.convert(mode) if mode != "RGBA" else res
    res = Image.fromarray(out_rgb, "RGB")
    return res.convert(mode) if mode != "RGB" else res
