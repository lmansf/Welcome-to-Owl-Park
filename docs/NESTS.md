# Nests

Every owl has a nest of its own: a cosy round room inside a tree, on a street of tree houses outside
the turnstiles (proposal C39). It is all free and needs no ticket, also once the park takes tickets
(`GATE=ticket`): the lobby, the street and the nests are open to every visitor. Every number and
every visitor-facing word below is a default waiting on the owner's approval; the paintings are
approved (see Art).

The rules are data and functions in `packages/shared/src`, so the room server and the zero-backend
local mode run the same ones and Node tests them:

- `homes.ts`: the furniture, the twelve spots in a nest, arranging (`placeFurniture`), nest ids
  and rooms, the day's furniture gift, and every word the nests say (`NEST_WORDS`);
- `nestbook.ts`: the nests' book (`NestBook`) over a store: each owl's nest, the furniture it owns,
  the street's doors and the gift; `MemoryNestStore` for the local mode and the tests;
- `rooms/index.ts`: the street (`homes`) and the nest every owl has (`NEST_ROOM`, a template:
  each nest is that room under its own id, `nest-<nestId>`, as `roomFor` gives it).

## Where it is

At the lobby's west end, past the balustrade, a lane says **To the nests**. It leads to the street:
two screens of tree houses at dusk, six round doors along a lane, and a way back to the lobby past
the two posts at the east end.

- **Door 0**, nearest the lobby, is always the visitor's own nest: **Your nest** hangs over it with
  a flag in the visitor's colours.
- **Doors 1 to 5** are other owls' open nests, a fresh mix each time the visitor comes onto the
  street: picked at random from the 40 open nests their owners arranged most recently. Each shows a
  small flag in its owner's colours (body, belly and tufts) and a warm light. A door with nobody
  behind it stays dark and says **Closed for now**.
- No names anywhere: a nest is known by its id alone, and the flag is the only thing of its owner
  anyone sees. Nobody types anything, and a nest holds nothing but approved pieces in its spots.

Out of a nest, an owl comes back to the street in front of the door it went in by.

## A nest

One screen: the round door in the west wall, a round window in the back wall, shelves, and a hearth
in the east wall. Twelve spots: eight on the floor (`f1` to `f8`, four along the back and four
nearer the front) and four on the back wall (`w1` to `w4`, two each side of the window). Wall
pieces hang behind every owl; rugs lie under them; everything else is sorted in depth with the owls
by its spot.

A new nest is made the first time its owl comes onto the street: a random id of eight letters and
digits (never anything from the owl's collector id), the four starter pieces arranged in it, open to
visitors.

| | Default |
| --- | --- |
| Starter pieces | Rug, Lamp, Potted fern, Stump table |
| Where they stand in a new nest | lamp `f1`, stump table `f3`, potted fern `f4`, rug `f6` |
| Owls in one nest at once | 12 (the owner always gets in) |
| The street's doors come from | the 40 open nests arranged most recently |

## Decorating

In its own nest the owl gets a **Decorate** button (or E). The Decorate sheet runs along the bottom
of the screen and the room fills the screen above it; taps choose spots instead of walking, the
arrow keys step through them, and the camera looks at the chosen spot. For each spot the sheet
shows the pieces the owl owns that fit it (floor pieces for the floor, wall pieces for the wall),
with the number of the spot each stands in now; choosing one moves it there. **Take away** puts the
spot's piece back with the owl. **Open to visitors** / **Closed to visitors** lets visitors in or
keeps them out: closing sends any visitors inside back to the street. **Done** (or Escape) ends it.

Everyone inside sees each change as it happens. Only the owner can change its nest.

## Furniture and the day's gift

Furniture is a kind of thing an owl owns that is used only in nests. The first set has sixteen
pieces (`FURNITURE`): Rug, Armchair, Bookshelf, Lamp, Potted fern, Mushroom stool, Quilt bed,
Acorn bowl, Teapot table, Moss rug, Stump table on the floor, and Wall clock, Framed leaf, Window
box, String of lanterns, Feather mobile on the wall.

**Today's furniture gift**, in the Decorate sheet, gives a piece the owl does not own yet, at random,
once a park day (new at midnight in the park, US Eastern, like the rest of the park's days). An owl
that owns all sixteen gets 5 feathers instead (what a common collectible pays when it comes again).

## The room server

The nests live in the Collections object's SQLite (`apps/edge/src/sqlNestStore.ts`: tables `nests`
and `furniture`; no new Durable Object class, no migration). The room object holds the street and
the nests as rooms: a nest's room checks with the collections whether the nest is there and open
before it welcomes a visitor, and turns the visitor away otherwise (a `closed` frame, then close
4011, which the page does not reconnect after). Protocol 7 (`packages/shared/src/edge.ts`) adds the
`street` and `nest` frames; see `docs/ARCHITECTURE.md`. The day's gift is `POST /api/nest/gift` with
the visitor's pass. Population counts add every nest up under one `nests` entry, so they never name
a nest.

## The local mode

Without a server the page keeps the nests in this browser's storage (`owl-park:nests`), every
collector's together: tabs opened as different collectors (`?collector=`) find each other's open
nests on the street and can visit them, and a change a nest's owner makes reaches the other tabs
inside it. The end-to-end tests use this (`apps/park/e2e/nests.spec.ts`).

## Art

Painted in Seedream and approved on 2026-10-21: the street's two screens (`homes`, and
`homes-west` painted to continue it), the inside of a nest (`nest`) and the sixteen pieces of
furniture (`decor-<id>`), each picked from two candidates. Each file's line in
`tools/art/provenance.jsonl` says how it was made; the jobs are in `tools/art/prompts.mjs` (see
`docs/ART-PIPELINE.md`). The room data follows the paintings: the street's six doors, its lane
and spawns, and the nest's floor, door and twelve furniture spots (`NEST_SPOTS`). A room test
checks that one walk from wherever an owl appears on the street reaches every door.
