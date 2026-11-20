"""The reaches' own art: the wall behind the path in each reach, the far scenery, what hurts, the
guardians' idols and the sunwell, the great landmark of each reach, and the props scattered
through its rooms. Sizes in the notes are what the map places them by.
"""
import math

import numpy as np

from ..core import asset
from ..vox import V
from . import palette  # noqa: F401
from .shared import TAU, _blade, _fin, _pnoise, _shard

WALL_TRIS, FAR_TRIS, LANDMARK_TRIS = 16000, 2500, 9000


# ---- the walls behind the path: 10 x 10 m panels (x -5..5, z 0..10, y 0..1), tiling every way ----


def _wall_base(seed, c_deep, c_mid, c_hi, relief=0.55):
    v = V((-5, 0, 0), (5, 1, 10), vpm=8, open="xz")
    pn = _pnoise(v, seed, terms=9)
    pn2 = _pnoise(v, seed + 3, terms=8, kmax=5)
    front = 0.8 - relief * pn - 0.12 * pn2
    v.fill(c_deep, v.Y > front)
    v.paint(c_mid, pn > 0.42)
    v.paint(c_hi, (pn > 0.7) & (pn2 > 0.45))
    return v, pn, pn2


@asset("grove-wall", "grove", "the grove's mossy bank behind the path, gold leaves caught in it; 10 x 10 m panel, tiles")
def grove_wall():
    v, pn, pn2 = _wall_base(31, "bark_warm", "earth_warm", "moss_green")
    v.paint("moss_bright", (_pnoise(v, 37) > 0.62) & (v.Y < 0.5))
    v.paint("gold_leaf_dark", (_pnoise(v, 41, kmax=6) > 0.86))
    v.paint("gold_leaf", (_pnoise(v, 43, kmax=7) > 0.93))
    for xk, ph in ((-2.8, 0.4), (2.2, 2.1)):   # roots threading down the bank
        cx = xk + 0.7 * np.sin(TAU * v.Z / 10 + ph)
        dx = np.mod(v.X - cx + 5, 10) - 5
        v.fill("bark_warm", (abs(dx) < 0.3) & (v.Y > 0.1 + 0.6 * (dx / 0.3) ** 2))
    v.paint("crystal_green", (_pnoise(v, 47, kmax=7) > 0.93) & (v.Y < 0.4))
    return v.done_tris("grove-wall", WALL_TRIS, relax=3)


@asset("falls-wall", "falls", "wet stone behind the mistfalls, streaked with running water and ferns; 10 x 10 m panel, tiles")
def falls_wall():
    v, pn, pn2 = _wall_base(51, "wet_stone_dark", "wet_stone", "moss_green")
    streak = np.abs(np.sin(TAU * 3 * v.X / 10 + 2 * pn2)) < 0.12
    v.paint("falls_blue", streak & (pn > 0.3))
    v.paint("fern", (_pnoise(v, 57) > 0.74) & (v.Y < 0.5))
    v.paint("crystal_green", (_pnoise(v, 59, kmax=7) > 0.93))
    return v.done_tris("falls-wall", WALL_TRIS, relax=3)


@asset("ember-wall", "ember", "basalt columns behind the path with lava light in the seams; 10 x 10 m panel, tiles")
def ember_wall():
    v = V((-5, 0, 0), (5, 1, 10), vpm=8, open="xz")
    pn = _pnoise(v, 61, terms=9)
    col = np.mod(v.X + 0.6 * np.sin(TAU * v.Z / 10), 1.25)       # 8 columns per panel, so it tiles
    face = 0.35 + 0.3 * np.abs(np.sin(math.pi * col / 1.25)) + 0.15 * pn
    v.fill("basalt", v.Y > 1 - face)
    v.paint("basalt_light", (pn > 0.55) & (col > 0.2))
    v.paint("ash", (_pnoise(v, 63) > 0.8) & (col > 0.2))
    seam = col < 0.14
    v.paint("lava_glow", seam & (_pnoise(v, 67, kmax=6) > 0.45))
    v.paint("ember_orange", seam & (_pnoise(v, 67, kmax=6) <= 0.45))
    return v.done_tris("ember-wall", WALL_TRIS, relax=2)


@asset("frost-wall", "frost", "layered blue ice and snow-dusted rock behind the path; 10 x 10 m panel, tiles")
def frost_wall():
    v, pn, pn2 = _wall_base(71, "frost_stone_dark", "frost_stone", "ice_deep")
    band = np.mod(v.Z + 1.2 * pn2, 2.5) < 0.9
    v.paint("ice", band & (pn > 0.35))
    v.paint("ice_deep", band & (pn <= 0.35))
    v.paint("snow", (_pnoise(v, 77) > 0.7) & (pn > 0.5))
    v.paint("ice_glow", (_pnoise(v, 79, kmax=7) > 0.92))
    return v.done_tris("frost-wall", WALL_TRIS, relax=3)


@asset("canyon-wall", "canyon", "banded sandstone cliff behind the path, carved by wind; 10 x 10 m panel, tiles")
def canyon_wall():
    v = V((-5, 0, 0), (5, 1, 10), vpm=8, open="xz")
    pn = _pnoise(v, 81, terms=9)
    pn2 = _pnoise(v, 83, terms=6, kmax=3)
    layer = np.mod(v.Z + 0.6 * pn2, 2.0)
    ledge = 0.25 * (layer < 0.5) + 0.3 * pn
    v.fill("sand_dark", v.Y > 0.75 - ledge)
    v.paint("sandstone", (layer > 0.5) & (layer < 1.4))
    v.paint("sand_light", (layer >= 1.4) | ((pn > 0.7) & (layer > 0.5)))
    v.paint("rust", (layer < 0.2) & (pn > 0.4))
    return v.done_tris("canyon-wall", WALL_TRIS, relax=2)


