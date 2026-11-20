"""The player: the horned owl from the character sheet, made by owl/build_owl.py (a rigged model)
and owl/bake_owl.py (painted to vertex colour, split into a body and two wings the game poses).

An owl is a root with two children: the body is the root, origin under its feet, and each wing's
origin is its shoulder; each wing has a "Spread" shape key, 0 folded at its side to 1 opened wide.
"""
import os

import bpy

from ..core import asset

HERE = os.path.dirname(os.path.abspath(__file__))
BAKED = os.path.join(HERE, "..", "..", "..", "build", "owl-horned.blend")


@asset("owl-horned", "owls", "the player: a horned owl 1 m to the top of its head; wings are children with a Spread shape key")
def owl_horned():
    if not os.path.exists(BAKED):
        raise FileNotFoundError(f"{BAKED} is missing: run owl/build_owl.py -- ../build/owl, then owl/bake_owl.py")
    names = ["owl-horned", "owl-horned_wingL", "owl-horned_wingR"]
    with bpy.data.libraries.load(BAKED, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in names]
    objs = {o.name.split(".")[0]: o for o in dst.objects}
    return [objs[n] for n in names]
