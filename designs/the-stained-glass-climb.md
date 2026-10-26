# The stained-glass climb

*   **Author:** the owner, with Claude Code
*   **Status:** Proposed
*   **Date:** 2026-10-26, revised twice the same day after review

--------------------------------------------------------------------------------

## Overview

Owl Park opens one of the hub's two closed arches onto a third realm. Behind the arch is a shared
stained-glass room that works like the grove and the market. Inside it is a portal that starts a
solo climb: a platformer the visitor plays on their own device as their own owl, up a city of
backlit mosaic glass to a cloud line, with a jump, a double jump and a held-jump glide. During a
climb a handful of small frames cross the wire: one to start, and one each time the owl reaches a
new height band. The room server banks each band, checks it against the least time that band can
honestly take, and pays feathers for it. A park moon makes some nights harder. One field of the
keepers' park settings opens the realm, lights the portal and names a special night. Tap-to-walk,
the phone pad, the keyboard and the hop emote stay as they are everywhere else in the park.

### Terms

`docs/GLOSSARY.md` defines the park's words. The ones this document leans on, in one line each:

*   **Room and realm**: a room is one painted stage with a walkable floor (`RoomDef` in
    `packages/shared/src/room.ts`); the hub is the central room; a realm is a room off the hub with
    its own art style and its own idol; the grove and the market are the open realms.
*   **Idol and the Realm Vote**: each realm's idol is a spot where a ticket-holder casts one vote a
    park day; the month's winner sets the next merch drop (`docs/ARCHITECTURE.md` section 7).
*   **Ticket**: the visitor's pass through the turnstiles; "a ticket-holder" is a visitor inside the
    park. `OP-###` ids are rows on the Ticket Board, the project's work queue (`docs/README.md`).
    `OP-069` is the screening that clears a realm's public name; until it clears, this realm has only
    its id.
*   **Collector id (`cid`)**: the per-device token that owns an owl's feathers, items and progress.
*   **Park day**: the calendar day in America/New_York (`parkDay` in
    `packages/shared/src/parktime.ts`); park midnight is when it changes.
*   **Feathers and the cap**: the currency the activities pay; all games together pay at most
    `PLAY_FEATHERS_PER_DAY` (25) a park day per collector (`packages/shared/src/activities.ts`).
*   **The three server objects**: Cloudflare Durable Objects. The room object holds rooms, sockets
    and movement (`apps/edge/src/RoomObject.ts`); the collections object holds every per-collector
    fact (`Collections.ts`); the overflow object holds the busy-night line and the keepers' park
    settings (`Overflow.ts`).
*   **Keeper**: anyone holding `ADMIN_KEY`, one shared key with no identity behind it, who uses the
    admin pages. The owner decides and approves; a keeper operates.
*   **The phone pad and the hop**: the touch controls in the park's bottom bar (a thumbstick, an
    Interact and a Jump button); Jump plays the hop, an emote the room server paces at `jumpEveryMs`
    and that lifts only the drawing (`apps/park/src/game/hop.ts`).
*   **The idle reaper**: the room object closes a socket silent for `IDLE_CLOSE_MS` (90 seconds).
*   **The local mode**: the zero-backend way to run the park in one browser; it runs the shared
    books in the page (`apps/park/src/collect/local.ts`).
*   **The HUD's `covered` state**: the full-screen modal the arcade uses, which hides the park's
    bottom bar and hint chips (`apps/park/src/ui/hud.ts`).
*   **Calm motion**: the setting that follows `prefers-reduced-motion` and turns off ambient
    animation (`apps/park/src/settings.ts`).
*   **An approved phrase**: a closed door shows its `closedSign`, one of the four phrases in
    `CLOSED_SIGNS` (`packages/shared/rooms/index.ts`).
*   **Feedback, the Menu map, the collection log**: the visitor's note form in the Menu; the park
    map drawn in the Menu (`apps/park/src/ui/menuTabs.ts`); the analytics log of what owls find
    (`apps/edge/src/collectLog.ts`). **Seedream** is the image model behind `tools/art`.

### The arcade's contract, which the climb extends

Each arcade game is played on the client as the visitor's owl. The room server starts a run with a
seed and `startedAt` from its own clock, receives one result frame, refuses it when the run took
less than `leastRunMs(result)` minus `RUN_SLACK_MS` (1,000 ms) or more than `RUN_MAX_MS`
(20 minutes), pays `runFeathers` by score band through `CollectionBook.play` under the cap, and
keeps one row per (day, game, collector) for the score wall (`packages/shared/src/arcade.ts`,
`arcadebook.ts`, `roomActivities.ts`). The climb keeps the seed, the server clock, the floor check
and the payout path. It changes four things: a run lasts up to an hour and lives in the
collections object; a result frame arrives per band rather than once; each band pays once a park
day; there is no score wall.

## The Problem

The park promises four realms and has two. Both open realms are social rooms: places to stand
with other owls, talk in phrases, vote at an idol and do small tasks that pay feathers. Nothing
in the park asks a visitor for skill over more than a few seconds, nothing is vertical, and the
one skill game the park has, the arcade, is twenty seconds a run. The third realm's art style,
stained glass, suggests height and light, and the owner wants it to play that way: a climb with
a reward in the clouds.

The park cannot move like a platformer. Every room is a painted stage with walkable polygons. A
tap sends one destination and every client animates the same straight walk. That is why one room
server carries a hundred owls within the budget of incoming messages that `docs/ARCHITECTURE.md`
section 2 chose the edge server for, and why the server can clamp every walk against the same
geometry the client uses. Gravity, held keys and mid-air control do not fit that model, and
streaming positions many times a second would break the budget. Replacing tap-to-walk across the
park was considered and rejected (Alternative A).

The design keeps the two models apart. The shared stained-glass room is an ordinary room: the
same registry, geometry, doors, idol and caps as the other realms. The climb is a solo run on the
arcade's contract, extended where the arcade did not need it: a run that lasts minutes and
survives a dropped connection, a glide that makes a missed jump cost height rather than the run,
per-band payouts once a day, a first-time item for reaching the clouds, a moon that sets the
night's difficulty, and a row for every result so a keeper can answer "what happened to my
climb".

## Goals

*   **G1. A third realm as an ordinary room.** One hub arch opens onto a shared stained-glass
    room with the neutral id `glass`: walkable polygons, doors, spawns, a cap, other owls visible,
    the realm's idol accepting Realm Votes, the room server authoritative. The room is data in
    `packages/shared/rooms/index.ts` with the same tests as the other rooms.
*   **G2. A solo climb on the arcade's contract.** A portal spot in the room starts a run. The
    climb plays on the client as the visitor's own owl. Per run, the client sends one `climb` frame
    and at most one `ascent` frame per band reached, each under `MAX_FRAME_BYTES` (1,024). No
    position, input or client clock is sent.
*   **G3. Deterministic, responsive movement.** The simulation steps at a fixed `CLIMB_STEP_MS`
    (1000/120 ms) and an input is reflected in the next step. It has a run with acceleration, a
    jump whose height depends on how long the button is held (the jump cut: releasing early caps the
    upward speed), coyote time (a jump still counts for `COYOTE_MS` after leaving a ledge), a jump
    buffer (a press within `JUMP_BUFFER_MS` before landing jumps on landing), a second press for a
    double jump, and a held jump that glides. Appendix A gives the rules and the values.
*   **G4. The glide is the safety net.** A missed jump costs height, never the run. The layout
    satisfies three tested invariants: from any reachable airborne point a glide lands on a ledge;
    from every ledge a route up exists; once a band is banked the owl cannot fall below that band's
    line, because the line is a one-way floor.
*   **G5. A run that survives.** The collections object keeps the run per collector, not per
    socket. A new socket resumes it. The visitor can stop at any time and keep every banked band.
    The server forgets a run `CLIMB_RUN_MAX_MS` (one hour) after it started.
*   **G6. An honest result at the arcade's cost.** The server refuses a band that arrives sooner
    than `leastClimbMs(layout, tier, band)` less `CLIMB_SLACK_MS` (1,000 ms) after the run started.
    The layout, the physics constants and the floor table live together in `packages/shared`, and a
    unit test derives the floors from a scripted route, so a tuning change that invalidates a floor
    fails `pnpm check`. The floor proves only that enough time passed: a client that waits out the
    cloud floor at the portal and sends band 6 is accepted. That loss is bounded by the cap and one
    common item once, and the owner accepted it (decision 7). Refused bands are visible per collector
    in the band rows; they show broken clients, not cheats.
*   **G7. Payout under the existing cap.** A band pays when it is above the run's banked band and
    has not been paid today, under `PLAY_FEATHERS_PER_DAY`, on the park day the band arrives.
    Reaching the clouds grants one common catalogue item the first time ever. The climb screen's
    header shows the cap and today's best band once the run has started; the server says why a
    payout was zero.
*   **G8. Every result is answerable.** One row per (collector, seed, band) with the verdict, the
    floor, the elapsed time, the feathers added and why any were zero; a resend returns the same
    row; a short run reference on the result card lets a keeper look the run up without the
    collector id.
