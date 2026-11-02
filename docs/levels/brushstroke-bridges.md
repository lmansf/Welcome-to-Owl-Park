# Brushstroke Bridges: the ink-wash realm's course

- Status: PLANNED (OP-235). A level plan: nothing here is built.
- Verified against: main 503b9bf (2026-11-02)
- Code: none yet. Built on `packages/shared/src/jump.ts`, `flight.ts`, `routes.ts` (`hopTier`), `perches.ts` (`MAX_PERCH_TOP`, `PERCH_SLACK`), `packages/shared/src/room.ts` and `packages/shared/rooms/index.ts` (`treeLedge`, `TREE_GROUND`, `CLOSED_SIGNS`)
- Tickets: OP-235
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
  - A painted perch lasts `BRIDGE_MS` (proposed 4000 ms) from the landing, greys over its last
    second, then is gone; an owl on it falls, as off frail glass. Landing on the stone again paints
    it afresh. In act 2's rain it lasts `RAIN_BRIDGE_MS` (2000 ms) unless its stone stands under an
    eave (a shelter span `{ x0, x1 }` under a roof), when it keeps the full 4000 ms.
  - The room server must let an owl stand on a painted perch: each one is declared in the room data
    (as here, `k1~`, `k4~1` and so on), so `standingHeights` and `groundAt` know its top. OPEN
    QUESTION: whether a painted bridge is drawn for every owl in the room (the room tells everyone
    who painted what, and when) or only on the painter's page, where other owls would see a
    visitor standing on air.
- **Hazard floors.** The ponds, the river and the cloud mist send an owl that touches them back to
  its last safe ledge, as the climb's thorns do: time only. (The same new piece as the Updraft
  Canopy's, section 2 there.)
- **The dash.** Assumed: a sideways burst of about 260 px with no fall, once per jump, Shift on a
  computer and a button on a phone, only in courses. Another agent is building the real one;
  re-check the two dash hops (`n2` to `n3`, and the optional `m2` to `m3`) when it lands.
- **Shortcuts that stay open, per owl:** the bamboo, the raft and the crane. OPEN QUESTION: the same
  as the Updraft Canopy's, where the per-owl record lives.
- **Seals.** A red seal is picked up by standing on its ledge; it counts for this run. The scroll at
  the pavilion takes four. Every shortcut keeps the seals on its path: the bamboo ends before seal 1,
  the raft lands below the falls (seal 2), the crane lands below seals 3 and 4.

## 3. Act 1: The Paper Garden

Three screens of ponds and paper cliffs. The beats: a bridge, two bridges in a row, then an upward
stroke. The shortcut is the bamboo stand on `c2`: push it from there (the far side) and it falls
west across to bench 1's cliff, `c1`, a bamboo bridge 1520 px long that skips the two bridges of
screen 1.2. The crane sleeps in the pond on screen 1.2: wake it (three hoots, standing beside it)
and it flies off up the mountain, where it is act 3's shortcut.

```text
brush-1
                                               ==o=
                                            ~~~

           *               *           P### ~~~
           =   ###B#%%%%%%%%%%%%%%%%%%%
                                            ~~~
                              =~~~~~~~              ###E###D
      =~~~~~~~       ==~~~~~~               ===
D  ##                    =C=
________^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^________
|                   |                   |   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)
```

Key: `_` safe floor, `^` hazard floor, `=` ledge, `#` solid ledge, `~` painted bridge or tread
(fades), `%` the bamboo once it is down, `o` seal, `*` lost feather, `B` bench, `D` door, `C`
the crane, `E` the unfinished painting, `P` a push point.

#### Room `brush-1` (4800 x 900, 3 screens)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 700 | safe: a paper path at the garden gate |
| 700 | 4200 | hazard: ink-wash water (back to the last safe ledge) |
| 4200 | 4800 | safe: the tea terrace's steps |

