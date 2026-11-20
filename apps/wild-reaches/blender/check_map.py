"""Plays the map by search with the real rules, to prove the design:

  - with the moves an owl has at each stage, the next guardian can be reached;
  - without them it cannot (every gate really wants its move);
  - with every move, every feather, relic and bench can be reached, and the sunwell won.

The search is a graph of places the owl can rest (standing or afloat, to the metre),
joined by short runs of held input played through the real sim: walk a metre, jump and steer,
jump and flap at the top, jump and dash, dash off a ledge, drop through a ledge, climb a shaft by
wall kicks, swim, breach. Timed things are taken kindly (always on); moths and swings are left out;
anything that hurts is a dead end. It also measures the world: how many screens the owl can reach.

Run: python check_map.py [--world night-tree]      (uses every core; writes build/reach.json)
"""
import collections
import json
import math
import multiprocessing
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from wr.sim.sim import Sim, load_tuning  # noqa: E402

ORDER = ["flap", "dash", "kick", "dive", "glide"]
SCREEN = (24.0, 13.5)    # what the camera shows at its usual distance, in metres


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


def load_world(name):
    if name == "night-tree":
        sys.path.insert(0, os.path.join(HERE, "..", "..", "night-tree", "blender"))
        from nt.world import build_world as nt_build  # noqa: E402
        w = nt_build()
        w.setdefault("waters", [])
        return w, ["flap", "dash", "glide", "kick"]
    from wr.world import build_world
    return build_world(), ORDER


def macros(have):
    """Each is a list of (ticks, keys) segments; the last is held until the owl comes to rest."""
    out = []
    J = {"jump": True}
    for d in (-1, 1):
        lr = {"left": d < 0, "right": d > 0}
        out.append(("walk", [(12, lr)]))
        out.append(("jump", [(400, {**lr, **J})]))
        out.append(("hop", [(8, {**lr, **J}), (400, lr)]))
        out.append(("short", [(4, {**lr, **J}), (40, {}), (400, lr)]))     # a small hop, then steer
        out.append(("back", [(30, {**lr, **J}), (400, {"left": d > 0, "right": d < 0})]))
        if "flap" in have:
            out.append(("flap", [(40, {**lr, **J}), (2, lr), (400, {**lr, **J})]))
            out.append(("flapfall", [(40, {**lr, **J}), (2, lr), (25, {**lr, **J}), (400, lr)]))
        if "dash" in have:
            out.append(("dash", [(16, {**lr, **J}), (3, {**lr, **J, "dash": True}), (400, {**lr, **J})]))
            out.append(("dashlow", [(6, {**lr, **J}), (3, {**lr, "dash": True}), (400, lr)]))
            out.append(("rundash", [(3, {**lr, "dash": True}), (400, lr)]))
            if "flap" in have:
                out.append(("flapdash", [(40, {**lr, **J}), (2, lr), (20, {**lr, **J}), (3, {**lr, **J, "dash": True}), (400, {**lr, **J})]))
                out.append(("dashflap", [(16, {**lr, **J}), (3, {**lr, **J, "dash": True}), (6, lr), (400, {**lr, **J})]))
        if "glide" in have:
            out.append(("glide", [(400, {**lr, **J})]))
            out.append(("dropglide", [(40, lr), (400, {**lr, **J})]))
        if "kick" in have:
            out.append(("climb", "climb", d))
    out.append(("drop", [(4, {"down": True, "jump": True}), (400, {})]))
    out.append(("up", [(400, J)]))
    if "flap" in have:
        out.append(("upflap", [(40, J), (2, {}), (400, J)]))
    return out


def swim_macros(have):
    out = []
    for d in (-1, 0, 1):
        lr = {"left": d < 0, "right": d > 0}
        out.append(("breach", [(3, {**lr, "jump": True}), (400, {**lr, "jump": True})]))
        if d:
            out.append(("paddle", [(18, lr)]))
        if "dive" in have:
            out.append(("down", [(20, {**lr, "down": True})]))
            out.append(("swimup", [(20, {**lr, "up": True})]))
    return out


