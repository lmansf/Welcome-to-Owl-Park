"""The neon street: a crooked little lantern-town of owls whose lanterns happen to be neon, and the
dark circuit course under it where the power is out.

Two categories: "neon" (street dressing and landmarks) and "circuit" (the blackout course).
Timber, park lanterns and lantern gold tie the street back to the tree; the realm's own accents are
chrome, violet and the magenta, cyan and violet glows.
"""
import math

import numpy as np

from ..core import asset, child
from ..vox import V, register_colour
from .common import lantern

register_colour("neon_plum", "#241B4D")  # a wall tone between neon_dark and violet
register_colour("neon_tube_off", "#57526F")  # a neon tube with the power out
register_colour("neon_magenta_soft", "#FF2AA1", emission=1.6)
register_colour("neon_cyan_soft", "#00E5FF", emission=1.6)
register_colour("neon_violet_soft", "#8A5CFF", emission=1.8)

TAU = 2 * math.pi


# ---- helpers ------------------------------------------------------------------------------------


def _rbm(v, lo, hi, r):
    """The mask of a box with rounded edges."""
    d2 = 0
    for A, a, b in ((v.X, lo[0], hi[0]), (v.Y, lo[1], hi[1]), (v.Z, lo[2], hi[2])):
        h = (b - a) / 2
        rr = min(r, h)
        d = np.maximum(np.abs(A - (a + b) / 2) - (h - rr), 0) / rr
        d2 = d2 + d * d
    return d2 <= 1.0


def _rbox(v, c, lo, hi, r=0.1, only=None):
    return v.fill(c, _rbm(v, lo, hi, r), only)


def _ring(v, c, cx, cz, R, r, y, arc=None, only=None):
    """A tube bent into a circle facing the camera, or the arc of it between two angles."""
    dx, dz = v.X - cx, v.Z - cz
    m = (np.sqrt(dx**2 + dz**2) - R) ** 2 + (v.Y - y) ** 2 <= r * r
    if arc:
        a = np.arctan2(dz, dx)
        m = m & (a >= arc[0]) & (a <= arc[1])
    return v.fill(c, m, only)


def _disc(v, c, cx, cz, R, y0, y1, only=None):
    return v.fill(c, ((v.X - cx) ** 2 + (v.Z - cz) ** 2 <= R * R) & (v.Y > y0) & (v.Y < y1), only)


# letters bent out of tube: strokes in a unit box, x right and z up
GLYPH = {
    "R": [[(0, 0), (0, 1), (0.65, 1), (1, 0.85), (1, 0.6), (0.65, 0.45), (0, 0.45)], [(0.5, 0.45), (1, 0)]],
    "O": [[(0.3, 0), (0, 0.25), (0, 0.75), (0.3, 1), (0.7, 1), (1, 0.75), (1, 0.25), (0.7, 0), (0.3, 0)]],
    "S": [[(1, 0.82), (0.7, 1), (0.3, 1), (0, 0.82), (0, 0.62), (0.3, 0.5), (0.7, 0.5), (1, 0.38), (1, 0.18), (0.7, 0), (0.3, 0), (0, 0.18)]],
    "T": [[(0, 1), (1, 1)], [(0.5, 1), (0.5, 0)]],
    "H": [[(0, 0), (0, 1)], [(1, 0), (1, 1)], [(0, 0.5), (1, 0.5)]],
    "P": [[(0, 0), (0, 1), (0.65, 1), (1, 0.85), (1, 0.6), (0.65, 0.45), (0, 0.45)]],
    "E": [[(1, 1), (0, 1), (0, 0), (1, 0)], [(0, 0.5), (0.7, 0.5)]],
    "N": [[(0, 0), (0, 1), (1, 0), (1, 1)]],
}


def _word(v, word, x, z, w, h, gap, y, r, cols, tf=None, skip=()):
    """Writes a word in bent tube, as a sign-maker would; (x, z) is its bottom-left corner."""
    k = 0
    for i, ch in enumerate(word):
        for stroke in GLYPH[ch]:
            k += 1
            if k in skip:
                continue
            pts = [(x + i * (w + gap) + px * w, z + pz * h) for px, pz in stroke]
            if tf:
                pts = [tf(*p) for p in pts]
            v.path(cols[i % len(cols)], [(p[0], y, p[1]) for p in pts], r)


def _neon_feather(v, base, tip, y, wid, r, edge, spine):
    """A feather drawn in tube: a spine from base to tip and a vane outline either side."""
    bx, bz = base
    ax, az = tip[0] - bx, tip[1] - bz
    L = math.hypot(ax, az)
    nx, nz = az / L, -ax / L

    def P(t, s):
        s = s + 0.07 * L * math.sin(t * math.pi)
        return (bx + ax * t + nx * s, y, bz + az * t + nz * s)

    v.path(spine, [P(t, 0) for t in np.linspace(0, 1, 7)], r)
    for sg in (-1, 1):
        v.path(edge, [P(t, sg * wid * math.sin(math.pi * max((t - 0.22) / 0.78, 0) ** 0.7) ** 0.8) for t in np.linspace(0.22, 1, 9)], r)
    for t in (0.45, 0.62):  # two barbs each side
        for sg in (-1, 1):
            v.path(edge, [P(t, 0), P(t + 0.12, sg * wid * 0.8)], r * 0.9)


# ---- the street -----------------------------------------------------------------------------------