**Screen 1.1 The first stroke** (x 0 to 1600). Beat: Land on a brush stone and its arrow paints a bridge of ink: run it before it fades (4 s), then flap up the paper cliff. Time: 40 s on a first clear, 16 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `g1` | stepping stone (solid) | 300 | 700 | 120 | 70 | `path` | 70 | 0 | T1 | 122 |
| `k1` | brush stone, arrow right | 480 | 670 | 140 | 100 | `g1` | 30 | 60 | T1 | 133 |
| `k1~` | ink bridge from k1 | 620 | 670 | 480 | 100 | - | - | - | - | - |
| `reed1` | reed tuft, lost feather 1 | 900 | 470 | 80 | 300 | `k1~` | 200 | 0 | T2 | 176 |
| `c1` | paper cliff, bench 1 (solid) | 1260 | 490 | 340 | 280 | `k1~` | 180 | 160 | T2 | 183 |

**Screen 1.2 Strokes in a row** (x 1600 to 3200). Beat: Bench 1. Two bridges back to back, each inside its 4 s. The crane asleep on its rock in the pond (wake it: an easter egg, and act 3's shortcut). Time: 45 s on a first clear, 7 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k2` | brush stone, arrow right | 1700 | 650 | 140 | 120 | `c1` | -160 | 100 | T1 | 172 |
| `k2~` | ink bridge from k2 | 1840 | 650 | 480 | 120 | - | - | - | - | - |
| `crane-rock` | the sleeping crane's rock | 2050 | 730 | 160 | 40 | `k2~` | -80 | 0 | T1 | 158 |
| `reed2` | reed tuft, lost feather 2 | 2160 | 440 | 80 | 330 | `k2~` | 210 | 0 | T2 | 172 |
| `k3` | brush stone, arrow right | 2400 | 610 | 140 | 160 | `k2~` | 40 | 80 | T1 | 131 |
| `k3~` | ink bridge from k3 | 2540 | 610 | 480 | 160 | - | - | - | - | - |
| `bamboo` | the bamboo bridge, once pushed down (shortcut) | 1600 | 490 | 1520 | 280 | `c1` | 0 | 0 | T1 | 141 |
| `c2` | paper cliff; the bamboo stand (solid) | 3120 | 430 | 300 | 340 | `k3~` | 180 | 100 | T2 | 183 |

**Screen 1.3 The upward stroke** (x 3200 to 4800). Beat: An arrow pointing up paints three treads above its stone; climb them before they fade. Seal 1, then the tea terrace and the unfinished painting. Time: 40 s on a first clear, 16 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k4` | brush stone, arrow up | 3560 | 670 | 160 | 100 | `c2` | -240 | 140 | T1 | 184 |
| `k4~1` | ink tread 1 over k4 | 3560 | 540 | 160 | 230 | - | - | - | - | - |
| `k4~2` | ink tread 2 over k4 | 3560 | 410 | 160 | 360 | - | - | - | - | - |
| `k4~3` | ink tread 3 over k4 | 3560 | 280 | 160 | 490 | - | - | - | - | - |
| `c3` | high ledge, red seal 1 | 3820 | 250 | 260 | 520 | `k4~3` | 30 | 100 | T1 | 133 |
| `t1` | the tea terrace (solid) | 4200 | 610 | 600 | 160 | `c3` | -360 | 120 | T1 | 201 |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `c1` to `bamboo` | 0 | 0 | T1 | 141 | the shortcut, once open |
| `bamboo` to `c2` | 60 | 0 | T1 | 125 |  |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `to-commons`: back to the ink-wash realm's Commons (down is left) | 40 | 0 |
| * | lost feather 1, on `reed1`, straight up from k1's bridge | 940 | 300 |
| B | bench 1, on `c1` | 1500 | 280 |
| C | the sleeping crane on `crane-rock`: three hoots (emotes) standing beside it wake it, and it flies off up the mountain (stored per owl) | 2130 | 40 |
| * | lost feather 2, on `reed2`, straight up from k2's bridge | 2200 | 330 |
| P | the bamboo stand's push point on `c2`: Use drops the bamboo west to `c1` for this owl for good | 3140 | 340 |
| o | red seal 1, on `c3` | 3950 | 520 |
| E | the unfinished painting, on an easel on the terrace | 4400 | 160 |
| D | door `to-rain` on `t1`: the moon gate to act 2 (`brush-2`) | 4720 | 160 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the bridge from k1 | `k1` | `c1` | 180 | 640 | 323 | 531 |
| the bridge from k3 | `k3` | `c2` | 180 | 580 | 323 | 531 |
| the treads from k4 | `c2` | `c3` | 180 | 400 | 323 | 531 |
| the bridges (from bench 1) | `c1` | `c2` | 60 | 1520 | 611 | 819 |

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

                             *                         ~~
                  =====    =====                   W
                                     ##       =~~~===~
                                                       ~~
                ##
                  ==~~~~~~  =~~~~~~~    =~~~~~~~       ~~
       =~~~~~~~               ?
D B  R                       ===                       R=  D
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

**Screen 2.1 Rain** (x 0 to 1600). Beat: Rain: a bridge fades in 2 s. Jump off part way and glide. Bench 2 on the west dock, the ferry raft moored across the river in plain sight. Time: 40 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k6` | brush stone, arrow right (rain: its bridge fades in 2 s) | 560 | 680 | 120 | 90 | `dock-w` | 90 | 60 | T1 | 115 |
| `k6~` | ink bridge from k6 | 680 | 680 | 480 | 90 | - | - | - | - | - |
| `r1` | rock pillar (solid) | 1300 | 520 | 140 | 250 | `k6~` | 160 | 300 | T3 | 371 |
| `roof1` | temple eave 1 (shelter beneath it) | 1460 | 350 | 400 | 420 | - | - | - | - | - |
| `k7` | brush stone under eave 1 (sheltered: 4 s) | 1500 | 610 | 120 | 160 | `r1` | -90 | 60 | T1 | 160 |

**Screen 2.2 Shelter** (x 1600 to 3200). Beat: A stone under a temple eave paints a bridge that keeps its 4 s. The painter, a heron, on the porch step. Time: 40 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k7~` | ink bridge from k7 | 1620 | 610 | 480 | 160 | - | - | - | - | - |
| `roof2` | temple eave 2 (shelter beneath it), lost feather 4 | 2200 | 330 | 360 | 440 | `k8~` | 240 | 0 | T2 | 157 |
| `k8` | brush stone under eave 2 (sheltered: 4 s) | 2240 | 570 | 120 | 200 | `k7~` | 40 | 140 | T2 | 217 |
| `k8~` | ink bridge from k8 | 2360 | 570 | 480 | 200 | - | - | - | - | - |
| `porch` | a dry porch step under eave 2 | 2380 | 710 | 160 | 60 | `k8~` | -140 | 0 | T1 | 168 |
| `r2` | rock pillar (solid) | 2960 | 440 | 160 | 330 | `k8~` | 130 | 120 | T2 | 197 |

**Screen 2.3 The falls** (x 3200 to 4800). Beat: Two rain bridges with no shelter, one through the waterfall: the ledge behind it hides the hidden room and seal 2. Untie the raft on the east dock. Time: 35 s on a first clear, 22 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k9` | brush stone (rain: 2 s) | 3200 | 570 | 120 | 200 | `r2` | -130 | 80 | T1 | 167 |
| `k9~` | ink bridge from k9 | 3320 | 570 | 480 | 200 | - | - | - | - | - |
| `k10` | brush stone (rain: 2 s) | 3700 | 390 | 120 | 380 | `k9~` | 180 | 140 | T2 | 183 |
| `k10~` | ink bridge from k10 | 3820 | 390 | 480 | 380 | - | - | - | - | - |
| `falls-ledge` | the ledge behind the waterfall | 4000 | 390 | 200 | 380 | `k10~` | 0 | 0 | T1 | 141 |
| `kE` | brush stone on the east dock, arrow up (rain: 2 s) | 4420 | 710 | 120 | 60 | `dock-e` | 60 | 0 | T1 | 125 |
| `kE~1` | ink tread 1 over kE | 4400 | 580 | 160 | 190 | - | - | - | - | - |
| `kE~2` | ink tread 2 over kE | 4400 | 450 | 160 | 320 | - | - | - | - | - |
| `kE~3` | ink tread 3 over kE | 4400 | 320 | 160 | 450 | - | - | - | - | - |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `k6~` to `r1` | 160 | 300 | T3 | 371 | jump off at x 1000, about 1.5 s after landing on k6, inside the 2 s |
| `k9~` to `k10` | 180 | 140 | T2 | 183 | jump off at x 3560, about 1 s along the bridge, and flap |
| `k10~` to `dock-e` | -380 | 450 | T3 | 1667 | jump off at x 3950 and glide down to the dock |
| `dock-e` to `kE` | 60 | 0 | T1 | 125 | the raft run: off the raft, up the treads to the falls |
| `kE~2` to `falls-ledge` | 60 | 200 | T2 | 213 |  |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `back`: back to `brush-1` | 40 | 0 |
| B | bench 2 | 200 | 0 |
| R | door `raft-w`: the ferry raft's west mooring; the raft is tied up at the east dock, in plain view, until it is untied there | 420 | 0 |
| * | lost feather 4, on `roof2`, straight up from k8's bridge through the eave | 2380 | 440 |
| ? | the painter, a grey heron, on `porch` (secret character; there only after the owl has looked at the unfinished painting) | 2460 | 60 |
| W | the waterfall (x 4000 to 4200); door `falls` on `falls-ledge`, to the hidden room `brush-falls` | 4100 | 380 |
| R | door `raft-e` on the east dock: Use unties the raft and opens the crossing for this owl for good | 4460 | 0 |
| D | door `to-mountain`: the mountain gate, to act 3 (`brush-3a`) | 4740 | 0 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the bridge from k6 | `k6` | `r1` | 160 | 620 | 371 | 579 |
| the bridge from k8 | `k8` | `r2` | 130 | 600 | 443 | 651 |
| the bridge from k9 | `k9` | `k10` | 180 | 380 | 323 | 531 |

**Bridge timing in the rain.** Every rain hop above is checked in time as well as in reach. At 260
px/s an owl covers 520 px in 2 s, so each rain bridge is left within about 400 px of its stone: `k6`
at x 1000 (1.5 s), `k9` at x 3560 (1.0 s), `k10` at x 3950 (0.9 s), `kE`'s second tread at once.
The sheltered bridges (`k7`, `k8`) are run to their ends, about 2.1 s, inside their 4 s.

**The secret character: the painter.** A grey heron in a straw hat shelters on the dry porch step
under eave 2, but only once the owl has looked at the unfinished painting in act 1. Talk: a line
about the painting (for the owner to word), and after the first clear, a second about the stroke
it finally has.

### The hidden room: behind the falls

The waterfall at x 4000 to 4200 hides a ledge at the height of `k10`'s bridge, and a glint shows
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
| `high-shelf` | high shelf, lost feather 3 | 1150 | 390 | 160 | 380 | `seal-shelf` | 180 | 250 | T3 | 323 |

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
| the seal shelf | `cave` | `high-shelf` | 380 | 0 | over a flap | - |

## 5. Act 3: The Mountain Scroll

Four screens on two panels of a hanging scroll. Arrows now point up, across and back: the first
panel is climbed right, back left, up and right again. The dash comes in twice: as an expert's skip
on the first panel and as the course's one dash-only gap, on a dry stone (a brush stone with no ink
left) on the second. The shortcut is the crane: woken in act 1, it waits on the summit pavilion's
roof; meeting it there (the far side) sends it down to its perch at the mountain's foot, and from
then on it flies an owl from there over the first panel to the second's foot (10 s), below seals 3
and 4. An owl that never woke the crane has no act 3 shortcut, and the crane's perch stands empty
(it reads as a bare perch, not a way on).

