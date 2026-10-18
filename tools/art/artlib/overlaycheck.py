"""Rules for foreground overlays, which RoomScene draws in front of every owl.

An overlay may frame the scene but must not hide visitors: opaque coverage (alpha > 64) of the
walkable interior eroded by 60 px stays under 5 % (the frame edge is not an edge: where the
walkable polygon reaches the bottom or the sides of the room, owls stand right there, so a root
painted along the bottom of the frame counts as cover), and a 24 px disc around every spawn, every
door-rectangle centre, every marker (sign, shop, idol) is fully transparent; the 420 x 520 sign
footprint above a closed door's marker may be at most half covered, and its lettered board
(``SIGN_BOARD``) at most 1 %, because every sign phrase must stay readable.
Keying leftovers fail too: glow painted over the key colour keys out as opaque, bright,
key-coloured haze (green halos round lanterns), so more than 0.5 % of the visible pixels lying
within 45 degrees of the key's hue at high saturation and value is a violation (wide enough for
yellow glow over green, narrow enough to spare cyan neon). The report is a
plain dict so ``overlay --check`` and ``check`` can print it and tests can assert on it.
"""

from __future__ import annotations

import colorsys

import numpy as np
from PIL import Image

from . import ROOM_H, ROOM_W, parse_hex
from .guide import SIGN_BOARD, SIGN_H, SIGN_W, pt, rect_of, room_of, walkable_mask
from .labels import erode


def _disc(shape: tuple[int, int], cx: float, cy: float, r: float) -> np.ndarray:
    H, W = shape
    ys, xs = np.ogrid[:H, :W]
    return (xs - cx) ** 2 + (ys - cy) ** 2 <= r * r


def sign_board_rect(mx: float, my: float, scale: float = 1.0) -> tuple[int, int, int, int]:
    """The lettered board of a closed sign whose marker (bottom-centre) is at (mx, my), in room px times ``scale``."""
    x0 = mx - SIGN_W / 2
    y0 = my - SIGN_H
    bx0, by0, bx1, by1 = SIGN_BOARD
    clamp = lambda v, hi: int(min(hi, max(0, round(v * scale))))  # noqa: E731
    return clamp(x0 + bx0, ROOM_W * scale), clamp(y0 + by0, ROOM_H * scale), clamp(x0 + bx1, ROOM_W * scale), clamp(y0 + by1, ROOM_H * scale)


def _haze_mask(rgba: Image.Image, key_colour: str, hue_window: float, min_sat: float, min_val: float) -> np.ndarray:
    hsv = np.asarray(rgba.convert("RGB").convert("HSV")).astype(np.float32)
    kr, kg, kb = parse_hex(key_colour)
    key_hue = colorsys.rgb_to_hsv(kr / 255, kg / 255, kb / 255)[0] * 360.0
    d = np.abs(hsv[..., 0] * (360.0 / 255.0) - key_hue)
    d = np.minimum(d, 360.0 - d)
    return (d <= hue_window) & (hsv[..., 1] / 255.0 > min_sat) & (hsv[..., 2] / 255.0 > min_val)


def clear_sign_boards(img: Image.Image, geom: dict, room_id: str, scale: float = 1.0) -> tuple[Image.Image, int]:
    """Make the overlay transparent over every closed sign's board, so props read as passing behind it."""
    rgba = img if img.mode == "RGBA" else img.convert("RGBA")
    arr = np.array(rgba)
    cleared = 0
    for door in room_of(geom, room_id).get("doors", []):
        if door.get("closedSign") and door.get("marker"):
            mx, my = pt(door["marker"])
            x0, y0, x1, y1 = sign_board_rect(mx, my, scale)
            cleared += int((arr[y0:y1, x0:x1, 3] > 0).sum())
            arr[y0:y1, x0:x1, 3] = 0
    return Image.fromarray(arr, "RGBA"), cleared


