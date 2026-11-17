"""The level kit: what the owl stands on, in each realm's dress.

Sizes are fixed, because the map's collision is laid to them:
  plat-<theme>-l/m/n/r  one metre wide each, top at z = 0, about 0.5 thick, 2 deep (y -1 to 1);
                        m and n are two middles to alternate; they run on in x so they tile
  cap-<theme>-a/b       a 2 m ground cap, top at z = 0, 4.5 deep; lies along the top of fills
  fill-<theme>-8/4/2/1  a square of ground or wall that many metres on a side, 4 deep (y -2 to 2),
                        origin at its bottom-left corner; the map packs solid ground with them
"""
import numpy as np

from ..core import asset
from ..vox import V

THEMES = {
    # theme: (top, body, deep, accent, glow)
    "tree": ("wood_light", "wood", "bark", "moss", "gold_soft"),
    "clearing": ("moss_light", "moss", "bark_dark", "amber", "amber_glow"),
    "roots": ("stone", "stone_dark", "navy_deep", "moss", "gold_soft"),
    "neon": ("chrome", "violet", "neon_dark", "cyan_glow", "magenta_glow"),
    "glass": ("glass_blue", "lead", "lead", "amber_glass", "sapphire"),
    "ink": ("paper", "ink_grey", "ink", "seal_red", "paper_glow"),
    "canopy": ("moss_light", "bark", "leaf_dark", "moss", "gold_soft"),
}
ORGANIC = ("tree", "clearing", "roots", "canopy", "ink")


def _plat(theme, part):
    top, body, deep, accent, glow = THEMES[theme]
    seed = sum(map(ord, theme + part))
    v = V((-0.5, -1.1, -0.75), (0.5, 1.1, 0.3), vpm=16, open={"l": "+x", "r": "-x"}.get(part, "x"))
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(0.5, seed)
    # a slab that thins toward its edges, lumpy underneath
    end = np.zeros_like(X) if part in "mn" else np.clip(((-X if part == "l" else X) - 0.1) / 0.4, 0, 1)
    under = -0.28 - 0.22 * (1 - (Y / 1.0) ** 2) - 0.12 * n + 0.3 * end**2
    edge_y = 1.0 - 0.12 * end - 0.06 * v.noise(0.4, seed + 1)
    v.fill(body, (Z < 0) & (Z > under) & (abs(Y) < edge_y) & (end < 0.98))
    v.paint(deep, Z < under + 0.12 + 0.08 * n)
    v.top(top, 2)
    if theme in ORGANIC:
        v.paint(accent, (v.noise(0.35, seed + 2) > 0.62) & (Z > -0.14) & (abs(Y) > 0.45))
        # tufts along the front and back lips, clear of where the owl walks
        rng = np.random.default_rng(seed)
        for _ in range(5):
            x, y = rng.uniform(-0.45, 0.45), rng.choice([-1, 1]) * rng.uniform(0.7, 0.92)
            v.rod(accent, (x, y, -0.03), (x + rng.uniform(-0.06, 0.06), y, 0.08 + rng.uniform(0, 0.14)), 0.05, 0.015, flat=False)
        if part == "n":
            v.rod(deep, (0.1, -0.5, -0.4), (0.16, -0.55, -0.72), 0.06, 0.02, flat=False)  # a root or drip hanging under
    elif theme == "neon":
        v.box(glow, (-0.5, -1.2, -0.2), (0.5, -0.9, -0.12), only="solid")
        v.box(accent, (-0.5, 0.9, -0.2), (0.5, 1.2, -0.12), only="solid")
        v.paint(deep, (np.mod(X + 0.5, 0.5) < 0.07) & (Z > -0.1))
    elif theme == "glass":
        v.paint("lead", (np.mod(X + 0.5, 0.5) < 0.07) | (abs(Y) > 0.85))
        for i, c in enumerate(("ruby", "amber_glass", "emerald", "sapphire")):
            v.paint(c, (np.mod(np.floor((X + 0.5) / 0.5) + (1 if part in "nr" else 0) * 2 + np.floor((Y + 1) / 0.5), 4) == i) & (Z < -0.15) & (Z > under + 0.1) & (np.mod(X + 0.5, 0.5) > 0.09))
    return v.done(f"plat-{theme}-{part}", keep=0.22)


