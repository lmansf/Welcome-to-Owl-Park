# When the park is in trouble

- Status: BUILT; section 7 has the controls, the Menu's tabs, flight, travel and the turnstiles' question as on main 01e9722
- Verified against: branch claude/op-202-docs off main 01e9722 (2026-11-02)
- Code: apps/edge/src/health.ts, .github/workflows/uptime.yml, apps/edge/src/gateSwitch.ts, apps/edge/src/guard.ts, apps/edge/src/limits.ts, apps/edge/src/routes/admin.ts, apps/park/src/ui (hud.ts, joystick.ts, keyboard.ts, menuShell.ts, menuTabs.ts, settingsScreen.ts, home.ts, whichOwl.ts, away.ts, storeCard.ts, gatePrompt.ts, gateSale.ts, posOverlay.ts), apps/park/src/game (fitOverlay.ts, ledgePainter.ts), packages/shared/src (flight.ts, perches.ts, travel.ts, accounts.ts), tools/chaos
- Tickets: OP-067, OP-068, OP-075, OP-076, OP-077, OP-082, OP-083, OP-084, OP-099, OP-104, OP-105, OP-108, OP-126, OP-127, OP-130, OP-132, OP-138, OP-139, OP-140, OP-142, OP-153, OP-156, OP-167, OP-198
- Related: docs/CAPACITY.md, docs/DEPLOY.md, docs/ARCHITECTURE.md section 13, docs/TESTING.md, docs/MAP.md

The incident playbook for the preview and after (OP-068). Who does what: the owner decides and holds
the keys (Cloudflare, Shopify, GitHub, the admin key); Claude Duet finds the cause and fixes it on a
branch (Build hat), posts the words below once the owner approves them (Marketing hat) and keeps the
board (PM hat).

## 1. Is it down?

- The alert: every 15 minutes GitHub asks `/api/health` (`.github/workflows/uptime.yml`, with the
  park's address in the repository variable `PARK_URL`). Three failures in a row fail the run, and
  GitHub emails the owner about it (the account the workflow runs under; GitHub's notification
  settings decide where).

- On a phone, open `https://<the park's address>/api/health`. `"ok": true` means the Worker and the
  park's three objects answered: `rooms` (the rooms and the nests), `tickets` (the ticket book, the
  votes and the opening switch) and `collections` (collections, quests, the shop). A 503 names the part
  that did not answer within three seconds. `configured` says whether `PASS_SIGNING_KEY` and
  `ADMIN_KEY` are set (true or false, never their values): with either false the answer is a 503 too,
  and with the signing key missing the Worker refuses every pass and room socket (OP-209) until
  `wrangler secret put PASS_SIGNING_KEY`. No answer at all: the Worker itself, or Cloudflare
  (cloudflarestatus.com).
- The keepers' page `/admin/gate` (the admin key) shows the same check as its first line.
- Cloudflare's dashboard: Workers & Pages → the park's Worker → Metrics for errors and requests, and
  Logs for the live log. From a terminal: `pnpm --filter @owl-park/edge exec wrangler tail`.

## 2. Roll back a bad deploy

- Dashboard: Workers & Pages → the Worker → Deployments → the last good version → Rollback. From a
  terminal: `pnpm --filter @owl-park/edge exec wrangler rollback`, which lists recent versions to pick
  from (`wrangler deployments list` shows them too).
- A rollback changes the code, never the data: tickets, votes, collections and nests stay. A table a
  newer version added stays as well, and the older code leaves it alone.
- Then revert the bad change on main with a revert commit (never a force push), so the next deploy
  does not bring it back.

## 3. Pause ticket sales

- `/admin/gate` → **Open to everyone**: within ten seconds the turnstiles stop selling Day Tickets
  and every owl walks through them. Tickets already sold keep working; a ticket's time runs from its first scan
  as always.
- To stop the store as well: in Shopify, set the ticket products to Draft; they leave the store at
  once.
- To start again: **Take tickets now**, and the products back to Active.
- Spectators (OP-191) misbehaving or crowding the rooms: set `SPECTATORS` to `"off"` in
  `apps/edge/wrangler.jsonc` and deploy (`docs/DEPLOY.md`). From then on an owl without a ticket is
  turned away at the turnstiles as before; spectators already inside keep their sockets until they
  leave or the nightly restart. To keep spectators but fewer of them, lower `SPECTATOR_SHARE`.

