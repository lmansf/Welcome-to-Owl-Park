# Glossary

- Status: first pass (OP-081 names this file; written by the doc agent 2026-10-23)
- Verified against: main 8a1bbb9 (2026-10-23, the pad OP-082, quests in the Menu OP-083 and the mirror OP-077 merged)
- Code: the file named on each line
- Tickets: OP-081
- Related: docs/README.md (the map), docs/agents.md (the roster)

One line per term, as the code, the Ticket Board and the Creative Bible use it, with the file that
defines it. Alphabetical. Grep the term.

## The park

- **Activity**: a thing to do in a room that pays feathers under a shared daily cap (lanterns, the stage quiz, fishing, the copy game); `packages/shared/src/activities.ts`, `docs/ACTIVITIES.md`.
- **Arcade**: the room off the neon street's east end with three cabinets; public name "Neon Roost" or "the Owl Park arcade"; `packages/shared/src/arcade.ts`.
- **Blockade** (closed sign): the painted barricade in a closed realm's arch; it may show only a phrase from `CLOSED_SIGNS` (`packages/shared/rooms/index.ts`): "Not Yet Fledged", "Closed for Molting", "Pardon Our Feathers", "Hatching Soon".
- **Booth**: the ticket booth in the lobby; sells only while the gate takes tickets; `apps/park/src/ui/booth.ts`.
- **Cap**: the most owls a room holds; `ROOM_CAPS` or the defaults in `apps/edge/src/rooms.ts`; `docs/CAPACITY.md`.
- **Colourway**: one of the hue rotations of a wearable or pet; variant id `<item>~<n>`; `docs/COLLECTIBLES.md`.
- **Collectible**: a wearable, pet, effect or emote an owl can own; `CATALOGUE` in `packages/shared/src/collectibles.ts`.
- **Collection**: everything a collector owns plus feathers and quest progress; the `Collections` Durable Object; rules in `packages/shared/src/book.ts`.
- **Duplicate**: a collectible earned again; pays feathers by rarity (`DUPLICATE_FEATHERS`).
- **Emote**: a short animation an owl plays, seen by the room; owned like any collectible; one per 1.5 s per owl.
- **Feathers**: the park's free currency; earned from quests, leaf piles, activities and duplicates; spent in the shop; never sold for money (C31).
- **Gate** (the turnstiles): where a ticket is scanned on the way from the lobby into the hub; `apps/edge/src/gate.ts`.
- **Grove**: the room id of the storybook realm (public description: the treehouse clearing). Realm names stay out of this repository.
- **Guardian**: the storybook realm's mythical owl, its idol for the Realm Vote; a different character from the mascot (C25).
- **Homes**: the room id of the street of nests outside the turnstiles; `docs/NESTS.md`. Tickets call the area "the Village", a working name visitors never see.
- **Hop** (Jump): the 0.4 s wing-flap jump every owl has, from the pad's Jump button or the space bar; lifts only the drawing, travels as the emote `jump` (`JUMP_EMOTE`); `apps/park/src/game/hop.ts` (OP-082).
- **Hub**: the room id of the central room inside the great tree; the arrival spot after the turnstiles is also the way out (C43).
- **Idol**: a realm's mythical owl, tapped to cast the Realm Vote; `docs/ARCHITECTURE.md` section 7.
- **Interactable**: a leaf pile, stall or moonbeam an owl uses with one action; `packages/shared/src/interactables.ts`.
- **Keepers**: the people who run the park (the owner and the agents); the keepers' pages are `/admin/*`.
- **Lobby**: the room id where every visitor arrives: the booth, the turnstiles, the lane to the nests.
- **Market**: the room id of the neon market realm (public description: the neon street); holds Nova's shop and the robot owl.
- **Mascot**: the great horned owl of the feed and the home screen; not the guardian (C25).
- **Menu**: the one button that opens Say, Quests, Settings, Feedback and the ways out; on a phone the small dark button in the pad's corner; `apps/park/src/ui/menu.ts`.
- **Mirror**: the standing mirror in every nest where an owl changes how it looks (Look in the mirror opens Your owl); `NEST_MIRROR`, `apps/park/src/game/mirror.ts` (OP-077).
- **Nest**: an owl's own round room on the street; room id `nest-<nestId>`; `packages/shared/src/homes.ts`.
- **NPC owl**: one of six resident owls that give quests; `packages/shared/src/npcs.ts`.
- **Pad**: the phone controls: the thumbstick on the right, Interact and Jump on a diagonal on the left, the Menu small in the corner, Emotes above; `apps/park/src/ui/hud.ts` (OP-082).
- **Park day**: midnight to midnight in `PARK_TIME_ZONE` (America/New_York, `packages/shared/src/parktime.ts`); daily quests, the shop and the vote turn on it.
- **Phrase** (Say): one of 24 prewritten lines an owl can say; only its number travels; `packages/shared/src/phrases.ts` (C44).
- **Quest**: a giver, ordered steps and a reward; cadence story, daily or weekly; `packages/shared/src/quests.ts`, `questCatalog.ts`, `questbook.ts`.
- **Rarity**: common, uncommon, rare, epic (`RARITIES`); sets shop prices and duplicate payouts.
- **Realm**: an art style and mood off the hub, each with its own mythical owl; two open (grove, market), two closed. Names are internal until OP-069.
- **Realm Vote**: one vote per wallet per park day at an idol; the month's winner sets the next merch drop; `apps/edge/src/Ledger.ts` (C27, C42).
- **Room**: a painted stage of one or more 1600 x 900 screens with walkable polygons, spawns and doors; `packages/shared/rooms/index.ts`.
- **Shop** (Nova's feather shop): the rotating shelf on the neon street; `packages/shared/src/shop.ts`.
- **Species**: the kind of owl (great horned, barn, burrowing, snowy, screech); `packages/shared/src/species.ts`.
- **Tasks** (three a day): the same three small tasks for everyone each park day; `dailyTasks` in `activities.ts`.
- **Variant**: one owned thing: `<item>~<colourway>` for wearables, pets and effects, a bare id for emotes.
- **Wallet** (ticket wallet): the tickets held on this device; `apps/edge/src/TicketBook.ts` `wallet`.
- **Wearable**: a head, face or neck item an owl wears; anchored to the species' art; `docs/COLLECTIBLES.md`.

## Identity, tickets and the store

- **Admitted pass** (`adm`): a pass the gate issued for a scanned ticket; opens the rooms inside the turnstiles when the gate takes tickets; `apps/edge/src/pass.ts`, `gate.ts`.
- **Claim link**: the link in the store's "Your ticket" email, `#claim=<secret>`; opening it moves the order's live tickets onto this device; `TicketBook.claim`.
- **Collector token** (`cid`): the anonymous, HMAC-signed token a device keeps in `localStorage` (`owl-park:collector`); names its collection, nest and wallet; `apps/edge/src/pass.ts`.
- **Device**: in the ticket book, the collector id of the browser holding a ticket (C35: one device at a time).
- **Dev key** (development signing key): what the Worker signs with until `PASS_SIGNING_KEY` is set; it logs a warning; `signingSecret` in `pass.ts`.
- **First scan**: the moment a ticket's time starts (a day ticket 24 h, an annual pass 365 days); `DEFAULT_LENGTH_MS` in `apps/edge/src/tickets.ts`.
- **Fraud link**: C45; every paid ticket order scored by the owner's pipeline before release (2 s budget, fail open, 24 h fail-open on reviews); PLANNED (OP-052, OP-053, OP-072); `docs/ARCHITECTURE.md` section 12.
- **Fail open**: when the fraud endpoint does not answer in 2 s, or a review sits 24 h, the order is released and recorded as `fallback_used` / `fail_open` (C45).
- **Guest pass** (park pass): the Worker-signed token every visitor gets from `GET /api/pass`; lasts 12 h (`GUEST_PASS_TTL_S`); carries `id`, `cid`, `iat`, `exp`, `adm`.
- **Held order**: an order the store did not rate low risk; its tickets exist but are off until a low rating, the release tag or a refund; `apps/edge/src/storeHooks.ts`.
- **Metaobject mirror**: the store's optional copy of each ticket (`owl_park_ticket`), kept current by the Worker and never read by the park; `apps/edge/src/storeApi.ts`.
- **Opening switch**: the keepers' flip of the gate between open and taking tickets on `/admin/gate`, no deploy; `apps/edge/src/gateSwitch.ts` (OP-067).
- **Opening night**: C42; a free Opening Night Ticket for a 24-hour window and the annual pass at half price through the in-park link (OP-062); `/admin/opening`.
- **Preview** (Preview Ticket): PLANNED (OP-063); the park opens early, target 2026-12-01 (OP-066), with a $0.99 ticket and a feedback pledge.
- **Release tag**: the order tag `owl-park-release` the owner adds to release a held order (`RELEASE_TAG`).
- **Risk rating**: Shopify's own fraud assessment of an order (`risk` in `ORDER_QUERY`); low risk releases tickets at once under C35's default.
- **Share link**: `#take=<secret>`; passes one unused ticket to another device; `TicketBook.share`, `take`.
- **Ticket ID**: the visual id such as `OWL-7K3Q-PX9M` (`ID_ALPHABET` in `tickets.ts`); for display and support only, the link carries the secret.
- **Ticket kind**: `day`, `night`, `annual`, `event`, `opening-night` (and `preview`, PLANNED); the store's metafield `owl_park.ticket_kind`.
- **Webhook**: the store's signed message to `/api/store/webhook` (`orders/paid`, `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create`, `orders/risk_assessment_changed`); refused without a key.

## The system

- **Durable Object** (object): Cloudflare's single-threaded stateful unit; the park has three classes: `RoomObject` (rooms, nests, sockets), `VoteLedger` (votes, the ticket book, the opening switch), `Collections` (collections, quests, the shop, feedback, nests' data); `apps/edge/wrangler.jsonc`.
- **Edge** (transport): the room server path, `?transport=edge`; the other transports are `local` (tabs on one device) and `supabase`; `apps/park/src/net`.
- **Frame**: one JSON message on the socket (at most 1 KiB), or the heartbeat text `hb`; `packages/shared/src/edge.ts`.
- **Hibernation**: Durable Object WebSockets that survive the object being evicted; everything a visitor needs is in the socket attachment; `apps/edge/src/RoomObject.ts`.
- **Protocol version**: `EDGE_PROTOCOL_VERSION` (8) in `packages/shared/src/edge.ts`; a mismatch makes the page reload itself once.
- **Room server**: the Worker plus the `RoomObject`; authoritative for positions, quests and activities; `apps/edge`.
- **`ROOM_SHARDING`**: `single` (the whole park in one object, today) or `room` (one object per room); `wrangler.jsonc`, `docs/CAPACITY.md`.
- **Secrets**: `PASS_SIGNING_KEY`, `ADMIN_KEY`, `SHOPIFY_SHOP`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `OPENING_PASS_CODE`; set with `wrangler secret put` or as GitHub repository secrets, never in a file; `apps/edge/src/env.ts`.
- **Walk**: a straight move at `WALK_SPEED` (260 px/s, `packages/shared/src/walk.ts`) from a tap, clamped to the walkable area by `resolveTarget`.
- **Worker**: the Cloudflare Worker that serves the client, the API and the sockets; `apps/edge/src/index.ts`.

## The project

- **Bible** (Creative Bible): the Google Doc of canon, PROPOSALS, the MERGE LOG and the AGENT DISCUSSION; append-only; Crow merges.
- **Board** (Ticket Board): the Google Sheet with every ticket; `docs/README.md`, The Ticket Board.
- **C-number** (C35, C45): a numbered proposal in the Bible; canon once the owner approves and Crow merges it.
- **Canon**: what the Bible states as decided; changes only through a proposal.
- **Finding**: a ticket of Type Finding filed by QA or Red Team for Claude Code (OP-080's format).
- **Flags**: Money, Account, Price, Public-facing, Legal or naming, Deletion, Customer data; a flagged ticket goes to the owner first.
- **Needs Logan**: the board status for a decision or approval only the owner can give.
- **OP-###**: a ticket id on the board; its row is the number plus one.
- **Provenance**: `tools/art/provenance.jsonl`, one line per published art file saying how it was made.
- **Seedream**: the image model the art comes from, through fal.ai (C29); `docs/ART-PIPELINE.md`.
- **TODO-DOCS**: the comment Claude Code leaves in code when a change needs a doc change (OP-081).
