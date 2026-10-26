# The stained-glass climb

*   **Author:** the owner, with Claude Code
*   **Status:** Proposed
*   **Date:** 2026-10-26, revised the same day after the Goldfish review (five stages, eight
    reviewer runs; the reports live in the ignored `EGM/` working folder)

--------------------------------------------------------------------------------

## Overview

Owl Park opens one of the hub's two closed arches onto a third realm. Behind the arch is a shared
stained-glass room that works like the grove and the market. Inside it is a portal that starts a
solo climb: a platformer the visitor plays on their own device as their own owl, up a city of
backlit mosaic glass to a cloud line, with a jump, a double jump and a held-jump glide. During a
climb nothing but a handful of small frames crosses the wire: one to start, and one each time the
owl reaches a new height band. The room server banks each band, checks it against the least time
that band can honestly take, and pays feathers for it. A park moon makes some nights harder. One
server-side setting opens the realm, lights the portal and names a special night. Tap-to-walk, the
phone pad, the keyboard and the hop emote stay as they are everywhere else in the park.

### Terms

`docs/GLOSSARY.md` defines the park's words. The ones this document leans on, in one line each:

*   **Collector id (`cid`)**: the per-device token that owns an owl's feathers, items and progress.
*   **Park day**: the calendar day in America/New_York (`parkDay` in `packages/shared/src/parktime.ts`);
    park midnight is when it changes.
*   **Feathers and the cap**: the currency the activities pay; all games together pay at most
    `PLAY_FEATHERS_PER_DAY` = 25 a park day per collector (`packages/shared/src/activities.ts`).
*   **The three server objects**: Cloudflare Durable Objects. The room object holds rooms, sockets
    and movement (`apps/edge/src/RoomObject.ts`); the collections object holds every per-collector
    fact (`Collections.ts`); the overflow object holds the queue and the keepers' park settings
    (`Overflow.ts`).
*   **Keeper**: anyone holding `ADMIN_KEY`, who uses the admin pages. The owner decides and
    approves; a keeper operates.
*   **The local mode**: the zero-backend way to run the park in one browser; it runs the shared
    books in the page (`apps/park/src/collect/local.ts`).
*   **The HUD's `covered` state**: the full-screen modal the arcade uses, which hides the park's
    bottom bar (`apps/park/src/ui/hud.ts`).
*   **Tickets**: `OP-nnn` ids are rows on the Ticket Board (`docs/README.md`). `OP-069` is the
    screening that clears a realm's public name; until it does, this realm has only its id.

### The arcade's contract, which the climb extends

Each arcade game is played on the client as the visitor's owl. The room server starts a run with a
seed and `startedAt` from its own clock, receives one result frame, refuses it when the run took
less than `leastRunMs(result)` minus `RUN_SLACK_MS` (1,000 ms) or more than `RUN_MAX_MS`
(20 minutes), pays `runFeathers` by score band through `CollectionBook.play` under the cap, and
keeps one row per (day, game, collector) for the score wall (`packages/shared/src/arcade.ts`,
`arcadebook.ts`, `roomActivities.ts`). The climb keeps the seed, the server clock, the floor check
and the payout path, and changes four things: a run lasts up to an hour and lives in the
collections object, a result frame arrives per band rather than once, each band pays once a park
day, and there is no score wall.

## The Problem

The park promises four realms and has two. Both open realms are social rooms: places to stand
with other owls, talk in phrases, vote at an idol and do small tasks that pay feathers. Nothing
in the park asks a visitor for skill over more than a few seconds, nothing is vertical, and the
one skill game the park has, the arcade, is twenty seconds a run. The third realm's art style,
stained glass, suggests height and light, and the owner wants it to play that way: a climb with
a reward in the clouds.

The park cannot move like a platformer. Every room is a painted stage with walkable polygons. A
tap sends one destination and every client animates the same straight walk, which is why one
room server carries a hundred owls within the message budget the edge server was chosen for, and
why the server can clamp every walk against the same geometry the client uses. Gravity, held keys
and mid-air control do not fit that model, and streaming positions many times a second would
break the budget. The brainstorm considered replacing tap-to-walk across the park and rejected it
as a project about ten times this one (Alternative A).

The design keeps the two models apart. The shared stained-glass room is an ordinary room: the
same registry, geometry, doors, idol and caps as the other realms. The climb is a solo run on the
arcade's contract above, extended where the arcade did not need it: a run that lasts minutes and
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
*   **G3. Deterministic, responsive movement.** The simulation steps at a fixed 120 Hz
    (`CLIMB_STEP_MS` = 1000/120) and an input is reflected in the next step. It has a run with
    acceleration, a jump whose height depends on how long the button is held, coyote time (a jump
    still counts for 80 ms after leaving a ledge), a jump buffer (a press 80 ms before landing
    jumps on landing), a second press for a double jump, and a held jump that glides.
*   **G4. The glide is the safety net.** A missed jump costs height, never the run. The layout
    data satisfies three tested invariants: from any reachable airborne point a glide lands on a
    ledge; from every ledge a route up exists; once a band is reached the owl cannot fall below
    that band's floor.
*   **G5. A run that survives.** The collections object keeps the run (seed, night, `startedAt`,
    banked band) per collector, not per socket. A new socket resumes it. The visitor can stop at
    any time and keep every banked band. The server forgets a run `CLIMB_RUN_MAX_MS` (one hour)
    after it started.
*   **G6. An honest result, cheaply.** The server refuses a band that arrives sooner than
    `leastClimbMs(layout, tier, band)` less `CLIMB_SLACK_MS` (1,000 ms) after the run started. The
    layout, the physics constants and the floor table live together in `packages/shared`, and a
    unit test derives the floors from a scripted route, so a tuning change that invalidates a floor
    fails `pnpm check`. The floor proves only that enough time passed; a client that waits out the
    cloud floor at the portal and sends band 6 is accepted. That loss is bounded by the cap and one
    common item once, and the owner accepted it (decision 7). The server counts refused bands per
    collector so a keeper can look; the count catches broken clients, not cheats.
