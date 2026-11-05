# Level plans: the realms' courses

- Status: PLANNED (OP-225, OP-226, OP-235). Plans for the park remap the owner approved on 2026-11-02; nothing here is built
- Verified against: main 503b9bf (2026-11-02); the dash against PR 72's `dash.ts` (branch `claude/course-kit`, 58c282b)
- Code: `packages/shared/src/jump.ts`, `flight.ts`, `routes.ts`, `perches.ts`, `room.ts`, `climb.ts`, `climbCity.ts`, `climbPilot.ts`; `packages/shared/rooms/index.ts`; from PR 72, `packages/shared/src/dash.ts` and `coursebook.ts`
- Tickets: OP-225 (the Glass Tower), OP-226 (Updraft Canopy), OP-235 (Brushstroke Bridges)
- Related: `docs/MAP.md` (the tree), `designs/the-stained-glass-climb.md` (the climb), `docs/ACTIVITIES.md`

In the remap each realm has a Commons and then a course: in the owner's words, "a full high quality
map level, with easter eggs, several minutes of gameplay, shortcuts, and everything else". These are
the plans for three courses, one file each, written so that someone can type them into room data.

| Course | Realm | File | Screens | New mechanic | First clear | With shortcuts | Gold |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| Updraft Canopy | the Treehouse Clearing | `updraft-canopy.md` | 10 | updrafts that switch; wind | about 7:15 | about 2:16 | 1:45 |
| The Glass Tower | the stained-glass realm | `glass-tower.md` | 16 views | (built) the glass lift; two new storeys | about 6:28 | about 1:05 | 1:00 |
| Brushstroke Bridges | the ink-wash realm | `brushstroke-bridges.md` | 10 | brush stones that paint fading bridges | about 7:05 | about 2:19 | 1:55 |

