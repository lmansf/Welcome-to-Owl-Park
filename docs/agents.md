# The agents: who does what

- Status: current roster; the Red Team and the Shopify agent are not stood up
- Verified against: main 67ca3ab (2026-10-23); the Ticket Board as read 2026-10-23
- Code: none
- Tickets: OP-078, OP-079, OP-080, OP-081, OP-096
- Related: docs/README.md (the map and the board conventions)

The roster: every agent and human on Owl Park, what each may write to, what each never does, how
work moves. Every rule names its source ticket or document; nothing was decided here. Gaps are
`OPEN QUESTION` lines at the bottom. Grep an agent's name for its section.

## Where work lives

- **The Ticket Board** (the Google Sheet "Owl Park — Ticket Board" in the project's Drive folder):
  the single queue of work. If it is not on the board, it is not work. Its tabs and columns are
  below ("Reading the board").
- **The Creative Bible** (the Google Doc "Owl Park — Creative Bible (shared canon)"): canon,
  PROPOSALS, the MERGE LOG and the AGENT DISCUSSION. Append-only. Decisions become canon only as
  numbered proposals (C1, C2, ...) that the owner approves and Crow merges.
- **The Agent Operating Protocol** (a Google Doc in the Drive's Agent Operations folder): the full
  rules for the board, handoffs and the Drive. This file repeats what an agent needs daily.
- **This repository** (`Welcome-to-Owl-Park` on GitHub): the park app, the room server, the art
  tools and these docs. `docs/README.md` is the map of the docs.

Flags that always go to the owner first, on any ticket, for any agent: Money, Account, Price,
Public-facing, Legal or naming, Deletion, Customer data. A flagged ticket is set to Needs Logan
with Owner = Logan, and only the owner moves it on.

Rules every agent keeps (the Protocol and the board's Read me): edit cells in place and append
rows; never rebuild, re-upload or sort the board; never delete a row (Dropped) or a file (Archive);
one owner per ticket; re-read a shared file right before changing it; timestamps in Eastern time
as `YYYY-MM-DD HH:MM`; no secrets, passwords, customer details, the owner's surname or the park's
workers.dev address in any file. This repository is public: realm names, the owner's personal
details and employer, and the names of other games stay out of code, docs, art, tests and commit
messages (`CLAUDE.md`).

## The roster at a glance

| Who | Role | Writes to | Never |
| --- | --- | --- | --- |
| The owner (Logan on the board) | Final call; approvals, secrets, accounts, prices, art picks, canon | Everything | Nothing is off limits; the owner is the gate |
| Claude | Project lead | The Bible's PROPOSALS and AGENT DISCUSSION; tickets on the board | Code; canon outside the proposals process |
| Claude Code | App engineer | The repository (code, tests, art tools); the board; build updates in the Bible | `docs/` (the doc agent's; a `TODO-DOCS` comment in code instead); the Bible's canon; spend |
| Crow | Operator (Meta Muse) | Social platforms, the Shopify store, the CRM sheet, Bible merges, the board | Code; opening the store or announcing dates without the owner |
| QA agent | Acceptance | The board (status, notes, Finding tickets); documentation; Drive documents | Code; new feature tickets; real purchases; tests that touch visitors or the live park's free daily requests |
| Doc agent | Documentation | `docs/` only, committed directly to `main` | Code, assets, the board's rows beyond its own tickets, the Bible |
| Red Team | Weekly attacker (not yet stood up) | New Finding tickets | Code; production; the live store |
| Shopify agent | The store (not yet stood up) | The store (products, discounts, webhooks, settings) | Social, the CRM, Bible merges |

## The owner

Appears on the board as **Logan** (Owner, Requested by, Reviewer, and the status Needs Logan).

- Owns the project, the money, every account (Cloudflare, Shopify, GitHub, the Drive), every price,
  every public-facing decision, art picks and canon approvals (Agents tab).
- Holds the secrets: `PASS_SIGNING_KEY`, `ADMIN_KEY`, the store's app keys (`docs/DEPLOY.md`).
  Sets them with `wrangler secret put` or as GitHub repository secrets; never in a file.
- Tests on real devices (phone and computer) and picks every image before it ships.
- Decides flagged tickets. Nobody else moves a Needs Logan ticket on.
- Hands decisions back to whoever asked and new work to Claude for triage.

## Claude (project lead)

- **Purpose**: one coherent vision; question rounds with the owner; proposals in the Bible; board
  triage; writing and reviewing tickets; the internal donation tally (Bible C23).
- **Works through**: the Claude app with the Google Drive, Docs and Sheets connectors.
- **Writes to**: the Bible's PROPOSALS and AGENT DISCUSSION (signed and dated); tickets and
  Activity Log rows on the board.
- **Never**: edits code; writes canon directly (proposals are approved by the owner and merged by
  Crow); acts on a flagged ticket.
- **Hands off**: specs and canon to Claude Code and Crow; decisions to the owner as Needs Logan
  tickets. Reviewer on every doc-agent ticket (OP-096 to OP-103).

## Claude Code (app engineer)

- **Purpose**: the park app (`apps/park`), the room server (`apps/edge`), the shared rules
  (`packages/shared`), the art tools (`tools/art`), asset packs. Code cleanup is part of its
  definition of done (OP-096's wording).
- **Works through**: the repository, plus the Drive by API; posts build updates in the Bible's
  AGENT DISCUSSION.
- **Writes to**: the repository on branches, merged to `main` on the owner's go; the board (its
  tickets, Finding tickets it triages); asset packs to the Drive.
- **Rules**: read `docs/` before starting a ticket and never edit `docs/` itself; leave a
  `TODO-DOCS` comment in code for the doc agent (OP-081). Single writer on code (OP-081). Append a
  line to `docs/CHANGELOG.md` when a ticket goes Done (OP-103; see the question at the bottom,
  since OP-081 says Claude Code never edits `docs/`). Art needs the owner's pick before anything is
  published or committed (`CLAUDE.md`). Asks before any new paid service or account.
- **Hands off**: tickets to In review when a check is wanted (OP-078: the QA agent accepts or
  sends back on the same ticket); asset packs and build notes to Crow; infrastructure steps to the
  owner; canon proposals to Claude.

## Crow (operator)

- **Purpose**: browsers and apps, scheduled runs, social posting (TikTok, Instagram, X), the Shopify
  store until OP-079 moves it, Bible merges about every 15 minutes, the CRM sheet, knockout screens
  of names (OP-036, OP-069).
- **Works through**: the browser: Drive, Docs and the Sheets UI, the social platforms, Shopify.
- **Writes to**: canon in the Bible (merging approved proposals from a fresh re-read, Bible C24,
  with a MERGE LOG row); the board cell by cell; the CRM; posted content.
- **Never**: code; opening the store, turning on payments or announcing dates without the owner
  (Bible C20); naming a realm in public.
- **Hands off**: posted content and store builds to the owner for review; prompts and art
  candidates to the owner for picks.

## QA agent (acceptance; OP-078)

- **Purpose**: checking that what shipped matches its ticket before it closes. Walks each ticket's
  Done-when and Notes, then accepts, accepts with a note, or sends it back to In progress with a
  list of what did not match. Runs the starter QA list (OP-085 to OP-095). Files Finding tickets
  for problems it finds.
- **Works through**: the Claude app with the Drive, Docs and Sheets connectors; the Claude desktop
  app's browser for hands-on checks at phone and computer sizes. Runs on its own every Monday at
  7:40 AM Eastern as a scheduled task (acceptance, unblocking QA tickets, board hygiene); hands-on
  browser tests run only in a live session with the owner's computer.
- **Writes to**: the board (status, notes, Finding tickets); documentation and Drive documents
  (the owner, 2026-10-23).
- **Never**: writes or edits code; writes new feature tickets (mismatches go back on the same
  ticket); makes a real purchase; runs a test against the live park that could affect visitors or
  spend its free daily requests; moves a flagged ticket on.
- **Hands off**: send-backs to the ticket's owner (usually Claude Code) by setting the ticket back
  to In progress; Findings to Claude Code as new tickets (Type = Finding, OP-080's format);
  decisions and acceptance questions to the owner.
- **Review step**: the board already has In review, so Claude Code moves a ticket there; no new
  status (OP-078 notes).
- **Starter tickets**: OP-085 to OP-095. Still to do from OP-078: `docs/QA.md` with its rules
  (docs only) and one trial ticket through In review to Done.

## Doc agent (documentation; OP-081)

- **Purpose**: agent-first docs of what everything does, kept in `docs/`. Reads the repository
  and the board and keeps `docs/` true to both. Keeps this roster (`docs/agents.md`).
- **Writes to**: `docs/` only. Commits directly to `main`, restricted to paths under `docs/`, no
  pull request needed (the owner, 2026-10-23).
- **Never**: edits code, assets or the board's rows beyond its own tickets; writes the Bible
  (Crow owns canon merges; the doc agent reads it). Anything outside `docs/` that needs changing
  is a Finding ticket for Claude Code. If the code and a Done ticket disagree, it files a Finding
  rather than guessing (OP-098).
- **Format rules** (OP-081): short declarative sentences; headings an agent can grep; file paths
  and ticket IDs spelled out; no prose history; no marketing voice. When it cannot tell what
  something is for, it writes an OPEN QUESTION line rather than guessing.
- **Trigger** (OP-081, as specified): after each merge to `main`, or nightly; diff the repository
  against `docs/` and update only what changed. Until the trigger exists, it runs as sessions
  against its board tickets.
- **Hands off**: each doc ticket to In review with Claude as reviewer (OP-096 to OP-103 name
  Claude).
- **Starter tickets**: OP-096 (this file), OP-100, OP-101, OP-098, OP-102, OP-103, in that order
  (OP-081 notes); OP-097 waits for OP-001's redeploy; OP-099 waits for OP-082 and OP-083. OP-081's
  core set still to come: `SYSTEM.md`, one file per area (`worker.md`, `rooms.md`, `client.md`,
  `store.md`, `art.md`), `GLOSSARY.md`, and `DOCS.md` (its rules and the per-file template, written
  by Claude).

## Red Team (weekly; OP-080, not yet stood up)

- **Purpose**: tries to break the park on purpose, one question per ticket. Each weekly run reads
  the board for open tickets with Owner = Red Team; none, and it exits. Example questions: claim one
  guest pass on two devices at once; crash a realm at the 40 cap; enter a closed realm; replay a
  Shopify webhook to mint a pass.
- **Attacks**: the preview build only. The notes recommend a separate staging Worker so a crash
  never reaches paying guests.
- **Writes to**: a NEW ticket per run for Claude Code with Type = Finding and a flag of To-do
  (something must change) or Informational (worth knowing, no action).
- **Never**: edits code; touches production or the live store.
- **Deliverable when stood up**: the agent on its schedule, `docs/REDTEAM.md`, a first run against
  one question ticket with a Finding filed. Blocked by OP-078 only in that the review step should
  exist first. Open points in OP-080's notes: a staging Worker; test orders (recommend a $0 test
  product, never real charges); at most three question tickets open at once (suggested).

## Shopify agent (the store; OP-079, not yet stood up)

- **Purpose**: owns the store once the owner connects the Shopify connector: products (Preview
  Ticket, day ticket, annual pass), discounts (C42 opening night, OP-062 50% pass), webhooks, theme
  and domain settings. Store work has become config and code, which suits a Claude agent with the
  connector more than a browser agent.
- **Writes to**: the store; the board.
- **Never**: social, the CRM or Bible merges (those stay with Crow).
- **Open** (OP-079 notes): whether this is a separate agent or Claude Code with the Shopify
  connector; where Crow's handoff note lives. Owner lines on OP-009, OP-010, OP-024, OP-041,
  OP-043, OP-047 and OP-048 change when it is stood up.

## How a ticket moves between agents

1. Start a session on the board: read your queue on the Dashboard (or filter Board by Owner = you)
   and the Activity Log rows since you last worked.
2. Take the highest-priority Ready ticket (earliest Due on a tie). Set Status = In progress and
   Last update = today; log Picked up.
3. Work it. Keep Notes to one current line. Stuck: Status = Blocked, fill in Blocked by, log it.
4. Review wanted: Status = In review, Owner = the reviewer; log Submitted for review. The reviewer
   logs Approved or Changes requested and sets the Owner back.
5. Finished: Status = Done, Last update = today; log Done with a link to the result. Claude Code
   also appends a line to `docs/CHANGELOG.md` (OP-103).
6. Handing work on: the deliverable in the Drive (Handoffs, or the ticket's area folder) named
   "OP-### short title (from agent)", its link in Deliverable link, Owner = the receiver, Status =
   Ready (or In review), one line in Notes, and an Activity Log row with Action = Handoff.
7. A decision or approval needed: Status = Needs Logan, Owner = Logan, the question in Notes.
8. Before stopping: Status, Last update and Notes current on every ticket touched; log what
   happened.

## Reading the board

Six tabs: **Read me** (the short rules), **Board** (one row per ticket; the queue), **Activity
Log** (one row per event; the history and handoff record), **Dashboard** (formulas only: the next
free ID, counts, each agent's queue), **Agents** (who does what and how each reaches the Drive),
**Lists** (the dropdown options; add a row to add an option, never rename a header).

Ticket IDs are `OP-###`. On the Board tab, a ticket's row number is its number plus one (OP-096 is
row 97). The Dashboard shows the next free ID.

The Board's columns, A to Q:

| Column | Holds |
| --- | --- |
| A Ticket ID | `OP-###` |
| B Title | One line |
| C Status | One of the statuses below |
| D Owner | Exactly one agent. On the Lists tab today: Logan, Claude, Crow, Claude Code, QA agent, Unassigned. The doc tickets use Doc agent, which is not on the list yet (question 3) |
| E Priority | P0 Urgent, P1 High, P2 Normal, P3 Low |
| F Type | Build, Art, Content, Store, Data, Research, Decision, Bug, Canon, Admin, QA, Finding. The doc tickets use Docs, not on the list yet (question 3) |
| G Area | Park app, Art, Social, Store, Pipeline, Canon, Ops, Drive. The doc tickets use Docs, not on the list yet (question 3) |
| H Requested by | Who asked |
| I Reviewer | Who signs off (the owner for anything public or paid) |
| J Flags | None, Money, Account, Price, Public-facing, Legal or naming, Deletion, Customer data |
| K Created | `YYYY-MM-DD` |
| L Due | `YYYY-MM-DD` |
| M Last update | `YYYY-MM-DD`, set every time the row changes |
| N Description and acceptance criteria | The goal, the inputs (links), and a "Done when" line someone else could check |
| O Deliverable link | The result: a commit, a branch, a Drive file, a Bible item |
| P Blocked by | Other ticket IDs |
| Q Notes | The latest state, appended as dated lines |

Statuses and who sets them:

| Status | Meaning | Set by |
| --- | --- | --- |
| Backlog | Not fully specified yet | Whoever creates the ticket |
| Ready | Someone could start now: owner set, inputs linked, Done-when written | The ticket's requester or a hand-off |
| In progress | Being worked | The owner of the ticket, on pick-up |
| In review | Waiting for the reviewer (QA accepts or sends back; Claude reviews docs) | The ticket's owner when the work is ready |
| Blocked | Cannot move; Blocked by says why | The ticket's owner |
| Needs Logan | A decision or approval is required; Owner becomes Logan | Anyone; only the owner moves it on |
| Done | Finished, with a link to the result | The owner of the ticket, or QA on acceptance |
| Dropped | Closed without doing it; Notes say why | Anyone; never delete a row instead |

Activity Log columns: Timestamp (ET), Ticket ID, Agent, Action, To (agent), Note, Link. Actions in
Lists: Created, Picked up, Comment, Handoff, Reassigned, Blocked, Unblocked, Submitted for review,
Approved, Changes requested, Done, Dropped.

Findings (OP-080's format, used by QA and Red Team): a NEW ticket for Claude Code, Type = Finding,
the question or check it came from in the description, and a flag of To-do or Informational
(the Lists tab does not carry those two flags yet; see the questions below).

## OPEN QUESTIONS (gaps in the sources, not decisions)

1. OPEN QUESTION: OP-081 says Claude Code never edits `docs/`; OP-103 says Claude Code appends a line to
   `docs/CHANGELOG.md` when it sets a ticket to Done. Which holds? Until decided, this file
   records both, and `docs/CHANGELOG.md` carries OP-103's rule.
2. OPEN QUESTION: OP-080's To-do and Informational flags are not on the Lists tab. Add them, or use Notes?
3. OPEN QUESTION: "Doc agent" (Owner) and "Docs" (Type and Area) are used by OP-096 to OP-103 but are not on
   the Lists tab, and the Doc agent has no row on the Agents tab. "Red Team" and "Shopify agent"
   are not on the Lists tab either. The Agents tab says to add a row and a list entry when an
   agent joins; the doc agent writes only under `docs/`, so someone else adds them.
4. OPEN QUESTION: OP-081's trigger (after each merge to `main`, or nightly) does not exist yet; the doc agent runs
   as sessions against its tickets. Who creates the trigger, and which?
5. OPEN QUESTION: OP-081 asks whether `DEPLOY.md` and `CAPACITY.md` live under `docs/` or at the root with a
   pointer. Both are under `docs/` today; is that the answer?
6. OPEN QUESTION: The Protocol says the reviewer logs Approved or Changes requested and "sets the Owner back".
   For doc tickets, does Claude set Done, or hand the ticket back to the Doc agent to close?
