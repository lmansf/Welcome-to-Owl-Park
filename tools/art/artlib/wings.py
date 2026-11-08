"""Wings: rooms painted wider than one screen, one 1600 x 900 tile per screen.

A wing is an edit of the room's approved painting: the painting's 800 px edge strip (at 2x)
sits at one end of a flat grey canvas and the model paints the grey (``outpaint_canvas``; the
generator's ``wing`` jobs send it as ``@canvas:<key>``). The post stage puts the result back
against the painting (``stitch``): the wing is scaled to the canvas at 2x, its tone is matched to
the painting near the join, and the two are joined along the cheapest top-to-bottom cut through
the 800 px they share, so as little of the approved painting as possible is replaced.
``split_tiles`` then cuts the whole room into screens: the wings, and the painting itself with a
blended band at each join. A room's foreground overlay keeps its frame at the room's ends:
``split_overlay`` moves the pieces that touch the painting's west or east edge to the end tiles.

Wing keys are ``<room>-west`` and ``<room>-east``; their overlays ``<room>-west-fg`` and
``<room>-east-fg``. Everything here works at 2x (3200 x 1800 per screen) on numpy arrays and is
deterministic.
"""

from __future__ import annotations

import re

import numpy as np
from PIL import Image

from . import ROOM_H, ROOM_W

#: One screen at 2x, and the strip of painting a wing is given (and shares with it).
TILE_W, TILE_H, OVERLAP = 2 * ROOM_W, 2 * ROOM_H, 800
#: The outpaint canvas: the strip plus a screen of grey, sent at half size (2000 x 900).
CANVAS_GREY = (127, 127, 127)
SIDES = ("west", "east")
_WING_RE = re.compile(r"^(?P<room>[a-z][a-z0-9]*)-(?P<side>west|east)$")


def wing_of(key: str) -> tuple[str, str] | None:
    """``hub-west`` -> ("hub", "west"); None for any key that is not a wing."""
    m = _WING_RE.match(key)
    return (m["room"], m["side"]) if m else None


def tile_key(room: str, part: str, overlay: bool = False) -> str:
    """The art key of one screen of a room: ``hub-west``, ``hub`` (the painting) or ``hub-east``; ``-fg`` for its overlay."""
    base = room if part == "mid" else f"{room}-{part}"
    return f"{base}-fg" if overlay else base


