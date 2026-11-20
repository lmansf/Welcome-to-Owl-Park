"""The Wild Reaches: one continuous world seen from the side. Metres; x right, z up.

The world is laid on a grid of rooms (cells), each 32 m wide and 20 m tall, and every region is a
block of cells. Inside a region the rooms are joined as a maze with a few loops; between regions
the joins are gates that want one of the owl's moves:

    z 140..220  sky ruins ................................. (glide up the updrafts)
    z  60..140  frost peaks (west)   heartwood spire   sunstone canyon (east)
                 (kick shrine)        (wall kick)       (updraft: glide)
    z   0.. 60  ember deep  <flap  goldleaf grove  flap> great tree  dash> root colonnades
                 (dash shrine)       (start, flap shrine)                  (dive shrine)
    z -40..  0                      the falls  ---flap--->                 gloam caves
    z -160..-40                     the sunken sea (dive, glide shrine)  <dive

Moves in the order they are found: flap (grove), dash (ember), kick (frost), dive (colonnades),
glide (sea). Three bells (canyon, two in the sky) wake the sunwell at the top of the world.

Every room is carved out of rock on a 1 m grid: a hub chamber, tunnels to its neighbours, shafts up
and down, and stairs of ledges no more than 3 m apart (a plain jump is 3.8 m), so every ungated join
can be walked with no moves at all. The gates are carved into the tunnels between two rooms, away
from any ledge, so each one asks for exactly its move: check_map.py proves it.
"""
import math
import random

import numpy as np

from .builder import W

CW, CH = 32, 20                     # a cell, in metres
X0, X1, Z0, Z1 = -480, 480, -160, 240
NX, NZ = X1 - X0, Z1 - Z0
SEED = 20261119
SEA_TOP = -43                       # the sunken sea's surface

# key: (title, (cx0, cx1, cz0, cz1) inclusive, kit theme, zoom, hazard, extra loops)
REGIONS = {
    "grove": ("Goldleaf Grove", (-5, -1, 0, 2), "grove", 1.0, "thorns", 0.2),
    "falls": ("The Mistfalls", (-5, -1, -2, -1), "falls", 1.05, None, 0.2),
    "heart": ("The Great Tree", (0, 1, -2, 2), "heart", 1.1, None, 0.3),
    "spire": ("The Heartwood Spire", (0, 1, 3, 6), "heart", 1.12, None, 0.2),
    "ember": ("The Ember Deep", (-13, -6, -4, 2), "ember", 1.05, "lava", 0.15),
    "frost": ("The Frostfall Peaks", (-13, -6, 3, 8), "frost", 1.05, "icicles", 0.15),
    "colonnade": ("The Root Colonnades", (2, 12, -1, 2), "colonnade", 1.05, "thorns", 0.15),
    "canyon": ("The Sunstone Canyon", (2, 12, 3, 6), "canyon", 1.0, "thorns", 0.15),
    "gloam": ("The Gloamglow Caves", (6, 12, -4, -2), "gloam", 1.08, None, 0.2),
    "sea": ("The Sunken Sea", (-5, 5, -7, -3), "sea", 1.1, None, 0.2),
    "sky": ("The Sky Ruins", (-4, 5, 7, 10), "sky", 1.15, None, 0.0),
}

# joins between regions (and a few inside them): (cell a, cell b, gate). For a gate, a is the side
# the owl arrives from without the move.
LINKS = [
    ((-3, 0), (-3, -1), None),          # grove down into the falls
    ((-1, -2), (0, -2), "flap"),        # falls into the great tree
    ((-1, 1), (0, 1), "flap"),          # grove into the great tree
    ((-5, 1), (-6, 1), "flap"),         # grove into the ember deep
    ((-9, 2), (-9, 3), None),           # ember up into the frost vestibule
    ((-9, 3), (-8, 3), "dash"),         # ... and on into the peaks
    ((1, 0), (2, 0), "dash"),           # great tree into the colonnades
    ((0, 2), (0, 3), "kick"),           # up the trunk into the spire
    ((1, 4), (2, 4), None),             # spire across into the canyon
    ((8, -1), (8, -2), None),           # colonnades down into the gloam
    ((6, -3), (5, -3), "dive"),         # gloam into the sea
    ((-3, -2), (-3, -3), "dive"),       # the falls' pool down into the sea
    ((-6, -3), (-5, -3), "dive"),       # ember deep into the sea
    ((9, 2), (9, 3), "updraft"),        # colonnades up into the canyon
    ((4, 6), (4, 7), "updraft"),        # canyon up into the sky
    ((0, 6), (0, 7), "kick"),           # the spire's crown into the sky
]
VESTIBULES = {(-9, 3)}                  # cells left out of their region's maze (reached only by links)
# big open caverns made of several rooms: (cx0, cx1, cz0, cz1); more are chosen at random per region
BLOCKS = [(0, 1, -2, 1), (0, 1, 4, 5)]  # the great tree's hollow, and the spire's upper hall
LANDMARK = {"grove": "golden-oak", "falls": "great-falls", "heart": "heart-roots", "spire": "heart-lanterns",
            "ember": "volcano", "frost": "frozen-falls", "colonnade": "root-temple", "canyon": "sun-arch",
            "gloam": "crystal-geode", "sea": "sunken-ruin", "sky": "sky-temple"}