@asset("colonnade-wall", "colonnade", "dressed temple stone behind the path, split by roots; 10 x 10 m panel, tiles")
def colonnade_wall():
    v = V((-5, 0, 0), (5, 1, 10), vpm=8, open="xz")
    pn = _pnoise(v, 91, terms=9)
    course = np.mod(v.Z, 1.25)
    joint = (course < 0.08) | (np.mod(v.X + 1.25 * (np.floor(v.Z / 1.25) % 2), 2.5) < 0.08)
    v.fill("temple_dark", v.Y > 0.55 - 0.15 * pn + 0.12 * joint)
    v.paint("temple_stone", ~joint & (pn > 0.3))
    v.paint("sandstone", ~joint & (pn > 0.75))
    v.paint("moss_green", (_pnoise(v, 93) > 0.8) & ~joint)
    for xk, ph in ((-3.0, 0.2), (1.6, 1.7)):
        cx = xk + 0.9 * np.sin(TAU * v.Z / 10 + ph) + 0.3 * np.sin(TAU * 2 * v.Z / 10)
        dx = np.mod(v.X - cx + 5, 10) - 5
        v.fill("root_brown", (abs(dx) < 0.32) & (v.Y > 0.05 + 0.4 * (dx / 0.32) ** 2))
    return v.done_tris("colonnade-wall", WALL_TRIS, relax=2)


@asset("gloam-wall", "gloam", "deep blue cave stone behind the path, seeded with glowing crystal; 10 x 10 m panel, tiles")
def gloam_wall():
    v, pn, pn2 = _wall_base(101, "cave_deep", "cave_blue", "cave_teal")
    v.paint("crystal_cyan", (_pnoise(v, 103, kmax=7) > 0.9))
    v.paint("mushroom_cyan", (_pnoise(v, 107, kmax=6) > 0.94) & (v.Y < 0.45))
    return v.done_tris("gloam-wall", WALL_TRIS, relax=3)


@asset("sea-wall", "sea", "reef stone behind the path under the sea, with coral and sea-glow; 10 x 10 m panel, tiles")
def sea_wall():
    v, pn, pn2 = _wall_base(111, "sea_deep", "coral_stone", "kelp")
    v.paint("coral_pink", (_pnoise(v, 113, kmax=6) > 0.84) & (v.Y < 0.5))
    v.paint("coral_orange", (_pnoise(v, 117, kmax=6) > 0.88) & (v.Y < 0.5))
    v.paint("sea_glow", (_pnoise(v, 119, kmax=7) > 0.93))
    return v.done_tris("sea-wall", WALL_TRIS, relax=3)


# ---- far scenery, 20 m or more behind the path ------------------------------------------------


@asset("far-peaks", "far", "a range of snowy peaks, 60 m wide, 32 m tall; far scenery")
def far_peaks():
    v = V((-30, -2, 0), (30, 2, 32), vpm=2)
    X, Z = v.X, v.Z
    h = 10 + 0 * X
    for px, ph, pw in ((-18, 30, 12), (-2, 24, 10), (14, 31, 13), (26, 18, 8), (-27, 20, 7)):
        h = np.maximum(h, ph - np.abs(X - px) * ph / pw)
    v.fill("frost_stone", Z < h + 1.5 * v.noise(3, 5))
    v.paint("frost_stone_dark", v.noise(4, 7) > 0.55)
    v.paint("snow", Z > h * 0.62 + 3 * v.noise(2.5, 9))
    v.paint("ice", (Z > h * 0.5) & (v.noise(1.5, 11) > 0.72))
    return _fin(v, "far-peaks", FAR_TRIS)


@asset("far-mesa", "far", "desert mesas and a ruined city on them, 60 m wide, 24 m tall; far scenery")
def far_mesa():
    v = V((-30, -2, 0), (30, 2, 24), vpm=2)
    X, Z = v.X, v.Z
    h = 4 + 0 * X
    for px, ph, pw in ((-20, 18, 9), (0, 13, 12), (19, 21, 8)):
        h = np.where(np.abs(X - px) < pw, np.maximum(h, ph - 0.6 * np.maximum(np.abs(X - px) - pw + 3, 0) * 2), h)
    v.fill("sandstone", Z < h)
    v.paint("sand_dark", np.mod(Z + v.noise(3, 3) * 2, 4) < 1.2)
    v.paint("sand_light", v.exposed(2, 1, 1))
    for px, ph in ((-22, 18), (-17, 18), (17, 21), (21, 21)):    # broken towers on the tops
        v.box("temple_stone", (px - 1, -1, ph), (px + 1, 1, ph + 4 + (px % 3)))
    return _fin(v, "far-mesa", FAR_TRIS)


@asset("far-canopy", "far", "a golden forest crown seen from inside the grove, 60 m wide, 26 m tall; far scenery")
def far_canopy():
    v = V((-30, -2, 0), (30, 2, 26), vpm=2)
    rng = np.random.default_rng(5)
    for k in range(7):
        x = -26 + k * 8.5 + rng.uniform(-2, 2)
        hgt = rng.uniform(14, 22)
        v.rod("bark_warm", (x, 0, 0), (x + rng.uniform(-1, 1), 0, hgt - 4), 0.9, 0.5)
        for _ in range(5):
            v.ball(rng.choice(["gold_leaf", "gold_leaf_dark", "gold_leaf_light"]),
                   (x + rng.uniform(-5, 5), 0, hgt + rng.uniform(-3, 2)), (rng.uniform(3, 5), 1.5, rng.uniform(2.5, 4)))
    v.paint("gold_leaf_light", v.exposed(2, 1, 1) & (v.noise(2, 3) > 0.4), only=["gold_leaf", "gold_leaf_dark"])
    return _fin(v, "far-canopy", FAR_TRIS)


@asset("far-clouds", "far", "a bank of sunlit cloud, 50 m wide, 12 m tall; far scenery, also sky-floor")
def far_clouds():
    v = V((-25, -2, 0), (25, 2, 12), vpm=2)
    rng = np.random.default_rng(9)
    for _ in range(16):
        x = rng.uniform(-22, 22)
        v.ball("cloud", (x, 0, rng.uniform(1, 6)), (rng.uniform(3, 7), 1.6, rng.uniform(2, 4.5)))
    v.paint("sun_glow", v.exposed(2, 1, 1) & (v.noise(3, 2) > 0.6))
    v.paint("sky_blue", v.exposed(2, -1, 2))
    return _fin(v, "far-clouds", FAR_TRIS)


# ---- what hurts ---------------------------------------------------------------------------------