```text
brush-3a
        ====~~~~~~~ ===     ==       =D=
     ~~                           ###

     ~~
                         =~~~~~~~
     ==~~~~~~==

     =~~~~~~~
D B C
_____^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
|                   |   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)

brush-3b
       =oB                   o      ####
    ~~~                     ===

    ~~~
                     ==
    ~~~
            ==~~~~~~
    ===
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

**Screen 3.1 Back and up** (x 0 to 1600). Beat: Arrows now point back as well: right, back left, up, right again, to climb the scroll's first panel. Bench 3; the crane's perch. Time: 45 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k11` | brush stone, arrow right | 420 | 670 | 120 | 100 | `foot` | 100 | 20 | T1 | 111 |
| `k11~` | ink bridge from k11 | 540 | 670 | 480 | 100 | - | - | - | - | - |
| `k12` | brush stone, arrow back (left) | 1060 | 550 | 120 | 220 | `k11~` | 120 | 40 | T1 | 101 |
| `k12~` | ink bridge from k12 | 580 | 550 | 480 | 220 | - | - | - | - | - |
| `k13` | brush stone, arrow up | 440 | 530 | 120 | 240 | `k12~` | 20 | 20 | T1 | 136 |
| `k13~1` | ink tread 1 over k13 | 420 | 400 | 160 | 370 | - | - | - | - | - |
| `k13~2` | ink tread 2 over k13 | 420 | 270 | 160 | 500 | - | - | - | - | - |
| `m1` | ledge on the scroll | 640 | 250 | 200 | 520 | `k13~2` | 20 | 60 | T1 | 136 |
| `k14` | brush stone, arrow right | 900 | 250 | 120 | 520 | `m1` | 0 | 60 | T1 | 141 |
| `k14~` | ink bridge from k14 | 1020 | 250 | 480 | 520 | - | - | - | - | - |

