"""The Wild Reaches, drawn by hand: one continuous world seen from the side. Metres; x right, z up.

Every surface line, tunnel, cavern, gate and island below is placed by hand. The world starts as
solid rock; the open-air reaches have their sky cut down to a drawn line of ground, and the caves
are cut along drawn paths. Ground that slopes rises a metre at a time, which the owl walks up;
steeper rises are shafts with ledges no more than 3 m apart (a plain jump is 3.8 m); a tunnel that
comes into a cavern high on its wall gets a stair of ledges down to the cavern floor. So any way
that is not a gate can be walked with no moves, and check_map.py proves that each gate wants its
move.

                                   sky ruins  (bells, the sunwell on the tree's crown)
     frostfall peaks              heartwood spire          sunstone canyon
     (summit: kick)                  | kick |              (mesas, chasms: glide)
                                   great tree               ^ updraft (glide)
     ember deep  <flap  goldleaf grove  flap>  hollow  dash>  root colonnades (dive)
     (volcano: dash)      crystal grotto       (roots)        gloamglow caves
                          mistfalls  flap>
                     ~~~~~~~~~~~~~~~~ the sunken sea (dive; its floor: glide) ~~~~~~~~~~~~~~~~

Moves in the order found: flap (grove), dash (ember), kick (frost summit), dive (colonnades),
glide (sea floor). Three bells (canyon, two in the sky) wake the sunwell on the crown.
"""
import math
import random

import numpy as np

from .builder import W

X0, X1, Z0, Z1 = -480, 480, -170, 250
NX, NZ = X1 - X0, Z1 - Z0
SEA_TOP = -47

# key: (title, kit theme, zoom, outdoor, rectangles (x0, z0, x1, z1) that together tile the world)
REGIONS = {
    "frost": ("The Frostfall Peaks", "frost", 1.05, True, [(-480, 55, -178, 250)]),
    "ember": ("The Ember Deep", "ember", 1.05, False, [(-480, -170, -178, 55)]),
    "grove": ("Goldleaf Grove", "grove", 1.0, True, [(-178, 0, -22, 140)]),
    "falls": ("The Mistfalls", "falls", 1.05, False, [(-178, -45, -22, 0)]),
    "sea": ("The Sunken Sea", "sea", 1.1, False, [(-178, -170, 205, -45)]),
    "heart": ("The Great Tree", "heart", 1.1, False, [(-22, -45, 62, 62)]),
    "spire": ("The Heartwood Spire", "heart", 1.12, False, [(-22, 62, 62, 150)]),
    "colonnade": ("The Root Colonnades", "colonnade", 1.05, False, [(62, -45, 205, 58), (205, -28, 480, 58)]),
    "gloam": ("The Gloamglow Caves", "gloam", 1.08, False, [(205, -170, 480, -28)]),
    "canyon": ("The Sunstone Canyon", "canyon", 1.0, True, [(62, 58, 480, 165)]),
    "sky": ("The Sky Ruins", "sky", 1.15, True, [(-178, 140, -22, 250), (-22, 150, 62, 250), (62, 165, 480, 250)]),
}

# how each reach is dressed: wall behind its caves, far scenery for its open air, props on its
# floors (caves) or along its ground (open air), props hung from cave roofs
DRESS = {
    "grove": ("grove-wall", "far-canopy", ["golden-tree", "gold-bush", "gold-bush", "fern", "bush-a", "crystal-cluster"], ["vine", "vine-b"]),
    "falls": ("falls-wall", None, ["waterfall", "fern", "cave-rock-a", "crystal-cluster"], ["vine-b", "root-tangle"]),
    "heart": ("trunk-wall", None, ["mushroom-shelf-a", "stump", "crystal-cluster", "lantern-post"], ["lantern-hang", "root-tangle", "glowworms"]),
    "spire": ("trunk-wall", None, ["mushroom-shelf-b", "mushroom-shelf-c", "lantern-post"], ["lantern-hang", "vine"]),
    "ember": ("ember-wall", None, ["lava-fall", "basalt-spire", "ember-crystal", "cave-rock-b"], ["root-tangle"]),
    "frost": ("frost-wall", "far-peaks", ["snow-pine", "ice-crystal", "snow-pine", "snow-pine"], ["icicle-cluster", "icicle-cluster"]),
    "colonnade": ("colonnade-wall", None, ["temple-column", "brazier", "stalagmite-b"], ["root-tangle", "lantern-hang"]),
    "canyon": ("canyon-wall", "far-mesa", ["broken-column", "dry-shrub", "dry-shrub", "cave-rock-a"], ["vine-b"]),
    "gloam": ("gloam-wall", None, ["glow-mushroom", "crystal-cluster", "stalagmite-a"], ["glowworms", "root-tangle"]),
    "sea": ("sea-wall", None, ["coral-fan", "kelp-tall", "glow-mushroom", "kelp-tall"], ["kelp-tall"]),
    "sky": (None, "far-clouds", ["ruin-pillar", "bush-b"], []),
}


