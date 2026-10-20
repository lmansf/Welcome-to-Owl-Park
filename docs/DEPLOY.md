# Deploying Owl Park (free tiers only)

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
   signing key and logs a warning, and the admin routes stay closed.
4. Watch it: `pnpm --filter @owl-park/edge exec wrangler tail`, or the Workers Logs and Traces pages
   in the dashboard (both are switched on in `wrangler.jsonc`).

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
     the Worker after the deploy, so step 3 above is not needed when they are set here.
3. Merge to `main`. The workflow builds and deploys. Worker secrets set either way are kept across
   deploys.
4. Operations: in the Cloudflare dashboard set a usage notification at 50 % of the free daily
   Durable Object request cap, and buy Workers Paid ($5/month) before the first promoted weekend.
   The free plan fails closed at the daily cap.

### Coding agents

Claude Code picks up the Cloudflare skills vendored in `.claude/skills/` and the Cloudflare MCP
server declared in `.mcp.json` when started from the repository root (approve the server when
asked; it signs in to your Cloudflare account through the browser). For other projects the same
guidance installs with `/plugin marketplace add cloudflare/skills` and
`/plugin install cloudflare@cloudflare`. `tools/cloudflare-skills.sh` refreshes the vendored copy.

Configuration lives in `apps/edge/wrangler.jsonc`: `ROOM_SHARDING` (`single` or `room`),
`GATE` (`open` now; `ticket` once tickets exist), optional `ROOM_CAPS` JSON, `PARK_TZ` (the park
day for the Realm Vote) and `VOTE_TALLY_PUBLIC`. Secrets, set once with `wrangler secret put`:
`PASS_SIGNING_KEY` and `ADMIN_KEY` (16+ random characters; needed to read the private vote tally
and to close a month by hand). A cron trigger closes the Realm Vote month automatically.

## Checking a deployment

- Open the site in two browsers (or a phone and a laptop) and watch the owls see each other.
- `?debug=1` draws the walkable areas and doors. `?transport=local|supabase|edge` forces a transport.
- The status dot in the top-right pill is gold when connected, grey when the park is offline.
- `node tools/load/swarm.mjs --url https://<host> --bots 20 --seconds 30` runs a small bot swarm and reports echo latency.
