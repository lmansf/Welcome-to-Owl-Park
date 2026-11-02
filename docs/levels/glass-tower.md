# The Glass Tower: the stained-glass realm's course

- Status: the tower is BUILT as the stained-glass climb (`city-2`); this plan's changes are PLANNED (OP-225)
- Verified against: main 503b9bf (2026-11-02); times MEASURED by driving `climbPilot.ts` over `city-2` on that commit
- Code: `packages/shared/src/climb.ts` (the physics, `CLIMB_FLOORS`, `CLIMB_BRISK`), `packages/shared/src/climbCity.ts` (the layout and its two roads), `packages/shared/src/climbPilot.ts` (the scripted pilot), `apps/park/src/game/ClimbScene.ts` (the page), `designs/the-stained-glass-climb.md`
- Tickets: OP-225 (this plan), OP-116 (the climb)
- Related: `docs/levels/README.md`, `docs/ACTIVITIES.md` (the climb as an activity)

The stained-glass realm's course is the climb that already exists: a portrait tower of backlit glass,
six storeys (bands) of 1200 field px, each with a landing halfway up, a main road and from band 2 a
high road. This plan groups the bands into three acts, adds the glass lift and the course's
furniture (shortcuts, the dash-only gap, feathers, the hidden pane, the moth), and measures the
tower. Every addition below was put into the layout and driven with the climb's own pilot on all
three nights; the results are quoted with each one.

**Units here are the climb's, not the tree's:** field px, `y` up from the tower's foot, the field
480 wide (`CLIMB_FIELD_W`); a ledge is `{ x, y, w }` as `climbCity.ts` writes it (`ledge`,
`high`, `frail`). The tower has no 1600 x 900 screens; a **view** here is 600 field px of tower,
about what the page shows at once (`VIEW_H_MIN` 640 in `ClimbScene.ts`).

## 1. At a glance, and how long it is now

- **Objective:** climb to the clouds (band 6's line, `L6` at y 7200), where the finish shrine stands.
- **Reward:** the climb's own payouts, unchanged (`BAND_FEATHERS` and the brisk feathers).
- **Measured, the medium night** (the pilot drives each road's scripted route, `climb.test.ts`'s
  way): the main road reaches the clouds in **73.6 s** (68 moves), the high road in **49.7 s** (33
  moves). Easy: 72.9 s and 48.5 s. Hard: 70.2 s and 48.5 s. Per band, medium, main road: 11.0, 10.8,
  11.0, 12.2, 14.7, 13.8 s; high road: 11.0 (band 1 has none), 6.5, 6.6, 7.0, 9.0, 9.7 s.
- **The tower today:** 72 ledges, 14 walls, 4 thorn beds, 20 moths, 10 lanterns, 11 benches (6 band
  lines and 5 landings), 7200 field px tall.
- **Estimated first clear: 278 s, about 4.6 minutes** (section 6), not seven. With every
  shortcut below, about 50 s; the pilot's best with them, about 35 s. Gold time: **0:45**.
- **Twelve views,** four an act: more than the ten the course rules aim for, because each band is two
  views tall and the plan keeps all six bands.

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

**The dash in the tower is the climb's own 96 px dash, not the 260 px burst the tree courses assume.**
Another agent is building the courses' dash; if it replaces the climb's, the dash-only gap below must
be driven again: a 260 px burst is more than half the field, and the gap would still need it, but a
dash that long may carry an owl into the corridor's far wall of moths.

## 3. The acts

| Act | Bands | Views | Door at its top | Shortcut |
| --- | --- | --- | --- | --- |
| 1, The Foot and the Walls | 1 and 2 | 1a to 2b | a lit glass arch on `L2` (y 2400) | the pane ladder (band 1) |
| 2, Lanterns and Moths | 3 and 4 | 3a to 4b | a lit glass arch on `L4` (y 4800) | the glass lift, `L2` to `L4` |
| 3, Frail Glass and the Clouds | 5 and 6 | 5a to 6b | the clouds (`L6`), the finish shrine | the lift's upper stop, `L4` to `L5` |

The act doors are drawn on the band lines: the climb is one field, so a door is an arch the owl
passes through on the line, with the act's name, not a room change.

**Benches.** The tower has eleven. The course counts four as its checkpoints: `L2`, `B3` (y
3000), `L4` and `B5` (y 5400). OPEN QUESTION: whether the other seven stay benches (they catch
the shade and relight the panes today) or become glass sills that only relight the panes. This plan
leaves them as they are, so the climb's difficulty does not move.

Key to the sketches: `#` band line or landing (a bench), `=` main road, `-` high road, `~`
frail glass, `|` wall, `x` thorns, `m` a moth's track, `o` a lantern's hook; planned: `r` a
ladder rung, `R` the ladder's lever, `L` the lift, `S` a lift switch, `P` the hidden pane's sill,
`*` a lost feather, `M` the lamp moth, `F` the finish shrine. The left column is y.

### Act 1: The Foot and the Walls

```text
 2400 #######################L
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

### Act 2: Lanterns and Moths

```text
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
 2460                       S
 2400 #######################L
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

**View 4a: The moths, low** (y 3600 to 4200). Beat: Under a thorn ceiling there is no double jump: the corridor's gap is the dash-only gap. Time: 24 s on a first clear (the pilot's main road 6.1 s, high road 3.5 s).

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

