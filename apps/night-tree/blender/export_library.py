"""Exports the asset library for the game: game/world/library.glb, every asset a top-level node at
the origin, named for the asset. Vertex colour carries the paint (rgb) and the glow (alpha).

Run after build_assets.py:  python export_library.py
"""
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(HERE, "..", "build")
bpy.ops.wm.open_mainfile(filepath=os.path.join(out, "library.blend"))
n = 0
for coll in bpy.data.collections:
    if "nt_cat" not in coll:
        continue
    root = coll.objects.get(coll.name)
    root.location = root.location - coll.instance_offset
    n += 1
for ob in list(bpy.data.objects):
    if ob.type == "FONT" and ob.name.startswith("label."):
        bpy.data.objects.remove(ob)
dst = os.path.join(HERE, "..", "game", "world", "library.glb")
bpy.ops.export_scene.gltf(
    filepath=dst, export_format="GLB", export_yup=True, export_apply=False,
    export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
    export_materials="EXPORT", export_cameras=False, export_lights=False, export_animations=False,
)
print(f"library.glb: {n} assets, {os.path.getsize(dst) // 1024} KB")