## 4. Tickets that did not arrive

- `GET /api/admin/store` with the `X-Admin-Key` header checks the store's setup: its secrets (set or
  not, never their values), the app's sign-in and scopes, and whether it may read orders.
- Shopify admin → Settings → Notifications → Webhooks shows failed deliveries; Shopify sends a failed
  webhook again for a while, and every step on the park's side is safe to repeat.
- An order waiting on the store's check: check it, then add the order tag `owl-park-release`, or refund
  it (`docs/DEPLOY.md`, Selling tickets, step 7).
- A guest whose ticket is lost for good: a ticket without a store order, `POST /api/admin/tickets`
  (step 9), and the link it answers with.
- A buyer left on the store's Thank you page or its home page after paying: the ticket is already on
  their owl. Back at the park (`https://exploreowlpark.com/`), the turnstiles take it. Until the
  theme snippet (`docs/DEPLOY.md`, Selling tickets, step 11) is on the store, nothing sends them
  back by itself.

## 5. The free plan's daily limits

The park runs on Cloudflare's free plan: about 100,000 Worker requests and 100,000 Durable Object
requests a day, counted from midnight UTC. Past either one the park fails closed until midnight UTC.
Every owl's socket counts: its connection is one Durable Object request, and the messages owls send
count too (Cloudflare's pricing counts twenty of them as one request). Watch Workers & Pages → Usage, with a notification at half
the daily cap (`docs/DEPLOY.md`, Operations). The fix is Workers Paid at $5 a month, which lifts the
daily caps: a Money call, the owner's.

A busy day is a different limit. With the room server in one object, as today, the whole park holds
about 80 owls walking at once (`docs/ARCHITECTURE.md`, section 6); past that, moves lag and then
every owl is dropped at once and reconnects. Before a day that may bring more, such as opening
night, set `ROOM_SHARDING` to `room` in `apps/edge/wrangler.jsonc` and deploy: each room then holds
its own cap of 80. For a night busier still, the keepers' capacity page (`/admin/capacity`, no
deploy) puts a line in front of the park, turns on the busy ribbon and opens copies of a busy room:
when and how in `docs/CAPACITY.md`.

## 6. Words for when the park is down (drafts, for the owner's approval)

- Down: "Owl Park is closed for a little while. We're on it, and we'll post here as soon as the gates
  open again."
- Back: "Owl Park is open again. Thank you for waiting!"

Nothing more specific (no times, no refunds, no causes) without the owner's word.

## 7. Controls and the Menu [BUILT (OP-026, OP-034, OP-076, OP-082, OP-083, OP-084, OP-104, OP-105, OP-108, OP-114, OP-126, OP-130, OP-153, OP-167, OP-180, OP-190, OP-191, OP-198)]

What a visitor has in hand on `main` 01e9722. Nothing a visitor does needs typing, apart from a
feedback note and a grown-up's email (section 8).

**The home screen and the first run** (`apps/park/src/ui/home.ts`, `whichOwl.ts`). A device with no
owl yet shows **Make your owl**. It opens the quiz first, **Which owl are you?** (OP-076): a voice
says three lines, then eight questions, each answered with a tap on one of three pictures, then a
card for the owl's colours, and the owl is shown big in its new kind and colours. **Keep it** goes
on to Play; **Make it yours** opens the owl builder; **Not me? Try again** runs the quiz again;
**Skip**, in the corner, opens the builder at once. Nothing typed, no score, no back button; only the
result is kept, as the owl's look (`WHICH_OWL_WORDS`, `packages/shared/src/whichOwlBank.ts`). A
device with an owl shows **Play**, a line about its tickets, and Settings. Play is the one way in
(OP-105): every visit, a return after closing the tab too, lands the owl in its own nest before its
mirror (the nest is made on first sight; the lobby only if the nests do not answer), through the
line as before (`docs/CAPACITY.md`). The way to the park is marked **To the park**
(`NEST_WORDS.toPark`): a sign on the nest's door and at the street's east end
(`apps/park/src/game/street.ts`), and labelled chips at the screen's edge
(`RoomScene.updateHints`). The first time home, a card under the bar says "Welcome to your nest /
The park is out the door." (`NEST_WORDS.welcome`, `welcomeLine`), once per device, gone at a tap.

