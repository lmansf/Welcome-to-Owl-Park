# Owl Park: notes for coding agents

pnpm monorepo. `apps/park` is the Vite + Phaser client, `packages/shared` holds the protocol,
geometry and room data, and `apps/edge` is the Cloudflare project: the Worker, both Durable
Objects and `wrangler.jsonc`. `apps/park-log` is not the park's deploy: it is the collection log's
Supabase Edge Function in the owner's analytics project (its README). `apps/ig-connector` is its own
Worker too, not the park's: the Instagram MCP connector (OP-168; its README has the setup and
secrets). Run Wrangler through the package scripts so the pinned version is used: `pnpm dev:edge`, `pnpm deploy:edge`, or `pnpm --filter @owl-park/edge exec wrangler <command>`.

- Checks before a push: `pnpm check` (typecheck, unit tests, build) and `pnpm e2e` (Playwright).
- The edge typecheck runs `wrangler types` first; `apps/edge/worker-configuration.d.ts` is generated
  and ignored by git. Never hand-write the `Env` bindings; change `wrangler.jsonc` instead.
- The Worker and the room server log only through the shared logger (`packages/shared/src/log.ts`,
  `apps/edge/src/logs.ts`; OP-134). A new event goes in `LOG_EVENTS` and fires in a test through
  `logged()` (`apps/edge/test/logged.ts`), with a `TODO-DOCS` note for `docs/LOGGING.md`; no catch
  swallows an error unseen. `apps/edge/test/logEvents.test.ts` fails otherwise.
- Cloudflare guidance for agents is vendored in `.claude/skills/` (refresh with
  `tools/cloudflare-skills.sh`); prefer it over memory for Wrangler, Workers and Durable Objects.
- Art comes from Seedream through `tools/art` (`tools/art/README.md`, `docs/ART-PIPELINE.md`).
  With `FAL_KEY` set: `pnpm art:generate --provider fal --only <key> --dry-run` first, then without
  `--dry-run`; show the owner the contact sheet (`pnpm art:finish sheet <key>`) and let them pick;
  finish, then `pnpm art:preview` and show them the compare images before publishing anything.
  The owner approves art; never publish or commit generated art without that.
  The stained-glass realm's two screens, the climb's six tower pieces (`climb-*`, drawn in plain
  glass by the climb scene until they ship) and the Glass Circlet are art the owner picks the same way.
- Secrets (`PASS_SIGNING_KEY`, `ADMIN_KEY`) are set with `wrangler secret put`, never committed.
  `TRUST_FORWARDED_FOR` is for local load tests only. Deploy steps live in `docs/DEPLOY.md`; what to
  do when the park is in trouble, in `docs/PLAYBOOK.md`.
- This repository is public. Internal working names for unreleased realms, the owner's personal
  details and employer, and the names of other games stay out of code, docs, art, tests and commit
  messages. Closed-realm signs (the blockades in the hub's closed arches) may show only the
  approved phrases in `CLOSED_SIGNS` (`packages/shared/rooms/index.ts`).

## Elephant-Goldfish Model (EGM)

The EGM plugin (`egm@egm` from `google/elephant-goldfish-model`) is enabled for this repository in
`.claude/settings.json`. A new machine fetches it once with
`claude plugin marketplace add google/elephant-goldfish-model && claude plugin install egm@egm --scope project`;
a cloud session does not load project plugins, so install there the same way at the start of the
session. Skills run as `/egm:egm-brainstorm`, `/egm:egm-draft`, `/egm:egm-review`,
`/egm:egm-bootstrap`; the skills, Goldfish personas and standards live in the plugin cache, not here.
Start with the `owl-park-elephant` skill (`.claude/skills/owl-park-elephant`) to load the context.

- **Subagents may spawn subagents.** EGM needs two layers below the main context: the synthesizer
  spawns the Goldfish reviewers, and the bootstrap orchestrator spawns workers that spawn read-only
  scouts. `.claude/settings.json` pins `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to `3` (Claude Code
  2.1.219 or later). Do not lower it, do not deny `Agent` to the EGM adapters, and do not run EGM
  through a harness that cannot nest (in Claude Cowork, dispatch reviewers from the main context).
- **Artifacts.** `EGM artifact directory: EGM`. Briefs, drafts and review reports go to `EGM/`,
  which git ignores except its README. A brief may name unreleased realms; nothing from `EGM/` is
  committed or quoted into a public file without the screening the rules above require.
- **Design docs.** EGM defaults to `docs/designs/<feature>.md`. `docs/` is the Docs hat's
  (`docs/README.md`, `docs/agents.md`), so confirm the folder with the owner before the first design
  doc is written.
- **Bootstrap.** `/egm:egm-bootstrap <path>` writes per-directory README contracts (interface,
  invariants, side effects, verification) bottom-up and spawns workers for trees over five
  directories; it asks before running on more than fifteen. Human READMEs exist at the root,
  `apps/park-log`, `tools/art` and `docs`: pass `target_filename=EGM.md` to leave them untouched, or
  let the correction policy merge into them. No `claude.md` goes beside the generated READMEs:
  they are contracts the agents read as files, linked from the root README down, and Claude Code
  only loads instruction files named `CLAUDE.md`. Bootstrap never commits; review its output first.