def region_at(x, z):
    for key, (_t, _th, _zm, _o, rs) in REGIONS.items():
        for (a, b, c, d) in rs:
            if a <= x < c and b <= z < d:
                return key
    return "heart"


class Atlas:
    def __init__(self):
        self.rock = np.ones((NX, NZ), dtype=bool)
        self.cave = np.zeros((NX, NZ), dtype=bool)      # air cut as cave (walls go behind it)
        self.ups, self.waters, self.updrafts, self.hazards = [], [], [], []
        self.halls = {}
        self.landmarks = []
        self.things = []        # (kind, x, z, extra)
        self.islands = []
        self.rng = random.Random(11)

    # ---- the grid -------------------------------------------------------------------------------

    def _ix(self, x0, z0, x1, z1):
        return max(int(x0) - X0, 0), min(int(x1) - X0, NX), max(int(z0) - Z0, 0), min(int(z1) - Z0, NZ)

    def carve(self, x0, z0, x1, z1, cave=True):
        a, b, c, d = self._ix(x0, z0, x1, z1)
        if a < b and c < d:
            if cave:   # only rock newly cut counts as cave; open sky stays sky
                self.cave[a:b, c:d] |= self.rock[a:b, c:d]
            else:
                self.cave[a:b, c:d] = False
            self.rock[a:b, c:d] = False

    def fill(self, x0, z0, x1, z1):
        a, b, c, d = self._ix(x0, z0, x1, z1)
        if a < b and c < d:
            self.rock[a:b, c:d] = True
            self.cave[a:b, c:d] = False

    def is_rock(self, x, z):
        x, z = int(math.floor(x)), int(math.floor(z))
        if x < X0 or x >= X1 or z < Z0 or z >= Z1:
            return True
        return bool(self.rock[x - X0, z - Z0])

    def floor_at(self, x, z):
        """Where an owl dropped at (x, z) comes to stand."""
        z = int(math.floor(z))
        while self.is_rock(x, z) and z < Z1:
            z += 1
        while not self.is_rock(x, z - 1) and z > Z0:
            z -= 1
        return z

    def ledge(self, x0, x1, z):
        if int(x1) - int(x0) >= 2:
            self.ups.append((int(x0), int(x1), int(z)))

    def stairs(self, xa, xb, z_lo, z_hi):
        """Ledges up a column [xa, xb) from a floor at z_lo to a floor at z_hi, at most 3 m apart."""
        xa, xb = int(xa), int(xb)
        if z_hi - z_lo <= 2:
            return
        n = math.ceil((z_hi - z_lo) / 3.0)
        w = min(4, xb - xa)
        for i in range(1, n + 1):
            z = z_lo + round((z_hi - z_lo) * i / n)
            if i == n:
                self.ledge(xa, xb, z)
            elif xb - xa >= 7:
                x = xa if i % 2 else xb - w
                self.ledge(x, x + w, z)
            else:
                self.ledge(xa, xb, z)

    def climb(self, x0, x1, z_lo, z_hi):
        self.carve(x0, z_lo, x1, z_hi + 4)
        self.stairs(x0, x1, z_lo, z_hi)

    # ---- drawing --------------------------------------------------------------------------------

    def ground(self, pts, top=Z1):
        """Open air above a drawn line of ground (x ascending)."""
        xs = [p[0] for p in pts]
        zs = [p[1] for p in pts]
        for x in range(int(xs[0]), int(xs[-1])):
            z = int(math.floor(np.interp(x + 0.5, xs, zs) + 0.5))
            self.carve(x, z, x + 1, top, cave=False)

    def hall(self, name, x0, z0, x1, z1, landmark=None, rough=True, seed=0):
        """A cavern: its floor is z0. A ragged roof and walls; a floor rolling no more than a metre."""
        rng = random.Random(hash((name, seed)) & 0xFFFFFFFF)
        self.carve(x0, z0, x1, z1)
        if rough:
            x = x0
            while x < x1:
                w = rng.randint(2, 6)
                self.carve(x, z1, min(x + w, x1), z1 + rng.randint(0, 3))
                x += w
            z = z0 + 7
            while z < z1 - 3:
                for side in (0, 1):
                    d = rng.randint(0, 2)
                    if side == 0:
                        self.fill(x0, z, x0 + d, z + rng.randint(2, 5))
                    else:
                        self.fill(x1 - d, z, x1, z + rng.randint(2, 5))
                z += rng.randint(3, 6)
            x = x0 + 9
            while x < x1 - 11:
                w = rng.randint(4, 10)
                if rng.random() < 0.5:
                    self.fill(x, z0, min(x + w, x1 - 9), z0 + 1)
                x += w + rng.randint(3, 8)
        self.halls[name] = (x0, z0, x1, z1)
        if landmark:
            self.landmarks.append((landmark, (x0 + x1) / 2, z0))

    def _hall_of(self, x, z):
        for name, (x0, z0, x1, z1) in self.halls.items():
            if x0 - 1 <= x <= x1 and z0 - 12 <= z <= z1:
                return name, (x0, z0, x1, z1)
        return None, None

    def tunnel(self, pts, h=5, w=6, bare=(), lid=True):
        """A cave path through drawn points: gentle stretches are walked (the floor rises a metre at a
        time), steep ones are shafts with ledges, unless their index is in `bare` (a gate shaft).
        An end that meets a cavern above its floor gets a stair down to that floor."""
        for i in range(len(pts) - 1):
            (ax, az), (bx, bz) = pts[i], pts[i + 1]
            dx, dz = bx - ax, bz - az
            if abs(dz) <= abs(dx):
                n = abs(dx)
                sgn = 1 if dx > 0 else -1
                for k in range(n + 1):
                    x = ax + sgn * k
                    f = int(round(az + dz * k / max(n, 1)))
                    self.carve(x - 1, f, x + 2, f + h)
            else:
                xs = int(round((ax + bx) / 2 - w / 2))
                lo, hi = min(az, bz), max(az, bz)
                self.carve(xs, lo, xs + w, hi + h)
                for (px, pz) in ((ax, az), (bx, bz)):     # each end walks into the shaft
                    self.carve(min(px, xs), pz, max(px + 1, xs + w), pz + h)
                if i not in bare:
                    self.stairs(xs, xs + w, lo, hi)
                elif lid:
                    self.ledge(xs, xs + w, hi)
        for (px, pz) in (pts[0], pts[-1]):
            name, hb = self._hall_of(px, pz)
            if hb is None:
                continue
            x0, z0, x1, z1 = hb
            left = px - x0 < x1 - px
            cx0, cx1 = (x0, x0 + 6) if left else (x1 - 6, x1)
            if pz > z0 + 2:
                self.carve(cx0, z0, cx1, pz + h)
                self.stairs(cx0, cx1, z0, pz)
            elif pz < z0 - 2:
                self.carve(cx0, pz, cx1, z0 + 4)
                self.stairs(cx0, cx1, pz, z0)

    # ---- gates and moving parts -------------------------------------------------------------------

    def dash_pit(self, xc, z):
        """In a flat tunnel with its floor at z: a thorn pit under a low roof. Too long to jump or
        flap over; a dash and a jump clear it."""
        self.fill(xc - 8, z + 3, xc + 8, z + 5)
        self.carve(xc - 4, z - 3, xc + 5, z)
        self.hazards.append(("thorns", xc - 4, xc + 5, z - 3))

    def updraft(self, x, z0, z1, w=3.0):
        self.updrafts.append((x, z0, z1, w))

    def water(self, x0, z0, x1, z1):
        self.waters.append((x0, z0, x1, z1))

    def island(self, x0, x1, top, t=3):
        self.fill(x0, top - t, x1, top)
        self.islands.append((x0, x1, top))

    def pit(self, kind, x0, x1, z, depth=2):
        """A pit in a floor at z with the reach's hazard at its foot."""
        self.carve(x0, z - depth, x1, z)
        self.hazards.append((kind, x0, x1, z - depth))

    def put(self, kind, x, z, **extra):
        self.things.append((kind, x, z, extra))


