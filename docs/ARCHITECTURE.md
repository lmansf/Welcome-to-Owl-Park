# Owl Park architecture

Status: accepted for version 1 (presence only). This document names no unreleased realm
names and no reference products; the detailed reverse-engineering notes behind it live in
the team's internal drive, not in this public repository.

## 1. What we replicate from the classic tap-to-move room worlds

The 2000s browser worlds that Owl Park takes its feel from all shared one simple model,
and so does Owl Park:

| Mechanic | Classic model | Owl Park |
| --- | --- | --- |
| Rooms | A fixed-size painted stage per room with a hidden "block" layer marking where an avatar may not stand, a foreground layer drawn in front of avatars, and trigger zones that lead to other rooms | A room of one or more 1600 x 900 screens (the hub and the grove three, the market and the lobby two) with `walkable` polygons, optional foreground images, and `doors` (trigger rectangles) in `packages/shared/rooms` |
| Movement | Click a spot; the avatar walks there in a straight line at constant speed; the client sends only the destination and every other client animates the same walk itself | Tap; `resolveTarget` snaps the tap into the walkable area and stops at the first blocked sample; one `move` message carries the target; every client animates from (from, to, startedAt) with `positionAlongWalk` |
| Depth | Avatars and props sorted by their y coordinate | `depth = y` for owls and set pieces; foreground always on top |
| Entering a room | Spawn near a named point with a little random scatter so avatars do not stack | Named `spawns`; the room server scatters new arrivals (door entry 60 px, map entry 220 px) |
| Doors | Walking into a trigger zone changes room and places you at a spawn in the destination | `doors[].to = { room, spawn }`; closed doors show an approved sign instead |
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

The client keeps a transport interface, so all three exist in the repository:

| Transport | Backend | Use |
| --- | --- | --- |
| `local` | none (BroadcastChannel between tabs) | development, demos on one device, tests |
| `supabase` | Supabase Realtime public channels | a small start with the team's existing account; no server code; message costs grow with room size |
| `edge` | the room server in `apps/edge` | the production path; authoritative, cheap at scale |

## 3. Components and licences

| Component | Choice | Licence |
| --- | --- | --- |
| Client | Phaser 3.90, Vite 8, TypeScript 5.9 | MIT / MIT / Apache-2.0 |
| Shared rules | `packages/shared`: protocol, geometry, walk maths, room data | MIT (this repo) |
| Room server | `apps/edge`: Worker + Durable Object; `workerd` runtime | code MIT; workerd Apache-2.0; the hosted service is proprietary |
| Static hosting | Workers static assets (free, unlimited) or GitHub Pages | service |
| Identity (v1) | HMAC-signed guest "park pass" minted by the Worker | our code |
| Collections | `Collections` Durable Object (SQLite) keyed by a per-device collector token; rules in `packages/shared/src/book.ts` | our code |
| Tickets (v2) | Supabase Postgres + Auth for the ticket ledger and magic links | PostgreSQL licence / MIT |
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

## 4. Wire protocol v7 (`packages/shared/src/edge.ts`)

One WebSocket per visitor to `wss://<host>/ws/<room>?pass=<park pass>`. Every frame is one
JSON object of at most 1 KiB, except the literal heartbeat text frame `hb`, which the
Durable Object answers without waking. Coordinates are integers in room space. All timestamps
are server milliseconds; clients never put their own clock on the wire.

Client to server: `hello` (once, within 5 s; look, optional spawn name and resume position),
`move` (target and a per-connection `seq`), `look` (new colours, species and worn items), `emote`
(an emote id), `bye`, and the quest requests, each with a request number `r`: `quests`, `talk`,
`accept`, `abandon`, `handin`, `use` (an interactable) and `gather` (a quest item); and `act` for
the activities (light a lantern, cast and reel, the robot owl's copy game, today's tasks); and for
the nests `street` (on the street: the visitor's own nest and five other owls' open ones) and
`nest` (in its own nest, the owner puts a piece in a spot, takes one away, or opens or closes it).