def clear_key_haze(img: Image.Image, key_colour: str, hue_window: float = 45.0, min_sat: float = 0.6, min_val: float = 0.75) -> tuple[Image.Image, int]:
    """Make bright key-coloured haze transparent (glow painted over the key keys out as opaque key colour)."""
    rgba = img if img.mode == "RGBA" else img.convert("RGBA")
    arr = np.array(rgba)
    mask = _haze_mask(rgba, key_colour, hue_window, min_sat, min_val) & (arr[..., 3] > 0)
    arr[mask, 3] = 0
    return Image.fromarray(arr, "RGBA"), int(mask.sum())


def key_spill(img: Image.Image, key_colour: str, hue_window: float = 45.0, min_sat: float = 0.6, min_val: float = 0.75) -> float:
    """Fraction of visible pixels (alpha > 32) that are bright and saturated within ``hue_window`` of the key's hue."""
    rgba = img if img.mode == "RGBA" else img.convert("RGBA")
    visible = np.asarray(rgba.getchannel("A")) > 32
    if not visible.any():
        return 0.0
    sus = visible & _haze_mask(rgba, key_colour, hue_window, min_sat, min_val)
    return float(sus.sum()) / float(visible.sum())


def check_overlay(img: Image.Image, geom: dict, room_id: str, erode_px: int = 60, max_cover: float = 0.05, disc_r: int = 24, alpha_threshold: int = 64, sign_max_cover: float = 0.5,
                  board_max_cover: float = 0.01, key_colour: str | None = None, spill_max: float = 0.005) -> dict:
    room = room_of(geom, room_id)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    if img.size != (ROOM_W, ROOM_H):
        img = img.resize((ROOM_W, ROOM_H), Image.Resampling.LANCZOS)
    opaque = np.asarray(img.getchannel("A")) > alpha_threshold
    walk = walkable_mask(room)
    interior = erode(walk, erode_px)
    denom = int(interior.sum())
    coverage = float((opaque & interior).sum()) / denom if denom else 0.0
    report: dict = {"room": room_id, "coverage": round(coverage, 4), "max_cover": max_cover, "violations": []}
    if coverage > max_cover:
        report["violations"].append(f"opaque coverage of the walkable interior is {coverage * 100:.1f} % (limit {max_cover * 100:.0f} %)")

    points: list[tuple[str, float, float]] = []
    for name, p in (room.get("spawns") or {}).items():
        x, y = pt(p)
        points.append((f"spawn {name}", x, y))
    for door in room.get("doors", []):
        x0, y0, x1, y1 = rect_of(door["rect"])
        points.append((f"door {door.get('id')} centre", (x0 + x1) / 2, (y0 + y1) / 2))
        if door.get("marker"):
            mx, my = pt(door["marker"])
            points.append((f"{door.get('id')} marker", mx, my))
            if door.get("closedSign"):
                sx0, sy0 = int(max(0, mx - SIGN_W / 2)), int(max(0, my - SIGN_H))
                sx1, sy1 = int(min(ROOM_W, mx + SIGN_W / 2)), int(min(ROOM_H, my))
                patch = opaque[sy0:sy1, sx0:sx1]
                frac = float(patch.mean()) if patch.size else 0.0
                if frac > sign_max_cover:
                    report["violations"].append(f"sign footprint at {door.get('id')} is {frac * 100:.0f} % covered")
                bx0, by0, bx1, by1 = sign_board_rect(mx, my)
                board = opaque[by0:by1, bx0:bx1]
                bfrac = float(board.mean()) if board.size else 0.0
                if bfrac > board_max_cover:
                    report["violations"].append(f"sign board at {door.get('id')} is {bfrac * 100:.1f} % covered (limit {board_max_cover * 100:.0f} %): the phrase must stay readable")
    for name, x, y in points:
        n = int((opaque & _disc(opaque.shape, x, y, disc_r)).sum())
        if n:
            report["violations"].append(f"{name} at ({x:.0f}, {y:.0f}) has {n} opaque px within {disc_r} px")
    if key_colour:
        spill = key_spill(img, key_colour)
        report["key_spill"] = round(spill, 4)
        if spill > spill_max:
            report["violations"].append(f"{spill * 100:.1f} % of the visible pixels are bright {key_colour}-like haze (limit {spill_max * 100:.1f} %): glow keyed out as opaque key colour; prompt the glow away or re-key")
    report["ok"] = not report["violations"]
    return report
