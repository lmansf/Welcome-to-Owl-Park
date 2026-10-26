# The stained-glass climb

*   **Author:** lmansf, with Claude Code
*   **Status:** Proposed
*   **Date:** 2026-10-26
*   **Predecessor:** the EGM concepts brief of 2026-10-26 (six Goldfish lenses, decisions 1 to 12; kept in the ignored `EGM/` working folder, not in git)

--------------------------------------------------------------------------------

## Overview

Owl Park opens one of the hub's two closed arches onto a third realm: a shared stained-glass room that works like the grove and the market, and inside it a portal that starts a solo climb. The climb is a platformer played on the visitor's own device as their own owl, up a vertical city of backlit mosaic glass to a cloud line, with a jump, a double jump and a held-jump glide. Nothing about the climb crosses the wire while it is played; the room server starts the run, receives one result at the end, judges it against a minimum honest time, and pays feathers by the height reached. A park moon sets how hard each night is, and the owner can switch on special nights. Tap-to-walk, the phone pad, the keyboard and the hop emote stay exactly as they are everywhere else in the park.

## The Problem

The park promises four realms and has two. Both open realms are social rooms: places to stand with other owls, talk in phrases, vote at an idol and do small tasks that pay feathers. Nothing in the park today asks a visitor for skill over more than a few seconds, nothing is vertical, and the one skill game the park has (the arcade) is twenty seconds a run. The third realm's art style, stained glass, suggests height and light, and the owner wants it to play that way: a climb with a reward in the clouds.

The obstacle is that the park cannot move like a platformer. Every room is a painted stage with walkable polygons; a tap sends one destination and every client animates the same straight walk, which is why one room server carries a hundred owls affordably and why the server can clamp every walk against the same geometry the client uses. Gravity, held keys and mid-air control do not fit that model, and streaming positions many times a second would break the message budget the edge server was chosen for. Replacing tap-to-walk across the park was considered and rejected during the brainstorm as a different project by an order of magnitude.

The proposed solution keeps the two models apart. The shared stained-glass room is an ordinary room: the same registry, geometry, doors, idol and caps as the other realms. The climb is a solo run on the arcade's model, which already proves the pattern: a game played on the client as the visitor's owl, started by the server with a seed, settled by one result frame, judged against a least possible time, paid under the activities' shared daily cap. The climb extends that model where the arcade did not need it: a run that lasts minutes and survives a dropped connection, a glide that makes a missed jump cost height rather than the run, per-band payouts once a day, a first-ascent item, a moon that selects the night's layout, and a record of every result so a dispute can be answered.

## Goals

*   **G1. A third realm as an ordinary room.** One hub arch opens onto a shared stained-glass room: walkable polygons, doors, spawns, a cap, other owls visible, the realm's idol accepting Realm Votes, the room server authoritative. The room is data in `packages/shared/rooms/index.ts` with the same tests as the other rooms.
*   **G2. A solo climb on the arcade's run model.** A portal spot in the room starts a run; the climb plays entirely on the client as the visitor's own owl; at most seven frames cross the wire per run (one start, one per band reached), each under the 1,024-byte frame limit; no positions, inputs or client clocks are sent during play.
*   **G3. Movement that feels responsive on phones and computers.** A fixed-step simulation with acceleration, coyote time and variable jump height as candidate techniques; a jump, a second press for a double jump, a held jump that glides; the climb screen owns its own stick and jump button inside the full-screen modal, built on the park's existing joystick and keyboard modules so key-place matching and the left-hand mirror carry over.
*   **G4. The glide is the safety net.** A missed jump costs height, never the run: every point in a layout can glide to a ledge, every ledge has a route up, and once a height band is reached the owl cannot fall below it. These are tested invariants over the layout data, not promises.
*   **G5. A run that survives.** The run record (seed, night, start time) is kept per collector in server storage, not on the socket, and is re-attached on the next connection; a visitor can stop and bank the highest band reached at any time; the server forgets a run one hour after it started.
*   **G6. An honest result, cheaply.** The server refuses a result that arrives sooner than the least time to its band under the night's layout. Layouts, physics constants and the per-(layout, band) time floors live together in `packages/shared`, derived or checked by a unit test that scripts a perfect run, so a tuning change that invalidates a floor fails the build. Refused-as-implausible results are counted per collector for a keeper's review.
*   **G7. Payout under the existing cap.** Each height band pays once a park day, through the activities' shared 25-feather daily cap (`PLAY_FEATHERS_PER_DAY`); the first ever ascent to the clouds grants one common catalogue item, recorded as its own fact; the start card shows the cap, today's best paid band and the moon before a climb begins; the server says why a payout was zero.
*   **G8. Every result is answerable.** One row per result, written before the ledger call and finalised after, idempotent on (collector, seed), with a finer refusal reason and a structured log line on every refusal, plus a keeper's view of one collector and a daily climb counter.
*   **G9. The moon and the special nights are data.** A pure `parkMoon(day)` over the park day clock selects a night (layout and pay table) at run start; the night is pinned to the run and judged by it even across park midnight; the owner's special nights are named entries in the same shared table, selected by a key in a server-side setting, never free-form content.
*   **G10. Ships dark, switches on.** The realm, the portal and the current special night are governed by one server-side settings record on the gate switch's pattern; the socket route refuses a closed realm with its sign; a keeper flips it from the admin pages and the flip is logged; a rollback is the ordinary Worker rollback.
*   **G11. Art within the pipeline and the phone budget.** A small set of reusable segment pieces (glass panels, ledges, a cloud cap, a sky) through the existing Seedream pipeline, loaded at run start and released at run end, counted in the room's budget; night variants as tints or grades over one approved set; the owner approves every image; neutral keys only.
*   **G12. Tests stay deterministic.** `parkMoon` and the night selection are pure functions with fixed-input tests; the local mode and the browser tests accept a night override; `pnpm check` and `pnpm e2e` pass on every date.

## Non-Goals

