"""Review renders: one asset at a time, as an art director would look at it.

Each image shows the asset twice, in the game's light: on the left as the game sees it (straight on,
from 22 m), on the right turned a third round and closer, with a 1 m owl beside it for scale.

Run: python review.py <asset> [<asset> ...]      -> build/review/<asset>.png
     python review.py --cat=<category>           -> every asset in a category
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from nt import assets  # noqa: E402,F401
from nt.core import ASSETS  # noqa: E402
from nt.library import bounds, build_asset, reset, setup_cycles  # noqa: E402

out = os.path.join(HERE, "..", "build", "review")
os.makedirs(out, exist_ok=True)
for _n, _tb in assets.BROKEN:
    print(f"PACK FAILED TO LOAD: {_n}\n{_tb}")
names = [a for a in sys.argv[1:] if not a.startswith("--")]
for a in sys.argv[1:]:
    if a.startswith("--cat="):
        names += [n for n, (c, _, _) in ASSETS.items() if c == a.split("=", 1)[1]]


def copy_tree(coll, into, loc, rot):
    made = {}
    for o in coll.objects:
        c = o.copy()
        into.objects.link(c)
        made[o] = c
    for o, c in made.items():
        if o.parent in made:
            c.parent = made[o.parent]
        else:
            c.location = Vector(loc) + o.location
            c.rotation_euler = (0, 0, rot)
    return list(made.values())


for name in names:
    if name not in ASSETS:
        print("no such asset:", name)
        continue
    reset()
    scene = bpy.data.scenes[0]
    coll = build_asset(name)
    owl = build_asset("owl-great-horned")
    stage = bpy.data.collections.new("stage")
    scene.collection.children.link(stage)
    tmp = copy_tree(coll, stage, (0, 0, 0), 0)
    lo, hi = bounds(tmp)
    w, h = max(hi.x - lo.x, 0.6), max(hi.z - lo.z, 0.6)
    gap = max(w * 0.25, 0.6)
    left = copy_tree(coll, stage, (-(w / 2 + gap / 2) - (lo.x + hi.x) / 2, 0, 0), 0)
    right = copy_tree(coll, stage, ((w / 2 + gap / 2) - (lo.x + hi.x) / 2 * math.cos(0.6), 0, 0), 0.6)
    for o in tmp:
        bpy.data.objects.remove(o)
    copy_tree(owl, stage, (w + gap + 0.9, -0.2, max(lo.z, 0) if lo.z > -0.05 else 0), 0.5)
    # the game's light: a cool moon from above, a warm lantern low and near, night all round
    world = bpy.data.worlds.new("night")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.018, 0.04, 0.09, 1)
    scene.world = world
    for nm, rot, col, e in (("moon", (0.85, 0.1, 0.55), (0.72, 0.82, 1), 2.6), ("fill", (1.25, 0, -0.8), (1, 0.82, 0.6), 0.9)):
        li = bpy.data.lights.new(nm, "SUN")
        li.energy, li.color, li.angle = e, col, 0.25
        ob = bpy.data.objects.new(nm, li)
        ob.rotation_euler = rot
        scene.collection.objects.link(ob)
    lamp = bpy.data.lights.new("lantern", "POINT")
    lamp.energy, lamp.color, lamp.shadow_soft_size = 60 * max(w, h) ** 2, (1, 0.8, 0.5), 0.3
    lo_ = bpy.data.objects.new("lantern", lamp)
    lo_.location = (w * 0.9, -max(w, h) * 1.2, lo.z + h * 0.8)
    scene.collection.objects.link(lo_)
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    span_w = 2 * w + gap + 2.2
    span_h = h * 1.15 + 0.3
    px = 1500
    py = int(max(360, min(1100, px * span_h / span_w)))
    cam.ortho_scale = max(span_w, span_h * px / py) * 1.04
    co = bpy.data.objects.new("cam", cam)
    co.location = (0.55, -60, (lo.z + hi.z) / 2 + 60 * math.tan(0.14))
    co.rotation_euler = (math.pi / 2 - 0.14, 0, 0)
    cam.clip_end = 300
    scene.collection.objects.link(co)
    scene.camera = co
    setup_cycles(scene, px, py, samples=32)
    scene.render.filepath = os.path.join(out, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("review", name, f"{w:.2f} x {h:.2f} m")
