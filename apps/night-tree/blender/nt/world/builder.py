"""The map builder: one call lays both the rules (what is solid, what hurts, what moves) and the
dressing (which library assets stand where). Pure Python; the Blender scene and the browser's
world.json are both made from what it returns.

All ground and walls sit on whole metres, because they are packed from the kit's square fills.
"""
from ..sim.sim import empty_world

PANEL = 10  # backdrop panels are 10 m squares


class W:
    def __init__(self):
        self.d = empty_world()
        self.theme = "tree"
        self.n = 0

    def _id(self, kind):
        self.n += 1
        return f"{kind}{self.n}"

    # ---- dressing ---------------------------------------------------------------------------------

    def prop(self, asset, x, z, y=0.0, rot=0.0, s=1.0, flip=False):
        sc = [s, s, s] if isinstance(s, (int, float)) else list(s)
        if flip:
            sc[0] = -sc[0]
        self.d["decor"].append({"a": asset, "p": [x, y, z], "r": rot, "s": sc})
        return self

    def entity(self, kind, ref, asset, x, z, y=0.0, rot=0.0, s=1.0, **more):
        sc = [s, s, s] if isinstance(s, (int, float)) else list(s)
        e = {"kind": kind, "ref": ref, "a": asset, "p": [x, y, z], "r": rot, "s": sc}
        e.update(more)
        self.d["entities"].append(e)

    def backdrop(self, asset, x0, z0, x1, z1, y=2.2):
        """Tiles a 10 m backdrop panel over a rectangle (snapped outward to whole panels)."""
        x = x0
        while x < x1:
            z = z0
            while z < z1:
                self.prop(asset, x + PANEL / 2, z, y)
                z += PANEL
            x += PANEL
        return self

    # ---- ground -----------------------------------------------------------------------------------

    def _tile(self, theme, x0, z0, x1, z1):
        w, h = x1 - x0, z1 - z0
        if w <= 0 or h <= 0:
            return
        for size in (8, 4, 2, 1):
            if w >= size and h >= size:
                nx, nz = w // size, h // size
                for i in range(nx):
                    for j in range(nz):
                        x, z = x0 + i * size, z0 + j * size
                        look = "b" if size >= 4 and (x * 7 + z * 13 + x // 5) % 3 == 0 else ""
                        self.prop(f"fill-{theme}-{size}{look}", x, z)
                self._tile(theme, x0 + nx * size, z0, x1, z0 + nz * size)
                self._tile(theme, x0, z0 + nz * size, x1, z1)
                return

    def solid(self, x0, z0, x1, z1, theme=None, cap=True, dress=True):
        """A block of ground or wall, whole metres. `cap` lays the realm's ground cap along its top."""
        for v in (x0, z0, x1, z1):
            if v != int(v):
                raise ValueError(f"solid off the metre grid: {x0, z0, x1, z1}")
        x0, z0, x1, z1 = int(x0), int(z0), int(x1), int(z1)
        theme = theme or self.theme
        self.d["solids"].append({"x0": x0, "z0": z0, "x1": x1, "z1": z1})
        if dress:
            self._tile(theme, x0, z0, x1, z1)
            if cap:
                x = x0
                k = 0
                while x < x1:
                    cx = min(x, x1 - 2) if x1 - x0 >= 2 else x0 - 0.5
                    self.prop(f"cap-{theme}-{'abcd'[(k * 7 + x0 * 3 + z1 * 5 + (k * k) % 3) % 4]}", cx + 1, z1)
                    x += 2
                    k += 1
        return self

    def plat(self, x0, x1, z, theme=None):
        """A ledge the owl can jump up through and drop down from; whole metres wide, two at least."""
        theme = theme or self.theme
        x0, x1 = int(x0), int(x1)
        self.d["oneways"].append({"x0": x0, "x1": x1, "z": z})
        for i in range(x1 - x0):
            part = "l" if i == 0 else "r" if i == x1 - x0 - 1 else "mn"[(i + x0) % 2]
            self.prop(f"plat-{theme}-{part}", x0 + i + 0.5, z)
        return self

    # ---- what hurts, lifts and moves ----------------------------------------------------------------

    def thorns(self, x0, x1, z):
        self.d["hazards"].append({"x0": x0 + 0.15, "z0": z, "x1": x1 - 0.15, "z1": z + 0.4})
        x = x0
        while x < x1:
            self.prop("thorn-bed", min(x, x1 - 2) + 1, z)
            x += 2
        return self

    def updraft(self, x, z0, z1, w=3.0, on=0.0, off=0.0, phase=0.0, lift=11.0):
        i = self._id("u")
        self.d["updrafts"].append({"id": i, "x0": x - w / 2, "z0": z0, "x1": x + w / 2, "z1": z1, "on": on, "off": off, "phase": phase, "lift": lift})
        self.prop("updraft-vent", x, z0)
        self.entity("updraft", i, "updraft-column", x, z0, s=[w * 0.8, w * 0.8, z1 - z0])
        return self

    def wind(self, x0, z0, x1, z1, push):
        self.d["winds"].append({"x0": x0, "z0": z0, "x1": x1, "z1": z1, "push": push})
        zz = z0
        while zz < z1:
            xx = x0
            while xx < x1:
                self.prop("wind-gust", xx + 2, zz + 0.5, y=1.2, s=[4, 1, 3], flip=push < 0)
                xx += 6
            zz += 5
        return self

    def frail(self, x, z):
        i = self._id("f")
        self.d["frail"].append({"id": i, "x0": x - 1, "x1": x + 1, "z": z})
        self.entity("frail", i, "frail-glass", x, z)
        return self

    def circuit(self, x, z, group, period=2.0):
        i = self._id("c")
        self.d["circuits"].append({"id": i, "x0": x - 1.5, "x1": x + 1.5, "z": z, "group": group, "period": period})
        self.entity("circuit", i, "circuit-plat-" + "ab"[group], x, z)
        return self

    def bridge(self, x, z, segs, life=4.0):
        """A brush stone at (x, z) that paints the listed spans (x0, x1, z); each a whole 2 m count."""
        i = self._id("br")
        self.d["bridges"].append({"id": i, "x": x, "z": z, "life": life, "segs": [{"x0": a, "x1": b, "z": c} for a, b, c in segs]})
        self.prop("brush-stone", x, z, y=1.2)
        for a, b, c in segs:
            xx = a
            while xx < b:
                self.entity("bridge", i, "painted-bridge", xx + 1, c)
                xx += 2
        return self

    def moth(self, x, z, ax=0.0, az=0.0, period=3.0, phase=0.0):
        i = self._id("m")
        self.d["moths"].append({"id": i, "x": x, "z": z, "ax": ax, "az": az, "period": period, "phase": phase, "r": 0.35})
        self.entity("moth", i, "lamp-moth", x, z)
        return self

    def swing(self, x, z, amp=1.0, period=3.2, phase=0.0):
        i = self._id("s")
        self.d["swings"].append({"id": i, "x": x, "z": z, "len": 3.0, "amp": amp, "period": period, "phase": phase, "r": 0.45})
        self.entity("swing", i, "swing-lantern", x, z)
        return self

    # ---- what the owl finds ---------------------------------------------------------------------------

    def bench(self, x, z):
        i = self._id("bench")
        self.d["benches"].append({"id": i, "x": x, "z": z})
        self.prop("bench", x, z, y=0.9)
        return self

    def feather(self, x, z):
        i = self._id("feather")
        self.d["feathers"].append({"id": i, "x": x, "z": z})
        self.entity("feather", i, "feather", x, z)
        return self

    def relic(self, kind, x, z):
        i = self._id(kind)
        self.d["relics"].append({"id": i, "kind": kind, "x": x, "z": z})
        asset = {"bell": "bell", "seal": "seal", "breaker": "breaker", "circlet": "glass-circlet", "mouse": "golden-mouse"}[kind]
        self.entity("relic", i, asset, x, z)
        return self

    def shrine(self, x, z, grants, idol=None):
        i = self._id("shrine")
        self.d["shrines"].append({"id": i, "x": x, "z": z, "grants": grants})
        self.prop("shrine", x, z, y=0.6)
        if idol:
            self.prop(idol, x, z, y=2.6)
        return self

    def door(self, x, z, side):
        """A shortcut door filling x..x+1, z..z+3 that opens when touched from `side` (-1 left, 1 right)."""
        i = self._id("door")
        self.d["doors"].append({"id": i, "x0": x, "z0": z, "x1": x + 1, "z1": z + 3, "side": side})
        self.entity("door", i, "shortcut-door", x + 0.5, z)
        return self

    def zone(self, name, x0, z0, x1, z1, zoom=1.0, lock=False, mood="tree"):
        self.d["zones"].append({"name": name, "x0": x0, "z0": z0, "x1": x1, "z1": z1, "zoom": zoom, "lock": lock, "mood": mood})
        return self
