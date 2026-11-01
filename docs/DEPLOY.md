# Deploying Owl Park (free tiers only)

- Status: BUILT; the store's setup (Selling tickets) is the owner's, PLANNED (OP-024)
- Verified against: main 67ca3ab (2026-10-23)
- Code: apps/edge/wrangler.jsonc, tools/build-edge.mjs, .github/workflows/deploy-worker.yml, apps/edge/src/env.ts
- Tickets: OP-001, OP-002, OP-020, OP-024, OP-062, OP-067, OP-071, OP-097
- Related: docs/PLAYBOOK.md, docs/ARCHITECTURE.md section 13

The park is a static site plus a multiplayer backend. There are three ways to run it, all
free at a small scale. The code is the same; only configuration differs.

| Mode | Backend | Multiplayer | Accounts needed |
| --- | --- | --- | --- |
| A. Static demo | none | tabs on one device | GitHub only |
| B. Static + Supabase Realtime | Supabase (no server code) | internet | GitHub + Supabase |
| C. Room server (recommended) | Cloudflare Worker + Durable Object | internet, authoritative | GitHub + Cloudflare |

## A. Static site on GitHub Pages

1. Repository **Settings → Pages → Source: GitHub Actions**, then add the repository variable
   `PAGES_DEPLOY=true` (Settings → Secrets and variables → Actions → Variables). Without it the
   workflow is skipped, which keeps `main` green for a park that deploys to Cloudflare instead.