*   **G9. The moon and the special nights are data.** `parkMoon(day)` is a pure function of the
    park day; it gives a phase for display and a tier that sets one difficulty parameter. The night
    is pinned to the run when it starts, with its layout. Special nights are named entries in the
    same shared table, selected by a key in the setting, never free-form content.
*   **G10. Closed by default, opened by the `realms` setting.** One field of the overflow object's
    park settings opens gated realms, lights the portal and names the special night. A keeper
    changes it on the capacity page; room objects learn of a change at once by push and within
    `NOTICE_FRESH_MS` (one minute) by poll; a Worker rollback is the ordinary one.
*   **G11. Art within the pipeline and the phone budget.** Six reusable segment pieces through the
    Seedream pipeline, loaded while the climb scene is active and released after, within the
    arcade's per-file limits; the owner approves every image; neutral keys only.
*   **G12. Tests stay deterministic.** `parkMoon` and `nightFor` are pure functions with
    fixed-input tests; the local mode and the browser tests pin the night; `pnpm check` and
    `pnpm e2e` pass on every date.

## Non-Goals

*   No change to tap-to-walk, the phone pad, the keyboard, `jumpEveryMs` or the hop emote outside
    the climb screen.
*   No positions, inputs or client clocks on the wire; no input-trace replay on the server.
*   No leaderboard or score wall for the climb.
*   No layouts, pay tables or visitor-facing words delivered through a setting.
*   No second layout, no special-night layout and no new painting per phase in the first release.
*   No feathers grant route, collector view or counters page until a dispute needs one.
*   No per-visitor allowlist, rehearsal mode or scheduling in the `realms` setting.
*   No quests in the stained-glass room in this wave (they need a quest item kind and an NPC
    there).
*   No public name for the realm in this wave; the Menu map keeps its placeholder words until
    `OP-069` clears a name.
*   No decision on the deferred flight ticket (`OP-084`) beyond naming the constants it must reuse
    or retire.
*   No internal realm name, other game or studio name, or owner detail anywhere.

## Decisions carried from the brief

The brainstorm's brief is a working file outside git. These are the decisions it holds, as this
document uses them.

1.  The shared stained-glass room ships first; the portal and the climb are inside it.
2.  The climb is a solo run on the arcade's contract: client-played, server-started, server-judged.
3.  The glide is the safety net: a missed jump costs height, never the run.
4.  Feathers by band once a park day under the shared cap, plus one common item the first time the
    clouds are reached.
5.  The park moon sets the night's difficulty; the portal is open every night.
6.  The owner can switch on special nights by name.
7.  Anti-cheat by time floors, not replay, on two conditions: layout, constants and floors live
    together in shared code with a test, and refused bands are visible per collector.
8.  A run survives a dropped connection; it is keyed by collector in server storage.
9.  A climb ends at the clouds or when the visitor stops; the server forgets it after one hour.
10. The realm ships dark behind one server-side setting that covers open realms, the portal and the
    special night.
11. One row per result, idempotent on its key, with a finer refusal set.
12. The climb screen owns its controls, built on the park's joystick and keyboard modules.

Four of these are carried out differently from the brief's first reading, for reasons the review
established against the code. Bands pay on the day they arrive, not the run's start day, because
the earned-feathers table keeps one park day per collector and a stale day would erase the new
day's rows. The setting lives in the overflow object, not the vote ledger, because that object
already has a settings class, a keepers' page, a Worker-side keep and a push to every room object.
The first release has one layout and the moon sets one parameter, because every layout costs an
approval loop, a scripted route and an invariant run. The result row is one upsert per band and
the keeper's tools are the existing grant route plus a lookup, because the stakes are the arcade's.

## Open Questions

| Question | Default taken here | Who confirms |
| --- | --- | --- |
| Which arch opens | `closed-b` ("Hatching Soon", east); `closed-a` keeps its blockade | the owner |
| The third realm's place in the Realm Vote's fixed tie-break order | third | the owner |
| Does the realm take votes from the day the arch opens | yes; `VOTABLE_REALMS` changes in the opening deploy's switch-on, not before | the owner |
| Does the idol's art ship in this wave | yes | the owner |
| The feathers per band and the visitor-facing band names | `BAND_FEATHERS` = 1, 1, 2, 2, 2, 2 (ten in total); "storey" one to five, then "the clouds" | the owner |
| The first-time item | `glass-circlet`, a common head wearable; its variant `glass-circlet~0` also enters the shop pool like any item | the owner |
| The moon's epoch | `MOON_EPOCH_DAY` = `2026-11-17`, a new moon, so the preview's opening on 2026-12-01 is day 14, a full moon | the owner |

## Critical User Journeys (CUJs)

### CUJ 1: A first climb on a phone, stopped partway

*   **Given**: `glass` is open and the portal is live in the `realms` setting. The visitor holds a
    ticket and stands in the stained-glass room. It is an easy night (the new-moon tier). They have
    earned 4 of today's 25 feathers from games.
*   **When**: They walk to the portal spot and tap Interact ("Climb"). A card shows tonight's moon
    in one line and the time to park midnight, with a Start button. They tap Start. The climb screen
    opens over the room with its own stick on the left and jump button on the right. Its header
    shows "4 of 25 feathers from games today" and "best storey today: none". They run, jump, double
    jump, miss a gap, hold jump and glide down to a ledge two storeys lower, climb again, reach the
    third storey, then tap Stop.
*   **Then**: Each new storey sent one `ascent` frame and the server answered `ok`; the header
    counted up to "8 of 25". Stop closes the screen without a frame. The result card reads "Third
    storey. +4 feathers" with the run reference. The owl stands at the portal. A second climb tonight
    pays only storeys above the third. No move, emote or position frame was sent while the screen was
    up.

### CUJ 2: The connection drops mid-climb

*   **Given**: A run is open with band 2 banked. The phone sleeps for four minutes. The idle reaper
    closes the socket.
*   **When**: The visitor wakes the phone. The page reconnects and says hello. The climb screen,
    still open on the page, sends `climb` again.
*   **Then**: The server answers with the same run (same seed, night and `startedAt`, `banked` 2,
    `resumed` true), whatever the portal setting says and wherever the owl stands. The climb
    continues from the page's own state. If the page itself was reloaded, `climb` is sent on the
    first hello and the screen reopens at band 2's line. If more than an hour has passed since the
    run started, `climb` opens a new run and its answer carries `previousForgotten` true; the card
    says the earlier climb was forgotten and nothing was taken.

### CUJ 3: Reaching the clouds for the first time, on a computer

*   **Given**: A visitor with the arrow keys and Space, on a full-moon night (the hard tier), has
    never reached the clouds.
*   **When**: They reach the cloud line.
*   **Then**: The server checks the time since the run started against the cloud band's floor for
    that tier, pays the remaining bands under the cap, grants `glass-circlet~0`, and, because the
    grant added an item, answers with the item marked first. The result card shows it in the
    collection's style with a line saying it is given once ever. A later climb to the clouds pays its
    bands and says the item was already given.

### CUJ 4: The cap is already reached

*   **Given**: The visitor earned 25 feathers from games today before entering the realm.
*   **When**: They start a climb.
*   **Then**: The header shows "25 of 25" and "nothing more from games until park midnight" with
    the time left. They may still climb. Each band is accepted and recorded with `why` =
    `capped`, so today's best band still counts and the clouds still grant the item.

### CUJ 5: A keeper lights a special night, then turns the portal off

*   **Given**: A keeper is signed in to the capacity page. A special night exists in `NIGHTS`.
*   **When**: They set the special night key, and later, after a report of a broken layout, turn
    the portal off.
*   **Then**: Room objects receive the change by push and apply it at once; new runs start under
    the special night; runs already open keep the night they started with. After the portal is off,
    the portal spot shows "Pardon Our Feathers", a `climb` with no open run is refused with
    `closed`, open runs resume and send bands until they are forgotten, and both changes are in the
    Workers log with their time.

### CUJ 6: A visitor says they reached the clouds and got nothing

*   **Given**: A Feedback note quotes the run reference from the result card.
*   **When**: A keeper calls the admin lookup route with the reference.
*   **Then**: The reply holds the run's night, `startedAt`, and for each band its arrival time,
    verdict, floor, elapsed time, feathers added and why any were zero, with no collector id. If the
    item is missing the keeper grants it through the existing grant route. A feathers grant does not
    exist yet (Future Improvements); the keeper says so in the Feedback reply.

## Technical Plan (Architecture)

The design has four parts: an ordinary room; a climb simulation shared by the page and the tests;
a climb book in the collections object that owns runs and payouts; and a `realms` field in the
overflow object's park settings. The hub, the room server's movement model and the wire protocol's
shape are unchanged. The protocol gains two `act` kinds and bumps its version.

