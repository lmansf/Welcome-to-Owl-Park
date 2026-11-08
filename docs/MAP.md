# The tree (map 2)

- Status: the grid and the style sheet are the contract (OP-155 final 2026-10-31, OP-157 approved 2026-10-31); levels 1 to 5 BUILT as rooms (`l1` to `l4`, and level 5 as `l5-street` and `l5`, the street's nest doors and the front gate's ticket sale wired; still to wire: levels 1 to 3's idols, guardians and games); level 0 BUILT as `l0` and the arcade cave `l0-arcade` (OP-163); the entries setting, the turn-your-phone card and the spot placer BUILT (OP-156)
- Verified against: main 1ae8200 (2026-11-01, level 1's fronts OP-173 and the nightly restart OP-181 merged) with branch claude/tree-tools (the entries setting, the turn-your-phone card and the spot placer, OP-156); the Ticket Board as read 2026-11-01
- Code: packages/shared/src/room.ts (`map`, `owlScale`, `RoomTile.rate` and `fade`, `fronts`, `shades`, a door's `top` and `markAt`), packages/shared/rooms/index.ts (`l1`, `TREE_GROUND`, `TREE_REALMS`), packages/shared/src/perches.ts, packages/shared/src/masks.ts, packages/shared/src/treeSpots.ts (`TREE_SPOTS`), packages/shared/src/overflow.ts (`treeShare`, `entryMap`, `realmShut`); apps/park/src/game/treeView.ts, game/ledgePainter.ts, game/walkingMap.ts, paint/, ui/turnPhone.ts; apps/edge/src/capacityPage.ts; tools/masks/pull.mjs; tools/art/prompts.mjs (`TREE_STYLE`, `treeScreen`)
- Tickets: OP-128, OP-152, OP-155, OP-156, OP-157, OP-158 to OP-163, OP-165, OP-173, OP-212, OP-220
- Related: docs/ARCHITECTURE.md (rooms, the room server), docs/ART-PIPELINE.md (how art is made), docs/ACTIVITIES.md (the arcade, the climb), docs/NESTS.md

The tree is a second park, map 2: one side-scrolling world around a colossal living tree, built
level by level beside today's park (map 1), which stays exactly as it is until the owner retires it
(OP-128). This page is the contract every tree ticket follows: the grid of levels and screens, the
named spots, the style sheet for painting a screen, how the game draws and reads a screen, level 1
as built, and the tools and steps for building the next levels. While it is dark, only a keeper
reaches it (section 9).

## 1. Rules [BUILT for level 1; the contract for every level]

- **Map 2.** A room of the tree has `map: 2` (`mapOf` in `packages/shared/src/room.ts`); a room
  without `map` is today's park. Nothing of map 1 changes for the tree.
- **One world, the trunk as the spine.** Each level is a horizontal run of screens west and east of
  the trunk. A screen's index counts from the trunk: 0 is the trunk's screen, negative is west,
  positive is east.
- **A level is one room.** Rooms stay the capacity unit (OP-106), so a level's screens share one room
  and a stair is a doorway to the next level's room (OP-155, decision (c)). Room ids are `l0` to `l5`
  for levels 0 to 5. Rooms are named by these ids or by public descriptions, never by realm names.
- **A screen** is painted at 2048 x 1152 (16:9) and drawn as one `ROOM_W` x `ROOM_H` (1600 x 900) tile
  of the room. A room is at most `ROOM_MAX_W` (6400, four screens) wide; see section 11 for level 5.
- **The owl stands a sixth of the screen's height** (`owlScale: 1.25` on a tree room). Every step,
  ledge, arch and doorway is sized from that one number: an arch is about twice the owl's height.
- **The ground line** is room y `TREE_GROUND` (770), painted at 985 of 1152. The floor is a thin strip
  along it; what an owl stands on above it are perches (ledges), each a span of the strip and a top
  over the ground line, at most `MAX_PERCH_TOP` (540) (`packages/shared/src/perches.ts`). A tall
  room seen from the side (the hollow hall) has its own ground line near its foot (its kit's
  `ground`, read with `groundOf`) and its ledges as much higher as it is taller (`perchTopLimit`).
- **Movement.** Jump, double flap and glide (OP-084) work everywhere; dash and pogo stay in the climb;
  the wall-kick turns on per realm where a lock needs it.
- **Phones play the tree in landscape only** (OP-155, decision (d)); a phone held upright in a tree
  room sees a card over the game asking to turn it [BUILT: OP-156]; a tablet or a computer plays as it
  is. QA's device matrix (OP-095) adds landscape on every device.
- **Every realm's branch has one shape** (OP-152): its common area and its game at the base, near the
  trunk; its adventure out toward the tip; its payoff at the tip, reachable with single jumps (Tier 1).
- **Directions: down on the left, up on the right** (OP-220, the owner's rule of 2026-11-02). On every
  level the stair down is the westmost stair and the stair up the eastmost, with no other doorway between
  them, and both are taken from the floor (`top: 0`) with the up key (OP-212): going up is as easy as
  going down, and no stair is climbed tread by tread, so a stair's painted treads are not ledges. An owl
  that comes in by one stair lands between the two, on the side of its stair that faces the other, so a
  walk through the tree never passes over another doorway. Each stair says which way it goes (a door's
  `way`), and its mark shows it: a chevron up or down in the arch. From the canopy (`l5`), the way into
  the tree is its one stair, and it goes down. Where a stair has to stand where the painting shows no
  stair, the game draws a stairhead going down through the boardwalk (`landings`).
- **Barriers: show nothing explorable that is not** (OP-220, the owner's rule of 2026-11-02). Parkour or
  anything that reads as a way on is either real or shut. A way not open yet may be teased, but behind a
  barrier that reads as shut at a glance and as shut for now, not for ever: the game draws it (`barriers`,
  never painted) as a locked gate, a rope across, a fallen branch or boards over an arch, its sign one of
  the approved phrases (`CLOSED_SIGNS`), with a warm glow behind it. Every closed doorway has one in it,
  under the doorway's own id. A painted route that leads nowhere has its ledges taken out of the room data
  and a barrier at its foot; where the barrier ends the floor, nothing stands past it, and no ledge ever
  stands over one. Today's park's blockade art is not drawn in the tree.

### The stairs and barriers as built [BUILT: OP-220]

Where each level's stairs stand (all on the floor), what shuts the ways not open yet, and where the game
draws a stairhead because the painting has none. Positions are room px.

| Room | Stair down (west) | Stair up (east) | Barriers | Stairheads |
| --- | --- | --- | --- | --- |
| `l5` | `stair-l5-l4`, 1230 to 1330, the railed stair behind the arch, its mark pointing down | none (the top of the tree) | `bough-7`, a fallen branch at the pier's end | none |
| `l5-street` | none | none (the front gate leads on) | `closed-beyond`, a fallen branch at bough 6's foot; `spare-nest`, boards | none |
| `l4` | `stair-l4-l3`, 640 to 740, behind the railing west of the trunk | `stair-l5-l4`, 880 to 980, the spiral stair's foot | none | none |
| `l3` | `stair-l3-l2`, 170 to 270, the boardwalk's west end | `stair-l4-l3`, 500 to 610, the painted stair's foot | `reach`, a rope from the railing post across the branch | `stair-l3-l2` |
| `l2` | `stair-l2-l1`, 3380 to 3480, west of the trunk | `stair-l3-l2`, 3740 to 3850, the painted stair's foot | `trunk-east`, a rope before the steps behind the trunk | `stair-l2-l1` |
| `l1` | `stair-l1-l0`, 2210 to 2300, the way down under the lintel | `stair-l2-l1`, 2560 to 2670, the spiral stair's foot | `closed-west`, a locked gate; `roof-run`, a rope at the crates' foot | none |
| `l0` | `stair-challenge`, 600 to 760, closed (OP-115) | `stair-l1-l0`, 2560 to 2660, the stair's foot | `stair-challenge`, boards | none |

Taken out of the room data with OP-220: every stair's treads and landings (levels 0 to 4, with level 4's
balcony, reached only from its treads), bough 6 (`l5-street`), bough 7 (`l5`), level 3's reach up to its
`tip`, and level 1's roof run up to `tower-balcony`. The painted steps behind level 2's trunk and the
railed stairwell east of level 3's lead nowhere now: the first is roped off with the floor ending at
the rope, the second reads as a railing.

## 2. The grid [PLANNED except level 1]

Twenty-one screens across six levels, top to bottom. Level 1 is BUILT (section 8); every other row
is PLANNED by its level's ticket. Spawns are named in the room data when the level is built.

| Level | Index | Screen | What it holds | Doorways | Spawns | Room |
| --- | --- | --- | --- | --- | --- | --- |
| 5 Canopy | +3 | Treetop parkour, bough 7 | Tier 1 ledge stair, Tier 2 gap, Tier 3 glide crossing, a bench at the end, a find at the Tier 3 spot; shut behind a fallen branch at the pier's end until it leads somewhere (OP-220) | west to +2 | from +2 | `l5` |
| 5 Canopy | +2 | Lounge and gift shop | Lounge seats, the gift shop's counter (OP-014), the parkour's start east | east to +3, west to +1 | from +1, from +3 | `l5` |
| 5 Canopy | +1 | Park entrance | The entrance arch, the stair down to level 4, the front gate where OP-130's gate-crossed flag is set | west to 0, east to +2, stair down | stair landing, from 0, from +2 | `l5` |
| 5 Canopy | 0 | Trunk, canopy | The trunk's crown, the street's east end, the ticket booth (see section 11) | east to +1, west to -1 | from +1, from -1 | `l5` |
| 5 Canopy | -1 | Nests street, west half | Nest doors 1 to 4 in the canopy, the mirror's street side (OP-077) | east to 0, west to -2, each door to its nest | new owls (they wake in their nest and come out here, OP-105), from 0, from -2 | `l5` |
| 5 Canopy | -2 | Nests street, far west, and bough 6 | Nest doors 5 to 8, the second parkour bough, Tiers 1 to 3; shut behind a fallen branch at its foot, with the closed way beyond Owl Park (OP-220) | east to -1, doors to nests | from -1 | `l5` |
| 4 Sky landing | 0 | Stair landing | The spiral stair around the trunk, up to level 5 and down to level 3 | stair up, stair down, east to +1 | from either stair | `l4` |
| 4 Sky landing | +1 | Overlook | A quiet perch over the park, nothing to use, the view; one find | west to 0 | from 0 | `l4` |
| 3 High branch | 0 | Trunk, stair | The stairs up to level 4 and down to level 2, the branch's start east | stairs, east to +1 | from either stair | `l3` |
| 3 High branch | +1 | The stained-glass realm's common area | Its common area and game at the base: the climb's portal (OP-116), the idol, the guardian (OP-112) | west to 0, east to +2, the portal to the climb | from 0, from +2, from the climb | `l3` |
| 3 High branch | +2 | The stained-glass realm's adventure | The stained-glass street's screens attach here (today's art), parkour toward the tip, the style set's payoff at the tip | west to +1, into the stained-glass street | from +1 | `l3` |
| 2 High branch | 0 | Trunk, stair | The stairs up to level 3 and down to level 1, the branch's start west | stairs, west to -1 | from either stair | `l2` |
| 2 High branch | -1 | The grove's common area | Its common area and a new small game, the idol, the guardian (OP-031's art) | east to 0, west to -2 | from 0, from -2 | `l2` |
| 2 High branch | -2 | The grove's adventure | A treetop diner (OP-165), a cook-and-serve game, with the grove's quests (OP-013) around it; no parkour on this branch; the payoff at the tip | east to -1 | from -1 | `l2` |
| 1 Ground | 0 | Lobby ring | The round lobby at the trunk's foot: the booth's ground window, the stair up to level 2, the stair down to level 0; OP-157's style frame | stairs, east to +1, west to -1 | from either stair, from +1, from -1 | `l1` |
| 1 Ground | +1 | The market's common area | The market's lanterns, its idol, a new small game at the base, the guardian | west to 0, east to +2 | from 0, from +2 | `l1` |
| 1 Ground | +2 | The market's adventure | The roof run; the market's own screens attach here; parkour and the style set's payoff toward the tip | west to +1, into the market's screens | from +1 | `l1` |
| 1 Ground | -1 | The ink-wash realm's gate | Its gate, closed: the blockade (OP-027) | east to 0 | from 0 | `l1` |
| 0 Cavern | 0 | Stair foot | The stair up to level 1, roots, the cavern's mouth; one find | stair up, east to +1, west to -1 | from the stair, from +1, from -1 | `l0` |
| 0 Cavern | +1 | Neon Roost, the arcade cave | The arcade's three-screen hall (OP-059) rebuilt as a cave: the three cabinets, the score wall, the Hatching Soon slots | west to 0 | from 0 | its own room, cap 40, as today (section 11) |
| 0 Cavern | -1 | Realm challenge stair | The stair down to OP-115's first lock, the two-owl plate; dark until OP-115's first ticket ships | east to 0, stair down (closed) | from 0 | `l0` |

The climb's tower (OP-116), each nest's inside (OP-032), and the stained-glass and market streets
keep their own screens and rooms; the table shows where they attach.

Decided on OP-155 (2026-10-31): the arcade, Neon Roost, moves down to the cave, and the market's base
gets a different small game; the realm challenge below the cavern is OP-115's first lock, not a fifth
realm; stairs are room transitions; phones play landscape only. Taken as written when the owner made
the grid final: the owl at a sixth of the screen's height, eight nest doors on two canopy screens,
the two new base games, the ink-wash realm's gate at ground level until OP-058 opens it, and level 4
as a small level of its own.

## 3. Realm branches [PLANNED]

Each realm is a branch with the same three parts, so a visitor learns it once.

| Realm | Level | Base, near the trunk | Adventure, out the branch | Tip |
| --- | --- | --- | --- | --- |
| The stained-glass realm (`glass`) | 3, east | Common area, idol, guardian, the climb's portal as its game | The stained-glass street, then new parkour with a glass-light foreground | The style set's capstone (OP-110), reachable at Tier 1 |
| The grove (`grove`) | 2, west | Common area, idol, guardian, a new game: tap-timed hops between swaying perches, 30 s rounds, paid by the arcade's feather table | The treetop diner (OP-165) and the grove's quests; this realm trades its parkour for the diner | The style set's capstone |
| The market (`market`) | 1, east | Common area, idol, guardian, a new stall game: lanterns drift down and a tap catches them, 30 s rounds, the same pay table | The market's own screens, then parkour | The style set's capstone |
| The ink-wash realm | 1, west | A closed gate and its blockade | None yet | None yet |

The two new base games are the smallest things that meet OP-152 once Neon Roost moves to the cave: one
mechanic each, drawn in the arcade's neon line art, no new art spend. Each gets its own build ticket.

## 4. Named spots [the list BUILT as `TREE_SPOTS` (OP-156); placed level by level as each is built]

Every thing an owl uses has a name, so art can move under it (the sprite manifest, OP-127). A name is
the same on every map; its position is set per room by the spot placer (section 9). A placed spot is
the point its thing stands on, in whole room pixels: a doorway's or a stair's threshold middle on the
walking surface, an idol's, a booth's or a guardian's base centre. A stair joins two levels, so its
name is placed once in each of the two rooms (its two ends). The names are room-data ids, so they use
hyphens; l1's two existing doors keep their ids. The list below is `TREE_SPOTS`
(`packages/shared/src/treeSpots.ts`), each with its level and screen. The rooms test refuses a room's
`places` that are not its level's names, are placed twice, are not in whole pixels or lie outside the
room. The quest givers join the list when their level is built. Level 1 has no `places` yet.

| Name | Kind | Level and screen | Notes |
| --- | --- | --- | --- |
| `booth-canopy` | Booth | 5, 0 | Tickets and the store card (OP-153); see section 11 |
| `booth-lobby` | Booth window | 1, 0 | The same booth, ground side |
| `shop-gift` | Shop | 5, +2 | The rotating gift shop (OP-014) |
| `gate-entrance` | Gate | 5, +1 | The tree's front gate: OP-130's gate-crossed flag is set here |
| `stair-l5-l4`, `stair-l4-l3`, `stair-l3-l2`, `stair-l2-l1`, `stair-l1-l0` | Stair | The trunk's screens (`stair-l5-l4` at +1 on level 5) | One doorway pair each: on its lower level the stair up, at the east; on its upper level the stair down, at the west (OP-220) |
| `stair-challenge` | Stair | 0, -1 | Closed until OP-115 |
| `nest-door-1` to `nest-door-8` | Door | 5, -1 and -2 | The count matches today's street |
| `mirror-street` | Mirror | 5, -1 | OP-077 |
| `parkour-bough-6`, `parkour-bough-7` | Route start | 5, -2 and +3 | Tier markers along each |
| `bench-bough-6`, `bench-bough-7` | Bench | The boughs' tips | The climb's checkpoint, as a template |
| `idol-glass`, `idol-grove`, `idol-market` | Idol | 3 +1, 2 -1, 1 +1 | The Realm Vote (OP-122) |
| `guardian-glass`, `guardian-grove`, `guardian-market` | Guardian | The same screens | OP-112's species |
| `portal-climb` | Portal | 3, +1 | OP-116 |
| `game-grove` | Small game | 2, -1 | The grove's new base game (section 3) |
| `game-market` | Small game | 1, +1 | The market's new base game |
| `diner-grove` | Small game | 2, -2 | The treetop diner, OP-165 |
| `closed-west` | Gate | 1, -1 | The ink-wash realm's closed gate: the blockade (OP-027); l1's door |
| `to-market` | Door | 1, +2 | The archway into the market's own screens; l1's door |
| `cabinet-hoot-hop`, `cabinet-moon-flap`, `cabinet-talon-toss`, `score-wall` | Arcade | 0, +1 | Moved from the market street |
| `find-overlook`, `find-bough-6`, `find-bough-7`, `find-cavern` | Find | 4 +1, the boughs' tips, 0 0 | Extras at the Tier 3 spots, reached by gliding |
| `quest-*` | Quest givers | The realms' adventure screens | Named as in the Quest Log sheet; added when their level is built |

## 5. The style sheet [BUILT: OP-157, approved 2026-10-31]

Every screen of the tree is painted in the words of the approved style frame, the lobby ring (level 1,
screen 0). The words live in `tools/art/prompts.mjs`: `TREE_STYLE` (the same in every layer of every
screen) and `treeScreen` (one screen's prompts from its composition, its far distance, its scene and its
props). The art is made and picked as every image is (`docs/ART-PIPELINE.md`, `tools/art/README.md`);
the owner picks every layer.

- **Look:** hand-painted 2D art for a side-scrolling platformer in a storybook painterly style: clean
  cel-shaded shapes with soft painted gradients, matte-painting depth, slightly stylised proportions,
  no outlines, no photorealism, large flat colour areas that compress well. A magical night at a
  colossal ancient living tree.
- **Light, the same in every layer:** cool cream moonlight from high on the left; warm gold lantern
  light and sap-light glowing from within the wood; deep navy shadow on the right-hand sides of forms.
- **Palette:** night navy `#0C1E36` and deep navy `#07122A`; dusk blue `#2E4C7A` in the distance; gold
  `#C9A227` and warm gold light `#FFD36A`; cream `#F6F1E3` moonlight; bark `#2B1C12` to `#4A3322`;
  inner wood `#5C4632` lifting to `#8F8068`; moss `#3E5A3A` and `#6E8B4E`; cool shadow `#1B2E4C`.
- **View:** a strict side view, the camera level with the floor, no perspective floor plane; every
  surface an owl stands on is seen edge-on with a clear, flat top edge.
- **The far layers** (the sky plate, the middle distance) paint only the distance, edge to edge: the
  horizon, the clouds and the forest band run off both edges at the same heights so the neighbours
  continue them. Nothing near: no ground, path, ledge, railing or post. The moon is only in the lobby
  ring's sky.
- **The keyed layers** (everything at the camera's pace or faster) are painted on flat pure magenta
  `#FF00FF`, which the finish step keys out: crisp, opaque edges, no glow or haze on the magenta.
- **The overlay** frames the screen's edges only (leaves, lantern strings, a near root) and never covers
  the middle of the frame or anywhere an owl walks or jumps.
- **Interactive things are left bare in the paintings:** doorways, signs, statues, guardians, games,
  booths and counters. The game draws each as its own brighter, simpler sprite (section 7), and no
  painted glow goes where nothing is usable.
- **Each screen's prompt describes its edges** so the neighbouring screens stitch (OP-125's lesson): the
  path leaves both edges at the same height, and what stands at an edge is named on both sides.
- **No text, no characters, no UI** in any layer.
- **Sizes:** each layer is generated at 2048 x 1152 and finished as WebP with its alpha, under the art
  budget of 200 KB a file (`BUDGET_BYTES`); the middle distance is finished at half size (800 x 450) and
  drawn twice as big. A playfield whose floor sits off the ground line is moved down to it with the art
  tools' `shift` step (recorded in provenance); `--clear-poly` clears a stray prop from a keyed layer.
- **Cost:** about $0.07 an image on fal.ai; four candidates a layer.

## 6. Layers and parallax [BUILT]

A tree room's tiles carry a scroll `rate` (`RoomTile.rate`, `tilePlacement`): a tile lines up with the
room when the camera is centred on its own screen and drifts from there by (1 - rate) of the camera's
move. A slower tile is drawn bigger about its screen's centre (`TILE_GROW`, 0.2 per unit of rate it
lags by), so its edge never shows. Tiles that scroll at their own rate do not meet their neighbours
edge to edge, so their side edges fade (`RoomTile.fade`): the sky by 220 room px where it lies over a
neighbour (`TREE_SKY_FADE`), the middle distance by 230 (`TREE_MID_FADE`), the overlay by 120
(`TREE_EDGE_FADE`). The skies are drawn farthest from the lobby first, the lobby's on top, so its
approved view stays as it is.

| Layer | Rate | Drawn | What it is |
| --- | --- | --- | --- |
| Sky plate | 0.5 | behind the owls | The far distance |
| Middle distance | 0.75 | behind the owls | Boughs and silhouettes between the sky and the playfield (added on the owner's ask, OP-162) |
| Playfield | 1 | behind the owls, a step quieter | What the owls walk on and past |
| Overlay | 1.2 | in front of the owls | The screen's framing props |

**The next levels are painted in six layers** (OP-173, approved 2026-11-01), so what is standable, in
front, or usable is clear in the art itself: the sky (0.5), the middle distance (0.75), back scenery
(1, muted: nothing in it may look standable or usable), platforms (1, only what an owl stands on, with
flat, strong tops, marked as ledges with the painter), front props (1, keyed, drawn over the owls:
posts, railings, banisters, lamp posts, roots; a `foregrounds` tile at rate 1) and the overlay (1.2).
That is 24 candidates a screen, about $1.60 before re-runs. Level 1 was painted before the scheme, so
the game applies it over its four layers (section 7).

## 7. How a tree room reads [BUILT: OP-173]

`apps/park/src/game/treeView.ts` makes what is standable, in front and usable read at a glance:

- **A quieter playfield:** the 1x tiles and their fronts take a multiply tint (`TREE_PLAY_TINT`), so
  what the game draws over them stands out.
- **One look for "an owl can stand here":** every ledge gets the same bright edge along its top, a soft
  warm glow under a crisp cream line, drawn by the game, never painted.
- **Fronts** (`RoomDef.fronts`): shapes of the playfield painted in front of the path (a lamp post, a
  post before a stall) drawn again over the owls, so an owl passes behind them. Each hugs its thing's
  outline. A `raised` front (a stair's banister) is drawn only over owls on a ledge: an owl climbing the
  stair is behind it and one walking by on the floor stays in front.
- **Owls on a ledge are drawn behind owls on the floor** (`TREE_RAISED_BAND`), still over the playfield.
- **Shades** (`RoomDef.shades`): painted glows that do nothing yet (a closed gate's lit doors, a lit
  window) shaded darker by their `alpha`, following the painted shape with a soft edge, so they do not
  read as things to use.
- **The doorway mark** (a door's `markAt`): over each way through to another room, a dark pill with a
  cream arch and a gold dot, in the colours of the '!' over an owl to talk to (OP-114).
- **A doorway's height** (a door's `top`): an owl goes through only standing at that height (within
  `PERCH_SLACK`), so one on a ledge over the doorway walks on past it. Every doorway of the tree is on
  the floor, `top: 0` (OP-220).
- **A stair's way** (a door's `way`, OP-220): its mark has a chevron, up or down, in place of the dot.
- **Barriers** (`RoomDef.barriers`, OP-220): each `{ id, kind, x, w, sign }`, drawn on the floor from `x`
  to `x + w` over the playfield and under the owls: `gate` (two low leaves, a chain and a padlock),
  `rope` (two posts and a sagging rope), `branch` (a fallen branch on a stump, a few leaves) or `boards`
  (planks nailed across), its sign on a cream board over it and a warm glow behind that breathes slowly
  (still with calm motion). The rooms test holds the rules of section 1.
- **Stairheads** (`RoomDef.landings`, OP-220): `{ id, x, w }` under a stair's doorway, a dark opening in the
  boardwalk with its first treads going down, a post each side and a rail.

## 8. Level 1 as built [BUILT: OP-162, OP-173]

Room `l1` (`packages/shared/rooms/index.ts`): map 2, `gated`, `owlScale` 1.25, four screens west to
east, 6400 x 900: the path to the ink-wash realm's closed gate (`w1`, index -1), the lobby ring (`0`),
the market's common square (`e1`, +1) and its roof run (`e2`, +2). Each screen has four layers
(`tree-l1-<screen>-bg`, `-mid`, `-play`, `-fg`).

- **Spawns:** `default` in the lobby's middle, `west` at the west end, `east` at the roof run's end,
  `market` just short of the archway, for an owl coming back from the market.
- **Doors:** `closed-west`, the closed gate, a locked gate drawn where the floor ends (its sign 'Not Yet
  Fledged', one of `CLOSED_SIGNS`); the lobby's two stairs, the way down to level 0 under the lintel
  (west) and the spiral stair up to level 2 taken at its foot (east), both on the floor (OP-220);
  `to-market`, the archway at the roof run's east end into the market's own screens, taken from the
  ground only (`top: 0`). The market's way out leads an owl walking the tree back to the archway
  (`toTree`; `TREE_REALMS` lists the rooms of today's park the tree opens into); every other owl still
  goes to the hub.
- **Ledges:** 14, from the west path's boulder (110 up) to the market square's stall roofs (350 up),
  each a `treeLedge` with the screen it is on. Since OP-220 the spiral stair's treads and balcony are not
  ledges (the stair is taken at its foot), and the roof run's crates, roofs and tower balcony are not
  either: they lead nowhere until the market's adventure is built, so a rope across the foot of the
  crates (`roof-run`, 'Hatching Soon') shuts the climb while the boardwalk runs on under it.
- **Fronts:** the west path's two lamp posts and their lanterns, the post in front of the square's
  stall, the lobby stair's banister (raised) and the balcony's railing, cut rail by rail from the
  paintings.
- **Shades:** the closed gate's doors, the booth window, the nest high in the hollow, the way down, the
  square's stall windows, the roof run's stall fronts.
- **Not yet:** the lobby's way up through the chamber's ceiling and its way down into the roots are
  painted but lead nowhere until levels 2 and 0 exist; the booth window does nothing yet.

## 9. Tools for building a level

- **The keeper's token [BUILT].** Open the park with `?keeper=1` and give the admin key once: the page
  swaps it for a keeper's token for that tab only (`KEEPER_TTL_S`, 12 hours), and the room server lets
  that owl into a gated tree room. Add `room=<id>` to start in a tree room, e.g. `?room=l1&keeper=1`.
- **The realms switch [BUILT].** A tree room is `gated`: closed to everyone but keepers until its id is in
  the realms switch's `open` list on the keepers' capacity page, or while the tree takes a share of new
  owls (the entries setting, below).
- **The ledge painter [BUILT: OP-156].** Keepers only: add `&paint=1` with the keeper's token. It shows
  the room's ledges with their heights, suggests ledges from the playfield in view, and lets a keeper
  draw, move and delete ledges, walls, hazards and fronts, with undo; Try lets the keeper's owl stand on
  the draft in that tab only. Save keeps the draft on the Worker (`POST /api/admin/masks/<room>`, one per
  room, checked by `checkMasks`); `GET /api/masks/<room>` reads it back. `pnpm masks:pull <room>` prints
  it as room data to paste into `packages/shared/rooms/index.ts`, with what differs from the room now.
  The game never reads a draft: a ledge is the park's once it is in the room data.
  Suggest reads the tops of what is painted against the keyed-out sky. On level 1 it found 8 of the 25
  ledges: the wall's top, three of the crate stacks, the stall roofs, the barrel and the roof run's two
  roofs. It also offered 54 tops that are not ledges (lanterns, signs, the gate's roof, the tree's
  crown), which stay untaken. A ledge painted over other solid art (the stair inside the trunk, the
  boulder before the wall, the plinth and its steps) gets no suggestion: draw it by hand.
- **The spot placer [BUILT: OP-156].** In the same painter, the Spot tool lists the level's names
  (section 4) west to east, each placed one ticked. A keeper picks a name and taps the playfield where
  its thing stands, then saves; `pnpm masks:pull` prints the room's `places` to paste into the room data.
  The game does not read `places` yet: each level's ticket wires its doors, booth, idols and the rest
  from them.
- **The entries setting [BUILT: OP-156].** A card on the keepers' capacity page, beside the realms
  switch: of every hundred new owls, how many start in the tree (0 to 100, kept with the realms switch as
  `tree`). At 0, as deployed, the tree is dark and only a keeper's token reaches it. Above 0 its gated
  rooms are open to every owl the front gate lets in. Play still lands every owl in its own nest; for
  an owl the tree takes (about the share, each owl the same way every visit), the nest's door leads to
  the tree's arrival (`TREE_ARRIVAL`: level 5's street `l5-street`, in front of the owl's own nest
  door). The street is outside the tree's front gate, a free room as the nests' street is, so a guest
  pass starts there too while the park takes tickets and buys its Day Ticket at that gate (OP-128; it
  started in today's park while the arrival was inside). Back to 0, every owl in the tree is sent to
  the hub (one on the tree's street to the nests' street, outside the park as it was), and an owl of
  the tree takes today's park's ways again. The same setting answers to the admin API as
  `{"realms": {"tree": n}}`.
- **The turn-your-phone card [BUILT: OP-156].** In a tree room, a phone held upright (a touch screen
  under 600 CSS pixels across) sees a card over the game asking to turn it sideways, and nothing under
  it takes a tap; it goes once the phone is turned. The cards that ask the visitor something ("Still
  here?", the account screens) stay above it. Its one line, under a picture of a phone turning, is the
  owner's pick: "This part of the park plays with your phone on its side." (`TURN_PHONE_WORDS`).

## 10. Building a level, step by step

The recipe for OP-158 to OP-161 and OP-163, as level 1 was built:

1. **Prompts.** One `treeScreen` per screen in `tools/art/prompts.mjs`, six layers each (section 6), in
   the style sheet's words (section 5), each screen's edges described to match its neighbours'.
2. **Generate and pick.** A dry run first, then four candidates a layer; the owner picks each layer from
   its contact sheet. Spending past the level's ticket budget waits on the owner.
3. **Finish and preview.** Key the magenta, move each playfield's floor onto the ground line (`shift`),
   check every file is under budget, mend the joins between screens (OP-125's seam recipe), and show the
   owner the in-game compare images. Nothing is published or committed before the owner approves.
4. **Room data.** One room `l<n>`, `map: 2`, `gated: true`, `owlScale: 1.25`, the tiles at their rates
   with their fades, the floor strip on the ground line, the spawns, the doors (stairs included).
5. **Mark it.** Ledges and fronts with the painter, spots with the placer, then `pnpm masks:pull` and
   paste. Shades for any painted glow that does nothing.
6. **Test.** The rooms tests (every spawn on the floor, every find reachable), the tree's browser test
   walking the level from both ends, `pnpm check` and `pnpm e2e`; map 1's suite unchanged.
7. **Review.** A review sheet per screen for the four mismatches of OP-173 (looks standable but is not,
   is standable but does not look it, in front but drawn behind, usable but not marked), then QA's walk
   by hand on a phone and a computer, then the owner's go to merge (main deploys the live park).

## 11. Open questions

- DECIDED (2026-11-01, built 2026-11-02): level 5 is two rooms, split at the front gate so the Day
  Ticket is sold where the tree's park begins: the nests street `l5-street` (-2 to 0, outside the
  gate, the trunk's crown included) and the canopy `l5` (+1 to +3, inside). The gate's turnstiles are
  the street's east end, and an owl comes through under the entrance arch. A level's second room is
  named `l<n>-<word>` (`treeLevelOf`). The street is the tree's nests street (`isStreetRoom`): its six
  nest doors (`nest-door-0` to `-5`, the owl's own behind door 0, east to west) work as the nests'
  street's do, and the seventh painted door, westmost, is closed ('Hatching Soon', `spare-nest`). The
  front gate does what the lobby's turnstiles do (OP-180's sale, OP-190's walk in, OP-198's ask), and
  an owl it turns back steps back west along the floor. Leave the park, and Play back from checkout,
  put an owl of the tree before this gate. The trunk's painted doorway on screen 0 leads nowhere yet. The street's west end, at the foot of bough 6, has a closed doorway
  (`closed-beyond`, 'Hatching Soon') for places beyond Owl Park, behind a fallen branch where the floor
  ends; no destination yet (the owner's steer, 2026-11-02). It stood on bough 6's highest perch until
  OP-220 shut the bough. QUESTION FOR LATER: what lies beyond Owl Park, and how it connects.
- OPEN QUESTION: the grid puts a ticket booth on level 5 (`booth-canopy`) and its window in the lobby
  ring (`booth-lobby`); OP-180 sells tickets at the turnstiles and drops today's booth. Whether the tree
  keeps a booth is the owner's.
- DECIDED (built 2026-11-02, OP-163): the arcade cave is a new room, `l0-arcade` (cap 40, the default),
  beside today's `arcade`, which stays for today's park. Both are the arcade (`isArcadeRoom`): the same
  three cabinets, score wall and book. The cave's paintings leave bare alcoves, so the game draws each
  cabinet in its alcove, the score wall in the middle screen's chrome panel, and Hatching Soon in the
  last screen's two small alcoves. For an owl walking the tree, the market's arcade door leads to the
  cave (`toTree`), so the old hall is no longer a realm the tree opens into.

## 12. What changes from today's park

The nests street moves from the ground to the canopy and becomes the first thing a new owl sees after
its nest; the hub becomes the lobby ring at the trunk's foot; Neon Roost moves from the market street's
east end to the cavern; the grove becomes a branch realm rather than an area that reads as the park's
outside; the whole park gains a vertical axis for flight (OP-084) and the realm challenges (OP-115).
Nothing about owls, collections, quests, the climb, the data model or the store changes.

## 13. The hollow hall [BUILT, switched on 2026-11-06]

The owner's direction of 2026-11-06: the inside of the tree is one great vertical hall, with a common
space at each level inside it and the realms and their parkour outside the tree on each level.

- **One room, five screens high** (`m3-hall`, packages/shared/rooms/hollowHall.ts), seen from the side
  and drawn from the clearing's kit. Its ground line is `HALL_GROUND` (4370), as far above its foot as a
  screen's is, and its ledges stand up to `perchTopLimit(HALL_H)` over it.
- **The climb and the lift.** A zigzag of fungus shelves climbs from landing to landing, each a jump and
  a flap above the last (205), and two nooks off it each end in a leaf pile. A column of rising air up
  the middle (`HALL_LIFT`) lifts a gliding owl from the floor to the knothole. Either way reaches every
  landing (hollowHall.test.ts).
- **A landing a level, top to bottom** (`HALL_LEVELS`): the stained-glass realm's (west, 3280), the
  ink-wash realm's (east, 2460), the Treehouse Clearing's (west, 1640) and the neon realm's (east, 820),
  each with its doorway into its Commons, taken from the landing (a door's `top`). The knothole's landing
  (4100) leads up to the Treetop Commons. On the floor, the hatch down the root stair (west) and the
  trunk's door out to the Party Grove (east): down on the left, up on the right.
- **Arriving up high.** An owl that comes out of a Commons, or down from the Treetop Commons, arrives
  standing on its landing (`spawnTops`, `spawnTop`), not on the floor.
- **The Commons** (`commons-glass`, `commons-ink`, `commons-grove`, `commons-market`) are built on the
  hub's floor plan and, until their own centre screens are painted (the art order's line 9), on copies
  of the hub's paintings (`commons-west`, `commons`, `commons-east`). Each has the way out to its
  landing, its realm's arch (the ink-wash realm's shut: Hatching Soon), and the Realm Vote's idol for a
  voted realm (`votesFor`): the vote counts for the realm, wherever its idol stands. The Clearing's
  middle arch leads to the Updraft Canopy course, and the paper Commons' middle arch to Brushstroke
  Bridges (`brush-1` to `brush-3b`, docs/levels/brushstroke-bridges.md), and the neon Commons' middle
  arch to the neon realm's course (`circuit-1` to `circuit-3`, docs/levels/neon-course.md), each the
  keepers' for now.
- **Switched on** (the owner's "Switch it on", 2026-11-06). Every owl the new map takes goes through the
  turnstiles down the knothole into the hall (`NEW_MAP_WAYS`), each realm's way out leads back into its
  Commons, the Party Grove's way in leads to the trunk's door, and the root stair comes up into the
  hall's floor. The old stairs (`m3-stair-1` to `m3-ground`) are left over: nothing leads into them, and
  an owl still on one walks out of it into the map as it is. The Updraft Canopy stays the keepers': the
  Clearing's middle arch reads as shut (Not Yet Fledged) to any owl without a keeper's token.
