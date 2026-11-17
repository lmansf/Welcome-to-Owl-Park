"""The stained-glass street and its tower to the clouds: leaded glass that glows like lanterns,
the things on the climb that set the owl back, and the sky the tower ends in.

Everything glass is built the same way so it reads as one family: a dark lead frame standing a
voxel proud of thin coloured panes. The relief is what keeps the leading crisp after thinning.
"""
import math

import bpy
import numpy as np

from ..core import asset, child
from ..vox import V, register_colour
from .common import lantern

register_colour("gust", "#DCEBFA", emission=0.5, alpha=0.5)  # the wind: pale, faint, see-through
register_colour("moon_mare", "#A9B6D2", emission=0.8)  # the moon's seas: a shade under moon_glow

PANES = ("ruby", "amber_glass", "emerald", "sapphire", "rose", "mint", "lilac", "glass_blue")
WARM = ("ruby", "amber_glass", "rose", "amber_glass")
COOL = ("sapphire", "emerald", "mint", "lilac", "glass_blue")


def _pick(v, idx, mask, cols=PANES, only=None):
    """Fills a mask with colours chosen by an integer field (one colour per pane)."""
    idx = np.mod(idx, len(cols))
    for i, c in enumerate(cols):
        v.fill(c, mask & (idx == i), only)


def _hash(i, j, seed=0):
    """A fixed scatter of integers over two integer fields, so panes get an irregular colour."""
    t = np.random.default_rng(1000 + seed).integers(0, 9973, (37, 41))
    i, j = np.broadcast_arrays(np.asarray(i).astype(int), np.asarray(j).astype(int))
    return t[np.mod(i, 37), np.mod(j, 41)]


def _poly2(v, pts):
    """An (x, z) outline as a mask over X and Z."""
    X = np.broadcast_to(v.X, (v.g.shape[0], 1, v.g.shape[2]))
    Z = np.broadcast_to(v.Z, (v.g.shape[0], 1, v.g.shape[2]))
    inside = np.zeros(X.shape, bool)
    n = len(pts)
    for i in range(n):
        x0, z0 = pts[i]
        x1, z1 = pts[(i + 1) % n]
        if z0 == z1:
            continue
        inside ^= ((z0 > Z) != (z1 > Z)) & (X < (x1 - x0) * (Z - z0) / (z1 - z0) + x0)
    return inside


# ---- the street and the tower -------------------------------------------------------------------


@asset("glass-column", "glass", "tower column, 2 m wide and deep, 10 m tall; stacks in z")
def glass_column():
    v = V((-1, -1, 0), (1, 1, 10), vpm=8, open="z")
    X, Y, Z = v.X, v.Y, v.Z
    sq = X**4 + Y**4
    front = np.abs(Y) >= np.abs(X)
    s = np.where(front, X, Y) + 0 * Z  # the coordinate along whichever face a voxel is on
    face = np.where(front, np.where(Y < 0, 0, 2), np.where(X < 0, 1, 3)) + 0 * Z
    zz = np.mod(Z, 2.5)
    row = np.floor(Z / 2.5)
    v.fill("lead", sq < 0.86**4)
    upper = zz > 1.75
    # a lancet in each half of each face, a small light over it
    h = _hash(row * 2 + upper, face * 2 + (s > 0), 3)
    _pick(v, h, sq < 0.86**4, cols=PANES + ("amber_glass", "dusk"))
    arch = (zz > 1.5) & (zz < 1.75) & (np.abs(np.abs(s) - 0.44) > 0.14)
    frame = (zz < 0.25) | (np.abs(s) > 0.75) | (np.abs(s) < 0.125) | arch | ((zz > 1.75) & (zz < 1.875))
    v.fill("lead", (sq < 1) & frame)
    v.paint("gold", (sq < 1) & (zz < 0.25) & (zz > 0.125) & (np.abs(s) < 0.125))
    return v.done("glass-column", keep=0.12)


@asset("glass-wall", "glass", "backdrop wall of leaded panes, 10 m by 10 m, 1 m thick (y 0 to 1); tiles in x and z")
def glass_wall():
    v = V((-5, 0, 0), (5, 1, 10), vpm=4, open="xz")
    X, Y, Z = v.X, v.Y, v.Z
    P = 2.5
    la, lb = np.mod(X + Z, P), np.mod(X - Z, P)
    lat = (la < 0.5) | (lb < 0.5)
    i8 = np.mod(np.floor((X + Z) / P), 8)
    j8 = np.mod(np.floor((X - Z) / P), 8)
    sw = i8 >= 4  # the pattern repeats every 10 m in x and in z, so the wall tiles
    i8, j8 = np.where(sw, i8 - 4, i8), np.where(sw, np.mod(j8 + 4, 8), j8)
    cols = ("ruby", "amber_glass", "emerald", "sapphire", "rose", "mint", "lilac", "glass_blue", "amber_glass", "sapphire", "navy", "dusk")
    h = _hash(i8, j8, 11)
    v.fill("lead", Y > 0.5)
    _pick(v, h, (Y > 0.25) & (Y < 0.5) & ~lat, cols=cols)
    # a jewel in the heart of most panes
    jewel = (np.abs(la - 1.5) < 0.4) & (np.abs(lb - 1.5) < 0.4) & (np.mod(h, 12) < 10)
    _pick(v, _hash(j8, i8, 12), (Y > 0.25) & (Y < 0.5) & jewel, cols=("amber_glass", "glass_blue", "rose", "mint", "lilac"))
    v.fill("lead", (Y < 0.5) & lat)
    v.paint("gold", (Y < 0.25) & (la < 0.5) & (lb < 0.5))
    return v.done("glass-wall", keep=0.1, relax=1)


@asset("glass-balcony", "glass", "balcony 6 m wide, top at z = 0, 0.5 m thick, 2 m deep; railing along the back")
def glass_balcony():
    v = V((-3, -1, -1.75), (3, 1, 0.75))
    X, Y, Z = v.X, v.Y, v.Z
    v.box("lead", (-3, -1, -0.5), (3, 1, 0))
    # the cove under it: shallow at the front lip, deep at the wall, drawn in toward the ends
    t = np.clip((Y + 0.55) / 1.55, 0, 1)
    ex = np.clip((3 - np.abs(X)) / 0.9, 0, 1) ** 0.5
    depth = 1.0 * t**1.7 * ex
    seg = np.floor((X + 3) / 0.75)
    rib = (np.mod(X + 3, 0.75) < 0.07) | (np.mod(X + 3, 0.75) > 0.68)
    _pick(v, seg, (Z <= -0.5) & (Z > -0.5 - depth), cols=("ruby", "amber_glass", "emerald", "sapphire", "rose", "amber_glass", "mint", "lilac"))
    v.fill("lead", (Z <= -0.5) & (Z > -0.58 - depth * 1.08) & rib & (depth > 0.02))
    v.fill("lead", (Z <= -0.5) & (Z > -0.5 - depth) & (Y > 0.86))
    for x in (-2.25, -0.75, 0.75, 2.25):  # lantern drops under the brackets
        v.rod("lead", (x, 0.78, -1.5), (x, 0.78, -1.2), 0.07)
        v.ball("amber_glass", (x, 0.78, -1.58), (0.13, 0.13, 0.16))
    # the front lip: a run of small panes between leads
    lip = (Y < -0.875) & (Z < -0.12) & (Z > -0.4) & (np.mod(X + 3, 0.5) > 0.1) & (np.abs(X) < 2.9)
    v.fill(None, lip & (Y < -0.9375))
    _pick(v, np.floor((X + 3) / 0.5) * 3, lip & (Y > -0.9375), cols=PANES)
    # the floor: pale glass set in lead
    v.paint("glass_blue", (Z > -0.125) & (np.abs(Y) < 0.8) & (np.abs(X) < 2.9) & (np.mod(X + 3, 1.0) > 0.07))
    v.paint("mint", (Z > -0.125) & (v.noise(0.7, 4) > 0.62), only="glass_blue")
    # the back railing
    for i, x in enumerate((-2.9, -1.93, -0.97, 0, 0.97, 1.93, 2.9)):
        v.rod("lead", (x, 0.9, 0), (x, 0.9, 0.6), 0.085)
        v.ball("gold" if i in (0, 6) else "lead", (x, 0.9, 0.64), 0.1)
    v.rod("lead", (-2.9, 0.9, 0.52), (2.9, 0.9, 0.52), 0.08)
    pane = (np.abs(Y - 0.9) < 0.07) & (Z > 0) & (Z < 0.5) & (np.abs(X) < 2.9)
    _pick(v, np.floor((X + 2.9) / 0.4833) * 5 + 2, pane, cols=PANES, only="air")
    v.fill(None, pane & (np.hypot(np.mod(X + 2.9, 0.9667) - 0.4833, Z - 0.5) < 0.2), only=PANES)
    return v.done("glass-balcony", keep=0.06)



