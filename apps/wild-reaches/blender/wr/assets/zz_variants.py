"""Second looks made from first ones. A wall panel mirrored left to right still meets its neighbours
(its edges are the same edges, swapped), so the map can alternate the two and repeat half as often."""
from ..core import ASSETS, asset

MIRRORED = ("trunk-wall", "cave-wall", "grove-wall", "falls-wall", "ember-wall", "frost-wall", "canyon-wall",
            "colonnade-wall", "gloam-wall", "sea-wall")


def _mirror(name):
    cat, fn, note = ASSETS[name]

    def build():
        ob = fn()
        me = ob.data
        for vert in me.vertices:
            vert.co.x = -vert.co.x
        me.flip_normals()
        me.update()
        return ob

    asset(name + "-b", cat, f"{name}, mirrored left to right")(build)


for _n in MIRRORED:
    _mirror(_n)