All times are estimates from the physics (each file's time section), except the Glass Tower's
scripted times, which are MEASURED with the climb's pilot.

## The course rules (the owner, 2026-11-02)

- Down is always left and up is always right.
- Nothing looks explorable unless it is, and a way that is not open yet has a clear "maybe later"
  barrier (signed only with the phrases in `CLOSED_SIGNS`).
- Every placement tells a story (the owner, 2026-11-03: "Otherwise they're just clutter"). Each
  prop on a course belongs to a little scene with a reason, a bench by a checkpoint's view, a lantern
  at a hard jump, a lost feather's nest under the branch it fell from, grouped with room around it.
  Nothing is placed only to fill space. Each plan names its scenes, one line each, beside its
  screens (`docs/TREE_STYLE.md`, section 8).
- The dash works only in courses: Shift on a computer, a button on a phone.
- Three acts of three or four screens each, about ten in all, joined by doors.
- About seven minutes for a first clear, about two and a half with shortcuts, a gold time under two.
- Four benches as checkpoints; one shortcut per act, opened from its far side; one dash-only gap;
  five lost feathers, one hidden room, one secret character and one nod to another realm; a finish
  shrine.

Each file ends with a table that checks these rules against its plan.

## How to read the plans

The Updraft Canopy and Brushstroke Bridges are tree rooms (map 2, `owlScale` 1.25), seen from the
side:

- **Room pixels.** A screen is `ROOM_W` x `ROOM_H` (1600 x 900); a room is at most `ROOM_MAX_W`
  (6400) wide. Screen n of a room covers x from 1600 (n - 1) to 1600 n; every x in a table is the
  room's own x.
- **A ledge** is `treeLedge(id, x, x + w, top)`: `x` its left edge, `w` its width, `top` its
  height over the ground line (`TREE_GROUND`, 770) and `y` = 770 - `top`, where its top edge is
  drawn on the screen. No `top` is over `MAX_PERCH_TOP` (540). A solid ledge (a stump, a cliff) is
  a wall to an owl below its top; the rest are jumped up through.
- **Each ledge's row names the hop that reaches it** on the course's line: where from, the `rise`
  (its top less the take-off's), the `gap` (the distance between their edges across) and what the
  hop `needs`, with the `reach` that tier gives at that rise. A hop passes only when the gap is no
  more than the reach. The codes:
  - `T1`, `T2`, `T3`: `hopTier`'s tiers in `routes.ts`, a single jump, the flap, a glide;
  - `T2b`: in the tree, a hop that takes both flaps (`hopFlaps` 2);
  - `T1 into U3`: a hop into an updraft's column;
  - `U (glide off)`: off the top of a column, gliding (one down for three along), and
    `U + flap`: the same with the flap kept for the top;
  - `D (dash)`: only with the dash; the hop is also checked to fail without it.
- **The "what each mechanic is for" tables** check the opposite: the hop a mechanic makes possible,
  without the mechanic. Each is refused, so the mechanic is needed. Their last column is the reach
  with the real dash (+92); where it covers the gap, a dash alone makes the hop (an expert's skip,
  still needing the dash). A row that must stay shut even with the dash is also checked at +130.
- A generator checked every hop and every "without" in these files; nothing in them fails.

The Glass Tower is the climb, in the climb's own units (field px, `y` up); its file says so.

## The physics used

The park's flight (`flight.ts`) runs on the climb's jump (`jump.ts`), in room pixels:

| What | Value | From |
| --- | --- | --- |
| Jump height | 148.9 px | `JUMP_RISE` = `JUMP_IMPULSE`² / 2 `GRAVITY` = 880² / 5200 |
| Flap height | 111.1 px more, 260 in all | `DOUBLE_JUMP_IMPULSE` 760 |
| The tree's second flap (the triple jump, OP-239) | 111.1 px more again, 371 in all; map 2 only, not the climb | `ALL_FLIGHT.secondFlap`, `flightFor` |
| Speed across, in the air | 260 px/s | `WALK_SPEED` |
| Glide | falls 1 px for 3 across, 86.7 px/s | `GLIDE_SLOPE`, `GLIDE_SINK` |
| A hop's margins | a rise 10 px short of the top, 0.8 of the reach across | `ROUTE_MARGIN`, `ROUTE_REACH` |
| The highest ledge | 540 over the ground line | `MAX_PERCH_TOP` |
| The highest an owl may be | the room's highest top + 392 (a jump and both flaps, 371, and 20 to spare) | `MAX_RISE`, `Room.ts` |
| The dash | 162 px in 180 ms, once per jump, back when the owl stands on something, never sooner than 350 ms after the last | `AIR_DASH_SPEED` 900, `AIR_DASH_MS` 180, `AIR_DASH_COOLDOWN_MS` 350 (`dash.ts`, PR 72) |
| The dash on a hop | +115 px across: the dash is a walk while the owl is up, so the fall goes on through it, and its 180 ms give up 47 px of the ordinary 260 px/s drift (162 - 47). Counted at 0.8: **+92** on a glide's reach | `dash.ts`, `flight.ts` |
| A gap the dash must not cross | first checked at the plain 0.8 x 162 = **+130**. Since 2026-11-05 every gap that must stay shut is checked against the full reach of the flight stepped through, not the 0.8 below, and where the dash must not cross it, that reach and the dash's whole 115 px, 10 px to spare | `stepFlier`, `ALL_FLIGHT` |

The reach across, by rise (px; `routes.ts`'s `hopTier`, margins in):

| Rise | T1, a jump | T2, with the flap | T3, with a glide | With the dash too |
| ---: | ---: | ---: | ---: | ---: |
| -200 | 178 | 255 | 1235 | 1327 |
| -100 | 161 | 241 | 995 | 1087 |
| 0 | 141 | 224 | 755 | 847 |
| 50 | 128 | 215 | 635 | 727 |
| 100 | 111 | 204 | 515 | 607 |
| 130 | 95 | 197 | 443 | 535 |
| 150 | - | 192 | 395 | 487 |
| 200 | - | 176 | 275 | 367 |
| 220 | - | 168 | 227 | 319 |
| 250 | - | 149 | 155 | 247 |

In the tree (map 2) the owl has both flaps (OP-239), so `perchTiers` reckons a tree room's hops with
two (`roomFlaps`), and `hopFlaps` says whether a T2 hop takes the second. The reach across with both
flaps, by rise (px, margins in; `T2b` is a T2 hop that takes the second flap):

| Rise | T2b, both flaps | T3, both flaps and a glide | With the dash too |
| ---: | ---: | ---: | ---: |
| -200 | 330 | 1563 | 1655 |
| -100 | 317 | 1323 | 1415 |
| 0 | 303 | 1083 | 1175 |
| 50 | 295 | 963 | 1055 |
| 100 | 287 | 843 | 935 |
| 130 | 282 | 771 | 863 |
| 150 | 278 | 723 | 815 |
| 200 | 267 | 603 | 695 |
| 220 | 263 | 555 | 647 |
| 250 | 255 | 483 | 575 |
| 300 | 241 | 363 | 455 |
| 350 | 218 | 243 | 335 |

The second flap more than doubles a glide's reach up a rise (at 200, 275 px becomes 603), so the
tree plans' gaps are measured again with it (each plan's section "With the triple jump").

A glide is strong: level, it carries an owl 755 px. So a mechanic is only needed where a hop rises
(at a rise of 200 a glide reaches 275 px, with the dash 367) or a hazard blocks the glide's line. Both
tree courses are built on that.

## What the physics made impossible, and the fixes

- **A three-screen vertical climb in one room** (the Canopy's hollow trunk; the ink-wash mountain).
  A room is one screen high and no ledge tops 540. Fix: one room per storey or panel, joined by a
  door at the top right (the trunk's hatches, the scroll's fold).
- **Gaps over a safe floor mean nothing.** In a tree room an owl that misses a hop lands on the floor
  and walks on. Fix: hazard floors and thorn boxes that send an owl back to its last safe ledge, as
  the climb's thorns do (PLANNED in both tree plans).
- **The glide crossed most gaps the first drafts gave the updrafts and the brush stones.** Fix: every
  ledge a mechanic leads to sits 180 px or more above where the owl could glide from, or behind
  hanging thorns; the "without" tables check each one.
- **A dash-only reach on the Glass Tower's high roads.** The 480 px field is narrower than a jump and
  double jump carry an owl, and every landing spans it; a search found no such spot. Fix: the
  tower's dash-only gap goes under band 4's thorn ceiling on the main road, where the double jump
  is impossible; the pilot confirms it.
- **The tower's shortcuts beat its anti-cheat floors** (`CLIMB_FLOORS`). Fix: a scripted shortcut
  road and floors for runs that report their shortcuts (the tower file, section 5).
- **The real dash is shorter than these plans first assumed** (162 px, against about 260), and a
  dash on a hop adds only 115 px of it. Every dash hop was checked again at +92: the Updraft Canopy's
  dash gap (`c12` to `c13`, 420 px) and Brushstroke Bridges' (`n2` to `n3`, 380 px) no longer
  closed. Fix: both gaps narrowed to 340 px (still 65 px past a glide's 275). Bell 3's branch in the
  trunk still closed, by 7 px, and moved 20 px nearer (360 to 340 px) for room. Two optional dash
  skips no longer work (the Canopy's past updraft U12 and Brushstroke's past the bridge from `k8`),
  so those mechanics are now always needed. Every gap that must stay shut even with the dash holds
  at +130. (Superseded for the tree by the triple jump, next.)
- **The second flap (OP-239) let an owl skip almost every mechanic** in both tree plans: every
  updraft, the bridges, both dash gaps. Fix: height first. The ledge a mechanic leads to now stands
  370 to 420 px over the one before it, past a jump and both flaps, and hanging thorn curtains or
  cloud banks hold an owl that passes under them to a single jump's lift. Only the dash gaps were
  widened: the Canopy's to 380 px at a rise of 320, Brushstroke's to 650 px at a rise of 200. Each
  plan's section 9 has the old-versus-new table. One reach stays open: lost feather 4 in the Canopy
  can also be reached by a long glide back from `u2` (an easy feather, kept so).
- **The 0.8 reach let gaps through (2026-11-05).** This file's reach table counts a glide at 0.8 of
  its best, which is right for a hop that must be made and too kind to a gap that must stay shut.
  A search of the real flight, step by step, with both flaps at every timing and a dash at every
  moment, found both tree dash gaps and bell 3's branch crossable with no dash, and seven of
  Brushstroke's bridges and treads, and the Canopy's first updraft, skippable (most of them with
  the dash). A jump and both flaps reach at best 773 px up a rise of 200 and 345 up a rise of 340,
  so the dash gaps moved to a rise of 340 and a gap of 360 (past 345, inside the dash's 368 counted
  at 0.8), and the rest moved apart or up. Each plan's section 9 lists them. From now on a gap that
  must stay shut is checked against the full stepped reach, and with the dash where the dash must
  not cross it. The climb tower is not touched: it keeps its double jump (`docs/levels/glass-tower.md`, section 8). The "in the air" rows (a hop made under a
  hanging hazard) need the flight stepped through, not this file's hop formula.
- **The tower was short:** about 4.6 minutes for a first clear. Fix (Claude Duet's call; the owner can change it): bands 7 and 8,
  measured with the pilot; about 6.5 minutes now, and about 7 with the hidden pane room.

## Decided (Claude Duet's calls, 2026-11-02; the owner can change any of them)

- **Course rooms are shared,** like every other room in the park. Every owl in a room sees the same
  gusts (they run on park time) and every painted bridge (the room tells everyone who painted what).
- **Opened shortcuts are kept per owl for good,** in the course book (`coursebook.ts`, PR 72), which
  already keeps them.
- **The Glass Tower's extra benches stay benches.**
- **The Glass Tower gains bands 7 and 8,** to bring its first clear near seven minutes; its times are
  measured again with the pilot, with floors for runs that report shortcuts (`glass-tower.md`,
  sections 4.9, 5 and 6).
- **The secret characters' and the shrines' words stay drafts.** The owner approves them when each
  course is built.

## Rolling ground (OP-238)

A tree room's floor or bough may roll: a kit room's `hills` (`room.ts`, `KitHill`) lay the published
slope, crest and dip pieces (OP-240) of one material left to right, and the hill is stood on as a
sloped perch (`kitPerches`), whose `profile` is its height along x (`perches.ts`).

| What | Value | From |
| --- | --- | --- |
| A step | 320 px along | `KIT_HILL_STEP` |
| Gentle | one up for 4 along: 80 a step, about 14 degrees | `SLOPE_GENTLE` |
| Steep | one up for 2 along: 160 a step, about 27 degrees; nothing steeper is walked | `SLOPE_STEEP` |
| Crest, dip | a gentle rise and fall of 40, level ends | `kitHillProfile` |
| Walking | at the walk's pace up and down, standing all the way, never sliding; no stamina, no damage | `stepFlier`, `SLOPE_CATCH` 12 |
| The room server | believes an owl standing anywhere along a slope where it is, and nowhere off it | `standingRanges`, `Room.perchFor` |
| A doorway on a slope | stands at the slope's height there | `slopeDoorProblems` |

The assembler holds every hill to its rules (`kitHillProblems`): each piece's art is stretched up or
down to lie on its angle by no more than `KIT_HILL_STRETCH` (0.65 to 1.45; past it the piece is the
wrong one for the angle), a crest's or dip's ends are level, the room's perch stands on the profile,
and a raised end meets a path or ledge at its height, or a barrier. Down is still left and up is
still right on each level, and the commons stay mostly level. The level plans get slopes where they
fall naturally when they are built.
