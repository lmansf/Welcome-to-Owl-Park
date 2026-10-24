# Feedback from visitors

- Status: BUILT (OP-028); the preview nudge and the feedback reward PLANNED (OP-063, OP-064)
- Verified against: main 8a1bbb9 (2026-10-23, the pad OP-082, quests in the Menu OP-083 and the mirror OP-077 merged)
- Code: packages/shared/src/feedback.ts; apps/edge/src/feedbackBox.ts, feedbackPage.ts; apps/park/src/ui/feedback.ts
- Tickets: OP-028, OP-034, OP-063, OP-064, OP-082, OP-083, OP-089
- Related: docs/ARCHITECTURE.md section 10

**Feedback** in the Menu (its tile picked out in gold) opens a short form: what kind of note it is
(Bug, Idea, Praise, Other) and a few words, up to 1,000 characters. The form asks visitors to leave
out names, emails and other personal details. On a phone it sits at the top of the screen, so the
keyboard never covers what is being typed (`apps/park/src/ui/feedback.ts`).

## Where notes are kept

- **On the park's server** (the room server, which the live park uses): `POST /api/feedback` with
  the visitor's pass. The Worker checks the note (`parseFeedback` in
  `packages/shared/src/feedback.ts`) and the `Collections` Durable Object keeps it in its SQLite
  table `feedback` (`apps/edge/src/feedbackBox.ts`): when, the kind, the words, the collector token,
  the room, the screen size, the browser's user agent and a status (`open`, `done`, `dropped`).
  Never an IP address or a name.
- **Without a server** (the local and Supabase transports, development, the browser tests): the
  newest 50 notes stay in that browser's `localStorage` under `owl-park:feedback`.

Limits: one note per visitor every 30 seconds and 10 a day; 1,000 a day for the whole park, so a
flood cannot grow the table without bound. The numbers live in `packages/shared/src/feedback.ts`.
A visitor can start a new collection (a new token) to get round the per-visitor limits, but not
the park's.

## Reading and triaging

Open `/admin/feedback` on the park's address and type the admin key (`ADMIN_KEY`, set with
`wrangler secret put`; until it is set the page cannot open anything). The key stays in that browser
tab only. The page lists the open notes, newest first; **Done** and **Drop** move a note out of the
list, **Reopen** brings it back, and **Download CSV** saves the list on screen for a spreadsheet
(cells that start like a formula are quoted so a spreadsheet never runs them).

The same, from a terminal:

```sh
curl -H "X-Admin-Key: $ADMIN_KEY" "https://<park address>/api/admin/feedback?status=open&limit=100"
curl -X POST -H "X-Admin-Key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"id": 12, "status": "done"}' "https://<park address>/api/admin/feedback"
```

`status` is `open` (the default), `done`, `dropped` or `all`; `limit` is at most 500.

## Candidates from the tickets

Things visitors may feel, raised in tickets and left for feedback to decide. None is built or
promised; each names the ticket that raised it.

| Candidate | Why it is here | Source |
| --- | --- | --- |
| A mirrored pad for left-handed play (joystick left, buttons right) | The phone pad puts the joystick on the right; the ticket's default is no mirroring, noted here as a candidate | OP-082 |
| Hop spam (the Jump button's hop) | One hop per 600 ms from a page and one per 480 ms per owl through the room server; QA checks the server holds it | OP-082, OP-089 |
| New-quest line noise | Quests live in the Menu with a dot and a 2-second line at the top; the owner kept the New quest line for now (2026-10-23) and may drop it | OP-083 |

Where a note points at one of these, add the ticket ID to the keepers' triage so the count is
easy to find later.