@asset("lava-pool", "hazards", "a 2 m stretch of lava with a crust, 0.4 m deep; tiles in x")
def lava_pool():
    v = V((-1, -1, -0.1), (1, 1, 0.45), vpm=24, open="x")
    X, Y, Z = v.X, v.Y, v.Z
    surf = 0.24 + 0.05 * np.sin(math.pi * X * 2 + Y * 3) + 0.03 * np.sin(math.pi * X * 3 - Y * 4)
    v.fill("lava_glow", Z < surf)
    v.paint("lava_core", (np.abs(np.sin(math.pi * X * 3 + Y * 5)) > 0.85))
    crust = np.abs(np.sin(math.pi * X * 2 - Y * 2.5 + 1)) > 0.9
    v.fill("basalt", crust & (Z < surf + 0.06) & (Z > surf - 0.08))
    for x in (-0.55, 0.15, 0.7):                    # a few bubbles rising
        v.ball("lava_core", (x, 0.2 - x * 0.3, surf.max() + 0.06), 0.07)
    return v.done("lava-pool", keep=0.4)


@asset("ice-spikes", "hazards", "a 2 m bed of ice spikes, 0.6 m tall; tiles in x")
def ice_spikes():
    v = V((-1, -1, 0), (1, 1, 0.7), vpm=24, open="x")
    v.fill("frost_stone_dark", v.Z < 0.08 + 0.02 * np.sin(math.pi * v.X * 2))
    rng = np.random.default_rng(3)
    for row, (y, n) in enumerate(((-0.6, 7), (0.0, 6), (0.6, 7))):
        for k in range(n):
            x = -1 + (k + 0.5 + 0.25 * (row % 2)) * 2 / n
            if abs(x) > 0.95:
                continue
            h = rng.uniform(0.35, 0.62)
            _shard(v, "ice" if k % 3 else "ice_glow", (x, y, 0.02), (x + rng.uniform(-0.06, 0.06), y, h), 0.09)
    return v.done("ice-spikes", keep=0.35)


# ---- the guardians and the sunwell --------------------------------------------------------------


def _idol(name, stone, dark, accent, glow, deco, seed):
    """An old owl guardian, 6 m tall: plinth, folded wings, ear tufts, great glowing eyes."""
    v = V((-2.4, -1.4, 0), (2.4, 1.4, 6.6), vpm=10)
    X, Y, Z = v.X, v.Y, v.Z
    v.box(dark, (-2.2, -1.3, 0), (2.2, 1.3, 0.9))
    v.box(stone, (-1.9, -1.1, 0.9), (1.9, 1.1, 1.2))
    v.ball(stone, (0, 0, 3.0), (1.55, 1.05, 1.9))               # body
    v.ball(stone, (0, -0.05, 4.9), (1.45, 1.0, 1.15))           # head
    for s in (-1, 1):
        v.ball(dark, (s * 1.35, 0.1, 2.9), (0.55, 0.85, 1.6))    # folded wings
        v.path(stone, [(s * 0.9, 0, 5.6), (s * 1.25, 0, 6.2), (s * 1.45, 0, 6.55)], 0.32, 0.08)  # ear tufts
        v.ball(accent, (s * 0.55, -0.85, 5.0), (0.48, 0.25, 0.48))   # facial discs
        v.ball(glow, (s * 0.55, -1.0, 5.0), (0.3, 0.12, 0.3))        # eyes
    v.path(dark, [(0, -1.0, 4.7), (0, -1.15, 4.45), (0, -1.05, 4.25)], 0.14, 0.05)   # beak
    v.paint(accent, (np.abs(np.sin(Z * 6 + 2 * np.abs(X))) > 0.93) & (Z > 1.5) & (Z < 3.8) & (Y < -0.6))  # breast bars
    v.paint(dark, v.noise(0.6, seed) > 0.72, only=stone)
    deco(v)
    return _fin(v, name, 6000)


def _leaves(v):
    rng = np.random.default_rng(4)
    for _ in range(26):
        x, z = rng.uniform(-2, 2), rng.uniform(1, 6.2)
        v.ball(rng.choice(["gold_leaf", "gold_leaf_light", "moss_bright"]), (x, rng.uniform(-1.1, 1.1), z), (0.22, 0.2, 0.12), only="air")


def _icy(v):
    rng = np.random.default_rng(6)
    v.top("snow", 2)
    for _ in range(10):
        x = rng.uniform(-1.8, 1.8)
        _shard(v, "ice_glow", (x, -0.9, 1.2), (x * 1.3, -1.2, 1.2 + rng.uniform(0.5, 1.4)), 0.12)


def _cracks(v):
    v.paint("lava_glow", np.abs(v.noise(0.4, 5) - 0.5) < 0.03)


def _roots(v):
    for s, ph in ((-1, 0.3), (1, 1.1)):
        pts = [(s * (1.9 - 0.2 * k) + 0.2 * math.sin(k + ph), -1.0 - 0.05 * k, 6.0 - k * 0.8) for k in range(8)]
        v.path("root_brown", pts, 0.2, 0.12)


def _coral(v):
    rng = np.random.default_rng(8)
    for _ in range(14):
        x, z = rng.uniform(-2, 2), rng.uniform(0.9, 3)
        v.ball(rng.choice(["coral_pink", "coral_orange", "kelp_light"]), (x, -1.05, z), (0.25, 0.2, 0.3))
    v.paint("sea_glow", v.noise(0.5, 3) > 0.85)


asset("idol-golden-oak", "guardians", "guardian of the grove, an owl of oak and moss under gold leaves, 6.6 m; behind the path")(
    lambda: _idol("idol-golden-oak", "earth_warm", "bark_warm", "gold_leaf", "crystal_green", _leaves, 1))
asset("idol-ember", "guardians", "guardian of the ember deep, basalt owl with lava eyes, 6.6 m; behind the path")(
    lambda: _idol("idol-ember", "basalt_light", "basalt", "ember_orange", "lava_core", _cracks, 2))
asset("idol-frost", "guardians", "guardian of the peaks, frost-stone owl rimed with ice, 6.6 m; behind the path")(
    lambda: _idol("idol-frost", "frost_stone", "frost_stone_dark", "ice", "ice_glow", _icy, 3))
