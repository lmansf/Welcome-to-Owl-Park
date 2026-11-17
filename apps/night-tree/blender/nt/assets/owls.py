"""The owls. Each faces the camera (-Y); the game turns it to face its way.

An owl is a root with three children the game poses: the body and the two wings.
Origin: between the feet. Sculpted finer than the world (32 voxels to the metre): it is the hero.
"""
import bpy

from ..core import asset, child
from ..vox import V

SPECIES = {
    # name: (size, body, belly, accent, face, tufts, heart-shaped face)
    "great-horned": (1.0, "owl_body", "owl_belly", "owl_accent", "owl_face", 1.0, False),
    "barn": (0.92, "barn", "snow", "sand_owl", "snow", 0.0, True),
    "burrowing": (0.8, "sand_owl", "owl_belly", "owl_accent", "owl_face", 0.0, False),
    "snowy": (1.0, "snow", "snow", "ink_grey", "snow", 0.0, False),
    "screech": (0.62, "grey_owl", "owl_belly", "ink_grey", "owl_face", 0.7, False),
}


def build_owl(name, size, body, belly, accent, face, tufts, heart):
    root = bpy.data.objects.new(name, None)
    root.empty_display_size = 0.3
    v = V((-0.5, -0.45, 0), (0.5, 0.45, 1.25), vpm=32)
    v.ball(body, (0, 0.02, 0.42), (0.36, 0.33, 0.41))
    v.ball(body, (0, 0, 0.76), (0.34, 0.3, 0.29))
    # tail feathers
    v.ball(accent, (0, 0.3, 0.14), (0.17, 0.2, 0.08))
    v.ball(accent, (0, 0.38, 0.09), (0.1, 0.12, 0.05))
    # belly: paint the front of the body, then fleck it with the accent like breast feathers
    bel = (((v.X) / 0.25) ** 2 + ((v.Z - 0.36) / 0.3) ** 2 < 1) & (v.Y < -0.05)
    v.paint(belly, bel)
    fleck = bel & (np_mod(v.Z, 0.13) < 0.035) & (np_mod(v.X + (v.Z // 0.13) * 0.07, 0.15) < 0.05) & (v.Z < 0.56)
    v.paint(accent, fleck)
    # crown and back a shade darker, in soft bars
    v.paint(accent, (v.Y > 0.12) & (np_mod(v.Z, 0.16) < 0.05) & (v.Z > 0.2))
    for sx in (-1, 1):
        if tufts:
            v.rod(accent, (sx * 0.2, 0.0, 0.94), (sx * 0.3, 0.02, 0.98 + 0.24 * tufts), 0.085, 0.01)
        # face disc
        if heart:
            v.ball(face, (sx * 0.11, -0.2, 0.74), (0.17, 0.14, 0.22))
        else:
            v.ball(face, (sx * 0.135, -0.2, 0.775), (0.165, 0.13, 0.165))
        # feet
        for t in (-0.06, 0, 0.06):
            v.rod("beak", (sx * 0.13 + t, -0.02, 0.03), (sx * 0.13 + t * 1.6, -0.22, 0.03), 0.032, 0.02, flat=False)
    if not heart:
        v.paint(accent, (((abs(v.X) - 0.135) / 0.165) ** 2 + ((v.Z - 0.775) / 0.165) ** 2 > 0.78) & (v.Y < -0.18), only=face)
    for sx in (-1, 1):
        v.ball("eye", (sx * 0.135, -0.3, 0.785), (0.09, 0.06, 0.09))
        v.ball("pupil", (sx * 0.135, -0.345, 0.785), (0.06, 0.04, 0.065))
        v.ball("cream", (sx * 0.135 - 0.028, -0.375, 0.815), 0.024)
    v.rod("beak", (0, -0.3, 0.74), (0, -0.37, 0.66), 0.05, 0.008)
    bo = child(v.done(name + ".body", keep=0.7), root)
    out = [root, bo]
    for sx, side in ((-1, "L"), (1, "R")):
        w = V((-0.2, -0.3, -0.62), (0.2, 0.3, 0.1), vpm=32)
        # a folded wing hanging from the shoulder; the origin is the shoulder so it can swing out
        w.ball(accent, (sx * 0.02, 0.02, -0.2), (0.09, 0.2, 0.26))
        for i in range(4):
            w.ball(body if i % 2 else accent, (sx * 0.03, -0.1 + i * 0.075, -0.4 - i * 0.03), (0.05, 0.065, 0.16))
        w.paint(body, (np_mod(w.Z, 0.11) < 0.04) & (w.Z > -0.36))
        out.append(child(w.done(f"{name}.wing{side}", loc=(sx * 0.35, 0, 0.64), keep=0.5), root))
    root.scale = (size, size, size)
    return out


def np_mod(a, m):
    import numpy as np

    return np.mod(a, m)


for _n, _p in SPECIES.items():
    asset(f"owl-{_n}", "owls", "player owl; body and wings are separate so the game can pose them")(
        lambda _n=_n, _p=_p: build_owl(f"owl-{_n}", *_p)
    )