def draw(A):
    # ======================= Goldleaf Grove: golden hills under the sky ===========================
    A.ground([(-178, 44), (-168, 42), (-158, 40), (-146, 37), (-134, 34), (-122, 31), (-110, 30), (-100, 30),
              (-92, 32), (-84, 35), (-74, 37), (-66, 37), (-58, 36), (-50, 33), (-40, 30), (-30, 28), (-22, 28)])
    A.put("spawn", -152, 40)
    A.put("bench", -147, 40)
    A.put("shrine", -61, 40, grants="flap", idol="idol-golden-oak")
    A.landmarks.append(("golden-oak", -62, 36))
    A.put("bench", -70, 40)
    for (a, b, z) in ((-127, -123, 34), (-120, -116, 37), (-113, -109, 40)):    # a stair of golden boughs
        A.ledge(a, b, z)
    A.put("feather", -111, 41.5)
    A.ledge(-82, -78, 41)                                                       # out of reach until the flap
    A.put("feather", -80, 42.5)
    # the crystal grotto under the hills
    A.hall("grotto", -66, 4, -30, 20)
    A.tunnel([(-104, 30), (-98, 26), (-92, 20), (-86, 16), (-72, 13), (-66, 13)])
    A.ledge(-106, -96, 30)                     # a bough over the grotto's mouth: walk over, or drop through
    A.put("bench", -48, 4)
    A.put("feather", -36, 7.4)
    # ======================= The Mistfalls ========================================================
    A.tunnel([(-40, 4), (-40, -14)])
    A.tunnel([(-40, -14), (-52, -14), (-62, -18), (-70, -18)])
    A.hall("falls", -128, -30, -70, -4, landmark="great-falls")
    A.carve(-118, -38, -100, -30)                     # the plunge pool ...
    A.water(-118, -38, -100, -31)
    A.carve(-112, -47, -106, -38)                     # ... drains to the sea far below
    A.water(-112, -47, -106, -38)
    # the bramble hollow under the west of the grove, and down to the falls
    A.tunnel([(-150, 38), (-146, 34), (-142, 28), (-138, 22), (-134, 18), (-130, 18)])
    A.ledge(-153, -143, 38)                    # a bough over the bramble hollow's mouth
    A.hall("bramble", -170, 2, -130, 24)
    A.tunnel([(-160, 2), (-160, -6), (-140, -8), (-124, -10)])
    A.tunnel([(-124, -10), (-124, -4)])
    A.put("bench", -165, 2)
    A.put("bench", -80, -30)
    A.put("feather", -124, -26.6)
    # out to the great tree's roots, up a 6 m step (the flap)
    A.tunnel([(-70, -30), (-50, -30), (-34, -28), (-27, -28), (-26, -22), (-14, -22)], bare=(3,), w=5)
    # west to the ember deep, up a smooth shaft (the wall kick)
    A.tunnel([(-128, -30), (-150, -30), (-170, -34), (-186, -34), (-187, -18), (-206, -18), (-226, -22)], bare=(4,), w=4)

    # ======================= The Great Tree: the hollow, the spire, the crown ======================
    A.hall("hollow", -14, -22, 54, 60, landmark="heart-roots", rough=True)
    A.tunnel([(-22, 34), (-14, 34)])                                   # the door from the grove, 6 m up the bark (flap)
    A.climb(18, 28, -22, 58)                                           # the spiral up the hollow
    A.tunnel([(23, 58), (23, 72)], w=4, bare=(0,))                     # a smooth shaft to the spire (kick)
    A.put("bench", 2, -22)
    A.put("feather", 40, -18.6)
    A.put("feather", 23, 59.5)
    A.hall("spire", -8, 72, 48, 140, landmark="heart-lanterns")
    A.tunnel([(48, 96), (70, 96)])                                     # out onto the canyon's first mesa
    A.climb(8, 18, 72, 136)
    A.tunnel([(13, 136), (13, 154)], w=4, bare=(0,))                   # up the heartwood to the crown (kick)
    A.put("bench", 30, 72)
    A.put("feather", 44, 75.4)
    A.carve(-22, 150, 62, Z1, cave=False)                              # open sky over the tree
    A.island(-34, 74, 154, t=4)                                        # the crown, the top of the world tree
    A.put("crown", 20, 154)
    A.put("bench", 0, 154)

    # ======================= The Ember Deep ========================================================
    # the cave mouth, 6 m up the cliff at the grove's west end (the flap)
    A.tunnel([(-178, 50), (-196, 50), (-206, 46), (-216, 42), (-228, 38), (-240, 34)])
    A.hall("gallery", -270, 22, -240, 44)
    A.put("bench", -255, 22)
    A.tunnel([(-250, 22), (-250, 0)])
    A.tunnel([(-250, 0), (-262, -6), (-276, -12), (-290, -12)])
    A.hall("volcano", -390, -60, -290, 6, landmark="volcano")
    for x0 in (-372, -352, -330, -312):
        A.pit("lava", x0, x0 + 3, -60)
    A.put("bench", -300, -60)
    A.tunnel([(-390, -60), (-410, -66), (-430, -72), (-440, -72)])
    A.hall("embershrine", -470, -80, -440, -60)
    A.put("shrine", -455, -80, grants="dash", idol="idol-ember")
    A.put("bench", -446, -80)
    A.tunnel([(-390, -20), (-420, -14), (-440, -6), (-450, -6)])
    A.hall("lavafalls", -472, -14, -450, 6)
    A.put("feather", -461, -10.6)
    A.tunnel([(-290, -60), (-260, -64), (-230, -70), (-200, -80), (-178, -80), (-168, -82)])   # down to the sea
    # the cinder galleries under the volcano, and the magma vents above the lava falls
    A.tunnel([(-340, -60), (-340, -112)])
    A.hall("cinders", -430, -150, -300, -112)
    for x0 in (-410, -385, -360, -326):
        A.pit("lava", x0, x0 + 3, -150)
    A.tunnel([(-300, -130), (-270, -126), (-240, -120), (-210, -112), (-196, -100), (-196, -80)])
    A.put("bench", -306, -150)
    A.tunnel([(-461, 6), (-461, 14)])
    A.hall("vents", -474, 14, -420, 48)
    A.tunnel([(-420, 40), (-400, 40), (-380, 36), (-360, 36), (-344, 30), (-330, 30), (-330, 6)])
    A.put("bench", -430, 14)
    A.tunnel([(-226, -22), (-240, -20), (-262, -20), (-276, -14), (-290, -12)])             # the kick loop's end
    # up from the gallery to the frost vestibule, then a dash pit to the peaks
    A.tunnel([(-270, 22), (-286, 22), (-287, 60)])
    A.hall("vestibule", -296, 60, -280, 68, rough=False)
    A.tunnel([(-280, 60), (-244, 60), (-236, 64), (-228, 72), (-222, 78)])
    A.dash_pit(-262, 60)

    # ======================= The Frostfall Peaks: up the mountain to the summit =====================
    A.ground([(-480, 200), (-466, 198), (-454, 190), (-442, 178), (-428, 166), (-412, 154), (-396, 142),
              (-380, 132), (-366, 128), (-352, 124), (-338, 116), (-322, 106), (-308, 100), (-292, 100),
              (-276, 94), (-258, 86), (-240, 80), (-222, 76), (-206, 74), (-190, 72), (-178, 70)])
    A.pit("icicles", -305, -299, 100, depth=6)                       # a crevasse
    A.put("bench", -214, 75)
    A.put("bench", -340, 118)
    A.put("shrine", -472, 201, grants="kick", idol="idol-frost")
    A.put("bench", -462, 199)
    A.hall("icecave", -400, 92, -360, 118, landmark="frozen-falls")
    A.tunnel([(-322, 106), (-330, 100), (-344, 98), (-360, 98)])
    A.put("feather", -390, 95.4)
    A.put("bench", -372, 92)
    # the glacier halls deeper in the mountain, and a cave near the summit
    A.tunnel([(-400, 92), (-420, 86), (-440, 80)])
    A.hall("glacier", -476, 60, -440, 104)
    A.put("bench", -470, 60)
    A.tunnel([(-428, 166), (-432, 160), (-436, 154), (-440, 150)])
    A.hall("summitcave", -470, 140, -440, 160)
    A.tunnel([(-292, 100), (-288, 96), (-284, 90), (-278, 84), (-272, 80), (-262, 80)])   # under the slope, a burrow
    A.ledge(-294, -282, 100)                   # a snow bridge over its mouth
    A.hall("frostburrow", -262, 74, -230, 90, rough=True)

    # ======================= The Root Colonnades ====================================================
    A.tunnel([(54, 10), (62, 10), (100, 10), (112, 10)])
    A.dash_pit(84, 10)
    A.hall("hall1", 112, 2, 176, 26)
    A.put("bench", 120, 2)
    A.tunnel([(176, 6), (196, 8), (214, 8)])
    A.hall("hall2", 214, -12, 300, 30, landmark="root-temple")
    A.put("bench", 230, -12)
    A.tunnel([(300, 22), (318, 22), (319, 40), (336, 40), (350, 36)], bare=(1,), w=4)   # up a smooth shaft (kick)
    A.hall("hall3", 350, 30, 420, 54)
    A.put("bench", 358, 30)
    A.tunnel([(420, 30), (426, 24), (432, 18), (434, 12)])
    A.hall("hall4", 432, 2, 472, 22)
    A.put("shrine", 455, 2, grants="dive", idol="idol-root")
    A.put("bench", 440, 2)
    # up into the canyon on rising air (the glide)
    A.carve(380, 30, 392, 77)
    A.updraft(386, 30, 80, w=4.0)
    A.tunnel([(260, -12), (270, -16), (282, -22), (290, -26), (290, -44)])
    # the root cellars under the first hall, and the clerestory over the halls
    A.tunnel([(140, 2), (140, -20)])
    A.hall("cellars", 70, -40, 160, -20)
    A.put("bench", 80, -40)
    A.tunnel([(176, 20), (184, 20), (185, 40), (196, 40)], bare=(1,), w=4)               # up a smooth shaft (kick)
    A.hall("clerestory", 196, 38, 340, 56, rough=True)
    A.tunnel([(340, 44), (346, 40), (350, 40)])
    A.put("bench", 260, 38)

    # ======================= The Gloamglow Caves ====================================================
    A.tunnel([(290, -44), (300, -48), (316, -52), (330, -52)])
    A.hall("geode", 330, -80, 400, -40, landmark="crystal-geode")
    A.put("bench", 360, -80)
    A.tunnel([(400, -80), (420, -86), (440, -92), (456, -92)])
    A.hall("mushrooms", 456, -100, 476, -84)
    A.put("feather", 470, -96.6)
    A.tunnel([(330, -80), (300, -84), (260, -88), (230, -88), (210, -90), (196, -92)])     # out into the sea
    # the blue grotto under the way to the sea, and the deep crystals under the mushrooms
    A.tunnel([(262, -88), (262, -104)])
    A.hall("bluegrotto", 220, -140, 300, -104, landmark="crystal-geode")
    A.put("bench", 230, -140)
    A.tunnel([(466, -100), (466, -122)])
    A.hall("deepcrystal", 400, -160, 476, -122)
    A.put("feather", 410, -156.6)

    # ======================= The Sunken Sea =========================================================
    A.hall("kelp", -168, -150, -60, -56, landmark=None, seed=3)               # the kelp forest
    A.hall("temple", -60, -160, 90, -84, landmark="sunken-ruin", seed=4)      # the drowned temple
    A.hall("reef", 90, -132, 198, -52, seed=5)                                # the coral reef
    A.hall("lagoon", -40, -62, 60, -46, rough=False)                          # under the tree's roots, a hand of air
    A.tunnel([(-62, -104), (-56, -104)], h=12)                                # wide water-ways between the basins
    A.tunnel([(-90, -60), (-90, -56)], h=6, w=10)
    A.tunnel([(88, -108), (94, -108)], h=14)
    A.tunnel([(10, -84), (10, -62)], w=14)                                    # the temple's roof opens to the lagoon
    A.tunnel([(130, -52), (130, -50)], w=10)
    A.carve(-112, -60, -106, -46)                                             # the falls' drain comes down into the kelp
    for (x0, x1, z0, z1) in ((-130, -120, -150, -100), (-40, -30, -160, -118), (40, 50, -160, -124), (140, 150, -132, -96)):
        A.fill(x0, z0, x1, z1)                                                # rock pillars under the sea
    A.fill(-20, -112, 30, -108)                                               # a drowned arch
    A.water(-168, -160, 198, SEA_TOP)
    A.put("shrine", 0, -160, grants="glide", idol="idol-sea")
    A.put("bench", 12, -160)
    A.put("bench", -150, -160)
    A.put("bench", 180, -160)

    # ======================= The Sunstone Canyon: mesas and chasms ==================================
    A.ground([(62, 96), (78, 96), (82, 92), (86, 86), (90, 80), (96, 76), (118, 74), (138, 76), (146, 76),
              (147, 62), (178, 62), (179, 68), (196, 68), (204, 72), (214, 76), (232, 78), (244, 80), (256, 82),
              (268, 82), (269, 64), (298, 64), (299, 72), (318, 72), (334, 70), (352, 70), (372, 70), (394, 70),
              (410, 74), (424, 82), (436, 92), (446, 104), (456, 110), (470, 112), (480, 112)])
    A.climb(147, 152, 62, 76)                                         # ledges up out of each chasm
    A.climb(173, 178, 62, 68)
    A.climb(269, 274, 64, 82)
    A.climb(293, 298, 64, 72)
    A.hazards.append(("thorns", 156, 168, 62))
    A.hazards.append(("thorns", 278, 290, 64))
    A.put("bench", 110, 74)
    A.put("bench", 330, 70)
    A.put("bell", 472, 113.5)
    A.put("bench", 462, 112)
    A.landmarks.append(("sun-arch", 336, 70))

    # ======================= The Sky Ruins: islands on rising air ===================================
    A.updraft(236, 78, 210)                                            # from the canyon up to the first island
    islands = [(204, 222, 200), (166, 186, 192), (130, 150, 182), (96, 112, 172),        # east, toward the crown
               (-72, -56, 172), (-108, -92, 182), (-150, -126, 194),                     # west, from the crown
               (240, 262, 210)]                                                          # far east
    for x0, x1, top in islands:
        A.island(x0, x1, top)
    for x, z0, z1 in ((82, 150, 186), (120, 166, 196), (158, 176, 206), (194, 186, 214),
                      (-40, 150, 184), (-80, 166, 198), (-116, 176, 210), (230, 194, 224)):
        A.updraft(x, z0, z1)
    for x0, x1, top in ((292, 308, 214), (332, 348, 220), (374, 392, 226), (420, 442, 230)):     # on east over the canyon
        A.island(x0, x1, top)
    for x, z0, z1 in ((280, 198, 226), (320, 202, 232), (362, 208, 238), (408, 214, 242)):
        A.updraft(x, z0, z1)
    A.put("feather", 431, 231.5)
    A.put("bench", 380, 226)
    A.put("bell", -138, 195.5)
    A.put("bell", 251, 211.5)
    A.put("bench", -132, 194)
    A.put("bench", 246, 210)
    A.landmarks.append(("sky-temple", 252, 210))