asset("idol-root", "guardians", "guardian of the colonnades, temple-stone owl bound in roots, 6.6 m; behind the path")(
    lambda: _idol("idol-root", "temple_stone", "temple_dark", "sandstone", "amber_glow", _roots, 4))
asset("idol-sea", "guardians", "guardian of the sunken sea, reef-stone owl grown with coral, 6.6 m; behind the path")(
    lambda: _idol("idol-sea", "coral_stone", "sea_deep", "sea_sand", "sea_glow", _coral, 5))


@asset("sunwell", "guardians", "the sunwell at the top of the world: a marble ring round a pool of sunlight, 7 m wide, 6 m tall; behind the path")
def sunwell():
    v = V((-3.6, -1.6, 0), (3.6, 1.6, 6.4), vpm=10)
    X, Y, Z = v.X, v.Y, v.Z
    v.box("marble_shadow", (-3.4, -1.4, 0), (3.4, 1.4, 0.6))
    v.box("marble", (-3.0, -1.2, 0.6), (3.0, 1.2, 1.0))
    R = np.sqrt(X**2 + (Z - 3.4) ** 2)
    v.fill("marble", (np.abs(R - 2.4) < 0.32) & (np.abs(Y) < 0.5))
    v.fill("sun_glow", (R < 1.9) & (np.abs(Y) < 0.16))
    for k in range(12):                                   # rays carved into the ring
        a = TAU * k / 12
        v.ball("gold_soft", (2.4 * math.cos(a), -0.45, 3.4 + 2.4 * math.sin(a)), 0.16)
    for s in (-1, 1):
        v.rod("marble", (s * 2.9, 0, 1.0), (s * 2.6, 0, 4.0), 0.3, 0.22)
    v.paint("moss_bright", v.exposed(2, 1, 1) & (v.noise(0.4, 2) > 0.7), only="marble")
    return _fin(v, "sunwell", 6000)


# ---- landmarks: one great thing behind the path in each reach's open caverns -------------------


@asset("golden-oak", "landmarks", "the golden oak of the grove: a vast tree in autumn gold, 44 m tall, 46 m wide; origin at its foot; 6 m behind the path")
def golden_oak():
    v = V((-23, -4, 0), (23, 4, 44), vpm=2)
    rng = np.random.default_rng(12)
    v.path("bark_warm", [(0, 0, 0), (-1, 0, 8), (0.5, 0, 16), (0, 0, 22)], 4.2, 2.6)
    for s in (-1, 1):   # great roots and limbs
        v.path("bark_warm", [(s * 1.5, 0, 2), (s * 6, 0, 0.6), (s * 11, 0, 0)], 1.8, 0.6)
        v.path("bark_warm", [(s * 1, 0, 18), (s * 8, 0, 25), (s * 15, 0, 28)], 1.8, 0.9)
        v.path("bark_warm", [(s * 0.5, 0, 21), (s * 4, 0, 31), (s * 6, 0, 36)], 1.4, 0.7)
    v.paint("earth_warm", v.noise(1.2, 3) > 0.6, only="bark_warm")
    v.paint("moss_green", v.exposed(2, 1, 1) & (v.Z < 20), only="bark_warm")
    for _ in range(36):
        x, z = rng.uniform(-19, 19), rng.uniform(24, 40) - abs(rng.normal(0, 3))
        v.ball(rng.choice(["gold_leaf", "gold_leaf", "gold_leaf_dark", "gold_leaf_light"]), (x, rng.uniform(-1.5, 1.5), z),
               (rng.uniform(3.5, 6), rng.uniform(2.2, 3), rng.uniform(2.6, 4.2)), only="air")
    v.paint("gold_leaf_light", v.exposed(2, 1, 1), only=["gold_leaf", "gold_leaf_dark"])
    v.paint("gold_leaf_dark", v.exposed(2, -1, 2), only=["gold_leaf", "gold_leaf_light"])
    v.paint("crystal_green", (v.noise(0.8, 9) > 0.88) & (v.Z < 6), only="bark_warm")
    return _fin(v, "golden-oak", LANDMARK_TRIS)


@asset("great-falls", "landmarks", "a tall waterfall pouring from a mossy lip into mist, 12 m wide, 34 m tall; 6 m behind the path")
def great_falls():
    v = V((-8, -3, 0), (8, 3, 34), vpm=3)
    X, Y, Z = v.X, v.Y, v.Z
    v.fill("wet_stone_dark", (Y > 0.5) & (np.abs(X) < 7.5))
    v.fill("wet_stone", (Y > 0.0) & (np.abs(X) > 5.5 + 1.2 * v.noise(2, 2)))
    v.paint("moss_green", v.exposed(1, -1, 2) & (v.noise(1.5, 3) > 0.5))
    curtain = (np.abs(X) < 4.5 + 0.4 * np.sin(Z * 0.5)) & (Y > -0.6 + 0.2 * np.sin(Z * 0.7 + X)) & (Y < 0.4)
    v.fill("falls_blue", curtain)
    v.paint("falls_white", curtain & (np.abs(np.sin(X * 2.4 + Z * 0.15)) > 0.6))
    for k in range(9):        # the mist at its foot
        v.ball("mist", (-5 + k * 1.25, -1.5, 0.8 + (k % 3) * 0.5), (1.6, 1.2, 1.2))
    return _fin(v, "great-falls", LANDMARK_TRIS)


@asset("heart-roots", "landmarks", "the great tree's heart: roots knotted round glowing seed-pods, 40 m wide, 30 m tall; 6 m behind the path")
def heart_roots():
    v = V((-20, -3, 0), (20, 3, 30), vpm=2)
    rng = np.random.default_rng(14)
    for k in range(9):
        x0 = -18 + k * 4.5
        pts = [(x0, 0, 30), (x0 + rng.uniform(-4, 4), rng.uniform(-1, 1), 20), (x0 + rng.uniform(-5, 5), 0, 10), (x0 + rng.uniform(-3, 3), 0, 0)]
        v.path("bark", pts, rng.uniform(1.0, 1.6), rng.uniform(0.6, 1.2))
    for _ in range(9):
        at = (rng.uniform(-15, 15), -1.2, rng.uniform(4, 24))
        v.ball("bark_dark", at, (2.6, 2.0, 2.2))
        v.ball(rng.choice(["mushroom_cyan", "gold_glow", "crystal_green"]), (at[0], -2.0, at[2]), (1.7, 0.8, 1.5))
    v.paint("moss", v.exposed(2, 1, 1), only="bark")
    return _fin(v, "heart-roots", LANDMARK_TRIS)