*   No change to tap-to-walk, the phone pad, the keyboard, `jumpEveryMs` or the hop emote anywhere outside the climb screen.
*   No positions, inputs or client durations on the wire during a climb; no input-trace replay on the server (decision 7).
*   No leaderboard, score wall or standings for the climb. If one is added later it follows the arcade's no-names rule.
*   No layouts, pay tables or visitor-facing words delivered through a setting; the setting selects among entries already in the bundle.
*   No new painting per moon phase or special night.
*   No new feather source outside the shared daily cap, unless a special night is given its own capped source (open question).
*   No per-visitor allowlist, private rehearsal mode or scheduling in the realm switch.
*   No decision on the deferred flight ticket (OP-084) beyond naming the constants it must reuse or retire.
*   No internal realm name, other game or studio name, or owner detail in code, docs, art keys, tests or commit messages; the public name waits on OP-069.

## Open Questions

Carried from the brief; the Technical Plan takes defaults for the rest (see "Decisions taken in this section") and the owner confirms or changes them at the gate.

*   **Q1 (brief 5).** Which arch opens, `closed-a` ("Not Yet Fledged", west) or `closed-b` ("Hatching Soon", east), and does the hub's tile get repainted when it opens?
*   **Q10 (brief 14).** Switch to `ROOM_SHARDING=room` before the arch opens, or run a five-room load test first? Is the paid Workers plan bought before opening night?
*   **Q11 (brief 15).** Where the third realm sits in the Realm Vote's fixed tie-break order; whether it takes votes from the day the arch opens; whether the idol's art ships in this wave.

## Critical User Journeys (CUJs)

### CUJ 1: A first climb on a phone, stopped partway