```text
page (apps/park)
  RoomScene in room `glass`, owl at the `portal` spot
    | Interact, then Start
    v
  act climb ----------------------------> room object (RoomObject.ts)
                                     passes atPortal and its in-memory
                                     realms.portal and realms.night
                                     | RPC climbStart(cid, flags)
                                     v
                                   collections object (Collections.ts)
                                     ClimbBook over climb_runs, climb_bands
                                     open run under an hour -> resume
                                     else, if atPortal and portal live:
                                     new seed, night and layout pinned
    <------ act climb ok {seed, startedAt, night, tier, banked,
            remainingCap, bestBandToday, resumed, previousForgotten}

  ClimbScene (shared simulation) + climbScreen (own stick and jump)
    | each new band
    v
  act ascent {k: seed, band} -----------> room object: pass through
                                     | RPC climbBand(cid, seed, band, visit)
                                     v
                                   collections object
                                     for each band above banked, not paid today:
                                       floor check, pay under the cap, one row
                                     band 6, grant added: the item
    <------ act ascent ok {banked, added, feathers, total, why?, item?, ref}

  Stop / Escape: close the screen, no frame; the run stays open until forgotten

Worker (index.ts)                   overflow object (Overflow.ts)
  /api/admin/capacity (ADMIN_KEY)    settings gain `realms`; POST /settings
    forwards to POST /settings       validates, logs, pushes {words, realms}
  /api/admin/climb?ref= (ADMIN_KEY)  to every room object; room objects
                                     poll GET /notice each minute and keep
                                     the last `realms` in their storage
```

### The room

The stained-glass room is a `RoomDef` in `packages/shared/rooms/index.ts` with the id `glass`,
`gated: true` (a new optional flag; only gated rooms consult the `realms` setting), two screens
wide and horizontal like the others, with the existing `dusk` mood. Appendix B gives the
definition. The hub's `closed-b` door becomes `to-glass` with a `to`, its blockade stays as art
until the switch opens the realm, and the hub floor gains four vertices through the arch; `closed-a`
keeps its blockade. The realm joins the Menu map with the placeholder's words, the collection log's
room labels (which derive from `ROOMS`), and `VOTABLE_REALMS` when the owner opens it. The room's
tests are the existing ones: tiles cover the room, spawns stand on the floor, doors resolve, spots
are clear of doors, and exactly one closed arch still shows an approved phrase.

### The simulation and the layout (shared)

`packages/shared/src/climb.ts` holds everything the page, the server and the tests must agree
on, with no platform code. Appendix A gives the structs, the ordered rules, the constants with
their starting values, the layout `city-1` as data, the scripted route and the starting floors.

*   **Physics**: `stepClimb(state, input, layout, night)` advances one fixed step from a
    held-state input and is a pure function. Ledges and band lines are one-way platforms: the owl
    passes them from below and lands on them from above.
*   **Nights**: `NIGHTS` maps a key to a layout id and the one tuned parameter, the glide's fall
    speed. The three regular keys are the moon's tiers. `parkMoon(day)` returns a phase 0 to 7 from a
    `MOON_CYCLE_DAYS` (28) cycle starting at `MOON_EPOCH_DAY`, a new moon; `moonTier(phase)` maps
    phases 0, 1 and 7 to easy, 2, 3, 5 and 6 to medium and 4 to hard, so difficulty rises to the
    full moon and falls back. `nightFor(day, special)` returns the special key when the setting names
    one that exists in `NIGHTS`, else the tier's key.
*   **Floors**: `leastClimbMs(layoutId, tier, band)` reads `CLIMB_FLOORS`. A unit test runs the
    scripted route through `stepClimb` under each tier and asserts each floor equals that route's
    time to the band less `CLIMB_FLOOR_MARGIN`, so a constant or layout change that moves a floor
    fails `pnpm check`. Appendix A's floors are starting numbers; Phase 1's first task runs the route
    and freezes the real ones.
*   **Invariants, tested**: glide reach from airborne points sampled every 40 px above every ledge;
    a route up from every ledge (the scripted route visits all of them); band lines span the field;
    the start ledge is at y 0.
*   **Pay**: `BAND_FEATHERS` (1, 1, 2, 2, 2, 2; ten in total), `BAND_NAMES` and the one-line
    results, defaults for the owner's approval.

### The protocol

Two `act` kinds in `packages/shared/src/edge.ts`; `EDGE_PROTOCOL_VERSION` becomes 10. The
`welcome` frame gains `realms: {open: string[], portal: boolean, night: string | null}`. `r` is
the request id every `act` frame already carries so the page can match the answer.

`climb` (start or resume) carries only `r`. The server answers:

| Field | Type | Meaning |
| --- | --- | --- |
| `seed` | integer 0 to 2^32 - 1 | the run's key |
| `startedAt` | ms on the collections object's clock | for the result card; never judged |
| `night` | key in `NIGHTS` | pinned at start |
| `tier` | `easy`, `medium`, `hard` | for the header |
| `banked` | 0 to 6 | highest band paid in this run |
| `remainingCap` | 0 to 25 | feathers from games left today before this run's next band |
| `bestBandToday` | 0 to 6 | highest band paid today across runs |
| `resumed` | boolean | an open run was returned |
| `previousForgotten` | boolean | a run over an hour old was discarded to open this one |

Refusals: `far` (no open run and not at the portal), `closed` (no open run and the portal is off),
`offline` (the collections object did not answer).

`ascent` carries `k` (the seed) and `band` (1 to 6; the parser rejects 0 and anything above
`BAND_COUNT`). The server answers:

| Field | Type | Meaning |
| --- | --- | --- |
| `banked` | 1 to 6 | the run's banked band after this frame |
| `added` | integer | feathers this frame added |
| `feathers` | integer | the collector's balance after |
| `total` | 0 to 25 | feathers from games today after |
| `why` | `capped`, `paid-today`, `item-already-given`, absent | why `added` is less than the bands' table value |
| `item` | `{variant, first: true}`, absent | the first-time item, when the grant added it |
| `ref` | 8 hex characters | the run reference |

Refusals: `idle` (no open run, or another seed), `too-fast` (a floor failed), `forgotten` (over
an hour since the start), `offline`.

### Run states

As the collections object sees them. "Paid today" is read from the band rows of the current park
day.

1.  **No run.** `climb` with `atPortal` and `portalLive` opens a run with a fresh seed,
    `nightFor(parkDay(now), special)`, that night's layout id, and `startedAt` = now. Without the
    flags it answers `far` or `closed`. A run over an hour old counts as no run and sets
    `previousForgotten`.
2.  **Open run.** `ascent` for `band` handles every band from `banked` + 1 to `band` in order. For
    each: if the floor fails, the frame answers `too-fast` and nothing is written; otherwise the
    band's row is written, the band is paid unless it was paid today (`why` = `paid-today`) or the
    cap clips it (`why` = `capped`, the row records the table value and the amount added), and
    `banked` advances. The answer's `why` is the last band's. A band at or below `banked` answers the
    existing row (`why` = `paid-today`, `added` 0). Band 6 calls `CollectionBook.grant` for
    `glass-circlet~0`; `item.first` is true when the grant added it (`added` in its result).
3.  **Open run, new socket.** `climb` returns the run with `resumed` true, whatever the setting and
    wherever the owl stands. Two sockets of one collector both drive the same run; the rows are
    idempotent per (cid, seed, band), so neither can pay twice.
4.  **Forgotten.** An hour after `startedAt`, `ascent` answers `forgotten` and the next `climb`
    opens a new run (state 1).

On the page: the climb screen sends `climb` on Start; on reconnect or reload it sends `climb` and
reopens at the banked band's line when `resumed` is true; on `too-fast` it keeps playing with
`banked` unchanged and the next `ascent` carries the higher band; it resends an unanswered
`ascent` once with the next `ascent` or on reconnect; Stop and Escape close the screen and send
nothing.

### The climb book (collections object)

Runs live in the collections object: it already holds every per-collector fact, its own clock
and SQL, and a run keyed by collector there survives any socket, room object or phone.
`ClimbBook` in `packages/shared/src/climbbook.ts` is platform-free like `ArcadeBook`, so the local
mode and the tests run it in the browser, over a `ClimbStore` with two tables:

*   `climb_runs`, one row per collector: `cid TEXT PRIMARY KEY, seed INTEGER NOT NULL, night TEXT
    NOT NULL, layout TEXT NOT NULL, started_at INTEGER NOT NULL, banked INTEGER NOT NULL`.
*   `climb_bands`, one row per band: `cid TEXT NOT NULL, seed INTEGER NOT NULL, band INTEGER NOT
    NULL, day TEXT NOT NULL, arrived_at INTEGER NOT NULL, verdict TEXT NOT NULL, floor_ms INTEGER
    NOT NULL, elapsed_ms INTEGER NOT NULL, due INTEGER NOT NULL, added INTEGER NOT NULL, why TEXT,
    night TEXT NOT NULL, ref TEXT NOT NULL, PRIMARY KEY (cid, seed, band)`, with an index on `ref`.
    On every write, rows with `arrived_at` older than `CLIMB_ROW_KEEP_DAYS` (30) days are deleted;
    `climb_runs` is never swept, a new run overwrites the collector's row.

`start(cid, flags, now)` and `band(cid, seed, band, now)` apply the run states above. Payment goes
through `CollectionBook.play(cid, feathers, null, now)`: a null event, so the climb does not count
toward a daily task, on the day the band arrives. The grant is `CollectionBook.grant(cid,
'glass-circlet~0', 'granted', now)` and the collection log row carries the `visit` the room object
passes, as hand-ins do. The run reference is `hashSeed(cid + ':' + seed)` from `parktime.ts`
(FNV-1a, 32 bits) written as eight lowercase hex characters, stored in `ref`. There is no counters
table, no ascents table and no second ledger.

