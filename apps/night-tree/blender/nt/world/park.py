"""The park as one continuous space, side on. Metres; x right, z up.

The great tree is the spine: its hollow trunk (x -12 to 12) climbs from the floor at z = 0 to the
canopy at z = 104, and every realm opens off it through an arch in the bark:

    canopy and the crown ............ above z = 104 (needs the wall kick)
    glass street, then the tower .... east at z = 70  (the arch needs the glide)
    ink garden and the bridges ...... west at z = 52  (the arch needs the dash)
    neon street, circuit beneath .... east at z = 12  (the arch needs the flap)
    commons, then the clearing ...... west at z = 0   (where the night begins)
    the roots ....................... under the floor

Each realm's guardian grants one move, and that move opens the next arch up the trunk:
clearing: flap. neon: dash. ink: glide. glass: wall kick.
"""
from .builder import W


def build_world():
    w = W()
    w.d["spawn"] = {"x": -44.0, "z": 0.0}
    w.d["killZ"] = -70.0
    commons(w)
    hollow(w)
    clearing(w)
    neon(w)
    circuit(w)
    ink(w)
    glass(w)
    tower(w)
    canopy(w)
    roots(w)
    sky(w)
    return w.d


def commons(w):
    w.theme = "tree"
    w.zone("Treetop Commons", -52, -8, -16, 40, 1.0, mood="tree")
    w.solid(-52, -8, -16, 0)
    w.prop("spawn-nest", -44, 0, y=0.2)
    w.prop("ticket-booth", -48, 0, y=2.4)
    w.prop("park-gate", -38, 0, y=0.4)
    for x in (-35.5, -33.5):
        w.prop("turnstile", x, 0, y=1.6)
    w.prop("lantern-post", -41.5, 0, y=1.4)
    w.prop("lantern-post", -18.5, 0, y=1.6, flip=True)
    w.prop("string-lights", -31, 5.4, y=1.5)
    w.prop("string-lights", -25, 5.4, y=1.5)
    # the first hops: a stump, a ledge, a higher ledge
    w.solid(-31, 0, -29, 1, dress=False)
    w.prop("stump", -30, 0, s=[1.25, 1.25, 1])
    w.plat(-28, -25, 3)
    w.feather(-26.5, 4.2)
    w.plat(-24, -21, 6)
    w.feather(-22.5, 7.2)
    w.feather(-36, 1.0)
    w.bench(-19.5, 0)
    w.prop("bush-a", -50, 0, y=2.6)
    w.prop("fern", -46.5, 0, y=1.4)
    w.prop("bush-b", -27, 0, y=2.8)
    w.prop("leaf-pile", -23, 0, y=1.5)


