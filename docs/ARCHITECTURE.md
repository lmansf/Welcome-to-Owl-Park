# Owl Park architecture

- Status: mixed; each section is tagged BUILT or PLANNED (OP-xxx)
- Verified against: branch claude/op-202-docs off main 01e9722 (2026-11-02)
- Code: apps/edge/src (the Worker's routes in apps/edge/src/routes), packages/shared/src, packages/shared/rooms, apps/park/src, apps/park/index.html, apps/park/public/_headers, apps/park-log, apps/edge/wrangler.jsonc, .github/workflows
- Tickets: OP-002, OP-010, OP-022, OP-038, OP-048, OP-051, OP-055, OP-059, OP-065, OP-067, OP-068, OP-071, OP-075, OP-077, OP-082, OP-083, OP-084, OP-098, OP-107, OP-108, OP-111, OP-113, OP-124, OP-126, OP-127, OP-129, OP-130, OP-136, OP-137, OP-138, OP-139, OP-140, OP-141, OP-142, OP-144, OP-148, OP-149, OP-150, OP-153, OP-155, OP-156, OP-162, OP-173, OP-180, OP-191, OP-192, OP-198, OP-201, OP-211; planned OP-024, OP-050, OP-052, OP-053, OP-063, OP-072, OP-076
- Related: docs/CAPACITY.md, docs/DEPLOY.md, docs/PLAYBOOK.md, docs/GLOSSARY.md

How to read this file: headings carry [BUILT] or [PLANNED (OP-xxx)]; inside a section, `PLANNED (OP-xxx)` marks
what does not exist on `main` yet. Grep `PLANNED` for everything unbuilt. Version 1 was presence only; the park now has quests, collectibles, a shop,
activities, nests, prewritten chat, the lobby and tickets, the home screen and the keepers' pages.
This document names no unreleased realm names and no reference products; the detailed
reverse-engineering notes behind it live in the team's internal drive, not in this public
repository. Where this file and a Done ticket or the code disagree, the Docs hat files a Finding
ticket rather than guessing (`docs/agents.md`).

Sections: 0 the repository · 1 what we replicate · 2 the decision · 3 components and cost ·
4 the wire protocol (with the frames of v9 to v14, flight and perches) · 5 room data (with the
room's fields, loading the park and sprites) · 6 scaling and capacity · 7 the Realm Vote ·
8 collectibles and quests · 9 the lobby, tickets and the home screen (with identity and accounts,
and the purchase path) · 10 feedback · 11 prewritten chat · 12 the fraud link (planned) ·
13 operations (with the Worker's routes, the front door, the rate limits and the park's analytics
log) · 14 from a ticket purchase to the hub (a diagram) · 15 open questions.

## 0. The repository

A pnpm monorepo (`pnpm-workspace.yaml`): `apps/`, `packages/` and `tools/`. Node 22 and pnpm 10.

| Package | What it is | Entry points |
| --- | --- | --- |
| `apps/park` (`@owl-park/park`) | The browser client: Vite + TypeScript + a slim Phaser 3 build (`src/engine/phaser.cjs`, below). Scenes, the owl, rooms, the HUD (DOM), the home screen, the transports, the collection service, the browser tests (`e2e/`) | `src/main.ts`; `pnpm dev`, `pnpm build`, `pnpm e2e` |
| `apps/edge` (`@owl-park/edge`) | The Cloudflare project: the Worker (`src/index.ts`, the front door, the rate limits and the crons; each route's handler in `src/routes/`, listed in `routes/table.ts`, OP-201; section 13), four Durable Objects (`RoomObject`, `VoteLedger`, `Collections`, `Overflow`), the ticket book, the store link, the keepers' pages under `/admin/*`, `wrangler.jsonc` | `pnpm dev:edge`, `pnpm deploy:edge`; `pnpm --filter @owl-park/edge exec wrangler <command>` |
| `apps/park-log` (`@owl-park/park-log`) | The park's analytics log (OP-107): a Supabase Edge Function, `owl-park-log`, in the owner's analytics project, and the SQL that makes its tables and views (`sql/`). Not part of the park's deploy (section 13) | `apps/park-log/README.md` |
| `apps/ig-connector` (`@owl-park/ig-connector`) | A small MCP server on its own Worker that publishes approved reels to the park's Instagram account and reads Insights (OP-168). Not part of the park | `apps/ig-connector/README.md` |
| `packages/shared` (`@owl-park/shared`) | Rules with no platform code, shared by the client and the server and unit-tested in Node: the wire protocol (`src/edge.ts`), geometry and walks, room data (`rooms/index.ts`), collectibles, quests, the shop, activities, nests, phrases, feedback limits | imported by both apps |
| `tools/` | `build-edge.mjs` (the client build for the room server, on any shell), `render-svg.mjs`, `load/` (the bot swarm and the stepped load test), `art/` (the Seedream pipeline, `docs/ART-PIPELINE.md`), `dev/` (debug scripts), `cloudflare-skills.sh` | `pnpm build:edge`, `pnpm load`, `pnpm art:*` |

The Worker serves the built client as static assets from `apps/park/dist` and runs the API, the
sockets and the keepers' pages first (`run_worker_first` in `wrangler.jsonc`). Checks before a push:
`pnpm check` (typecheck, unit tests, build) and `pnpm e2e`. The edge typecheck runs `wrangler
types` first; `apps/edge/worker-configuration.d.ts` is generated and ignored by git, so `Env`
bindings change in `wrangler.jsonc`, never by hand (`CLAUDE.md`). Deploys: `docs/DEPLOY.md`.

## 1. What we replicate from the classic tap-to-move room worlds

The 2000s browser worlds that Owl Park takes its feel from all shared one simple model,
and so does Owl Park:

| Mechanic | Classic model | Owl Park |
| --- | --- | --- |
| Rooms | A fixed-size painted stage per room with a hidden "block" layer marking where an avatar may not stand, a foreground layer drawn in front of avatars, and trigger zones that lead to other rooms | A room of one or more 1600 x 900 screens (the hub and the grove three, the market and the lobby two) with `walkable` polygons, optional foreground images, and `doors` (trigger rectangles) in `packages/shared/rooms` |
| Movement | Click a spot; the avatar walks there in a straight line at constant speed; the client sends only the destination and every other client animates the same walk itself | Tap; `resolveTarget` snaps the tap into the walkable area and stops at the first blocked sample; one `move` message carries the target; every client animates from (from, to, startedAt) with `positionAlongWalk`. A tap that a straight walk stops short of (by `WAY_SHORT_PX`, where the floor bends) is walked round the bend in legs (`wayAround`, `packages/shared/src/wayAround.ts`, OP-148): each leg is one ordinary `move`, set off as the one before ends, so the room server and the other pages see walks as always. The held keys and the thumbstick slide along the floor's edge instead (`steerTarget`). Jumping, the flap and the glide are a height above the floor plan (section 4, Flight and perches) |
| Depth | Avatars and props sorted by their y coordinate | `depth = y` for owls and set pieces; foreground always on top |
| Entering a room | Spawn near a named point with a little random scatter so avatars do not stack | Named `spawns`; the page's hello says where its owl is as the socket opens (`RoomHandlers.here`, `apps/park/src/net/transport.ts`; OP-138). The room server takes that spot when it is on a floor or a perch, out of an exit and within 240 px of the spawn (`resumeRadius`), or near where the owl left lately (section 4, client rules). Otherwise it scatters the arrival (door entry 60 px, map entry 220 px), first trying spots whose straight walk reaches the page's spot, so its copy of the owl can walk straight over (`scatter` in `apps/edge/src/Room.ts`) |
| Doors | Walking into a trigger zone changes room and places you at a spawn in the destination | `doors[].to = { room, spawn }`; closed doors show an approved sign instead. The owl comes out at the spawn shifted along the doorway back by the lane it walked in at (`laneThrough`, `packages/shared/src/doorways.ts`, OP-124), when both doorways run the same way; the room server keeps that point when it is on the floor, out of an exit and near the spawn. A door's `toTree` and `top` (section 5) change where it leads and at what height it is taken |
| Server | An authoritative room server per world with room caps (around 80 to 120), one connection per player, join/leave/move messages | One Durable Object per park (or per room) with caps, validation, rate limits and fan-out |

Deferred, exactly as the originals did it later: chat, names, mini-games. Emotes and inventories
arrived with the collectibles (section 8 and `docs/COLLECTIBLES.md`).

## 2. Decision: an authoritative room server at the edge

Three architectures were proposed and scored independently (cost at 20 / 200 / 2,000
concurrent visitors, time to a playable v1, operations burden, path to ticket gating,
movement feel, licensing):

1. **Serverless first**: Supabase Realtime as the transport (Presence + Broadcast), no server code.
   Lost on cost: Realtime bills one message per sender plus one per recipient, so a 20-owl room
   tapping normally uses ~4 million messages a month against a 2 million free quota, and 200
   concurrent is roughly $300 a month at the plan's 500 messages-per-second ceiling. Nothing is
   validated server-side.
2. **Classic Node WebSocket server** on a free host (Render, Fly, Oracle). Best game feel, but
   free hosts spin down or have no free tier any more, and someone must babysit a process.
3. **Edge room server**: one Cloudflare Worker serving the client as static assets and
   upgrading `/ws/<room>` to a WebSocket held by a Durable Object using the hibernation API.
   Incoming WebSocket messages are billed 20:1, outgoing messages are free, idle objects cost
   nothing, and the Workers free plan covers the first ~20 concurrent visitors; $5 a month
   covers hundreds. **Chosen.**

The client keeps a transport interface (`TransportKind` in `apps/park/src/config.ts`, picked with
`?transport=`) with two transports:

| Transport | Backend | Use |
| --- | --- | --- |
| `local` | none (BroadcastChannel between tabs) | development, demos on one device, tests |
| `edge` | the room server in `apps/edge` | the production path; authoritative, cheap at scale |

There is no Supabase transport (OP-150). The page holds no key to any database, and CI checks the
built page for any database client or key (`tools/security/bundle-check.mjs`).

## 3. Components and licences

| Component | Choice | Licence |
| --- | --- | --- |
| Client | Phaser 3.90 (a slim build of its source, `apps/park/src/engine/phaser.cjs`), Vite 8, TypeScript 5.9; matter.js 0.20 for the arcade's sling game only, fetched with that game | MIT / MIT / Apache-2.0 / MIT |
| Shared rules | `packages/shared`: protocol, geometry, walk maths, room data | MIT (this repo) |
| Room server | `apps/edge`: Worker + Durable Object; `workerd` runtime | code MIT; workerd Apache-2.0; the hosted service is proprietary |
| Static hosting | Workers static assets (free, unlimited) or GitHub Pages | service |
| Identity | An anonymous collector token per device, and an HMAC-signed guest "park pass" minted by the Worker (`apps/edge/src/pass.ts`); accounts without passwords on top (`apps/edge/src/accounts.ts`, `accountBook.ts`, OP-139); see "Identity" in section 9 | our code |
| Mail | Resend sends the accounts' magic links (`RESEND_API_KEY`, `MAIL_FROM`) | service |
| Busy nights | The `Overflow` Durable Object (SQLite, `apps/edge/src/Overflow.ts`): the line, the busy ribbon, copies of rooms, the realms switch and the ledge painter's drafts (sections 6 and 13) | our code |
| Collections | `Collections` Durable Object (SQLite) keyed by the collector token; rules in `packages/shared/src/book.ts` | our code |
| Tickets and votes | The ticket book and the Realm Vote ledger in the `VoteLedger` Durable Object (SQLite): `apps/edge/src/TicketBook.ts`, `Ledger.ts`; the opening switch beside them (`gateSwitch.ts`) | our code |
| The store | Shopify sells tickets and passes and keeps the buyer; the Worker signs in with a Dev Dashboard app's client credentials (`storeApi.ts`) and takes signed webhooks at `/api/store/webhook` (`storeHooks.ts`) | service |
| The fraud link | PLANNED (OP-052, OP-053, OP-072): the owner's fraud pipeline scores every paid ticket order before release (section 12) | our code / the owner's pipeline |
| Analytics log | The `owl-park-log` function (`apps/park-log`) in the owner's Supabase analytics project: anonymous rows about collecting, play and tickets (section 13) | our code / the owner's project |
| CI | GitHub Actions, Playwright | service / Apache-2.0 |

### Cost model (room server, assumptions: visitor-hours per day = 8 x peak; ~30 billed object requests per visitor-hour)

| | 20 peak | 200 peak | 2,000 peak |
| --- | --- | --- | --- |
| Durable Object requests per day | ~6k to 9k (6 to 9 % of the 100k free cap) | ~48k to 77k | ~0.5M to 0.75M |
| Object duration | one object, under the 13,000 GB-s per day free cap | one object, within free; on Paid well under the included 400k GB-s per month | sharded per room instance, ~2M to 6.5M GB-s per month |
| **Cloudflare bill** | **$0** | **$5** (Workers Paid) | **~$26 to $85 per month** |

The free plan fails closed at the daily cap (the park goes dark at 00:00 UTC rather than
degrading), so the runbook is: set a usage alert at 50 % and buy Workers Paid ($5) before
the first promoted weekend.

## 4. Wire protocol v15 (`packages/shared/src/edge.ts`)

`EDGE_PROTOCOL_VERSION` is 15. Its doc comment lists what each version added: 9 the arcade, 10 the
stained-glass climb and the realms switch, 11 owls asleep, 12 flight, 13 travel from the map, 14 owls
standing on perches, 15 spectators. A page whose version differs is a stale bundle and reloads. The
frames below are v15's; "What v9 to v14 added" and "Flight and perches" describe those versions'
frames and rules, and "Spectators" v15's.

One WebSocket per visitor to `wss://<host>/ws/<room>?pass=<park pass>`. Every frame is one
JSON object of at most 1 KiB, except the literal heartbeat text frame `hb`, which the
Durable Object answers without waking. Coordinates are integers in room space. All timestamps
are server milliseconds; clients never put their own clock on the wire.

Client to server: `hello` (once, within 5 s; look, optional spawn name, where the owl is as the
socket opens, `via: 'travel'` for travel from the map, and a keeper's token, `keeper`, OP-156),
`move` (target and a per-connection `seq`), `look` (new colours, species and worn items), `rest`
(asleep or awake, v11), `air` (the owl's air state, v12 and v14), `emote`
(an owned emote's id, or `jump`, the hop every owl has, OP-082), `say` (a prewritten phrase's number), `bye`, and the quest requests, each with a request number `r`: `quests`, `talk`,
`accept`, `abandon`, `handin`, `use` (an interactable) and `gather` (a quest item); and `act` for
the activities (light a lantern, cast and reel, the robot owl's copy game, today's tasks), the
arcade (`run`, `record`, `score`, v9) and the climb (`climb`, `ascent`, v10); and for
the nests `street` (on the street: the visitor's own nest and five other owls' open ones) and
`nest` (in its own nest, the owner puts a piece in a spot, takes one away, or opens or closes it),
and `admit` (a spectator's new admitted pass, with a request number `r`; v15).

Server to client: `welcome` (your id and position, every owl in the room with any walk in
progress, whether it is asleep and its air state, server `now`, room cap, park counts, the copy
of the room, the line's entry and the busy ribbon's words (OP-075), and the realms switch), `enter`,
`move` (validated walk, sent to everyone including the sender; only the sender's copy carries `seq`,
which is the acknowledgement), `look`, `leave`, `rest` and `air` (another owl's), `counts`, `full`,
`emote` and `say` (to everyone else in the room), `notice` (the busy ribbon came on, changed or went
off), `realms` (the realms switch changed), `restart` (the nightly restart's words, then close 4016,
OP-181), `wall` (the arcade's score wall), and
for quests `quests` (the board, as an answer or a push), `handin`, `useResult`, `refused`, plus
`objects` and `used` for shared interactables such as leaf piles (see `docs/QUESTS.md`), and for
the activities `act` (the answer), `lanterns`, `quiz`, `paid` and `tasks` (see
`docs/ACTIVITIES.md`), and for the nests `street` (the answer), `nest` (a nest as it stands: to a
newcomer after its welcome, to everyone inside when its owner changes it, and as the answer to the
change) and `closed` (why `closed` or `gone`: a nest turned the visitor away or closed with it
inside, close 4011 follows; why `realm`: a gated room is shut, with its approved `sign`, close 4013;
why `gate`: travel into the park before the owl walked through the front gate, close 4015), and
`admitted` (the answer to `admit`; v15).

Close codes (`CLOSE` in `packages/shared/src/edge.ts`): 4001 bad pass, 4002 bad protocol, 4003 rate
limited, 4004 not admitted, 4005 replaced by a newer session, 4010 room full, 4011 a nest closed,
4012 queued behind the line (OP-075), 4013 a realm closed, 4014 the owl moved to another screen
(OP-139), 4015 not through the gate (OP-130), 4016 the nightly restart (OP-181), 1009 a frame too
large.

Server rules: moves are clamped with the same `resolveTarget` the client uses, so echoes
normally match the client's prediction; a walk in progress is continued from its current
point when redirected; moves use a token bucket (burst 5, refill 2 per second) and repeated
excess closes the socket (4003); more than 40 frames in 5 s closes it; a second session for
the same visitor replaces the first (4005); full rooms answer `full` then close (4010);
idle sockets (no heartbeat for 90 s) are reaped by a one-minute alarm; at most 8 sockets per
client address per object (`MAX_SOCKETS_PER_IP` in `wrangler.jsonc`; the default in
`apps/edge/src/RoomObject.ts`). Quests and collectibles: talks, uses and hand-ins count only within reach
of the owl's position on the server clock (plus 40 px of slack), a quest item only within 56 px,
and one quest request runs at a time per visitor; one use per 1.2 s; worn items the visitor's
collection does not hold are dropped from a look before it is broadcast; emotes must be owned and
are limited to one per 1.5 s, and the hop (`jump`, no collection asked) to one per 480 ms apart
from them (`jumpEveryMs`); a phrase must be one of the list's, one per 3 s per owl (any other
number is dropped, and a `say` frame with words in it closes the socket as malformed); quest,
emote and phrase frames count toward the frame limit. Nests: a nest's
room is `nest-<nestId>`, the id random and never taken from the collector; its hello waits for the
collections object (later frames wait behind it), a closed nest lets in only its owner, its owner
gets in however full it is (12 others), only its owner changes it (one change per 250 ms), and
closing it sends every visitor out. No frame carries a collector id, and counts sum all the nests
under one `nests` key.

A page's word is never an owl's place for the others (OP-149). A walk is a target, walked from
where the room has the owl at walking pace, and the others are told the room's walk. What a page
can still ask for that the room will not take as asked is a `PositionRejection` (`apps/edge/src/Room.ts`):
`room`, a walk to a point outside the room altogether, dropped and struck like a burst of moves;
`floor`, a walk to a point on no floor, walked as far as the floor goes; `perch`, standing at a
perch's height with no perch of that height under the owl or within `perchReachPx` (32 px) of its
walk, dropped; `arrival`, a hello from a spot the room will not let the owl in at, which comes in
by the spawn. The room object logs them as `position_rejected` (`docs/LOGGING.md`).

Client rules: the clock offset is set from `welcome` and refined with a min-filter over
later `move` frames; remote owls are drawn 100 ms behind server time so jitter never shows;
the local owl walks immediately on the tap and is corrected only if the echo differs by more
than 2 px; reconnects back off from 0.5 s to 8 s; a stale bundle (protocol mismatch) reloads
itself, once until a room welcomes it again.

- A page joins a room as the room's art starts to load (OP-129). What the room says meanwhile waits
  in order, and the page acts on it once the scene is built, in the order it was said
  (`RoomScene.join` in `apps/park/src/game/RoomScene.ts`).
- A welcome never moves the local owl (OP-138, `catchUpRoom`). An owl still standing where it came
  in walks over to the room's spot when that is a step aside (`STEP_ASIDE_PX`, 240 px). Otherwise it
  stays where its visitor put it, walking on where it was going, and the room is told, so the room's
  copy walks over to it. Only when the room's copy cannot walk straight over (a wall, a plinth or a
  gap between) is the owl moved to the room's spot, faded in there as an owl arriving is.
- A page back from a dropped connection resumes as far from where it left as its owl could have
  walked since: the room takes a hello's spot within `resumeRadius` (240 px) plus the walk's pace
  times the time away of where the owl left, for `leaverMemoryMs` (120 s) after it left
  (`Room.join`). Standing on a perch or up in the air, the page tells the room its air state once
  the room's copy is on its way over.

Everything about a visitor that must survive hibernation (id, look, position, walk, collector id,
and in a nest whether it is the owner's) is kept in the socket attachment, so an object that was
evicted rebuilds every room, nests included, from its sockets. Used-up leaf piles, the hub's
lantern beam and the last stage quiz round paid are kept in the object's storage as well, so an
evicted object brings them back; while owls are in the hub, the alarm also wakes the object when a
quiz question closes.

### What v9 to v14 added

- **v9, the arcade** (C40, OP-038, OP-059, OP-137; `packages/shared/src/arcade.ts`,
  `arcadebook.ts`). The arcade's three cabinets (`CABINETS`: `crossing`, `flight` and `sling`) are
  all live. `act` `run` with the game (`g`), standing at its cabinet, starts a run and is answered
  with its seed and `startedAt`. A run is kept by its collector in the collections object (the
  `arcade_runs` table, `apps/edge/src/sqlScoreStore.ts`), not on the socket, so it outlasts a dropped
  connection. Past the owl's best, the page sends `act` `record` with the score so far (`s`, the run's
  seed in `k`, and for the sling game its shots in `n`), at most once a second (`RECORD_EVERY_MS` in
  `apps/park/src/game/arcade.ts`). The room keeps it as the owl's best and shows it on the wall,
  paying nothing, so a run cut short keeps its best. `act` `score` ends the run: the room checks the
  score against the time the run took on the server clock (`plausibleRun`; a run lasts at most
  `RUN_MAX_MS`, 20 minutes) and pays `runFeathers` (one feather for each of the game's six bands the
  score reaches) and, once a park day per game, `DAY_BEST_FEATHERS` (3) for the first run that beats
  the day's best on the wall, under the activities' shared daily cap. A new best and the day's best
  are judged against the standings as the run started. A round counts for the task "Play a round in
  the arcade" (`ARCADE_TASK`). The `wall` frame carries today's best five per game (`WALL_SIZE`),
  portraits and scores, no names (`ArcadeBook` over the `arcade_scores` table): every column and the
  owl's own bests to a newcomer in the arcade, and a column to everyone else there when a run changes
  it. The page's side is `apps/park/src/arcade/` (each game's rules), `game/arcade.ts` (the cabinets
  and the wall in the room) and `game/ArcadeScene.ts` (the game drawn over the room).
- **v10, the stained-glass climb and the realms switch** (`designs/the-stained-glass-climb.md`;
  `packages/shared/src/climb.ts`, `climbbook.ts`). `act` `climb`, standing at the `portal` spot of
  the `glass` room, starts or resumes the owl's run and is answered with its seed, the night and its
  tier, the band banked, what the daily cap leaves and the best band today. The run lives in the
  collections object, keyed by the collector, and is forgotten an hour after it started
  (`CLIMB_RUN_MAX_MS`). `act` `ascent` names the band reached (1 to `BAND_COUNT`, 6, with the run's
  seed in `k`): every band above the banked one up to it is checked against its floor, paid once a
  park day under the shared cap, and kept; a band climbed briskly pays `BRISK_FEATHERS` on top, and
  the clouds grant the realm's item the first time ever. The realms switch (`RealmsSettings` in
  `packages/shared/src/overflow.ts`, kept by the overflow object and set on `/admin/capacity`) says
  which gated rooms are open (`open`), whether the climb's portal is live and the keepers' special
  night. A room with `gated: true` is shut unless its id is in `open` (`realmShut`): a hello there is
  answered `closed` with why `realm` and the room's approved sign, then close 4013, and owls inside a
  room that closes are sent out the same way. The switch rides on every `welcome` and goes out as a
  `realms` frame whenever it changes. A tree room is also open while the tree takes a share of new
  arrivals (`tree`, OP-156), and a keeper's token in the hello (`keeper`) lets that page's owl into a
  gated tree room while it is dark.
- **v11, owls asleep** (OP-126). A page whose visitor does nothing for a while (no key, touch,
  click or scroll, no walk and no stick; `sleepAfterMs`, 45 s, in `apps/park/src/config.ts`) sends
  `rest` with `asleep: true`, and anything its visitor does sends `asleep: false`. The room keeps it
  on the owl (`asleep` in its snapshot) and tells the others with `rest`. Asleep `awayAskMs` (10
  minutes) anywhere but its own nest, the page asks "Still here?"; with no answer in `awayAnswerMs`
  (60 s) the owl leaves the room, freeing its place. Never during a climb, a game, the turnstiles or
  decorating.
- **v12, flight** and **v14, perches** (OP-084): the `air` frame both ways, below.
- **v13, travel from the map** (OP-130; `packages/shared/src/travel.ts`). The Menu's Map tab travels
  the owl, its button held, to a place it has walked into (its own nest always), landing where
  walking in would have (`TRAVEL_LANDINGS`). Its hello says `via: 'travel'`. Into the park proper only
  once the owl has walked through the front gate since it was last outside: the room server asks the
  collections object, and turns any other travel in away with `closed` why `gate`, then close 4015;
  the page then offers the gate. Should the collections object not answer, the owl is let in. The
  travel book (`apps/edge/src/travelBook.ts`, in the `Collections` object's SQLite) keeps, per
  collector, the places walked into (`travel_places`) and whether it is through the gate
  (`travel_gate`): every room object tells it each room an owl joins, and `GET /api/travel` (with the
  pass) answers the page's map `{places, gate}`. Going home, walking out and every new visit put the
  owl outside again.

### Flight and perches (OP-084, OP-149)

Flight (`packages/shared/src/flight.ts`) is the climb's physics in room pixels, with a glide added:
Jump, a second flap in the air, and Jump held on the way down to glide (`GLIDE_SLOPE`, one down for
three along). An owl's place in the room stays its spot on the floor plan; flight is a height above
it, so doorways, spots and walks are as before.

- **The air state** (`Air`): the height above the floor (`z`), the speed up (`vz`), whether the owl
  is on the ground, in the air or gliding (`s`), and the flaps left (`f`). Movement is state, not
  events: the page sends `air` only when the state changes (off the ground, a flap, the cut, a glide
  begun or ended, a landing on a perch; `airChanged`). A landing on the floor is never sent: every
  page reckons it.
- **Other pages** carry an owl on from its last state with the same step (`carryOn`), from the
  server time the room stamped on it (`at`), so all draw the same arc. A newcomer gets each owl's
  last air state in its snapshot, until it has come down to the floor.
- **The room server's checks** (`air` in `apps/edge/src/Room.ts`): a token bucket of its own
  (`AIR_BURST`, 8, refilled at `AIR_REFILL_PER_S`, 4 a second); air past it is dropped quietly, and
  only that excess counts towards the frame limit. `checkAir` drops a state of the wrong shape, out of
  range, or higher than the room's highest perch top plus `MAX_RISE`. On the ground it must be at a
  height an owl can stand at there (the floor or a perch's top), and above the floor only where a
  perch of that height is under the owl or within `perchReachPx` of its walk (the `perch` rejection).
  The room never closes a socket over air. Nothing about flight is logged.
- **Perches** (`packages/shared/src/perches.ts`; a room's `perches`): each an `area` on the floor
  plan and a `top`, its height in room pixels (at most `MAX_PERCH_TOP`, 540). A `solid` perch is a
  wall to an owl below its top; one that is not is walked under and jumped up through. The ground
  under an owl is the top of the highest perch at or a little above its height there (within
  `PERCH_SLACK`, 4 px), else the floor (`groundAt`). Walking at a height is walking as before, on the
  footing for that height (`footing`): the floor and the tops at or below the owl, less the solid
  perches it is under. Only the owl's own page knows what was under it, so a landing on a perch is
  told to the room. A tap on a perch's drawn top walks to its spot on the plan (`tapGoal`); walking
  off its edge comes down.
- **Things up on perches** (`Raised`, a `top`: a quest's hiding spot, a quest item put there, a leaf
  pile) are drawn that high and reached only from that perch, and a thing on the floor only from the
  floor (`sameLevel`); the room server checks talks, uses and pickups the same way.

### Spectators (v15, OP-191) [BUILT, the room server and the page; on]

A spectator is an owl past the turnstiles without a ticket that works. The Worker sends
every socket to its room object with `X-Visitor-Kind: visitor` or `spectator`, after deleting any
copy the page sent (`/ws` in `apps/edge/src/routes/rooms.ts`; `spectating` in `apps/edge/src/gate.ts`).
The room object keeps the kind in the socket attachment (`spec`), so it survives hibernation.
Default-deny: inside the park, a socket the Worker did not call a visitor is a spectator
(`spectatorSocket` in `apps/edge/src/RoomObject.ts`); in the lobby, the street and the nests
nobody is one. A spectator's `welcome` says `spectator: true`. It walks, emotes, says phrases, flies
and plays every game, and earns nothing:

- Every award a game pays goes through `earnFor` in `RoomObject.ts`. A spectator gets 0 feathers,
  its balance as it stands and `practice: true` on the answer (`act` for fishing and the copy game,
  `paid` for the beam and the quiz). No task moves.
- The lantern beam counts a spectator among its helpers, so everyone's share is as big as the
  owls who lit it; only ticket holders are paid. The quiz pays only ticket holders in the right
  zone; the `quiz` frame's winners name everyone who stood there.
- The arcade's and the climb's runs are practice runs (`practice` on the run row in
  `ArcadeBook` and `ClimbBook`): a practice run's record and score answer with the wall as it
  stands and `practice: true`, keep nothing on the wall or in the owl's bests, and pay nothing; a
  practice climb's bands answer `added: 0`, keep no band rows and grant no item. A run started as a
  spectator stays practice after a ticket. A ticket holder's climb start drops an open practice run.
- The quests, the NPC owls, the quest items and today's tasks answer `refused` (or `act` with
  `ok: false`) with reason `spectator`. A spectator's arrivals and emotes count for no quest.
- The leaf piles, the stalls and the moonbeam are open to a spectator, checked for reach and the
  cooldown as anyone's (OP-243): a pile it flops is gone for everyone (`used`), as after anyone's
  flop, and the answer is `useResult` with 0 feathers, `total: -1` and `practice: true`. The
  collections object is never asked, so no feather, quest step or task comes of it.
- A spectator's look shows no Realm Vote pledge, and is otherwise drawn as anyone's: nothing marks
  an owl as a spectator to the others (OP-243). Every collector holds `STARTER_PACK`
  (`packages/shared/src/collectibles.ts`): the Hoot and Flap emotes, Sparkle, and a Beanie, Round
  Glasses and Knit Scarf in their original colours; a collector made before a piece was added gets it
  the next time its collection is read (`CollectionBook`), as with the presents.
- A room lets a spectator in while it holds fewer owls than its cap times `SPECTATOR_SHARE`
  (`spectatorLimit` in `apps/edge/src/rooms.ts`); past that a spectator gets `full` with
  `spectators: true`. Ticket holders come in up to the full cap.
- `admit` with a pass the turnstiles gave this owl since its socket opened (admitted, signed, the
  same visitor id and collector, `iat` not before the socket's `joinedAt`) makes the socket a full
  visitor in place and counts its arrival; anything else answers `admitted` with `ok: false`.
  A visitor's `admit` answers `ok: true` and changes nothing.

The page's half (`apps/park/src/ui/spectator.ts`, its words and choices, unit-tested in
`spectator.test.ts`; `game/RoomScene.ts`): the welcome's `spectator` is kept in the game's registry
(`spectator`) and in `hud.setSpectator`, which shows the "Just looking" badge (CSS only) with its
Get a Day Ticket button. Every Get a Day Ticket opens the turnstiles' own sale (`sellDayTicket`, the
card before the store then checkout, OP-180) with a line above it. Locked on the page as well as on
the server: no NPC marks or quest items are drawn, talking to an NPC owl (the feather shop's keeper
and the gift included), the gift shop's door and the Quests tab sell a Day Ticket instead, and the
idol says the vote line, then the card. Leaf piles, stalls and the moonbeam play as anyone's
(OP-243); a `practice` flop turns up nothing, and the first one on the page toasts once that a Day
Ticket turns up feathers (`createOnceHint`), with no card. A `refused` with reason `spectator`
opens the card too. The arcade's and the climb's result cards for a practice run say what the run
would have earned (worked out on the page with `runFeathers` and `BAND_FEATHERS`, without the
day's-best or brisk bonus) over Get a Day Ticket and Play again; fishing, the copy game, the quiz
and the beam toast the game's line with what it would have earned, then open the card at most once
every five minutes for the page (`createOfferPacer`). `full` with `spectators: true` says the room
is busy and offers the card. A ticket that lands while the owl is a spectator inside is scanned
where the owl stands, then sent to the room as `admit` (`RoomConnection.admit`), falling back to
`renew` (a new socket on the admitted pass); `onSpectator(false)` takes the badge off, draws the
quest marks and items, refreshes the board and the collection, and says "Your Day Ticket is in. Have
fun!", with no reload. Tests: `apps/park/e2e/spectator.spec.ts`, with SPECTATORS on for the browser
tests' room server (`playwright.config.ts`).

## 5. Room data (`packages/shared/rooms/index.ts`)

Rooms are data shared by the client and the server: a `size` (one screen is 1600 x 900; a room
may be up to 6400 x 1800, `ROOM_MAX_W` x `ROOM_MAX_H`, and the camera follows the owl across it),
`walkable` polygons, `spawns`, `doors`
(open with `to`, or closed with an approved `closedSign`), `mood` for ambience, `spots` where
quests hide their items, and anchors for large set pieces. NPC owls and interactables are placed
in `npcs.ts` and `interactables.ts`; a unit test keeps them on the floor and out of doorways. A one-screen room names its painting
in `background` (and its overlay in `foreground`); a bigger room is painted in tiles of one screen
each, listed in `backgrounds` and `foregrounds` with their offsets, which must cover the room
exactly (unit-tested). The client registers every tile as room art, loads a room's tiles together
and keeps them within one memory budget: a phone gets what a one-screen room costs today, so a
room whose 2x tiles would not fit loads its 1x copies. Open doorways and interactive spots the
camera cannot see get a chip at the screen's edge pointing to them; tapping it walks there. A
walk goes through a doorway only when it ends in it or at its arch (or the held keys steer into
it): walking across a wide room, or up to something to do, passes doorways by. The page takes a
doorway from where the owl's step since its last look came into it (`entryPoint`,
`packages/shared/src/doorways.ts`, OP-124), a step right across it included, so a slow frame neither
carries the owl a turnstile along nor past a narrow doorway. Held keys against an edge of the floor
slide along it (`steerTarget`). Positions stored
for later (the quest items a visitor has been handed) follow the room data's `ROOM_LAYOUT`: when
a room grows on the west, the room server and the browser move them once. A door without `to` can be an
interactive spot (the gift shop, the idol): an entry in `interactions` in
`apps/park/src/game/RoomScene.ts` gives it a button label and an action, and standing in it shows
the button, which E also presses. New interactables, mini games included, follow that pattern.
The arcade, three screens off the market street's east end, has a bay per game with a cabinet
spot in each (`packages/shared/src/arcade.ts`): a cabinet whose game is not live shows an unlit
screen reading "Hatching Soon", and standing at it says so (all three are live, section 4). Art is referenced by key; artists replace files under
`apps/park/public/art/` and redraw the polygons. Room caps live in the server's `ROOM_CAPS`
variable (defaults in `apps/edge/src/rooms.ts`: lobby and hub 80; grove, market, arcade and the
street 40; a nest 12, its owner always admitted). What happens at the cap, and the line and the busy
ribbon (OP-075, section 6), are in `docs/CAPACITY.md`.

### The room's fields (`RoomDef`, `packages/shared/src/room.ts`)

| Field | What it is |
| --- | --- |
| `id` | A neutral word (`hub`, `grove`, `l1`, `nest-<id>`); never a realm's name |
| `size` | Room pixels: one screen is `ROOM_W` x `ROOM_H` (1600 x 900), at most `ROOM_MAX_W` x `ROOM_MAX_H` |
| `background`, `foreground` | The painting behind and the overlay in front of the owls, for a room of one screen |
| `backgrounds`, `foregrounds` | A bigger room's tiles (`RoomTile`): each one screen of art at its offset (`key`, `x`, `y`). A tile's `rate` is how fast it scrolls with the camera (absent or 1 with the room, 0.5 the tree's sky, 0.75 its middle distance, 1.2 its overlay; `tilePlacement` draws a slower tile bigger about its screen's centre, OP-155, OP-156). A tile's `fade` is the room pixels at its left and right edges over which it fades in from clear, at most half the tile (`tileFade`, OP-162). `plain` draws a tree tile as painted rather than a step quieter (OP-173) |
| `walkable` | The polygons an owl may stand on |
| `perches` | What an owl can land on above the floor (section 4, Flight and perches) |
| `fronts` | In a room seen from the side (the tree, OP-173): shapes of the playfield painted in front of the path (a lamp post, a stall's post), drawn again over the owls so an owl passes behind them. A `raised` one is drawn only over owls on a ledge or in the air off one (a stair's banister), so the floor passes in front of it |
| `shades` | In a room seen from the side (OP-173): shapes shaded darker by `alpha` (0 to 1), painted glows that do nothing, so they do not read as things to use |
| `places` | In a level of the tree (OP-156): its placed spots, each one of the level's named spots (`TREE_SPOTS`) at the point where its thing stands. A keeper places them with the ledge painter, and `pnpm masks:pull` prints them to paste here. The game does not read them yet. Not the same as `spots`; `docs/MAP.md` describes the named spots and the painter's Spot tool |
| `spawns` | Named spawn points; `default` is required |
| `doors` | Doorways and interaction spots (`DoorDef`): `id`, its trigger `rect`, `to` (room and spawn) for an open door, `closedSign` (an approved phrase) for a closed one, `marker` for its hint. `toTree` is where it leads an owl walking the tree instead of `to` (a realm a tree level opens into sends a tree owl back to that level, OP-162). `top` is the height over the ground line a side view's doorway stands at: an owl goes through only standing at that height (within `PERCH_SLACK`), so one on a ledge above walks on past (OP-162). `markAt` is where a side view's doorway mark stands over its arch (OP-173) |
| `spots` | Hiding spots for quest finds, on the floor or up on a perch a single jump reaches (with its `top`) |
| `mood` | Ambience: `hub`, `dusk`, `neon` or `arcade` |
| `gated` | A realm the realms switch opens (section 4, v10) |
| `map` | Which park the room belongs to: absent for today's park (map 1), 2 for the tree, the side-scrolling world around the great trunk (OP-128, OP-156; `mapOf`). A tree room's floor is a thin strip along the ground line and its ledges are perches |
| `owlScale` | How big owls are drawn here against today's park (the tree's owl, a sixth of the screen's height: 1.25) |

A tree room's camera follows the owl as drawn, its height included, so it climbs with the owl and
the layers' rates show (`followed` in `apps/park/src/game/RoomScene.ts`); any other room's follows
the owl's spot on the floor. The page keeps which park its owl walks for the tab
(`apps/park/src/game/walkingMap.ts`, sessionStorage): the tree from the moment it walks a level of
the tree, and still in a realm a level of the tree opens into (`TREE_REALMS`) or in a nest; today's
park in any other room. The pass says which park an owl starts in (`map`, the entries setting,
OP-156). The tree's grid, its layers and its style sheet are `docs/MAP.md`.

### Loading the park: the rules that keep it fast (OP-129)

- **Each room loads its own art.** Only the home screen, the visitor's owl and the owl's nest are on
  the way in. A realm's paintings, audio and its game code load when an owl heads into it, never at
  park start. A new realm or mini game follows the same rule.
- **The art budget**, a unit test in CI (`apps/park/src/game/artBudget.test.ts`): no PNG over
  300 kB, no WebP over 700 kB, and every room's painted screens ship as WebP. An exception is named
  in the test with its reason (today only `hub-fg@2x.png`); a named exception that shrinks comes off
  the list.
- **Long caching.** The script bundles and `/art/*` are cached for a year (`apps/park/public/_headers`).
  Each picture is asked for with its content's hash (`?v=`, from the art list `vite.config.ts`
  writes), so a changed picture is a new address. The page itself is never cached (the Worker serves
  it uncached, `apps/edge/src/page.ts`).
- **Art by its real name.** The loader asks for each piece in the format the build ships (no
  guessing SVG, then WebP, then PNG) and by its encoded name, so Cloudflare answers without a
  redirect.
- **The boot's art starts with the page.** The page asks for the boot's art itself, as it opens: a
  small script that `vite.config.ts` writes into `index.html`'s head (`earlyArtScript`,
  `apps/park/src/game/artNames.ts`) asks at low priority, beside the game's script, for the first file
  the loader will want for each `BOOT_ART` key at this screen's scale, and `art.ts`'s loader takes
  those downloads.
- **Soft first, sharp after.** On a dense phone screen a room the browser does not hold at 2x yet
  opens on its 1x painting and swaps in the 2x copy in place once it has come and the owl stands
  still.
- **Fetch ahead.** The next room's art is fetched as an owl's walk ends at a doorway (or the keys
  or thumbstick carry it past one), and the nest's art while the home screen waits on Play.
- **Join while loading.** A page joins a room as the room's art starts to load; what the room says
  meanwhile waits, in order, until the scene is built (`RoomScene.join`), so the first frame already
  has the other owls in it.
- **The load screen** (`index.html`'s `#loader`, `apps/park/src/ui/loader.ts`): an owl on a branch
  that grows with the bytes that have come against the sizes the art list carries, never a timer.
  The boot and each room report their art on it through `loadArt`'s `onProgress` (bytes done of the
  bytes expected, `apps/park/src/game/art.ts`). A load under 0.3 s never shows it (`SHOW_AFTER_MS`);
  owl facts after 2 s; a tap on the owl makes it hoot. Any new wait for art reports its progress to
  it the same way.
- **The slim engine.** The client's engine is a slim Phaser build (`apps/park/src/engine/phaser.cjs`),
  built from Phaser's source with only the parts the park draws with: images, graphics, containers,
  text, particles, zones, rectangles and ellipses. Physics, tilemaps, sound and Phaser's asset loader
  are left out (the park fetches its own art). `vite.config.ts` builds it into the module the dev
  server, the unit tests and the build load as `phaser`; `engine.test.ts` fails when the park's code
  asks for a part left out. A new kind of game object, or a Phaser system (sound, physics), is added
  there first.
- **Targets** (a phone on throttled 4G, cold): under 3 s to moving in the nest, under 1 s on a
  return visit, a realm under 1.5 s. Measure before and after any change that adds art or code on
  the way in; the method and the numbers so far are in OP-129's notes.

### Sprites: the manifest and the fit (OP-127, OP-136)

- **The manifest** (`packages/shared/src/sprites.json`, read as `SPRITES` in `sprites.ts`): for each
  published sprite, its `size` (the 1x file), its `drawn` box (`[x, y, w, h]`, trimmed of the
  transparent padding exports carry), the `centre` of what it draws, and its `solid` box (only its
  pixels at least half opaque, without a glow painted round it). The art tools measure it
  (`pnpm art:finish sprites`; publishing art rewrites it), so nobody types pixel values in.
- **The fit rules** (`FIT`): an interactable's trigger box is what it draws grown by 12 px on every
  side (`FIT.margin`), never under 44 px across or down (`FIT.minSide`, a fingertip), centred on what
  is drawn rather than on the file's frame (`interactBox`); its '!' marker sits 6 px above what is
  drawn (`FIT.markerGap`, `markerAt`). A sprite is placed by what it draws (`footOrigin`,
  `centreOrigin` in `apps/park/src/game/fit.ts`); one the manifest does not know keeps its frame's
  point.
- **Worn items are placed by anchor** (`wornAt`): a hat comes down over the forehead, its own bottom
  just above the eyes (a halo or a party hat sits on the crown instead); glasses centre on the eyes,
  a monocle on one of them; a collar hangs from the neck and never rides above the chin. The brow and
  the chin are measured from the face layer, and each item scales with the head, eyes or neck it
  fits. Effects follow the owl's drawn anchors through flight, bobs and emotes
  (`apps/park/src/game/fx.ts`). Pets are drawn at their owl's size (`Pet.ts`).
- **Wings** (OP-136): a flying owl shows two open wings over its kind's flight layers
  (`FLIGHT_LAYERS` for the great horned owl, the same painting with its folded wings taken away). They
  load once the room's own art is in, never at boot (`readyForFlight` in `apps/park/src/game/Owl.ts`,
  `loadFlightArt` in `art.ts`); until they have, the wings stay folded, so an owl never shows four.

## 6. Scaling knobs and capacity

1. `ROOM_SHARDING=single` (default): the whole park in one object. Cheapest, and enough while the
   whole park has well under 80 owls walking at once (measured below).
2. `ROOM_SHARDING=room`: one object per room, so each room holds its own cap; more object awake
   time billed. The park-wide count in the HUD then covers only the owl's own room (the
   `/api/counts` route still adds up every room), and the lanterns and the quiz start afresh in the
   hub's own object.
3. Copies of a room (OP-075, `apps/edge/src/copies.ts`): with one object per room, the keepers open
   a second copy of a busy room from `/admin/capacity` (the admin key, no deploy). A copy has the
   room's painting, NPC owls and leaf piles, its own owls and its own cap, and is a room object of
   its own (`room:hub~2`; copy 1 is the room's own, `room:hub`); with the whole park in one object
   there are no copies. The page asks for a room by its id as always, and the Worker sends a newcomer
   to the copy with the most free places among the room and its open copies (`pickCopy`). A draining
   copy takes no new owls, but an owl whose socket dropped goes back to the copy it was in while that
   copy is still there. Inside its object a copy is simply its room, and the welcome says which copy
   it is (`copy`). The line in front of the park and the busy ribbon live beside the copies' settings
   in the overflow object (`apps/edge/src/Overflow.ts`), which counts the owls in the park only while
   the line is on and someone is arriving or waiting, so a quiet park costs nothing there. When to use
   which: `docs/CAPACITY.md`.
4. The `Room` class in `apps/edge/src/Room.ts` has no platform dependency. Porting to a plain
   Node WebSocket process is a small adapter, which is the exit from the hosted platform.

### Measured (OP-068, 2026-10-23)

A throwaway copy of the room server on the park's Cloudflare account (free plan), loaded for 60
seconds a step by bots on a GitHub runner. A calm bot taps a new spot every 4 seconds; a busy one
every second (the server allows two). Echo is the time from a bot's move to the server's answer,
network included. The bots' own timers stayed within 25 ms, so the delays are the server's.
The Load test workflow runs it again (`tools/load/run-steps.mjs`).

| Owls | A move | Objects | Echo p50 / p95 / p99 (ms) | What happened |
| --- | --- | --- | --- | --- |
| 80 in the hub | every 4 s | one | 20 / 35 / 49 | held |
| 80 in the hub | every 1 s | one | 31 / 71 / 97 | held |
| 120 in the hub | every 1 s | one | 565 / 2,999 / 3,150 | overloaded: Cloudflare closed 98 sockets with 1013 ("Service overloaded") after 19 s |
| 240 in four rooms at their caps | every 1 s | one, as today | 819 / 19,591 / 20,821 | overloaded: all 240 closed with 1013 after 22 s |
| 240 in four rooms at their caps | every 1 s | one per room | 22 / 39 / 54 | held |
| 480, 120 in each of four rooms | every 1 s | one per room | 14,826 / 33,369 / 36,517 | every object seconds behind |

The four rooms at their caps are the lobby and the hub (80 each) and the grove and the market (40
each). What runs out is the fan-out: every move goes to everyone else in its room, so an object
sends about (moves a second) × (owls in the room − 1) frames a second. Eighty busy owls in one room
come to about 6,300 a second, and hold; 120 come to about 14,000, and do not. A calm owl moves a
quarter as often, and an owl standing about costs almost nothing.

What it means:

- A room holds its cap of 80 even with every owl in it walking all the time. Keep the caps of busy
  rooms at 80 or below: 120 busy owls overload an object even when it has nothing else to do.
- With one object for the whole park (today's setting), every room's fan-out adds up in that one
  object, so the whole park holds about what one busy room does: 80 owls walking at once in one
  room, or more spread over several. The four rooms at their caps with everyone walking come to
  about 15,800 frames a second and overload it. Past its limit, moves lag by seconds, and then
  Cloudflare drops every owl in the park at once; the client reconnects on its own, first after
  about half a second and never more than twelve seconds apart.
- With `ROOM_SHARDING=room`, each room holds its own cap, and a room that overloads no longer takes
  the others with it. Switch to it (a deploy) before a day that may bring more than about 80 owls
  at once, such as opening night, when everyone arrives in the lobby together. Each busy room's
  object is then awake, and billed, on its own (the cost model in section 3).
- More headroom in one room would come from sending one combined frame per room every 100 ms
  instead of one per move (not built).
- BUILT (OP-075): the line in front of the park with a waiting screen on the home screen
  (`/api/line`; close 4012 sends a page to it), the busy ribbon (`/api/notice`, and the `notice`
  frame), and copies of a room (item 3). A full room still answers `full`, and the page walks the owl
  back where it came from. How each works and when to use it: `docs/CAPACITY.md`.

### Measured again (OP-211, 2026-11-02)

On 2026-11-02 two Load test runs of a branch showed 80 busy owls in the hub at an echo p95 of about
230 ms, three times the 71 ms above. Run again the same evening with the same settings (one object
per room, steps 3 and 5, 60 seconds each), the code from main on 2026-10-23 (67ca3ab), today's main
(503b9bf) and that branch's commit (d8857a8) each gave both fast and slow runs. The commit was not
what decided it: which GitHub runner, in which region, the bots ran from was.

| Code | Runner | 80 in the hub, busy: p50 / p95 / p99 (ms) | Unanswered | 240 in four rooms: p50 / p95 / p99 (ms) | Unanswered |
| --- | --- | --- | --- | --- | --- |
| main on 2026-10-23 (67ca3ab) | northcentralus | 59 / 116 / 152 | 274 of 4,891 | 60 / 110 / 148 | 403 of 14,890 |
| main on 2026-10-23 (67ca3ab) | northcentralus | 56 / 83 / 108 | 287 of 4,931 | 55 / 93 / 122 | 438 of 14,850 |
| main (503b9bf) | eastus | 46 / 74 / 102 | 624 of 5,004 | 42 / 84 / 124 | 400 of 15,032 |
| main (503b9bf) | westus3 | 52 / 115 / 164 | 372 of 4,977 | 42 / 104 / 153 | 637 of 14,928 |
| the 2026-11-02 branch (d8857a8) | westus3 | 59 / 283 / 297 | 354 of 4,273 | 68 / 287 / 296 | 374 of 14,675 |
| the 2026-11-02 branch (d8857a8) | centralus | 57 / 71 / 90 | 501 of 5,030 | 57 / 69 / 81 | 478 of 15,072 |
| the 2026-11-02 branch (d8857a8), the first two runs (41507562487, 41508326416) | centralus | 65 / 236 / 276 (the second run only) | 345 of 5,159 | 54 to 55 / 227 to 239 / 252 to 302 | 368 to 447 of about 15,100 |

What it means:

- No run overloaded: no socket was closed with 1013, at most one owl in a run was not welcomed, and
  about 3 to 12 in every 100 moves went unanswered, as on 2026-10-23. Two runs saw a few sockets
  dropped (1006, 4 and 13 to 17 of them), the network's doing. A room still holds 80 busy owls, and four rooms
  at their caps still hold with one object per room.
- The echo is the runner's network as much as the server: the same code gave a p95 of 71 ms and of
  283 ms. Read one run's p95 as a range, roughly 70 to 300 ms for 80 busy owls in one room, and the
  p50 as 40 to 70 ms (it was 20 to 31 ms on 2026-10-23). Compare code only with runs from the same
  runner region (the job's "Set up job" step names it), or several runs of each.
- The room's own work per move grew a little with flight, perches and the position checks (OP-084,
  OP-149): about 60 µs a move for 80 owls on a development machine, against about 49 µs on
  2026-10-23, a millisecond of an object's second at 80 moves a second. That is not where the echo
  goes.
- Since OP-209 the throwaway copy needs a signing key of its own, or it answers every pass 503 and
  the Load test stops at "Wait for the copy to answer". The main rows above ran with that change
  (PR 62: the copy's keys go up as secrets).

## 7. The Realm Vote [BUILT; opens with tickets]

Canon: every ticket-holder gets one vote per park day, cast by walking up to a realm's idol (its
mythical owl) and tapping; votes are tied to ticket identity and guests cannot vote; the month's
winner sets the next merch drop; ties go to the realm with the fewest all-time wins.

- **In the park**: each open realm's mythical owl is its idol and is tappable. Tap it from anywhere
  in the realm and your owl walks up to the `idol` spot (the gathering circle under the guardian,
  the ground beneath the robot owl) and pledges on arrival; tap it while standing there and the
  pledge is immediate. The idol reacts (the guardian's glow swells and fireflies rise; the robot
  owl flares cyan), and a gold pledge mark shows at the owl's feet for the rest of the park day,
  visible to everyone (carried as `look.pledge`, cosmetic and client-asserted). A "Vote for this
  realm" button appears at the spot as a fallback for small screens and assistive input.
- **Closed realms** take no votes until they open; each has its own release.
- **Server**: `POST /api/vote` with the visitor's pass. The Worker verifies the pass and refuses
  guests (403 `tickets-required`) until the ticket gate admits them; an admitted pass carries the
  ticket-holder's identity, which is what the vote is keyed on. `GET /api/vote/me` reports today's
  vote. A `VoteLedger` Durable Object (SQLite) applies the rules through the portable `Ledger`
  class in `apps/edge/src/Ledger.ts`: one row per (park day, visitor), counts per realm per month,
  and a `wins` table for the tie-break. The park day follows `PARK_TZ` (default America/New_York).
- **Month end**: a cron (`5 5 1 * *`, just after midnight in the park's time zone) decides the
  previous month: most votes wins; ties go to fewest all-time wins, then the park's fixed realm
  order (an engineering default until canon says otherwise). `POST /api/vote/close?month=` does
  the same by hand. Deciding is idempotent.
- **Standings**: `GET /api/vote/tally?month=` is private (admin key) until the owner decides whether
  the race should be visible in the park; set `VOTE_TALLY_PUBLIC=true` to open it.
- **Data pipeline**: the ledger is the source of truth; the tally endpoint (or a scheduled export)
  feeds the sales and data pipeline. Mirroring rows into the Supabase ticket ledger is a small
  follow-up once that ledger exists.

## 8. Collectibles, quests and the feather shop [BUILT]

Visitors earn wearables, pets, effects and emotes from quests that NPC owls give, and buy them
with feathers in a rotating shop; feathers come from quests, leaf piles and duplicates. Identity
is a per-device collector token: `/api/pass` mints one when none is sent and folds its `cid`
into the pass.

- **`Collections`** Durable Object (SQLite, migration `v3`, one per park): collectors, owned
  variants, quest progress and capped daily earnings. The rules are the portable `CollectionBook`
  and `QuestBook` in `packages/shared/src`, which the local mode reuses in the browser.
- **Room object**: carries the collector per socket, checks quest talks, uses and pickups against
  the owl's server position, counts arrivals and emotes for quests, keeps the room's used-up leaf
  piles, and vets worn items and emotes against a short-lived cache of what each collector owns.
- **HTTP**: `GET /api/collection`, `GET /api/shop`, `POST /api/shop/buy`, `POST /api/shop/gift`
  (with the pass), and `POST /api/admin/grant` (admin key; the hook purchases will use).

The catalogue and its numbers: `docs/COLLECTIBLES.md`. Quests, NPC owls, leaf piles, the shop and
owl species: `docs/QUESTS.md`. The activities (the lantern beam, the stage quiz, fishing, the robot
owl's copy game and three small tasks a day), which pay feathers under their own daily cap:
`docs/ACTIVITIES.md`.

## 9. The lobby, tickets and the home screen [BUILT; the store's setup PLANNED (OP-024)]

**Identity** BUILT (C35, OP-065, OP-139). There are no passwords, and no sign-up is ever needed to
play. A device holds an anonymous collector token (`owl-park:collector` in localStorage, HMAC-signed
by the Worker with `PASS_SIGNING_KEY`) that names its owl's collector id (`cid`) and, with accounts
on, the device it is (`dev`). The `cid` is the owl's id: its collection and feathers, its nest, its
quests, its scores and runs and its tickets are all keyed by it. `GET /api/pass` takes the token and
answers a guest pass that lasts 12 hours (`GUEST_PASS_TTL_S`), carries the collector id, when it
was made (`iat`), whether a ticket admitted it (`adm`) and, with accounts on, the device. A ticket
belongs to the owl: opening its claim link on another screen moves it to the owl there, and a share
link (`#take=`) passes one unused ticket on. Friends (what a friend gets, bring-a-friend) are
PLANNED (OP-050).

**Accounts without passwords** BUILT (OP-139; on: `ACCOUNTS` in `apps/edge/wrangler.jsonc`).
The rules are `packages/shared/src/accounts.ts`; the Worker's half (the keys, the mail and the
`/api/account/*` routes) is `apps/edge/src/accounts.ts`; the store is `apps/edge/src/accountBook.ts`,
in the `Collections` object's SQLite beside the collections. Each owl's account record holds:

- a friend code: four letters (`FRIEND_CODE_LENGTH`, from `FRIEND_ALPHABET`, no I or O), minted with
  the account and never changed, shown in the Menu, for every owl, ticket or not;
- the device the owl is on. One screen at a time: a collector token for another device finds its
  owl moved (`/api/pass` answers 409 `moved`, a socket closes with 4014, and the page shows the
  moved card);
- the email that protects the owl, if one does: kept only as a keyed hash (to find its owls) and a
  sealed copy (AES-GCM, to write to it), both made with `ACCOUNT_SECRET`, never the address itself,
  and never logged. One email may protect several owls. An owl without one lives only on its screen;
- its look, for the picture a restoring screen shows.

A child never types an email. A grown-up protects an owl in Settings (`POST /api/account/protect`,
then the emailed link, `/api/account/confirm`), or a ticket's buyer is mailed a one-tap protect link
as the ticket lands on an owl (OP-186), which carries the address sealed in its own token, so the
park keeps nothing about it unless the link is opened. To bring an owl to another screen, a grown-up
types the protecting email there (`/api/account/restore`, answered the same whether the email
protects any owl or not), opens the link sent to it on that screen, and taps the owl's picture
(`/api/account/owls`, then `/api/account/bind` with its friend code): that screen holds the owl from
then on, and every other screen it was on is told at once. A link's token is signed like a pass and
names a nonce the store lets be used once. A magic link works once, for `MAGIC_LINK_MS` (15 minutes);
a ticket's protect link for `ORDER_LINK_MS` (7 days). At most `LINKS_PER_EMAIL_PER_HOUR` (3) links go
to one email and `LINKS_PER_IP_PER_HOUR` (10) are asked for from one address in an hour, and the
account routes count under the tight `ticket` rate limit (section 13). The links go out through
Resend (`RESEND_API_KEY`, from `MAIL_FROM`). Without `ACCOUNT_SECRET`, `RESEND_API_KEY` and
`MAIL_FROM` no email is kept and no link is sent; friend codes and one screen at a time still work.
`ACCOUNTS` `off` leaves every page as it was before accounts. Prices (C41, the owner,
2026-10-21): day ticket $3.99 for 24 hours from the first scan, annual pass $14.99 for 365 days;
no night ticket at launch; the store is on Shopify Basic. Opening night's prices are C42 and
OP-062 (below).

Before the lobby comes the home screen (OP-065: `apps/park/src/ui/home.ts`, `game/HomeScene.ts`):
the park's name and mascot over the lobby's painting, dimmed. A device with no owl yet (no kept
look and no collection) offers Make your owl, which keeps the owl on the device and opens the owl builder
on it. A device that holds one offers Play (into the owl's own nest, before its mirror, where Your
owl is changed, OP-077, OP-105; `docs/NESTS.md`), a line about its tickets and Settings (the park's
own, one store), with the owl drawn big beside them by the
builder's preview scene. No sign-up is asked for and nothing is typed. A ticket link lands there logged in,
with a note that the ticket came. PLANNED (OP-076): a short picture-answer quiz ("which owl
are you") between the first sign-in and the builder, once per device, skippable, with a retake on
the result screen and in Settings; Make it yours at its end opens the editor in place, the one
exception to the mirror. The Menu is a sheet of five tabs (Quests, Collection, Nest, Map, Settings;
`MENU_TABS` in `apps/park/src/ui/menuShell.ts`, OP-108). The Menu's Home screen (in its Settings tab,
under Leaving) leaves the
room as a door does (the owl's place frees at once, and a ticket keeps running) and comes back to
it. An address that
names a room (`?room=`: tests, the art preview) or says `home=0` goes straight into the park.

Every visitor arrives in the lobby (`lobby`, two screens wide): the turnstile gate into the hub,
and the lane down to the nests. The painted ticket booth in the lobby's art is scenery: since OP-180
the turnstiles sell tickets and there is no booth to walk up to. Open (now), the turnstiles let
everyone through and sell nothing. Taking tickets, `/api/pass` still gives every visitor a guest
pass, but a pass that is not admitted opens only the rooms outside the turnstiles: a turnstile
reached without a ticket that works turns the owl back and offers it a Day Ticket (below), and the
Worker refuses its socket for any other room and its use of the shop (its collection still shows).
A ticket's status shows only at the turnstiles (the scan card, or why they stayed shut); OP-172's
card on the plaza before them went with OP-180, and the Menu's Settings keep the tickets in a
closed row.

**The card before the store** BUILT (OP-153, OP-180, OP-198; `apps/park/src/ui/storeCard.ts`).
Every way from the park to the store's pages first shows one card: a short line and two buttons,
Continue and Not now, with no timer and no spending limit. Its line is `STORE_WORDS.ask` ("Ask a
grown-up before buying"), a draft until the owner approves it. It shows once for each purchase,
right before it: at a turnstile reached without a ticket that works, before checkout opens for a Day
Ticket; before opening night's pass checkout; and at the gift shop's door, before the store's page.
Continue goes on in the same click, so a popup blocker lets the window through: a way that opens a
window gets the opener in that click, and a link is Continue itself. Not now, Escape or a tap beside
the card goes back where the visitor was. The card takes the focus as it opens (not Continue, so a
stray key never buys), and both buttons are 44 px or more. `storeCard.ts` is the only file in the
park's code that opens a window or makes a link off the park; `storeCard.test.ts` reads the code for
any other, so no new way can skip the card. A way may add a choice under the buttons that stays in
the park (`StoreAside`: at the turnstiles, bringing here an owl whose ticket is on another screen,
OP-183). A Day Ticket's card may also offer the annual pass (`StoreUpgrade`, OP-198): Continue is
then named Day Ticket, and Annual Pass beside it opens checkout for the pass with the same one-time
token, so the pass lands on this owl the same way (`POST /api/tickets/checkout` with
`kind: 'annual'`). That is the pass's one pitch for the purchase: the half-price pass is not offered
after a Day Ticket bought in the park (`PASS_AFTER_DAY_TICKET` is false, `apps/park/src/ui/tickets.ts`).

**The turnstiles' question** BUILT (OP-198, with spectators on; `apps/park/src/ui/gatePrompt.ts`).
An owl that walks into a turnstile without a ticket that works stops there, and a card asks first,
with two choices. Buy a Day Ticket steps the owl back out and opens the turnstiles' own sale (below);
the ticket then takes the owl through by itself (OP-190). Enter as a guest walks it on in as a
spectator. Escape, or a tap beside the card, is neither: the owl steps back out, and the turnstiles
ask again the next time it walks in. The card opens nothing off the park, takes the focus as it
opens (not a button), and its words are drafts for the owner's approval (`SPECTATOR_WORDS`,
`apps/park/src/ui/spectator.ts`). With spectators off, the turnstiles turn the owl back and offer the
sale.

**Buying at the turnstiles** BUILT (OP-175, OP-180; `apps/park/src/ui/gateSale.ts`): a turnstile
that stays shut for want of a ticket (none, used up, expired or refunded), or the turnstiles'
question's Buy a Day Ticket, shows the card before the store once, with what the turnstiles say
above its line ("You need a ticket to go in. You can get a Day Ticket right here.", and the early
preview's warning while it runs).
Continue opens a blank window in the click, then asks `POST /api/tickets/checkout` for the Day
Ticket's cart link with a one-time token for this owl (`owl_checkout`), and sends the window there
(`checkout.ts`); a blocked window gets a link to tap, and with no token the store's ticket page
(`VITE_TICKETS_URL`) opens instead. A small card over the game says where checkout stands, with
Back to checkout and Cancel, while the page reads the wallet; the paid order's ticket lands on the
owl with no email opened. Only the card before the store opens windows: the opener it hands
Continue is what Back to checkout, Open checkout and the Annual Pass beside the Day Ticket use, so
the card asks once, right before the purchase, and not again. A turnstile that stays shut for
another reason (a ticket held for the store's check, not yet in its window, offline) says so and
sells nothing. A ticket belongs to the owl, not the screen (OP-183): every ticket route keys on the
pass's collector id, so a ticket bought or claimed on one screen admits the same owl on any other.

**In with the ticket, back from checkout** BUILT (OP-190; `apps/park/src/game/gateAdmit.ts`,
`apps/park/src/ui/checkoutReturn.ts`): when the bought ticket lands while the owl still stands at
the lobby's turnstiles (within `AT_GATE_PX` of them, where they turned it back), the owl walks back
into the turnstile it tried by itself, and the turnstiles scan the ticket as for any owl that walks
in (its first scan, the ticket card, on into the hub); the page says "Your ticket is here. In you
go!"; the half-price pass offer follows the ticket card only while `PASS_AFTER_DAY_TICKET` is on. An owl that wandered
off hears "Your ticket is here. It works at the turnstiles."; a ticket held for the store's check
takes no owl in ("Your ticket is here. It works as soon as the store’s quick check is done."). The
page cannot close checkout's window (the store's page cuts it off), so the store sends the buyer
back: a theme snippet on the store's home page (`docs/DEPLOY.md`, Selling tickets, step 11; not yet
applied, the owner's) forwards a visitor who came from checkout to the return address
`https://exploreowlpark.com/?checkout=done`, and any other visitor to the park. A page loaded there
takes `checkout` out of its address and says on the BroadcastChannel `owl-park-checkout` that
checkout is done. A game page with a checkout watched (or whose ticket came in the last ten minutes)
answers, looks at the wallet at once and asks for the focus. An answer within `ANSWER_MS` (400 ms)
means this is checkout's window: it calls `window.close()` and, where the browser keeps it open,
shows "You're all set. Your ticket is waiting in the park window." with Play here instead, which
starts the park in that window. With no answer (a phone's game tab asleep or closed, or checkout in
the game's own window), the park starts there: it watches the wallet, says "Your ticket is here.
Press Play and in you go!", and Play lands the owl in front of the turnstiles (`from-hub`), where it
goes through them with the ticket. Nothing in this relies on `window.opener` (the park cuts it
before the store's page loads). What a second screen of the same owl does is unchanged: the return
page starts no park while a game window answers, unless the buyer presses Play here instead.

**The opening switch** BUILT (OP-067, `apps/edge/src/gateSwitch.ts`): the keepers flip the gate on
`/admin/gate` (or `POST /api/admin/gate` with `{"mode": "ticket" | "open" | "deployed"}`), both
behind the admin key, with no deploy. The setting lives in the vote ledger's object beside the
tickets; each Worker reads it at most every ten seconds, so a flip reaches everyone within that.
Never set, or handed back (`deployed`), `GATE` in `wrangler.jsonc` decides as before. The turnstiles ask `/api/entry` for the gate as it is now before they act. An owl already inside
when the gate closes stays in: a pass carries when it was made (`iat`), and one made before the
switch closed the gate stays admitted until it expires; the next pass applies the rule at the
turnstiles.

**The nightly restart** (OP-181, `apps/edge/src/crons.ts`): once inside, an owl is never sent out
when its ticket runs out; it is only not let back in. Every day at 09:00 UTC (4:00 AM Eastern in
winter, 5:00 AM in summer) a cron restarts the park: the vote ledger keeps the restart's time beside
the opening switch, and every room object sends its sockets a short notice (`RESTART_NOTICE`), then
closes them about ten seconds later with `CLOSE.RESTART` (4016) by its alarm. The page does not
reconnect: it goes to the home screen with a calm line (`RESTART_HOME`) and drops its pass, so Play
starts on a fresh guest pass. While the gate takes tickets, no pass made before the last restart
goes past the turnstiles, and `/api/entry` says it is not admitted: the owl walks through them
again, they scan its ticket again, and an expired one is refused there. The pass they admit with is
dated at the scan. With the gate open nothing changes. The keepers can restart by hand with
`POST /api/admin/restart` (the admin key), to try it on staging. With one object per room, nests
are their own objects and are not told; their owls are not sent home, and go past the turnstiles
only by scanning again.

The ticket flow (C35; the Worker's side is built, OP-071, and tested against a stand-in store;
the store's own setup, the app, its secrets and the webhooks, is PLANNED (OP-024); the
products are PLANNED (OP-009, OP-047, OP-063); see `docs/DEPLOY.md`, Selling tickets): Shopify sells tickets and passes and keeps the buyer. Its webhooks reach
`/api/store/webhook` and are checked against the store's signature before anything is read
(`apps/edge/src/storeHooks.ts`). The Worker signs in to the store's Admin API with the app's client
credentials, traded for a token that lasts a day (`apps/edge/src/storeApi.ts`). A paid order makes one ticket per unit in the ticket book
(`TicketBook.ts`, in the vote ledger's Durable Object beside the votes): a visual ID such as
`OWL-7K3Q-PX9M`, the kind, and the order and line numbers only (no names or emails). An order the
store rates low risk gets its claim link at once, through a fulfillment of its ticket lines whose
tracking link is the claim link, so the store's own shipping email delivers it; any other order
waits until a later low rating or the owner's order tag `owl-park-release` releases it (or a
refund). That release rule is C35's default; C45 supersedes it with the fraud link, PLANNED
(OP-053), section 12, under which every paid order is scored before any ticket is released. A refund switches off that many tickets of a line, unused ones first, and a cancellation
all of them; votes already cast stay counted. Opening the link (`#claim=<secret>`, which the page
takes out of the address bar at once) puts the order's tickets in the wallet of the owl that opened
it (its collector id, on whichever screen it plays: OP-183), one owl at a time; a share link (`#take=<secret>`) passes one ticket on. The turnstiles scan a ticket
held on the device: its time starts at its first scan (a day ticket 24 hours, an annual pass 365
days, a night ticket the store's hours; an unused ticket expires a year after purchase; an event
ticket works inside its window), and the Worker answers with a pass admitted by that ticket. Votes
count per wallet (C42): one Realm Vote per wallet (the device's collector) per park day, however many
tickets or passes it holds, and each vote keeps the ticket that let the owl in, which votes once a
day too, so moving a ticket to another device does not vote twice (`Ledger.ts`). A metaobject per
ticket, listed on its order, mirrors its state for the owner; the park never reads it. The store
may send a webhook twice, and sends a free order's `orders/create` and `orders/paid` together: the
Worker works on one order at a time (a lease in the ticket book, 20 seconds at most), so a second
webhook waits for the first and finds its work done, and never replaces the claim link the first is
emailing. This replaces the earlier plan's emailed magic link and Supabase session.

**Preview period** PLANNED (OP-063; the owner's target for opening the park is 2026-12-01,
OP-066): before opening night the park opens early with a $0.99 Preview Ticket (product type
Ticket, kind `preview`, a day ticket valid while the preview runs) carrying a pledge to leave
feedback. The pledge is enforced in the park by a nudge that opens the existing Feedback form
(section 10), with a Worker setting for its frequency and off switch; an admin count of preview
tickets sold, notes per ticket and the pledge-kept rate. Preview Ticket holders get nothing extra
on opening night and do not count toward the founder perk (OP-049). The proposal is OP-063's;
the preview go/no-go checklist is OP-066.

**Opening night** BUILT (C42; the store's side PLANNED (OP-047); the pass at half price per
OP-062): the Opening Night Ticket is a Ticket
product of kind `opening-night` whose window (`owl_park.event_start`, and `event_end` or 24 hours)
is a field on the product, so a moved date is a store edit. A free order has nothing for the store
to rate, so its tickets go out at once (from `orders/create` too, in case the store does not send
`orders/paid` for it). The gate takes the ticket inside its window only; unscanned by its end, it
expires. During the window (read from the ticket product on sale, `apps/edge/src/opening.ts`) the
pass is half price (OP-062; the pass was free at first); the booth's line that said so went with
the booth (OP-180), and the offer itself says it. After the scan, the
ticket card is followed by "Your pass is half price tonight. Claim it" (after the card before the
store, as no purchase came right before it): `POST /api/tickets/pass`
makes a cart link on the store with the annual pass, the code `OPENING_PASS_CODE` (a Worker secret,
50% off the pass) and the cart attribute `from_ticket`; the store's checkout opens in a new tab. The
pass order is a paid order, so the store rates it like any other (a pass it does not rate low waits
in the wallet until the check is done). It comes back through `orders/paid` with that attribute:
the ticket book links the pass to its Opening Night Ticket (only one that went through the gate
counts) or, since OP-180, its Day or Night ticket, keeps what the order's passes sold for (each pass line's price less every discount on it,
the code's included, before tax), puts the pass straight into that wallet, and switches the pass
off if an Opening Night Ticket is switched off (a pass linked to a paid Day or Night ticket stays).
The same offer after a Day Ticket bought at the turnstiles (OP-180) is off since OP-198
(`PASS_AFTER_DAY_TICKET`): the card before the store offers the Annual Pass beside the Day Ticket
instead. The desk
offers the pass to a Day or Night ticket that still works (unused, held or running) on the owl's own
wallet, never to an owl that holds an annual pass that still works (`has-pass`); when the half
price is on is the store code's own dates (a store edit); a store
that is not set up answers 503 `not-set-up` and the page shows no offer. Prices and products do not
change. A pass bought with the code but without the link counts as a
pass without a link. `/admin/opening` (the admin key) counts the night: tickets issued and scanned,
passes through the link and without one, the conversion rate (tickets scanned that turned into a
pass), the passes' revenue before tax (less any pass switched off), and a CSV of the night's
tickets with order numbers, ticket IDs and each pass's amount only. The Drop-1 pin's $0 entry is
retired (C42).

**Leaving the park** BUILT (C43, `packages/shared/src/wayout.ts`): the spot in the hub where owls arrive
from the turnstiles is also the way out. Its floor's bottom edge there is a doorway (`to-lobby`,
marked by a soft ring on the floor) to the lobby's `from-hub` spawn, in front of the turnstiles
and outside them. The Menu's Settings tab offers the same as "Leave the park" (under Leaving, beside
Home screen) in any room inside the park, after a card that asks ("Leave the park? Your ticket keeps
running.", Stay or Leave). Go home is retired (OP-130): the Menu's Map tab travels the owl home (its
own nest is always on the map; section 4, v13), and the Nest tab, away from home, opens the map with
the nest picked. The nest's id comes from `GET /api/nest` (with the pass, which makes the nest on
first sight as the street does; the local mode asks its own book). Out of the nest the owl is on the
street in front of door 0. Leaving
changes nothing on a ticket: its time keeps running from its first scan, the pass stays admitted,
and coming back through the turnstiles is the quick scan ("Welcome back").

### The gate's trust boundary (OP-145)

The Worker trusts the store only through a signed webhook. It checks the HMAC over the raw body,
with the store's key or the app's secret, and the shop domain, before it reads anything
(`webhookSigned` in `apps/edge/src/shopify.ts`). An unsigned or mismatched webhook is answered 401
and logged as `webhook_rejected`; nothing reaches the ticket book. The webhook only names an order:
the Worker reads the order's lines, price and risk from the Admin API itself.

Every webhook is safe to receive twice. The book makes an order's tickets once, so a repeated
`orders/paid` changes nothing (`webhook_duplicate`), and one order's webhooks run one at a time
(the lease in `storeHooks.ts`). A refund is kept by the store's refund id, so a repeated
`refunds/create` switches nothing off a second time; a cancellation switches off whatever is still
live. A claim link carries a secret the book keeps only as a hash; it moves unscanned tickets only,
and a running ticket stays with the owl it let in (OP-174). A scan answers with a reason and never
with another ticket. A $0 order takes the same path but is not held for the fraud check (C42).

Not covered yet: an owl already inside keeps its entry pass until it runs out (at most 12 hours)
when its ticket is refunded or cancelled; the refund stops the next scan. Tests:
`apps/edge/test/gateHardening.test.ts`.

### Spectators past the turnstiles (OP-191) [BUILT; on]

`SPECTATORS` in `apps/edge/wrangler.jsonc` is the kill switch, `on` there. Off, the
turnstiles turn an owl without a ticket away with 403 exactly as before, and `/api/entry` answers
as before. On, `/ws` lets that owl into the rooms inside the park as a spectator (section 4), and
`/api/entry` adds `spectators: true`. The Realm Vote and the gift shop stay locked to it either way
(`/api/vote`, `/api/vote/me`, `/api/shop`, `/api/shop/buy`, `/api/shop/gift` answer 403). A spectator's
pass is the guest pass it already holds; buying a ticket and scanning it gives the page an admitted
pass, which the page sends to its room as `admit`. On the page (`turnstileWay` in
`apps/park/src/ui/spectator.ts`), with `/api/entry` saying `spectators`, a turnstile reached without
a ticket that works asks the turnstiles' question (Buy a Day Ticket or Enter as a guest, OP-198,
above);
a ticket the store still holds, or one for a night to come, lets the owl in as a spectator with the
turnstiles' reason and nothing to sell; turnstiles that cannot reach the park, or `spectators`
missing, turn the owl back as OP-180 does. An expired ticket scans as no ticket, so its owl comes in
as a spectator. Tests: `apps/edge/test/spectators.test.ts`, the spectator describe in
`apps/edge/test/RoomObject.test.ts`, `apps/park/e2e/spectator.spec.ts`.

## 10. Feedback from visitors [BUILT]

Send feedback, the first row of the Menu's Settings tab (and of the home screen's Settings), opens a
short form: what kind of note (bug, idea, praise, other) and up
to 1,000 characters. `POST /api/feedback` (with the pass) keeps it in the `Collections` object's
SQLite (`apps/edge/src/feedbackBox.ts`) with the collector token, the room, the screen size and the
browser's user agent; never an IP address or a name. The park's keepers read it on
`/admin/feedback` with the admin key. With the park's analytics log on, each note is also copied to
the owner's analytics project (section 13). How to read and triage it: `docs/FEEDBACK.md`. PLANNED:
the preview's feedback nudge and its setting (OP-063), and a one-time collectible for visitors who
give feedback (OP-064).

## 11. Prewritten chat [BUILT]

Owls talk only in prewritten phrases (C44): there is no typing anywhere in the park. The phrases
are data in one file, `packages/shared/src/phrases.ts`: 24 in six groups of four, each under a
number that keeps its phrase for good, so a new phrase is one more line there (with the owner's
approval). **Say**, its own button on the bar above the Menu beside Emotes (T on a keyboard), opens
a wheel of the six groups with the chosen
group's four phrases under it (`apps/park/src/ui/sayWheel.ts`); a tap, or 1 to 4, says one.

Only the number travels: `say` carries it to the room server, which relays it with the owl's id
to everyone else in the room, never words, and drops a number the list does not have. The room
server keeps one phrase every 3 s per owl; the page keeps the same pace, greying the wheel until
the owl may speak again. The phrase shows for 4 s in a bubble over the owl
(`apps/park/src/game/bubbles.ts`), one per owl, its words the same size on every screen. The local
mode passes the same number between tabs. **Show what owls say** in the settings (on by
default, kept on the device) hides every bubble when off.

## 12. The fraud link [PLANNED (OP-052 the endpoint, OP-053 the Worker side, OP-072 real scoring)]

Canon C45 (approved 2026-10-22). Nothing of it is on `main` yet; the Worker side is on branch
`claude/fraud-link` (OP-053, In progress) and goes live after the endpoint exists and on the
owner's go. Until then the store's own risk rating and the release tag (section 9) decide.

- **The shape**: on every paid ticket order (`orders/paid`), before any ticket is released, the
  Worker posts the order to the pipeline's scoring endpoint and waits up to **2 seconds** for a
  verdict: approve, review or decline, with a score and reason codes. Shopify's own risk rating is
  one more feature in the payload.
- **The payload**: the order in the pipeline's raw transaction shape, `source_system` "shopify",
  `channel` "owl-park-web": order number, a transaction id the Worker makes, the timestamp,
  subtotal, discount, tax and total in USD, the cart lines (product type, handle, quantity, line
  total, and for an opening-night pass the `from_ticket` attribute), guest checkout yes or no, the
  store's risk rating, the payment gateway, and **hashed** signals with a secret salt (a guest id
  from the email, a device id from the browser details the store provides, a card token from BIN
  plus last four). No email, name, address, IP or card digits leave Shopify.
- **The verdict** (the pipeline's bands: approve below about 0.69, review to about 0.82, decline
  from about 0.86): approve releases the tickets and the claim email goes; decline refunds the
  order through the store at once (C8), switches the tickets off, and the buyer gets the store's
  standard refund email (a $0 order is only switched off); review holds the order (tickets exist but
  are off, no email, order tag `owl:held`) and lists it on the Worker's admin page with Release and
  Refund for the owner. A review left **24 hours** with no action is released (fail open).
- **Fail open**: no answer within 2 seconds releases the order and records `fallback_used` with
  `fallback_policy` `fail_open`; a late verdict changes nothing.
- **What the pipeline stores**: `raw_transactions` and `raw_fraud_decisions` from the scoring
  endpoint; `raw_checkout_responses` written back by the Worker with the buyer's outcome
  (`ORDER_CONFIRMED`, `VERIFY_IDENTITY` for a hold, `PAYMENT_NOT_PROCESSED` for a refund) and the
  latencies; `raw_fraud_truth` later from chargebacks. Simulator rows keep their own
  `source_system`, so real rows are never mixed into simulated numbers without that filter.
- **Who builds what**: the contract is one HTTPS endpoint and one JSON shape each way, to be
  written down here when OP-052 settles it. The first endpoint answers approve for every order and
  writes the raw rows (the owner's decision, 2026-10-23; Claude Code writes it, OP-052); the
  pipeline's real scoring goes behind it after the preview opens (OP-072). Its URL and key are
  Worker secrets. QA checks the fail-open path in OP-090.

## 13. Operations [BUILT (OP-068)]

- **Health**: `GET /api/health` (`apps/edge/src/health.ts`) asks the three objects (`rooms`,
  `tickets`, `collections`) at once and answers `"ok": true` when each replies within 3 seconds,
  or a 503 naming the part that did not. It carries no settings and no secrets. The same line heads
  `/admin/gate`.
- **Uptime**: `.github/workflows/uptime.yml` asks `/api/health` every 15 minutes; three failures in
  a row fail the run and GitHub emails the owner. It checks nothing until the repository variable
  `PARK_URL` is set (still the owner's, OP-068).
- **The load test**: `.github/workflows/load-test.yml`, started by hand, deploys a throwaway copy of
  the Worker under its own name, loads it step by step with bots (`tools/load/run-steps.mjs`) and
  deletes it; its numbers are in section 6.
- **The keepers' pages**, all behind `ADMIN_KEY` (`X-Admin-Key`, or typed into the page):
  `/admin/gate` (the opening switch), `/admin/feedback` (notes), `/admin/opening` (the night's
  count), `/admin/capacity` (the line, the ribbon, copies of rooms and the realms switch, OP-075);
  and the admin API: `/api/admin/ping` (whether a key is the keepers'), `/api/admin/keeper` (a
  keeper's token for this tab, OP-156), `/api/admin/masks/<room>` (the ledge painter's save, below;
  a keeper's token also opens it), `/api/admin/store` (the store's setup), `/api/admin/tickets`
  (tickets without an order), `/api/admin/grant`, `/api/admin/climb` (a climb run by the reference a
  visitor quotes), `/api/admin/collect-log` (the analytics log's backfill), `/api/admin/feedback`,
  `/api/admin/gate`, `/api/admin/opening`, `/api/admin/restart`, `/api/admin/capacity`,
  `/api/vote/tally` and `/api/vote/close`. Until `ADMIN_KEY` is on the live Worker (OP-001, the
  owner's GitHub secrets) every one refuses. QA lists and probes them in OP-092.
- **When something is wrong**: `docs/PLAYBOOK.md` (is it down, roll back, pause sales, missing
  tickets, the free plan's limits, the words for visitors). Capacity: `docs/CAPACITY.md`.
- **Secrets** (`wrangler secret put`, or GitHub repository secrets the deploy workflow uploads):
  `PASS_SIGNING_KEY`, `ADMIN_KEY`, the store's `SHOPIFY_SHOP`, `SHOPIFY_CLIENT_ID`,
  `SHOPIFY_CLIENT_SECRET` (or an older app's `SHOPIFY_ADMIN_TOKEN`), `SHOPIFY_WEBHOOK_SECRET`,
  `OPENING_PASS_CODE`, the accounts' `ACCOUNT_SECRET`, `RESEND_API_KEY` and `MAIL_FROM` (OP-139),
  and the analytics log's `PARK_LOG_URL`, `FRAUD_SCORE_KEY` and `FRAUD_HASH_SALT` (OP-107). As of 2026-10-23 the live Worker still signs with its development key: the
  keys set from the owner's machine landed on an empty Worker in another account (OP-001), and the
  GitHub secrets are not set yet. Every owl's collection starts over once when the signing key goes
  up.

### The Worker's routes (OP-201) [BUILT]

`apps/edge/src/index.ts` is the front door. For each request, in order: one logger (OP-134); the
front door (`frontDoor`, below); the rate limits, for `/api/*` and `/ws/*` except
`/api/store/webhook` (below); the route for the path; and for any other path the static asset, the
park's page going out with its policy (`guardedPage`). Every answer leaves through `finished`
(`apps/edge/src/guard.ts`), and an error no route handled is logged as one line, then thrown on. The
crons each run their own job (`jobOf` in `apps/edge/src/crons.ts`): the month-end close of the Realm
Vote, and the nightly restart.

- `apps/edge/src/routes/table.ts` (`ROUTES`) lists every path the Worker answers, grouped as the
  files that answer them: a route is a path asked exactly, or a prefix every path under it begins
  with. `router.ts` looks a path up, exact paths first; no exact path begins with a prefix and no
  prefix begins another (`routeTable.test.ts`), so at most one route matches and the table's order
  changes nothing. Each handler answers its own methods, OPTIONS included.
- `routes/http.ts` holds what every route shares: the API's headers (`CORS`) and JSON answers, the
  body limits (`FEEDBACK_BODY_MAX` 16 KiB, `ACCOUNT_BODY_MAX` 2 KiB, `MASKS_BODY_MAX` 1 MiB; anything
  larger is refused unread), the keepers' key (`isAdmin`, compared in constant time by `sameKey`,
  logged as `admin_ok` or `admin_denied` with the route and never the key), a keeper's token
  (`keeperOf`), the pass (`tokenOf`: the `Authorization` bearer or `?pass=`; `passOf` checks each
  request's pass once, so the limits and the route share it), the client's address (`clientIp`:
  `CF-Connecting-IP`, or `X-Forwarded-For` only with `TRUST_FORWARDED_FOR` for local load tests) and
  the visit a call comes in (`visitOf`).
- `routes/park.ts` holds the park's objects as the routes reach them: the vote ledger (`votes`,
  which also keeps the ticket book and the opening switch; `deskOf` is the ticket book's internal
  routes), the collections object, the overflow object (its state read at most every few seconds,
  `overflowOf`), the front gate (`gateOf`), the room object for a room or copy (`objectName`,
  `objectFor`: `park`, or one per room and copy), and the work routes hand on after answering
  (bringing the store's copy of tickets up to date, a ticket event for the analytics log, a buyer's
  protect link).

| Paths | File | Needs |
| --- | --- | --- |
| `/api/csp-report`, `/api/pass`, `/api/entry`, `/api/travel` | `visit.ts` | `/api/pass` the collector token (or none); `/api/entry`, `/api/travel` a pass |
| `/api/admin/*` | `admin.ts`; `masks.ts` for `/api/admin/masks/<room>`; `feedback.ts` for `/api/admin/feedback` | the admin key (the masks save: a keeper's token or the key) |
| `/admin/feedback`, `/admin/opening`, `/admin/gate`, `/admin/capacity` | the page modules (`feedbackPage.ts`, `openingPage.ts`, `gatePage.ts`, `capacityPage.ts`) | the admin key, typed into the page |
| `/api/masks/<room>` | `masks.ts` | nothing |
| `/api/account/*` | `account.ts` | `ACCOUNTS` on; a pass if there is one |
| `/api/feedback` | `feedback.ts` | a pass |
| `/api/line`, `/api/notice` | `line.ts` | `/api/line` a pass; `/api/notice` nothing |
| `/api/store/webhook` | `store.ts` | the store's signature |
| `/api/tickets`, `/api/tickets/*` | `tickets.ts` | a pass |
| `/api/collection`, `/api/shop`, `/api/shop/buy`, `/api/shop/gift`, `/api/nest`, `/api/nest/gift` | `collection.ts` | a pass |
| `/api/vote*` | `vote.ts` | a pass; `/api/vote/tally` and `/api/vote/close` the admin key (the tally opens with `VOTE_TALLY_PUBLIC`) |
| `/api/health`, `/api/counts`, `/ws/<room>` | `rooms.ts` | the socket a pass; the others nothing |

### The front door (OP-140, OP-141, OP-144) [BUILT]

`frontDoor` and `finished` in `apps/edge/src/guard.ts`:

- **Only https, off this machine.** A page asked for over http is sent to https (301); the API and
  the room sockets over http are refused (403 `https-only`). Local development and the browser tests
  are http on localhost.
- **Sockets and API calls only from the park's own pages.** Each of the park's hostnames serves its
  own page and its own sockets, so a page's origin is the Worker's own. `PARK_ORIGINS` (a comma list)
  may name more, such as a copy of the client served elsewhere (`docs/DEPLOY.md`, mode A); on this
  machine any local page may. A socket that names no origin, or another site's, is refused (403
  `origin`, logged as `room_join_refused`). An API call from another site's page is refused too; one
  that names no page (the store's webhooks, the uptime check, a same-origin GET) is not.
- **Every answer** carries `X-Content-Type-Options: nosniff`, HSTS on https (`HSTS`,
  `max-age=31536000`), and CORS for the park's own pages only, echoing the allowed origin, never `*`.
  HSTS has no `includeSubDomains`: nothing else on the park's domain is the park's to promise. It is
  not preloaded either: a preload list is slow to leave. The static files carry the same headers
  (`apps/park/public/_headers`). An upgraded socket goes as it is.
- **The page's policy** (`parkPolicy`, set by `guardedPage` with a fresh nonce on each load), each
  source with why it is there: `default-src 'self'`; `script-src 'self'` and the nonce, for the page's
  own bundles and its two inline scripts, and `https://in.heycatch.ai`, for the HeyCatch analytics SDK's
  one helper script (`ANALYTICS_HOST`); `style-src 'self' 'unsafe-inline'`, as the load screen's
  leaves and the HUD set their styles inline; `img-src 'self' data: blob:`, for the pictures the page
  makes itself (a nest's picture, the Menu's drawn edges, art fetched whole); `connect-src 'self'` and
  the host's own `wss://`, for the API and the room sockets, and `https://in.heycatch.ai`, where the
  analytics SDK (started in `apps/park/src/main.ts`) sends its events; `object-src 'none'`, `base-uri 'none'`,
  `form-action 'self'`, `frame-ancestors 'none'` (and `X-Frame-Options: DENY`); `report-uri
  /api/csp-report`. The page also goes out with `Referrer-Policy: strict-origin-when-cross-origin`.
- **What the policy blocked**: a browser reports it to `/api/csp-report` (`CSP_REPORT_PATH`, at most
  8 KiB, `REPORT_BODY_MAX`). The Worker logs it as `csp_violation`, one line per kind of violation
  every 10 minutes (`REPORT_EVERY_MS`) with how many came since, and never the page's query or
  fragment, where a claim link keeps its secret. What to do about one: `docs/PLAYBOOK.md`.

### Rate limits (OP-142) [BUILT]

`apps/edge/src/limits.ts`. Calls to `/api/*` and `/ws/*` are counted a minute at a time
(`API_LIMITS`). A call past a limit is answered 429 with `Retry-After`, the seconds left in its
minute, and the first call over in a window is logged as `rate_limited` (`docs/PLAYBOOK.md`).

| Limit | Counts | A minute | Keyed by |
| --- | --- | --- | --- |
| `address` | every call, a socket's opening included | 600 | the client's address |
| `public` | calls that need no pass (`isPublicCall`: `/api/pass`, `/api/notice`, `/api/counts`, `/api/health`, `/api/csp-report`, `/api/vote/tally`, `/api/admin/*`, `/api/masks/*`, `/api/account/*`), made without a pass | 300 | the address |
| `refused` | calls that need a pass and came with none the Worker takes | 60 | the address |
| `visitor` | calls with a pass | 120 | the owl's collector id (or the pass's id before it has one) |
| `ticket` | the calls that move tickets or send mail (`isTicketCall`: `/api/tickets/claim`, `take`, `share`, `scan`, `pass`, `checkout`, and `/api/account/*`), on top of the others | 10 | the owl (or the address) |

Only the store's webhooks go uncounted: they are signed, and the store retries them. The limits are
set well past a busy night: a page polls the line at most every 5 s and the busy ribbon every minute,
so an owl makes a few dozen calls a minute at most, and a household, a school or a phone network
shares one address.

The counts are kept in each copy of the Worker's own memory. Cloudflare's rate limiting binding would
share them across a location's machines, but nothing says it is free on the Workers Free plan, and
OP-142 rules out a paid feature; counts kept in a Durable Object would spend the free plan's daily
requests on every call. A page or a script calling too fast keeps meeting the same copy and is
stopped; a flood spread over Cloudflare's machines is Cloudflare's own DDoS protection's to stop.
`RATE_LIMITS` `off` is for a load test's throwaway copy only (`tools/load/throwaway-config.mjs`).

### The ledge painter's drafts (OP-156) [BUILT]

A keeper paints a tree room's ledges, walls, hazards, fronts and placed spots in the page
(`?keeper=1` gives the tab a keeper's token; `docs/MAP.md`), and saves the draft to the Worker
(`apps/edge/src/routes/masks.ts`):

- `POST /api/admin/masks/<room>` takes a keeper's token in `X-Keeper-Token`, or the keepers' key
  (`keeperOf`). The room must be one the painter paints (`paintableRoom`), the body at most
  `MASKS_BODY_MAX`, and the draft is checked by `checkMasks` (`packages/shared/src/masks.ts`). A
  refusal says why, and for a bad item its list and index. It is logged as `masks_refused`, a save as
  `masks_saved` (`docs/LOGGING.md`).
- `GET /api/masks/<room>` is public: level geometry, nothing personal. It answers 404 before a draft
  is saved. What the overflow object said is kept 10 s per room in each copy of the Worker
  (`MASKS_KEEP_MS`, `apps/edge/src/overflowState.ts`), and a save through that copy is kept at once.
- Both count as calls that need no pass (`public`, above).
- The drafts live in the overflow object, the park's one object for what the keepers set: one row
  of `overflow_settings` per room, under `masks:<room>`, with `savedAt`. A new save replaces the old.
  A draft of the four lists from before spots (OP-156, part 3) is taken, kept and read back as one
  with no spots (`spots: []`).

### The park's analytics log (OP-107, OP-111, OP-113, OP-192) [BUILT; on once its secrets are set]

The owner's analytics, in the `game` schema of the fraud pipeline's Supabase project, beside the
park's orders. The park's side is `apps/edge/src/collectLog.ts` (the outbox), `parkStats.ts` (the
player stats) and `buyerLog.ts` (the owner's contacts); the receiving side is the `owl-park-log`
function and its SQL in `apps/park-log` (`apps/park-log/README.md`). The log is on once the Worker
has `PARK_LOG_URL`, `FRAUD_SCORE_KEY` (the key the function checks) and `FRAUD_HASH_SALT`; without
all three nothing is kept or sent (`logConfig`). `POST /api/admin/collect-log` backfills.

- **The outbox.** The collections object writes each row into its own SQLite in the same step as
  what it records (a collectible granted, for example) and sends it on at once, a batch at a time
  (`LOG_BATCH`, 100) within 1 s (`LOG_SEND_MS`). A send that fails or is slow leaves the rows for the
  object's alarm to retry (`LOG_RETRY_MS`), so a pickup never waits on the log and never fails because
  of it, and each row's event id makes a row sent twice land once.
- **The collection log** (OP-107): a row for every collectible an owl comes by (a wearable, pet,
  effect, emote or piece of nest furniture), in `game.collect_log`, with the catalogue in
  `game.collectible_catalogue`, sent whenever a deploy changes it. Views: `game.collect_player_stats`
  (per owl) and `game.collect_item_stats` (per collectible), in `apps/park-log/sql/collect.sql`.
- **The player stats** (OP-111, `parkStats.ts`), fed by the room object's calls on each hello, look,
  minute heartbeat and socket close. Each owl's kind and body colour: its first visit sends a first
  version and each change of either a new one, kept as a type 2 dimension in `game.dim_player`
  (`game.add_player_versions` closes the current version and opens the new). Each visit, one per page
  load by its pass's id, goes to `game.fact_session` once it is over: a visit quiet for
  `VISIT_GRACE_MS` (3 minutes) ends when it was last seen. `game.v_player_lifetime`
  (`apps/park-log/sql/players.sql`) is per owl as it is now.
- **Time in each room** (OP-113): `game.fact_realm_visit` gets a row for each room a visit went into,
  under its session, from the owl's hello there until its next hello (in the next room, or in this
  one again after its line dropped) or the visit's end. A visit's rooms follow one another without a
  gap or an overlap, so their times add up to the visit's; time with the Menu open counts. Each row
  says how the owl came in (`EntrySource`): `walked` from another room of the visit (a door, the way
  out, the turnstile), `spawn` as the page began (Play's nest, or the lobby), `deep_link` straight in
  by the page's address, `reconnect` the same room again after its line dropped, `travel` by the
  Menu's map. Views: `game.v_realm_time` (per room), `game.v_player_realm` (per owl and room) and
  `minutes_by_realm` in `game.v_player_lifetime` (`apps/park-log/sql/realms.sql`).
- **Tickets** (OP-192): `purchase` rows into `game.fact_purchase`, one per ticket event: an order
  paid, its tickets put on an owl (by the claim link or the gate's checkout), refunded, cancelled,
  and a ticket's first scan. Each visit says what it was past the turnstiles (`visitor_kind` in
  `game.fact_session`: `visitor`, `spectator`, or null for one that never went past them), so free
  owls are counted beside paid ones. Views in `apps/park-log/sql/profiles.sql`: `game.v_purchase`
  (per order), `game.v_visitor_profile` (per owl, free or paid) and `game.v_keepers_card` (the
  keepers' totals, such as minutes per room by spectators and by visitors).
- **The owner's contacts** (OP-192, `buyerLog.ts`): for every paid ticket order, the buyer's email
  and the store's customer id, read from the store as the paid webhook is answered and sent straight
  to the `contacts` schema (`contacts.contact`, `contacts.contact_order`), never into an outbox, a log
  line or a `game` table. A contact names its order by the order's salted key (`orderKey`), the one
  the purchase rows carry, so the owner's own queries join a buyer to the owl that claimed the
  order's tickets, and only through that key. An owl that never bought or claimed a ticket has no
  contact.
- **Notes** (OP-166): with the log on, each feedback note is also copied to `game.feedback`
  (`docs/FEEDBACK.md`).

The privacy rule: what leaves the park in a `game` row is anonymous by construction. The collector
and the visit go as salted hashes (`FRAUD_HASH_SALT`, the fraud link's salt, so the owner's tables
join on them), the order as its salted key, the device only as phone or desktop, the place as the
room's neutral id. No `game` row carries a name, email, order number, ticket id, pass or address,
and the collector's own id never leaves the collections object. Players may be under 13: the park
side holds no email and no name, and play data is only ever joined outward to a buyer, in the
owner's `contacts` schema, which has row-level security on and no grants, so only the owner's own
queries read it.

## 14. From a ticket purchase to standing in the hub

```mermaid
sequenceDiagram
    participant B as Buyer's browser
    participant S as Shopify (the store)
    participant W as Worker (apps/edge/src/index.ts, routes/table.ts)
    participant T as VoteLedger object (TicketBook, GateSetting)
    participant F as Fraud endpoint (planned, OP-052)
    participant R as RoomObject (the hub)

    B->>W: At a shut turnstile, after the card before the store: POST /api/tickets/checkout
    W-->>B: The Day Ticket's cart link with this owl's one-time token (owl_checkout)
    B->>S: Checkout in its own window (checkout.ts, gateSale.ts)
    S->>W: POST /api/store/webhook orders/paid (HMAC-signed)
    W->>W: Verify the signature (storeHooks.ts, shopify.ts)
    W->>S: Admin API: the order's ticket lines and risk (ORDER_QUERY)
    W-->>F: planned: score the hashed payload, wait up to 2 s (C45)
    W->>T: /tickets/issue: one ticket per unit, held unless low risk or free
    W->>S: Fulfil the ticket lines with the claim link as tracking link
    W->>T: With an owl_checkout token: the tickets land on that owl at once
    B->>W: The page reads the wallet while checkout is open (and at once when the return page says so)
    S->>B: Thank you page, then the store's home page sends the buyer to /?checkout=done (OP-190)
    B->>B: The return page tells the game page (BroadcastChannel) and closes; the owl walks into the turnstiles
    S->>B: As always, the store's shipping email, "Your ticket", with the claim link (another screen)
    B->>W: Open the link: POST /api/tickets/claim (the link's secret, device = the collector id)
    W->>T: /tickets/claim: the order's live tickets move onto this owl (any screen, OP-183)
    B->>W: GET /api/pass (collector token) and GET /api/entry (the gate now)
    W->>T: Read the opening switch (gateNow, kept 10 s)
    B->>W: At the turnstiles: POST /api/tickets/scan
    W->>T: /tickets/scan: the first scan starts the ticket's time
    W-->>B: A pass admitted by that ticket (adm = true)
    B->>W: WebSocket /ws/hub?pass=...
    W->>R: mayEnter(gate, pass, "hub") then the socket is handed to the object
    R-->>B: welcome: your id and position, every owl in the room, the cap, the counts
```

Where the gate is open (today's deployed setting), the turnstiles let every pass through without a
ticket and the steps from the store to the scan are skipped. Where it takes tickets, a pass that
is not admitted opens only the lobby, the street and the nests (`mayEnter` in
`apps/edge/src/gate.ts`), and the shop and the vote refuse it.

## 15. OPEN QUESTIONS for the owner (with the defaults in the code)

1. Walk speed: 260 px/s today (one constant in `packages/shared/src/walk.ts`); 200 feels calmer on a phone.
2. When to buy Workers Paid ($5): before the first promoted weekend is the recommendation.
3. Decided: the room server is the transport, live on Cloudflare since 2026-10-18 (OP-002, OP-020). The Supabase Realtime fallback is gone from the code (OP-150).
4. Decided: the park's own domain, exploreowlpark.com and www, with the workers.dev address kept on beside it (OP-002, OP-020).
5. Room caps: hub 80 / grove 40 / market 40 as deployed; OP-068 measured that one object holds 80 walking owls (section 6). When to switch to one object per room is the owner's call before a busy night.
6. Pre-ticket access: open to all guests (today), or a bot check on `/api/pass` if abuse shows.
7. Collectibles: how purchases with money reach a collection (quest rewards, leaf-pile feathers and the shop follow canon C31; defaults in `docs/QUESTS.md` and `docs/COLLECTIBLES.md`).
8. Activities (C30): their numbers and words, defaults in `docs/ACTIVITIES.md`.
9. The fraud link's contract (section 12): the JSON shape each way, once OP-052 settles it.
10. Settled (OP-209): off this machine a Worker without `PASS_SIGNING_KEY` refuses (every pass, socket and keeper's token answered 503, `/api/health` not ok); only localhost falls back to the development key.
11. OPEN QUESTION: OP-108's note (`apps/park/src/ui/menuTheme.ts`) puts Go home in the Menu's Nest tab. The code has no Go home: the Map tab travels the owl home (OP-130), and the Nest tab, away from home, opens the map. This file describes the code (section 9, Leaving the park).
12. OPEN QUESTION: `game.v_player_lifetime` still answers null for `purchases_count` and `lifetime_value`, which its comment says wait on the store and the ticket gate (OP-024, OP-010), while `game.fact_purchase` and `game.v_visitor_profile` (OP-192) already carry each owl's ticket events and what it bought (section 13, the park's analytics log).
