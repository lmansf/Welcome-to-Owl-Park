# Changelog

- Status: complete for every Done ticket as of 2026-10-23 22:10 ET
- Verified against: the Ticket Board as read 2026-10-23; commits on main 67ca3ab
- Code: none
- Tickets: OP-103
- Related: docs/agents.md

One line per ticket that reached Done on the Ticket Board, newest first, grouped by week (weeks
start on Monday). Entries name the ticket, the date it closed, and the commit or branch from its
Deliverable link where there is one. Dropped tickets are not listed. Proposals and decisions
that changed canon are listed too, since they shape what gets built.

**Standing rule (OP-103):** when Claude Code sets a ticket to Done, it appends one line here under
the current week: `- OP-### (YYYY-MM-DD): what shipped (commit).` Keep entries to one line each.
The doc agent fills in anything missed on its next pass. (OP-081 says Claude Code never edits
`docs/`; this rule is the one exception OP-103 asks for. `docs/agents.md`, question 1, records
the conflict for the owner to settle.)

Where to look for more: a ticket's row on the Board tab (its number plus one), the Bible item it
names (C31, C35, ...), and the docs it touched.

## Week of 2026-10-19

- OP-103 (2026-10-23): `docs/CHANGELOG.md` started from the Done tickets, with the appending rule (main 72e4eed).
- OP-102 (2026-10-23): Bible-to-docs sync: C35, C41, C42, C45, C46 and the decisions from OP-060 onward added to the docs or listed under Not yet documented in `docs/README.md` (main 72e4eed).
- OP-101 (2026-10-23): `docs/README.md`, the map of the docs, the Ticket Board conventions and the writing conventions; `docs/GLOSSARY.md` as a first pass; the root `README.md` Docs list updated (main 0b77cd2).
- OP-100 (2026-10-23): `docs/CAPACITY.md` new; `docs/FEEDBACK.md` candidates; `docs/NESTS.md` no free text and the planned mirror (main 72e4eed).
- OP-098 (2026-10-23): `docs/ARCHITECTURE.md` refreshed to main 67ca3ab: the repository, identity, the fraud link (planned), operations, a purchase-to-hub diagram, BUILT and PLANNED tags; two stale lines corrected (main 72e4eed).
- OP-097 (2026-10-23): `docs/DEPLOY.md`: the monorepo layout, where to run commands in bash and PowerShell, the error table from OP-001 (main 72e4eed).
- OP-096 (2026-10-23): `docs/agents.md`, the agent roster, with six open questions for the owner (main 72e4eed).
- OP-071 (2026-10-23): the store's app the new way: the Worker signs in to Shopify with a Dev
  Dashboard app's client ID and secret, traded for a day-long token; `GET /api/admin/store` checks
  the setup (main fe8ffe8).
- OP-067 (2026-10-23): the opening switch: the keepers flip the front gate between open and
  taking tickets on `/admin/gate` with no deploy; the booth, the turnstiles and the words move
  together (main 0155c6b; `docs/DEPLOY.md`, `docs/PLAYBOOK.md`).
- OP-065 (2026-10-23): the home screen before the park: Make your owl on a first visit, Play, the
  owl drawn big, the wallet line, Settings shared with the Menu; claim links land there (main
  67ca3ab).
- OP-054 (2026-10-23): C43 (leaving the park), C44 (prewritten chat) and C45 (the fraud link)
  merged into canon by Crow.
- OP-051 (2026-10-23): leaving the park: the walkable way out off the hub's arrival spot, "Leave
  the park" and "Go home" in the Menu (main d5f4bff).
- OP-048 (2026-10-23): opening night in the Worker: free orders mint tickets at once, the pass
  claim link with its cart attribute, `/admin/opening` with the night's count and pass revenue,
  votes per wallet (main 0155c6b; amended by OP-062 to a half-price pass).
- OP-045 (2026-10-23): proposal C42, opening night (a free ticket, a pass for everyone who comes,
  the conversion count), approved by the owner on 2026-10-22.
- OP-044 (2026-10-23): proposal C41, the business goal, the costs that count, the Shopify plan
  (Basic) and the prices, in canon under Tickets and sales.
- OP-041 (2026-10-23): verified that Shopify Starter cannot carry the C35 build: the store stays on
  Basic; OP-042 dropped.
- OP-035 (2026-10-23): proposal C40, the arcade in the neon market realm, in canon as the Neon
  Roost section with the C46 amendment (a three-screen hall with a bay per game, painted art).
- OP-027 (2026-10-23): the closed realms' cracked-egg signs replaced by painted construction
  blockades (main a1ad837).