def hollow(w):
    w.theme = "tree"
    w.zone("The Great Hollow", -16, -4, 16, 104, 1.12, mood="hollow")
    # floor, with the way down to the roots
    w.solid(-16, -4, 7, 0)
    w.solid(11, -4, 16, 0)
    w.plat(7, 11, 0)
    # the trunk: arches at z 0 (commons), 12 (neon), 52 (ink), 70 (glass)
    w.solid(-16, 5, -12, 52, cap=False)
    w.solid(-16, 57, -12, 104, cap=False)
    w.solid(12, 0, 16, 12, cap=False)
    w.solid(12, 17, 16, 70, cap=False)
    w.solid(12, 75, 16, 104, cap=False)
    w.backdrop("trunk-wall", -15, 0, 15, 110)
    for x, z, r in ((-14, 0, 90), (14, 12, 90), (-14, 52, 90), (14, 70, 90)):
        w.prop("hollow-arch", x, z, rot=r)
    w.prop("gold-seam", 0, 0, y=2.0)
    for z in range(10, 100, 10):
        w.prop("gold-seam", 0, z, y=2.0)
    w.prop("knothole-eye", -2, 60, y=2.0)
    for i, (x, z) in enumerate(((-8, 8), (9, 20), (-5, 33), (8, 44), (-9, 61), (6, 81), (-7, 92), (3, 26), (-3, 74))):
        w.prop("hollow-window", x, z, y=2.0)
        if i % 2 == 0:
            w.prop("mushroom-shelf-" + "abc"[i % 3], x + 2.5, z - 2, y=1.6)
    w.prop("stump-board", -3, 0, y=1.6)
    w.bench(-8, 0)
    w.prop("lantern-hang", 3, 8.9)
    w.feather(4, 1.0)

    # floor to the neon arch: each rise is five metres, more than a jump and less than a flap
    w.plat(-11, -6, 5)
    w.plat(-3, 2, 9)
    w.solid(6, 11, 12, 12)
    w.feather(-8.5, 6.2)
    w.prop("lantern-hang", 9, 16.9)
    # neon arch to the ink arch: two gaps only the dash crosses
    w.plat(5, 9, 17)
    w.plat(8, 12, 22)
    w.solid(-12, 21, -6, 22)
    w.feather(-1, 24.5)
    w.plat(-4, 0, 26)
    w.plat(4, 8, 30)
    w.solid(5, 34, 12, 35)
    w.bench(9.5, 35)
    w.solid(-12, 34, -9, 35)
    w.feather(-2.5, 37.5)
    w.plat(-8, -4, 40)
    w.plat(-11, -7, 45)
    w.plat(-5, -1, 49)
    w.solid(-12, 51, -6, 52)
    w.bench(-9.5, 52)
    # ink arch to the glass arch: rising air, for an owl that can glide
    w.updraft(2, 46, 72, w=3)
    w.solid(6, 69, 12, 70)
    w.bench(9.5, 70)
    w.feather(2, 60)
    # glass arch to the canopy: a long chimney for the wall kick
    w.plat(-1, 2, 72)
    w.solid(-2, 75, -1, 100, cap=False)
    w.solid(2, 75, 3, 100, cap=False)
    w.feather(0.5, 88)
    w.plat(5, 10, 104)
    for z in (30, 58, 84):
        w.prop("vine", -11.4, z, y=0.8)
        w.prop("vine-b", 11.3, z + 6, y=0.8)


def clearing(w):
    w.theme = "clearing"
    w.zone("The Treehouse Clearing", -140, -8, -52, 40, 1.08, mood="clearing")
    w.solid(-134, -8, -104, 0)
    w.solid(-104, -8, -90, -2, cap=False)
    w.solid(-90, -8, -52, 0)
    w.solid(-140, -8, -134, 60, dress=False)
    # a little hill and the treehouse
    w.solid(-80, 0, -68, 2)
    w.solid(-76, 2, -70, 3)
    w.prop("treehouse", -62, 0, y=2.4)
    w.solid(-58, 0, -56, 1, dress=False)
    w.prop("stump", -57, 0, s=[1.25, 1.25, 1])
    w.plat(-65, -59, 3.5, theme="tree")
    w.feather(-62, 4.7)
    w.plat(-64, -60, 7, theme="tree")
    w.feather(-62, 8.2)
    w.bench(-54.5, 0)
    w.prop("lantern-ring", -84, 0, y=2.2)
    # the pond: a jetty, a line in the water, and a heron waiting out the weather
    w.plat(-104, -98, 0, theme="tree")
    w.d["decor"] = [dd for dd in w.d["decor"] if not (dd["a"].startswith("plat-tree") and -104 <= dd["p"][0] <= -98 and dd["p"][2] == 0)]
    w.prop("jetty", -104, 0)
    w.prop("fishing-rod", -98.6, 0, y=0.6)
    for x in (-102, -98, -94):
        w.prop("water", x, -0.35)
    w.prop("lily-pads", -95, -0.3, y=0.9)
    w.prop("lily-pads", -100, -0.3, y=-1.0, rot=140)
    w.prop("reeds", -90.6, -1.6, y=1.2)
    w.prop("reeds", -103.4, -1.8, y=-1.3)
    w.prop("heron-straw-hat", -92, -2, y=1.3)
    w.feather(-96, -1.0)
    # a ledge only a flap reaches
    w.plat(-88, -85, 6, theme="tree")
    w.feather(-86.5, 7.2)
    # the guardian's rise
    w.bench(-110, 0)
    w.solid(-134, 0, -116, 3)
    w.shrine(-124, 3, "flap", idol="idol-great-horned")
    w.prop("closed-sign-1", -131.5, 3, y=1.5)
    for x, a in ((-131, "bush-a"), (-118, "fern"), (-107, "bush-b"), (-83, "fern"), (-72, "bush-a"), (-66, "leaf-pile")):
        w.prop(a, x, 3 if x < -116 else (2 if -80 < x < -68 else 0), y=2.6)
    for i, x in enumerate(range(-150, -10, 14)):
        w.prop("bg-tree-" + "abc"[i % 3], x + (i * 5) % 7, -1, y=9 + (i * 7) % 12)
    for x in (-140, -105, -70, -35):
        w.prop("bg-hill", x, -2, y=34)