def rest_key(p):
    if p["wet"]:
        return ("w", round(p["x"]), round(p["z"]))
    return ("g" if p["ground"] else "c", round(p["x"]), round(p["z"] * 2) / 2)


NOKEYS = {"left": False, "right": False, "up": False, "down": False, "jump": False, "dash": False}


def _step(c, keys):
    inp = dict(NOKEYS)
    inp.update(keys)
    if c.p["clinging"]:   # an owl that only meant to fall past a wall lets go of it (climbs have their own move)
        inp["left"] = inp["right"] = False
    c.step(inp)
    ev = c.events
    return not (ev and ("hurt" in ev or "faint" in ev))


def play(c, segs, limit=480):
    """Plays the segments in turn, the last held until the owl comes to rest after leaving the
    ground (standing, or afloat and still). Returns 'rest', 'hurt' or 'lost'."""
    t = 0
    left = False
    for i, (n, keys) in enumerate(segs):
        last = i == len(segs) - 1
        for _ in range(n):
            if not _step(c, keys):
                return "hurt"
            t += 1
            p = c.p
            if not p["ground"]:
                left = True
            if left and t > 2:
                if p["ground"]:
                    return "rest"
                if p["wet"] and abs(p["vz"]) < 1.5:
                    return "rest"
            if t > limit:
                return "lost"
        if last and not left:
            return "rest" if c.p["ground"] else "lost"
    return "lost"


def timed(c, segs, limit=480, let_go=False):
    """Plays the segments for exactly their length (a walk of a metre, a stroke). If the owl is not
    at rest at the end, it keeps the last keys (a walk off a ledge) or lets go (a stroke, which
    then drifts to a stop), until it comes to rest."""
    t = 0
    for n, keys in segs:
        for _ in range(n):
            if not _step(c, keys):
                return "hurt"
            t += 1
    keys = {} if let_go else segs[-1][1]
    while t < limit:
        p = c.p
        if p["ground"] or (p["wet"] and abs(p["vz"]) < 1.5):
            return "rest"
        if not _step(c, keys):
            return "hurt"
        t += 1
    return "lost"


def climb(c, d, limit=360):
    """Up a shaft by kicks: jump toward the wall, and kick off each wall as it is touched."""
    face = d
    for t in range(limit):
        p = c.p
        press = p["wall"] != 0 and t % 6 == 0
        if p["wall"] != 0:
            face = -p["wall"]
        inp = {"left": face < 0 if t > 3 else d < 0, "right": face > 0 if t > 3 else d > 0, "up": False, "down": False,
               "jump": t < 3 or press or (p["vz"] > 0 and t % 6 != 0), "dash": False}
        if p["wall"] != 0 and not press:
            inp["left"] = p["wall"] < 0
            inp["right"] = p["wall"] > 0
        c.step(inp)
        ev = c.events
        if ev and ("hurt" in ev or "faint" in ev):
            return "hurt"
        if t > 10 and c.p["ground"] and abs(c.p["vx"]) < 0.01:
            return "rest"
    return "lost"