def build_world():
    A = Atlas()
    draw(A)
    w = W()
    _contents(A, w)
    _emit(A, w)
    _dress(A, w)
    w.d["killZ"] = Z0 - 20.0
    w.atlas = A
    return w.d


# ---- what is found -------------------------------------------------------------------------------

def _contents(A, w):
    rng = random.Random(5)
    for kind, x, z, ex in A.things:
        zf = float(A.floor_at(x, z + 0.5)) if kind in ("spawn", "bench", "shrine", "crown") else float(z)
        if kind == "spawn":
            w.d["spawn"] = {"x": float(x), "z": zf}
        elif kind == "bench":
            w.bench(x + 0.5, zf)
        elif kind == "shrine":
            w.shrine(x + 0.5, zf, ex["grants"], idol=ex["idol"])
        elif kind == "bell":
            w.relic("bell", x + 0.5, z)
        elif kind == "feather":
            w.feather(x + 0.5, z)
        elif kind == "crown":
            w.d["crown"] = {"x": float(x), "z": zf, "bells": 3}
            w.prop("sunwell", float(x), zf, y=1.0)
    # a feather or two in every cavern, and one along every stretch of open ground
    for name, (x0, z0, x1, z1) in A.halls.items():
        for _ in range(2 if x1 - x0 < 60 else 4):
            x = rng.randint(x0 + 7, x1 - 8)
            zf = A.floor_at(x, z0 + 1.5)
            w.feather(x + 0.5, zf + (1.2 if rng.random() < 0.5 else 3.4))
    for key, (_t, _th, _zm, outdoor, rs) in REGIONS.items():
        if not outdoor or key == "sky":
            continue
        for (a, b, c, d) in rs:
            for x in range(a + 12, c - 6, 34):
                zf = A.floor_at(x, d - 1)
                if b <= zf < d:
                    w.feather(x + 0.5, zf + 1.2)