The room object's part: on `climb`, pass `atPortal` (the owl stands in the `portal` door's rect),
`portalLive` and `night` from its in-memory `realms`, and call `climbStart`; on `ascent`, pass
through to `climbBand` with `visitOf(att)`. No run state lives on the socket attachment. The
climber stays in the room at the portal as arcade players stay at a cabinet.

### The page

*   `ClimbScene` renders the shared simulation: a portrait field `CLIMB_FIELD_W` (480) px wide
    like the arcade's, fitted and letterboxed, the camera following the owl anchored at
    `CLIMB_CAMERA_ANCHOR` (0.58 of the view height), segment pieces drawn from the layout, the owl
    in run, jump and spread poses. Its art keys have `kind: 'climb'`; the scene calls `loadArt` on
    create and `releaseArt` on shutdown.
*   The climb screen is a full-screen modal in the HUD's `covered` state that owns its input: a
    stick built with `createJoystick` on the left (the module gains a parent and a selector prefix),
    a jump button on the right (`PAD_TARGET_PX`, 44, declared in the screen), keyboard by `code`
    through `attachKeyboard`'s held set, with Space handed to the climb while it is up and released
    on blur and hidden. The room keeps `hud.isBlocking()` as its gate, so no tap or key action
    reaches it; Escape closes the screen through `hud.closePanels()`.
*   The start card and the result card use the HUD's cards; the header and the hints are the
    screen's own elements, as the arcade screen's banner and hint line are, because `covered` hides
    the HUD's hint chips. Hints teach one verb per step and clear by doing it. Calm motion turns off
    the glass pulse.
*   The local mode runs `ClimbBook` over a memory store with a snapshot under `owl-park:climb`,
    with `realms` open and the portal live by default; `?night=<key>` pins the night in the local
    mode and the browser tests only.

### The `realms` setting (overflow object)

The overflow object keeps keeper settings in its `Settings` class (`apps/edge/src/Overflow.ts`),
takes `POST /settings` from the Worker's `POST /api/admin/capacity`, has the capacity page, is
read by the Worker through `overflowState.ts` with a keep of `OVERFLOW_KEEP_MS` (3 seconds) while
anything is on, and pushes `{words}` to every room object on change while the room objects poll
`GET /notice` every `NOTICE_FRESH_MS`. `realms` becomes a fourth field of those settings beside
the line, the ribbon and the copies:

*   Shape: `{open: string[], portal: boolean, night: string | null}`, default `{open: [],
    portal: false, night: null}`. `open` lists gated rooms only; a room without `gated: true` never
    consults it. `POST /settings` merges the fields given, rejects an id that is not a gated room or
    a night that is not in `NIGHTS` with `{error: 'bad realms'}` and 400, and logs
    `[owl-park] realms: open […], portal on|off, night <key>` with the time; the reply is the state.
*   Push and poll: the notice body becomes `{words, realms}`; `sendNotice` dedupes on the pair;
    `GET /notice` returns both; `setNotice` in the room object takes both and keeps `realms` in
    memory and in its storage under a `REALMS_KEY`, as the lanterns are kept, so a wake from
    hibernation starts from the last known setting rather than closed. `OverflowState` and `QUIET`
    gain `realms`.
*   Effect: a hello into a gated room not in `open` is answered after accept with
    `CLOSE.REALM_CLOSED` and the sign, the `NEST_CLOSED` pattern; when `open` loses a room, the room
    object closes every socket in it with the same code; the client's close handler calls a new
    `onRealmClosed(sign)` on `RoomHandlers`, and `RoomScene` walks the owl to the hub's `from-glass`
    spawn and shows the phrase. The `welcome` frame carries `realms` so the client draws the arch
    open or closed and the Menu map agrees. The levers, fastest first: portal off, realm closed,
    Worker rollback.

## Alternatives Considered

### Alternative A: Platformer movement across the whole park

Replace tap-to-walk everywhere with a stick or keys, a jump, a double jump and a glide, and remap
every room's walkable space to the new physics.

*   **Pros**: One movement model; the climb is the park, not a mode.
*   **Cons**: Every room becomes a level to re-author and partly repaint; the server's geometry
    clamping and the one-destination `move` frame go away; held input means streamed positions
    (which breaks the message budget) or input events with a deterministic simulation for a
    hundred owls; it removes the model `docs/ARCHITECTURE.md` section 1 describes.
*   **Reason for Rejection**: About ten times this project, with no path that keeps the park
    playable during it.

### Alternative B: The arch as a portal straight into a solo climb

*   **Pros**: No new room art, floor, idol, vote entry or cap; the climb ships sooner.
*   **Cons**: The realm would be different in kind from the grove and the market: no place to
    stand with other owls, no idol, no Realm Vote; "four realms" would be three rooms and a
    mini-game.
*   **Reason for Rejection**: The park's realms are social rooms first. The room is an ordinary
    `RoomDef`, so its cost is art approval and list edits, not a new mechanism.

### Alternative C: The moon decides whether the portal is open

*   **Pros**: Themed; rare nights read as events.
*   **Cons**: Nothing is daily when the portal is shut most nights; a visitor whose one evening
    falls on the wrong phase never sees the realm's main feature; a full moon comes every 29.5 days.
*   **Reason for Rejection**: The daily payout needs a nightly portal. The moon changes the climb
    instead.

### Alternative D: Verify runs by input-trace replay on the server

*   **Pros**: The only check that proves the claimed height was reached under the rules.
*   **Cons**: The physics must run inside the Durable Object per result; a five-minute trace is
    tens of kilobytes, over the frame limit, so it needs an HTTP route; every tuning change becomes
    a server deploy; it does not stop a scripted perfect run.
*   **Reason for Rejection**: The stakes are at most 25 feathers a day and one common item once.
    Time floors with a shared test cost one table and one test; the shared simulation keeps replay
    possible later without changing the wire shape.

### Alternative E: A short climb kept on the socket, as arcade runs are

*   **Pros**: No new server state; `startRun` and `endRun` carry over.
*   **Cons**: Caps the city's height and what a moon phase can add; on phones a lost connection
    during a run is the normal case, and "The park did not catch that run" after a real climb loses
    the visitor's work.
*   **Reason for Rejection**: A run in the collections object costs one table and gives band
    banking and resumption for free.

### Alternative F: The climb as a fourth arcade game

*   **Pros**: Fewest new types; about four non-test files.
*   **Cons**: `ArcadeGame` drives the score wall (one column per game, pushed to everyone in the
    arcade), `cabinetOf` assumes a cabinet, `startRun` refuses any room but the arcade, and the
    wall fields would be meaningless for a climb with no score; once-a-day band pay, the run
    lifetime and the first-time item do not fit `finish`.
*   **Reason for Rejection**: The climb gets its own `act` kinds and book. The arcade's pattern is
    reused as a pattern, not as a type.

### Alternative G: A per-visitor room for the duration of a run

*   **Pros**: Frees a cap slot and stops minutes of fan-out to a client that renders none of it.
*   **Cons**: A room switch mid-activity with its own failure modes; the owl vanishes from the room
    beside the idol and other owls.
*   **Reason for Rejection**: Deferred, not built. The climber stays at the portal. With the run in
    the collections object the switch can be added later, if the keeper's capacity page shows the
    room object's CPU with a populated `glass` above the budget in `docs/CAPACITY.md`.

### Alternative H: Merge the realm in the opening deploy, as the arcade did

*   **Pros**: No setting, route or admin control.
*   **Cons**: Any registered room is reachable by its id in the URL, so the realm cannot sit on
    `main` dark; closing a misbehaving realm on opening night is a redeploy that reverts everything
    else that shipped with it.
*   **Reason for Rejection**: One setting field in an object that already has a settings class,
    a page, a push and a poll.

### Alternative I: Keep the park's pad visible over the climb

*   **Pros**: One set of controls to learn.
*   **Cons**: The park's pad is an eight-way walking stick bottom-right with buttons bottom-left,
    the opposite of a two-thumb platformer; the HUD's `covered` state hides the bottom bar; Space
    would reach the room's jump emote.
*   **Reason for Rejection**: The climb screen draws its own stick and jump from the same modules.

### Alternative J: Other fall rules

*   **Pros**: Falling to the bottom needs no glide; respawning on the last ledge needs no landing
    ledges.
*   **Cons**: Falling to the bottom means most visitors never see the clouds and a ten-minute
    climb vanishes in a second; respawning removes the glide's reason to exist.
*   **Reason for Rejection**: The glide makes a miss cost height by skill, and one-way band lines
    bound the worst loss.

### Alternative K: The existing Halo as the reward, or a one-time halo

*   **Pros**: No new item.
*   **Cons**: An epic item from a daily skill game outpaces every other way to earn it; an owl may
    already own it; a one-time reward gives no reason to climb again.
*   **Reason for Rejection**: Daily feathers by band plus one new common item the first time. The
    halo stays a catalogue item.

## Risks and Mitigations