@asset("heart-lanterns", "landmarks", "the spire's lantern tree: hanging lanterns on curling twigs, 30 m wide, 24 m tall; 6 m behind the path")
def heart_lanterns():
    v = V((-15, -2, 0), (15, 2, 24), vpm=3)
    rng = np.random.default_rng(15)
    v.path("bark", [(0, 0, 0), (0.5, 0, 10), (0, 0, 24)], 2.0, 1.4)
    for k in range(10):
        s = -1 if k % 2 else 1
        z0 = 3 + k * 2
        tip = (s * rng.uniform(7, 13), 0, z0 + rng.uniform(1, 4))
        v.path("bark", [(0, 0, z0), (s * 4, 0, z0 + 2), tip], 0.6, 0.25)
        v.rod("gold", tip, (tip[0], 0, tip[2] - 1.6), 0.08)
        v.ball("gold_glow", (tip[0], 0, tip[2] - 2.1), (0.5, 0.5, 0.65))
    v.paint("moss", v.exposed(2, 1, 1) & (v.noise(1, 3) > 0.5), only="bark")
    return _fin(v, "heart-lanterns", LANDMARK_TRIS)


@asset("volcano", "landmarks", "the fire mountain of the ember deep, lava running down it, 48 m wide, 30 m tall; 6 m behind the path")
def volcano():
    v = V((-24, -4, 0), (24, 4, 30), vpm=2)
    X, Y, Z = v.X, v.Y, v.Z
    h = 28 - np.abs(X) * 1.15 + 2 * v.noise(4, 2)
    cone = (Z < h) & (Z < 26) & (np.abs(Y) < 3.5 - 0.1 * Z)
    v.fill("basalt", cone)
    v.paint("basalt_light", v.noise(2, 3) > 0.55)
    v.paint("ash", v.exposed(2, 1, 1) & (v.noise(2.5, 5) > 0.5))
    v.fill(None, (Z > 22) & (np.abs(X) < 3.2))                     # the crater
    v.fill("lava_core", (Z > 21) & (Z < 23) & (np.abs(X) < 3.4) & (np.abs(Y) < 2.5))
    for ph, side in ((0.0, 1), (1.7, -1), (3.1, 1)):          # rivers of lava down the flank
        cx = side * (2 + (26 - Z) * 0.75) + 1.2 * np.sin(Z * 0.4 + ph)
        v.paint("lava_glow", (np.abs(X - cx) < 0.9) & (Y < -1.5))
    v.paint("lava_core", (v.noise(1, 7) > 0.85) & (Y < -2), only="lava_glow")
    return _fin(v, "volcano", LANDMARK_TRIS)


@asset("frozen-falls", "landmarks", "a waterfall frozen mid-fall, icicles and blue light, 18 m wide, 30 m tall; 6 m behind the path")
def frozen_falls():
    v = V((-9, -3, 0), (9, 3, 30), vpm=3)
    X, Y, Z = v.X, v.Y, v.Z
    v.fill("frost_stone_dark", (Y > 0.6))
    v.fill("frost_stone", (Y > -0.5) & (np.abs(X) > 6 + v.noise(2, 2) * 2))
    v.paint("snow", v.exposed(2, 1, 1))
    curtain = (np.abs(X) < 5 + 0.6 * np.sin(Z * 0.4)) & (Y > -1.2 + 0.4 * np.sin(Z * 0.9 + X * 0.7)) & (Y < 0.6)
    v.fill("ice", curtain)
    v.paint("ice_glow", curtain & (np.abs(np.sin(X * 1.8 + Z * 0.12)) > 0.75))
    v.paint("ice_deep", curtain & (v.noise(1.5, 4) > 0.62))
    rng = np.random.default_rng(6)
    for _ in range(14):
        x = rng.uniform(-8, 8)
        _shard(v, "ice", (x, -1.0, 30 - rng.uniform(0, 4)), (x, -1.0, 30 - rng.uniform(5, 11)), 0.45)
    return _fin(v, "frozen-falls", LANDMARK_TRIS)


@asset("root-temple", "landmarks", "a temple front carved in the roots: columns, arches and a lit door, 36 m wide, 24 m tall; 6 m behind the path")
def root_temple():
    v = V((-18, -2.5, 0), (18, 2.5, 24), vpm=2)
    X, Y, Z = v.X, v.Y, v.Z
    v.box("temple_dark", (-17, 0.5, 0), (17, 2.5, 20))
    for k in range(7):
        x = -15 + k * 5
        v.rod("temple_stone", (x, -0.5, 0.5), (x, -0.5, 15), 1.0)
        v.box("temple_stone", (x - 1.6, -1.6, 0), (x + 1.6, 0.8, 1.0))
        v.box("temple_stone", (x - 1.5, -1.6, 15), (x + 1.5, 0.8, 16))
    v.box("temple_stone", (-17, -1.6, 16), (17, 1.0, 18))
    v.poly("temple_stone", [(-12, 18), (12, 18), (0, 23.5)], -1.2, 1.0)
    R = np.sqrt(X**2 + (Z - 6) ** 2)
    v.fill("amber_glow", (np.abs(X) < 2.2) & (Z < 6) & (Y > 0.2) | ((R < 2.2) & (Y > 0.2) & (Z >= 6)))
    for s in (-1, 1):
        pts = [(s * (17 - k * 1.8), -1.8, 23 - k * 2.4 + 1.5 * math.sin(k)) for k in range(10)]
        v.path("root_brown", pts, 1.0, 0.5)
    v.paint("moss_green", v.exposed(2, 1, 1) & (v.noise(1.5, 3) > 0.5), only="temple_stone")
    return _fin(v, "root-temple", LANDMARK_TRIS)