# ---- out to the builder --------------------------------------------------------------------------

def _emit(A, w):
    air = ~A.rock
    near = air.copy()
    for _ in range(14):
        n2 = near.copy()
        n2[1:, :] |= near[:-1, :]
        n2[:-1, :] |= near[1:, :]
        n2[:, 1:] |= near[:, :-1]
        n2[:, :-1] |= near[:, 1:]
        near = n2
    keep = A.rock & near
    theme = np.empty((NX, NZ), dtype=object)
    theme[:] = "heart"
    for key in reversed(list(REGIONS)):
        for (a, b, c, d) in REGIONS[key][4]:
            theme[a - X0:c - X0, b - Z0:d - Z0] = REGIONS[key][1]
    for t in sorted(set(theme.flat)):
        for (x0, z0, x1, z1) in rects(keep & (theme == t)):
            w.solid(int(x0) + X0, int(z0) + Z0, int(x1) + X0, int(z1) + Z0, theme=t, cap=False)
    top = A.rock[:, :-1] & ~A.rock[:, 1:]
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
            t = theme[ix, iz]
            if j - ix == 1:   # a one-metre step of a slope: one cap, centred over it
                w.prop(f"cap-{t}-{'abcd'[(ix * 3 + iz) % 4]}", float(ix + 0.5 + X0), float(iz + 1 + Z0))
            x, k = ix, 0
            while x < j and j - ix >= 2:
                cx = min(x, j - 2)
                w.prop(f"cap-{t}-{'abcd'[(k * 7 + ix * 3 + iz * 5 + (k * k) % 3) % 4]}", float(cx + 1 + X0), float(iz + 1 + Z0))
                x += 2
                k += 1
            ix = j
    for (x0, x1, z) in A.ups:
        w.plat(x0, x1, z, theme=REGIONS[region_at(x0, z)][1])
    for kind, x0, x1, z in A.hazards:
        w.thorns(x0, x1, z, kind=kind)
    for (x0, z0, x1, z1) in A.waters:
        w.water(x0, z0, x1, z1)
    for (x, z0, z1, ww) in A.updrafts:
        w.updraft(x, z0, z1, w=ww)
    for art, x, z in A.landmarks:
        w.prop(art, float(x), float(z), y=6.0)
    for key, (title, _th, zoom, _o, rs) in REGIONS.items():
        for (a, b, c, d) in rs:
            w.zone(title, a, b, c, d, zoom, mood=key)