Server to client: `welcome` (your id and position, every owl in the room with any walk in
progress, server `now`, room cap, park counts), `enter`, `move` (validated walk, sent to
everyone including the sender; only the sender's copy carries `seq`, which is the
acknowledgement), `look`, `leave`, `counts`, `full`, `emote` (to everyone else in the room), and
for quests `quests` (the board, as an answer or a push), `handin`, `useResult`, `refused`, plus
`objects` and `used` for shared interactables such as leaf piles (see `docs/QUESTS.md`), and for
the activities `act` (the answer), `lanterns`, `quiz`, `paid` and `tasks` (see
`docs/ACTIVITIES.md`), and for the nests `street` (the answer), `nest` (a nest as it stands: to a
newcomer after its welcome, to everyone inside when its owner changes it, and as the answer to the
change) and `closed` (a nest turned the visitor away or closed with it inside; close 4011 follows).

Server rules: moves are clamped with the same `resolveTarget` the client uses, so echoes
normally match the client's prediction; a walk in progress is continued from its current
point when redirected; moves use a token bucket (burst 5, refill 2 per second) and repeated
excess closes the socket (4003); more than 40 frames in 5 s closes it; a second session for
the same visitor replaces the first (4005); full rooms answer `full` then close (4010);
idle sockets (no heartbeat for 90 s) are reaped by a one-minute alarm; at most 3 sockets per
IP address per object. Quests and collectibles: talks, uses and hand-ins count only within reach
of the owl's position on the server clock (plus 40 px of slack), a quest item only within 56 px,
and one quest request runs at a time per visitor; one use per 1.2 s; worn items the visitor's
collection does not hold are dropped from a look before it is broadcast; emotes must be owned and
are limited to one per 1.5 s; quest and emote frames count toward the frame limit. Nests: a nest's
room is `nest-<nestId>`, the id random and never taken from the collector; its hello waits for the
collections object (later frames wait behind it), a closed nest lets in only its owner, its owner
gets in however full it is (12 others), only its owner changes it (one change per 250 ms), and
closing it sends every visitor out. No frame carries a collector id, and counts sum all the nests
under one `nests` key.

Client rules: the clock offset is set from `welcome` and refined with a min-filter over
later `move` frames; remote owls are drawn 100 ms behind server time so jitter never shows;
the local owl walks immediately on the tap and is corrected only if the echo differs by more
than 2 px; reconnects back off from 0.5 s to 8 s and resume near the last position; a stale
bundle (protocol mismatch) reloads itself, once until a room welcomes it again.

Everything about a visitor that must survive hibernation (id, look, position, walk, collector id,
and in a nest whether it is the owner's) is kept in the socket attachment, so an object that was
evicted rebuilds every room, nests included, from its sockets. Used-up leaf piles, the hub's
lantern beam and the last stage quiz round paid are kept in the object's storage as well, so an
evicted object brings them back; while owls are in the hub, the alarm also wakes the object when a
quiz question closes.

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
it): walking across a wide room, or up to something to do, passes doorways by. Positions stored
for later (the quest items a visitor has been handed) follow the room data's `ROOM_LAYOUT`: when
a room grows on the west, the room server and the browser move them once. A door without `to` can be an
interactive spot (the gift shop, the idol): an entry in `interactions` in
`apps/park/src/game/RoomScene.ts` gives it a button label and an action, and standing in it shows
the button, which E also presses. New interactables, mini games included, follow that pattern.
The arcade, one screen off the market street's east end, has three cabinet spots along its back
wall (`packages/shared/src/arcade.ts`): a cabinet whose game is not live yet shows an unlit screen
reading "Hatching Soon", and standing at it says so. Art is referenced by key; artists replace files under
`apps/park/public/art/` and redraw the polygons. Room caps live in the server's `ROOM_CAPS`
variable (defaults: lobby and hub 80; grove, market, arcade and the street 40; a nest 12).

## 6. Scaling knobs

1. `ROOM_SHARDING=single` (default): the whole park in one object. Cheapest; fine to a few
   hundred concurrent.
2. `ROOM_SHARDING=room`: one object per room; more fan-out capacity, more awake time billed.
3. Instances (`hub-1`, `hub-2`): not built yet; the protocol and ids leave room for it.
4. The `Room` class in `apps/edge/src/Room.ts` has no platform dependency. Porting to a plain
   Node WebSocket process is a small adapter, which is the exit from the hosted platform.

## 7. The Realm Vote (built, opens with tickets)

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

## 8. Collectibles, quests and the feather shop (built)

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

## 9. The lobby and tickets (built; the store's side waits for its app)