# how each reach is dressed: the wall behind enclosed rooms, the far scenery seen through its open
# caverns (None: always walled), props on room floors, props hung from ceilings
DRESS = {
    "grove": ("grove-wall", "far-canopy", ["golden-tree", "gold-bush", "gold-bush", "fern", "bush-a"], ["vine", "vine-b"]),
    "falls": ("falls-wall", "far-peaks", ["waterfall", "fern", "cave-rock-a", "crystal-cluster"], ["vine-b", "root-tangle"]),
    "heart": ("trunk-wall", None, ["mushroom-shelf-a", "stump", "crystal-cluster", "lantern-post"], ["lantern-hang", "root-tangle", "glowworms"]),
    "spire": ("trunk-wall", None, ["mushroom-shelf-b", "mushroom-shelf-c", "lantern-post"], ["lantern-hang", "vine"]),
    "ember": ("ember-wall", None, ["lava-fall", "basalt-spire", "ember-crystal", "cave-rock-b"], ["root-tangle"]),
    "frost": ("frost-wall", "far-peaks", ["snow-pine", "ice-crystal", "snow-pine"], ["icicle-cluster", "icicle-cluster"]),
    "colonnade": ("colonnade-wall", None, ["temple-column", "brazier", "stalagmite-b"], ["root-tangle", "lantern-hang"]),
    "canyon": ("canyon-wall", "far-mesa", ["broken-column", "dry-shrub", "dry-shrub", "cave-rock-a"], ["vine-b"]),
    "gloam": ("gloam-wall", None, ["glow-mushroom", "crystal-cluster", "stalagmite-a"], ["glowworms", "root-tangle"]),
    "sea": ("sea-wall", None, ["coral-fan", "kelp-tall", "glow-mushroom"], ["kelp-tall"]),
    "sky": (None, "far-clouds", ["ruin-pillar", "bush-b"], []),
}

SPAWN_CELL = (-3, 1)
SHRINES = {(-1, 0): ("flap", "idol-golden-oak"), (-12, -3): ("dash", "idol-ember"), (-12, 8): ("kick", "idol-frost"),
           (12, 1): ("dive", "idol-root"), (0, -7): ("glide", "idol-sea")}
BELLS = [(12, 6), (-4, 10), (5, 10)]
CROWN_CELL = (0, 10)


def cell_region():
    out = {}
    for key, (_t, (a, b, c, d), *_r) in REGIONS.items():
        for cx in range(a, b + 1):
            for cz in range(c, d + 1):
                out[(cx, cz)] = key
    return out


