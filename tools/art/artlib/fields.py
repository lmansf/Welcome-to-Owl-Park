"""Layout guides of the arcade games' fields (the generator's ``@canvas:arcade-<game>-bg``).

Each game is played on a 480 x 640 field (``apps/park/src/arcade/field.ts``) and its background is
painted at 2x, 960 x 1280, over a flat, text-free guide of the field drawn here from the games' own
geometry, so the painting puts its kerbs, lanes, horizon and ground where the code plays them:

- ``hop`` (``hop.ts``): rows 80 px apart, centred at y = 580 - row * 80: the near kerb's row 0 at
  the bottom, the five lanes (rows 1 to 5) and the far kerb's row 6, with shop fronts above it and a
  crosswalk up the middle, where the owl crosses (x = 240);
- ``flap`` (``flap.ts``): open sky, the moon where the code drew it, a low band of rooftops and
  treetops, and the ground strip's 40 px at the bottom (y 600 to 640);
- ``knock`` (``knock.ts``): open sky, rooftop clutter at the far left behind the slingshot (x = 96),
  and the rooftop's ledge at the ground line (y = 560) across the whole width.

When the games' geometry changes, change it here too.
"""

from __future__ import annotations

from PIL import Image, ImageDraw

FIELD_W, FIELD_H, SCALE = 480, 640, 2
GAMES = ("hop", "flap", "knock")

HOP_LANES = 5
HOP_ROW_H = 80
HOP_X = FIELD_W // 2
FLAP_GROUND_Y = FIELD_H - 40
#: The moon the code drew in line-art: centre and radius, field pixels.
FLAP_MOON = (380, 96, 34)
KNOCK_GROUND_Y = 560
KNOCK_SLING_X = 96

SKY = (20, 24, 48)
FAR = (44, 34, 70)
PAVEMENT = (92, 92, 108)
KERB = (170, 170, 186)
ROAD = (36, 36, 46)
LANE_LINE = (150, 150, 165)
CROSSWALK = (120, 120, 132)
MOON = (230, 226, 206)
SILHOUETTE = (12, 14, 30)
GROUND = (60, 52, 80)
LEDGE = (110, 100, 140)


def hop_row_y(row: int) -> int:
    """The middle of a crossing row (0 the near kerb, 6 the far kerb), field pixels."""
    return 580 - row * HOP_ROW_H


def _rect(d: ImageDraw.ImageDraw, x0: float, y0: float, x1: float, y1: float, fill: tuple) -> None:
    """A rectangle given in field pixels, drawn at 2x (x1 and y1 exclusive)."""
    d.rectangle((round(x0 * SCALE), round(y0 * SCALE), round(x1 * SCALE) - 1, round(y1 * SCALE) - 1), fill=fill)


def _hop(d: ImageDraw.ImageDraw) -> None:
    far_top = hop_row_y(HOP_LANES + 1) - HOP_ROW_H // 2
    road_top, road_bottom = far_top + HOP_ROW_H, hop_row_y(0) - HOP_ROW_H // 2
    _rect(d, 0, 0, FIELD_W, far_top, FAR)
    _rect(d, 0, far_top, FIELD_W, road_top, PAVEMENT)
    _rect(d, 0, road_top, FIELD_W, road_bottom, ROAD)
    _rect(d, 0, road_bottom, FIELD_W, FIELD_H, PAVEMENT)
    _rect(d, 0, hop_row_y(0) + HOP_ROW_H // 2, FIELD_W, FIELD_H, tuple(c - 30 for c in PAVEMENT))
    for row in range(1, HOP_LANES):
        y = hop_row_y(row) - HOP_ROW_H // 2
        for x in range(0, FIELD_W, 36):
            _rect(d, x, y - 1, x + 18, y + 1, LANE_LINE)
    for y in range(road_top + 4, road_bottom - 8, 20):
        _rect(d, HOP_X - 40, y, HOP_X + 40, y + 10, CROSSWALK)
    _rect(d, 0, road_top - 4, FIELD_W, road_top, KERB)
    _rect(d, 0, road_bottom, FIELD_W, road_bottom + 4, KERB)


def _flap(d: ImageDraw.ImageDraw) -> None:
    _rect(d, 0, 0, FIELD_W, FIELD_H, SKY)
    x, y, r = FLAP_MOON
    d.ellipse(((x - r) * SCALE, (y - r) * SCALE, (x + r) * SCALE, (y + r) * SCALE), fill=MOON)
    # A low skyline: roofs of differing heights and a few rounded treetops, up to 130 px above the ground.
    for i, top in enumerate((505, 480, 520, 495, 530, 485, 515, 500, 525)):
        _rect(d, i * 55, top, i * 55 + 55, FLAP_GROUND_Y, SILHOUETTE)
    for cx, cy, cr in ((75, 540, 30), (235, 545, 34), (350, 542, 28)):
        d.ellipse(((cx - cr) * SCALE, (cy - cr) * SCALE, (cx + cr) * SCALE, (cy + cr) * SCALE), fill=SILHOUETTE)
    _rect(d, 0, FLAP_GROUND_Y, FIELD_W, FIELD_H, GROUND)


def _knock(d: ImageDraw.ImageDraw) -> None:
    _rect(d, 0, 0, FIELD_W, FIELD_H, SKY)
    # Rooftop clutter at the far left, behind the slingshot: a water tank on legs, a vent, a chimney.
    _rect(d, 20, 320, 115, 430, SILHOUETTE)
    for lx in (30, 95):
        _rect(d, lx, 430, lx + 10, KNOCK_GROUND_Y, SILHOUETTE)
    _rect(d, 115, 480, 150, KNOCK_GROUND_Y, SILHOUETTE)
    _rect(d, 0, 380, 22, KNOCK_GROUND_Y, SILHOUETTE)
    _rect(d, 0, KNOCK_GROUND_Y, FIELD_W, FIELD_H, GROUND)
    _rect(d, 0, KNOCK_GROUND_Y, FIELD_W, KNOCK_GROUND_Y + 4, LEDGE)


def render_field_guide(game: str) -> Image.Image:
    """The flat, text-free guide of one game's field at 2x (960 x 1280)."""
    draw = {"hop": _hop, "flap": _flap, "knock": _knock}.get(game)
    if draw is None:
        raise ValueError(f"no arcade game {game!r} (have {', '.join(GAMES)})")
    img = Image.new("RGB", (FIELD_W * SCALE, FIELD_H * SCALE), SKY)
    draw(ImageDraw.Draw(img))
    return img
