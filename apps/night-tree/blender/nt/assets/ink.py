"""Two realms of the tree: the ink-wash garden (brush painting made solid: bold soft black strokes,
grey washes, cream paper, small red seals) and the high canopy (bark, dark leaves, moss, gold glows,
rising air and bells).

Sizes the map's collision is laid to: brush-stone 1 x 1 m; painted-bridge 2 m wide, top at z = 0;
moon-gate opening 4.5 m across with its sill top at z = 0; ink-wall and canopy-wall 10 x 10 x 1 m;
updraft-column 1 x 1 x 1 m, stacking in z.
"""
import math

import bpy
import numpy as np

from ..core import asset, child
from ..vox import V, register_colour
from .common import lantern

register_colour("wash_pale", "#A9A79C")  # a pale grey wash on paper
register_colour("seal_glow", "#D23A2C", emission=1.6)  # a seal that glows softly
register_colour("air_glow", "#DCF3EC", emission=1.2)  # rising air

TAU = 2 * math.pi


# ---- helpers ------------------------------------------------------------------------------------


def _fin(v, name, tris, relax=2):
    """Skins the sculpt, thinned to about `tris` triangles whatever its size."""
    s = np.pad(v.g > 0, 1).astype(np.int8)
    faces = sum(int((np.diff(s, axis=a) != 0).sum()) for a in range(3))
    return v.done(name, keep=float(np.clip(tris / max(2 * faces, 1), 0.02, 1.0)), relax=relax)


def _blade(v, c, p0, p1, w, sq=(1, 1, 1), only=None, power=0.7):
    """A leaf or brush stroke from p0 to p1: fat in the middle (radius w), pointed at both ends.
    `sq` squeezes it along an axis (a 2 in z makes it half as thick in z)."""
    d = [p1[i] - p0[i] for i in range(3)]
    L2 = sum(k * k for k in d) or 1e-9
    t = ((v.X - p0[0]) * d[0] + (v.Y - p0[1]) * d[1] + (v.Z - p0[2]) * d[2]) / L2
    tc = np.clip(t, 0, 1)
    dist2 = ((v.X - p0[0] - tc * d[0]) * sq[0]) ** 2 + ((v.Y - p0[1] - tc * d[1]) * sq[1]) ** 2 + ((v.Z - p0[2] - tc * d[2]) * sq[2]) ** 2
    r = w * np.sin(np.pi * tc) ** power
    return v.fill(c, (dist2 <= r * r) & (t > 0) & (t < 1), only)


def _grow(solid, n=1):
    d = solid.copy()
    for _ in range(n):
        p = np.pad(d, 1)
        d = d | p[2:, 1:-1, 1:-1] | p[:-2, 1:-1, 1:-1] | p[1:-1, 2:, 1:-1] | p[1:-1, :-2, 1:-1] | p[1:-1, 1:-1, 2:] | p[1:-1, 1:-1, :-2]
    return d


def _proud(v, c, mask, n=1):
    """Paints a mask onto the surface and raises it n voxels proud, like a loaded brush stroke."""
    s = v.g > 0
    m = np.broadcast_to(mask, s.shape)
    v.fill(c, _grow(s, n) & ~s & m)
    v.fill(c, s & ~_shrink(s, 2) & m)
    return v


def _shrink(solid, n=1):
    return ~_grow(~solid, n)


# ---- the ink garden -----------------------------------------------------------------------------


@asset("moon-gate", "ink", "a round moon gate in a 7 m wall; the opening is 4.5 m across, its sill top at z = 0; wall top at 6.5")
def moon_gate():
    v = V((-3.5, -0.45, -0.4), (3.5, 0.45, 6.5))
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(0.9, 3)
    n2 = v.noise(0.35, 4)
    cz0 = 1.85  # the opening's centre: 2.25 above its lowest point at z = -0.4
    r = np.sqrt(X**2 + (Z - cz0) ** 2)
    ang = np.arctan2(Z - cz0, X)
    sag = 0.16 * (1 - (X / 3.5) ** 2)
    v.fill("paper", (abs(Y) < 0.33) & (Z < 5.95 - sag))
    # washes: damp grey rising from the ground, pale clouds higher up
    # (each wash lies a finger proud of the paper, so the thinned skin keeps its edge)
    lay = (abs(Y) < 0.4) & (Z < 5.9 - sag)
    v.fill("wash_pale", lay & (n > 0.56) & (Z > 0.6))
    v.fill("wash_pale", lay & (Z < 1.0 + 1.6 * n) & (Z > 0))
    v.fill("ink_grey", lay & (Z < 0.4 + 1.3 * n) & (n2 > 0.4) & (Z > 0))
    v.fill("dusk", lay & (v.noise(0.8, 9) > 0.7) & (Z > 3.4) & (Z < 5.6))
    # the tiled coping, sagging in the middle
    cz = Z - (5.8 - sag)
    v.fill("ink", (cz > 0) & (cz < 0.7) & (abs(Y) < 0.45 - 0.3 * np.clip(cz / 0.7, 0, 1) ** 1.5))
    v.paint("ink_grey", (cz > 0.08) & (np.mod(X + 0.05, 0.5) < 0.16))
    # one loaded brush stroke round the opening, thick where it began and thin where it lifted
    wr = 0.24 + 0.24 * (0.5 + 0.5 * np.sin(ang + 2.3)) + 0.08 * (n2 - 0.5)
    v.fill("ink", (r < 2.25 + wr) & (abs(Y) < 0.45))
    v.paint("ink_grey", (r < 2.25 + wr) & (r > 2.25 + wr - 0.12) & (n > 0.5))
    v.fill(None, (r < 2.27) & (Z > 0))  # a shade over, for what the smoothing takes back
    # the sill and the footing under the ground
    v.paint("ink_grey", Z < 0)
    v.fill("ink_grey", (r < 2.25) & (Z < 0) & (abs(Y) < 0.45))
    v.paint("wash_pale", (r < 2.3) & (Z < 0) & (Z > -0.14) & (n2 > 0.35))
    v.paint("ink", (r < 2.3) & (Z < 0) & (Z > -0.14) & (np.mod(X, 0.9) < 0.1))
    # a sprig of bamboo brushed on the wall, and the painter's seal
    y = -0.37
    _blade(v, "ink", (-3.05, y, 0.5), (-2.85, y, 4.6), 0.1, power=0.3)
    if True:
        for z, dx, dz, c in ((4.4, 0.75, 0.25, "ink"), (4.0, -0.38, -0.5, "ink_grey"), (3.5, 0.7, -0.4, "ink"), (3.0, 0.55, 0.35, "ink_grey"), (4.6, 0.45, 0.6, "ink"), (2.3, 0.45, -0.35, "ink")):
            _blade(v, c, (-2.88, y, z), (-2.88 + dx, y, z + dz), 0.12)
    v.box("seal_red", (2.5, -0.43, 0.55), (3.0, -0.3, 1.05))
    v.box("paper", (2.62, -0.45, 0.67), (2.88, -0.4, 0.74))
    v.box("paper", (2.62, -0.45, 0.86), (2.88, -0.4, 0.93))
    v.box("paper", (2.71, -0.45, 0.67), (2.79, -0.4, 0.93))
    return _fin(v, "moon-gate", 4000)


def _bamboo(name, seed, h, stems):
    rng = np.random.default_rng(seed)
    v = V((-1.7, -0.9, 0), (1.7, 0.9, h))
    heights = [h * (1 - 0.13 * i) for i in range(stems)]
    order = rng.permutation(stems)
    for i in range(stems):
        hh = heights[order[i]] - 0.08
        x0 = (i - (stems - 1) / 2) * 0.5 + rng.uniform(-0.08, 0.08)
        y0 = rng.uniform(-0.3, 0.3)
        lean = rng.uniform(-0.55, 0.55)
        ph = rng.uniform(0, 6)

        def at(t):
            return (x0 + lean * t * t + 0.06 * math.sin(t * 5 + ph), y0 + 0.08 * math.sin(t * 4 + ph), hh * t)

        v.path("ink", [at(t) for t in np.linspace(0, 1, 9)], 0.105, 0.075)
        z = 0.45 + rng.uniform(0, 0.3)
        k = 0
        while z < hh - 0.25:
            p = at(z / hh)
            v.ball("ink_grey" if k % 3 else "wash_pale", p, (0.135, 0.135, 0.05))
            if z > 0.42 * hh:
                for _ in range(2 if z < 0.8 * hh else 3):
                    s = rng.choice([-1, 1])
                    L = rng.uniform(0.6, 1.05)
                    p1 = (p[0] + s * L, p[1] + rng.uniform(-0.35, 0.35), p[2] + rng.uniform(-0.5, 0.2))
                    _blade(v, rng.choice(["ink_grey", "ink_grey", "wash_pale", "ink", "ink_grey", "wash_pale", "dusk"]), p, p1, 0.17, sq=(1, 1.5, 1))
            z += rng.uniform(0.55, 0.8)
            k += 1
        top = at(1)
        for s in (-1, 1):
            _blade(v, "ink_grey", top, (top[0] + s * 0.7, top[1], top[2] - 0.45), 0.15)
    v.ball("ink_grey", (0, 0, 0), (0.3 + 0.28 * stems, 0.5, 0.12))
    v.paint("wash_pale", (v.noise(0.3, seed) > 0.6) & (v.Z < 0.14))
    return _fin(v, name, 1500)


for _n, _s, _h, _k in (("a", 3, 6.5, 3), ("b", 8, 5.2, 2), ("c", 12, 8.0, 4)):
    asset(f"bamboo-{_n}", "ink", f"a stand of ink bamboo {_h} m tall")(lambda _n=_n, _s=_s, _h=_h, _k=_k: _bamboo(f"bamboo-{_n}", _s, _h, _k))