**Screen 3.2 The long glide** (x 1600 to 3200). Beat: A bridge, a flap up a crag, the fold. An expert dashes straight from the high ledge to the crag. Time: 35 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `m2` | ledge on the scroll | 1600 | 230 | 240 | 540 | `k14~` | 20 | 100 | T1 | 136 |
| `k15` | brush stone, arrow right | 2000 | 470 | 120 | 300 | `m2` | -240 | 160 | T1 | 184 |
| `k15~` | ink bridge from k15 | 2120 | 470 | 480 | 300 | - | - | - | - | - |
| `pine` | pine bough, lost feather 5 | 2300 | 230 | 100 | 540 | `k15~` | 240 | 0 | T2 | 157 |
| `m3` | crag (solid) | 2760 | 290 | 200 | 480 | `k15~` | 180 | 160 | T2 | 183 |
| `m4` | ledge at the fold | 3000 | 250 | 200 | 520 | `m3` | 40 | 40 | T1 | 131 |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `m2` to `m3` | -60 | 920 | D (dash) | 1107 | the expert's dash skip past k15 |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `back`: back to `brush-2` | 40 | 0 |
| B | bench 3 | 200 | 0 |
| C | the crane's perch: once the crane has been woken in act 1 and met at the summit, Use here is a door to `brush-3b` spawn `crane` | 320 | 0 |
| * | lost feather 5, on `pine`, straight up from k15's bridge | 2350 | 540 |
| D | door `fold` on `m4`: the scroll's fold, to `brush-3b` | 3100 | 520 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the back bridge and the treads | `k11~` | `m1` | 420 | 0 | over a flap | - |
| the bridge from k14 | `m1` | `m2` | 20 | 760 | 707 | 915 |
| the bridge from k15 | `k15` | `m3` | 180 | 640 | 323 | 531 |

