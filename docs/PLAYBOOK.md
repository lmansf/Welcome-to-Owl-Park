# When the park is in trouble

- Status: BUILT; section 7 has the pad, the hop, quests in the Menu and the mirror as merged 2026-10-23
- Verified against: main 8a1bbb9 (2026-10-23, the pad OP-082, quests in the Menu OP-083 and the mirror OP-077 merged)
- Code: apps/edge/src/health.ts, .github/workflows/uptime.yml, apps/edge/src/gateSwitch.ts, apps/park/src/ui (hud.ts, joystick.ts, keyboard.ts, menu.ts, quests.ts), apps/park/src/game/hop.ts
- Tickets: OP-067, OP-068, OP-077, OP-082, OP-083, OP-099
- Related: docs/CAPACITY.md, docs/DEPLOY.md, docs/ARCHITECTURE.md section 13

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
  that did not answer within three seconds. No answer at all: the Worker itself, or Cloudflare
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

- `/admin/gate` → **Open to everyone**: within ten seconds the booth stops selling and every owl walks
  through the turnstiles. Tickets already sold keep working; a ticket's time runs from its first scan
  as always.
- To stop the store as well: in Shopify, set the ticket products to Draft; they leave the store at
  once.
- To start again: **Take tickets now**, and the products back to Active.

## 4. Tickets that did not arrive

- `GET /api/admin/store` with the `X-Admin-Key` header checks the store's setup: its secrets (set or
  not, never their values), the app's sign-in and scopes, and whether it may read orders.
- Shopify admin → Settings → Notifications → Webhooks shows failed deliveries; Shopify sends a failed
  webhook again for a while, and every step on the park's side is safe to repeat.
- An order waiting on the store's check: check it, then add the order tag `owl-park-release`, or refund
  it (`docs/DEPLOY.md`, Selling tickets, step 7).
- A guest whose ticket is lost for good: a ticket without a store order, `POST /api/admin/tickets`
  (step 9), and the link it answers with.

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
its own cap of 80.

## 6. Words for when the park is down (drafts, for the owner's approval)

- Down: "Owl Park is closed for a little while. We're on it, and we'll post here as soon as the gates
  open again."
- Back: "Owl Park is open again. Thank you for waiting!"

Nothing more specific (no times, no refunds, no causes) without the owner's word.

## 7. Controls and the Menu [BUILT (OP-026, OP-034, OP-082, OP-083, OP-077)]

What a visitor has in hand on main 8a1bbb9. Nothing a visitor does needs typing.

**On a phone, the pad** (`apps/park/src/ui/hud.ts`, `joystick.ts`): tap where you want to walk, or
hold the see-through thumbstick in the bottom-right corner. On the left, two round buttons on a
diagonal: **Interact** (nearer the middle) does what the owl stands at, the same as E on a keyboard
(talk to an NPC owl, flop in a leaf pile, browse a stall, the booth, Decorate, Look in the mirror),
and rests dimmed where there is nothing; **Jump** (nearer the corner) hops. The **Menu** is a smaller,
darker round button tucked in the bottom-left corner, and **Emotes** sits above the pad. All are
see-through like the stick, each at least 44 px, none overlapping. Standing at something to do also
shows its own labelled button (Light a lantern, Cast a line, Vote for this realm, the gift shop).

**On a computer**: WASD or the arrow keys walk while held; E uses whatever the owl stands at; the
space bar hops; T opens Say; 1 to 8 play an emote as the wheel numbers them; M opens the Menu; Q
goes to the mirror (from the home screen into the nest, then up to the mirror and into Your owl; Q
again closes it); J the quests; Escape closes whatever is open (`apps/park/src/ui/keyboard.ts`).

**The hop** (`apps/park/src/game/hop.ts`): a 0.4 s jump with a two-frame wing flap, no sound, that
lifts only the drawing of the owl (`HOP_MS`, `HOP_HEIGHT`); the owl's place in the room never
changes, so it cannot cross a gap or reach a ledge. Everyone in the room sees it: it travels as the
emote `jump` (`JUMP_EMOTE` in `packages/shared/src/collectibles.ts`; `hop` is a collectible emote's
id). A page sends one at most every 600 ms (`JUMP_EVERY_MS`); the room server passes one per owl
every 480 ms (`jumpEveryMs` in `apps/edge/src/Room.ts`) and drops faster ones quietly, apart from
the emotes' own 1.5 s limit. No quest counts a hop. A long press on Jump does nothing. LATER
(OP-084), not for the preview: the hop may grow into flight (double flap, hold-to-glide, upper
levels); it is built as its own height offset so flight can replace it. A mirrored pad for
left-handed play is a feedback candidate, not built (`docs/FEEDBACK.md`).

**The Menu** holds: Say (a prewritten phrase in a bubble, `docs/ARCHITECTURE.md` section 11),
Quests (every quest carried, finished ones first, each with its next step and progress such as 2/5;
Collect on a finished one walks the owl to its giver to hand it in; today's tasks; who has more),
Settings (quest cards, thumbstick, calm motion, full screen, the controls, Show what owls say; kept
on the device and shared with the home screen), Feedback (in gold, `docs/FEEDBACK.md`), and the
ways out: Go home (to the owl's own nest), Leave the park (inside the park, after "Leave the park?
Your ticket keeps running.") and Home screen. There is no Your owl tile: the owl is changed at the
mirror in a nest (`docs/NESTS.md`, The mirror), or by Make your owl on a device's first visit.

**Quest news**: no pop-ups during play. A new or finished quest shows a 2 s line at the top edge
("New quest: its name", "Quest complete: its name") and a gold dot on the Menu button and on the
Menu's Quests tile until Quests opens. The on-screen quest tracker and the daily tasks' progress
toast are gone (a finished task still says so). The owner kept the New quest line for now
(2026-10-23) and may drop it if it proves noisy.

**Your owl**: Go to your nest on the home screen lands the owl in its own nest facing the mirror;
Look in the mirror (Interact, or E) opens Your owl with the owl in the room as the live preview.
Any nest's mirror works and changes only the owl looking into it.

## 8. After

A line on the board: what happened, how long, what changed, and the ticket for any follow-up.
