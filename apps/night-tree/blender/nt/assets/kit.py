"""The level kit: what the owl stands on, in each realm's dress.

Sizes are fixed, because the map's collision is laid to them:
  plat-<theme>-l/m/n/r  one metre wide each, top at z = 0 along the owl's strip, about 0.6 thick,
                        2 deep (y -1 to 1); m and n are two middles to alternate; they run on in x
  cap-<theme>-a/b/c/d   a 2 m ground cap, top at z = 0, lying along the top of fills and rolling
                        over their front edge
  fill-<theme>-8/4/2/1  a square of ground or wall that many metres on a side, 4 deep (y -2 to 2),
                        origin at its bottom-left corner; the map packs solid ground with them

Every piece that tiles ends on the same plain cross-section, and keeps its tufts, drips and lights
clear of its ends, so any two meet without a seam.
"""
import numpy as np

from ..core import asset
from ..vox import V

THEMES = {
    # theme: (top, body, deep, accent, glow)
    "tree": ("wood_light", "wood", "bark", "moss", "gold_soft"),
    "clearing": ("moss_light", "moss", "bark_dark", "amber", "amber_glow"),
    "roots": ("stone", "stone_dark", "navy_deep", "moss", "gold_soft"),
    "neon": ("wood", "bark", "neon_dark", "chrome", "magenta_glow"),
    "glass": ("glass_blue", "lead", "lead", "amber_glass", "sapphire"),
    "ink": ("paper", "ink_grey", "ink", "seal_red", "paper_glow"),
    "canopy": ("moss_light", "bark", "leaf_dark", "moss", "gold_soft"),
}
ORGANIC = ("tree", "clearing", "roots", "canopy")


def _clump(v, rng, x, y, c1, c2, h=0.26, out=1.0):
    """A clump of grass: a few curved blades leaning away from the path."""
    for _ in range(rng.integers(3, 6)):
        dx, lean, hh = rng.uniform(-0.09, 0.09), rng.uniform(0.04, 0.16) * out, h * rng.uniform(0.55, 1.1)
        v.path(c1 if rng.random() < 0.6 else c2, [(x + dx * 0.3, y, -0.04), (x + dx, y + lean * 0.4, hh * 0.6), (x + dx * 1.6, y + lean, hh)], 0.04, 0.014)


