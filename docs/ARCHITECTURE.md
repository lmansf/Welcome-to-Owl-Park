# Owl Park architecture

Status: accepted for version 1 (presence only). This document names no unreleased realm
names and no reference products; the detailed reverse-engineering notes behind it live in
the team's internal drive, not in this public repository.

## 1. What we replicate from the classic tap-to-move room worlds

The 2000s browser worlds that Owl Park takes its feel from all shared one simple model,
and so does Owl Park:

| Mechanic | Classic model | Owl Park |
| --- | --- | --- |
| Rooms | A fixed-size painted stage per room with a hidden "block" layer marking where an avatar may not stand, a foreground layer drawn in front of avatars, and trigger zones that lead to other rooms | A 1600 x 900 room with `walkable` polygons, an optional foreground image, and `doors` (trigger rectangles) in `packages/shared/rooms` |
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

## 4. Wire protocol v3 (`packages/shared/src/edge.ts`)

One WebSocket per visitor to `wss://<host>/ws/<room>?pass=<park pass>`. Every frame is one
JSON object of at most 1 KiB, except the literal heartbeat text frame `hb`, which the
Durable Object answers without waking. Coordinates are integers in room space. All timestamps
are server milliseconds; clients never put their own clock on the wire.

Client to server: `hello` (once, within 5 s; look, optional spawn name and resume position),
`move` (target and a per-connection `seq`), `look` (new colours and worn items), `drops` (this
window's finds), `pickup` (a find's number), `emote` (an emote id), `bye`.

Server to client: `welcome` (your id and position, every owl in the room with any walk in
progress, server `now`, room cap, park counts), `enter`, `move` (validated walk, sent to
everyone including the sender; only the sender's copy carries `seq`, which is the
acknowledgement), `look`, `leave`, `counts`, `full`, and for the collectibles `drops` (where this
window's finds are and what kind, never which item), `found`, `missed` (too far, already gone, or
another pickup in flight) and `emote` (to everyone else in the room).

Server rules: moves are clamped with the same `resolveTarget` the client uses, so echoes
normally match the client's prediction; a walk in progress is continued from its current
point when redirected; moves use a token bucket (burst 5, refill 2 per second) and repeated
excess closes the socket (4003); more than 40 frames in 5 s closes it; a second session for
the same visitor replaces the first (4005); full rooms answer `full` then close (4010);
idle sockets (no heartbeat for 90 s) are reaped by a one-minute alarm; at most 3 sockets per
IP address per object. Collectibles: a pickup counts only within 56 px of the owl's position on
the server clock, one at a time per visitor; worn items the visitor's collection does not hold
are dropped from a look before it is broadcast; emotes must be owned and are limited to one per
1.5 s; `drops`, `pickup` and `emote` frames count toward the frame limit.

Client rules: the clock offset is set from `welcome` and refined with a min-filter over
later `move` frames; remote owls are drawn 100 ms behind server time so jitter never shows;
the local owl walks immediately on the tap and is corrected only if the echo differs by more
than 2 px; reconnects back off from 0.5 s to 8 s and resume near the last position; a stale
bundle (protocol mismatch) reloads itself.

Everything about a visitor that must survive hibernation (id, look, position, walk, collector
id and home time zone) is kept in the socket attachment, so an object that was evicted rebuilds
every room from its sockets.

## 5. Room data (`packages/shared/rooms/index.ts`)

Rooms are data shared by the client and the server: `walkable` polygons, `spawns`, `doors`
(open with `to`, or closed with an approved `closedSign`), `mood` for ambience, `spots` where
collectible finds appear, and anchors for large set pieces. A door without `to` can be an
interactive spot (the gift shop, the idol): an entry in `interactions` in
`apps/park/src/game/RoomScene.ts` gives it a button label and an action, and standing in it shows
the button, which E also presses. New interactables, mini games included, follow that pattern. Art is referenced by key; artists replace files under
`apps/park/public/art/` and redraw the polygons. Room caps live in the server's `ROOM_CAPS`
variable (defaults: hub 80, grove 40, market 40).

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

## 8. Collectibles (built)

Visitors find wearables, pets, effects and emotes on each room's `spots`: two or three finds per
half day in the visitor's home time zone, personal to the finder, so one server serves every time
zone with arithmetic rather than timers. Identity is a per-device collector token: `/api/pass`
mints one when none is sent and folds its `cid` and the home `tz` into the pass.

- **`Collections`** Durable Object (SQLite, migration `v3`, one per park): collectors, owned
  variants and each window's drops, generated from an HMAC of the collector and window and stored,
  so they never shift. The rules are the portable `CollectionBook` in `packages/shared/src/book.ts`,
  which the local mode reuses in the browser.
- **Room object**: carries the collector per socket, checks pickups against the owl's server
  position, and vets worn items and emotes against a short-lived cache of what each collector owns.
- **HTTP**: `GET /api/collection`, `POST /api/collection/craft`, `POST /api/collection/tz` (with the
  pass), and `POST /api/admin/grant` (admin key; the hook purchases will use).

The design, the catalogue and every number: `docs/COLLECTIBLES.md`.

## 9. Ticket gating (v2, designed, not built)

Shopify `orders/paid` webhook -> the Worker records the order -> after the fraud review the
order is tagged approved -> the Worker mints a long-lived claim token and emails a link ->
the link creates a Supabase session for the buyer -> `/api/pass` mints admitted passes only for
visitors with a valid ticket window -> `GATE=ticket` makes the room server refuse guest passes.
Refunds revoke the session and the pass expires within the hour. Nothing in this flow changes
the wire protocol; v1 already carries the pass and the gate flag.

**Opening-night entry with the Drop-1 pin (canon):** each pin order mints one entry token through
the same flow at $0, with a validity window covering opening night only (date to be announced).
In the ledger that is a ticket row whose `valid_from`/`valid_until` is that night and whose order
line is the pin product; one pin, one token. The same admitted pass then also allows one Realm
Vote that night.

## 10. Open questions for the owner (with the defaults in the code)

1. Walk speed: 260 px/s today (one constant in `packages/shared/src/walk.ts`); 200 feels calmer on a phone.
2. When to buy Workers Paid ($5): before the first promoted weekend is the recommendation.
3. Which transport to launch with: the room server (needs a free Cloudflare account) or Supabase Realtime (existing account, higher message cost as rooms fill).
4. Hostname: `*.workers.dev` for a soft launch, or a park subdomain on the brand's DNS.
5. Room caps: hub 80 / grove 40 / market 40, or flat.
6. Pre-ticket access: open to all guests (today), or a bot check on `/api/pass` if abuse shows.
7. Collectibles: find rates, feather prices, the time zone rule and how purchases reach a collection (defaults in `docs/COLLECTIBLES.md`).