@asset("sun-arch", "landmarks", "a natural sandstone arch with a ruin on top, 40 m wide, 30 m tall; 6 m behind the path")
def sun_arch():
    v = V((-20, -3, 0), (20, 3, 30), vpm=2)
    X, Y, Z = v.X, v.Y, v.Z
    R = np.sqrt((X / 14) ** 2 + (Z / 20) ** 2)
    v.fill("sandstone", (np.abs(X) < 19) & (Z < 24 + 2 * v.noise(4, 2)) & (R > 1.0) & (np.abs(Y) < 2.6))
    v.paint("sand_dark", np.mod(Z + 2 * v.noise(3, 3), 3.0) < 0.8)
    v.paint("sand_light", v.exposed(2, 1, 1))
    v.paint("rust", v.noise(1.5, 6) > 0.75)
    for x in (-12, -7, 6, 11):
        v.box("temple_stone", (x - 1, -1.5, 23), (x + 1, 1.5, 28 - (x % 4)))
    v.box("temple_stone", (-13, -1.5, 27), (-6, 1.5, 28.2))
    return _fin(v, "sun-arch", LANDMARK_TRIS)


@asset("crystal-geode", "landmarks", "a great geode of glowing blue crystal, 24 m wide, 18 m tall; 6 m behind the path")
def crystal_geode():
    v = V((-12, -3, 0), (12, 3, 18), vpm=3)
    rng = np.random.default_rng(16)
    v.ball("cave_deep", (0, 1.5, 7), (11.5, 2.5, 9))
    v.ball("cave_blue", (0, 0.6, 7), (9.5, 1.5, 7.5))
    for _ in range(22):
        a = rng.uniform(0, TAU)
        base = (7.5 * math.cos(a), 0.5, 7 + 6 * math.sin(a))
        tip = (base[0] * 0.35 + rng.uniform(-1, 1), -1.5, base[2] * 0.4 + 4)
        _shard(v, rng.choice(["crystal_cyan", "ice_glow", "crystal_cyan"]), base, tip, rng.uniform(0.5, 1.1))
    return _fin(v, "crystal-geode", LANDMARK_TRIS)


@asset("sunken-ruin", "landmarks", "a drowned temple: fallen columns and an arch grown with coral, 36 m wide, 22 m tall; 6 m behind the path")
def sunken_ruin():
    v = V((-18, -3, 0), (18, 3, 22), vpm=2)
    X, Y, Z = v.X, v.Y, v.Z
    for x, h in ((-14, 14), (-8, 19), (8, 17), (14, 9)):
        v.rod("coral_stone", (x, 0, 0), (x + 0.4, 0, h), 1.1, 0.9)
    v.box("coral_stone", (-10, -1.5, 18), (10, 1.5, 20))
    R = np.sqrt(X**2 + (Z - 6) ** 2)
    v.fill("sea_deep", (R > 6) & (R < 7.5) & (Z > 6) & (np.abs(Y) < 1.5))
    v.rod("coral_stone", (2, 0, 1), (13, 0, 3.5), 1.0)      # a fallen column
    rng = np.random.default_rng(18)
    for _ in range(30):
        at = (rng.uniform(-17, 17), rng.uniform(-2, -0.5), rng.uniform(0, 12))
        v.ball(rng.choice(["coral_pink", "coral_orange", "kelp", "kelp_light"]), at, (rng.uniform(0.6, 1.4), 0.8, rng.uniform(0.6, 1.6)), only="air")
    v.paint("sea_glow", v.noise(0.8, 4) > 0.86)
    return _fin(v, "sunken-ruin", LANDMARK_TRIS)


@asset("sky-temple", "landmarks", "a floating marble temple with a waterfall off its edge, 30 m wide, 26 m tall; 6 m behind the path")
def sky_temple():
    v = V((-15, -3, 0), (15, 3, 26), vpm=2)
    X, Y, Z = v.X, v.Y, v.Z
    rock = (Z < 9) & (Z > 9 - (12 - np.abs(X)) * 0.9 + 2 * v.noise(2, 2)) & (np.abs(X) < 13)
    v.fill("earth_warm", rock & (np.abs(Y) < 2.5))
    v.top("moss_bright", 1)
    for x in (-9, -4.5, 0, 4.5, 9):
        v.rod("marble", (x, 0, 9), (x, 0, 19), 0.8)
    v.box("marble", (-11, -1.5, 19), (11, 1.5, 20.5))
    v.poly("marble", [(-11, 20.5), (11, 20.5), (0, 25)], -1.2, 1.2)
    v.box("marble_shadow", (-11, -1.5, 8.6), (11, 1.5, 9.4))
    v.fill("falls_white", (np.abs(X - 10.5) < 1.0) & (Z < 9) & (Y > -1) & (Y < 0.5))
    v.paint("moss_green", v.exposed(2, 1, 1) & (v.noise(1, 3) > 0.6), only="marble")
    return _fin(v, "sky-temple", LANDMARK_TRIS)


# ---- props scattered through the rooms (behind the path unless noted) ---------------------------


@asset("golden-tree", "grove", "a young golden tree, 8 m tall, 6 m wide")
def golden_tree():
    v = V((-3.5, -1.5, 0), (3.5, 1.5, 8.5), vpm=6)
    rng = np.random.default_rng(21)
    v.path("bark_warm", [(0, 0, 0), (0.3, 0, 3), (-0.2, 0, 5)], 0.4, 0.22)
    for s in (-1, 1):
        v.path("bark_warm", [(0, 0, 3.5), (s * 1.6, 0, 5.2)], 0.18, 0.08)
    for _ in range(9):
        v.ball(rng.choice(["gold_leaf", "gold_leaf_dark", "gold_leaf_light"]), (rng.uniform(-2.3, 2.3), rng.uniform(-0.6, 0.6), rng.uniform(5, 7.6)),
               (rng.uniform(1, 1.6), 0.9, rng.uniform(0.8, 1.2)), only="air")
    v.paint("gold_leaf_light", v.exposed(2, 1, 1), only=["gold_leaf", "gold_leaf_dark"])
    return _fin(v, "golden-tree", 2000)