*   **G7. Payout under the existing cap.** Each band pays once a park day, under
    `PLAY_FEATHERS_PER_DAY`, on the day the band arrives. Reaching the clouds grants one common
    catalogue item the first time ever. The climb screen shows the cap and today's best band once
    the run has started; the server says why a payout was zero.
*   **G8. Every result is answerable.** One row per (collector, seed, band) with the verdict, the
    floor, the elapsed time, the feathers added and why any were zero; a resend returns the same
    row; a short run reference on the result card lets a keeper look the run up.
*   **G9. The moon and the special nights are data.** `parkMoon(day)` is a pure function of the
    park day; it gives a phase for display and a tier that sets one difficulty parameter. The night
    (tier or special) is pinned to the run when it starts. Special nights are named entries in the
    same shared table, selected by a key in the setting, never free-form content.
*   **G10. Closed by default, opened by the `realms` setting.** One field of the overflow object's
    park settings opens realms, lights the portal and names the special night. A keeper flips it
    from the capacity page; the room objects learn of a flip within a minute; a Worker rollback is
    the ordinary one.
*   **G11. Art within the pipeline and the phone budget.** A small set of reusable segment pieces
    through the Seedream pipeline, loaded while the climb scene is active and released after, within
    the arcade's per-file limits; the owner approves every image; neutral keys only.
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
*   No decision on the deferred flight ticket (`OP-084`) beyond naming the constants it must reuse
    or retire.
*   No internal realm name, other game or studio name, or owner detail anywhere; the public name
    waits on `OP-069`.

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
    together in shared code with a test, and refused bands are counted per collector.
8.  A run survives a dropped connection; it is keyed by collector in server storage.
9.  A climb ends at the clouds or when the visitor stops; the server forgets it after one hour.
10. The realm ships dark behind one server-side setting that covers open realms, the portal and the
    special night.
11. One row per result, idempotent on its key, with a finer refusal set.
12. The climb screen owns its controls, built on the park's joystick and keyboard modules.

The review changed how four of these are carried out, not what they decide: bands pay on the day
they arrive rather than the run's start day (K1 in the review report); the setting lives in the
overflow object rather than the vote ledger (M1); the first release has one layout and the moon
sets one parameter (M2); the result row is one upsert and the keeper's tools are the existing
grant route plus a lookup (M3).

## Open Questions

| Question | Default taken here | Who confirms |
| --- | --- | --- |
| Which arch opens | `closed-b` ("Hatching Soon", east); `closed-a` keeps its blockade | the owner |
| The third realm's place in the Realm Vote's fixed tie-break order; votes from the day the arch opens; the idol's art in this wave | third; yes; yes | the owner |
| The feathers per band and the visitor-facing band names | `BAND_FEATHERS` = 1, 1, 2, 2, 2, 2; "storey" one to five, then "the clouds" | the owner |
| The first-time item | a new common head wearable, `glass-circlet`, with no style set until the realm has furniture | the owner |
| The moon's epoch | `MOON_EPOCH_DAY` = 2026-12-01, the preview's opening, a full moon by definition | the owner |

## Critical User Journeys (CUJs)

### CUJ 1: A first climb on a phone, stopped partway

*   **Given**: `glass` is open and the portal is live in the `realms` setting. The visitor has a
    ticket and stands in the stained-glass room. It is an easy night (new moon tier). They have
    earned 4 of today's 25 feathers from games.
*   **When**: They walk to the portal spot and tap Interact ("Climb"). A card shows tonight's moon
    in one line and the time to park midnight, with a Start button. They tap Start. The climb screen
    opens over the room with its own stick on the left and jump button on the right, and its header
    shows "4 of 25 feathers from games today" and "best storey today: none". They run, jump, double
    jump, miss a gap, hold jump and glide down to a ledge two storeys lower, climb again, reach the
    third storey, then tap Stop.
*   **Then**: Each new storey sent one `ascent` frame and the server answered `ok`; the header
    counted up to "8 of 25". Stop closes the screen without a frame. The result card reads "Third
    storey. +4 feathers" with the run reference. The owl stands at the portal. A second climb tonight
    pays only storeys above the third. No move, emote or position frame was sent while the screen was
    up.

### CUJ 2: The connection drops mid-climb

*   **Given**: A run is open with storey 2 banked; the phone sleeps for four minutes; the idle
    reaper closes the socket.
*   **When**: The visitor wakes the phone. The page reconnects and says hello; the climb screen,
    still open on the page, sends `climb` again.
*   **Then**: The server answers with the same run (same seed, night and `startedAt`, `banked` 2,
    `resumed` true), whatever the portal setting says and wherever the owl stands; the climb
    continues from the page's own state. If the page itself was reloaded, `climb` is sent on the
    first hello and the screen reopens at storey 2's floor. If more than an hour has passed since
    the run started, the server answers `forgotten`, the card says so and that nothing was taken, and
    the next `climb` starts a new run.

### CUJ 3: Reaching the clouds for the first time, on a computer

*   **Given**: A visitor with the arrow keys and Space, on a full-moon night (the hard tier), has
    never reached the clouds.
*   **When**: They reach the cloud line.
*   **Then**: The server checks the time since the run started against the cloud band's floor for
    that tier, pays the remaining bands under the cap, finds no earlier band-6 row for this
    collector, grants `glass-circlet`, and answers with the item. The result card shows it in the
    collection's style with a line saying it is given once ever. A later climb to the clouds pays its
    bands and says the item was already given.

### CUJ 4: The cap is already reached

*   **Given**: The visitor earned 25 feathers from games today before entering the realm.
*   **When**: They start a climb.
*   **Then**: The header shows "25 of 25" and "nothing more from games until park midnight" with
    the time left. They may still climb. Each band is accepted and recorded with `why` =
    `capped`, so today's best storey still counts and the clouds still grant the item.