#### Room `brush-3b` (3200 x 900, 2 screens)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 300 | safe: the next panel's foot (and the crane's landing) |
| 300 | 3200 | hazard: cloud mist |

**Screen 3.3 The next panel** (x 0 to 1600). Beat: Up the treads to seal 3 and bench 4, then down to a bridge. Time: 30 s on a first clear, 14 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `k16` | brush stone, arrow up | 360 | 660 | 160 | 110 | `terrace` | 110 | 60 | T1 | 106 |
| `k16~1` | ink tread 1 over k16 | 360 | 530 | 160 | 240 | - | - | - | - | - |
| `k16~2` | ink tread 2 over k16 | 360 | 400 | 160 | 370 | - | - | - | - | - |
| `k16~3` | ink tread 3 over k16 | 360 | 270 | 160 | 500 | - | - | - | - | - |
| `n1` | ledge, red seal 3, bench 4 | 620 | 250 | 200 | 520 | `k16~3` | 20 | 100 | T1 | 136 |
| `k18` | brush stone, arrow right | 1000 | 570 | 120 | 200 | `n1` | -320 | 180 | T1 | 195 |
| `k18~` | ink bridge from k18 | 1120 | 570 | 480 | 200 | - | - | - | - | - |

**Screen 3.4 The dry stone** (x 1600 to 3200). Beat: A stone with no brush, a rising gap only the dash covers, seal 4, a last glide to the summit pavilion. Time: 35 s on a first clear, 16 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `n2` | a dry stone: the dash run-up | 1700 | 470 | 160 | 300 | `k18~` | 100 | 100 | T1 | 111 |
| `n3` | ledge past the dash gap, red seal 4 | 2240 | 270 | 200 | 500 | `n2` | 200 | 380 | D (dash) | 483 |
| `n4` | the summit pavilion's terrace (solid) | 2900 | 230 | 300 | 540 | `n3` | 40 | 460 | T3 | 659 |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `back`: back to `brush-3a` | 40 | 0 |
| o | red seal 3, on `n1` | 680 | 520 |
| B | bench 4, on `n1` | 780 | 520 |
| o | red seal 4, on `n3` | 2340 | 500 |
| S | the finish shrine: the scroll stamped with the four seals; the ink-wash scarf on a first clear; the woken crane waits on the roof | 3050 | 540 |
| X | a misty stair to a farther peak: a "maybe later" barrier with the sign `Hatching Soon` | 3180 | 540 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the treads from k16 | `terrace` | `n1` | 520 | 320 | over a flap | - |
| the bridge from k18 | `k18` | `n2` | 100 | 580 | 515 | 723 |
| the dash | `k18~` | `n3` | 300 | 640 | over a flap | - |
| the dash gap at all (from the high ledge) | `n1` | `n3` | -20 | 1420 | 803 | 1011 |