@asset("bamboo-gate-shut", "ink", "a gate of lashed bamboo painted shut with one black brush stroke; 4 m wide, 4.5 m tall")
def bamboo_gate_shut():
    v = V((-2, -0.36, 0), (2, 0.3, 4.5))
    X, Y, Z = v.X, v.Y, v.Z
    rng = np.random.default_rng(5)
    xs = np.linspace(-1.86, 1.86, 12)
    for i, x in enumerate(xs):
        top = 4.5 - 0.13 - (0 if i in (3, 8) else rng.uniform(0.08, 0.5))
        c = ("paper", "wash_pale", "paper", "ink_grey", "paper", "wash_pale")[i % 6]
        lean = 0 if i in (0, 11) else rng.uniform(-0.035, 0.035)
        v.path(c, [(x, 0, 0), (x + lean, 0, top)], 0.135, 0.125)
        z = rng.uniform(0.3, 0.9)
        while z < top - 0.2:
            v.ball("ink_grey" if c != "ink_grey" else "ink", (x + lean * z / top, 0, z), (0.16, 0.16, 0.045))
            z += rng.uniform(0.7, 0.95)
    for z in (0.75, 3.55):
        v.rod("ink", (-2, -0.17, z), (2, -0.17, z + 0.06), 0.09)
        for i, x in enumerate(xs):
            v.ball("seal_red" if i % 3 == 1 else "ink", (x, -0.2, z + 0.03), (0.085, 0.1, 0.15))
    # the stroke that shuts it: one sweep from low left to high right, running dry as it goes
    zc = 2.15 + 0.42 * X + 0.22 * np.sin(X * 1.4 + 0.5)
    hw = (0.55 - 0.06 * X) * np.clip((X + 1.97) / 0.3, 0, 1) ** 0.5 * np.clip((1.95 - X) / 1.1, 0, 1) ** 0.55
    stroke = (abs(Z - zc) < hw) & (Y < 0.0)
    dry = (np.mod(Z - zc + 0.1 * np.sin(X * 3), 0.3) < 0.1) & (X > 0.9)
    _proud(v, "ink", stroke & ~dry, 2)
    _proud(v, "ink_grey", stroke & dry & (X < 1.5), 1)
    for x, L in ((-1.3, 0.9), (-0.55, 0.5), (0.3, 0.7)):  # drips
        z0 = 2.15 + 0.42 * x - 0.45
        _proud(v, "ink", (abs(X - x) < 0.07) & (Z < z0 + 0.1) & (Z > z0 - L) & (Y < 0), 1)
    v.box("seal_red", (1.25, -0.36, 0.95), (1.7, -0.1, 1.4))
    v.box("paper", (1.36, -0.36, 1.06), (1.59, -0.3, 1.13))
    v.box("paper", (1.36, -0.36, 1.22), (1.59, -0.3, 1.29))
    return _fin(v, "bamboo-gate-shut", 2500)