@asset("gold-bush", "grove", "a low bush of golden leaves with pale flowers, 2 m wide")
def gold_bush():
    v = V((-1.1, -0.8, 0), (1.1, 0.8, 1.3), vpm=12)
    rng = np.random.default_rng(22)
    for _ in range(7):
        v.ball(rng.choice(["gold_leaf", "gold_leaf_dark", "moss_green"]), (rng.uniform(-0.6, 0.6), rng.uniform(-0.3, 0.3), rng.uniform(0.4, 0.8)), (0.45, 0.4, 0.38))
    for _ in range(6):
        v.ball("cream", (rng.uniform(-0.7, 0.7), -0.55, rng.uniform(0.5, 1.0)), 0.07)
    return _fin(v, "gold-bush", 1200)


@asset("waterfall", "falls", "a ribbon of falling water, 2 m wide, 12 m tall; origin at its foot, splash at the bottom; in front of a wall")
def waterfall():
    v = V((-1.4, -0.8, 0), (1.4, 0.8, 12), vpm=6)
    X, Y, Z = v.X, v.Y, v.Z
    ribbon = (np.abs(X) < 0.9 + 0.1 * np.sin(Z * 1.3)) & (np.abs(Y) < 0.18)
    v.fill("falls_blue", ribbon)
    v.paint("falls_white", ribbon & (np.abs(np.sin(X * 6 + Z * 0.8)) > 0.55))
    for k in range(5):
        v.ball("mist", (-1 + k * 0.5, -0.3, 0.3), (0.45, 0.4, 0.35))
    return _fin(v, "waterfall", 1500)


@asset("lava-fall", "ember", "a fall of lava pouring from a crack, 2 m wide, 9 m tall; origin at its foot")
def lava_fall():
    v = V((-1.5, -0.8, 0), (1.5, 0.8, 9), vpm=6)
    X, Y, Z = v.X, v.Y, v.Z
    v.fill("lava_glow", (np.abs(X) < 0.7 + 0.15 * np.sin(Z * 1.1)) & (np.abs(Y) < 0.2))
    v.paint("lava_core", np.abs(np.sin(X * 5 + Z * 0.7)) > 0.7)
    v.ball("basalt", (0, 0.3, 9), (1.4, 0.6, 0.6))
    v.ball("lava_glow", (0, -0.2, 0.2), (1.2, 0.6, 0.35))
    return _fin(v, "lava-fall", 1200)


@asset("basalt-spire", "ember", "a cracked basalt spire glowing at its seams, 5 m tall")
def basalt_spire():
    v = V((-1.3, -1.0, 0), (1.3, 1.0, 5.2), vpm=8)
    v.rod("basalt", (0, 0, 0), (0.2, 0, 5.0), 1.1, 0.25)
    v.rod("basalt_light", (0.6, 0.2, 0), (0.7, 0.2, 2.4), 0.5, 0.15)
    v.paint("lava_glow", np.abs(v.noise(0.35, 4) - 0.5) < 0.04)
    v.top("ash", 1)
    return _fin(v, "basalt-spire", 1200)


@asset("ember-crystal", "ember", "a cluster of ember-lit crystals on a rock, 1.4 m")
def ember_crystal():
    v = V((-0.9, -0.7, 0), (0.9, 0.7, 1.5), vpm=16)
    v.ball("basalt", (0, 0, 0.1), (0.8, 0.55, 0.3))
    for k, (x, h, r) in enumerate(((0, 1.4, 0.16), (-0.4, 0.9, 0.12), (0.45, 1.0, 0.13), (0.2, 0.7, 0.1))):
        _shard(v, "lava_glow" if k % 2 == 0 else "ember_orange", (x, 0, 0.15), (x * 1.3, -0.1, h), r)
    return _fin(v, "ember-crystal", 1200)


@asset("snow-pine", "frost", "a snow-laden pine, 7 m tall")
def snow_pine():
    v = V((-2.2, -1.2, 0), (2.2, 1.2, 7.4), vpm=6)
    X, Y, Z = v.X, v.Y, v.Z
    v.rod("bark_warm", (0, 0, 0), (0, 0, 6.5), 0.25, 0.1)
    for k in range(5):
        z0 = 1.2 + k * 1.15
        r = 2.0 - k * 0.36
        v.fill("leaf_dark", (Z > z0) & (Z < z0 + 1.5) & (np.sqrt(X**2 + (Y * 1.6) ** 2) < r * (1 - (Z - z0) / 1.6)))
    v.top("snow", 2)
    return _fin(v, "snow-pine", 1500)


@asset("icicle-cluster", "frost", "icicles hanging from a ceiling, 3 m wide, 2.5 m long; origin at the top")
def icicle_cluster():
    v = V((-1.6, -0.6, -2.6), (1.6, 0.6, 0.2), vpm=12)
    v.box("snow", (-1.5, -0.5, -0.15), (1.5, 0.5, 0.2))
    rng = np.random.default_rng(31)
    for k in range(9):
        x = -1.35 + k * 0.34
        _shard(v, "ice" if k % 3 else "ice_glow", (x, 0, 0), (x, 0, -rng.uniform(0.6, 2.5)), 0.12)
    return _fin(v, "icicle-cluster", 1200)


@asset("ice-crystal", "frost", "a tall clear ice crystal on a snow drift, 2.5 m, lit from inside")
def ice_crystal():
    v = V((-1.2, -0.8, 0), (1.2, 0.8, 2.6), vpm=12)
    v.ball("snow", (0, 0, 0), (1.1, 0.7, 0.4))
    _shard(v, "ice_glow", (0, 0, 0.2), (0.1, 0, 2.5), 0.32)
    _shard(v, "ice", (0.5, 0, 0.2), (0.85, -0.1, 1.4), 0.2)
    _shard(v, "ice", (-0.45, 0, 0.2), (-0.8, 0.1, 1.2), 0.18)
    return _fin(v, "ice-crystal", 1200)


@asset("temple-column", "colonnade", "a fluted temple column with roots wound round it, 7 m tall")
def temple_column():
    v = V((-1.2, -1.2, 0), (1.2, 1.2, 7.2), vpm=8)
    X, Y, Z = v.X, v.Y, v.Z
    ang = np.arctan2(Y, X)
    r = 0.62 - 0.05 * (np.cos(ang * 10) > 0.6)
    v.fill("temple_stone", (np.sqrt(X**2 + Y**2) < r) & (Z > 0.5) & (Z < 6.6))
    v.box("temple_dark", (-0.95, -0.95, 0), (0.95, 0.95, 0.5))
    v.box("temple_dark", (-0.95, -0.95, 6.6), (0.95, 0.95, 7.1))
    pts = [(0.72 * math.cos(k * 0.9), 0.72 * math.sin(k * 0.9), 0.4 + k * 0.55) for k in range(12)]
    v.path("root_brown", pts, 0.16, 0.09)
    v.paint("moss_green", v.exposed(2, 1, 1), only="temple_dark")
    return _fin(v, "temple-column", 1500)