@asset("rose-window", "glass", "round rose window 6 m across, about 0.6 m thick; origin at its centre")
def rose_window():
    v = V((-3, -0.375, -3), (3, 0.375, 3), vpm=8)
    X, Y, Z = v.X, v.Y, v.Z
    r = np.hypot(X, Z)
    th = np.arctan2(Z, X) + math.pi
    n = 8
    seg = 2 * math.pi / n
    k = np.floor(th / seg)
    m = np.mod(th, seg)
    thin, proud = np.abs(Y) < 0.125, np.abs(Y) < 0.25
    v.fill("sapphire", (r < 2.6) & thin)
    # eight petals, warm at the heart and cooling outward
    _pick(v, k, (r < 1.85) & thin, cols=("ruby", "amber_glass", "rose", "amber_glass"))
    _pick(v, k, (r < 1.2) & thin, cols=("amber_glass", "rose", "amber_glass", "ruby"))
    # a roundel beyond each petal, and a small eye between each pair
    a = (k + 0.5) * seg - math.pi
    d = np.hypot(X - 2.22 * np.cos(a), Z - 2.22 * np.sin(a))
    _pick(v, k, (d < 0.4) & thin, cols=("mint", "glass_blue", "lilac", "emerald"))
    b = np.round(th / seg) * seg - math.pi
    d2 = np.hypot(X - 2.3 * np.cos(b), Z - 2.3 * np.sin(b))
    v.fill("amber_glass", (d2 < 0.22) & thin)
    spoke = (np.minimum(m, seg - m) * r < 0.12) & (r > 0.6) & (r < 1.9)
    lead = spoke | ((r > 0.55) & (r < 0.8)) | ((r > 1.8) & (r < 1.97)) | ((d > 0.4) & (d < 0.55)) | ((d2 > 0.22) & (d2 < 0.34))
    v.fill("lead", lead & proud & (r < 2.6))
    v.fill("lead", ((r - 2.72) / 0.28) ** 2 + (Y / 0.375) ** 2 < 1)
    v.ball("amber_glass", (0, 0, 0), (0.56, 0.33, 0.56))
    v.ball("gold_soft", (0, 0, 0), (0.25, 0.375, 0.25))
    for i in range(16):  # studs of light on the rim
        aa = i * math.pi / 8
        v.ball("gold_soft", (2.72 * math.cos(aa), -0.3, 2.72 * math.sin(aa)), (0.13, 0.1, 0.13))
    return v.done("rose-window", keep=0.3)



@asset("idol-barn-glass", "glass", "the guardian idol: a barn owl of stained glass, 5 m tall, behind the path (y 0.8 to 3)")
def idol_barn_glass():
    v = V((-1.75, 0.75, 0), (1.75, 3.0, 5.0), vpm=12)
    X, Y, Z = v.X, v.Y, v.Z
    cy = 1.9
    gr = 0.09  # the lead stands this far proud of the glass

    def ell(c, r, g):
        return ((X - c[0]) / (r[0] + g)) ** 2 + ((Y - c[1]) / (r[1] + g)) ** 2 + ((Z - c[2]) / (r[2] + g)) ** 2 <= 1

    def form(g):
        m = ell((0, cy, 2.0), (1.38, 0.93, 1.75), g) | ell((0, cy, 3.76), (1.43, 0.98, 1.15), g)
        for sx in (-1, 1):
            m = m | ell((sx * 1.15, cy + 0.05, 2.05), (0.51, 0.72, 1.45), g)
        return m & (Z > 0.3)

    def heart(d):
        lobes = ((np.abs(X) - 0.5) / (0.72 + d)) ** 2 + ((Z - 3.95) / (0.68 + d)) ** 2 <= 1
        chin = (np.abs(X) < (Z - 2.95 + 1.3 * d) * 1.05) & (Z < 3.95)
        return (lobes | chin) & (Y < cy)

    S, G = form(0), form(gr)
    # feathers: rows of scallops, each row half a feather along from the one below
    rh, cw = 0.5, 0.84
    row = np.floor(Z / rh)
    w = np.mod(Z, rh)
    u = np.mod(X + np.mod(row, 2) * cw / 2 + 8.4 + cw / 2, cw) - cw / 2
    curve = 0.46 * (u / (cw / 2)) ** 2
    above = w >= curve
    fr = np.where(above, row, row - 1)
    fc = np.where(above, np.floor((X + np.mod(row, 2) * cw / 2 + 8.4 + cw / 2) / cw), np.floor((X + np.mod(row - 1, 2) * cw / 2 + 8.4 + cw / 2) / cw))
    h = _hash(fr, fc, 21)
    wing = (np.abs(X) > 0.95) & (Z < 3.2)
    crown = (Z >= 2.95) & ~wing
    breast = ~wing & ~crown
    _pick(v, h, S & wing, cols=("amber_glass", "ruby", "amber_glass", "sapphire", "amber_glass", "emerald"))
    _pick(v, h, S & crown, cols=("amber_glass", "ruby", "amber_glass", "rose"))
    _pick(v, h, S & breast, cols=("lilac", "rose", "glass_blue", "mint", "lilac", "glass_blue"))
    lines = (np.abs(w - curve) < 0.09) | ((np.abs(np.abs(X) - 0.95) < 0.09) & (Z < 3.2))
    v.fill("lead", G & lines & ~heart(0.12))
    # the heart-shaped face: pale glass in a heavy lead, a warm band round it
    v.paint("amber_glass", S & heart(0.34) & ~heart(0.05))
    v.fill("cloud", S & heart(0))
    v.paint("glass_blue", S & heart(0) & ~heart(-0.22) & (Z < 3.8))
    v.fill("lead", G & heart(0.12) & ~heart(-0.06))
    v.paint("lead", (np.abs(X) < 0.085) & (Z > 3.75) & heart(0))
    for sx in (-1, 1):
        v.ball("navy_deep", (sx * 0.52, 1.0, 3.9), (0.28, 0.16, 0.31))
        v.ball("moon_glow", (sx * 0.52 - 0.1, 0.9, 4.02), (0.085, 0.07, 0.085))
        for t in (-0.2, 0, 0.2):  # talons on the plinth
            v.rod("amber_glass", (sx * 0.5 + t, 1.25, 0.47), (sx * 0.5 + t * 1.5, 0.98, 0.45), 0.11, 0.08, flat=False)
    v.rod("amber_glass", (0, 0.97, 3.62), (0, 0.9, 3.2), 0.17, 0.05, flat=False)
    # the plinth
    v.fill("lead", ((X / 1.62) ** 2 + ((Y - cy) / 1.05) ** 2 < 1) & (Z < 0.4))
    v.paint("gold", (Z > 0.17) & (Z < 0.33), only="lead")
    v.paint("dusk", (Z < 0.17) & (v.noise(0.5, 3) > 0.5), only="lead")
    return v.done("idol-barn-glass", keep=0.165)