def _dress(A, w):
    rng = random.Random(7)
    # walls behind the caves, a 10 m panel wherever a cave has air
    for px in range(X0, X1, 10):
        for pz in range(Z0, Z1, 10):
            sub = A.cave[px - X0:px - X0 + 10, pz - Z0:pz - Z0 + 10]
            sky = (~A.rock & ~A.cave)[px - X0:px - X0 + 10, pz - Z0:pz - Z0 + 10]
            if not sub.any() or sky.sum() > sub.sum():
                continue
            key = region_at(px + 5, pz + 5)
            wall = DRESS[key][0] or DRESS["heart"][0]
            second = ((px * 73856093) ^ (pz * 19349663)) % 5 in (1, 2)
            w.prop(wall + ("-b" if second else ""), float(px + 5), float(pz), y=2.2)
    # far scenery behind the open reaches
    for key, (_t, _th, _zm, outdoor, rs) in REGIONS.items():
        far = DRESS[key][1]
        if not outdoor or not far:
            continue
        for (a, b, c, d) in rs:
            for x in range(a + 20, c, 46):
                z = A.floor_at(x, d - 1) if key != "sky" else rng.uniform(b, d - 30)
                w.prop(far, float(x), float(z - 6), y=26.0, flip=rng.random() < 0.5)
    # props on the floors of the caverns, and hung from their roofs
    for name, (x0, z0, x1, z1) in A.halls.items():
        key = region_at((x0 + x1) / 2, z0 + 1)
        _w, _f, floor_props, hang = DRESS[key]
        for _ in range(max(2, (x1 - x0) // 9)):
            x = rng.uniform(x0 + 7, x1 - 7)
            zf = A.floor_at(x, z0 + 2)
            if zf > z0 + 2:
                continue
            w.prop(rng.choice(floor_props), round(x, 2), float(zf), y=round(rng.uniform(1.0, 1.9), 2), flip=rng.random() < 0.5)
        for _ in range(max(1, (x1 - x0) // 16) if hang else 0):
            x = rng.uniform(x0 + 3, x1 - 3)
            zc = z1
            while not A.is_rock(x, zc) and zc < z1 + 4:
                zc += 1
            if A.is_rock(x, zc):
                w.prop(rng.choice(hang), round(x, 2), float(zc), y=round(rng.uniform(0.8, 1.6), 2))
    # props along the open ground, near and farther back
    for key, (_t, _th, _zm, outdoor, rs) in REGIONS.items():
        if not outdoor or key == "sky":
            continue
        props = DRESS[key][2]
        for (a, b, c, d) in rs:
            x = a + 4
            while x < c - 4:
                zf = A.floor_at(x, d - 1)
                if b <= zf < d and A.is_rock(x, zf - 1) and not A.cave[int(x) - X0, min(int(zf) - Z0, NZ - 1)]:
                    w.prop(rng.choice(props), round(x, 2), float(zf), y=round(rng.uniform(1.0, 2.0), 2), flip=rng.random() < 0.5)
                    if rng.random() < 0.4:
                        w.prop(rng.choice(props[:2]), round(x + rng.uniform(-3, 3), 2), float(zf), y=round(rng.uniform(4.0, 8.0), 2), s=1.4)
                x += rng.uniform(6, 13)
    # ruins and bushes on the sky islands
    for (x0, x1, top) in A.islands:
        for _ in range(max(1, (x1 - x0) // 8)):
            w.prop(rng.choice(DRESS["sky"][2]), round(rng.uniform(x0 + 1.5, x1 - 1.5), 2), float(top), y=round(rng.uniform(0.9, 1.6), 2))


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