*   **The overflow object is unreachable.** Risk: room objects cannot learn a change. Mitigation:
    each room object keeps the last `realms` in memory and in its storage and keeps serving from it;
    a room object that has never received one treats gated rooms as closed and ungated rooms as
    open. The Worker's keep serves the capacity page from its last read.
*   **The collections object does not answer mid-run.** Risk: a band is lost. Mitigation: the room
    object answers `offline`; the client keeps the band and resends once with the next band or on
    reconnect; the run is in storage.
*   **Two sockets on one collector.** Risk: double pay. Mitigation: none needed; the band rows are
    idempotent per (cid, seed, band) inside one object, so the second socket's frames return the
    rows the first one wrote.
*   **The room is full when a climber reconnects.** Risk: the owl is sent to the hub. Mitigation:
    none built; the run waits in storage for the hour, and the climb screen resumes when the owl is
    back in the room.
*   **A deploy mid-run.** Risk: a lost climb. Mitigation: sockets drop, the stale bundle's hello is
    refused with `CLOSE.BAD_PROTOCOL` (4002), the page reloads once and `climb` resumes at the banked
    band; only the page's unbanked height is lost. A deploy that changes the layout judges the open
    runs of that hour against the new floors; the deploy happens in a quiet hour and that hour is
    accepted.
*   **A night key removed from the bundle.** Risk: a dangling setting. Mitigation: `POST
    /settings` refuses unknown keys, and `nightFor` falls back to the moon's tier when the stored key
    is gone, logging one line per room object process.
*   **Abuse of the start timer.** Risk: a client opens a run, waits out the cloud floor and sends
    band 6. Mitigation: none; the loss is bounded by the cap and one common item, stated in G6.
*   **A fifth populated room.** Risk: `docs/CAPACITY.md` records four rooms at cap overloading one
    object on `ROOM_SHARDING=single`. Mitigation: before the arch opens, either `ROOM_SHARDING=room`
    or copies of `glass` (`apps/edge/src/copies.ts`, built; the CAPACITY doc's PLANNED marker is
    stale, a `TODO-DOCS`).
*   **The Durable Object request budget.** Risk: the free plan's 100,000 requests a day
    (`docs/PLAYBOOK.md` section 5), which counts a socket connection as one request and twenty
    socket messages as one. A climb costs at most seven frames (0.35 of a request) and up to seven
    collections RPCs (seven requests), about eight in all. At the park's measured 80 concurrent owls
    and one climb each per hour of an evening, a night is about 2,000 requests. Mitigation: the
    existing usage notification at half the cap.
*   **Public data.** The layout and art ship in the bundle while the realm is dark, as everything
    in this repository does; the working name stays out of the data.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security and privacy.** No new secret; the admin route sits behind `ADMIN_KEY`. The raw
    collector id never leaves the collections object: the Workers log and the admin lookup carry the
    run reference, which is a hash. Nothing from a setting becomes words or layout on a page. No
    internal realm name anywhere.
*   **Performance.** The climb adds nothing to fan-out; the walking in the new room is the cost
    (Risks). On the page, a 120 Hz simulation of one owl and 32 platforms, and six segment pieces
    under the arcade's per-file limits, loaded while the scene is active.
*   **Rollout and rollback.** One deploy carries the protocol bump, the room data, the climb and
    the setting's default (closed, portal off). Opening is a `POST /api/admin/capacity`; closing is
    the same. A Worker rollback leaves the new tables in place (the playbook's rule). The deploy
    happens in a quiet hour; a climb in flight loses only its unbanked height.

--------------------------------------------------------------------------------

### Additional Resources

*   The EGM concepts brief and the review reports (the ignored `EGM/` folder, not in git).
*   `docs/ARCHITECTURE.md` sections 1, 2, 4, 5, 6, 7 and 8; `docs/ACTIVITIES.md`;
    `docs/COLLECTIBLES.md`; `docs/CAPACITY.md`; `docs/PLAYBOOK.md` sections 2 and 5;
    `docs/ART-PIPELINE.md`; `docs/GLOSSARY.md`.
*   The arcade as the precedent: `packages/shared/src/arcade.ts`, `arcadebook.ts`,
    `roomActivities.ts`; `apps/park/src/game/ArcadeScene.ts`, `apps/park/src/game/arcade.ts`,
    `apps/park/src/arcade/field.ts`, `apps/park/src/arcade/paint.ts`,
    `apps/park/src/ui/arcadeScreen.ts`; `apps/edge/src/sqlScoreStore.ts`.
*   The settings precedent: `apps/edge/src/Overflow.ts`, `overflowState.ts`, `capacityPage.ts`,
    `packages/shared/src/overflow.ts`.

### Future Improvements

*   **A per-visitor room for a run** (Alternative G).
*   **A feathers grant route, a collector view and climb counters**, when the first dispute needs
    them.
*   **Special-night layouts** behind new `NIGHTS` keys.
*   **Quests in the stained-glass room**: a quest item kind, its noun and an NPC there.
*   **A style set for the realm** once it has furniture and a capstone piece.
*   **An exclusion flag on catalogue items**, to keep a first-time item out of the shop and quests.
*   **A `REALMS` table in shared** from which the hardcoded realm lists derive, before the fourth
    arch opens.
*   **A `run` row in the analytics log**, with its migration, under the under-13 rule.
*   **A real lunar calendar** behind the same `parkMoon(day)` signature.
*   **Input-trace replay** behind the same shared simulation, if the stakes rise.
*   **The flight ticket (`OP-084`)** reusing or retiring the climb's movement constants.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Five phases. Each ends with `pnpm check` green; Phases 2 and 4 also end with `pnpm e2e` green.
`docs/` is the doc agent's: `TODO-DOCS` comments mark the places a doc must change (`edge.ts` for
protocol 10, `climb.ts` for the activity, `Overflow.ts` for the setting, `index.ts` for the route,
`copies.ts` for the CAPACITY marker), and one changelog line is appended when the ticket is Done.

### Phase 1: the shared simulation (`packages/shared`)

1.  **`src/climb.ts`** (new). The structs, rules, constants, layout, route and floors of
    Appendix A. Exports: `CLIMB_STEP_MS`, `CLIMB_FIELD_W`, `CLIMB_SLACK_MS`, `CLIMB_RUN_MAX_MS`,
    `CLIMB_FLOOR_MARGIN`, `CLIMB_ROW_KEEP_DAYS`, `CLIMB_CAMERA_ANCHOR`, the physics constants,
    `Ledge`, `Layout`, `Night`, `Tier`, `ClimbInput`, `ClimbState`, `startState`, `stepClimb`,
    `LAYOUTS`, `NIGHTS`, `ROUTES`, `CLIMB_FLOORS`, `leastClimbMs`, `BAND_FEATHERS`, `BAND_NAMES`,
    `bandLine`. `BAND_COUNT` (6) is defined in `edge.ts` and re-exported here, so `edge.ts` does not
    import `climb.ts`.
2.  **`src/climb.test.ts`** (new). The floor test: for each tier, run `ROUTES['city-1']` through
    `stepClimb` and assert each `CLIMB_FLOORS` entry equals the route's time to the band less the
    margin, rounded down to 100 ms. The invariants: glide reach from points sampled every 40 px
    above every ledge; the route stands on every ledge; band lines span the field; the start ledge
    is at y 0. `leastClimbMs` at the boundaries; every `NIGHTS` key points at a layout in `LAYOUTS`;
    `BAND_FEATHERS` sums to ten.
3.  **`src/parktime.ts`** (modify). Export `daysBetween(a, b)` (move it from `shop.ts`, which
    keeps calling it); `MOON_EPOCH_DAY` = `'2026-11-17'`; `MOON_CYCLE_DAYS` = 28;
    `MOON_PHASE_DAYS` = 3.5; `parkMoon(day)` = `floor(((daysBetween(MOON_EPOCH_DAY, day) %
    MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS / MOON_PHASE_DAYS)`; `moonTier(phase)`;
    `nightFor(day, special)`.
4.  **`src/parktime.test.ts`** (new). `parkMoon` on the epoch (0), epoch plus 14 (4), epoch plus
    28 (0), a day before the epoch (7); `moonTier` for all eight phases; `nightFor` with a known key,
    an unknown key and null.
5.  **`src/shop.ts`** (modify). Import `daysBetween` from `parktime.ts`.
6.  **`src/index.ts`** (modify). Export the new module.

### Phase 2: protocol, room data and the setting (the realm stays dark)

7.  **`src/edge.ts`** (modify). `EDGE_PROTOCOL_VERSION` 10 with the version comment extended;
    `BAND_COUNT`; `ActKind` and `ACT_KINDS` gain `climb` and `ascent`; `ClientAct` gains `band`;
    `parseClientFrame` accepts `ascent` only with an integer `band` from 1 to `BAND_COUNT` and an
    integer `k` from 0 to 2^32 - 1; `ServerAct` gains the `climb` and `ascent` answers of the
    Technical Plan and the refusals `closed`, `too-fast`, `forgotten` (`far`, `idle` and `offline`
    exist); `ServerWelcome` gains `realms`; `CLOSE.REALM_CLOSED` = 4011.
8.  **`src/edge.test.ts`** (modify). Parse and reject cases for the two kinds; `v: 9` on line 12
    becomes `EDGE_PROTOCOL_VERSION`.