### CUJ 5: A keeper lights a special night, then turns the portal off

*   **Given**: A keeper is signed in to the capacity page. A special night exists in `NIGHTS`.
*   **When**: They set the special night key, and later, after a report of a broken layout, turn
    the portal off.
*   **Then**: Within a minute, new runs start under the special night; runs already open keep the
    night they started with. After the portal is off, the portal spot shows "Pardon Our Feathers",
    a `climb` with no open run is refused with `closed`, open runs resume and send bands until they
    are forgotten, and both flips are in the Workers log with who and when.

### CUJ 6: A visitor says they reached the clouds and got nothing

*   **Given**: A Feedback note quotes the run reference from the result card.
*   **When**: A keeper looks the reference up on the admin climb page.
*   **Then**: They see the run's night, `startedAt`, and for each band its arrival time, verdict,
    floor, elapsed time, feathers added and why any were zero, and whether band 6 was reached. If
    the item is missing they grant it through the existing grant route. A feathers grant does not
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
                                     no open run? needs: at the portal,
                                     portal live (from its in-memory
                                     `realms`); else resume
                                     | RPC climbStart(cid, specialKey)
                                     v
                                   collections object (Collections.ts)
                                     ClimbBook over climb_runs, climb_bands
                                     open run under an hour -> resume
                                     else new seed, night pinned, startedAt
    <------ act climb ok {seed, startedAt, night, tier, banked,
            remainingCap, bestBandToday, resumed}

  ClimbScene (shared simulation, 120 Hz) + climbScreen (own stick and jump)
    | each new band
    v
  act ascent {k: seed, band} -----------> room object: pass through
                                     | RPC climbBand(cid, seed, band)
                                     v
                                   collections object
                                     floors for every unpaid band up to `band`
                                     pay through CollectionBook.play under the cap
                                     band 6 first time: grant the item
                                     upsert climb_bands row, return it
    <------ act ascent ok {band, banked, added, feathers, total,
            why?, item?, ref}

  Stop / Escape: close the screen, no frame; the run stays open until forgotten

Worker (index.ts)                         overflow object (Overflow.ts)
  /ws/<room>: upgrade; the room object      park settings gain `realms`:
  turns a closed realm away with            {open, portal, night, at, by}
  CLOSE.REALM_CLOSED and its sign           POST /settings validates and logs
  /api/admin/climb?ref= (ADMIN_KEY)         pushes a notice to room objects;
                                            room objects also poll each minute
