"""How big a world is, measured the same way for any world: the number of camera screens
(24 x 13.5 m, the usual view) that hold somewhere the owl can stand, and the metres of floor.

Run: python world_size.py [--world night-tree]
"""
import math
import sys

from check_map import SCREEN, load_world


def size(world):
    tops = []
    solids = world["solids"]
    # an exposed top: a solid's top edge not covered by another solid
    cover = {}
    for s in solids:
        for x in range(int(s["x0"]), int(s["x1"])):
            cover.setdefault(x, []).append((s["z0"], s["z1"]))
    for s in solids:
        for x in range(int(s["x0"]), int(s["x1"])):
            z = s["z1"]
            if not any(z0 <= z < z1 for z0, z1 in cover[x]):
                tops.append((x + 0.5, z))
    for o in world["oneways"]:
        for x in range(int(o["x0"]), int(o["x1"])):
            tops.append((x + 0.5, o["z"]))
    zones = world["zones"]
    inside = [(x, z) for x, z in tops if any(zn["x0"] <= x < zn["x1"] and zn["z0"] <= z < zn["z1"] for zn in zones)]
    screens = {(math.floor(x / SCREEN[0]), math.floor(z / SCREEN[1])) for x, z in inside}
    return len(screens), len(inside)


if __name__ == "__main__":
    name = sys.argv[sys.argv.index("--world") + 1] if "--world" in sys.argv else "wild-reaches"
    w, _ = load_world(name)
    n, m = size(w)
    print(f"{name}: {n} screens with floor, {m} m of floor")