2. Merge to `main`. `.github/workflows/deploy-pages.yml` builds and publishes to `https://<owner>.github.io/<repo>/`.
3. Optional repository variables (Settings → Secrets and variables → Actions → Variables; all are
   public values that ship in the bundle): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (mode B),
   `VITE_EDGE_URL` (point the static client at a room server hosted in mode C), `VITE_SHOP_URL`,
   `VITE_SITE_URL` (the site's https origin, for link previews).

## B. Supabase Realtime (no server code)

Version 1 needs no tables and no auth: public Realtime channels only (Presence for who is here,
Broadcast for walks).

1. Create a Supabase project (free plan is enough to start; note that the free plan allows two
   active projects per organisation and pauses projects after a week without activity).
2. Project **Settings → API**: copy the Project URL and the anon key into the variables above
   (or `apps/park/.env.local` locally).
3. Budget: Realtime bills one message per sender plus one per recipient. The park sends one
   message per tap and a presence refresh at most every 3 s per owl, but a 20-owl room still
   uses a few million messages a month under normal play. See `docs/ARCHITECTURE.md` §2.

## C. Room server on Cloudflare (recommended)

The Worker serves the built client and runs the authoritative rooms. The Cloudflare project is
`apps/edge` (`wrangler.jsonc`); `pnpm --filter @owl-park/edge exec wrangler <command>` runs the
pinned Wrangler. Local development needs no account:

```bash
pnpm dev:edge         # builds the client, then wrangler dev on http://localhost:8787
```

### Where to run the commands (read first)

The repository is a pnpm monorepo: `apps/` (the client `apps/park` and the Cloudflare project
`apps/edge`), `packages/` (the shared rules) and `tools/`. Three things follow from that:

- `pnpm install` runs once, at the repository's root (the folder with `pnpm-workspace.yaml`), and
  installs every package. If pnpm asks you to approve build scripts for esbuild and workerd,
  `pnpm approve-builds` (approve both) is safe and needed once.
- Wrangler lives in `apps/edge`, not at the root. Run it either from the root as
  `pnpm --filter @owl-park/edge exec wrangler <command>` (the form this file uses) or from inside
  `apps/edge` as `pnpm wrangler <command>` (what the owner ran on 2026-10-23). Both use the pinned
  version. A bare `wrangler` or `npx wrangler` from the root or your user folder finds nothing or
  the wrong version.
- The root scripts `pnpm build:edge` and `pnpm deploy:edge` run on any shell since main 67ca3ab
  (`tools/build-edge.mjs` sets `VITE_TRANSPORT=edge` without shell syntax); before that they were
  bash-only. The client's build lives in `apps/park`; `pnpm vite build` inside `apps/edge` finds no
  `index.html`, which is expected, so always build through the root script.

Every command below runs from the root folder unless it says otherwise, the same in bash,
PowerShell or the Command Prompt. The two things that differ on Windows are environment variables
and the shell you are in:

| Task | bash (macOS, Linux, Git Bash) | PowerShell |
| --- | --- | --- |
| Install | `pnpm install` | `pnpm install` |
| Approve build scripts (once) | `pnpm approve-builds` | `pnpm approve-builds` |
| Sign in to Cloudflare | `pnpm --filter @owl-park/edge exec wrangler login` | same |
| See which account you are in | `pnpm --filter @owl-park/edge exec wrangler whoami` | same |
| Pin the account for this shell | `export CLOUDFLARE_ACCOUNT_ID=<id>` | `$env:CLOUDFLARE_ACCOUNT_ID = "<id>"` |
| Set a secret | `pnpm --filter @owl-park/edge exec wrangler secret put PASS_SIGNING_KEY` | same (or `cd apps/edge` then `pnpm wrangler secret put PASS_SIGNING_KEY`) |
| Build the client for the room server | `pnpm build:edge` | `pnpm build:edge` |
| Build and deploy from this machine | `pnpm deploy:edge` | `pnpm deploy:edge` |
| Dry run (build, deploy nothing) | `pnpm build:edge && pnpm --filter @owl-park/edge exec wrangler deploy --dry-run` | `pnpm build:edge; pnpm --filter @owl-park/edge exec wrangler deploy --dry-run` |
| Watch the live log | `pnpm --filter @owl-park/edge exec wrangler tail` | same |
| Local development | `pnpm dev:edge` | `pnpm dev:edge` |

Prefer deploying from GitHub (below) over `pnpm deploy:edge`: the workflow's build carries the
repository variables that a build on your own machine leaves out, and its secrets go to the account
the deploys use.

### First deploy, from your own machine

1. Sign in once: `pnpm --filter @owl-park/edge exec wrangler login` opens the browser. Create the
   free account first at <https://dash.cloudflare.com/sign-up> if you do not have one.
   Without an account you can instead run step 2 as `pnpm deploy:edge --temporary`: Wrangler
   deploys into a temporary preview account and prints a claim URL; claiming it makes the account
   yours (an unclaimed deployment expires; Wrangler shows the terms before it starts).
2. `pnpm deploy:edge` builds the client for the room server and deploys the Worker, both Durable
   Objects and the static assets. The park is live at `https://owl-park.<your-subdomain>.workers.dev`.
3. Set the two secrets (each `secret put` deploys a new version immediately):
   `pnpm --filter @owl-park/edge exec wrangler secret put PASS_SIGNING_KEY` (32+ random characters)
   and `... secret put ADMIN_KEY` (16+ random characters). Until then the Worker uses a development
   signing key and logs a warning, and the admin routes stay closed. If your sign-in reaches more
   than one Cloudflare account (`... wrangler whoami` lists them), first set `CLOUDFLARE_ACCOUNT_ID`
   to the Account ID of the one that holds `owl-park` (on its Workers overview page): in PowerShell
   `$env:CLOUDFLARE_ACCOUNT_ID = "<id>"`, in bash `export CLOUDFLARE_ACCOUNT_ID=<id>`. If Wrangler
   says there is no Worker called `owl-park` and offers to create one, answer no: it is looking in
   another account, and the keys would go to a new, empty Worker there while the park kept its
   development key.
4. Watch it: `pnpm --filter @owl-park/edge exec wrangler tail`, or the Workers Logs and Traces pages
   in the dashboard (both are switched on in `wrangler.jsonc`).

### If you see this error

What the owner hit setting the secrets on Windows on 2026-10-23 (OP-001), and what each one means.

| You see | It means | Do this |
| --- | --- | --- |
| `wrangler` is not recognized, or `pnpm wrangler` says there is no such script, from the root or your user folder | Wrangler is a dependency of `apps/edge`, not of the root | Run `pnpm --filter @owl-park/edge exec wrangler ...` from the root, or `cd apps/edge` and `pnpm wrangler ...` |
| pnpm says build scripts for `esbuild` and `workerd` were ignored, or `workerd` fails to start | pnpm 10 does not run dependency build scripts until you approve them | `pnpm approve-builds` at the root, approve both, then `pnpm install` again if asked |
| Wrangler says there is no Worker called `owl-park` in your account and offers to create one | Your sign-in reaches a different account from the one the park deploys to (`CLOUDFLARE_ACCOUNT_ID` in the repository's secrets) | Answer **no**. Run `wrangler whoami`, set `CLOUDFLARE_ACCOUNT_ID` to the account that holds `owl-park` (table above), and try again. A secret put into a new, empty `owl-park` elsewhere does nothing for the live park. Verify after any deploy that the printed workers.dev URL and the park's domain are the same site |
| `wrangler deploy` from `apps/edge`: the assets directory `../park/dist` does not exist | Nothing has been built on this machine; the Worker serves the client from `apps/park/dist` | `pnpm build:edge` at the root first, or just `pnpm deploy:edge`, which builds then deploys |
| `vite build` inside `apps/edge`: cannot resolve entry module `index.html` | The client is `apps/park`; `apps/edge` has no site of its own | Do not build there. `pnpm build:edge` at the root |
| `'..' is not recognized as an internal or external command` from `pnpm deploy:edge` | Before main 67ca3ab the script used bash syntax (`VITE_TRANSPORT=edge pnpm build`), which the Command Prompt and PowerShell cannot run | Pull `main` (the script now runs through `tools/build-edge.mjs` on any shell). If it persists on a current `main`, say so on the board: the exact `'..'` message could not be traced to anything in the repository |
| The deploy workflow's "Upload PASS_SIGNING_KEY" or "Upload ADMIN_KEY" step is marked skipped | GitHub has no Actions secret by that name (one under Variables, Codespaces or Dependabot does not count) | Settings → Secrets and variables → Actions → New repository secret, then Actions → Deploy to Cloudflare → Run workflow; the step then lists the Worker's secret names |
| `/api/health` is fine but the Worker still logs the development-key warning, or `/admin/*` refuses with the right key | The secrets are not on the Worker that serves the park (see the account row) | Check the upload steps of the latest deploy run; `/api/health` never reports the keys by design |

### Deploys from GitHub (every push to `main`)

1. In the dashboard create an API token from the "Edit Cloudflare Workers" template and copy the
   Account ID from the Workers overview page.
2. Repository **Settings → Secrets and variables → Actions**:
   - secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
   - variable `CLOUDFLARE_DEPLOY=true` (this switch enables `.github/workflows/deploy-worker.yml`)
   - optional variable `VITE_SHOP_URL`
   - optional variable `VITE_SITE_URL`: the park's https origin (for example the workers.dev URL
     wrangler prints). Link previews on some sites need the share image's absolute URL; without
     it the image URL stays relative to the page.
   - optional secrets `PASS_SIGNING_KEY` and `ADMIN_KEY`: the workflow uploads each one it finds to
     the Worker after the deploy, so step 3 above is not needed when they are set here. This is the
     simplest way to set them: nothing to install, and they go to the account the deploys use. To
     send them up without a push, run the workflow by hand (**Actions → Deploy to Cloudflare → Run
     workflow**, branch `main`); its upload steps then list the Worker's secret names. A step marked
     skipped found no Actions secret by that name (one saved under Variables, Codespaces or
     Dependabot does not count).
3. Merge to `main`. The workflow builds and deploys. Worker secrets set either way are kept across
   deploys. From then on deploy from GitHub (a push to `main`, or Run workflow) rather than with
   `pnpm deploy:edge`: the workflow's build adds the repository variables (`VITE_SITE_URL`,
   `VITE_SHOP_URL`, `VITE_TICKETS_URL`), which a build on your own machine leaves out. The park's
   own domain (`routes` in `apps/edge/wrangler.jsonc`, both hostnames as Custom
   Domains) is attached to the Worker by every deploy, and Cloudflare keeps its DNS records and
   certificates; the workers.dev address stays on beside it (`workers_dev`). A hostname that still
   has DNS records of its own (A, AAAA or CNAME, from an earlier setup) cannot be attached: the
   deploy log says it "already has externally managed DNS records". Delete those records on the
   zone's DNS page (keep MX and TXT records, which carry email and verification) and deploy again.
   Custom Domains create DNS records, so if the deploy log reports an authentication error at that
   step, add Zone DNS Edit for the domain's zone to the API token (or attach the two hostnames once
   in the dashboard under the Worker's Domains & Routes).