9.  **`src/room.ts`** (modify). `RoomDef` gains `gated?: boolean`.
10. **`rooms/index.ts`** (modify). The `glass` `RoomDef` of Appendix B; the hub's `closed-b` door
    becomes `{ id: 'to-glass', rect: { x: 2560, y: 610, w: 210, h: 90 }, to: { room: 'glass', spawn:
    'from-hub' }, marker: { x: 2665, y: 560 } }`; the hub floor gains `{ x: 2560, y: 672 }, { x:
    2560, y: 604 }, { x: 2770, y: 604 }, { x: 2770, y: 672 }` between `{ x: 2515, y: 672 }` and
    `{ x: 2815, y: 672 }`; the hub spawn `'from-glass': { x: 2665, y: 740 }`; `ANCHORS.glass` of
    Appendix B. The blockade art key `blockade-hatching-soon` stays in the client's `ART` and is
    drawn while the realm is closed (item 18).
11. **`rooms/rooms.test.ts`** (modify). The existing invariants cover the room; one case asserts
    that exactly one hub door has a `closedSign` and that it is in `CLOSED_SIGNS`.
12. **`src/collectibles.ts`** and **`src/collectibles.test.ts`** (modify). `glass-circlet`, common,
    head slot, through `wear()`; the counts become 59 wearables, 36 head items, 590 wear variants and
    1,190 variants in all.
13. **`src/overflow.ts`** (modify). `RealmsSettings` `{open: string[], portal: boolean, night:
    string | null}`, `REALMS_DEFAULTS`, `withRealmsChanges(base, v, gatedIds, nightKeys)` returning
    null when out of bounds; `OverflowState` gains `realms`.
14. **`apps/edge/src/Overflow.ts`** (modify). `Settings.realms()` and `setRealms()`; `POST
    /settings` handles `body['realms']` with `withRealmsChanges`, 400 `{error: 'bad realms'}`, and
    the log line; `sendNotice(words, realms)` dedupes on both and sends `{words, realms}`; `GET
    /notice` returns both; `/state` includes `realms`.
15. **`apps/edge/src/overflowState.ts`** (modify). `QUIET` gains `realms: REALMS_DEFAULTS`.
16. **`apps/edge/src/capacityPage.ts`** (modify). Three controls: a checkbox per gated room for
    `open`, a checkbox for `portal`, a select over `NIGHTS` keys plus "moon" for `night`; they POST
    `{realms: {…}}` to `/api/admin/capacity`.
17. **`apps/edge/src/RoomObject.ts`** (modify). `realms` in memory, loaded from storage under
    `REALMS_KEY` at construction and written on every change; `setNotice(words, realms, told)`;
    `POST /notice` and `freshNotice` read both fields; a hello into a gated room not in `open` is
    closed after accept with `CLOSE.REALM_CLOSED` and the sign (the `NEST_CLOSED` pattern); when
    `open` loses a room, every socket in it is closed the same way; `welcome` carries `realms`.
18. **`apps/edge/src/Room.ts`** (modify). `Room.join`'s welcome extras type gains `realms`.
19. **`apps/edge/test/copies.test.ts`** and **`RoomObject.test.ts`** (modify). A hello into a closed
    gated room gets 4011 and the sign; an ungated room ignores `open`; a notice with `realms` opens
    the room; `welcome` carries `realms`; the default is closed; the setting survives a new object
    built on the same storage.
20. **`apps/park/src/net/transport.ts`** (modify). `RoomHandlers` gains `onRealmClosed?(sign:
    string): void`.
21. **`apps/park/src/net/edge.ts`** (modify). `CLOSE.REALM_CLOSED` in the close handler calls
    `handlers.onRealmClosed(reason)` then `onStatus('offline')` and returns; `realms` kept from
    `welcome` and exposed to the scene.
22. **`apps/park/src/game/RoomScene.ts`** and **`game/ambience.ts`** (modify). `onRealmClosed`
    shows the phrase as a toast and calls `goTo('hub', 'from-glass')`; `to-glass` is drawn as the
    blockade while `realms.open` lacks `glass` and as an open doorway otherwise; `DOOR_TINTS` and
    ambience's tint table gain `glass`; the idol piece for `glass`.
23. **`apps/park/src/ui/menuTabs.ts`** (modify). `renderMap(…, open)` takes the open gated rooms;
    the `closed-b` placeholder entry becomes `glass`, keeping its placeholder words until `OP-069`.
24. **`apps/park/e2e/park.spec.ts`** (modify). The closed-doorway test walks to `closed-a`.

`pnpm check` and `pnpm e2e` green with the realm dark.

### Phase 3: the climb book and the server path

25. **`packages/shared/src/climbbook.ts`** (new). `ClimbStore`: `openRun(cid): RunRow | null`,
    `putRun(row: RunRow): void`, `upsertBand(row: BandRow): void`, `bands(cid, seed): BandRow[]`,
    `paidBands(cid, day): number[]`, `byRef(ref): BandRow[]`, `sweep(before: number): void`;
    `RunRow` and `BandRow` as the tables; `MemoryClimbStore` with `snapshot()` and `static
    from(unknown)`; `ClimbBook.start(cid, flags: {atPortal, portalLive, special}, now)` and
    `band(cid, seed, band, now)` as the run states; `ClimbStart` and `ClimbSettled` reply types.
26. **`packages/shared/src/climbbook.test.ts`** (new). Start and resume; `far` and `closed` only
    without an open run; forgotten after an hour with `previousForgotten`; an `ascent` for band 3
    after band 1 was banked pays bands 2 and 3; a second run today re-banks bands 1 to 3 with
    `paid-today` and `added` 0; a run across park midnight pays its later bands into the new day and
    does not re-pay the earlier ones; the cap clipping band 4 with `why` = `capped` and `due`
    recorded; a too-fast band refused with nothing written; the item granted once and `first` false
    the second time; a resend returning the row; two seeds answering `idle` for the other.
27. **`apps/edge/src/sqlClimbStore.ts`** (new). The two `CREATE TABLE IF NOT EXISTS` statements of
    the Technical Plan, the index on `ref`, `sweep` deleting `climb_bands` rows with `arrived_at <
    before`, called from `upsertBand` with `now - CLIMB_ROW_KEEP_DAYS` days.
28. **`apps/edge/src/Collections.ts`** (modify). `ClimbBook` over `SqlClimbStore`; RPCs
    `climbStart(cid, flags)`, `climbBand(cid, seed, band, visit)`, `climbLookup(ref)` (the run's
    `night`, `startedAt` and its band rows without `cid`); the grant through `this.book.grant` with
    the `visit` on the log row; one log line per refusal carrying the reference and the verdict.
29. **`apps/edge/src/RoomObject.ts`** (modify). The `climb` and `ascent` cases in the `act`
    switch; `atPortal` from the `portal` door's rect; `no()` gains the new reasons.
30. **`apps/edge/src/index.ts`** (modify). `GET /api/admin/climb?ref=<8 hex>` behind `ADMIN_KEY`:
    200 with `climbLookup`'s JSON, 404 `{error: 'not found'}` for an unknown reference, 400 for a
    malformed one.
31. **`apps/edge/test/climb.test.ts`** (new). The room object's two cases over the real SQLite
    store (`test/sqlite.ts`): `far`, `closed`, start, resume on a new socket, a band paid, a
    forgotten run, the lookup route's shapes; `RoomObject.test.ts`'s `FakeCollections` grows the
    three RPCs.

### Phase 4: the page

32. **`apps/park/src/collect/service.ts`** (modify). `ActRefusal` gains `closed`, `too-fast`,
    `forgotten`; `ActivityLink` gains `climb(): Promise<ClimbReply>` and `ascent(seed, band):
    Promise<AscentReply>` with the reply types of the Technical Plan.
33. **`apps/park/src/net/edge.ts`** (modify). The two calls through the `act` helper.
34. **`apps/park/src/collect/local.ts`** and **`local.test.ts`** (modify). The two calls through
    `ClimbBook` over `MemoryClimbStore`, persisted under `owl-park:climb`; `realms` open and the
    portal live; `?night=<key>` read from the page's query.
35. **`apps/park/src/game/ClimbScene.ts`** (new). The scene of the Technical Plan; `loadArt` on
    create and `releaseArt` on shutdown; `StepClock` from `arcade/field.ts` driving `stepClimb`;
    emits `bandReached(band)`.
36. **`apps/park/src/game/climb.ts`** (new). The handler, in `game/arcade.ts`'s structure (a class
    holding the link, the scene and the screen): the card, Start sending `climb`, the header,
    `ascent` per band with a single resend, `too-fast` handling, resume on reconnect and reload, the
    result card with the item line and the reference, Stop and Escape.
37. **`apps/park/src/ui/climbScreen.ts`** (new). The modal in `arcadeScreen.ts`'s structure: its
    own header, hint line and result block; the stick from `createJoystick(stage, 'climb')`; the
    jump button at `PAD_TARGET_PX` (44); the held-state input `{left, right, jumpPressed,
    jumpHeld}`; release on blur and hidden.
