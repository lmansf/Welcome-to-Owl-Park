"""Plays the map with each set of moves, by search, to check the design:

  - with the moves an owl should have at each stage, the next guardian can be reached;
  - without them it cannot (every arch up the trunk really is a gate);
  - with every move, every feather, relic and bench can be reached, and the crown.

The search treats timed things kindly (light-bridges always lit, rising air always on, painted
bridges never fading, frail glass holding, no moths) so it answers "is there a way", not "is it easy".
Thorns and falls count as dead ends. Run: python check_map.py   (a few minutes; uses every core)
"""
import json
import multiprocessing
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from nt.sim.sim import ABILITIES, Sim, load_tuning  # noqa: E402
from nt.world import build_world  # noqa: E402

ORDER = ["flap", "dash", "glide", "kick"]
STEPS = 30  # one search move is a quarter of a second


class Kind(Sim):
    def circuit_on(self, c):
        return True

    def frail_on(self, f):
        return True

    def bridge_on(self, b):
        return True

    def updraft_on(self, u):
        return True

    def _camera(self):
        pass


def actions():
    out = []
    for d in (-1, 0, 1):
        for jump in ("off", "hold", "tap"):
            for dash in (False, True):
                out.append((d, jump, dash, False))
    out.append((0, "tap", False, True))  # drop through a ledge
    out.append((1, "hold", False, True))  # talons down
    out.append((-1, "hold", False, True))
    return out


def explore(world, have):
    w = dict(world)
    shrines = w["shrines"]
    w["shrines"] = []
    w["moths"] = []
    w["swings"] = []
    T = load_tuning()
    root = Kind(w, T, have)
    root.got = {}
    seen = {}
    todo = [root]
    found = {"shrines": set(), "benches": set(), "zones": set(), "won": False}
    acts = actions()
    use_dash = "dash" in have
    while todo:
        s = todo.pop()
        for d, jump, dash, down in acts:
            if dash and not use_dash:
                continue
            c = s.clone()
            dead = False
            for i in range(STEPS):
                inp = {"left": d < 0, "right": d > 0, "up": False, "down": down, "jump": jump == "hold" or (jump == "tap" and i >= 2), "dash": dash and i < 3}
                c.step(inp)
                if c.events:
                    if "hurt" in c.events or "faint" in c.events:
                        dead = True
                        break
                    if "bench" in c.events:
                        found["benches"].add(c.p["bench"])
                    if "won" in c.events:
                        found["won"] = True
                for sh in shrines:
                    if abs(sh["x"] - c.p["x"]) < 1.2 and abs(sh["z"] - c.p["z"]) < 2.5:
                        found["shrines"].add(sh["grants"])
            if dead:
                continue
            p = c.p
            key = (round(p["x"]), round(p["z"]), p["ground"], p["flaps"], p["dashReady"], p["wall"])
            if key in seen:
                continue
            seen[key] = True
            found["zones"].add(p["zone"])
            todo.append(c)
    found["feathers"] = sorted(k for k in root.got if k.startswith("feather"))
    found["relics"] = sorted(k for k in root.got if not k.startswith("feather"))
    found["states"] = len(seen)
    found["cells"] = sorted({(k[0], k[1]) for k in seen})
    return found


def stage(n):
    world = build_world()
    t = time.time()
    f = explore(world, ORDER[:n])
    f["seconds"] = round(time.time() - t)
    return n, f


def main():
    world = build_world()
    with multiprocessing.Pool(min(5, os.cpu_count() or 1)) as pool:
        results = dict(pool.map(stage, range(5)))
    ok = True
    for n in range(5):
        f = results[n]
        have = ORDER[:n]
        print(f"\nwith {have or 'no moves'}: {f['states']} states in {f['seconds']} s")
        print("  zones:", sorted(z for z in f["zones"] if z))
        print("  guardians reached:", sorted(f["shrines"]), "| benches", len(f["benches"]), "| feathers", len(f["feathers"]), "| relics", f["relics"])
        if n < 4:
            want = set(ORDER[: n + 1])
            if not want <= f["shrines"] | set(have):
                print(f"  FAIL: cannot reach the guardian who grants {ORDER[n]}")
                ok = False
            early = f["shrines"] - want
            if early:
                print(f"  FAIL: reaches {sorted(early)} too early")
                ok = False
            if f["won"]:
                print("  FAIL: the crown can be won early")
                ok = False
    last = results[4]
    miss_f = [x["id"] for x in world["feathers"] if x["id"] not in last["feathers"]]
    miss_r = [x["id"] for x in world["relics"] if x["id"] not in last["relics"]]
    miss_b = [x["id"] for x in world["benches"] if x["id"] not in last["benches"]]
    for name, miss, items in (("feathers", miss_f, world["feathers"]), ("relics", miss_r, world["relics"]), ("benches", miss_b, world["benches"])):
        if miss:
            ok = False
            print(f"FAIL: unreachable {name}:", [(i["id"], i["x"], i["z"]) for i in items if i["id"] in miss])
    if not last["won"]:
        ok = False
        print("FAIL: the crown cannot be won")
    out = os.path.join(HERE, "..", "build")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "reach.json"), "w") as fh:
        json.dump({str(n): {"cells": results[n]["cells"]} for n in range(5)}, fh)
    print("\nMAP OK" if ok else "\nMAP HAS PROBLEMS")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
