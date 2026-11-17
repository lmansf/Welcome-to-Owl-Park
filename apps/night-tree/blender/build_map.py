"""Builds the whole park as one Blender scene, build/world.blend, from the library and the map.

Every placed thing is an instance of a library collection, so the file stays small and an edit to
the library shows everywhere. The rules (world.json) ride along as a text block, and the collision
is drawn as a wire object in its own collection for reference.

Run after build_assets.py:  python build_map.py [--shots]
"""
import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from nt.library import light_rig, setup_cycles  # noqa: E402
from nt.world import build_world  # noqa: E402

out = os.path.join(HERE, "..", "build")
bpy.ops.wm.open_mainfile(filepath=os.path.join(out, "library.blend"))
world = build_world()

scene = bpy.data.scenes.new("Park")
bpy.context.window.scene = scene
missing = {}


def place(coll, name, a, p, r, s):
    c = bpy.data.collections.get(a)
    if c is None or "nt_cat" not in c:
        missing[a] = missing.get(a, 0) + 1
        return None
    ob = bpy.data.objects.new(name, None)
    ob.instance_type = "COLLECTION"
    ob.instance_collection = c
    ob.location = p
    ob.rotation_euler = (0, 0, math.radians(r))
    ob.scale = s
    ob.empty_display_size = 0.3
    coll.objects.link(ob)
    return ob


decor = bpy.data.collections.new("Decor")
ents = bpy.data.collections.new("Entities")
coll_c = bpy.data.collections.new("Collision")
for c in (decor, ents, coll_c):
    scene.collection.children.link(c)
for i, d in enumerate(world["decor"]):
    place(decor, f"D.{i}.{d['a']}", d["a"], d["p"], d["r"], d["s"])
for e in world["entities"]:
    ob = place(ents, f"E.{e['ref']}.{e['kind']}", e["a"], e["p"], e["r"], e["s"])
place(ents, "E.owl", "owl-great-horned", (world["spawn"]["x"], 0, world["spawn"]["z"]), 0, (1, 1, 1))

# the collision, as wire boxes
verts, edges = [], []
def box(x0, z0, x1, z1, y=1.0):
    n = len(verts)
    for yy in (-y, y):
        verts.extend([(x0, yy, z0), (x1, yy, z0), (x1, yy, z1), (x0, yy, z1)])
    for a, b in ((0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)):
        edges.append((n + a, n + b))
for s in world["solids"]:
    box(s["x0"], s["z0"], s["x1"], s["z1"], 2.0)
for o in world["oneways"]:
    box(o["x0"], o["z"] - 0.1, o["x1"], o["z"])
me = bpy.data.meshes.new("collision")
me.from_pydata(verts, edges, [])
co = bpy.data.objects.new("collision", me)
co.display_type = "WIRE"
co.hide_render = True
coll_c.objects.link(co)
coll_c.hide_viewport = True

txt = bpy.data.texts.new("world.json")
txt.write(json.dumps(world))
if missing:
    print("MISSING ASSETS:", dict(sorted(missing.items())))
print(f"park: {len(decor.objects)} placed, {len(ents.objects)} entities")

light_rig(scene, 0.6)
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.006, 0.016, 0.045, 1)
cam = bpy.data.cameras.new("game")
cam.sensor_fit = "VERTICAL"
cam.angle_y = math.radians(35)
cam.clip_end = 600
co = bpy.data.objects.new("game", cam)
co.rotation_euler = (math.pi / 2, 0, 0)
scene.collection.objects.link(co)
scene.camera = co
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "world.blend"))

SHOTS = {
    "commons": (-36, 3.5, 22), "hollow-floor": (-2, 4, 24), "hollow-mid": (0, 28, 26), "clearing-pond": (-97, 2.5, 22),
    "clearing-idol": (-122, 5.5, 22), "treehouse": (-64, 4.5, 22), "neon": (36, 16, 23), "neon-roofs": (60, 22, 24),
    "robot-owl": (92, 17, 24), "circuit": (72, -3, 22), "ink-garden": (-32, 55, 23), "ink-bridges": (-72, 52, 26),
    "ink-idol": (-110, 55, 23), "glass-street": (40, 73.5, 23), "tower-1": (83, 82, 24), "tower-2": (83, 104, 24),
    "tower-top": (84, 161, 24), "canopy": (22, 110, 27), "crown": (2, 142, 27), "roots": (4, -9, 23), "roots-deep": (-30, -22, 26),
    "wide-tree": (0, 60, 190),
}
if "--shots" in sys.argv:
    want = [a.split("=", 1)[1] for a in sys.argv if a.startswith("--shot=")]
    os.makedirs(os.path.join(out, "shots"), exist_ok=True)
    setup_cycles(scene, 960, 540, samples=20)
    for name, (x, z, dist) in SHOTS.items():
        if want and name not in want:
            continue
        co.location = (x, -dist, z)
        scene.render.filepath = os.path.join(out, "shots", name + ".png")
        bpy.ops.render.render(write_still=True)
        print("shot", name)
