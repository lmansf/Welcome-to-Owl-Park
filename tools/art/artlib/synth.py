"""Synthetic inputs drawn with Pillow for tests and the offline ``demo``.

These stand in for image-model output when there is no network: a keyed subject with an
anti-aliased edge and key spill, a room-like gradient scene, a border-only (or deliberately bad)
foreground overlay, and an owl master in the key-colour convention with the same layout and
colours as the generator's mock provider (red body, green chest, blue feet and tuft tips on a
magenta backdrop, cream/gold/black eyes, gold beak, feet 6 % above the bottom edge, slightly
off-centre). The owl drawer also returns the ground-truth label map the splitter is tested
against.

``fixture_geometry()`` mirrors ``packages/shared/rooms/index.ts`` for offline guide and overlay
tests; the live ``work/art/geometry.json`` (from ``pnpm art:geometry``) always wins in real use.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from . import BUILTIN_ASSETS, ROOM_H, ROOM_W, parse_hex

TRUTH_BACKDROP, TRUTH_BODY, TRUTH_BELLY, TRUTH_ACCENT, TRUTH_EYES, TRUTH_BEAK, TRUTH_FEET_FIXED = 0, 1, 2, 3, 4, 5, 6


def _rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def synth_room(w: int = 3200, h: int = 1800, seed: int = 1, realm: str = "hub") -> Image.Image:
    """Sky gradient, ground plane from 0.55 h, a trunk and four door blocks, faint noise."""
    sky_top, sky_bot, ground = {
        "hub": ((12, 30, 54), (46, 74, 114), (74, 62, 44)),
        "grove": ((43, 31, 61), (224, 138, 46), (62, 107, 72)),
        "market": ((11, 11, 22), (110, 58, 255), (27, 27, 46)),
    }.get(realm, ((12, 30, 54), (46, 74, 114), (74, 62, 44)))
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    top = np.array(sky_top, np.float32)[None, None, :]
    bot = np.array(sky_bot, np.float32)[None, None, :]
    arr = np.broadcast_to(top + (bot - top) * t, (h, w, 3)).copy()
    gy = int(0.55 * h)
    g = np.array(ground, np.float32)
    shade = np.linspace(1.0, 0.7, h - gy, dtype=np.float32)[:, None, None]
    arr[gy:] = g[None, None, :] * shade
    # Painterly texture: low-frequency noise (per-pixel noise would be unrealistically incompressible).
    small = _rng(seed).normal(0.0, 2.5, size=(max(2, h // 40), max(2, w // 40))).astype(np.float32)
    noise = np.asarray(Image.fromarray(small + 128.0).resize((w, h), Image.Resampling.BILINEAR)) - 128.0
    arr = np.clip(arr + noise[..., None], 0, 255)
    img = Image.fromarray(arr.astype(np.uint8), "RGB")
    d = ImageDraw.Draw(img)
    d.rectangle((int(0.44 * w), int(0.05 * h), int(0.56 * w), gy + int(0.03 * h)), fill=(58, 44, 34))
    for fx in (0.0, 0.26, 0.64, 0.9):
        d.rectangle((int(fx * w), int(0.42 * h), int((fx + 0.1) * w), gy + int(0.04 * h)), fill=(24, 16, 12))
    return img


def synth_keyed_subject(w: int = 400, h: int = 400, key: str = "#00FF00", colour=(200, 170, 140), radius_frac: float = 0.35,
                        spill: float = 0.03, specks: int = 0, hole: bool = False, backdrop_shift=(0, 0, 0)) -> tuple[Image.Image, np.ndarray]:
    """A disc with a supersampled anti-aliased edge over the key; returns (RGB image, true alpha)."""
    ss = 4
    big = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(big)
    cx, cy, r = w * ss / 2, h * ss / 2, radius_frac * min(w, h) * ss
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    alpha = np.asarray(big.resize((w, h), Image.Resampling.BOX)).astype(np.float32) / 255.0
    F = np.array(colour, np.float32)
    B = np.clip(np.array(parse_hex(key), np.float32) + np.array(backdrop_shift, np.float32), 0, 255)
    ys, xs = np.mgrid[:h, :w]
    dist = np.sqrt((xs - w / 2) ** 2 + (ys - h / 2) ** 2)
    edge_in = (dist > radius_frac * min(w, h) - 6) & (alpha > 0.5)
    Fimg = np.broadcast_to(F, (h, w, 3)).copy()
    Fimg[edge_in] = F * (1 - spill) + B * spill
    out = alpha[..., None] * Fimg + (1 - alpha[..., None]) * B
    truth = alpha.copy()
    if specks:
        rng = _rng(7)
        for _ in range(specks):
            x, y = int(rng.integers(4, max(6, w // 10))), int(rng.integers(4, h - 4))
            out[y : y + 2, x : x + 2] = F
    if hole:
        hy, hx = int(h / 2), int(w / 2)
        out[hy : hy + 3, hx : hx + 3] = B
    return Image.fromarray(np.round(out).astype(np.uint8), "RGB"), truth


def synth_overlay(w: int = 3200, h: int = 1800, key: str = "#FF00FF", good: bool = True) -> Image.Image:
    """Frame-only foreground elements on the key; ``good=False`` adds blobs over the floor and a spawn.

    The good variant stays within the overlay rules even for the hub, whose walkable polygon
    reaches the frame's bottom and sides (the frame edge does not count as an edge when the
    walkable interior is eroded): thin posts at the far left and right, hanging foliage along the
    top, and a near root only in the bottom-left corner outside the walkable area.
    """
    img = Image.new("RGB", (w, h), parse_hex(key))
    d = ImageDraw.Draw(img)
    post = (92, 64, 40)
    d.rectangle((0, int(0.45 * h), int(0.012 * w), h), fill=post)
    d.rectangle((int(0.988 * w), int(0.45 * h), w, h), fill=post)
    for i in range(12):
        x = int((i / 12 + 0.02) * w)
        d.ellipse((x, -int(0.05 * h), x + int(0.09 * w), int(0.07 * h)), fill=(62, 107, 72))
    if not good:
        d.ellipse((int(0.3 * w), int(0.6 * h), int(0.7 * w), int(0.95 * h)), fill=(80, 58, 40))
        d.ellipse((int(0.48 * w), int(0.79 * h), int(0.52 * w), int(0.84 * h)), fill=post)
    return img


def synth_owl_master(w: int = 1600, h: int = 1920, key: str = "#FF00FF", offset=(0.03, 0.0), eyes_closed: bool = False, feet_fixed: bool = False,
                     wing_left: float = 0.0) -> tuple[Image.Image, np.ndarray]:
    """The mock owl: returns (RGB image, truth label map with TRUTH_* values).

    Same colours as the generator's mock and the owl job: red body, green chest, blue accents on
    magenta. ``feet_fixed`` paints the feet gold (a fixed colour, as the generator's owl prompt
    asks) instead of the blue accent key. ``wing_left`` extends a wing that far (as a fraction of
    the width) to the left of the body, making the silhouette asymmetric about the feet.
    """
    img = Image.new("RGB", (w, h), parse_hex(key))
    truth = Image.new("L", (w, h), TRUTH_BACKDROP)
    d, t = ImageDraw.Draw(img), ImageDraw.Draw(truth)
    cx = w * (0.5 + offset[0])
    oy = h * offset[1]
    BODY, BODY_DARK, BODY_WING = (255, 0, 0), (160, 0, 0), (190, 0, 0)
    BELLY, BELLY_DARK = (0, 255, 0), (0, 170, 0)
    ACCENT, CREAM, GOLD, BLACK, WHITE = (0, 0, 255), (246, 241, 227), (201, 162, 39), (0, 0, 0), (255, 255, 255)

    def both(shape, box, fill, label):
        getattr(d, shape)(box, fill=fill)
        getattr(t, shape)(box, fill=label)

    def ell(cxx, cyy, rx, ry, fill, label):
        both("ellipse", (cxx - rx, cyy - ry, cxx + rx, cyy + ry), fill, label)

    # wings, body, head, tufts (body region)
    ell(cx - 0.24 * w, oy + 0.62 * h, 0.07 * w, 0.20 * h, BODY_WING, TRUTH_BODY)
    ell(cx + 0.24 * w, oy + 0.62 * h, 0.07 * w, 0.20 * h, BODY_WING, TRUTH_BODY)
    if wing_left > 0:
        ell(cx - 0.24 * w - wing_left * w / 2, oy + 0.58 * h, wing_left * w / 2 + 0.07 * w, 0.12 * h, BODY_WING, TRUTH_BODY)
    ell(cx, oy + 0.64 * h, 0.25 * w, 0.28 * h, BODY, TRUTH_BODY)
    ell(cx, oy + 0.30 * h, 0.19 * w, 0.19 * w, BODY, TRUTH_BODY)
    for sgn in (-1, 1):
        both("polygon", [(cx + sgn * 0.14 * w, oy + 0.18 * h), (cx + sgn * 0.24 * w, oy + 0.06 * h), (cx + sgn * 0.05 * w, oy + 0.14 * h)], BODY, TRUTH_BODY)
    # darker lower third of the body (same hue)
    body_now = np.asarray(truth) == TRUTH_BODY
    arr = np.asarray(img).copy()
    rows = np.arange(h)[:, None] > oy + 0.76 * h
    dark = body_now & rows & (arr[..., 0] == 255)
    arr[dark] = BODY_DARK
    img = Image.fromarray(arr, "RGB")
    d = ImageDraw.Draw(img)
    # tuft tips (accent), chest (belly), feet (accent)
    for sgn in (-1, 1):
        ell(cx + sgn * 0.23 * w, oy + 0.075 * h, 0.02 * w, 0.02 * w, ACCENT, TRUTH_ACCENT)
    ell(cx, oy + 0.66 * h, 0.14 * w, 0.19 * h, BELLY, TRUTH_BELLY)
    arr = np.asarray(img).copy()
    belly_now = np.asarray(truth) == TRUTH_BELLY
    arr[belly_now & (np.arange(h)[:, None] > oy + 0.78 * h)] = BELLY_DARK
    img = Image.fromarray(arr, "RGB")
    d = ImageDraw.Draw(img)
    for sgn in (-1, 1):
        ell(cx + sgn * 0.08 * w, oy + 0.925 * h, 0.06 * w, 0.015 * h, GOLD if feet_fixed else ACCENT, TRUTH_FEET_FIXED if feet_fixed else TRUTH_ACCENT)
    # eyes and beak (face)
    for sgn in (-1, 1):
        ex, ey = cx + sgn * 0.085 * w, oy + 0.29 * h
        if eyes_closed:
            both("line", [(ex - 0.06 * w, ey), (ex + 0.06 * w, ey)], (12, 30, 54), TRUTH_EYES)
            d.line([(ex - 0.06 * w, ey), (ex + 0.06 * w, ey)], fill=(12, 30, 54), width=max(2, int(0.012 * w)))
            t.line([(ex - 0.06 * w, ey), (ex + 0.06 * w, ey)], fill=TRUTH_EYES, width=max(2, int(0.012 * w)))
            continue
        ell(ex, ey, 0.065 * w, 0.065 * w, CREAM, TRUTH_EYES)
        ell(ex, ey, 0.042 * w, 0.042 * w, GOLD, TRUTH_EYES)
        ell(ex, ey, 0.026 * w, 0.026 * w, BLACK, TRUTH_EYES)
        ell(ex - 0.01 * w, ey - 0.012 * w, 0.009 * w, 0.009 * w, WHITE, TRUTH_EYES)
    both("polygon", [(cx - 0.03 * w, oy + 0.37 * h), (cx + 0.03 * w, oy + 0.37 * h), (cx, oy + 0.45 * h)], GOLD, TRUTH_BEAK)
    return img, np.asarray(truth).copy()


def fixture_geometry() -> dict:
    """A mirror of packages/shared/rooms/index.ts in the geometry.json schema (tests and fallback only)."""
    P = lambda x, y: {"x": x, "y": y}  # noqa: E731
    size = {"w": ROOM_W, "h": ROOM_H}
    rooms = {
        "hub": {
            "size": size, "background": "hub", "foreground": "hub-fg",
            "walkable": [[P(0, 604), P(206, 604), P(206, 634), P(268, 634), P(300, 566), P(420, 600), P(600, 612), P(800, 630), P(1000, 612), P(1180, 600), P(1300, 566), P(1332, 634), P(1394, 634), P(1394, 604), P(1600, 604), P(1600, 900), P(0, 900)]],
            "spawns": {"default": P(800, 730), "from-grove": P(220, 690), "from-market": P(1380, 690)},
            "doors": [
                {"id": "to-grove", "rect": {"x": 0, "y": 604, "w": 140, "h": 120}, "to": {"room": "grove", "spawn": "default"}, "marker": P(92, 560)},
                {"id": "to-market", "rect": {"x": 1460, "y": 604, "w": 140, "h": 120}, "to": {"room": "market", "spawn": "default"}, "marker": P(1508, 560)},
                {"id": "closed-a", "rect": {"x": 430, "y": 560, "w": 140, "h": 90}, "closedSign": "Not Yet Fledged", "marker": P(500, 598)},
                {"id": "closed-b", "rect": {"x": 1030, "y": 560, "w": 140, "h": 90}, "closedSign": "Hatching Soon", "marker": P(1100, 598)},
            ],
            "anchors": {"tree-base": P(800, 628)},
        },
        "grove": {
            "size": size, "background": "grove", "foreground": "grove-fg",
            "walkable": [[P(330, 510), P(1270, 510), P(1420, 545), P(1600, 640), P(1600, 850), P(1470, 870), P(1250, 880), P(360, 880), P(290, 790), P(250, 600), P(262, 540)]],
            "spawns": {"default": P(1406, 760)},
            "doors": [
                {"id": "to-hub", "rect": {"x": 1486, "y": 630, "w": 114, "h": 250}, "to": {"room": "hub", "spawn": "from-grove"}, "marker": P(1545, 745)},
                {"id": "idol", "rect": {"x": 690, "y": 560, "w": 220, "h": 120}, "marker": P(800, 612)},
            ],
            "anchors": {"guardian": P(800, 430), "gathering": P(800, 612)},
        },
        "market": {
            "size": size, "background": "market", "foreground": "market-fg",
            "walkable": [[P(150, 590), P(1480, 590), P(1600, 660), P(1600, 690), P(1420, 720), P(1380, 885), P(280, 885), P(250, 830), P(170, 760), P(0, 760), P(0, 640), P(60, 600)]],
            "spawns": {"default": P(200, 700)},
            "doors": [
                {"id": "to-hub", "rect": {"x": 0, "y": 600, "w": 120, "h": 220}, "to": {"room": "hub", "spawn": "from-market"}, "marker": P(70, 580)},
                {"id": "shop", "rect": {"x": 730, "y": 590, "w": 256, "h": 90}, "marker": P(857, 234)},
                {"id": "idol", "rect": {"x": 1130, "y": 590, "w": 220, "h": 110}, "marker": P(1240, 640)},
            ],
            "anchors": {"robot": P(1240, 520), "shop": P(857, 234)},
        },
    }
    return {"rooms": rooms, "closedSigns": ["Not Yet Fledged", "Closed for Molting", "Pardon Our Feathers", "Hatching Soon"], "assets": {k: dict(v) for k, v in BUILTIN_ASSETS.items()}, "fixture": True}
