"""Turns the rigged horned owl (owl/build_owl.py -> build/owl/Owl.blend) into the game's player owl:
build/owl-horned.blend, with three meshes the game poses, painted the way every asset is (vertex
colour, so the one paint shader lights it):

  owl-horned          the body, head, face, eyes, beak, tufts, tail and feet; origin under its feet
  owl-horned_wingL/R  each wing (flight feathers and coverts), origin at its shoulder, with a
                      "Spread" shape key: 0 folded at its side, 1 opened wide

The owl's procedural shaders are baked to vertex colour with Cycles, and the whole is scaled from
the sculpt's 2.2 m to the game's owl (1 m to the top of the head).

Run: python owl/bake_owl.py   (after python owl/build_owl.py -- ../build/owl)
"""
import os

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "..", "..", "build")
SRC = os.path.join(BUILD, "owl", "Owl.blend")
OUT = os.path.join(BUILD, "owl-horned.blend")
SCALE = 1.0 / 2.05          # the sculpt's head top is about 2.05 m

bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 1
rig = bpy.data.objects["Owl_Rig"]
if rig.animation_data:
    rig.animation_data.action = None
for k in ("wing_spread_L", "wing_spread_R"):
    rig[k] = 0.0
for pb in rig.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
# 1. bake each part's colour into a vertex colour on its own (unsubdivided) mesh
for ob in meshes:
    subs = [m for m in ob.modifiers if m.type == "SUBSURF"]
    for m in subs:
        m.show_render = False
    me = ob.data
    if "Col" not in me.color_attributes:
        me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    me.color_attributes.active_color = me.color_attributes["Col"]
    me.attributes.active_color = me.color_attributes["Col"]
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, target="VERTEX_COLORS")
    for m in subs:   # the body's quads are smooth enough as they are; the wing shells want one level
        m.show_render = True
        m.render_levels = m.levels = 0 if ob.name == "Owl_Body" else 1
    print("baked", ob.name, flush=True)


def evaluated(obs):
    """The parts as they stand now (rig and shape keys applied), joined into one mesh's data."""
    dg = bpy.context.evaluated_depsgraph_get()
    verts, faces, cols = [], [], []
    for ob in obs:
        ev = ob.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
        me.transform(ob.matrix_world)
        col = me.color_attributes.get("Col")
        base = len(verts)
        verts += [v.co.copy() for v in me.vertices]
        faces += [[base + i for i in p.vertices] for p in me.polygons]
        if col is not None and col.domain == "POINT":
            cols += [tuple(c.color) for c in col.data]
        elif col is not None:
            acc = [[0, 0, 0, 0, 0] for _ in me.vertices]
            for li, loop in enumerate(me.loops):
                c = col.data[li].color
                a = acc[loop.vertex_index]
                for k in range(4):
                    a[k] += c[k]
                a[4] += 1
            cols += [tuple(x / max(a[4], 1) for x in a[:4]) for a in acc]
        else:
            cols += [(0.5, 0.5, 0.5, 1.0)] * len(me.vertices)
        bpy.data.meshes.remove(me)
    return verts, faces, cols


def make(name, verts, faces, cols, origin, keys=None):
    me = bpy.data.meshes.new(name)
    S = Matrix.Scale(SCALE, 4) @ Matrix.Translation(-origin)
    me.from_pydata([tuple(S @ v) for v in verts], [], faces)
    a = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    a.data.foreach_set("color", [c for rgba in cols for c in (rgba[0], rgba[1], rgba[2], 0.0)])
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    paint = bpy.data.materials.get("nt_paint") or bpy.data.materials.new("nt_paint")
    me.materials.append(paint)
    ob = bpy.data.objects.new(name, me)
    if keys:
        ob.shape_key_add(name="Basis")
        for kname, kverts in keys.items():
            sk = ob.shape_key_add(name=kname, from_mix=False)
            for i, v in enumerate(kverts):
                sk.data[i].co = S @ v
    return ob


body_parts = [o for o in meshes if not o.name.startswith(("Owl_WingFeathers", "Owl_WingCoverts"))]
v, f, c = evaluated(body_parts)
body = make("owl-horned", v, f, c, Vector((0, 0, 0)))
parts = [body]
for side in ("L", "R"):
    wing_obs = [bpy.data.objects[f"Owl_WingFeathers_{side}"], bpy.data.objects[f"Owl_WingCoverts_{side}"]]
    shoulder = (rig.matrix_world @ rig.data.bones[f"wing_shoulder_{side}"].head_local).copy()
    rig[f"wing_spread_{side}"] = 0.0
    rig.update_tag()
    bpy.context.view_layer.update()
    v0, f0, c0 = evaluated(wing_obs)
    rig[f"wing_spread_{side}"] = 1.0
    rig.update_tag()
    bpy.context.view_layer.update()
    v1, _f1, _c1 = evaluated(wing_obs)
    rig[f"wing_spread_{side}"] = 0.0
    bpy.context.view_layer.update()
    w = make(f"owl-horned_wing{side}", v0, f0, c0, shoulder, keys={"Spread": [x - shoulder + shoulder for x in v1]})
    w.location = shoulder * SCALE
    # the shape key was made in the wing's own space: shift it by the same origin
    for i, x in enumerate(v1):
        w.data.shape_keys.key_blocks["Spread"].data[i].co = (x - shoulder) * SCALE
    w.parent = body
    parts.append(w)
    print("wing", side, "verts", len(v0), "shoulder", tuple(round(k, 3) for k in shoulder * SCALE))

# a fresh file with only the game owl in it
keep = {p.name for p in parts}
for ob in list(bpy.data.objects):
    if ob.name not in keep:
        bpy.data.objects.remove(ob)
for coll in list(bpy.data.collections):
    bpy.data.collections.remove(coll)
for p in parts:
    sc.collection.objects.link(p)
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("saved", OUT, "body verts", len(body.data.vertices))
