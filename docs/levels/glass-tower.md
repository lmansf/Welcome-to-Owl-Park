# The Glass Tower: the stained-glass realm's course

- Status: the tower is BUILT as the stained-glass climb (`city-2`); this plan's changes are PLANNED (OP-225)
- Verified against: main 503b9bf (2026-11-02); times MEASURED by driving `climbPilot.ts` over `city-2` on that commit, and over a scratch copy of the layout with every change in section 4, bands 7 and 8 included
- Code: `packages/shared/src/climb.ts` (the physics, `CLIMB_FLOORS`, `CLIMB_BRISK`), `packages/shared/src/climbCity.ts` (the layout and its two roads), `packages/shared/src/climbPilot.ts` (the scripted pilot), `apps/park/src/game/ClimbScene.ts` (the page), `designs/the-stained-glass-climb.md`
- Tickets: OP-225 (this plan), OP-116 (the climb)
- Related: `docs/levels/README.md`, `docs/ACTIVITIES.md` (the climb as an activity)

The stained-glass realm's course is the climb that already exists: a portrait tower of backlit glass,
six storeys (bands) of 1200 field px today, each with a landing halfway up, a main road and from
band 2 a high road. This plan adds two storeys (bands 7 and 8, the owner's call), groups the eight
bands into three acts, adds the glass lift and the course's furniture (shortcuts, the dash-only gap,
feathers, the hidden pane, the moth), and measures the tower. Every addition below was put into the layout and driven with the climb's own pilot on all
three nights; the results are quoted with each one.

**Units here are the climb's, not the tree's:** field px, `y` up from the tower's foot, the field
480 wide (`CLIMB_FIELD_W`); a ledge is `{ x, y, w }` as `climbCity.ts` writes it (`ledge`,
`high`, `frail`). The tower has no 1600 x 900 screens; a **view** here is 600 field px of tower,
about what the page shows at once (`VIEW_H_MIN` 640 in `ClimbScene.ts`).

## 1. At a glance, and how long it is

