# Deploying Owl Park (free tiers only)

- Status: BUILT; the store's setup (Selling tickets) is the owner's, PLANNED (OP-024)
- Verified against: branch claude/op-202-docs off main 01e9722 (2026-11-02)
- Code: apps/edge/wrangler.jsonc, tools/build-edge.mjs, .github/workflows/deploy-worker.yml, .github/workflows/ci.yml, apps/edge/src/env.ts, apps/edge/src/routes/table.ts, apps/edge/src/routes/admin.ts, apps/edge/src/accounts.ts, apps/edge/src/buyerLog.ts, apps/edge/src/collectLog.ts, apps/park/src/config.ts, apps/park/e2e/shard.mjs
- Tickets: OP-001, OP-002, OP-020, OP-024, OP-062, OP-067, OP-071, OP-097, OP-107, OP-123, OP-139, OP-150, OP-156, OP-181, OP-186, OP-192
- Related: docs/PLAYBOOK.md, docs/ARCHITECTURE.md section 13

The park is a static site plus a multiplayer backend. There are two ways to run it, both
free at a small scale. The code is the same; only configuration differs.

| Mode | Backend | Multiplayer | Accounts needed |
| --- | --- | --- | --- |
| A. Static demo | none | tabs on one device | GitHub only |
| C. Room server (recommended) | Cloudflare Worker + Durable Objects | internet, authoritative | GitHub + Cloudflare |

Mode B (Supabase Realtime) is gone (OP-150): the page holds no database client or key, and CI checks
the built page for one (`tools/security/bundle-check.mjs`).

## A. Static site on GitHub Pages

1. Repository **Settings → Pages → Source: GitHub Actions**, then add the repository variable
   `PAGES_DEPLOY=true` (Settings → Secrets and variables → Actions → Variables). Without it the
   workflow is skipped, which keeps `main` green for a park that deploys to Cloudflare instead.
2. Merge to `main`. `.github/workflows/deploy-pages.yml` builds and publishes to `https://<owner>.github.io/<repo>/`.
3. Optional repository variables (Settings → Secrets and variables → Actions → Variables; all are
   public values that ship in the bundle): `VITE_SHOP_URL` and `VITE_SITE_URL` (the site's https
   origin, for link previews). A park published here has no room server: its multiplayer is tabs on
   one device. The workflow checks the build for a database client or key before publishing
   (`pnpm security:bundle`).
