# Owl Park: notes for coding agents

pnpm monorepo. `apps/park` is the Vite + Phaser client, `packages/shared` holds the protocol,
geometry and room data, and `apps/edge` is the Cloudflare project: the Worker, both Durable
Objects and `wrangler.jsonc`. `apps/score-endpoint` is not the park's: it is the fraud pipeline's
scoring endpoint, a Supabase Edge Function deployed to the owner's project on the owner's go (its
README). Run Wrangler through the package scripts so the pinned version is
used: `pnpm dev:edge`, `pnpm deploy:edge`, or `pnpm --filter @owl-park/edge exec wrangler <command>`.

- Checks before a push: `pnpm check` (typecheck, unit tests, build) and `pnpm e2e` (Playwright).
- The edge typecheck runs `wrangler types` first; `apps/edge/worker-configuration.d.ts` is generated
  and ignored by git. Never hand-write the `Env` bindings; change `wrangler.jsonc` instead.
- Cloudflare guidance for agents is vendored in `.claude/skills/` (refresh with
  `tools/cloudflare-skills.sh`); prefer it over memory for Wrangler, Workers and Durable Objects.
- Art comes from Seedream through `tools/art` (`tools/art/README.md`, `docs/ART-PIPELINE.md`).
  With `FAL_KEY` set: `pnpm art:generate --provider fal --only <key> --dry-run` first, then without
  `--dry-run`; show the owner the contact sheet (`pnpm art:finish sheet <key>`) and let them pick;
  finish, then `pnpm art:preview` and show them the compare images before publishing anything.
  The owner approves art; never publish or commit generated art without that.
- Secrets (`PASS_SIGNING_KEY`, `ADMIN_KEY`) are set with `wrangler secret put`, never committed.
  `TRUST_FORWARDED_FOR` is for local load tests only. Deploy steps live in `docs/DEPLOY.md`.
- This repository is public. Internal working names for unreleased realms, the owner's personal
  details and employer, and the names of other games stay out of code, docs, art, tests and commit
  messages. Closed-realm signs (the blockades in the hub's closed arches) may show only the
  approved phrases in `CLOSED_SIGNS` (`packages/shared/rooms/index.ts`).
