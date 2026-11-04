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
| Speed across, in the air | 260 px/s | `WALK_SPEED` |
| Glide | falls 1 px for 3 across, 86.7 px/s | `GLIDE_SLOPE`, `GLIDE_SINK` |
| A hop's margins | a rise 10 px short of the top, 0.8 of the reach across | `ROUTE_MARGIN`, `ROUTE_REACH` |
| The highest ledge | 540 over the ground line | `MAX_PERCH_TOP` |
| The highest an owl may be | the room's highest top + 280 | `MAX_RISE`, `Room.ts` |
| The dash | 162 px in 180 ms, once per jump, back when the owl stands on something, never sooner than 350 ms after the last | `AIR_DASH_SPEED` 900, `AIR_DASH_MS` 180, `AIR_DASH_COOLDOWN_MS` 350 (`dash.ts`, PR 72) |
| The dash on a hop | +115 px across: the dash is a walk while the owl is up, so the fall goes on through it, and its 180 ms give up 47 px of the ordinary 260 px/s drift (162 - 47). Counted at 0.8: **+92** on a glide's reach | `dash.ts`, `flight.ts` |
| A gap the dash must not cross | checked at the plain 0.8 x 162 = **+130**, so it stays shut under either reckoning | |

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
  at +130.
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