def outpaint_canvas(painting2x: Image.Image, side: str) -> Image.Image:
    """The painting's edge strip on a grey canvas a screen wider, at half size (2000 x 900)."""
    art = painting2x.convert("RGB")
    W, H = art.size
    canvas = Image.new("RGB", (OVERLAP + W, H), CANVAS_GREY)
    if side == "east":
        canvas.paste(art.crop((W - OVERLAP, 0, W, H)), (0, 0))
    else:
        canvas.paste(art.crop((0, 0, OVERLAP, H)), (W, 0))
    return canvas.resize(((OVERLAP + W) // 2, H // 2), Image.Resampling.LANCZOS)


def blur(x: np.ndarray, sigma: float, axis: int) -> np.ndarray:
    """Separable Gaussian blur along one axis (edges clamped)."""
    r = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pad = [(0, 0)] * x.ndim
    pad[axis] = (r, r)
    xp = np.pad(x, pad, mode="edge")
    out = np.zeros_like(x)
    for i, w in enumerate(k):
        sl = [slice(None)] * x.ndim
        sl[axis] = slice(i, i + x.shape[axis])
        out += w * xp[tuple(sl)]
    return out


def seam(a: np.ndarray, b: np.ndarray, outer_right: bool, margin: int = 60) -> np.ndarray:
    """Column of the cheapest top-to-bottom cut through the overlap, per row.

    The cost is where the painting (a) and the wing's repaint of it (b) disagree, plus a small pull
    toward the painting's outer edge so as little of the approved painting as possible is replaced.
    """
    h, w, _ = a.shape
    cost = np.abs(a - b).sum(axis=2)
    cost = blur(blur(cost, 4, 0), 4, 1)
    x = np.arange(w, dtype=np.float32)
    cost += 8.0 * ((w - 1 - x) if outer_right else x) / w
    cost[:, :margin] = 1e9
    cost[:, w - margin:] = 1e9
    acc = cost.copy()
    back = np.zeros((h, w), np.int8)
    for y in range(1, h):
        prev = acc[y - 1]
        left = np.r_[np.inf, prev[:-1]]
        right = np.r_[prev[1:], np.inf]
        stack = np.stack([left, prev, right])
        k = stack.argmin(axis=0)
        acc[y] += stack[k, np.arange(w)]
        back[y] = k - 1
    path = np.zeros(h, np.int32)
    path[-1] = int(acc[-1].argmin())
    for y in range(h - 1, 0, -1):
        path[y - 1] = path[y] + back[y, path[y]]
    return path


def stitch(painting2x: Image.Image, wing: Image.Image, side: str, feather: float = 24.0) -> tuple[Image.Image, dict]:
    """Painting + wing at 2x (6400 x 1800), joined along the cheapest seam in the overlap, with the
    wing's tone matched to the painting near the join (fading out across the wing).

    Returns the panorama and a report: the mean difference between the painting and the wing's
    repaint of it over the overlap (lower is a closer match), and the seam's column range.
    """
    W, H = TILE_W, TILE_H
    art = np.asarray(painting2x.convert("RGB")).astype(np.float32)
    if art.shape[:2] != (H, W):
        raise ValueError(f"the painting is {art.shape[1]}x{art.shape[0]}, not {W}x{H}")
    big = np.asarray(wing.convert("RGB").resize((W + OVERLAP, H), Image.Resampling.LANCZOS)).astype(np.float32)
    if side == "west":  # work as if the wing were on the right, then mirror back
        art, big = art[:, ::-1], big[:, ::-1]
    a, b = art[:, W - OVERLAP:], big[:, :OVERLAP]
    diff = float(np.abs(a - b).mean())
    # Tone: per-row offset (painting minus repaint) over the overlap, smoothed, clamped.
    off = np.clip(blur((a - b).mean(axis=1), 60, 0), -30, 30)  # (H, 3)
    fade = np.clip(1 - np.arange(W + OVERLAP) / 2400.0, 0, 1)[None, :, None]
    wing_px = np.clip(big + off[:, None, :] * fade, 0, 255)
    path = seam(a, wing_px[:, :OVERLAP], outer_right=True)
    mask = (np.arange(OVERLAP)[None, :] > path[:, None]).astype(np.float32)  # 1 = wing
    mask = blur(blur(mask, feather, 1), feather / 2, 0)[:, :, None]
    pano = np.zeros((H, 2 * W, 3), np.float32)
    pano[:, :W] = art
    pano[:, W - OVERLAP:W] = a * (1 - mask) + wing_px[:, :OVERLAP] * mask
    pano[:, W:] = wing_px[:, OVERLAP:]
    if side == "west":
        pano = pano[:, ::-1]
    cols = (path.min(), path.max()) if side == "east" else (OVERLAP - 1 - path.max(), OVERLAP - 1 - path.min())
    report = {"side": side, "overlap_diff": round(diff, 1), "seam_columns": [int(cols[0]), int(cols[1])]}
    return Image.fromarray(np.clip(pano + 0.5, 0, 255).astype(np.uint8)), report


def split_tiles(painting2x: Image.Image, panos: dict[str, Image.Image]) -> dict[str, Image.Image]:
    """The room's screens at 2x, west to east: ``west`` and ``east`` from the stitched panoramas,
    ``mid`` the painting with each join's blended band taken from its panorama."""
    W, H = TILE_W, TILE_H
    tiles: dict[str, Image.Image] = {}
    mid = np.asarray(painting2x.convert("RGB")).copy()
    if "west" in panos:
        west = np.asarray(panos["west"].convert("RGB"))
        tiles["west"] = Image.fromarray(west[:, :W].copy())
        mid[:, :OVERLAP] = west[:, W:W + OVERLAP]
    tiles["mid"] = None  # keeps the west-to-east order
    if "east" in panos:
        east = np.asarray(panos["east"].convert("RGB"))
        mid[:, W - OVERLAP:] = east[:, W - OVERLAP:W]
        tiles["east"] = Image.fromarray(east[:, W:].copy())
    tiles["mid"] = Image.fromarray(mid)
    return tiles


def _grow(m: np.ndarray) -> np.ndarray:
    g = m.copy()
    g[1:] |= m[:-1]
    g[:-1] |= m[1:]
    g[:, 1:] |= m[:, :-1]
    g[:, :-1] |= m[:, 1:]
    return g


def edge_pieces(alpha: np.ndarray, side: str) -> np.ndarray:
    """Mask of the overlay's pieces that touch the painting's west or east edge (filled at half
    size from the edge columns), grown 3 px so each piece's soft edge comes along."""
    m = alpha[::2, ::2] > 8
    seed = np.zeros_like(m)
    if side == "west":
        seed[:, :3] = m[:, :3]
    else:
        seed[:, -3:] = m[:, -3:]
    while True:
        g = _grow(seed) & m
        if (g == seed).all():
            break
        seed = g
    full = np.repeat(np.repeat(seed, 2, 0), 2, 1)[: alpha.shape[0], : alpha.shape[1]]
    for _ in range(3):
        full = _grow(full)
    return full


def split_overlay(fg2x: np.ndarray, fg1x: np.ndarray, sides: tuple[str, ...]) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """The overlay's pieces at the painting's ``sides`` edges moved to those end tiles; the rest
    stays on the painting's screen. Returns {part: (rgba 2x, rgba 1x)} for ``mid`` and each side;
    the 1x copy is the published 1x overlay cut with the same mask (any 2x pixel of a 1x pixel)."""
    H2, W2 = fg2x.shape[:2]
    H1, W1 = fg1x.shape[:2]
    if (W2, H2) != (2 * W1, 2 * H1):
        raise ValueError(f"the 2x overlay is {W2}x{H2}, not twice the 1x {W1}x{H1}")
    rest2, rest1 = fg2x.copy(), fg1x.copy()
    out: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for side in sides:
        m2 = edge_pieces(fg2x[:, :, 3], side)
        m1 = m2.reshape(H1, 2, W1, 2).any(axis=(1, 3))
        out[side] = (np.where(m2[:, :, None], fg2x, 0).astype(np.uint8), np.where(m1[:, :, None], fg1x, 0).astype(np.uint8))
        rest2[m2] = 0
        rest1[m1] = 0
    out["mid"] = (rest2, rest1)
    return out