```

### The room

The stained-glass room is a `RoomDef` in `packages/shared/rooms/index.ts` with the id `glass`.
It is two screens wide and horizontal like the others; only the climb is vertical. It has a floor
polygon, spawns `default` and `from-hub`, a door back to the hub, an `idol` door for the Realm
Vote, a `portal` door without `to` (the arcade cabinet pattern: a spot that the client's
`interactions` table turns into an Interact action), and the new `mood` value `glass`. The hub's
`closed-b` arch gains `to: { room: 'glass', spawn: 'from-hub' }`, loses its `closedSign`, and its
floor polygon is extended through the arch with vertices named in the plan; `closed-a` keeps its
blockade. The hub gains a `from-glass` spawn. The realm joins `VOTABLE_REALMS` third, the Menu map
(public name from `OP-069`) and the collection log's room labels (which derive from `ROOMS`). The
room's tests are the existing ones: tiles cover the room, spawns stand on the floor, doors resolve,
and exactly one closed arch still shows an approved phrase.

### The simulation and the layout (shared)

`packages/shared/src/climb.ts` holds everything the page, the server and the tests must agree
on, with no platform code. Appendix A gives the starting values.

*   **Physics**: named constants for run acceleration and top speed, gravity, jump impulse, the
    jump cut, coyote time, the jump buffer, the double-jump impulse, the glide's fall and horizontal
    speeds, and the owl's collision box. `stepClimb(state, input, layout, night)` advances one fixed
    step from a held-state input `{left, right, jumpPressed, jumpHeld}` and is a pure function.
*   **The layout**: a list of ledge rectangles in field pixels, six band lines, the cloud line and
    the start ledge, about six screens tall, built from a small vocabulary of segment pieces (a glass
    column, two ledges, a balcony, a cloud cap, a sky) that the pipeline paints once.
*   **Nights**: `NIGHTS` maps a key to a layout id and the one tuned parameter (the glide's fall
    speed). The three regular keys are the moon's tiers; special nights are entries added later with
    their own layout. `parkMoon(day)` returns a phase 0 to 7 from a synthetic 28-day cycle starting
    at `MOON_EPOCH_DAY`; `moonTier(phase)` maps new and crescent to easy, quarter and gibbous to
    medium, full to hard, so difficulty rises to the full moon and falls back. `nightFor(day,
    special)` returns the special key when the setting names one that exists in `NIGHTS`, else the
    tier.
*   **Floors**: `leastClimbMs(layoutId, tier, band)` reads `CLIMB_FLOORS`, one row per band per
    tier. A unit test runs a scripted route through `stepClimb` under each tier and asserts each
    floor equals that route's time to the band less `CLIMB_FLOOR_MARGIN` (20 %), so a constant or
    layout change that moves a floor fails `pnpm check`. The script is the design's best known route;
    the margin and the stakes make that acceptable.
*   **Invariants, tested**: glide reach from sampled airborne points; a route up from every ledge;
    band floors solid from below; the start ledge on band 0.
*   **Pay**: `BAND_FEATHERS` (1, 1, 2, 2, 2, 2, ten for the clouds), `BAND_NAMES`, and the
    one-line results, all defaults for the owner's approval.

### The protocol and the run states

Two `act` kinds in `packages/shared/src/edge.ts`; `EDGE_PROTOCOL_VERSION` becomes 10. The
`welcome` frame gains `realms: {open: string[], portal: boolean, night: string | null}`.

`climb` (start or resume) carries only `r`. The server answers:

| Field | Type | Meaning |
| --- | --- | --- |
| `seed` | integer 0 to 2^32 - 1 | the run's key |
| `startedAt` | ms, the collections object's clock | for the result card only; never judged |
| `night` | key in `NIGHTS` | pinned at start |
| `tier` | `easy`, `medium`, `hard` | for the header |
| `banked` | 0 to 6 | highest band paid in this run |
| `remainingCap` | 0 to 25 | feathers from games left today, before this run's next band |
| `bestBandToday` | 0 to 6 | highest band paid today across runs |
| `resumed` | boolean | an open run was returned |

Refusals: `far` (no open run and not at the portal), `closed` (no open run and the portal is off),
`busy` (another socket of this collector holds the run's current session), `offline` (the
collections object did not answer).

`ascent` carries `k` (the seed) and `band` (1 to 6, validated with `isCount(band, BAND_COUNT)`).
The server answers `{band, banked, added, feathers, total, why?, item?, ref}` where `why` is one
of `capped`, `paid-today`, `below-first-band`, `item-already-given`; `item` is `{variant, first:
true}` on the first band 6; `ref` is the run reference. Refusals: `idle` (no open run, or another
seed), `too-fast` (a floor failed), `forgotten` (over an hour since the start), `offline`.

Run states, as the server sees them:

1.  **No run.** `climb` needs the owl at the portal and the portal live; it opens a run with a
    fresh seed, tonight's night and `startedAt` = now. Otherwise `far` or `closed`.
2.  **Open run, same session.** `ascent` pays every unpaid band up to `band`, each checked against
    its own floor; the first failing floor refuses the whole frame as `too-fast` and nothing is
    banked. A band at or below `banked` answers `paid-today` with that band's row. A resend of a
    band already recorded returns the recorded row; the book runs inside one object, so a resend
    cannot pay twice.
3.  **Open run, new socket.** `climb` returns the run with `resumed` true, whatever the portal
    setting and wherever the owl stands. If the run's previous socket is still open, `busy`.
4.  **Forgotten.** An hour after `startedAt`, `climb` starts a new run and `ascent` answers
    `forgotten`.

On the page: the climb screen sends `climb` on Start; on reconnect or reload it sends `climb` and
reopens at the banked band's floor when `resumed` is true; it resends an unanswered `ascent` once
with the next `ascent` or on reconnect; Stop and Escape close the screen and send nothing.

### The climb book (collections object)

Runs live in the collections object: it already holds every per-collector fact, its own clock
and SQL, and a run keyed by collector there survives any socket, room object or phone.
`ClimbBook` in `packages/shared/src/climbbook.ts` is platform-free like `ArcadeBook`, so the local
mode and the tests run it in the browser, over a `ClimbStore` with two tables:

*   `climb_runs`, one row per collector: `cid TEXT PRIMARY KEY, seed INTEGER, night TEXT,
    started_at INTEGER, banked INTEGER, session TEXT`.
*   `climb_bands`, one row per band: `cid TEXT, seed INTEGER, band INTEGER, arrived_at INTEGER,
    verdict TEXT, floor_ms INTEGER, elapsed_ms INTEGER, added INTEGER, why TEXT, night TEXT, ref
    TEXT, PRIMARY KEY (cid, seed, band)`, with an index on `ref`. Rows older than
    `CLIMB_ROW_KEEP_DAYS` (30) are swept on write.

`start(cid, special, now)` returns the open run when it is under an hour old, else opens one with
`nightFor(parkDay(now), special)`. `band(cid, seed, band, now)` applies the run states above, pays
through `CollectionBook.play(cid, feathers, null, now)` on the day the band arrives (a null event:
the climb does not count toward a daily task), derives "bands paid today" from the band rows,
grants `glass-circlet` with source `granted` when band 6 has no earlier `ok` row for this
collector, upserts the band row and returns it. The run reference is the first eight hex
characters of the collection log's `sha256` over `cid:seed`, stored in `ref`. Refused bands are
counted per collector from the rows. There is no counters table, no ascents table and no second
ledger.

The room object's part: on `climb`, when the book has no open run, check the owl stands at the
portal and that its in-memory `realms.portal` is true, then call `climbStart(cid, realms.night)`;
otherwise call it straight away; on `ascent`, pass through to `climbBand(cid, seed, band)`. No run
state lives on the socket attachment. The climber stays in the room at the portal as arcade
players stay at a cabinet.

### The page

*   `ClimbScene` renders the shared simulation: a portrait field 480 px wide like the arcade's,
    fitted and letterboxed, the camera following the owl anchored at `CLIMB_CAMERA_ANCHOR` (0.58 of
    the view height), segment pieces drawn from the layout, the owl in run, jump and spread poses.
    Its art keys have `kind: 'climb'` and load only while the scene is active.
*   The climb screen is a full-screen modal in the HUD's `covered` state that owns its input: a
    stick built with `createJoystick` on the left, a jump button on the right, keyboard by `code`
    through `attachKeyboard`'s held set with Space handed to the climb while it is up, released on
    blur and hidden. The room keeps `hud.isBlocking()` as its gate, so no tap, jump emote or key
    reaches it while the screen is up.
*   The start card, the header, hints (one verb per step, cleared by doing it, the device's
    glyphs), the result card with an item line and the run reference, and the moon line all use
    the HUD's existing card, hint and toast components. Calm motion turns off the glass pulse.
*   The local mode runs `ClimbBook` over a memory store with a snapshot and a storage key like the
    arcade's, with `realms` open and the portal live by default; `?night=<key>` pins the night in
    the local mode and the browser tests only.

### The `realms` setting (overflow object)

The overflow object already keeps keeper settings (`Settings` in `apps/edge/src/Overflow.ts`),
takes `POST /settings`, has the capacity page, is read by the Worker through `overflowState.ts`
with a short keep, pushes a notice to every room object on change, and is polled by the room
objects once a minute (`freshNotice`). `realms` becomes a field of those settings: `{open:
string[], portal: boolean, night: string | null, at: number, by: string}`, default `{open: [],
portal: false, night: null}`. `POST /settings` rejects an id not in `ROOMS` or a night not in
`NIGHTS` with 400 and logs every accepted flip with who and when. The room object keeps `realms` in
memory: a hello into a realm not in `open` is turned away with `CLOSE.REALM_CLOSED` and the sign,
and the client's close handler walks the owl back to the hub and shows the phrase; on a flip that
closes a realm, the room object sends the owls inside it to the hub spawn with the same phrase. The
`welcome` frame carries `realms` so the client draws the arch open or closed and the Menu map
agrees. The levers, fastest first: portal off, realm closed, Worker rollback.

## Alternatives Considered

### Alternative A: Platformer movement across the whole park

Replace tap-to-walk everywhere with a stick or keys, a jump, a double jump and a glide, and remap
every room's walkable space to the new physics.

*   **Pros**: One movement model; the climb is the park, not a mode.
*   **Cons**: Every room becomes a level to re-author and partly repaint; the server's geometry
    clamping and the one-destination `move` frame go away; held input means streamed positions
    (which breaks the message budget) or input events with a deterministic simulation for a
    hundred owls; it removes the premise in `docs/ARCHITECTURE.md` section 1.
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

*   **Pros**: Strongly themed; rare nights read as events.
*   **Cons**: Nothing is daily when the portal is shut most nights; a visitor whose one evening
    falls on the wrong phase never sees the realm's main feature; a full moon comes about every
    twenty-nine and a half days.
*   **Reason for Rejection**: The daily payout needs a nightly portal. The moon changes the climb
    instead.

### Alternative D: Verify runs by input-trace replay on the server

*   **Pros**: The only check that proves the claimed height was reached under the rules.
*   **Cons**: The physics must run inside the Durable Object per result; a five-minute trace is
    tens of kilobytes, over the frame limit, so it needs an HTTP route; every tuning change becomes
    a server deploy; it does not stop a scripted perfect run.
*   **Reason for Rejection**: The stakes are at most 25 feathers a day and one common item once.
    Time floors with a shared test cost little; the shared simulation keeps replay possible later
    without changing the wire shape.

### Alternative E: A short climb kept on the socket, as arcade runs are

*   **Pros**: No new server state; `startRun` and `endRun` carry over.
*   **Cons**: Caps the city's height and what a moon phase can add; on phones a lost connection
    during a run is the normal case, and "The park did not catch that run" after a real climb loses
    the visitor's work.
*   **Reason for Rejection**: A run in the collections object costs one table and makes band
    banking and resumption natural.

### Alternative F: The climb as a fourth arcade game

*   **Pros**: Fewest new types; about four non-test files.
*   **Cons**: `ArcadeGame` drives the score wall (one column per game, pushed to everyone in the
    arcade), `cabinetOf` assumes a cabinet, `startRun` refuses any room but the arcade, and the
    wall fields would be meaningless for a climb with no score; once-a-day band pay, the run
    lifetime and the first-time item do not fit `finish`.
*   **Reason for Rejection**: The climb gets its own `act` kinds and book. The arcade's pattern is
    reused as a pattern, not as a type.

### Alternative G: A per-visitor room for the duration of a run (deferred)

*   **Pros**: Frees a cap slot and stops minutes of fan-out to a client that renders none of it.
*   **Cons**: A room switch mid-activity with its own failure modes; the owl vanishes from the room
    beside the idol and other owls.
*   **Reason for Deferral**: The climber stays at the portal. With the run in the collections
    object the switch can be added later if the room object's CPU with a populated `glass` is
    measured above the budget in `docs/CAPACITY.md`.

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
*   **Reason for Rejection**: The glide makes a miss cost height by skill, and banked band floors
    bound the worst loss.

### Alternative K: The existing Halo as the reward, or a one-time halo

*   **Pros**: No new item.
*   **Cons**: An epic item from a daily skill game outpaces every other way to earn it; an owl may
    already own it; a one-time reward gives no reason to climb again.
*   **Reason for Rejection**: Daily feathers by band plus one new common item the first time. The
    halo stays a catalogue item.

## Risks and Mitigations

*   **The overflow object is unreachable.** The room object keeps the last `realms` it received
    and keeps serving; a freshly started room object with nothing received yet treats every realm
    as closed, which is the safe side. The Worker's keep serves the admin page from its last read.
*   **The collections object does not answer mid-run.** The room object answers `offline`; the
    client keeps the band and resends once with the next band or on reconnect; nothing is lost
    because the run is in storage.
*   **Two sockets on one collector.** A `climb` from a second socket while the run's session is
    still open answers `busy`; when the first socket closes, the second resumes.
*   **The room is full when a climber reconnects.** Resume does not need the room slot: `climb`
    is answered from the hub too; the climb screen reopens there and the owl walks back later.
*   **A deploy mid-run.** Sockets drop, the stale bundle's hello is refused with 4002, the page
    reloads once and `climb` resumes at the banked band; only the page's unbanked height is lost.
    A deploy that changes a layout gives it a new id, so open runs are judged by the layout they
    started under and `NIGHTS` keeps the old id until the hour is out.
*   **A night key removed from the bundle.** `nightFor` falls back to the moon's tier and logs
    once; `POST /settings` refuses unknown keys so the case arises only across a deploy.
*   **Abuse of the start timer.** A client that opens a run and waits out the cloud floor is
    accepted; the loss is bounded by the cap and one common item, stated in G6.
*   **A fifth populated room.** Four rooms at cap already overload one object on
    `ROOM_SHARDING=single` (`docs/CAPACITY.md`); before the arch opens, either `ROOM_SHARDING=room`
    or copies of rooms (`apps/edge/src/copies.ts`, built) for `glass`. The CAPACITY doc still marks
    copies PLANNED; a `TODO-DOCS` goes with the change.
*   **The Durable Object request budget.** Per climb: one `climb` and up to six `ascent` frames to
    the room object, and up to seven RPCs to the collections object, about fourteen requests. A
    thousand climbs a day is about fourteen thousand against the free plan's hundred thousand
    (`docs/PLAYBOOK.md` section 5), beside the park's existing load.
*   **Public data.** The layout and art ship in the bundle while the realm is dark, as everything
    in this repository does; the working name stays out of the data.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security and privacy.** No new secret; the admin route sits behind `ADMIN_KEY`. The raw
    collector id never leaves the collections object: the Workers log carries the run reference,
    which is a hash, and the admin lookup is by reference. Nothing from a setting becomes words or
    layout on a page. No internal realm name anywhere.
*   **Performance.** The climb adds nothing to fan-out; the walking in the new room is the cost
    (Risks). On the page, a 120 Hz simulation of one owl and a few dozen ledges, and segment pieces
    under the arcade's per-file limits, loaded while the scene is active.
*   **Rollout and rollback.** One deploy carries the protocol bump, the room data, the climb and
    the setting's default (closed, portal off). Opening is a `POST /settings`; closing is the same.
    A Worker rollback leaves the new tables in place (the playbook's rule). The deploy happens in a
    quiet hour; a climb in flight loses only its unbanked height.

--------------------------------------------------------------------------------

### Additional Resources

*   The EGM concepts brief and the five review reports (the ignored `EGM/` folder, not in git).
*   `docs/ARCHITECTURE.md` sections 1, 2, 4, 5, 6, 7 and 8; `docs/ACTIVITIES.md` (the arcade,
    feathers, the wire protocol); `docs/COLLECTIBLES.md`; `docs/CAPACITY.md`; `docs/PLAYBOOK.md`
    sections 2 and 5; `docs/ART-PIPELINE.md`; `docs/GLOSSARY.md`.
*   The arcade as the precedent: `packages/shared/src/arcade.ts`, `arcadebook.ts`,
    `roomActivities.ts`; `apps/park/src/game/ArcadeScene.ts`, `apps/park/src/game/arcade.ts`,
    `apps/park/src/arcade/field.ts`, `apps/park/src/arcade/paint.ts`,
    `apps/park/src/ui/arcadeScreen.ts`; `apps/edge/src/sqlScoreStore.ts`.
*   The settings precedent: `apps/edge/src/Overflow.ts`, `overflowState.ts`, `capacityPage.ts`.

### Future Improvements

*   **A per-visitor room for a run** (Alternative G).
*   **A feathers grant route, a collector view and climb counters**, when the first dispute needs
    them.
*   **Special-night layouts** behind the `NIGHTS` keys already reserved.
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

Five phases, each ending with `pnpm check` green and, where noted, `pnpm e2e`. Items are numbered
within their phase. Documentation under `docs/` is the doc agent's: `TODO-DOCS` comments mark the
places a doc must change, and one changelog line is appended when the ticket is Done.

### Phase 1: the shared simulation (`packages/shared`)

1.  **`src/climb.ts`** (new). The physics constants of Appendix A; the types `Ledge`, `Layout`,
    `Night`, `ClimbInput`, `ClimbState`; `stepClimb`; `LAYOUTS` with the one layout of Appendix A;
    `NIGHTS` with the three tier keys (and reserved keys for special nights, no layout yet);
    `parkMoon`, `moonTier`, `nightFor` live in `parktime.ts` (item 3); `BAND_FEATHERS`,
    `BAND_NAMES`, `BAND_LINES`, `CLIMB_FLOORS`, `leastClimbMs`, `plausibleBand`, `CLIMB_SLACK_MS`
    = 1000, `CLIMB_RUN_MAX_MS` = 3,600,000, `CLIMB_FLOOR_MARGIN` = 0.2, `CLIMB_STEP_MS` = 1000/120,
    `CLIMB_FIELD_W` = 480. `BAND_COUNT` = 6 is defined in `edge.ts` and re-exported here, so
    `edge.ts` does not import `climb.ts`.
2.  **`src/climb.test.ts`** (new). The floor test (a scripted route per tier through `stepClimb`;
    each floor equals the route's time less the margin); the three layout invariants; `plausibleBand`
    at the boundaries; every `NIGHTS` key with a layout points at an existing one; the band table
    sums to ten.
3.  **`src/parktime.ts`** (modify). `MOON_EPOCH_DAY` = `'2026-12-01'`, `MOON_CYCLE_DAYS` = 28,
    `parkMoon(day)` = `floor(((daysSince(epoch) mod 28) + 28) mod 28 / 3.5)`, `moonTier(phase)`,
    `nightFor(day, special)`; tests for fixed inputs in `src/activities.test.ts`'s sibling or a new
    `parktime.test.ts`.
4.  **`src/index.ts`** (modify). Export the new module.

### Phase 2: protocol, room data and the setting, realm dark

5.  **`src/edge.ts`** (modify). `EDGE_PROTOCOL_VERSION` 10 with the version comment; `BAND_COUNT`;
    `ActKind` gains `climb` and `ascent`; `ClientAct` gains `band` for `ascent`; `parseClientFrame`
    validates `band` with `isCount(band, BAND_COUNT)` and `k` as a seed; `ServerAct` gains the two
    answers and the refusals `closed`, `busy`, `too-fast`, `forgotten`; `ServerWelcome` gains
    `realms`; `CLOSE.REALM_CLOSED`.
6.  **`src/edge.test.ts`** (modify). Parse and reject cases for the two kinds; the hard-coded
    `v: 9` on line 12 becomes 10.
7.  **`src/room.ts`** (modify). The `mood` union gains `glass`.
8.  **`rooms/index.ts`** (modify). The `glass` `RoomDef`; `closed-b` gains `to` and loses its sign;
    the hub floor gains vertices through the arch at x 2505 to 2515, y 600 to 672 (the current
    polygon's points at the blockade front); the `from-glass` spawn.
9.  **`rooms/rooms.test.ts`** (modify). The existing invariants cover the room; one case asserts
    exactly one closed arch with an approved phrase.
10. **`src/collectibles.ts`** (modify). `glass-circlet`, common, head slot, no style.
11. **`apps/edge/src/Overflow.ts`**, **`overflowState.ts`**, **`capacityPage.ts`** (modify). The
    `realms` field with its default, validation against `ROOMS` and `NIGHTS`, the logged flip, the
    push on change; the three controls on the capacity page; the Worker-side read through the
    existing keep.
12. **`apps/edge/src/RoomObject.ts`** (modify). Keep `realms` in memory from the overflow notice
    and the poll; turn a hello into a closed realm away with `CLOSE.REALM_CLOSED` and the sign; send
    owls in a realm that closes to the hub spawn; put `realms` in `welcome`.
13. **`apps/edge/src/Room.ts`** (modify). `Room.join`'s welcome extras type gains `realms`.
14. **`apps/edge/test/copies.test.ts`** and **`RoomObject.test.ts`** (modify). A closed realm's hello
    is turned away with the code and the sign; `welcome` carries `realms`; the default is closed.
15. **`apps/park/src/net/edge.ts`** (modify). The close handler's `REALM_CLOSED` branch (walk to
    the hub, show the phrase); `realms` kept from `welcome`; `ActRefusal` gains the new reasons.
16. **`apps/park/src/game/RoomScene.ts`** and **`game/ambience.ts`** (modify). Draw `closed-b`
    open or closed from `realms`; `DOOR_TINTS` and ambience's own tint table gain `glass`; the
    `glass` mood and the idol piece.
17. **`apps/park/src/ui/menuTabs.ts`** (modify). `renderMap` takes `realms.open`; one placeholder
    entry becomes the realm with its public name.
18. **`apps/park/e2e/park.spec.ts`** (modify). The closed-doorway test walks to `closed-a`.
19. **`apps/edge/src/VoteLedger.ts`** (modify). `VOTABLE_REALMS` gains `glass` third.

`pnpm check` and `pnpm e2e` green with the realm dark.

### Phase 3: the climb book and the server path

20. **`packages/shared/src/climbbook.ts`** (new). `ClimbStore` interface: `openRun(cid): RunRow |
    null`, `putRun(row: RunRow)`, `upsertBand(row: BandRow)`, `bands(cid, seed): BandRow[]`,
    `paidBands(cid, day): number[]`, `byRef(ref): BandRow[]`, `refusedCount(cid): number`;
    `MemoryClimbStore` with `snapshot()` and `static from(unknown)`; `ClimbBook.start(cid, special,
    now)` and `band(cid, seed, band, now)` as the Technical Plan states; the run reference through
    an injected `hash(text): string`.
21. **`packages/shared/src/climbbook.test.ts`** (new). Start and resume; `busy`; forgotten after an
    hour; a band paid once a day across two runs; a frame for band 3 with banked 1 paying 2 and 3;
    the cap clipping a band with `why` = `capped`; a too-fast band refused and counted; the item
    granted once; a resend returning the row; a run across park midnight paying later bands into the
    new day.
22. **`apps/edge/src/sqlClimbStore.ts`** (new). The two `CREATE TABLE IF NOT EXISTS` statements of
    the Technical Plan, the index on `ref`, the 30-day sweep.
23. **`apps/edge/src/Collections.ts`** (modify). `ClimbBook` over `SqlClimbStore` with the
    collection log's `sha256`; RPCs `climbStart(cid, special)`, `climbBand(cid, seed, band)`,
    `climbLookup(ref)`; the item grant through the existing `acquired` path; a log line per refusal
    carrying the reference.
24. **`apps/edge/src/RoomObject.ts`** (modify). The `climb` and `ascent` cases in the `act` switch
    as the Technical Plan states; `no()` gains the new reasons.
25. **`apps/edge/src/index.ts`** (modify). `GET /api/admin/climb?ref=` behind `ADMIN_KEY`,
    returning the run and its band rows as JSON.
26. **`apps/edge/test/climb.test.ts`** (new). The room object's two cases over the real SQLite
    store (`test/sqlite.ts`): far, closed, start, resume on a new socket, busy, a band paid, a
    forgotten run; `RoomObject.test.ts`'s fake Collections stub grows the two RPCs.

### Phase 4: the page

27. **`apps/park/src/game/ClimbScene.ts`** (new). As the Technical Plan states; art keys with
    `kind: 'climb'`.
28. **`apps/park/src/game/climb.ts`** (new). The handler: the card, Start sending `climb`, the
    header, `ascent` per band with a single resend, resume on reconnect and reload, the result card,
    Stop and Escape, `?night=` in the local mode.
29. **`apps/park/src/ui/climbScreen.ts`** (new). The modal with its stick (`createJoystick` given
    the modal as parent and its own selector prefix), the jump button (`PAD_TARGET_PX` = 44), the
    held-state input, release on blur and hidden, the hints through `hud.setHints`.
30. **`apps/park/src/ui/keyboard.ts`** (modify). `attachKeyboard` gains an `owner` the climb sets;
    while set, Space calls the climb's jump instead of `actions.jump()`.
31. **`apps/park/src/ui/hud.ts`** (modify). `openClimb` and `closeClimb` on the `covered` state;
    `isBlocking()` includes the climb.
32. **`apps/park/src/game/RoomScene.ts`** (modify). The `interactions` entry for `portal`.
33. **`apps/park/src/game/art.ts`** and **`arcade/paint.ts`** (modify). The `climb` art kind and
    the segment piece specs; the key list loads them only while `ClimbScene` is active.
34. **`apps/park/src/main.ts`** (modify). `ClimbScene` in the scene list; `window.owlPark.climb()`
    beside `arcade()`.
35. **`apps/park/src/collect/local.ts`** (modify) and **`local.test.ts`**. `ClimbBook` over
    `MemoryClimbStore` with its storage key; `realms` open and the portal live.
36. **`apps/park/src/ui/itemIcon.ts`** and **`game/itemArt.ts`** (modify). `glass-circlet`.
37. **`apps/park/e2e/climb.spec.ts`** and **`climbPlay.ts`** (new); **`playwright.config.ts`**
    (modify: the `edge` project's regex gains `climb`). The spec opens the realm and the portal
    through `POST /settings` with the e2e admin key, pins `?night=easy` in the local project, and
    covers the card, a banked band, Stop, the result card, resume after a dropped socket under the
    `edge` project, and the portal off showing its phrase.

### Phase 5: art and words

38. **`tools/art/config/assets.json`** and **`tools/art/prompts.mjs`** (modify). Two room tiles,
    the idol piece, the segment pieces (`climb-column` 160 x 900, `climb-ledge-a` 160 x 32,
    `climb-ledge-b` 240 x 32, `climb-balcony` 320 x 64, `climb-cloud-cap` 480 x 220, `climb-sky`
    480 x 900, all `with_2x`), and the item, under neutral keys; the forbidden-word check runs in
    `generate.mjs`.
39. **`CLAUDE.md`** (modify). One line under the art rules naming the climb's segment pieces as
    art that needs the owner's pick.
40. **Words for approval.** The card, the header lines, the hints, the band names, the result lines,
    the forgotten-run line and the closed-portal phrase (`Pardon Our Feathers`, already approved).

### Not changed, on purpose

`apps/edge/src/Room.ts`'s `jumpEveryMs`; `apps/edge/wrangler.jsonc` (no new binding); `rooms.ts`
(`roomCap` already returns 40 for an unknown room); `activities.ts` and `book.ts` (`play` takes a
null event; no new `TaskKind` or `EarnSource`); `questCatalog.ts` (quests in `glass` are a Future
Improvement); `styles.ts` (no set until the realm has furniture); `collectLog.ts` (room labels
derive from `ROOMS`); `docs/` (the doc agent's; `TODO-DOCS` in `edge.ts`, `climb.ts`, `Overflow.ts`
and `index.ts`).

### Verification Plan

*   **Every phase**: `pnpm check` (typecheck with `wrangler types`, `vitest run` in all three
    packages, the client build).
*   **Phase 1**: `pnpm --filter @owl-park/shared test` runs `climb.test.ts` and the moon tests; the
    floor test is the gate on every later tuning change.
*   **Phase 2**: `edge.test.ts`, `rooms.test.ts`, `copies.test.ts`, `RoomObject.test.ts`;
    `pnpm e2e` with the realm dark (the closed-arch test).
*   **Phase 3**: `climbbook.test.ts`, `apps/edge/test/climb.test.ts`.
*   **Phase 4**: `local.test.ts`, `keyboard.test.ts`; `pnpm e2e` with `climb.spec.ts` under both
    projects.
*   **By hand before opening**: `pnpm dev:edge`; a climb on a phone with the tab backgrounded for
    five minutes and resumed; a climb across park midnight in the local mode with a shifted clock;
    the capacity page flipping the portal while a run is open; the five-room load test
    (`tools/load/run-steps.mjs`) on a throwaway copy, or `ROOM_SHARDING=room`.
*   **After opening**: the Workers log's refusal lines and the admin lookup; the room object's CPU
    with five populated rooms.

--------------------------------------------------------------------------------

## Appendix A: simulation starting values and the first layout

Starting values to tune in Phase 1; the floor test derives the floors from them. Pixels are field
pixels (480 wide); the vertical axis counts up from the start ledge at 0.

| Constant | Value | Meaning |
| --- | --- | --- |
| `CLIMB_STEP_MS` | 1000/120 | one simulation step |
| `RUN_ACCEL` | 1800 px/s^2 | horizontal acceleration while a direction is held |
| `RUN_SPEED` | 220 px/s | top horizontal speed |
| `GRAVITY` | 1400 px/s^2 | downward acceleration when not gliding |
| `JUMP_IMPULSE` | 650 px/s | upward speed on a jump (about 150 px of rise) |
| `JUMP_CUT_SPEED` | 200 px/s | upward speed is capped to this when the button is released early |
| `COYOTE_MS` | 80 | a jump still counts this long after leaving a ledge |
| `JUMP_BUFFER_MS` | 80 | a press this long before landing jumps on landing |
| `DOUBLE_JUMP_IMPULSE` | 520 px/s | upward speed on the second press (about 95 px more) |
| `GLIDE_FALL_SPEED` | 90 / 130 / 170 px/s | by tier (easy, medium, hard); the one night parameter |
| `GLIDE_SPEED` | 180 px/s | horizontal speed while gliding |
| `OWL_BOX` | 36 x 44 px | the collision box |
| `CLIMB_CAMERA_ANCHOR` | 0.58 | the owl's height in the view |
| `CLIMB_SLACK_MS` | 1000 | the arcade's clock slack |
| `CLIMB_FLOOR_MARGIN` | 0.2 | floors are the scripted route's time less this fraction |
| `CLIMB_RUN_MAX_MS` | 3,600,000 | a run is forgotten after this |
| `CLIMB_ROW_KEEP_DAYS` | 30 | band rows older than this are swept |

The first layout, `city-1`: six bands, band lines at y = 900, 1800, 2700, 3600, 4500 and the
cloud line at 5400; a floor piece under each band line spanning the field so a banked band cannot
be fallen below; the start ledge at y = 0 spanning the field; between band lines, ledges alternate
sides with a vertical gap of 120 to 140 px (one jump) in bands 1 and 2, 160 to 230 px (a double
jump) in bands 3 and 4, and 200 to 240 px with a glide crossing in bands 5 and 6. Ledges are
`climb-ledge-a` (160 wide) or `climb-ledge-b` (240 wide), with a `climb-balcony` at each band line.
The scripted route for the floor test holds right or left to the next ledge, jumps at the edge,
and double-jumps where the gap needs it; its time per band under each tier, less the margin, is
the floor.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM*
