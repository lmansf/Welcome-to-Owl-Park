"""The game's rules: the owl's movement, the world's moving parts and the camera.

Pure Python with no Blender in it, so it runs in tests and inside Blender alike. The browser port
(src/sim.ts) is this file line for line; tests/parity keeps the two in step.

Coordinates: x right, z up, metres. The owl's position is the middle of its feet.
A world is the plain dict that the map builder writes as world.json.
"""
import json
import math
import os

ABILITIES = ("flap", "dash", "glide", "kick", "dive")
GRID = 8.0
EPS = 1e-6


def load_tuning():
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "..", "..", "..", "shared", "tuning.json")) as f:
        return json.load(f)


def approach(v, target, step):
    if v < target:
        return min(v + step, target)
    return max(v - step, target)


def no_input():
    return {"left": False, "right": False, "up": False, "down": False, "jump": False, "dash": False}


class Sim:
    def __init__(self, world, tuning, abilities=()):
        self.w = world
        self.T = tuning
        self.hz = tuning["hz"]
        self.dt = 1.0 / self.hz
        self.tick = 0
        self.events = []
        self.have = {a: (a in abilities) for a in ABILITIES}
        self.got = {}  # ids of feathers and relics picked up
        self.open = {}  # ids of doors opened
        self.frail = {}  # id -> tick it breaks at
        self.painted = {}  # bridge id -> tick the paint fades at
        self.won = False
        sp = world["spawn"]
        self.p = {
            "x": sp["x"], "z": sp["z"], "vx": 0.0, "vz": 0.0, "face": 1, "ground": False,
            "coyote": 0.0, "buffer": 0.0, "flaps": 0, "dashT": 0.0, "dashCd": 0.0, "dashDir": 1, "dashReady": True,
            "wall": 0, "wallT": 0.0, "wallSide": 0, "lockT": 0.0, "dropT": 0.0, "cutOK": False,
            "gliding": False, "clinging": False, "panes": tuning["panes"], "invuln": 0.0,
            "safeX": sp["x"], "safeZ": sp["z"], "benchX": sp["x"], "benchZ": sp["z"], "bench": "",
            "prevJump": False, "prevDash": False, "on": "", "zone": "", "wet": False, "surf": 0.0,
        }
        cam = tuning["camera"]
        self.cam = {"x": sp["x"], "z": sp["z"] + cam["rise"], "dist": cam["distance"], "look": 0.0, "baseZ": sp["z"]}
        self.lkey = None
        self.loc = {}
        self._index()

    # ---- the static world, bucketed so a step only looks nearby ------------------------------------

    def _index(self):
        self.grid_s = {}
        self.grid_o = {}
        for i, s in enumerate(self.w["solids"]):
            self._bucket(self.grid_s, i, s["x0"], s["z0"], s["x1"], s["z1"])
        for i, o in enumerate(self.w["oneways"]):
            self._bucket(self.grid_o, i, o["x0"], o["z"] - 0.5, o["x1"], o["z"])

    def _bucket(self, grid, i, x0, z0, x1, z1):
        for gx in range(math.floor(x0 / GRID), math.floor(x1 / GRID) + 1):
            for gz in range(math.floor(z0 / GRID), math.floor(z1 / GRID) + 1):
                k = gx * 100003 + gz
                if k not in grid:
                    grid[k] = []
                grid[k].append(i)

    def _bounds(self, kind, o):
        if kind in ("hazards", "updrafts", "winds", "doors", "waters"):
            return (o["x0"], o["z0"], o["x1"], o["z1"])
        if kind in ("frail", "circuits"):
            return (o["x0"], o["z"], o["x1"], o["z"])
        if kind == "bridges":
            x0 = x1 = o["x"]
            z0 = z1 = o["z"]
            for sg in o["segs"]:
                x0 = min(x0, sg["x0"])
                x1 = max(x1, sg["x1"])
                z0 = min(z0, sg["z"])
                z1 = max(z1, sg["z"])
            return (x0, z0, x1, z1)
        if kind == "moths":
            return (o["x"] - abs(o["ax"]), o["z"] - abs(o["az"]), o["x"] + abs(o["ax"]), o["z"] + abs(o["az"]))
        if kind == "swings":
            return (o["x"] - o["len"], o["z"] - o["len"], o["x"] + o["len"], o["z"])
        return (o["x"], o["z"], o["x"], o["z"])

    LOCAL = ("hazards", "updrafts", "winds", "doors", "waters", "frail", "circuits", "bridges", "moths", "swings", "feathers", "relics", "shrines", "benches")

    def _local(self):
        """What lies within reach of the owl's 16 m neighbourhood; rebuilt only when it changes cell."""
        cx = math.floor(self.p["x"] / 16)
        cz = math.floor(self.p["z"] / 16)
        key = cx * 100003 + cz
        if key != self.lkey:
            self.lkey = key
            x0 = cx * 16 - 5
            x1 = cx * 16 + 21
            z0 = cz * 16 - 5
            z1 = cz * 16 + 21
            self.loc = {}
            for kind in self.LOCAL:
                out = []
                for o in self.w[kind]:
                    b = self._bounds(kind, o)
                    if b[2] >= x0 and b[0] <= x1 and b[3] >= z0 and b[1] <= z1:
                        out.append(o)
                self.loc[kind] = out
        return self.loc

    def _near(self, grid, x, z):
        """Indices in the four buckets round a point (the owl is far smaller than a bucket)."""
        out = []
        gx0 = math.floor((x - 2) / GRID)
        gx1 = math.floor((x + 2) / GRID)
        gz0 = math.floor((z - 2) / GRID)
        gz1 = math.floor((z + 3) / GRID)
        for gx in range(gx0, gx1 + 1):
            for gz in range(gz0, gz1 + 1):
                b = grid.get(gx * 100003 + gz)
                if b:
                    for i in b:
                        if i not in out:
                            out.append(i)
        return out

    # ---- the moving parts -----------------------------------------------------------------------

    def time(self):
        return self.tick * self.dt

    def circuit_on(self, c):
        return (self.tick // round(c["period"] * self.hz)) % 2 == c["group"]  # counted in ticks, so it is exact

    def frail_on(self, f):
        at = self.frail.get(f["id"])
        if at is None:
            return True
        back = at + round(self.T["frail"]["respawn"] * self.hz)
        if self.tick >= back:
            del self.frail[f["id"]]
            return True
        return self.tick < at

    def bridge_on(self, b):
        return self.tick < self.painted.get(b["id"], 0)

    def updraft_on(self, u):
        if u["off"] <= 0:
            return True
        return (self.tick + round(u["phase"] * self.hz)) % round((u["on"] + u["off"]) * self.hz) < round(u["on"] * self.hz)

    def moth_at(self, m):
        a = 2 * math.pi * self.time() / m["period"] + m["phase"]
        return (m["x"] + m["ax"] * math.sin(a), m["z"] + m["az"] * math.sin(a))

    def swing_at(self, s):
        a = s["amp"] * math.sin(2 * math.pi * self.time() / s["period"] + s["phase"])
        return (s["x"] + s["len"] * math.sin(a), s["z"] - s["len"] * math.cos(a))

    def door_solid(self, d):
        return d["id"] not in self.open

    def live_oneways(self):
        """The platforms that come and go, as (kind, id, x0, x1, z) for those there now."""
        out = []
        L = self._local()
        for f in L["frail"]:
            if self.frail_on(f):
                out.append(("frail", f["id"], f["x0"], f["x1"], f["z"]))
        for c in L["circuits"]:
            if self.circuit_on(c):
                out.append(("circuit", c["id"], c["x0"], c["x1"], c["z"]))
        for b in L["bridges"]:
            if self.bridge_on(b):
                for s in b["segs"]:
                    out.append(("bridge", b["id"], s["x0"], s["x1"], s["z"]))
        return out

    # ---- collision ------------------------------------------------------------------------------

    def _hits_solid(self, x, z):
        """The first solid the owl's box overlaps at (x, z), or None."""
        hw = self.T["owl"]["halfWidth"]
        h = self.T["owl"]["height"]
        for i in self._near(self.grid_s, x, z):
            s = self.w["solids"][i]
            if x + hw > s["x0"] + EPS and x - hw < s["x1"] - EPS and z + h > s["z0"] + EPS and z < s["z1"] - EPS:
                return s
        for d in self._local()["doors"]:
            if self.door_solid(d) and x + hw > d["x0"] + EPS and x - hw < d["x1"] - EPS and z + h > d["z0"] + EPS and z < d["z1"] - EPS:
                return d
        return None

    def _box_hit(self, x, z, x0, z0, x1, z1):
        hw = self.T["owl"]["halfWidth"]
        h = self.T["owl"]["height"]
        return x + hw > x0 and x - hw < x1 and z + h > z0 and z < z1

    # ---- one step -------------------------------------------------------------------------------

    def step(self, inp):
        T = self.T
        dt = self.dt
        p = self.p
        self.events = []
        self.tick += 1
        hw = T["owl"]["halfWidth"]
        press_jump = inp["jump"] and not p["prevJump"]
        press_dash = inp["dash"] and not p["prevDash"]
        p["prevJump"] = inp["jump"]
        p["prevDash"] = inp["dash"]

        if p["ground"]:
            p["coyote"] = T["jump"]["coyote"]
        else:
            p["coyote"] -= dt
        if press_jump:
            p["buffer"] = T["jump"]["buffer"]
        else:
            p["buffer"] -= dt
        if p["invuln"] > 0:
            p["invuln"] -= dt
        if p["dropT"] > 0:
            p["dropT"] -= dt
        if p["dashCd"] > 0:
            p["dashCd"] -= dt
        if p["wall"] != 0:
            p["wallT"] = T["kick"]["grace"]
            p["wallSide"] = p["wall"]
        else:
            p["wallT"] -= dt

        ax = (1 if inp["right"] else 0) - (1 if inp["left"] else 0)
        if p["lockT"] > 0:
            p["lockT"] -= dt
        else:
            if ax != 0:
                p["vx"] = approach(p["vx"], ax * T["run"]["speed"], (T["run"]["groundAccel"] if p["ground"] else T["run"]["airAccel"]) * dt)
                p["face"] = ax
            else:
                p["vx"] = approach(p["vx"], 0.0, (T["run"]["friction"] if p["ground"] else T["run"]["airDrag"]) * dt)

        if press_dash and self.have["dash"] and p["dashT"] <= 0 and p["dashCd"] <= 0 and p["dashReady"]:
            p["dashT"] = T["dash"]["time"]
            p["dashDir"] = ax if ax != 0 else p["face"]
            p["face"] = p["dashDir"]
            p["dashReady"] = False
            p["lockT"] = 0.0
            self.events.append("dash")

        p["gliding"] = False
        p["clinging"] = False
        p["wet"] = False
        mid = p["z"] + T["owl"]["height"] * 0.5
        for wt in self._local()["waters"]:
            if p["x"] >= wt["x0"] and p["x"] < wt["x1"] and mid >= wt["z0"] and mid < wt["z1"]:
                p["wet"] = True
                p["surf"] = wt["z1"]
                break
        if p["dashT"] > 0:
            p["dashT"] -= dt
            p["vx"] = p["dashDir"] * T["dash"]["speed"]
            p["vz"] = 0.0
            if p["dashT"] <= 0:
                p["vx"] = p["dashDir"] * T["run"]["speed"]
                p["dashCd"] = T["dash"]["cooldown"]
        elif p["wet"]:
            # in water: a diver swims every way; without the dive the owl only bobs at the top
            S = T["swim"]
            p["flaps"] = 1
            p["dashReady"] = True
            p["cutOK"] = False
            p["coyote"] = T["jump"]["coyote"]
            p["vx"] = min(max(p["vx"], -S["speed"]), S["speed"])
            near_top = p["z"] + T["owl"]["height"] > p["surf"] - S["reach"]
            if p["buffer"] > 0 and near_top:
                p["vz"] = S["breach"]
                p["buffer"] = 0.0
                self.events.append("breach")
            elif self.have["dive"]:
                az = (1 if (inp["up"] or inp["jump"]) else 0) - (1 if inp["down"] else 0)
                p["vz"] = approach(p["vz"], az * S["speed"] if az != 0 else S["drift"], S["accel"] * dt)
            else:
                p["vz"] = approach(p["vz"], S["float"], S["damp"] * dt)
        else:
            if p["buffer"] > 0:
                if p["ground"] or p["coyote"] > 0:
                    if inp["down"] and p["on"] != "" and p["ground"]:
                        p["dropT"] = T["drop"]
                        p["ground"] = False
                        p["coyote"] = 0.0
                        self.events.append("drop")
                    else:
                        p["vz"] = T["jump"]["speed"]
                        p["ground"] = False
                        p["coyote"] = 0.0
                        p["cutOK"] = True
                        self.events.append("jump")
                    p["buffer"] = 0.0
                elif self.have["kick"] and p["wallT"] > 0:
                    p["vx"] = -p["wallSide"] * T["kick"]["x"]
                    p["vz"] = T["kick"]["z"]
                    p["face"] = -p["wallSide"]
                    p["lockT"] = T["kick"]["lock"]
                    p["wallT"] = 0.0
                    p["flaps"] = 1
                    p["dashReady"] = True
                    p["cutOK"] = True
                    p["buffer"] = 0.0
                    self.events.append("kick")
                elif self.have["flap"] and p["flaps"] > 0:
                    p["vz"] = T["flap"]["speed"]
                    p["flaps"] -= 1
                    p["cutOK"] = True
                    p["buffer"] = 0.0
                    self.events.append("flap")
            if p["vz"] <= 0:
                p["cutOK"] = False
            if p["cutOK"] and not inp["jump"] and p["vz"] > T["jump"]["cut"]:
                p["vz"] = T["jump"]["cut"]
                p["cutOK"] = False

            p["clinging"] = self.have["kick"] and not p["ground"] and p["wall"] != 0 and ax == p["wall"] and p["vz"] <= 0
            wants = self.have["glide"] and inp["jump"] and not p["ground"] and not p["clinging"]
            lift = 0.0
            if wants:
                for u in self._local()["updrafts"]:
                    if self.updraft_on(u) and self._box_hit(p["x"], p["z"], u["x0"], u["z0"], u["x1"], u["z1"]):
                        lift = max(lift, u["lift"])
            if lift > 0 and p["vz"] <= lift:
                p["gliding"] = True
                p["vz"] = min(p["vz"] + T["glide"]["liftAccel"] * dt, lift)
            else:
                p["gliding"] = wants and p["vz"] <= 0
                p["vz"] -= T["jump"]["gravity"] * dt
                if p["gliding"]:
                    p["vz"] = max(p["vz"], -T["glide"]["fall"])
                elif p["clinging"]:
                    p["vz"] = max(p["vz"], -T["kick"]["slide"])
                else:
                    p["vz"] = max(p["vz"], -T["jump"]["maxFall"])

        # sideways, then stop against walls
        push = 0.0
        if not p["ground"]:
            for wd in self._local()["winds"]:
                if self._box_hit(p["x"], p["z"], wd["x0"], wd["z0"], wd["x1"], wd["z1"]):
                    push += wd["push"] * (0.4 if p["gliding"] else 1.0) * (1.6 if p["gliding"] and wd["push"] * p["face"] > 0 else 1.0)
        nx = p["x"] + (p["vx"] + push) * dt
        s = self._hits_solid(nx, p["z"])
        if s is not None and p["ground"] and s["z1"] > p["z"] and s["z1"] - p["z"] <= T["step"] + EPS and self._hits_solid(nx, s["z1"]) is None:
            # a rise of up to a metre is walked up, the way a slope is
            p["z"] = s["z1"]
            s = None
        if s is not None:
            if nx > p["x"]:
                nx = s["x0"] - hw
            elif nx < p["x"]:
                nx = s["x1"] + hw
            else:
                nx = p["x"]
            if self._hits_solid(nx, p["z"]) is not None:
                nx = p["x"]
            p["vx"] = 0.0
            if p["dashT"] > 0:
                p["dashT"] = 0.0
                p["dashCd"] = T["dash"]["cooldown"]
        p["x"] = nx
        p["wall"] = 0
        if self._hits_solid(p["x"] + 0.06, p["z"]) is not None:
            p["wall"] = 1
        elif self._hits_solid(p["x"] - 0.06, p["z"]) is not None:
            p["wall"] = -1

        # up and down, then land or bump
        was_ground = p["ground"]
        feet = p["z"]
        nz = p["z"] + p["vz"] * dt
        p["ground"] = False
        p["on"] = ""
        s = self._hits_solid(p["x"], nz)
        if s is not None:
            if p["vz"] <= 0:
                nz = s["z1"]
                p["ground"] = True
            else:
                nz = s["z0"] - T["owl"]["height"]
            p["vz"] = 0.0
        if p["vz"] <= 0 and not p["ground"] and p["dropT"] <= 0 and not p["wet"]:  # ledges do not catch a swimmer
            best = None
            for i in self._near(self.grid_o, p["x"], p["z"]):
                o = self.w["oneways"][i]
                if p["x"] + hw > o["x0"] and p["x"] - hw < o["x1"] and feet >= o["z"] - EPS and nz <= o["z"]:
                    if best is None or o["z"] > best[1]:
                        best = ("plat", o["z"], "")
            for kind, oid, x0, x1, oz in self.live_oneways():
                if p["x"] + hw > x0 and p["x"] - hw < x1 and feet >= oz - EPS and nz <= oz:
                    if best is None or oz > best[1]:
                        best = (kind, oz, oid)
            if best is not None:
                nz = best[1]
                p["vz"] = 0.0
                p["ground"] = True
                p["on"] = best[0]
                if best[0] == "frail" and best[2] not in self.frail:
                    self.frail[best[2]] = self.tick + round(T["frail"]["delay"] * self.hz)
                    self.events.append("crack")
        p["z"] = nz
        if p["ground"]:
            p["flaps"] = 1
            if p["dashT"] <= 0:
                p["dashReady"] = True
            if not was_ground:
                self.events.append("land")
            if (p["on"] == "" or p["on"] == "plat") and p["invuln"] <= 0 and not self._near_hazard():
                p["safeX"] = p["x"]
                p["safeZ"] = p["z"]

        self._touch(inp)
        self._camera()

    # ---- what the owl touches -------------------------------------------------------------------

    def _touch(self, inp):
        T = self.T
        p = self.p
        w = self._local()
        world = self.w
        mid = p["z"] + T["owl"]["height"] / 2
        r = T["reach"]["pickup"]
        for f in w["feathers"]:
            if f["id"] not in self.got and abs(f["x"] - p["x"]) < r and abs(f["z"] - mid) < r:
                self.got[f["id"]] = True
                self.events.append("feather")
        for f in w["relics"]:
            if f["id"] not in self.got and abs(f["x"] - p["x"]) < r and abs(f["z"] - mid) < r:
                self.got[f["id"]] = True
                self.events.append("relic:" + f["kind"])
        for s in w["shrines"]:
            if not self.have[s["grants"]] and abs(s["x"] - p["x"]) < T["reach"]["shrine"] and abs(s["z"] - p["z"]) < 2.5:
                self.have[s["grants"]] = True
                self.events.append("grant:" + s["grants"])
        if p["ground"]:
            for b in w["benches"]:
                if abs(b["x"] - p["x"]) < T["reach"]["bench"] and abs(b["z"] - p["z"]) < 0.5:
                    if p["bench"] != b["id"] or p["panes"] < T["panes"]:
                        self.events.append("bench")
                    p["bench"] = b["id"]
                    p["benchX"] = b["x"]
                    p["benchZ"] = b["z"]
                    p["panes"] = T["panes"]
        for d in w["doors"]:
            if d["id"] not in self.open:
                x0 = d["x0"] - 0.7 if d["side"] < 0 else d["x1"]
                x1 = d["x0"] if d["side"] < 0 else d["x1"] + 0.7
                if self._box_hit(p["x"], p["z"], x0, d["z0"], x1, d["z1"]):
                    self.open[d["id"]] = True
                    self.events.append("door")
        for b in w["bridges"]:
            if self._box_hit(p["x"], p["z"], b["x"] - 0.5, b["z"], b["x"] + 0.5, b["z"] + 1.0):
                if not self.bridge_on(b):
                    self.events.append("paint")
                self.painted[b["id"]] = self.tick + round(b["life"] * self.hz)
        c = world["crown"]
        if not self.won and abs(c["x"] - p["x"]) < 1.5 and abs(c["z"] - p["z"]) < 2.5:
            bells = 0
            for f in world["relics"]:
                if f["kind"] == "bell" and f["id"] in self.got:
                    bells += 1
            if bells >= c["bells"]:
                self.won = True
                self.events.append("won")

        hurt = p["z"] < world["killZ"]
        pogo = False
        if p["invuln"] <= 0:
            can_pogo = inp["down"] and not p["ground"] and p["vz"] <= 0
            for h in w["hazards"]:
                if self._box_hit(p["x"], p["z"], h["x0"], h["z0"], h["x1"], h["z1"]):
                    if can_pogo and p["z"] > (h["z0"] + h["z1"]) / 2:
                        pogo = True
                    else:
                        hurt = True
            for m in w["moths"]:
                mx, mz = self.moth_at(m)
                if self._box_hit(p["x"], p["z"], mx - m["r"], mz - m["r"], mx + m["r"], mz + m["r"]):
                    if can_pogo and p["z"] > mz:
                        pogo = True
                    else:
                        hurt = True
            for sw in w["swings"]:
                sx, sz = self.swing_at(sw)
                if self._box_hit(p["x"], p["z"], sx - sw["r"], sz - sw["r"], sx + sw["r"], sz + sw["r"]):
                    if can_pogo and p["z"] > sz:
                        pogo = True
                    else:
                        hurt = True
        if hurt:
            self._hurt()
        elif pogo:
            p["vz"] = T["pogo"]["speed"]
            p["flaps"] = 1
            p["dashReady"] = True
            p["cutOK"] = False
            p["invuln"] = 0.12
            self.events.append("pogo")

        p["zone"] = ""
        for zn in world["zones"]:
            if p["x"] >= zn["x0"] and p["x"] < zn["x1"] and mid >= zn["z0"] and mid < zn["z1"]:
                p["zone"] = zn["name"]
                break

    def _near_hazard(self):
        """True within a metre and a half of thorns, so the owl is never sent back onto them."""
        p = self.p
        for h in self._local()["hazards"]:
            if p["x"] > h["x0"] - 1.5 and p["x"] < h["x1"] + 1.5 and p["z"] + 2 > h["z0"] and p["z"] - 2 < h["z1"]:
                return True
        return False

    def _hurt(self):
        p = self.p
        p["panes"] -= 1
        p["vx"] = 0.0
        p["vz"] = 0.0
        p["dashT"] = 0.0
        p["lockT"] = 0.0
        p["invuln"] = self.T["invuln"]
        if p["panes"] <= 0:
            p["panes"] = self.T["panes"]
            p["x"] = p["benchX"]
            p["z"] = p["benchZ"]
            self.lkey = None
            self.events.append("faint")
        else:
            p["x"] = p["safeX"]
            p["z"] = p["safeZ"]
            self.events.append("hurt")
        p["safeX"] = p["x"]
        p["safeZ"] = p["z"]

    # ---- the camera -----------------------------------------------------------------------------

    def _camera(self):
        C = self.T["camera"]
        dt = self.dt
        p = self.p
        c = self.cam
        # look ahead in the direction of travel, eased so a turn does not snap
        c["look"] += (p["face"] * C["lookAhead"] - c["look"]) * (1 - math.exp(-C["lookEase"] * dt))
        # hold height through a jump: the base only follows a landing, or the owl leaving a window
        if p["ground"] or p["clinging"]:
            c["baseZ"] = p["z"]
        elif p["z"] > c["baseZ"] + C["windowUp"]:
            c["baseZ"] = p["z"] - C["windowUp"]
        elif p["z"] < c["baseZ"] - C["windowDown"]:
            c["baseZ"] = p["z"] + C["windowDown"]
        tx = p["x"] + c["look"]
        tz = c["baseZ"] + C["rise"]
        dist = C["distance"]
        zone = None
        for zn in self.w["zones"]:
            if zn["name"] == p["zone"]:
                zone = zn
                break
        if zone is not None:
            dist = C["distance"] * zone["zoom"]
        c["dist"] += (dist - c["dist"]) * (1 - math.exp(-C["zoomEase"] * dt))
        if zone is not None and zone["lock"]:
            # keep the view inside the zone, where the zone is big enough to hold it
            half_h = c["dist"] * math.tan(math.radians(C["fov"]) / 2)
            half_w = half_h * 16 / 9
            if zone["x1"] - zone["x0"] > 2 * half_w:
                tx = min(max(tx, zone["x0"] + half_w), zone["x1"] - half_w)
            else:
                tx = (zone["x0"] + zone["x1"]) / 2
            if zone["z1"] - zone["z0"] > 2 * half_h:
                tz = min(max(tz, zone["z0"] + half_h), zone["z1"] - half_h)
            else:
                tz = (zone["z0"] + zone["z1"]) / 2
        kz = C["fallZ"] if p["vz"] < -12 else C["followZ"]
        c["x"] += (tx - c["x"]) * (1 - math.exp(-C["followX"] * dt))
        c["z"] += (tz - c["z"]) * (1 - math.exp(-kz * dt))

    def clone(self):
        """A copy that shares the world but not the owl: for the map checker's search."""
        s = object.__new__(type(self))
        s.__dict__.update(self.__dict__)
        s.p = dict(self.p)
        s.frail = dict(self.frail)
        s.painted = dict(self.painted)
        s.open = dict(self.open)
        s.events = []
        return s

    # ---- for tests, saves and the port's parity check ---------------------------------------------

    def snapshot(self):
        p = self.p
        c = self.cam
        return [round(p["x"], 6), round(p["z"], 6), round(p["vx"], 6), round(p["vz"], 6), 1 if p["ground"] else 0, p["panes"], round(c["x"], 6), round(c["z"], 6), round(c["dist"], 6)]


def empty_world():
    return {
        "version": 1, "spawn": {"x": 0.0, "z": 0.0}, "killZ": -100.0,
        "solids": [], "oneways": [], "hazards": [], "updrafts": [], "winds": [], "frail": [], "circuits": [],
        "bridges": [], "moths": [], "swings": [], "benches": [], "feathers": [], "relics": [], "shrines": [],
        "doors": [], "waters": [], "zones": [], "crown": {"x": 0.0, "z": 1e9, "bells": 3}, "decor": [], "entities": [],
    }