4. Operations: in the Cloudflare dashboard set a usage notification at 50 % of the free daily
   Durable Object request cap, and buy Workers Paid ($5/month) before the first promoted weekend.
   The free plan fails closed at the daily cap.

### Selling tickets (the store)

Tickets (C35) are sold by the Shopify store, which keeps the buyer; the park keeps each ticket, with
its order and line numbers only. None of this is needed before tickets go on sale: until then the
turnstiles let everyone through. The steps, in order:

1. **The store's app** (the owner's account). Since January 2026 a new app is made in Shopify's
   Dev Dashboard (the store's admin no longer makes new custom apps): Create app, then Start from
   Dev Dashboard; in its version give it the scopes `read_orders`, `write_orders`, `read_products`,
   `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders` and
   `write_metaobjects` (the App URL can stay as it is: the park never opens inside the admin),
   Release, then Install app on the store. Its Settings show the Client ID and the Client secret;
   the park trades them with the store for a token that lasts a day (the client credentials grant,
   for an app and a store in the same organization). An app made in the store's admin before
   2026 has a fixed Admin API token instead, which works too. Neither ever goes in a file.
2. **The Worker's secrets**, each with `pnpm --filter @owl-park/edge exec wrangler secret put <NAME>`
   (or as repository secrets, which the deploy workflow uploads): `SHOPIFY_SHOP` (the store's
   `name.myshopify.com` domain, nothing more), and the app's `SHOPIFY_CLIENT_ID` and
   `SHOPIFY_CLIENT_SECRET` (or, for an app made in the admin, its `SHOPIFY_ADMIN_TOKEN`). Then
   `GET /api/admin/store` with the `X-Admin-Key` header checks them: which are set (never their
   values), whether the app signs in, any scope it still lacks, and whether the store lets it read
   orders (they hold customer data: if not, request protected customer data access for the app in
   the Dev Dashboard; the park reads no names, emails or addresses).
3. **Webhooks** (JSON) to `https://<the park's own domain>/api/store/webhook`: `orders/paid`,
   `orders/create`, `orders/updated`, `orders/cancelled` and `refunds/create`, plus
   `orders/risk_assessment_changed` where the store offers it, made under Settings → Notifications →
   Webhooks. (`orders/create` matters only for free orders, should the store not send
   `orders/paid` for them; the park ignores it for any other order.) The store signs
   those with a key shown on that page: set it as `SHOPIFY_WEBHOOK_SECRET`. (Webhooks the app
   subscribes itself are signed with its client secret, which the park also accepts.) Without a
   key the store's webhooks are refused. The claim link in the store's email uses the address the
   webhooks are sent to, so use the park's own domain; the page's "Send test notification" should
   get a 200.
4. **The ticket products**: product type `Ticket` and the metafield `owl_park.ticket_kind` (`day`,
   `night`, `annual` or `opening-night`); `owl_park.length_hours` sets a ticket's length (night
   tickets need it; day tickets last 24 hours and annual passes 365 days without it). The Opening
   Night Ticket (C42) also has `owl_park.event_start`, the opening moment (date and time), and
   optionally `owl_park.event_end` (24 hours later without it): the gate takes the ticket only in
   that window, and a moved date is an edit of that field. The store reads a date and time without
   a time zone as GMT, so write it with its offset (for 7 pm Eastern in December,
   `2026-12-05T19:00:00-05:00`); the opening-night page below shows the window as the park reads it.
   An event entry on any other product is `owl_park.ticket_kind` = `event` with both fields.