4. OPEN QUESTION: the client reads `VITE_EDGE_URL` (a room server hosted in mode C) and the Worker
   takes `PARK_ORIGINS` (other origins allowed to open its sockets), but `deploy-pages.yml` does not
   pass `VITE_EDGE_URL`, so a Pages copy never reaches a room server as deployed.

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
   the Dev Dashboard). The park reads no names or addresses. It reads an order's email for one
   thing: the protect link mailed as the order's tickets land on an owl (OP-186, `docs/SECURITY.md`).
   With the analytics log on, it also reads a paid order's email and the store's customer id and
   sends them to the owner's contacts (OP-192, `apps/edge/src/buyerLog.ts`). So the app's protected
   customer data access covers the email and the customer's id, and nothing else; ask for it once
   these are live.
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
8. **Going on sale**: set `VITE_TICKETS_URL` (the store's ticket page, where the turnstiles'
   checkout goes when the park cannot make an owl's cart link; a repository variable for deploys)
   any time before. On the day, open `/admin/gate` with the admin key and press **Take tickets
   now**: the turnstiles take tickets only and sell a Day Ticket to an owl without one (OP-180),
   within ten seconds and with no deploy. Owls
   already inside stay in; **Open to everyone** flips it back, and **As deployed** hands it back to
   `GATE` in `wrangler.jsonc`. The same from a terminal: `POST /api/admin/gate` with the
   `X-Admin-Key` header and `{"mode": "ticket"}` (or `"open"`, or `"deployed"`); a `GET` says how it
   is set. The turnstiles scan a ticket held by the owl (on any screen, OP-183) whichever way the gate is set, and the
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
    window, once an owl's Opening Night Ticket has gone through the gate, the park offers "Your
    pass is half price tonight. Claim it", a cart link with the annual pass, the code and the cart
    attribute `from_ticket` (the ticket's ID). The same offer follows a Day Ticket bought at the
    turnstiles during the window (OP-180: "Come back all year! The annual pass is half price
    tonight."), never to an owl that holds an annual pass; outside the window it is not offered,
    so the code is not given out on other days. The pass order
    is a paid order: it comes back through `orders/paid`, the store rates it like any other (step 7),
    and the pass goes straight into that owl's wallet, working at once when the store rates it low.
    The count is at `/admin/opening` (the admin key, as for feedback): tickets issued and scanned,
    passes claimed through the link and passes without one (the code used some other way), the
    conversion rate, the passes' revenue before tax and a CSV, with order numbers, ticket IDs and
    each pass's amount only. It also shows the night's window as the park reads it from the store
    and whether the pass link is ready (the code set, an annual pass on sale). Votes count one per
    wallet per park day, however many tickets or passes it holds.

11. **Back to the park after checkout** (OP-190; NOT APPLIED: the store's theme is the owner's,
    and this waits for the owner's yes). The store's Thank you page has one way out, its "Continue
    shopping" link to the store's home page. The owner decided that tickets sell at the turnstiles
    and the ticket shop is dropped, so the store's home page has nothing of its own to show: this
    snippet sends every visitor there to the park, and a buyer who came from checkout to the park's
    return address, `https://exploreowlpark.com/?checkout=done` (plain, nothing secret in it). There
    the park tells the game window at once, so the owl goes through the turnstiles with its new
    ticket, and checkout's window closes (or says the ticket is waiting in the park window); with no
    game window open, the park starts in that window and Play takes the owl in
    (`apps/park/src/ui/checkoutReturn.ts`). In Shopify admin → Online Store → Themes → the live
    theme (Horizon) → Edit code → `layout/theme.liquid`, paste this as the first thing inside
    `<head>`, then Save:

    ```liquid
    {%- comment -%} Owl Park (OP-190): the store's home page sends visitors to the park; back from checkout, to its return address. {%- endcomment -%}
    {%- if request.page_type == 'index' and request.design_mode == false -%}
      <script>
        (function () {
          var park = 'https://exploreowlpark.com/';
          var fromCheckout = /\/checkouts\/|\/orders\//.test(document.referrer || '');
          location.replace(fromCheckout ? park + '?checkout=done' : park);
        })();
      </script>
    {%- endif -%}
    ```

    It runs on the home page only (`request.page_type == 'index'`), never in the theme editor
    (`request.design_mode`), and checkout itself is untouched (themes do not run on checkout).
    Checkout's addresses hold `/checkouts/` (the Thank you page too); `/orders/` is the order status
    page that the confirmation email links to. `location.replace` leaves the store's home page out
    of the back button. To undo it, delete the lines and Save. Check after applying: buy a Day
    Ticket at the turnstiles on a computer, press Continue shopping on the Thank you page, and the
    checkout window should close or say "You're all set"; open the store's home page directly, and
    it should go to the park's home screen. If the Thank you page sends no referrer, buyers land on
    the park's plain address instead; the game window still finds the ticket within a few seconds.

    **The stronger option, later** (not built): a Shopify app with a Thank you page checkout UI
    extension (target `purchase.thank-you.block.render`, allowed on every plan but Starter, so on
    Basic too) that shows a "Back to the park" button to `https://exploreowlpark.com/?checkout=done`
    on the Thank you page itself, with no wait for Continue shopping. It needs an app with an
    extension deployed through the Shopify CLI and placed in the checkout editor, the owner's.

### Accounts: the email key and the mail sender (OP-139)

With `ACCOUNTS` `"on"` (`apps/edge/wrangler.jsonc`, on since 2026-10-31), an owl can be protected
with an email and brought back by a magic link (`apps/edge/src/accounts.ts`). Three Worker secrets,
set with `wrangler secret put` or as repository secrets, which the deploy workflow uploads:

- `ACCOUNT_SECRET`: 32 or more random characters. It keys the hash an email is found by and seals the
  copy the park writes to. Never change it once owls are protected: their emails are lost to the park.
- `RESEND_API_KEY` and `MAIL_FROM`: the mail sender. Links go out through Resend, from `MAIL_FROM`, a
  sender on a domain verified there. The workflow uploads the two together, or neither.

Without all three no email is kept and no link is sent (`emailKeys`, `mailSender`); friend codes and
one screen at a time still work. `ACCOUNTS` `"off"` leaves every page as it was before accounts.

### The analytics log (OP-107, OP-192)

The collection log, the player stats, the ticket events and the owner's contacts go to the
`owl-park-log` function in the owner's Supabase project (`apps/park-log`). The log is on once the
Worker has all three of `PARK_LOG_URL` (the function's address), `FRAUD_SCORE_KEY` (the key the
function checks) and `FRAUD_HASH_SALT` (16 or more random characters, which salts the hashes; never
change it, or every owl looks new). Set them as repository secrets: the deploy workflow uploads the
three together, or none. The steps on the Supabase side are `apps/park-log/README.md`, steps 1 to 6;
`FRAUD_SCORE_URL` is not needed (the fraud link stays off without it).

- `GET /api/admin/collect-log` (the admin key) says whether the log is on and how many rows wait.
- `POST /api/admin/collect-log` sends, once, the collectibles the collections already hold, as
  backfill rows (their real acquisition times; no visit, room or device).

### The weekly export's bucket (OP-185): before the first deploy with it

The Worker binds the R2 bucket `owl-park-exports` as `PARK_EXPORTS` (`apps/edge/wrangler.jsonc`) for
the weekly export of the park's stored data (`docs/ARCHITECTURE.md`, section 13). R2 is a Cloudflare
product of its own, turned on per account, and a deploy cannot bind a bucket on an account without it:
**turn R2 on and make the bucket before the deploy that brings the binding in**, or that deploy (and
every one after it) fails.

1. In the Cloudflare dashboard of the park's account, open **R2 Object Storage** and turn it on
   (the free tier: 10 GB stored, a million writes and ten million reads a month; Cloudflare may ask
   for a payment method to turn R2 on even within it). A week's copy is a few files, well inside it.
2. **Create bucket**: name `owl-park-exports`, location Automatic, the Standard storage class. Leave it
   private: no public `r2.dev` address and no custom domain. Or from a machine with Wrangler signed in
   to the park's account: `pnpm --filter @owl-park/edge exec wrangler r2 bucket create owl-park-exports`.
3. Check the deploy token can see it: the API token behind `CLOUDFLARE_API_TOKEN` needs
   the account's **Workers R2 Storage** permission at Edit (Write) level (the "Edit Cloudflare Workers"
   template includes it; a token made by hand may not). Without it the deploy cannot check the bucket and fails as above.

How a deploy meets the binding (Wrangler 4.151, `wrangler deploy`): it looks the bucket up first. Found,
it binds it. Missing, with R2 on and the token allowed, Wrangler's resource provisioning (on by
default) creates `owl-park-exports` itself and deploys (private, like any new bucket); so step 2 can
be left to the first deploy, but making it by hand keeps the choice of location the owner's. With R2
off, the look-up fails and the deploy stops before the Worker is uploaded: the live Worker stays as it
was. There is no setting that keeps the binding and deploys without R2: to deploy before R2 is on,
take the `r2_buckets` lines out of `wrangler.jsonc`; the Worker runs without the binding (the export
logs `park_export_skipped`), and the lines go back in once R2 is on.

After the first deploy with it: `POST /api/admin/export` with the `X-Admin-Key` header makes the first
copy at once, and `GET /api/admin/export` shows it (the date, three objects and their bytes). The
copies are also in the dashboard, R2, `owl-park-exports`, under `exports/`.

### Coding agents

Claude Code picks up the Cloudflare skills vendored in `.claude/skills/` and the Cloudflare MCP
server declared in `.mcp.json` when started from the repository root (approve the server when
asked; it signs in to your Cloudflare account through the browser). For other projects the same
guidance installs with `/plugin marketplace add cloudflare/skills` and
`/plugin install cloudflare@cloudflare`. `tools/cloudflare-skills.sh` refreshes the vendored copy.

Configuration lives in `apps/edge/wrangler.jsonc`: `ROOM_SHARDING` (`single` or `room`),
`GATE` (where the front gate starts: `open`, everyone walks through the lobby's turnstiles; `ticket`, visitors without a ticket stay in the lobby; the opening switch on `/admin/gate` overrides it with no deploy), optional `ROOM_CAPS` JSON, `SPECTATORS` (`off` or `on`; on lets an owl without a ticket past the turnstiles as a spectator that earns nothing, OP-191; `on` in production since 2026-11-01; set it back to `off` and deploy to turn spectators away again), `SPECTATOR_SHARE` (the share of a room's cap spectators may fill, default `0.75`), `ACCOUNTS` (above),
`RATE_LIMITS` (`on` always; `off` only for a load test's throwaway copy, `docs/PLAYBOOK.md` section
9), `LOG_LEVEL`, `PARK_TZ` (the park day for the Realm Vote) and `VOTE_TALLY_PUBLIC`. Secrets, set once with `wrangler secret put`:
`PASS_SIGNING_KEY` and `ADMIN_KEY` (16+ random characters; needed to read the private vote tally,
to close a month by hand, to issue tickets without a store order, to read visitors' feedback on
`/admin/feedback` and opening night's count on `/admin/opening`, and to flip the gate on
`/admin/gate`), and the store's
secrets (above). Three cron triggers (`triggers.crons`, `apps/edge/src/crons.ts`): 05:05 UTC on the 1st
closes the Realm Vote month, 09:00 UTC every day restarts the park for the night (OP-181,
below), and 08:00 UTC every Sunday exports the park's stored data to R2 (OP-185, above).

## The keepers' routes

Every path the Worker answers is in `apps/edge/src/routes/table.ts`; the keepers' handlers are in
`apps/edge/src/routes/admin.ts`, and the key check (`isAdmin`, the `X-Admin-Key` header against
`ADMIN_KEY`) and the keeper's-token check (`keeperOf`) in `apps/edge/src/routes/http.ts`. Without
`ADMIN_KEY` on the Worker (16 or more characters) every one of them refuses. Each refusal is logged
as `admin_denied` with its reason, never the key. The pages under `/admin/` ask for the key in the
page and keep it in that tab only.

| Route | Method | Needs | What it does |
| --- | --- | --- | --- |
| `/api/admin/ping` | GET | the key | `{"ok": true}`: the key is the keepers' (the position overlay asks, `docs/PLAYBOOK.md` section 10) |
| `/api/admin/keeper` | POST | the key | a keeper's token, good for `KEEPER_TTL_S` (12 hours): a tab's owl into a realm the keepers keep closed (OP-156) |
| `/api/admin/masks/<room>` | POST | a keeper's token (`X-Keeper-Token`) or the key | keep the ledge painter's draft for a room of the tree (OP-156) |
| `/api/masks/<room>` | GET | nothing | that draft as saved (level geometry only); 404 before one is saved |
| `/api/admin/grant` | POST | the key | `{cid, variant, source}`: give an owl a collectible (`docs/COLLECTIBLES.md`) |
| `/api/admin/climb` | GET | the key | `?ref=`: a climb run by the reference a visitor quotes |
| `/api/admin/collect-log` | GET, POST | the key | the analytics log's state; the backfill (above) |
| `/api/admin/store` | GET | the key | the store's setup check (Selling tickets, step 2) |
| `/api/admin/tickets` | POST | the key | tickets without a store order (step 9) |
| `/api/admin/feedback`, `/admin/feedback` | GET, POST | the key | visitors' notes (`docs/FEEDBACK.md`) |
| `/api/admin/opening`, `/admin/opening` | GET | the key | opening night's count, `?csv` for the CSV (step 10) |
| `/api/admin/gate`, `/admin/gate` | GET, POST | the key | the opening switch (step 8) |
| `/api/admin/restart` | POST | the key | the nightly restart, now (OP-181, below) |
| `/api/admin/export` | GET, POST | the key | the last weekly export (its day, objects and bytes, and every day kept); POST makes one now (OP-185) |
| `/api/admin/restore` | POST | the key | `{kind, date, force?}`: that day's export loaded back into its object; refused while the object holds records unless `force` is true (OP-185, `docs/ARCHITECTURE.md` section 13) |
| `/api/admin/capacity`, `/admin/capacity` | GET, POST | the key | the busy-night settings and the tree's share (`docs/CAPACITY.md`, section 2) |
| `/api/vote/tally` | GET | the key, unless `VOTE_TALLY_PUBLIC` is `"true"` | the Realm Vote's standings |
| `/api/vote/close` | POST | the key | close the vote's month by hand |

**The nightly restart** (OP-181): the 09:00 UTC cron restarts the park, and
`POST /api/admin/restart` with the `X-Admin-Key` header does the same at once (to try it on a copy).
The vote ledger keeps when it was, so no pass from before it goes past the turnstiles while the gate
takes tickets; then every room object, copies included, tells its owls and a moment later sends them
all to the home screen. It answers `{"restartAt", "objects", "missed", "owls"}`: when the ledger kept
it, the room objects told, those that could not be told (their owls stay until they leave), and the
owls sent home.

**Walking a closed realm**: open the park with `?keeper=1` and give the keepers' key once; the page
swaps it at `/api/admin/keeper` for the 12-hour token, kept in that tab only (never the key), and its
hello carries the token past the closed arch. The painter and the overlays are `docs/PLAYBOOK.md`,
section 10.

## CI [BUILT (OP-123)]

`.github/workflows/ci.yml` runs in two tiers.

| Tier | When | What runs |
| --- | --- | --- |
| Quick | a push to a branch other than `main` | typecheck, unit tests and build as three jobs at once, then the browser smoke set: the tests tagged `@smoke`, on the `desktop` and `edge` projects; under five minutes |
| Full | a pull request, a push to `main`, the nightly run (07:00 UTC) and a run by hand | the same three jobs, then the whole browser suite split across twelve runners by the tests' measured times, their reports merged into one; and mutation testing (OP-131, `docs/TESTING.md`) |

- A push that changes only `docs/` or Markdown files runs nothing (`paths-ignore`). A pull request
  always runs.
- A failed typecheck or unit test run cancels the rest of the run.
- The unit job also runs the chaos harness's tests (`pnpm chaos:test`), the security script's
  (`pnpm security:test`, and shellcheck), and the ledge painter's pull script's (`pnpm masks:test`).
  The build job checks the built page for a database client or key (`pnpm security:bundle`).
- **Tagging a test `@smoke`**: give it the tag in Playwright's options,
  `test('…', { tag: '@smoke' }, async (…) => …)`. The quick tier runs
  `pnpm e2e --grep @smoke --project=desktop --project=edge`, so a smoke test must sit in a spec file
  one of those two projects matches (`apps/park/playwright.config.ts`). Keep the set small: the quick
  tier is meant to finish in under five minutes.
- **The shard timings**: `apps/park/e2e/shard.mjs` shares the suite out by
  `apps/park/e2e/durations.json` (seconds per test on a CI runner), longest first onto the shard with
  the least so far; a test with no measured time counts as the median. A full run that passes uploads
  a refreshed copy as the `durations` artifact (one run's times averaged with the table's). When tests
  are added, take that artifact from a passing full run and commit it as `apps/park/e2e/durations.json`
  (or run `node e2e/shard.mjs durations <report.json>` in `apps/park` on a merged JSON report).
- **Waiting in browser tests**: a test waits on the park's own state (`window.owlPark.state()`,
  through `state` in `apps/park/e2e/helpers.ts`, `expect.poll` or `page.waitForFunction`) or on the
  game's frames (`frames` in `helpers.ts`, counted in the game's updates, so a slow runner gets as many
  as a quick one), never on a fixed sleep.
- OPEN QUESTION: the suite still calls `waitForTimeout` in about two dozen places
  (`grep -rn waitForTimeout apps/park/e2e`). Some hold a key down for a set time (`holdSpace`), which
  is a press, not a wait; the others are fixed sleeps the rule above rules out.

## Checking a deployment

- `/api/health` answers `"ok": true` when the Worker and the park's three objects (the rooms, the
  ticket book, the collections) answer; a 503 names the part that did not. When something is wrong,
  `docs/PLAYBOOK.md` says what to check, how to roll back and how to pause ticket sales.
- Open the site in two browsers (or a phone and a laptop) and watch the owls see each other.
- `?debug=1` draws the walkable areas and doors. `?transport=local|edge` forces a transport
  (`apps/park/src/config.ts`; the `supabase` transport is gone, OP-150).
- The status dot in the top-right pill is gold when connected, grey when the park is offline.
- `node tools/load/swarm.mjs --url https://<host> --bots 20 --seconds 30` runs a small bot swarm and reports echo latency.
  The full load test runs on GitHub: Actions → Load test → Run workflow. It deploys a throwaway copy
  under its own name, never the live park, loads it step by step and deletes it; what it found is in
  `docs/ARCHITECTURE.md`, section 6.