**On a phone, the pad** (`apps/park/src/ui/hud.ts`, `joystick.ts`): tap where you want to walk, or
hold the see-through thumbstick in the bottom-right corner. On the left, three 56 px buttons laid
out like a handheld's face buttons: **Interact** (the '!', nearer the middle) does what the owl
stands at, the same as E on a keyboard (talk to an NPC owl, flop in a leaf pile, browse a stall,
the gift shop, Decorate, Look in the mirror), and rests dimmed where there is nothing; the **Menu**
(darker, on the outside); and **Jump** below between them. **Emotes** sits above the Menu and
**Say** above Interact, 44 px each. All are see-through like the stick, none overlapping. Standing
at something to do also shows its own labelled button, with the '!' before the first (Light a
lantern, Cast a line, Vote for this realm, the gift shop). On a phone no tap, double tap or pinch
zooms the page (OP-104: `touch-action` in `apps/park/index.html`, and the viewport tag).

**Jump and flight** (OP-084, `packages/shared/src/flight.ts`, `perches.ts`): every owl in every
room can fly. Tap Jump (the space bar on a keyboard) to jump; tap it again in the air for a second
flap; hold it on the way down to glide, the fall held to the walk's pace over `GLIDE_SLOPE` (one
down for three along). Let go on the way up and the rise is cut short (`JUMP_CUT_SPEED`). An owl
jumps onto a perch (a root, a beam, a stump, a shelf) and stands on it; it walks off the perch's
edge to come down. A thing up on a perch (a quest spot, a leaf pile) is reached only from that
perch. Everyone in the room sees the same arc. Nothing about flight is logged.

**On a computer** (`apps/park/src/ui/keyboard.ts`, `KEY_HELP` in `settingsScreen.ts`): WASD or the
arrow keys walk while held; E uses whatever the owl stands at; the space bar jumps (again in the
air to flap, held on the way down to glide); M opens the Menu on its map; T opens Say; 1 to 8 play
an emote as the wheel numbers them; Q goes to the mirror (from the home screen into the nest, then
up to the mirror and into Your owl; Q again closes it); J opens the Menu on its quests; Escape
closes whatever is open. Say and Emotes are buttons of their own beside the Menu on the bar.

**The Menu** (OP-108, `apps/park/src/ui/menuShell.ts`, `menuTabs.ts`): one tap opens it and one
closes it. It is five tabs, each with its word always shown: **Quests**, **Collection**, **Nest**,
**Map** and **Settings**. Say is not in it.

- **Quests**: every quest carried, finished ones first, each with its next step and progress such
  as 2/5; Collect on a finished one walks the owl to its giver to hand it in; today's tasks; who
  has more (`docs/QUESTS.md`).
- **Collection**: how many things the owl has, of how many, by kind, and the style sets
  (`docs/COLLECTIBLES.md`).
- **Nest**: the owl's own nest, its friend code and whether an email protects it (with the park's
  accounts on), today's furniture gift and visiting. Away from the nest, **Open the map** shows the
  Map with the nest picked, where travel home is.
- **Map**: the park as it stands, and travel (below).
- **Settings**: **Send feedback** first (OP-167, `docs/FEEDBACK.md`), then the thumbstick, Show
  what owls say, **Sounds** (a soft knock on wood as the Menu opens), calm motion, full screen, the
  controls; the friend code and Protect this owl (with accounts on); **Retake the quiz** (a new kind
  and colours; what the owl wears stays on, and so do its id and friend code); **Tickets**, a closed
  row with each ticket's ID for the keepers; and **Leaving**: **Home screen** and, inside the park,
  **Leave the park** (after "Leave the park? Your ticket keeps running."). The home screen's own
  Settings, before the park, are the same rows, Send feedback first.

There is no Your owl tab: the owl is changed at the mirror in a nest (`docs/NESTS.md`, The mirror),
or by the first run's quiz and builder.