*   **Given**: The realm is open in the park settings, the portal is live, the visitor has a ticket and stands in the stained-glass room with the pad showing. It is the third night of the park moon (an easy night). The visitor has earned 4 of today's 25 feathers from games.
*   **When**: They walk to the portal spot, tap Interact ("Climb"), read the start card (tonight's moon in one line, feathers from games today 4 of 25, no band paid yet, time to park midnight), and tap Start. The climb screen opens over the room with its own stick on the left and jump button on the right. They run, jump, double jump, miss a gap, hold jump and glide down to a ledge two storeys lower, climb again, reach the third band, then tap Stop.
*   **Then**: Each time a new band was reached, one frame went to the server and came back accepted; the result card reads "Third storey. +4 feathers" with "8 of 25 today"; the owl stands at the portal again; the next climb tonight pays only for bands above the third; no move, emote or position frame was sent while the climb was up.

### CUJ 2: The connection drops mid-climb

*   **Given**: A climb is open (banked up to the second band); the phone sleeps for four minutes; the socket is closed by the idle reaper.
*   **When**: The visitor wakes the phone. The page reconnects, says hello, and the climb screen (still open on the page) asks the server for its run again.
*   **Then**: The server returns the same run (same seed, night and start time, banked band 2, `resumed: true`); the climb continues where the page left it; bands above 2 still pay. If the page itself was reloaded, the climb screen reopens at the second band's floor with the same run, since the simulation state lives on the page and the banked progress on the server. If more than an hour has passed since the run started, the server answers that the run was forgotten and the card says so in plain words, with nothing taken.

### CUJ 3: The first ascent to the clouds on a computer

*   **Given**: A visitor with the arrow keys and Space, on a full-moon night (the hardest regular layout), has never reached the clouds.
*   **When**: They reach the cloud line.
*   **Then**: The server checks the time since the run started against the cloud band's floor for that layout, pays the remaining bands under the cap, records the ascent, grants the realm's first-ascent item once, and the result card shows the item in the collection's style with a line saying it is given once ever. A second ascent, tonight or any night, pays its bands and says the item was already given.

### CUJ 4: The cap is already reached

*   **Given**: The visitor earned 25 feathers from games today before entering the realm.
*   **When**: They open the start card.
*   **Then**: The card says feathers from games today 25 of 25 and that a climb tonight pays nothing until park midnight, with the time left; they may still climb. A result frame is accepted and recorded with "capped" as the reason the payout was zero, so the day's best band still counts and the first ascent is still recorded and granted.

### CUJ 5: The owner switches a special night on and the portal off

*   **Given**: A keeper is signed in to the admin pages.
*   **When**: They set the special night key to `blood-moon`, and later, after a report of a broken layout, turn the portal off.
*   **Then**: Within a minute, new runs start under the blood-moon layout and pay table; runs already open keep the night they started with. After the portal is turned off, the portal spot shows an approved closed phrase, `climb` is refused with reason `closed`, open runs may still send their banked bands until they are forgotten, and both flips are logged with who and when.

### CUJ 6: A visitor says they reached the clouds and got nothing

*   **Given**: A Feedback note quotes the run reference shown on the result card.
*   **When**: A keeper looks the reference up on the admin climb page.
*   **Then**: They see the run's night, start time, each band frame's arrival time and verdict, the floors in force, the feathers added per band and why any were zero, whether the first ascent was recorded, and can grant feathers or the item with a required note, written as an admin action the visitor's next result card does not need to know about.

## Technical Plan (Architecture)

The design has four parts: an ordinary room, a solo climb simulation shared by the page and the server, a climb book that owns runs and payouts in the collections object, and one settings record that opens the realm. The hub, the room server's movement model and the wire protocol's shape are unchanged; the protocol gains two `act` kinds and bumps its version.

```text
 page (apps/park)                        room object (apps/edge RoomObject)         collections object (apps/edge Collections)
 ───────────────                         ──────────────────────────────────         ──────────────────────────────────────────
 RoomScene in room `glass`  ── move/emote/say ──▶ Room geometry, caps, fan-out        ClimbBook over climb_runs, climb_bands,
   │ stands at `portal` spot                     (unchanged)                           climb_ascents, admin_actions
   │ Interact ▶ act climb ─────────────────────▶ at the spot? portal live? ──RPC──▶ climbStart(cid, nightKey) → open run or new
   │ ◀── act climb ok {seed, night, startedAt,                                      (seed, night pinned, startedAt, banked)
   │       banked, remainingCap, resumed}
   ▼
 ClimbScene (Phaser, full-screen modal, own stick + jump)
   runs the shared simulation at 120 Hz from `seed` and `night`
   ── act ascent {k: seed, band} per new band ─▶ passes through ──────RPC──▶ climbBand(cid, seed, band, now)
   ◀── act ascent ok {band, added, feathers,                                      floor check: now − startedAt ≥ leastClimbMs(layout, band)
         total, why?: 'capped'|'paid-today'|…,                                    pay (band − banked) through the 'play' cap, once a day
         ascent?: {item, first}}                                                  band 6: record ascent, grant item once
   Stop / Escape ▶ close the scene, no frame                                       row per frame: pending → settled, idempotent on (cid, seed, band)

 Worker (apps/edge index.ts)                 vote ledger object (park_settings)
 /ws/<room>: isRoomId AND realm open?  ◀──── realms: {open: [...], portal: bool, night: key|null}
 /api/admin/realms GET/POST (ADMIN_KEY)  ───▶ flips logged (who, when, before, after)
 /api/admin/climb, /api/admin/collector
```

### The room

The stained-glass room is a `RoomDef` in `packages/shared/rooms/index.ts` with the neutral id `glass`: one or two screens wide, horizontal like the others (only the climb is vertical), a floor polygon, a `from-hub` spawn, a door back to the hub, an `idol` door for the Realm Vote, a `portal` door without `to` (the arcade cabinet pattern: a spot the client's `interactions` table turns into an Interact action), and a new `mood` value for its lighting. The hub gains a `to` on the chosen closed arch and a `from-glass` spawn; the other arch keeps its blockade. The realm joins `VOTABLE_REALMS` as the third entry, `DEFAULT_CAPS` at 40, the quest catalogue's room list, the Menu map's places and paths (public name from OP-069), the collection log's spots, and a style set. The room's tests are the existing ones: tiles cover the room, spawns stand on the floor, doors resolve.

### The simulation and the layouts (shared)

`packages/shared/src/climb.ts` holds everything both sides must agree on, with no platform code:

*   **Physics constants** (named, like the flap's): run acceleration and top speed, gravity, jump impulse and the variable-height cut, coyote time, jump buffer, the double jump's impulse, the glide's fall speed and horizontal speed, the owl's collision box. Movement is a fixed-step simulation at the arcade's `STEP_MS` (120 Hz) driven by a held-state input `{left, right, jumpPressed, jumpHeld}`, so a step is a pure function of state and input.
*   **Layouts** as data: a list of ledges (rectangles in field pixels), the band lines (heights), the cloud line, the start ledge, and per-band floors. A layout is built from a small vocabulary of segment pieces (a glass column, a ledge, a balcony, a cloud cap) that the art pipeline paints once; the data says which piece sits where.
*   **Nights**: `NIGHTS` maps a night key to a layout id and a band table. `parkMoon(day)` in `parktime.ts` is a pure function over the park day: a synthetic 28-day cycle from a fixed epoch, eight phases, difficulty rising from the new moon to the full moon and falling back (no cliff the day after full). The eight phases map onto three difficulty tiers (new and crescent easy, quarter and gibbous medium, full hard), so the regular layouts are three, one per tier, plus the special nights; the moon still shows eight phases. `nightFor(day, special)` returns the special night's key when the setting names one, else the moon's. The page never computes the night; it receives it.
*   **Floors**: `leastClimbMs(layoutId, band)` from a table beside the layouts. A unit test runs a scripted route per layout through the simulation and asserts every floor is at most that route's time to the band less a fixed margin, so a change to a constant or a layout that makes a floor unreachable fails `pnpm test`. The script is the design's best known route, not a proof of the optimum; the margin and the stakes make that acceptable (decision 7).
*   **Invariants, tested**: from any reachable point a glide lands on a ledge; from every ledge a route up exists; band floors are solid from below once passed (the owl cannot fall below a banked band); the start ledge is on band 0.
*   **Pay**: `BAND_FEATHERS` per band (a default of 1, 1, 2, 2, 2, 2: ten feathers for a full ascent, each band paid once a park day), and the band names and one-line results, all defaults for the owner's approval.

### The protocol

Two `act` kinds in `packages/shared/src/edge.ts`, protocol version 10:

*   `climb` (start or resume): no payload beyond `r`. The server answers `{seed, startedAt, night, banked, remainingCap, bestBandToday, resumed}` or refuses with `far`, `closed` (portal off), `offline`.
*   `ascent` (a band reached): `{k: seed, band}`, `band` validated as a small integer. The server answers `{band, added, feathers, total, why?, ascent?}` or refuses with `idle` (no such open run), `too-fast`, `forgotten` (over an hour), `offline`.

No client duration or position is sent. A full climb sends at most seven frames. Stopping sends nothing; the run stays open until it is forgotten, so a visitor who stops and comes back within the hour continues. The protocol bump ships with the realm behind the switch, so no `live` flag is needed: the kinds exist from the deploy, and the portal setting decides whether `climb` is accepted.

### The climb book (collections object)

Runs live in the collections object, not on the socket: it already holds every per-collector fact, its own clock and SQL, and a run keyed by collector id there survives any socket, room object or phone. `ClimbBook` in `packages/shared` (platform-free, like `ArcadeBook`, so the local mode and the tests run it in the browser) over a `ClimbStore`:

*   `climb_runs (cid, seed, night, started_at, banked, forgotten_at)`: one open run per collector; `climbStart` returns the open run if one is under an hour old, else opens a new one with a fresh seed and tonight's night.
*   `climb_bands (cid, seed, band, arrived_at, verdict, floor_ms, elapsed_ms, added, why, settled_at)`: one row per `ascent` frame, written `pending` before the ledger call and settled after; a repeat of the same `(cid, seed, band)` returns the settled row. Verdicts: `ok`, `too-fast`, `idle`, `forgotten`, `collections-away`.
*   `climb_ascents (cid, at, seed, night)`: the first ascent fact, independent of item ownership.
*   Payout through `CollectionBook.play` with a `PlayEvent` of kind `climb`, under `PLAY_FEATHERS_PER_DAY`; `addEarned(cid, day, 'climb', n)` records band feathers paid today so a second climb pays only new bands; the day is the run's start day. When the cap clips a payment the attempted amount is recorded so the day never pays twice for the same band.
*   The first-ascent item: a new common head wearable in the realm's style set, granted with source `granted` on the first ascent row; it is earnable elsewhere like any catalogue item (the exclusion flag does not exist and is not built here).
*   Refused-as-implausible counts per collector and the admin climb page's daily counters are queries over the band rows; there is no counters table to keep in step.

The room object's part is small: on `climb`, check the owl stands at the portal and the portal is live, then call `climbStart`; on `ascent`, pass through to `climbBand`; no run state on the attachment. The climber stays in the room at the portal as arcade players stay at a cabinet; a per-visitor room for the duration is a future improvement if fan-out is measured as a problem.

### The page

*   `ClimbScene` (Phaser) renders the shared simulation: a portrait field like the arcade's, fitted and letterboxed, camera following the owl anchored at about 55 to 60 % of the view height, segment pieces drawn from the layout data, the owl in its spread pose while gliding. It loads the climb's art keys at run start and releases them at run end.
*   The climb screen is a full-screen modal in the HUD (the arcade's `covered` state) that owns its input: a stick built from the joystick module on the left, a jump button on the right, keyboard by `code` (arrows or WASD, Space) through the keyboard module's held set, released on blur and hidden. One explicit input owner replaces the scattered flags: while the climb is up, the room receives no taps, no jump emote and no keys.
*   Start card, hints (one verb per step, cleared by doing it, the device's glyphs), result card with an item line and the run reference, and the moon line, all through the HUD's existing card and toast components. Calm motion turns off the glass pulse and parallax.
*   The local mode runs `ClimbBook` in the browser as it runs `ArcadeBook`; `?night=` overrides the night in the local mode and the tests only.

### The switch

A `realms` key in the vote ledger object's `park_settings` (the gate switch's table): `{open: string[], portal: boolean, night: string | null, at, by}`. The Worker reads it with the gate's short keep on `/ws/<room>` and refuses a closed realm with its sign; the room object reads it once per `climb` for `portal` and `night`; the client's door drawing and the Menu map read it from the `welcome` frame. `GET` and `POST /api/admin/realms` behind `ADMIN_KEY`, every flip written to `admin_actions`. The levers, fastest first: portal off (a minute), realm closed (a minute), Worker rollback (the whole version).

### Decisions taken in this section

Defaults chosen where the brief left a question, for the owner to confirm or change: the climb is its own activity, not a fourth arcade game (Q8); the climber stays in the room (Q9); a synthetic 28-day moon with a rise and fall (Q5); a run is judged under the day it started (Q6); special nights pay inside the shared cap in this version (Q2, Q7); six bands paying 1, 1, 2, 2, 2, 2 (Q3); a new common item in the realm's style set, earnable elsewhere (Q4); movement left and jump right, no stick-up jump (Q12); portrait letterboxed (Q13); double jump included (Q14); about six screens tall from segment pieces, outdoors (Q15); run rows kept 30 days, hashed collector id in logs, analytics row later (Q16); a run reference on the card (Q17); no `live` flag, the switch covers the bump (Q18); a switched-off portal shows "Pardon Our Feathers" (Q19); id `glass` (Q20). Still the owner's: which arch (Q1), sharding and the plan before opening (Q10), the vote order and the idol art (Q11).

## Alternatives Considered

### Alternative A: Platformer movement across the whole park

Replace tap-to-walk everywhere with a joystick or keys, a jump, a double jump and a glide, and remap every room's walkable space to the new physics.

*   **Pros**: One movement model for the park; the climb is not a mode but the park itself.
*   **Cons**: Every room (the hub, the grove, the market, the lobby, the street, the nests, the arcade) becomes a level to re-author and partly repaint; the server's geometry clamping and the one-destination `move` frame go away; held input means either streamed positions (which breaks the message budget the edge server was chosen for and trips the rate limiter) or input events with a deterministic simulation on every client for a hundred owls; it removes the premise in `docs/ARCHITECTURE.md` section 1.
*   **Reason for rejection**: A different project by about an order of magnitude, with no path that keeps the park playable during it. Rejected in the brainstorm's first turn.

### Alternative B: The arch as a portal straight into a solo climb

No shared stained-glass room; the arch itself starts the climb.

*   **Pros**: No new room art, floor, idol, vote entry or cap; the climb ships sooner (the skeptical architect's smaller first release).
*   **Cons**: The realm would be different in kind from the grove and the market: no place to stand with other owls, no idol, no Realm Vote, no quests; the park's "four realms" promise would be three rooms and a mini-game.
*   **Reason for rejection**: The owner chose a shared room first with the portal inside it (decision 1), and confirmed it when the smaller release was put back to them. The room is an ordinary `RoomDef`, so its cost is art approval and list edits, not new mechanisms.

### Alternative C: The moon decides whether the portal is open

Open the portal only on certain moon phases (for example full moons).

*   **Pros**: Strongly themed; rare nights feel like events.
*   **Cons**: Contradicts the daily feather payout (nothing is daily when the portal is shut most nights); a visitor whose one evening falls on the wrong phase never sees the realm's main feature; the preview opens with people who will try everything once; a full moon comes about every twenty-nine and a half days.
*   **Reason for rejection**: Replaced by a moon that changes the climb while the portal stays open (decisions 5 and 6).

### Alternative D: Verify runs by input-trace replay on the server

The page sends its input trace; the server re-simulates the deterministic climb and accepts only the height it reproduces.

*   **Pros**: The only check that proves the claimed height was reached under the rules.
*   **Cons**: The physics must be deterministic and shared, which this design already does, but also run inside the Durable Object per result; a five-minute trace is tens of kilobytes, over the 1,024-byte frame limit, so it needs an HTTP route; every tuning change becomes a server deploy; and it does not stop a scripted perfect run, which is the cheat a motivated person would write.
*   **Reason for rejection**: The stakes are the arcade's stakes, at most 25 feathers a day and one common item once. Par-time floors with a shared test and a per-collector implausibility count were chosen (decision 7). The shared simulation keeps replay possible later without changing the wire shape.

### Alternative E: A short climb kept on the socket, as arcade runs are

Design the climb to last two to three minutes and keep the run on the socket attachment, so a dropped connection loses at most a short run.

*   **Pros**: No new server state; the arcade's `startRun` and `endRun` carry over unchanged.
*   **Cons**: Caps the city's height and how much a moon phase can add; on phones a lost connection during a run is the normal case, not the exception, and "The park did not catch that run" after a real climb is a poor result.
*   **Reason for rejection**: The owner chose a run that survives (decision 8). Keeping the run in the collections object keyed by collector id costs one table and makes band banking and resumption natural.

### Alternative F: The climb as a fourth arcade game

Add a member to `ArcadeGame`, a cabinet-like spot, and settle through `ArcadeBook`.

*   **Pros**: Fewest new types; about four non-test files plus a parametrised `startRun`.
*   **Cons**: `ArcadeGame` drives the score wall (one column per game, pushed to everyone in the arcade), `cabinetOf` assumes a cabinet, `startRun` refuses any room but the arcade, and `RunPaid.wall`, `OwnBests` and `WallEntry` would be nonsense for a climb with no score; the climb's once-a-day band payout, its run lifetime and its first-ascent item do not fit `finish`.
*   **Reason for rejection**: The climb gets its own `act` kinds and its own book over its own tables. The arcade's pattern is reused as a pattern, not as a type.

### Alternative G: Move the climber to a per-visitor room for the run

On `climb`, move the socket to a dynamic room with cap 1 (the nests' mechanism) so the climber neither holds a slot nor receives the room's fan-out.

*   **Pros**: Frees a cap slot and stops minutes of fan-out to a client that renders none of it; stops the room simulation under the climb on a slow phone.
*   **Cons**: A room switch mid-activity with its own failure modes (rejoining at the portal spawn, the "visit" event, counts); the owl vanishes from the room while climbing, which reads oddly beside the idol and other owls.
*   **Reason for rejection**: Deferred, not rejected. The climber stays at the portal as arcade players stay at a cabinet; with the run in the collections object the switch can be added later if fan-out is measured as a problem. Listed under Future Improvements.

### Alternative H: Merge the realm in the opening deploy, as the arcade did

No switch; the room data lands on `main` the day the realm opens.

*   **Pros**: No new settings record, route or admin control; the arcade shipped this way in one commit.
*   **Cons**: Any registered room is reachable by its id in the URL, so the realm cannot sit on `main` dark; closing a misbehaving realm on opening night is a redeploy that also reverts everything else that shipped with it; the owner's special nights and a portal off switch would each need a deploy too.
*   **Reason for rejection**: The owner chose to ship dark behind one settings record that covers open realms, the portal and the special night (decision 10), on the gate switch's existing pattern.

### Alternative I: Keep the park's pad visible over the climb

A new HUD mode that leaves the thumbstick and Jump button in place over a full modal, instead of the climb screen drawing its own controls.

*   **Pros**: One set of controls for the visitor to learn; no second pad to draw.
*   **Cons**: The park's pad is an eight-way walking stick bottom-right with buttons bottom-left, the opposite of where a two-thumb platformer wants movement and jump; the HUD's `covered` state hides the whole bottom bar and the room's input flags would need untangling to stop a jump reaching the room as an emote; the promise that the pad stays unchanged everywhere else would be broken by changing it.
*   **Reason for rejection**: The climb screen owns its controls, built from the same joystick and keyboard modules (decision 12).

### Alternative J: Other fall rules

Fall all the way to the bottom on a missed jump (one tradition), or respawn on the last ledge (another).

*   **Pros**: Falling to the bottom makes every jump matter and needs no glide; respawning needs no landing ledges under hard jumps.
*   **Cons**: Falling to the bottom means most visitors never see the clouds and a ten-minute climb can vanish in a second; respawning removes the glide's reason to exist and the feel of recovering by skill.
*   **Reason for rejection**: The owner chose the glide as the safety net (decision 3): a miss costs height, by how well the owl glides, and the layout guarantees a ledge within reach. The banked band floors keep the worst loss bounded.

### Alternative K: The existing Halo as the reward, or a one-time halo

Give the catalogue's `halo` (an epic head wearable) for reaching the clouds, once.

*   **Pros**: No new item; a strong reward.
*   **Cons**: An epic item from a daily skill game outpaces every other way to earn it; an owl may already own it (a duplicate pays feathers and the "reward" is nothing); a one-time reward gives no reason to climb again.
*   **Reason for rejection**: Daily feathers by band plus one new common item in the realm's style set on the first ascent (decision 4). The halo stays a catalogue item.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security and privacy.** No new secret; the admin routes sit behind the existing `ADMIN_KEY`. The raw collector id never leaves the collections object: Workers Logs lines carry a short hash of it, the run reference on the result card is a short hash of (collector id, seed), and no analytics row is added in this wave. Nothing from a setting becomes words or layout on a page; the switch selects among bundled entries by key. No internal realm name in code, data, art keys, tests or commit messages; the public name waits on OP-069 and is used only in the Menu map and the sign.
*   **Performance and latency.** Per run: at most seven incoming frames (billed), one collections RPC per band, one small row per band. The climb itself adds nothing to fan-out; the walking in the new room is the cost, and a fifth populated room pushes the single-object budget measured in `docs/CAPACITY.md`, so the opening checklist carries the sharding decision (Q10). On the page: a 120 Hz fixed-step simulation of one owl and a few dozen ledges, and a set of segment pieces under the arcade's per-file size limits, loaded at run start and released at run end, counted in the room's budget. The honest-time floors depend on the portrait field's look-ahead, so the field is fixed.
*   **Rollout and rollback.** One deploy carries the protocol bump to 10, the room data, the climb and the settings record, with the realm closed and the portal off in the setting's default. Opening is a `POST /api/admin/realms`. Closing the portal or the realm is the same route; a Worker rollback is the ordinary one and leaves the new tables in place (the playbook's rule). The deploy happens in a quiet hour; climbs open at that moment are forgotten unpaid, and the keeper's grant route makes a visitor whole on request. `pnpm e2e` runs with a fixed night so the tests do not depend on the date.

--------------------------------------------------------------------------------

### Additional Resources

*   `EGM/concepts_brief.md`: the brainstorm's findings and the twelve decisions this design carries.
*   `docs/ARCHITECTURE.md` sections 1, 2, 4, 5, 6, 7 and 8; `docs/ACTIVITIES.md` (the arcade section, feathers, the wire protocol); `docs/COLLECTIBLES.md`; `docs/CAPACITY.md`; `docs/PLAYBOOK.md` sections 2 and 5; `docs/ART-PIPELINE.md`.
*   The arcade as the precedent: `packages/shared/src/arcade.ts`, `arcadebook.ts`, `roomActivities.ts`; `apps/park/src/game/ArcadeScene.ts`, `game/arcade.ts`, `arcade/field.ts`, `ui/arcadeScreen.ts`; `apps/edge/src/sqlScoreStore.ts`.
*   The gate switch as the settings precedent: `apps/edge/src/gateSwitch.ts`, `gatePage.ts`, `sqlVoteStore.ts`.

### Future Improvements

*   **A per-visitor room for the duration of a climb** (Alternative G): frees the cap slot and stops fan-out to a client that renders none of it; the run already lives outside the room object, so this is a room switch and nothing else.
*   **A separate capped feather source for special nights**, so a blood moon can pay above the day's 25 without the arcade eating it.
*   **An exclusion flag on catalogue items**, so a first-ascent item can be kept out of the shop and quest rewards.
*   **A `REALMS` table in shared** from which the hardcoded realm lists derive, before the fourth arch opens.
*   **A `run` row in the analytics log**, with its migration in the analytics project, under the under-13 rule.
*   **A real lunar calendar** behind the same `parkMoon(day)` signature, if the synthetic cycle reads wrong to visitors.
*   **Input-trace replay** behind the same shared simulation, if the stakes ever rise.
*   **The flight ticket (OP-084)** reusing or retiring the climb's movement constants.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Everything below is one wave behind the switch. Files are grouped by package; every file names what changes and why. Documentation under `docs/` is the doc agent's: this plan leaves `TODO-DOCS` comments in code where a doc must change and appends the changelog line when the ticket is Done.

### Target Files to Create/Modify

#### `packages/shared` (rules shared by the page, the server, the local mode and the tests)

1.  **`packages/shared/src/climb.ts`** (Create). TypeScript module, no platform code. The climb's constants (`CLIMB_STEP_MS` = the arcade's step, run acceleration and top speed, gravity, jump impulse, jump cut, coyote ms, jump buffer ms, double-jump impulse, glide fall and glide horizontal speed, the owl's box, field width); the types `Ledge`, `Layout`, `Night`, `ClimbInput`, `ClimbState`; `stepClimb(state, input, layout)`: one fixed step as a pure function; `layoutFor(nightKey)`; `LAYOUTS` (segment-based data for the three regular layouts, one per tier, and the first special night); `NIGHTS` (key to layout id, band table, visitor-facing night line); `BAND_COUNT` = 6, `BAND_FEATHERS`, `BAND_NAMES`, `BAND_LINES` (defaults for the owner's approval); `leastClimbMs(layoutId, band)` over `CLIMB_FLOORS`; `plausibleBand(layoutId, band, elapsedMs)` with the arcade's slack; `CLIMB_RUN_MAX_MS` = 60 minutes; `bandFeathersDue(band, paidBands)`. Why: decision 7 requires the layouts, the constants and the floors in one place with a test; the page and the server must agree.
2.  **`packages/shared/src/climb.test.ts`** (Create). Vitest. The floor test: a scripted route per layout (held-state input scripts kept in the test) run through `stepClimb`, asserting every floor is at most the route's time to that band less the margin; the layout invariants (glide reach from any sampled airborne point to a ledge, a route up from every ledge, band floors solid from below, the start ledge on band 0); `plausibleBand` edge cases; `NIGHTS` all point at existing layouts; band tables sum to the agreed total. Why: the build must fail when a tuning change invalidates a floor.
3.  **`packages/shared/src/climbbook.ts`** (Create). `ClimbBook` over a `ClimbStore` interface (`openRun`, `putRun`, `putBand`, `bandRow`, `paidBands`, `ascent`, `putAscent`, `countImplausible`, `counters`) and a `MemoryClimbStore` for the local mode and tests, in the `ArcadeBook` shape: `start(cid, nightKey, now)` returns the open run under an hour old or opens a new one; `band(cid, seed, band, now)` writes the pending row, checks the floor, pays the due bands through `CollectionBook.play` with event kind `climb` under the shared cap on the run's start day, records why a payout was zero, records and grants the first ascent, settles the row, and returns the settled row on a repeat. Why: decision 8 puts runs in the collections object; decision 11 requires one row per result; the book must be platform-free so the local mode runs it.
4.  **`packages/shared/src/climbbook.test.ts`** (Create). Start and resume, forgotten after an hour, a band paid once a day across two runs, the cap clipping a band and the day not paying it twice, a too-fast band refused and counted, the first ascent recorded once and the item granted once, idempotent repeat of a band frame, a run spanning park midnight paid under its start day. Why: the payout rules are the part a dispute will test.
5.  **`packages/shared/src/edge.ts`** (Modify). `EDGE_PROTOCOL_VERSION` 9 to 10 with the version comment extended; `ActKind` gains `climb` and `ascent`; `ClientAct` gains `k` and `band` for `ascent`; `parseClientFrame` validates `band` with `isCount(band, BAND_COUNT)`; `ServerAct` gains the `climb` and `ascent` answers and the reasons `closed`, `too-fast`, `forgotten`; the `welcome` frame gains `realms` (open ids, portal live) so the client draws doors and the map. Why: the two new frames and the client's knowledge of the switch.
6.  **`packages/shared/src/edge.test.ts`** (Modify). Parse and reject cases for the two kinds, the band bound, the version. Why: the parser is the server's first defence.
7.  **`packages/shared/src/parktime.ts`** (Modify). `MOON_EPOCH_DAY`, `MOON_CYCLE_DAYS` = 28, `parkMoon(day)` returning a phase 0 to 7, `moonTier(phase)` returning easy, medium or hard, `nightFor(day, special)`. Why: decision 5; the night must be a pure function of the park day and the switch.
8.  **`packages/shared/src/activities.ts`** (Modify). `TaskKind` gains `climb`; `TASK_SLOTS` left unchanged on purpose with a comment (the climb does not count toward "at a game" in this wave); the `PLAY_FEATHERS_PER_DAY` comment names the climb among the sources. Why: `PlayEvent.kind` is a `TaskKind`, and the decision not to count the climb toward a task must be explicit.
9.  **`packages/shared/src/book.ts`** (Modify). `EarnSource` and `EARN_SOURCES` gain `climb` (a TEXT column, no SQL migration). Why: band feathers paid today must be recorded separately from the arcade's.
10. **`packages/shared/src/room.ts`** (Modify). The `mood` union gains `glass`. Why: the room's lighting.
11. **`packages/shared/rooms/index.ts`** (Modify). The `glass` `RoomDef` (size, tiles, floor, spawns `default` and `from-hub`, doors `hub`, `idol`, `portal`); the hub's chosen arch gains `to: { room: 'glass', spawn: 'from-hub' }` and loses its `closedSign`, with its floor polygon opened at the blockade's front; the hub gains a `from-glass` spawn; the header comment names the realm by its id. Why: the realm is an ordinary room (G1).
12. **`packages/shared/rooms/rooms.test.ts`** (Modify). The existing invariants cover the new room; a case that exactly one of the two closed arches is still closed and shows an approved phrase. Why: the other arch's blockade must keep its sign.
13. **`packages/shared/src/collectibles.ts`** (Modify). One new common head wearable with a neutral id and a `style` of the realm's set. Why: decision 4.
14. **`packages/shared/src/styles.ts`** (Modify). The realm's style set with the new item as a piece (`STYLE_SETS` is empty today; the set tests already hold it to the catalogue). Why: a realm brings a style of its own (OP-110).
15. **`packages/shared/src/questCatalog.ts`** (Modify). `ROOMS` gains `glass` so quests may send owls there. Why: the room is a realm like the others.
16. **`packages/shared/src/index.ts`** (Modify). Export the new modules. Why: both apps import through it.

#### `apps/edge` (the Worker and the Durable Objects)

17. **`apps/edge/src/sqlClimbStore.ts`** (Create). `SqlClimbStore` implementing `ClimbStore` over `climb_runs`, `climb_bands` and `climb_ascents`, created with `CREATE TABLE IF NOT EXISTS` in the constructor (the `sqlScoreStore.ts` pattern), with a 30-day sweep of settled band rows. Why: durable, dispute-grade records.
18. **`apps/edge/src/Collections.ts`** (Modify). Construct `ClimbBook` over `SqlClimbStore`; RPC methods `climbStart(cid, nightKey)`, `climbBand(cid, seed, band)`, `climbLookup(ref)`, `climbCounters()`, `adminGrantFeathers(cid, n, note, by)`; the first-ascent grant goes through the existing `acquired` path so the collection log sees it; a structured log line (hashed cid) on every refusal. Why: the run lives here (decision 8).
19. **`apps/edge/src/RoomObject.ts`** (Modify). In the `act` switch: `climb` checks the owl stands at the room's `portal` door and that the setting's `portal` is live (read with the gate's short keep), then returns `climbStart`'s answer; `ascent` passes through to `climbBand`; no `run` on the attachment for the climb. The `welcome` frame carries `realms`. Why: the room object is a checkpoint, not the record.
20. **`apps/edge/src/Room.ts`** (Modify). `jumpEveryMs` untouched; a comment that the climb's jump is never an emote. Why: a reader will look here first.
21. **`apps/edge/src/gateSwitch.ts`** (Modify). Generalise the `park_settings` read and write to a second key `realms` (`RealmsSetting`: `open`, `portal`, `night`, `at`, `by`) with the same keep; `realmsNow()`. Why: decision 10 on the existing pattern.
22. **`apps/edge/src/VoteLedger.ts`** (Modify). `VOTABLE_REALMS` gains `glass` third (the fixed order is the owner's decision, Q11); the object exposes the `realms` setting read and write over RPC as it does the gate's. Why: the idol must accept votes; the setting lives with the gate's.
23. **`apps/edge/src/rooms.ts`** (Modify). `DEFAULT_CAPS` gains `glass: 40`; `isRoomId` unchanged; a new `isOpenRoom(id, realms)` used by the Worker and the room object. Why: a closed realm must be refused even though it is registered.
24. **`apps/edge/src/index.ts`** (Modify). `/ws/<room>` refuses a closed realm with 404 and the sign after `isRoomId`; `GET`/`POST /api/admin/realms`; `GET /api/admin/climb` (counters and a run lookup by reference); `GET /api/admin/collector?cid=` (feathers, earned counters, owned, open run); `POST /api/admin/feathers` (grant with a required note); all behind `ADMIN_KEY`, each write appended to `admin_actions`. Why: the switch, the keeper's view and the make-whole route.
25. **`apps/edge/src/realmsPage.ts`** (Create). The keepers' page for the switch, in `gatePage.ts`'s shape: the three controls, the last flips, and the climb counters. Why: a keeper flips it without a deploy.
26. **`apps/edge/src/collectLog.ts`** (Modify). `SPOTS` gains the realm's spots so sightings there are labelled; no new row kind. Why: the collection log labels where things happen.
27. **`apps/edge/test/climb.test.ts`** (Create). The room object's `climb` and `ascent` handling over the real SQLite store (`test/sqlite.ts`): far from the portal, portal off, resume on a new socket, a band paid, a forgotten run, the welcome frame's `realms`. Why: the server path end to end.
28. **`apps/edge/test/gateSwitch.test.ts`** (Modify) and **`apps/edge/test/RoomObject.test.ts`** (Modify). The `realms` setting's keep and defaults; the `/ws/` refusal for a closed realm. Why: the switch is the rollout.
29. **`apps/edge/wrangler.jsonc`** (Modify). No new binding; a comment under `ROOM_SHARDING` that a fifth populated room is the trigger to switch it (Q10). The generated `worker-configuration.d.ts` is not edited by hand. Why: the opening checklist lives next to the knob.

#### `apps/park` (the client)

30. **`apps/park/src/game/ClimbScene.ts`** (Create). Phaser scene in `ArcadeScene`'s shape: owns a `ClimbState`, steps it with `StepClock` at the shared step from the held input, draws the layout from segment pieces (with the `paintable` fallback), the band lines and the cloud line, the owl in run, jump and spread poses, a camera anchored at 55 to 60 % of the view, hints by layout step, calm-motion handling; loads the climb's art keys at run start and releases them at run end; emits `bandReached(band)`. Why: the climb's rendering.
31. **`apps/park/src/game/climb.ts`** (Create). The client's climb handler in `game/arcade.ts`'s shape: the start card (moon line, feathers today of 25, best band today, time to park midnight), `act climb` and resume on reconnect, `act ascent` per band with the answers' lines, the result card with the item line and the run reference, Stop and Escape as stop-and-bank, the `?night=` override in the local mode only. Why: the page's protocol side.
32. **`apps/park/src/ui/climbScreen.ts`** (Create). The full-screen modal with its own stick (built on `createJoystick`) on the left and a jump button on the right, held-state input `{left, right, jumpPressed, jumpHeld}` with press, second press and hold, 44 px targets, `touch-action:none`, release on blur and hidden, the device's glyphs in hints. Why: decision 12.
33. **`apps/park/src/ui/keyboard.ts`** (Modify). Expose `heldCodes()` and a way to hand Space to the climb while it is up, so the room's `jump()` emote is not called. Why: one input owner.
34. **`apps/park/src/ui/hud.ts`** (Modify). `openClimb`/`closeClimb` using the `covered` state; `isBlocking()` includes the climb; the start and result cards. Why: the screen lives in the HUD like the arcade's.
35. **`apps/park/src/game/RoomScene.ts`** (Modify). An `interactions` entry for `portal` labelled from the approved words; an explicit input owner (`room`, `decorate`, `arcade`, `climb`) replacing the scattered flags; `DOOR_TINTS` gains `glass`; the hub's opened arch drawn from the `welcome` frame's `realms`. Why: the portal action and no leaked input.
36. **`apps/park/src/game/ambience.ts`** (Modify). The `glass` mood (backlit panels, no rain) and the realm's idol piece. Why: lighting and the vote.
37. **`apps/park/src/game/art.ts`** (Modify). Art specs for the realm's tiles (`kind: 'room'`) and the climb's segment pieces under the arcade kind, with the loader's guard widened from "in the arcade room" to "in the arcade room or a climb is running", so no new kind enters the loader or the scaler; the pieces load only during a run. Why: the phone budget.
38. **`apps/park/src/game/doors.ts`** (Modify) and **`doors.test.ts`**. A closed door whose realm is in the setting's `open` list draws as open; the sign otherwise. Why: the switch must show on the hub's arch.
39. **`apps/park/src/ui/menuTabs.ts`** (Modify). `MAP_PLACES` and `MAP_PATHS` gain the realm with its public name (OP-069) and `closed` driven by the setting. Why: the Menu map.
40. **`apps/park/src/collect/local.ts`** (Modify) and **`local.test.ts`**. Run `ClimbBook` over `MemoryClimbStore` in the browser, with `?night=`. Why: the zero-backend mode must play the climb.
41. **`apps/park/src/net/edge.ts`** (Modify). The `climb` and `ascent` requests; on reconnect, a resume request from the open climb screen. Why: decision 8 on the page side.
42. **`apps/park/src/settings.ts`** (Modify). Nothing new; the climb reads `calm`. Listed so the reviewer finds it. Why: calm motion.
43. **`apps/park/src/game/hints.ts`** (Modify) and **`hints.test.ts`**. The climb's one-verb hints and their clearing. Why: teaching in the first band.
44. **`apps/park/src/ui/itemIcon.ts`** and **`apps/park/src/game/itemArt.ts`** (Modify). The new item's icon and drawn art. Why: every catalogue item has both.
45. **`apps/park/e2e/climb.spec.ts`** (Create) and **`apps/park/e2e/climbPlay.ts`** (Create). Drive a run through `window.owlPark.climb()` with a fixed night: start card, a band banked, stop, the result card, a resume after a dropped socket (the edge transport in the local Worker), the portal off showing its phrase. Why: the journeys above, in the browser.
46. **`apps/park/e2e/park.spec.ts`** (Modify). The closed-doorway test walks to the arch that stays closed. Why: the test names an arch that will open.
47. **`apps/park/e2e/arcade.spec.ts`** (Modify, only if the HUD's `covered` handling moves). Why: shared modal code.

#### Art and tools

48. **`tools/art/config/assets.json`** (Modify). The realm's room tile or tiles, the idol piece, the climb's segment pieces (a glass column, two ledges, a balcony, a cloud cap, a sky), the new item, all under neutral keys and the existing size limits. Why: the pipeline generates from this file.
49. **`tools/art/prompts.mjs`** (Modify). Prompts for the above, neutral words only; the forbidden-word check runs before publish. Why: the owner picks from contact sheets; nothing is committed without approval.
50. **`tools/load/`** (no change). A five-room run of `run-steps.mjs` on a throwaway copy is an opening-checklist step, not code. Listed for the reviewer.

#### Documentation and repository notes

51. **`docs/`** (no edits by Claude Code). `TODO-DOCS` comments in `edge.ts` (protocol 10), `climb.ts` (the activity), `gateSwitch.ts` (the switch) and `index.ts` (the admin routes) name the sections of `ARCHITECTURE.md`, `ACTIVITIES.md`, `PLAYBOOK.md` and `CAPACITY.md` that must change, and the playbook's new "a visitor says they reached the clouds" section. One line in `docs/CHANGELOG.md` when the ticket is Done (OP-103). Why: `docs/` is the doc agent's.
52. **`CLAUDE.md`** (Modify). One line under the art rules naming the climb's segment pieces as art that needs the owner's pick. Why: the rule already exists; the pieces are a new kind.
53. **`EGM/`** (no change). The brief and this draft stay out of git.

### Verification Plan

*   **Build and typecheck**: `pnpm check` (which runs `wrangler types`, `tsc` in all three packages, `vitest run` in all three, and the client build).
*   **Unit tests**: `pnpm --filter @owl-park/shared test` for `climb.test.ts`, `climbbook.test.ts`, `edge.test.ts`, `rooms.test.ts`, `styles.test.ts`; `pnpm --filter @owl-park/edge test` for `climb.test.ts`, `gateSwitch.test.ts`, `RoomObject.test.ts`; `pnpm --filter @owl-park/park test` for `local.test.ts`, `doors.test.ts`, `hints.test.ts`, `keyboard.test.ts`.
*   **The floor test is the gate**: a change to any climb constant or layout that makes a floor unreachable by the scripted route fails `pnpm test`.
*   **End to end**: `pnpm e2e` with `climb.spec.ts` and the adjusted `park.spec.ts`, on a fixed night.
*   **By hand before opening**: `pnpm dev:edge`; a climb on a phone with the tab backgrounded for five minutes and resumed; a climb across park midnight in the local mode with a shifted clock; the admin realms page flipping the portal while a run is open; the five-room load test on a throwaway copy if sharding stays `single`.
*   **Measured after opening**: the climb counters on `/api/admin/climb` (runs started, by verdict, paid, capped, first ascents, resumed, implausible per collector) and the room object's CPU with five populated rooms.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM*
