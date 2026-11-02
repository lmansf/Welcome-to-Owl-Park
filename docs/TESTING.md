# Testing: how the park is checked

- Status: current
- Verified against: branch claude/op-202-docs off main 01e9722 (2026-11-02)
- Code: package.json, apps/park/playwright.config.ts, apps/park/e2e/, .github/workflows/ci.yml, .github/workflows/chaos.yml, .github/workflows/load-test.yml, .github/workflows/security-nightly.yml, apps/edge/stryker.config.mjs, packages/shared/stryker.config.mjs, tools/mutation/, tools/load/, tools/chaos/, tools/security/, tools/art/test/, tools/art/test_art_tools.py, apps/edge/test/logEvents.test.ts, apps/edge/test/logged.ts, packages/shared/src/routes.ts, packages/shared/rooms/rooms.test.ts
- Tickets: OP-068, OP-075, OP-084, OP-088, OP-123, OP-131, OP-132, OP-134, OP-140, OP-149, OP-150, OP-151
- Related: docs/DEPLOY.md, docs/CAPACITY.md, docs/SECURITY.md, docs/PLAYBOOK.md, docs/ART-PIPELINE.md, CLAUDE.md

How the park is tested, and which check to run when. Every command runs from the repository root.
Each section names the file that defines the check; when the file changes, this page follows it.

**Testing the live park needs the owner's written authorisation** (`docs/SECURITY.md`). Every check
on this page runs against this machine or a throwaway copy, except the nightly security check and
the uptime check, which the owner set up.

## Which check, when

| You are about to | Run | Time |
| --- | --- | --- |
| Push any change | `pnpm check`, then `pnpm e2e` | minutes; the browser suite longer |
| Change the shared rules, the room server or the Worker | the above; mutation testing comes with the pull request | CI |
| Change a tool under `tools/` | its own tests (`pnpm chaos:test`, `pnpm security:test`, `pnpm masks:test`, `pnpm art:test`) | seconds |
| Change art | `pnpm art:test`, then `pnpm art:finish check --all` | seconds |
| Judge how the park holds up | a chaos experiment (`pnpm chaos <n>`), or the load test in Actions | minutes |

## `pnpm check` [BUILT]

`pnpm check` is `pnpm typecheck && pnpm test && pnpm build` (`package.json`). It needs no Python and
no browser.

- `pnpm typecheck` runs `tsc` in every package. The edge packages (`apps/edge`, `apps/ig-connector`)
  run `wrangler types` first; `worker-configuration.d.ts` is generated and ignored by git.
- `pnpm test` runs each package's unit tests with vitest (`vitest run`):

| Package | Tests | Where |
| --- | --- | --- |
| `packages/shared` | the shared rules: rooms, walking, flight, quests, the book, the arcade, the climb, the frames | `src/*.test.ts`, `rooms/rooms.test.ts` |
| `apps/edge` | the Worker and the room server, on Node, with Node's built-in SQLite standing in for a Durable Object's (`test/sqlite.ts`) and a fake store (`test/fakeStore.ts`) | `test/*.test.ts` |
| `apps/park` | the page's own modules: the HUD, the Menu, the arcade games, art names and budgets | `src/**/*.test.ts` |
| `apps/park-log`, `apps/ig-connector` | each Worker's own | `test/*.test.ts` |

- `pnpm build` builds the page (`apps/park/dist`).

### Rules the unit tests hold

- **Route tiers (OP-084).** `perchTiers` (`packages/shared/src/routes.ts`) reckons what reaching each
  perch from the floor takes: tier 1 is single jumps alone, tier 2 needs the second flap somewhere on
  the way, tier 3 only a glide gets there. A hop counts with room to spare: its rise stays
  `ROUTE_MARGIN` (10 px) under the most a jump (`JUMP_RISE`, about 149 px) or a jump and a flap gives,
  and its crossing at most `ROUTE_REACH` (0.8) of what the flight covers over the plan. A perch is as
  easy as the easiest route to it. `packages/shared/rooms/rooms.test.ts` holds every room to them:
  every perch has a route up (no tier is null), and every quest spot up on a perch stands on a tier 1
  perch. `packages/shared/src/routes.test.ts` freezes the tiers of the hub's, the grove's and the
  market's perches.
