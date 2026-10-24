# When the park is in trouble

- Status: BUILT; section 7 marks the coming controls PLANNED (OP-082, OP-083)
- Verified against: main 67ca3ab (2026-10-23)
- Code: apps/edge/src/health.ts, .github/workflows/uptime.yml, apps/edge/src/gateSwitch.ts, apps/park/src/ui
- Tickets: OP-067, OP-068, OP-099
- Related: docs/CAPACITY.md, docs/DEPLOY.md, docs/ARCHITECTURE.md section 13

The incident playbook for the preview and after (OP-068). Who does what: the owner decides and holds
the keys (Cloudflare, Shopify, GitHub, the admin key); Claude Code finds the cause and fixes it on a
branch; Crow posts the words below once the owner approves them; Claude keeps the board.

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

## 7. Controls and the Menu [BUILT; the pad and quests-in-Menu PLANNED (OP-082, OP-083)]

What a visitor has in hand today (main 67ca3ab), and what is coming. Nothing a visitor does needs
typing.

**Today, on a phone**: tap where you want to walk, or use the see-through thumbstick in the
bottom-right corner (OP-026). Two buttons sit at the bottom: **Emotes** opens the emote wheel and
**Menu** opens everything else (OP-034). Standing at something to do shows its own button (Light a
lantern, Cast a line, Talk, Flop in, Decorate, Vote for this realm, the gift shop).

**Today, on a computer**: WASD or the arrow keys walk while held; E uses whatever the owl stands at;
T opens Say; 1 to 8 play an emote as the wheel numbers them; M opens the Menu; Q the owl builder;
J the quests; Escape closes whatever is open.

**The Menu** holds: Say (a prewritten phrase in a bubble, `docs/ARCHITECTURE.md` section 11), Your
owl (the owl builder), Quests (the quests under way, today's tasks and who has more), Settings
(quest cards, thumbstick, calm motion, full screen, the controls, Show what owls say; kept on the
device and shared with the home screen), Feedback (in gold, `docs/FEEDBACK.md`), and the ways out:
Go home (to the owl's own nest), Leave the park (inside the park, after "Leave the park? Your ticket
keeps running.") and Home screen.

PLANNED (OP-082, In progress; not live yet): a Game Boy Advance SP style pad on phones. The
joystick stays on the right at its size and translucency. Two round buttons on the left on a
diagonal: the inner one is **Interact** (what the on-screen action button does today), the outer
one **Jump**, a short hop with a two-frame wing flap, about 400 ms, silent by default, purely visual
(it never moves the owl or crosses a gap) and seen by the room as a `hop` emote, at most one per
600 ms. A third, smaller, darker button tucked toward the bottom-left corner opens the **Menu**; the
standalone Menu button then goes. Touch targets at least 44 px; the same translucency throughout.
On a computer the space bar hops; nothing else changes. Open on the ticket: whether the Emotes
button stays or joins the pad, and a mirrored pad for left-handed play (`docs/FEEDBACK.md`,
candidates).

PLANNED (OP-083, In progress; not live yet): quests leave the screen for the Menu. A new quest
or a finished one shows a badge dot on the Menu button and a 2-second toast at the top edge ("New
quest", "Quest complete"), then goes quiet; the Quests tab lists each active quest with its goal and
progress, and the reward is collected there (tap the quest, tap Collect). The owner decides after
trying it whether the new-quest toast stays.

LATER (OP-084), not for the preview: the hop may grow into flight (double flap,
hold-to-glide, upper levels). Do not describe the hop as final; it is built as a visual offset so
flight can replace it.

## 8. After

A line on the board: what happened, how long, what changed, and the ticket for any follow-up.
