# Deploying Owl Park (free tiers only)

The park is a static site plus, optionally, a Supabase project for internet multiplayer.
Nothing here costs money at small scale.

## 1. Static hosting on GitHub Pages

1. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge to `main`. The workflow in `.github/workflows/deploy-pages.yml` builds the app and
   publishes it at `https://<owner>.github.io/<repo>/`.
3. The build reads these **repository variables** (Settings → Secrets and variables → Actions → Variables).
   All of them ship in the browser bundle, so they are public values, not secrets:

   | Variable | Purpose |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Supabase project URL (`https://xxxx.supabase.co`) |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon (publishable) key |
   | `VITE_SHOP_URL` | Link opened by the gift shop button; leave unset until the store opens |

Without the Supabase variables the park still deploys and runs; visitors simply only see
other owls from tabs on their own device.

Any other static host works the same way (Cloudflare Pages, Netlify): build with
`pnpm build` and serve `apps/park/dist`. Set `BASE_PATH=/` when the site is at a domain root.

## 2. Internet multiplayer on Supabase (free tier)

Version 1 needs **no database tables and no auth**: it uses Supabase Realtime public
channels only (Presence for who is here, Broadcast for walks).

1. Create a project at supabase.com (free plan). Any region; closest to most visitors is best.
2. Project **Settings → API**: copy the Project URL and the anon public key.
3. Put them in the repository variables above (for Pages) or in `apps/park/.env.local` (for local runs).
4. Realtime is on by default. Nothing else to configure for v1.

What the free plan allows today is tracked in `docs/ARCHITECTURE.md` (connection and
message limits, and the upgrade path when they are reached). The park sends one message
per tap plus a throttled presence refresh, not a stream of positions, to stay well inside them.

## 3. Checking a deployment

- Open the site in two browsers (or a phone and a laptop) and watch the owls see each other.
- `?debug=1` on the URL draws the walkable areas and doors.
- The status dot in the top-right pill is gold when connected, grey when the park is offline.
