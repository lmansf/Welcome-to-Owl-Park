"""The great tree and what grows round it: the park entrance and the tree's inside ("tree"),
the dusk treehouse clearing ("clearing") and the dark under the roots ("roots").

Sizes in the notes are what the map's collision is laid to.
"""
import math

import numpy as np

from ..core import asset
from ..vox import V, register_colour
from .common import lantern

register_colour("glowworm", "#7CFFC8", emission=4.0)  # the glow-worm threads under the roots
register_colour("crystal_glow", "#9AD8FF", emission=2.0)  # cave crystals
register_colour("rust_leaf", "#B5562B")  # autumn leaves, shingles, fungus caps
register_colour("dusk_teal", "#27505C")  # far trees and hills at dusk
register_colour("dusk_haze", "#47698A")  # their moonlit tops

TAU = 2 * math.pi
PROP, LANDMARK, BACKDROP = 1500, 4000, 800


def _fin(v, name, tris=PROP, relax=2):
    """Skins the sculpt, thinning it to about `tris` triangles."""
    s = np.pad(v.g > 0, 1)
    for ax, ch in enumerate("xyz"):
        both = ch in v.open.replace("+" + ch, "").replace("-" + ch, "")
        sl, src = [slice(None)] * 3, [slice(None)] * 3
        if both or ("-" + ch) in v.open:
            sl[ax], src[ax] = 0, 1
            s[tuple(sl)] = s[tuple(src)]
        if both or ("+" + ch) in v.open:
            sl[ax], src[ax] = -1, -2
            s[tuple(sl)] = s[tuple(src)]
    n = 2 * sum(int((np.diff(s.astype(np.int8), axis=a) != 0).sum()) for a in range(3))
    return v.done(name, keep=float(min(1.0, max(0.02, tris / max(n, 1)))), relax=relax)


def _grain(v, c, scale, seed, bands=5, share=0.3, only="solid", where=True):
    """Swirling bands, like wood grain or strata."""
    return v.paint(c, (np.mod(v.noise(scale, seed) * bands, 1.0) < share) & where, only=only)


def _pnoise(v, seed, period=10.0, terms=7, kmax=4):
    """Smooth noise 0..1 that repeats every `period` metres in x and in z, so wall panels tile."""
    rng = np.random.default_rng(seed)
    out = 0
    for _ in range(terms):
        kx, kz = int(rng.integers(0, kmax + 1)), int(rng.integers(-kmax, kmax + 1))
        if kx == 0 and kz == 0:
            kx = 1
        out = out + np.sin(TAU * (kx * v.X + kz * v.Z) / period + rng.uniform(0, TAU)) / (1 + 0.3 * (abs(kx) + abs(kz)))
    out = out + 0 * v.Y
    return (out - out.min()) / (out.max() - out.min())


def _clump(v, at, r, seed, cols=("leaf_dark", "moss", "moss_light"), flat=0.8):
    """A rounded clump of leaves: a dark heart with lighter puffs toward the top."""
    rng = np.random.default_rng(seed)
    x, y, z = at
    v.ball(cols[0], at, (r, r * flat, r * 0.78))
    for i in range(9):
        a = i / 9 * TAU + rng.uniform(-0.3, 0.3)
        d = r * rng.uniform(0.5, 0.8)
        up = math.sin(a)
        c = cols[2] if up > 0.25 else cols[1] if up > -0.6 else cols[0]
        v.ball(c, (x + d * math.cos(a), y + 0.55 * d * flat * math.sin(a * 1.7 + i), z + 0.62 * d * up + r * 0.1), r * rng.uniform(0.36, 0.5))
    v.ball(cols[2], (x - r * 0.15, y - r * flat * 0.5, z + r * 0.45), r * 0.36)


def _stump(v, cx, cy, r_top, r_base, h, seed, lobes=6):
    """A stump with root lobes at the foot and a flat ringed top at z = h."""
    X, Y, Z = v.X, v.Y, v.Z
    R = np.hypot(X - cx, Y - cy)
    TH = np.arctan2(Y - cy, X - cx)
    flare = np.exp(-np.clip(Z, 0, None) / (h * 0.26))
    rad = r_top * (1 + 0.035 * np.sin(11 * TH)) + (r_base - r_top) * flare * (0.55 + 0.45 * np.cos(lobes * TH))
    body = (R < rad) & (Z < h)
    v.fill("bark", body)
    v.paint("bark_dark", body & (np.mod(TH * 7 / TAU * 3 + 0.25 * np.sin(Z * 5 + seed), 1.0) < 0.3))
    v.paint("wood", body & (v.noise(0.3, seed + 1) > 0.66))
    v.paint("moss", body & (v.noise(0.35, seed) > 0.6) & (Z < h * 0.55))
    v.paint("moss_light", body & (v.noise(0.22, seed + 2) > 0.7) & (Z < h * 0.3))
    topm = body & (Z > h - 2.2 * v.u) & (R < r_top * 0.9)
    v.paint("wood_light", topm)
    v.paint("wood", topm & (np.mod(R + 0.025 * np.sin(TH * 3 + seed), r_top * 0.24) < r_top * 0.08))
    v.paint("straw", topm & (R < r_top * 0.1))
    return v


# =================================================================================================
# tree: inside and around the great tree, and the park entrance
# =================================================================================================


@asset("lantern-hang", "tree", "hanging lantern; origin at the top of its chain, hangs 1.2 m down")
def lantern_hang():
    v = V((-0.28, -0.28, -1.2), (0.28, 0.28, 0), vpm=32)
    v.rod("bark", (0, 0, -0.07), (0, 0, 0), 0.1)
    for i in range(6):
        v.ball("gold", (0.014 * (-1) ** i, 0, -0.12 - i * 0.09), (0.045, 0.045, 0.062))
    v.rod("bark", (0, 0, -0.77), (0, 0, -0.62), 0.24, 0.04)  # a little roof
    v.paint("gold", (v.Z < -0.735))
    lantern(v, (0, 0, -0.7), 1.08)
    v.ball("gold", (0, 0, -1.18), 0.04)
    return _fin(v, "lantern-hang", 700)


@asset("lantern-post", "tree", "3 m leaning wooden lamp post with a lantern; stands behind the path at y 0.9")
def lantern_post():
    v = V((-0.7, 0.5, 0), (1.0, 1.3, 3.0))
    y = 0.9
    v.path("wood", [(-0.28, y, 0), (-0.14, y, 1.3), (0.04, y, 2.4), (0.25, y, 2.915), (0.58, y, 2.84)], 0.14, 0.075)
    _grain(v, "bark", 0.25, 3, bands=4, share=0.35)
    v.paint("wood_light", (v.noise(0.3, 8) > 0.68))
    v.ball("bark", (-0.28, y, 0.04), (0.3, 0.26, 0.2))
    v.ball("moss", (-0.45, y - 0.05, 0.02), (0.2, 0.2, 0.12))
    v.ball("moss_light", (-0.08, y + 0.1, 0.02), (0.16, 0.16, 0.1))
    for z in (0.95, 2.2):
        x = -0.28 + 0.14 * z / 1.3 if z < 1.3 else -0.14 + 0.18 * (z - 1.3) / 1.1
        v.rod("gold", (x, y, z - 0.05), (x, y, z + 0.05), 0.165)
    v.rod("gold", (0.58, y, 2.5), (0.58, y, 2.8), 0.06)
    v.rod("bark", (0.58, y, 2.44), (0.58, y, 2.58), 0.24, 0.05)
    lantern(v, (0.58, y, 2.5), 1.2)
    return _fin(v, "lantern-post", 1300)


@asset("string-lights", "tree", "a sagging string of 7 small lanterns, 6 m; origin at the left end, right end at x = 6, same height")
def string_lights():
    v = V((0, -0.2, -1.12), (6, 0.2, 0.1), vpm=32)

    def sag(x):
        return -0.65 * (1 - ((x - 3) / 3) ** 2)

    v.path("bark_dark", [(x, 0, sag(x)) for x in np.linspace(0, 6, 31)], 0.04)
    glows = ("gold_glow", "amber_glow", "moon_glow")
    for i in range(7):
        x = 0.75 + 0.75 * i
        z = sag(x)
        v.rod("bark", (x, 0, z - 0.1), (x, 0, z), 0.04)
        v.rod("bark", (x, 0, z - 0.13), (x, 0, z - 0.05), 0.13, 0.03)
        lantern(v, (x, 0, z - 0.08), 0.75, glow=glows[i % 3])
    v.ball("gold", (0.02, 0, 0), 0.085)
    v.ball("gold", (5.98, 0, 0), 0.085)
    return _fin(v, "string-lights", 1500)


def _shelf(v, x, z, r, cap, band, glow, seed):
    X, Y, Z = v.X, v.Y, v.Z
    v.ball("bark", (x, 0.63, z), (r * 0.85, 0.11, 0.2))  # the scar of bark it grows from
    v.ball("moss", (x - r * 0.4, 0.63, z + 0.12), (r * 0.4, 0.1, 0.12))
    d = np.sqrt(((X - x) / r) ** 2 + ((Y - 0.6) / (r * 0.8)) ** 2)
    wob = 1 + 0.08 * np.sin(np.arctan2(Y - 0.6, X - x) * 5 + seed)
    dd = np.clip(d / wob, 0, 1)
    top = z + 0.05 + 0.36 * r * (1 - dd**1.6)
    und = z - 0.04 - 0.22 * r * (1 - dd)
    inside = d < wob
    v.fill(glow, inside & (Z <= z) & (Z > und) & (dd < 0.86))
    capm = inside & (Z < top) & ((Z > z) | ((dd >= 0.86) & (Z > z - 0.05)))
    v.fill(cap, capm)
    v.fill(band, capm & (np.mod(dd * r + 0.02 * np.sin(X * 30), 0.15) < 0.06))
    v.fill("cream", capm & (dd > 0.93))


def _shelves(name, w, h, shelves, cols):
    v = V((-w / 2, 0, 0), (w / 2, 0.6, h), vpm=32)
    for i, (x, z, r) in enumerate(shelves):
        cap, band, glow = cols[i % len(cols)]
        _shelf(v, x, z, r, cap, band, glow, i * 2.1 + w)
    return _fin(v, name, 1300)


@asset("mushroom-shelf-a", "tree", "bracket fungi growing from a wall at y = 0.6; 1.2 m wide, glowing undersides")
def mushroom_shelf_a():
    c = (("rust_leaf", "barn", "gold_soft"), ("barn", "rust_leaf", "gold_soft"))
    return _shelves("mushroom-shelf-a", 1.2, 1.1, [(-0.15, 0.2, 0.42), (0.21, 0.55, 0.36), (-0.3, 0.86, 0.26)], c)


@asset("mushroom-shelf-b", "tree", "a small pair of bracket fungi on a wall at y = 0.6; 0.8 m wide")
def mushroom_shelf_b():
    c = (("dusk", "glass_blue", "mint"), ("lead", "dusk_haze", "mint"))
    return _shelves("mushroom-shelf-b", 0.8, 0.8, [(0.09, 0.17, 0.29), (-0.14, 0.52, 0.24)], c)


@asset("mushroom-shelf-c", "tree", "a long stair of bracket fungi on a wall at y = 0.6; 1.8 m wide")
def mushroom_shelf_c():
    c = (("amber", "rust_leaf", "amber_glass"), ("straw", "amber", "gold_soft"), ("rust_leaf", "bark", "amber_glass"))
    s = [(-0.52, 0.16, 0.35), (-0.03, 0.5, 0.4), (0.52, 0.22, 0.35), (0.45, 0.82, 0.3), (-0.45, 0.92, 0.3), (0.02, 1.2, 0.22)]
    return _shelves("mushroom-shelf-c", 1.8, 1.45, s, c)


@asset("stump", "tree", "a stump to stand on: 1.6 m wide, exactly 1.0 m tall, flat ringed top")
def stump():
    v = V((-0.8, -0.8, 0), (0.8, 0.8, 1.0))
    _stump(v, 0, 0, 0.6, 0.88, 1.0, 4)
    return _fin(v, "stump", 1300)