38. **`apps/park/src/ui/joystick.ts`** (modify). `createJoystick(parent: HTMLElement, prefix =
    'hud')` renders into `parent` with CSS scoped to `.<prefix>-stick`; the HUD's call passes its
    bottom bar as before.
39. **`apps/park/src/ui/keyboard.ts`** and **`keyboard.test.ts`** (modify). `attachKeyboard` gains
    `setOwner(owner: {jumpDown(): void; jumpUp(): void} | null)`; while an owner is set, Space goes to
    it instead of `actions.jump()` and key-up is reported; other keys are unchanged (the room's
    handlers already check `hud.isBlocking()`).
40. **`apps/park/src/ui/hud.ts`** (modify). `openClimb` and `closeClimb` on the `covered` state;
    `isBlocking()` includes the climb; `closePanels()` closes it.
41. **`apps/park/src/game/RoomScene.ts`** (modify). The `interactions` entry for `portal`,
    labelled "Climb", refused with the approved phrase while `realms.portal` is false.
42. **`apps/park/src/game/art.ts`** (modify). `ArtKind` gains `climb`; `artScale` treats it as
    `arcade`; `releaseArt` releases it; the six segment specs of Appendix A under `kind: 'climb'`.
43. **`apps/park/src/main.ts`** (modify). `ClimbScene` in the scene list; `window.owlPark.climb()`
    beside `arcade()`, returning the handler for the browser tests.
44. **`apps/park/src/ui/itemIcon.ts`** and **`game/itemArt.ts`** (modify). `glass-circlet`.
45. **`apps/park/e2e/climb.spec.ts`** and **`climbPlay.ts`** (new); **`playwright.config.ts`**
    (modify: `climb` added to the `desktop`, `phone` and `edge` regexes). The spec opens the realm
    and the portal with `POST /api/admin/capacity`, header `X-Admin-Key: E2E_ADMIN_KEY`, body
    `{realms: {open: ['glass'], portal: true, night: 'easy'}}` under the `edge` project, and
    `?night=easy` under the local projects; it covers the card, a banked band, Stop, the result
    card, resume after a dropped socket (`edge` only), and the portal off showing its phrase.

### Phase 5: art and words

46. **`tools/art/config/assets.json`** and **`tools/art/prompts.mjs`** (modify). The room tiles
    `glass` and `glass-east` (kind `room`), the idol piece `glass-idol` (kind `piece`), the six
    segment pieces of Appendix A (kind `piece`, `with_2x`), and `item-glass-circlet` (kind `item`),
    under neutral keys; the forbidden-word check runs in `generate.mjs`.
47. **`CLAUDE.md`** (modify). One line under the art rules naming the climb's segment pieces as
    art that needs the owner's pick.
48. **Words for approval.** The card, the header lines, the hints, the band names, the result lines,
    the forgotten-run line and the closed-portal phrase (`Pardon Our Feathers`, already approved).

### Not changed, on purpose

`apps/edge/src/Room.ts`'s `jumpEveryMs`; `apps/edge/wrangler.jsonc` (no new binding);
`apps/edge/src/rooms.ts` (`roomCap` already returns 40 for a room not in `DEFAULT_CAPS`);
`packages/shared/src/activities.ts` and `book.ts` (`play` takes a null event);
`packages/shared/src/questCatalog.ts` (its own room list; quests in `glass` are a Future
Improvement); `packages/shared/src/styles.ts` (no set until the realm has furniture);
`apps/edge/src/collectLog.ts` (room labels derive from `ROOMS`); `apps/edge/src/VoteLedger.ts`
until the owner opens the realm (then `VOTABLE_REALMS` gains `glass`); `docs/`.

### Verification Plan

*   **Every phase**: `pnpm check` (typecheck with `wrangler types`, `vitest run` in all three
    packages, the client build).
*   **Phase 1**: `pnpm --filter @owl-park/shared test` runs `climb.test.ts` and `parktime.test.ts`;
    the first run prints the route's times, the implementer freezes them in `CLIMB_FLOORS`, and
    from then on the floor test is the gate on every tuning change.
*   **Phase 2**: `edge.test.ts`, `rooms.test.ts`, `collectibles.test.ts`, `copies.test.ts`,
    `RoomObject.test.ts`; `pnpm e2e` with the realm dark (the closed-arch test).
*   **Phase 3**: `climbbook.test.ts`, `apps/edge/test/climb.test.ts`.
*   **Phase 4**: `local.test.ts`, `keyboard.test.ts`; `pnpm e2e` with `climb.spec.ts` under all
    three projects.
*   **By hand before opening**: `pnpm dev:edge`; a climb on a phone with the tab backgrounded for
    five minutes and resumed; a climb across park midnight in the local mode with a shifted clock;
    the capacity page turning the portal off while a run is open; the five-room load test
    (`tools/load/run-steps.mjs`) on a throwaway copy, or `ROOM_SHARDING=room`.
*   **After opening**: the Workers log's refusal lines and the admin lookup; the room object's CPU
    with five populated rooms on the capacity page.

--------------------------------------------------------------------------------

## Appendix A: the simulation

Field pixels: the field is `CLIMB_FIELD_W` (480) wide; y counts up from the start ledge at 0.
Speeds are px/s and accelerations px/s^2; the step is `CLIMB_STEP_MS` = 1000/120.

### Structs

```text
Ledge      { x: number; y: number; w: number }   one-way; top surface at y
Layout     { id: string; ledges: Ledge[]; bandLines: number[6];
             start: Ledge }
Tier       'easy' | 'medium' | 'hard'
Night      { key: string; layout: string; tier: Tier;
             glideFall: number }
ClimbInput { left, right, jumpPressed, jumpHeld: boolean }
ClimbState { x, y, vx, vy: number; grounded: boolean;
             coyoteMs, bufferMs: number; jumpsUsed: 0 | 1 | 2;
             rising: boolean; gliding: boolean; band: 0..6 }
```

`jumpPressed` is true on the step the button went down; `jumpHeld` while it is down. The owl's
box is `OWL_W` by `OWL_H`, with (x, y) its bottom centre. The band lines are ledges spanning the
field, listed in `bandLines` and treated as ledges; the cloud line is `bandLines[5]`.

### Rules, applied in this order each step

1.  **Timers.** `coyoteMs` resets to `COYOTE_MS` while grounded and counts down in the air;
    `bufferMs` is set to `JUMP_BUFFER_MS` on `jumpPressed` and counts down.
2.  **Horizontal.** With left or right held, `vx` moves toward `-RUN_SPEED` or `RUN_SPEED` by
    `RUN_ACCEL` times the step; with neither, toward 0 by the same. While gliding, `vx` is clamped to
    `GLIDE_SPEED`.
3.  **Jump.** If `bufferMs` is positive and either `coyoteMs` is positive (first jump) or
    `jumpsUsed` is 1 (double jump): `vy` becomes `JUMP_IMPULSE` or `DOUBLE_JUMP_IMPULSE`,
    `jumpsUsed` increments, `grounded` is false, `rising` is true, `gliding` is false, `bufferMs`
    and `coyoteMs` become 0.
4.  **Jump cut.** If `rising`, `vy` is positive and `jumpHeld` is false, `vy` becomes
    `min(vy, JUMP_CUT_SPEED)` and `rising` becomes false.
5.  **Glide.** `gliding` is true while `jumpHeld`, `vy` is at or below 0, `jumpsUsed` is 2 and
    the owl is not grounded; it ends the step `jumpHeld` is released and resumes if held again.
6.  **Vertical.** Gliding: `vy` is `-night.glideFall`. Otherwise `vy` decreases by `GRAVITY` times
    the step, floored at `-MAX_FALL`. `rising` is false once `vy` is at or below 0.
7.  **Move and collide.** `x` advances by `vx` times the step and is clamped to `[OWL_W / 2,
    CLIMB_FIELD_W - OWL_W / 2]`. `y` advances by `vy` times the step. If `vy` is below 0 and some
    ledge has `x - OWL_W / 2 < ledge.x + ledge.w`, `x + OWL_W / 2 > ledge.x`, old `y >= ledge.y` and
    new `y < ledge.y`, the owl lands: `y = ledge.y`, `vy = 0`, `grounded = true`, `jumpsUsed = 0`,
    `gliding = false`. Otherwise, if grounded and no ledge is under the box at the new `x`, `grounded`
    becomes false (coyote time runs).
8.  **Band.** `band` becomes the highest index `i` (1-based) with `y >= bandLines[i - 1]`, never
    lower than before.

### Constants and starting values

