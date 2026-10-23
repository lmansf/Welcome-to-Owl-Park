# When the park is in trouble

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

## 7. After

A line on the board: what happened, how long, what changed, and the ticket for any follow-up.