@asset("glass-arch", "glass", "gateway: the opening is 4 m wide and 4.5 m tall; the frame spans y -1.2 to 1.2, the owl walks through")
def glass_arch():
    v = V((-2.9, -1.2, 0), (2.9, 1.2, 8.4), vpm=10)
    X, Y, Z = v.X, v.Y, v.Z
    c, R, zs = 2.2, 5.1, 0.72  # two arcs that meet in a point 7.8 m up

    def goth(off):
        return (np.hypot(X - c, (Z - 4.5) / zs) < R - off) & (np.hypot(X + c, (Z - 4.5) / zs) < R - off) & (Z >= 4.5)

    v.fill("lead", (np.abs(X) > 2) & (Z < 4.5))
    v.fill("lead", goth(0))
    v.paint("dusk", v.noise(0.9, 6) > 0.6)
    # the window in the pointed top: a sun with rays
    win = goth(0.5) & (Z > 5.0)
    v.fill(None, win & (np.abs(Y) > 0.7))
    cz = 5.85
    d = np.hypot(X, Z - cz)
    th = np.arctan2(Z - cz, X) + math.pi
    seg = math.pi / 5
    k = np.floor(th / seg)
    m = np.mod(th, seg)
    _pick(v, k, win, cols=("sapphire", "emerald", "lilac", "sapphire", "mint"), only="solid")
    _pick(v, k, win & (d < 1.25), cols=("ruby", "rose", "amber_glass", "ruby", "amber_glass"), only="solid")
    v.paint("amber_glass", win & (d < 0.55))
    trace = (np.minimum(m, seg - m) * d < 0.085) & (d > 0.5) | ((d > 0.5) & (d < 0.7)) | ((d > 1.2) & (d < 1.36))
    v.fill("lead", win & trace & (np.abs(Y) < 0.9))
    # panes let into the piers, front, back and outer sides
    pz = (Z > 0.6) & (Z < 4.0)
    sg = np.floor((Z - 0.6) / 0.68)
    bar = np.mod(Z - 0.6, 0.68) < 0.14
    strip = (np.abs(np.abs(X) - 2.45) < 0.25) & pz & ~bar
    v.fill(None, strip & (np.abs(Y) > 1.1))
    _pick(v, sg * 3 + (X > 0) * 2 + (Y > 0) * 5, strip & (np.abs(Y) > 0.95), only="solid")
    side = (np.abs(Y) < 0.8) & pz & ~bar & (np.abs(np.abs(Y) - 0.0) > 0.1)
    v.fill(None, side & (np.abs(X) > 2.8))
    _pick(v, sg * 3 + 1 + (X > 0) * 4 + (Y > 0), side & (np.abs(X) > 2.65), only="solid")
    v.paint("gold", (Z > 4.1) & (Z < 4.4) & (np.abs(X) > 2), only=("lead", "dusk"))
    v.paint("navy", (Z < 0.4), only=("lead", "dusk"))
    v.paint("gold", goth(0) & ~goth(0.14) & (np.abs(Y) > 1.0) & (np.mod(Z, 0.8) < 0.2))
    v.rod("lead", (0, 0, 7.7), (0, 0, 8.05), 0.14, 0.1)
    v.ball("gold_soft", (0, 0, 8.15), 0.22)
    return v.done("glass-arch", keep=0.12)


def _skirt(v, x, y, z, r, s=1.0):
    """A ring of little glass drops round a lantern."""
    for i, c in enumerate(("ruby", "sapphire", "rose", "emerald", "lilac", "mint")):
        a = i * math.pi / 3 + 0.3
        v.ball(c, (x + r * math.cos(a), y + r * math.sin(a), z), (0.075 * s, 0.075 * s, 0.1 * s))


@asset("glass-lamp", "glass", "street lamp, 3 m, a glass lantern on a lead post")
def glass_lamp():
    v = V((-0.6, -0.6, 0), (0.6, 0.6, 3.0))
    v.rod("lead", (0, 0, 0), (0, 0, 0.14), 0.3)
    v.rod("lead", (0, 0, 0.14), (0, 0, 0.55), 0.2, 0.1)
    v.ball("gold", (0, 0, 0.6), (0.14, 0.14, 0.08))
    v.path("lead", [(0, 0, 0.5), (0.04, 0, 1.2), (-0.03, 0, 1.9), (0, 0, 2.3)], 0.09, 0.075)
    for sx in (-1, 1):  # scrolls under the lantern
        v.path("lead", [(0, 0, 1.95), (sx * 0.2, 0, 2.1), (sx * 0.38, 0, 2.02)], 0.065, 0.06)
        v.ball("amber_glass" if sx < 0 else "rose", (sx * 0.38, 0, 1.87), (0.09, 0.09, 0.12))
    v.rod("lead", (0, 0, 2.2), (0, 0, 2.3), 0.2, 0.26)
    _skirt(v, 0, 0, 2.2, 0.27)
    lantern(v, (0, 0, 2.94), 1.5, frame="lead")
    v.rod("lead", (0, 0, 2.82), (0, 0, 3.0), 0.34, 0.06)  # a pointed hat
    v.paint("sapphire", (v.Z > 2.82) & (v.Z < 2.9) & (np.mod(np.arctan2(v.Y, v.X), 0.7854) < 0.4), only="lead")
    return v.done("glass-lamp", keep=0.35)


@asset("glass-lamp-hang", "glass", "hanging glass lantern, 1.2 m; origin at the top")
def glass_lamp_hang():
    v = V((-0.4, -0.4, -1.2), (0.4, 0.4, 0), vpm=20)
    v.rod("lead", (0, 0, -0.5), (0, 0, 0), 0.055)
    for i in range(3):
        v.ball("lead", (0, 0, -0.08 - i * 0.14), (0.085, 0.06, 0.07) if i % 2 else (0.06, 0.085, 0.07))
    v.rod("lead", (0, 0, -0.58), (0, 0, -0.4), 0.32, 0.06)
    v.paint("ruby", (v.Z < -0.5) & (np.mod(np.arctan2(v.Y, v.X), 0.7854) < 0.4), only="lead")
    lantern(v, (0, 0, -0.53), 1.45, frame="lead")
    _skirt(v, 0, 0, -1.1, 0.2, 0.9)
    return v.done("glass-lamp-hang", keep=0.4)


@asset("finish-shrine", "glass", "the shrine at the top of the tower: a 4 m wide, 4.5 m tall glass canopy over a light; the owl walks under")
def finish_shrine():
    v = V((-2, -1.25, 0), (2, 1.25, 4.5), vpm=12)
    X, Y, Z = v.X, v.Y, v.Z
    A, B, H, z0 = 2.0, 1.25, 1.25, 2.9

    def e(g):
        return (X / (A + g)) ** 2 + (Y / (B + g)) ** 2 + ((Z - z0) / (H + g)) ** 2 <= 1

    n = 12
    seg = 2 * math.pi / n
    th = np.arctan2(Y / B, X / A) + math.pi
    k = np.floor(th / seg)
    m = np.mod(th, seg)
    rib = np.minimum(m, seg - m) * np.hypot(X, Y) < 0.1
    dome = Z >= z0
    hi = Z > 3.5
    shell = e(-0.09) & ~e(-0.34) & dome
    _pick(v, k, shell & ~hi, cols=("ruby", "amber_glass", "sapphire", "rose", "emerald", "amber_glass"))
    _pick(v, k + 1, shell & hi, cols=("lilac", "glass_blue", "mint", "amber_glass"))
    v.fill("lead", e(0) & ~e(-0.34) & dome & (rib | (np.abs(Z - 3.5) < 0.07)))
    rim = ((X / A) ** 2 + (Y / B) ** 2 <= 1) & ((X / (A - 0.32)) ** 2 + (Y / (B - 0.32)) ** 2 > 1) & (Z > 2.62) & (Z < z0 + 0.05)
    v.fill("lead", rim)
    v.paint("gold", rim & (Z < 2.76))
    for i in range(n):  # drops of glass under the rim, between the ribs
        a = (i + 0.5) * seg - math.pi
        v.ball(PANES[(i * 3) % 8], ((A - 0.16) * math.cos(a), (B - 0.16) * math.sin(a), 2.58), (0.14, 0.14, 0.17))
    for sx in (-1, 1):
        for sy in (-1, 1):
            v.path("lead", [(sx * 1.56, sy * 0.72, 0), (sx * 1.5, sy * 0.7, 1.4), (sx * 1.5, sy * 0.7, 2.7)], 0.13, 0.1)
            v.ball("lead", (sx * 1.56, sy * 0.72, 0.08), (0.24, 0.22, 0.14))
            v.ball(("ruby", "sapphire", "emerald", "rose")[(sx > 0) * 2 + (sy > 0)], (sx * 1.5, sy * 0.7, 1.45), 0.19)
            v.ball("gold", (sx * 1.5, sy * 0.7, 2.45), (0.17, 0.17, 0.08))
    # the light it keeps
    v.rod("lead", (0, 0, 3.5), (0, 0, 4.1), 0.1)
    v.ball("gold", (0, 0, 3.62), (0.2, 0.2, 0.09))
    v.rod("lead", (0, 0, 3.0), (0, 0, 3.6), 0.09)
    v.ball("moon_glow", (0, 0, 2.64), 0.36)
    v.rod("gold", (0, 0, 4.05), (0, 0, 4.5), 0.14, 0.08)
    v.ball("gold_soft", (0, 0, 4.28), 0.17)
    return v.done("finish-shrine", keep=0.2)