| Constant | Value | Meaning |
| --- | --- | --- |
| `CLIMB_STEP_MS` | 1000/120 | one simulation step |
| `CLIMB_FIELD_W` | 480 | the field's width |
| `OWL_W`, `OWL_H` | 36, 44 | the collision box |
| `RUN_ACCEL` | 1800 | horizontal acceleration |
| `RUN_SPEED` | 220 | top horizontal speed |
| `GRAVITY` | 1400 | downward acceleration when not gliding |
| `MAX_FALL` | 900 | the fastest fall |
| `JUMP_IMPULSE` | 650 | upward speed on a jump (about 150 px of rise) |
| `JUMP_CUT_SPEED` | 200 | the cap on upward speed when the button is released early |
| `DOUBLE_JUMP_IMPULSE` | 520 | upward speed on the second press (about 95 px more) |
| `COYOTE_MS` | 80 | a jump still counts this long after leaving a ledge |
| `JUMP_BUFFER_MS` | 80 | a press this long before landing jumps on landing |
| `GLIDE_SPEED` | 180 | horizontal speed cap while gliding |
| `glideFall` | 90 / 130 / 170 | by tier (easy, medium, hard); the one night parameter |
| `CLIMB_CAMERA_ANCHOR` | 0.58 | the owl's height in the view |
| `CLIMB_SLACK_MS` | 1000 | the clock slack, as the arcade's |
| `CLIMB_FLOOR_MARGIN` | 0.2 | floors are the route's time less this fraction |
| `CLIMB_RUN_MAX_MS` | 3,600,000 | a run is forgotten after this |
| `CLIMB_ROW_KEEP_DAYS` | 30 | band rows older than this are swept |
| `BAND_COUNT` | 6 | bands; the sixth is the clouds |
| `BAND_FEATHERS` | 1, 1, 2, 2, 2, 2 | per band, ten in total |
| `BRISK_FEATHERS`, `CLIMB_BRISK_FACTOR` | 1, 1.2 | the brisk feather, and the window as a multiple of the high road's time |

### The layout `city-1` (second pass: two roads a storey)

`bandLines` = 900, 1800, 2700, 3600, 4500, 5400; `start` = `{x: 0, y: 0, w: 480}`. From band 2 up
each storey has two roads, so that the climb grows harder one idea at a time, offers a choice at
every storey, and pays for a calculated risk:

*   **The stairs** zigzag across the field on wide ledges in small steps, with a run between
    jumps. They forgive a short jump; in bands 5 and 6 they are the glide across the open field.
*   **The high road** goes straight up a column of narrow ledges (`road: 'high'`) in the gap the
    stairs leave. No run between jumps, but the full height of each one (a double jump needs its
    second press at the apex, a window of about ninety milliseconds either side) and a narrow
    landing every time. It is the faster way up a storey: 5.4, 5.0, 3.8, 4.3 and 4.0 seconds for
    bands 2 to 6 against the stairs' 8 to 9. Missing it lands on the stairs or the balcony below:
    the price is time, never the run.

The roads never share a column, so a jump straight up from the stairs never lands on the high
road. Ledge widths: the stairs 160 (band 1), 140 and 120 (band 2), 160 (3), 140 (4), 140 (5), 130
(6); the high road 100 (bands 2 and 3), 80 (4 and 5), 70 (6).

| Band | Teaches | Stairs (side, y, width) | High road (x, y, width) |
| --- | --- | --- | --- |
| 1 | the jump | L 128, R 256, L 384, R 512, L 640, R 768 (160 wide; 128 up, 80 across; single jumps) | none |
| 2 | narrower ledges, a step straight up | L 1028 (140), R 1156 (140), L 1284 (120), R 1412 at x 220 (120), L 1540 (120), L 1680 at x 30 (120, straight up) | x 380: 1040, 1180, 1320, 1460, 1600, 1740 (100 wide; 140 up, single jumps) |
| 3 | the double jump | L 1980, R 2160, L 2340, R 2520 (160 wide; 180 up, 160 across) | x 190: 2040, 2280, 2520 (100 wide; 240 up) |
| 4 | the double jump, narrower | L 2880, R 3060 at x 300, L 3240, R 3420 at x 300 (140 wide; 180 up, 160 across) | x 200: 2940, 3180, 3420 (80 wide; 240 up) |
| 5 | the glide | L 3800, R 4000 at x 340, L 4200, R 4400 at x 340 (140 wide; 200 up, 200 across; double jump and glide) | x 200: 3825, 4050, 4275 (80 wide; 225 up) |
| 6 | the glide, narrower | L 4700, R 4900 at x 330, L 5100, R 5300 at x 330 (130 wide; 200 up, 200 across) | x 205: 4725, 4950, 5175 (70 wide; 225 up) |

Fifty-nine platforms: the start, twenty-six stairs ledges, twenty-six high-road ledges and six
lines. `roadPlatforms(layout, road)` lists one road's platforms (the stairs' where a band has no
high road), and `routeOf` derives its moves: `U` (stand under the target and jump) when the target
spans the field or overlaps the ledge below, else toward a side; a single jump for 140 px or less
with at most 100 px across, a glide for more than 170 px across, a double jump otherwise.

### The brisk feather

`BRISK_FEATHERS` (1) more for a storey climbed within its brisk window: the high road's scripted
time through the band times `CLIMB_BRISK_FACTOR` (1.2), per band in `CLIMB_BRISK` (derived and
frozen by the test like the floors; 0 for band 1, which has no high road). The server judges it
from what it already keeps: the band's arrival against the band below's arrival (the start for
band 1), so a slow storey never costs the next one its bonus, and only the first band of an
`ascent` frame can be brisk (bands caught up in one frame were not seen arriving). The row's `due`
carries the brisk feather so the cap's `capped` reads right, the row records `brisk`, and the
answer carries `brisk` (how many bands earned it this frame). The screen says "· brisk!" on the
band line and "You reached the clouds, briskly!" on the card. Potential pay per run grows from ten
to fifteen feathers, still under the activities' shared cap of twenty-five.

### The scripted routes and the floors

`ROUTES['city-1']` holds both roads' moves. The test drives each through `stepClimb` under every
tier: hold `toward` until the owl's box edge is within 8 px of the current ledge's end, or for `U`
stand under the target (as near its middle as the ledge allows) and still; press jump (`single`),
press again at the apex (`double`), and hold jump from the second press until landing
(`double-glide`). It records the step at which `band` first reaches each value on each road. The
floors are the faster road's cumulative times less the margin, rounded down to 100 ms; the brisk
windows the high road's segment times, up to 100 ms.

Frozen values (the high road has no glide, so the tiers agree):

| Band | Stairs | High road | Floor | Brisk window |
| --- | --- | --- | --- | --- |
| 1 | 7,117 | 7,117 (the stairs) | 5,600 | none |
| 2 | 15,175 | 12,508 | 10,000 | 6,500 |
| 3 | 23,025 | 17,492 | 13,900 | 6,000 |
| 4 | 32,000 | 21,325 | 17,000 | 4,600 |
| 5 | 40,650 / 39,758 / 39,583 | 25,600 | 20,400 | 5,200 |
| 6 | 49,442 / 47,633 / 47,267 | 29,600 | 23,600 | 4,900 |

Times in ms (stairs by easy / medium / hard where the glide differs). Puzzles that need new rules
(moving panes, wind, a ledge that gives way) are a later pass; this one works within the eight
rules of the simulation.

### Art

Six segment pieces, pipeline kind `piece`, `with_2x`: `climb-column` 240 x 900, `climb-ledge-a`
160 x 40, `climb-ledge-b` 240 x 60, `climb-balcony` 480 x 120, `climb-cloud-cap` 480 x 220,
`climb-sky` 480 x 900. The flat pieces are no wider than four to one, the widest the image models
take within their size limits; the ledges' top surfaces are their logical top edges.

## Appendix B: the room `glass`

```text
id: 'glass', gated: true, mood: 'dusk',
size: { w: 2 * ROOM_W, h: ROOM_H },
background: 'glass',
backgrounds: [ { key: 'glass', x: 0, y: 0 },
               { key: 'glass-east', x: ROOM_W, y: 0 } ],
foregrounds: [],
walkable: [[
  { x: 0, y: 690 }, { x: 1500, y: 690 }, { x: 1520, y: 705 },
  { x: 2400, y: 705 }, { x: 2420, y: 690 }, { x: 3200, y: 690 },
  { x: 3200, y: 888 }, { x: 280, y: 888 }, { x: 250, y: 830 },
  { x: 170, y: 760 }, { x: 0, y: 760 },
]],
spawns: { default: { x: 330, y: 740 }, 'from-hub': { x: 330, y: 740 } },
doors: [
  { id: 'to-hub', rect: { x: 0, y: 600, w: 120, h: 220 },
    to: { room: 'hub', spawn: 'from-glass' }, marker: { x: 70, y: 580 } },
  { id: 'idol', rect: { x: 1150, y: 710, w: 220, h: 100 }, marker: { x: 1260, y: 760 } },
  { id: 'portal', rect: { x: 2785, y: 700, w: 200, h: 90 }, marker: { x: 2885, y: 640 } },
],
spots: [
  { x: 330, y: 860 }, { x: 560, y: 850 }, { x: 720, y: 760 }, { x: 880, y: 720 },
  { x: 1500, y: 860 }, { x: 1900, y: 800 }, { x: 2200, y: 860 }, { x: 3000, y: 860 },
],
```

`ANCHORS.glass` = `{ idol: { x: 1260, y: 520 }, portal: { x: 2885, y: 560 } }` (the portal moved east
to the foot of the window in the approved painting). The painting is
two tiles: the west screen holds the arch back to the hub and the idol; the east screen holds the
portal, a tall window of backlit glass whose foot is the spot.

--------------------------------------------------------------------------------

*Drafted with EGM*
