"""The level kit: what the owl stands on, in each reach's dress.

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
from . import palette  # noqa: F401  (registers the reaches' colours first)

THEMES = {
    # theme: (top, body, deep, accent, glow)
    "grove": ("moss_bright", "earth_warm", "bark_warm", "gold_leaf", "crystal_green"),
    "falls": ("fern", "wet_stone", "wet_stone_dark", "moss_green", "crystal_green"),
    "heart": ("wood_light", "wood", "bark", "moss", "gold_soft"),
    "ember": ("ash", "basalt_light", "basalt", "ember_orange", "lava_glow"),
    "frost": ("snow", "frost_stone", "frost_stone_dark", "ice", "ice_glow"),
    "colonnade": ("temple_stone", "root_brown", "temple_dark", "moss_green", "amber_glow"),
    "canyon": ("sand_light", "sandstone", "sand_dark", "rust", "amber_glow"),
    "gloam": ("cave_teal", "cave_blue", "cave_deep", "crystal_cyan", "crystal_cyan"),
    "sea": ("sea_sand", "coral_stone", "sea_deep", "coral_pink", "sea_glow"),
    "sky": ("moss_bright", "marble", "marble_shadow", "moss_green", "gold_soft"),
}
GREEN = {"grove": ("moss_bright", "moss_green"), "falls": ("fern", "moss_green"), "heart": ("moss_light", "moss"),
         "sky": ("moss_bright", "moss_green"), "colonnade": ("moss_green", "fern"), "sea": ("kelp", "kelp_light")}
BARK = ("heart",)            # fills that are the tree's own wood
STRATA = ("canyon", "colonnade", "frost")


def _clump(v, rng, x, y, c1, c2, h=0.26, out=1.0):
    """A clump of grass: a few curved blades leaning away from the path."""
    for _ in range(rng.integers(3, 6)):
        dx, lean, hh = rng.uniform(-0.09, 0.09), rng.uniform(0.04, 0.16) * out, h * rng.uniform(0.55, 1.1)
        v.path(c1 if rng.random() < 0.6 else c2, [(x + dx * 0.3, y, -0.04), (x + dx, y + lean * 0.4, hh * 0.6), (x + dx * 1.6, y + lean, hh)], 0.04, 0.014)


def _dress(v, theme, seed, lip, xr, count):
    """What grows or lies along the front and back lips: grass and flowers, snow and ice, embers,
    pebbles, crystals or coral, by reach."""
    top, body, deep, accent, glow = THEMES[theme]
    rng = np.random.default_rng(seed)
    for i in range(count):
        side = -1 if i % 2 == 0 else 1
        x = rng.uniform(-xr, xr)
        y = side * rng.uniform(lip - 0.24, lip - 0.04)
        pick = rng.random()
        if theme in GREEN:
            g = GREEN[theme]
            if pick < 0.5:
                _clump(v, rng, x, y, g[0], g[1], out=side, h=0.3 if theme != "sea" else 0.45)
            elif pick < 0.78:
                v.ball(g[1] if rng.random() < 0.5 else g[0], (x, y, -0.02), (rng.uniform(0.1, 0.17), rng.uniform(0.09, 0.14), rng.uniform(0.06, 0.1)))
            elif theme == "grove":
                v.ball("gold_leaf", (x, y, 0.0), (0.09, 0.07, 0.03))           # a fallen golden leaf
                v.rod("moss_green", (x + 0.1, y, 0), (x + 0.12, y, 0.2), 0.03)
                v.ball("cream" if rng.random() < 0.5 else "flower_pink", (x + 0.12, y, 0.23), (0.07, 0.07, 0.05))
            elif theme == "sea":
                v.ball(accent, (x, y, 0.05), (0.08, 0.08, 0.12))
                v.ball(glow, (x, y, 0.16), 0.05)
            else:
                v.rod("cream", (x, y, 0), (x, y, 0.12), 0.035)
                v.ball("amber" if theme != "falls" else "crystal_green", (x, y, 0.15), (0.1, 0.1, 0.055))
                v.ball(glow, (x, y, 0.118), (0.07, 0.07, 0.02))
        elif theme == "frost":
            if pick < 0.55:
                v.ball("snow", (x, y, -0.02), (rng.uniform(0.14, 0.24), rng.uniform(0.1, 0.16), rng.uniform(0.06, 0.12)))
            else:
                v.rod("ice", (x, y, -0.05), (x + rng.uniform(-0.05, 0.05), y, rng.uniform(0.16, 0.3)), 0.05, 0.012)
                v.ball("ice_glow", (x, y, 0.02), 0.04)
        elif theme == "ember":
            if pick < 0.55:
                v.ball(rng.choice(["basalt", "ash"]), (x, y, -0.03), (rng.uniform(0.08, 0.16), rng.uniform(0.07, 0.12), rng.uniform(0.05, 0.09)))
            else:
                v.ball("lava_glow", (x, y, -0.02), (0.06, 0.05, 0.03))           # a live ember in the ash
                v.ball("ember_orange", (x, y, -0.03), (0.09, 0.07, 0.03))
        elif theme in ("gloam",):
            if pick < 0.5:
                v.ball(body, (x, y, -0.03), (rng.uniform(0.08, 0.15), 0.1, 0.07))
            else:
                v.rod(glow, (x, y, -0.04), (x + rng.uniform(-0.06, 0.06), y, rng.uniform(0.14, 0.26)), 0.045, 0.01)
        else:  # canyon and stony places: pebbles and dry tufts
            if pick < 0.6:
                v.ball(rng.choice([body, deep, top]), (x, y, -0.03), (rng.uniform(0.07, 0.15), rng.uniform(0.06, 0.12), rng.uniform(0.04, 0.08)))
            else:
                _clump(v, rng, x, y, "dry_grass", "sand_dark", out=side, h=0.22)


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
    roll = np.clip((abs(Y) - 0.62) / 0.4, 0, 1)
    ztop = -0.2 * roll**2 - 0.1 * end**3
    zbot = -0.3 - 0.34 * np.clip(1 - (Y / 1.0) ** 2, 0, 1) - 0.22 * n + 0.42 * end**2
    v.fill(body, (Z < ztop) & (Z > zbot) & (abs(Y) < hy) & (end < 0.985))
    v.paint(deep, Z < zbot + 0.16 + 0.1 * n2)
    v.top(top, 2)
    v.paint(accent, (v.noise(0.3, seed + 2) > 0.58) & (Z > -0.2) & (abs(Y) > 0.4))
    if theme == "heart":
        v.paint("wood", (np.mod(Y + 1.0, 0.34) < 0.05) & (Z > -0.07) & (abs(Y) < 0.6))  # plank lines on the walk
    if theme == "ember":
        v.paint("lava_glow", (np.abs(v.noise(0.25, seed + 4) - 0.5) < 0.03) & (Z < -0.15))  # cracks that glow
    _dress(v, theme, seed, 1.0, 0.33, 6)
    rng = np.random.default_rng(seed + 9)
    hang = {"frost": "ice", "sea": "kelp", "gloam": "crystal_cyan", "ember": "basalt"}.get(theme, deep)
    for _ in range(2 if part in "mn" else 1):  # rootlets, drips or icicles hanging underneath
        x, y = rng.uniform(-0.3, 0.3), rng.uniform(-0.6, 0.6)
        L = rng.uniform(0.2, 0.42)
        v.path(hang, [(x, y, -0.5), (x + rng.uniform(-0.08, 0.08), y, -0.5 - L * 0.6), (x + rng.uniform(-0.12, 0.12), y, -0.5 - L)], 0.055, 0.018)
    return v.done(f"plat-{theme}-{part}", keep=0.6, exact=True)


def _cap(theme, var):
    top, body, deep, accent, glow = THEMES[theme]
    seed = sum(map(ord, theme + var)) * 11 + 5
    v = V((-1, -2.45, -1.3), (1, 2.3, 0.5), vpm=8, open="x")
    X, Y, Z = v.X, v.Y, v.Z
    ends = np.clip((1.0 - abs(X)) / 0.25, 0, 1)
    n = (v.noise(0.8, seed) - 0.5) * ends
    n2 = (v.noise(0.35, seed + 1) - 0.5) * ends
    # a top that rolls over the front edge and hangs ragged over the face below
    roll = np.clip((-Y - 1.75) / 0.6, 0, 1)
    ztop = -0.3 * roll**2
    lip = -0.55 - 0.5 * n - 0.25 * n2
    front = -2.28 - 0.1 * n2
    v.fill(body, (Z < ztop) & (Y > front) & (((Y < -1.9) & (Z > lip)) | ((Y >= -1.9) & (Z > -0.45))))
    v.paint(deep, (Z < lip + 0.2) & (Y < -1.9))
    v.top(top, 2)
    v.paint(accent, (v.noise(0.5, seed + 2) > 0.6) & (Z > -0.35))
    _dress(v, theme, seed, 2.1, 0.72, 14)
    rng = np.random.default_rng(seed + 9)
    hang = {"frost": "ice", "sea": "kelp", "gloam": "crystal_cyan", "ember": "basalt", "canyon": "sand_dark"}.get(theme, deep)
    for _ in range(3):  # roots, trailing stems or icicles over the face below
        x = rng.uniform(-0.7, 0.7)
        L = rng.uniform(0.3, 0.65) * (1.4 if theme == "frost" else 1)
        c = hang if rng.random() < 0.6 else GREEN.get(theme, (hang, hang))[1]
        v.path(c, [(x, -2.2, -0.5), (x + rng.uniform(-0.1, 0.1), -2.26, -0.5 - L * 0.5), (x + rng.uniform(-0.16, 0.16), -2.2, -0.5 - L)], 0.07, 0.03 if theme != "frost" else 0.012)
    if var in "bd":
        v.ball(deep, (rng.uniform(-0.5, 0.5), -1.5, 0.02), (0.22, 0.18, 0.12))
    return v.done(f"cap-{theme}-{var}", keep=0.6, exact=True)


def _fill(theme, size, var=""):
    top, body, deep, accent, glow = THEMES[theme]
    seed = sum(map(ord, theme)) + size + (37 if var else 0)
    v = V((0, -2, 0), (size, 2, size), vpm=8, open="xz+y")   # open at the sides too: packed squares read as one mass
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(1.7, seed)
    n2 = v.noise(0.7, seed + 1)
    n3 = v.noise(3.5, seed + 2)
    if theme in BARK:
        # bark: plates running up, split by deep furrows, with the odd knot
        wob = X + 0.6 * (n - 0.5) + 0.25 * np.sin(Z * 0.9 + seed)
        ridge = np.abs(np.sin(wob * 2.4))
        relief = 0.12 + 0.55 * ridge**0.6 * (0.55 + 0.45 * n2)
        v.fill("bark_dark", Y > -2 + relief)
        v.paint("bark", (ridge > 0.35) & (n3 > 0.3))
        v.paint("wood", (ridge > 0.8) & (n2 > 0.5))
        v.paint("moss", (v.noise(1.1, seed + 5) > 0.68) & (Y < -1.2))
        v.paint("gold_soft", (v.noise(0.5, seed + 6) > 0.86) & (Y < -1.5))     # glowing sap in the furrows
    elif theme == "ember":
        # basalt in rough columns, with seams of lava light between them
        col = np.mod(X + 0.4 * (n - 0.5), 1.3)
        seam = (col < 0.1) | (np.abs(n2 - 0.5) < 0.025)
        relief = 0.15 + 0.45 * n * n2 + 0.25 * (col < 0.14)
        v.fill(deep, Y > -2 + relief)
        v.paint(body, (n > 0.5) & ~seam)
        v.paint("lava_glow", seam & (Y < -1.3) & (n3 > 0.35))
        v.paint(accent, seam & (Y < -1.2) & (n3 <= 0.35))
    elif theme in ("gloam", "sea"):
        # wet cave stone, pocked, with glowing specks (crystals in the gloam, sea-glow on the reef)
        relief = 0.15 + 0.6 * n * n2
        v.fill(deep, Y > -2 + relief)
        v.paint(body, (n > 0.45) & (n2 > 0.35))
        v.paint(top, (n3 > 0.72) & (n > 0.5))
        v.paint(glow, (v.noise(0.45, seed + 7) > 0.83) & (Y < -1.4))
        if theme == "sea":
            v.paint(accent, (v.noise(0.9, seed + 8) > 0.76) & (Y < -1.2))
    else:
        # rock and earth in strata (bold bands in the canyon, the colonnades and the peaks)
        band = 1.6 if theme not in STRATA else 1.1
        strata = np.mod(Z + 0.8 * (n3 - 0.5), band) < (0.22 if theme not in STRATA else 0.3)
        relief = 0.15 + 0.6 * n * n2 + 0.2 * strata
        v.fill(deep, Y > -2 + relief)
        v.paint(body, (n > 0.46) & ~strata)
        v.paint(top, (n2 > 0.66) & (n > 0.5))
        v.paint(accent, (v.noise(0.9, seed + 5) > 0.74) & (Y < -1.2))
        if theme == "frost":
            v.paint("ice", strata & (Y < -1.2))
            v.paint("snow", v.exposed(2, 1, 1) & (n > 0.4))
        if theme in ("grove", "falls"):
            v.paint(glow, (v.noise(0.4, seed + 9) > 0.88) & (Y < -1.5))   # the odd glowing crystal
    return v.done_tris(f"fill-{theme}-{size}{var}", {8: 7000, 4: 3000, 2: 1200, 1: 500}[size], relax=1)


for _t in THEMES:
    for _p in "lmnr":
        asset(f"plat-{_t}-{_p}", "kit-" + _t, "platform piece, 1 m wide, top at z = 0")(lambda _t=_t, _p=_p: _plat(_t, _p))
    for _v in "abcd":
        asset(f"cap-{_t}-{_v}", "kit-" + _t, "ground cap, 2 m wide, top at z = 0")(lambda _t=_t, _v=_v: _cap(_t, _v))
    for _s in (8, 4, 2, 1):
        asset(f"fill-{_t}-{_s}", "kit-" + _t, f"{_s} m square of ground or wall")(lambda _t=_t, _s=_s: _fill(_t, _s))
        if _s >= 4:
            asset(f"fill-{_t}-{_s}b", "kit-" + _t, f"{_s} m square of ground or wall, second look")(lambda _t=_t, _s=_s: _fill(_t, _s, "b"))
