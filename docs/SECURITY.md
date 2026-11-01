# Security: what the park is, and how it is checked

- Status: BUILT (the headers, limits and checks below); the nightly check BUILT, its Finding on the board PLANNED (OP-133)
- Verified against: main ee09af3 (2026-11-01)
- Code: apps/edge/src/guard.ts, apps/edge/src/limits.ts, apps/edge/src/index.ts, apps/edge/src/page.ts, apps/edge/src/accounts.ts, apps/edge/src/collectLog.ts, apps/edge/src/Collections.ts, packages/shared/src/phrases.ts, tools/security/security-test.sh, .github/workflows/security-nightly.yml
- Tickets: OP-151, OP-139, OP-140, OP-141, OP-142, OP-143, OP-144, OP-150, OP-133
- Related: docs/ARCHITECTURE.md, docs/PLAYBOOK.md, docs/FEEDBACK.md, docs/DEPLOY.md

What the park does and does not do, for anyone judging its risk, and how its defences are checked.
Every claim names the file that makes it true on `main` ee09af3.

**Testing the live park needs the owner's written authorisation.** That covers the script below,
any scanner and any hand test against the park's address. A local copy (`pnpm dev:edge`) needs none.

## What the park is not [BUILT]

- **No typed chat.** Owls talk only in prewritten phrases: 24 of them, in `PHRASES`
  (`packages/shared/src/phrases.ts`, C44). Only a phrase's number travels. The room server relays a
  number the list has and drops any other (`Room.say`, `apps/edge/src/Room.ts`), at most one per
  `SAY_EVERY_MS` (3 s) per owl. The only words a visitor types are a feedback note, which only the
  keepers read (`docs/FEEDBACK.md`), and an email to protect an owl (below).
- **No purchases in the park.** Money moves only in the store's Shopify checkout. The Worker hands
  out cart links (`passCartLink`, `ticketCartLink`, `apps/edge/src/shopify.ts`); the store sells
  ticket kinds only (`KINDS`). The feather shop sells for feathers earned in play, never money
  (`packages/shared/src/shop.ts`, C31). Purchase delays and spending limits for in-game buying do not
  apply.
- **No passwords.** No account is needed to play: a guest pass and the browser's collector token
  are the owl (`/api/pass`, `apps/edge/src/index.ts`). With `ACCOUNTS` "on" (`wrangler.jsonc`), an
  owl can be protected with an email, by a magic link (`apps/edge/src/accounts.ts`, OP-139). A link
  is good for `MAGIC_LINK_MS` (15 minutes) and used once. At most `LINKS_PER_EMAIL_PER_HOUR` (3) per
  email and `LINKS_PER_IP_PER_HOUR` (10) per address go out (`packages/shared/src/accounts.ts`). The
  email is kept only as a keyed hash and a sealed copy (AES-GCM), and is never logged.
- OPEN QUESTION: whether the live Worker has `ACCOUNT_SECRET` and `RESEND_API_KEY` set. Without
  them no email is kept or sent (`emailKeys`, `mailSender`, `apps/edge/src/accounts.ts`).

## Where things are kept [BUILT]

- **Rooms run on Cloudflare Durable Objects, not Supabase.** The objects are `RoomObject`,
  `VoteLedger`, `Collections` and `Overflow` (`apps/edge/wrangler.jsonc`). The page holds no
  database client or key: its Supabase transport is gone (`apps/park/src/config.ts`, OP-150).
- **Supabase holds the collection log, in the owner's analytics project.** The `Collections` object
  queues rows and sends them to the `owl-park-log` function (`apps/edge/src/collectLog.ts`,
  `apps/park-log`). The rows: collectibles granted, owl versions (kind and colour), visits, rooms
  visited, the catalogue, and a copy of each feedback note (its words, kind and room; OP-166). The
  collector and the visit go as salted hashes. No name, email, order, ticket, pass or address is in a
  row. The log is off unless `PARK_LOG_URL`, `FRAUD_SCORE_KEY` and `FRAUD_HASH_SALT` are all set.
- The Worker's answers carry no database address or key (`apps/edge/test/hostile.test.ts`, OP-150).
  CI checks the built page for one (`tools/security/bundle-check.mjs`).

## Headers and limits in place [BUILT]