def _cap(theme, var):
    top, body, deep, accent, glow = THEMES[theme]
    seed = sum(map(ord, theme + var)) + 11
    v = V((-1, -2.3, -0.9), (1, 2.3, 0.45), vpm=8, open="x")
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(0.9, seed)
    lip = -0.5 - 0.3 * n  # the cap's ragged lower edge over the fill's face
    v.fill(body, (Z < 0) & (((Y < -1.9) & (Z > lip)) | ((Y >= -1.9) & (Z > -0.4))) & (Y > -2.2 - 0.08 * n))
    v.top(top, 2)
    if theme in ORGANIC:
        v.paint(accent, (v.noise(0.6, seed + 3) > 0.6) & (Z > -0.3))
        rng = np.random.default_rng(seed)
        for _ in range(9):
            x = rng.uniform(-0.9, 0.9)
            y = rng.choice([rng.uniform(-2.1, -0.9), rng.uniform(0.9, 2.1)])
            v.rod(accent if rng.random() < 0.6 else top, (x, y, -0.05), (x + rng.uniform(-0.12, 0.12), y, 0.12 + rng.uniform(0, 0.28)), 0.09, 0.03, flat=False)
        if theme == "clearing" and var == "b":
            for x, y in ((-0.5, -1.6), (0.4, 1.5)):
                v.rod("cream", (x, y, 0), (x, y, 0.22), 0.04)
                v.ball(glow, (x, y, 0.27), (0.11, 0.11, 0.08))
    elif theme == "neon":
        v.box(glow if var == "a" else accent, (-1, -2.4, -0.3), (1, -2.0, -0.15), only="solid")
        v.paint(deep, (np.mod(X + 1, 1.0) < 0.13) & (Z > -0.13))
    elif theme == "glass":
        v.paint("lead", (np.mod(X + 1, 0.5) < 0.13))
        for i, c in enumerate(("ruby", "amber_glass", "emerald", "sapphire")):
            v.paint(c, (np.mod(np.floor((X + 1) / 0.5) + (2 if var == "b" else 0), 4) == i) & (Y < -1.9) & (Z < -0.14) & (np.mod(X + 1, 0.5) > 0.13))
    return v.done(f"cap-{theme}-{var}", keep=0.3)


def _fill(theme, size):
    top, body, deep, accent, glow = THEMES[theme]
    seed = sum(map(ord, theme)) + size
    vpm = 4 if size >= 4 else 8
    v = V((0, -2, 0), (size, 2, size), vpm=vpm, open="+y")
    X, Y, Z = v.X, v.Y, v.Z
    n = v.noise(1.6, seed)
    n2 = v.noise(0.7, seed + 1)
    if theme in ("tree", "canopy"):
        relief = 0.18 + 0.5 * np.abs(np.sin((X + 0.5 * n) * 2.6)) * (0.5 + 0.5 * n2)  # bark ridges run up
    elif theme == "neon":
        relief = 0.1 + 0.25 * ((np.mod(X, 2.0) < 0.25) | (np.mod(Z, 2.0) < 0.25))  # panel seams
    elif theme == "glass":
        relief = 0.1 + 0.25 * ((np.mod(X + Z, 2.0) < 0.3) | (np.mod(X - Z, 2.0) < 0.3))  # a lead lattice
    else:
        relief = 0.15 + 0.7 * n * n2  # rock and earth
    solid = Y > -2 + relief
    v.fill(deep, solid)
    v.paint(body, n > 0.48)
    if theme in ORGANIC:
        v.paint(accent, (v.noise(0.9, seed + 5) > 0.7) & (Y < -1.2))
    if theme == "neon":
        v.paint(glow if size == 8 else accent, (np.mod(Z, 4.0) < 0.26) & (np.mod(X + np.floor(Z / 4.0) * 3, 8.0) < 3.0) & (Y < -1.4))
    if theme == "glass":
        lat = (np.mod(X + Z, 2.0) < 0.3) | (np.mod(X - Z, 2.0) < 0.3)
        pane = np.mod(np.floor((X + Z) / 2.0) + 2 * np.floor((X - Z) / 2.0), 5)
        for i, c in enumerate(("ruby", "sapphire", "emerald", "amber_glass", "lilac")):
            v.paint(c, (pane == i) & ~lat & (Y < -1.2) & (n2 > 0.35))
    if theme == "ink":
        v.paint("paper", (v.noise(2.2, seed + 7) > 0.55) & (Y < -1.2))
    return v.done(f"fill-{theme}-{size}", keep=0.3 if size >= 4 else 0.2, relax=1)


for _t in THEMES:
    for _p in "lmnr":
        asset(f"plat-{_t}-{_p}", "kit-" + _t, "platform piece, 1 m wide, top at z = 0")(lambda _t=_t, _p=_p: _plat(_t, _p))
    for _v in "ab":
        asset(f"cap-{_t}-{_v}", "kit-" + _t, "ground cap, 2 m wide, top at z = 0")(lambda _t=_t, _v=_v: _cap(_t, _v))
    for _s in (8, 4, 2, 1):
        asset(f"fill-{_t}-{_s}", "kit-" + _t, f"{_s} m square of ground or wall")(lambda _t=_t, _s=_s: _fill(_t, _s))
