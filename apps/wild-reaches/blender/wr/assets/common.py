"""Things every realm shares: pick-ups, benches, shrines, doors and the closed signs."""
import math

import numpy as np

from ..core import asset
from ..vox import V

CLOSED_SIGNS = ("Not Yet Fledged", "Closed for Molting", "Pardon Our Feathers", "Hatching Soon")


def lantern(v, at, size=1.0, glow="gold_glow", frame="gold"):
    """The park's lantern, shared by every realm so the light reads as one family. `at` is its top."""
    x, y, z = at
    s = size
    v.rod(frame, (x, y, z - 0.06 * s), (x, y, z), 0.1 * s)
    v.ball(glow, (x, y, z - 0.24 * s), (0.13 * s, 0.13 * s, 0.17 * s))
    v.rod(frame, (x, y, z - 0.46 * s), (x, y, z - 0.4 * s), 0.09 * s)
    return v


@asset("feather", "pickups", "a lost feather; origin at its middle, 0.7 m tall")
def feather():
    v = V((-0.3, -0.12, -0.4), (0.3, 0.12, 0.4), vpm=32)
    X, Z = v.X, v.Z
    spine = 0.1 * np.sin((Z + 0.35) * 2.2) - 0.05
    vane = 0.17 * np.sin(np.clip((Z + 0.22) / 0.56, 0, 1) * math.pi) ** 0.7
    v.fill("gold_soft", (abs(X - spine) < vane) & (abs(v.Y) < 0.035) & (Z > -0.22))
    v.fill(None, (np.mod(Z + abs(X - spine) * 0.9, 0.11) < 0.022) & (abs(X - spine) > 0.05))
    v.fill("cream", (abs(X - spine) < 0.022) & (abs(v.Y) < 0.045) & (Z > -0.36) & (Z < 0.33))
    return v.done("feather", keep=0.6)


@asset("golden-mouse", "pickups", "the prize for finding everything; 0.6 m long, origin under its feet")
def golden_mouse():
    v = V((-0.45, -0.25, 0), (0.45, 0.25, 0.5), vpm=32)
    v.ball("mouse_gold", (-0.04, 0, 0.17), (0.22, 0.16, 0.16))
    v.ball("mouse_gold", (0.2, 0, 0.2), (0.14, 0.11, 0.11))
    v.rod("mouse_gold", (0.28, 0, 0.19), (0.38, 0, 0.16), 0.07, 0.02, flat=False)
    for sy in (-1, 1):
        v.ball("mouse_gold", (0.16, sy * 0.1, 0.33), (0.035, 0.08, 0.08))
        v.ball("pupil", (0.3, sy * 0.06, 0.23), 0.02)
    v.path("mouse_gold", [(-0.24, 0, 0.1), (-0.36, 0.04, 0.05), (-0.42, 0, 0.14)], 0.025, 0.012)
    return v.done("golden-mouse", keep=0.6)


@asset("bench", "common", "the checkpoint: a 2 m bench under a lantern; rest to relight")
def bench():
    v = V((-1.3, -0.5, 0), (1.5, 0.6, 2.9))
    for i, y in enumerate((-0.28, -0.06, 0.16)):
        v.box("wood_light" if i != 1 else "wood", (-1.0, y - 0.1, 0.44), (1.0, y + 0.1, 0.54))
    for z in (0.72, 0.98):
        v.box("wood_light", (-1.0, 0.3, z - 0.1), (1.0, 0.4, z + 0.1))
    for sx in (-0.85, 0.85):
        v.rod("bark", (sx, -0.3, 0), (sx, -0.3, 0.46), 0.07)
        v.rod("bark", (sx, 0.36, 0), (sx, 0.42, 1.12), 0.07)
        v.box("bark", (sx - 0.06, -0.3, 0.36), (sx + 0.06, 0.36, 0.44))
    v.path("bark", [(1.2, 0.35, 0), (1.22, 0.35, 1.4), (1.16, 0.35, 2.4), (0.98, 0.35, 2.7), (0.8, 0.35, 2.62)], 0.06, 0.035)
    lantern(v, (0.8, 0.35, 2.6))
    v.ball("moss", (-0.9, 0.3, 0.05), (0.25, 0.2, 0.1))
    v.ball("moss", (1.2, 0.3, 0.04), (0.2, 0.2, 0.1))
    return v.done("bench", keep=0.45)


