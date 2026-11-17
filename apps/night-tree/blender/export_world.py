"""Writes the rules and placements the game loads (game/world/world.json), a copy of the tuning,
and a recorded run the Godot port must reproduce (game/tests/parity.json). No Blender needed.

Run: python export_world.py
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from nt.sim.sim import ABILITIES, Sim, load_tuning  # noqa: E402
from nt.world import build_world  # noqa: E402

game = os.path.join(HERE, "..", "game")
world = build_world()
T = load_tuning()
with open(os.path.join(game, "world", "world.json"), "w") as f:
    json.dump(world, f, separators=(",", ":"))
with open(os.path.join(game, "world", "tuning.json"), "w") as f:
    json.dump(T, f, indent=1)

# a recorded run: random held inputs from several starting points, with every move
rng = random.Random(7)
runs = []
starts = [(world["spawn"]["x"], world["spawn"]["z"])] + [(b["x"], b["z"]) for b in world["benches"]]
for sx, sz in starts:
    s = Sim(world, T, ABILITIES)
    s.p["x"], s.p["z"] = sx, sz + 0.5
    segs = []
    snaps = []
    for _ in range(60):
        n = rng.randint(4, 50)
        keys = {k: rng.random() < pr for k, pr in (("left", 0.3), ("right", 0.45), ("down", 0.12), ("jump", 0.5), ("dash", 0.15))}
        keys["up"] = False
        segs.append([n] + [1 if keys[k] else 0 for k in ("left", "right", "down", "jump", "dash")])
        for _ in range(n):
            s.step(keys)
        snaps.append(s.snapshot() + [sorted(s.got)[:3], len(s.got)])
    runs.append({"x": sx, "z": sz + 0.5, "segs": segs, "snaps": snaps})
with open(os.path.join(game, "tests", "parity.json"), "w") as f:
    json.dump(runs, f, separators=(",", ":"))
print(f"world.json: {os.path.getsize(os.path.join(game, 'world', 'world.json')) // 1024} KB; parity runs: {len(runs)}")