**Travel from the map** (OP-130, `packages/shared/src/travel.ts`): a place on the Menu's map lights
up once the owl has walked into it; the owl's own nest is always lit. A tap opens the place's card;
its button is held to travel (`HOLD_MS`, 350 ms, a fill running across it), and a quicker tap says
"Hold to travel." A key's press on the button travels at once. Travel lands the owl where walking
in would have. Into the park is only through the front gate: the great tree's card travels to the
gate, outside the turnstiles, and a place inside the park offers **Travel to the gate** until the
owl has walked through the turnstiles since it was last outside. Going home, walking out and every
new visit put it outside again. The room server keeps this and turns any other travel in away. No
travel mid-climb, mid-game, at the turnstiles, while decorating or while "Still here?" asks
("Finish what you are doing, then travel."). Go home is retired: home is **Travel home** on the map.

**Quest news**: no pop-ups during play. A new or finished quest shows a 2 s line at the top edge
("New quest: its name", "Quest complete: its name") and a gold dot on the Menu button and on the
Menu's Quests tab until Quests opens. The on-screen quest tracker and the daily tasks' progress
toast are gone (a finished task still says so). The owner kept the New quest line for now
(2026-10-23) and may drop it if it proves noisy.

**Your owl**: Play lands the owl in its own nest facing the mirror; Look in the mirror (Interact,
or E) opens Your owl with the owl in the room as the live preview. Any nest's mirror works and
changes only the owl looking into it.

