# The docs: a map

- Status: current
- Verified against: main 8a1bbb9 (2026-10-23, the pad OP-082, quests in the Menu OP-083 and the mirror OP-077 merged); the Ticket Board as read 2026-10-23
- Code: none
- Tickets: OP-101, OP-102, OP-176
- Related: docs/agents.md, docs/GLOSSARY.md

The map of `docs/`: which file answers which question, how the files are written so an agent can
grep them, how the Ticket Board works, and what is not documented yet. A map, not a manual. New
here: read `agents.md` first, then `GLOSSARY.md`.

## Start here, by task

| Your task | Read | Then |
| --- | --- | --- |
| Join the project as a new agent | `agents.md` | `GLOSSARY.md`; this page's Ticket Board section |
| Pick up any ticket that touches code | `ARCHITECTURE.md` section 0, then the section for the area | the area doc below; `CHANGELOG.md` for what shipped |
| Deploy, set a secret, set up the store | `DEPLOY.md` | `PLAYBOOK.md` if something breaks |
| The park is down or slow | `PLAYBOOK.md` | `CAPACITY.md` |
| Review or test a ticket (QA) | the ticket's Done-when; `ARCHITECTURE.md` for the mechanism | `agents.md` (QA hat), `CAPACITY.md` (OP-088) |
| Answer a visitor's question | `PLAYBOOK.md` section 7 | `ACTIVITIES.md`, `QUESTS.md`, `NESTS.md` |
| Change art | `ART-PIPELINE.md`, `CLAUDE.md` | `tools/art/README.md` |
| Find what a word means | `GLOSSARY.md` | the file it points to |
| Find what is unbuilt | `grep -rn PLANNED docs/` | the ticket it names |
| Find what is undecided | `grep -rn "OPEN QUESTION" docs/`; `ARCHITECTURE.md` section 15 | the owner, as a Needs Logan ticket |

## How the docs are written (the conventions)

- **Header block**: every file opens with `- Status:`, `- Verified against:` (the `main` commit and
  date the doc was last checked), `- Code:` (the paths it describes), `- Tickets:` and
  `- Related:`. Trust a file to the commit it names; a newer `main` may have moved on.
