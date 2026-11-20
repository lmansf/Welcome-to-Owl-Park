"""Builds the asset library: build/library.blend, with every asset a collection marked for the Asset Browser.

Run with Blender or the bpy module:  python build_assets.py [--sheets]
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from wr import assets  # noqa: E402,F401
from wr.core import ASSETS  # noqa: E402
from wr.library import build_library, render_sheets  # noqa: E402

out = os.path.join(HERE, "..", "build")
os.makedirs(out, exist_ok=True)
only = [a.split("=", 1)[1] for a in sys.argv if a.startswith("--cat=")]
for _name, _tb in assets.BROKEN:
    print(f"PACK FAILED TO LOAD: {_name}\n{_tb}")
cats = build_library(only or None)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "library.blend"))
print(f"library: {len(ASSETS)} assets in {len(cats)} categories")
if "--sheets" in sys.argv:
    render_sheets(cats, os.path.join(out, "sheets"))
from wr.vox import STATS  # noqa: E402

print("triangles:", sum(STATS.values()), "largest:", sorted(STATS.items(), key=lambda kv: -kv[1])[:8])
