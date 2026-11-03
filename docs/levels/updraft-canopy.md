# Updraft Canopy: the Treehouse Clearing's course

- Status: PLANNED (OP-226). A level plan: nothing here is built.
- Verified against: main 503b9bf (2026-11-02)
- Code: none yet. Built on `packages/shared/src/jump.ts`, `flight.ts`, `routes.ts` (`hopTier`), `perches.ts` (`MAX_PERCH_TOP`), `packages/shared/src/room.ts` (`ROOM_W`, `ROOM_MAX_W`, a door's `top`) and `packages/shared/rooms/index.ts` (`treeLedge`, `TREE_GROUND`)
- Tickets: OP-226
- Related: `docs/levels/README.md` (the shared rules, the physics and how to read the tables), `docs/MAP.md` (the tree's rooms, ledges and doors)

The Treehouse Clearing's course, after its Commons: up through the fern floor, inside the hollow
trunk and out along the crown to the lookout hut. Its one new mechanic is the updraft: a column of
drifting leaves that lifts a gliding owl. The plan is a buildable spec. Every ledge is a
`treeLedge(id, x, x + w, top)` in its room, every hop is checked against the flight's own physics
(the README's numbers), and the check is in the tables.

## 1. At a glance

- **Objective:** ring five acorn bells this run; the fifth opens the lookout hut, where the finish
  shrine stops the clock.
- **Reward:** the Leaf Glider cape, on the first clear.
- **Size:** three acts, ten screens (3 + 3 + 4), in five rooms joined by doors, plus the hidden room
  under the roots and the hut.
- **Times (estimates, section 7):** first clear 435 s (about 7 minutes); a run with every shortcut
  open 136 s; a clean expert run 87 s. Gold time: **1:45**.
- **Down is left, up is right:** every room's way back is its left-hand door and its way on is at
  the right; inside the trunk the way up is a hatch at the top right of each storey.

| Room | Act | Screens | Width | What it is |
| --- | --- | --- | ---: | --- |
| `canopy-1` | 1, The Fern Floor | 1.1 to 1.3 | 4800 | Ferns, stumps and bramble; bells 1 and 2; the hollow log |
| `canopy-roots` | 1 (hidden) | - | 1600 | The hidden room: the miniature Hoot & Hop cabinet, lost feather 3 |
| `canopy-2a` | 2, Inside the Hollow Trunk | 2.1 | 1600 | The trunk's foot: bench 2, bell 3, the vine's foot |
| `canopy-2b` | 2 | 2.2 | 1600 | The owlet's storey |
| `canopy-2c` | 2 | 2.3 | 1600 | Under the crown: the vine's anchor |
| `canopy-3` | 3, The Crown Run | 3.1 to 3.4 | 6400 | Wind and updrafts, bells 4 and 5, the dash gap, the bough |
| `canopy-hut` | 3 (finish) | - | 1600 | The lookout hut: the finish shrine and the telescope |

Act 2 is three one-screen rooms, one per storey of the trunk, because a room is one screen high
(`ROOM_H` 900) and no ledge may stand higher than `MAX_PERCH_TOP` (540) over the ground line: a
three-screen vertical climb cannot fit in one room. Each storey's hatch is a door with a `top`.

## 2. What the course needs that the park does not have yet [PLANNED (OP-226)]

- **Updrafts.** A column `{ id, x, w, top, onMs, offMs, phase }`, from the ground line up to
  `top`. While a column is on, an owl inside it that is gliding (Jump held on the way down) eases
  its fall into a rise of `UPDRAFT_RISE` (proposed 240 px/s) with the glide's own ease
  (`GLIDE_EASE`), and hovers within 30 px of the top. Off, it lifts nothing and the owl simply
  glides. The leaves thin out for the last 750 ms of every "on", so a visitor sees the gust is about
  to drop. `phase` is the column's place in its cycle at park time 0, so every page sees the same
  gusts (`parktime.ts`). An always-on column has no timing. Columns do not refresh the flap: an owl
  that kept its flap can spend it at the top (lost feather 4 asks for exactly that).
  - The room server already allows it: `Room.ts` caps an owl's height at the room's highest top
    plus `MAX_RISE` (540 + 280 = 820 here), and every column tops out at 600 or below; `checkAir`
    takes a rise up to `JUMP_IMPULSE` (880 px/s).
  - Other pages carry an owl on with `carryOn`, which knows nothing of columns: `fall()` needs the
    room's columns (and park time), or the owl's page must send a new air state when it enters or
    leaves a column and when a gust switches.
- **Wind.** A span `{ x0, x1, push, onMs, offMs, phase }` adds `push` px/s to an airborne owl's
  speed across (+90 is a tailwind for an owl heading right, -110 a headwind). A hop's reach scales by
  (260 + push) / 260. Today a walk is sent at `WALK_SPEED`, so wind needs either a walk that carries
  its own speed or every page reckoning the push from park time.
- **Hazard floors and hazard boxes.** A floor span marked hazard (bramble, thorn roots, the drop) and
  a box `{ x0, x1, z0, z1 }` (thorn vines) send an owl that touches them back to its last safe ledge,
  as the climb's thorns do (`safeX`, `safeY` in `climb.ts`): it costs time, nothing else.
- **The dash.** The real one, from PR 72 (`dash.ts`): 162 px in 180 ms, once per jump, back when
  the owl stands on something, Shift on a computer and a button on a phone, only in courses. On a
  hop it adds 115 px across, counted at 0.8 as +92 (the README); every dash hop here is checked
  at that, and every gap the dash must not cross at +130.
- **Shortcuts that stay open.** The log, the vine and the bough open for one owl for good, from their
  far side. Each is a door pair (the log, the vine) or a perch (the bough) that is shut until that
  owl's record says it was opened. That record is the course book (`coursebook.ts`, PR 72), which
  keeps each owl's opened shortcuts for good (decided 2026-11-02).
- **Bells.** An acorn bell rings when an owl stands next to it on its ledge; it counts for this run
  only. The hut's door stays shut until this run has rung all five. Each shortcut leaves the bells on
  its path: the log ends under bell 2, the vine starts after bell 3, the bough leaves bells 4 and 5
  ahead of it.

## 3. Act 1: The Fern Floor

Three screens on the clearing's floor, left to right. Bells 1 and 2. The shortcut is the hollow log:
its east mouth is plugged until an owl kicks the clod out from the east (Use beside it); from then
on, `log-west` (right after bell 1) leads straight to `log-east` (under bell 2) and skips the
switching gusts of screens 1.2 and 1.3.

```text
canopy-1
               !! o                ||===   ||===xx|| ===
               !!===       ||      ||      ||   xx||
               !!   *      ||      ||      ||     ||
=*             !!   ==     || ===  ||      ||     ||
               !!          ||      ||   ===||   ==||
             ==!!          ||      ||      ||     ||
      ###===   !!          ||      ||      ||     ||
   ###         !!        ##||      ||      ||     ||
D              !!  L  B    ||      ||      ||     || L   H D
________^^^^^^^^^^_______^^^^^^^^^^^^^^^^^^^^^^^^^^^________
|                   |                   |   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)
```

Key: `_` safe floor, `^` hazard floor, `=` ledge, `#` solid ledge, `|` updraft that switches,
`!` updraft always on, `x` thorns, `o` bell, `*` lost feather, `B` bench, `D` door, `L` the
log's mouths, `H` the hidden room's door.

#### Room `canopy-1` (4800 x 900, 3 screens)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 700 | safe: moss at the course gate |
| 700 | 1500 | hazard: bramble |
| 1500 | 2000 | safe: moss: the log's west mouth, bench 1 |
| 2000 | 4200 | hazard: bramble |
| 4200 | 4800 | safe: moss among the trunk's roots |

Hazards and wind (z is height over the ground line):

| kind | x0 | x1 | z0 | z1 | timing |
| --- | ---: | ---: | ---: | ---: | --- |
| hanging thorns | 3880 | 4000 | 450 | 700 | always |

**Screen 1.1 The fern gate** (x 0 to 1600). Beat: Jump and step: stumps are Tier 1 and the bramble floor sends an owl back to its last ledge. Then the first updraft, always on: glide into the leaves and they carry you to bell 1. Time: 40 s on a first clear, 18 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `s1` | stump (solid) | 300 | 680 | 160 | 90 | `moss-gate` | 90 | 0 | T1 | 115 |
| `s2` | stump (solid) | 520 | 570 | 140 | 200 | `s1` | 110 | 60 | T1 | 106 |
| `fern-hi` | high fern, lost feather 1 | 40 | 440 | 120 | 330 | `s2` | 130 | 360 | T3 | 443 |
| `f1` | fern frond | 760 | 570 | 180 | 200 | `s2` | 0 | 100 | T1 | 141 |
| `f2` | fern frond | 1050 | 510 | 160 | 260 | `f1` | 60 | 110 | T1 | 125 |
| `b1` | branch, acorn bell 1 | 1420 | 270 | 160 | 500 | `U1` | -80 | 40 | U (glide off) | 192 |
| `U1` | updraft, always on | 1260 | - | 120 | 580 | `f2` | 0 | 50 | T1 into U1 | 141 |

**Screen 1.2 The switching gusts** (x 1600 to 3200). Beat: Updrafts switch: on for 3 s, off for 2 s, and the leaves thin out for the last 0.75 s before a gust drops. Bench 1 sits at the log's west mouth, plugged until later. Time: 40 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `fern-bench` | fern over the bench, lost feather 2 | 1600 | 410 | 140 | 360 | `l5` | 0 | 660 | T3 | 755 |
| `s4` | stump (solid) | 2000 | 650 | 160 | 120 | `moss-log` | 120 | 0 | T1 | 101 |
| `l5` | branch | 2400 | 410 | 200 | 360 | `U2` | -120 | 60 | U (glide off) | 288 |
| `l6` | branch | 3000 | 230 | 200 | 540 | `U3` | -60 | 80 | U (glide off) | 144 |
| `U2` | updraft, on 3 s / off 2 s, phase 0 | 2220 | - | 120 | 480 | `s4` | 0 | 60 | T1 into U2 | 141 |
| `U3` | updraft, on 3 s / off 2 s, phase 0.5 | 2800 | - | 120 | 600 | `l5` | 0 | 200 | T2 into U3 | 224 |

**Screen 1.3 Two gusts out of step** (x 3200 to 4800). Beat: Two updrafts that alternate: ride one, drop low under the hanging thorns, catch the other. Bell 2, the log's east mouth (kick it open), the tiny door among the roots. Time: 40 s on a first clear, 15 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `l7` | branch | 3250 | 470 | 140 | 300 | `l6` | -240 | 50 | T1 | 184 |
| `l8` | branch | 3640 | 230 | 140 | 540 | `U4` | -40 | 60 | U (glide off) | 96 |
| `l9` | branch under hanging thorns | 3880 | 490 | 120 | 280 | `l8` | -260 | 100 | T1 | 187 |
| `b2` | branch, acorn bell 2 | 4240 | 230 | 200 | 540 | `U5` | -60 | 60 | U (glide off) | 144 |
| `U4` | updraft, on 2.5 s / off 2.5 s, phase 0 | 3460 | - | 120 | 580 | `l7` | 0 | 70 | T1 into U4 | 141 |
| `U5` | updraft, on 2.5 s / off 2.5 s, phase 0.5 | 4060 | - | 120 | 600 | `l9` | 0 | 60 | T1 into U5 | 141 |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `moss-roots` to `U5` | 0 | 20 | T1 into U5 | 141 | the log run: out of the log's east mouth and up |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `to-commons`: back to the Treehouse Clearing's Commons (down is left) | 40 | 0 |
| * | lost feather 1, on `fern-hi` | 100 | 330 |
| o | acorn bell 1, on `b1` | 1500 | 500 |
| L | door `log-west`: the hollow log's west mouth, plugged with a clod until it is kicked open from the east | 1560 | 0 |
| * | lost feather 2, on `fern-bench` | 1670 | 360 |
| B | bench 1 | 1800 | 0 |
| o | acorn bell 2, on `b2` | 4340 | 540 |
| L | door `log-east`: the log's east mouth; kicking the clod out opens the pair for this owl for good | 4300 | 0 |
| H | door `roots`: the tiny door among the roots, to the hidden room `canopy-roots` | 4560 | 0 |
| D | door `to-trunk`: the crack in the trunk, to act 2 (`canopy-2a`) | 4740 | 0 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the updraft U1 | `f2` | `b1` | 240 | 210 | 179 | 271 |
| the updraft U2 | `s4` | `l5` | 240 | 240 | 179 | 271 |
| the updraft U3 | `l5` | `l6` | 180 | 400 | 323 | 415 |
| the updraft U4 | `l7` | `l8` | 240 | 250 | 179 | 271 |
| the updraft U5 | `l9` | `b2` | 260 | 240 | over a flap | - |

### The hidden room: under the roots

The tiny door (`roots`, x 4560 in `canopy-1`) is an owl's height and a half tall, half hidden by
a fern, with a warm light behind its crack: something an owl would try. Inside is a dry den with
the miniature Hoot & Hop cabinet and lost feather 3 on a root shelf. OPEN QUESTION: whether the
cabinet only lights up and plays its tune, or runs a practice round of Hoot & Hop that pays nothing.

#### Room `canopy-roots` (1600 x 900, 1 screen, hidden)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 1600 | safe: a dry den under the roots |

**Hidden room** (x 0 to 1600).

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `shelf` | root shelf, lost feather 3 | 900 | 570 | 200 | 200 | `den` | 200 | 0 | T2 | 176 |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `out`: back through the tiny door to `canopy-1` | 80 | 0 |
| C | the miniature Hoot & Hop cabinet | 600 | 0 |
| * | lost feather 3, on `shelf` | 1000 | 200 |

## 4. Act 2: Inside the Hollow Trunk

Three storeys, one room each, climbed left to right and up through a hatch at the top right. The
climb is timed updrafts and thorn vines. Bell 3 sits on a side branch in the first storey that only
the dash reaches. The shortcut is the vine: its anchor is on the crown hatch ledge at the top of
storey 3, and Use there drops it; from then on, the vine's foot in storey 1 (`vine-foot`, x 1530)
leads straight to the top (`canopy-2c`, spawn `vine-top`). Bell 3 comes before the vine, so a
shortcut run still rings it.

```text
canopy-2c
           || ======
           ||
           ||
      ||== ||x
      ||   ||x
      ||   ||x
      ||   ||x
    ==||   ||x
D     || X ||x
___^^^^^^^^^^x^^^^^^
|   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)

canopy-2b
            x||  D
            x||====
   =*   || ? ||
        ||== ||
        ||   ||
        ||   ||
        ||   ||
     == ||   ||
 D      ||   ||
_____^^^^^^^^^^^^^^^
|   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)

canopy-2a
                 =D=
 =o        ||===
           ||
          x||
          x||
       ===x||
          x||
   ====    ||
D B        ||      V
____________________
|   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)
```

The three storeys stacked as an owl climbs them (2c on top). The trunk's own floor in 2a is safe; in
2b and 2c a fall lands in thorn roots and goes back to the last ledge.

#### Room `canopy-2a` (1600 x 900, 1 screen)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 1600 | safe: the trunk's floor (a fall costs the climb, nothing else) |

Hazards and wind (z is height over the ground line):

| kind | x0 | x1 | z0 | z1 | timing |
| --- | ---: | ---: | ---: | ---: | --- |
| thorn vine | 820 | 900 | 200 | 420 | always |

**Screen 2.1 The trunk's foot** (x 0 to 1600). Beat: Inside the trunk the climb is vertical: ring shelves, a gust that switches, a flap over a thorn vine. Bell 3 waits on a side branch only the dash reaches. Time: 55 s on a first clear, 20 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `t1` | ring shelf | 300 | 640 | 220 | 130 | `trunk-a` | 130 | 0 | T1 | 95 |
| `t2` | ring shelf | 600 | 520 | 180 | 250 | `t1` | 120 | 80 | T1 | 101 |
| `b3` | side branch, acorn bell 3 | 140 | 320 | 120 | 450 | `t2` | 200 | 340 | D (dash) | 367 |
| `t3` | ring shelf | 1100 | 310 | 200 | 460 | `U6` | -60 | 60 | U (glide off) | 144 |
| `t4` | ring shelf under the hatch | 1360 | 250 | 200 | 520 | `t3` | 60 | 60 | T1 | 125 |
| `U6` | updraft, on 3 s / off 2 s, phase 0 | 920 | - | 120 | 520 | `t2` | 0 | 140 | T1 into U6 | 141 |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `t2` to `U6` | 0 | 140 | T1 into U6 | 141 | jump and flap over the thorn vine, then glide in |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `down`: back to `canopy-1` | 40 | 0 |
| B | bench 2 | 200 | 0 |
| o | acorn bell 3, on `b3` | 200 | 450 |
| V | door `vine-foot`: the vine's foot, coiled out of reach until it is dropped from `canopy-2c`; then it leads to `canopy-2c` spawn `vine-top` | 1530 | 0 |
| D | door `hatch-up` on `t4`: to `canopy-2b` | 1460 | 520 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the updraft U6 | `t2` | `t3` | 210 | 320 | 251 | 343 |
| the dash (from the top shelf) | `t3` | `b3` | -10 | 840 | 779 | 871 |

#### Room `canopy-2b` (1600 x 900, 1 screen)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 400 | safe: the hatch landing |
| 400 | 1600 | hazard: thorn roots |

Hazards and wind (z is height over the ground line):

| kind | x0 | x1 | z0 | z1 | timing |
| --- | ---: | ---: | ---: | ---: | --- |
| hanging thorn curtain | 980 | 1060 | 450 | 700 | always |

**Screen 2.2 The owlet's storey** (x 0 to 1600). Beat: A short hop (let go of Jump early) under a thorn curtain into a gust out of step with the last. The sleeping owlet's knothole. Time: 45 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `u1` | ring shelf | 420 | 650 | 160 | 120 | `trunk-b` | 120 | 20 | T1 | 101 |
| `knot-shelf` | knot shelf, lost feather 4 | 300 | 370 | 100 | 400 | `U7` | -40 | 240 | U + flap | 423 |
| `u2` | ring shelf by the knothole | 820 | 410 | 140 | 360 | `U7` | -80 | 60 | U (glide off) | 192 |
| `u3` | ring shelf under the hatch | 1260 | 270 | 240 | 500 | `U8` | -60 | 60 | U (glide off) | 144 |
| `U7` | updraft, on 3 s / off 2 s, phase 0 | 640 | - | 120 | 440 | `u1` | 0 | 60 | T1 into U7 | 141 |
| `U8` | updraft, on 3 s / off 2 s, phase 0.5 | 1080 | - | 120 | 560 | `u2` | 0 | 120 | T1 into U8 | 141 |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `u2` to `U8` | 0 | 120 | T1 into U8 | 141 | a short hop (let go of Jump early) under the thorn curtain |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `down`: back to `canopy-2a` | 80 | 0 |
| * | lost feather 4, on `knot-shelf`: off the top of U7 only with the flap still unspent | 350 | 400 |
| ? | the sleeping owlet in its knothole (secret character) | 900 | 360 |
| D | door `hatch-up` on `u3`: to `canopy-2c` | 1420 | 500 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the updraft U7 (the floor) | `u1` | `knot-shelf` | 280 | 20 | over a flap | - |

**The secret character: the sleeping owlet.** In a knothole at the back of `u2` (x 900, top 360)
an owlet sleeps. Standing on `u2` and pressing Talk wakes it for one line, a new one each park day
(the day's index from `parktime.ts`, mod 7), then it falls asleep again. Draft lines for the owner
to approve or replace (visitor-facing words are the owner's):

1. "Is it morning? ... No. Not yet."
2. "The wind told me you'd come up the inside. Clever."
3. "Five bells? I only ever hear four. The fifth is shy."
4. "Shh. The trunk is listening."
5. "Glide, don't flap. Leaves like a glider."
6. "Somebody up top has a telescope. Don't tell them I said."
7. "Mm. Five more minutes."

#### Room `canopy-2c` (1600 x 900, 1 screen)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 300 | safe: the hatch landing |
| 300 | 1600 | hazard: thorn roots |

Hazards and wind (z is height over the ground line):

| kind | x0 | x1 | z0 | z1 | timing |
| --- | ---: | ---: | ---: | ---: | --- |
| thorn stalk | 1040 | 1110 | 0 | 400 | always |

**Screen 2.3 Under the crown** (x 0 to 1600). Beat: Gusts on 2 s, off 2 s: the tightest timing in the course, over a thorn stalk. Drop the vine for next time. Time: 45 s on a first clear, 4 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `v1` | ring shelf | 320 | 660 | 140 | 110 | `trunk-c` | 110 | 20 | T1 | 106 |
| `v2` | ring shelf | 700 | 440 | 120 | 330 | `U9` | -70 | 60 | U (glide off) | 168 |
| `v3` | ring shelf | 1160 | 250 | 180 | 520 | `U10` | -80 | 160 | U (glide off) | 192 |
| `v4` | the crown hatch ledge, the vine's anchor | 1380 | 230 | 200 | 540 | `v3` | 20 | 40 | T1 | 136 |
| `U9` | updraft, on 2 s / off 2 s, phase 0 | 520 | - | 120 | 400 | `v1` | 0 | 60 | T1 into U9 | 141 |
| `U10` | updraft, on 2 s / off 2 s, phase 0.5 | 880 | - | 120 | 600 | `v2` | 0 | 60 | T1 into U10 | 141 |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `down`: back to `canopy-2b` | 60 | 0 |
| X | a crack to the outside, sealed with sap: a "maybe later" barrier with the sign `Not Yet Fledged` | 760 | 0 |
| V | the vine's anchor on `v4`: Use drops the vine (opens `vine-foot` in `canopy-2a` for this owl for good); spawn `vine-top` stands here | 1420 | 540 |
| D | door `hatch-up` on `v4`: out into the crown, act 3 (`canopy-3`) | 1520 | 540 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the updraft U9 | `v1` | `v2` | 220 | 240 | 227 | 319 |
| the updraft U10 | `v2` | `v3` | 190 | 340 | 299 | 391 |

## 5. Act 3: The Crown Run

Four screens out along the crown, the first real wind in the park: a tailwind, then a headwind that
blows 3 s in every 5, then updrafts in the wind, then the course's dash gap. Bells 4 and 5, the
lookout hut. The shortcut is the bough: it stands upright, tied, at the east end of `c8` until an
owl pushes it (Use at its push point); then it lies from bell 4's limb (`c3`) to bench 4's (`c8`),
1700 px of easy walking past the headwind screen.

```text
canopy-3
              !!          || ==     ||===         || ===                 =o#####
              !!==o=%%%%%%%%%%%%%%%%%%%%%P=B=     ||                 ===
              !!          ||        ||            ||
              !!     ==   ||        ||            ||
              !!          ||    === ||            ||          ===
              !!          ||        ||         ===||
           ===!!       =* ||        ||            ||
       ===    !!          ||        ||            ||
D  B          !!          ||        ||            ||
_______^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
|                   |                   |                   |   (1 char = 80 px across, 1 row = 60 px up; | on the ruler = a screen edge)
```

`%` is the bough once it is down.

#### Room `canopy-3` (6400 x 900, 4 screens)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 600 | safe: a broad limb, bench 3 |
| 600 | 6400 | hazard: the drop to the clearing (back to the last safe ledge) |

Hazards and wind (z is height over the ground line):

| kind | x0 | x1 | z0 | z1 | timing |
| --- | ---: | ---: | ---: | ---: | --- |
| wind to the right, 90 px/s | 600 | 1600 | 0 | 700 | gusts 3 s on / 2 s calm, phase 0 |
| wind to the left, 110 px/s | 1600 | 3200 | 0 | 700 | gusts 3 s on / 2 s calm, phase 0.25 |
| wind to the right, 90 px/s | 4100 | 4500 | 0 | 700 | gusts 3 s on / 2 s calm, phase 0 |

**Screen 3.1 Tailwind** (x 0 to 1600). Beat: Out in the crown the wind blows. A tailwind gust makes a Tier 2 hop a Tier 1; an always-on updraft lifts you to bell 4. Time: 30 s on a first clear, 15 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `c1` | limb stub | 620 | 650 | 160 | 120 | `limb` | 120 | 20 | T1 | 101 |
| `c2` | limb stub | 920 | 570 | 160 | 200 | `c1` | 80 | 140 | T2 | 209 |
| `c3` | limb, acorn bell 4; the bough's west end | 1340 | 310 | 260 | 460 | `U11` | -80 | 60 | U (glide off) | 192 |
| `U11` | updraft, always on | 1160 | - | 120 | 540 | `c2` | 0 | 80 | T1 into U11 | 141 |

**Screen 3.2 Headwind** (x 1600 to 3200). Beat: A headwind takes 42 % off every hop while it blows: wait for the calm (2 s in every 5) between gusts. A feather in the gust pocket below. Time: 45 s on a first clear, skipped on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `bough` | the bough, once pushed down (shortcut) | 1600 | 310 | 1700 | 460 | `c3` | 0 | 0 | T1 | 141 |
| `c4` | twig | 1700 | 390 | 140 | 380 | `c3` | -80 | 100 | T1 | 158 |
| `pocket` | gust pocket, lost feather 5 | 1900 | 610 | 100 | 160 | `c4` | -220 | 60 | T1 | 181 |
| `c5` | twig | 2320 | 230 | 160 | 540 | `U12` | -60 | 100 | U (glide off) | 144 |
| `c6` | twig | 2620 | 450 | 160 | 320 | `c5` | -220 | 140 | T1 | 181 |
| `c7` | twig | 3080 | 230 | 160 | 540 | `U13` | -60 | 80 | U (glide off) | 144 |
| `U12` | updraft, on 3 s / off 2 s, phase 0.5 | 2100 | - | 120 | 600 | `c4` | 0 | 260 | T3 into U12 | 755 |
| `U13` | updraft, on 3 s / off 2 s, phase 0 | 2880 | - | 120 | 600 | `c6` | 0 | 100 | T1 into U13 | 141 |

**Screen 3.3 Gusts in the wind** (x 3200 to 4800). Beat: Wind and updrafts together; bench 4 and the bough's push point. Time: 35 s on a first clear, 18 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `c8` | limb, bench 4; the bough's east end and its push point | 3300 | 310 | 300 | 460 | `c7` | -80 | 60 | T1 | 158 |
| `c9` | twig | 3800 | 510 | 160 | 260 | `c8` | -200 | 200 | T2 | 255 |
| `c10` | limb | 4240 | 230 | 200 | 540 | `U14` | -60 | 80 | U (glide off) | 144 |
| `U14` | updraft, on 3 s / off 2 s, phase 0.25 | 4040 | - | 120 | 600 | `c9` | 0 | 80 | T1 into U14 | 141 |

**Screen 3.4 The dash gap and the hut** (x 4800 to 6400). Beat: A rising gap no glide covers: the dash (Shift, or the phone's dash button). Bell 5, the hut's deck, the hut opens. Time: 40 s on a first clear, 22 s on a shortcut run.

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `c12` | limb: the dash run-up | 4980 | 470 | 200 | 300 | `c10` | -240 | 540 | T3 | 1331 |
| `c13` | limb past the dash gap | 5520 | 270 | 240 | 500 | `c12` | 200 | 340 | D (dash) | 367 |
| `c14` | limb, acorn bell 5 | 5840 | 250 | 180 | 520 | `c13` | 20 | 80 | T1 | 136 |
| `c15` | the lookout hut's deck (solid) | 6020 | 230 | 360 | 540 | `c14` | 20 | 0 | T1 | 136 |

More hops, and notes on the ones above:

| hop | rise | gap | needs | reach | note |
| --- | ---: | ---: | --- | ---: | --- |
| `c1` to `c2` | 80 | 140 | T2 | 209 | T2 in calm air, T1 on a tailwind gust |
| `c3` to `c4` | -80 | 100 | T1 | 158 | wait for calm: in the headwind (x0.58) it falls short |
| `pocket` to `U12` | 0 | 100 | T1 into U12 | 141 | a side reach, off the line |
| `c5` to `c6` | -220 | 140 | T1 | 181 | wait for calm |
| `c3` to `bough` | 0 | 0 | T1 | 141 | the shortcut, once open |
| `bough` to `c8` | 0 | 0 | T1 | 141 |  |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `down`: back down the hatch to `canopy-2c` | 40 | 0 |
| B | bench 3 | 300 | 0 |
| o | acorn bell 4, on `c3` | 1440 | 460 |
| * | lost feather 5, on `pocket`, under the headwind | 1950 | 160 |
| P | the bough's push point on `c8`: Use lowers the bough to `c3` for this owl for good | 3320 | 460 |
| B | bench 4, on `c8` | 3450 | 460 |
| o | acorn bell 5, on `c14` | 5930 | 520 |
| D | door `hut` on `c15`: the lookout hut, shut until five bells ring this run; inside, the finish shrine | 6200 | 540 |
| X | a snapped rope bridge to a farther crown: a "maybe later" barrier with the sign `Hatching Soon` | 6360 | 540 |

What each mechanic is for: the hop it makes possible, checked without it (the hop is refused when the gap is over the reach).

| without | from | to | rise | gap | best glide reach | with a dash |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| the updraft U11 | `c2` | `c3` | 260 | 260 | over a flap | - |
| the updraft U12 | `c4` | `c5` | 160 | 480 | 371 | 463 |
| the updraft U13 | `c6` | `c7` | 220 | 300 | 227 | 319 |
| the updraft U14 | `c9` | `c10` | 280 | 280 | over a flap | - |
| the updraft U14 (straight on) | `c8` | `c10` | 80 | 640 | 563 | 655 |
| the dash (from the high limb) | `c10` | `c13` | -40 | 1080 | 851 | 943 |
| the dash gap at all | `c12` | `c14` | 220 | 660 | 227 | 319 |

**The dash gap.** `c12` to `c13`: a 340 px gap rising 200 px. A jump, a flap and a glide reach
275 px at that rise; with the dash, 367. Nothing else reaches `c13` or bell 5 without the dash
(the table above checks `c10` and `c12` to `c14`). On a computer the dash is Shift; on a phone the
course shows a dash button beside Jump.

### The lookout hut and the finish shrine

The hut's door (`hut`, on the deck `c15`) opens once this run has rung five bells. Inside: the
finish shrine, which stops the clock, shows the time against the gold time and hands over the Leaf
Glider cape on a first clear; and on the window seat, the telescope. Looking through it shows Neon
Street, far off across the night: the course's nod to another realm.

#### Room `canopy-hut` (1600 x 900, 1 screen)

Floor along the ground line:

| from x | to x | floor |
| ---: | ---: | --- |
| 0 | 1600 | safe: the lookout hut's floor |

**Screen** (x 0 to 1600).

| id | what | x | y | w | top | from | rise | gap | needs | reach |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `sill` | the window seat under the telescope | 1100 | 640 | 260 | 130 | `hut` | 130 | 0 | T1 | 95 |

Doors, benches and the rest:

| mark | thing | x | top |
| --- | --- | ---: | ---: |
| D | door `out`: back to the deck | 80 | 0 |
| S | the finish shrine: the run's time, the Leaf Glider cape on a first clear | 600 | 0 |
| T | the telescope, on `sill`: it shows Neon Street | 1230 | 130 |

## 6. The course rules, checked

| Rule | Where |
| --- | --- |
| Three acts of three or four screens, about ten in all, joined by doors | Act 1: 3 screens (`canopy-1`); act 2: 3 (`canopy-2a` to `2c`); act 3: 4 (`canopy-3`). Doors `to-trunk` and the crown hatch join them |
| Four benches | Bench 1 (`canopy-1`, x 1800), bench 2 (`canopy-2a`, x 200), bench 3 (`canopy-3`, x 300), bench 4 (`canopy-3`, on `c8`) |
| One shortcut per act, opened from its far side | The log (kicked open from `log-east`), the vine (dropped from `canopy-2c`'s top), the bough (pushed from `c8`) |
| One dash-only gap | `c12` to `c13` in screen 3.4. Bell 3's branch in 2.1 also needs the dash (the owner's ask); it is a side reach, not on the line |
| Five lost feathers | 1: `fern-hi` (1.1); 2: `fern-bench` (1.2); 3: the hidden room's shelf; 4: `knot-shelf` (2.2, the flap kept for the top of U7); 5: `pocket` (3.2) |
| One hidden room | `canopy-roots`, through the tiny door at x 4560 in `canopy-1` |
| One secret character | The sleeping owlet, `canopy-2b` |
| One nod to another realm | The telescope in the hut shows Neon Street |
| A finish shrine | In the hut (`canopy-hut`) |
| Nothing looks explorable unless it is | The two places that look like a way on are barred and signed: the sap-sealed crack in `canopy-2c` (`Not Yet Fledged`) and the snapped rope bridge past the hut (`Hatching Soon`); both phrases are from `CLOSED_SIGNS` |
| Down is left, up is right | Every room's way back is at its left; every way on is at the right |
| The dash only in courses | Every room here is a course room; the dash button shows only in them |

## 7. Time

Estimates, not measurements: an owl's air speed is `WALK_SPEED` (260 px/s), so a screen crossed
without a stop takes about 6 s. A first clear adds reading each new beat, waiting for gusts and the
calm, and a fall or two a screen; a shortcut run knows the way and has the log, the vine and the
bough open; a best run waits for no gust it can avoid.

| Screen | First clear (s) | Shortcut run (s) | Best run (s) |
| --- | ---: | ---: | ---: |
| 1.1 The fern gate | 40 | 18 | 11 |
| 1.2 The switching gusts | 40 | skipped | skipped |
| 1.3 Two gusts out of step | 40 | 15 | 9 |
| 2.1 The trunk's foot | 55 | 20 | 12 |
| 2.2 The owlet's storey | 45 | skipped | skipped |
| 2.3 Under the crown | 45 | 4 | 3 |
| 3.1 Tailwind | 30 | 15 | 9 |
| 3.2 Headwind | 45 | skipped | skipped |
| 3.3 Gusts in the wind | 35 | 18 | 11 |
| 3.4 The dash gap and the hut | 40 | 22 | 14 |
| Doors and hatches (five on a first clear (1 to 2a, 2a to 2b, 2b to 2c, 2c to 3, 3 to the hut), about 2 s each; on a shortcut run the log, the vine and the bough take their place) | 10 | 18 | 14 |
| The finish shrine (into the hut, the shrine, the time) | 10 | 6 | 4 |
| **Total** | **435 (7:15)** | **136 (2:16)** | **87 (1:27)** |
| Optional: The hidden room: the tiny door, the cabinet, lost feather 3 | +30 | - | - |

The gold time is set at **1:45**: under the two minutes the course rules ask for, about 18 s slower
than the estimated best. Set it from real runs once the course is built.

## 8. Build notes and open questions

- **Blast radius.** Updrafts and wind touch `flight.ts` (the step and `carryOn`), `Room.ts` (the
  air limit is fine as it is, section 2) and the walk protocol (wind). Doors with `top` already
  exist (OP-162). The hazard floor is new to the tree. The dash is PR 72's (`dash.ts`), unchanged here.
- **Art.** Each act's rooms are painted in the tree's six layers (`docs/MAP.md` section 6). The
  updraft leaves, the bells, the log's clod, the vine, the bough and the owlet are sprites drawn by
  the game, not painted (interactive things are left bare in the paintings).
- **The trunk's hatches** are doors with a `top`; an owl arrives on the next storey's floor at its
  left, as if it climbed through the hatch. OPEN QUESTION: whether the hatch should instead lead
  to a spawn on a ledge (a smoother climb, at the cost of the act 2 rooms' simple floors).
- **Shared gusts.** Course rooms are shared, like every other room in the park (decided
  2026-11-02), so every owl in a room sees the same gusts, which run on park time.
- **Bells per run.** A run starts at the course gate and ends at the shrine. OPEN QUESTION: whether
  leaving the course (the Commons door) clears the bells rung so far.
- **The gold time** and the per-screen times are estimates: replace them with measured times from
  play tests (MEASURED, once built).