**View 4b: The moths, high** (y 4200 to 4800). Beat: The second corridor, two moths to hop; the act door on `L4`, the lift's arrival. Time: 24 s on a first clear (the pilot's main road 6.1 s, high road 3.5 s).

| id | road | x | y | w | kind |
| --- | --- | ---: | ---: | ---: | --- |
| `c2` | main | 0 | 4320 | 480 | glass |
| `x2` | main | 0 | 4560 | 80 | glass |
| `h4d` | high | 400 | 4560 | 80 | glass |
| `m8` | main | 140 | 4640 | 120 | glass |
| `m9` | main | 300 | 4720 | 100 | glass |
| `L4` | both | 0 | 4800 | 480 | band line (bench) |

Hazards and walls: thorns x 100 to 400, y 4520 to 4544; moth x 120 to 400 at y 4350, 170 px/s; moth x 120 to 400 at y 4350, 170 px/s; moth x 400 to 470 at y 4440, 150 px/s; moth x 400 to 470 at y 4640, 160 px/s.

### Act 3: Frail Glass and the Clouds

```text
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
```

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

**View 5b: Frail glass, high** (y 5400 to 6000). Beat: The same, faster; the strand's frail holds and a pogo; the upper lift's arrival on `L5`. Time: 26 s on a first clear (the pilot's main road 7.3 s, high road 4.5 s).

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

**View 6b: The clouds, high** (y 6600 to 7200). Beat: Frail dashes among moths and a lantern, then the clouds and the finish shrine. Time: 28 s on a first clear (the pilot's main road 6.9 s, high road 4.9 s).

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

## 4. What changes [PLANNED (OP-225)]

### 4.1 Act 1's shortcut: the pane ladder

Five glass rungs up the tower's right edge, each `high(446, y, 34)`, at y 140, 280, 420, 560 and
830. They are not there until an owl throws the lever at the right end of `L1` (x 440, y 1200), the
top of band 1 (its far side); from then on they are, for that owl. The way up: straight up the four
rungs, onto `s6` (y 690), up to the fifth rung, a short hop left onto `s8` (y 960) and the main
road's last two moves to `L1`.

- Pilot: the ladder reaches `L1` in **6.3 s** against the main road's 11.0 s, on every night.
- Pilot: with the rungs in place both roads still drive clean and their times do not move.
- A rung at 970 broke the main road's dash to `s8` and was dropped; the rungs are 34 px wide at x
  446 so an owl on `s8` (which ends at 440) cannot land on one.

### 4.2 Act 2's shortcut: the glass lift

The switch is in band 2, as the owner asked: on `L2`'s right end (x 440, y 2400), at the top of
the strand's wall climb, so an owl that takes the high road through band 2 finds it. Throwing it
lights a glass car that stands on `L2` at x 400 to 480. On later runs an owl that steps in rides
up the outside of the tower to `L4` (y 4800) in **8 s** (2400 px at 300 px/s). The owl is in the
car, hazards do not touch it, the clock runs, and it steps out on `L4` beside act 3's arch. The
car is a ride, not a platform: `climb.ts` gains a lift `{ x, from, to, ms }` and a switch
`{ x, y }`, and the owl's state is set, not stepped, while it rides.

- It breaks the course rule that a shortcut opens from its far side: the owner put the switch in
  band 2, the lift's near side. The plan keeps the owner's placement and makes the switch an earned
  find on the high road.

### 4.3 Act 3's shortcut: the lift's upper stop

The second switch is at the clouds (on `L6` at x 440, y 7200), act 3's far side. Throwing it lets
the car go on from `L4` to `L5` (y 6000) in **4 s**, past band 5's frail glass. From `L5` the
owl climbs band 6 as usual.

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
  s (medium; it was 45.0), so `CLIMB_FLOORS` and `CLIMB_BRISK` must be frozen again.
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

### 4.6 The secret character: the lamp moth

A small glass moth with a lamp for a body, not a hazard (no hit circle), waits on `s9` (y 1060, the
top of band 1). The first time an owl stands there it follows, 50 px behind and 30 above. If the owl
ever pogoes off a moth, the lamp moth flies away for the rest of the run; a pogo off a lantern or
thorns does not count, and neither road's scripted route pogoes a moth, so either road can keep it.
If it reaches the clouds it settles on the finish shrine and the run's card says so. `stepClimb`'s
`pogo` event must say what was pogoed (`hazardAt` already knows).

### 4.7 Five lost feathers

Pickups at points in the field (an owl's box touching the point collects it):

| Feather | Point (x, y) | View | How |
| --- | --- | --- | --- |
| 1 | (30, 1110) | 1b | a hop left off `s9`, under `L1` |
| 2 | on the pane room's low shelf | the pane room | the hidden room |
| 3 | (440, 3960) | 4a | over `c1b`, past the dash gap |
| 4 | (470, 5220) | 5a | on the band 5 strand, beside the pogo lantern at (440, 5130): the high road's |
| 5 | (240, 7150) | 6b | a hop right off `g8`, under the clouds |

### 4.8 The finish shrine

On the clouds, `L6`, at x 240. Reaching `L6` ends the run as it does today; the shrine shows the
time against the gold time, the feathers found and whether the lamp moth came.

## 5. What the server must learn

- **Floors.** `plausibleBand` refuses a band reached faster than `CLIMB_FLOORS`. The ladder banks
  band 1 at 6.3 s, under its floor of 8.8 s; the lift banks bands 3 and 4 from `L2` in 8 s, so a
  run reaches band 4 at about 20 s against a floor of 24.8 s. Both would be refused as they stand.
  Fix: a third scripted road through the shortcuts, driven by `climb.test.ts` like the other two,
  and floors for runs that report the shortcuts they used; the room server checks that the owl's
  record has them open.
- **The brisk feathers** are not paid for a band the lift carried an owl through.
- **`BAND_COUNT`** stays 6; nothing here adds a band.

## 6. Time

| View | Pilot, main road (s) | Pilot, high road (s) | First clear, estimated (s) |
| --- | ---: | ---: | ---: |
| 1a The foot, low | 5.5 | 5.5 | 14 |
| 1b The foot, high | 5.5 | 5.5 | 16 |
| 2a The walls, low | 5.4 | 3.3 | 24 |
| 2b The walls, high | 5.4 | 3.2 | 24 |
| 3a The lanterns, low | 5.5 | 3.3 | 22 |
| 3b The lanterns, high | 5.5 | 3.3 | 24 |
| 4a The moths, low | 6.1 | 3.5 | 24 |
| 4b The moths, high | 6.1 | 3.5 | 24 |
| 5a Frail glass, low | 7.4 | 4.5 | 26 |
| 5b Frail glass, high | 7.3 | 4.5 | 26 |
| 6a The clouds, low | 6.9 | 4.8 | 26 |
| 6b The clouds, high | 6.9 | 4.9 | 28 |
| **Total** | **73.6** | **49.7** | **278 (4:38)** |
| Optional: the pane room | | | +25 |

The first-clear estimate is the main road's pilot time about four times over, for reading each set
piece, waiting on lanterns and moths, and a shade or two a band (a shade costs the climb back from
the last bench).

**Against the course rules:** about 4.6 minutes for a first clear, not seven; about 50 s with every
shortcut, not two and a half minutes; the gold time (0:45) is well under two. The tower is the
shortest of the three courses. **OPEN QUESTION** for the owner: keep it as the short course, or add
two storeys (bands 7 and 8, about 100 s more on a first clear, to roughly 6.5 minutes). Two storeys
would raise `BAND_COUNT` (a protocol change), need new floors and two more tower art pieces, and
give act 3 a fourth and fifth view.

## 7. Build notes

- Every change in section 4 is layout data in `climbCity.ts` plus four small pieces of `climb.ts`:
  pickups (feathers), a ride (the lift), ledges that appear for an owl that opened them (the rungs),
  and a second field (the pane room). The pilot and `climb.test.ts` cover the rest.
- The lift and the ladder are stored per owl, like the tree courses' shortcuts (the same OPEN
  QUESTION on where).
- Art: the act arches, the lift car and its shaft on the tower's outside, the rungs, the sill and
  the pane, the lamp moth, the shrine. The tower's six glass pieces (`climb-*`) are the owner's to
  pick, as now.
