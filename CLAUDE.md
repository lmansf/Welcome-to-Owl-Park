# Owl Park: notes for coding agents

pnpm monorepo. `apps/park` is the Vite + Phaser client, `packages/shared` holds the protocol,
geometry and room data, and `apps/edge` is the Cloudflare project: the Worker, both Durable
Objects and `wrangler.jsonc`. Run Wrangler through the package scripts so the pinned version is
used: `pnpm dev:edge`, `pnpm deploy:edge`, or `pnpm --filter @owl-park/edge exec wrangler <command>`.

- Checks before a push: `pnpm check` (typecheck, unit tests, build) and `pnpm e2e` (Playwright).
- The edge typecheck runs `wrangler types` first; `apps/edge/worker-configuration.d.ts` is generated
  and ignored by git. Never hand-write the `Env` bindings; change `wrangler.jsonc` instead.
- Cloudflare guidance for agents is vendored in `.claude/skills/` (refresh with
  `tools/cloudflare-skills.sh`); prefer it over memory for Wrangler, Workers and Durable Objects.
- Secrets (`PASS_SIGNING_KEY`, `ADMIN_KEY`) are set with `wrangler secret put`, never committed.
  `TRUST_FORWARDED_FOR` is for local load tests only. Deploy steps live in `docs/DEPLOY.md`.
- This repository is public. Internal working names for unreleased realms, the owner's personal
  details and employer, and the names of other games stay out of code, docs, art, tests and commit
  messages. Closed-realm signs may show only the phrases already used by the sign art in
  `apps/park/public/art`.