- OP-025 (2026-10-23): a Halloween present: every owl gets the Bat pet (main efe2aab,
  2026-10-21; accepted by QA 2026-10-23).
- OP-022 (2026-10-23): the lobby: the ticket booth and the turnstile gate, the first room every
  guest sees, with its painting (main 0f6663f, 2026-10-20; accepted by QA 2026-10-23).
- OP-020 (2026-10-23): the custom domain's asset 404 fixed: the park's domain and the workers.dev
  address both serve the bundle (main 8ea5c4f, 2026-10-20; closed 2026-10-23).
- OP-011 (2026-10-23): proposal C26 (an earlier art-pipeline plan) marked superseded in the
  Bible; the art pipeline is Seedream through fal.ai (C29).
- OP-008 (2026-10-23): ticket and pass pricing decided by the owner (C41): day ticket $3.99 for 24
  hours from first scan, annual pass $14.99 for 365 days; no night ticket at launch.
- OP-002 (2026-10-23): the park's own domain, exploreowlpark.com and www, live on the Worker in
  place of the workers.dev address (done 2026-10-19; accepted by QA 2026-10-23).
- OP-055 (2026-10-22): prewritten chat built: Say in the Menu (T on a keyboard), 24 phrases in six
  groups, a 4-second bubble, one phrase every 3 seconds, "Show what owls say" in Settings (main
  fe8ffe8).
- OP-030 (2026-10-22): prewritten chat's phrases and placement approved by the owner (C44).
- OP-026 (2026-10-22): the thumbstick for phones and tablets: walk without tapping (main
  fea4cca, 2026-10-21).
- OP-023 (2026-10-22): proposal C35, tickets, passes, the gate and the lobby, approved on
  2026-10-20 and merged into canon.
- OP-037 (2026-10-21): the arcade's room: the painting, the doorway off the neon street's east
  end, its floor and spawns (main 91d3a44, 2026-10-22).
- OP-036 (2026-10-21): the arcade's four names knockout-screened by Crow: Neon Roost, Hoot & Hop,
  Moon Flap, and Nest Knockdown in place of a flagged fourth name.
- OP-034 (2026-10-21): one Menu button in place of the bottom bar: the emote wheel (with a button
  of its own), the owl builder, quests, settings and Feedback (main 075db05).
- OP-033 (2026-10-21): the nests' paintings: the street's two screens, a nest's inside and the 16
  furniture pieces, picked by the owner (main 90d2806).
- OP-032 (2026-10-21): the nests built (C39): the street of tree houses, every owl's own nest,
  decorating, visiting other owls' open nests (main 4c01315; `docs/NESTS.md`).
- OP-031 (2026-10-21): the guardian of the storybook realm in its painting, replacing the drawn
  stand-in (main d29ba71).
- OP-029 (2026-10-21): the Village expansion noted and designed (C37, C39): a free area outside
  the park where each visitor decorates a nest; approved by the owner with no Sit action.
- OP-004 (2026-10-20): the first wave of things to do (C30, C36): the lantern beam, the stage quiz,
  fishing, the robot owl's copy game, three tasks a day (main fea4cca; `docs/ACTIVITIES.md`).
- OP-003 (2026-10-20): the room paintings extended sideways for the two- and three-screen rooms,
  one candidate per wing picked by the owner.
- OP-021 (2026-10-19): walking up to something never takes a doorway on the way; two browser tests
  made robust to slow runners (main b436624, 2026-10-20).
- OP-018 (2026-10-19): owl species: barn, great horned, burrowing, snowy and screech, each at its
  own size with natural colours (main 4878de1; the four new species' own art followed on
  2026-10-20, 5c30846; OP-019 covers the remaining layer masters).
- OP-017 (2026-10-19): proposal C31, quests, NPC owls, feathers and the rotating shop, approved by
  the owner.
- OP-016 (2026-10-19): the Quest Log sheet in the Drive: every quest, NPC, interactable and the
  shop rotation under the code's ids; no visitor data.
- OP-015 (2026-10-19): hiding-spot finds retired: collectibles come from quests and the shop; the
  spots now hold personal quest items (main 4878de1).
- OP-014 (2026-10-19): feathers and the rotating shop: a free daily gift, three daily items, a
  featured shelf and the week's eight (main 4878de1).
- OP-013 (2026-10-19): quests: 114 quests from six NPC owls (6 story, 96 daily, 12 weekly), every
  step checked by the room server (main 4878de1; `docs/QUESTS.md`).
- OP-012 (2026-10-19): Crow oriented in the reorganised Drive and confirmed it can work the board.