@asset("glass-circlet", "glass", "the Glass Circlet, a prize to wear: a crown-band 0.6 m across with glass gems; origin at its centre")
def glass_circlet():
    v = V((-0.3, -0.3, -0.1), (0.3, 0.3, 0.2), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    r = np.hypot(X, Y)
    th = np.arctan2(Y, X) + math.pi / 2  # 0 at the front
    front = 0.5 + 0.5 * np.cos(th)
    peak = np.clip(np.cos(5 * th), 0, 1) ** 2
    v.fill("gold", (np.abs(r - 0.232) < 0.04) & (Z > -0.055) & (Z < 0.015 + 0.11 * peak * (0.6 + 0.4 * front)))
    v.paint("amber", Z < -0.03)
    gems = ("ruby", "sapphire", "emerald", "amber_glass", "rose")
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        big = 1.2 if i == 0 else 1.0
        v.ball(gems[i], (0.256 * math.cos(a), 0.256 * math.sin(a), 0.01), (0.044 * big, 0.044 * big, 0.052 * big))
        b = a + math.pi / 5
        v.ball(("mint", "lilac", "glass_blue")[i % 3], (0.265 * math.cos(b), 0.265 * math.sin(b), -0.018), 0.031)
    return v.done("glass-circlet", keep=0.7, relax=3)




@asset("pane-shards", "glass", "a cluster of broken panes leaning together, 1.5 m")
def pane_shards():
    v = V((-0.8, -0.5, 0), (0.8, 0.5, 1.5), vpm=24)
    X, Y, Z = v.X, v.Y, v.Z
    shards = [
        # colour, second colour, outline (square below, broken above), y at the foot, lean per metre up, skew per metre along, the came across it
        ("sapphire", "glass_blue", [(-0.76, 0), (-0.22, 0), (-0.22, 0.98), (-0.36, 1.5), (-0.5, 1.12), (-0.62, 1.3), (-0.76, 0.9)], 0.22, 0.12, 0.1, (0.62, 0.3)),
        ("ruby", "rose", [(0.04, 0), (0.6, 0), (0.6, 0.7), (0.44, 1.18), (0.3, 0.85), (0.04, 1.0)], 0.06, -0.14, -0.1, (0.5, -0.25)),
        ("amber_glass", "mint", [(0.34, 0), (0.78, 0), (0.78, 0.36), (0.6, 0.72), (0.34, 0.5)], -0.34, 0.1, 0.25, (0.28, 0.2)),
        ("emerald", "amber_glass", [(-0.5, 0), (0.1, 0), (0.1, 0.42), (-0.14, 0.62), (-0.3, 0.86), (-0.5, 0.6)], -0.36, -0.08, 0.05, (0.34, -0.2)),
        ("lilac", "lilac", [(-0.79, 0), (-0.52, 0), (-0.52, 0.3), (-0.66, 0.56), (-0.79, 0.38)], -0.16, 0.3, -0.2, (0.9, 0)),
    ]
    for c1, c2, pts, y0, lean, skew, (ca, cb) in shards:
        poly = _poly2(v, pts)
        off = np.abs(Y - (y0 + lean * Z + skew * X))
        came = Z - (ca + cb * X)
        x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
        v.fill(c1, poly & (off < 0.05))
        v.fill(c2, poly & (off < 0.05) & (came > 0))
        # the lead that still holds them: along the foot, up the square sides, across the middle
        lead = (Z < 0.09) | (np.abs(came) < 0.045) | ((X < x0 + 0.075) | (X > x1 - 0.075)) & (Z < pts[2][1] if len(pts) > 2 else True)
        v.fill("lead", poly & lead & (off < 0.085))
    for x, y, c in ((-0.55, -0.42, "lead"), (0.25, 0.34, "lead"), (0.6, 0.14, "dusk"), (-0.15, -0.45, "rose"), (0.5, -0.45, "glass_blue")):
        v.ball(c, (x, y, 0.02), (0.12, 0.08, 0.06))
    return v.done("pane-shards", keep=0.18, relax=1)


@asset("tower-spire", "glass", "backdrop spire, 6 m wide, 20 m tall, 2 m deep: dusk blue with lit windows")
def tower_spire():
    v = V((-3, -1, 0), (3, 1, 20), vpm=4)
    X, Y, Z = v.X, v.Y, v.Z
    wm = 2.0 - 0.02 * Z
    main = ((X / wm) ** 2 + Y**2 < 1) & (Z < 11.5)
    v.fill("dusk", main)
    v.fill("lead", ((X / 2.3) ** 2 + (Y / 1.0) ** 2 < 1) & (Z > 11.0) & (Z < 11.75))
    t = np.clip((Z - 11.5) / 8.5, 0, 1)
    wr = 2.3 * (1 - t) ** 0.85 + 0.02
    roof = ((X / wr) ** 2 + (Y / np.minimum(1.0, wr * 0.6 + 0.1)) ** 2 < 1) & (Z >= 11.5)
    v.fill("navy", roof)
    v.paint("lead", roof & (np.mod(Z + np.abs(X) * 0.8, 1.5) < 0.5))
    for sx in (-1, 1):
        tur = (((X - sx * 2.2) / 0.8) ** 2 + (Y / 0.8) ** 2 < 1) & (Z < 7.5)
        v.fill("dusk", tur, only="air")
        tt = np.clip((Z - 7.5) / 3.0, 0, 1)
        wt = 0.8 * (1 - tt) ** 0.6 + 0.05
        v.fill("navy", (((X - sx * 2.2) / wt) ** 2 + (Y / wt) ** 2 < 1) & (Z >= 7.5) & (Z < 10.5), only="air")
        v.fill("lead", (((X - sx * 2.2) / 0.8) ** 2 + (Y / 0.8) ** 2 < 1) & (Z >= 7.25) & (Z < 7.75))
        v.ball("gold_soft", (sx * 2.2, 0, 10.5), 0.3)
    v.paint("navy", (v.noise(2.2, 8) > 0.6) & (Z < 11), only="dusk")
    v.paint("lead", ((np.mod(Z, 3.0) < 0.25) | (Z < 0.5)) & (Z < 11), only=("dusk", "navy"))
    # the windows, let into the wall so they keep their shape: mostly lit, a few dark
    lit = ("amber_glass", "gold_soft", "amber_glass", "rose", "amber_glass", "mint", "navy_deep", "gold_soft", "lilac", "amber_glass", "navy_deep")
    deep = (X / (wm - 0.3)) ** 2 + (Y / 0.75) ** 2 > 1
    i = 0
    for z in (1.25, 4.25, 7.25, 9.5):
        for x in (-1, 0, 1):
            if z > 9 and x != 0:
                continue
            c = lit[(i * 5 + 2) % len(lit)]
            i += 1
            w = (np.abs(X - x) < 0.3) & (Z > z) & (Z < z + 1.25)
            v.fill(None, w & deep)
            v.paint(c, w)
            v.paint("lead", (np.abs(X - x) < 0.55) & (Z > z - 0.25) & (Z < z), only="dusk")
    for sx in (-1, 1):
        for j, z in enumerate((2.5, 5.0)):
            w = (np.abs(X - sx * 2.25) < 0.2) & (Z > z) & (Z < z + 1.0)
            v.fill(None, w & (((X - sx * 2.2) / 0.55) ** 2 + (Y / 0.55) ** 2 > 1) & (np.abs(Y) > 0.3))
            v.paint(lit[(j * 3 + (sx > 0) * 4 + 1) % len(lit)], w)
    rr = np.hypot(X, Z - 13.3)  # a round window in the roof, front and back
    v.paint("lead", rr < 1.0)
    v.fill(None, (rr < 0.7) & (np.abs(Y) > 0.75))
    v.paint("rose", rr < 0.7)
    v.paint("amber_glass", rr < 0.3)
    v.rod("lead", (0, 0, 17.5), (0, 0, 20), 0.3, 0.27)
    v.ball("gold_soft", (0, 0, 19.0), 0.45)
    return v.done("tower-spire", keep=0.12)



@asset("glass-buttress", "glass", "flying buttress, 5 m wide, 6 m tall: the pier on the right, the flyer rising to the wall on the left")
def glass_buttress():
    v = V((-2.5, -0.5, 0), (2.5, 0.5, 6), vpm=8)
    X, Y, Z = v.X, v.Y, v.Z
    # the pier, stepped, under a pinnacle
    xl = np.where(Z < 1.0, 1.25, np.where(Z < 3.0, 1.5, 1.625))
    v.fill("lead", (X > xl) & (Z < 4.25))
    tp = np.clip((Z - 4.25) / 1.75, 0, 1)
    v.fill("lead", (np.abs(X - 2.0) < 0.5 * (1 - tp) + 0.13) & (np.abs(Y) < 0.5 * (1 - tp) + 0.13) & (Z >= 4.25))
    v.paint("gold_soft", Z > 5.6)
    v.paint("gold", (Z > 4.1) & (Z < 4.4))
    v.paint("navy", Z < 0.5)
    lanc = (np.abs(X - 2.06) < 0.26) & (Z > 1.4) & (Z < 3.7) & (np.abs(np.mod(Z - 1.4, 0.8) - 0.74) > 0.07)
    v.fill(None, lanc & (np.abs(Y) > 0.375))
    _pick(v, np.floor((Z - 1.4) / 0.8) + (Y > 0) * 2, lanc & (np.abs(Y) > 0.25), cols=("amber_glass", "rose", "amber_glass", "mint", "lilac"), only="solid")
    # the flyer: an arch below, a slope above, and a fan of glass between
    cx, cz, R = -2.5, 0.2, 3.5
    d = np.hypot(X - cx, Z - cz)
    top = 5.6 - (X + 2.5) * 0.4
    web = (d > R) & (Z < top) & (X <= xl) & (Z > cz)
    th = np.arctan2(Z - cz, X - cx)
    seg = math.pi / 2 / 6
    k = np.floor(th / seg)
    m = np.mod(th, seg)
    v.fill("sapphire", web & (np.abs(Y) < 0.125))
    _pick(v, k, web & (np.abs(Y) < 0.125), cols=("ruby", "amber_glass", "emerald", "rose", "sapphire", "amber_glass", "lilac"))
    _pick(v, k, web & (d > 4.5) & (np.abs(Y) < 0.125), cols=("mint", "lilac", "amber_glass", "glass_blue", "rose", "emerald"))
    trace = (np.minimum(m, seg - m) * d < 0.11) | (np.abs(d - 4.5) < 0.11)
    v.fill("lead", web & trace & (np.abs(Y) < 0.25))
    v.fill("lead", web & ((d < R + 0.27) | (Z > top - 0.27) | (X < -2.25)) & (np.abs(Y) < 0.375))
    for i in range(5):  # crockets up the slope
        x = -2.1 + i * 0.8
        v.ball("lead" if i % 2 else "gold", (x, 0, 5.6 - (x + 2.5) * 0.4 + 0.02), (0.2, 0.22, 0.2))
    return v.done("glass-buttress", keep=0.2)


@asset("keeper-stall", "glass", "a keeper's stall under a glass awning, 3 m wide and tall, behind the path")
def keeper_stall():
    v = V((-1.5, 0.75, 0), (1.5, 2.5, 3.0))
    X, Y, Z = v.X, v.Y, v.Z
    v.box("wood", (-1.3, 1.05, 0), (1.3, 1.95, 0.95))
    v.paint("bark", (np.mod(X + 1.3, 0.45) < 0.07) | (v.noise(0.5, 2) > 0.66))
    # a band of little panes along the counter front
    band = (Y < 1.12) & (Z > 0.3) & (Z < 0.72) & (np.abs(X) < 1.2)
    v.paint("lead", band)
    _pick(v, np.floor((X + 1.2) / 0.4) * 3, band & (np.mod(X + 1.2, 0.4) > 0.09) & (Z > 0.37) & (Z < 0.65), only="solid")
    v.box("wood_light", (-1.42, 0.92, 0.95), (1.42, 2.02, 1.08))
    for sx in (-1, 1):
        v.path("lead", [(sx * 1.32, 2.2, 0), (sx * 1.34, 2.2, 1.5), (sx * 1.3, 2.2, 2.85)], 0.09, 0.08)
        v.rod("lead", (sx * 1.32, 1.0, 1.05), (sx * 1.36, 0.95, 2.3), 0.07)
    v.box("dusk", (-1.3, 2.12, 1.0), (1.3, 2.28, 2.6))
    v.paint("navy", (v.noise(0.6, 5) > 0.55), only="dusk")
    v.box("wood_light", (-1.2, 1.9, 1.75), (1.2, 2.15, 1.84))
    # wares: bottles and baubles of glass
    wares = [(-1.0, 1.35, "rose"), (-0.68, 1.6, "mint"), (-0.3, 1.3, "lilac"), (0.12, 1.55, "amber_glass"), (0.45, 1.3, "glass_blue"), (0.8, 1.6, "ruby")]
    for i, (x, y, c) in enumerate(wares):
        hgt = 0.2 + 0.06 * (i % 3)
        v.ball(c, (x, y, 1.08 + hgt * 0.6), (0.13, 0.13, hgt * 0.7))
        v.rod(c, (x, y, 1.08 + hgt), (x, y, 1.08 + hgt + 0.14), 0.055)
        v.ball("gold", (x, y, 1.08 + hgt + 0.17), 0.06)
    for i, (x, c) in enumerate(((-0.9, "emerald"), (-0.4, "amber_glass"), (0.1, "rose"), (0.6, "sapphire"), (1.0, "mint"))):
        v.ball(c, (x, 2.0, 1.84 + 0.14), (0.12, 0.1, 0.15))
    # the awning: stripes of glass between lead ribs, scalloped along the front
    slope = 2.24 + (Y - 0.8) * 0.44
    stripe = np.floor((X + 1.5) / 0.5)
    ribm = (np.mod(X + 1.5, 0.5) < 0.07) | (np.mod(X + 1.5, 0.5) > 0.43)
    cols = ("ruby", "amber_glass", "mint", "rose", "sapphire", "amber_glass")
    _pick(v, stripe, np.abs(Z - slope) < 0.075, cols=cols)
    v.fill("lead", (np.abs(Z - slope) < 0.13) & (ribm | (Y > 2.36) | (Y < 0.9)))
    sc = (np.hypot(np.mod(X + 1.5, 0.5) - 0.25, Z - 2.2) < 0.25) & (Z < 2.2) & (Y < 0.9)
    _pick(v, stripe + 2, sc, cols=cols)
    lantern(v, (0.98, 1.15, 2.3), 0.95, frame="lead")
    return v.done("keeper-stall", keep=0.06)


# ---- what sets the owl back ---------------------------------------------------------------------



@asset("thorn-bed", "hazards", "a briar tangle, 2 m wide, 0.5 m tall, 2 m deep; tiles in x")
def thorn_bed():
    v = V((-1, -1, 0), (1, 1, 0.5), open="x")
    X, Y, Z = v.X, v.Y, v.Z
    pi = math.pi
    # the ground it grows from; every wave has a whole number of turns in 2 m so the ends meet
    bump = 0.11 + 0.04 * np.sin(pi * X * 2 + Y * 3) + 0.03 * np.sin(pi * X * 3 - Y * 5 + 1)
    bump = np.maximum(bump * np.clip((1.02 - np.abs(Y)) / 0.3, 0.45, 1), 0.07)
    v.fill("bark_dark", Z < bump)
    v.paint("leaf_dark", np.sin(pi * X * 3 + Y * 5) > 0.3)
    rng = np.random.default_rng(11)
    spikes = []
    for i in range(9):
        x0, y0 = -1 + (i + rng.uniform(0.2, 0.8)) * 2 / 9, (-0.8, 0.1, 0.75, -0.3, 0.5, -0.65, 0.3, -0.1, 0.8)[i]
        dx = rng.uniform(0.6, 1.0) * (1 if i % 2 else -1)
        y1 = float(np.clip(y0 + rng.uniform(-0.6, 0.6), -0.85, 0.85))
        hgt = rng.uniform(0.24, 0.36)
        pts = [(x0, y0, 0.05), (x0 + dx * 0.25, y0 + (y1 - y0) * 0.25, hgt), (x0 + dx * 0.7, y0 + (y1 - y0) * 0.7, hgt * 0.9), (x0 + dx, y1, 0.05)]
        for f in (0.15, 0.5, 0.85):  # thorns stand up along the arch of each stem
            a, b = pts[1], pts[2]
            p = tuple(a[k] + (b[k] - a[k]) * f for k in range(3))
            tip = (p[0] + rng.uniform(-0.1, 0.1), float(np.clip(p[1] + rng.uniform(-0.12, 0.12), -0.93, 0.93)), min(p[2] + rng.uniform(0.14, 0.2), 0.47))
            spikes.append((p, tip, 0.06))
        for sh in (-2, 0, 2):
            v.path("thorn", [(x + sh, y, z) for x, y, z in pts], 0.085, 0.07)
    for x, y in ((-0.72, -0.5), (0.3, -0.72), (0.82, 0.25), (-0.2, 0.55), (-0.45, -0.05), (0.55, 0.72), (0.1, -0.2)):  # the tallest reach the full half metre
        spikes.append(((x, y, 0.05), (x + 0.06, y, 0.47), 0.085))
    for p, tip, r in spikes:
        for sh in (-2, 0, 2):
            v.rod("thorn", (p[0] + sh, p[1], p[2]), (tip[0] + sh, tip[1], tip[2]), r, 0.035, flat=False)
    # the stems are dark, bark mottled into the briar red, so the tips are what glows
    v.paint("bark_dark", (np.sin(pi * X * 5 + Y * 7 + Z * 9) > -0.1) & (Z < 0.3), only="thorn")
    v.paint("violet", (np.sin(pi * X * 4 - Y * 9 + Z * 5) > 0.8), only="thorn")
    for p, tip, r in spikes:
        for sh in (-2, 0, 2):
            v.ball("thorn_tip", (tip[0] + sh, tip[1], tip[2]), 0.06)
    return v.done("thorn-bed", keep=0.19)



@asset("lamp-moth", "hazards", "a moth drawn to lamps, 0.6 m across; origin at the body, the wings flap from their roots")
def lamp_moth():
    b = V((-0.14, -0.12, -0.2), (0.14, 0.12, 0.29), vpm=32)
    X, Y, Z = b.X, b.Y, b.Z
    fuzz = 0.02 * b.noise(0.035, 3)
    b.fill("moth", (X / (0.045 + fuzz)) ** 2 + (Y / (0.05 + fuzz)) ** 2 + ((Z + 0.07) / 0.12) ** 2 < 1)
    b.fill("moth", (X / (0.062 + fuzz)) ** 2 + (Y / (0.065 + fuzz)) ** 2 + ((Z - 0.04) / (0.065 + fuzz)) ** 2 < 1)
    b.paint("sand_owl", (np.mod(Z, 0.06) < 0.028) & (Z < -0.02))
    b.paint("cream", (b.noise(0.03, 5) > 0.6) & (Z > -0.02))
    b.ball("owl_accent", (0, -0.01, 0.125), (0.05, 0.05, 0.045))
    for sx in (-1, 1):
        b.ball("pupil", (sx * 0.032, -0.042, 0.135), 0.024)
        b.path("owl_accent", [(sx * 0.02, 0, 0.15), (sx * 0.06, 0, 0.215), (sx * 0.105, 0, 0.255)], 0.03, 0.03)
    body = b.done("lamp-moth", keep=0.7)
    out = [body]
    upper = [(0.0, -0.01), (0.04, 0.12), (0.17, 0.2), (0.262, 0.185), (0.25, 0.07), (0.14, -0.02)]
    lower = [(0.0, 0.03), (0.14, 0.0), (0.2, -0.07), (0.18, -0.16), (0.09, -0.19), (0.02, -0.1)]
    for sx, side in ((-1, "L"), (1, "R")):
        lo, hi = (-0.27, 0.01) if sx < 0 else (-0.01, 0.27)
        w = V((lo, -0.06, -0.2), (hi, 0.06, 0.22), vpm=32)
        X, Y, Z = w.X * sx, w.Y, w.Z  # X runs outward from the root on both wings
        flat = np.abs(Y) < 0.036
        shape = _poly2(w, [(x * sx, z) for x, z in upper]) | _poly2(w, [(x * sx, z) for x, z in lower])
        w.fill("moth", shape & flat)
        dr = np.hypot(X, Z - 0.02)
        w.paint("sand_owl", dr > 0.19)
        w.paint("owl_accent", (dr > 0.235) | (np.abs(dr - 0.13) < 0.016))
        w.paint("cream", (np.abs(dr - 0.085) < 0.014))
        ds = np.hypot(X - 0.17, Z - 0.12)
        w.paint("owl_accent", ds < 0.052)
        w.paint("amber_glass", ds < 0.034)
        dl = np.hypot(X - 0.12, Z + 0.1)
        w.paint("owl_accent", dl < 0.042)
        w.paint("lilac", dl < 0.026)
        out.append(child(w.done(f"lamp-moth.wing{side}", loc=(sx * 0.035, 0, 0.03), keep=0.85), body))
    return out


@asset("swing-lantern", "hazards", "a heavy lantern on a 3 m chain that swings across the way; origin at the pivot, the lantern centred 3 m below")
def swing_lantern():
    v = V((-0.5, -0.5, -3.5), (0.5, 0.5, 0))
    X, Y, Z = v.X, v.Y, v.Z
    for i in range(13):  # the chain: links turned edge on and face on by turns
        v.ball("lead", (0, 0, -0.1 - i * 0.2), (0.115, 0.06, 0.135) if i % 2 else (0.06, 0.115, 0.135))
    v.rod("lead", (0, 0, -0.1), (0, 0, 0), 0.1)
    r3 = np.sqrt(X**2 + Y**2 + (Z + 3) ** 2)
    th = np.arctan2(Y, X) + math.pi
    seg = math.pi / 4
    k = np.floor((th + seg / 2) / seg)
    m = np.mod(th + seg / 2, seg)
    _pick(v, k, r3 < 0.44, cols=("ruby", "amber_glass"))
    v.paint("amber_glow", (r3 < 0.44) & (np.abs(Z + 3.0) < 0.14) & (np.mod(k, 2) == 1))
    rib = np.minimum(m, seg - m) * np.hypot(X, Y) < 0.055
    v.fill("lead", (r3 <= 0.5) & (rib | (np.abs(Z + 3) < 0.06) | (np.abs(Z + 3) > 0.4)))
    v.rod("lead", (0, 0, -2.62), (0, 0, -2.5), 0.2, 0.09)
    v.paint("gold", (np.abs(Z + 3) < 0.06) & (np.mod(th, seg) < 0.3))
    return v.done("swing-lantern", keep=0.4)


FRAIL_SEEDS = ((-0.62, -0.5), (0.1, -0.62), (0.68, -0.25), (-0.5, 0.42), (0.14, 0.3), (0.7, 0.62))


def _frail_cells(X, Y):
    """Which shard a point of the pane belongs to, and how far it is from the nearest break."""
    ds = np.stack(np.broadcast_arrays(*[np.hypot(X - sx + 0.06 * np.sin(7 * Y + i), Y - sy + 0.06 * np.sin(6 * X + 2 * i)) for i, (sx, sy) in enumerate(FRAIL_SEEDS)]))
    order = np.sort(ds, axis=0)
    return np.argmin(ds, axis=0), order[1] - order[0]


def _frail_fill(v, ox=0.0, oy=0.0, oz=0.0, shard=None):
    """The frail pane, whole or one shard of it, sculpted into a block whose origin is at (ox, oy, oz)."""
    X, Y, Z = v.X + ox, v.Y + oy, v.Z + oz
    cell, gap = _frail_cells(X, Y)
    m = (np.abs(X) < 1) & (np.abs(Y) < 1) & (Z < 0) & (Z > -0.3)
    if shard is not None:
        m = m & (cell == shard) & (gap > 0.07)
    v.fill("glass_blue", m)
    v.paint("cloud", np.sin(X * 5 + Y * 3) * np.sin(Y * 6 - X * 2) > 0.45)
    v.paint("mint", np.sin(X * 3 - Y * 4 + 2) > 0.9)
    edge = (np.abs(X) > 0.85) | (np.abs(Y) > 0.85)
    v.paint("lead", edge & ((Z > -0.1) | (Z < -0.2) | ((np.abs(X) > 0.85) & (np.abs(Y) > 0.85))))
    if shard is None:
        crack = (gap < 0.06) | (np.abs(Y - 0.2 - 0.5 * X) < 0.03) & (X > 0.25) & (X < 0.6) | (np.abs(X + 0.25 + 0.4 * Y) < 0.03) & (Y > -0.2) & (Y < 0.25)
        v.paint("moon_glow", crack, only=("glass_blue", "cloud", "mint"))
        v.fill(None, crack & (Z > -0.05) & ~edge)
        v.fill(None, crack & (np.abs(Y) > 0.95) & (Z < -0.1) & (Z > -0.2))
    else:
        v.paint("moon_glow", (gap < 0.1), only=("glass_blue", "cloud", "mint"))
    return v


@asset("frail-glass", "hazards", "a thin pane to stand on, 2 m by 2 m, 0.3 m thick, top at z = 0; it breaks after the owl stands on it")
def frail_glass():
    v = V((-1, -1, -0.3), (1, 1, 0), vpm=20)
    return _frail_fill(v).done("frail-glass", keep=0.15)


@asset("frail-glass-shards", "hazards", "the frail pane as six shards under one root, for the break")
def frail_glass_shards():
    root = bpy.data.objects.new("frail-glass-shards", None)
    root.empty_display_size = 0.3
    out = [root]
    U = 1 / 20
    g = (np.arange(40) + 0.5) * U - 1
    cell, gap = _frail_cells(g[:, None, None], g[None, :, None])
    for i in range(6):
        own = (cell[:, :, 0] == i) & (gap[:, :, 0] > 0.07)
        xs, ys = np.flatnonzero(own.any(axis=1)), np.flatnonzero(own.any(axis=0))
        lo = (xs[0] * U - 1, ys[0] * U - 1)
        hi = ((xs[-1] + 1) * U - 1, (ys[-1] + 1) * U - 1)
        cx = round((lo[0] + hi[0]) / 2 / U) * U  # the origin sits on the voxel grid so the shards keep the pane's own lattice
        cy = round((lo[1] + hi[1]) / 2 / U) * U
        v = V((lo[0] - cx, lo[1] - cy, -0.15), (hi[0] - cx, hi[1] - cy, 0.15), vpm=20)
        _frail_fill(v, cx, cy, -0.15, shard=i)
        out.append(child(v.done(f"frail-glass-shards.{i + 1}", loc=(cx, cy, -0.15), keep=0.2), root))
    return out



@asset("wind-gust", "hazards", "a 1 m square of wind streaks blowing sideways; the map scales it")
def wind_gust():
    v = V((-0.5, -0.15, 0), (0.5, 0.15, 1.0))
    streaks = [
        [(-0.48, 0, 0.83), (-0.2, 0, 0.87), (0.1, 0, 0.83), (0.34, 0, 0.86), (0.44, 0, 0.94)],
        [(-0.22, 0, 0.55), (0.05, 0, 0.52), (0.28, 0, 0.56), (0.48, 0, 0.53)],
        [(-0.48, 0, 0.28), (-0.2, 0, 0.24), (0.08, 0, 0.28), (0.3, 0, 0.22), (0.38, 0, 0.11)],
        [(-0.48, 0.03, 0.56), (-0.36, 0.03, 0.55)],
        [(-0.05, -0.03, 0.065), (0.18, -0.03, 0.065)],
    ]
    for pts in streaks:  # each swells from a thin tail and thins again
        h = len(pts) // 2
        v.path("gust", pts[: h + 1], 0.045, 0.066)
        v.path("gust", pts[h:], 0.066, 0.04)
    return v.done("wind-gust", keep=0.45)


# ---- the sky -------------------------------------------------------------------------------------


@asset("cloud-cap", "sky", "a cloud to stand on, 10 m wide, top at z = 0, 2.5 m thick, 4 m deep")
def cloud_cap():
    v = V((-5, -2, -2.5), (5, 2, 0), vpm=8)
    X, Y, Z = v.X, v.Y, v.Z
    # a deck that is flat on top, then puffs hung under and round it
    v.fill("cloud", ((X / 5) ** 4 + (Y / 2) ** 4 < 1) & (Z > -0.75 * (1 - (X / 5) ** 4) - 0.2))
    rng = np.random.default_rng(12)
    for x in np.linspace(-3.9, 3.9, 8):
        x += rng.uniform(-0.2, 0.2)
        rx = rng.uniform(0.95, 1.25)
        x = float(np.clip(x, -5 + rx, 5 - rx))
        y = rng.uniform(-0.5, 0.5)
        ry = min(rng.uniform(1.2, 1.5), 2 - abs(y))
        v.ball("cloud", (x, y, rng.uniform(-1.0, -0.6)), (rx, ry, rng.uniform(0.8, 1.1)))
    for x, y, r in ((0.4, 0.2, 1.3), (-1.9, -0.3, 1.1), (2.2, 0.3, 1.0)):
        v.ball("cloud", (x, y, -1.2), (1.5, 1.3, r))
    for _ in range(9):
        x, y = rng.uniform(-4.2, 4.2), rng.choice([-1, 1]) * rng.uniform(1.1, 1.45)
        v.ball("cloud", (x, y, rng.uniform(-0.9, -0.45)), (rng.uniform(0.5, 0.75), 0.5, rng.uniform(0.4, 0.6)))
    for i in range(16):  # puffs all round the brim, level with the top
        a = i * math.pi / 8 + 0.2
        v.ball("cloud", (4.25 * math.cos(a), 1.5 * math.sin(a), -0.5 + 0.1 * math.sin(i * 2.4)), (0.75, 0.5, 0.62))
    n = v.noise(1.6, 4)
    v.paint("glass_blue", (Z < -1.0 - 0.6 * n))
    v.paint("lilac", (Z < -1.5 - 0.5 * n) & (v.noise(1.2, 9) > 0.45))
    v.paint("heron", (Z < -2.0 - 0.3 * n))
    return v.done("cloud-cap", keep=0.07, relax=3)


def _cloud(name, w, h, seed):
    v = V((-w / 2, -1, 0), (w / 2, 1, h), vpm=4)
    X, Y, Z = v.X, v.Y, v.Z
    rng = np.random.default_rng(seed)
    n = max(3, int(w / 1.7))
    peak = rng.uniform(-0.2, 0.2) * w
    for i in range(n):
        f = i / (n - 1)
        rx = rng.uniform(1.0, 1.4) if 0 < i < n - 1 else 1.0
        x = (-w / 2 + rx) + f * (w - 2 * rx)
        top = h * (0.42 + 0.58 * math.exp(-(((x - peak) / (0.3 * w)) ** 2))) * (1.0 if abs(x - peak) < 0.12 * w else rng.uniform(0.82, 1.0))
        cz = top * 0.4
        v.ball("cloud", (x, rng.uniform(-0.15, 0.15), cz), (rx, rng.uniform(0.8, 1.0), top - cz))
    x = float(np.clip(peak, -w / 2 + 1.5, w / 2 - 1.5))
    v.ball("cloud", (x, 0, h * 0.4), (1.5, 1.0, h * 0.6))  # one puff tops out at the full height
    v.fill("cloud", (np.abs(X) < w / 2 - 0.9) & (Z < 0.8) & (np.abs(Y) < 0.9))
    nz = v.noise(1.8, seed)
    v.paint("glass_blue", Z < h * 0.3 + 0.5 * nz - 0.2)
    v.paint("lilac", (Z < h * 0.2 + 0.4 * nz) & (v.noise(1.5, seed + 2) > 0.45))
    v.paint("heron", Z < 0.2 + 0.25 * nz)
    return v.done(name, keep=0.3 if w < 10 else 0.18, relax=3)


for _n, _w, _h, _s in (("cloud-a", 8, 3.0, 3), ("cloud-b", 14, 4.0, 5), ("cloud-c", 6, 2.5, 8)):
    asset(_n, "sky", f"backdrop cloud, {_w} m wide, 2 m deep")(lambda _n=_n, _w=_w, _h=_h, _s=_s: _cloud(_n, _w, _h, _s))


@asset("moon", "sky", "the full moon, 8 m across, 1 m deep; origin at its centre")
def moon():
    v = V((-4, -0.5, -4), (4, 0.5, 4), vpm=8)
    X, Y, Z = v.X, v.Y, v.Z
    seas = ((-1.3, 1.4, 1.25), (0.5, 1.9, 0.9), (1.5, 0.5, 1.05), (-0.3, -0.5, 0.8), (-2.0, -0.8, 0.7), (1.0, -1.9, 0.8), (-0.9, -2.3, 0.5))
    mm = 0
    for x, z, r in seas:
        mm = np.maximum(mm, np.exp(-(((X - x) ** 2 + (Z - z) ** 2) / r**2)))
    n = v.noise(0.9, 6)
    mare = ((mm + 0.22 * (n[:, :1, :] - 0.5)) > 0.5) & (np.hypot(X, Z) < 3.5)
    ry = 0.5 - 0.13 * (mare & (Y < 0))
    v.fill("moon_glow", ((X**2 + Z**2) / 16) ** 2 + (Y / ry) ** 2 <= 1)
    v.paint("moon_mare", mare & (Y < 0))
    for x, z, r in ((2.3, -0.9, 0.3), (-2.4, 0.6, 0.25), (0.2, -2.9, 0.22), (2.2, 2.2, 0.28)):  # a few small craters
        v.paint("moon_mare", (np.abs(np.hypot(X - x, Z - z) - r) < 0.1) & (Y < 0))
    return v.done("moon", keep=0.12, relax=4)


@asset("moon-crescent", "sky", "a crescent moon, 6 m tall; origin at the centre of its circle")
def moon_crescent():
    v = V((-3, -0.4, -3), (3, 0.4, 3), vpm=8)
    X, Y, Z = v.X, v.Y, v.Z
    inner = np.hypot(X - 1.3, Z - 0.35)
    v.fill("moon_glow", (((X**2 + Z**2) / 9) ** 2 + (Y / 0.4) ** 2 <= 1) & (inner > 2.75))
    v.paint("gold_soft", inner < 3.05)
    v.paint("moon_mare", (v.noise(0.8, 3) > 0.66) & (inner > 3.2))
    return v.done("moon-crescent", keep=0.25)


def _stars(name, seed, n, shape):
    v = V((-5, -0.25, 0), (5, 0.25, 10))
    X, Y, Z = v.X, v.Y, v.Z
    rng = np.random.default_rng(seed)
    cols = ("moon_glow", "moon_glow", "moon_glow", "moon_glow", "gold_glow", "gold_soft", "glass_blue", "lilac", "rose", "mint", "moon_glow")
    placed = []
    tries = 0
    while len(placed) < n and tries < 5000:
        tries += 1
        s = 0.12 + 0.23 * rng.random() ** 1.6
        x, z = rng.uniform(-5 + 0.3, 5 - 0.3), rng.uniform(0.3, 10 - 0.3)
        if shape == "band":  # a loose river of stars from corner to corner
            if abs((z - 5) - 0.7 * x + 1.2 * math.sin(x)) > 1.6 + 2.5 * rng.random() ** 3:
                continue
        else:  # a ring with a scatter inside
            dd = math.hypot(x, z - 5)
            if abs(dd - 3.4) > 0.9 and rng.random() > 0.22:
                continue
        if any(math.hypot(x - px, z - pz) < 0.5 + (s + ps) for px, pz, ps in placed):
            continue
        placed.append((x, z, s))
    for i, (x, z, s) in enumerate(placed):
        r = s / 2
        c = cols[int(rng.integers(0, len(cols)))]
        if s < 0.18:  # the smallest: one voxel and its six neighbours, so it is still a whole blob
            v.ball(c, ((math.floor(x * 16) + 0.5) / 16, 1 / 32, (math.floor(z * 16) + 0.5) / 16), 0.07)
            continue
        x, z = round(x * 16) / 16, round(z * 16) / 16
        v.ball(c, (x, 0, z), (r + 0.01, min(r, 0.12), r + 0.01))
        if s > 0.25:  # the big ones twinkle: four soft points
            dx, dz = np.abs(X - x), np.abs(Z - z)
            v.fill(c, (dx**0.6 + dz**0.6 < (r * 1.3) ** 0.6) & (np.abs(Y) < 0.07))
    return v.done(name, keep=0.3)


asset("star-cluster-a", "sky", "a 10 m square of stars in a loose river, at y = 0")(lambda: _stars("star-cluster-a", 4, 36, "band"))
asset("star-cluster-b", "sky", "a 10 m square of stars in a ring, at y = 0")(lambda: _stars("star-cluster-b", 9, 30, "ring"))


@asset("shooting-star", "sky", "a shooting star, a 3 m streak falling to the right; origin at its middle")
def shooting_star():
    v = V((-1.5, -0.3, -0.7), (1.5, 0.3, 0.7))
    X, Y, Z = v.X, v.Y, v.Z
    head = (1.25, 0, -0.42)
    v.rod("gold_soft", (-1.46, 0, 0.5), head, 0.065, 0.16, flat=False)
    v.rod("gold_soft", (-0.75, 0, 0.44), (0.9, 0, -0.16), 0.065, 0.08, flat=False)
    v.rod("gold_soft", (-0.45, 0, 0.0), (0.95, 0, -0.52), 0.065, 0.08, flat=False)
    v.paint("glass_blue", X < -0.55 + 0.25 * np.sin(Z * 9))
    v.paint("lilac", X < -1.1)
    v.paint("moon_glow", X > 0.55)
    dx, dz = np.abs(X - head[0]), np.abs(Z - head[2])
    v.fill("moon_glow", (dx**0.6 + dz**0.6 < 0.27**0.6) & (np.abs(Y) < 0.1))
    v.ball("moon_glow", head, 0.19)
    return v.done("shooting-star", keep=0.4)