def neon(w):
    w.theme = "neon"
    w.zone("The Neon Street", 16, 9.5, 124, 60, 1.05, mood="neon")
    w.solid(16, 9, 100, 12)
    w.solid(103, 9, 112, 12)
    w.plat(100, 103, 12)
    w.solid(16, -12, 28, 9, cap=False)
    w.solid(106, -12, 112, 9, cap=False)
    w.solid(112, -12, 116, 44, cap=False)
    w.solid(120, -70, 126, 220, dress=False)
    w.backdrop("facade", 20, 12, 110, 42)
    w.bench(20, 12)
    w.prop("neon-arch", 24, 12, rot=90)
    w.prop("feather-shop", 31, 12, y=2.6)
    w.prop("street-lamp", 26, 12, y=1.4)
    # crates and awnings up to the roofs
    w.solid(36, 12, 37, 13, dress=False)
    w.prop("crate", 36.5, 12)
    w.solid(37, 12, 38, 14, dress=False)
    w.prop("crate", 37.5, 12)
    w.prop("crate", 37.5, 13, rot=12)
    w.plat(40, 43, 16)
    w.prop("awning", 41.5, 16, y=1.6)
    w.feather(41.5, 17.2)
    w.plat(46, 52, 20)
    w.prop("rooftop-unit", 50, 20, y=1.0)
    w.plat(55, 60, 24)
    w.prop("antenna", 58.5, 24, y=1.2)
    w.feather(57, 25.3)
    w.plat(64, 70, 21)
    w.prop("water-tank", 68, 21, y=1.3)
    w.prop("cable", 52, 23.5, y=1.2)
    w.prop("cable", 60, 24.5, y=1.2)
    w.feather(67, 28.5)
    for i, x in enumerate((73, 75, 77)):
        w.prop("arcade-cabinet-" + "abc"[i], x, 12, y=1.5)
    w.prop("vending-machine", 80, 12, y=1.5)
    w.prop("puddle", 46, 12.02, y=-0.6)
    w.prop("puddle", 71, 12.02, y=0.3)
    w.prop("neon-sign-a", 44, 18, y=2.1)
    w.prop("neon-sign-b", 62, 15, y=2.1)
    w.prop("neon-sign-c", 78, 17.5, y=2.1)
    w.prop("billboard", 53, 30, y=2.4)
    # the guardian's roof
    w.solid(84, 12, 92, 18)
    w.shrine(88, 18, "dash")
    w.prop("robot-owl", 96, 12, y=3.2)
    w.bench(106, 12)
    w.prop("closed-sign-4", 109.5, 12, y=1.4)
    w.prop("street-lamp", 82, 12, y=1.4, flip=True)
    w.prop("perch-rail", 94, 21, y=1.0)
    for i, x in enumerate((10, 34, 58, 82, 106)):
        w.prop("bg-skyline-" + "ab"[i % 2], x + 10, 12, y=12 + (i % 2) * 9)


def circuit(w):
    w.theme = "neon"
    w.zone("The Blackout Circuit", 28, -12, 106, 9.5, 1.0, mood="circuit")
    w.solid(28, -12, 106, -10, cap=False)
    w.backdrop("circuit-wall", 28, -10, 106, 10)
    # the way in and out: a ladder of ledges under the street
    for z in (-7, -4, -1, 2, 5, 8.5):
        w.plat(100, 103, z)
    w.prop("dead-sign", 97, -2, y=2.0)
    w.prop("transformer", 104.5, -10, y=1.2)
    w.thorns(36, 96, -10)
    # light-bridges that take turns, east to west
    for i, x in enumerate((93, 88, 83, 78)):
        w.circuit(x, -7, i % 2)
    w.solid(68, -10, 74, -6)
    w.bench(71, -6)
    w.prop("circuit-node", 69, -6, y=1.2)
    w.relic("breaker", 73.2, -4.9)
    for i, x in enumerate((64, 59, 54)):
        w.circuit(x, -5, (i + 1) % 2)
    w.solid(44, -10, 50, -4)
    w.prop("spark-post", 45, -4, y=1.2)
    w.circuit(47, 0, 0)
    w.circuit(52, 3, 1)
    w.relic("breaker", 52, 4.6)
    w.feather(47, 1.4)
    w.circuit(40, -4, 0)
    w.solid(28, -10, 36, -4)
    w.relic("breaker", 29.5, -2.9)
    w.feather(33, -2.8)
    w.prop("conduit", 30, 6, y=2.0)
    w.prop("conduit", 34, 6, y=2.0)
    w.prop("conduit", 60, 7, y=2.0)
    w.prop("conduit-bend", 38, 6, y=2.0)
    for x in (58, 80):
        w.prop("dead-sign", x, 3, y=2.0)