5. **The store's copy of each ticket** (optional): a metaobject definition `owl_park_ticket` with
   single-line text fields `ticket_id`, `kind`, `status`, `order_id`, `first_scan`, `valid_until`,
   `votes_cast` and `todays_vote`, and an order metafield definition `owl_park.tickets` (a list of
   `owl_park_ticket` references). Without them tickets still work; the Worker logs that the copy
   failed.
6. **The email**: the store's shipping confirmation carries the claim link as its tracking link and
   the ticket IDs as its tracking numbers. Reword it as "Your ticket" for ticket orders (Settings →
   Notifications → Shipping confirmation).
7. **Fraud check**: an order the store rates low risk gets its link at once. Any other order waits
   (its tickets show as waiting in the buyer's wallet); a later low rating releases it, or the
   owner adds the order tag `owl-park-release` after checking it, or refunds it.
8. **Going on sale**: set `VITE_TICKETS_URL` (the store's ticket page, for the booth's button; a
   repository variable for deploys) any time before: the booth offers it only while the gate takes
   tickets. On the day, open `/admin/gate` with the admin key and press **Take tickets now**: the
   turnstiles take tickets only and the booth sells, within ten seconds and with no deploy. Owls
   already inside stay in; **Open to everyone** flips it back, and **As deployed** hands it back to
   `GATE` in `wrangler.jsonc`. The same from a terminal: `POST /api/admin/gate` with the
   `X-Admin-Key` header and `{"mode": "ticket"}` (or `"open"`, or `"deployed"`); a `GET` says how it
   is set. The turnstiles scan a ticket held on the device whichever way the gate is set, and the
   first scan starts its time.
9. **Tickets without a store order** (giveaways and tests): `POST /api/admin/tickets` with the
   `X-Admin-Key` header and `{"kind": "day", "quantity": 2}` (or `"hours": 6`, or an `event` with
   `"from"` and `"until"`, or an `opening-night` with `"from"`) answers with the claim link. Nothing
   is copied to the store for these. `{"kind": "annual", "lifetime": true}` makes one pass that never
   runs out (OP-171): it does not expire unused and the wallet shows no time left on it. Open its
   link once, on the owl it is for; anyone holding the link can move the pass to their own screen,
   so it goes to no one else.
10. **Opening night** (C42): the annual pass's 50% discount code (OP-062; an "amount off
    products" code for the annual pass) goes on the Worker as `OPENING_PASS_CODE`
    (`wrangler secret put`, or a repository secret the deploy uploads), never in a file. The
    Opening Night Ticket needs no code: a free order gets its ticket at once. During the ticket's
    window the booth says every pass is half price; once an owl's Opening Night Ticket has gone
    through the gate, the park offers "Your pass is half price tonight. Claim it", a cart link with
    the annual pass, the code and the cart attribute `from_ticket` (the ticket's ID). The pass order
    is a paid order: it comes back through `orders/paid`, the store rates it like any other (step 7),
    and the pass goes straight into that owl's wallet, working at once when the store rates it low.
    The count is at `/admin/opening` (the admin key, as for feedback): tickets issued and scanned,
    passes claimed through the link and passes without one (the code used some other way), the
    conversion rate, the passes' revenue before tax and a CSV, with order numbers, ticket IDs and
    each pass's amount only. It also shows the night's window as the park reads it from the store
    and whether the pass link is ready (the code set, an annual pass on sale). Votes count one per
    wallet per park day, however many tickets or passes it holds.

### Coding agents

Claude Code picks up the Cloudflare skills vendored in `.claude/skills/` and the Cloudflare MCP
server declared in `.mcp.json` when started from the repository root (approve the server when
asked; it signs in to your Cloudflare account through the browser). For other projects the same
guidance installs with `/plugin marketplace add cloudflare/skills` and
`/plugin install cloudflare@cloudflare`. `tools/cloudflare-skills.sh` refreshes the vendored copy.

Configuration lives in `apps/edge/wrangler.jsonc`: `ROOM_SHARDING` (`single` or `room`),
`GATE` (where the front gate starts: `open`, everyone walks through the lobby's turnstiles; `ticket`, visitors without a ticket stay in the lobby; the opening switch on `/admin/gate` overrides it with no deploy), optional `ROOM_CAPS` JSON, `PARK_TZ` (the park
day for the Realm Vote) and `VOTE_TALLY_PUBLIC`. Secrets, set once with `wrangler secret put`:
`PASS_SIGNING_KEY` and `ADMIN_KEY` (16+ random characters; needed to read the private vote tally,
to close a month by hand, to issue tickets without a store order, to read visitors' feedback on
`/admin/feedback` and opening night's count on `/admin/opening`, and to flip the gate on
`/admin/gate`), and the store's
secrets (above). A cron trigger closes the Realm Vote month automatically.

## Checking a deployment

- `/api/health` answers `"ok": true` when the Worker and the park's three objects (the rooms, the
  ticket book, the collections) answer; a 503 names the part that did not. When something is wrong,
  `docs/PLAYBOOK.md` says what to check, how to roll back and how to pause ticket sales.
- Open the site in two browsers (or a phone and a laptop) and watch the owls see each other.
- `?debug=1` draws the walkable areas and doors. `?transport=local|supabase|edge` forces a transport.
- The status dot in the top-right pill is gold when connected, grey when the park is offline.
- `node tools/load/swarm.mjs --url https://<host> --bots 20 --seconds 30` runs a small bot swarm and reports echo latency.
  The full load test runs on GitHub: Actions → Load test → Run workflow. It deploys a throwaway copy
  under its own name, never the live park, loads it step by step and deletes it; what it found is in
  `docs/ARCHITECTURE.md`, section 6.