- **Markers**, one spelling each, so grep finds them: `BUILT` (on `main`), `PLANNED (OP-xxx)` (not
  on `main`; the ticket that builds it), `MEASURED (OP-xxx)` (a number from a test), `LATER
  (OP-xxx)` (not before the preview), `OPEN QUESTION:` (undecided; the owner's). Section headings
  carry the marker in square brackets; inline text carries it bare.
- **Names**: file paths, exported constants and ticket IDs are spelled out and in backticks, so a
  grep in the code and a grep in the docs meet. Rooms are named by their ids (`hub`, `grove`,
  `market`, `lobby`, `homes`, `arcade`, `nest-<id>`) or their public descriptions, never by realm
  names.
- **Sentences**: short and declarative. Every number names the constant that holds it where one
  exists. No history beyond a ticket ID and a date; the history is `CHANGELOG.md` and the board.
- **Sources**: a rule names the ticket or Bible item it comes from (OP-###, C##). A doc never
  decides anything; where the sources disagree it writes an `OPEN QUESTION` line.
- **Who writes**: Claude Duet under the Docs hat, under `docs/` only. Under the Build hat it leaves
  `TODO-DOCS` comments in code. When the code and a Done ticket disagree, the Docs hat files a
  Finding instead of guessing.

Who updates what: Claude Duet keeps every file under `docs/` under the Docs hat (OP-081,
OP-176; `agents.md`). Under the Build hat it leaves a `TODO-DOCS` comment in code when a change
needs a doc change, and appends one line to `CHANGELOG.md` when a ticket goes Done (OP-103). The
PM hat reviews doc tickets. The owner approves every visitor-facing word the docs quote. Anything
outside `docs/` (the root `README.md`, `CLAUDE.md`, `tools/art/README.md`, code comments) is the
Build hat's and goes as a pull request.

## The files

| File | What it is for | Read it when |
| --- | --- | --- |
| `GLOSSARY.md` | Every term the code, the board and the Bible use, one line each, with the file that defines it | A word is unclear |
| `agents.md` | Who does what: the owner and Claude Duet, with one hat per old role (PM, Build, Marketing, QA, Docs, Shopify, Red team); what each may write to and never does; how work moves; the board's columns and statuses | You are new, or handing work to another agent |
| `ARCHITECTURE.md` | The system: the repository's packages, the room server and its Durable Objects, the wire protocol, room data, capacity numbers, the Realm Vote, collectibles, tickets and the gate, the home screen, feedback, chat, the fraud link (planned), operations, a diagram from purchase to the hub, open questions | Before any ticket that touches code |
| `DEPLOY.md` | Cloudflare, GitHub and Supabase setup; where to run commands (bash and PowerShell); the error table; deploys from GitHub; selling tickets (the store's app, secrets, webhooks, products, opening night) | Deploying, setting a secret, setting up the store |
| `PLAYBOOK.md` | When the park is in trouble: is it down, roll back, pause ticket sales, missing tickets, the free plan's limits, words for visitors; the controls (the phone pad, the hop, the keys), the Menu and quest news as a visitor has them | Something is wrong, or a visitor asks how to do something |
| `CAPACITY.md` | Room caps, what happens at the cap, what the park holds (measured), the planned queue and ribbon (OP-075), what QA tests (OP-088) | A busy night is coming, or a cap question |
| `CHANGELOG.md` | One line per Done ticket, newest first, by week; the rule for appending | What shipped when |
| `COLLECTIBLES.md` | Wearables, pets, effects and emotes: the catalogue, the numbers, identity (collector token and pass), the server, the client, adding a drop | Anything an owl owns or wears |
| `QUESTS.md` | Quests, NPC owls, leaf piles, feathers, the feather shop, owl species, the Quest Log sheet | Anything an owl does for feathers |
| `ACTIVITIES.md` | The lantern beam, the stage quiz, fishing, the copy game, the arcade (and its planned games), three tasks a day, quests in the Menu, emotes and the hop, seasons (planned) | Anything to do in a room |
| `NESTS.md` | The street of nests, a nest, decorating, furniture and the day's gift, the mirror (Your owl), the room server and the local mode | The nests |
| `MAP.md` | The tree (map 2): the grid of levels and screens, the named spots, the style sheet for painting a screen, the layers and how a tree room reads, level 1 as built, the tools and the steps for building a level | Any tree ticket (OP-155 to OP-163) |
| `FEEDBACK.md` | Feedback in the Menu, where notes are kept, reading and triaging them, candidates raised by tickets | Reading visitors' notes |
| `SECURITY.md` | What the park is and is not (no typed chat, no purchases in the park, no passwords), where things are kept, the headers and limits in place, and the security check (`tools/security/security-test.sh`, nightly) | Judging the park's risk, running the security check, or before testing the live park (the owner's written authorisation first) |
| `ART-PIPELINE.md` | How art is made and replaced: Seedream through `tools/art`, sizes, the owl's layers, provenance | Any art change; the owner picks every image |

Not under `docs/` but read with them: the root `README.md` (how to run and check the park; note
that its Docs list predates `agents.md`, `CAPACITY.md`, `CHANGELOG.md` and this file), `CLAUDE.md`
(the rules for coding agents, including what stays out of this public repository) and
`tools/art/README.md`.

## The Ticket Board

The Google Sheet **Owl Park — Ticket Board** in the project's Drive folder (Projects/Owl Park).
Everything is a ticket; if it is not on the board, it is not work.

- **Tabs**: Read me, **Board** (the queue, one row per ticket), Activity Log (one row per event),
  Dashboard (formulas only; the next free ID, counts, each agent's queue), Agents, Lists (the
  dropdown options; add a row to add an option, never rename a header).
- **IDs**: `OP-###`. On the Board tab a ticket's row is its number plus one (OP-101 is row 102).
  The Dashboard shows the next free ID.
- **Columns A to R**: A Ticket ID · B Title · C Status · D Owner (exactly one: Logan or Claude
  Duet on open tickets) · E Priority
  (P0 Urgent, P1 High, P2 Normal, P3 Low) · F Type (Build, Art, Content, Store, Data, Research,
  Decision, Bug, Canon, Admin, QA, Finding; the doc tickets use Docs) · G Area (Park app, Art,
  Social, Store, Pipeline, Canon, Ops, Drive; the doc tickets use Docs) · H Requested by ·
  I Reviewer · J Flags · K Created · L Due · M Last update · N Description and acceptance criteria
  (the goal, the inputs as links, and a "Done when" line someone else could check) · O Deliverable
  link · P Blocked by (ticket IDs) · Q Notes (the current state, dated lines appended) · R Role
  (was) (the hat Claude Duet wears for the ticket: PM, Build, Marketing, QA, Docs, Shopify, Red team,
  or Logan; OP-176).
- **Owners** (OP-176, 2026-11-01): open tickets belong to **Logan** or **Claude Duet**, one agent
  that wears the old agents' roles as hats (`agents.md`). Done and Dropped tickets keep their
  historical owner (Claude, Claude Code, Crow, QA agent, Doc agent); the board is a record.
- **Statuses**, exactly as the board uses them: **Backlog** (not fully specified) · **Ready**
  (someone could start now; set by the requester or a hand-off) · **In progress** (set by the
  ticket's owner on pick-up) · **In review** (waiting for the reviewer; the ticket's owner sets it,
  the reviewer logs Approved or Changes requested) · **Blocked** (Blocked by filled in; the owner of
  the ticket) · **Needs Logan** (a decision or approval; Owner becomes Logan and only the owner moves
  it on) · **Done** (finished, with a link; the ticket's owner, or QA on acceptance) · **Dropped**
  (closed without doing it; say why in Notes; never delete a row). The Lists tab's Status column is
  the source of this list.
- **Flags** that send a ticket to the owner first: Money, Account, Price, Public-facing, Legal or
  naming, Deletion, Customer data.
- **Filing a ticket**: take the next free ID from the Dashboard, fill every column (Requested by =
  you), leave it in Backlog if it is not Ready, and add an Activity Log row with Action = Created.
- **Filing a Finding** (OP-080's format, under the QA or Red team hat): a NEW ticket for the Build hat,
  Type = Finding, the check or question it came from and the exact path in the description, and a
  flag of To-do (something must change) or Informational (worth knowing, no action). One Finding per
  problem. The Docs hat files a Finding when the code and a Done ticket disagree.
- **Every session**: read your queue on the Dashboard and the Activity Log rows since you last
  worked; take the highest-priority Ready ticket; set In progress and Last update, log Picked up;
  before stopping, update Status, Last update and Notes on every ticket you touched and log what
  happened. The full rules: the Agent Operating Protocol (a Google Doc in the Drive's Agent
  Operations folder) and `agents.md`.

## The Creative Bible

The Google Doc **Owl Park — Creative Bible (shared canon)**: canon, PROPOSALS (numbered C1, C2,
...), the MERGE LOG and the AGENT DISCUSSION. Append-only; a proposal becomes canon when the owner
approves it and Claude Duet merges it from a fresh re-read (PM hat). The Docs hat reads it and
never writes it.

Bible items that are load-bearing in code:

| Item | What it fixes in the code | Where |
| --- | --- | --- |
| C35 (tickets, passes, the gate and the lobby) | Identity: a ticket on one device at a time, moved by its claim link; the time starts at the first scan; a visual ticket ID; order and line numbers only, no names | `ARCHITECTURE.md` section 9; `apps/edge/src/TicketBook.ts`, `pass.ts`, `gate.ts` |
| C45 (the fraud link) | Every paid ticket order scored before release: a 2-second budget, fail open, a 24-hour fail-open on reviews, hashed identifiers only | `ARCHITECTURE.md` section 12 (planned, OP-052, OP-053, OP-072) |
| C42 (opening night) and OP-062 | Free tickets mint at once; the pass at half price through the in-park link; votes one per wallet per park day | `ARCHITECTURE.md` section 9; `DEPLOY.md` step 10 |
| C44 (prewritten chat) | Only a phrase's number travels; 24 phrases in `packages/shared/src/phrases.ts`; one per 3 s | `ARCHITECTURE.md` section 11 |
| C31 (quests, feathers, the shop) and C36 (activities) | The feather economy and every number in `QUESTS.md` and `ACTIVITIES.md` | those files |
| C39 (the nests) and C43 (leaving the park) | A free area outside the turnstiles; the ways out | `NESTS.md`; `ARCHITECTURE.md` section 9 |
| C15 and `CLOSED_SIGNS` | The only words a closed realm's blockade may show | `packages/shared/rooms/index.ts` |
| The Legal rules | Realm names stay internal (screening is OP-069); no other game is named; the owner's details stay out | `CLAUDE.md` |

## Dates and decisions to know

- The preview opens on 2026-12-01 (the owner's target, OP-066); opening night (C42) follows on a
  date still to be announced, by the owner alone. The go/no-go checklist is OP-066.
- The live Worker still signs passes with its development key until the owner adds the two GitHub
  secrets (OP-001). Every owl's collection starts over once when the signing key goes up.

## Not yet documented

Product decisions in Done or Ready tickets that have no home under `docs/` yet (OP-102). Each
gets a file or a section when it is built or when its proposal is approved.

- OP-050: friends (a share code, what friends get, bring-a-friend, identity across devices). The
  proposal is Claude's; nothing is built.
- OP-060: the park map (the shape of the park, how rooms attach, reserved slots for the closed
  realms). A proposal, not built.
- OP-061: taller rooms (gathering rooms that grow up and down). A proposal, not built.
- OP-057 and OP-058: the design proposals for the two closed realms. Internal; their names stay out
  of this repository until OP-069 clears them.
- OP-070: the privacy and terms words for the park's site and the store, before the preview.
- OP-063's build tickets (the Preview Ticket's kind, the nudge and its setting, the admin counts):
  summarised in `ARCHITECTURE.md` section 9 until they exist.
- OP-078's `QA.md`, OP-080's `REDTEAM.md` and OP-081's `DOCS.md`, `SYSTEM.md` and the
  per-area files (`worker.md`, `rooms.md`, `client.md`, `store.md`, `art.md`): named in their
  tickets, not written yet. `GLOSSARY.md` exists as a first pass.