- **Log events (OP-134).** The Worker and the room server log only through the shared logger
  (`packages/shared/src/log.ts`, `apps/edge/src/logs.ts`). `apps/edge/test/logEvents.test.ts` fails
  when an event in `LOG_EVENTS` is never looked for with `logged(lines, event, fields)`
  (`apps/edge/test/logged.ts`) in a test (the logger's own events, `LOGGER_EVENTS` and
  `RESERVED_LOG_EVENTS`, are left to `packages/shared/src/log.test.ts`). It also fails on a `catch`
  block with nothing in it but comments, a `.catch(() => undefined)` or `.catch(() => {})`, a
  `.catch(() => null)` anywhere but after `.json()`, and any `console.*` call in `apps/edge/src`
  (the keepers' `*Page.ts` scripts are left out). A new event therefore goes in `LOG_EVENTS`, fires in
  a test through `logged()`, and gets a `TODO-DOCS` note for `docs/LOGGING.md` (`CLAUDE.md`).
- **The Menu's clarity rules (OP-108).** `apps/park/src/ui/menuTheme.test.ts`; see `docs/MENU.md`.

## `pnpm e2e`: the browser tests [BUILT]

Playwright (`apps/park/playwright.config.ts`, tests in `apps/park/e2e/`). Install the browser once
with `pnpm exec playwright install chromium`. Locally the suite runs one test at a time
(`workers: 1`), with no retries; a test gets 45 s, an `edge` test 90 s.

| Project | Device | Runs against | Files |
| --- | --- | --- | --- |
| `desktop` | Desktop Chrome, 1280 x 800 | the Vite dev server (`pnpm dev`, port 5173), the local transport: no room server, multiplayer is tabs on one device | the park, collectibles, the lobby, activities, nests, the arcade, the climb, chat, leaving, home, feedback, the pad, the mirror, sleep, flight, perches, the loader, travel, the tree, which owl |
| `phone` | Pixel 7, Chromium | the same dev server | the `desktop` list without collectibles and activities, plus `zoom.spec.ts` (touch zoom, OP-104) |
| `edge` | Desktop Chrome, 1280 x 800 | the built page served by the Worker under `wrangler dev` (port 8787), real WebSockets | the room server, opening night, the gate, the turnstiles, checkout, the line, the climb, accounts, travel, the page's policy, the ledge painter, feedback, the card before the store, restart, the entries setting, spectators |

The `testMatch` patterns in `playwright.config.ts` are the source of each list.

Playwright starts three servers, or reuses ones already running: `pnpm dev`; a stand-in store
(`e2e/standInStore.mjs`, port 8790) that plays the Shopify store and the mail sender; and the
Worker, built with the store's test pages and started with an empty storage folder of its own
(`apps/edge/.wrangler/e2e`), so nothing an earlier run left decides a test. The Worker gets test-only
settings (`EDGE_VARS`): the admin key, the stand-in store, `ACCOUNTS` on, `SPECTATORS` on, and the mail
settings. Those values exist only on this test server.

- One project: `pnpm e2e --project=edge`. One file: `pnpm e2e park.spec.ts`.
- Every test that imports `test` from `e2e/fixtures.ts` fails on a Content Security Policy violation
  in any browser context it opens (OP-140).
- Browser tests wait on the park's own state or its frames, never on fixed sleeps (OP-123).
- A test tagged `{ tag: '@smoke' }` is in the smoke set (six tests today, in `edge`, `gate`, `lobby`,
  `park` and `spectator`): `pnpm e2e --grep @smoke --project=desktop --project=edge`.
- `e2e/durations.json` holds each test's measured seconds on a CI runner, for the shards. Refresh it
  from a full run's `durations` artifact when tests are added; a test with no time counts as the median.

OPEN QUESTION: `e2e/treeL2.spec.ts`, `treeL3.spec.ts` and `treeL4.spec.ts` match no project's
`testMatch` (the patterns take `tree.spec.ts` only), so `pnpm e2e` and CI never run them.
`perches.spec.ts`, `tree.spec.ts` and the three `treeL*` files also import `test` from
`@playwright/test`, not from `e2e/fixtures.ts`, so the policy watch does not cover them.

## CI [BUILT (OP-123)]

`.github/workflows/ci.yml`. A push that changes only `docs/**` or Markdown runs nothing. A failed
typecheck or unit-test job cancels the rest of the run.

| Job | Quick tier: a push to a branch other than `main` | Full tier: a pull request, a push to `main`, nightly at 07:00 UTC, by hand |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | the same |
| Unit tests | `pnpm test`, `pnpm chaos:test`, `pnpm security:test`, `shellcheck tools/security/security-test.sh`, `pnpm masks:test` | the same |
| Build | `pnpm build`, `pnpm security:bundle` | the same |
| Browser | the smoke set on `desktop` and `edge` | the whole suite on twelve runners, shared out by measured time (`apps/park/e2e/shard.mjs`), retries 1, the shards' reports merged into one (`playwright-report` artifact) and a fresh `durations` artifact |
| Mutation | none | the eight shards, then the scores job (below) |

The quick tier aims to finish in under five minutes; a full-tier shard in under ten.

The other workflows:

| Workflow | When | What it runs |
| --- | --- | --- |
| `chaos.yml` | by hand | one chaos experiment (below) |
| `load-test.yml` | by hand, with `CLOUDFLARE_DEPLOY` set | the load test against a throwaway copy (below) |
| `security-nightly.yml` | nightly at 09:30 UTC, by hand | `tools/security/security-test.sh` against `PARK_URL` |
| `uptime.yml` | every 15 minutes | the park's health check; three failures in a row fail the run |
| `deploy-worker.yml`, `deploy-pages.yml` | a push to `main` | `pnpm build` and `pnpm security:bundle` before anything goes out |

## Mutation testing [BUILT (OP-131)]

Stryker changes the code in small ways (a `<` for a `<=`, a deleted return, `||` for `&&`) and runs
the unit tests against each change, a mutant. A mutant no test notices survives: it marks a line the
tests run but do not really check. The score is the mutants caught (killed, or timed out) over the
mutants that a test ran on or that no test reached. Never chase 100.

What both packages share is in `tools/mutation/stryker.mjs`: the vitest runner, the TypeScript
checker, incremental runs (each shard keeps `reports/<shard>/stryker-incremental.json`, so a run tests
only what changed), `ignoreStatic`, and no `StringLiteral` or `ObjectLiteral` mutants.

### Scopes and shards

| Scope | Shards | What it mutates | Config |
| --- | --- | --- | --- |
| the room server | `room` | `Room.ts`, `RoomObject.ts`, `Overflow.ts`, `line.ts`, `copies.ts`, `collectLog.ts` | `apps/edge/stryker.config.mjs` |
| the Worker | `worker` | passes and the gate, accounts, the store's webhooks, the ticket desk and book, the vote ledger, and of `routes/http.ts` only `isAdmin` and `passFrom` (found by name, `linesOf`) | `apps/edge/stryker.config.mjs` |
| the shared rules | `climb-1`, `climb-2`, `climb-3`, `book`, `moves`, `floor` | the climb in three pieces (cut at its `// 2. The dash` and `// 8. The cling` lines, `piecesOf`); the book (quests, the shop, the arcade's payouts, accounts); the moves (flight, a walk, the way round, the climb's runs, the frames); the floor (`geometry.ts`, `resolveTarget.ts`) | `packages/shared/stryker.config.mjs` |

Out of scope: the keepers' pages (`*Page.ts`), the SQL stores, the data catalogues, sprites and the
page's drawing rules, and the line's settings (`overflow.ts`, whose tests are the room server's).
Under Stryker the shared tests run with `packages/shared/vitest.stryker.config.mjs`: a test gets a
minute, and `mutationRun` lets a long sweep take a sample.

### Running it

```bash
pnpm mutate                                              # both packages, every shard
pnpm --filter @owl-park/shared mutate                    # one package
MUTATION_SHARD=book pnpm --filter @owl-park/shared mutate   # one shard
```

A shard's report is `<package>/reports/<shard>/mutation/index.html` (and `mutation.json`). In CI the
mutation job runs after the unit tests on the full tier only: on a pull request only the shards whose
code it touches (`apps/edge/`, `packages/shared/`, `tools/mutation/` or `patches/`), on `main` and by
hand the mutants of what changed since the cached results, and nightly every mutant (`--force`).
Each shard's report is kept 14 days.

### Thresholds

The scores job (`tools/mutation/summary.mjs`) adds each scope's shards together, writes the score and
a row per file into the run's summary, and fails the run when a scope scores under the break
threshold. The schedule: break under 50 now (`--break 50` in `ci.yml`), 70 after two weeks, 80 by the
preview. Stryker's own `high` (80) and `low` (60) only colour the report. Nightly scores are kept 90
days, to compare over time.

OPEN QUESTION: the date the break threshold moves to 70 is not written anywhere; `ci.yml` holds 50.

### The runner's patch

`patches/@stryker-mutator__vitest-runner@10.0.0.patch`. The 10.0.0 runner picks a mutant's tests by
their names joined with spaces, and vitest 5 matches names joined with `' > '`: without the patch no
test runs against any mutant and every one survives. Stryker 10.1.1 has the same fix; the patch goes
with that upgrade.

### Equivalent mutants

A mutant no input can tell from the code is equivalent. It survives forever and needs no test. The
list, with why:

`apps/edge/src/pass.ts` (`apps/edge/test/pass.test.ts`):

- `b64url`'s `/=+$/` as `/=+/`: `btoa` puts `=` only at the end.
- `unb64url` with no padding added, and its loop run to `i <= length`: `atob` reads unpadded
  base64, and a typed array drops a write past its end.
- The HMAC key made extractable: it never leaves `key()`.
- `verified`'s dot test as `dot < 0`, or none: a token with no body, or no dot, then fails its
  signature or its JSON.
- `verified`'s object test, five ways: every reader then asks for its own fields, which no primitive
  or array has.

A newly found equivalent mutant is written up beside its tests, with a `TODO-DOCS` note for this list.

## Load tests [BUILT (OP-068, OP-075)]

Bots on WebSockets against a copy of the room server; never the live park. What they found is in
`docs/ARCHITECTURE.md` section 6 and `docs/CAPACITY.md`.

- `tools/load/swarm.mjs` (`pnpm load`): a few bots against one room, each minting a guest pass,
  joining with a `hello`, tapping a walkable point every `--tap-every` ms and timing the echo of its
  own move. Locally: `pnpm dev:edge`, then
  `pnpm load --url http://localhost:8787 --bots 3 --seconds 30 --room hub`. It exits 1 when under 90 %
  of the bots were welcomed. It reads the protocol version from `packages/shared/src/edge.ts`.
- `tools/load/run-steps.mjs`: the load test's six steps one after another (the hub at its cap calm,
  busy, at 120; four rooms at their caps; four rooms at 120 each), each split over swarm processes
  of 40 bots, with a Markdown table of what each found. `--quick` runs every step with a tenth of the
  owls for 10 s, a check that the steps work; `--only 3,5` picks steps.
- `tools/load/capacity-dry-run.mjs`: the busy-night rehearsal (OP-075) with the admin key: a second
  copy of the hub, newcomers sent to it, the copy drained and closed, then the line timed.
- `.github/workflows/load-test.yml`, by hand: deploys a throwaway copy (`owl-park-load`, its
  `workers.dev` address only, no domain, no cron, empty Durable Objects; its config written by
  `tools/load/throwaway-config.mjs`, which must never be deployed as the park), runs `steps` or
  `capacity` against it with one object for the park or one per room, and deletes it whatever
  happened. Its requests count toward the account's free daily allowance (a few thousand of 100,000).

## Chaos experiments [BUILT (OP-132)]

`tools/chaos/run.mjs` runs one experiment against a throwaway park on this machine (the Worker and
the room server under `wrangler dev`, port 8797, and the browser tests' stand-in store, port 8791).
Nothing is deployed.

```bash
node tools/chaos/run.mjs --list        # the experiments, and which can run yet
pnpm chaos 7                           # one, by number or id (emote-flood)
pnpm chaos:test                        # the harness's own tests (CI's unit job)
```

Options: `--port`, `--store-port`, `--no-build` (`apps/park/dist` is current), `--no-journey` (no
browser page in the steady state). In Actions: Chaos, Run workflow, pick the experiment.

### The steady state

Defined before any experiment (`tools/chaos/lib/steady.mjs`, `STEADY`), checked before it and every
5 s during it (the checkout and the journey every 30 s). The harness refuses to start while it does
not hold.

- `health`: `GET /api/health` answers 200.
- `latency`: 10 scripted visitors walking in the hub; the room echoes 95 % of their moves within 300 ms.
- `errors`: under 1 % of their moves and joins go unanswered or fail.
- `checkout`: a store order's webhook gives out its ticket and the claim link within 5 s.
- `journey`: a scripted page comes into the hub and walks into the grove; each room opens, the room
  server welcomes it and the owl can move within 10 s.

The abort rule (`ABORT_RULE`, `lib/runlog.mjs`): any check failing for more than 30 s ends the
experiment and runs its rollback. The harness never leaves a fault injected. Exit 0: the hypothesis
held and the park came back; 1: it did not; 2: the run could not start.

### The experiments

Each names its hypothesis, blast radius and rollback (`tools/chaos/experiments/`).

| # | Id | What it does | Built |
| --- | --- | --- | --- |
| 1 | `room-server-killed` | kills the room server for 3 s mid-session; everyone is back within 10 s, each owl where it stood (OP-087) | BUILT |
| 2 | `fraud-endpoint-stalled` | the scoring endpoint slow, then gone; a checkout fails open inside 2 s | PLANNED (OP-053): the park calls no scoring endpoint yet; a run records not runnable |
| 3 | `webhook-dropped` | the store's webhook answered 500, then too late; the order gets one ticket and one claim email, never two | BUILT |
| 4 | `rooms-full` | the hub filled to its 80, then more; the next visitor goes in the line with the busy ribbon, nobody inside lags (OP-075, OP-088) | BUILT |
| 5 | `slow-phone` | one phone on 3G; it comes in and plays, and the load bar only grows (OP-129) | BUILT |
| 6 | `clock-skew` | a page's clock 10 minutes fast; it draws the other owls walking as a page on time does | BUILT |
| 7 | `emote-flood` | one visitor sends 50 emotes a second; it is throttled, then closed, and nobody else lags (OP-089) | BUILT |
| 8 | `log-sink-down` | the collection log's database unreachable; starter packs still arrive, the outbox delivers each row once later (OP-107) | BUILT |
| 9 | `teleport-from-console` | a page worked from the console to put its owl where it cannot walk; nobody sees it off the floor, the room logs `position_rejected` (OP-149) | BUILT |

OPEN QUESTION: `chaos.yml` offers experiments 1 to 8 only, so experiment 9 runs only on a machine.

### A run's folder

Every run, pass or fail, is recorded in `tools/chaos/results/<date>-<experiment>/` (a second run that
day gets `-2`): `run.json` (the experiment, the commits, the verdict, the abort, the rollback, the
tickets filed), `timeline.jsonl`, `logs/park.jsonl` (the park's lines, stamped with the run's id from
the `X-Chaos-Run` header), `logs/raw.log`, `logs/visitors.jsonl`, `result.md`, `graph.svg` and
`proposed-tickets.json`. `tools/chaos/results/INDEX.md` gets a line per run; the Docs hat keeps it.
In Actions the folder is the run's artifact, kept 90 days.

### Proposed tickets, and filing them

The harness proposes; it never files (`lib/propose.mjs`). `proposed-tickets.json` holds one entry
per gap, each `filed: false`:

- **PATCH**: the hypothesis failed or the park degraded. The observation (what, value, when), the
  component and the smallest fix the evidence supports. Type Bug.
- **LOGGING GAP**: the harness could not tell what happened because the park did not log it. The
  question it could not answer and the line or metric to add. Type Finding, flagged Informational,
  never dropped.

Under the QA hat, review the file, de-duplicate against open tickets (the same experiment and
component is one ticket, with the recurrence noted), file the rest on the Ticket Board for the Build
hat, and list them in `run.json`'s `filed`. The entries' `assignee` field still reads `Claude Code`.

## Security tests [BUILT (OP-150, OP-151)]

- `pnpm security:bundle` (`tools/security/bundle-check.mjs apps/park/dist`): the built page holds no
  database client or key. It reads every text file the page ships and fails on a Supabase client or
  address, a string shaped like a JWT or a Supabase key, naming the file and never the text. It runs
  after every build in CI and before both deploys.
- `tools/security/security-test.sh`: the park from the outside, as a stranger's browser or script
  meets it: the page's headers and policy, the nonce, HSTS, the report endpoint, CORS, refusals
  without a pass, body limits on `/api/feedback`, no-store on the API. It prints PASS, FAIL or SKIP
  per check and exits 1 on any FAIL. Against this machine: `pnpm dev:edge`, then
  `PARK_URL=http://localhost:8787 tools/security/security-test.sh`. About 16 requests a run;
  `RATE_CHECK=1` adds the rate-limit burst, which the nightly run never does. Against the live park
  it runs only nightly in Actions, or with the owner's written authorisation.
- `pnpm security:test`: the bundle check's own tests and the script's tests against a stand-in park;
  CI also runs `shellcheck` on the script.
- Inside the unit tests: `apps/edge/test/guard.test.ts`, `hostile.test.ts`, `gateHardening.test.ts`
  and their neighbours. In the browser: `policy.spec.ts` and the policy watch above.

What the checks defend, and why: `docs/SECURITY.md`.

## Art tests [BUILT]

```bash
pnpm art:test                  # the generator's tests (node --test tools/art/**/*.test.mjs) and the finish's (python unittest, tools/art/test_*.py), offline
pnpm art:finish demo           # synthetic input through every finish command, in a temporary folder
pnpm art:finish check --all    # everything published: sizes, budgets, chunks, formats, provenance
```

The Python half needs Python 3.11 or newer with Pillow 12 and numpy; `pnpm check` does not. Inside
`pnpm check`, `apps/park/src/game/artBudget.test.ts` holds the page's art budget. The pipeline itself:
`docs/ART-PIPELINE.md`.
