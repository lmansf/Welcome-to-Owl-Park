"""The tree's one palette (docs/TREE_STYLE.md section 1) as colour families, and how far a screen may drift from it (OP-252).

Each family is the segment in CIE Lab between its two anchors (``bark #2B1C12 to #4A3322``), or a
point when it has one (``cream #F6F1E3``). Every pixel of a screen goes to its nearest family by a
distance in which lightness counts half (``L_WEIGHT``): light and shade move a colour's value, and
the value bands (``artlib.bands``) already hold value; the palette is about hue and chroma.

Two numbers per screen:

- ``drift``: for each family holding at least ``MIN_SHARE`` of the screen, the length of the mean
  (a, b) offset of its pixels from the family's segment. Scatter cancels out; a family whose pixels all
  lean one way (moss gone teal, bark gone red) does not. It may be at most ``TOLERANCE`` (lantern
  gold ``GOLD_TOLERANCE``: its glow falls off warm toward orange in the approved targets themselves).
- ``off``: the share of pixels further than ``OFF_DISTANCE`` from every family, a colour the palette
  does not have. It may be at most ``OFF_SHARE``.

The tolerances are set on the three approved targets (``tools/art/targets/``, OP-249) with room to
spare: there the largest drift is 12 (the violet-navy of the Clearing's shade) and lantern gold's 16.5,
and at most 0.6 % of a target is off the palette.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

from .grade import srgb_to_lab

#: The families of docs/TREE_STYLE.md section 1 (and the underground's violet-navy, section 2).
FAMILIES: dict[str, tuple[str, ...]] = {
    "bark": ("#2B1C12", "#4A3322"),
    "inner wood": ("#5C4632", "#8F8068"),
    "moss": ("#3E5A3A", "#6E8B4E"),
    "leaf": ("#4F7A3E", "#8DAE5A"),
    "lantern gold": ("#C9A227", "#FFD36A"),
    "cream": ("#F6F1E3",),
    "navy": ("#0C1E36", "#07122A"),
    "dusk blue": ("#2E4C7A",),
    "sky blue": ("#6F9BC8",),
    "violet-navy": ("#1B1A30",),
}
L_WEIGHT = 0.5
MIN_SHARE = 0.01
TOLERANCE = 13.0
GOLD_TOLERANCE = 18.0
OFF_DISTANCE = 25.0
OFF_SHARE = 0.015


def _lab_of_hex(h: str) -> np.ndarray:
    rgb = np.array([[int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]])
    return srgb_to_lab(rgb)[0]


_SEGMENTS = {name: (_lab_of_hex(hx[0]), _lab_of_hex(hx[-1])) for name, hx in FAMILIES.items()}


def _offsets(lab: np.ndarray, name: str) -> np.ndarray:
    """(N, 3) offsets of Lab pixels from the nearest point of a family's segment, L already weighted."""
    p0, p1 = _SEGMENTS[name]
    d = p1 - p0
    dd = float((d * d).sum())
    t = np.clip(((lab - p0) @ d) / dd, 0.0, 1.0) if dd > 0 else np.zeros(len(lab))
    e = lab - (p0 + t[:, None] * d)
    e[:, 0] *= L_WEIGHT
    return e


def measure(img: Image.Image, max_side: int = 800) -> dict:
    """``{"off": share, "families": {name: {"share", "drift"}}}`` for a screen (opaque pixels only when it has an alpha)."""
    if max(img.size) > max_side:
        k = max_side / max(img.size)
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.BILINEAR)
    if "A" in img.getbands():
        arr = np.asarray(img.convert("RGBA"))
        keep = arr[..., 3].reshape(-1) >= 128
        rgb = arr[..., :3].reshape(-1, 3)[keep]
    else:
        rgb = np.asarray(img.convert("RGB")).reshape(-1, 3)
    if len(rgb) == 0:
        return {"off": 0.0, "families": {}}
    lab = srgb_to_lab(rgb.astype(np.float64) / 255.0)
    names = list(FAMILIES)
    offs = [_offsets(lab, n) for n in names]
    dist = np.stack([np.sqrt((e * e).sum(axis=1)) for e in offs], axis=1)
    near = dist.argmin(axis=1)
    out = {"off": round(float((dist.min(axis=1) > OFF_DISTANCE).mean()), 4), "families": {}}
    for i, n in enumerate(names):
        sel = near == i
        share = float(sel.mean())
        if share == 0:
            continue
        bias = offs[i][sel].mean(axis=0)
        out["families"][n] = {"share": round(share, 4), "drift": round(float(np.hypot(bias[1], bias[2])), 2)}
    return out


def tolerance_of(name: str) -> float:
    return GOLD_TOLERANCE if name == "lantern gold" else TOLERANCE


def problems(m: dict) -> list[str]:
    """Why a screen's colours are off the palette; empty when every family holds."""
    out = []
    for n, f in m["families"].items():
        if f["share"] >= MIN_SHARE and f["drift"] > tolerance_of(n):
            out.append(f"{n} drifts {f['drift']} from the palette (at most {tolerance_of(n)}, {f['share'] * 100:.0f} % of the screen)")
    if m["off"] > OFF_SHARE:
        out.append(f"{m['off'] * 100:.1f} % of the screen is off the palette (at most {OFF_SHARE * 100:.1f} %)")
    return out