@asset("brazier", "colonnade", "a stone brazier with a warm flame, 1.4 m; sheds light")
def brazier():
    v = V((-0.6, -0.6, 0), (0.6, 0.6, 1.5), vpm=16)
    v.rod("temple_dark", (0, 0, 0), (0, 0, 0.8), 0.22, 0.16)
    v.ball("temple_stone", (0, 0, 0.9), (0.5, 0.5, 0.22))
    v.fill(None, (v.Z > 0.95) & (np.sqrt(v.X**2 + v.Y**2) < 0.38))
    v.ball("amber_glow", (0, 0, 1.05), (0.3, 0.3, 0.2))
    v.ball("gold_glow", (0, 0, 1.25), (0.16, 0.16, 0.25))
    return _fin(v, "brazier", 1000)


@asset("broken-column", "canyon", "a broken sandstone column with its drum fallen beside it, 4 m")
def broken_column():
    v = V((-2.0, -1.0, 0), (2.0, 1.0, 4.2), vpm=8)
    v.rod("temple_stone", (-0.6, 0, 0), (-0.6, 0, 3.6), 0.55)
    v.box("temple_dark", (-1.3, -0.8, 0), (0.1, 0.8, 0.4))
    v.rod("temple_stone", (0.6, -0.1, 0.45), (1.8, 0.1, 0.45), 0.45)
    v.fill(None, (v.Z > 3.2 + 0.4 * v.noise(0.3, 2)) & (v.X < 0))
    v.top("sand_light", 1)
    return _fin(v, "broken-column", 1200)


@asset("dry-shrub", "canyon", "a dry desert shrub, 1.5 m")
def dry_shrub():
    v = V((-0.9, -0.6, 0), (0.9, 0.6, 1.4), vpm=16)
    rng = np.random.default_rng(41)
    for _ in range(14):
        a = rng.uniform(-1.2, 1.2)
        L = rng.uniform(0.6, 1.2)
        v.path(rng.choice(["dry_grass", "sand_dark", "moss_green"]), [(0, 0, 0), (math.sin(a) * L * 0.5, rng.uniform(-0.2, 0.2), L * 0.6), (math.sin(a) * L, rng.uniform(-0.3, 0.3), L)], 0.05, 0.02)
    return _fin(v, "dry-shrub", 1000)


@asset("glow-mushroom", "gloam", "a stand of tall glowing mushrooms, 2.2 m; sheds light")
def glow_mushroom():
    v = V((-1.1, -0.8, 0), (1.1, 0.8, 2.3), vpm=12)
    for x, h, r in ((0, 2.0, 0.55), (-0.6, 1.2, 0.35), (0.6, 1.4, 0.4)):
        v.rod("cream", (x, 0, 0), (x * 1.1, 0, h), 0.08, 0.06)
        v.ball("cave_teal", (x * 1.1, 0, h), (r, r * 0.8, r * 0.45))
        v.ball("mushroom_cyan", (x * 1.1, 0, h - r * 0.2), (r * 0.9, r * 0.7, r * 0.2))
    return _fin(v, "glow-mushroom", 1200)


@asset("coral-fan", "sea", "a fan of pink and orange coral on a reef rock, 2.5 m")
def coral_fan():
    v = V((-1.4, -0.7, 0), (1.4, 0.7, 2.6), vpm=12)
    v.ball("coral_stone", (0, 0, 0.2), (1.1, 0.6, 0.4))
    rng = np.random.default_rng(51)
    for k in range(9):
        a = -1.0 + k * 0.25
        c = "coral_pink" if k % 2 else "coral_orange"
        v.path(c, [(0, 0, 0.4), (math.sin(a) * 0.7, 0, 1.2), (math.sin(a) * 1.2, rng.uniform(-0.1, 0.1), 2.3)], 0.09, 0.05)
    v.paint("sea_glow", v.noise(0.2, 3) > 0.85, only=["coral_pink"])
    return _fin(v, "coral-fan", 1200)


@asset("kelp-tall", "sea", "tall swaying kelp, 6 m")
def kelp_tall():
    v = V((-1.0, -0.6, 0), (1.0, 0.6, 6.2), vpm=8)
    for k, x0 in enumerate((-0.4, 0.1, 0.5)):
        pts = [(x0 + 0.35 * math.sin(z * 0.9 + k), 0, z) for z in np.linspace(0, 5.6 - k * 0.6, 8)]
        v.path("kelp" if k % 2 else "kelp_light", pts, 0.13, 0.07)
        for z in np.linspace(1, 5 - k * 0.6, 4):
            v.ball("kelp_light", (x0 + 0.35 * math.sin(z * 0.9 + k) + 0.2, 0, z), (0.22, 0.06, 0.1))
    return _fin(v, "kelp-tall", 1200)


@asset("ruin-pillar", "sky", "a marble pillar, half fallen, mossy, 5 m")
def ruin_pillar():
    v = V((-1.0, -1.0, 0), (1.0, 1.0, 5.2), vpm=8)
    v.box("marble_shadow", (-0.8, -0.8, 0), (0.8, 0.8, 0.45))
    v.rod("marble", (0, 0, 0.45), (0.1, 0, 4.6), 0.48)
    v.fill(None, v.Z > 4.2 + 0.5 * v.noise(0.4, 2))
    v.paint("moss_bright", v.exposed(2, 1, 1) | (v.noise(0.5, 4) > 0.8))
    return _fin(v, "ruin-pillar", 1200)


@asset("water-volume", "common", "a 1 m cube of water seen from the side, the map stretches it over a pool or a sea; top at z = 1")
def water_volume():
    v = V((-0.5, -2.5, 0), (0.5, 2.5, 1), vpm=8, open="xz")
    v.fill("water", v.Y > -2.4)
    return v.done("water-volume", keep=0.2, exact=True)