@asset("paper-crane", "ink", "a sleeping folded paper crane, 1.2 m, head bowed")
def paper_crane():
    v = V((-0.62, -0.6, 0), (0.62, 0.6, 0.85), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    # the folded body: a long diamond resting on its keel
    v.fill("paper", abs(X) / 0.46 + abs(Y) / 0.21 + abs(Z - 0.24) / 0.235 < 1)
    v.fill("paper", (abs(X) / 0.34 + abs(Y) / 0.14 < 1) & (Z < 0.07))
    # wings folded up and drooping outward in sleep
    s = (Z - 0.24) / 0.56
    yw = 0.06 + 0.5 * (Z - 0.24) + 0.55 * (Z - 0.24) ** 2
    wing = (s > 0) & (s < 1) & (X < 0.27 - 0.33 * s) & (X > -0.31 + 0.2 * s) & (abs(abs(Y) - yw) < 0.055)
    v.fill("paper", wing)
    v.paint("wash_pale", wing & (abs(Y) < yw - 0.005))
    v.paint("ink_grey", wing & (abs(X + 0.03 - 0.1 * s) < 0.022) & (abs(Y) > yw))
    # tail up behind, neck up in front, and the head bowed right down
    v.rod("paper", (-0.3, 0, 0.24), (-0.585, 0, 0.66), 0.105, 0.03, flat=False)
    v.rod("paper", (0.3, 0, 0.24), (0.49, 0, 0.7), 0.1, 0.07, flat=False)
    v.rod("paper", (0.49, 0, 0.7), (0.575, 0, 0.38), 0.07, 0.022, flat=False)
    v.paint("ink_grey", (X > 0.5) & (Z < 0.47))
    for sy in (-1, 1):
        v.ball("ink", (0.52, sy * 0.066, 0.62), (0.03, 0.02, 0.014))  # closed eyes
    # soft grey in the folds, and the folder's seal on one wing
    v.paint("wash_pale", (abs(Y) < 0.03) & (Z < 0.3), only="paper")
    v.paint("wash_pale", (Z < 0.16 - 0.2 * abs(X)), only="paper")
    v.paint("wash_pale", (v.noise(0.22, 2) > 0.68), only="paper")
    v.paint("seal_red", ((X + 0.03) ** 2 + (Z - 0.5) ** 2 < 0.06**2) & (Y < -0.1))
    return _fin(v, "paper-crane", 1500)


@asset("ink-scroll", "ink", "a hanging scroll 2 m wide, 3 m tall, origin at the top: a tall tower with coloured panes")
def ink_scroll():
    v = V((-1.0, -0.15, -3.0), (1.0, 0.1, 0), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    v.box("paper", (-0.88, -0.04, -2.9), (0.88, 0.05, -0.07))
    sheet = (abs(X) < 0.88) & (Z > -2.9) & (Z < -0.07)
    # every layer of the painting lies a little proud of the one under it, like thick paint
    L1 = (Y > -0.075) & (Y < 0)
    L2 = (Y > -0.105) & (Y < 0)
    L3 = (Y > -0.14) & (Y < 0)
    v.fill("dusk", sheet & L1 & ((abs(X) > 0.74) | (Z > -0.34) | (Z < -2.62)))  # the silk mount
    inside = (abs(X) < 0.72) & (Z < -0.36) & (Z > -2.6)
    n = v.noise(0.5, 6)
    # washes: mist, far hills, the ground and the moon
    v.fill("wash_pale", inside & L1 & (n > 0.62) & (Z > -1.7))
    hill = -1.95 + 0.25 * np.sin(X * 3.1 + 1) + 0.1 * np.sin(X * 8)
    v.fill("wash_pale", inside & L1 & (Z < hill))
    v.fill("ink_grey", inside & L2 & (Z < -2.28 + 0.07 * np.sin(X * 6)))
    v.fill("paper_glow", L1 & ((X - 0.44) ** 2 + (Z + 0.74) ** 2 < 0.15**2))
    cx = 0.03 * np.sin(Z * 2.2) - 0.08
    tw = 0.16 + 0.11 * np.clip((-0.9 - Z) / 1.5, 0, 1)
    v.fill("ink", L2 & (abs(X - cx) < tw) & (Z > -2.36) & (Z < -0.92))
    v.fill("ink", L2 & (Z >= -0.92) & (Z < -0.52) & (abs(X - cx) < 0.21 * (-0.52 - Z) / 0.4 + 0.012))
    v.rod("ink", (-0.08, -0.07, -0.56), (-0.07, -0.07, -0.42), 0.032)
    for z0 in (-0.95, -1.3, -1.66, -2.03):  # upturned eaves
        v.fill("ink", L2 & (abs(Z - z0 - 0.5 * np.clip(abs(X - cx) - tw, 0, 1) ** 1.4) < 0.04) & (abs(X - cx) < tw + 0.17))
    v.fill("ink", L2 & (Z < -2.33) & (Z > -2.42) & (abs(X + 0.08) < 0.42 - 0.3 * (Z + 2.42)))
    panes = ("amber_glass", "ruby", "sapphire", "amber_glass", "emerald", "rose", "amber_glass", "sapphire")
    k = 0
    for z0 in (-1.21, -1.57, -1.94, -2.28):
        for sx in (-1, 1):
            x = -0.08 + sx * (0.095 + 0.02 * k / 8) + 0.03 * math.sin(z0 * 2.2)
            v.fill(panes[k], L3 & (abs(X - x) < 0.055) & (Z > z0) & (Z < z0 + 0.16))
            k += 1
    v.fill("amber_glass", L3 & (abs(X + 0.08) < 0.05) & (Z > -0.87) & (Z < -0.73))
    # a few birds, reeds at the foot, and the seal
    for bx, bz in ((-0.45, -0.7), (-0.3, -0.56), (0.3, -1.2)):
        for sd in (-1, 1):
            _blade(v, "ink", (bx, -0.07, bz), (bx + sd * 0.12, -0.07, bz + 0.07), 0.035)
    for rx, rh in ((0.42, 0.42), (0.5, 0.6), (0.58, 0.35), (-0.55, 0.3)):
        _blade(v, "ink", (rx, -0.07, -2.5), (rx + 0.06, -0.07, -2.5 + rh), 0.035, power=0.4)
    v.fill("seal_red", L2 & (X > -0.66) & (X < -0.5) & (Z > -2.56) & (Z < -2.4))
    # the rods it hangs and rolls on
    v.rod("ink", (-1.0, 0, -0.07), (1.0, 0, -0.07), 0.07)
    v.rod("ink", (-1.0, 0, -2.92), (1.0, 0, -2.92), 0.08)
    for sx in (-1, 1):
        v.ball("seal_red", (sx * 0.95, 0, -0.07), (0.05, 0.095, 0.07))
        v.ball("seal_red", (sx * 0.95, 0, -2.92), (0.05, 0.1, 0.08))
    return _fin(v, "ink-scroll", 2200, relax=1)


@asset("idol-snowy-ink", "ink", "the ink garden's guardian: a 5 m snowy owl painted in ink and made solid; behind the path (y 0.8 to 3)")
def idol_snowy_ink():
    v = V((-1.75, 0.8, 0), (1.75, 3.0, 5.0))
    X, Y, Z = v.X, v.Y, v.Z
    c = 1.9
    n = v.noise(0.8, 4)
    # an ink-stone plinth
    v.fill("ink", ((abs(X) / 1.75) ** 4 + (abs(Y - c) / 1.1) ** 4 < 1) & (Z < 0.55))
    v.paint("ink_grey", (n > 0.55) & (Z < 0.55))
    v.paint("wash_pale", (Z > 0.44) & (Z < 0.55) & (v.noise(0.4, 2) > 0.45))
    v.ball("paper", (0, c + 0.05, 2.25), (1.45, 1.0, 1.8))
    v.ball("paper", (0, c, 3.95), (1.25, 0.98, 1.05))
    for sx in (-1, 1):
        v.ball("paper", (sx * 1.2, c + 0.15, 2.3), (0.52, 0.8, 1.45))
        v.ball("paper", (sx * 0.5, c + 0.75, 0.75), (0.42, 0.34, 0.3))  # tail
    owl = Z > 0.55
    # grey wash down the back and under the wings, pale wash on the crown
    v.paint("wash_pale", owl & (Y > c + 0.2) & (n > 0.42))
    v.paint("ink_grey", owl & (Y > c + 0.55) & (np.mod(Z + 0.2 * np.sin(X * 3), 0.55) < 0.2))
    v.paint("wash_pale", owl & (Z < 1.2 + 0.5 * n) & (Y < c))
    # brush bars: short dashes across the breast, longer ones on the wings
    row = np.floor((Z + 0.12 * X**2) / 0.42)
    zz = np.mod(Z + 0.12 * X**2, 0.42)
    bars = (zz < 0.17) & (np.mod(X + row * 0.31, 0.72) < 0.4) & (Z > 1.0) & (Z < 3.0) & (abs(X) < 0.95) & (Y < c - 0.3)
    _proud(v, "ink", bars & owl, 1)
    wb = (np.mod(Z - 0.35 * abs(X), 0.5) < 0.2) & (abs(X) > 1.0) & (Z > 1.1) & (Z < 3.45) & (Y < c + 0.5)
    _proud(v, "ink", wb & owl, 1)
    v.paint("ink_grey", owl & (abs(X) > 0.95) & (abs(X) < 1.06) & (Z < 3.2) & (Z > 1.0) & (Y < c - 0.2))
    crown = (np.mod(X + 0.4 * np.floor(Z / 0.3), 0.6) < 0.22) & (np.mod(Z, 0.3) < 0.13) & (Z > 4.45) & (Y < c + 0.3)
    _proud(v, "ink", crown & owl, 1)
    # the face: brushed rings round gold eyes, a black beak and brows
    for sx in (-1, 1):
        v.ball("ink", (sx * 0.5, 1.07, 4.05), (0.4, 0.18, 0.4))
        v.ball("eye", (sx * 0.5, 1.0, 4.05), (0.29, 0.16, 0.29))
        v.ball("pupil", (sx * 0.5, 0.93, 4.05), (0.15, 0.1, 0.16))
        v.ball("cream", (sx * 0.5 - 0.08, 0.88, 4.13), 0.055)
        _blade(v, "ink", (sx * 0.12, 0.92, 4.42), (sx * 0.98, 1.22, 4.66), 0.11)
        for t in (-0.18, 0, 0.18):  # talons over the plinth's edge
            v.rod("ink", (sx * 0.55 + t, 1.25, 0.62), (sx * 0.55 + t * 1.5, 0.88, 0.5), 0.1, 0.05, flat=False)
    v.rod("ink", (0, 0.93, 3.88), (0, 0.84, 3.5), 0.15, 0.03, flat=False)
    v.paint("wash_pale", (abs(X) < 0.16) & (Z > 3.3) & (Z < 3.48) & (Y < 1.1), only="paper")
    # the seal on its base
    v.box("seal_red", (-0.32, 0.8, 0.08), (0.32, 0.93, 0.47))
    v.box("paper", (-0.2, 0.8, 0.31), (0.2, 0.9, 0.37))
    v.box("paper", (-0.2, 0.8, 0.17), (0.2, 0.9, 0.23))
    v.box("paper", (-0.04, 0.8, 0.17), (0.04, 0.9, 0.37))
    return _fin(v, "idol-snowy-ink", 4000)


@asset("brush-stone", "ink", "touch it to paint a bridge: a 1 m ink stone, 1 m tall with the brush on top, a glowing seal on its face")
def brush_stone():
    v = V((-0.5, -0.42, 0), (0.5, 0.42, 1.0), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(0.3, 3)
    side = (abs(X) / 0.5) ** 6 + (abs(Y) / 0.37) ** 6
    v.fill("stone_dark", ((side + (np.clip(Z - 0.45, 0, 1) / 0.44) ** 6 < 1) & (Z < 0.89)))
    v.paint("ink", n > 0.52)
    # grey brush strokes round it, standing a little proud
    _proud(v, "ink_grey", (np.mod(Z + 0.12 * np.sin(X * 5) + 0.1 * np.sin(Y * 6), 0.3) < 0.075) & (v.noise(0.35, 7) > 0.4) & (Z < 0.8) & (Z > 0.05), 1)
    v.fill(None, ((X + 0.02) / 0.34) ** 2 + (Y / 0.25) ** 2 + ((Z - 0.91) / 0.075) ** 2 < 1)  # the ink well
    v.top("wash_pale", 1, only=["stone_dark", "ink"])
    v.paint("ink", ((X + 0.02) / 0.34) ** 2 + (Y / 0.25) ** 2 < 0.9, only="wash_pale")
    v.paint("dusk", (((X + 0.1) / 0.16) ** 2 + ((Y - 0.02) / 0.1) ** 2 < 1) & (Z > 0.8))  # a wet gleam
    # the seal on its face: a red plate with a pale mark
    plate = (abs(X) < 0.25) & (abs(Z - 0.45) < 0.25) & (Y < -0.3)
    v.fill("seal_glow", plate & (Y > -0.395))
    mark = (np.sqrt((abs(X) - 0.095) ** 2 + (Z - 0.52) ** 2) < 0.06) | ((abs(Z - 0.36 - 0.6 * abs(X)) < 0.035) & (abs(X) < 0.1)) | ((abs(Z - 0.27) < 0.03) & (abs(X) < 0.15))
    v.fill("paper_glow", plate & mark)
    v.fill("seal_glow", plate & (np.sqrt((abs(X) - 0.095) ** 2 + (Z - 0.52) ** 2) < 0.022))
    # the brush resting across the top
    v.rod("wood_light", (-0.43, 0.2, 0.935), (0.16, -0.06, 0.95), 0.05)
    v.rod("seal_red", (-0.43, 0.2, 0.935), (-0.33, 0.156, 0.938), 0.056)
    v.rod("ink", (0.08, -0.025, 0.948), (0.17, -0.065, 0.95), 0.056)
    v.rod("paper", (0.16, -0.06, 0.95), (0.44, -0.2, 0.9), 0.07, 0.016, flat=False)
    v.paint("ink", (X > 0.3) & (Z > 0.84) & (Y < 0.0), only="paper")
    return _fin(v, "brush-stone", 1500)


@asset("painted-bridge", "ink", "one 2 m piece of a bridge painted by the owl: a wet brush stroke, top at z = 0; tiles in x")
def painted_bridge():
    v = V((-1, -1, -0.3), (1, 1, 0), open="x")
    X, Y, Z = v.X, v.Y, v.Z

    Xp = (X - X.min()) / (X.max() - X.min()) * 2  # one full period from the first slice to the last, so the ends match

    def per(k, ph):
        return np.sin(np.pi * k * Xp + ph)

    ef = 0.8 + 0.1 * per(1, 0.4) + 0.07 * per(3, 1.9) + 0.04 * per(5, 0.3)
    eb = 0.8 + 0.09 * per(1, 2.5) + 0.07 * per(2, 0.7) + 0.05 * per(6, 1.0)
    ef = ef / ef.max()
    eb = eb / eb.max()
    edge = np.where(Y < 0, ef, eb)
    under = -0.3 + 0.1 * (abs(Y) / edge) ** 2
    v.fill("ink", (abs(Y) < edge) & (Z > under))
    # bristles split at the edges, where the stroke ran dry
    split = (np.mod(abs(Y) + 0.03 * per(2, 0.8), 0.28) < 0.12) & (abs(Y) > edge - 0.34) & (per(2, 1.0 + np.floor(abs(Y) / 0.28) * 2.1 + (Y > 0) * 1.3) > 0.25)
    v.fill(None, split & (abs(Y) > 0.55))
    v.paint("ink_grey", (abs(Y) > edge - 0.16 - 0.08 * per(4, 0.2)) & (Z > -0.1))
    v.paint("wash_pale", (abs(Y) > edge - 0.07) & (per(3, 0.5) > 0.2) & (Z > -0.1))
    v.paint("ink_grey", (np.mod(Y + 0.05 * per(1, 0), 0.46) < 0.08) & (per(1, Y * 5.0) > 0.2) & (Z > -0.07))
    v.paint("wash_pale", (np.mod(Y + 0.2 + 0.04 * per(2, 1), 0.62) < 0.07) & (per(1, Y * 4.0 + 2) > 0.45) & (Z > -0.07))
    v.paint("dusk", (abs(Y + 0.1 - 0.04 * per(1, 1)) < 0.05) & (per(1, 2.2) > 0.1) & (Z > -0.07))  # the wet gleam
    v.paint("ink_grey", Z < under + 0.07)
    return _fin(v, "painted-bridge", 1500)


@asset("seal", "ink", "a pick-up: a red seal stamp 0.7 m square with an owl's face; origin at its centre")
def seal():
    v = V((-0.35, -0.18, -0.35), (0.35, 0.18, 0.35), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    sq = (abs(X) / 0.35) ** 8 + (abs(Z) / 0.35) ** 8
    v.fill("seal_glow", (sq < 1) & (abs(Y) < 0.12))
    v.fill("seal_glow", (sq < 1) & (np.maximum(abs(X), abs(Z)) > 0.27) & (abs(Y) < 0.18))
    v.paint("seal_red", (v.noise(0.2, 3) > 0.62))
    ed = np.sqrt((abs(X) - 0.095) ** 2 + (Z - 0.035) ** 2)
    eye = (ed < 0.075) & (ed > 0.03)
    beak = (abs(X) < 0.045 * np.clip((Z + 0.13) / 0.09, 0, 1)) & (Z < -0.04)
    hd = np.sqrt(X**2 + (Z + 0.0) ** 2)
    head = (abs(hd - 0.225) < 0.022) & (Z > 0.09)  # a round head, no tufts
    breast = (abs(Z + 0.2 + 0.5 * abs(abs(X) - 0.08)) < 0.02) & (abs(abs(X) - 0.08) < 0.055)  # two feather ticks
    v.fill("paper", (eye | beak | head | breast) & (abs(Y) < 0.18) & (abs(Y) > 0.1))
    return _fin(v, "seal", 1400, relax=1)


def _rock(name, seed, lo, hi, balls, hole=None):
    v = V(lo, hi)
    X, Y, Z = v.X, v.Y, v.Z
    for at, r in balls:
        v.ball("ink_grey", at, r)
    n = v.noise(0.55, seed)
    n2 = v.noise(0.25, seed + 1)
    v.fill(None, (n2 > 0.72) & (v.surface()))  # pitted, like a scholar's rock
    if hole:
        v.fill(None, ((X - hole[0]) / hole[2]) ** 2 + ((Z - hole[1]) / hole[3]) ** 2 < 1)
    # brushed contours: ragged dark bands that follow the form, heavy at the foot
    v.paint("dusk", (v.noise(0.6, seed + 4) > 0.64), only="ink_grey")
    v.top("wash_pale", 2, only="ink_grey")
    v.paint("paper", v.exposed(2, 1, 1) & (n > 0.5))
    _proud(v, "ink", (np.mod(Z * 1.0 + 0.7 * n + 0.25 * X, 0.6) < 0.15) & (v.noise(0.7, seed + 6) > 0.38), 1)
    v.paint("ink", (Z < 0.2 + 0.5 * n))
    return _fin(v, name, 1500)


@asset("ink-rock-a", "ink", "a brush-painted rock, 2.7 m wide")
def ink_rock_a():
    return _rock("ink-rock-a", 3, (-1.4, -0.9, 0), (1.4, 0.9, 1.9), [((-0.4, 0, 0.55), (0.95, 0.75, 0.95)), ((0.55, 0.1, 0.45), (0.82, 0.7, 0.8)), ((0.0, -0.1, 1.15), (0.62, 0.55, 0.72))])


@asset("ink-rock-b", "ink", "a standing brush-painted rock with a hole worn through it, 2.9 m tall")
def ink_rock_b():
    return _rock("ink-rock-b", 9, (-0.95, -0.7, 0), (0.95, 0.7, 2.9), [((0, 0, 0.5), (0.8, 0.62, 0.75)), ((0.2, 0, 1.45), (0.6, 0.5, 0.85)), ((-0.12, 0, 2.2), (0.55, 0.46, 0.68))], hole=(0.12, 1.3, 0.24, 0.34))


@asset("ink-pine", "ink", "a twisted pine 6 m tall with flat cloud-like foliage pads")
def ink_pine():
    v = V((-2.7, -1.3, 0), (2.7, 1.3, 6.0))
    X, Y, Z = v.X, v.Y, v.Z
    trunk = [(0.25, 0, 0), (-0.35, 0.1, 1.2), (0.45, -0.1, 2.3), (-0.2, 0.1, 3.4), (0.55, 0, 4.4), (0.1, 0, 5.4)]
    v.path("ink", trunk, 0.32, 0.12)
    v.ball("ink", (0.25, 0, 0), (0.6, 0.45, 0.3))
    v.paint("ink_grey", (np.mod(Z * 1.4 + X * 2.5 + 0.5 * v.noise(0.4, 2), 0.6) < 0.2))
    pads = [(-1.6, 0.0, 2.55, 1.0, 0.8, 1), (1.65, 0.2, 3.45, 0.95, 0.8, 2), (-1.25, -0.1, 4.45, 0.95, 0.75, 3), (1.1, 0.0, 5.05, 0.85, 0.7, 4), (-0.1, 0.1, 5.7, 0.75, 0.65, 2)]
    pad = np.zeros(v.g.shape, bool)
    for cx, cy, cz, rx, ry, ti in pads:
        v.path("ink", [trunk[ti], ((trunk[ti][0] + cx) / 2, cy, (trunk[ti][2] + cz) / 2 - 0.25), (cx, cy, cz - 0.1)], 0.15, 0.1)
        before = v.g > 0
        for dx, dy, dz, k in ((0, 0, 0, 1.0), (-0.55, 0.1, -0.06, 0.6), (0.55, -0.1, -0.05, 0.62), (0.1, 0.2, 0.1, 0.7)):
            v.ball("ink_grey", (cx + dx * rx, cy + dy, cz + dz), (rx * k, ry * k, 0.28 * (0.6 + 0.4 * k)))
        pad |= (v.g > 0) & ~before
    n = v.noise(0.35, 5)
    v.fill("ink", pad & v.exposed(2, -1, 2))  # dark underneath
    v.fill("wash_pale", pad & v.exposed(2, 1, 1) & (n > 0.4))
    v.fill("dusk", pad & (v.noise(0.5, 8) > 0.68) & ~v.exposed(2, 1, 1))
    v.fill("ink", pad & (np.random.default_rng(3).random(v.g.shape) < 0.08))  # needles
    return _fin(v, "ink-pine", 1800)


@asset("paper-lantern", "ink", "a standing paper lantern, 1.5 m, glowing cream")
def paper_lantern():
    v = V((-0.45, -0.45, 0), (0.45, 0.45, 1.5), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    for sx in (-1, 1):
        for sy in (-1, 1):
            v.rod("ink", (sx * 0.36, sy * 0.36, 0), (sx * 0.27, sy * 0.27, 1.2), 0.05)
    v.box("ink", (-0.33, -0.33, 0.5), (0.33, 0.33, 0.58))
    body = ((abs(X) / 0.27) ** 6 + (abs(Y) / 0.27) ** 6 < 1) & (Z > 0.56) & (Z < 1.16)
    v.fill("paper_glow", body)
    v.paint("paper", body & (v.noise(0.25, 2) > 0.68))
    v.fill("ink", (np.maximum(abs(X), abs(Y)) < 0.3) & (np.maximum(abs(X), abs(Y)) > 0.24) & (abs(Z - 0.86) < 0.022))
    # a brushed mark and a seal on the paper
    _proud(v, "ink", body & (Y < 0) & (abs(X + 0.04 - 0.3 * (Z - 0.86)) < 0.035) & (abs(Z - 0.9) < 0.17), 1)
    _proud(v, "ink", body & (Y < 0) & (abs(Z - 0.98 - 0.3 * X) < 0.03) & (abs(X + 0.02) < 0.15), 1)
    _proud(v, "seal_red", body & (Y < 0) & (abs(X - 0.14) < 0.045) & (abs(Z - 0.68) < 0.045), 1)
    # a sagging roof
    rr = np.maximum(abs(X), abs(Y))
    rz = (Z - 1.16) / 0.24
    v.fill("ink", (rz > 0) & (rz < 1) & (rr < 0.44 - 0.4 * rz**0.55))
    v.fill("ink", (Z > 1.12) & (Z < 1.19) & (rr < 0.44))
    v.paint("ink_grey", (Z > 1.19) & (np.mod(np.arctan2(Y, X) + 0.2, 0.7854) < 0.25))
    v.ball("seal_red", (0, 0, 1.43), (0.065, 0.065, 0.07))
    return _fin(v, "paper-lantern", 1500)


@asset("paper-lantern-hang", "ink", "a hanging paper lantern, 1 m, origin at the top")
def paper_lantern_hang():
    v = V((-0.35, -0.35, -1.0), (0.35, 0.35, 0), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    v.rod("ink", (0, 0, -0.2), (0, 0, 0), 0.035)
    v.ball("paper_glow", (0, 0, -0.5), (0.31, 0.31, 0.29))
    v.paint("paper", (np.mod(Z + 0.02, 0.115) < 0.03) & (abs(Z + 0.5) < 0.25))
    v.rod("ink", (0, 0, -0.26), (0, 0, -0.18), 0.17)
    v.rod("ink", (0, 0, -0.8), (0, 0, -0.74), 0.15)
    globe = (Z < -0.27) & (Z > -0.73) & (Y < 0)
    _proud(v, "ink", globe & (abs(X - 0.25 * (Z + 0.5)) < 0.035) & (abs(Z + 0.5) < 0.16), 1)
    _proud(v, "ink", globe & (abs(Z + 0.42 + 0.25 * X) < 0.03) & (abs(X) < 0.14), 1)
    _proud(v, "seal_red", globe & (abs(X - 0.13) < 0.04) & (abs(Z + 0.63) < 0.04), 1)
    v.rod("seal_red", (0, 0, -0.8), (0.02, 0, -0.985), 0.055, 0.03, flat=False)
    v.ball("seal_red", (0, 0, -0.84), 0.065)
    return _fin(v, "paper-lantern-hang", 1200)


def _mountain(name, seed, H, back, mid, front):
    v = V((-15, 0, 0), (15, 2, H), vpm=4)
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(3.0, seed)
    win = 1 - (abs(X) / 15.2) ** 6

    def ridge(peaks, base):
        h = base + 0 * X
        for cx, ht, w in peaks:
            h = np.maximum(h, ht * np.exp(-(np.abs((X - cx) / (w * 1.25)) ** 2.7)) + base * 0.5)
        return h * win

    hb = ridge(back, 2.0) + 0.5 * (n[:, 4:5, 2:3] - 0.5)
    hm = ridge(mid, 1.6) + 0.5 * (n[:, 2:3, 4:5] - 0.5)
    hf = ridge(front, 1.2)
    hb = hb * (H - 0.13) / hb.max()
    # three ranges, the far one tall and dark, each rounded off toward the camera
    v.fill("ink_wash", (Y > 1.0) & (Z < hb - 1.2 * np.clip(1.5 - Y, 0, 1) ** 2))
    v.fill("ink_grey", (Y > 0.5) & (Y < 1.5) & (Z < hm - 1.0 * np.clip(1.0 - Y, 0, 1) ** 2))
    v.fill("wash_pale", (Y < 1.0) & (Z < hf - 0.8 * np.clip(0.5 - Y, 0, 1) ** 2))
    # each range pales toward its foot, and mist lies along the bottom
    v.paint("ink_grey", (Z < hb * 0.5 + 2 * (n - 0.5)), only="ink_wash")
    v.paint("wash_pale", (Z < hm * 0.5 + 2 * (n - 0.5)), only="ink_grey")
    v.paint("ink", (Z > hb - 1.2) & (v.noise(2.0, seed + 2) > 0.5), only="ink_wash")
    v.paint("wash_pale", (Z < 2.0 + 2.0 * n))
    v.paint("paper", (Z < 1.0 + 1.4 * n))
    v.paint("dusk", (v.noise(4.0, seed + 5) > 0.62) & (Z > 2.5), only="ink_grey")
    rng = np.random.default_rng(seed)
    for i, x in enumerate(np.linspace(-13.4, 13.4, 13)):  # mist lying in soft banks along the foot
        v.ball("paper" if i % 3 else "wash_pale", (x + rng.uniform(-0.5, 0.5), 0.75, rng.uniform(0.0, 0.5)), (min(rng.uniform(1.5, 2.6), 15 - abs(x)), 0.75, rng.uniform(0.8, 1.5)))
    return _fin(v, name, 800)


@asset("ink-mountain-a", "ink", "backdrop: ink-wash mountains 30 m wide, 16 m tall, 2 m deep")
def ink_mountain_a():
    return _mountain("ink-mountain-a", 3, 16, [(-6, 16, 3.6), (2.5, 12, 3.0), (9.5, 9.5, 3.4), (-12, 7, 2.5)], [(-9.5, 8, 2.6), (-1.5, 7, 3.0), (6, 8.5, 2.8), (12, 5, 2.2)], [(-12, 3.6, 3), (-4, 4.2, 3.2), (4, 3.2, 3), (11, 4, 3)])


@asset("ink-mountain-b", "ink", "backdrop: lower ink-wash mountains 30 m wide, 10 m tall, 2 m deep")
def ink_mountain_b():
    return _mountain("ink-mountain-b", 7, 10, [(5, 10, 4.2), (-7, 8, 3.6), (12, 6, 2.4), (-13, 5, 2.2)], [(0, 6, 3.4), (9, 5.5, 2.6), (-10.5, 5.5, 2.8)], [(-8, 3.2, 3.4), (3, 3.4, 3), (11.5, 2.8, 2.6)])


@asset("ink-wall", "ink", "backdrop panel 10 x 10 m, 1 m thick (y 0 to 1): cream paper, grey washes, a few strokes; tiles in x and z")
def ink_wall():
    v = V((-5, 0, 0), (5, 1, 10), vpm=4, open="xz")
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(1.6, 5)
    # the paper lies half way back; washes lie on it and ink on them, so each keeps its edge
    v.fill("paper", Y > 0.5)

    def stroke(c, depth, zc, hw, x0, x1):
        taper = np.clip(np.minimum(X - x0, x1 - X) / 1.4, 0, 1) ** 0.5
        v.fill(c, (abs(Z - zc) < hw * taper) & (X > x0) & (X < x1) & (Y > depth) & (Z > 0.3) & (Z < 9.7))

    stroke("wash_pale", 0.25, 2.5 + 0.5 * np.sin(X * 0.7 + 1), 0.8 + 0.5 * n, -4.6, 4.3)
    stroke("ink_grey", 0.25, 1.9 + 0.5 * np.sin(X * 0.7 + 1.2), 0.35, -4.0, 2.8)
    stroke("wash_pale", 0.25, 6.3 + 0.6 * np.sin(X * 0.6), 0.5 + 0.5 * n, -3.6, 4.6)
    stroke("dusk", 0.25, 8.7 + 0.3 * np.sin(X * 0.9 + 2), 0.45, -4.5, 0.5)
    stroke("wash_pale", 0.25, 4.3 + 0.3 * np.sin(X + 2), 0.4, 0.5, 4.5)
    # black strokes: a long dry sweep, reeds, three birds, and the seal
    stroke("ink", 0.0, 6.0 + 0.12 * X + 0.35 * np.sin(X * 0.9), 0.42 - 0.04 * (X + 3.5), -3.9, 2.6)
    for x, h, lean in ((-4.0, 2.6, 0.5), (-3.3, 3.6, -0.3), (-2.7, 2.0, 0.6), (3.7, 2.8, -0.6), (3.2, 1.7, 0.3)):
        _blade(v, "ink", (x, 0.25, 0.5), (x + lean, 0.25, 0.5 + h), 0.3, power=0.5)
    for bx, bz in ((1.9, 8.5), (3.2, 7.8), (0.5, 8.0)):
        for sd in (-1, 1):
            _blade(v, "ink", (bx, 0.25, bz), (bx + sd * 0.8, 0.25, bz + 0.45), 0.26)
    v.box("seal_red", (3.5, 0, 0.75), (4.25, 0.6, 1.5))
    return _fin(v, "ink-wall", 1000, relax=1)


@asset("stone-lantern", "ink", "a garden stone lantern, 2 m, lit")
def stone_lantern():
    v = V((-0.75, -0.75, 0), (0.75, 0.75, 2.0), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    R = np.sqrt(X**2 + Y**2)
    n = v.noise(0.3, 4)
    v.fill("ink_grey", (R < 0.52 - 0.5 * Z) & (Z < 0.24))
    v.rod("ink_grey", (0.02, 0, 0.2), (-0.01, 0, 1.0), 0.2, 0.15)
    v.ball("ink_grey", (0, 0, 0.6), (0.23, 0.23, 0.14))
    v.fill("ink_grey", (R < 0.2 + 0.26 * np.clip((Z - 0.9) / 0.14, 0, 1)) & (Z > 0.9) & (Z < 1.12))
    for sx in (-1, 1):
        for sy in (-1, 1):
            v.rod("ink_grey", (sx * 0.27, sy * 0.27, 1.1), (sx * 0.27, sy * 0.27, 1.52), 0.075)
    lantern(v, (0, 0, 1.56), 1.0, frame="ink")
    v.ball("gold_glow", (0, 0, 1.31), (0.2, 0.2, 0.19))
    # a roof with upturned corners and a bud on top
    rz = np.clip((Z - 1.5) / 0.3, 0, 1)
    lift = 0.16 * np.clip((R - 0.35) / 0.35, 0, 1) ** 2
    v.fill("ink_grey", (Z > 1.5 + lift) & (Z < 1.82) & (R < 0.72 - 0.58 * np.clip((Z - 1.5 - lift) / 0.3, 0, 1) ** 0.6))
    v.ball("ink_grey", (0, 0, 1.89), (0.11, 0.11, 0.105))
    v.paint("ink", (n > 0.6))
    v.paint("ink", (Z > 1.48) & (Z < 1.6 + lift), only="ink_grey")
    v.top("wash_pale", 2, only="ink_grey")
    v.paint("moss", (v.noise(0.22, 8) > 0.68) & (Z > 1.6), only="wash_pale")
    v.paint("dusk", (v.noise(0.4, 9) > 0.66) & (Z < 1.0), only="ink_grey")
    return _fin(v, "stone-lantern", 1500)


@asset("garden-bridge", "ink", "a red arched garden bridge 6 m wide, the arch 1.5 m high; decoration behind the path")
def garden_bridge():
    v = V((-3, 0.8, 0), (3, 2.4, 2.2))
    X, Y, Z = v.X, v.Y, v.Z
    top = 1.5 * (1 - (X / 3.0) ** 2)
    yc = 1.6
    deck = (Z < top) & (Z > top - 0.3 - 0.12 * (abs(X) / 3) ** 2) & (abs(Y - yc) < 0.62)
    v.fill("ink_grey", deck)
    v.paint("ink", (np.mod(X, 0.5) < 0.1) & (Z > top - 0.1))
    v.paint("wash_pale", (v.noise(0.5, 3) > 0.58) & (Z > top - 0.1), only="ink_grey")
    v.paint("ink", (Z < top - 0.2) & deck)
    for sy in (-1, 1):
        y = yc + sy * 0.68
        for dz, rr in ((0.55, 0.075), (0.28, 0.065)):
            v.fill("seal_red", ((Z - top - dz) ** 2 + (Y - y) ** 2 < rr**2) & (abs(X) < 2.75))
        for x in (-2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7):
            t = 1.5 * (1 - (x / 3.0) ** 2)
            v.rod("ink", (x, y, max(t - 0.3, 0)), (x, y, t + 0.66), 0.09)
            v.ball("seal_red", (x, y, t + 0.7), (0.115, 0.115, 0.09))
    v.paint("red", (v.noise(0.4, 6) > 0.6), only="seal_red")
    for sx in (-1, 1):  # stones where it lands
        v.ball("ink_grey", (sx * 2.75, 1.5, 0), (0.3, 0.7, 0.28))
        v.ball("ink", (sx * 2.6, 2.1, 0), (0.3, 0.3, 0.34))
    v.paint("wash_pale", v.exposed(2, 1, 1) & (Z < 0.4) & (abs(X) > 2.3))
    return _fin(v, "garden-bridge", 2500)


@asset("koi", "ink", "an ink koi 0.8 m long in black and red patches; origin at its centre")
def koi():
    v = V((-0.42, -0.24, -0.2), (0.42, 0.24, 0.2), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    yc = 0.045 * np.sin(X * 7.5 + 0.4)
    w = np.where(X > 0.1, 0.105 * np.clip(1 - ((X - 0.1) / 0.29) ** 2, 0, 1) ** 0.5, 0.035 + 0.07 * np.clip((X + 0.27) / 0.37, 0, 1) ** 0.8)
    body = (((Y - yc) / w) ** 2 + (Z / (w * 1.18)) ** 2 < 1) & (X > -0.27)
    v.fill("paper", body)
    n1 = v.noise(0.17, 4)
    n2 = v.noise(0.15, 7)
    v.paint("seal_red", (n1 > 0.52) & (Z > -0.03))
    v.paint("ink", (n2 > 0.6) & (Z > -0.05))
    v.paint("seal_red", (X > 0.24) & (Z > 0.0))
    # fins and a fanned tail
    tx = np.clip((-0.2 - X) / 0.21, 0, 1)
    v.fill("wash_pale", (X < -0.2) & (X > -0.41) & (abs(Z) < 0.035 + 0.15 * tx) & (abs(Y - yc) < 0.034) & ~((abs(Z) < 0.1 * (tx - 0.55)) & (tx > 0.55)))
    v.paint("ink", (X < -0.3) & (np.mod(Z, 0.07) < 0.03))
    v.fill("ink", (Z > 0) & (Z < w * 1.18 + 0.055 * np.sin(np.clip((X + 0.12) / 0.26, 0, 1) * np.pi)) & (abs(Y - yc) < 0.032) & (X > -0.12) & (X < 0.14))
    for sy in (-1, 1):
        _blade(v, "wash_pale", (0.17, sy * 0.07 + 0.04, -0.05), (0.04, sy * 0.21 + 0.03, -0.1), 0.05, sq=(1, 1, 1.6))
        v.ball("ink", (0.305, sy * 0.068 + 0.033, 0.03), 0.022)
    return _fin(v, "koi", 1400)


# ---- the high canopy ----------------------------------------------------------------------------


@asset("bell", "canopy", "a pick-up: a hanging bronze-gold bell 0.8 m tall with a clapper and a leaf ribbon; origin at its middle")
def bell():
    v = V((-0.4, -0.36, -0.4), (0.4, 0.36, 0.4), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    R = np.sqrt(X**2 + Y**2)
    ro = 0.13 + 0.15 * np.clip((0.2 - Z) / 0.48, 0, 1) ** 1.7 + 0.035 * np.clip((-0.2 - Z) / 0.08, 0, 1)
    v.fill("gold_soft", (R < ro) & (Z < 0.2) & (Z > -0.28))
    v.ball("gold_soft", (0, 0, 0.2), (0.13, 0.13, 0.09))
    v.fill(None, (R < ro - 0.065) & (Z < 0.1))
    v.paint("gold", (Z < -0.19) | (abs(Z - 0.05) < 0.022) | (abs(Z + 0.06) < 0.016))
    v.paint("amber", (np.mod(np.arctan2(Y, X) + 0.3, TAU / 6) < 0.3) & (abs(Z + 0.005) < 0.03))
    v.paint("amber", (v.noise(0.15, 3) > 0.68), only="gold_soft")
    # the loop it hangs by
    lr = np.sqrt(X**2 + (Z - 0.325) ** 2)
    v.fill("gold", (abs(lr - 0.05) < 0.027) & (abs(Y) < 0.03))
    v.rod("gold", (0, 0, -0.3), (0, 0, 0.12), 0.028)
    v.ball("gold_glow", (0, 0, -0.33), 0.068)
    # a leaf ribbon tied through the loop
    _blade(v, "moss_light", (0.0, -0.02, 0.33), (0.36, -0.1, 0.1), 0.075, sq=(1, 1.8, 1))
    _blade(v, "moss", (0.0, 0.0, 0.33), (-0.33, 0.06, 0.2), 0.06, sq=(1, 1.8, 1))
    v.ball("moss_light", (0, -0.03, 0.335), 0.045)
    return _fin(v, "bell", 1500)


@asset("updraft-vent", "canopy", "where a column of rising air begins: a 2 m ring of curled leaves round a glowing hollow, lying on z = 0")
def updraft_vent():
    v = V((-1, -1, 0), (1, 1, 0.32), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    R = np.sqrt(X**2 + Y**2)
    v.fill("leaf_dark", (R < 0.88) & (Z < 0.07))
    v.fill("air_glow", (R < 0.46) & (Z < 0.05 + 0.03 * np.cos(R * 9)))
    v.fill("moon_glow", (R < 0.18) & (Z < 0.09))
    v.fill("gold_soft", (abs(R - 0.47) < 0.05) & (Z < 0.11))
    cols = ("moss_light", "moss", "moss_light", "leaf_dark", "moss")
    for k in range(10):  # the outer leaves, tips curled up
        a = TAU * k / 10 + 0.1
        ca, sa = math.cos(a), math.sin(a)
        c = cols[k % 5]
        _blade(v, c, (0.44 * ca, 0.44 * sa, 0.06), (0.99 * ca, 0.99 * sa, 0.2), 0.2, sq=(1, 1, 2.6), power=0.6)
        v.ball(c, (0.89 * ca, 0.89 * sa, 0.235), (0.085, 0.085, 0.075))
        v.ball("moss_light" if c != "moss_light" else "gold_soft", (0.84 * ca, 0.84 * sa, 0.26), 0.045)
    for k in range(7):  # a ring of small pale petals round the glow
        a = TAU * k / 7 + 0.4
        ca, sa = math.cos(a), math.sin(a)
        _blade(v, "cream" if k % 2 else "moss_light", (0.4 * ca, 0.4 * sa, 0.08), (0.68 * ca, 0.68 * sa, 0.24), 0.11, sq=(1, 1, 2.0), power=0.6)
    v.paint("leaf_dark", (R > 0.5) & (Z < 0.05))
    return _fin(v, "updraft-vent", 1500)


@asset("updraft-column", "canopy", "a 1 m cube of rising air: pale streaks that stack in z; the map scales it tall")
def updraft_column():
    v = V((-0.5, -0.5, 0), (0.5, 0.5, 1), vpm=32, open="z")
    X, Y, Z = v.X, v.Y, v.Z
    Zp = (Z - Z.min()) / (Z.max() - Z.min())  # the first slice and the last are the same, so units stack
    for j in range(3):  # three long streaks, a third of a turn each, so the unit repeats
        a = TAU * (Zp / 3 + j / 3)
        rr = 0.085 + 0.02 * np.sin(TAU * Zp)
        v.fill("air_glow", (X - 0.435 * np.cos(a)) ** 2 + (Y - 0.435 * np.sin(a)) ** 2 < rr**2)
    v.fill("cloud", (X - 0.06 * np.cos(TAU * Zp)) ** 2 + (Y - 0.06 * np.sin(TAU * Zp)) ** 2 < (0.07 + 0.012 * np.sin(TAU * 2 * Zp)) ** 2)  # a wisp up the middle
    for x, y, z in ((0.26, 0.02, 0.2), (-0.2, -0.22, 0.5), (-0.1, 0.26, 0.82)):  # motes carried up
        v.ball("moon_glow", (x, y, z), 0.065)
    return _fin(v, "updraft-column", 1500)


def _leaf_mass(name, seed, lo, hi, blobs, tris=1500):
    v = V(lo, hi, vpm=8)
    X, Y, Z = v.X, v.Y, v.Z
    rng = np.random.default_rng(seed)
    for at, r in blobs:
        v.ball("leaf_dark", at, r)
    for at, r in blobs:  # scallop the surface with leaf-sized lumps
        for _ in range(int(9 * r[0] * r[2])):
            d = rng.normal(size=3)
            d /= np.linalg.norm(d)
            p = [at[i] + 0.92 * r[i] * d[i] for i in range(3)]
            if p[2] < lo[2] + 0.3:
                continue
            c = "moss_light" if d[2] > 0.72 else ("moss" if d[2] > 0.3 else ("leaf_dark" if d[2] > -0.45 else "navy"))
            v.ball(c, p, rng.uniform(0.38, 0.6))
    n = v.noise(0.9, seed)
    v.paint("moss_light", v.exposed(2, 1, 1) & (v.noise(0.6, seed + 1) > 0.5), only="moss")
    v.paint("moss", v.exposed(2, 1, 1), only="leaf_dark")
    v.paint("leaf_dark", v.exposed(2, -1, 2) & (n < 0.55), only=["moss", "moss_light"])
    v.paint("gold_soft", v.exposed(2, 1, 1) & (rng.random(v.g.shape) < 0.012))  # a few blossoms catching the moon
    return _fin(v, name, tris)


@asset("leaf-cluster-a", "canopy", "a rounded mass of foliage 5 m across")
def leaf_cluster_a():
    return _leaf_mass("leaf-cluster-a", 2, (-2.5, -1.5, 0), (2.5, 1.5, 3.0), [((-0.9, 0, 1.3), (1.4, 1.2, 1.15)), ((0.9, 0.1, 1.5), (1.4, 1.2, 1.3)), ((0, -0.2, 2.0), (1.0, 1.0, 0.85))])


@asset("leaf-cluster-b", "canopy", "a small rounded mass of foliage 3 m across")
def leaf_cluster_b():
    return _leaf_mass("leaf-cluster-b", 5, (-1.6, -1.3, 0), (1.6, 1.3, 2.6), [((-0.2, 0, 1.2), (1.2, 1.0, 1.05)), ((0.45, 0, 1.75), (0.8, 0.8, 0.7))])


@asset("leaf-cluster-c", "canopy", "a long billowing mass of foliage 6 m across")
def leaf_cluster_c():
    return _leaf_mass("leaf-cluster-c", 9, (-3, -1.6, 0), (3, 1.6, 3.6), [((-1.7, 0, 1.2), (1.2, 1.2, 1.0)), ((0, 0.1, 1.7), (1.5, 1.3, 1.45)), ((1.6, -0.1, 1.3), (1.3, 1.2, 1.1)), ((0.4, 0, 2.7), (0.9, 0.9, 0.8))])


@asset("leaf-curtain", "canopy", "hanging foliage 4 m wide, 3 m long; origin at the top")
def leaf_curtain():
    v = V((-2, -0.7, -3), (2, 0.7, 0), vpm=8)
    X, Y, Z = v.X, v.Y, v.Z
    rng = np.random.default_rng(4)
    for i, x in enumerate(np.linspace(-1.6, 1.6, 8)):
        rz = (0.3, 0.45, 0.36, 0.5, 0.33, 0.47, 0.38, 0.3)[i]
        v.ball("moss" if i % 3 == 1 else "leaf_dark", (x, rng.uniform(-0.15, 0.15), -rz), (0.42, 0.5, rz))
    xs = np.linspace(-1.75, 1.75, 9)
    lens = [1.6, 2.5, 1.9, 3.0, 2.2, 1.4, 2.7, 2.0, 2.9]
    for i, (x, L) in enumerate(zip(xs, lens)):
        ph = rng.uniform(0, 6)
        y = rng.uniform(-0.25, 0.25)
        k = 0
        z = -0.5
        while True:
            t = (-z) / L
            r = 0.3 - 0.12 * t
            done = z - r <= -L + 0.02
            zz = -L + r if done else z
            xx = np.clip(x + 0.16 * math.sin(zz * 2.2 + ph), -2 + r, 2 - r)
            c = "moss_light" if done else ("moss" if (t > 0.55 or k % 3 == 2) else "leaf_dark")
            v.ball(c, (xx, y + 0.1 * math.sin(zz * 3 + ph), zz), (r, r * 0.9, r * 1.05))
            if done:
                if i % 3 == 0:
                    v.ball("gold_soft", (xx, y - 0.2, zz + 0.1), 0.17)
                break
            z -= 0.3
            k += 1
    v.paint("moss", (v.noise(0.7, 3) > 0.6), only="leaf_dark")
    v.paint("moss_light", v.exposed(2, 1, 1) & (Z < -0.6) & (v.noise(0.5, 6) > 0.45))
    return _fin(v, "leaf-curtain", 1500)


@asset("canopy-wall", "canopy", "backdrop panel 10 x 10 m, 1 m thick (y 0 to 1): dense dark foliage with gaps of dusk sky; tiles in x and z")
def canopy_wall():
    v = V((-5, 0, 0), (5, 1, 10), vpm=4, open="xz")
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(1.5, 7)
    n2 = v.noise(1.0, 8)
    inner = (abs(X) < 4.6) & (Z > 0.4) & (Z < 9.6)
    # dark leaves half way back, with clumps billowing forward in two steps
    v.fill("leaf_dark", Y > 0.5)
    v.fill("leaf_dark", (Y > 0.25) & (n2 > 0.47) & inner)
    v.fill("moss", (Y > 0.0) & (n2 > 0.58) & inner)
    v.paint("navy", (n < 0.36) & (Y > 0.5))
    v.paint("moss", (n > 0.56) & (Y < 0.5))
    # branches wind through the leaves
    for pts in ([(-4.3, 0.5, 1.2), (-2.5, 0.5, 2.6), (-1.2, 0.5, 4.6), (0.4, 0.5, 5.4), (1.4, 0.5, 7.6), (1.2, 0.5, 9.0)], [(0.4, 0.5, 5.4), (2.4, 0.5, 5.6), (4.2, 0.5, 6.6)], [(-2.5, 0.5, 2.6), (-3.6, 0.5, 4.2), (-4.2, 0.5, 6.4)]):
        v.path("bark", pts, 0.42, 0.26)
    v.paint("bark_dark", (np.mod(X + Z, 0.9) < 0.3), only="bark")
    v.paint("moss_light", v.exposed(2, 1, 1) & (Y < 0.5), only=["moss", "leaf_dark"])
    v.paint("moss", v.exposed(2, 1, 1) & (Y < 0.5), only="bark")
    # gaps where the dusk shows through
    for cx, cz, rx, rz in ((-2.7, 7.6, 1.0, 0.8), (2.4, 2.7, 1.15, 0.85), (3.3, 8.6, 0.7, 0.6), (-1.0, 1.6, 0.65, 0.7), (-3.9, 4.6, 0.5, 0.75)):
        d = ((X - cx) / rx) ** 2 + ((Z - cz) / rz) ** 2 + 0.6 * (n2 - 0.5)
        v.fill(None, (d < 1) & (Y < 0.75))
        v.fill("dusk", (d < 1.0) & (Y >= 0.75))
        v.fill("navy", (d < 1.0) & (d > 0.55) & (Y >= 0.75) & (Z > cz))
        v.fill("moon_glow", (abs(X - cx - 0.3 * rx) < 0.13) & (abs(Z - cz + 0.2 * rz) < 0.13) & (Y >= 0.75))  # a star
    rng = np.random.default_rng(6)
    for _ in range(8):  # fireflies among the leaves
        x, z = rng.uniform(-4.2, 4.2), rng.uniform(0.8, 9.2)
        v.fill("gold_soft", (abs(X - x) < 0.13) & (abs(Z - z) < 0.13) & (Y > 0.25), only="air")
    return _fin(v, "canopy-wall", 1000, relax=1)


@asset("nest-big", "canopy", "a 3 m nest with three eggs")
def nest_big():
    v = V((-1.6, -1.6, 0), (1.6, 1.6, 1.15))
    X, Y, Z = v.X, v.Y, v.Z
    r = np.sqrt(X**2 + Y**2)
    a = np.arctan2(Y, X)
    n = v.noise(0.3, 2)
    v.fill("straw", (r < 1.02 + Z * 0.58) & (r > 0.72 + Z * 0.35) & (Z < 0.72 + 0.12 * n))
    v.fill("straw", (r < 1.1) & (Z < 0.2))
    v.paint("wood_light", (np.mod(a * 4 + Z * 6, 1.0) < 0.3))
    v.paint("wood", (np.mod(a * 6 - Z * 5, 1.0) < 0.2))
    v.paint("bark", (np.mod(a * 3 + Z * 9 + 0.5, 1.0) < 0.12) & (r > 0.9))
    rng = np.random.default_rng(3)
    for k in range(12):  # twigs poking out of the weave
        t = TAU * k / 12 + rng.uniform(-0.2, 0.2)
        z = rng.uniform(0.25, 0.7)
        r0 = 0.95 + z * 0.5
        L = rng.uniform(0.18, 0.4)
        tw = t + rng.uniform(0.5, 1.0) * rng.choice([-1, 1])
        p0 = (r0 * math.cos(t), r0 * math.sin(t), z)
        p1 = (p0[0] + L * math.cos(tw), p0[1] + L * math.sin(tw), z + rng.uniform(0.0, 0.25))
        rr = math.hypot(p1[0], p1[1])
        if rr > 1.47:
            p1 = (p1[0] * 1.47 / rr, p1[1] * 1.47 / rr, p1[2])
        v.rod("bark" if k % 2 else "wood", p0, p1, 0.065, 0.04, flat=False)
    for t, c in ((0.5, "moss"), (2.4, "moss_light"), (3.9, "moss"), (5.3, "moss_light")):
        v.ball(c, (1.3 * math.cos(t), 1.3 * math.sin(t), 0.78), (0.26, 0.26, 0.13))
    v.ball("owl_belly", (0, 0, 0.2), (0.85, 0.85, 0.1))
    v.paint("cream", (v.noise(0.2, 6) > 0.6), only="owl_belly")
    for (x, y), c, tilt in (((-0.36, -0.12), "cream", -0.1), ((0.34, -0.2), "glass_blue", 0.12), ((0.02, 0.36), "gold_soft", 0.0)):
        v.rod(c, (x, y, 0.42), (x + tilt, y, 0.72), 0.25, 0.16, flat=False)
    sp = np.random.default_rng(8).random(v.g.shape)
    v.paint("moth", sp < 0.05, only="cream")
    v.paint("heron", sp < 0.07, only="glass_blue")
    v.paint("gold_glow", (v.noise(0.2, 9) > 0.6), only="gold_soft")
    return _fin(v, "nest-big", 1500)


@asset("wind-chime", "canopy", "a hanging chime of gold tubes, 1.5 m; origin at the top")
def wind_chime():
    v = V((-0.42, -0.42, -1.5), (0.42, 0.42, 0), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    R = np.sqrt(X**2 + Y**2)
    lr = np.sqrt(X**2 + (Z + 0.075) ** 2)
    v.fill("bark", (abs(lr - 0.048) < 0.027) & (abs(Y) < 0.03))
    v.rod("bark", (0, 0, -0.27), (0, 0, -0.11), 0.035)
    v.fill("wood", (R < 0.38 - 1.2 * abs(Z + 0.27)) & (abs(Z + 0.27) < 0.05))
    v.paint("wood_light", (np.mod(np.arctan2(Y, X), TAU / 5) < 0.5))
    v.paint("moss", (v.noise(0.2, 3) > 0.62) & (Z > -0.26) & (R < 0.36))
    lens = (0.62, 0.8, 0.5, 0.9, 0.7)
    for k, L in enumerate(lens):
        a = TAU * k / 5 + 0.3
        x, y = 0.27 * math.cos(a), 0.27 * math.sin(a)
        v.rod("bark", (x, y, -0.42), (x, y, -0.28), 0.03)
        v.rod("gold", (x, y, -0.4 - L), (x, y, -0.4), 0.062)
        v.paint("gold_soft", ((X - x) ** 2 + (Y - y) ** 2 < 0.08**2) & ((abs(Z + 0.47) < 0.03) | (Z < -0.4 - L + 0.07)))
    v.paint("amber", (v.noise(0.15, 5) > 0.66), only="gold")
    v.rod("bark", (0, 0, -1.2), (0, 0, -0.3), 0.035)
    v.fill("gold_soft", (R < 0.12) & (abs(Z + 0.78) < 0.035))
    _blade(v, "moss_light", (0, 0, -1.15), (0.06, 0, -1.5), 0.15, sq=(1, 2.4, 1), power=0.6)
    v.paint("moss", (abs(X - 0.03 + 0.17 * (Z + 1.3)) < 0.02) & (Z < -1.2))
    return _fin(v, "wind-chime", 1500)


@asset("firefly-swarm", "canopy", "a loose 3 m cloud of twenty fireflies; origin at its centre")
def firefly_swarm():
    v = V((-1.5, -0.8, -1.1), (1.5, 0.8, 1.1), vpm=32)
    rng = np.random.default_rng(12)
    pts = [(-1.43, 0.1, -0.2), (1.43, -0.15, 0.3), (0.2, 0.0, 1.03), (-0.3, 0.1, -1.03)]
    while len(pts) < 20:
        p = rng.normal(size=3) * (0.62, 0.3, 0.45)
        if abs(p[0]) < 1.35 and abs(p[1]) < 0.7 and abs(p[2]) < 0.95 and all(sum((p[i] - q[i]) ** 2 for i in range(3)) > 0.3**2 for q in pts):
            pts.append(tuple(p))
    for i, p in enumerate(pts):
        v.ball(("gold_glow", "gold_glow", "amber_glow", "gold_glow", "moon_glow")[i % 5], p, 0.05 + 0.012 * (i % 3))
    return _fin(v, "firefly-swarm", 1500, relax=1)


@asset("crown-shrine", "canopy", "the finale at the top of the tree: a 6 m bower of woven branches round a glowing lantern-egg; three hooks (child empties) for the bells")
def crown_shrine():
    v = V((-3, -1.3, 0), (3, 1.7, 6))
    X, Y, Z = v.X, v.Y, v.Z
    rng = np.random.default_rng(11)

    def arch(a, hgt, y0, ph, side=1):
        def at(t):
            s = math.sin(t)
            return (side * a * math.cos(t), y0 * (1 - 0.72 * s) + 0.22 * math.sin(3 * t + ph) * s + 0.15 * s, hgt * s**0.8)

        return at

    # woven boughs: each rises from one side, crosses the crown and comes down the other
    strands = [(2.5, 5.2, 0.95, 0.0, 1), (2.8, 4.7, 1.45, 1.0, -1), (2.15, 5.45, 0.75, 2.0, -1), (2.7, 5.0, -0.9, 3.0, 1), (2.3, 5.3, -1.1, 4.2, -1), (2.82, 4.4, 1.2, 5.0, 1)]
    leaf_at = []
    for a, hgt, y0, ph, side in strands:
        at = arch(a, hgt, y0, ph, side)
        ts = np.linspace(0, math.pi, 19)
        for t0, t1 in zip(ts[:-1], ts[1:]):
            r0 = 0.12 + 0.1 * abs(math.cos(t0)) ** 1.5
            r1 = 0.12 + 0.1 * abs(math.cos(t1)) ** 1.5
            v.rod("bark", at(t0), at(t1), r0, r1, flat=False)
        for t in ts[4:-4]:
            if rng.random() < 0.6:
                leaf_at.append(at(t))
        for t in (0.0, math.pi):  # a root flare where each bough meets the ground
            p = at(t)
            v.ball("bark", (np.clip(p[0], -2.7, 2.7), p[1], 0), (0.3, 0.28, 0.32))
    # withies woven across the boughs
    for i, (t, dz) in enumerate(((0.5, 0.5), (0.85, -0.3), (math.pi - 0.5, 0.5), (math.pi - 0.85, -0.3), (0.3, 0.25), (math.pi - 0.3, 0.25))):
        a0 = arch(*strands[i % 3][:4], strands[i % 3][4])(t if strands[i % 3][4] > 0 else math.pi - t)
        a1 = arch(*strands[3 + i % 2][:4], strands[3 + i % 2][4])((t if strands[3 + i % 2][4] > 0 else math.pi - t) + 0.12)
        v.path("wood", [a0, ((a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, (a0[2] + a1[2]) / 2 + 0.15), (a1[0], a1[1], a1[2] + dz * 0.3)], 0.085)
    v.paint("bark_dark", (np.mod(Z * 1.6 + X * 1.2 + Y, 0.55) < 0.2), only="bark")
    v.paint("wood", (v.noise(0.5, 4) > 0.58), only="bark")
    v.paint("moss", v.exposed(2, 1, 1) & (v.noise(0.6, 12) > 0.5) & (Z > 0.6))
    v.paint("moss_light", v.exposed(2, 1, 1) & (v.noise(0.4, 13) > 0.66) & (Z > 2.5))
    # the lantern-egg, cradled in the crown
    ec = (0, 0.15, 3.85)
    v.rod("bark", (0, 0.2, 4.7), (0, 0.25, 5.35), 0.2, 0.16)
    v.ball("gold_glow", ec, (0.8, 0.8, 1.05))
    eggm = ((X - ec[0]) / 0.8) ** 2 + ((Y - ec[1]) / 0.8) ** 2 + ((Z - ec[2]) / 1.05) ** 2 <= 1
    v.fill("amber_glow", eggm & (Z < 3.5 + 0.4 * v.noise(0.5, 5)))
    v.fill("moon_glow", eggm & (Z > 4.3) & (v.noise(0.4, 6) > 0.5))
    ea = np.arctan2(Y - ec[1], X - ec[0])
    band = (np.mod(ea / TAU * 3 + (Z - ec[2]) * 0.5, 1.0) < 0.14) | (np.mod(-ea / TAU * 3 + (Z - ec[2]) * 0.5, 1.0) < 0.14)
    near = _grow(eggm, 2) & ~eggm
    v.fill("bark", near & band & (Z < 4.75))
    v.fill("bark", near & (Z > 4.5))
    v.ball("bark", (0, 0.15, 2.82), (0.5, 0.5, 0.26))
    v.ball("moss", (0, 0.15, 2.95), (0.56, 0.56, 0.1))
    # leaves along the boughs, moonlit on top, with a few gold buds
    for i, p in enumerate(leaf_at):
        if (abs(p[0]) < 1.1 and p[2] < 5.0) or (p[1] < 0.2 and p[2] < 4.4) or (1.0 < abs(p[0]) < 2.1 and p[1] < 0.7 and p[2] < 4.7):
            continue
        r = rng.uniform(0.26, 0.44)
        q = (np.clip(p[0] + rng.uniform(-0.25, 0.25), -3 + r, 3 - r), np.clip(p[1] + rng.uniform(-0.3, 0.3), -1.3 + r, 1.7 - r), min(p[2] + rng.uniform(0.05, 0.4), 6 - r * 0.8))
        before = v.g > 0
        v.ball("leaf_dark", q, (r, r, r * 0.8))
        new = (v.g > 0) & ~before
        v.fill("moss", new & (Z > q[2] + 0.02))
        v.fill("moss_light", new & (Z > q[2] + r * 0.45))
        if i % 4 == 0:
            v.ball("gold_soft", (q[0], q[1] - r * 0.8, q[2] - 0.05), 0.1)
    v.ball("leaf_dark", (0.15, 0.3, 5.55), (0.6, 0.5, 0.45))
    v.ball("moss", (0.15, 0.3, 5.68), (0.5, 0.42, 0.32))
    v.ball("moss_light", (0.15, 0.3, 5.82), (0.34, 0.3, 0.18))
    for sx in (-1, 1):
        v.ball("moss", (sx * 2.72, 0.9, 0), (0.28, 0.6, 0.3))
        v.ball("moss_light", (sx * 2.6, -1.0, 0.05), (0.4, 0.28, 0.22))
    # three hooks for the bells
    main = arch(*strands[0][:4], strands[0][4])
    hooks = []
    for i, (hx, hz) in enumerate(((-1.55, 3.0), (0.0, 2.3), (1.55, 3.25))):
        if i == 1:
            top = (0, 0.15, 2.7)
        else:
            t = math.acos(np.clip(hx / strands[0][0], -1, 1))
            top = main(t)
        v.path("bark_dark", [top, (hx, top[1] * 0.4, (top[2] + hz) / 2 + 0.1), (hx, -0.1, hz + 0.2), (hx + 0.02, -0.1, hz + 0.02), (hx + 0.13, -0.1, hz - 0.04), (hx + 0.22, -0.1, hz + 0.08)], 0.1, 0.075)
        v.ball("gold_soft", (hx + 0.22, -0.1, hz + 0.13), 0.085)
        hooks.append((hx + 0.08, -0.1, hz - 0.11))
    root = _fin(v, "crown-shrine", 4000)
    out = [root]
    for i, h in enumerate(hooks):
        e = bpy.data.objects.new(f"crown-shrine.hook{i + 1}", None)
        e.empty_display_size = 0.15
        e.location = h
        out.append(child(e, root))
    return out


@asset("owl-door", "canopy", "a round owl-house door in a branch, 1.5 m, lit; stands proud of the wall behind it (y 0.6 to 1.1)")
def owl_door():
    v = V((-0.75, 0.6, 0), (0.75, 1.1, 1.5), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(0.25, 3)
    ring = np.sqrt(X**2 + (Z - 0.75) ** 2)
    a = np.arctan2(Z - 0.75, X)
    v.fill("bark_dark", (ring < 0.7) & (Y > 0.95))
    v.fill("bark", (abs(ring - 0.655) < 0.095) & (Y > 0.62 + 0.03 * n))
    v.paint("bark_dark", (np.mod(a * 4.5 + 0.2, 1.0) < 0.22), only="bark")
    v.paint("moss", (Z > 1.1) & (n > 0.42) & (Y < 0.9), only="bark")
    v.paint("moss_light", (Z > 1.3) & (n > 0.55), only="moss")
    v.fill("wood", (ring < 0.57) & (Y > 0.74) & (Y < 0.98))
    plank = np.floor((X + 0.6) / 0.24)
    v.paint("wood_light", (np.mod(plank, 2) == 0), only="wood")
    v.fill(None, (np.mod(X + 0.6, 0.24) < 0.035) & (Y < 0.775) & (ring < 0.57))
    for z in (0.36, 1.2):  # straps
        v.fill("bark_dark", (abs(Z - z - 0.1 * X) < 0.035) & (ring < 0.57) & (Y > 0.7) & (Y < 0.8) & (X < 0.3))
        v.ball("gold", (-0.3, 0.71, z - 0.03), 0.04)
    # a round window with the light on inside, and a knob
    wr = np.sqrt(X**2 + (Z - 0.84) ** 2)
    v.fill("gold_glow", (wr < 0.2) & (Y > 0.71) & (Y < 0.8))
    v.fill("bark", (abs(wr - 0.215) < 0.035) & (Y > 0.67) & (Y < 0.8))
    v.fill("bark", ((abs(X) < 0.02) | (abs(Z - 0.84) < 0.02)) & (wr < 0.2) & (Y > 0.68) & (Y < 0.78))
    v.ball("gold_soft", (0.38, 0.72, 0.68), 0.06)
    # a perch peg and a sprig over the door
    v.rod("bark", (-0.05, 0.98, 0.14), (-0.08, 0.63, 0.17), 0.05, 0.04, flat=False)
    _blade(v, "moss_light", (0.25, 0.68, 1.36), (0.6, 0.66, 1.12), 0.08, sq=(1, 1.6, 1))
    _blade(v, "leaf_dark", (0.25, 0.68, 1.36), (-0.1, 0.66, 1.46), 0.07, sq=(1, 1.6, 1))
    v.ball("gold_soft", (0.26, 0.66, 1.36), 0.045)
    return _fin(v, "owl-door", 1500)


def _moss(name, seed, w, L):
    v = V((-w / 2, -0.32, -L), (w / 2, 0.32, 0))
    X, Y, Z = v.X, v.Y, v.Z
    rng = np.random.default_rng(seed)
    k = int(w / 0.19)
    xs = np.linspace(-w / 2 + 0.14, w / 2 - 0.14, k)
    longest = int(rng.integers(k // 3, 2 * k // 3))
    for x in np.linspace(-w / 2 + 0.25, w / 2 - 0.25, max(3, int(w / 0.35))):
        v.ball("leaf_dark", (x, 0, -0.14), (0.27, 0.24, 0.15))
    for i, x in enumerate(xs):
        Ls = L if i == longest else L * rng.uniform(0.4, 0.95) * (1 - 0.35 * abs(x) / (w / 2))
        ph = rng.uniform(0, 6)
        y = rng.uniform(-0.15, 0.15)
        c = ("moss", "leaf_dark", "moss", "moss_light")[i % 4]
        pts = [(np.clip(x + 0.07 * math.sin(t * Ls * 2.5 + ph) * t, -w / 2 + 0.1, w / 2 - 0.1), y + 0.05 * math.sin(t * 5 + ph), -0.1 - t * (Ls - 0.165)) for t in np.linspace(0, 1, 8)]
        v.path(c, pts, 0.1, 0.065)
        tip = pts[-1]
        tipm = (X - tip[0]) ** 2 + (Y - tip[1]) ** 2 < 0.13**2
        v.paint("moss_light", tipm & (Z < tip[2] + 0.3 * Ls * 0.4))
        if i % 5 == 2:
            v.ball("gold_soft", (tip[0], tip[1], tip[2] - 0.0), 0.085)
    v.paint("moss", (v.noise(0.3, seed) > 0.6), only="leaf_dark")
    v.paint("moss_light", (v.noise(0.25, seed + 3) > 0.7), only="moss")
    return _fin(v, name, 1500)


asset("hanging-moss-a", "canopy", "hanging moss 2 m long, origin at the top")(lambda: _moss("hanging-moss-a", 3, 1.3, 2.0))
asset("hanging-moss-b", "canopy", "hanging moss 3 m long, origin at the top")(lambda: _moss("hanging-moss-b", 8, 1.8, 3.0))


@asset("branch-fork", "canopy", "a Y-shaped branch 6 m tall, for decoration")
def branch_fork():
    v = V((-2.4, -0.9, 0), (2.3, 0.9, 6.0))
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(0.5, 3)
    v.ball("bark", (0.1, 0, 0), (0.75, 0.62, 0.55))
    v.path("bark", [(0.1, 0, 0), (-0.08, 0.05, 1.3), (0.1, 0, 2.6)], 0.5, 0.4)
    v.path("bark", [(0.1, 0, 2.6), (-0.75, 0.1, 3.6), (-1.5, 0, 4.7), (-1.85, -0.1, 5.5)], 0.37, 0.15)
    v.path("bark", [(0.1, 0, 2.6), (0.85, -0.1, 3.5), (1.2, 0.15, 4.5), (1.7, 0.1, 5.2)], 0.33, 0.14)
    v.path("bark", [(-0.75, 0.1, 3.6), (-0.4, -0.2, 4.3), (-0.5, -0.25, 4.9)], 0.15, 0.08)  # a side twig
    v.paint("bark_dark", (np.mod(X * 1.0 + 0.25 * np.sin(Z * 1.5) + Y * 0.6 + 0.2 * n, 0.3) < 0.1), only="bark")
    v.paint("wood", (n > 0.62), only="bark")
    v.fill(None, ((X - 0.0) / 0.17) ** 2 + ((Z - 1.55) / 0.24) ** 2 + ((Y + 0.47) / 0.2) ** 2 < 1)  # a knot hole
    v.paint("bark_dark", ((X - 0.0) / 0.26) ** 2 + ((Z - 1.55) / 0.34) ** 2 < 1)
    v.paint("gold_soft", ((X - 0.0) / 0.1) ** 2 + ((Z - 1.5) / 0.14) ** 2 + ((Y + 0.3) / 0.12) ** 2 < 1)  # someone is home
    v.paint("moss", v.exposed(2, 1, 2) & (v.noise(0.7, 6) > 0.45), only=["bark", "bark_dark", "wood"])
    v.paint("moss_light", (v.noise(0.3, 5) > 0.6), only="moss")
    v.paint("moss", (Z < 0.3 + 0.4 * n) & (n > 0.5))
    rng = np.random.default_rng(4)
    for (x, y, z), r in (((-1.85, -0.1, 5.5), 0.42), ((1.72, 0.1, 5.25), 0.4), ((-0.5, -0.25, 5.0), 0.3)):
        for k in range(6):  # a tuft of leaves, not a ball
            d = rng.normal(size=3) * (0.8, 0.6, 0.45)
            rr = r * rng.uniform(0.5, 0.75)
            q = (np.clip(x + d[0] * r, -2.4 + rr, 2.3 - rr), y + d[1] * r, min(z + d[2] * r, 6 - rr * 0.8))
            v.ball(("leaf_dark", "moss", "leaf_dark", "moss_light")[k % 4] if d[2] < 0.3 else "moss_light", q, (rr * 1.2, rr, rr * 0.8))
        v.ball("moss_light", (x, y, 6 - 0.12) if z > 5.4 else (x, y, z + r * 0.6), (r * 0.5, r * 0.45, 0.115))
        v.ball("gold_soft", (x + 0.1, y - r * 0.7, z - r * 0.3), 0.08)
    return _fin(v, "branch-fork", 1600)


@asset("acorn-lamp", "canopy", "a hanging acorn-shaped lamp, 1 m, origin at the top")
def acorn_lamp():
    v = V((-0.36, -0.3, -1.0), (0.36, 0.3, 0), vpm=32)
    X, Y, Z = v.X, v.Y, v.Z
    a = np.arctan2(Y, X)
    v.path("bark", [(0, 0, 0), (0.03, 0, -0.14), (0, 0, -0.3)], 0.04, 0.045)
    _blade(v, "moss_light", (0.01, 0, -0.1), (0.34, -0.04, -0.27), 0.085, sq=(1, 1.8, 1))
    _blade(v, "moss", (0.01, 0, -0.14), (-0.3, 0.04, -0.2), 0.07, sq=(1, 1.8, 1))
    v.ball("gold_glow", (0, 0, -0.6), (0.225, 0.225, 0.33))
    v.rod("gold_glow", (0, 0, -0.88), (0, 0, -0.985), 0.07, 0.015, flat=False)
    v.paint("amber_glow", (Z < -0.72 + 0.1 * np.sin(a * 3)))
    v.paint("amber_glow", (np.mod(a, TAU / 7) < 0.12) & (Z < -0.5))
    cap = ((X / 0.27) ** 2 + (Y / 0.27) ** 2 + ((Z + 0.47) / 0.2) ** 2 < 1) & (Z > -0.53)
    v.fill("bark", cap)
    v.paint("wood", cap & ((np.mod(a * 5 / TAU * 2 + Z * 16, 1.0) < 0.3) | (np.mod(-a * 5 / TAU * 2 + Z * 16, 1.0) < 0.3)))
    v.paint("bark_dark", cap & (Z < -0.49))
    v.paint("moss", cap & (Z > -0.33) & (v.noise(0.15, 3) > 0.5))
    return _fin(v, "acorn-lamp", 1300)
