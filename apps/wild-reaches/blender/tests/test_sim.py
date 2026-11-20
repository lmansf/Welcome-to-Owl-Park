"""The owl's moves, measured on small made-up worlds. Run: python -m unittest discover -s tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from wr.sim.sim import Sim, empty_world, load_tuning, no_input  # noqa: E402

T = load_tuning()


def world(**kw):
    w = empty_world()
    w["solids"].append({"x0": -50, "z0": -2, "x1": 50, "z1": 0})
    for k, v in kw.items():
        w[k] = v
    return w


def run(sim, seconds, **held):
    inp = no_input()
    inp.update(held)
    peak = sim.p["z"]
    for _ in range(round(seconds / sim.dt)):
        sim.step(inp)
        peak = max(peak, sim.p["z"])
    return peak


def tap(sim, key, hold=0.05):
    run(sim, hold, **{key: True})


class Moves(unittest.TestCase):
    def settle(self, w, abilities=()):
        s = Sim(w, T, abilities)
        run(s, 0.2)
        self.assertTrue(s.p["ground"])
        return s

    def test_run_speed(self):
        s = self.settle(world())
        run(s, 1.0, right=True)
        self.assertAlmostEqual(s.p["vx"], T["run"]["speed"])
        self.assertGreater(s.p["x"], 7.0)

    def test_jump_height_and_cut(self):
        s = self.settle(world())
        full = run(s, 1.0, jump=True)
        self.assertAlmostEqual(full, 21 * 21 / (2 * 58), delta=0.15)
        s = self.settle(world())
        tap(s, "jump", 0.04)
        short = run(s, 1.0)
        self.assertLess(short, full * 0.5)

    def test_flap_needs_the_ability(self):
        for have, more in (((), False), (("flap",), True)):
            s = self.settle(world(), have)
            run(s, 0.36, jump=True)
            run(s, 0.03)
            peak = run(s, 0.6, jump=True)
            self.assertEqual(peak > 5.5, more)

    def test_coyote_and_buffer(self):
        w = world()
        w["solids"] = [{"x0": -50, "z0": -2, "x1": 0, "z1": 0}, {"x0": -50, "z0": -30, "x1": 50, "z1": -20}]
        s = Sim(w, T)
        s.p["x"] = -0.3
        run(s, 0.2)
        run(s, 0.16, right=True)  # walks off the edge
        self.assertFalse(s.p["ground"])
        peak = run(s, 0.3, jump=True, right=True)
        self.assertGreater(peak, 2.0)

    def test_glide_falls_slowly_and_rides_updrafts(self):
        w = world()
        w["updrafts"] = [{"x0": 10, "z0": 0, "x1": 14, "z1": 30, "on": 1, "off": 0, "phase": 0, "lift": 9}]
        s = self.settle(w, ("glide",))
        s.p["z"] = 20
        run(s, 1.0, jump=True)
        self.assertAlmostEqual(s.p["vz"], -T["glide"]["fall"])
        s.p["x"] = 12
        run(s, 1.0, jump=True)
        self.assertAlmostEqual(s.p["vz"], 9)

    def test_dash_distance(self):
        s = self.settle(world(), ("dash",))
        x0 = s.p["x"]
        tap(s, "dash")
        run(s, 0.3)
        self.assertGreater(s.p["x"] - x0, 3.8)
        self.assertLess(s.p["x"] - x0, 6.0)

    def test_wall_kick_climbs_a_shaft(self):
        w = world()
        w["solids"] += [{"x0": -3, "z0": 0, "x1": -2, "z1": 40}, {"x0": 2, "z0": 0, "x1": 3, "z1": 40}]
        for have, climbs in (((), False), (("kick",), True)):
            s = self.settle(w, have)
            side = 1
            held = True
            for i in range(round(6 / s.dt)):
                inp = no_input()
                inp["right" if side > 0 else "left"] = True
                if s.p["wall"] == side and not s.p["ground"]:
                    held = not held  # let go for a tick, then press: that is the kick
                else:
                    held = True
                inp["jump"] = held
                s.step(inp)
                if "kick" in s.events:
                    side = -side
            self.assertEqual(s.p["z"] > 15, climbs)

    def test_oneway_and_drop(self):
        w = world()
        w["oneways"] = [{"x0": -3, "x1": 3, "z": 3}]
        s = self.settle(w)
        run(s, 1.2, jump=True)
        run(s, 0.3)
        self.assertAlmostEqual(s.p["z"], 3)
        run(s, 0.05, down=True, jump=True)
        run(s, 0.6, down=True)
        self.assertAlmostEqual(s.p["z"], 0)

    def test_thorns_hurt_and_send_back_and_pogo_bounces(self):
        w = world()
        w["hazards"] = [{"x0": 4, "z0": 0, "x1": 8, "z1": 0.5}]
        s = self.settle(w)
        run(s, 0.55, right=True)
        self.assertEqual(s.p["panes"], T["panes"] - 1)
        self.assertLess(s.p["x"], 3.0)
        s = self.settle(w)
        s.p["x"], s.p["z"] = 6, 4
        peak = 0
        run(s, 0.1, down=True)
        peak = run(s, 0.8, down=True)
        self.assertEqual(s.p["panes"], T["panes"])
        self.assertGreater(peak, 2.5)

    def test_bench_then_fainting_returns_to_it(self):
        w = world()
        w["benches"] = [{"id": "b1", "x": -3, "z": 0}]
        w["hazards"] = [{"x0": 8, "z0": 0, "x1": 9, "z1": 0.5}]
        s = self.settle(w)
        run(s, 0.5, left=True)
        self.assertEqual(s.p["bench"], "b1")
        run(s, 1.0, right=True)
        for _ in range(T["panes"]):
            s.p["invuln"] = 0
            s.p["x"] = 8.5
            run(s, 0.05)
        self.assertEqual(s.p["panes"], T["panes"])
        self.assertAlmostEqual(s.p["x"], -3)

    def test_frail_glass_circuits_and_bridges(self):
        w = world()
        w["frail"] = [{"id": "f1", "x0": -1, "x1": 1, "z": 3}]
        s = self.settle(w)
        s.p["z"] = 3.5
        run(s, 0.3)
        self.assertAlmostEqual(s.p["z"], 3)
        run(s, 0.6)
        self.assertLess(s.p["z"], 3)
        run(s, 4.0)
        self.assertTrue(s.frail_on(w["frail"][0]))
        w = world()
        w["circuits"] = [{"id": "c1", "x0": -1, "x1": 1, "z": 3, "group": 0, "period": 2}, {"id": "c2", "x0": -1, "x1": 1, "z": 3, "group": 1, "period": 2}]
        s = Sim(w, T)
        self.assertTrue(s.circuit_on(w["circuits"][0]) != s.circuit_on(w["circuits"][1]))
        w = world()
        w["bridges"] = [{"id": "br", "x": 0, "z": 0, "life": 3, "segs": [{"x0": 2, "x1": 6, "z": 0.5}]}]
        s = self.settle(w)
        self.assertTrue(s.bridge_on(w["bridges"][0]))
        run(s, 0.2, right=True)
        run(s, 3.5, right=True)
        self.assertFalse(s.bridge_on(w["bridges"][0]))

    def test_door_opens_from_its_side_only(self):
        w = world()
        w["doors"] = [{"id": "d", "x0": 4, "z0": 0, "x1": 5, "z1": 3, "side": 1}]
        s = self.settle(w)
        run(s, 1.0, right=True)
        self.assertLess(s.p["x"], 4)
        s.p["x"] = 8
        run(s, 1.5, left=True)
        self.assertLess(s.p["x"], 4)

    def test_camera_leads_and_holds_height_through_a_jump(self):
        s = self.settle(world())
        run(s, 2.0, right=True)
        self.assertGreater(s.cam["x"], s.p["x"] + 1.0)
        z0 = s.cam["z"]
        run(s, 0.25, right=True, jump=True)
        self.assertLess(abs(s.cam["z"] - z0), 0.8)

    def test_shrine_feather_and_crown(self):
        w = world()
        w["shrines"] = [{"id": "s", "x": 2, "z": 0, "grants": "flap"}]
        w["feathers"] = [{"id": "f", "x": 4, "z": 0.5}]
        w["relics"] = [{"id": f"b{i}", "kind": "bell", "x": 5 + i, "z": 0.5} for i in range(3)]
        w["crown"] = {"x": 10, "z": 0, "bells": 3}
        s = self.settle(w)
        run(s, 1.6, right=True)
        self.assertTrue(s.have["flap"] and "f" in s.got and s.won)


if __name__ == "__main__":
    unittest.main()


class Water(unittest.TestCase):
    """A pool 8 m deep with its top at z = 0, the floor at z = -8."""

    def pool(self, abilities=()):
        w = empty_world()
        w["solids"] += [{"x0": -50, "z0": -10, "x1": 50, "z1": -8}, {"x0": -50, "z0": -8, "x1": -10, "z1": 0}, {"x0": 10, "z0": -8, "x1": 50, "z1": 0}]
        w["waters"].append({"x0": -10, "z0": -8, "x1": 10, "z1": 0})
        w["spawn"] = {"x": 0.0, "z": 3.0}
        return Sim(w, T, abilities)

    def test_without_dive_the_owl_floats(self):
        s = self.pool()
        run(s, 3.0, down=True)
        self.assertGreater(s.p["z"], -1.2)   # never far below the top
        self.assertLess(s.p["z"], 0.5)

    def test_diver_reaches_the_floor_and_back(self):
        s = self.pool(("dive",))
        run(s, 3.0, down=True)
        self.assertLess(s.p["z"], -7.0)
        run(s, 2.5, up=True)
        self.assertGreater(s.p["z"], -1.0)

    def test_breach_jumps_out_onto_the_bank(self):
        s = self.pool()
        run(s, 2.0)
        peak = run(s, 0.6, jump=True, right=True)
        self.assertGreater(peak, 1.0)

    def test_swim_is_slower_than_running(self):
        s = self.pool(("dive",))
        run(s, 2.0, down=True)
        x0 = s.p["x"]
        run(s, 1.0, right=True)
        self.assertLess(s.p["x"] - x0, T["swim"]["speed"] * 1.05)

    def test_diver_swims_down_through_a_ledge(self):
        s = self.pool(("dive",))
        s.w["oneways"].append({"x0": -10, "x1": 10, "z": -4})
        s._index()
        run(s, 3.0, down=True)
        self.assertLess(s.p["z"], -7.0)


class Slopes(unittest.TestCase):
    def test_walks_up_a_stair_of_one_metre_steps(self):
        w = world(solids=[{"x0": -50, "z0": -2, "x1": 50, "z1": 0}] + [{"x0": 2 + 2 * k, "z0": 0, "x1": 50, "z1": k + 1} for k in range(5)])
        s = Sim(w, T)
        run(s, 3.0, right=True)
        self.assertEqual(s.p["z"], 5)
        self.assertGreater(s.p["x"], 12)

    def test_a_two_metre_step_is_a_wall(self):
        w = world(solids=[{"x0": -50, "z0": -2, "x1": 50, "z1": 0}, {"x0": 2, "z0": 0, "x1": 50, "z1": 2}])
        s = Sim(w, T)
        run(s, 1.0, right=True)
        self.assertEqual(s.p["z"], 0)
        self.assertLess(s.p["x"], 2)
