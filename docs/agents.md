# The agents: who does what

- Status: current; one agent (Claude Duet) wearing role hats since 2026-11-01 (OP-176)
- Verified against: main ee09af3 (2026-11-01); the Ticket Board as read 2026-11-01
- Code: none
- Tickets: OP-078, OP-079, OP-080, OP-081, OP-096, OP-176
- Related: docs/README.md (the map and the board conventions)

Who works on Owl Park, what each role may write to, what each role never does, how work moves.
Since 2026-11-01 (OP-176) there are two owners: **Logan** and **Claude Duet**, one agent that
wears the old agents' roles as hats. Every rule names its source ticket or document; nothing was
decided here. Gaps are `OPEN QUESTION` lines at the bottom. Grep a role's name for its section.

## Where work lives

- **The Ticket Board** (the Google Sheet "Owl Park — Ticket Board" in the project's Drive folder):
  the single queue of work. If it is not on the board, it is not work. Its tabs and columns are
  below ("Reading the board").
- **The Creative Bible** (the Google Doc "Owl Park — Creative Bible (shared canon)"): canon,
  PROPOSALS, the MERGE LOG and the AGENT DISCUSSION. Append-only. Decisions become canon only as
  numbered proposals (C1, C2, ...) that the owner approves and Claude Duet merges (PM hat).
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

| Who | Writes to | Never |
| --- | --- | --- |
| The owner (Logan on the board) | Everything: approvals, secrets, accounts, prices, art picks, canon | Nothing is off limits; the owner is the gate |
| Claude Duet | Whatever the hat it is wearing allows (below) | Anything the hat forbids; anything flagged, without the owner |

The earlier agents (Claude, Claude Code, Crow, the QA agent, the doc agent, the Shopify agent and
the Red Team) are retired as separate agents (OP-176). Their rules live on as hats.

## The owner

Appears on the board as **Logan** (Owner, Requested by, Reviewer, and the status Needs Logan).

- Owns the project, the money, every account (Cloudflare, Shopify, GitHub, the Drive), every price,
  every public-facing decision, art picks and canon approvals (Agents tab).
- Holds the secrets: `PASS_SIGNING_KEY`, `ADMIN_KEY`, the store's app keys (`docs/DEPLOY.md`).
  Sets them with `wrangler secret put` or as GitHub repository secrets; never in a file.
- Tests on real devices (phone and computer) and picks every image before it ships.
- Says yes to every merge to `main`, deploy, post, price or store change, and spend.
- Decides flagged tickets. Nobody else moves a Needs Logan ticket on.

## Claude Duet (the one agent)

- **What it is**: one Claude agent, working through the Claude app with the Drive, Docs, Sheets,
  GitHub, Shopify and Supabase connectors, and a coding session on the repository. It owns every
  ticket that is not Logan's.
- **Hats**: the old agents' roles. Each hat keeps that role's rules unchanged; wearing one hat
  never borrows another hat's rights. One ticket, one hat at a time.
- **Choosing the hat**: the Board's column R, **Role (was)**: PM, Build, Marketing, QA, Docs,
  Shopify, Red team (or Logan). It records which agent the ticket belonged to before OP-176. A new
  ticket gets its hat from its Type and Area: Build, Bug and Finding in Park app or Pipeline are
  Build; Content in Social is Marketing; Store is Shopify; QA is QA; Docs is Docs; Research,
  Decision, Canon and Admin are PM. Write the hat in column R when filing.
- **Changing hats**: where a rule below says "hands off to" another role, that is a hat change on
  the same ticket, not a message to another agent: set the Status the hand-off names (Ready or In
  review), write one dated line in Notes, and log it.
- **Its own work is still reviewed**: the QA hat accepts or sends back work done under the Build
  hat; the owner approves anything flagged.

## PM hat (was Claude, project lead)

- **Purpose**: one coherent vision; question rounds with the owner; proposals in the Bible; board
  triage; writing and reviewing tickets; the internal donation tally (Bible C23); merging approved
  proposals into canon (was Crow's, Bible C24).
- **Writes to**: the Bible's PROPOSALS and AGENT DISCUSSION (signed and dated); canon, only by
  merging an approved proposal from a fresh re-read with a MERGE LOG row; tickets and Activity Log
  rows on the board.
- **Never**: writes canon outside the proposals process; acts on a flagged ticket.
- **Hands off**: specs to the Build hat; decisions to the owner as Needs Logan tickets. Reviews
  every Docs-hat ticket.

## Build hat (was Claude Code, app engineer)

- **Purpose**: the park app (`apps/park`), the room server (`apps/edge`), the shared rules
  (`packages/shared`), the art tools (`tools/art`), asset packs. Code cleanup is part of its
  definition of done (OP-096's wording).
- **Writes to**: the repository on branches, as pull requests; merged to `main` only on the
  owner's yes. The board (its tickets, Findings it triages); asset packs to the Drive.
- **Rules**: single writer on code (OP-081): only the Build hat changes code. Read `docs/` before
  starting a ticket; leave a `TODO-DOCS` comment in code when a change needs a doc change. Append
  a line to `docs/CHANGELOG.md` when a ticket goes Done (OP-103). Art needs the owner's pick before
  anything is published or committed (`CLAUDE.md`). Asks before any new paid service or account.
- **Hands off**: to the QA hat by setting In review when a check is wanted (OP-078);
  infrastructure steps to the owner; canon proposals to the PM hat.

## Marketing hat (was Crow, operator)

- **Purpose**: social posting (Instagram, TikTok, X), the CRM sheet, knockout screens of names
  (OP-036, OP-069), scheduled runs.
- **Writes to**: drafts and plans; the CRM; the board.
- **Never**: posts or publishes anything without the owner's review of that post; opens the store,
  turns on payments or announces dates without the owner (Bible C20); names a realm in public.
- **Hands off**: posts and art candidates to the owner for review and picks.

## QA hat (acceptance; OP-078)

- **Purpose**: checking that what shipped matches its ticket before it closes. Walks each ticket's
  Done-when and Notes, then accepts, accepts with a note, or sends it back to In progress with a
  list of what did not match. Runs the starter QA list (OP-085 to OP-095). Files Finding tickets.
- **Writes to**: the board (status, notes, Finding tickets); QA documents in the Drive.
- **Never**: writes or edits code (a fix is a Build-hat change, after the send-back); writes new
  feature tickets (mismatches go back on the same ticket); makes a real purchase; runs a test
  against the live park that could affect visitors or spend its free daily requests; moves a
  flagged ticket on. Hands-on device checks the agent cannot do are the owner's.
- **Hands off**: send-backs by setting the ticket back to In progress; Findings as new tickets
  (Type = Finding, OP-080's format); acceptance questions to the owner.

## Docs hat (documentation; OP-081)

- **Purpose**: agent-first docs of what everything does, kept in `docs/` true to the repository
  and the board. Keeps this file.
- **Writes to**: `docs/` only. Commits straight to `main` for paths under `docs/` (the owner,
  2026-10-23); a change that also touches files outside `docs/` goes as a pull request.
- **Never**: edits code or assets; writes the Bible. If the code and a Done ticket disagree, it
  files a Finding rather than guessing (OP-098).
- **Format rules** (OP-081): short declarative sentences; headings an agent can grep; file paths
  and ticket IDs spelled out; no prose history; no marketing voice. When it cannot tell what
  something is for, it writes an OPEN QUESTION line rather than guessing.
- **Hands off**: each doc ticket to In review for the PM hat.

## Shopify hat (the store; OP-079)

- **Purpose**: the store through the Shopify connector: products, discounts, webhooks, theme and
  domain settings.
- **Writes to**: the store, only on the owner's yes for any product, price, discount or setting
  change (the Price and Money flags); the board.
- **Never**: social posts or the CRM (the Marketing hat's); a real purchase.

## Red team hat (OP-080)

- **Purpose**: tries to break the park on purpose, one question per ticket (claim one guest pass
  on two devices at once; crash a realm at the cap; enter a closed realm; replay a webhook).
- **Attacks**: a preview or staging build only, never production or the live store.
- **Writes to**: a NEW ticket per finding, Type = Finding, flagged To-do or Informational.
- **Never**: edits code (the fix is a Build-hat ticket); touches production or the live store.

## How a ticket moves

1. Start a session on the board: read the queue (filter Board by Owner = Claude Duet) and the
   Activity Log rows since the last session.
2. Take the highest-priority Ready ticket (earliest Due on a tie). Put on the hat from column R.
   Set Status = In progress and Last update = today; log Picked up.
3. Work it. Append dated lines to Notes. Stuck: Status = Blocked, fill in Blocked by, log it.
4. Review wanted: Status = In review and change to the reviewing hat (QA for builds, PM for docs);
   log Submitted for review. The reviewing hat logs Approved or Changes requested.
5. Finished: Status = Done, Last update = today; log Done with a link to the result. Append a line
   to `docs/CHANGELOG.md` (OP-103).
6. A decision or approval needed: Status = Needs Logan, Owner = Logan, the question in Notes.
7. Before stopping: Status, Last update and Notes current on every ticket touched; log what
   happened.

Done and Dropped tickets keep their historical owner (Claude, Claude Code, Crow, QA agent, Doc
agent): the board is a record, and only open tickets move to Claude Duet.

## Reading the board

Six tabs: **Read me** (the short rules), **Board** (one row per ticket; the queue), **Activity
Log** (one row per event; the history and handoff record), **Dashboard** (formulas only: the next
free ID, counts, each agent's queue), **Agents** (who does what and how each reaches the Drive),
**Lists** (the dropdown options; add a row to add an option, never rename a header).

Ticket IDs are `OP-###`. On the Board tab, a ticket's row number is its number plus one (OP-096 is
row 97). The Dashboard shows the next free ID.

The Board's columns, A to R:

| Column | Holds |
| --- | --- |
| A Ticket ID | `OP-###` |
| B Title | One line |
| C Status | One of the statuses below |
| D Owner | Exactly one. Open tickets: Logan or Claude Duet. Done and Dropped tickets keep their historical owner (Claude, Claude Code, Crow, QA agent, Doc agent). Unassigned is on the Lists tab for a ticket nobody has taken |
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
| R Role (was) | The hat: PM, Build, Marketing, QA, Docs, Shopify, Red team, or Logan (OP-176) |

Statuses and who sets them:

| Status | Meaning | Set by |
| --- | --- | --- |
| Backlog | Not fully specified yet | Whoever creates the ticket |
| Ready | Someone could start now: owner set, inputs linked, Done-when written | The ticket's requester or a hand-off |
| In progress | Being worked | The owner of the ticket, on pick-up |
| In review | Waiting for the reviewer (the QA hat accepts or sends back; the PM hat reviews docs; the owner reviews anything flagged) | The ticket's owner when the work is ready |
| Blocked | Cannot move; Blocked by says why | The ticket's owner |
| Needs Logan | A decision or approval is required; Owner becomes Logan | Anyone; only the owner moves it on |
| Done | Finished, with a link to the result | The owner of the ticket, or QA on acceptance |
| Dropped | Closed without doing it; Notes say why | Anyone; never delete a row instead |

Activity Log columns: Timestamp (ET), Ticket ID, Agent, Action, To (agent), Note, Link. Actions in
Lists: Created, Picked up, Comment, Handoff, Reassigned, Blocked, Unblocked, Submitted for review,
Approved, Changes requested, Done, Dropped.

Findings (OP-080's format, filed under the QA or Red team hat): a NEW ticket for the Build hat, Type = Finding,
the question or check it came from in the description, and a flag of To-do or Informational
(the Lists tab does not carry those two flags yet; see the questions below).

## OPEN QUESTIONS (gaps in the sources, not decisions)

1. Settled by OP-176: with one agent, the Build hat appends the CHANGELOG line (OP-103) and the
   Docs hat writes the rest of `docs/`; OP-081's split no longer conflicts.
2. OPEN QUESTION: OP-080's To-do and Informational flags are not on the Lists tab. Add them, or use Notes?
3. OPEN QUESTION: "Docs" (Type and Area) is used by OP-096 to OP-103 but is not on the Type or
   Area lists. Add it, or file doc tickets as Admin? (The Owner list now has Claude Duet and the
   Role (was) list has Docs, 2026-11-01.)
4. OPEN QUESTION: OP-081's trigger (after each merge to `main`, or nightly) does not exist yet; the doc agent runs
   as sessions against its tickets. Who creates the trigger, and which?
5. OPEN QUESTION: OP-081 asks whether `DEPLOY.md` and `CAPACITY.md` live under `docs/` or at the root with a
   pointer. Both are under `docs/` today; is that the answer?
6. Settled by OP-176: the owner stays Claude Duet; the PM hat logs Approved and sets Done.
