"""Layout guides and review overlays rendered from the exported room geometry.

The guide is a text-free 1600 x 900 image: navy sky, the walkable polygon union as a mid-grey
ground plane (its top edge is the horizon), door rectangles (open gold, closed dark with the
420 x 520 sign footprint drawn bottom-centre at the marker), the shop marker, idol rings, spawn
dots and set-piece footprints scaled exactly as ``ambience.ts`` does
(``k = clamp((anchorY - 24) / h, 0.2, 1)``). The generator feeds it to the image model as a
reference (``@guide:<room>``); the post stage blends it over finals for review.

Geometry JSON schema (``work/art/geometry.json``, written by ``pnpm art:geometry``):
``{"rooms": {id: {size, walkable, doors, spawns, anchors, background, foreground, backgrounds,
foregrounds}}, "closedSigns": [...], "assets": {...}}`` with points as ``{x, y}``; a room wider
than one screen lists its art tiles as ``{key, x, y}`` and ``tile_view`` shows one screen of it.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from . import CREAM, GOLD, NAVY, ROOM_H, ROOM_W, ArtError, load_assets, parse_hex

GROUND = (107, 107, 107)
CLOSED_FILL = (26, 26, 42)
CLOSED_LINE = (138, 138, 160)
MAGENTA = (255, 42, 161)
CYAN = (0, 229, 255)
SIGN_W, SIGN_H = 420, 520
# The lettered board inside the 420 x 520 sign canvas (x0, y0, x1, y1), the same in all four sign
# arts: the approved phrase lives here, so overlays must leave it readable.
SIGN_BOARD = (9, 8, 411, 183)


def load_geometry(path: Path | str) -> dict:
    p = Path(path)
    if not p.exists():
        raise ArtError(f"no geometry file at {p}; run `pnpm art:geometry` first (or pass --geometry)")
    geom = json.loads(p.read_text(encoding="utf-8"))
    if "rooms" not in geom:
        raise ArtError(f"{p} has no 'rooms' table")
    return geom


def room_of(geom: dict, room_id: str) -> dict:
    rooms = geom.get("rooms", {})
    if room_id not in rooms:
        raise ArtError(f"room {room_id!r} is not in the geometry (have {', '.join(sorted(rooms))})")
    return rooms[room_id]


def tile_view(geom: dict, room_id: str, x: float, y: float) -> dict:
    """The geometry with ``room_id`` seen from one screen of it: every point, rectangle and anchor
    moved by (-x, -y), so the screen whose top-left corner is (x, y) in room pixels draws and checks
    like a room of one screen (what lies off that screen is clipped or out of reach)."""
    room = room_of(geom, room_id)

    def mv(p) -> dict:
        px, py = pt(p)
        return {"x": px - x, "y": py - y}

    def door(d: dict) -> dict:
        out = dict(d)
        out["rect"] = {**d["rect"], "x": float(d["rect"]["x"]) - x, "y": float(d["rect"]["y"]) - y}
        if d.get("marker"):
            out["marker"] = mv(d["marker"])
        return out

    view = dict(room, size={"w": ROOM_W, "h": ROOM_H}, walkable=[[mv(p) for p in poly] for poly in room.get("walkable", [])],
                doors=[door(d) for d in room.get("doors", [])], spawns={k: mv(p) for k, p in (room.get("spawns") or {}).items()},
                anchors={k: mv(p) for k, p in (room.get("anchors") or {}).items()})
    return {**geom, "rooms": {**geom["rooms"], room_id: view}}


def pt(p) -> tuple[float, float]:
    if isinstance(p, dict):
        return float(p["x"]), float(p["y"])
    return float(p[0]), float(p[1])


def rect_of(r: dict) -> tuple[float, float, float, float]:
    return float(r["x"]), float(r["y"]), float(r["x"]) + float(r["w"]), float(r["y"]) + float(r["h"])


def fit_below_top(h: int, anchor_y: float, margin: int = 24) -> float:
    return min(1.0, max(0.2, (anchor_y - margin) / h))


def walkable_mask(room: dict, size: tuple[int, int] = (ROOM_W, ROOM_H)) -> np.ndarray:
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    for poly in room.get("walkable", []):
        pts = [pt(p) for p in poly]
        if len(pts) >= 3:
            d.polygon(pts, fill=255)
    return np.asarray(m) > 0


def _piece_footprint(anchor_name: str, room_id: str) -> str | None:
    return {"guardian": "guardian", "robot": "robot-owl"}.get(anchor_name)


def _draw_features(d: ImageDraw.ImageDraw, room: dict, room_id: str, assets: dict, filled: bool, scale: float = 1.0) -> None:
    s = scale
    for door in room.get("doors", []):
        x0, y0, x1, y1 = (v * s for v in rect_of(door["rect"]))
        if door.get("to"):
            d.rectangle((x0, y0, x1, y1), fill=(201, 162, 39, 90) if filled else None, outline=parse_hex(GOLD), width=max(2, int(4 * s)))
        elif door.get("closedSign"):
            d.rectangle((x0, y0, x1, y1), fill=CLOSED_FILL if filled else None, outline=CLOSED_LINE, width=max(2, int(4 * s)))
            if door.get("marker"):
                mx, my = pt(door["marker"])
                d.rectangle(((mx - SIGN_W / 2) * s, (my - SIGN_H) * s, (mx + SIGN_W / 2) * s, my * s), outline=parse_hex(CREAM), width=max(1, int(3 * s)))
        elif door.get("id") == "shop":
            d.rectangle((x0, y0, x1, y1), outline=CYAN, width=max(2, int(3 * s)))
            if door.get("marker"):
                mx, my = (v * s for v in pt(door["marker"]))
                r = 18 * s
                d.polygon([(mx, my - r), (mx + r, my), (mx, my + r), (mx - r, my)], outline=CYAN, fill=CYAN if filled else None)
        elif door.get("id") == "idol":
            d.rectangle((x0, y0, x1, y1), outline=parse_hex(GOLD), width=max(1, int(2 * s)))
            if door.get("marker"):
                mx, my = (v * s for v in pt(door["marker"]))
                d.ellipse((mx - 110 * s, my - 30 * s, mx + 110 * s, my + 30 * s), outline=parse_hex(GOLD), width=max(2, int(3 * s)))
        else:
            d.rectangle((x0, y0, x1, y1), outline=CLOSED_LINE, width=max(1, int(2 * s)))
    for name, p in (room.get("spawns") or {}).items():
        x, y = (v * s for v in pt(p))
        r = 10 * s
        d.ellipse((x - r, y - r, x + r, y + r), fill=parse_hex(CREAM), outline=parse_hex(NAVY), width=max(1, int(2 * s)))
    for name, p in (room.get("anchors") or {}).items():
        x, y = pt(p)
        key = _piece_footprint(name, room_id)
        if key and key in assets:
            w, h = assets[key]["w"], assets[key]["h"]
            k = fit_below_top(h, y)
            fw, fh = w * k, h * k
            d.rectangle(((x - fw / 2) * s, (y - fh) * s, (x + fw / 2) * s, y * s), outline=MAGENTA, width=max(1, int(3 * s)))
        c = 24 * s
        d.line(((x - c) * s, y * s, (x + c) * s, y * s), fill=MAGENTA, width=max(1, int(3 * s)))
        d.line((x * s, (y - c) * s, x * s, (y + c) * s), fill=MAGENTA, width=max(1, int(3 * s)))


def render_guide(geom: dict, room_id: str, assets: dict | None = None) -> Image.Image:
    """The filled, text-free layout guide at 1600 x 900."""
    room = room_of(geom, room_id)
    assets = assets or load_assets()
    W, H = ROOM_W, ROOM_H
    img = Image.new("RGB", (W, H), parse_hex(NAVY))
    d = ImageDraw.Draw(img)
    for poly in room.get("walkable", []):
        pts = [pt(p) for p in poly]
        if len(pts) >= 3:
            d.polygon(pts, fill=GROUND)
    for poly in room.get("walkable", []):
        pts = [pt(p) for p in poly]
        if len(pts) >= 3:
            d.line(pts + [pts[0]], fill=(160, 160, 160), width=3)
    _draw_features(d, room, room_id, assets, filled=True)
    return img


def render_overlay(geom: dict, room_id: str, size: tuple[int, int] = (ROOM_W, ROOM_H), assets: dict | None = None) -> Image.Image:
    """Outline-only RGBA geometry overlay for review composites (ground plane at 25 % grey)."""
    room = room_of(geom, room_id)
    assets = assets or load_assets()
    W, H = size
    s = W / ROOM_W
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    for poly in room.get("walkable", []):
        pts = [(x * s, y * s) for x, y in (pt(p) for p in poly)]
        if len(pts) >= 3:
            d.polygon(pts, fill=(255, 255, 255, 64), outline=(255, 255, 255, 230), width=max(1, int(3 * s)))
    _draw_features(d, room, room_id, assets, filled=False, scale=s)
    return img


def review_composite(base: Image.Image, geom: dict, room_id: str, alpha: float = 0.4, assets: dict | None = None) -> Image.Image:
    """``base`` with the geometry overlay blended at ``alpha``."""
    b = base.convert("RGBA")
    ov = render_overlay(geom, room_id, b.size, assets)
    if alpha < 1.0:
        a = ov.getchannel("A").point(lambda v: int(v * alpha))
        ov.putalpha(a)
    return Image.alpha_composite(b, ov).convert("RGB")