def ink(w):
    w.theme = "ink"
    w.zone("The Ink Garden", -140, 34, -16, 100, 1.1, mood="ink")
    w.solid(-50, 46, -16, 52)
    w.solid(-140, 30, -134, 110, dress=False)
    w.prop("moon-gate", -42, 52, y=2.0)
    w.bench(-22, 52)
    w.prop("stone-lantern", -19, 52, y=1.5)
    w.prop("paper-crane", -30, 52, y=1.2)
    w.prop("ink-scroll", -26, 57.5, y=1.9)
    w.prop("paper-lantern", -35, 52, y=1.3)
    w.prop("ink-pine", -47, 52, y=2.4)
    w.prop("garden-bridge", -34, 52, y=3.4)
    for i, x in enumerate((-18, -28, -38, -46)):
        w.prop("bamboo-" + "abc"[i % 3], x, 52, y=2.8 + (i % 2))
    w.prop("bamboo-gate-shut", -128, 52, y=1.2)
    # a lower terrace catches an owl that falls, and steps lead back up
    w.solid(-100, 36, -50, 40)
    for z in (43, 46, 49):
        w.plat(-54, -51, z)
    w.prop("ink-rock-a", -70, 40, y=1.6)
    w.prop("ink-rock-b", -86, 40, y=1.8)
    w.prop("koi", -78, 41.2, y=1.0)
    w.relic("seal", -96, 41.2)
    # the brushstroke bridges: touch the stone, cross before the ink dries
    w.bridge(-51.5, 52, [(-62, -50, 52)], life=2.6)
    w.solid(-66, 48, -62, 52)
    w.plat(-66, -62, 56)
    w.relic("seal", -64, 57.2)
    w.bridge(-64, 52, [(-78, -66, 52)], life=2.6)
    w.solid(-82, 48, -78, 52)
    w.bridge(-80, 52, [(-92, -84, 54)], life=2.4)
    w.solid(-96, 50, -92, 54)
    w.feather(-88, 56.5)
    w.solid(-122, 46, -98, 52)
    w.bench(-101.5, 52)
    w.shrine(-112, 52, "glide", idol="idol-snowy-ink")
    w.solid(-126, 40, -122, 84, cap=False)
    w.prop("paper-lantern", -105, 52, y=1.3)
    w.prop("bamboo-b", -119, 52, y=2.6)
    # a seal only a glider reaches
    w.updraft(-30, 52, 63, w=3)
    w.plat(-40, -36, 62)
    w.relic("seal", -38, 63.2)
    w.prop("paper-lantern-hang", -38, 66.5)
    for x, zz, y, a in ((-150, 36, 30, "a"), (-110, 34, 44, "b"), (-70, 38, 36, "a"), (-30, 40, 50, "b")):
        w.prop("ink-mountain-" + a, x, zz, y=y)
    w.backdrop("ink-wall", -124, 40, -100, 70, y=3.2)


def glass(w):
    w.theme = "glass"
    w.zone("The Glass Street", 16, 64, 70, 100, 1.05, mood="glass")
    w.solid(16, 64, 70, 70)
    w.bench(20, 70)
    w.prop("glass-arch", 24, 70, rot=90)
    w.prop("keeper-stall", 29, 70, y=2.2)
    w.prop("glass-lamp", 35, 70, y=1.4)
    w.shrine(44, 70, "kick", idol="idol-barn-glass")
    w.prop("rose-window", 57, 80, y=3.4)
    w.prop("glass-buttress", 66, 70, y=2.2)
    w.prop("pane-shards", 51, 70, y=1.6)
    w.prop("glass-lamp", 62, 70, y=1.4, flip=True)
    w.feather(36, 73.5)
    for x, y in ((22, 22), (40, 30), (58, 26)):
        w.prop("tower-spire", x, 66, y=y)