@asset("feather-shop", "neon", "the feather shop front, 7 m wide and 5 m tall; stands behind the path (y 0.8 to 3)")
def feather_shop():
    v = V((-3.5, 0.8, 0), (3.5, 3.0, 5.0), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    Xs = X - 0.07 * (Z - 2.6)  # the whole front leans
    v.fill("stone_dark", (abs(Xs) < 3.3) & (Y > 1.2) & (Z < 0.4))
    v.paint("stone", v.noise(0.5, 2) > 0.55)
    wall = (abs(Xs) < 3.05) & (Y > 1.3) & (Z >= 0.4) & (Z < 3.6)
    v.fill("neon_plum", wall)
    v.paint("violet", wall & (v.noise(0.9, 5) > 0.5))
    # the timber frame, as on the tree's own houses
    for px in (-3.0, 1.0, 3.0):
        v.fill("wood", (abs(Xs - px) < 0.13) & (Y > 1.2) & (Y < 2.0) & (Z < 3.6))
    v.fill("wood", (abs(Xs) < 3.12) & (Y > 1.2) & (Y < 2.0) & (abs(Z - 2.38) < 0.1) & (Xs > 0.9))
    v.paint("bark", v.noise(0.4, 7) > 0.62, only="wood")
    # a sagging roof of scalloped shingles
    rz = 3.62 + (Y - 1.0) * 0.36 - 0.22 * (1 - (Xs / 3.4) ** 2)
    roof = (abs(Xs) < 3.4) & (Y > 1.0) & (Z > 3.5) & (Z < rz)
    v.fill("violet", roof)
    v.paint("neon_plum", roof & (np.mod(Y + 0.06 * np.sin(Xs * 9), 0.42) < 0.14))
    v.paint("dusk", roof & (v.noise(0.6, 9) > 0.66))
    v.fill("wood", (abs(Xs) < 3.42) & (Y > 0.98) & (Y < 1.16) & (abs(Z - 3.52) < 0.09))
    v.path("chrome", [(-2.3, 2.4, 3.9), (-2.38, 2.4, 4.3), (-2.3, 2.4, 4.72)], 0.17)
    v.ball("neon_dark", (-2.3, 2.4, 4.78), (0.27, 0.27, 0.1))
    # the lit window
    wx = np.maximum(abs(Xs + 1.15) - 1.2, 0)
    wz = np.maximum(abs(Z - 1.3) - 0.3, 0)
    wd = np.sqrt(wx**2 + wz**2)
    v.fill("wood", (wd < 0.46) & (Y > 1.2) & (Y < 1.5))
    v.fill(None, (wd < 0.34) & (Y < 1.4))
    v.fill("gold_soft", (wd < 0.34) & (Y >= 1.4) & (Y < 1.55))
    v.fill("amber_glow", (wd < 0.34) & (Y >= 1.4) & (Y < 1.55) & (Z < 0.86 + 0.1 * np.sin(Xs * 5)))
    for mx in (-1.95, -0.35):
        v.fill("wood", (abs(Xs - mx) < 0.06) & (wd < 0.34) & (Y > 1.28) & (Y < 1.45))
    for i, (fx, c) in enumerate(((-2.5, "cyan_glow"), (-1.6, "cream"), (-0.95, "magenta_glow"), (-0.1, "neon_violet_soft"))):
        v.rod("bark_dark", (fx, 1.34, 0.72), (fx, 1.34, 0.95), 0.05)  # feathers on show
        v.ball(c, (fx + 0.04, 1.34, 1.22), (0.11, 0.06, 0.3))
    # the door, with a round window and a step
    door = ((abs(Xs - 2.0) < 0.5) & (Z < 1.65)) | ((Xs - 2.0) ** 2 + (Z - 1.65) ** 2 < 0.25)
    v.fill("wood", (((abs(Xs - 2.0) < 0.62) & (Z < 1.65)) | ((Xs - 2.0) ** 2 + (Z - 1.65) ** 2 < 0.62**2)) & (Y > 1.2) & (Y < 1.45) & (Z > 0.3))
    v.fill("wood_light", door & (Y > 1.14) & (Y < 1.45) & (Z > 0.4))
    v.paint("wood", door & (np.mod(Xs - 2.0 + 0.5, 0.25) < 0.05) & (Y < 1.3) & (Z > 0.4))
    _disc(v, "neon_cyan_soft", 1.93, 1.55, 0.2, 1.1, 1.3)
    v.ball("gold", (1.57, 1.12, 1.05), 0.07)
    v.fill("stone", (abs(Xs - 2.0) < 0.75) & (Y > 0.85) & (Y < 1.3) & (Z < 0.22))
    v.path("bark", [(2.9, 1.25, 2.95), (2.95, 1.0, 3.0), (2.97, 0.95, 2.9)], 0.06)
    lantern(v, (2.97, 0.95, 2.9), 1.0)
    # the awning over the window, lit from within
    stripe = np.mod(np.floor((Xs + 2.95) / 0.365), 2) == 0
    az = 2.12 + (Y - 0.85) * 0.75 + 0.05 * stripe  # every other stripe billows
    aw = (Xs > -2.95) & (Xs < 0.7) & (Y < 1.36)
    v.fill("cream", aw & (abs(Z - az) < 0.075))
    v.fill("cream", aw & (Y < 0.96) & (Z < az) & (Z > az - 0.2 + 0.07 * np.abs(np.sin((Xs + 2.95) * math.pi / 0.365))))
    v.paint("neon_magenta_soft", aw & stripe, only="cream")
    # the signboard and its raised letters
    bx = -0.35
    v.fill("wood_light", (abs(Xs - bx) < 2.55) & (Y > 1.08) & (Y < 1.32) & (Z > 2.6) & (Z < 3.5))
    v.paint("wood", (v.noise(0.7, 11) > 0.6) & (Z > 2.6) & (Z < 3.5) & (Y < 1.3))
    v.fill("bark", (abs(Xs - bx) < 2.62) & (Y > 1.02) & (Y < 1.32) & ((abs(Z - 2.6) < 0.06) | (abs(Z - 3.5) < 0.06)))
    v.text("gold_soft", "FEATHERS", bx + 0.03, 2.7, 0.97, 1.12, px=2)
    # the big neon feather on the roof
    for px, pz in ((2.02, 3.5), (2.3, 3.55)):
        v.rod("chrome", (px, 1.5, pz), (px + 0.03, 1.2, pz + 0.4), 0.07)
    _neon_feather(v, (2.0, 3.25), (2.72, 4.92), 1.15, 0.4, 0.075, "cyan_glow", "magenta_glow")
    return v.done("feather-shop", keep=0.045)


@asset("neon-sign-a", "neon", "wall sign, 2 m: an owl's face in tube; stands on z = 0 round y = 0, faces -y")
def neon_sign_a():
    v = V((-1.0, -0.2, 0), (1.0, 0.25, 2.0), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    d = np.sqrt(X**2 + (Z - 1.0) ** 2)
    v.fill("neon_dark", (d < 0.98 + 0.02 * np.sin(np.arctan2(Z - 1, X) * 9)) & (Y > 0.0) & (Y < 0.14))
    v.paint("neon_plum", v.noise(0.5, 3) > 0.5)
    v.fill("wood", (abs(d - 0.93) < 0.06) & (Y > -0.03) & (Y < 0.16))
    v.rod("chrome", (-0.5, 0.14, 1.4), (-0.5, 0.25, 1.4), 0.08)
    v.rod("chrome", (0.5, 0.14, 0.6), (0.5, 0.25, 0.6), 0.08)
    y = -0.06
    out = [(-0.66, 1.66), (-0.38, 1.42), (0, 1.5), (0.38, 1.42), (0.66, 1.66), (0.72, 1.0), (0.5, 0.5), (0, 0.3), (-0.5, 0.5), (-0.72, 1.0), (-0.66, 1.66)]
    v.path("cyan_glow", [(px, y, pz) for px, pz in out], 0.07)
    for sx in (-1, 1):
        _ring(v, "magenta_glow", sx * 0.31, 1.02, 0.22, 0.07, y)
        v.ball("gold_glow", (sx * 0.31, y, 1.02), 0.08)
    v.path("gold_glow", [(-0.1, y, 0.74), (0, y, 0.54), (0.1, y, 0.74)], 0.065)
    return v.done("neon-sign-a", keep=0.16)


@asset("neon-sign-b", "neon", 'wall sign, 3 m: an arrow pointing right with "OPEN" in tube; faces -y')
def neon_sign_b():
    v = V((-1.5, -0.2, 0), (1.5, 0.25, 1.5), vpm=24)
    X, Y, Z = v.X, v.Y, v.Z
    arrow = [(-1.48, 0.2), (0.62, 0.2), (0.62, 0.02), (1.48, 0.72), (0.62, 1.42), (0.62, 1.24), (-1.48, 1.24)]
    v.poly("neon_dark", arrow, 0.0, 0.14)
    v.paint("violet", v.noise(0.5, 4) > 0.55)
    y = -0.06
    rim = [(-1.37, 0.31), (0.73, 0.31), (0.73, 0.25), (1.31, 0.72), (0.73, 1.19), (0.73, 1.13), (-1.37, 1.13), (-1.37, 0.31)]
    v.path("magenta_glow", [(px, y, pz) for px, pz in rim], 0.06)
    _word(v, "OPEN", -1.16, 0.5, 0.31, 0.44, 0.17, y, 0.055, ["cyan_glow"])
    for bx in (-1.2, -0.6, 0.0):  # lantern-gold bulbs along the top
        v.ball("gold_glow", (bx, 0.02, 1.32), 0.08)
    v.rod("chrome", (-0.9, 0.14, 0.75), (-0.9, 0.25, 0.75), 0.08)
    v.rod("chrome", (0.7, 0.14, 0.75), (0.7, 0.25, 0.75), 0.08)
    return v.done("neon-sign-b", keep=0.11)


@asset("neon-sign-c", "neon", 'wall sign, 3 m: the word "ROOST" in tube on a board; faces -y')
def neon_sign_c():
    v = V((-1.5, -0.2, 0), (1.5, 0.25, 1.5), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    sag = 0.05 * np.cos(X * 1.4)
    v.fill("wood", (abs(X) < 1.48) & (Z > 0.12 - sag) & (Z < 1.16 - sag) & (Y > 0.0) & (Y < 0.14))
    v.fill("neon_dark", (abs(X) < 1.4) & (Z > 0.2 - sag) & (Z < 1.08 - sag) & (Y > -0.02) & (Y < 0.14))
    v.paint("neon_plum", v.noise(0.5, 6) > 0.5, only="neon_dark")
    v.paint("bark", v.noise(0.4, 8) > 0.6, only="wood")
    y = -0.08
    _word(v, "ROOST", -1.24, 0.34, 0.38, 0.6, 0.145, y, 0.068, ["magenta_glow", "cyan_glow", "cyan_glow", "magenta_glow", "violet_glow"])
    for sx in (-1.0, 1.0):  # hangs from a bar on two chains
        v.rod("chrome", (sx, 0.07, 1.1), (sx * 1.02, 0.07, 1.44), 0.065)
    v.rod("wood", (-1.3, 0.07, 1.42), (1.3, 0.07, 1.42), 0.075, flat=False)
    v.ball("gold_glow", (-1.3, 0.05, 1.42), 0.08)
    v.ball("gold_glow", (1.3, 0.05, 1.42), 0.08)
    return v.done("neon-sign-c", keep=0.145)


def _robot_owl():
    yc = 2.7
    v = V((-2.5, 0.7, 0), (2.5, 4.8, 5.2), vpm=10)
    X, Y, Z = v.X, v.Y, v.Z
    ang = np.arctan2(X, -(Y - yc))
    row = np.floor(Z / 0.9)
    seam = (np.mod(Z, 0.9) < 0.1) | (np.mod(ang + row * 0.35, 0.7) < 0.07)
    bel = (X / 1.3) ** 2 + ((Z - 1.6) / 1.4) ** 2
    belly = (bel < 1) & (Y < yc)
    # rounded plates: each swells from its seams; the breastplate is one smooth piece
    swell = np.sqrt(np.abs(np.sin(np.mod(Z, 0.9) / 0.9 * math.pi) * np.sin(np.mod(ang + row * 0.35, 0.7) / 0.7 * math.pi)))
    swell = np.where(belly, 1.0, swell)
    q = np.sqrt((X / 2.1) ** 2 + ((Y - yc) / 1.75) ** 2 + ((Z - 2.35) / 2.6) ** 2)
    v.fill("chrome", q <= 0.96 + 0.04 * swell)
    v.paint("stone", (v.noise(1.0, 4) > 0.6) & ~belly)
    v.paint("violet", seam & ~belly)
    v.paint("cream", belly)
    v.paint("violet", (abs(bel - 1) < 0.14) & (Y < yc))
    # a barred owl's streaked belly: long plates
    v.paint("wood_light", belly & (np.mod(X + 0.25 + 0.4 * np.floor(Z / 1.1), 0.8) < 0.1) & (np.mod(Z, 1.1) > 0.3))
    for sx in (-1, 1):
        # folded wings in barred plates
        wing = (((X - sx * 2.03) / 0.47) ** 2 + ((Y - yc - 0.15) / 1.3) ** 2 + ((Z - 2.65) / 1.9) ** 2) <= 1
        v.fill("violet", wing)
        v.paint("chrome", wing & (np.mod(Z + 0.25 * (Y - yc), 0.8) < 0.3))
        v.paint("neon_plum", wing & (Z < 1.3))
        for t in (-0.42, 0, 0.42):  # gold feet
            v.rod("gold", (sx * 0.85 + t, 1.5, 0.2), (sx * 0.85 + t * 1.5, 0.82, 0.14), 0.2, 0.13, flat=False)
    v.ball("violet", (0, 4.3, 0.7), (0.9, 0.5, 0.75))
    # the bars across the chest are rows of lights
    for zc, n in ((3.25, 4), (3.85, 5)):
        for i in range(n):
            x = (i - (n - 1) / 2) * 0.6
            y = yc - 1.75 * math.sqrt(max(1 - (x / 2.1) ** 2 - ((zc - 2.35) / 2.6) ** 2, 0))
            v.ball("neon_dark", (x, y + 0.12, zc), 0.26)
            v.ball("magenta_glow", (x, y + 0.02, zc), 0.18)
    body = v.done("robot-owl", keep=0.1)

    # the head: round, no tufts; local to the neck so the game can turn and nod it
    h = V((-2.2, -1.9, -0.9), (2.2, 1.8, 2.5), vpm=10)
    X, Y, Z = h.X, h.Y, h.Z
    hq = np.sqrt((X / 2.05) ** 2 + (Y / 1.65) ** 2 + ((Z - 0.85) / 1.65) ** 2)
    ha = np.arctan2(X, -Y)
    hrow = np.floor((Z + 0.15) / 0.55)
    hsw = np.sqrt(np.abs(np.sin(np.mod(Z + 0.15, 0.55) / 0.55 * math.pi) * np.sin(np.mod(ha + hrow * 0.4, 0.8) / 0.8 * math.pi)))
    h.fill("chrome", hq <= 0.965 + 0.035 * hsw)
    h.paint("stone", h.noise(1.0, 6) > 0.62)
    h.paint("violet", ((np.mod(Z + 0.15, 0.55) < 0.14) | (np.mod(ha + hrow * 0.4, 0.8) < 0.07)) & ((Y > -0.6) | (Z > 1.75)))  # a barred crown
    h.paint("violet", (Z < -0.45))
    for sx in (-1, 1):
        dd = np.sqrt((X - sx * 0.92) ** 2 + (Z - 0.85) ** 2)
        disc = (((X - sx * 0.92) / 1.02) ** 2 + ((Y + 1.4) / 0.42) ** 2 + ((Z - 0.85) / 1.02) ** 2) <= 1
        h.fill("cream", disc)
        h.paint("chrome", disc & (np.mod(dd, 0.34) < 0.12) & (dd > 0.5))
        h.paint("violet", disc & (dd > 0.9))
        h.ball("neon_dark", (sx * 0.92, -1.62, 0.9), (0.52, 0.2, 0.52))
    h.rod("gold", (0, -1.72, 0.7), (0, -1.86, 0.05), 0.24, 0.07, flat=False)
    head = child(h.done("robot-owl.head", loc=(0, yc, 4.5), keep=0.11), body)

    e = V((-1.5, -0.4, -0.6), (1.5, 0.3, 0.6), vpm=16)
    for sx in (-1, 1):
        e.ball("cyan_glow", (sx * 0.92, 0, 0), (0.43, 0.24, 0.43))
        e.ball("neon_dark", (sx * 0.92, -0.17, -0.02), (0.17, 0.1, 0.19))
        e.ball("moon_glow", (sx * 0.92 - 0.17, -0.2, 0.17), (0.09, 0.06, 0.09))
    eyes = child(e.done("robot-owl.eyes", loc=(0, yc - 1.66, 5.4), keep=0.2), body)
    return [body, head, eyes]


asset("robot-owl", "neon", "the giant robot owl, 7 m tall and 5 m wide, behind the path; robot-owl.head and robot-owl.eyes are separate children of the root")(_robot_owl)


def _cabinet(name, style):
    v = V((-0.5, -0.45, 0), (0.5, 0.45, 2.0), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    body, trim, screen, marq = {
        "a": ("violet", "chrome", "cyan_glow", "magenta_glow"),
        "b": ("chrome", "navy", "magenta_glow", "cyan_glow"),
        "c": ("wood", "gold", "violet_glow", "gold_glow"),
    }[style]
    lean = {"a": 0.03, "b": 0.0, "c": -0.035}[style]
    Xs = X - lean * (Z - 1.0)
    front = np.where(Z < 0.84, -0.27, np.where(Z < 1.0, -0.43, np.where(Z < 1.62, -0.34 + (Z - 1.0) * 0.26, -0.41)))
    if style == "a":
        top = 2.0 - 0.1 * np.clip((-Y - 0.2) / 0.2, 0, 1) ** 2 + 0 * Xs
    elif style == "b":  # an owl of a cabinet: the top corners rise into ear tufts
        top = 1.74 + 0.36 * (np.abs(Xs) / 0.5) ** 2.2 + 0 * Y
    else:  # a round-topped wooden one
        top = 1.6 + 0.4 * np.sqrt(np.clip(1 - (Xs / 0.47) ** 2, 0, 1)) + 0 * Y
    solid = (abs(Xs) < (0.5 if style == "b" else 0.47)) & (Y > front) & (Y < 0.4) & (Z < top)
    v.fill(body, solid)
    side = solid & (abs(Xs) > 0.4)
    if style == "a":
        v.paint("neon_plum", v.noise(0.4, 3) > 0.55)
        v.paint("neon_magenta_soft", side & (np.mod(Z + Y * 0.8, 0.5) < 0.1) & (Z > 0.3))
    elif style == "b":
        v.paint("stone", v.noise(0.4, 5) > 0.6)
        v.paint("navy", side & (Z < 0.8))
        v.paint("neon_cyan_soft", side & (abs(Z - 0.86) < 0.05))
    else:
        v.paint("bark", (np.mod(Xs + 0.47, 0.235) < 0.05) | (v.noise(0.35, 7) > 0.66))
        v.paint("gold", side & ((abs(Z - 0.2) < 0.05) | (abs(Z - 1.5) < 0.05)))
    v.paint(trim, solid & (Z > 0.84) & (Z < 1.0) & (Y < -0.2))  # the control deck
    v.paint("neon_dark", solid & (Z < 0.1))
    # the screen, set into the leaning face
    sy = -0.34 + (Z - 1.0) * 0.26
    if style == "b":
        scr = (Xs**2 + (Z - 1.3) ** 2) < 0.27**2
    elif style == "c":
        scr = ((abs(Xs) < 0.3) & (Z > 1.08) & (Z < 1.4)) | ((Xs**2 + (Z - 1.4) ** 2) < 0.09)
    else:
        scr = _rbm(v, (-0.34 + lean * 0.3, -9, 1.07), (0.34 + lean * 0.3, 9, 1.57), 0.08)
    v.paint("neon_dark", solid & (Y < sy + 0.12) & (Z > 1.02) & (Z < 1.62) & (abs(Xs) < 0.42))
    v.fill(None, scr & (Y < sy + 0.06) & (Z > 1.0) & (Z < 1.7))
    v.fill(screen, scr & (Y >= sy + 0.06) & (Y < sy + 0.2) & (Z > 1.0) & (Z < 1.7))
    # what is on the screen: a small owl looking back
    for sx in (-1, 1):
        v.ball("moon_glow", (sx * 0.1 + lean * 0.3, -0.19, 1.36), (0.06, 0.1, 0.06))
    v.ball("gold_glow", (lean * 0.3, -0.2, 1.24), (0.04, 0.1, 0.05))
    # marquee
    if style == "b":
        for sx in (-1, 1):
            _ring(v, marq, sx * 0.19, 1.76, 0.1, 0.05, -0.41)
            v.ball("gold_glow", (sx * 0.19, -0.42, 1.76), 0.045)
        v.rod("gold", (0, -0.42, 1.72), (0, -0.45, 1.63), 0.045, 0.015)
    elif style == "c":
        for k in range(5):
            a = math.pi * (0.16 + 0.17 * k)
            v.ball(marq, (0.36 * math.cos(a) + lean * 0.8, -0.42, 1.6 + 0.3 * math.sin(a)), 0.055)
    else:
        _rbox(v, marq, (-0.38 + lean * 0.8, -0.45, 1.7), (0.38 + lean * 0.8, -0.38, 1.9), 0.06)
        v.box("neon_dark", (-0.2 + lean, -0.45, 1.77), (0.2 + lean, -0.4, 1.83))
    # stick and buttons, coin door
    v.rod("neon_dark", (-0.2, -0.33, 1.0), (-0.22, -0.35, 1.13), 0.03)
    v.ball("red" if style != "c" else "gold_glow", (-0.22, -0.35, 1.15), 0.055)
    for bx, c in ((0.08, "gold_glow"), (0.24, marq)):
        v.ball(c, (bx, -0.34, 1.01), (0.05, 0.05, 0.035))
    _rbox(v, "neon_dark", (-0.2, -0.3, 0.3), (0.2, -0.24, 0.66), 0.05)
    v.box("gold_soft", (-0.05, -0.32, 0.5), (0.05, -0.27, 0.56))
    return v.done(name, keep=0.2)


for _s in "abc":
    asset(f"arcade-cabinet-{_s}", "neon", "arcade cabinet, 1 m wide and 2 m tall; the screen faces -y")(lambda _s=_s: _cabinet(f"arcade-cabinet-{_s}", _s))


@asset("rooftop-unit", "neon", "a 2 m rooftop air unit with a fan")
def rooftop_unit():
    v = V((-1.0, -0.65, 0), (1.0, 0.65, 1.35), vpm=16)
    X, Y, Z = v.X, v.Y, v.Z
    for sx in (-0.75, 0.75):
        for sy in (-0.4, 0.4):
            v.rod("neon_dark", (sx, sy, 0), (sx, sy, 0.2), 0.09)
    sl = 0.04 * X  # it has settled to one side
    v.fill("chrome", _rbm(v, (-1.0, -0.55, 0.14), (1.0, 0.55, 1.14), 0.12) & (Z < 1.12 + sl))
    v.paint("stone", v.noise(0.5, 3) > 0.6)
    v.paint("violet", (Z > 0.96 + sl) | (Z < 0.26))
    v.paint("amber", (v.noise(0.3, 12) > 0.74) & (Z < 0.5))  # a little rust
    # the fan, in a round mouth on the front
    d = np.sqrt((X + 0.38) ** 2 + (Z - 0.62) ** 2)
    a = np.arctan2(Z - 0.62, X + 0.38)
    v.fill(None, (d < 0.4) & (Y < -0.4))
    v.fill("neon_dark", (d < 0.4) & (Y >= -0.4) & (Y < -0.3))
    v.fill("neon_cyan_soft", (d < 0.4) & (d > 0.3) & (Y >= -0.4) & (Y < -0.3))
    v.fill("chrome", (d < 0.36) & (np.mod(a + d * 1.6, TAU / 4) < 0.62) & (Y > -0.5) & (Y < -0.38))
    v.ball("violet", (-0.38, -0.47, 0.62), 0.1)
    v.fill("chrome", (abs(d - 0.44) < 0.05) & (Y > -0.62) & (Y < -0.5))
    # slats, a pipe and a pilot light
    slats = (X > 0.28) & (X < 0.86) & (Z > 0.34) & (Z < 0.92)
    v.fill(None, slats & (np.mod(Z, 0.1875) < 0.09) & (Y < -0.49))
    v.paint("neon_dark", slats & (Y < -0.4))
    v.ball("cyan_glow", (0.72, -0.55, 1.03), 0.06)
    v.path("chrome", [(0.6, 0.2, 1.1), (0.62, 0.22, 1.27), (0.9, 0.24, 1.27)], 0.075)
    dt = np.sqrt((X + 0.3) ** 2 + (Y - 0.0) ** 2)
    v.fill("neon_dark", (dt < 0.3) & (Z > 1.0) & (Z < 1.2))
    v.fill("chrome", (abs(dt - 0.3) < 0.05) & (Z > 1.0) & (Z < 1.22))
    return v.done("rooftop-unit", keep=0.2)


@asset("antenna", "neon", "a 4 m rooftop mast with a glowing tip")
def antenna():
    v = V((-0.7, -0.35, 0), (0.7, 0.35, 4.0), vpm=20)
    _rbox(v, "stone_dark", (-0.32, -0.3, 0), (0.32, 0.3, 0.22), 0.08)
    v.ball("chrome", (0, 0, 0.26), (0.18, 0.18, 0.1))
    mast = [(0, 0, 0.2), (0.05, 0, 1.4), (-0.04, 0, 2.8), (0.06, 0, 3.84)]
    v.path("chrome", mast, 0.09, 0.06)
    for sx in (-1, 1):
        v.rod("neon_dark", (sx * 0.28, 0, 0.2), (0.03, 0, 1.0), 0.06, flat=False)
    for z, w, c in ((2.1, 0.62, "violet"), (2.75, 0.44, "violet"), (3.3, 0.28, "violet")):
        v.rod("chrome", (-w, 0, z - 0.03), (w, 0, z + 0.03), 0.06, flat=False)
        for sx in (-1, 1):
            v.ball(c, (sx * w, 0, z + sx * 0.03), 0.085)
    v.ball("chrome", (-0.2, -0.05, 1.55), (0.3, 0.12, 0.3))  # a little dish
    v.ball("violet", (-0.2, -0.14, 1.55), (0.19, 0.06, 0.19))
    v.ball("gold_soft", (-0.2, -0.2, 1.55), 0.06)
    v.paint("violet", (np.mod(v.Z, 0.9) < 0.1) & (v.Z > 0.4), only="chrome")
    v.ball("magenta_glow", (0.06, 0, 3.86), 0.14)
    return v.done("antenna", keep=0.22)


@asset("water-tank", "neon", "a 3 m rooftop water tank: a barrel on legs, with a lit window")
def water_tank():
    v = V((-1.15, -1.15, 0), (1.15, 1.15, 3.0), vpm=12)
    X, Y, Z = v.X, v.Y, v.Z
    for sx in (-1, 1):
        for sy in (-1, 1):
            v.rod("bark", (sx * 0.78, sy * 0.78, 0), (sx * 0.62, sy * 0.62, 1.05), 0.11)
        v.rod("wood", (sx * 0.72, -0.72, 0.25), (-sx * 0.64, -0.64, 0.9), 0.085)
    r = np.sqrt(X**2 + Y**2)
    a = np.arctan2(Y, X)
    v.fill("wood", (r < 1.0) & (Z > 0.98) & (Z < 1.16))
    br = 0.86 + 0.07 * np.sin(np.clip((Z - 1.1) / 1.2, 0, 1) * math.pi) + 0.05 * (X / 1.0) * (Z - 1.7)
    barrel = (r < br) & (Z > 1.1) & (Z < 2.32)
    v.fill("wood", barrel)
    v.paint("wood_light", barrel & (np.mod(a, TAU / 9) < TAU / 18))
    v.paint("bark", barrel & (v.noise(0.5, 3) > 0.66))
    v.fill("gold", (r < br + 0.05) & (r > br - 0.1) & (abs(Z - 1.36) < 0.085))
    v.fill("magenta_glow", (r < br + 0.06) & (r > br - 0.1) & (abs(Z - 2.1) < 0.085))  # one hoop is neon
    cone = (r < 1.1 * (3.0 - Z) / 0.72 + 0.03) & (Z >= 2.28) & (r < 1.1)
    v.fill("violet", cone)
    v.paint("neon_plum", cone & (np.mod(a + Z * 2, TAU / 7) < 0.3))
    v.top("dusk", 1, only="violet")
    # an owl has moved in: a round lit window
    v.ball("wood", (0.05, -0.9, 1.72), (0.36, 0.14, 0.36))
    v.ball("gold_soft", (0.05, -0.96, 1.72), (0.26, 0.1, 0.26))
    v.box("wood", (0.01, -1.1, 1.46), (0.1, -0.86, 1.98), only="gold_soft")
    v.path("chrome", [(0.75, 0.35, 1.1), (0.8, 0.38, 0.6), (0.78, 0.4, 0)], 0.09)
    return v.done("water-tank", keep=0.17)


@asset("billboard", "neon", "a 6 m by 3 m billboard of glowing owl eyes on posts 4 m high")
def billboard():
    v = V((-3.0, -0.5, 0), (3.0, 0.6, 7.0), vpm=10)
    X, Y, Z = v.X, v.Y, v.Z
    v.path("bark", [(-2.15, 0.4, 0), (-2.0, 0.4, 2.2), (-2.05, 0.4, 4.3)], 0.19, 0.16)
    v.path("bark", [(2.0, 0.4, 0), (2.15, 0.4, 2.0), (2.0, 0.4, 4.3)], 0.19, 0.16)
    v.rod("wood", (-2.0, 0.4, 0.7), (2.05, 0.4, 3.5), 0.13)
    v.rod("wood", (2.05, 0.4, 0.7), (-2.0, 0.4, 3.5), 0.13)
    v.paint("wood_light", v.noise(0.6, 3) > 0.62)
    tilt = 0.03 * X
    board = _rbm(v, (-3.0, 0.0, 4.0), (3.0, 0.3, 7.0), 0.3)
    v.fill("neon_dark", board)
    v.paint("neon_plum", board & (v.noise(1.2, 5) > 0.45))
    v.paint("violet", board & (v.noise(0.8, 7) > 0.68))
    frame = board & ~_rbm(v, (-2.8, -1, 4.2), (2.8, 1, 6.8), 0.25)
    v.fill("chrome", _rbm(v, (-3.0, -0.1, 4.0), (3.0, 0.3, 7.0), 0.3) & ~_rbm(v, (-2.8, -1, 4.2), (2.8, 1, 6.8), 0.25))
    v.paint("stone", frame & (np.mod(X + Z, 1.0) < 0.2))
    y = -0.02
    for sx in (-1, 1):
        cx, cz = sx * 1.38, 5.52 + sx * 0.03
        _ring(v, "cyan_glow", cx, cz, 1.05, 0.14, y)
        _ring(v, "magenta_glow", cx, cz, 0.68, 0.14, y)
        _disc(v, "gold_glow", cx, cz, 0.42, -0.1, 0.1)
        v.ball("neon_dark", (cx, -0.08, cz), (0.24, 0.1, 0.27))
        v.ball("moon_glow", (cx - 0.13, -0.14, cz + 0.13), 0.09)
        _ring(v, "violet_glow", cx, cz + 0.2, 1.2, 0.12, y, arc=(0.75, 2.4))  # brows
    v.path("gold_glow", [(-0.22, y, 5.0), (0, y, 4.5), (0.22, y, 5.0)], 0.13)
    # a catwalk, with the park's lanterns hung under it
    v.box("wood", (-2.9, -0.45, 3.82), (2.9, 0.05, 3.98))
    v.paint("bark", (np.mod(X, 0.6) < 0.1) & (Z < 4.0) & (Z > 3.8))
    lantern(v, (-2.6, -0.3, 3.84), 1.3)
    lantern(v, (2.6, -0.3, 3.84), 1.3)
    return v.done("billboard", keep=0.22)


@asset("cable", "neon", "a sagging cable spanning 6 m with three small lights; origin at the left end, the right end at x = 6")
def cable():
    v = V((0, -0.2, -1.3), (6.0, 0.2, 0.12), vpm=24)

    def zc(x):
        return -0.72 * (1 - ((x - 3) / 3) ** 2)

    pts = [(x, 0, zc(x)) for x in np.linspace(0.08, 5.92, 17)]
    v.path("neon_dark", pts, 0.065)
    v.paint("violet", np.mod(v.X + v.Z * 0.5, 0.5) < 0.16)
    for x in (0.11, 5.89):
        v.ball("chrome", (x, 0, 0), 0.11)
    for x, c in ((1.5, "magenta_glow"), (3.0, "gold_glow"), (4.5, "cyan_glow")):
        lantern(v, (x, 0, zc(x) - 0.03), 0.8, glow=c, frame="chrome")
    return v.done("cable", keep=0.2)


@asset("vending-machine", "neon", "a glowing vending machine, 1.2 m wide and 2 m tall")
def vending_machine():
    v = V((-0.6, -0.45, 0), (0.6, 0.4, 2.0), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    Xs = X - 0.025 * (Z - 1)
    body = _rbm(v, (-0.63, -0.36, 0.06), (0.63, 0.4, 2.0), 0.1) & (abs(Xs) < 0.6)
    v.fill("violet", body)
    v.paint("neon_plum", v.noise(0.5, 3) > 0.55)
    for sx in (-0.4, 0.4):
        v.rod("neon_dark", (sx, 0, 0), (sx, 0, 0.1), 0.1)
    v.paint("chrome", body & (abs(Xs) > 0.52) & (Y < -0.2))
    v.paint("neon_magenta_soft", body & (abs(Xs) > 0.52) & (np.mod(Z, 0.5) < 0.1) & (Y > -0.2))
    # the lit case, with shelves of treats
    win = _rbm(v, (-0.47, -9, 0.62), (0.2, 9, 1.62), 0.08)
    v.fill(None, win & (Y < -0.28))
    v.fill("neon_cyan_soft", win & (Y >= -0.28) & (Y < -0.14))
    for k, z in enumerate((0.7, 1.0, 1.3)):
        v.box("chrome", (-0.47, -0.34, z - 0.06), (0.2, -0.2, z))
        for i, x in enumerate((-0.36, -0.14, 0.08)):
            c = ("gold_glow", "magenta_glow", "cream", "amber_glow", "violet_glow")[(i + k * 2) % 5]
            v.ball(c, (x, -0.29, z + 0.1), (0.07, 0.06, 0.1))
    # the header, the coin plate and the hatch
    _rbox(v, "magenta_glow", (-0.47, -0.42, 1.7), (0.47, -0.33, 1.9), 0.06)
    v.box("neon_dark", (-0.25, -0.42, 1.77), (0.25, -0.38, 1.83))
    _rbox(v, "chrome", (0.27, -0.4, 0.75), (0.5, -0.33, 1.55), 0.05)
    v.box("neon_dark", (0.34, -0.42, 1.3), (0.44, -0.37, 1.43))
    for z, c in ((1.15, "gold_glow"), (1.0, "cyan_glow"), (0.85, "magenta_glow")):
        v.ball(c, (0.385, -0.4, z), 0.045)
    _rbox(v, "neon_dark", (-0.4, -0.4, 0.2), (0.4, -0.3, 0.48), 0.06)
    v.box("chrome", (-0.3, -0.42, 0.38), (0.3, -0.37, 0.44))
    return v.done("vending-machine", keep=0.17)


@asset("street-lamp", "neon", "a 4 m leaning street lamp with a neon lantern")
def street_lamp():
    v = V((-0.6, -0.4, 0), (1.3, 0.4, 4.0), vpm=16)
    v.ball("stone_dark", (-0.15, 0, 0.05), (0.34, 0.32, 0.26))
    v.ball("stone", (-0.15, 0, 0.3), (0.2, 0.2, 0.12))
    pole = [(-0.15, 0, 0.2), (-0.08, 0, 1.3), (0.1, 0, 2.6), (0.3, 0, 3.45), (0.52, 0, 3.84), (0.8, 0, 3.92), (0.98, 0, 3.8)]
    v.path("violet", pole, 0.12, 0.07)
    v.paint("neon_plum", v.noise(0.4, 3) > 0.55, only="violet")
    for z, c in ((0.95, "chrome"), (1.12, "cyan_glow"), (1.29, "chrome"), (2.45, "chrome")):
        x = -0.11 + (z - 0.95) * 0.1
        v.ball(c, (x, 0, z), (0.17, 0.17, 0.07))
    v.path("gold", [(0.3, 0, 3.4), (0.55, 0, 3.4), (0.62, 0, 3.58), (0.5, 0, 3.66)], 0.06)  # a curl of ironwork
    lantern(v, (0.98, 0, 3.76), 1.7, glow="magenta_glow", frame="chrome")
    v.path("violet", [(0.02, 0, 2.3), (-0.3, 0, 2.5), (-0.38, 0, 2.42)], 0.065)
    lantern(v, (-0.38, 0, 2.42), 0.9, glow="cyan_glow", frame="chrome")
    return v.done("street-lamp", keep=0.25)


@asset("neon-arch", "neon", "a gateway the owl walks through: the opening is 4 m wide and 4.5 m tall, the frame 0.9 m thick, at y -1.2 to 1.2")
def neon_arch():
    v = V((-3.1, -1.2, 0), (3.1, 1.2, 6.3), vpm=10)
    X, Y, Z = v.X, v.Y, v.Z
    hole = (abs(X) < 2.0) & (Z < 4.5)
    frame = (abs(X) < 2.9) & (Z < 5.4) & ~hole & (abs(Y) < 1.05)
    v.fill("violet", frame)
    v.paint("neon_plum", frame & (v.noise(0.9, 3) > 0.5))
    v.paint("chrome", frame & ((np.mod(Z, 1.5) < 0.2) | (abs(Y) < 0.15)) & (Z < 4.5))
    v.paint("neon_dark", frame & (Z < 0.4))
    v.paint("chrome", frame & (Z > 4.5) & (np.mod(X + 0.5, 1.0) < 0.2))
    # a timber cap with two ear tufts, so the gate is an owl's brow
    v.fill("wood", (abs(X) < 3.05) & (Z >= 5.4) & (Z < 5.6 + 0.04 * X) & (abs(Y) < 1.15))
    v.paint("bark", (v.noise(0.5, 5) > 0.6) & (Z >= 5.4), only="wood")
    for sx in (-1, 1):
        v.poly("violet", [(sx * 1.7, 5.5), (sx * 3.05, 5.5), (sx * 2.9, 6.3)], -0.7, 0.7)
        v.poly("neon_magenta_soft", [(sx * 2.15, 5.6), (sx * 2.8, 5.6), (sx * 2.75, 6.0)], -0.8, 0.8)
    for y in (-1.07, 1.07):
        v.path("magenta_glow", [(-2.7, y, 0.12), (-2.7, y, 5.2), (2.7, y, 5.2), (2.7, y, 0.12)], 0.13)
        v.path("cyan_glow", [(-2.2, y, 0.12), (-2.2, y, 4.7), (2.2, y, 4.7), (2.2, y, 0.12)], 0.13)
        v.ball("gold", (0, y * 0.98, 4.95), (0.3, 0.14, 0.26))
        v.ball("gold_glow", (0, y * 1.04, 4.95), (0.17, 0.1, 0.15))
    return v.done("neon-arch", keep=0.16)


@asset("crate", "neon", "a 1 m crate; origin at the bottom centre")
def crate():
    v = V((-0.5, -0.5, 0), (0.5, 0.5, 1.0), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    v.box("wood_light", (-0.5, -0.5, 0), (0.5, 0.5, 1.0))
    ex, ey, ez = abs(X) > 0.35, abs(Y) > 0.35, abs(Z - 0.5) > 0.35
    edge = (ex & ey) | (ex & ez) | (ey & ez)
    inner = ~edge
    # planks set back between the frame
    v.fill(None, inner & ((abs(Y) > 0.45) | (abs(X) > 0.45) | (Z > 0.95)))
    gap = ((np.mod(Z - 0.05, 0.3) < 0.1) & (ex | ey)) | ((np.mod(X + 0.45, 0.3) < 0.1) & (Z > 0.8))
    v.paint("bark", inner & gap)
    v.paint("wood", edge)
    v.paint("bark", edge & (v.noise(0.3, 3) > 0.62))
    v.paint("wood", inner & (v.noise(0.35, 5) > 0.6), only="wood_light")
    # a brace across each side
    v.fill("wood", (abs(Z - 0.5 - Y * 0.8) < 0.1) & ex & ~ey & ~ez)
    # a stencilled feather, lit
    fx = X + 0.02 - 0.25 * (Z - 0.5)
    v.fill("neon_cyan_soft", ((fx / 0.12) ** 2 + ((Z - 0.52) / 0.25) ** 2 < 1) & (Y < -0.35) & (Y > -0.5))
    v.fill("neon_magenta_soft", (abs(fx) < 0.035) & (abs(Z - 0.47) < 0.32) & (Y < -0.35) & (Y > -0.5))
    return v.done("crate", keep=0.2)


@asset("awning", "neon", "a 3 m striped awning; hangs from z = 0, the wall edge at y = 0.5, sloping out to y = -0.5")
def awning():
    v = V((-1.5, -0.5, -0.95), (1.5, 0.5, 0), vpm=16)
    X, Y, Z = v.X, v.Y, v.Z
    odd = np.mod(np.floor((X + 1.5) / 0.375), 2) == 1
    zc = -0.07 - (0.5 - Y) * 0.52 - 0.05 * odd * np.clip((0.4 - Y) * 4, 0, 1)  # every other stripe sags
    sheet = abs(Z - zc) < 0.07
    val = (Y < -0.37) & (Z < zc) & (Z > zc - 0.3 + 0.1 * np.abs(np.sin((X + 1.5) * math.pi / 0.375)))
    v.fill("cream", sheet | val)
    v.paint("violet", odd)
    v.rod("wood", (-1.5, 0.42, -0.08), (1.5, 0.42, -0.08), 0.08)
    for sx in (-1.38, 1.38):
        v.rod("chrome", (sx, 0.44, -0.86), (sx, -0.4, -0.62), 0.06, flat=False)
        v.rod("chrome", (sx, 0.44, -0.9), (sx, 0.44, -0.1), 0.06)
    v.rod("cyan_glow", (-1.3, -0.2, -0.62), (1.3, -0.2, -0.62), 0.065, flat=False)
    for bx in (-1.3, 1.3):
        v.rod("chrome", (bx, -0.2, -0.62), (bx, -0.2, -0.45), 0.06)
    return v.done("awning", keep=0.2)


@asset("perch-rail", "neon", "a 3 m rail owls perch on; the top is z = 0, the brackets go back to y = 1")
def perch_rail():
    v = V((-1.5, -0.2, -0.7), (1.5, 1.0, 0), vpm=16)
    v.rod("wood_light", (-1.4, 0, -0.095), (1.4, 0, -0.095), 0.095, flat=False)
    v.paint("wood", v.noise(0.3, 3) > 0.6)
    for bx in (-1.42, -0.5, 0.5, 1.42):  # bindings, worn by many feet
        v.rod("bark", (bx - 0.08, 0, -0.1), (bx + 0.08, 0, -0.1), 0.1)
    for sx in (-0.95, 0.95):
        v.rod("chrome", (sx, 0, -0.2), (sx, 1.0, -0.2), 0.075)
        v.rod("chrome", (sx, 0, -0.2), (sx, 0, -0.1), 0.075)
        v.rod("chrome", (sx, 0.2, -0.22), (sx, 0.95, -0.6), 0.065)
        _rbox(v, "violet", (sx - 0.14, 0.88, -0.7), (sx + 0.14, 1.0, -0.06), 0.05)
        v.ball("gold", (sx, 0.86, -0.38), 0.06)
    v.rod("cyan_glow", (-0.9, 0.02, -0.3), (0.9, 0.02, -0.3), 0.065, flat=False)
    return v.done("perch-rail", keep=0.45)


def _windows(X, Z):
    """The grid both wall panels share: one rounded window to every 2.5 m square."""
    lx = np.mod(X + 5, 2.5) - 1.25
    lz = np.mod(Z, 2.5)
    win = (abs(lx) < 0.5) & (lz > 0.75) & (lz < 2.25) & ~((lz > 2.0) & (abs(lx) > 0.25))
    return lx, lz, win, np.floor((X + 5) / 2.5), np.floor(Z / 2.5)


@asset("facade", "neon", "backdrop wall panel, 10 m square and 1 m thick (y 0 to 1); tiles in x and z")
def facade():
    v = V((-5, 0, 0), (5, 1, 10), vpm=4, open="xz")
    X, Y, Z = v.X, v.Y, v.Z
    v.fill("neon_dark", Y > 0.25)
    v.paint("neon_plum", v.noise(2.0, 3) > 0.42)
    v.paint("violet", v.noise(1.4, 5) > 0.7)
    lx, lz, win, col, row = _windows(X, Z)
    v.fill("neon_plum", (lz < 0.25) & (Y < 0.5))  # a ledge under every storey
    v.fill("violet", (np.mod(X + 5, 5.0) < 0.25) & (Y < 0.5))  # pilasters
    v.fill(None, win & (Y < 0.5))
    v.fill("navy", win & (Y > 0.5) & (Y < 0.75))
    v.paint("dusk", win & (lz > 1.5) & (np.mod(col + row, 3) == 0), only="navy")
    v.fill("wood", (abs(lx) < 0.75) & (lz > 0.5) & (lz < 0.75) & (Y < 0.5) & (np.mod(col * 3 + row, 4) < 2))  # sills
    lit = ((0, 0, "gold_soft"), (2, 1, "neon_cyan_soft"), (1, 2, "neon_magenta_soft"), (3, 3, "neon_violet_soft"), (3, 0, "amber_glow"), (0, 3, "gold_soft"))
    for c, r, colour in lit:
        here = win & (col == c) & (row == r) & (Y > 0.5) & (Y < 0.75)
        v.fill(colour, here)
        if (c + r) % 2 == 0:  # someone is in: an owl against the light
            v.fill("neon_dark", here & (abs(lx) < 0.25) & (lz < 1.5))
    return v.done("facade", keep=0.125, relax=1)


def _skyline(name, seed, towers):
    v = V((-10, 0, 0), (10, 2, 16), vpm=4, open="+y")
    X, Y, Z = v.X, v.Y, v.Z
    rng = np.random.default_rng(seed)
    glows = ("gold_soft", "neon_cyan_soft", "neon_magenta_soft", "gold_soft", "neon_violet_soft", "amber_glow")
    v.fill("neon_dark", (Z < 1.5 + 0.5 * np.sin(X * 0.7)) & (Y > 1.0))  # a low run of roofs joins them
    for i, (x0, x1, h, lean, roof, y0, colour) in enumerate(towers):
        Xs = X - lean * Z
        c = (x0 + x1) / 2
        hw = (x1 - x0) / 2
        t = (Xs - c) / hw
        if roof == "peak":
            top = h - 0.9 * hw * np.abs(t) * 1.3
        elif roof == "slant":
            top = h - 0.5 * hw * (t + 1)
        elif roof == "dome":
            top = h - hw * (1 - np.sqrt(np.clip(1 - t**2, 0, 1)))
        elif roof == "owl":  # two tufts
            top = h - 1.2 * hw * (1 - np.abs(t)) ** 1.5
        else:
            top = h - 0.5 * (np.abs(t) < 0.8)
        solid = (abs(t) < 1) & (Z < top) & (Y > y0)
        v.fill(colour, solid)
        v.paint("neon_plum" if colour != "neon_plum" else "violet", solid & (v.noise(1.6, seed + i) > 0.6))
        if roof in ("peak", "slant", "dome"):
            v.paint("dusk", solid & (Z > top - 0.5))
        # sparse lit windows, set into the wall
        nwin = int(rng.integers(2, 5))
        for _ in range(nwin):
            wx = np.round((c + rng.uniform(-0.7, 0.7) * (hw - 0.6)) * 2) / 2 + 0.25
            wz = np.round(rng.uniform(2.0, max(h - 2.5 - 0.6 * hw, 2.5)) * 2) / 2
            w = (abs(Xs - wx) < 0.3) & (Z > wz) & (Z < wz + 0.8) & solid
            v.fill(None, w & (Y < y0 + 0.25))
            v.fill(glows[int(rng.integers(0, len(glows)))], w & (Y >= y0 + 0.25) & (Y < y0 + 0.5))
    return v


@asset("bg-skyline-a", "neon", "backdrop skyline, 20 m wide and 16 m tall, 2 m deep (y 0 to 2): crooked roofs with a few lit windows")
def bg_skyline_a():
    v = _skyline("bg-skyline-a", 3, [
        (-10.0, -7.2, 9.0, 0.02, "slant", 0.5, "neon_plum"), (-7.8, -4.6, 12.5, -0.025, "peak", 0.0, "violet"),
        (-5.0, -1.8, 8.0, 0.03, "flat", 0.75, "neon_dark"), (-2.4, 1.2, 15.9, 0.02, "peak", 0.25, "neon_plum"),
        (0.6, 3.6, 10.5, -0.03, "dome", 0.0, "violet"), (3.2, 6.6, 7.0, 0.0, "flat", 0.75, "navy"),
        (5.8, 8.2, 13.0, 0.03, "slant", 0.25, "neon_plum"), (7.6, 10.0, 9.5, -0.01, "peak", 0.5, "violet"),
    ])
    X, Y, Z = v.X, v.Y, v.Z
    # a water tank and a mast against the sky
    v.fill("neon_dark", (np.sqrt((X - 4.9) ** 2) < 0.9) & (Z > 7.6) & (Z < 9.4) & (Y > 0.75) & (Y < 1.75))
    v.fill("violet", (abs(X - 4.9) < 1.1 - (Z - 9.2) * 1.0) & (Z >= 9.2) & (Z < 10.2) & (Y > 0.75) & (Y < 1.75))
    for sx in (4.3, 5.5):
        v.fill("neon_dark", (abs(X - sx) < 0.25) & (Z > 6.5) & (Z < 7.7) & (Y > 1.0) & (Y < 1.5))
    v.fill("neon_plum", (abs(X + 3.2) < 0.25) & (Z > 7.4) & (Z < 10.6) & (Y > 1.0) & (Y < 1.5))
    v.fill("neon_magenta_soft", (abs(X + 3.2) < 0.25) & (Z >= 10.5) & (Z < 11.0) & (Y > 1.0) & (Y < 1.5))
    return v.done("bg-skyline-a", keep=0.07, relax=1)


@asset("bg-skyline-b", "neon", "backdrop skyline, 20 m wide and 13 m tall, 2 m deep (y 0 to 2): crooked roofs, one tower an owl")
def bg_skyline_b():
    v = _skyline("bg-skyline-b", 8, [
        (-10.0, -7.6, 7.5, -0.02, "peak", 0.25, "violet"), (-8.2, -5.2, 10.5, 0.03, "flat", 0.75, "neon_dark"),
        (-5.6, -2.2, 12.0, 0.0, "owl", 0.0, "neon_plum"), (-2.6, 0.4, 6.5, 0.04, "slant", 0.5, "navy"),
        (0.0, 2.6, 10.0, -0.03, "peak", 0.25, "violet"), (2.2, 5.4, 13.0, 0.025, "dome", 0.0, "neon_plum"),
        (5.0, 7.4, 8.5, -0.02, "slant", 0.75, "neon_dark"), (7.0, 10.0, 11.0, 0.01, "peak", 0.25, "violet"),
    ])
    X, Y, Z = v.X, v.Y, v.Z
    # the owl tower's eyes
    for sx in (-1, 1):
        v.fill("neon_cyan_soft", ((X + 3.9 - sx * 0.75) ** 2 + (Z - 9.4) ** 2 < 0.45**2) & (Y < 0.5))
    v.fill("gold_soft", (abs(X + 3.9) < 0.25) & (Z > 8.4) & (Z < 8.9) & (Y < 0.5))
    v.fill("neon_dark", (abs(X - 6.2) < 0.3) & (Z > 7.5) & (Z < 9.8) & (Y > 1.0) & (Y < 1.5))  # a chimney
    return v.done("bg-skyline-b", keep=0.07, relax=1)


@asset("puddle", "neon", "a 2 m puddle holding the street's glow; lies on z = 0, a few centimetres thick")
def puddle():
    v = V((-1.0, -0.7, 0), (1.0, 0.7, 0.125), vpm=16)
    X, Y, Z = v.X, v.Y, v.Z
    a = np.arctan2(Y / 0.68, X)
    edge = 0.84 + 0.12 * np.sin(a * 3 + 0.6) + 0.06 * np.sin(a * 5)
    d = np.sqrt((X * 0.89 - 0.02) ** 2 + (Y / 0.68) ** 2)
    v.fill("navy", d < edge)
    v.paint("dusk", (d > edge - 0.1))
    n = v.noise(0.45, 4)
    v.paint("neon_cyan_soft", (d < edge - 0.14) & (n > 0.56) & (X < 0.2))
    v.paint("neon_magenta_soft", (d < edge - 0.14) & (v.noise(0.4, 9) > 0.6) & (X > -0.3))
    v.paint("neon_violet_soft", (d < edge - 0.2) & (abs(n - 0.5) < 0.03))
    return v.done("puddle", keep=0.6)


# ---- the circuit: the dark course under the street -----------------------------------------------


@asset("breaker", "circuit", "a breaker box the owl can carry, 1 m tall, with a big lever; origin at its middle")
def breaker():
    v = V((-0.4, -0.3, -0.5), (0.6, 0.3, 0.5), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    _rbox(v, "violet", (-0.32, -0.14, -0.44), (0.32, 0.22, 0.44), 0.07)
    v.paint("neon_plum", v.noise(0.25, 3) > 0.55)
    for sx in (-0.14, 0.14):
        v.rod("neon_dark", (sx, 0.04, -0.5), (sx, 0.04, 0.5), 0.07)
        v.rod("chrome", (sx, 0.04, -0.47), (sx, 0.04, 0.47), 0.09)
    _rbox(v, "violet", (-0.32, -0.14, -0.44), (0.32, 0.22, 0.44), 0.07, only="chrome")
    for sx in (-0.14, 0.14):
        for z in (-0.46, 0.46):
            v.ball("chrome", (sx, 0.04, z), (0.1, 0.1, 0.04))
    _rbox(v, "chrome", (-0.26, -0.2, -0.36), (0.26, -0.1, 0.38), 0.05)
    v.paint("stone", (v.noise(0.2, 5) > 0.62), only="chrome")
    # hazard stripes along the foot of the door
    v.paint("gold", (Z < -0.2) & (Z > -0.34) & (abs(X) < 0.24) & (Y < -0.12))
    v.paint("neon_dark", (Z < -0.2) & (Z > -0.34) & (abs(X) < 0.24) & (Y < -0.12) & (np.mod(X + Z, 0.14) < 0.07))
    # the bolt, glowing
    bolt = [(0.03, 0.33), (-0.13, 0.06), (-0.03, 0.06), (-0.09, -0.14), (0.12, 0.13), (0.01, 0.13), (0.1, 0.33)]
    v.poly("neon_dark", [(x * 1.25, (z - 0.1) * 1.25 + 0.1) for x, z in bolt], -0.215, -0.15)
    v.poly("cyan_glow", [(x * 1.1, (z - 0.1) * 1.1 + 0.1) for x, z in bolt], -0.26, -0.15)
    v.ball("magenta_glow", (-0.19, -0.2, -0.08), 0.035)
    # the big lever on its side
    v.ball("chrome", (0.33, -0.02, -0.12), (0.06, 0.11, 0.11))
    v.rod("chrome", (0.36, -0.02, -0.12), (0.49, -0.04, 0.24), 0.05, flat=False)
    v.ball("gold", (0.49, -0.04, 0.32), 0.1)
    v.paint("gold_soft", (Z > 0.33) & (X > 0.4))
    return v.done("breaker", keep=0.25)


def _circuit_plat(name, glow, soft):
    v = V((-1.5, -1.0, -0.4), (1.5, 1.0, 0), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    dx = np.maximum(abs(X) - 1.38, 0)
    dy = np.maximum(abs(Y) - 0.88, 0)
    foot = dx**2 + dy**2 < 0.12**2
    inside = (abs(X) < 1.3) & (abs(Y) < 0.8)
    v.fill("chrome", foot & ~inside)
    v.fill("chrome", foot & inside & (Z < -0.3) & ((np.mod(X + 1.5, 0.75) < 0.15) | (abs(Y) < 0.1)))  # ribs beneath
    v.paint("stone", (v.noise(0.4, 3) > 0.62) | (Z < -0.3))
    v.paint("neon_dark", ~inside & (np.mod(X + 1.5, 0.5) < 0.05) & (abs(Y) > 0.8))
    v.paint("violet", (abs(X) > 1.3) & (abs(Y) < 0.4))  # the emitters at each end
    # the bridge itself: bars of light laid side by side, so it reads as light and not as a slab
    bars = np.mod(X + 1.5 + 0.025, 0.5) < 0.35
    v.fill(soft, foot & inside & (Z > -0.2) & bars)
    v.fill(glow, foot & inside & (Z > -0.25) & (Z < -0.1) & ~bars)
    for sx in (-1.4, 1.4):
        v.fill(glow, (abs(X - sx) < 0.05) & (abs(Y) < 0.25) & (Z > -0.3) & (Z < -0.1))
        v.fill(glow, (abs(X - sx) < 0.06) & (abs(Y) < 0.2) & (Z > -0.1))
    # a line of the same light let into the front and back rails
    slot = (abs(Y) > 0.9) & (abs(Z + 0.2) < 0.05) & (abs(X) < 1.2)
    v.fill(None, slot & (abs(Y) > 0.95))
    v.fill(glow, slot & (abs(Y) <= 0.95))
    return v.done(name, keep=0.07)


asset("circuit-plat-a", "circuit", "a bridge of magenta light on a chrome frame, 3 m wide, 0.4 m thick and 2 m deep; top at z = 0")(
    lambda: _circuit_plat("circuit-plat-a", "magenta_glow", "neon_magenta_soft")
)
asset("circuit-plat-b", "circuit", "a bridge of cyan light on a chrome frame, 3 m wide, 0.4 m thick and 2 m deep; top at z = 0")(
    lambda: _circuit_plat("circuit-plat-b", "cyan_glow", "neon_cyan_soft")
)


@asset("circuit-node", "circuit", "a 0.8 m junction box; its two lamps (magenta, cyan) show whose turn it is")
def circuit_node():
    v = V((-0.4, -0.32, 0), (0.4, 0.3, 0.8), vpm=24)
    X, Y, Z = v.X, v.Y, v.Z
    _rbox(v, "violet", (-0.4, -0.2, 0.06), (0.4, 0.26, 0.74), 0.09)
    v.paint("neon_plum", v.noise(0.25, 3) > 0.55)
    _rbox(v, "chrome", (-0.33, -0.25, 0.13), (0.33, -0.15, 0.67), 0.06)
    v.paint("stone", v.noise(0.2, 6) > 0.64, only="chrome")
    for sx, c in ((-0.16, "magenta_glow"), (0.16, "cyan_glow")):
        v.ball("neon_dark", (sx, -0.24, 0.47), (0.14, 0.05, 0.14))
        v.ball(c, (sx, -0.25, 0.47), (0.105, 0.07, 0.105))
        _ring(v, "gold", sx, 0.47, 0.13, 0.03, -0.25, arc=(0.3, math.pi - 0.3))
    v.box("neon_dark", (-0.2, -0.27, 0.21), (0.2, -0.2, 0.25))
    v.box("neon_dark", (-0.2, -0.27, 0.28), (0.2, -0.2, 0.32))
    for sx in (-0.2, 0.2):
        v.rod("neon_dark", (sx, 0.04, 0), (sx, 0.04, 0.8), 0.06)
        v.rod("chrome", (sx, 0.04, 0.02), (sx, 0.04, 0.1), 0.085)
        v.rod("chrome", (sx, 0.04, 0.7), (sx, 0.04, 0.78), 0.085)
    return v.done("circuit-node", keep=0.4)


@asset("dead-sign", "circuit", 'a dark, unlit neon sign, 3 m wide ("HOOT"), hanging askew; faces -y')
def dead_sign():
    v = V((-1.5, -0.2, 0), (1.5, 0.25, 1.6), vpm=20)
    X, Y, Z = v.X, v.Y, v.Z
    th = 0.09
    cs, sn = math.cos(th), math.sin(th)
    Xr = X * cs + (Z - 0.72) * sn
    Zr = -X * sn + (Z - 0.72) * cs

    def tf(x, z):  # board space to the world
        return (x * cs - z * sn, 0.72 + x * sn + z * cs)

    v.fill("neon_dark", (abs(Xr) < 1.36) & (abs(Zr) < 0.48) & (Y > 0.0) & (Y < 0.14))
    v.paint("neon_plum", v.noise(0.5, 3) > 0.5)
    v.paint("stone_dark", v.noise(0.35, 8) > 0.66)
    v.fill("neon_tube_off", (abs(Xr) < 1.42) & (abs(Zr) < 0.54) & ~((abs(Xr) < 1.3) & (abs(Zr) < 0.42)) & (Y > -0.04) & (Y < 0.14))
    v.fill(None, (abs(Xr + 1.3) < 0.22) & (Zr < -0.36) & (Y < 0.2))  # a bite out of the rim
    v.top("moss", 1, only="neon_tube_off")
    y = -0.07
    _word(v, "HOO", -1.02, -0.28, 0.38, 0.56, 0.17, y, 0.066, ["neon_tube_off"], tf=tf)

    def slipped(x, z):  # the T has come off its top pin and swung
        dx, dz = x - 0.63, z - 0.28
        return tf(0.63 + dx * 0.94 + dz * 0.34, 0.24 - dx * 0.34 + dz * 0.94)

    _word(v, "T", 0.63, -0.28, 0.38, 0.56, 0, y, 0.066, ["neon_tube_off"], tf=slipped)
    v.paint("stone", v.noise(0.3, 12) > 0.6, only="neon_tube_off")
    a, b = tf(-1.0, 0.5), tf(1.0, 0.5)
    v.rod("chrome", (a[0], 0.07, a[1]), (a[0] - 0.04, 0.07, 1.6), 0.065)
    v.rod("chrome", (b[0], 0.07, b[1]), (b[0] + 0.02, 0.07, b[1] + 0.2), 0.065)  # this chain has snapped
    c = tf(0.3, -0.5)
    v.path("neon_dark", [(c[0], 0.07, c[1]), (c[0] + 0.1, 0.07, c[1] - 0.2), (c[0] - 0.05, 0.07, 0.03)], 0.065)
    return v.done("dead-sign", keep=0.17)


def _pipes():
    # (colour, offset toward +z, y, radius): the same three pipes in the run and the elbow
    return (("chrome", 0.0, 0.0, 0.15), ("violet", 0.32, 0.05, 0.085), ("neon_dark", -0.31, 0.08, 0.075))


def _bracket(v, x, z, ux=0.0, uz=1.0):
    """A strap round the pipes and an arm back to the wall; (ux, uz) is the pipes' 'up'."""
    v.rod("stone_dark", (x, 0.0, z), (x, 0.5, z), 0.1)
    v.rod("gold", (x - uz * 0.07, -0.02, z + ux * 0.07), (x + uz * 0.07, -0.02, z - ux * 0.07), 0.2)
    v.rod("stone_dark", (x - ux * 0.3, 0.42, z - uz * 0.3), (x + ux * 0.36, 0.42, z + uz * 0.36), 0.085, flat=False)


@asset("conduit", "circuit", "a pipe run exactly 4 m long with brackets; origin at the left end, runs on in x so runs join")
def conduit():
    v = V((0, -0.25, -0.5), (4.0, 0.5, 0.5), vpm=24, open="x")
    X, Y, Z = v.X, v.Y, v.Z
    for x in (1.0, 3.0):
        _bracket(v, x, 0.0)
    for c, dz, y, r in _pipes():
        v.rod(c, (-0.2, y, dz), (4.2, y, dz), r)
    v.paint("stone", (v.noise(0.5, 3) > 0.62), only="chrome")
    v.paint("neon_plum", (np.mod(X, 1.0) < 0.12), only="violet")
    v.rod("neon_dark", (1.93, 0, 0), (2.07, 0, 0), 0.2)  # a collar where two lengths meet
    v.rod("chrome", (1.96, 0, 0), (2.04, 0, 0), 0.22)
    return v.done("conduit", keep=0.085)


@asset("conduit-bend", "circuit", "a 1 m elbow for the conduit: in at the origin heading +x, out heading up at x = 1, z = 1")
def conduit_bend():
    v = V((0, -0.25, -0.5), (1.5, 0.5, 1.0), vpm=24, open="-x+z")
    _bracket(v, math.sin(math.pi / 4), 1 - math.cos(math.pi / 4), ux=-0.707, uz=0.707)
    for c, dz, y, r in _pipes():
        R = 1.0 - dz
        pts = [(-0.3, y, dz)] + [(R * math.sin(a), y, 1 - R * math.cos(a)) for a in np.linspace(0, math.pi / 2, 9)] + [(R, y, 1.3)]
        v.path(c, pts, r)
    v.paint("stone", (v.noise(0.5, 3) > 0.62), only="chrome")
    return v.done("conduit-bend", keep=0.24)


@asset("transformer", "circuit", "a 3 m transformer with coils and a faint violet glow")
def transformer():
    v = V((-1.3, -0.9, 0), (1.3, 0.9, 3.0), vpm=12)
    X, Y, Z = v.X, v.Y, v.Z
    _rbox(v, "stone_dark", (-1.2, -0.8, 0), (1.2, 0.8, 0.26), 0.08)
    v.paint("stone", v.noise(0.5, 2) > 0.55)
    tank = _rbm(v, (-0.95, -0.6, 0.2), (0.95, 0.6, 1.9), 0.16)
    v.fill("violet", tank)
    v.paint("neon_plum", tank & (v.noise(0.7, 3) > 0.5))
    v.paint("chrome", tank & ((abs(Z - 0.5) < 0.085) | (abs(Z - 1.72) < 0.085)))
    for sx in (-1, 1):  # cooling fins
        fins = (abs(X - sx * 1.1) < 0.17) & (abs(Y) < 0.5) & (Z > 0.5) & (Z < 1.65) & (np.mod(Y + 0.5, 0.34) < 0.17)
        v.fill("chrome", fins)
    v.paint("stone", (abs(X) > 0.95) & (v.noise(0.4, 6) > 0.5), only="chrome")
    # a round port with the hum showing through
    d = np.sqrt((X + 0.3) ** 2 + (Z - 1.1) ** 2)
    v.fill("gold", (d < 0.44) & (d > 0.3) & (Y < -0.5) & (Y > -0.76))
    v.fill("neon_violet_soft", (d <= 0.3) & (Y < -0.5) & (Y > -0.68))
    v.fill("violet_glow", (d <= 0.14) & (Y < -0.5) & (Y > -0.7))
    _rbox(v, "chrome", (0.35, -0.7, 0.8), (0.75, -0.55, 1.45), 0.06)
    v.ball("gold_soft", (0.55, -0.7, 1.25), 0.085)
    v.box("neon_dark", (0.42, -0.72, 0.9), (0.68, -0.6, 1.06))
    # three coils on top, wound in gold, the gaps glowing
    for cx, h in ((-0.6, 2.65), (0.0, 2.98), (0.6, 2.72)):
        r = np.sqrt((X - cx) ** 2 + Y**2)
        zz = Z - 1.85
        wound = np.mod(zz, 0.25) < 0.14
        col = (Z > 1.85) & (Z < h - 0.1)
        v.fill("gold", col & (r < 0.25) & wound)
        v.fill("violet_glow", col & (r < 0.17) & ~wound)
        v.paint("amber", col & wound & (v.noise(0.3, 9) > 0.55))
        v.ball("chrome", (cx, 0, h - 0.1), (0.16, 0.16, 0.12))
    v.path("neon_dark", [(-0.6, 0, 2.6), (-0.3, 0.1, 2.42), (0.0, 0, 2.86)], 0.085)
    v.path("neon_dark", [(0.6, 0, 2.67), (0.9, 0.2, 2.3), (1.0, 0.45, 1.6)], 0.085)
    return v.done("transformer", keep=0.16)


@asset("spark-post", "circuit", "a 2 m post with a glowing cyan tip")
def spark_post():
    v = V((-0.4, -0.4, 0), (0.4, 0.4, 2.0), vpm=20)
    v.ball("stone_dark", (0, 0, 0.04), (0.34, 0.34, 0.22))
    v.ball("stone", (0.02, 0, 0.24), (0.2, 0.2, 0.1))
    v.path("wood", [(0, 0, 0.15), (0.05, 0, 0.8), (-0.02, 0, 1.55)], 0.11, 0.08)
    v.paint("bark", v.noise(0.3, 3) > 0.58, only="wood")
    for k in range(5):  # a coil wound round the top of the post
        z = 0.95 + k * 0.13
        v.ball("gold" if k % 2 == 0 else "amber", (0.035 - (z - 0.8) * 0.09, 0, z), (0.155, 0.155, 0.05))
    v.ball("chrome", (-0.02, 0, 1.6), (0.17, 0.17, 0.09))
    for a in (0.5, 2.6, 4.7):
        cx, cy = math.cos(a), math.sin(a)
        v.path("chrome", [(-0.02 + cx * 0.12, cy * 0.12, 1.6), (-0.02 + cx * 0.27, cy * 0.27, 1.75), (-0.02 + cx * 0.22, cy * 0.22, 1.93)], 0.06)
    v.ball("cyan_glow", (-0.02, 0, 1.83), 0.165)
    v.ball("moon_glow", (-0.02, 0, 1.83), 0.07)
    return v.done("spark-post", keep=0.22)


@asset("circuit-wall", "circuit", "backdrop wall panel for the blackout, 10 m square and 1 m thick (y 0 to 1): dead screens and cable runs; tiles in x and z")
def circuit_wall():
    v = V((-5, 0, 0), (5, 1, 10), vpm=4, open="xz")
    X, Y, Z = v.X, v.Y, v.Z
    v.fill("neon_dark", Y > 0.25)
    v.paint("navy_deep", v.noise(2.0, 3) > 0.45)
    v.paint("neon_plum", v.noise(1.4, 5) > 0.66)
    # dead screens: dark glass in dull frames, one to every 5 m, staggered
    for cx, cz, w, h in ((-2.5, 2.5, 1.5, 1.0), (2.5, 7.5, 1.25, 1.0), (2.25, 2.75, 0.75, 0.75), (-2.75, 7.25, 1.0, 0.75)):
        dx = np.maximum(abs(X - cx) - (w - 0.25), 0)
        dz = np.maximum(abs(Z - cz) - (h - 0.25), 0)
        scr = dx + dz < 0.4
        fr = (abs(X - cx) < w + 0.25) & (abs(Z - cz) < h + 0.25)
        v.fill("neon_tube_off", fr & (Y < 0.5))
        v.fill(None, scr & (Y < 0.5))
        v.fill("stone_dark", scr & (Y > 0.5) & (Y < 0.75))
        v.paint("navy", scr & (Z - cz > (X - cx) * 0.8), only="stone_dark")  # a dull sheen across the glass
    # cable runs, proud of the wall; they cross the whole panel so tiles join
    for z0, amp, ph, c in ((4.875, 0.5, 0.0, "neon_plum"), (0.375, 0.25, 1.0, "stone_dark"), (9.625, 0.0, 0.0, "violet")):
        zc = z0 + amp * np.sin((X + 5) * TAU / 10 * 2 + ph) - amp * math.sin(ph)
        v.fill(c, (abs(Z - zc) < 0.25) & (Y < 0.5))
    for x0, c in ((-0.125, "stone_dark"), (4.625, "neon_plum")):
        v.fill(c, (abs(X - x0) < 0.25) & (Y < 0.5), only="air")
    for bx, bz in ((-0.125, 4.875), (4.625, 0.375), (4.625, 9.625), (-0.125, 9.625)):  # junction boxes where runs cross
        v.fill("chrome", (abs(X - bx) < 0.5) & (abs(Z - bz) < 0.5) & (Y < 0.75))
        v.fill("neon_tube_off", (abs(X - bx) < 0.25) & (abs(Z - bz) < 0.25) & (Y < 0.5))
    return v.done("circuit-wall", keep=0.125, relax=1)
