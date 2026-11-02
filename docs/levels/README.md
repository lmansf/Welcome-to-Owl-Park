# Level plans: the realms' courses

- Status: PLANNED (OP-225, OP-226, OP-235). Plans for the park remap the owner approved on 2026-11-02; nothing here is built
- Verified against: main 503b9bf (2026-11-02)
- Code: `packages/shared/src/jump.ts`, `flight.ts`, `routes.ts`, `perches.ts`, `room.ts`, `climb.ts`, `climbCity.ts`, `climbPilot.ts`; `packages/shared/rooms/index.ts`
- Tickets: OP-225 (the Glass Tower), OP-226 (Updraft Canopy), OP-235 (Brushstroke Bridges)
- Related: `docs/MAP.md` (the tree), `designs/the-stained-glass-climb.md` (the climb), `docs/ACTIVITIES.md`

In the remap each realm has a Commons and then a course: in the owner's words, "a full high quality
map level, with easter eggs, several minutes of gameplay, shortcuts, and everything else". These are
the plans for three courses, one file each, written so that someone can type them into room data.

| Course | Realm | File | Screens | New mechanic | First clear | With shortcuts | Gold |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| Updraft Canopy | the Treehouse Clearing | `updraft-canopy.md` | 10 | updrafts that switch; wind | about 7:15 | about 2:16 | 1:45 |
| The Glass Tower | the stained-glass realm | `glass-tower.md` | 12 views | (built) the glass lift | about 4:38 | about 0:50 | 0:45 |
| Brushstroke Bridges | the ink-wash realm | `brushstroke-bridges.md` | 10 | brush stones that paint fading bridges | about 7:05 | about 2:19 | 1:55 |

All times are estimates from the physics (each file's time section), except the Glass Tower's
scripted times, which are MEASURED with the climb's pilot.

## The course rules (the owner, 2026-11-02)

- Down is always left and up is always right.
- Nothing looks explorable unless it is, and a way that is not open yet has a clear "maybe later"
  barrier (signed only with the phrases in `CLOSED_SIGNS`).
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
  without the mechanic. Each is refused, so the mechanic is needed. Where a dash alone could make
  the hop, the table shows it (an expert's skip, still needing the dash).
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
| The dash (assumed) | a burst of about 260 px across with no fall, once per jump; counted at 0.8, so +208 on a glide's reach | not built: another agent is building the real dash |

The reach across, by rise (px; `routes.ts`'s `hopTier`, margins in):

| Rise | T1, a jump | T2, with the flap | T3, with a glide | With the dash too |
| ---: | ---: | ---: | ---: | ---: |
| -200 | 178 | 255 | 1235 | 1443 |
| -100 | 161 | 241 | 995 | 1203 |
| 0 | 141 | 224 | 755 | 963 |
| 50 | 128 | 215 | 635 | 843 |
| 100 | 111 | 204 | 515 | 723 |
| 130 | 95 | 197 | 443 | 651 |
| 150 | - | 192 | 395 | 603 |
| 200 | - | 176 | 275 | 483 |
| 220 | - | 168 | 227 | 435 |
| 250 | - | 149 | 155 | 363 |

A glide is strong: level, it carries an owl 755 px. So a mechanic is only needed where a hop rises
(at a rise of 200 a glide reaches 275 px, the dash 483) or a hazard blocks the glide's line. Both
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
- **The tower is short:** about 4.6 minutes for a first clear. Fix offered, the owner's call: two
  more storeys.

## Open questions for the owner and the build

- Is a course room shared, like the rest of the tree, or a solo instance, like the climb? It decides
  whether gusts and painted bridges are seen by every owl in the room.
- Where does an owl's record of the shortcuts it opened live?
- Do the Glass Tower's seven extra benches stay benches?
- Keep the Glass Tower short, or add bands 7 and 8?
- The secret characters' and the shrines' words: drafts only; the owner approves every visitor-facing
  word.