Every visitor arrives in the lobby (`lobby`, two screens wide): the ticket booth on one side and
the turnstile gate into the hub on the other. With `GATE=open` (now) the turnstiles let everyone
through and the booth says tickets are coming. With `GATE=ticket` (once tickets sell),
`/api/pass` still gives every visitor a guest pass, but a pass that is not admitted opens only the
lobby: the gate turns it back toward the booth, and the Worker refuses its socket for any other
room and its use of the shop (its collection still shows). The pass answer carries `gate` and
`adm` so the client knows which.

The ticket flow (C35; tested against a stand-in store until the store's app exists, see
`docs/DEPLOY.md`): Shopify sells tickets and passes and keeps the buyer. Its webhooks reach
`/api/store/webhook` and are checked against the store's signature before anything is read
(`apps/edge/src/storeHooks.ts`). The Worker signs in to the store's Admin API with the app's client
credentials, traded for a token that lasts a day (`apps/edge/src/storeApi.ts`). A paid order makes one ticket per unit in the ticket book
(`TicketBook.ts`, in the vote ledger's Durable Object beside the votes): a visual ID such as
`OWL-7K3Q-PX9M`, the kind, and the order and line numbers only (no names or emails). An order the
store rates low risk gets its claim link at once, through a fulfillment of its ticket lines whose
tracking link is the claim link, so the store's own shipping email delivers it; any other order
waits until a later low rating or the owner's order tag `owl-park-release` releases it (or a
refund). A refund switches off that many tickets of a line, unused ones first, and a cancellation
all of them; votes already cast stay counted. Opening the link (`#claim=<secret>`, which the page
takes out of the address bar at once) puts the order's tickets in the wallet on that device, one
device at a time; a share link (`#take=<secret>`) passes one ticket on. The turnstiles scan a ticket
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

**Opening night (C42, built; the store's side is OP-047):** the Opening Night Ticket is a Ticket
product of kind `opening-night` whose window (`owl_park.event_start`, and `event_end` or 24 hours)
is a field on the product, so a moved date is a store edit. A free order has nothing for the store
to rate, so its tickets go out at once (from `orders/create` too, in case the store does not send
`orders/paid` for it). The gate takes the ticket inside its window only; unscanned by its end, it
expires. During the window (read from the ticket product on sale, `apps/edge/src/opening.ts`) the
booth says every pass is free. After the scan, the ticket card is followed by "Your pass is free
tonight. Claim it": `POST /api/tickets/pass` makes a cart link on the store with the annual pass,
the code `OPENING_PASS_CODE` (a Worker secret) and the cart attribute `from_ticket`; the store's
checkout opens in a new tab. The pass order comes back through `orders/paid` with that attribute:
the ticket book links the pass to its Opening Night Ticket (only one that went through the gate
counts), puts the pass straight into that wallet, and switches the pass off if the ticket is
switched off. A pass bought with the code but without the link counts as a pass without a link.
`/admin/opening` (the admin key) counts the night: tickets issued and scanned, passes through the
link and without one, the conversion rate (tickets scanned that turned into a pass), and a CSV of
the night's tickets with order numbers and ticket IDs only. The Drop-1 pin's $0 entry is retired
(C42).

## 10. Feedback from visitors (built)

Feedback in the Menu (picked out in gold) opens a short form: what kind of note (bug, idea, praise, other) and up
to 1,000 characters. `POST /api/feedback` (with the pass) keeps it in the `Collections` object's
SQLite (`apps/edge/src/feedbackBox.ts`) with the collector token, the room, the screen size and the
browser's user agent; never an IP address or a name. The park's keepers read it on
`/admin/feedback` with the admin key. How to read and triage it: `docs/FEEDBACK.md`.

## 11. Open questions for the owner (with the defaults in the code)

1. Walk speed: 260 px/s today (one constant in `packages/shared/src/walk.ts`); 200 feels calmer on a phone.
2. When to buy Workers Paid ($5): before the first promoted weekend is the recommendation.
3. Which transport to launch with: the room server (needs a free Cloudflare account) or Supabase Realtime (existing account, higher message cost as rooms fill).
4. Hostname: `*.workers.dev` for a soft launch, or a park subdomain on the brand's DNS.
5. Room caps: hub 80 / grove 40 / market 40, or flat.
6. Pre-ticket access: open to all guests (today), or a bot check on `/api/pass` if abuse shows.
7. Collectibles: how purchases with money reach a collection (quest rewards, leaf-pile feathers and the shop follow canon C31; defaults in `docs/QUESTS.md` and `docs/COLLECTIBLES.md`).
8. Activities (C30): their numbers and words, defaults in `docs/ACTIVITIES.md`.
