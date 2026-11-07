# Brushstroke Bridges: the ink-wash realm's course

- Status: BUILT FROM THE KIT, keepers only (OP-235): its five rooms, the brush stones, the rain and the four seals, drawn from the ink-wash kit with no new art. Not built yet: the three shortcuts (the bamboo, the ferry raft, the crane), the painter's lines and the painting's last stroke, the misty stair past the pavilion, and the reward (the scarf and the emote are stand-ins).
- Verified against: main 503b9bf (2026-11-02); every hop re-measured with both flaps (the triple jump, OP-239) on 2026-11-04; eased for younger players and measured again on 2026-11-07 (section 10)
- Code: `packages/shared/src/brush.ts` (the brush stones), `packages/shared/rooms/brushstrokeBridges.ts` (the rooms and the course), `apps/park/src/game/brushInk.ts` (the ink on the page). Built on `packages/shared/src/jump.ts`, `flight.ts`, `routes.ts` (`hopTier`), `perches.ts` (`MAX_PERCH_TOP`, `PERCH_SLACK`), `packages/shared/src/room.ts` and `packages/shared/rooms/index.ts` (`treeLedge`, `TREE_GROUND`, `CLOSED_SIGNS`)
- Tickets: OP-235, OP-239 (the triple jump: re-measured, section 9), OP-299 (eased for younger players, section 10)
- Related: `docs/levels/README.md` (the shared rules, the physics and how to read the tables), `docs/MAP.md` (the ink-wash realm's gate on level 1, section 3)

The ink-wash realm's course, after its Commons: through a paper garden, across a river in the rain
and up a mountain painted on a scroll, to the summit pavilion. Its one new mechanic is the brush
stone: land on one and it paints a bridge of ink the way its arrow points, and the bridge fades.
The plan is a buildable spec: every ledge is a `treeLedge` in its room, every bridge and tread is a
perch with a lifetime, and every hop is checked against the flight's own physics.

## 1. At a glance

- **Objective:** collect four red seals and stamp them on the scroll at the summit pavilion, which
  is the finish shrine.
- **Reward:** the ink-wash scarf, on the first clear.
- **Size:** three acts, ten screens (3 + 3 + 4), in five rooms joined by doors, plus the hidden room
  behind the waterfall (on every run: a seal is in it).
- **Times (estimates, section 7):** first clear 425 s (about 7 minutes); with every shortcut open
  139 s; a clean expert run 98 s. Gold time: **1:55**.
- **Down is left, up is right:** every room's way back is its left-hand door and its way on is at
  the right. In act 3 the mountain is climbed panel by panel: the door at the top right of a panel
  (the scroll's fold) leads to the foot of the next.

| Room | Act | Screens | Width | What it is |
| --- | --- | --- | ---: | --- |
| `brush-1` | 1, The Paper Garden | 1.1 to 1.3 | 4800 | Ponds and paper cliffs; seal 1; the crane; the unfinished painting; the bamboo |
| `brush-2` | 2, The Washing Rain | 2.1 to 2.3 | 4800 | The river in the rain, temple eaves, the waterfall; the ferry raft |
| `brush-falls` | 2 (hidden) | - | 1600 | Behind the falls: seal 2, the scroll of the Glass Tower, lost feather 3 |
| `brush-3a` | 3, The Mountain Scroll | 3.1, 3.2 | 3200 | The scroll's first panel: arrows back and up |
| `brush-3b` | 3 | 3.3, 3.4 | 3200 | The second panel: seals 3 and 4, the dash gap, the summit pavilion |

Act 3 is two rooms, not one, for the reason act 2 of the Updraft Canopy is three: no ledge may stand
higher than `MAX_PERCH_TOP` (540) over the ground line, so a mountain climbed for four screens is
two panels, each climbing from its foot to 540, joined at the fold.

## 2. What the course needs that the park does not have yet [PLANNED (OP-235)]

- **Brush stones.** A ledge with `arrow: 'R' | 'L' | 'U'`. Landing on it paints, at once:
  - **R or L (across, or back):** a bridge perch at the stone's top, `BRIDGE_LEN` (proposed 480 px)
    long, from the stone's right edge (R) or left edge (L).
  - **U (up):** three treads, each 160 px wide and centred over the stone, at the stone's top plus
    130, 260 and 390 (a Tier 1 step each), as many as fit under `MAX_PERCH_TOP`.
  - A painted perch lasts `BRIDGE_MS` (6000 ms since Nov 7; first 4000) from the landing, greys over its last
    second, then is gone; an owl on it falls, as off frail glass. Landing on the stone again paints
    it afresh. In act 2's rain it lasts `RAIN_BRIDGE_MS` (4000 ms since Nov 7; first 2000) unless its stone stands under an
    eave (a shelter span `{ x0, x1 }` under a roof), when it keeps the full `BRIDGE_MS`.
  - The room server must let an owl stand on a painted perch: each one is declared in the room data
    (as here, `k1~`, `k4~1` and so on), so `standingHeights` and `groundAt` know its top. Course
    rooms are shared (decided 2026-11-02), so a painted bridge is drawn for every owl in the
    room: the room tells everyone who painted what, and when, and no owl is seen standing on air.
    Any owl may stand on a bridge while it lasts, as on a gust in the Updraft Canopy. To settle when
    the room is built: whether owls riding one another's bridges past a brush stone needs a limit
    (only the painter stands on it); play tests decide.
- **Hazard floors.** The ponds, the river and the cloud mist send an owl that touches them back to
  its last safe ledge, as the climb's thorns do: time only. (The same new piece as the Updraft
  Canopy's, section 2 there.)
- **The dash.** The real one, from PR 72 (`dash.ts`): 162 px in 180 ms, once per jump, Shift on a
  computer and a button on a phone, only in courses; on a hop it adds 115 px, counted at 0.8 as +92
  (the README). The dash hop (`n2` to `n3`) is counted at that; a gap is shut only when it is past
  the full reach of the flight stepped through (and, where the dash must not cross it, that reach and
  the dash's 115 px), 10 px to spare.
- **Shortcuts that stay open, per owl:** the bamboo, the raft and the crane, kept for good in the
  course book (`coursebook.ts`, PR 72), as decided on 2026-11-02.
- **Seals.** A red seal is picked up by standing on its ledge; it counts for this run. The scroll at
  the pavilion takes four. Every shortcut keeps the seals on its path: the bamboo ends before seal 1,
  the raft lands below the falls (seal 2), the crane lands below seals 3 and 4.

## 3. Act 1: The Paper Garden

Three screens of ponds and paper cliffs. The beats: a bridge, two bridges in a row, then an upward
stroke. The shortcut is the bamboo stand on `c2`: push it from there (the far side) and it falls
west across to bench 1's cliff, `c1`, a bamboo bridge 1460 px long that skips the two bridges of
screen 1.2. The crane sleeps in the pond on screen 1.2: wake it (three hoots, standing beside it)
and it flies off up the mountain, where it is act 3's shortcut.

```text
brush-1
                                                     ==o=
                                                   ~~~
            =*                        P###
               ###B#%%%%%%%%%%%%%%%%%%%            ~~~

                         *
                                                   ~~~
                     ==~~~~~~===~~~~~~               ##E###D
   ###==~~~~~~                                     ===
D                        =C=
________^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^_______
|                   |                   |   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)
```

Key: `_` safe floor, `^` hazard floor, `=` ledge, `#` solid ledge, `~` painted bridge or tread
(fades), `%` the bamboo once it is down, `o` seal, `*` lost feather, `B` bench, `D` door, `C`
the crane, `E` the unfinished painting, `P` a push point, `W` the waterfall, `/` a temple eave
(painted on the temple behind the river: a shelter, not a perch), `c` a cloud bank (mist).

#### Room `brush-1` (4800 x 900, 3 screens)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 700 | safe: a paper path at the garden gate |
| 700 | 4300 | hazard: ink-wash water (back to the last safe ledge) |
| 4300 | 4800 | safe: the tea terrace's steps |

**Screen 1.1 The first stroke** (x 0 to 1600). Beat: Land on a brush stone and its arrow paints a bridge of ink: run it before it fades (4 s), then flap twice up the paper cliff. Time: 40 s on a first clear, 16 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `g1` | stepping stone (solid) | 300 | 700 | 120 | 70 | `path` | 70 | 0 | T1 | 122 |
| `k1` | brush stone, arrow right | 480 | 670 | 140 | 100 | `g1` | 30 | 60 | T1 | 133 |
| `k1~` | ink bridge from k1 | 620 | 670 | 480 | 100 | - | - | - | - | - |
| `reed1` | reed tuft, lost feather 1 | 1060 | 320 | 80 | 450 | `k1~` | 350 | 0 | T2b | 218 |
| `c1` | paper cliff, bench 1 (solid) | 1260 | 370 | 340 | 400 | `k1~` | 300 | 160 | T2b | 241 |

**Screen 1.2 Strokes in a row** (x 1600 to 3200). Beat: Bench 1. Two bridges back to back, each inside its 4 s. The crane asleep on its rock in the pond (wake it: an easter egg, and act 3's shortcut). Time: 45 s on a first clear, 7 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k2` | brush stone, arrow right | 1700 | 630 | 140 | 140 | `c1` | -260 | 100 | T1 | 187 |
| `k2~` | ink bridge from k2 | 1840 | 630 | 480 | 140 | - | - | - | - | - |
| `crane-rock` | the sleeping crane's rock | 2050 | 730 | 160 | 40 | `k2~` | -100 | 0 | T1 | 161 |
| `reed2` | reed tuft, lost feather 2 | 2000 | 520 | 80 | 250 | `k2~` | 110 | 0 | T1 | 106 |
| `k3` | brush stone, arrow right | 2360 | 650 | 140 | 120 | `k2~` | -20 | 40 | T1 | 145 |
| `k3~` | ink bridge from k3 | 2500 | 650 | 480 | 120 | - | - | - | - | - |
| `bamboo` | the bamboo bridge, once pushed down (shortcut) | 1600 | 370 | 1500 | 400 | `c1` | 0 | 0 | T1 | 141 |
| `c2` | paper cliff; the bamboo stand (solid) | 3100 | 350 | 300 | 420 | `k3~` | 300 | 120 | T2b | 241 |

**Screen 1.3 The upward stroke** (x 3200 to 4800). Beat: A long glide down off the cliff to an arrow pointing up: it paints three treads above its stone; climb them before they fade. Seal 1, then the tea terrace and the unfinished painting. Time: 40 s on a first clear, 16 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k4` | brush stone, arrow up | 4100 | 670 | 160 | 100 | `c2` | -320 | 700 | T3 | 1851 |
| `k4~1` | ink tread 1 over k4 | 4100 | 540 | 160 | 230 | - | - | - | - | - |
| `k4~2` | ink tread 2 over k4 | 4100 | 410 | 160 | 360 | - | - | - | - | - |
| `k4~3` | ink tread 3 over k4 | 4100 | 280 | 160 | 490 | - | - | - | - | - |
| `c3` | high ledge, red seal 1 | 4540 | 230 | 260 | 540 | `k4~3` | 50 | 280 | T2b | 294 |
| `t1` | the tea terrace (solid) | 4300 | 610 | 500 | 160 | `c3` | -380 | 0 | T1 | 203 |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `k1~` to `reed1` | 350 | 0 | T2b | 218 | straight up off the bridge, both flaps |
| `c2` to `k4` | -320 | 700 | T3 | 1851 | a long glide down off the cliff to the upward stroke |
| `c1` to `bamboo` | 0 | 0 | T1 | 141 | the shortcut, once open |
| `bamboo` to `c2` | 20 | 0 | T1 | 136 |  |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `to-commons`: back to the ink-wash realm's Commons (down is left) | 40 | 0 |
| * | lost feather 1, on `reed1`, straight up from k1's bridge | 1100 | 450 |
| B | bench 1, on `c1` | 1500 | 400 |
| C | the sleeping crane on `crane-rock`: three hoots (emotes) standing beside it wake it, and it flies off up the mountain (stored per owl) | 2130 | 40 |
| * | lost feather 2, on `reed2`, straight up from k2's bridge | 2040 | 250 |
| P | the bamboo stand's push point on `c2`: Use drops the bamboo west to `c1` for this owl for good | 3120 | 420 |
| o | red seal 1, on `c3` | 4670 | 540 |
| E | the unfinished painting, on an easel on the terrace | 4400 | 160 |
| D | door `to-rain` on `t1`: the moon gate to act 2 (`brush-2`) | 4720 | 160 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the bridge from k1 | `k1` | `c1` | 300 | 640 | 363 | 455 |
| the bridge from k1 (to the reed) | `k1` | `reed1` | 350 | 440 | 306 | 421 |
| the bridge from k3 | `k3` | `c2` | 300 | 600 | 472 | 587 |
| the treads from k4 | `c2` | `c3` | 120 | 1140 | 1014 | 1129 |
| the treads from k4 (from the stone) | `k4` | `c3` | 440 | 280 | over both flaps | - |
| the bridges (from bench 1) | `c1` | `c2` | 20 | 1500 | 1315 | 1430 |

**The unfinished painting.** On an easel on the tea terrace (x 4400): an ink landscape of this very
garden, one stroke missing where the river should be crossed. Looking at it (Use) the first time
lets the painter appear in act 2. After the owl's first clear, the painting has its last stroke: a
small owl on a bridge.

## 4. Act 2: The Washing Rain

Three screens of river in steady rain. Every bridge painted in the open fades in 2 s; a stone under
a temple eave keeps its bridge for 4 s. The beats: jump off a bridge part way, take shelter, then
two rain bridges with no shelter, one of them through the waterfall. Seal 2 is behind the falls, in
the hidden room. The shortcut is the ferry raft: it is tied up at the east dock, in plain sight
from the west dock, until an owl unties it there; from then on, `raft-w` (the west dock) is a 12 s
crossing to the east dock, where a brush stone's treads (`kE`) lead back up to the falls.

```text
brush-2
                                                    WWW

                                                  ===W=~~~
              ###                 *=                WWW
                  ///     /////                     WWW~~~
                                      ##            WWW
                                        ===~~~~~~   WWW~~~
                  ===~~~~~~                         WWW
       ==~~~~~~           ?=                        WWW==
D B  R                      ==~~~~~~                WWWR   D
______^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^_____
|                   |                   |   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)
```

#### Room `brush-2` (4800 x 900, 3 screens)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 500 | safe: the west ferry dock, bench 2 |
| 500 | 4400 | hazard: the river in the rain |
| 4400 | 4800 | safe: the east ferry dock |

Hazards and shelter (z is height over the ground line):

| kind | x0 | x1 | z0 | z1 | timing |
| --- | ---: | ---: | ---: | ---: | --- |
| shelter: temple eave 1, over `k7` | 1440 | 1680 | - | - | always |
| shelter: temple eave 2, over `porch` and `k8` | 2080 | 2440 | - | - | always |
| the waterfall, below the dry band | 4180 | 4360 | 0 | 430 | always |
| the waterfall, above the dry band | 4180 | 4360 | 600 | 940 | always |

The eaves are painted on the temple across the river, in the room's back layers: they keep the rain
off the stones under them, but they are not perches, so nothing invites an owl to stand on a roof.
The waterfall sends an owl back to its last safe ledge, as the river does, except in the dry band
behind it (z 430 to 600), where the ledge and `k10`'s bridge pass through.

**Screen 2.1 Rain** (x 0 to 1600). Beat: Rain: a bridge fades in 2 s. Jump off part way and flap twice up the rock pillar. Bench 2 on the west dock, the ferry raft moored across the river in plain sight. Time: 40 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k6` | brush stone, arrow right (rain: its bridge fades in 2 s) | 560 | 680 | 120 | 90 | `dock-w` | 90 | 60 | T1 | 115 |
| `k6~` | ink bridge from k6 | 680 | 680 | 480 | 90 | - | - | - | - | - |
| `r1` | rock pillar (solid) | 1280 | 380 | 140 | 390 | `k6~` | 300 | 280 | T2b | 377 |
| `k7` | brush stone under eave 1 (sheltered: 4 s) | 1500 | 650 | 120 | 120 | `r1` | -270 | 80 | T1 | 188 |

**Screen 2.2 Shelter** (x 1600 to 3200). Beat: A stone under a temple eave paints a bridge that keeps its 4 s. The painter, a heron, on the porch step. Time: 40 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k7~` | ink bridge from k7 | 1620 | 650 | 480 | 120 | - | - | - | - | - |
| `porch` | a dry porch step under eave 2 | 2100 | 710 | 100 | 60 | `k7~` | -60 | 0 | T1 | 154 |
| `k8` | brush stone under eave 2 (sheltered: 4 s) | 2240 | 730 | 120 | 40 | `k7~` | -80 | 140 | T1 | 158 |
| `k8~` | ink bridge from k8 | 2360 | 730 | 480 | 40 | - | - | - | - | - |
| `post` | a mooring post (solid), lost feather 4 | 2960 | 390 | 60 | 380 | `k8~` | 340 | 120 | T2b | 276 |
| `r2` | rock pillar (solid) | 3060 | 510 | 140 | 260 | `k8~` | 220 | 220 | T2b | 263 |

**Screen 2.3 The falls** (x 3200 to 4800). Beat: Two rain bridges with no shelter, one through the waterfall: the ledge behind it hides the hidden room and seal 2. Untie the raft on the east dock. Time: 35 s on a first clear, 22 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k9` | brush stone (rain: 2 s) | 3260 | 570 | 120 | 200 | `r2` | -60 | 60 | T1 | 154 |
| `k9~` | ink bridge from k9 | 3380 | 570 | 480 | 200 | - | - | - | - | - |
| `k10` | brush stone (rain: 2 s) | 4040 | 230 | 120 | 540 | `k9~` | 340 | 240 | T2b | 276 |
| `k10~` | ink bridge from k10 | 4160 | 230 | 480 | 540 | - | - | - | - | - |
| `falls-ledge` | the ledge behind the waterfall | 4180 | 230 | 180 | 540 | `k10~` | 0 | 0 | T1 | 141 |
| `kE` | brush stone on the east dock, arrow up (rain: 2 s) | 4440 | 710 | 120 | 60 | `dock-e` | 60 | 0 | T1 | 125 |
| `kE~1` | ink tread 1 over kE | 4420 | 580 | 160 | 190 | - | - | - | - | - |
| `kE~2` | ink tread 2 over kE | 4420 | 450 | 160 | 320 | - | - | - | - | - |
| `kE~3` | ink tread 3 over kE | 4420 | 320 | 160 | 450 | - | - | - | - | - |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `k6~` (from x 1000) to `r1` | 300 | 280 | T2b | 377 | jump off at x 1000, about 1.2 s after landing on k6, inside the 2 s, and flap twice |
| `k8~` to `post` | 340 | 120 | T2b | 276 | both flaps off the bridge's end; the post stands in the river past it, and every way on to `r2` goes over it |
| `k9~` (from x 3800) to `k10` | 340 | 240 | T2b | 276 | jump off at x 3800, about 1.6 s along the bridge, inside the 2 s, and flap twice |
| `k10~` to `dock-e` | -540 | 0 | T1 | 210 | walk on through the dry band past the falls and drop to the dock |
| `dock-e` to `kE` | 60 | 0 | T1 | 125 | the raft run: off the raft, up the treads to the falls |
| `kE` to `kE~2` | 260 | 0 | T2b | 253 | both flaps, straight to the second tread |
| `kE~3` to `falls-ledge` | 90 | 60 | T1 | 117 | hop west off the top tread, up into the dry band behind the falls |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `back`: back to `brush-1` | 40 | 0 |
| B | bench 2 | 200 | 0 |
| R | door `raft-w`: the ferry raft's west mooring; the raft is tied up at the east dock, in plain view, until it is untied there | 420 | 0 |
| * | lost feather 4, on `post`, both flaps off the end of k8's bridge | 2990 | 380 |
| ? | the painter, a grey heron, on `porch` (secret character; there only after the owl has looked at the unfinished painting) | 2150 | 60 |
| W | the waterfall (x 4180 to 4360); door `falls` on `falls-ledge`, to the hidden room `brush-falls` | 4260 | 540 |
| R | door `raft-e` on the east dock: Use unties the raft and opens the crossing for this owl for good | 4460 | 0 |
| D | door `to-mountain`: the mountain gate, to act 3 (`brush-3a`) | 4740 | 0 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the bridge from k6 | `k6` | `r1` | 300 | 600 | 472 | 587 |
| the bridge from k8 | `k8` | `r2` | 220 | 700 | 555 | 647 |
| the bridge from k8 (to the post) | `k8` | `post` | 340 | 600 | 345 | 460 |
| the bridge from k9 | `k9` | `k10` | 340 | 660 | 345 | 460 |
| the treads from kE (the raft run) | `dock-e` | `falls-ledge` | 540 | 40 | over both flaps | - |

**Bridge timing in the rain.** Every rain hop above is checked in time as well as in reach. At 260
px/s an owl covers 520 px in 2 s, so each rain bridge is left within about 400 px of its stone: `k6`
at x 1000 (1.2 s), `k9` at x 3800 (1.6 s), `k10`'s at once (the ledge behind the falls starts where
the bridge does), and `kE`'s treads in two hops (both flaps to the second, then the third), about 1 s.
The sheltered bridges (`k7`, `k8`) are run to their ends, about 2.1 s, inside their 4 s.

**The secret character: the painter.** A grey heron in a straw hat shelters on the dry porch step
under eave 2, but only once the owl has looked at the unfinished painting in act 1. Talk: a line
about the painting (for the owner to word), and after the first clear, a second about the stroke
it finally has.

### The hidden room: behind the falls

The waterfall at x 4180 to 4360 hides a ledge at the height of `k10`'s bridge, and a glint shows
through the water. On it, the door `falls` leads into a cave: seal 2 on a shelf, a high shelf with
lost feather 3, and on the wall the scroll that shows the Glass Tower in ink (the course's nod to
the stained-glass realm).

#### Room `brush-falls` (1600 x 900, 1 screen, hidden)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 1600 | safe: a cave behind the falls |

**Hidden room** (x 0 to 1600).

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `seal-shelf` | stone shelf, red seal 2 | 700 | 570 | 200 | 200 | `cave` | 200 | 0 | T2 | 176 |
| `high-shelf` | high shelf, lost feather 3 | 1150 | 390 | 160 | 380 | `seal-shelf` | 180 | 250 | T2b | 272 |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `out`: back through the falls to `brush-2` | 100 | 0 |
| o | red seal 2, on `seal-shelf` | 800 | 200 |
| G | the scroll that shows the Glass Tower in ink, hung on the cave wall | 1000 | 0 |
| * | lost feather 3, on `high-shelf` | 1230 | 380 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the seal shelf | `cave` | `high-shelf` | 380 | 0 | over both flaps | - |

## 5. Act 3: The Mountain Scroll

Four screens on two panels of a hanging scroll. Arrows now point up, across and back: the first
panel is climbed right, back left, up and right again. The dash comes in once: the course's one
dash-only gap, on a dry stone (a brush stone with no ink
left) on the second. The shortcut is the crane: woken in act 1, it waits on the summit pavilion's
roof; meeting it there (the far side) sends it down to its perch at the mountain's foot, and from
then on it flies an owl from there over the first panel to the second's foot (10 s), below seals 3
and 4. An owl that never woke the crane has no act 3 shortcut, and the crane's perch stands empty
(it reads as a bare perch, not a way on).

```text
brush-3a
=*   ~~~          cccc             ###
        ===       cccc                =D
                  cccc
     ~~~          cccc ====
                  cccc
     ~~~          cccc     ==~~~~~~
                  cccc
     ==~~~~~~==   cccc
     ==~~~~~~  ==~~~~~~
D B C
_____^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
|                   |   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)

brush-3b
              ccccc            =o=  ##SX
    ~~~=oB=   ccccc
              ccccc
    ~~~       ccccc
              ccccc  ===
    ~~~       ccccc
              ccccc
              ccccc
    ===     ==~~~~~~
D
___^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
|                   |   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)
```

#### Room `brush-3a` (3200 x 900, 2 screens)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 400 | safe: the mountain's foot, bench 3 |
| 400 | 3200 | hazard: cloud mist (back to the last safe ledge) |

Hazards (z is height over the ground line):

| kind | x0 | x1 | z0 | z1 | timing |
| --- | ---: | ---: | ---: | ---: | --- |
| a cloud bank (mist, as the floor) | 1450 | 1750 | 100 | 940 | always |

**Screen 3.1 Back and up** (x 0 to 1600). Beat: Arrows now point back as well: right, back left, up, then the long glide down to a stone under a cloud bank. Bench 3; the crane's perch; lost feather 5 on a pine bough over the foot. Time: 45 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k11` | brush stone, arrow right | 420 | 670 | 120 | 100 | `foot` | 100 | 20 | T1 | 111 |
| `k11~` | ink bridge from k11 | 540 | 670 | 480 | 100 | - | - | - | - | - |
| `k12` | brush stone, arrow back (left) | 1060 | 620 | 120 | 150 | `k11~` | 50 | 40 | T1 | 128 |
| `k12~` | ink bridge from k12 | 580 | 620 | 480 | 150 | - | - | - | - | - |
| `k13` | brush stone, arrow up | 440 | 620 | 120 | 150 | `k12~` | 0 | 20 | T1 | 141 |
| `k13~1` | ink tread 1 over k13 | 420 | 490 | 160 | 280 | - | - | - | - | - |
| `k13~2` | ink tread 2 over k13 | 420 | 360 | 160 | 410 | - | - | - | - | - |
| `k13~3` | ink tread 3 over k13 | 420 | 230 | 160 | 540 | - | - | - | - | - |
| `pine` | pine bough over the foot, lost feather 5 | 40 | 230 | 100 | 540 | `k13~3` | 0 | 280 | T2b | 303 |
| `m1` | ledge on the scroll | 640 | 250 | 200 | 520 | `k13~3` | -20 | 60 | T1 | 145 |
| `k14` | brush stone, arrow right | 1200 | 710 | 120 | 60 | `m1` | -460 | 360 | T3 | 2187 |
| `k14~` | ink bridge from k14, under the cloud bank | 1320 | 710 | 480 | 60 | - | - | - | - | - |

**Screen 3.2 The long glide** (x 1600 to 3200). Beat: A bridge under the cloud bank, both flaps up a ledge, a bridge, both flaps up a crag, the fold. Time: 35 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `m2` | ledge on the scroll | 1900 | 510 | 160 | 260 | `k14~` | 200 | 100 | T2b | 618 |
| `k15` | brush stone, arrow right | 2080 | 510 | 120 | 260 | `m2` | 0 | 20 | T1 | 141 |
| `k15~` | ink bridge from k15 | 2200 | 510 | 480 | 260 | - | - | - | - | - |
| `m3` | crag (solid) | 2870 | 230 | 150 | 540 | `k15~` | 280 | 190 | T2b | 426 |
| `m4` | ledge at the fold | 3040 | 250 | 160 | 520 | `m3` | -20 | 20 | T1 | 145 |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `m1` to `pine` | 20 | 500 | T3 | 1035 | the other way to feather 5: a glide back west off the high ledge |
| `m1` to `k14` | -460 | 360 | T3 | 2187 | the long glide: down off the high ledge to the stone under the cloud bank |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `back`: back to `brush-2` | 40 | 0 |
| B | bench 3 | 200 | 0 |
| C | the crane's perch: once the crane has been woken in act 1 and met at the summit, Use here is a door to `brush-3b` spawn `crane` | 320 | 0 |
| * | lost feather 5, on `pine`, over the mountain's foot: both flaps west off k13's top tread, or a glide back from `m1` | 90 | 540 |
| D | door `fold` on `m4`: the scroll's fold, to `brush-3b` | 3100 | 520 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the back bridge and the treads | `k11` | `m1` | 420 | 100 | over both flaps | - |
| the treads | `k13` | `m1` | 370 | 80 | over both flaps | - |
| the treads (to the pine) | `k13` | `pine` | 390 | 300 | over both flaps | - |
| the bridge from k14 | `k14` | `m2` | 200 | 580 | the cloud bank: nothing off `k14` stays under it to its end | - |
| the bridge from k14 (from the high ledge) | `m1`, down under the cloud bank | `m2` | -260 | 1060 | the cloud bank: a glide under it meets the mist before its end | - |
| the bridge from k15 | `k15` | `m3` | 280 | 670 | 533 | 648 |
| the bridge from k15 (from m2) | `m2` | `m3` | 280 | 810 | 533 | 648 |

A row "in the air" is a glide the cloud bank stops. From the high ledge `m1` an owl glides a long
way (level, 1083 px with both flaps), so the cloud bank hangs over `k14`'s bridge from 100 px up to
above the room's top (z 940, past the highest an owl may be, 932). To get by, an owl must pass
under it, and there it is in the air with only its two flaps left: 222 px of lift, with no jump,
short of `m2`. A search of the flight step by step, flap by flap, finds no way past. Every other
row is a hop from a ledge, measured as in the README.

#### Room `brush-3b` (3200 x 900, 2 screens)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 300 | safe: the next panel's foot (and the crane's landing) |
| 300 | 3200 | hazard: cloud mist |

Hazards (z is height over the ground line):

| kind | x0 | x1 | z0 | z1 | timing |
| --- | ---: | ---: | ---: | ---: | --- |
| a cloud bank (mist, as the floor) | 1150 | 1500 | 100 | 940 | always |

**Screen 3.3 The next panel** (x 0 to 1600). Beat: Up the treads to seal 3 and bench 4, then down to a bridge under a cloud bank. Time: 30 s on a first clear, 14 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k16` | brush stone, arrow up | 360 | 660 | 160 | 110 | `terrace` | 110 | 60 | T1 | 106 |
| `k16~1` | ink tread 1 over k16 | 360 | 530 | 160 | 240 | - | - | - | - | - |
| `k16~2` | ink tread 2 over k16 | 360 | 400 | 160 | 370 | - | - | - | - | - |
| `k16~3` | ink tread 3 over k16 | 360 | 270 | 160 | 500 | - | - | - | - | - |
| `n1` | ledge, red seal 3, bench 4 | 620 | 250 | 200 | 520 | `k16~3` | 20 | 100 | T1 | 136 |
| `k18` | brush stone, arrow right | 1000 | 710 | 120 | 60 | `n1` | -460 | 180 | T1 | 213 |
| `k18~` | ink bridge from k18, under the cloud bank | 1120 | 710 | 480 | 60 | - | - | - | - | - |

**Screen 3.4 The dry stone** (x 1600 to 3200). Beat: A stone with no brush, a rising gap only the dash covers, seal 4, a last glide to the summit pavilion. Time: 35 s on a first clear, 16 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `n2` | a dry stone: the dash run-up | 1700 | 570 | 160 | 200 | `k18~` | 140 | 100 | T2 | 194 |
| `n3` | ledge past the dash gap, red seal 4 | 2220 | 230 | 200 | 540 | `n2` | 340 | 360 | D (dash) | 368 |
| `n4` | the summit pavilion's terrace (solid) | 2610 | 230 | 590 | 540 | `n3` | 0 | 190 | T2 | 224 |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `back`: back to `brush-3a` | 40 | 0 |
| o | red seal 3, on `n1` | 680 | 520 |
| B | bench 4, on `n1` | 780 | 520 |
| o | red seal 4, on `n3` | 2320 | 540 |
| S | the finish shrine: the scroll stamped with the four seals; the ink-wash scarf on a first clear; the woken crane waits on the roof | 3050 | 540 |
| X | a misty stair to a farther peak: a "maybe later" barrier with the sign `Hatching Soon` | 3180 | 540 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the treads from k16 | `terrace` | `n1` | 520 | 320 | over both flaps | - |
| the treads from k16 (from the stone) | `k16` | `n1` | 410 | 100 | over both flaps | - |
| the bridge from k18 | `k18` | `n2` | 140 | 580 | the cloud bank: nothing off `k18` stays under it to its end | - |
| the bridge from k18 (from the high ledge) | `n1`, down under the cloud bank | `n2` | -320 | 880 | the cloud bank: a glide under it meets the mist before its end | - |
| the dash (from the bridge) | `k18~` | `n3` | 480 | 620 | over both flaps | - |
| the dash | `n2` | `n3` | 340 | 360 | 345 | 460 |
| the dash gap at all (from the high ledge) | under the cloud bank (in the air, z 100) | `n3` | 440 | 720 | over both flaps (in the air) | - |

**The dash gap.** `n2` to `n3`: 360 px, rising 340. A jump, both flaps and a glide reach 345 px at
that rise at their very best, so the gap is shut by 15 px; the dash, counted at 0.8 as every hop is,
reaches 368, and at its best 460. The cloud bank over `k18`'s bridge stops the long glide from the
high ledge `n1`. `n2` is a dry stone: it looks like a brush stone with its ink gone,
so a visitor sees there is no bridge to wait for.

### The summit pavilion and the finish shrine

On the pavilion's terrace (`n4`) the scroll takes the four seals, one stamp each; the fourth stops
the clock and shows the time against the gold time. The ink-wash scarf is handed over on the first
clear. The woken crane stands on the roof.

## 6. The course rules, checked

| Rule | Where |
| --- | --- |
| Three acts of three or four screens, about ten in all, joined by doors | Act 1: 3 screens (`brush-1`); act 2: 3 (`brush-2`); act 3: 4 (`brush-3a`, `brush-3b`). Doors `to-rain`, `to-mountain` and `fold` |
| Four benches (ten since Nov 7, section 10) | Bench 1 (on `c1`), bench 2 (the west dock), bench 3 (the mountain's foot), bench 4 (on `n1`); since Nov 7 also 1b (on `c2`), 2b (on `r1`), 2c (on `r2`), 3b (on `m1`), 3c (on `m2`), 4b (on `n2`) |
| One shortcut per act, opened from its far side | The bamboo (pushed from `c2`), the raft (untied at the east dock), the crane (met at the summit) |
| One dash-only gap | `n2` to `n3` in screen 3.4; since Nov 7 a hard jump without the dash and an easy one with it (section 10) |
| Five lost feathers | 1: `reed1` (1.1); 2: `reed2` (1.2); 3: the hidden room's high shelf; 4: the mooring `post` (2.2); 5: `pine` (3.1) |
| One hidden room | `brush-falls`, behind the waterfall |
| One secret character | The painter, a heron, under eave 2 |
| One nod to another realm | The scroll of the Glass Tower in ink, in the hidden room |
| Easter eggs the owner asked for | The unfinished painting (act 1), the sleeping crane (act 1, then the act 3 shortcut), the Glass Tower scroll |
| A finish shrine | The scroll at the summit pavilion |
| Nothing looks explorable unless it is | The misty stair past the pavilion is barred and signed `Hatching Soon` (from `CLOSED_SIGNS`); the dry stone looks dry; the crane's perch is bare until the crane is woken; the temple eaves are painted behind the river, not perches |
| Down is left, up is right | Every way back is at a room's left, every way on at its right |

## 7. Time

Estimates, as for the Updraft Canopy: 6 s a screen at `WALK_SPEED` with no stops, more for first
looks, bridge timing and falls. The raft (12 s) and the crane (10 s) are fixed rides.

| Screen | First clear (s) | Shortcut run (s) | Best run (s) |
| --- | ---: | ---: | ---: |
| 1.1 The first stroke | 40 | 16 | 10 |
| 1.2 Strokes in a row | 45 | 7 | 6 |
| 1.3 The upward stroke | 40 | 16 | 10 |
| 2.1 Rain | 40 | skipped | skipped |
| 2.2 Shelter | 40 | skipped | skipped |
| 2.3 The falls | 35 | 22 | 14 |
| 3.1 Back and up | 45 | skipped | skipped |
| 3.2 The long glide | 35 | skipped | skipped |
| 3.3 The next panel | 30 | 14 | 9 |
| 3.4 The dry stone | 35 | 16 | 10 |
| The hidden room behind the falls (seal 2 is required, so the room is on every run) | 20 | 12 | 7 |
| Rides and doors (four doors on a first clear (1 to 2, the falls and back, 2 to 3a, the fold) about 2 s each; on a shortcut run the bamboo bridge, the raft (12 s) and the crane (10 s)) | 10 | 30 | 28 |
| The finish shrine (stamp the four seals on the scroll) | 10 | 6 | 4 |
| **Total** | **425 (7:05)** | **139 (2:19)** | **98 (1:38)** |

The gold time is set at **1:55**, under the two minutes the course rules ask for. The rides take 22 s
of any shortcut run, so the best run has less room than the other two courses; set the gold from
real runs once built.

## 8. Build notes and open questions

- **Blast radius.** The brush stones are new perches with a lifetime (`perches.ts`, and the room
  server's `standingHeights` must include them); the rain and the eaves are room data; the hazard
  floor is shared with the Updraft Canopy; the dash is PR 72's (`dash.ts`), unchanged here.
- **Bridges in a shared room** (section 2): course rooms are shared, so every owl sees every bridge.
- **Art.** Each room in the tree's six layers. The bridges, treads, stones, seals, the crane, the
  heron, the painting and the scroll are game sprites: ink strokes that the game draws and fades.
- **The ferry raft and the crane** are doors with a ride: the owl is carried, the clock runs, and
  the other owls see it ride. OPEN QUESTION: whether a ride carries one owl or several at once.

## 9. With the triple jump (OP-239)

In the tree an owl now has a jump and two flaps: 371 px straight up, not 260. A glide that starts
that high goes much farther: up a rise of 200 it reaches 603 px, not 275, and level it reaches
1083. This plan was first measured with one flap, so every hop table and every "what each
mechanic is for" table was measured again with both (a generator mirroring `hopTier` with
`roomFlaps` 2, the dash counted at +92 and checked at +130 where a gap must stay shut, and a
step-by-step search of the flight for the glides past the waterfall and the cloud banks). With
two flaps nine of the bridges and treads could be skipped, and both dash hops needed no dash.

The fixes, in the order this plan prefers them. First, height: the ledge each bridge leads to
now stands 220 to 300 px above its stone (a both-flaps hop off the bridge's end, far past a glide
from the stone itself), mostly by lowering the stones and raising the cliffs and pillars. Second,
hazards over the glide line: a cloud bank hangs over each of act 3's low bridges, so the long
glide from a high ledge has to pass under it, in the air with only two flaps (222 px). Third,
wider gaps, only where a ledge was already as high as it goes: the dash gap and the treads in
1.3. The main line keeps its Tier 1 steps; the climbs off the bridges' ends are now both-flaps
hops (T2b), which is what the triple jump is for.

| hop or check | with one flap (first plan) | the first plan with both flaps | now, with both flaps |
| --- | --- | --- | --- |
| without the bridge from k1: `k1` to `c1` | rise 180, gap 640: reach 323, shut | reach 651: open | `c1` raised to 400: rise 300, glide 363, dash 455 (and `reed1` raised to 450, and on Nov 5 moved 60 px east, out of a dash's reach from `k1`) |
| without the bridge from k3: `k3` to `c2` | rise 180, gap 580: 323, shut | 651: open | `c2` raised to 420, `k3` lowered to 120: rise 300, gap 560: 363, dash 455 |
| without the treads from k4: `c2` to `c3` | rise 180, gap 400: 323, shut | 651: open | `k4` and `c3` moved east past a long glide: rise 120, gap 930: 795, dash 887 |
| without the bridge from k6: `k6` to `r1` | rise 160, gap 620: 371, shut | 699: open | `r1` raised to 390: rise 300, gap 500: 363, dash 455 |
| without the bridge from k8: `k8` to `r2` | rise 130, gap 600: 443, shut | 771: open | `k8` lowered to 40: rise 220, gap 700: 555, dash 647 |
| without the bridge from k9: `k9` to `k10` | rise 180, gap 380: 323, shut | 651: open | `k10` raised to 440 and moved east: rise 240, gap 660: 507, dash 599 |
| without the bridge from k14: `m1` to `m2` | rise 20, gap 760: 707, shut | 1035: open | `k14` lowered to 60 under a cloud bank: from under it, rise 260 to `m2` |
| without the bridge from k15: `k15` to `m3` | rise 180, gap 640: 323, shut | 651: open | `m3` raised to 540, `k15` at 260: rise 280, gap 570: 411, dash 503 |
| without the bridge from k18: `k18` to `n2` | rise 100, gap 580: 515, shut | 843: open | `k18` lowered to 60: rise 280: 411, dash 503; a cloud bank stops the glide from `n1` |
| the expert's skip: `m2` to `m3` | rise -60, gap 920: glide 899, dash 991 | glide 1227: no dash needed | gone (Nov 5): `m2` lowered to 260, rise 280, gap 810, shut even with the dash |
| the dash gap: `n2` to `n3` | rise 200, gap 340: glide 275, dash 367 | glide 603: no dash needed | rise 340, gap 360: glide at best 345, dash 368 (Nov 5; at rise 200 and gap 650 a glide stepped through crossed) |
| the hidden room: `seal-shelf` to `high-shelf` | rise 180, gap 250: T3, 323 | T2b, 272 | unchanged; now a both-flaps hop |

Other changes that came with these. The temple eaves were perches; from eave 1 a glide now reaches
`r2` past the bridge from k8, so the eaves are painted behind the river and lost feather 4 moved
to a new mooring post off k8's bridge. Lost feather 5's pine stood where it let an owl skip the
bridge from k15; it moved over the mountain's foot in 3.1. `k13`'s treads now reach 540, three of
them. The waterfall is now a hazard but for a dry band at the ledge behind it, so `k10`'s bridge
is the way in. The README's note that the dash gap is 340 px is out of date for this course: it
is 360 px now, rising 340.

### Checked again, step by step (2026-11-05)

The tables above first counted a glide's reach at 0.8 of its best (`ROUTE_REACH`), the margin
`hopTier` keeps so a hop it calls possible is easy. That margin is right for a hop that must be
made and wrong for one that must stay shut: an owl that times its flaps well reaches the whole of
it. So every pair of ledges in every room was searched again with the real flight (`stepFlier` with
`ALL_FLIGHT`, 120 steps a second), over take-off points, a short or a held jump, both flaps at every
timing and a dash at every moment, with the bridges and treads left unpainted, the mist, the
waterfall and solid ledges in the way. The reach of a jump and both flaps at its best, up a rise:
1014 px at 120, 773 at 200, 533 at 280, 472 at 300, 345 at 340; a dash adds 115. Rows changed in
the tables above now give those full figures.

| what the search found | fix |
| --- | --- |
| `n2` to `n3` (the dash gap, rise 200, gap 650) needed no dash | `n2` lowered to 200, `n3` moved in: rise 340, gap 360; the terrace `n4` widened to meet it. The cloud bank still stops every way to `n2` but the bridge |
| `m2` to `m3` (the expert's dash skip) needed no dash, skipping the bridge from k15; `k15` to `m3` took the dash | the skip is gone: `m2` lowered to 260 and narrowed, `k15` and its bridge 80 px west, `m3` 20 px east: `k15` to `m3` is 670 px, past the dash's best 648 |
| `c2` to `c3` (rise 120, gap 930) skipped the treads from k4 | `c3` and seal 1 moved east to x 4540: gap 1140, past the dash's best 1129; the top tread to `c3` is a both-flaps hop |
| `k3` to `c2` (rise 300, gap 560) took the dash past the bridge from k3; so did `reed2` | `c2` 40 px east (the bamboo 40 px longer): gap 600; `reed2` lowered to 250 |
| `k1` to `reed1` took the dash past k1's bridge | `reed1` 60 px east: gap 440 |
| `k6` to `r1` (rise 300, gap 500) took the dash past the bridge from k6 | `r1` 100 px east: gap 600 |
| `r1` to `r2`, a long glide over the whole of screen 2.2, and `k8` to `r2` (rise 220, gap 700) skipped the bridges from k7 and k8 | the mooring post is solid now, up out of the river at x 2960: every glide on to `r2` has to clear its top, 1540 px from `r1` and 600 from `k8`, past the dash's best from both. Lost feather 4 on it is a both-flaps hop off the end of k8's bridge |
| `k9` to `k10` (rise 240, gap 660) took the dash past the bridge from k9, and the post reached `k10` | `k10`, its bridge and the ledge behind the falls raised to 540 (still in the dry band): rise 340 |

Every other "without" row holds, with the dash too. The time estimates (section 7) rest on screen
widths and the beats, which these moves change by about a second at most, so they stand. The
room sketches are not redrawn for these moves (the most, `c3`, is three characters); the tables are
the plan.

## 10. Easier for younger players (Nov 7)

The owner asked for this course to be one a 10 year old can beat in a few tries. Before, the
climbs off two bridges in act 2 landed for about one try in seven, the rain's ink ran out on the
way, the dash gap almost always needed the dash at its best, and a fall could mean a whole act
again. The owl's movement is unchanged; the course gives more room.

Measured with the real flight (`stepFlier` with `ALL_FLIGHT`), taking off from anywhere on the
bridge, over every timing of no flap, one or two flaps: the share of tries that land, at the best
take-off point, and the ink left when a slow owl walks from the stone to that point.

| hop | before | after | what changed |
| --- | --- | --- | --- |
| off k1's bridge to `c1` | 58%, rise 300 | 75%, rise 260 | `c1` lowered to 360 and 100 px east (narrowed to 260) |
| off k3's bridge to `c2` | 58%, rise 300 | 75%, rise 260 | `c2` lowered to 380 and 140 px east |
| off k6's bridge to `r1` (rain) | 58%, 0.2 s of ink left | 65%, 1.9 s left | `r1` lowered to 380, `k6` raised to 100 and 140 px west: rise 280 |
| off k8's bridge to the `post` (lost feather 4, a side ledge) | 14%, rise 340 | 58%, rise 300 | the post lowered to 340, the feather with it |
| from k9 up to `k10` (rain) | 14% off its bridge, 0.04 s of ink left | 97% off its top tread, 3.7 s left | `k9` paints treads (an up stone) instead of a bridge: two steps of 130, then a short hop up 80 |
| off k14's bridge to `m2` | 96%, but half the bridge ran under the cloud | 96%, the whole bridge clear | the cloud 50 px shorter |
| off k15's bridge to `m3` | 68%, rise 280 | 74%, rise 260 | `m3` lowered to 520, narrowed and 80 px east |
| the dash gap, `n2` to `n3` | 0.6% without the dash, 14% with it | 37% without, 57% with | `n2` raised to 260, `n3` and seal 4 150 px east: rise 280, gap 500 |
| ink | 4 s, 2 s in the rain | 6 s, 4 s in the rain | `BRIDGE_MS`, `RAIN_BRIDGE_MS` |
| benches | four: a fall could restart an act's room | ten: one on every screen past each act's first | section 6 |

Every other hop on the main line lands for 90 to 100% of tries, as before.

**Kept shut.** Each move was checked so a bridge is still needed: from each stone with nothing
painted, over every take-off point, flap timing and dash moment, the owl reaches none of `c1`,
`c2`, `r1`, `k10` or `m3`, and the updraft in 3.1 no longer glides on to `m3`. The dash skips
over the rain screen that were there before stay: from `r1` a well-timed dash reaches `k9` or the
post, and from k8's stone it reaches `r2`; none needs less than a dash.

**The art check.** The river's first and last screens sit at the edge of the kit's value bands
(`pnpm kit:check`), so `r1`, `k6` and `k9` were set where those screens still pass: `k9` stays at
200, which is why it paints treads now rather than standing higher.

**Falls onto a bench on a ledge.** A fall sends the owl to its last bench; for a bench up on a
ledge it now puts the owl on the ledge (`CourseBook.fall` returns its `top`, the room server and the
client stand the owl there). Before, the owl was put at the bench's x on the pit floor and fell
again. This also fixes bench 4 of the Updraft Canopy and bench 1 of the Blackout Circuit, which
stand on ledges too.

The README's shared rules (four benches, one dash-only gap) still hold for the other courses; this
course keeps a dash gap that a careful jump can also make.