**Idle owls** (OP-126, `apps/park/src/ui/away.ts`, `RoomScene.rest`): an owl whose page has had no
key, touch, click or scroll for 45 s, with no walk under way and no stick held, falls asleep where it
stands, for everyone; anything its visitor does wakes it. Never during a climb, a game, the
turnstiles or decorating. Asleep 10 minutes anywhere but its own nest, "Still here?" asks with one
button (I'm here!). With no answer in a minute the owl leaves its room as any visitor does: the room
server sees a normal leave, so its place frees and the session ends there. The screen then says
"Your owl dozed off and went home to its nest." with **Come back**. At home an owl sleeps as long as
it likes. Sleeping is one flag on the owl (the `rest` frame, protocol v11), never logged. For a
visit, `?sleep=`, `?away=` and `?answer=` (seconds) shorten the three waits (`apps/park/src/config.ts`).

**Tickets** (OP-180, OP-198): there is no ticket booth to walk up to. While the gate takes tickets,
a turnstile reached without a ticket that works says why. With spectators on (`SPECTATORS`), it
first asks the turnstiles' question (OP-198, `apps/park/src/ui/gatePrompt.ts`): "No ticket yet? A
Day Ticket lets you keep what you win." with **Buy a Day Ticket** and **Enter as a guest**, and
"Guests can look around and play, but keep nothing they win." under them. Enter as a guest walks the
owl on in as a spectator. Escape, or a tap beside the card, is neither: the owl steps back out, and
the turnstiles ask again the next time it walks in. Buy a Day Ticket (or the turnstile itself, with
spectators off) opens the turnstiles' sale (`gateSale.ts`) on the card before the store.

**The card before the store** (OP-153, `apps/park/src/ui/storeCard.ts`): every way from the park to
the store's pages shows this one card first, once for each purchase, right before it: the
turnstiles' Day Ticket, opening night's pass offer after the turnstiles, and the gift shop's door.
Its line is "Ask a grown-up before buying" (`STORE_WORDS.ask`, a draft until the owner approves the
final words), with **Continue** and **Not now**; no timer and no spending limit. At the turnstiles,
with the annual pass's cart link to hand, Continue reads **Day Ticket** and **Annual Pass** sits
beside it, under "Or get the Annual Pass and come back all year." (`UPGRADE_WORDS`, drafts). Under
its buttons, with the park's accounts on, "Have a ticket on another screen?" offers **Bring your owl
here** (OP-183): a ticket is the owl's, not the screen's, so it lets the owl in on any screen it plays
on, and this opens the same emailed-link box as the home screen's I already have an owl. Not now,
Escape or a tap beside the card goes back to where the visitor was. `storeCard.ts` is the only file in
the park's code that opens a window or a link off the park, and its test reads the code for any other.

Continue opens checkout in its own window, and a small card over the game keeps Back to checkout and
Cancel until the ticket lands. When it lands, the owl, still at the turnstiles, goes through them by
itself with it (OP-190), and the page says "Your ticket is here. In you go!"; an owl that wandered
off hears "Your ticket is here. It works at the turnstiles.", and a ticket held for the store's check
"Your ticket is here. It works as soon as the store’s quick check is done." (no owl goes in on it
until then). The store sends the buyer from its Thank you page back to
`https://exploreowlpark.com/?checkout=done` (once the theme snippet in `docs/DEPLOY.md`, Selling
tickets, step 11, is applied): with the game open in another window, checkout's window closes
itself, or shows "You're all set. Your ticket is waiting in the park window." with **Play here
instead**; with no game open (a phone's tab put to sleep), the park starts in that window, says "Your
ticket is here. Press Play and in you go!", and Play takes the owl to the turnstiles and through
them. The annual pass is offered beside the Day Ticket, once, before paying: the half-price pass is
no longer offered after a Day Ticket bought on the card (`PASS_AFTER_DAY_TICKET` is `false`,
`apps/park/src/ui/tickets.ts`); opening night's own offer stays (`docs/DEPLOY.md`, step 10). A
ticket's status shows only at the turnstiles; the Menu's Settings keep the tickets in the closed
Tickets row, with their IDs for the keepers.

**Spectators** (OP-191, only while `SPECTATORS` is `on`; the words are drafts for the owner's
approval, in `apps/park/src/ui/spectator.ts`): a guest through the turnstiles hears "Welcome in! You
can get a Day Ticket any time from the button up top." A small "Just looking" badge under the top bar
has **Get a Day Ticket** ("A Day Ticket lets you keep what you win." above the card before the
store). The quests, the NPC owls, the leaf piles, the stalls, the feather shop, the gift and the gift
shop's door say "Quests and the shops are for ticket holders. You can get a Day Ticket right here.";
the idol says "Ticket holders vote here, one vote a day." and then offers the card. The arcade and the
climb end with "Nice run! With a Day Ticket this would have earned N feathers." (or "With a Day
Ticket, games earn feathers." when the run would have earned none) over Get a Day Ticket and Play
again; fishing, the copy game, the quiz and the beam add "With a Day Ticket this would have earned N
feathers." to their own line, and the card follows at most once every five minutes. A room past its
spectators' share says "This part of the park is busy. A Day Ticket gets you in." A ticket bought
from inside lands where the owl stands: "Your Day Ticket is in. Have fun!", the badge goes, and the
quests open, with no reload. Nests and the mirror stay open to a spectator.

A mirrored pad for left-handed play is a feedback candidate, not built (`docs/FEEDBACK.md`).

## 8. A family that lost its owl [BUILT (OP-139)]

An owl is its collector id, held by one screen at a time (`packages/shared/src/accounts.ts`). What a
keeper can do depends on whether an email protects it. The Menu's Nest and Settings tabs show which
("Protected: this owl can come back on another screen." or "This owl lives only on this screen.").

- **Not protected**: nothing can be done. The owl lived only in that browser; a lost screen or a
  cleared browser takes it. The keepers cannot find it or bring it back. The family makes a new owl, and a grown-up can protect it (Protect this owl, in the Nest or
  Settings tab) so it can come back next time.
- **Protected**: the family brings it back themselves. On the new screen, **I already have an owl**
  on the home screen (or **Bring your owl here** on the card before the store) asks a grown-up for
  the email that protects it; the park mails a link (good for `MAGIC_LINK_MS`, 15 minutes, used once;
  at most `LINKS_PER_EMAIL_PER_HOUR`, 3, per email and `LINKS_PER_IP_PER_HOUR`, 10, per address). On
  that screen the link shows the email's owls as pictures; a tap on theirs brings it there, and the
  screen it was on finds it moved. The answer is the same whether the email protects an owl or not,
  so the keepers never confirm an email either.
- A link that ran out says so and sends them back to I already have an owl for a new one; "That's
  plenty of links for now" means the hourly limit: an hour's wait.
- No mail at all: the accounts need `ACCOUNT_SECRET` and the mail sender (`docs/DEPLOY.md`,
  Accounts). Without them no link goes out.

## 9. Two lines in the log [BUILT (OP-140, OP-141, OP-142)]

**`csp_violation`** (`worker.guard`, warn; `noteViolation`, `apps/edge/src/guard.ts`): a browser
reported that the park's page policy (`parkPolicy`) blocked something. One line per kind of
violation every `REPORT_EVERY_MS` (10 minutes), with `count`, how many came since, so a broken policy
on a busy night is a few lines. Its fields: `directive`, `blocked` (`inline`, `eval`, `data`, `blob`,
an extension's scheme, or an address without its query), `page` (the path only), and the `source` and
`line` of the script that tried.

- `blocked` names `https://example.invalid`: the security check's own report (`docs/SECURITY.md`).
  Nothing to do.
- `blocked` is an extension's scheme (`chrome-extension`, `moz-extension`, `safari-web-extension`)
  or an address the park never uses: a visitor's add-on, or something injected into the page. The
  policy did its job. Nothing to do unless the lines keep coming from many pages.
- `blocked` is something the park needs (its own art, a font, a new service it calls), and the page
  broke for visitors: the policy is missing a source. Fix `parkPolicy` in `guard.ts` on a branch,
  with the reason for the source, and deploy.

**`rate_limited`** (`worker.guard`, warn; `apps/edge/src/index.ts`, `apps/edge/src/limits.ts`): calls
came too fast, and the Worker answers 429 with Retry-After until the minute is out. One line per key
per minute, the first over. Its fields: `route`, `limit` (which of `API_LIMITS`: `address` 600,
`public` 300, `refused` 60, `visitor` 120 or `ticket` 10 a minute), `retry_after_s`, and a
`collector_hash` when an owl's pass came with the call.

- A few lines, `limit` `visitor` or `ticket`, one `collector_hash`: one page or script calling too
  fast. A page never does in play (it polls the line at most every 5 s); look for a stuck page or a
  script.
- `limit` `address`, many routes: a school, an office or a phone network on one address, or a
  flood. The counts are kept in each copy of the Worker's memory, so a flood spread over
  Cloudflare's machines is Cloudflare's protection's to stop.
- `RATE_LIMITS` (`apps/edge/wrangler.jsonc`) is `on` always. `off` is only for a load test's
  throwaway copy (`tools/load/throwaway-config.mjs`), whose bots all come from one machine. Never
  set it `off` on the live park to get round a limit.

## 10. The keepers' tools in the page [BUILT (OP-127, OP-138, OP-156)]

Each is a query on the park's address. The keepers' key is asked for in the page and kept in that
tab only (`sessionStorage`); a wrong key shows nothing.

**The position overlay, `?pos=1`** (OP-138, `apps/park/src/ui/posOverlay.ts`), for a report of an
owl jumping. It asks once a tab for the keepers' key and checks it with `GET /api/admin/ping`.
Top left over the park it lists: `owl x,y`, where the owl is drawn; `jumps N`, the jumps seen; and
the last five things the room said, with their age: `room x,y` (its welcome), `walk x,y > x,y` (the
echo of a walk) and `moved x,y > x,y` (the owl put at the room's spot, the room unable to walk it
over). The panel flashes red for 1.2 s, and the count goes up, each time the owl moves further than
`JUMP_PX` (60 room px, about an owl's width) between two frames beyond what its walk covers in that
frame (up to `WALK_FRAME_MS`, 600 ms, of it). Going into another room is no jump.

**The fit overlay, `?boxes=1`** (OP-127, `apps/park/src/game/fitOverlay.ts`): in a development build,
or a build with `VITE_BOXES=on`. It draws everything the park checks a tap or a step against. Pink:
a spot's trigger (where the owl must stand); gold: a doorway's; cyan circles: how near an owl must
be; green: tap areas; cream: what a sprite draws; yellow: the object itself without its glow; red
dots and ticks: visual centres, worn-item anchors and where a marker stands; red shading: floor shut
for now; lime: a perch's top as an owl on it is drawn, and faintly where that is on the floor plan.
Run it again whenever a style set adds wearables.

**Walking a closed realm, `?keeper=1`** (OP-156, `apps/park/src/net/keeper.ts`): the page asks for
the keepers' key once and swaps it at `POST /api/admin/keeper` for a keeper's token good for 12 hours
(`KEEPER_TTL_S`), kept in that tab only, never the key. Every hello carries the token, and the room
reads it only at the door of a realm the keepers keep closed. The tree (map 2) is reached this way
while it is dark (`?keeper=1&room=l1`).

**Painting a level's ledges, `?keeper=1&paint=1&room=l1`** (OP-156, `apps/park/src/game/ledgePainter.ts`):
the painter over a room of the tree, for a tab with a keeper's token. It draws the room's ledges,
fronts and places, or the draft a keeper saved:

| Colour | What |
| --- | --- |
| Green line, a handle at each end, its height as a label | a ledge |
| Red upright | a wall |
| Orange line | a hazard |
| Translucent blue polygon | a front (drawn in front of the owls) |
| Violet pin with its name | a placed named spot |
| Dashed line | a suggestion |

- The tools: **Select**, **Ledge**, **Wall**, **Hazard**, **Front** and **Spot**. With Ledge, Wall
  or Hazard, a drag over empty ground draws one. A press on an end, a line or a front's point picks
  it and drags it. With Front each tap is a point; a tap on the first, or Enter, closes it.
- **Suggest** reads ledges off the playfield of the screen in view; a tap takes a suggestion.
- **Undo** (or Ctrl+Z) takes back a change; **Delete** (or the Delete key) removes the picked item;
  Escape lets a front being drawn and the suggestions go.
- **Try** (on at the start): the owl stands on the draft's ledges in this page only. The room server
  keeps to the room's own, so others see the owl as the room has it, and `position_rejected` lines
  for it are expected.
- **Spot**: pick a name from its list (the level's named spots, `packages/shared/src/treeSpots.ts`,
  west to east, each placed one ticked), then tap where its thing stands: a door's or a stair's
  threshold middle on the walking surface, or an idol's, a booth's or a guardian's base centre. A
  pin dragged moves it.
- **Save** sends the draft with the tab's token (`POST /api/admin/masks/<room>`); a new save replaces
  the old.
- `pnpm masks:pull <room>` (`tools/masks/pull.mjs`; `--base <url>`, else `PARK_BASE`, else
  `http://localhost:8787`) prints the saved draft as room data: ledges and fronts to paste into the
  room in `packages/shared/rooms/index.ts`, spots as the room's `places` (which the game does not read
  yet), walls and hazards as JSON. It writes nothing; the room data changes in a pull request.

`docs/MAP.md` is the tree's own doc.

## 11. Rehearsing trouble: the chaos harness [BUILT (OP-132)]

`pnpm chaos <experiment>` (`tools/chaos/run.mjs`) runs one experiment against a throwaway park on
this machine; nothing is deployed and the live park is never touched. `pnpm chaos --list` lists the
experiments and which can run. In Actions: Actions → Chaos → Run workflow
(`.github/workflows/chaos.yml`, by hand only). The run's folder is
`tools/chaos/results/<date>-<experiment>/`, and `tools/chaos/results/INDEX.md` lists every run.
`docs/TESTING.md` describes the harness.

- Run the experiment that matches a change before a busy night: the room server killed (1), the
  store's webhook failing (3), the hub full (4), a slow phone (5), a fast clock (6), an emote flood
  (7), the collection log down (8), a page worked from the console (9). Experiment 2 (the fraud
  endpoint) waits on OP-053.
- A run exits 0 when the hypothesis held and the park came back, 1 when not, 2 when it could not
  start. It always rolls back, and aborts when any steady-state check has failed for more than 30 s.
- A failed run writes `proposed-tickets.json`. Under the QA hat, file what is new on the board.
- OPEN QUESTION: the Chaos workflow's choice lists experiments 1 to 8; experiment 9 runs only from a
  terminal (`chaos.yml`, `tools/chaos/experiments/index.mjs`).

## 12. After

A line on the board: what happened, how long, what changed, and the ticket for any follow-up.