@asset("shrine", "common", "where a guardian grants a move: a 3 m arch with a light the owl touches")
def shrine():
    v = V((-1.8, -0.4, 0), (1.8, 1.2, 3.6))
    X, Y, Z = v.X, v.Y, v.Z
    ring = np.sqrt(X**2 + (Z - 1.5) ** 2)
    v.fill("stone", (abs(ring - 1.45) < 0.24 + 0.06 * v.noise(0.5, 3)) & (abs(Y - 0.4) < 0.28) & (Z > 0.1))
    v.box("stone_dark", (-1.75, 0.0, 0), (1.75, 0.8, 0.22))
    v.box("stone", (-1.2, -0.2, 0.0), (1.2, 1.0, 0.12))
    v.paint("moss", (v.noise(0.5, 4) > 0.62) & (Z > 0.2))
    v.top("moss_light", 1, only="stone")
    v.paint("gold_soft", (np.mod(np.arctan2(Z - 1.5, X), 0.5236) < 0.09) & (Y < 0.2) & (abs(ring - 1.45) < 0.12))
    v.ball("moon_glow", (0, 0.4, 1.5), 0.3)
    v.fill("gold", (abs(ring - 0.47) < 0.05) & (abs(Y - 0.4) < 0.05))
    return v.done("shrine", keep=0.4)


@asset("shortcut-door", "common", "a 1 m thick, 3 m tall door that opens from one side and stays open; origin at its foot")
def shortcut_door():
    v = V((-0.5, -1.2, 0), (0.5, 1.2, 3.0))
    X, Y, Z = v.X, v.Y, v.Z
    v.box("wood", (-0.4, -1.1, 0), (0.4, 1.1, 3.0))
    v.fill(None, (np.mod(Y + 1.1, 0.55) < 0.07) & (abs(X) > 0.3))
    v.paint("bark", v.noise(0.6, 5) > 0.6)
    for z in (0.45, 1.5, 2.55):
        v.box("gold", (-0.47, -1.17, z - 0.07), (0.47, 1.17, z + 0.07))
    v.ball("gold_glow", (0, -1.12, 1.5), (0.16, 0.08, 0.16))
    return v.done("shortcut-door", keep=0.35)


@asset("spawn-nest", "common", "where the night begins: a 2 m nest")
def spawn_nest():
    v = V((-1.2, -1.2, 0), (1.2, 1.2, 0.6))
    X, Y, Z = v.X, v.Y, v.Z
    r = np.sqrt(X**2 + Y**2)
    v.fill("straw", (r < 0.75 + Z * 0.6) & (r > 0.45 + Z * 0.2) & (Z < 0.42 + 0.08 * v.noise(0.25, 2)))
    v.fill("straw", (r < 0.9) & (Z < 0.12))
    v.paint("wood_light", (np.mod(np.arctan2(Y, X) * 3 + Z * 9, 1.0) < 0.3))
    v.paint("wood", (np.mod(np.arctan2(Y, X) * 5 - Z * 7, 1.0) < 0.18))
    v.ball("owl_belly", (0.1, 0, 0.12), (0.4, 0.4, 0.06))
    return v.done("spawn-nest", keep=0.4)


@asset("water", "common", "a 4 m square of pond water, top at z = 0, tiles in x")
def water():
    v = V((-2, -2.4, -1.6), (2, 2.4, 0), vpm=4, open="x")
    v.box("water", (-2, -2.4, -1.6), (2, 2.4, 0))
    return v.done("water", keep=0.3, relax=1)


def _sign(i, phrase):
    name = f"closed-sign-{i + 1}"
    v = V((-2.0, -0.3, 0), (2.0, 0.3, 3.1), vpm=40)
    X, Y, Z = v.X, v.Y, v.Z
    for sx in (-1.75, 1.75):
        v.rod("bark", (sx, 0.05, 0), (sx * 0.98, 0.05, 2.95), 0.11, 0.08)
    v.box("wood_light", (-1.65, -0.06, 1.75), (1.65, 0.12, 2.65))
    v.paint("wood", (v.noise(0.7, i) > 0.62))
    v.box("bark", (-1.85, -0.1, 2.62), (1.85, 0.16, 2.78))
    v.box("bark", (-1.85, -0.1, 1.62), (1.85, 0.16, 1.78))
    for k in range(3):  # a plank barrier below, each a little askew
        tilt = 0.07 * (1 if k % 2 else -1)
        v.fill("wood", (abs(Z - (0.35 + k * 0.42) - X * tilt) < 0.1) & (abs(X) < 1.8) & (abs(Y) < 0.07))
    words = phrase.upper().split()
    lines = [" ".join(words[: len(words) // 2 + len(words) % 2]), " ".join(words[len(words) // 2 + len(words) % 2 :])] if len(phrase) > 10 else [phrase.upper()]
    for li, line in enumerate(lines):
        z = 2.2 - li * 0.42 + (0.21 if len(lines) == 2 else 0) - 0.175
        v.text("bark_dark", line, 0, z, -0.13, -0.02, px=2)
    v.ball("gold_glow", (-1.75, -0.02, 3.0), 0.09)
    v.ball("gold_glow", (1.72, -0.02, 3.0), 0.09)
    return v.done(name, keep=0.12, relax=1)


for _i, _p in enumerate(CLOSED_SIGNS):
    asset(f"closed-sign-{_i + 1}", "common", f'the barrier across a closed way: "{_p}"')(lambda _i=_i, _p=_p: _sign(_i, _p))