**The dash gap.** `n2` to `n3`: 380 px, rising 200. A jump, a flap and a glide reach 275 px at
that rise; with the dash, 483. `n2` is a dry stone: it looks like a brush stone with its ink gone,
so a visitor sees there is no bridge to wait for.

### The summit pavilion and the finish shrine

On the pavilion's terrace (`n4`) the scroll takes the four seals, one stamp each; the fourth stops
the clock and shows the time against the gold time. The ink-wash scarf is handed over on the first
clear. The woken crane stands on the roof.

## 6. The course rules, checked

| Rule | Where |
| --- | --- |
| Three acts of three or four screens, about ten in all, joined by doors | Act 1: 3 screens (`brush-1`); act 2: 3 (`brush-2`); act 3: 4 (`brush-3a`, `brush-3b`). Doors `to-rain`, `to-mountain` and `fold` |
| Four benches | Bench 1 (on `c1`), bench 2 (the west dock), bench 3 (the mountain's foot), bench 4 (on `n1`) |
| One shortcut per act, opened from its far side | The bamboo (pushed from `c2`), the raft (untied at the east dock), the crane (met at the summit) |
| One dash-only gap | `n2` to `n3` in screen 3.4; the `m2` to `m3` dash in 3.2 is an optional skip |
| Five lost feathers | 1: `reed1` (1.1); 2: `reed2` (1.2); 3: the hidden room's high shelf; 4: `roof2` (2.2); 5: `pine` (3.2) |
| One hidden room | `brush-falls`, behind the waterfall |
| One secret character | The painter, a heron, under eave 2 |
| One nod to another realm | The scroll of the Glass Tower in ink, in the hidden room |
| Easter eggs the owner asked for | The unfinished painting (act 1), the sleeping crane (act 1, then the act 3 shortcut), the Glass Tower scroll |
| A finish shrine | The scroll at the summit pavilion |
| Nothing looks explorable unless it is | The misty stair past the pavilion is barred and signed `Hatching Soon` (from `CLOSED_SIGNS`); the dry stone looks dry; the crane's perch is bare until the crane is woken |
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
  floor is shared with the Updraft Canopy; the dash is another agent's.
- **Bridges in a shared room** (section 2) is the main question for the owner and the build.
- **Art.** Each room in the tree's six layers. The bridges, treads, stones, seals, the crane, the
  heron, the painting and the scroll are game sprites: ink strokes that the game draws and fades.
- **The ferry raft and the crane** are doors with a ride: the owl is carried, the clock runs, and
  the other owls see it ride. OPEN QUESTION: whether a ride carries one owl or several at once.