- **Objective:** climb to the summit (band 8's line, `L8` at y 9600), where the finish shrine stands.
  The clouds (`L6`, today's top) become the foot of the last act's climb.
- **Reward:** the climb's own payouts (`BAND_FEATHERS` and the brisk feathers), with two more bands.
- **Measured today, the medium night** (the pilot drives each road's scripted route,
  `climb.test.ts`'s way): the main road reaches the clouds in **73.6 s** (68 moves), the high road
  in **49.7 s** (33 moves).
- **Measured as planned** (eight bands and every change in section 4), the medium night: the main
  road reaches the summit in **97.8 s** (92 moves), the high road in **63.9 s** (42 moves). Easy:
  97.7 s and 63.4 s. Hard: 95.9 s and 64.3 s. Per band, medium, main road: 11.0, 10.8, 11.0, 12.3,
  14.7, 13.8, 10.9, 13.3 s; high road: 11.0 (band 1 has none), 6.5, 6.5, 7.0, 9.0, 9.7, 6.4, 7.8 s.
- **The tower today:** 72 ledges, 14 walls, 4 thorn beds, 20 moths, 10 lanterns, 11 benches (6 band
  lines and 5 landings), 7200 field px tall. **As planned:** 100 ledges (98 on the roads and the
  pane sill; the ladder's five rungs come only for an owl that opened them), 19 walls, 7 thorn beds,
  27 moths, 14 lanterns, 15 benches (8 band lines and 7 landings), 9600 field px tall.
- **Estimated first clear: 388 s, about 6:28** (section 6), and about 6:53 with the
  hidden pane room. With every shortcut below, about 65 s; the pilot's best with them, 45.3 s. Gold
  time: **1:00**.
- **Sixteen views:** four in act 1 and six in each of acts 2 and 3, more than the ten the course
  rules aim for, because each band is two views tall and the plan keeps every band.

## 2. The physics used here

The climb's own (`climb.ts`), which shares its jump with the park's flight (`jump.ts`):

| What | Value | From |
| --- | --- | --- |
| Jump | rises 149 px in 0.34 s | `JUMP_IMPULSE` 880, `GRAVITY` 2600 |
| Double jump (the flap) | 111 px more, 260 in all | `DOUBLE_JUMP_IMPULSE` 760 |
| Run | 230 px/s | `RUN_SPEED` |
| Across, level, with a jump | about 156 px; with the double, about 248 | 230 px/s times the time aloft |
| The climb's dash | 96 px in 150 ms with no fall, once in the air | `DASH_SPEED` 640, `DASH_MS` 150 |
| With the dash, level | about 252 px off a single jump, 344 off the double | the dash adds about 96 |
| No glide | the climb has none | |
| The owl's box | 36 x 44 | `OWL_W`, `OWL_H` |

**The dash in the tower is the climb's own 96 px dash, not the courses' dash.** The courses' dash
(PR 72's `dash.ts`, 162 px in 180 ms) is for the park's course rooms; the tower keeps the climb's,
so every dash here, the dash-only gap included, is driven with the climb's own numbers.

## 3. The acts

| Act | Bands | Views | Door at its top | Shortcut |
| --- | --- | --- | --- | --- |
| 1, The Foot and the Walls | 1 and 2 | 1a to 2b | a lit glass arch on `L2` (y 2400) | the pane ladder (band 1) |
| 2, Lanterns, Moths and Frail Glass | 3 to 5 | 3a to 5b | a lit glass arch on `L5` (y 6000) | the glass lift, `L2` to `L4` |
| 3, The Clouds and the Summit | 6 to 8 | 6a to 8b | the summit (`L8`, y 9600), the finish shrine | the lift's top stop, `L5` to `L7` |

The act doors are drawn on the band lines: the climb is one field, so a door is an arch the owl
passes through on the line, with the act's name, not a room change.

**Benches.** The tower will have fifteen. The course counts four as its checkpoints: `L2`, `B4`
(y 4200), `L5` (y 6000) and `B7` (y 7800). The other eleven stay benches, as the owner decided on
2026-11-02: they catch the shade and relight the panes as they do today, so the climb's difficulty
does not move.

Key to the sketches: `#` band line or landing (a bench), `=` main road, `-` high road, `~`
frail glass, `|` wall, `x` thorns, `m` a moth's track, `o` a lantern's hook; planned: `r` a
ladder rung, `R` the ladder's lever, `L` the lift, `S` a lift switch, `P` the hidden pane's sill,
`*` a lost feather, `M` the lamp moth, `F` the finish shrine. The left column is y. Bands 7 and 8
(y 7200 to 9600, act 3's sketch) are planned in full.

### Act 1: The Foot and the Walls

```text
 2400 ######################SL
 2340 ======                 |
 2280 |       |              |
 2220 |       |              |
 2160 |       |         m m m|
 2100 ~~~~~~~                |
 2040                        |
 1980        ====            |
 1920                 ====----
 1860
 1800 ########################
 1740 ============      |    |
 1680           |       |    |
 1620           |       |    |
 1560           m m m   |    |
 1500             xx====|    |
 1440        ====        m m m
 1380 =======m m             |
 1320         =====          |
 1260                    ---R-
 1200 ########################
 1140  *
 1080      ====M===
 1020
  960              =========
  900
  840 ========              rr
  780
  720                =========
  660
  600 ========
  540                       rr
  480              =========
  420                       rr
  360 ========
  300                       rr
  240              =========
  180
  120 ========              rr
   60
    0
```

**View 1a: The foot, low** (y 0 to 600). Beat: Run, jump, the double: a stair of ledges left and right, no hazards. Time: 14 s on a first clear (the pilot's main road 5.5 s, high road 5.5 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `s1` | main | 0 | 120 | 160 | glass |
| `s2` | main | 260 | 230 | 180 | glass |
| `s3` | main | 0 | 330 | 160 | glass |
| `s4` | main | 260 | 450 | 180 | glass |
| `s5` | main | 0 | 570 | 160 | glass |

No hazards.

**View 1b: The foot, high** (y 600 to 1200). Beat: The dash across gaps (the climb's 96 px dash); the first band line. The lamp moth waits on `s9`. Time: 16 s on a first clear (the pilot's main road 5.5 s, high road 5.5 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `s6` | main | 300 | 690 | 180 | glass |
| `s7` | main | 0 | 810 | 160 | glass |
| `s8` | main | 260 | 960 | 180 | glass |
| `s9` | main | 100 | 1060 | 160 | glass |
| `L1` | both | 0 | 1200 | 480 | band line (bench) |

No hazards.

**View 2a: The walls, low** (y 1200 to 1800). Beat: Kick up a shaft wall to wall over thorns; the strand climbs the tower's own wall past moths. Time: 24 s on a first clear (the pilot's main road 5.4 s, high road 3.3 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `h2a` | high | 380 | 1240 | 100 | glass |
| `e0` | main | 160 | 1290 | 100 | glass |
| `e1` | main | 0 | 1380 | 140 | glass |
| `e1b` | main | 140 | 1450 | 80 | glass |
| `e2` | main | 280 | 1500 | 80 | glass |
| `e2c` | main | 0 | 1710 | 240 | glass |
| `B2` | both | 0 | 1800 | 480 | landing (bench) |

Hazards and walls: wall x 200, y 1620 to 1700; wall x 360, y 1500 to 1710; wall x 480, y 1240 to 1800; thorns x 240 to 280, y 1476 to 1500; moth x 60 to 200 at y 1350, 120 px/s; moth x 200 to 300 at y 1565, 120 px/s; moth x 380 to 460 at y 1460, 120 px/s.

**View 2b: The walls, high** (y 1800 to 2400). Beat: A frail foot and a second shaft; at the top the lift's switch (on `L2`) and the act door. Time: 24 s on a first clear (the pilot's main road 5.4 s, high road 3.2 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `e2a` | main | 320 | 1900 | 80 | glass |
| `h2b` | high | 400 | 1930 | 80 | glass |
| `e2b` | main | 140 | 1990 | 80 | glass |
| `e3` | main | 0 | 2090 | 140 | frail glass |
| `e4` | main | 0 | 2310 | 120 | glass |
| `L2` | both | 0 | 2400 | 480 | band line (bench) |

Hazards and walls: wall x 0, y 2170 to 2290; wall x 160, y 2140 to 2300; wall x 480, y 1930 to 2400; moth x 370 to 450 at y 2150, 150 px/s.

### Act 2: Lanterns, Moths and Frail Glass

```text
 6000 #######################L
 5940 =====          |
 5880                | -----
 5820           ~~~~~|
 5760   m m m m m m  |
 5700 ~~~~~          |      o
 5640           ~~~~~|
 5580   m m m m m m  |
 5520 =====          |~~~~~
 5460                |
 5400 ########################
 5340            ~~~~|
 5280   m m m m m m  | ~~~~~
 5220 ~~~~           |       *
 5160   m m m m m m  |
 5100            ~~~~|      o
 5040                |
 4980 ======         |~~~~~
 4920          ===== |
 4860
 4800 #######################L
 4740                =====
 4680
 4620        ======       m m
 4560 ====                ----
 4500      xxxxxxxxxxxxxxx
 4440                     m m
 4380       m m m m m m m m
 4320 ========================
 4260
 4200 ########################
 4140 xxxxxxxxxxxxxxxxxxx ====
 4080                     ----
 4020
 3960     m m m m m m m m   *
 3900 ==========xxxxxxxxxx====
 3840   =====             ----
 3780 ======
 3720         =====   PPP m m
 3660
 3600 ########################
 3540 =====          |
 3480         ====== |
 3420     m m m m m  |
 3360 =====          |  o
 3300                |
 3240    o           |
 3180                |     o
 3120          ===== |
 3060                |
 3000 ########################
 2940                |
 2880          ===== |
 2820 ======         |
 2760                |  o
 2700        o       |
 2640          ===== |
 2580                |     o
 2520 ======
 2460
 2400 ######################SL
```

The sketch shows band 4's first corridor as planned (section 4.4): split in two over a thorn bed.

**View 3a: The lanterns, low** (y 2400 to 3000). Beat: Time a swinging lantern; the strand pogoes a chain of lanterns. Time: 22 s on a first clear (the pilot's main road 5.5 s, high road 3.3 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `l1` | main | 0 | 2520 | 120 | glass |
| `l2` | main | 180 | 2640 | 100 | glass |
| `l3` | main | 0 | 2790 | 120 | glass |
| `l4` | main | 180 | 2900 | 100 | glass |
| `B3` | both | 0 | 3000 | 480 | landing (bench) |

Hazards and walls: wall x 300, y 2600 to 2960; moth x 40 to 260 at y 2972, 130 px/s; lantern hung at (150, 2760) on 50 px, 2.2 s swing; lantern hung at (420, 2620) on 40 px, 2.4 s swing; lantern hung at (360, 2820) on 40 px, 2.4 s swing.

**View 3b: The lanterns, high** (y 3000 to 3600). Beat: A gap only a pogo off the lantern reaches; the hidden pane's sill just over `L3`. Time: 24 s on a first clear (the pilot's main road 5.5 s, high road 3.3 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `u1` | main | 180 | 3120 | 100 | glass |
| `u2` | main | 0 | 3360 | 100 | glass |
| `u3` | main | 160 | 3450 | 120 | glass |
| `u4` | main | 0 | 3540 | 100 | glass |
| `L3` | both | 0 | 3600 | 480 | band line (bench) |

Hazards and walls: wall x 300, y 3050 to 3560; moth x 80 to 260 at y 3425, 130 px/s; lantern hung at (60, 3302) on 60 px, 2 s swing; lantern hung at (420, 3220) on 40 px, 2.4 s swing; lantern hung at (360, 3420) on 40 px, 2.4 s swing.

**View 4a: The moths, low** (y 3600 to 4200). Beat: Under a thorn ceiling there is no double jump: the corridor's gap is the dash-only gap. Time: 24 s on a first clear (the pilot's main road 6.2 s, high road 3.5 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `m0` | main | 160 | 3690 | 100 | glass |
| `m1` | main | 0 | 3770 | 120 | glass |
| `h4a` | high | 400 | 3830 | 80 | glass |
| `m2` | main | 180 | 3850 | 100 | glass |
| `c1` | main | 0 | 3920 | 480 | glass |
| `h4b` | high | 400 | 4075 | 80 | glass |
| `x1` | main | 400 | 4130 | 80 | glass |
| `B4` | both | 0 | 4200 | 480 | landing (bench) |

Hazards and walls: thorns x 0 to 380, y 4120 to 4144; moth x 80 to 360 at y 3950, 160 px/s; moth x 400 to 470 at y 3700, 140 px/s.

**View 4b: The moths, high** (y 4200 to 4800). Beat: The second corridor, two moths to hop; the lift's arrival on `L4`. Time: 24 s on a first clear (the pilot's main road 6.1 s, high road 3.5 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `c2` | main | 0 | 4320 | 480 | glass |
| `x2` | main | 0 | 4560 | 80 | glass |
| `h4d` | high | 400 | 4560 | 80 | glass |
| `m8` | main | 140 | 4640 | 120 | glass |
| `m9` | main | 300 | 4720 | 100 | glass |
| `L4` | both | 0 | 4800 | 480 | band line (bench) |

Hazards and walls: thorns x 100 to 400, y 4520 to 4544; moth x 120 to 400 at y 4350, 170 px/s; moth x 120 to 400 at y 4350, 170 px/s; moth x 400 to 470 at y 4440, 150 px/s; moth x 400 to 470 at y 4640, 160 px/s.

**View 5a: Frail glass, low** (y 4800 to 5400). Beat: A staircase of frail ledges crossed by dashes, moths in the gaps. Time: 26 s on a first clear (the pilot's main road 7.4 s, high road 4.5 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `f0a` | main | 180 | 4900 | 100 | glass |
| `h5a` | high | 320 | 4960 | 100 | frail glass |
| `f0` | main | 0 | 4990 | 120 | glass |
| `f1` | main | 220 | 5090 | 80 | frail glass |
| `f2` | main | 0 | 5200 | 80 | frail glass |
| `h5b` | high | 340 | 5300 | 100 | frail glass |
| `f3` | main | 220 | 5310 | 80 | frail glass |
| `B5` | both | 0 | 5400 | 480 | landing (bench) |

Hazards and walls: wall x 300, y 4900 to 5360; moth x 40 to 260 at y 5155, 140 px/s; moth x 40 to 260 at y 5265, 150 px/s; lantern hung at (440, 5130) on 40 px, 2.2 s swing.

**View 5b: Frail glass, high** (y 5400 to 6000). Beat: The same, faster; the strand's frail holds and a pogo; act 2's arch on `L5`, where the lift's top stop leaves. Time: 26 s on a first clear (the pilot's main road 7.3 s, high road 4.5 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `f5` | main | 0 | 5500 | 100 | glass |
| `h5c` | high | 320 | 5540 | 100 | frail glass |
| `f6` | main | 200 | 5610 | 100 | frail glass |
| `f7` | main | 0 | 5720 | 100 | frail glass |
| `f8` | main | 200 | 5830 | 100 | frail glass |
| `h5d` | high | 340 | 5880 | 100 | glass |
| `f9` | main | 0 | 5930 | 100 | glass |
| `L5` | both | 0 | 6000 | 480 | band line (bench) |

Hazards and walls: wall x 300, y 5450 to 5960; moth x 40 to 260 at y 5565, 150 px/s; moth x 40 to 260 at y 5785, 160 px/s; lantern hung at (440, 5710) on 40 px, 2.2 s swing.

### Act 3: The Clouds and the Summit

```text
 9600 ############F#########S#
 9540 =====          |
 9480                | -----
 9420           ~~~~~|
 9360   m m m m m m  |
 9300 ~~~~~          |      o
 9240           ~~~~~|
 9180   m m m m m m  |
 9120 =====          |~~~~~
 9060                |
 9000 ########################
 8940 ===============        |
 8880            |       |   |
 8820            |       |   |
 8760            |       |   |
 8700          xx======  |   |
 8640 ======           m m m |
 8580   m m m m              |
 8520          =====         |
 8460 =====               ----
 8400 #######################L
 8340 =====          |
 8280         ====== |
 8220     m m m m m  |
 8160 =====          |  o
 8100                |
 8040    o           |
 7980                |     o
 7920          ===== |
 7860                |
 7800 ########################
 7740 xxxxxxxxxxxxxxxxxxx ====
 7680                     ----
 7620
 7560     m m m m m m m m
 7500 ========================
 7440          =====      ----
 7380 ======
 7320         =====       m m
 7260
 7200 ########################
 7140             *  |
 7080 =====          |  -----
 7020           ~~~~ |
 6960                |
 6900 ~~~~   o       |      o
 6840                |
 6780   m m m m ~~~~ | ~~~~~
 6720 ====           |
 6660                |m m m m
 6600 ########################
 6540 ===============        |
 6480            |       |   |
 6420            |       |   |
 6360            |       |   |
 6300          xx======  |   |
 6240 ======           m m m |
 6180   m m m m              |
 6120          =====         |
 6060 =====               ----
 6000 #######################L
```

**View 6a: The clouds, low** (y 6000 to 6600). Beat: A dash over thorns to a shaft, kicked to its top; the strand up the tower's wall. Time: 26 s on a first clear (the pilot's main road 6.9 s, high road 4.8 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `h6a` | high | 400 | 6040 | 80 | glass |
| `g0` | main | 0 | 6070 | 100 | glass |
| `g0b` | main | 180 | 6130 | 100 | glass |
| `g1` | main | 0 | 6220 | 120 | glass |
| `g2` | main | 220 | 6300 | 120 | glass |
| `g3` | main | 0 | 6510 | 300 | glass |
| `B6` | both | 0 | 6600 | 480 | landing (bench) |

Hazards and walls: wall x 220, y 6360 to 6460; wall x 380, y 6300 to 6470; wall x 480, y 6040 to 6600; thorns x 192 to 220, y 6276 to 6300; moth x 40 to 180 at y 6195, 120 px/s; moth x 340 to 420 at y 6250, 120 px/s.

**View 6b: The clouds, high** (y 6600 to 7200). Beat: Frail dashes among moths and a lantern, then the clouds (`L6`), no longer the top. Time: 28 s on a first clear (the pilot's main road 6.9 s, high road 4.9 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `g4` | main | 0 | 6700 | 80 | glass |
| `h6b` | high | 340 | 6760 | 100 | frail glass |
| `g5` | main | 200 | 6800 | 80 | frail glass |
| `g6` | main | 0 | 6900 | 80 | frail glass |
| `g7` | main | 200 | 7000 | 80 | frail glass |
| `g8` | main | 0 | 7100 | 100 | glass |
| `h6c` | high | 360 | 7100 | 100 | glass |
| `L6` | both | 0 | 7200 | 480 | band line (bench) |

Hazards and walls: wall x 300, y 6650 to 7160; moth x 40 to 260 at y 6760, 150 px/s; moth x 320 to 460 at y 6680, 150 px/s; lantern hung at (150, 6960) on 50 px, 2.2 s swing; lantern hung at (440, 6930) on 40 px, 2.2 s swing.

**View 7a: Above the clouds, low** (y 7200 to 7800). Beat: Band 4's corridor again with faster moths: a single jump under the thorn ceiling, out up the right-hand gap; the strand's column past a moth. Time: 26 s on a first clear (the pilot's main road 5.5 s, high road 3.2 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `n0` | main | 160 | 7290 | 100 | glass |
| `n1` | main | 0 | 7370 | 120 | glass |
| `h7a` | high | 400 | 7430 | 80 | glass |
| `n2` | main | 180 | 7450 | 100 | glass |
| `c3` | main | 0 | 7520 | 480 | glass |
| `h7b` | high | 400 | 7675 | 80 | glass |
| `x3` | main | 400 | 7730 | 80 | glass |
| `B7` | both | 0 | 7800 | 480 | landing (bench) |

Hazards and walls: thorns x 0 to 380, y 7720 to 7744; moth x 80 to 360 at y 7550, 184 px/s; moth x 400 to 470 at y 7300, 161 px/s.

**View 7b: Above the clouds, high** (y 7800 to 8400). Beat: Band 3's pogo again: a ledge only a pogo off the lantern under it reaches; the strand pogoes the lantern chain; the lift's top stop arrives on `L7`. Time: 26 s on a first clear (the pilot's main road 5.4 s, high road 3.2 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `v1` | main | 180 | 7920 | 100 | glass |
| `v2` | main | 0 | 8160 | 100 | glass |
| `v3` | main | 160 | 8250 | 120 | glass |
| `v4` | main | 0 | 8340 | 100 | glass |
| `L7` | both | 0 | 8400 | 480 | band line (bench) |

Hazards and walls: wall x 300, y 7850 to 8360; moth x 80 to 260 at y 8225, 150 px/s; lantern hung at (60, 8102) on 60 px, 2 s swing; lantern hung at (420, 8020) on 40 px, 2.4 s swing; lantern hung at (360, 8220) on 40 px, 2.4 s swing.

**View 8a: The summit, low** (y 8400 to 9000). Beat: Band 6's shaft again: a dash over thorns to a shaft kicked to its top; the strand up the tower's wall past faster moths. Time: 28 s on a first clear (the pilot's main road 6.7 s, high road 3.9 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `h8a` | high | 400 | 8440 | 80 | glass |
| `k0` | main | 0 | 8470 | 100 | glass |
| `k0b` | main | 180 | 8530 | 100 | glass |
| `k1` | main | 0 | 8620 | 120 | glass |
| `k2` | main | 220 | 8700 | 120 | glass |
| `k3` | main | 0 | 8910 | 300 | glass |
| `B8` | both | 0 | 9000 | 480 | landing (bench) |

Hazards and walls: wall x 220, y 8760 to 8860; wall x 380, y 8700 to 8870; wall x 480, y 8440 to 9000; thorns x 192 to 220, y 8676 to 8700; moth x 40 to 180 at y 8595, 138 px/s; moth x 340 to 420 at y 8650, 138 px/s.

**View 8b: The summit, high** (y 9000 to 9600). Beat: Band 5's frail staircase again, between faster moths; the strand's frail hold and pogo; the summit (`L8`) and the finish shrine. Time: 30 s on a first clear (the pilot's main road 6.6 s, high road 3.9 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `j5` | main | 0 | 9100 | 100 | glass |
| `h8c` | high | 320 | 9140 | 100 | frail glass |
| `j6` | main | 200 | 9210 | 100 | frail glass |
| `j7` | main | 0 | 9320 | 100 | frail glass |
| `j8` | main | 200 | 9430 | 100 | frail glass |
| `h8d` | high | 340 | 9480 | 100 | glass |
| `j9` | main | 0 | 9530 | 100 | glass |
| `L8` | both | 0 | 9600 | 480 | band line (bench) |

Hazards and walls: wall x 300, y 9050 to 9560; moth x 40 to 260 at y 9165, 173 px/s; moth x 40 to 260 at y 9385, 184 px/s; lantern hung at (440, 9310) on 40 px, 2.2 s swing.

## 4. What changes [PLANNED (OP-225)]

### 4.1 Act 1's shortcut: the pane ladder

Five glass rungs up the tower's right edge, each `high(446, y, 34)`, at y 140, 280, 420, 560 and
830. They are not there until an owl throws the lever at the right end of `L1` (x 440, y 1200), the
top of band 1 (its far side); from then on they are, for that owl. The way up: straight up the four
rungs, onto `s6` (y 690), up to the fifth rung, a short hop left onto `s8` (y 960) and the main
road's last two moves to `L1`.

- Pilot: the ladder reaches `L1` in **6.2 s** against the main road's 11.0 s, on every night.
- Pilot: with the rungs in place both roads still drive clean and their times do not move.
- A rung at 970 broke the main road's dash to `s8` and was dropped; the rungs are 34 px wide at x
  446 so an owl on `s8` (which ends at 440) cannot land on one.

### 4.2 Act 2's shortcut: the glass lift

The switch is in band 2, as the owner asked: on `L2`'s right end (x 440, y 2400), at the top of
the strand's wall climb, so an owl that takes the high road through band 2 finds it. Throwing it
lights a glass car that stands on `L2` at x 400 to 480. On later runs an owl that steps in rides
up the outside of the tower to `L4` (y 4800) in **8 s** (2400 px at 300 px/s). The owl is in the
car, hazards do not touch it, the clock runs, and it steps out on `L4`, with band 5's frail glass
still to climb before act 2's arch on `L5`. The
car is a ride, not a platform: `climb.ts` gains a lift `{ x, from, to, ms }` and a switch
`{ x, y }`, and the owl's state is set, not stepped, while it rides.

- It breaks the course rule that a shortcut opens from its far side: the owner put the switch in
  band 2, the lift's near side. The plan keeps the owner's placement and makes the switch an earned
  find on the high road.

### 4.3 Act 3's shortcut: the lift's top stop

The second switch is at the summit (on `L8` at x 440, y 9600), act 3's far side. Throwing it lights
a second car in the same shaft, standing on `L5` at x 400 to 480 beside the arch into act 3. On later runs
it rides from `L5` to `L7` (y 8400) in **8 s**, past bands 6 and 7; from `L7` the owl climbs
band 8 as usual. (With six bands this stop ran `L4` to `L5`; with eight, `L4` to `L5` lies in act
2, so the stop moved up to act 3.)

- Pilot, every night: the shortcut road (the ladder, band 2's high road, the lift, band 5's high
  road, the top stop, band 8's high road) drives clean without losing a pane and reaches the summit
  in 45.4 s (easy), 45.3 s (medium) and 45.8 s (hard), with each 8 s ride counted. Section 5 has
  its floors.

### 4.4 The dash-only gap: band 4's first corridor

The tower's field is narrower than what a jump and a double jump carry an owl in the open (about
250 px across and 260 up), and every landing spans the field, so almost every point in the tower
can be reached without the dash. A search placed a side ledge at every spot near every high-road
and main-road ledge (20 px steps), kept those the pilot reaches with the dash and not with a run,
and found none that a neighbouring ledge or landing does not reach plainly. **The dash cannot go
on the high roads as a dash-only reach without moving their hazards.** The high roads stay as they
are (kicks, pogos, moths), and the dash keeps its use there as a speed tool.

The one place the climb itself stops the double jump is under a thorn ceiling, so the gap goes
there, on the main road:

| Change | Was | Becomes |
| --- | --- | --- |
| Corridor 1's floor | `c1` = `ledge(0, 3920, 480)` | `c1a` = `ledge(0, 3920, 200)` and `c1b` = `ledge(400, 3920, 80)` |
| A thorn bed in the gap | none | `thorns(200, 3896, 200, 24)` |
| The step below it | `m2` = `ledge(180, 3850, 100)` | `m2` = `ledge(40, 3850, 100)`, clear of the thorn bed |
| The main road's moves | `run(m2, 'R')`, `up(c1)`, `cross(c1, 'R')` | `up(m2)`, `up(c1a)`, `dash(c1b, 'R')` |

The ceiling (`thorns(0, 4120, 380)`) leaves 200 px over the corridor floor, so an owl 44 tall can
jump once (149) but not double. A single jump carries it about 156 px; the gap is 200; with the
dash, about 252.

- Pilot, every night: both roads drive clean with the change. The main road reaches band 4 in 45.1
  s (medium; it was 45.0). The floors and the brisk windows come from the high road, which does not
  move, so their first six entries stay as they are (section 5).
- Pilot, from the main road's own arrival on `c1a`: a run with a single jump falls into the thorn
  bed; a run with the double hits the ceiling; the dash lands. From the moved `m2`, every run and
  dash at `c1b` is hurt by the thorn bed or the ceiling.
- The high road is untouched: it climbs the column at x 400 to 480 past `c1b` as before.

### 4.5 The hidden pane, and the hidden room

A sill, `ledge(320, 3740, 60)`, just over `L3` (a straight jump of 140 from the band line, or a hop
from `m0`). Standing on it for a second swings a cracked pane in the tower's right face open; the
owl steps through into the pane room, a field of its own (480 x 600, no band lines, so nothing is
banked): its floor `ledge(0, 0, 480)`, a shelf `ledge(60, 140, 120)` with lost feather 2, a shelf
`ledge(280, 300, 140)` under the window pane, which looks out into the ink-wash realm (the
course's nod to another realm), and the way back out at x 440 on the floor, onto the sill. The run's
clock keeps running.

- Pilot: with the sill in place both roads drive clean and their times do not move.
- The sill is on neither road, so `climb.test.ts`'s check that the two roads stand on every platform
  must leave it out, with the ladder's rungs (on the shortcut road only) and the pane room's shelves.

### 4.6 The secret character: the lamp moth

A small glass moth with a lamp for a body, not a hazard (no hit circle), waits on `s9` (y 1060, the
top of band 1). The first time an owl stands there it follows, 50 px behind and 30 above. If the owl
ever pogoes off a moth, the lamp moth flies away for the rest of the run; a pogo off a lantern or
thorns does not count, and neither road's scripted route pogoes a moth, so either road can keep it.
If it reaches the summit it settles on the finish shrine and the run's card says so. `stepClimb`'s
`pogo` event must say what was pogoed (`hazardAt` already knows).

### 4.7 Five lost feathers

Pickups at points in the field (an owl's box touching the point collects it):

| Feather | Point (x, y) | View | How |
| --- | --- | --- | --- |
| 1 | (30, 1110) | 1b | a hop left off `s9`, under `L1` |
| 2 | on the pane room's low shelf | the pane room | the hidden room |
| 3 | (440, 3960) | 4a | over `c1b`, past the dash gap |
| 4 | (470, 5220) | 5a | on the band 5 strand, beside the pogo lantern at (440, 5130): the high road's |
| 5 | (240, 7150) | 6b | a hop right off `g8`, just under the clouds' line (`L6`) |

### 4.8 The finish shrine

On the summit, `L8`, at x 240. Reaching `L8` ends the run (`L6` no longer does); the shrine shows
the time against the gold time, the feathers found and whether the lamp moth came.

### 4.9 Bands 7 and 8

Two storeys over the clouds, built from the tower's own set pieces stacked a second time, with every
moth in them 15% faster (each speed times 1.15, rounded). Each half band is a built half band moved
up whole, its ledges, walls, thorns, moths, lanterns and both roads' moves:

| Band | Half | Set piece | From | Moved up |
| --- | --- | --- | --- | ---: |
| 7, Above the clouds | low (7a) | a corridor under a thorn ceiling, out up the right-hand gap; the strand's column | band 4, low (without the dash gap or the sill) | 3600 |
| 7 | high (7b) | a ledge only a pogo off a lantern reaches; the strand's lantern chain | band 3, high | 4800 |
| 8, The summit | low (8a) | a dash over thorns to a shaft kicked to its top; the strand up the tower's wall | band 6, low | 2400 |
| 8 | high (8b) | a frail staircase crossed by dashes; the strand's frail hold and pogo | band 5, high | 3600 |

The new layout data, as `climbCity.ts` writes it (`LINES` runs to 8, `L7` = `line(8400)`,
`L8` = `line(9600)`):

```ts
const n0 = ledge(160, 7290, 100); // m0 moved up 3600
const n1 = ledge(0, 7370, 120); // m1 moved up 3600
const n2 = ledge(180, 7450, 100); // m2 moved up 3600
const c3 = ledge(0, 7520, W); // c1 moved up 3600
const x3 = ledge(400, 7730, 80); // x1 moved up 3600
const B7 = landing(7800); // B4 moved up 3600
const h7a = high(400, 7430, 80); // h4a moved up 3600
const h7b = high(400, 7675, 80); // h4b moved up 3600
const v1 = ledge(180, 7920, 100); // u1 moved up 4800
const v2 = ledge(0, 8160, 100); // u2 moved up 4800
const v3 = ledge(160, 8250, 120); // u3 moved up 4800
const v4 = ledge(0, 8340, 100); // u4 moved up 4800
const k0 = ledge(0, 8470, 100); // g0 moved up 2400
const k0b = ledge(180, 8530, 100); // g0b moved up 2400
const k1 = ledge(0, 8620, 120); // g1 moved up 2400
const k2 = ledge(220, 8700, 120); // g2 moved up 2400
const k3 = ledge(0, 8910, 300); // g3 moved up 2400
const B8 = landing(9000); // B6 moved up 2400
const h8a = high(400, 8440, 80); // h6a moved up 2400
const j5 = ledge(0, 9100, 100); // f5 moved up 3600
const j6 = frail(200, 9210, 100); // f6 moved up 3600
const j7 = frail(0, 9320, 100); // f7 moved up 3600
const j8 = frail(200, 9430, 100); // f8 moved up 3600
const j9 = ledge(0, 9530, 100); // f9 moved up 3600
const h8c = highFrail(320, 9140, 100); // h5c moved up 3600
const h8d = high(340, 9480, 100); // h5d moved up 3600
// walls, thorns, moths and lanterns, band 7
wall(300, 7850, 8360),
thorns(0, 7720, 380),
moth(80, 360, 7550, 184),
moth(400, 470, 7300, 161),
moth(80, 260, 8225, 150, 0.9),
lantern(60, 8102, 60, 0.9, 2000, 0.5),
lantern(420, 8020, 40, 0.5, 2400),
lantern(360, 8220, 40, 0.5, 2400, 0.3),
// band 8
wall(220, 8760, 8860),
wall(380, 8700, 8870),
wall(W, 8440, 9000),
wall(300, 9050, 9560),
thorns(192, 8676, 28),
moth(40, 180, 8595, 138, 0.5),
moth(340, 420, 8650, 138),
moth(40, 260, 9165, 173, 0.3),
moth(40, 260, 9385, 184, 0.8),
lantern(440, 9310, 40, 0.3, 2200, 0.5),
```

The roads, appended to `routes` in the same order:

```ts
// stairs, band 7
up(n0), run(n1, 'L'), run(n2, 'R'), up(c3), cross(c3, 'R'), up(x3, 'double'), up(B7),
up(v1), pogo(v2, 'L'), run(v3, 'R'), run(v4, 'L'), up(L7),
// stairs, band 8
up(k0), run(k0b, 'R'), run(k1, 'L'), dash(k2, 'R'), climb(k3, 'R', 'both'), up(B8),
up(j5), dash(j6, 'R'), dash(j7, 'L'), dash(j8, 'R'), dash(j9, 'L'), up(L8),
// high, band 7
up(h7a, 'double'), up(h7b, 'double'), up(B7), pogo(L7, 'R', 'double', true, 420),
// high, band 8
up(h8a), climb(B8, 'R', 'one'), up(h8c, 'double'), pogo(h8d, 'R', 'double', true), up(L8),
```

- Pilot, every night: both roads drive the eight bands clean without losing a pane, and between them
  stand on every new platform. In bands 7 and 8 the high road is the faster way, and the main road
  is more than a quarter slower than the brisk window, as `climb.test.ts` asks of every band.
- Medium night, band 7: main road 10.9 s, high road 6.4 s; band 8: 13.3 s and 7.8 s.
- The tower's one dash-only gap stays in band 4: band 7's corridor keeps its whole floor, so its
  single jump under the ceiling is a hop along, not a gap.
- `BAND_NAMES` gains 'Above the clouds' and 'The summit'; `BAND_FEATHERS` two more entries
  (2 and 2, like bands 3 to 6; the owner sets the payouts).

## 5. What the server must learn

- **Eight bands.** `BAND_COUNT` (`edge.ts`) goes from 6 to 8, a protocol change: the climb's frames
  carry a band up to 8. `BAND_NAMES`, `BAND_FEATHERS`, `CLIMB_FLOORS` and `CLIMB_BRISK` each gain two
  entries, and `climb.test.ts` freezes them as it does today.
- **The floors for the two roads**, derived as `climb.test.ts` derives them (the faster road's
  scripted time to each band, less `CLIMB_FLOOR_MARGIN`, down to 100 ms). The first six entries do
  not move:

| Night | `CLIMB_FLOORS['city-2']`, bands 1 to 8 (ms) | `CLIMB_BRISK['city-2']`, bands 1 to 8 (ms) |
| --- | --- | --- |
| easy | 8800, 14000, 19100, 24900, 32100, 38800, **44700, 50600** | 0, 7200, 7100, 8100, 9900, 9200, **8100, 8300** |
| medium | 8800, 14000, 19200, 24800, 32000, 39700, **44800, 51000** | 0, 7200, 7300, 7700, 9900, 10700, **7100, 8600** |
| hard | 8800, 14500, 19100, 24500, 31500, 38700, **45300, 51400** | 0, 7900, 6400, 7500, 9800, 9900, **9100, 8400** |

- **The shortcuts beat those floors.** The ladder banks band 1 at 6.2 s (floor 8.8 s); the lift
  banks bands 3 and 4 together at about 21.8 s (band 4's floor is 24.8 s on the medium night); the
  top stop banks bands 6 and 7 at about 38.7 s (band 7's floor is 44.8 s). Each would be refused as
  it stands. Fix: a third scripted road, the shortcut road (section 4.3), driven by `climb.test.ts`
  like the other two, and floors from it for runs that report the shortcuts they used, the room
  server checking the owl's course book has them open:

| Night | Shortcut road, time to each band (s) | Floors for a run that reports every shortcut, bands 1 to 8 (ms) |
| --- | --- | --- |
| easy | 6.2, 13.5, 21.9, 21.9, 30.5, 38.8, 38.8, 45.4 | 4900, 10700, 17500, 17500, 24400, 31000, 31000, 36300 |
| medium | 6.2, 13.3, 21.8, 21.8, 30.4, 38.7, 38.7, 45.3 | 4900, 10600, 17400, 17400, 24300, 30900, 30900, 36200 |
| hard | 6.2, 13.5, 21.9, 21.9, 30.7, 39.0, 39.0, 45.8 | 4900, 10700, 17500, 17500, 24500, 31200, 31200, 36600 |

  A run that reports any shortcut is held to the shortcut road's floors: they are the lowest, so an
  honest run is never refused, and the room server still checks the owl's course book. The ride
  itself is the server's: it sets the owl's state on the lift's arrival line and banks the bands it
  passed at that moment.
- **The brisk feathers** are not paid for a band the lift carried an owl through.

## 6. Time

| View | Pilot, main road (s) | Pilot, high road (s) | First clear, estimated (s) |
| --- | ---: | ---: | ---: |
| 1a The foot, low | 5.5 | 5.5 | 14 |
| 1b The foot, high | 5.5 | 5.5 | 16 |
| 2a The walls, low | 5.4 | 3.3 | 24 |
| 2b The walls, high | 5.4 | 3.2 | 24 |
| 3a The lanterns, low | 5.5 | 3.3 | 22 |
| 3b The lanterns, high | 5.5 | 3.3 | 24 |
| 4a The moths, low | 6.2 | 3.5 | 24 |
| 4b The moths, high | 6.1 | 3.5 | 24 |
| 5a Frail glass, low | 7.4 | 4.5 | 26 |
| 5b Frail glass, high | 7.3 | 4.5 | 26 |
| 6a The clouds, low | 6.9 | 4.8 | 26 |
| 6b The clouds, high | 6.9 | 4.9 | 28 |
| 7a Above the clouds, low | 5.5 | 3.2 | 26 |
| 7b Above the clouds, high | 5.4 | 3.2 | 26 |
| 8a The summit, low | 6.7 | 3.9 | 28 |
| 8b The summit, high | 6.6 | 3.9 | 30 |
| **Total** | **97.8** | **63.9** | **388 (6:28)** |
| Optional: the pane room | | | +25 |

The first-clear estimate is the main road's pilot time about four times over, for reading each set
piece, waiting on lanterns and moths, and a shade or two a band (a shade costs the climb back from
the last bench).

The two new bands are estimated the same way as the rest: their pilot times are close to bands 3
to 6's, and so are their set pieces.

**Against the course rules:** about 6:28 for a first clear, close to seven, and about 6:53 with the
hidden pane room. With every shortcut, about 65 s (the pilot's best 45.3 s), short of two and a half
minutes, because the two rides carry an owl past four of the eight bands; the rides' speed is the
knob if the owner wants it longer (at 150 px/s each takes 16 s). The gold time (1:00) is under two.

## 7. Build notes

- Every change in section 4 is layout data in `climbCity.ts` plus four small pieces of `climb.ts`:
  pickups (feathers), a ride (the lift), ledges that appear for an owl that opened them (the rungs),
  and a second field (the pane room). The pilot and `climb.test.ts` cover the rest.
- The lift, its top stop and the ladder are kept per owl for good, in the course book
  (`coursebook.ts`, PR 72), like the tree courses' shortcuts.
- Bands 7 and 8 are layout data in `climbCity.ts` (section 4.9) and the constants in section 5.
  Most of the page and the room server read `BAND_COUNT` and follow it (`ClimbScene.ts`'s band
  marks, `sqlClimbStore.ts`'s bounds); two words do not: `climbScreen.ts` says "At the clouds" for a
  run that banked every band and "Six storeys to the clouds" on the start screen, and both change
  ("At the summit", "Eight storeys to the summit").
- Art: the act arches, the lift car and its shaft on the tower's outside, the rungs, the sill and
  the pane, the lamp moth, the shrine, and two more tower glass pieces for bands 7 and 8. The tower's
  glass pieces (`climb-*`) are the owner's to pick, as now.