@asset("stump-board", "tree", 'the "Old Stump" notice board: a 2.5 m stump, 1.5 tall, pinned papers above; 3.5 m in all; behind the path')
def stump_board():
    v = V((-1.25, 0.6, 0), (1.25, 3.0, 3.5), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    _stump(v, 0, 1.8, 0.95, 1.32, 1.5, 9)
    for sx in (-1, 1):
        v.path("bark", [(sx * 0.72, 1.85, 1.3), (sx * 0.8, 1.87, 2.4), (sx * 0.74, 1.85, 3.3)], 0.1, 0.08)
    tilt = Z - 2.55 - 0.045 * X
    board = (abs(X) < 1.02) & (abs(tilt) < 0.66) & (Y > 1.76) & (Y < 1.94)
    v.fill("wood", board)
    v.fill("wood_light", board & (np.mod(tilt + 0.66, 0.33) > 0.05))
    v.fill("bark", (abs(X) < 1.08) & (abs(abs(tilt) - 0.66) < 0.07) & (Y > 1.72) & (Y < 1.98))
    # a little sagging roof over the board
    rt = 3.53 - 0.24 * abs(X) + 0.05 * np.cos(X * 5)
    v.fill("bark", (Z < rt) & (Z > rt - 0.16) & (Y > 1.5) & (Y < 2.2))
    v.fill("rust_leaf", (Z < rt) & (Z > rt - 0.16) & (Y > 1.5) & (Y < 2.2) & (np.mod(X + 0.1, 0.42) < 0.21))
    v.top("moss", 1, only=("bark", "rust_leaf"))
    papers = [(-0.6, 2.72, 0.26, 0.3, 0.12, "cream"), (0.02, 2.82, 0.22, 0.26, -0.08, "paper"), (0.62, 2.74, 0.25, 0.33, 0.06, "owl_belly"),
              (-0.42, 2.2, 0.3, 0.2, -0.1, "paper"), (0.36, 2.22, 0.24, 0.24, 0.16, "cream")]
    for i, (px, pz, pw, ph, a, c) in enumerate(papers):
        ca, sa = math.cos(a), math.sin(a)
        u = (X - px) * ca + (Z - pz) * sa
        w = -(X - px) * sa + (Z - pz) * ca
        m = (abs(u) < pw) & (abs(w) < ph) & (Y > 1.66) & (Y < 1.78)
        v.fill(c, m)
        v.fill("ink_grey", m & (np.mod(w + ph, 0.14) < 0.05) & (abs(u) < pw * 0.7) & (w < ph * 0.55) & (Y < 1.72))
        v.ball(("red", "gold", "sapphire")[i % 3], (px - ph * 0.8 * sa, 1.66, pz + ph * 0.8 * ca), 0.055)
    v.ball("gold_soft", (0.95, 1.7, 3.05), 0.09)
    return _fin(v, "stump-board", 2400)


@asset("turnstile", "tree", "1.2 m park turnstile in wood and gold; the posts stand behind the path, the arms reach into it")
def turnstile():
    v = V((-0.7, -0.3, 0), (0.7, 1.1, 1.2), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    v.box("wood_light", (-0.66, 0.5, 0), (0.6, 1.06, 0.07))
    v.rod("wood", (0.22, 0.8, 0), (0.2, 0.8, 1.0), 0.21, 0.18)
    v.paint("bark", (np.mod(np.arctan2(Y - 0.8, X - 0.2) * 6 / TAU, 1.0) < 0.22) & (X > -0.1))
    for z in (0.14, 0.92):
        v.rod("gold", (0.2, 0.8, z - 0.04), (0.2, 0.8, z + 0.04), 0.23)
    v.ball("gold", (0.2, 0.8, 1.04), (0.2, 0.2, 0.17))
    v.ball("gold_soft", (0.2, 0.8, 1.14), (0.08, 0.08, 0.07))
    # the hub and its three arms, splayed toward the path
    v.rod("gold", (0.2, 0.62, 0.72), (0.2, 0.4, 0.72), 0.1)
    v.ball("gold", (0.2, 0.4, 0.72), 0.12)
    for a in (90, 210, 330):
        tip = (0.2 + 0.44 * math.cos(math.radians(a)), -0.18, 0.72 + 0.42 * math.sin(math.radians(a)))
        v.rod("gold", (0.2, 0.4, 0.72), tip, 0.045, 0.04)
        v.ball("wood_light", tip, 0.065)
    # the far post of the lane
    v.rod("wood", (-0.5, 0.8, 0), (-0.47, 0.8, 0.86), 0.13, 0.11)
    v.paint("bark", (np.mod(Z, 0.3) < 0.07) & (X < -0.3) & (Z > 0.1))
    v.rod("gold", (-0.47, 0.8, 0.82), (-0.47, 0.8, 0.9), 0.14)
    v.ball("gold_soft", (-0.47, 0.8, 0.97), 0.085)
    return _fin(v, "turnstile", 1500)


@asset("ticket-booth", "tree", "ticket booth, 2.5 m wide, 3.5 m tall, lit window, sagging shingle roof; behind the path")
def ticket_booth():
    v = V((-1.25, 0.6, 0), (1.25, 2.7, 3.5))
    X, Y, Z = v.X, v.Y, v.Z
    lean = 0.035 * Z
    xb = X - lean
    body = (abs(xb) < 1.03 - 0.03 * Z) & (Y > 0.88) & (Y < 2.42) & (Z < 2.8)
    v.fill("wood", body)
    v.paint("wood_light", body & (np.mod(xb + 1.03, 0.36) < 0.2))
    v.paint("bark", body & (np.mod(xb + 1.03, 0.36) < 0.06))
    v.paint("bark", body & (Z < 0.22))
    v.paint("red", body & (Z > 0.3) & (Z < 1.05) & (np.mod(xb + 1.03, 0.72) < 0.36) & (np.mod(xb + 1.03, 0.36) > 0.06))
    # the lit window with an arched top
    wtop = 2.25 - 0.55 * xb**2
    win = (abs(xb) < 0.62) & (Z > 1.28) & (Z < wtop)
    v.fill("gold", (abs(xb) < 0.74) & (Z > 1.2) & (Z < wtop + 0.12) & (Y > 0.8) & (Y < 1.0))
    v.fill(None, win & (Y < 1.25))
    v.fill("amber_glow", win & (Y >= 1.25) & (Y < 1.45))
    v.fill("bark", win & (abs(xb) < 0.045) & (Y > 0.95) & (Y < 1.25))
    v.box("wood_light", (-0.85, 0.62, 1.1), (0.95, 1.05, 1.24))
    v.box("cream", (0.25, 0.66, 1.22), (0.6, 0.86, 1.3))
    # the roof: ridge along x, sagging in the middle, shingles in rows
    ridge = 3.52 - 0.32 * (1 - (X / 1.25) ** 2)
    s = abs(Y - 1.64)
    rt = ridge - 0.8 * s
    roof = (Z < rt) & ((Z > rt - 0.3) | ((Z > 2.7) & (abs(xb) < 1.0) & (Y > 0.88) & (Y < 2.42)))
    v.fill("bark", roof)
    row = np.floor(s / 0.27)
    v.paint("rust_leaf", roof & (np.mod(X + row * 0.21, 0.42) > 0.07) & (np.mod(s, 0.27) > 0.06))
    v.paint("thorn", roof & (np.mod(X + row * 0.21, 0.84) < 0.36) & (np.mod(s, 0.27) > 0.06) & (v.noise(0.5, 3) > 0.45))
    v.paint("moss", roof & (v.noise(0.45, 5) > 0.66) & (Z > rt - 0.15))
    v.fill("gold", (s < 0.14) & (Z < ridge + 0.02) & (Z > ridge - 0.14))
    # marquee bulbs under the eave
    for i in range(7):
        v.ball("gold_glow", (-0.9 + i * 0.3 + 0.035 * 2.5, 0.84, 2.52), 0.07)
    return _fin(v, "ticket-booth", 3000)


@asset("park-gate", "tree", 'entrance arch, 8 m wide, 7 m tall, opening 5 x 5 m clear, sign "OWL PARK", two lanterns; sits at y 0.7 to 1.6')
def park_gate():
    v = V((-4, 0.7, 0), (4, 1.6, 7), vpm=24)
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(0.7, 6)
    for sx in (-1, 1):
        cx = sx * 3.25
        front = 1.0 + 0.07 * np.sin((X - cx) * 11 + 1.6 * np.sin(Z * 0.9 + sx)) + 0.4 * (abs(X - cx) / 0.75) ** 4 - 0.12 * np.exp(-Z / 0.6)
        pil = (abs(X - cx) < 0.75) & (Y > front) & (Z < 5.3)
        v.fill("bark", pil)
        v.paint("bark_dark", pil & (np.sin((X - cx) * 11 + 1.6 * np.sin(Z * 0.9 + sx)) > 0.45))
        v.paint("wood", pil & (n > 0.6))
        v.paint("moss", pil & (v.noise(0.6, 9 + sx) > 0.66) & (Z < 3.2))
        foot = (abs(X - cx) < 0.75) & (Z < 0.75 + 0.12 * np.sin(X * 5)) & (Y > 0.74 + 0.3 * (abs(X - cx) / 0.75) ** 4 + 0.25 * np.clip(Z - 0.5, 0, 1))
        v.fill("stone", foot)
        v.paint("stone_dark", foot & ((np.mod(Z, 0.38) < 0.08) | (np.mod(X + np.floor(Z / 0.38) * 0.3, 0.6) < 0.08)))
        v.fill("wood_light", (abs(X - cx) < 0.75) & (Z > 4.72) & (Z < 5.0) & (Y > 0.88))
        v.fill("gold", (abs(X - cx) < 0.75) & (Z > 4.8) & (Z < 4.92) & (Y > 0.84))
        v.rod("bark", (cx, 1.1, 4.1), (cx, 0.86, 4.22), 0.09, 0.07)
        v.rod("bark", (cx, 0.87, 4.03), (cx, 0.87, 4.2), 0.2, 0.05)
        lantern(v, (cx, 0.87, 4.1), 1.28)
    # the header: an arched beam with a shingled crest
    top = 6.45 + 0.57 * np.cos(X / 4 * math.pi / 2)
    head = (Z >= 5.0) & (Z < top) & (Y > 0.92)
    v.fill("bark", head)
    v.paint("wood", head & (np.mod(v.noise(0.6, 12) * 5, 1.0) < 0.3))
    crest = (Z < top) & (Z > top - 0.3)
    v.fill("bark_dark", crest)
    v.fill("rust_leaf", crest & (np.mod(X + 4, 0.5) > 0.09))
    v.fill("thorn", crest & (np.mod(X + 4, 1.0) > 0.59))
    v.paint("moss", crest & (v.noise(0.5, 14) > 0.6) & (Z > top - 0.12))
    v.fill("gold", (abs(X) < 3.42) & (Z > 5.1) & (Z < 6.26) & (Y > 0.8))
    v.fill("navy", (abs(X) < 3.3) & (Z > 5.22) & (Z < 6.14) & (Y > 0.79))
    v.text("cream", "OWL PARK", -71 / 24, 5.25, 0.69, 0.83, px=3, align="left")
    v.fill(None, (abs(X) < 2.5) & (Z < 5.0))
    for sx in (-1, 1):  # owl-ear finials
        v.rod("gold", (sx * 3.6, 1.15, 6.5), (sx * 3.72, 1.15, 6.98), 0.16, 0.04, flat=False)
    return _fin(v, "park-gate", LANDMARK, relax=1)


@asset("trunk-wall", "tree", "the tree's inner wall: a 10 x 10 m backdrop panel (x -5..5, z 0..10, y 0..1); tiles left-right and up-down")
def trunk_wall():
    v = V((-5, 0, 0), (5, 1, 10), vpm=8, open="xz")
    X, Y, Z = v.X, v.Y, v.Z
    wob = 0.55 * np.sin(TAU * Z / 10 + 1.0) + 0.3 * np.sin(TAU * 3 * Z / 10 + 2.2) + 0.25 * np.sin(TAU * (2 * Z + X) / 10)
    ridge = np.abs(np.sin(math.pi * 7 * X / 10 + wob))  # seven ridges across, wandering as they climb
    pn = _pnoise(v, 3)
    front = 0.72 - 0.62 * ridge * (0.55 + 0.45 * pn)
    knots = [(-2.3, 6.6, 1.0), (2.6, 2.7, 0.8), (0.6, 8.6, 0.6)]
    kd = [np.hypot((X - kx) / 1.25, Z - kz) / kr for kx, kz, kr in knots]
    for d in kd:
        front = np.where(d < 1.4, np.minimum(front, 0.72 - 0.75 * np.exp(-((d - 0.85) ** 2) / 0.06)), front)
        front = np.where(d < 0.55, 0.8, front)
    v.fill("bark_dark", Y > front)
    v.paint("bark", (ridge * (0.55 + 0.45 * pn) > 0.42))
    v.paint("wood", (_pnoise(v, 8, kmax=5) > 0.72) & (ridge > 0.55))
    v.paint("moss", (_pnoise(v, 5) > 0.78) & (Y < 0.5))
    for d in kd:
        v.paint("bark", (d > 0.6) & (d < 1.15))
        v.paint("navy_deep", d < 0.6)
    return v.done_tris("trunk-wall", 9000, relax=3)


@asset("hollow-window", "tree", "a small lit hollow, 1 m wide, to dot over trunk-wall; origin at its centre, sits at y 0..0.4 proud of the wall behind")
def hollow_window():
    v = V((-0.5, 0, -0.6), (0.5, 0.4, 0.6), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    th = np.arctan2(Z, X)
    e = np.sqrt((X / 0.5) ** 2 + (Z / 0.6) ** 2)
    rim = abs(e - 0.76) / (0.24 + 0.03 * np.sin(th * 6))
    v.fill("bark", (rim < 1) & (Y > 0.4 - 0.4 * np.sqrt(np.clip(1 - rim**2, 0, 1))))
    v.paint("bark_dark", (np.mod(th * 9 / TAU + e * 2, 1.0) < 0.3))
    v.paint("wood", v.noise(0.2, 2) > 0.66)
    v.paint("moss", (v.noise(0.25, 4) > 0.55) & (Z > 0.25))
    v.fill("amber_glow", (e < 0.62) & (Y > 0.26))
    v.fill("gold_glow", (np.hypot(X / 0.5, (Z + 0.1) / 0.6) < 0.36) & (Y > 0.22))
    v.rod("bark", (-0.02, 0.2, -0.38), (0.03, 0.2, 0.36), 0.04)
    v.rod("bark", (-0.3, 0.2, 0.02), (0.3, 0.2, 0.08), 0.035)
    return _fin(v, "hollow-window", 800)


@asset("knothole-eye", "tree", 'the tree\'s lit almond "eye" knothole, 3 m wide; origin at its centre, proud of the wall behind (y 0..0.5)')
def knothole_eye():
    v = V((-1.5, 0, -0.95), (1.5, 0.5, 0.95), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    zt = Z - 0.09 * X
    a = np.clip(1 - (X / 1.5) ** 2, 0, 1)
    h_out = 0.92 * a**0.6
    f = abs(zt) / np.maximum(h_out, 1e-3)
    lids = (f < 1) & (Y > 0.5 - 0.5 * np.sqrt(np.clip(1 - f**2, 0, 1)) * (0.6 + 0.4 * a))
    v.fill("bark", lids)
    v.paint("bark_dark", (np.mod(f * 3.2 + 0.3 * np.sin(X * 3), 1.0) < 0.36))
    v.paint("wood", (v.noise(0.4, 3) > 0.64))
    v.paint("moss", (v.noise(0.4, 7) > 0.6) & (zt > 0.35))
    h_in = 0.5 * np.clip(1 - (X / 1.12) ** 2, 0, 1) ** 0.8
    inner = (abs(zt) < h_in) & (abs(X) < 1.12)
    v.fill(None, inner & (Y < 0.3))
    v.fill("amber_glow", inner & (Y >= 0.3))
    v.fill("gold_glow", (np.hypot(X, zt) < 0.42) & inner & (Y >= 0.24))
    v.fill("bark_dark", ((X / 0.11) ** 2 + (zt / 0.36) ** 2 < 1) & (Y >= 0.18))
    v.fill("gold", (abs(abs(zt) - h_in) < 0.05) & (abs(X) < 1.12) & (Y > 0.1) & (Y < 0.3), only="bark")
    return _fin(v, "knothole-eye", 1500)


@asset("gold-seam", "tree", "a 10 m tall wavering glowing gold seam, 0.3 m wide; origin at the bottom; tiles up-down")
def gold_seam():
    v = V((-0.15, 0, 0), (0.15, 0.2, 10), vpm=16, open="z")
    X, Y, Z = v.X, v.Y, v.Z
    cx = 0.045 * np.sin(TAU * 3 * Z / 10) + 0.022 * np.sin(TAU * 8 * Z / 10 + 1)
    hw = 0.072 + 0.018 * np.sin(TAU * 5 * Z / 10 + 2)
    m = (abs(X - cx) < hw) & (Y < 0.13)
    v.fill("gold_glow", m)
    v.paint("gold_soft", m & (np.mod(Z + 0.3 * np.sin(TAU * 2 * Z / 10), 1.25) < 0.3))
    v.paint("amber_glow", m & (np.mod(Z, 2.5) < 0.2))
    return _fin(v, "gold-seam", 500, relax=1)


def _vine(name, length, seed, strands):
    rng = np.random.default_rng(seed)
    v = V((-0.6, -0.3, -length), (0.6, 0.3, 0), vpm=24)
    leaves = ("moss_light", "moss", "emerald", "moss_light", "leaf_dark", "moss")
    v.ball("bark", (0, 0, 0), (0.22 + 0.08 * strands, 0.16, 0.1))
    for k in range(strands):
        L = length * (1 - 0.32 * k)
        ph = rng.uniform(0, TAU)
        x0 = (k - (strands - 1) / 2) * 0.24
        npts = int(L * 5) + 2
        pts = [(x0 + 0.12 * math.sin(t * L * 2.3 + ph) * min(1, t * 4), 0.07 * math.cos(t * L * 1.9 + ph), -t * L) for t in np.linspace(0, 1, npts)]
        v.path("bark" if k % 2 else "wood", pts, 0.06, 0.045)
        for i in range(1, npts - 1):
            px, py, pz = pts[i]
            side = 1 if (i + k) % 2 else -1
            c = "amber" if (i * 7 + k * 3 + seed) % 11 == 0 else leaves[(i + 2 * k) % len(leaves)]
            # a heart-shaped leaf hanging tip down
            v.ball(c, (px + side * 0.17, py - 0.04, pz - 0.02), (0.15, 0.06, 0.1))
            v.ball(c, (px + side * 0.2, py - 0.04, pz - 0.12), (0.095, 0.055, 0.1))
            v.ball(c, (px + side * 0.22, py - 0.04, pz - 0.21), (0.05, 0.05, 0.06))
            if (i + k) % 5 == 0:
                v.ball("gold_soft", (px - side * 0.08, py - 0.07, pz - 0.03), 0.06)
        px, py, pz = pts[-1]
        v.ball(leaves[k], (px, py, pz - 0.02), (0.1, 0.055, 0.1))
    return _fin(v, name, 1500)


@asset("vine", "tree", "hanging vine with leaves, 4 m long; origin at the top")
def vine():
    return _vine("vine", 4.0, 5, 2)


@asset("vine-b", "tree", "a shorter hanging vine, 2.5 m; origin at the top")
def vine_b():
    return _vine("vine-b", 2.5, 11, 1)


@asset("branch-limb", "tree", "an 8 m tapering, bending branch with leaf clumps (decor); origin at the thick end")
def branch_limb():
    v = V((0, -1.2, -1.3), (8, 1.2, 2.5), vpm=12)
    main = [(-0.1, 0, 0), (1.5, 0, 0.28), (3.0, 0.1, 0.12), (4.5, 0, 0.55), (6.0, -0.1, 0.95), (7.2, 0, 0.82), (7.97, 0, 1.12)]
    v.path("bark", main, 0.5, 0.11)
    twigs = [((2.2, 0, 0.3), (2.7, 0.2, 1.0), (3.1, 0.3, 1.55)), ((4.4, 0, 0.5), (5.0, -0.3, -0.1), (5.3, -0.35, -0.55)), ((6.1, 0, 0.9), (6.5, 0.2, 1.5), (6.7, 0.25, 1.8)), ((1.1, 0, 0.1), (1.5, -0.3, -0.45), (1.6, -0.35, -0.7))]
    for t in twigs:
        v.path("bark", list(t), 0.17, 0.1)
    _grain(v, "bark_dark", 0.5, 4, bands=6, share=0.3)
    v.paint("wood", v.noise(0.5, 6) > 0.6)
    v.paint("moss", v.exposed(2, 1, 1) & (v.noise(0.7, 9) > 0.56))
    v.paint("moss_light", (v.noise(0.4, 13) > 0.6), only="moss")
    _clump(v, (3.2, 0.3, 1.75), 0.72, 1)
    _clump(v, (5.35, -0.35, -0.7), 0.55, 2, cols=("leaf_dark", "moss", "amber"))
    _clump(v, (6.75, 0.25, 1.95), 0.5, 3)
    _clump(v, (1.65, -0.35, -0.8), 0.45, 4)
    _clump(v, (7.5, 0, 1.3), 0.42, 5, cols=("moss", "moss_light", "moss_light"))
    for p in ((2.75, -0.2, 1.35), (5.7, -0.75, -0.75), (6.4, -0.1, 1.75)):
        v.ball("gold_soft", p, 0.1)
    return _fin(v, "branch-limb", 2000)


@asset("broken-limb", "tree", "the tree's broken limb stub, 3 m; origin at the thick end")
def broken_limb():
    v = V((0, -0.85, -0.8), (3, 0.85, 1.25))
    X, Y, Z = v.X, v.Y, v.Z
    v.path("bark", [(-0.2, 0, 0), (1.2, 0, 0.12), (2.25, 0, 0.02)], 0.66, 0.5)
    _grain(v, "bark_dark", 0.4, 3, bands=6, share=0.32)
    v.paint("wood", v.noise(0.35, 5) > 0.68)
    v.paint("moss", v.exposed(2, 1, 2) & (v.noise(0.5, 11) > 0.5))
    v.paint("moss_light", v.noise(0.3, 8) > 0.58, only="moss")
    # the break: pale torn wood and splinters
    v.paint("wood_light", X > 2.2 + 0.25 * v.noise(0.3, 2))
    rng = np.random.default_rng(4)
    for i in range(9):
        a = rng.uniform(0, TAU)
        r = rng.uniform(0.05, 0.36)
        y, z = r * math.cos(a), r * math.sin(a) + 0.02
        ln = 3.03 if i == 0 else rng.uniform(2.55, 2.95)
        v.rod("straw" if i % 3 == 0 else "wood_light", (2.2, y, z), (ln, y * 1.25, z * 1.25 + 0.03), 0.17, 0.035, flat=False)
    v.paint("amber", (X > 2.4) & (v.noise(0.15, 6) > 0.62), only=("wood_light", "straw"))
    # a last living twig
    v.path("bark", [(1.3, 0.1, 0.6), (1.5, 0.15, 0.95), (1.75, 0.1, 1.1)], 0.1, 0.07)
    v.ball("moss_light", (1.9, 0.1, 1.12), (0.2, 0.09, 0.11))
    v.ball("moss", (1.52, 0.2, 1.08), (0.1, 0.09, 0.15))
    # a bracket fungus on the flank
    v.ball("rust_leaf", (0.8, -0.6, 0.0), (0.26, 0.2, 0.07))
    v.ball("gold_soft", (0.8, -0.6, -0.05), (0.22, 0.17, 0.05))
    return _fin(v, "broken-limb", 1500)


@asset("hollow-arch", "tree", "arched doorway in bark: opening exactly 4 m wide x 4.5 m tall (round top), frame 0.9 thick, glowing rim; y -1.2..1.2")
def hollow_arch():
    v = V((-2.9, -1.2, 0), (2.9, 1.2, 5.4), vpm=12)
    X, Y, Z = v.X, v.Y, v.Z
    dist = np.where(Z < 2.5, abs(X) - 2.0, np.hypot(X, Z - 2.5) - 2.0) + 0 * Y
    ang = np.where(Z < 2.5, Z * 0.5 * np.sign(X), np.arctan2(X, Z - 2.5) * 2.0 + 1.25 * np.sign(X)) + 0 * Y
    thick = 0.8 + 0.12 * np.sin(ang * 3.1 + 0.5) + 0.25 * np.exp(-Z / 0.5)
    half = 1.2 * np.sqrt(1 - 0.5 * np.clip((dist - 0.3) / 0.6, 0, 1) ** 2)
    frame = (dist >= 0) & (dist < thick) & (abs(Y) < half)
    v.fill("bark", frame)
    v.paint("bark_dark", frame & (np.mod(dist * 2.6 + 0.4 * np.sin(ang * 2), 1.0) < 0.32))
    v.paint("wood", frame & (v.noise(0.5, 4) > 0.6))
    v.paint("moss", v.exposed(2, 1, 2) & (v.noise(0.8, 7) > 0.5))
    v.paint("moss_light", v.noise(0.5, 7) > 0.6, only="moss")
    v.paint("moss", frame & (v.noise(0.6, 11) > 0.62) & (Z < 1.0))
    # the lining: pale heartwood, lit along its edges and in veins
    v.paint("wood_light", frame & (dist < 0.18))
    v.paint("gold_soft", frame & (dist < 0.18) & ((abs(Y) > 0.92) | (np.mod(ang + 0.25 * np.sin(Y * 4), 0.7) < 0.14)))
    v.paint("gold_glow", frame & (dist < 0.1) & (abs(Y) > 1.02) & (np.mod(ang, 1.4) < 0.5))
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        v.ball("bark", (sx * 2.5, sy * 0.8, 0.1), (0.4, 0.4, 0.35), only="air")
    v.fill(None, dist < 0)
    v.ball("moss", (-2.6, -0.95, 0.3), (0.3, 0.25, 0.2), only="solid")
    return _fin(v, "hollow-arch", LANDMARK)


# =================================================================================================
# clearing: the storybook dusk treehouse clearing
# =================================================================================================


@asset("treehouse", "clearing", "treehouse on crooked stilts, 6 m wide, 7 m tall, lit amber windows, ladder, sagging roof; behind the path (y 0.8..3)")
def treehouse():
    v = V((-3, 0.8, 0), (3, 3.0, 7))
    X, Y, Z = v.X, v.Y, v.Z
    legs = [(-2.0, 1.3), (2.05, 1.28), (-1.9, 2.7), (2.1, 2.66)]
    for i, (x, y) in enumerate(legs):
        k = (-1) ** i
        v.path("bark", [(x + 0.3 * k, y, 0), (x - 0.12 * k, y, 1.3), (x + 0.03 * k, y, 2.7)], 0.18, 0.14)
    v.rod("wood", (-2.1, 1.3, 0.5), (1.95, 1.3, 2.35), 0.09)
    v.rod("wood", (2.2, 1.28, 0.6), (-0.3, 1.3, 1.5), 0.09)
    _grain(v, "bark_dark", 0.35, 2, bands=5, share=0.3)
    # deck
    dz = Z - 2.74 - 0.03 * X
    deck = (abs(X) < 2.72) & (Y > 1.02) & (Y < 2.96) & (abs(dz) < 0.13)
    v.fill("wood", deck)
    v.fill("wood_light", deck & (np.mod(X + 2.72, 0.42) > 0.08))
    # cabin, leaning
    lean = 0.045 * (Z - 2.85)
    xc = X - lean
    cab = (abs(xc) < 2.0 - 0.035 * (Z - 2.85)) & (Y > 1.38) & (Y < 2.86) & (Z > 2.8) & (Z < 5.35)
    v.fill("wood", cab)
    v.fill("barn", cab & (np.mod(Z - 2.85, 0.42) > 0.09))
    v.paint("sand_owl", cab & (v.noise(0.6, 5) > 0.55), only="barn")
    v.fill("bark", cab & (abs(abs(xc) - 1.92) < 0.1))
    for wx in (-1.2, 1.22):
        wt = 4.5 - 0.9 * (xc - wx) ** 2
        v.fill("wood_light", (abs(xc - wx) < 0.5) & (Z > 3.48) & (Z < wt + 0.14) & (Y > 1.3) & (Y < 1.5))
        win = (abs(xc - wx) < 0.38) & (Z > 3.6) & (Z < wt)
        v.fill(None, win & (Y < 1.5))
        v.fill("amber_glow", win & (Y >= 1.5) & (Y < 1.7))
        v.fill("bark", win & ((abs(xc - wx) < 0.045) | (abs(Z - 4.0) < 0.045)) & (Y > 1.36) & (Y < 1.5))
        v.box("wood_light", (wx - 0.55 + 0.03, 1.2, 3.45), (wx + 0.55 + 0.03, 1.5, 3.57))
    door = (abs(xc - 0.05) < 0.4) & (Z > 2.87) & (Z < 4.42 - 0.9 * (xc - 0.05) ** 2)
    v.fill("bark", door & (Y > 1.3) & (Y < 1.5))
    v.fill("rust_leaf", door & (abs(xc - 0.05) < 0.31) & (Z < 4.3 - 0.9 * (xc - 0.05) ** 2) & (Y > 1.27) & (Y < 1.5))
    v.ball("amber_glow", (0.05 + 0.045 * 1.1, 1.3, 3.95), (0.13, 0.08, 0.13))
    v.ball("gold", (0.3 + 0.03, 1.27, 3.5), 0.065)
    # roof: ridge along x, sagging, slate shingles
    ridge = 6.82 - 0.4 * (1 - (X / 3) ** 2)
    s = abs(Y - 2.1)
    rt = ridge - 1.08 * s
    roof = (Z < rt) & ((Z > rt - 0.34) | ((Z > 5.3) & (abs(xc) < 1.85) & (Y > 1.38) & (Y < 2.86)))
    v.fill("stone_dark", roof)
    row = np.floor(s / 0.3)
    v.paint("dusk", roof & (np.mod(X + row * 0.25, 0.5) > 0.08) & (np.mod(s, 0.3) > 0.07))
    v.paint("dusk_haze", roof & (np.mod(X + row * 0.25, 1.0) < 0.42) & (np.mod(s, 0.3) > 0.07) & (v.noise(0.6, 3) > 0.5))
    v.paint("moss", roof & (v.noise(0.6, 8) > 0.64) & (Z > rt - 0.17))
    v.fill("bark", (s < 0.15) & (Z < ridge + 0.03) & (Z > ridge - 0.16))
    # crooked chimney with an ember glow
    v.path("stone", [(1.75, 2.35, 5.9), (1.85, 2.35, 6.5), (1.78, 2.35, 6.86)], 0.26, 0.22)
    v.paint("stone_dark", (np.mod(Z, 0.3) < 0.08) & (X > 1.4) & (Z > 5.9), only="stone")
    v.ball("amber_glow", (1.78, 2.35, 6.98), (0.15, 0.15, 0.08))
    # ladder
    for lx in (-0.82, -0.3):
        v.rod("wood_light", (lx - 0.12, 0.9, 0), (lx, 0.93, 3.1), 0.065)
    for i in range(7):
        z = 0.3 + i * 0.4
        v.rod("straw", (-0.95 + 0.04 * z, 0.92, z), (-0.28 + 0.04 * z, 0.92, z + 0.03), 0.06)
    # rail and a lantern
    for px in (-2.6, -1.6, 0.9, 1.75, 2.6):
        v.rod("wood_light", (px, 1.1, 2.8 + 0.03 * px), (px + 0.03, 1.1, 3.42 + 0.03 * px), 0.06)
    v.rod("wood_light", (-2.65, 1.1, 3.36), (-1.55, 1.1, 3.39), 0.06)
    v.rod("wood_light", (0.85, 1.1, 3.45), (2.65, 1.1, 3.5), 0.06)
    v.rod("bark", (2.62, 0.98, 4.95), (2.62, 0.98, 5.2), 0.06)
    lantern(v, (2.62, 0.98, 4.98), 1.1, glow="amber_glow")
    v.ball("moss", (-1.7, 1.3, 0.05), (0.4, 0.3, 0.16))
    v.ball("moss_light", (2.3, 1.3, 0.05), (0.35, 0.3, 0.14))
    return _fin(v, "treehouse", LANDMARK)


@asset("jetty", "clearing", "wooden fishing jetty, exactly 6 m long (x 0..6, origin at the left end), top at z = 0, 2 m deep (y -1..1), posts 2 m down")
def jetty():
    v = V((0, -1, -2), (6, 1, 0))
    X, Y, Z = v.X, v.Y, v.Z
    for i, x in enumerate((0.4, 2.2, 4.0, 5.6)):
        for sy in (-1, 1):
            k = 0.08 * (-1) ** i * sy
            v.path("bark", [(x, sy * 0.8, -0.1), (x + k, sy * 0.82, -1.0), (x + 2 * k, sy * 0.8, -2.05)], 0.14, 0.12)
        v.rod("wood", (x, -0.8, -0.5), (x + 0.05, 0.8, -1.2), 0.07)
    v.paint("bark_dark", (np.mod(Z, 0.45) < 0.12) & (Z < -0.3))
    v.paint("moss", (Z < -1.3 + 0.3 * v.noise(0.4, 3)))
    v.paint("moss_light", (Z < -1.6) & (v.noise(0.25, 5) > 0.55))
    for sy in (-0.8, 0.8):
        v.box("bark", (0, sy - 0.09, -0.34), (6, sy + 0.09, -0.15))
    deck = (Z > -0.19) & (abs(Y) < 1.0 - 0.05 * (np.mod(np.floor(X / 0.375), 3) == 1))
    v.fill("wood", deck)
    plank = np.floor(X / 0.375)
    v.fill("wood_light", deck & (np.mod(X, 0.375) > 0.07))
    v.paint("sand_owl", deck & (np.mod(plank, 4) == 2), only="wood_light")
    v.paint("barn", deck & (np.mod(plank, 7) == 5), only="wood_light")
    _grain(v, "wood", 0.5, 9, bands=4, share=0.14, only=("wood_light", "sand_owl", "barn"))
    return _fin(v, "jetty", 1800, relax=1)


@asset("fishing-rod", "clearing", "a fishing rod propped on a forked stand, with its line and float; 2 m")
def fishing_rod():
    v = V((-0.95, -0.25, 0), (1.05, 0.25, 2.0), vpm=32)
    v.path("bark", [(-0.25, 0, 0), (-0.22, 0, 0.42)], 0.05, 0.045)
    v.rod("bark", (-0.22, 0, 0.4), (-0.12, 0.08, 0.68), 0.04, 0.03, flat=False)
    v.rod("bark", (-0.22, 0, 0.4), (-0.32, -0.08, 0.68), 0.04, 0.03, flat=False)
    v.ball("moss", (-0.25, 0, 0.02), (0.14, 0.12, 0.06))
    butt, tip = (-0.9, 0, 0.06), (0.9, 0, 1.94)
    v.rod("straw", butt, tip, 0.05, 0.032, flat=False)
    v.rod("red", butt, (-0.62, 0, 0.35), 0.062)
    v.ball("gold", (-0.52, -0.06, 0.48), (0.08, 0.06, 0.08))
    for t in (0.45, 0.7, 0.9):
        v.ball("gold", tuple(butt[i] + (tip[i] - butt[i]) * t for i in range(3)), 0.045)
    v.path("cream", [(0.9, 0, 1.94), (0.95, 0, 1.2), (0.93, 0, 0.3)], 0.032)
    v.ball("red", (0.93, 0, 0.22), (0.085, 0.085, 0.1))
    v.ball("cream", (0.93, 0, 0.14), (0.08, 0.08, 0.09))
    v.rod("pupil", (0.93, 0, 0.0), (0.93, 0, 0.1), 0.032)
    return _fin(v, "fishing-rod", 900)


@asset("reeds", "clearing", "a 1.5 m clump of reeds and cattails")
def reeds():
    v = V((-0.55, -0.4, 0), (0.55, 0.4, 1.5), vpm=32)
    rng = np.random.default_rng(7)
    cols = ("moss_light", "moss", "straw", "moss_light", "leaf_dark")
    for i in range(12):
        x, y = rng.uniform(-0.25, 0.25), rng.uniform(-0.2, 0.2)
        h = rng.uniform(0.7, 1.3) if i else 1.4
        bx, by = rng.uniform(-0.28, 0.28), rng.uniform(-0.15, 0.15)
        v.path(cols[i % 5], [(x, y, 0), (x + bx * 0.3, y + by * 0.3, h * 0.5), (x + bx, y + by, h)], 0.048, 0.028)
        if i % 3 == 0:
            v.ball("bark", (x + bx, y + by, h - 0.02), (0.058, 0.058, 0.15))
            v.rod("straw", (x + bx, y + by, h + 0.1), (x + bx, y + by, min(h + 0.24, 1.52)), 0.03)
    v.ball("moss", (0, 0, 0.02), (0.36, 0.28, 0.1))
    return _fin(v, "reeds", 1300)


@asset("lily-pads", "clearing", "a 2 m patch of lily pads lying at z = 0, with two flowers")
def lily_pads():
    v = V((-1, -1, -0.04), (1, 1, 0.3), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    pads = [(-0.62, -0.1, 0.37, 0.4), (0.1, 0.45, 0.42, 2.2), (0.6, -0.3, 0.38, 4.0), (-0.15, -0.6, 0.3, 1.2), (-0.55, 0.62, 0.28, 5.2), (0.68, 0.55, 0.26, 3.0), (0.08, -0.12, 0.22, 0.2)]
    for i, (x, y, r, a) in enumerate(pads):
        d = np.hypot(X - x, Y - y)
        th = np.mod(np.arctan2(Y - y, X - x) - a, TAU)
        m = (d < r) & (Z > -0.035) & (Z < 0.035) & ~((th < 0.42) & (d > r * 0.12))
        v.fill(("moss", "moss_light", "emerald")[i % 3] if i != 3 else "moss_light", m)
        v.fill("leaf_dark", m & (np.mod(th * 7 / TAU, 1.0) < 0.14) & (d > r * 0.2) & (Z > 0))
        v.fill("moss_light", m & (d > r - 0.05) & (Z > 0), only=("moss", "emerald"))
    for (x, y), c in (((0.1, 0.45), "rose"), ((-0.62, -0.1), "cream")):
        for k in range(6):
            a = k * TAU / 6
            v.rod(c, (x, y, 0.04), (x + 0.15 * math.cos(a), y + 0.15 * math.sin(a), 0.2), 0.045, 0.03, flat=False)
        v.ball("gold_soft", (x, y, 0.12), 0.06)
    return _fin(v, "lily-pads", 1500)


@asset("idol-great-horned", "clearing", "guardian idol of a great horned owl in wood and stone, 6 m tall, 4 m wide, glowing amber eyes, mossy; behind the path (y 0.8..3.5)")
def idol_great_horned():
    v = V((-2, 0.8, 0), (2, 3.5, 6), vpm=14)
    X, Y, Z = v.X, v.Y, v.Z
    yc = 2.15
    # plinth of fitted stones
    v.fill("stone_dark", (Z < 0.34))
    v.fill("stone", (Z >= 0.34) & (Z < 0.62) & (abs(X) < 1.8) & (Y > 0.98) & (Y < 3.3))
    v.paint("navy_deep", (np.mod(X + np.floor(Z / 0.31) * 0.35, 0.8) < 0.1) & (Z < 0.62))
    # body, head, tufts, wings
    v.ball("stone", (0, yc, 2.5), (1.62, 1.22, 2.05))
    v.ball("wood", (0, yc - 0.05, 4.35), (1.5, 1.14, 1.16))
    for sx in (-1, 1):
        v.rod("bark", (sx * 0.8, yc, 4.95), (sx * 1.42, yc + 0.1, 6.06), 0.45, 0.07, flat=False)
        v.ball("bark", (sx * 1.52, yc + 0.15, 2.6), (0.5, 0.9, 1.6))
    wing = (abs(X) > 1.0) & (Z < 4.2) & (Z > 0.62)
    v.paint("wood", wing & (np.mod(Z + 0.35 * abs(X), 0.46) < 0.16), only="bark")
    # the join of wood and stone: a carved collar
    v.paint("wood", (Z > 3.25 + 0.12 * np.sin(X * 7)), only="stone")
    v.paint("gold", (abs(Z - 3.3 - 0.12 * np.sin(X * 7)) < 0.09) & (Y < yc - 0.2) & (abs(X) < 1.25), only=("stone", "wood"))
    # breast feathers carved in rows of scallops
    bel = ((X / 1.05) ** 2 + ((Z - 2.05) / 1.25) ** 2 < 1) & (Y < yc - 0.3)
    v.paint("heron", bel, only="stone")
    rowz = np.floor(Z / 0.42)
    sc = np.mod(X + rowz * 0.25, 0.5) - 0.25
    v.paint("stone_dark", bel & (np.mod(Z, 0.42) < 0.13 + 1.6 * sc**2), only="heron")
    v.paint("stone_dark", (v.noise(0.7, 4) > 0.6), only="stone")
    # face: two pale discs, gold-ringed glowing eyes, kind brows
    for sx in (-1, 1):
        ex, ez = sx * 0.62, 4.42
        d = np.hypot(X - ex, Z - ez)
        v.paint("wood_light", (d < 0.66) & (Y < yc - 0.35), only="wood")
        v.paint("owl_accent", (d > 0.52) & (d < 0.66) & (np.mod(np.arctan2(Z - ez, X - ex) * 14 / TAU, 1.0) < 0.5) & (Y < yc - 0.35), only="wood_light")
        v.ball("gold", (ex, 1.14, ez), (0.4, 0.22, 0.4))
        v.ball("amber_glow", (ex, 1.08, ez), (0.31, 0.22, 0.31))
        v.ball("pupil", (ex - sx * 0.04, 0.95, ez - 0.02), (0.19, 0.14, 0.2))
        # feet
        for t in (-0.2, 0, 0.2):
            v.rod("gold", (sx * 0.6 + t, 1.25, 0.72), (sx * 0.6 + t * 1.5, 0.86, 0.66), 0.11, 0.06, flat=False)
    v.rod("gold", (0, 1.02, 4.22), (0, 0.84, 3.8), 0.22, 0.05, flat=False)
    v.ball("amber_glow", (0, yc - 1.2, 2.9), (0.17, 0.1, 0.2))  # a heart of amber in the breast
    # moss where the sky touches, and creeping up from the ground
    mossn = v.noise(0.6, 7)
    v.fill("moss", v.exposed(2, 1, 2) & (mossn > 0.52), only=("wood", "bark", "stone", "stone_dark"))
    v.paint("moss_light", v.exposed(2, 1, 1) & (mossn > 0.64), only="moss")
    v.paint("moss", (v.noise(0.5, 12) > 0.6) & (Z < 1.5) & (Z > 0.3), only=("stone", "stone_dark", "bark", "navy_deep"))
    return _fin(v, "idol-great-horned", LANDMARK)


@asset("heron-straw-hat", "clearing", "a heron in a straw hat, standing, 1.8 m (a story prop)")
def heron_straw_hat():
    v = V((-0.6, -0.4, 0), (0.75, 0.4, 1.8), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    for sy, dx in ((-0.06, 0.0), (0.06, 0.07)):
        v.path("sand_owl", [(dx - 0.02, sy, 0.03), (dx + 0.02, sy, 0.42), (dx - 0.06, sy, 0.8)], 0.034)
        v.ball("sand_owl", (dx + 0.02, sy, 0.42), 0.045)
        for ty in (-0.07, 0, 0.07):
            v.rod("sand_owl", (dx - 0.02, sy, 0.03), (dx + 0.15, sy + ty, 0.025), 0.03, flat=False)
    v.ball("heron", (-0.08, 0, 0.98), (0.33, 0.18, 0.21))
    v.ball("heron", (0.1, 0, 1.03), (0.17, 0.14, 0.17))
    v.ball("lead", (-0.4, 0, 0.9), (0.17, 0.08, 0.08))
    v.paint("cream", (X > 0.02) & (Z < 1.02) & (abs(Y) < 0.13), only="heron")
    v.paint("ink_grey", (X > 0.02) & (Z < 1.0) & (np.mod(Z + X, 0.09) < 0.03) & (abs(Y) < 0.1), only="cream")
    for sy in (-1, 1):
        v.ball("stone", (-0.13, sy * 0.14, 1.0), (0.27, 0.06, 0.15))
        v.ball("lead", (-0.3, sy * 0.13, 0.93), (0.17, 0.055, 0.09))
    v.path("heron", [(0.16, 0, 1.08), (0.3, 0, 1.2), (0.2, 0, 1.33), (0.22, 0, 1.44)], 0.07, 0.058)
    v.paint("cream", (X > 0.22) & (Z > 1.1) & (Z < 1.38), only="heron")
    v.ball("cream", (0.25, 0, 1.47), (0.115, 0.09, 0.09))
    v.rod("amber", (0.3, 0, 1.47), (0.7, 0, 1.4), 0.05, 0.014, flat=False)
    v.rod("navy", (0.24, 0, 1.5), (0.0, 0, 1.36), 0.035, 0.022, flat=False)
    for sy in (-1, 1):
        v.ball("navy", (0.25, sy * 0.07, 1.51), (0.07, 0.03, 0.03))
        v.ball("pupil", (0.3, sy * 0.078, 1.495), 0.024)
    # the straw hat: a wide cone with a red band
    R = np.hypot(X - 0.22, Y)
    cone = 1.53 + 0.29 * np.clip(1 - R / 0.4, 0, 1) + 0 * Z
    v.fill("straw", (Z > 1.53 - 0.02) & (Z < cone + 0.045) & (Z > cone - 0.08) & (R < 0.4))
    v.paint("sand_owl", (np.mod(R, 0.1) < 0.035) & (Z > 1.5), only="straw")
    v.paint("red", (R > 0.1) & (R < 0.16) & (Z > 1.6), only=("straw", "sand_owl"))
    return _fin(v, "heron-straw-hat", 1500)


@asset("leaf-pile", "clearing", "a 1.5 m wide pile of amber leaves, 0.6 tall")
def leaf_pile():
    v = V((-0.75, -0.6, 0), (0.75, 0.6, 0.6), vpm=24)
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(0.22, 3)
    hgt = 0.62 * np.clip(1 - (X / 0.78) ** 2 - (Y / 0.62) ** 2, 0, 1) ** 0.6 * (0.7 + 0.5 * n)
    v.fill("rust_leaf", Z < hgt)
    cols = ("amber", "straw", "red", "barn", "rust_leaf", "amber", "thorn", "straw")
    rng = np.random.default_rng(5)
    for i in range(70):  # leaves lying every which way over the heap
        a, d = rng.uniform(0, TAU), rng.uniform(0, 1) ** 0.6
        x, y = 0.7 * d * math.cos(a), 0.54 * d * math.sin(a)
        z = 0.6 * max(0.0, 1 - (x / 0.78) ** 2 - (y / 0.62) ** 2) ** 0.6 * 0.92
        la = rng.uniform(0, math.pi)
        ln = rng.uniform(0.08, 0.13)
        dx, dy = ln * math.cos(la), ln * math.sin(la)
        tilt = rng.uniform(-0.05, 0.05)
        v.rod(cols[i % 8], (x - dx, y - dy, z - tilt), (x + dx, y + dy, z + tilt + 0.02), 0.055, 0.03, flat=False)
    v.rod("amber", (0.0, 0, 0.5), (0.06, 0, 0.62), 0.07, 0.03, flat=False)
    v.fill(None, Z > 0.6)
    for x, y, c in ((0.66, -0.3, "amber"), (-0.66, 0.1, "straw"), (0.3, -0.54, "red"), (-0.4, -0.5, "amber")):
        v.ball(c, (x, y, 0.025), (0.09, 0.07, 0.045))
    return _fin(v, "leaf-pile", 1400)


def _bush(name, w, h, seed, cols, dots):
    v = V((-w / 2, -w * 0.32, 0), (w / 2, w * 0.32, h), vpm=16)
    rng = np.random.default_rng(seed)
    X, Y, Z = v.X, v.Y, v.Z
    dome = (X / (w / 2)) ** 2 + (Y / (w * 0.32)) ** 2 + (Z / h) ** 2
    v.fill(cols[0], dome < 0.72)
    for i in range(26):  # puffs of leaves over a dark heart
        a, b = rng.uniform(0, TAU), rng.uniform(0.08, 1.0)
        r = h * rng.uniform(0.16, 0.26)
        x = (w / 2 - r) * math.cos(a) * math.sqrt(1 - b * b)
        y = (w * 0.32 - r * 0.7) * math.sin(a) * math.sqrt(1 - b * b)
        z = max(r * 0.7, (h - r) * b)
        c = cols[2] if b > 0.55 and rng.random() < 0.75 else cols[1] if b > 0.25 else cols[0]
        v.ball(c, (x, y, z), (r, r * 0.8, r))
    v.ball(cols[2], (0.05 * w, 0, h - h * 0.2), (h * 0.24, h * 0.2, h * 0.21))
    for sx in (-1, 1):
        v.ball(cols[1], (sx * (w / 2 - h * 0.2), 0, h * 0.22), (h * 0.21, h * 0.2, h * 0.2))
    v.paint(cols[1], (np.mod(v.noise(0.3, seed + 2) * 6, 1.0) < 0.25), only=cols[2])
    v.paint(cols[0], (Z < h * 0.22))
    for i in range(11):
        a, b = rng.uniform(math.pi, TAU), rng.uniform(0.3, 0.9)
        x = (w / 2 - 0.16) * math.cos(a) * math.sqrt(1 - b * b)
        y = (w * 0.32 - 0.12) * math.sin(a) * math.sqrt(1 - b * b)
        v.ball(dots, (x, y, (h - 0.14) * b), 0.11)
    return _fin(v, name, 1400)


@asset("bush-a", "clearing", "a broad 2.5 m bush with gold berries, 1.5 tall")
def bush_a():
    return _bush("bush-a", 2.5, 1.5, 3, ("leaf_dark", "moss", "moss_light"), "amber")


@asset("bush-b", "clearing", "a round 1.5 m bush in dusk blossom, 1.2 tall")
def bush_b():
    return _bush("bush-b", 1.5, 1.2, 8, ("leaf_dark", "emerald", "moss_light"), "rose")


@asset("fern", "clearing", "a 1 m fern")
def fern():
    v = V((-0.6, -0.5, 0), (0.6, 0.5, 1.0), vpm=24)
    rng = np.random.default_rng(3)
    cols = ("moss_light", "moss", "emerald", "moss_light", "leaf_dark")
    nf = 6
    for i in range(nf):
        a = i / nf * TAU + rng.uniform(-0.12, 0.12) + 0.5
        reach = rng.uniform(0.47, 0.53)
        hi = rng.uniform(0.42, 0.62)
        ca, sa = math.cos(a), math.sin(a) * 0.85
        n = 16
        spine = []
        for j in range(n):  # a frond is a ribbon of leaflets, widest past the middle, arching over to a point
            t = j / (n - 1)
            x, y = reach * t**0.8 * ca, reach * t**0.8 * sa
            z = 0.05 + hi * math.sin(min(t, 0.6) / 0.6 * math.pi / 2) - (hi * 0.6 * ((t - 0.6) / 0.4) ** 2 if t > 0.6 else 0)
            wdt = 0.1 * math.sin(math.pi * min(1, max(0, t - 0.2) * 1.3)) ** 0.8
            c = cols[(i + (j % 2) * 2) % 5]
            spine.append((x, y, z))
            if j:
                v.rod(c, spine[-2], spine[-1], 0.045, flat=False)
            v.rod(c, (x + sa * wdt, y - ca * wdt, z + 0.3 * wdt), (x, y, z), 0.045, flat=False)
            v.rod(c, (x - sa * wdt, y + ca * wdt, z + 0.3 * wdt), (x, y, z), 0.045, flat=False)
    # two young fronds still curled, standing in the middle
    for x0, top, c in ((0.03, 0.9, "moss_light"), (-0.1, 0.62, "emerald")):
        v.path(c, [(x0, 0, 0.05), (x0 + 0.03, 0, top * 0.6), (x0, 0, top - 0.02)], 0.05, 0.04)
        for k in range(8):
            ang = k / 8 * 1.5 * TAU
            rr = 0.085 * (1 - k / 10)
            v.ball(c, (x0 + 0.085 + rr * math.cos(math.pi - ang), 0, top - 0.02 + rr * math.sin(ang)), 0.045)
    v.ball("moss", (0, 0, 0.04), (0.16, 0.14, 0.09))
    return _fin(v, "fern", 1500)


def _bg_tree(name, h, w, trunk, lobes, seed):
    v = V((-w / 2, -1, 0), (w / 2, 1, h), vpm=4)
    X, Y, Z = v.X, v.Y, v.Z
    for pts, r0, r1 in trunk:
        v.path("navy", pts, r0, r1)
    v.paint("lead", (np.mod(v.noise(1.6, seed) * 5, 1.0) < 0.35))
    v.paint("stone_dark", v.noise(1.2, seed + 4) > 0.7)
    base = min(z - rz for _, z, _, rz in lobes)
    for i, (x, z, rx, rz) in enumerate(sorted(lobes, key=lambda q: q[1])):
        v.ball(("leaf_dark", "dusk_teal", "dusk_teal", "dusk")[min(i, 3)] if i < 2 else ("dusk_teal", "dusk")[i % 2], (x, 0, z), (rx, 1.1, rz))
    leafy = ("leaf_dark", "dusk_teal", "dusk")
    v.paint("leaf_dark", (v.noise(2.2, seed + 1) > 0.56) & (Z < base + (h - base) * 0.55), only=leafy)
    v.paint("dusk_teal", (v.noise(1.8, seed + 2) > 0.52), only="dusk")
    v.paint("dusk", (v.noise(1.5, seed + 3) > 0.6) & (Z > base + (h - base) * 0.4), only=leafy)
    v.paint("dusk_haze", v.exposed(2, 1, 1) & (v.noise(1.6, seed + 5) > 0.35) & (Z > base + (h - base) * 0.3), only=leafy)
    v.paint("navy", v.exposed(2, -1, 1) & (Z < base + (h - base) * 0.5), only=leafy)
    return _fin(v, name, BACKDROP)


@asset("bg-tree-a", "clearing", "backdrop tree, 12 m tall, 8 m wide, round crown, dusk tones; 2 m deep")
def bg_tree_a():
    trunk = [([(0.4, 0, 0), (-0.2, 0, 3.0), (0.1, 0, 6.5)], 0.95, 0.55), ([(-0.1, 0, 3.6), (-1.6, 0, 5.6)], 0.5, 0.4), ([(0.0, 0, 4.2), (1.7, 0, 6.0)], 0.5, 0.4),
             ([(0.4, 0, 0.2), (1.3, 0, 0)], 0.6, 0.4), ([(0.3, 0, 0.2), (-0.7, 0, 0)], 0.6, 0.4)]
    lobes = [(0, 8.2, 3.4, 3.3), (-2.2, 6.9, 1.85, 1.7), (2.3, 7.3, 1.75, 1.8), (0.4, 10.3, 2.0, 1.78)]
    return _bg_tree("bg-tree-a", 12, 8, trunk, lobes, 2)


@asset("bg-tree-b", "clearing", "backdrop tree, 16 m tall, 9 m wide, tall tiered crown, dusk tones; 2 m deep")
def bg_tree_b():
    trunk = [([(-0.3, 0, 0), (0.25, 0, 3.5), (-0.1, 0, 8)], 1.0, 0.55), ([(0.2, 0, 3.6), (2.2, 0, 6.2)], 0.5, 0.4), ([(0.0, 0, 4.4), (-2.0, 0, 5.8)], 0.5, 0.4),
             ([(-0.3, 0, 0.2), (-1.4, 0, 0)], 0.6, 0.4), ([(-0.2, 0, 0.2), (0.8, 0, 0)], 0.6, 0.4)]
    lobes = [(0.1, 7.9, 3.5, 2.7), (-2.6, 7.2, 1.95, 1.8), (2.75, 8.2, 1.8, 1.9), (0.3, 11.4, 3.1, 2.9), (-0.2, 14.2, 2.2, 1.88), (-1.9, 10.2, 1.9, 1.7)]
    return _bg_tree("bg-tree-b", 16, 9, trunk, lobes, 5)


@asset("bg-tree-c", "clearing", "backdrop tree, 20 m tall, 13 m wide, great spreading crown, dusk tones; 2 m deep")
def bg_tree_c():
    trunk = [([(0.5, 0, 0), (-0.3, 0, 4.0), (0.2, 0, 9.5)], 1.3, 0.7), ([(-0.2, 0, 5.0), (-3.4, 0, 9.0)], 0.65, 0.45), ([(0.0, 0, 5.8), (3.5, 0, 9.8)], 0.65, 0.45),
             ([(0.5, 0, 0.3), (2.0, 0, 0)], 0.8, 0.45), ([(0.4, 0, 0.3), (-1.2, 0, 0)], 0.8, 0.45)]
    lobes = [(0, 13, 4.5, 4.2), (-3.85, 11, 2.7, 2.5), (3.95, 12, 2.6, 2.6), (-1.8, 16, 3.0, 2.8), (1.5, 17.3, 2.9, 2.78), (0.5, 9.8, 3.5, 2.3)]
    return _bg_tree("bg-tree-c", 20, 13, trunk, lobes, 9)


@asset("bg-hill", "clearing", "backdrop rolling hill, 30 m wide, 6 m tall, dusk tones; 2 m deep")
def bg_hill():
    v = V((-15, -1, 0), (15, 1, 6), vpm=4)
    X, Y, Z = v.X, v.Y, v.Z
    zt = 0.9 * np.sqrt(np.clip(1 - (X / 15.2) ** 2, 0, 1)) + 5.0 * np.exp(-((X + 3.5) / 6.5) ** 2) + 3.3 * np.exp(-((X - 8) / 4.2) ** 2) + 1.6 * np.exp(-((X + 11.5) / 2.6) ** 2)
    zt = zt * (6.1 / zt.max())
    hill = (Z < zt) & (abs(Y) < 1.0 - 0.5 * np.clip((Z - zt + 0.6) / 0.6, 0, 1))
    v.fill("dusk_teal", hill)
    v.paint("leaf_dark", (np.mod(Z / np.maximum(zt, 0.3) * 4 + 0.6 * v.noise(4, 2), 1.0) < 0.42))
    v.paint("navy", Z < 0.5 + 0.6 * v.noise(3, 5))
    v.paint("dusk", (v.noise(3.5, 7) > 0.6) & (Z > zt - 2.2))
    for x, r in ((-8.2, 0.75), (-7.0, 0.55), (4.2, 0.7), (11.2, 0.6), (12.3, 0.8), (-12.8, 0.5)):
        zz = float(np.interp(x, v.X.ravel(), zt.ravel()))
        v.rod("navy", (x, 0, zz - 0.4), (x, 0, zz + 0.6), 0.3)
        v.ball("leaf_dark", (x, 0, min(zz + 0.3 + r, 5.9 - r * 0.2)), (r, 0.7, r * 1.25))
    v.paint("dusk_haze", v.exposed(2, 1, 1) & (v.noise(2.5, 9) > 0.3))
    v.fill(None, Z > 6.0)
    return _fin(v, "bg-hill", BACKDROP)


@asset("lantern-ring", "clearing", "a ring of five ground lanterns round a small stump table, 3 m wide")
def lantern_ring():
    v = V((-1.5, -1.5, 0), (1.5, 1.5, 0.95), vpm=24)
    _stump(v, 0, 0, 0.36, 0.56, 0.5, 6, lobes=5)
    v.rod("cream", (0.05, -0.02, 0.5), (0.05, -0.02, 0.58), 0.13)  # a saucer, a cup and a candle
    v.rod("glass_blue", (0.05, -0.02, 0.55), (0.05, -0.02, 0.7), 0.075, 0.09)
    v.rod("cream", (-0.17, 0.08, 0.5), (-0.17, 0.08, 0.68), 0.05)
    v.ball("gold_glow", (-0.17, 0.08, 0.74), (0.045, 0.045, 0.07))
    glows = ("gold_glow", "amber_glow", "gold_glow", "amber_glow", "moon_glow")
    for i, (x, y) in enumerate(((1.32, 0.05), (-1.32, -0.05), (0.72, 1.12), (-0.78, 1.1), (0.0, -1.28))):
        s = 1.3
        v.rod("bark", (x, y, 0), (x, y, 0.07), 0.16)
        v.rod("bark", (x, y, 0.64), (x, y, 0.8), 0.19, 0.04)
        lantern(v, (x, y, 0.66), s, glow=glows[i])
        v.ball("gold", (x, y, 0.83), (0.045, 0.045, 0.06))
        v.ball("moss" if i % 2 else "moss_light", (x * 0.87, y * 0.87, 0.02), (0.12, 0.12, 0.06))
    v.fill("bark", (v.Z < 0.07) & (abs(v.X) > 1.38) & (abs(v.Y) < 0.12))
    return _fin(v, "lantern-ring", 1800)


# =================================================================================================
# roots: the dark under the tree
# =================================================================================================


@asset("root-arch", "roots", "arch of twisting roots, 5 m wide overall, opening 3.5 m tall (3.2 wide at the ground); the owl walks under it (y -1.2..1.2)")
def root_arch():
    v = V((-2.5, -1.2, 0), (2.5, 1.2, 4.35), vpm=12)
    X, Y, Z = v.X, v.Y, v.Z
    cols = ("bark", "wood", "bark_dark", "bark")
    for k in range(4):
        ph = k * TAU / 4
        pts = []
        for th in np.linspace(-0.12, math.pi + 0.12, 30):
            off = 0.2 * math.cos(3 * th + ph)  # the strands plait round each other
            pts.append((-(2.03 + off) * math.cos(th), 0.84 * math.sin(3 * th + ph), (3.93 + off) * max(math.sin(th), -0.1) ** 1.0 if th > 0 and th < math.pi else -0.2))
        v.path(cols[k], pts, 0.27 - 0.03 * (k % 2), 0.27)
    _grain(v, "bark_dark", 0.45, 5, bands=6, share=0.26, only=("bark", "wood"))
    v.paint("wood_light", v.noise(0.4, 8) > 0.74, only="wood")
    v.paint("moss", v.exposed(2, 1, 2) & (v.noise(0.7, 13) > 0.58))
    v.paint("moss_light", v.noise(0.4, 3) > 0.6, only="moss")
    v.paint("stone_dark", (Z < 0.4 + 0.5 * v.noise(0.5, 6)) & (v.noise(0.6, 9) > 0.5))
    # keep the way clear
    v.fill(None, ((X / 1.62) ** 2 + (Z / 3.5) ** 2 < 1))
    for x, y, z in ((-2.2, -0.9, 3.0), (2.25, 0.6, 2.6), (-1.9, 0.9, 3.75), (1.5, -0.95, 4.05), (2.3, -0.7, 1.5), (-2.32, 0.3, 1.4)):
        v.ball("glowworm", (x, y, z), 0.09, only="solid")
    return _fin(v, "root-arch", LANDMARK)


@asset("root-talon", "roots", "one of the tree's five great root buttresses, 6 m tall, 4 m wide at the base, curving like a talon")
def root_talon():
    v = V((-2, -1.3, 0), (2, 1.3, 6), vpm=10)
    X, Y, Z = v.X, v.Y, v.Z
    # the talon: down from the trunk, bellying out, then hooking back to a pale point
    v.path("bark", [(-1.0, 0, 6.3), (-0.55, 0, 5.0), (0.35, 0, 3.7), (1.15, 0, 2.5), (1.5, 0, 1.45), (1.3, 0, 0.6), (0.85, 0, 0.04)], 1.0, 0.13)
    v.ball("bark", (1.5, 0, 1.75), (0.52, 0.45, 0.6))
    v.path("wood", [(-1.45, 0.45, 6.2), (-1.3, 0.6, 4.4), (-0.6, 0.75, 3.0), (-0.9, 0.85, 1.5), (-1.72, 0.9, 0.12)], 0.5, 0.26)
    v.path("wood", [(-0.9, -0.5, 5.2), (-0.5, -0.8, 3.4), (-1.0, -0.95, 1.6), (-1.6, -1.0, 0.12)], 0.42, 0.24)
    v.path("bark", [(-1.6, 0, 4.6), (-1.7, 0.05, 2.4), (-1.78, 0, 0.1)], 0.4, 0.22)
    _grain(v, "bark_dark", 0.6, 4, bands=7, share=0.3)
    tipd = np.hypot(X - 0.85, Z - 0.0)
    v.paint("wood_light", tipd < 1.0, only=("bark", "bark_dark"))
    v.paint("owl_belly", tipd < 0.55, only=("wood_light",))
    v.paint("wood_light", (v.noise(0.5, 2) > 0.72), only="wood")
    v.paint("moss", v.exposed(2, 1, 2) & (v.noise(0.8, 6) > 0.52) & (Z < 5.4))
    v.paint("moss_light", v.noise(0.5, 6) > 0.6, only="moss")
    for x, y, r in ((0.2, 0.55, 0.42), (-0.25, 0.85, 0.3), (0.3, -0.75, 0.3)):
        v.ball("stone", (x, y, r * 0.5), (r, r * 0.9, r * 0.75))
    v.paint("stone_dark", (v.noise(0.3, 12) > 0.5), only="stone")
    for p in ((-0.75, -1.1, 3.3), (0.6, -0.72, 3.3), (-1.35, -1.12, 1.8), (1.5, -0.45, 1.9)):
        v.ball("glowworm", p, 0.1, only="solid")
    return _fin(v, "root-talon", LANDMARK)


@asset("root-tangle", "roots", "a hanging tangle of roots, 3 m; origin at the top")
def root_tangle():
    v = V((-1.0, -0.5, -3), (1.0, 0.5, 0), vpm=20)
    rng = np.random.default_rng(8)
    v.ball("bark_dark", (0, 0, 0.05), (0.9, 0.42, 0.3))
    cols = ("bark", "wood", "bark_dark", "bark", "wood", "bark", "wood_light")
    for k in range(8):
        x0 = -0.7 + k * 0.2
        L = 3.0 if k == 3 else rng.uniform(1.2, 2.7)
        ph, amp = rng.uniform(0, TAU), rng.uniform(0.12, 0.26)
        y0 = rng.uniform(-0.2, 0.2)
        pts = [(x0 * (1 - 0.35 * t) + amp * math.sin(t * L * 2.4 + ph) * t ** 0.5, y0 + 0.14 * math.cos(t * L * 2 + ph) * t, -t * L) for t in np.linspace(0, 1, int(L * 5) + 2)]
        v.path(cols[k % 7], pts, 0.12, 0.05)
        m = pts[len(pts) // 2]
        v.rod(cols[(k + 1) % 7], m, (m[0] + rng.choice([-1, 1]) * 0.3, m[1], m[2] - 0.45), 0.06, 0.045, flat=False)
        if k % 3 == 1:
            v.ball("glowworm", (pts[-1][0], pts[-1][1], max(pts[-1][2], -2.94)), 0.07)
    _grain(v, "bark_dark", 0.3, 3, bands=5, share=0.2, only=("bark", "wood"))
    v.paint("moss", (v.Z > -0.3) & (v.noise(0.3, 5) > 0.5))
    return _fin(v, "root-tangle", 1500)


@asset("glowworms", "roots", "a 2 m cluster of hanging glow-worm threads; origin at the top")
def glowworms():
    v = V((-0.75, -0.3, -2), (0.75, 0.3, 0), vpm=32)
    rng = np.random.default_rng(2)
    v.ball("stone_dark", (0, 0, 0.04), (0.7, 0.26, 0.16))
    v.paint("navy_deep", v.noise(0.2, 3) > 0.55)
    v.paint("moss", v.noise(0.2, 6) > 0.7)
    for k in range(10):
        x = -0.62 + k * 0.138 + rng.uniform(-0.03, 0.03)
        y = rng.uniform(-0.14, 0.14)
        L = 1.97 if k == 4 else rng.uniform(0.6, 1.8)
        sway = rng.uniform(-0.05, 0.05)
        v.path("glowworm", [(x, y, 0), (x + sway, y, -L * 0.5), (x + sway * 0.4, y, -L)], 0.034)
        nb = int(L / 0.24)
        for j in range(1, nb + 1):
            t = j / nb
            v.ball("mint" if (j + k) % 3 == 0 else "glowworm", (x + sway * (2 * t if t < 0.5 else 1.6 - 1.2 * t), y, -L * t), 0.05 if j < nb else 0.07)
    return _fin(v, "glowworms", 1500)


def _stalagmite(v, x, y, h, r, seed, c="stone"):
    X, Y, Z = v.X, v.Y, v.Z
    t = np.clip(Z / h, 0, 1)
    lean = 0.12 * r * np.sin(seed + Z * 1.3)
    rad = r * ((1 - t) ** 0.85 + 0.3 * np.exp(-Z / (0.12 * h))) + 0.035 * np.sin(Z * 15 / max(h, 1) * 1.3 + seed) * (1 - t)
    v.fill(c, (np.hypot(X - x - lean, Y - y) < np.maximum(rad, 0.045)) & (Z < h))


@asset("stalagmite-a", "roots", "a tall stalagmite with two small ones, 2.2 m")
def stalagmite_a():
    v = V((-0.75, -0.6, 0), (0.75, 0.6, 2.2), vpm=20)
    Z = v.Z
    _stalagmite(v, 0.05, 0.05, 2.22, 0.42, 1)
    _stalagmite(v, -0.42, -0.1, 1.05, 0.26, 3)
    _stalagmite(v, 0.44, -0.15, 0.7, 0.22, 5)
    v.paint("stone_dark", np.mod(Z + 0.15 * v.noise(0.3, 2), 0.34) < 0.12)
    v.paint("navy_deep", Z < 0.25 + 0.2 * v.noise(0.3, 4))
    v.paint("lilac", (np.mod(Z + 0.15 * v.noise(0.3, 2), 0.68) < 0.07) & (Z > 0.5))
    v.paint("heron", v.exposed(2, 1, 1) & (Z > 0.5))
    v.paint("moss", (v.noise(0.3, 9) > 0.66) & (Z < 0.8))
    return _fin(v, "stalagmite-a", 1300)


@asset("stalagmite-b", "roots", "a squat cluster of stalagmites, 1.3 m, with wet blue tips")
def stalagmite_b():
    v = V((-0.8, -0.55, 0), (0.8, 0.55, 1.3), vpm=20)
    Z = v.Z
    for x, y, h, r, s in ((-0.38, 0.0, 1.32, 0.34, 2), (0.3, 0.08, 0.95, 0.33, 4), (0.0, -0.22, 0.6, 0.24, 6), (0.58, -0.12, 0.45, 0.18, 8), (-0.62, -0.18, 0.4, 0.15, 9)):
        _stalagmite(v, x, y, h, r, s, c="stone_dark")
    v.paint("stone", np.mod(Z + 0.12 * v.noise(0.25, 3), 0.28) < 0.12)
    v.paint("navy_deep", Z < 0.18 + 0.15 * v.noise(0.3, 4))
    v.paint("dusk", v.exposed(2, 1, 2))
    v.paint("glass_blue", v.exposed(2, 1, 1) & (v.noise(0.2, 7) > 0.45))
    v.paint("moss", (v.noise(0.3, 11) > 0.68) & (Z < 0.5))
    return _fin(v, "stalagmite-b", 1300)


def _rock(name, w, d, h, seed, extra):
    v = V((-w / 2, -d / 2, 0), (w / 2, d / 2, h), vpm=16)
    X, Y, Z = v.X, v.Y, v.Z
    rng = np.random.default_rng(seed)
    n = v.noise(0.5, seed)
    v.fill("stone_dark", ((X / (w / 2)) ** 2 + (Y / (d / 2)) ** 2 + (Z / h) ** 2 < 0.95 + 0.25 * n))
    for _ in range(5):  # flat facets, as if split
        nx, ny, nz = rng.normal(0, 1), rng.normal(0, 0.6), abs(rng.normal(0.9, 0.4))
        ln = math.sqrt(nx * nx + ny * ny + nz * nz)
        v.fill(None, (X * nx / (w / 2) + Y * ny / (d / 2) + (Z / h) * nz) / ln > rng.uniform(0.62, 0.8))
    v.ball("stone_dark", (0, 0, h * 0.5), (w * 0.3, d * 0.3, h * 0.5))
    v.ball("stone_dark", (-w * 0.3, 0, h * 0.15), (w * 0.2, d * 0.4, h * 0.3))
    v.ball("stone_dark", (w * 0.32, 0, h * 0.12), (w * 0.18, d * 0.4, h * 0.25))
    v.paint("stone", v.noise(0.45, seed + 1) > 0.5)
    v.paint("navy_deep", (Z < h * 0.2 + 0.15 * n) | (np.mod(v.noise(0.5, seed + 2) * 7, 1.0) < 0.1))
    v.paint("heron", v.exposed(2, 1, 1) & (v.noise(0.4, seed + 3) > 0.5), only="stone")
    v.top("moss", 1, only=("stone_dark",))
    v.paint("moss_light", v.noise(0.3, seed + 5) > 0.6, only="moss")
    extra(v)
    return _fin(v, name, 1300)


@asset("cave-rock-a", "roots", "a split boulder with a root over it, 2.5 m wide, 1.5 tall")
def cave_rock_a():
    def extra(v):
        v.path("bark", [(-1.2, -0.3, 0.05), (-0.75, -0.5, 0.9), (-0.1, -0.35, 1.42), (0.6, -0.1, 1.1), (1.2, 0.2, 0.1)], 0.13, 0.09)
        v.paint("wood", v.noise(0.2, 3) > 0.6, only="bark")

    return _rock("cave-rock-a", 2.5, 1.6, 1.5, 3, extra)


@asset("cave-rock-b", "roots", "a small rock with glow-worm specks, 1.2 m wide")
def cave_rock_b():
    def extra(v):
        for p in ((-0.25, -0.33, 0.45), (0.2, -0.36, 0.3), (0.38, -0.2, 0.52), (-0.05, -0.3, 0.68)):
            v.ball("glowworm", p, 0.055)

    return _rock("cave-rock-b", 1.2, 0.9, 0.85, 12, extra)


@asset("cave-wall", "roots", "the under-tree's wall of stone and root: a 10 x 10 m backdrop panel (x -5..5, z 0..10, y 0..1); tiles left-right and up-down")
def cave_wall():
    v = V((-5, 0, 0), (5, 1, 10), vpm=8, open="xz")
    X, Y, Z = v.X, v.Y, v.Z
    pn = _pnoise(v, 11, terms=9)
    pn2 = _pnoise(v, 14, terms=8, kmax=5)
    crack = np.abs(pn2 - 0.5) < 0.045
    front = 0.78 - 0.55 * pn - 0.12 * pn2
    front = np.where(crack, 0.82, front)
    v.fill("navy_deep", Y > front)
    v.paint("stone_dark", (pn > 0.42) & ~crack)
    v.paint("stone", (pn > 0.7) & (pn2 > 0.45) & ~crack)
    v.paint("lead", (_pnoise(v, 19, kmax=5) > 0.72) & ~crack)
    v.paint("moss", (_pnoise(v, 23) > 0.82) & (Y < 0.55))
    roots = ((-3.2, 0.9, 0.5, "bark"), (1.3, 0.7, 2.9, "bark_dark"), (3.4, 0.5, 4.4, "bark"))
    for xk, amp, ph, c in roots:
        cx = xk + amp * np.sin(TAU * Z / 10 + ph) + 0.3 * np.sin(TAU * 3 * Z / 10 + ph * 2)
        dx = np.mod(X - cx + 5, 10) - 5
        wdt = 0.36 + 0.1 * np.sin(TAU * 2 * Z / 10 + ph)
        v.fill(c, (abs(dx) < wdt) & (Y > 0.05 + 0.5 * (dx / wdt) ** 2))
        v.paint("wood", (abs(dx) < wdt * 0.5) & (np.mod(Z, 2.5) < 0.6), only=c)
    return v.done_tris("cave-wall", 9000, relax=3)


def _shard(v, c, p0, p1, r, twist=0.0):
    """A six-sided crystal from p0 to its point at p1."""
    p0, p1 = np.array(p0, float), np.array(p1, float)
    ax = p1 - p0
    L = np.linalg.norm(ax)
    ax = ax / L
    a = np.cross(ax, (0, 1, 0) if abs(ax[1]) < 0.9 else (1, 0, 0))
    a = a / np.linalg.norm(a)
    b = np.cross(ax, a)
    a, b = a * math.cos(twist) + b * math.sin(twist), -a * math.sin(twist) + b * math.cos(twist)
    D = [v.X - p0[0], v.Y - p0[1], v.Z - p0[2]]
    t = sum(D[i] * ax[i] for i in range(3)) / L
    pu = sum(D[i] * a[i] for i in range(3))
    pv = sum(D[i] * b[i] for i in range(3))
    hexd = np.maximum(abs(pu), np.maximum(abs(pu * 0.5 + pv * 0.866), abs(pu * 0.5 - pv * 0.866)))
    prof = r * np.where(t < 0.72, 1 - 0.12 * t, (1 - 0.12 * 0.72) * (1 - (t - 0.72) / 0.28))
    m = (hexd < prof) & (t > -0.05) & (t < 1)
    v.fill(c, m)
    return m, t


@asset("crystal-cluster", "roots", "softly glowing crystals on a rock, 1.2 m")
def crystal_cluster():
    v = V((-0.6, -0.5, 0), (0.6, 0.5, 1.2), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    v.ball("stone_dark", (0, 0, 0.02), (0.56, 0.44, 0.22))
    v.ball("stone_dark", (-0.3, 0.05, 0.05), (0.28, 0.3, 0.2))
    v.paint("navy_deep", v.noise(0.2, 2) > 0.55)
    v.paint("stone", v.exposed(2, 1, 1) & (v.noise(0.2, 5) > 0.45))
    shards = [((0.02, 0.05, 0.1), (0.1, 0.0, 1.21), 0.17, "crystal_glow", 0.2), ((-0.18, 0.0, 0.1), (-0.5, -0.05, 0.86), 0.13, "lilac", 0.6),
              ((0.2, 0.02, 0.1), (0.56, 0.05, 0.72), 0.12, "glass_blue", 0.1), ((-0.05, -0.2, 0.1), (-0.14, -0.42, 0.6), 0.1, "mint", 0.9),
              ((0.14, -0.16, 0.08), (0.34, -0.38, 0.46), 0.085, "crystal_glow", 0.4), ((-0.05, 0.2, 0.1), (-0.2, 0.36, 0.7), 0.11, "glass_blue", 0.3),
              ((-0.36, -0.12, 0.08), (-0.56, -0.22, 0.38), 0.07, "crystal_glow", 0.0)]
    for p0, p1, r, c, tw in shards:
        m, t = _shard(v, c, p0, p1, r, tw)
        v.fill("moon_glow", m & (t > 0.86))
        v.fill("dusk" if c != "lilac" else "violet", m & (t < 0.22))
    return _fin(v, "crystal-cluster", 1500)


@asset("mouse-hole", "roots", "a tiny arched doorway with a warm light, 0.8 m; stands on z = 0, proud of the wall behind (y 0..0.3)")
def mouse_hole():
    v = V((-0.45, 0, 0), (0.45, 0.3, 0.8), vpm=40)
    X, Y, Z = v.X, v.Y, v.Z
    dist = np.where(Z < 0.3, abs(X) - 0.2, np.hypot(X, Z - 0.3) - 0.2) + 0 * Y
    ang = np.where(Z < 0.3, np.sign(X) * (2.2 - Z * 3), np.arctan2(X, Z - 0.3))
    frame = (dist >= 0) & (dist < 0.15) & (Y > 0.3 - 0.24 * np.sqrt(np.clip(1 - ((dist - 0.075) / 0.08) ** 2, 0, 1)) - 0.02)
    v.fill("stone", frame)
    v.paint("stone_dark", frame & (np.mod(ang * 2.4, 1.0) < 0.2))
    v.paint("heron", frame & (np.mod(ang * 2.4, 2.0) > 1.2) & (np.mod(ang * 2.4, 1.0) >= 0.2))
    v.fill("gold_soft", frame & (abs(X) < 0.06) & (Z > 0.5))  # keystone
    v.fill("amber_glow", (dist < 0) & (Y > 0.2))
    v.fill("gold_glow", (np.hypot(X - 0.06, (Z - 0.22) * 0.8) < 0.1) & (Y > 0.17))
    # the door, ajar
    door = (X > -0.2) & (X < -0.01) & (dist < 0) & (Y > 0.06) & (Y < 0.2) & (Z > 0.04)
    v.fill("wood", door)
    v.fill("rust_leaf", door & (np.mod(X + 0.2, 0.07) > 0.02))
    v.ball("gold", (-0.05, 0.05, 0.24), 0.03)
    # step, mat, awning and a little lamp
    v.fill("stone_dark", (abs(X) < 0.38) & (Z < 0.05) & (Y > 0.02))
    v.fill("red", (abs(X) < 0.16) & (Z < 0.075) & (Y > 0.04) & (Y < 0.2))
    aw = 0.8 - 0.42 * abs(X) - 0.03
    v.fill("bark", (Z < aw + 0.035) & (Z > aw - 0.06) & (abs(X) < 0.45))
    v.fill("rust_leaf", (Z < aw + 0.035) & (Z > aw - 0.06) & (abs(X) < 0.45) & (np.mod(abs(X), 0.14) > 0.04))
    v.top("moss", 1, only=("bark", "rust_leaf"))
    v.rod("gold", (0.36, 0.1, 0.5), (0.36, 0.1, 0.58), 0.028)
    v.ball("gold_glow", (0.36, 0.1, 0.45), (0.05, 0.05, 0.06))
    v.ball("moss", (-0.36, 0.14, 0.03), (0.09, 0.09, 0.06))
    v.ball("moss_light", (0.4, 0.2, 0.03), (0.07, 0.07, 0.05))
    return _fin(v, "mouse-hole", 1100)