| What | Value | Where | Ticket |
| --- | --- | --- | --- |
| Content-Security-Policy on the page | own scripts plus a nonce fresh each load; own host only for connections; `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`; reports to `/api/csp-report` | `parkPolicy`, `guardedPage`, `guard.ts` | OP-140 |
| X-Frame-Options, Referrer-Policy on the page | `DENY`; `strict-origin-when-cross-origin` | `guardedPage`, `guard.ts` | OP-140 |
| X-Content-Type-Options on every answer | `nosniff` | `finished`, `guard.ts`; `apps/park/public/_headers` | OP-140 |
| Strict-Transport-Security, https only | `max-age=31536000` (`HSTS`), no subdomains, no preload | `finished`, `guard.ts` | OP-140 |
| https only | a page over http goes to https (301); the API and sockets over http get 403 | `frontDoor`, `guard.ts` | OP-141 |
| Other sites' pages | API calls and preflights refused 403 `origin`; sockets need the park's own page | `frontDoor`, `originAllowed`, `guard.ts` | OP-141, OP-144 |
| CORS | the park's own origin by name, never `*`; one header list for every route | `finished`, `guard.ts`; `CORS`, `index.ts` | OP-144 |
| The page is never cached | `Cache-Control: no-store`, no ETag | `uncachedPage`, `page.ts`; `guardedPage` | OP-129 (`apps/park/public/_headers`) |
| API answers | `Cache-Control: no-store`; refusals are short codes (`{"error":"bad-pass"}`) | `CORS`, `json`, `index.ts`; `refusal`, `guard.ts` | not named in the code |
| Rate limits a minute | 600 per address; 300 calls needing no pass; 60 refused calls per address; 120 per owl; 10 ticket and account calls per owl | `API_LIMITS`, `limits.ts` | OP-142 |
| Body limits | feedback 16,384 bytes; account calls 2,048; policy reports 8,192; ledge drafts 1 MiB; larger ones get 413 unread | `FEEDBACK_BODY_MAX`, `ACCOUNT_BODY_MAX`, `MASKS_BODY_MAX`, `index.ts`; `REPORT_BODY_MAX`, `guard.ts` | OP-140 (reports), OP-156 (ledge drafts); the others not named |
| Room sockets per address | 8 per room object | `MAX_SOCKETS_PER_IP`, `wrangler.jsonc`; `RoomObject.ts` | not named in the code |

- The rate limits are counted in each copy of the Worker's memory (`limits.ts`). A flood spread over
  many machines is Cloudflare's own protection's to stop.
- OPEN QUESTION: which tickets added the feedback and account body limits, the short refusal codes
  and the sockets-per-address cap. The code does not name them.
- OPEN QUESTION: the policy report's 204 and an unknown `/api/` path's 404 carry no `Cache-Control`
  (`index.ts`). Neither has a body worth keeping; the owner decides whether they should say `no-store`.
- OPEN QUESTION: the CORS header list names `X-Admin-Key` on every route, the visitors' too (`CORS`,
  `index.ts`). The key opens nothing there; only `/api/admin/*`, `/api/vote/tally` and
  `/api/vote/close` ask for it (`isAdmin`).

## The security check [BUILT]

`tools/security/security-test.sh` asks the park what a stranger's browser or script would. It
prints PASS, FAIL or SKIP for each check and exits 1 on any FAIL. Each check names, in a comment,
the file whose behaviour it matches.

- Run it: `PARK_URL=https://<the park's address> tools/security/security-test.sh`. Against a local
  copy: `pnpm dev:edge`, then `PARK_URL=http://localhost:8787 tools/security/security-test.sh`.
- A run makes about 16 requests: two page loads, the script bundle, one policy report, one guest
  pass and a dozen refused API calls. The guest pass writes one owl account row, as a page load does.
  No feedback note is kept.
- The policy report logs one `csp_violation` line that names `https://example.invalid`. That line
  is the check, not an attack.
- `RATE_CHECK=1` adds a burst on `/api/vote`: up to `RATE_MAX` calls (70), one at a time, stopping at
  the first 429. It is off by default and never runs nightly. A burst can land on several copies of
  the Worker and see no 429: run it again before calling it a finding.
- The script's own tests run it against a stand-in park built from `guard.ts` and `page.ts`
  (`pnpm security:test`); CI runs them and shellcheck.
- Nightly: `.github/workflows/security-nightly.yml`, 09:30 UTC and by hand, against the repository
  variable `PARK_URL` (the uptime check's). Without it the run passes with a notice. A FAIL fails the
  run, and GitHub emails the owner. PLANNED (OP-133): a failed run files a Finding on the board.