class Reaches:
    def __init__(self, seed=SEED):
        self.rng = random.Random(seed)
        self.seed = seed
        self.rock = np.ones((NX, NZ), dtype=bool)
        self.owner = cell_region()
        self.hubs = {}
        self.edges = {}            # frozenset(a, b) -> gate or None
        self.ups = []              # (x0, x1, z) oneway ledges
        self.waters = []
        self.updrafts = []
        self.hazards = []          # (kind, x0, x1, z)
        self.notes = {}            # cell -> list of things placed there
        self.block_of = {}         # cell -> its cavern block
        self.landmarks = []        # (asset, x, z)

    # ---- the grid -------------------------------------------------------------------------------

    def carve(self, x0, z0, x1, z1):
        a, b = max(x0 - X0, 0), min(x1 - X0, NX)
        c, d = max(z0 - Z0, 0), min(z1 - Z0, NZ)
        if a < b and c < d:
            self.rock[a:b, c:d] = False

    def fill(self, x0, z0, x1, z1):
        a, b = max(x0 - X0, 0), min(x1 - X0, NX)
        c, d = max(z0 - Z0, 0), min(z1 - Z0, NZ)
        if a < b and c < d:
            self.rock[a:b, c:d] = True

    def is_rock(self, x, z):
        if x < X0 or x >= X1 or z < Z0 or z >= Z1:
            return True
        return bool(self.rock[x - X0, z - Z0])

    def ledge(self, x0, x1, z):
        x0, x1 = int(x0), int(x1)
        if x1 - x0 >= 2:
            self.ups.append((x0, x1, z))

    def stairs(self, xa, xb, z_lo, z_hi, top=True):
        """Ledges up a column [xa, xb) from a floor at z_lo to a floor at z_hi, at most 3 m apart."""
        if z_hi - z_lo <= 2:
            return
        n = math.ceil((z_hi - z_lo) / 3.0)
        width = xb - xa
        w = min(4, width)
        for i in range(1, n + 1):
            z = z_lo + round((z_hi - z_lo) * i / n)
            if i == n and not top:
                break
            if i == n:
                self.ledge(xa, xb, z)          # the last one spans the column, level with the floor it meets
            elif width >= 7:
                x = xa if i % 2 else xb - w
                self.ledge(x, x + w, z)
            else:
                self.ledge(xa, xb, z)

    # ---- the plan -------------------------------------------------------------------------------

    def plan(self):
        rng = self.rng
        for key, (_t, (a, b, c, d), *_r) in REGIONS.items():
            cells = [(x, z) for x in range(a, b + 1) for z in range(c, d + 1) if (x, z) not in VESTIBULES]
            start = cells[rng.randrange(len(cells))]
            seen = {start}
            stack = [start]
            while stack:
                cur = stack[-1]
                nbrs = []
                for dx, dz, wt in ((1, 0, 3), (-1, 0, 3), (0, 1, 1), (0, -1, 1)):   # prefer long runs
                    n = (cur[0] + dx, cur[1] + dz)
                    if n in cells and n not in seen:
                        nbrs += [n] * wt
                if not nbrs:
                    stack.pop()
                    continue
                n = rng.choice(nbrs)
                seen.add(n)
                self.edges[frozenset((cur, n))] = None
                stack.append(n)
            loops = REGIONS[key][5]
            for cell in cells:
                for dx, dz in ((1, 0), (0, 1)):
                    n = (cell[0] + dx, cell[1] + dz)
                    if n in cells and frozenset((cell, n)) not in self.edges and rng.random() < loops:
                        self.edges[frozenset((cell, n))] = None
        for a, b, gate in LINKS:
            self.edges[frozenset((a, b))] = (gate, a) if gate else None
        self.choose_blocks()

    def choose_blocks(self):
        rng = random.Random(self.seed + 5)
        busy = set(VESTIBULES) | {SPAWN_CELL, CROWN_CELL}
        for a, b, g in LINKS:
            if g:
                busy |= {a, b}
        blocks = list(BLOCKS)
        for key, (_t, (a, b, c, d), *_r) in REGIONS.items():
            if key in ("heart", "spire", "sky"):
                continue
            n = max(1, ((b - a + 1) * (d - c + 1)) // 12)
            for _ in range(n * 6):
                if n <= 0:
                    break
                bw, bh = rng.choice(((2, 2), (3, 2), (2, 1), (3, 1)))
                x0 = rng.randint(a, b - bw + 1) if b - a + 1 >= bw else None
                z0 = rng.randint(c, d - bh + 1) if d - c + 1 >= bh else None
                if x0 is None or z0 is None:
                    continue
                cells = {(x, z) for x in range(x0, x0 + bw) for z in range(z0, z0 + bh)}
                if cells & busy or any(c2 in self.block_of for c2 in cells):
                    continue
                if any(self.block_of.get((x, z)) for x in range(x0 - 1, x0 + bw + 1) for z in range(z0 - 1, z0 + bh + 1)):
                    continue
                blocks.append((x0, x0 + bw - 1, z0, z0 + bh - 1))
                for c2 in cells:
                    self.block_of[c2] = blocks[-1]
                n -= 1
        for bl in BLOCKS:
            for x in range(bl[0], bl[1] + 1):
                for z in range(bl[2], bl[3] + 1):
                    self.block_of[(x, z)] = bl
        self.blocks = blocks

    def doors(self, cell):
        out = []
        for dx, dz, side in ((1, 0, "R"), (-1, 0, "L"), (0, 1, "U"), (0, -1, "D")):
            n = (cell[0] + dx, cell[1] + dz)
            e = frozenset((cell, n))
            if e in self.edges:
                out.append((side, n, self.edges[e]))
        return out

    def hub(self, cell):
        """The chamber in the middle of a room: (x0, z0, x1, z1); z0 is its floor."""
        if cell in self.hubs:
            return self.hubs[cell]
        bl = self.block_of.get(cell)
        if bl:
            rng = random.Random(hash((bl, self.seed)) & 0xFFFFFFFF)
            x0 = bl[0] * CW + rng.randint(3, 6)
            x1 = (bl[1] + 1) * CW - rng.randint(3, 6)
            z0 = bl[2] * CH + rng.randint(2, 4)
            z1 = (bl[3] + 1) * CH - rng.randint(2, 4)
            for x in range(bl[0], bl[1] + 1):
                for z in range(bl[2], bl[3] + 1):
                    self.hubs[(x, z)] = (x0, z0, x1, z1)
            return self.hubs[cell]
        rng = random.Random(hash((cell, self.seed)) & 0xFFFFFFFF)
        ox, oz = cell[0] * CW, cell[1] * CH
        gates = [(side, g) for side, _n, g in self.doors(cell) if g]
        left_gate = any(s == "L" for s, _ in gates)
        right_gate = any(s == "R" for s, _ in gates)
        hw = rng.randint(14, 24) if not (left_gate or right_gate) else rng.randint(12, 15)
        hh = rng.randint(8, 12)
        lo, hi = 3, CW - hw - 3
        if left_gate:
            lo = max(lo, 13)
        if right_gate:
            hi = min(hi, CW - hw - 13)
        hi = max(hi, lo)
        x0 = ox + rng.randint(lo, hi)
        zlo, zhi = 2, CH - hh - 2
        if any(g[0] in ("flap", "dash", "dive") for _s, g in gates):
            zhi = min(zhi, 5)     # room above a gate tunnel for its cliff
        z0 = oz + rng.randint(zlo, max(zlo, zhi))
        self.hubs[cell] = (x0, z0, x0 + hw, z0 + hh)
        return self.hubs[cell]

    # ---- carving --------------------------------------------------------------------------------

    def carve_rooms(self):
        for cell, key in self.owner.items():
            if key == "sky":
                self.carve_sky(cell)
                continue
            x0, z0, x1, z1 = self.hub(cell)
            if cell in self.block_of:
                bl = self.block_of[cell]
                if (bl[0], bl[2]) == cell:
                    self.carve_cavern(bl, self.owner[cell])
                continue
            self.carve(x0, z0, x1, z1)
            # a ragged ceiling, so no two rooms are boxes alike
            rng = random.Random(hash((cell, 3, self.seed)) & 0xFFFFFFFF)
            x = x0
            while x < x1:
                w = rng.randint(2, 5)
                self.carve(x, z1, min(x + w, x1), z1 + rng.randint(0, 3))
                x += w
        done = set()
        for e, gate in self.edges.items():
            a, b = sorted(e)
            if (a, b) in done:
                continue
            done.add((a, b))
            if self.owner.get(a) == "sky" and self.owner.get(b) == "sky":
                continue
            if a in self.block_of and self.block_of.get(a) == self.block_of.get(b):
                continue
            if a[1] == b[1]:
                self.tunnel(a, b, gate)
            else:
                self.shaft(a, b, gate)

    def door_z(self, a, b):
        """Where a tunnel between two side-by-side rooms runs: between their floors, on the metre."""
        za, zb = self.hub(a)[1], self.hub(b)[1]
        rng = random.Random(hash((a, b, 5, self.seed)) & 0xFFFFFFFF)
        lo, hi = min(za, zb), max(za, zb)
        return rng.randint(lo, hi)

    def side_column(self, cell, side, z_door, stairs=True):
        """Join a tunnel at floor z_door to the hub, inside the hub's end on that side."""
        x0, z0, x1, z1 = self.hub(cell)
        cx0, cx1 = (x0, x0 + 6) if side == "L" else (x1 - 6, x1)
        lo, hi = min(z_door, z0), max(z_door + 5, z1)
        self.carve(cx0, lo, cx1, hi)
        if stairs:
            if z_door > z0:
                self.stairs(cx0, cx1, z0, z_door)
            elif z_door < z0:
                self.stairs(cx0, cx1, z_door, z0)
        return cx0, cx1

    def tunnel(self, a, b, gate):
        if a[0] > b[0]:
            a, b = b, a
        ha, hb = self.hub(a), self.hub(b)
        xa, xb = ha[2] - 6, hb[0] + 6        # tunnel runs between the hubs' near ends
        edge_x = b[0] * CW
        if gate is None:
            z = self.door_z(a, b)
            self.carve(xa, z, xb, z + 5)
            self.side_column(a, "R", z)
            self.side_column(b, "L", z)
            return
        kind, frm = gate
        src_left = frm == a                  # the owl comes from the left room
        zs = (ha if src_left else hb)[1]     # the source floor; the tunnel leaves it level
        if kind == "flap":
            zd = zs + 6
            if src_left:
                self.carve(xa, zs, edge_x, zs + 5)
                self.carve(edge_x - 5, zs, edge_x, zd + 5)
                self.carve(edge_x, zd, xb, zd + 5)
                self.side_column(a, "R", zs)
                self.side_column(b, "L", zd)
            else:
                self.carve(edge_x, zs, xb, zs + 5)
                self.carve(edge_x, zs, edge_x + 5, zd + 5)
                self.carve(xa, zd, edge_x, zd + 5)
                self.side_column(b, "L", zs)
                self.side_column(a, "R", zd)
        elif kind == "dash":
            # a thorn pit under a low roof: too long to jump or flap, one dash and a jump clears it
            self.carve(xa, zs, xb, zs + 5)
            self.side_column(a, "R", zs)
            self.side_column(b, "L", zs)
            self.fill(edge_x - 8, zs + 3, edge_x + 8, zs + 5)
            self.carve(edge_x - 4, zs - 3, edge_x + 5, zs)
            self.hazards.append(("thorns", edge_x - 4, edge_x + 5, zs - 3))
        elif kind == "dive":
            # a flooded sump under a rock lip: a floater bobs at the top, a diver swims under
            self.carve(xa, zs, xb, zs + 5)
            self.side_column(a, "R", zs)
            self.side_column(b, "L", zs)
            self.carve(edge_x - 7, zs - 9, edge_x + 7, zs)
            self.fill(edge_x - 2, zs - 4, edge_x + 2, zs + 5)
            self.waters.append((edge_x - 7, zs - 9, edge_x + 7, zs - 1))

    def shaft(self, a, b, gate):
        if a[1] > b[1]:
            a, b = b, a                       # a is the lower room
        ha, hb = self.hub(a), self.hub(b)
        rng = random.Random(hash((a, b, 7, self.seed)) & 0xFFFFFFFF)
        kind = gate[0] if gate else None
        sw = {"kick": 4, "updraft": 12}.get(kind, 6)
        ox = a[0] * CW
        # the shaft runs where both hubs reach if it can; else a passage at each floor finds it
        lo = max(ha[0], hb[0]) + 1
        hi = min(ha[2], hb[2]) - sw - 1
        sx = rng.randint(lo, hi) if hi >= lo else ox + rng.randint(4, CW - sw - 4)
        top = hb[1]
        self.carve(sx, ha[1], sx + sw, top)
        for (x0, z0, x1, z1) in (ha, hb):
            if sx < x0 or sx + sw > x1:
                self.carve(min(sx, x0 + 2), z0, max(sx + sw, x1 - 2), z0 + 4)
        if self.owner.get(b) == "sky":
            self.carve(sx, top, sx + sw, top + 6)
        if kind is None:
            self.stairs(sx, sx + sw, ha[1], top)
        elif kind == "kick":
            self.ledge(sx, sx + sw, top)          # a lid to land on at the top
        elif kind == "updraft":
            self.ledge(sx, sx + 4, top)
            self.ledge(sx + sw - 4, sx + sw, top)
            self.updrafts.append((sx + sw / 2, ha[1], top + 5, 4.0))
        elif kind == "dive":
            self.waters.append((sx, ha[1] - 1, sx + sw, top - 2))
            self.ledge(sx, sx + sw, top)

    def carve_cavern(self, bl, key):
        """A great open room over several cells: a rolling floor, ragged walls and roof, a few
        floating ledges within a jump of each other, and the region's landmark behind the path."""
        x0, z0, x1, z1 = self.hub((bl[0], bl[2]))
        rng = random.Random(hash((bl, 13, self.seed)) & 0xFFFFFFFF)
        self.carve(x0, z0, x1, z1)
        x = x0
        while x < x1:                                    # ragged roof and walls
            wdt = rng.randint(2, 6)
            self.carve(x, z1, min(x + wdt, x1), z1 + rng.randint(0, 3))
            self.fill(x, z1 - rng.randint(0, 2), min(x + wdt, x1), z1)
            x += wdt
        z = z0 + 6
        while z < z1 - 2:
            for side in (x0, x1):
                d = rng.randint(0, 2)
                if side == x0:
                    self.fill(x0, z, x0 + d, z + rng.randint(2, 5))
                else:
                    self.fill(x1 - d, z, x1, z + rng.randint(2, 5))
            z += rng.randint(3, 6)
        # a rolling floor of mounds no taller than a hop, clear of the ends where the stairs climb
        x = x0 + 8
        while x < x1 - 10:
            wdt = rng.randint(4, 9)
            h = rng.choice((0, 0, 1, 1, 2, 3))
            if h:
                self.fill(x, z0, min(x + wdt, x1 - 8), z0 + h)
            x += wdt + rng.randint(2, 6)
        # floating ledges, each within a jump of the floor or of the one below
        cols = list(range(x0 + 9, x1 - 12, 9))
        for cx_ in cols:
            if rng.random() < 0.35:
                continue
            zz = z0 + 3 + rng.randint(0, 1)
            top = min(z1 - 4, z0 + rng.randint(6, 16))
            while zz <= top:
                wdt = rng.randint(3, 6)
                xx = cx_ + rng.randint(-2, 2)
                if rng.random() < 0.5:
                    self.fill(xx, zz - 1, xx + wdt, zz)         # a rock shelf
                else:
                    self.ledge(xx, xx + wdt, zz)
                zz += 3
        art = LANDMARK.get(key)
        if art:
            self.landmarks.append((art, (x0 + x1) / 2, z0))

    def carve_sky(self, cell):
        """Open air over a floor of cloud-stone, with a few floating islands and a rising column."""
        ox, oz = cell[0] * CW, cell[1] * CH
        rng = random.Random(hash((cell, 11, self.seed)) & 0xFFFFFFFF)
        floor = 1 if cell[1] == REGIONS["sky"][1][2] else 0
        self.carve(ox, oz + floor, ox + CW, oz + CH)
        isl = []
        for k in range(2):
            w = rng.randint(7, 12)
            x = ox + (2 if k == 0 else 17) + rng.randint(0, 13 - w + 2)
            z = oz + rng.randint(5, 13)
            self.fill(x, z - 2, x + w, z)
            isl.append((x, z, x + w))
        self.hubs[cell] = (isl[0][0], isl[0][1], isl[0][2], isl[0][1] + 6)
        # a column of rising air from the floor (or the room below) up through the room
        ux = ox + rng.randint(12, 18)
        self.updrafts.append((ux, oz, oz + CH + 3, 3.0))

    # ---- what is found in the rooms -------------------------------------------------------------

    def contents(self, w):
        rng = random.Random(self.seed + 99)
        order = sorted(self.owner)
        bench_cells = set()
        for key, (_t, (a, b, c, d), *_r) in REGIONS.items():
            cells = [(x, z) for x in range(a, b + 1) for z in range(c, d + 1)]
            rng.shuffle(cells)
            for cell in cells[: max(1, len(cells) // 7)]:
                bench_cells.add(cell)
        for cell in list(SHRINES) + [SPAWN_CELL] + BELLS:
            bench_cells.add(cell)
        for cell in order:
            key = self.owner[cell]
            x0, z0, x1, z1 = self.hubs[cell]
            mid = (x0 + x1) // 2
            if cell == SPAWN_CELL:
                w.d["spawn"] = {"x": float(mid), "z": float(z0)}
            if cell in SHRINES:
                grants, idol = SHRINES[cell]
                w.shrine(mid + 0.5, z0, grants, idol=idol)
            elif cell in BELLS:
                w.relic("bell", mid + 0.5, z0 + 1.5)
            elif cell == CROWN_CELL:
                w.d["crown"] = {"x": float(mid), "z": float(z0), "bells": len(BELLS)}
                w.prop("sunwell", mid, z0, y=1.0)
            if cell in bench_cells and cell != CROWN_CELL:
                bx = x0 + 3 if cell not in SHRINES else x1 - 3
                w.bench(bx + 0.5, z0)
            if rng.random() < 0.7:
                fx = rng.randint(x0 + 2, x1 - 3) + 0.5
                fz = z0 + (1.2 if rng.random() < 0.5 else 3.4)
                w.feather(fx, fz)
            # a pit with the region's hazard in the hub floor, narrow enough for a plain jump
            hz = REGIONS[key][4]
            if hz and key != "sky" and x1 - x0 >= 18 and rng.random() < 0.45 and cell not in SHRINES and cell != SPAWN_CELL:
                pw = rng.randint(2, 4)
                px = rng.randint(x0 + 7, x1 - 7 - pw)
                if all(self.is_rock(x, z0 - 1) for x in range(px - 1, px + pw + 1)):
                    self.carve(px, z0 - 2, px + pw, z0)
                    self.hazards.append((hz, px, px + pw, z0 - 2))

    # ---- the dress ---------------------------------------------------------------------------------

    def dress(self, w):
        rng = random.Random(self.seed + 7)
        walled = {}
        for cell, key in sorted(self.owner.items()):
            wall, far, floor_props, hang = DRESS[key]
            open_sky = far is not None and (cell in self.block_of or key == "sky")
            ox, oz = cell[0] * CW, cell[1] * CH
            # the wall behind the path, a 10 m panel wherever the room has open air
            for px in range(ox, ox + CW, 10):
                for pz in range(oz, oz + CH, 10):
                    if wall is None or open_sky:
                        continue
                    sub = self.rock[px - X0:px - X0 + 10, pz - Z0:pz - Z0 + 10]
                    if sub.all() or (px, pz) in walled:
                        continue
                    walled[(px, pz)] = True
                    second = ((px * 73856093) ^ (pz * 19349663)) % 5 in (1, 2)
                    w.prop(wall + ("-b" if second else ""), float(px + 5), float(pz), y=2.2)
            bl = self.block_of.get(cell, (cell[0], cell[0], cell[1], cell[1]))
            if open_sky and (cell == (bl[0], bl[2]) or key == "sky"):
                x0, z0, x1, z1 = self.hubs[cell]
                w.prop(far, float((x0 + x1) / 2 + rng.uniform(-6, 6)), float(z0 - 4), y=26.0, s=1.0, flip=rng.random() < 0.5)
                if key == "sky":
                    w.prop("far-clouds", float(ox + rng.uniform(4, 28)), float(oz + rng.uniform(-6, 4)), y=rng.uniform(10, 18))
            if key == "sky":
                continue
            # props along the hub floor, behind the path, clear of the stairs at the ends
            x0, z0, x1, z1 = self.hubs[cell]
            if cell in self.block_of and cell != (self.block_of[cell][0], self.block_of[cell][2]):
                continue
            n = rng.randint(2, 4) if cell not in self.block_of else rng.randint(6, 10)
            for _ in range(n):
                x = rng.uniform(x0 + 7, x1 - 7)
                zf = z0
                while self.is_rock(int(x), zf) and zf < z1:   # stand on the mound if there is one
                    zf += 1
                if not self.is_rock(int(x), zf - 1):
                    continue
                w.prop(rng.choice(floor_props), round(x, 2), float(zf), y=round(rng.uniform(1.0, 1.9), 2), flip=rng.random() < 0.5)
            for _ in range(rng.randint(1, 3) if hang else 0):
                x = rng.uniform(x0 + 3, x1 - 3)
                zc = z1
                while not self.is_rock(int(x), zc) and zc < z1 + 4:
                    zc += 1
                if self.is_rock(int(x), zc):
                    w.prop(rng.choice(hang), round(x, 2), float(zc), y=round(rng.uniform(0.8, 1.6), 2))

    # ---- out to the builder -----------------------------------------------------------------------

    def theme_of(self, x, z):
        cell = (math.floor(x / CW), math.floor(z / CH))
        key = self.owner.get(cell)
        if key is None:
            # rock between regions takes the nearest region's dress
            best, bd = "heart", 1e9
            for (cx, cz), k in self.owner.items():
                d = abs(cx - cell[0]) + abs(cz - cell[1])
                if d < bd:
                    best, bd = k, d
            key = best
        return REGIONS[key][2]

    def emit(self, w):
        # only rock within reach of the eye (14 m of open air) is kept, for the rules and the dress
        air = ~self.rock
        near = air.copy()
        for _ in range(14):
            n2 = near.copy()
            n2[1:, :] |= near[:-1, :]
            n2[:-1, :] |= near[1:, :]
            n2[:, 1:] |= near[:, :-1]
            n2[:, :-1] |= near[:, 1:]
            near = n2
        keep = self.rock & near
        # theme per 32 x 20 block
        theme_grid = np.empty((NX, NZ), dtype=object)
        for bx in range(X0 // CW, X1 // CW):
            for bz in range(Z0 // CH, Z1 // CH):
                t = self.theme_of(bx * CW + 1, bz * CH + 1)
                theme_grid[bx * CW - X0:(bx + 1) * CW - X0, bz * CH - Z0:(bz + 1) * CH - Z0] = t
        for t in sorted(set(theme_grid.flat)):
            mask = keep & (theme_grid == t)
            for (x0, z0, x1, z1) in rects(mask):
                w.solid(int(x0) + X0, int(z0) + Z0, int(x1) + X0, int(z1) + Z0, theme=t, cap=False)
        # caps along every top the owl can stand on
        top = self.rock[:, :-1] & ~self.rock[:, 1:]
        for iz in range(NZ - 1):
            row = top[:, iz]
            ix = 0
            while ix < NX:
                if not row[ix]:
                    ix += 1
                    continue
                j = ix
                while j < NX and row[j]:
                    j += 1
                t = theme_grid[ix, iz]
                x, k = ix, 0
                while x < j:
                    if j - ix >= 2:
                        cx = min(x, j - 2)
                        w.prop(f"cap-{t}-{'abcd'[(k * 7 + ix * 3 + iz * 5 + (k * k) % 3) % 4]}", float(cx + 1 + X0), float(iz + 1 + Z0))
                    x += 2
                    k += 1
                ix = j
        for (x0, x1, z) in self.ups:
            w.plat(x0, x1, z, theme=self.theme_of(x0, z))
        for kind, x0, x1, z in self.hazards:
            w.thorns(x0, x1, z, kind=kind)
        for (x0, z0, x1, z1) in self.waters:
            w.water(x0, z0, x1, z1)
        for art, x, z in self.landmarks:
            w.prop(art, float(x), float(z), y=6.0)
        for (x, z0, z1, ww) in self.updrafts:
            w.updraft(x, z0, z1, w=ww)
        for key, (title, (a, b, c, d), theme, zoom, *_r) in REGIONS.items():
            w.zone(title, a * CW, c * CH, (b + 1) * CW, (d + 1) * CH, zoom, mood=key)


def rects(mask):
    """Cover a boolean grid with rectangles: row runs, grown upward while the run repeats."""
    out = []
    open_ = {}
    nx, nz = mask.shape
    for z in range(nz + 1):
        runs = set()
        if z < nz:
            col = mask[:, z]
            x = 0
            while x < nx:
                if col[x]:
                    j = x
                    while j < nx and col[j]:
                        j += 1
                    runs.add((x, j))
                    x = j
                else:
                    x += 1
        for r in list(open_):
            if r not in runs:
                out.append((r[0], open_.pop(r), r[1], z))
        for r in runs:
            if r not in open_:
                open_[r] = z
    return out


def build_world(seed=SEED):
    w = W()
    r = Reaches(seed)
    r.plan()
    r.carve_rooms()
    # the sunken sea fills its rooms to the surface
    a, b, c, d = REGIONS["sea"][1]
    r.waters.append((a * CW, c * CH, (b + 1) * CW, SEA_TOP))
    r.contents(w)
    r.emit(w)
    r.dress(w)
    w.d["killZ"] = Z0 - 20.0
    w.reaches = r
    return w.d
