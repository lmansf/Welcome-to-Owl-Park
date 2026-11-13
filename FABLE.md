# Owl Park: the brief for Fable

- Status: current
- Verified against: main 201bd7d (2026-11-10); the Ticket Board as read 2026-11-10
- For: Fable, a Claude model the owner is pointing at the game to improve it, including redoing whole chunks
- Read next: `CLAUDE.md` (rules for coding agents), `docs/README.md` (map of the docs), `docs/ARCHITECTURE.md` section 0

Read this first. It says what Owl Park is meant to be, the owner's standing rules, how the game is
built today, how to tell whether a change made it better, and what to leave alone. You may rebuild
whole parts of the game (the owner's words: "I'm okay with it fully redoing chunks of it if it can
improve everything"), as long as every rebuild keeps the rules below and goes through the gate.

## 1. What Owl Park is

A multiplayer owl park in the browser, live at exploreowlpark.com. Every visitor is an owl. Owls
walk, glide and hop through rooms, see everyone else who is there right now, talk in prewritten
phrases (no typing, ever), play mini games and parkour courses, do quests for feathers, collect
wearables and pets, and decorate a nest of their own. The preview opens on 2026-12-01 (OP-066).

Who plays: anyone, including small kids.

- **The kid bar.** Anything a player has to do should be something a 10 year old can do in a few
  tries. The bots hold courses to this: every hop a course needs lands at least half of a kid's
  tries (`KID_BAR` in `bots/sim/playtest.ts`).
- **Every player is treated the same.** No "grown ups" wording anywhere, on screen, in docs or in
  tickets (the owner, Nov 6: "Let's treat players all the same, and trust adults to only give their
  kids access to games they trust"). OP-153 and OP-269 have titles from before this rule; the rule wins.

## 2. The owner's design rules

These are Logan's, in his words where quoted. They outrank anything older in `docs/` or on the board.

**Gameplay before art**
- "We can ignore the quality of the art for now as long as we get the mechanics and gameplay very
  smooth and down completely."
- Artists will replace every asset in the game, so design with that in mind. Stand-in art for a new
  piece is a box labelled with its dimensions, "so that way I know how big of a piece to make".
  Size boxes are built: `?sizes=1` (`apps/park/src/game/sizeBoxes.ts`). Art goes in through the
  realm kit's slot names (OP-275) and the import step (OP-274, `pnpm art:import`).

**Camera**
- Communal areas are seen from above (top down): inside the tree (the Great Hollow, `m3-hall`), the
  park entrance (`lobby`), each realm's start, and the arcade. Everything else is a 2D side-view
  platformer. Rooms carry `view: 'top' | 'side'` (`RoomView` in `packages/shared/src/room.ts`;
  the split is OP-284).
- Top-down rooms should "feel big, like a town center, rather than a room. somewhere that 80 people
  could gather." The lobby and hub hold up to 80 owls (`docs/CAPACITY.md`).

**Owls move like owls**
- Updrafts, glides, perches and knot-holes, not stairs, ladders, planks and doors (OP-287). As few
  human objects as the scene allows.
- The emote is a full head turn (OP-289: the head on its own layer, the body still).

**Rooms**
- "The placement of the items should always tell a story. Otherwise they're just clutter."
- "Give the player something to do, something to interact with, a quest, a pile of leaves, something
  shiny... Occasional feathers is acceptable." The Nov 8 measure: no spot in a room more than about
  3 seconds' walk from something to do (OP-306).
- The whole map is open to every player all the time; there is no unlock mechanic (Nov 7: "lets have
  the whole map unlocked all the time for players, instead of this unlock mechanic").
- Every path loops back; no dead ends (OP-307). Every area is within two doorways of the Treetop
  Commons, with fast travel from the Menu map (OP-305). Travel is play: updraft and glide chains (OP-308).

**Art direction, for image prompts**
- Hand-painted and soft, dreamlike, with warped, surreal imagination, and where it fits a little
  whimsical silliness. Describe these qualities in prompts; never name a studio, an artist or another
  work. The playable layer always stays readable: what an owl can stand on and use has the most
  contrast (OP-250, `docs/TREE_STYLE.md`).
- The owner picks every image before it is committed or published (`CLAUDE.md`). Generating art costs
  money: no paid generation run without his yes.

**Small rules that are easy to break**
- The vote scoreboard shows percentages only, never raw counts (OP-288).
- Closed signs may show only the phrases in `CLOSED_SIGNS` (`packages/shared/rooms/index.ts`).
- The repository is public: unreleased realm names, the owner's personal details and the names of
  other games stay out of code, docs, art, tests and commit messages (`CLAUDE.md`). Name rooms by
  their ids.
- pnpm only. Never npx.

## 3. How the game is built

A pnpm monorepo (Node 22, pnpm 10). Details: `docs/ARCHITECTURE.md`.

| Where | What |
| --- | --- |
| `apps/park` | The browser client: Vite, TypeScript, a slim Phaser 3. `src/game/RoomScene.ts` (about 4,000 lines, OP-200 wants it split) draws and runs every room; `src/ui/` is the DOM HUD and Menu; `src/net/` the transports; `e2e/` the Playwright tests |
| `packages/shared` | Rules with no platform code, used by client and server: the wire protocol (`src/edge.ts`), flight and walking (`src/flight.ts`, `src/geometry.ts`), room data (`rooms/index.ts`), quests, collectibles, courses, puzzles, the escape room, the party game |
| `apps/edge` | The Cloudflare Worker and its Durable Objects (`RoomObject` is the authoritative room server), the ticket book, the keepers' pages, `wrangler.jsonc` |
| `apps/park-log` | The analytics log: a Supabase Edge Function and its SQL. Not part of the park's deploy |
| `bots/` | The playtest bots (below) |
| `tools/` | Art pipeline, art kit, load and chaos tests, security check, preview and merge tooling |

**The map.** The live park is the new map (map 3): the park as one tree, from the Treetop Commons
(`lobby`, where owls arrive, `NEW_MAP_ARRIVAL`) down through the Great Hollow (`m3-hall`, a huge oval
seen from above, OP-317), the realm starts (`glass`, `grove`, `market`, `hub`), the side-view stair
rooms (`m3-stair-1` to `3`, `m3-ground`, `m3-cave`) and the arcade. The nests' street is `homes`.
Room ids are in `ROOMS`; the new map's own rooms in `packages/shared/src/newMap.ts`. Old links to a
folded room land where it went (`FOLDED_ROOMS`). `?newmap=0` shows the older tree (map 2, `l0` to
`l5`) and `docs/MAP.md` describes it; the top-down rooms `hub`, `grove`, `market`, `arcade`,
`lobby` are older still and reused on the new map.

**Multiplayer.** Online, owls join a room on the room server over a WebSocket (protocol in
`packages/shared/src/edge.ts`, `docs/ARCHITECTURE.md` section 4). With no server (local dev, previews,
the GitHub Pages copy) the park runs offline and tabs on one device see each other. Play with
friends (the co-op escape room, the party game, friend invites) is behind the flag `?friends=1`
(`apps/park/src/flags.ts`).

**Useful addresses while developing**: `?room=<id>`, `?debug=1` (walkable areas and doors),
`?boxes=1` (trigger boxes), `?sizes=1` (size boxes), `?test=1` (marks your visit as a test so it
stays out of the player counts). The full list is in `README.md`.

## 4. How to judge "better"

Better means fewer stuck, lost or quitting players and more finished quests and courses, not only
nicer code. Use these, in this order:

1. **The playtest bots** (`bots/README.md`, the Playtest check on every PR). The kid sim plays every
   side-view room and course thousands of ways and fails on a stuck spot, an unreachable doorway or
   leaf pile, a spawn on nothing, or a needed hop under the kid bar. The browser walk opens every
   room at 1440x900 and on a 844x390 phone and walks every doorway. A rebuild should leave
   `bots/baseline.json` shorter, never longer.
2. **CI** (`.github/workflows/ci.yml`, `docs/TESTING.md`): typecheck, unit tests, build, the full
   browser suite, mutation testing on what changed. Run `pnpm check` and `pnpm e2e` before you push.
3. **Real players** (Supabase, `game` schema, `apps/park-log/README.md`): `game.room_stay` (which
   room, how long, why it left), `game.quest_progress` (quest steps begun and finished),
   `game.play_event` with `game.v_course_run` (course starts, falls with their place, clears and
   quits; leaf piles and stalls used), and `game.v_player_session` (visits with test visits taken
   out). Read-only for you; ask the owner or Claude Duet for numbers if you can't query them. Say
   what a change should move before you build it.
4. **The daily QA walk and the morning feedback run.** Claude Duet walks the park three times a day
   and turns visitors' feedback notes into tickets. Its rule is to check whether each ticket's change
   actually worked and to shrink that report over time.

## 5. How to work

- **Branches and pull requests only.** Never push to `main` and never deploy by hand. A merge to
  `main` deploys the Worker and the site.
- **Every PR gets a preview link** (`.github/workflows/preview.yml`): `pr-<number>` on the preview
  Pages project, posted as a comment. Previews are offline (no room server, no tickets, no store),
  so anything that needs the live server is checked on the live park after the merge.
- **The merge gate** (the owner's rule, Nov 7: "Auto-merge is approved for all things Owl Park related
  unless told otherwise"). Before you label a PR `automerge`:
  1. `pnpm check` green on the branch, and CI green on the PR, the browser suite included.
  2. A test that fails on `main` and passes on the branch, or a line in the PR saying why one can't exist.
  3. A look at each room the change touches at 1440x900 and 1024x768, with a screenshot, on the
     preview link.
  4. Name any other open PR that touches the same files.
  5. No "grown ups" wording, no closed sign outside `CLOSED_SIGNS`, no internal realm names in public text.
  Then `.github/workflows/automerge.yml` squash-merges it when every check is green. It holds, for the
  owner's own yes, anything touching payments, the store, accounts, data deletion, SQL, the workflows
  or the merge rules (`tools/merge/owner-yes.mjs`).
- **A big rebuild can hide behind a flag** (merge class 3): register it in `apps/park/src/flags.ts`,
  read it with `flagOn()`, label the PR `flag-hidden`. It goes live switched off and is played with
  `?<param>=1`. Switching it on for everyone is a separate PR.
- **Phones.** The owner checks phone portrait and landscape himself on the preview link. Note in the
  PR what he should look at.
- **The formatter.** Don't run `pnpm format` on a branch until the one reformat commit has landed
  (`CLAUDE.md`).
- **Open PRs to avoid colliding with** (2026-11-10): 207 (refer a friend), 200 (account QA), 117
  (a hill on level 1), 60 (one room server per room), 58 (weekly data export). The first two and the
  last two wait on the owner; leave them be.

## 6. Leave these alone unless the owner says otherwise

A rewrite here could break tickets, lose owls or leak data.

- Checkout, tickets, passes and the gate (`apps/edge/src/TicketBook.ts`, `pass.ts`, `gate.ts`,
  `apps/park/src/ui/checkout*.ts`, `gateSale.ts`, `tickets.ts`), and the store link and its webhooks.
- Accounts and sign-in (`accounts.ts`, `accountBook.ts`, the email link, Sign in with Google).
- The referral and friend codes (OP-311, OP-312) and the Easter egg code check (OP-260).
- The Supabase schemas, tables and data (`apps/park-log`, every `.sql` file).
- Cloudflare: secrets, `wrangler.jsonc`, Durable Object storage and migrations.
- The keepers' admin pages under `/admin/*` and every keeper's-key action (closing and opening the
  park, the ribbon, the line).
- The fraud link (`docs/ARCHITECTURE.md` section 12; OP-052, OP-053, OP-072, OP-090): stays out.
- `.github/`, `tools/merge/`, `tools/flags/`.
- Money in any form: no test purchases, no paid services, no new accounts.

Everything else (rooms, movement, the camera, quests, activities, the HUD and Menu, the bots, the
art stand-ins, the room server's game rules) is open to rebuild.

## 7. Where work is tracked

The **Ticket Board** (Google Sheet "Owl Park — Ticket Board", tab Board; column C Status, D Owner,
Q Notes; a ticket's row is its number plus one). If it isn't on the board, it isn't work; how the
board works is in `docs/README.md`. If you can't open it, name the OP ids your PR touches and the
owner or Claude Duet will update it. `docs/CHANGELOG.md` lists what shipped.

**Built recently (don't redo unless rebuilding on purpose):** the new map and the Great Hollow oval
(OP-317), hub and spokes with fast travel (OP-305), fuller rooms (OP-306), loops and the feather
trail (OP-307), updraft and glide chains (OP-308), plaza scenes to do things in (OP-316), the three
parkour courses opened (OP-285), the ink course made kid-easy (OP-299), size boxes (OP-298), realm
starts re-laid top down (OP-276), the play log (OP-304), the HUD safe area (OP-278, OP-292), the
co-op escape room and the party game behind `?friends=1` (OP-310, OP-314, OP-315).

**Open and worth picking up** (gameplay first):
- OP-284 camera views by the owner's rule (in progress).
- OP-258 and OP-281 quests across the new map: a quest owl in every Commons, a step in each realm and
  the arcade, a first quest at the entrance.
- OP-287 owl-native movement in place of stairs, ladders and doors; OP-289 the head-turn emote.
- OP-286 realm arches: the ones with nothing behind them come down.
- OP-288 the vote scoreboard (percentages only).
- OP-290 asset swap readiness; OP-301 each realm start's signature piece spot.
- OP-200 split `RoomScene.ts`; OP-189 more vertical space on flat floors.
- Bugs: OP-319 to OP-324, and the small list in OP-291.
- Pets: OP-261 to OP-264 (the Easter egg and bunny), around the code check you leave alone.

**Overtaken or dropped: ask before building any of these.**
- OP-219's remap tickets (OP-221 to OP-223, OP-225 to OP-228) predate the new map. OP-228
  ("retire the top-down rooms") goes against the camera rule.
- OP-060 (park map research) and OP-214 (height colours on the old tree) are likely overtaken.
- Dropped: OP-005, OP-006, OP-042, OP-063 (a paid preview pass), OP-215 (the old tree repaint).
- OP-073 and anything that names an unreleased realm in public.
- Marketing, the store and the social accounts are not part of this work.

## 8. When something is unclear

Write the question into the ticket (or the PR) as something to settle when that ticket is worked,
pick the sensible default, say which you picked, and keep going. Ask the owner only when the answer
changes his goal, something a player will notice, or a step that can't be undone.