def explore(world, have):
    w = dict(world)
    shrines = w["shrines"]
    w["shrines"] = []
    w["moths"] = []
    w["swings"] = []
    T = load_tuning()
    root = Kind(w, T, have)
    root.got = {}
    for _ in range(60):
        root.step({"left": False, "right": False, "up": False, "down": False, "jump": False, "dash": False})
    found = {"shrines": set(), "benches": set(), "zones": set(), "won": False}
    seen = {rest_key(root.p): True}
    todo = collections.deque([root])
    mac = macros(have)
    smac = swim_macros(have)
    while todo:
        s = todo.popleft()   # breadth first, so a place is first met by its shortest way
        for m in (smac if s.p["wet"] else mac):
            c = s.clone()
            c.p["vx"] = 0.0
            if m[1] == "climb":
                res = climb(c, m[2])
            elif m[0] == "walk":
                res = timed(c, m[1])
            elif m[0] in ("paddle", "down", "swimup"):
                res = timed(c, m[1], let_go=True)
            else:
                res = play(c, m[1])
            if res != "rest":
                continue
            if c.p["ground"]:
                # settle: a rest is a rest once the dash has recharged and a kick's lock has passed
                for _ in range(24):
                    _step(c, NOKEYS)
            p = c.p
            for sh in shrines:
                if abs(sh["x"] - p["x"]) < 1.6 and abs(sh["z"] - p["z"]) < 2.5:
                    found["shrines"].add(sh["grants"])
            if c.won:
                found["won"] = True
            if p["bench"]:
                found["benches"].add(p["bench"])
            k = rest_key(p)
            if k in seen:
                continue
            seen[k] = True
            found["zones"].add(p["zone"])
            c.won = False
            c.p["bench"] = ""
            todo.append(c)
    found["feathers"] = sorted(k for k in root.got if k.startswith("feather"))
    found["relics"] = sorted(k for k in root.got if not k.startswith("feather"))
    found["stand"] = sorted({(k[1], int(math.floor(k[2]))) for k in seen})
    return found


def stage(args):
    name, n = args
    world, order = load_world(name)
    t = time.time()
    f = explore(world, order[:n])
    f["seconds"] = round(time.time() - t)
    return n, f


def screens(stand):
    return len({(math.floor(x / SCREEN[0]), math.floor(z / SCREEN[1])) for x, z in stand})


def main():
    name = sys.argv[sys.argv.index("--world") + 1] if "--world" in sys.argv else "wild-reaches"
    world, order = load_world(name)
    stages = list(range(len(order) + 1))
    if "--final" in sys.argv:
        stages = [len(order)]
    if "--stages" in sys.argv:
        stages = [int(k) for k in sys.argv[sys.argv.index("--stages") + 1].split(",")]
    results = {}
    with multiprocessing.Pool(min(len(stages), os.cpu_count() or 1)) as pool:
        for n, f in pool.imap_unordered(stage, [(name, n) for n in stages]):
            results[n] = f
            print(f"stage {n} ({order[:n] or 'no moves'}): {len(f['stand'])} places, {screens(f['stand'])} screens, "
                  f"{f['seconds']} s, guardians {sorted(f['shrines'])}", flush=True)
    ok = True
    for n in stages:
        f = results[n]
        if n < len(order):
            if order[n] not in f["shrines"]:
                print(f"FAIL stage {n}: cannot reach the guardian who grants {order[n]}")
                ok = False
            early = f["shrines"] - set(order[: n + 1])
            if early:
                print(f"FAIL stage {n}: reaches {sorted(early)} too early")
                ok = False
            if f["won"]:
                print(f"FAIL stage {n}: the sunwell can be won early")
                ok = False
    last = results[stages[-1]]
    for kind in ("feathers", "relics", "benches"):
        have = set(last[kind])
        miss = [(i["id"], i["x"], i["z"]) for i in world[kind] if i["id"] not in have]
        print(f"{kind}: {len(world[kind]) - len(miss)}/{len(world[kind])} reachable")
        if miss:
            ok = False
            print(f"FAIL unreachable {kind}:", miss[:40])
    if not last["won"]:
        ok = False
        print("FAIL: the sunwell cannot be won")
    zones = {z["name"] for z in world["zones"]}
    print("zones reached:", len(last["zones"] & zones), "/", len(zones), sorted(zones - last["zones"]))
    first = {}
    for n in sorted(results):
        for xz in results[n]["stand"]:
            first.setdefault(tuple(xz), n)
    out = os.path.join(HERE, "..", "build")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, f"reach-{name}.json"), "w") as fh:
        json.dump({"stand": [[x, z, k] for (x, z), k in first.items()], "screens": screens(last["stand"])}, fh)
    print(f"\nSIZE: {screens(last['stand'])} screens the owl can stand in ({len(last['stand'])} metre places)")
    print("\nMAP OK" if ok else "\nMAP HAS PROBLEMS")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