def tower(w):
    w.theme = "glass"
    w.zone("The Glass Tower", 70, 64, 100, 190, 1.0, mood="tower")
    w.solid(70, 64, 96, 70)
    w.solid(70, 75, 72, 160, cap=False)
    w.solid(94, 70, 96, 160, cap=False)
    w.backdrop("glass-wall", 72, 70, 94, 160, y=2.2)
    for z in range(70, 160, 10):
        w.prop("glass-column", 71, z, y=-0.2)
        w.prop("glass-column", 95, z, y=-0.2)
    # first storey: a chimney for the new kick
    w.plat(73, 77, 73.5)
    w.solid(76, 77, 77, 88, cap=False)
    w.feather(74, 82)
    w.plat(77, 82, 88)
    w.solid(84, 89, 94, 90)
    w.bench(90, 90)
    w.prop("glass-lamp-hang", 87, 96)
    # second storey: frail glass, a lamp moth, a swinging lantern
    w.frail(81, 93)
    w.frail(76, 96)
    w.frail(81, 99)
    w.plat(85, 89, 102)
    w.moth(83, 104.2, ax=3.0, period=3.4)
    w.feather(92, 104.5)
    w.plat(76, 82, 105)
    w.swing(79, 110.6, amp=0.9, period=3.2)
    w.solid(84, 108, 94, 109)
    w.bench(90, 109)
    # third storey: rising air that comes and goes, and a crosswind
    w.updraft(76, 109, 127, w=3, on=3.2, off=1.8)
    w.wind(72, 113, 94, 124, 2.5)
    w.plat(80, 86, 124)
    w.feather(83, 119)
    w.plat(88, 93, 127)
    w.thorns(88, 90, 127)
    w.solid(72, 130, 80, 131)
    w.bench(75, 131)
    # fourth storey: frail steps to a chimney with a moth in it, then the clouds
    w.frail(83, 132.5)
    w.frail(87, 133)
    w.plat(90, 94, 133.5)
    w.solid(89, 136, 90, 152, cap=False)
    w.moth(92, 144, az=3.2, period=3.0)
    w.plat(84, 89, 152)
    w.feather(86.5, 153.4)
    w.frail(81, 154.5)
    w.plat(80, 84, 157)
    w.solid(72, 159, 80, 160)
    w.solid(84, 159, 94, 160)
    w.plat(80, 84, 160)
    w.prop("cloud-cap", 77, 160, y=0)
    w.prop("cloud-cap", 89, 160, y=0.4)
    w.bench(75, 160)
    w.prop("finish-shrine", 90, 160, y=0.4)
    w.relic("circlet", 90, 161.3)
    w.prop("moon", 83, 176, y=40, s=1.6)


