"""Lays the registered assets out as a library file and renders contact sheets of it."""
import os
import uuid

import bpy
from mathutils import Vector

from .core import ASSETS, mat


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    bpy.context.view_layer.update()
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def build_asset(name):
    """Builds one asset as a collection (not linked to any scene) and returns it."""
    cat, fn, note = ASSETS[name]
    made = fn()
    objs = made if isinstance(made, list) else [made]
    objs[0].name = name
    coll = bpy.data.collections.new(name)
    for o in objs:
        coll.objects.link(o)
    coll["nt_cat"] = cat
    coll["nt_note"] = note
    return coll


def label(text, loc, size, scene_coll):
    cu = bpy.data.curves.new("label", "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = "CENTER"
    ob = bpy.data.objects.new("label." + text, cu)
    ob.location = loc
    ob.rotation_euler = (1.5708, 0, 0)
    cu.materials.append(mat("cream"))
    scene_coll.objects.link(ob)
    return ob


def build_library(only=None):
    """Every asset on a shelf by category. Returns {category: (lo, hi)} for the sheet camera."""
    reset()
    scene = bpy.data.scenes.new("Library") if not bpy.data.scenes else bpy.data.scenes[0]
    scene.name = "Library"
    cats = {}
    for name, (cat, _, _) in ASSETS.items():
        if only and cat not in only:
            continue
        cats.setdefault(cat, []).append(name)
    catalog_lines = ["VERSION 1", ""]
    spans = {}
    shelf_z = 0.0
    for cat, names in cats.items():
        cid = str(uuid.uuid5(uuid.NAMESPACE_URL, "owl-park/night-tree/" + cat))
        catalog_lines.append(f"{cid}:Night Tree/{cat}:Night Tree-{cat}")
        shelf = bpy.data.collections.new("shelf." + cat)
        scene.collection.children.link(shelf)
        built = []
        for name in names:
            coll = build_asset(name)
            shelf.children.link(coll)
            lo, hi = bounds(coll.objects)
            built.append((name, coll, lo, hi))
        tallest = max(hi.z - lo.z for _, _, lo, hi in built)
        gap = max(0.4, tallest * 0.12)
        text = max(0.12, tallest * 0.045)
        # wrap the shelf into rows so a sheet stays readable
        row_w = max(tallest * 5, max(hi.x - lo.x for _, _, lo, hi in built) + gap)
        x = 0.0
        row_h = 0.0
        z = shelf_z
        slo = Vector((0, 0, 1e9))
        shi = Vector((0, 0, -1e9))
        rows = [[]]
        for item in built:
            w = item[3].x - item[2].x
            if x > 0 and x + w > row_w:
                rows.append([])
                x = 0.0
            rows[-1].append(item)
            x += w + gap
        for row in rows:
            row_h = max(hi.z - lo.z for _, _, lo, hi in row)
            z -= row_h + text * 3 + gap
            x = 0.0
            for name, coll, lo, hi in row:
                off = Vector((x - lo.x, 0, z - lo.z))
                root = coll.objects[name]
                root.location = root.location + off
                coll.instance_offset = off
                coll.asset_mark()
                coll.asset_data.catalog_id = cid
                coll.asset_data.description = coll["nt_note"]
                label(name, (x + (hi.x - lo.x) / 2, 0, z - text * 1.6), text, shelf)
                shi.x = max(shi.x, x + hi.x - lo.x)
                x += hi.x - lo.x + gap
        spans[cat] = (Vector((-gap, 0, z - text * 3)), Vector((shi.x + gap, 0, shelf_z)))
        shelf_z = z - text * 3 - gap * 4 - 2
    bpy.context.view_layer.update()
    if bpy.data.filepath or True:
        build_library.catalog = "\n".join(catalog_lines) + "\n"
    return spans


def light_rig(scene, strength=1.0):
    w = bpy.data.worlds.new("night")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.012, 0.03, 0.07, 1)
    bg.inputs[1].default_value = 1.0
    scene.world = w
    for nm, rot, col, e in (("moon", (0.9, 0.1, 0.5), (0.75, 0.85, 1), 2.5), ("fill", (1.2, 0, -0.9), (1, 0.8, 0.55), 1.2)):
        li = bpy.data.lights.new(nm, "SUN")
        li.energy = e * strength
        li.color = col
        li.angle = 0.3
        ob = bpy.data.objects.new(nm, li)
        ob.rotation_euler = rot
        scene.collection.objects.link(ob)


def setup_cycles(scene, w, h, samples=24):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"


def render_sheets(spans, outdir):
    os.makedirs(outdir, exist_ok=True)
    scene = bpy.data.scenes["Library"]
    light_rig(scene)
    cam = bpy.data.cameras.new("sheet")
    cam.type = "ORTHO"
    co = bpy.data.objects.new("sheet", cam)
    scene.collection.objects.link(co)
    scene.camera = co
    for cat, (lo, hi) in spans.items():
        w, h = hi.x - lo.x, hi.z - lo.z
        px = 1600
        py = max(200, int(px * h / w))
        if py > 1600:
            px = int(px * 1600 / py)
            py = 1600
        setup_cycles(scene, px, py)
        cam.ortho_scale = max(w, h)
        # three-quarter view: a little from the right and above, so depth reads
        co.location = ((lo.x + hi.x) / 2 + 12, -60, (lo.z + hi.z) / 2 + 10)
        co.rotation_euler = (1.5708 - 0.165, 0, 0.197)
        cam.clip_end = 500
        scene.render.filepath = os.path.join(outdir, f"{cat}.png")
        bpy.ops.render.render(write_still=True)
        print("sheet", cat, px, py)
