"""Rules for foreground overlays, which RoomScene draws in front of every owl.

An overlay may frame the scene but must not hide visitors: opaque coverage (alpha > 64) of the
walkable interior eroded by 60 px stays under 5 % (the frame edge is not an edge: where the
walkable polygon reaches the bottom or the sides of the room, owls stand right there, so a root
painted along the bottom of the frame counts as cover), and a 24 px disc around every spawn, every
door-rectangle centre, every marker (sign, shop, idol) is fully transparent; the 420 x 520 sign
footprint above a closed door's marker may be at most half covered. The report is a plain dict
so ``overlay --check`` and ``check`` can print it and tests can assert on it.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

from . import ROOM_H, ROOM_W
from .guide import SIGN_H, SIGN_W, pt, rect_of, room_of, walkable_mask
from .labels import erode


def _disc(shape: tuple[int, int], cx: float, cy: float, r: float) -> np.ndarray:
    H, W = shape
    ys, xs = np.ogrid[:H, :W]
    return (xs - cx) ** 2 + (ys - cy) ** 2 <= r * r


def check_overlay(img: Image.Image, geom: dict, room_id: str, erode_px: int = 60, max_cover: float = 0.05, disc_r: int = 24, alpha_threshold: int = 64, sign_max_cover: float = 0.5) -> dict:
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
    for name, x, y in points:
        n = int((opaque & _disc(opaque.shape, x, y, disc_r)).sum())
        if n:
            report["violations"].append(f"{name} at ({x:.0f}, {y:.0f}) has {n} opaque px within {disc_r} px")
    report["ok"] = not report["violations"]
    return report