def canopy(w):
    w.theme = "canopy"
    w.zone("The Updraft Canopy", -70, 100, 70, 200, 1.22, mood="canopy")
    w.backdrop("canopy-wall", -70, 100, 70, 150, y=3.4)
    w.solid(12, 102, 40, 104)
    w.solid(-44, 102, -12, 104)
    w.bench(16, 104)
    w.prop("owl-door", 22, 106, y=3.2)
    w.prop("nest-big", -26, 104, y=1.8)
    w.prop("acorn-lamp", 12, 109.5, y=0.8)
    w.prop("wind-chime", -14, 109.5, y=0.8)
    # east: rising air that comes and goes, out to the first bell
    w.updraft(46, 100, 123, w=3, on=3.0, off=2.0)
    w.plat(50, 56, 118)
    w.moth(53, 121.5, ax=2.5, period=2.8)
    w.plat(58, 62, 121)
    w.relic("bell", 60, 122.3)
    w.feather(46, 112)
    # west: against the wind to the second bell
    w.wind(-70, 104, -44, 126, 3.0)
    w.plat(-52, -48, 107)
    w.plat(-60, -56, 110)
    w.relic("bell", -58, 111.3)
    w.feather(-50, 108.3)
    w.plat(-66, -62, 114)
    w.feather(-64, 115.3)
    # up the middle: branches, a chimney between two boughs, the third bell, the crown
    w.plat(30, 36, 109)
    w.plat(22, 27, 113.5)
    w.solid(8, 117, 20, 118)
    w.bench(17, 118)
    w.plat(-2, 2, 119)
    w.solid(-3, 121, -2, 136, cap=False)
    w.solid(2, 121, 3, 136, cap=False)
    w.plat(3, 8, 136)
    w.plat(-10, -5, 138)
    w.moth(-7.5, 141, ax=2.2, period=2.6)
    w.relic("bell", -7.5, 139.3)
    w.updraft(10, 136, 148, w=3)
    w.solid(-5, 143, 5, 144)
    w.prop("crown-shrine", 0, 144, y=0.4)
    w.d["crown"] = {"x": 0.0, "z": 144.0, "bells": 3}
    for i, (x, z) in enumerate(((-36, 108), (28, 116), (-18, 122), (44, 128), (-50, 118), (0, 150), (20, 140), (-28, 136), (60, 110))):
        w.prop("leaf-cluster-" + "abc"[i % 3], x, z, y=2.6)
    for i, (x, z) in enumerate(((-30, 113), (6, 128), (34, 122), (-14, 146))):
        w.prop("leaf-cluster-" + "abc"[(i + 1) % 3], x, z, y=-3.4)
    w.prop("branch-limb", 40, 103, y=1.0)
    w.prop("branch-limb", -44, 103, y=1.0, flip=True)
    w.prop("branch-fork", -24, 104, y=2.6)
    w.prop("firefly-swarm", 6, 112, y=1.0)
    w.prop("firefly-swarm", -36, 110, y=1.4)
    w.prop("hanging-moss-a", 30, 109, y=0.8)
    w.prop("hanging-moss-b", -2, 143, y=0.9)
    w.prop("leaf-curtain", 14, 117, y=0.9)


def roots(w):
    w.theme = "roots"
    w.zone("The Roots", -44, -40, 28, -4, 1.05, mood="roots")
    w.solid(-48, -38, 28, -34, cap=False)
    w.solid(-48, -34, -44, -8, cap=False)
    w.solid(-44, -8, -16, -4, cap=False, theme="tree")
    w.backdrop("cave-wall", -44, -34, 16, -4)
    for z in (-3, -6, -9):
        w.plat(7, 11, z)
    w.solid(-6, -14, 16, -12)
    w.bench(13, -12)
    w.prop("glowworms", 2, -4.2, y=0.8)
    w.prop("glowworms", -20, -8.2, y=1.0)
    w.prop("crystal-cluster", -3, -12, y=1.5)
    w.prop("root-arch", 4, -12)
    w.prop("root-tangle", -10, -4.2, y=1.2)
    w.prop("root-talon", 21, -34, y=2.4)
    # the long way down and back: ledges on the east side
    for i, z in enumerate((-15, -18, -21, -24, -27, -30)):
        w.plat(17 if i % 2 == 0 else 13, 20 if i % 2 == 0 else 16, z)
    w.feather(24, -32.8)
    w.thorns(-28, -22, -34)
    w.thorns(-18, -12, -34)
    w.feather(-20, -30)
    w.prop("stalagmite-a", 2, -34, y=1.5)
    w.prop("stalagmite-b", -8, -34, y=1.8)
    w.prop("cave-rock-a", 9, -34, y=1.6)
    w.prop("cave-rock-b", -31, -34, y=2.0)
    w.prop("crystal-cluster", 11, -34, y=1.2)
    # the far ledge takes a glide, the shaft above it a kick, and at the top lives the golden mouse
    w.solid(-34, -34, -30, -22)
    w.solid(-44, -34, -36, -10)
    w.solid(-33, -19, -32, -8, cap=False)
    w.prop("mouse-hole", -41, -10, y=1.0)
    w.relic("mouse", -39.5, -9.4)
    w.feather(-34.5, -15)


def sky(w):
    for i, x in enumerate(range(-160, 160, 30)):
        for j, z in enumerate(range(20, 220, 30)):
            w.prop("star-cluster-" + "ab"[(i + j) % 2], x, z, y=95, s=3)
    w.prop("moon-crescent", -60, 130, y=90, s=2.5)
    for i, (x, z, y) in enumerate(((60, 150, 40), (110, 135, 60), (30, 165, 55), (-40, 95, 70), (-100, 110, 60), (80, 60, 70), (-20, 170, 45))):
        w.prop("cloud-" + "abc"[i % 3], x, z, y=y, s=2)
    w.prop("shooting-star", 20, 185, y=92, s=3)