def _dress_organic(v, theme, seed, lip, xr, count):
    """Moss cushions, grass, a flower or a mushroom, along the front and back lips only."""
    top, body, deep, accent, glow = THEMES[theme]
    rng = np.random.default_rng(seed)
    green = ("moss_light", "moss") if theme != "roots" else ("moss", "stone")
    for i in range(count):
        side = -1 if i % 2 == 0 else 1
        x = rng.uniform(-xr, xr)
        y = side * rng.uniform(lip - 0.24, lip - 0.04)
        pick = rng.random()
        if pick < 0.5:
            _clump(v, rng, x, y, green[0], green[1], out=side)
        elif pick < 0.8:
            v.ball(green[1] if rng.random() < 0.5 else green[0], (x, y, -0.02), (rng.uniform(0.1, 0.17), rng.uniform(0.09, 0.14), rng.uniform(0.06, 0.1)))
        elif theme == "clearing":
            v.rod("moss_light", (x, y, 0), (x + 0.02, y, 0.2), 0.03)
            v.ball("cream" if rng.random() < 0.5 else glow, (x + 0.02, y, 0.23), (0.07, 0.07, 0.05))
        elif theme in ("tree", "roots"):
            v.rod("cream", (x, y, 0), (x, y, 0.12), 0.035)
            v.ball("amber" if theme == "tree" else "glass_blue", (x, y, 0.15), (0.1, 0.1, 0.055))
            v.ball(glow, (x, y, 0.118), (0.07, 0.07, 0.02))
        else:
            v.ball("leaf_dark", (x, y, 0.03), (0.16, 0.12, 0.09))
            v.ball("moss_light", (x + 0.03, y, 0.09), (0.09, 0.08, 0.05))
    if theme in ("clearing", "canopy"):
        for _ in range(count // 2):  # fallen leaves
            x, y = rng.uniform(-xr, xr), rng.choice([-1, 1]) * rng.uniform(lip - 0.4, lip - 0.1)
            v.ball("amber" if theme == "clearing" else "moss", (x, y, 0.005), (0.08, 0.05, 0.02))


def _plat(theme, part):
    top, body, deep, accent, glow = THEMES[theme]
    seed = sum(map(ord, theme + part)) * 7
    v = V((-0.5, -1.25, -1.05), (0.5, 1.25, 0.4), vpm=16, open={"l": "+x", "r": "-x"}.get(part, "x"))
    X, Y, Z = v.X, v.Y, v.Z
    ends = np.clip((0.5 - abs(X)) / 0.14, 0, 1)  # the lumps fade out toward a tiling end
    n = (v.noise(0.45, seed) - 0.5) * ends
    n2 = (v.noise(0.22, seed + 1) - 0.5) * ends
    end = np.zeros_like(X) if part in "mn" else np.clip(((-X if part == "l" else X) - 0.02) / 0.46, 0, 1)
    hy = 1.0 - 0.3 * end**2 + 0.07 * n  # half depth; it narrows round the free end
    if theme in ORGANIC or theme == "ink":
        rag = 0.18 if theme == "ink" else 0.0
        hy = hy + rag * n2
        roll = np.clip((abs(Y) - 0.62) / 0.4, 0, 1)
        ztop = -0.2 * roll**2 - 0.1 * end**3
        zbot = -0.3 - 0.34 * np.clip(1 - (Y / 1.0) ** 2, 0, 1) - 0.22 * n + 0.42 * end**2
        v.fill(body, (Z < ztop) & (Z > zbot) & (abs(Y) < hy) & (end < 0.985))
        v.paint(deep, Z < zbot + 0.16 + 0.1 * n2)
        if theme == "ink":
            v.top("paper", 1)
            v.paint("ink_grey", (v.noise(0.5, seed + 3) > 0.55) & (Z > -0.12))
            v.paint("ink", (abs(Y) > hy - 0.16) | (Z < -0.2))
            if part == "n":
                v.box("seal_red", (-0.1, -1.3, -0.3), (0.06, -0.9, -0.14), only="solid")
        else:
            v.top(top, 2)
            v.paint(accent if theme != "clearing" else "moss", (v.noise(0.3, seed + 2) > 0.55) & (Z > -0.2) & (abs(Y) > 0.4))
            if theme == "tree":
                v.paint("wood", (np.mod(Y + 1.0, 0.34) < 0.05) & (Z > -0.07) & (abs(Y) < 0.6))  # plank lines on the walk
            _dress_organic(v, theme, seed, 1.0, 0.33, 6)
            rng = np.random.default_rng(seed + 9)
            for _ in range(2 if part in "mn" else 1):  # rootlets and drips hanging underneath
                x, y = rng.uniform(-0.3, 0.3), rng.uniform(-0.6, 0.6)
                L = rng.uniform(0.2, 0.42)
                v.path(deep if theme != "canopy" else "moss", [(x, y, -0.5), (x + rng.uniform(-0.08, 0.08), y, -0.5 - L * 0.6), (x + rng.uniform(-0.12, 0.12), y, -0.5 - L)], 0.055, 0.018)
    elif theme == "neon":
        # a boardwalk: planks on joists, chrome nosing, a tube of light under each lip
        v.fill("bark", (Z < -0.1) & (Z > -0.34) & (abs(Y) < 0.88 - 0.25 * end) & (end < 0.98))
        v.fill(top, (Z < 0) & (Z > -0.13) & (abs(Y) < 1.0 - 0.25 * end**2) & (end < 0.985))
        v.fill(None, (np.mod(Y + 1.0, 0.4) < 0.035) & (Z > -0.05))
        v.paint("wood_light", (np.mod(np.floor((Y + 1.0) / 0.4), 2) == 0) & (Z > -0.1))
        v.paint("bark", v.noise(0.3, seed) > 0.68)
        for sy, c in ((-1, glow), (1, "cyan_glow")):
            v.rod("chrome", (-0.5, sy * 0.98, -0.07), (0.5, sy * 0.98, -0.07), 0.07, only=None)
            v.rod(c, (-0.5, sy * 0.9, -0.26), (0.5, sy * 0.9, -0.26), 0.05)
        if part in "mn":
            for sy in (-1, 1):  # a knee brace
                v.rod("neon_dark", (0.0, sy * 0.7, -0.3), (0.0, sy * 0.25, -0.72), 0.06)
            v.rod("neon_dark", (0.0, -0.3, -0.72), (0.0, 0.3, -0.72), 0.06)
        if end.max() > 0:
            v.fill(None, end >= 0.985)
    elif theme == "glass":
        # a leaded slab: pale glass to walk on, bulging coloured panes along the lip
        v.fill("lead", (Z < 0) & (Z > -0.4) & (abs(Y) < 1.0 - 0.3 * end**2) & (end < 0.985))
        v.box(top, (-0.44, -0.86, -0.1), (0.44, 0.86, 0.0), only="solid")
        v.paint("lead", (abs(Y) < 0.035) | (abs(X) < 0.03), only=top)
        cols = ("sapphire", "sapphire", "amber_glass", "sapphire", "rose")
        for i, x in enumerate((-0.25, 0.25)):
            for sy in (-1, 1):
                c = cols[(i + (2 if part in "nr" else 0) + (1 if sy > 0 else 0)) % len(cols)]
                v.ball(c, (x, sy * 0.98, -0.2), (0.19, 0.08, 0.13))
        if part in "mn":
            v.path("lead", [(0, 0, -0.38), (0.0, 0, -0.62), (0.06, 0, -0.78)], 0.06, 0.03)
            v.ball("amber_glass", (0.06, 0, -0.86), 0.075)
    return v.done(f"plat-{theme}-{part}", keep=0.6)


def _cap(theme, var):
    top, body, deep, accent, glow = THEMES[theme]
    seed = sum(map(ord, theme + var)) * 11 + 5
    v = V((-1, -2.45, -1.3), (1, 2.3, 0.5), vpm=8, open="x")
    X, Y, Z = v.X, v.Y, v.Z
    ends = np.clip((1.0 - abs(X)) / 0.25, 0, 1)
    n = (v.noise(0.8, seed) - 0.5) * ends
    n2 = (v.noise(0.35, seed + 1) - 0.5) * ends
    if theme in ORGANIC or theme == "ink":
        # turf that rolls over the front edge and hangs ragged over the face below
        roll = np.clip((-Y - 1.75) / 0.6, 0, 1)
        ztop = -0.3 * roll**2
        lip = -0.55 - 0.5 * n - 0.25 * n2
        front = -2.28 - 0.1 * n2
        v.fill(body, (Z < ztop) & (Y > front) & (((Y < -1.9) & (Z > lip)) | ((Y >= -1.9) & (Z > -0.45))))
        v.paint(deep, (Z < lip + 0.2) & (Y < -1.9))
        if theme == "ink":
            v.top("paper", 1)
            v.paint("ink_grey", (v.noise(0.9, seed + 3) > 0.52) & (Z > -0.2))
            v.paint("ink", (Y < -2.05) & (Z < -0.25 + 0.3 * n))
        else:
            v.top(top, 2)
            v.paint(accent if theme != "clearing" else "moss", (v.noise(0.5, seed + 2) > 0.56) & (Z > -0.35))
            _dress_organic(v, theme, seed, 2.1, 0.72, 14)
            rng = np.random.default_rng(seed + 9)
            for _ in range(3):  # roots and trailing stems over the face below
                x = rng.uniform(-0.7, 0.7)
                L = rng.uniform(0.3, 0.65)
                v.path(deep if rng.random() < 0.6 else "moss", [(x, -2.2, -0.5), (x + rng.uniform(-0.1, 0.1), -2.26, -0.5 - L * 0.5), (x + rng.uniform(-0.16, 0.16), -2.2, -0.5 - L)], 0.07, 0.03)
            if theme == "roots" and var in "bd":
                v.ball("stone", (rng.uniform(-0.5, 0.5), -1.5, 0.02), (0.22, 0.18, 0.12))
    elif theme == "neon":
        v.fill("bark", (Z < -0.12) & (Z > -0.5) & (Y > -2.2) & (Y < 2.25))
        v.fill(top, (Z < 0) & (Z > -0.14) & (Y > -2.3))
        v.fill(None, (np.mod(Y + 2.3, 0.46) < 0.07) & (Z > -0.06))
        v.paint("wood_light", (np.mod(np.floor((Y + 2.3) / 0.46), 2) == 0) & (Z > -0.12))
        v.paint("bark", v.noise(0.5, seed) > 0.66)
        v.rod("chrome", (-1, -2.28, -0.08), (1, -2.28, -0.08), 0.1)
        v.rod(glow if var in "ac" else "cyan_glow", (-1, -2.22, -0.36), (1, -2.22, -0.36), 0.07)
        if var in "bd":
            v.rod("neon_dark", (0.3, -2.25, -0.4), (0.3, -2.25, -1.1), 0.07)
            v.ball("cyan_glow" if var == "b" else "violet_glow", (0.3, -2.3, -1.15), 0.11)
    elif theme == "glass":
        v.fill("lead", (Z < 0) & (Z > -0.6) & (Y > -2.3))
        v.box(top, (-0.9, -2.15, -0.13), (0.9, 2.3, 0.0), only="solid")
        v.paint("lead", (np.mod(Y + 2.3, 1.0) < 0.1) | (abs(X) < 0.06), only=top)
        cols = ("sapphire", "amber_glass", "sapphire", "rose") if var in "ac" else ("sapphire", "sapphire", "mint", "amber_glass")
        for i, x in enumerate((-0.75, -0.25, 0.25, 0.75)):
            v.ball(cols[i], (x, -2.3, -0.33), (0.19, 0.12, 0.2))
        if var in "bd":
            v.path("lead", [(0, -2.2, -0.6), (0, -2.26, -0.95), (0.08, -2.2, -1.12)], 0.08, 0.04)
            v.ball("amber_glass", (0.08, -2.2, -1.2), 0.1)
    return v.done(f"cap-{theme}-{var}", keep=0.6)


def _fill(theme, size, var=""):
    top, body, deep, accent, glow = THEMES[theme]
    seed = sum(map(ord, theme)) + size + (37 if var else 0)
    vpm = 4 if size >= 4 else 8
    v = V((0, -2, 0), (size, 2, size), vpm=vpm, open="+y")
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(1.7, seed)
    n2 = v.noise(0.7, seed + 1)
    n3 = v.noise(3.5, seed + 2)
    if theme in ("tree", "canopy"):
        # bark: plates running up, split by deep furrows, with the odd knot
        wob = X + 0.6 * (n - 0.5) + 0.25 * np.sin(Z * 0.9 + seed)
        ridge = np.abs(np.sin(wob * 2.4))
        relief = 0.12 + 0.55 * ridge**0.6 * (0.55 + 0.45 * n2)
        v.fill("bark_dark", Y > -2 + relief)
        v.paint("bark", (ridge > 0.35) & (n3 > 0.3))
        v.paint("wood", (ridge > 0.8) & (n2 > 0.5))
        v.paint("moss" if theme == "tree" else "leaf_dark", (v.noise(1.1, seed + 5) > 0.68) & (Y < -1.2))
        if size >= 4:
            kx, kz = size * (0.3 + 0.4 * (seed % 5) / 5), size * (0.35 + 0.3 * (seed % 3) / 3)
            v.fill(None, ((X - kx) ** 2 + (Z - kz) ** 2 * 0.5 < (0.045 * size) ** 2 * 4) & (Y < -1.5))
            v.paint("bark_dark", ((X - kx) ** 2 + (Z - kz) ** 2 * 0.5 < (0.07 * size) ** 2 * 4) & (Y < -1.0))
    elif theme == "neon":
        # old plum-painted boards with a rail of pipe and the odd lit porthole
        board = np.mod(Z + 0.3 * (seed % 3), 1.0)
        relief = 0.14 + 0.18 * (board < 0.12)
        v.fill("neon_dark", Y > -2 + relief)
        v.paint("violet", (n > 0.52) & (board > 0.12))
        v.paint("bark_dark", (n3 > 0.62) & (board > 0.12))
        if size >= 4:
            v.rod("chrome", (0, -1.86, size * 0.62), (size, -1.86, size * 0.62), 0.11)
            px, pz = size * (0.3 if var else 0.7), size * 0.3
            v.ball("chrome", (px, -1.85, pz), (0.42, 0.14, 0.42))
            v.ball(glow if var else "cyan_glow", (px, -1.9, pz), (0.3, 0.12, 0.3))
    elif theme == "glass":
        # a wall of lead with a diamond lattice; most panes sleep dark, a few glow
        lat = (np.mod(X + Z, 2.0) < 0.28) | (np.mod(X - Z, 2.0) < 0.28)
        relief = 0.34 - 0.2 * lat
        v.fill("lead", Y > -2 + relief)
        pane = np.mod(np.floor((X + Z) / 2.0) * 3 + np.floor((X - Z) / 2.0) * 5 + (2 if var else 0), 7)
        v.paint("navy", ~lat & (Y < -1.2))
        for i, c in ((0, "sapphire"), (3, "sapphire"), (5, "amber_glass"), (6, "rose" if var else "mint")):
            v.paint(c, (pane == i) & ~lat & (Y < -1.2))
    elif theme == "ink":
        relief = 0.15 + 0.6 * n * n2
        v.fill("ink", Y > -2 + relief)
        # wet ink, with dry-brush strokes of grey running along it
        v.paint("ink_grey", (n > 0.58) & (np.mod(Z + 0.5 * n2, 1.3) < 0.5) & (Y < -1.2))
    else:
        # rock and earth in blocky strata
        strata = np.mod(Z + 0.8 * (n3 - 0.5), 1.6) < 0.22
        relief = 0.15 + 0.6 * n * n2 + 0.2 * strata
        v.fill(deep, Y > -2 + relief)
        v.paint(body, (n > 0.46) & ~strata)
        v.paint(top, (n2 > 0.66) & (n > 0.5))
        v.paint("wood" if theme == "clearing" else accent, (v.noise(0.9, seed + 5) > 0.72) & (Y < -1.2))
    return v.done(f"fill-{theme}-{size}{var}", keep=0.34 if size >= 4 else 0.24, relax=1)


for _t in THEMES:
    for _p in "lmnr":
        asset(f"plat-{_t}-{_p}", "kit-" + _t, "platform piece, 1 m wide, top at z = 0")(lambda _t=_t, _p=_p: _plat(_t, _p))
    for _v in "abcd":
        asset(f"cap-{_t}-{_v}", "kit-" + _t, "ground cap, 2 m wide, top at z = 0")(lambda _t=_t, _v=_v: _cap(_t, _v))
    for _s in (8, 4, 2, 1):
        asset(f"fill-{_t}-{_s}", "kit-" + _t, f"{_s} m square of ground or wall")(lambda _t=_t, _s=_s: _fill(_t, _s))
        if _s >= 4:
            asset(f"fill-{_t}-{_s}b", "kit-" + _t, f"{_s} m square of ground or wall, second look")(lambda _t=_t, _s=_s: _fill(_t, _s, "b"))
