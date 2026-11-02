# Logging: the log line and every event

- Status: current
- Verified against: branch claude/op-202-docs off main 01e9722 (2026-11-02)
- Code: packages/shared/src/log.ts, apps/edge/src/logs.ts, apps/park/src/net/pageLog.ts, apps/park/src/net/edge.ts, apps/edge/test/logged.ts, apps/edge/test/logEvents.test.ts, apps/edge/src/index.ts, apps/edge/src/routes/, apps/edge/src/RoomObject.ts, apps/edge/src/Room.ts, apps/edge/src/Overflow.ts, apps/edge/src/overflowState.ts, apps/edge/src/collectLog.ts, apps/edge/src/accounts.ts, apps/edge/src/guard.ts, apps/edge/src/pass.ts, apps/edge/src/rooms.ts, apps/edge/src/storeHooks.ts, apps/edge/wrangler.jsonc
- Tickets: OP-134, OP-132, OP-053, OP-067, OP-068, OP-075, OP-107, OP-126, OP-130, OP-139, OP-140, OP-141, OP-142, OP-149, OP-156, OP-174, OP-175, OP-181, OP-186, OP-191, OP-192
- Related: docs/ARCHITECTURE.md, docs/PLAYBOOK.md, docs/SECURITY.md, docs/CAPACITY.md, docs/agents.md

How the Worker, the room server and the page write their log, and every event a line can be, with
its component, level and fields. A chaos run (OP-132) or a keeper answers "what happened" from these
lines alone (OP-134). Every event here is in `LOG_EVENTS` (`packages/shared/src/log.ts`).

## The log line [BUILT]

The shared logger (`createLogger`, `packages/shared/src/log.ts`, OP-134) writes one JSON object per
line. Every line carries five fields:

| Field | What it holds |
| --- | --- |
| `ts` | The time, ISO 8601 (UTC) |
| `level` | One of `LOG_LEVELS`: `debug`, `info`, `warn`, `error` |
| `component` | Who logs: one of `LOG_COMPONENTS` (below) |
| `event` | What happened: one of `LOG_EVENTS` (the table below), snake_case |
| `msg` | A plain sentence that says what happened and what follows from it |

Optional fields (`LogFields`) follow. The common ones:

| Field | What it holds |
| --- | --- |
| `run_id` | The chaos run (the `X-Chaos-Run` header, OP-132) |
| `session_id` | A visit's pass id, hashed (`hashForLog`) |
| `room` | A room id (`hub`, `l1`, `nest-<id>` and so on) |
| `collector_hash` | An owl's collector id, hashed |
| `order_hash` | A store order's id, hashed |
| `duration_ms` | How long the work took |
| `reason` | Why, as a short fixed word (each event lists its words) |
| `error` | An error as `{ name, message }` (`errorFields`), never its stack; anything thrown that is not an `Error` becomes words |

An event may add fields of its own; the table lists them. A field whose value is `undefined` is left
out of the line.

- **Sink.** `consoleSink` writes each line at its level: `console.error`, `console.warn`,
  `console.debug`, else `console.log`. Workers Logs keep the level (`observability` in
  `apps/edge/wrangler.jsonc`, logs at `head_sampling_rate` 1).
- **Levels.** A logger drops every line below its level. `logLevelOf` reads a level from text; any
  other value is `info`.
- **`with(fields)`.** A logger whose every line also carries these fields. A call's own fields win
  over them.

### What a line never carries

- **A person's details.** A field named in `REFUSED_FIELDS` (`email`, `name`, `token`, `ticket_id`,
  `order_id`; matched without case) is dropped from the line. A second line follows at `warn`: event
  `log_field_refused`, the same component, `field` (the name dropped) and `of` (the event it was
  dropped from), so the call can be fixed.
- **Raw ids.** An id that links lines goes in hashed: `hashForLog` (14 hex digits, cyrb53). It is not a
  secret-keeping hash: what goes in must already be long and random (a collector id, a pass id, an
  order). Hashed fields end in `_hash` (`collector_hash`, `order_hash`, `ticket_hash`, `who_hash`) or
  are `session_id`. The climb's run reference `climb_ref` is `climbRef` (`packages/shared/src/climbbook.ts`).
- **Stacks.** `error` keeps an error's name and message only.

### The components

`LOG_COMPONENTS`:

| Component | Who logs |
| --- | --- |
| `worker` | The Worker itself: an error no route handled, the cron, the nightly restart |
| `worker.pass` | Guest passes: issued, taken, refused; the signing key |
| `worker.store` | The store's webhooks, its orders, its copy of tickets, a buyer for the contacts |
| `worker.tickets` | Ticket links (claim, share, checkout), ticket events for the park's log, the ticket tables |
| `worker.admin` | The keepers' routes: the key, a keeper's token, the switches, the ledge drafts |
| `worker.accounts` | Accounts (OP-139) and the order protect mail (OP-186) |
| `worker.health` | `/api/health` (OP-068) |
| `worker.feedback` | Feedback (no line uses it yet) |
| `worker.fraud` | The fraud link, PLANNED (OP-053) (no line uses it yet) |
| `worker.guard` | The front door (OP-140, OP-141), the rate limits (OP-142), the page policy's reports |
| `room.join` | A socket's arrival in a room, and what an owl wears or owns |
| `room.leave` | A socket's end, and the room object's restart |
| `room.queue` | The line in front of the park (OP-075) |
| `room.tick` | A room's frames: their handling time, a frame not sent, an error in a frame |
| `room.emote` | Emotes dropped for coming too fast |
| `room.move` | A place or stance the room would not take (OP-149) |
| `room.rest` | An owl asleep, or gone while asleep (OP-126) |
| `room.realms` | The realms switch reaching a room object |
| `room.nest` | The nests |
| `room.play` | Quests, activities, games; what a spectator may not do (OP-191) |
| `collections` | The collections object's stored fields; the player stats |
| `collections.log` | The collection log's outbox (OP-107) |
| `collections.travel` | Where an owl has walked; the front gate (OP-130) |
| `collections.climb` | The climb's bands |
| `overflow` | The overflow object: busy-night settings, the realms switch, room counts, ledge drafts |
| `client.net` | The page's room connection (`?log=`, below) |

## LOG_LEVEL [BUILT]

`LOG_LEVEL` in `apps/edge/wrangler.jsonc` sets the Worker's and the room server's level: `info` in
production. `debug` adds `pass_verified` (a line for every pass taken) and the room object's
`realms_set`. No other line is at `debug`.

## How the Worker and the room server get a logger [BUILT]

`apps/edge/src/logs.ts` (OP-134). Code under `apps/edge/src` logs only through these; no
`console.*` call is allowed there (`apps/edge/test/logEvents.test.ts`, below).

- **`loggerFor(env, request?)`**: a logger at `LOG_LEVEL`. With a request whose `X-Chaos-Run` header
  is a good run id (`runIdOf`: letters, digits and dashes, 1 to 64 characters), every line carries it
  as `run_id`. Any other header value is ignored.
  - The Worker makes one per request (`apps/edge/src/index.ts`) and hands it to the route
    (`RouteCtx.log`). The cron's logger has no request, so no `run_id`.
  - The room object (`RoomObject.ts`) and the overflow object (`Overflow.ts`) each make one without a
    request.
- **A socket's lines.** The room object keeps the run id of the request that opened a socket
  (`Attachment.run`). `logOf(att)` adds `room`, `session_id`, `collector_hash` (when the owl has a
  collection) and `run_id` (when it came with one). Below, **socket fields** means these four. Lines
  about a room or the object, not one socket, use the object's own logger and carry none of them.
- **`moduleLog`**: for code with no deployment settings to hand (a module's own warning). It logs at
  `info` and above whatever `LOG_LEVEL` says, and carries no `run_id`.
- **`captureLogs()`**: for tests. Lines are kept in a list, not printed, until `restore()`.

The chaos harness (`tools/chaos/run.mjs`) sends its run's id as `X-Chaos-Run`.

## The page's log [BUILT]

`apps/park/src/net/pageLog.ts` (OP-134). Off unless the page's address asks for it. Without it the
page writes nothing new to its console.

- `?log=1` turns it on at `info`; `?log=debug` (or another level) at that level. `?log=0` or
  `?log=` leaves it off.
- `?run=<id>` puts `run_id` on every line, when the id is good (the Worker's rule: letters, digits and
  dashes, 1 to 64 characters).
- It writes through `consoleSink`, one JSON line per event, so a chaos run's scripted pages (OP-132)
  are read like the Worker and the room server.
- Its lines are all `client.net`, `info`, from the room connection (`apps/park/src/net/edge.ts`):
  `room_join_ok`, `reconnect_ok` (with `gap_ms`), `room_join_refused` and `room_leave` (each with the
  close `code`), and `emote_throttled` (with `count`, OP-210). The table gives their fields.

## Adding an event [BUILT]

The rule (`CLAUDE.md`, OP-134):

1. Add the event's name to `LOG_EVENTS` (`packages/shared/src/log.ts`). A line with a name not in the
   list does not typecheck (`LogEvent`).
2. Fire it in a test and find its line with `logged(lines, '<event>', fields)`
   (`apps/edge/test/logged.ts`), on lines from `captureLogs()`. `logged` fails the test when no line
   of that event with those fields was logged. `eventsOf(lines)` lists the events logged, in order.
3. Leave a `TODO-DOCS` note for this file, and add the event's row to the table below under the Docs
   hat.

`apps/edge/test/logEvents.test.ts` enforces two rules:

- Every event in `LOG_EVENTS` is looked for with `logged(<lines>, '<event>'` in
  `apps/edge/test/*.test.ts`, except `RESERVED_LOG_EVENTS` and `LOGGER_EVENTS`. The logger's own
  event (`log_field_refused`) fires in `packages/shared/src/log.test.ts`.
- No file under `apps/edge/src` (except the keepers' pages, `*Page.ts`) has a `catch` block with
  nothing but comments in it, a `.catch(() => undefined)`, `.catch(() => void 0)` or
  `.catch(() => {})`, a `.catch(() => null)` not on a body's `.json()`, or a `console.*` call. No catch
  swallows an error unseen.

## The events [BUILT]

Fields are listed beyond `ts`, `level`, `component`, `event` and `msg`. Every Worker line may also
carry `run_id` (the request's chaos run). **Socket fields** are `room`, `session_id`,
`collector_hash` and `run_id`, as the socket has them (above).

| Event | Component | Level | When it fires | Fields |
| --- | --- | --- | --- | --- |
| `log_field_refused` | the refused line's | warn | The logger dropped a field in `REFUSED_FIELDS` from a line. In `LOGGER_EVENTS`: the logger's own | `field`, `of` (the event of the line it was dropped from) |
| `signing_key_missing` | `worker.pass` | warn | `PASS_SIGNING_KEY` is not set or shorter than 16 characters: passes are signed with the development key. Once per isolate (`signingSecret`, `pass.ts`) | none |
| `pass_issued` | `worker.pass` | info | A guest pass went out (`/api/pass`, `routes/visit.ts`) | `session_id`, `collector_hash`, `new_collector` (true when the browser had no collector token) |
| `pass_verified` | `worker.pass` | debug | A route took a pass (`passFrom`, `routes/http.ts`) | `route`, `session_id`, `adm` (admitted past the front gate) |
| `pass_rejected` | `worker.pass` | info | A route refused a pass (`passFrom`) | `route`, `reason`: `missing`, `expired`, `invalid` (`passRefusal`, `pass.ts`) |
| `claim_moved` | `worker.tickets` | info | Tickets moved onto an owl. Two places, below | below |
| `claim_in_use` | `worker.tickets` | info | A claim or share link named tickets already in use on another owl; nothing moved (the ticket desk's 409, OP-174) | `via`: `claim` or `share`; `collector_hash`; `device_class`; `order_hash` (when the desk's answer names the order: a claim; a share's answer names none); `in_use` (the order's running tickets on another owl; 1 when the answer gives no number) |
| `order_protect_mailed` | `worker.accounts` | info | A ticket landed on an owl (a claim, or the gate's checkout) and its buyer was mailed one protect link (`offerOrderProtect`, `accounts.ts`, OP-186) | `collector_hash`, `order_hash` |
| `order_protect_unsent` | `worker.accounts` | warn | No protect link went to a ticket's buyer (OP-186) | `collector_hash`, `order_hash`, `reason`: `no-email` (the store gave none: an app not allowed customers' emails, the store out of reach, or none given) or `mail-failed` |
| `room_join_ok` | `room.join` | info | An owl joined a room (`RoomObject.join`) | socket fields; `owls` (in the room now); `via` (`travel`, when the hello says so); `copy` (the room's copy, OP-075); `owner: true` (its own nest); `spectator: true` (OP-191) |
| `room_join_ok` | `client.net` | info | The page had the room's welcome on a first connection | `room` |
| `room_join_refused` | `room.join`, `client.net` | info, warn, error | A socket was not let into a room. Many places, below | below |
| `room_leave` | `room.leave` | info | An owl left a room (`logLeave`, `RoomObject.ts`) | socket fields; `reason`: `user`, `afk` (said goodbye while asleep), `dropped`, `timeout`, `kick`; `detail` (below); `stayed_ms` |
| `room_leave` | `client.net` | info | The page's socket closed after the welcome | `room`, `code` (the close code, `CLOSE`, `packages/shared/src/edge.ts`), `left: true` (when the page itself left) |
| `reconnect_ok` | `room.join` | info | An owl came back: on a new socket before the room saw its old one go, or after its connection dropped | socket fields; `gap_ms` (0 for a new socket before the old one went, with `replaced: true`; else the time since it left) |
| `reconnect_ok` | `client.net` | info | The page had the room's welcome again after its connection dropped | `room`, `gap_ms` (since the drop, by the page's clock) |
| `queue_enter` | `room.queue` | info | An owl arrived while the line is in front of the park, and holds a number (`/line/join`, `Overflow.ts`, OP-075) | `n` (its number), `who_hash`, `again` (true when the browser already held a number), `waiting` |
| `queue_admit` | `room.queue` | info | An owl's number was called and it went in from the line | `n`, `who_hash`, `waited_ms` (when its joining time is known) |
| `queue_depth` | `room.queue` | info | How the line stands: every `DEPTH_EVERY_MS` (10 s) while anyone waits or holds a place, and once more as it empties | `waiting`, `held` (places held for called numbers), `front`, `owls` (in the rooms), `rate` (owls called per minute over the last ten minutes, `lineRate`) |
| `tick_latency_p95` | `room.tick` | info | Once a room's window has run `TICK_EVERY_MS` (10 s), on its next frame: the window's 95th percentile frame-handling time, from at most `TICK_SAMPLE_MAX` (2,000) frames | `room` (every nest together as `nest`), `p95_ms`, `frames`, `window_ms` |
| `emote_throttled` | `room.emote` | info | Emotes came too fast and were dropped: at once, then at most every `THROTTLE_TELL_MS` (10 s) per socket, and once more for the rest when the socket ends | socket fields, `count` (dropped since last told) |
| `emote_throttled` | `client.net` | info | The page dropped emotes that came sooner than `EMOTE_SEND_EVERY_MS` (`apps/park/src/net/budget.ts`, OP-210) after the last one it sent: told with the next emote it sends | `room`, `count` (dropped since last told) |
| `position_rejected` | `room.move` | info | The room would not take a place or stance as the page asked (OP-149): at once, then at most every `REJECTED_TELL_MS` (60 s) per socket, and once more when the socket ends | socket fields; `reason` (the last one): `room`, `floor`, `perch`, `arrival` (`PositionRejection`, `Room.ts`); `count` (since last told) |
| `webhook_received` | `worker.store` | info | A store webhook was taken (`routes/store.ts`) | `topic`, `order_hash` (when the payload names an order), `status`, `duration_ms` |
| `webhook_rejected` | `worker.store` | warn | A store webhook was turned away before its work | `topic`, `reason`: `signature`, `not-set-up`, `other-store`, `bad-body` |
| `webhook_duplicate` | `worker.store` | info | A webhook came again for work an earlier delivery already did | `topic`, `order_hash` |
| `webhook_failed` | `worker.store` | error | A webhook's work threw; the store sends it again, and every step is safe to repeat | `topic`, `order_hash`, `duration_ms`, `error` |
| `order_recorded` | `worker.store` | info | A paid order's tickets were made | `topic`, `order_hash`, `tickets`, `held` |
| `store_unreachable` | `worker.store` | error | The store did not answer. Two places: the ticket products were not listed, the last list stands (`opening.ts`); the store's copy of tickets was not brought up to date (`mirrorLater`, `routes/park.ts`) | `error`; for the copy of tickets also `order_hash` (an order's tickets) or `ticket_hash` (one ticket) |
| `admin_denied` | `worker.admin` | warn | A keepers' route was asked without the keepers' key, or with a keeper's token that is not good (`isAdmin`, `keeperOf`, `routes/http.ts`) | `route`, `reason`: `no-key-set` (`ADMIN_KEY` missing or under 16 characters), `no-key-given`, `wrong-key`, `bad-keeper-token` (OP-156) |
| `admin_ok` | `worker.admin` | info | A keepers' route was asked with the keepers' key, or with a keeper's token | `route`; `by: 'keeper'` for a token |
| `request_refused` | `worker.guard` | info | The front door refused an API call (`frontDoor`, `guard.ts`, OP-140, OP-141) | `route`, `reason`: `http` (plain http off this machine) or `origin` (another site's page, with `origin`: its first 100 characters) |
| `rate_limited` | `worker.guard` | warn | A call went over a rate limit, first time in its window only (`overLimit`, `limits.ts`, OP-142) | `route`; `limit`: `address`, `public`, `refused`, `visitor`, `ticket` (`API_LIMITS`); `retry_after_s`; `collector_hash` (when the limit is not `address` and the pass has a collector) |
| `csp_violation` | `worker.guard` | warn | The page's policy blocked something (a browser's report to `CSP_REPORT_PATH`, `/api/csp-report`): one line per kind (directive and blocked place) per `REPORT_EVERY_MS` (10 minutes) (`noteViolation`, `guard.ts`) | `directive`, `blocked`, `page`, `source` and `line` (when the report gives them), `count` (reports of this kind since last told) |
| `gate_switched` | `worker.admin` | info | The keepers changed the opening switch (`/api/admin/gate`, OP-067) | `gate` (the mode now), `by`: `switch` or `deployed` (set back to `GATE`) |
| `park_restart` | `worker` | info; warn when a room object missed it | The nightly restart (OP-181), by its cron or by hand (`restartPark`, `routes/admin.ts`) | `by`: `cron` or `key`; `objects`; `missed`; `owls` (sent home); `restart_at` (ISO, when the vote ledger kept the time) |
| `room_restart` | `room.leave` | info | A room object was told of the nightly restart: every owl there is told, and the alarm closes its sockets (`RoomObject.restart`, OP-181). Each owl's `room_leave` follows as `kick`, detail `restart` | `owls`, `sockets`, `close_in_ms` (`RESTART_CLOSE_MS`, 10 s; 0 with no sockets) |
| `room_setup` | `room.leave` | info | The park closed for setup (OP-205): every owl in the room object but a keeper's was sent to the home screen with the closed card's words. Each owl's `room_leave` follows as `kick`, detail `setup` | `owls` |
| `setup_on` | `overflow` | info | The keepers closed the park for setup on the capacity page (OP-205) | |
| `setup_off` | `overflow` | info | The keepers opened the park again after setup (OP-205) | |
| `capacity_set` | `worker.admin` | info | The keepers changed the busy-night settings (`/api/admin/capacity`) | `line` (its mode), `threshold`, `ribbon` (on or off), `copies`, `realms` (the open realms) |
| `realms_set` | `overflow` | info | The keepers changed the realms switch (`Overflow.ts`) | `open`, `portal`, `night` (`moon` when unset), `tree` |
| `realms_set` | `room.realms` | debug | The realms switch reached a room object | `open`, `portal`, `night` and `tree` when set |
| `masks_saved` | `worker.admin` | info | A keeper saved a tree room's ledge draft (`POST /api/admin/masks/<room>`, `routes/masks.ts`, OP-156) | `room`; `by`: `keeper` or `key`; `ledges`, `walls`, `hazards`, `fronts`, `spots` (how many of each) |
| `masks_refused` | `worker.admin` | warn | A ledge draft was refused; nothing was kept | `room` (only when it is a room id, `MASK_ID`); `reason`: `room` (not a paintable room), `too-large` (over `MASKS_BODY_MAX`) or `checkMasks`'s reason (`packages/shared/src/masks.ts`); `list` and `index` (the item refused, when the check names one); `by` |
| `collect_logged` | `collections.log` | info | The collection log took a batch of rows, or the catalogue (`collectLog.ts`, OP-107) | `kind` (`collect`, `player`, `session`, `realm_visit`, `feedback`, `purchase`, or `catalogue`), `rows` |
| `collect_log_failed` | `collections.log` | error, warn | Error: `PARK_LOG_URL` is not an address, so the log stays off; or a sending round threw, so the rows wait for the next round. Warn: the log did not take a batch (with `status`) or did not answer (with `error`), so it is tried again later | `error` or `status` |
| `collect_log_retried` | `collections.log` | info | A sending round began after a failure | `attempt`, `rows` (waiting) |
| `collect_log_full` | `collections.log` | error | The outbox holds `LOG_OUTBOX_MAX` (50,000) rows and newer rows are not kept for the log. At most once an hour | `rows` |
| `collect_log_dropped` | `collections.log` | error | Rows were dropped: a kind the log does not know, or a batch the log refused for good. For the catalogue: refused, sent again with its next change | `kind`, `rows` (not for the catalogue) |
| `afk_sleep` | `room.rest` | info | An owl fell asleep, its visitor idle (OP-126) | socket fields |
| `afk_leave` | `room.rest` | info | An owl left its room asleep; follows its `room_leave` with reason `afk` | socket fields, `asleep_ms` (when its sleep's start is known) |
| `gate_crossed` | `collections.travel` | info | An owl walked through the front gate into the park (OP-130) | socket fields |
| `gate_flag_cleared` | `collections.travel` | info | An owl is outside the park again: into it is through the front gate next time (OP-130) | socket fields |
| `health_check` | `worker.health` | info; error when a part did not answer | `/api/health` (OP-068) | `ok`, `parts` (`rooms`, `tickets`, `collections`: each true or false), `duration_ms` |
| `climb_band_refused` | `collections.climb` | info | A band of the climb was refused | socket fields; `climb_ref`; `band`; `reason`: `idle`, `too-fast`, `forgotten` (`AscentResult`, `climbbook.ts`); `practice: true` (a spectator's run, OP-191) |
| `spectator_refused` | `room.play` | info | A spectator asked for something locked to ticket holders (a quest, an NPC owl, a leaf pile or a stall, a quest item, today's tasks), told once per socket; or a spectator's pass did not make it a full visitor, told each time (OP-191) | socket fields; `frame` (the first refused frame, or `admit`); for `admit`, `reason`: `pass`, `not-admitted`, `not-this-owl`, `before-socket` |
| `spectator_admitted` | `room.join` | info | A spectator's ticket made it a full visitor in place (OP-191) | socket fields |
| `read_failed` | many | error, warn | Something could not be read; what stands instead is in `msg`. Many places, below | below |
| `write_failed` | many | error, warn | Something was not kept or not told; what follows is in `msg`. Many places, below | below |
| `send_failed` | many | error, warn | A message or a close did not go. Several places, below | below |
| `unhandled_error` | many | error | An error nothing handled; it is thrown on as before. Several places, below | below |
| `fraud_scored` | none yet | (reserved) | Reserved for the fraud link, PLANNED (OP-053). In `RESERVED_LOG_EVENTS`; no code logs it | none yet |
| `fraud_timeout` | none yet | (reserved) | Reserved, as above | none yet |
| `fraud_fail_open` | none yet | (reserved) | Reserved, as above | none yet |
| `fraud_restored` | none yet | (reserved) | Reserved, as above | none yet |

No call logs a reserved event yet, so none has a component or level; `worker.fraud` is in
`LOG_COMPONENTS` for the fraud link.

### `claim_moved`

| Where | When | Fields |
| --- | --- | --- |
| `routes/tickets.ts` (`/api/tickets/claim`) | A claim link moved its order's tickets onto this device | `via: 'claim'`, `collector_hash`, `device_class` (`phone`, `desktop`, or null when the request says neither), `order_hash` (when the desk names the order), `tickets` (claimed), `from_other_device` (moved from another owl), `in_use` (the order's running tickets left on another owl, OP-174) |
| `routes/tickets.ts` (`/api/tickets/take`) | A share link moved one ticket onto this device | `via: 'share'`, `collector_hash`, `device_class`, `order_hash` (when named), `tickets: 1` |
| `routes/store.ts` (the store's webhook) | A paid order's tickets went onto the owl that checked out at the gate (OP-175) | `via: 'checkout'`, `collector_hash`, `order_hash`, `tickets`. No `device_class`: the store's webhook carries none |

### `room_join_refused`

| Where | Component, level | Reason | Fields |
| --- | --- | --- | --- |
| `guard.ts` (`frontDoor`) | `room.join`, info | `origin`: the socket did not come from the park's own page | `room` (the path after `/ws/`), `origin` (first 100 characters, or `none`) |
| `routes/rooms.ts` (`socket`) | `room.join`, info | `pass`: its pass was not taken | `room`, `pass`: `missing`, `expired`, `invalid` |
| `routes/rooms.ts` | `room.join`, info | `gate`: the pass is not admitted past the front gate, and `SPECTATORS` is off | `room`, `session_id`, `collector_hash` |
| `routes/rooms.ts` | `room.join`, info | `queue`: sent to wait in the line (OP-075) | `room`, `session_id`, `collector_hash` |
| `RoomObject.ts` | `room.join`, warn | `address`: too many sockets from one address | `room`, `session_id`, `limit` (`MAX_SOCKETS_PER_IP`), `run_id` |
| `RoomObject.ts` | `room.join`, info | `realm`: a realm the keepers have not opened | socket fields |
| `RoomObject.ts` | `room.join`, error | `offline`: the hello failed, or the collections object did not say how the nest stands; the page is asked to try again | socket fields, `error` |
| `RoomObject.ts` | `room.join`, info | `cap`: the room is full | socket fields, `cap` |
| `RoomObject.ts` | `room.join`, info | `spectators`: a spectator, and the room holds its spectators' share (OP-191) | socket fields, `cap`, `limit` (the spectators' limit) |
| `RoomObject.ts` | `room.join`, info | `gate`: a travel into the park before the owl walked through the front gate (OP-130) | socket fields |
| `RoomObject.ts` | `room.join`, info | `nest`: a nest closed or gone | socket fields, `detail` |
| `RoomObject.ts` | `room.join`, info | `no-hello`: no hello in time; the socket is closed | socket fields |
| `apps/park/src/net/edge.ts` | `client.net`, info | none: the room closed the socket before its welcome | `room`, `code` |

### `room_leave`'s detail

| Reason | `detail` |
| --- | --- |
| `kick` | Why the room server closed the socket: `restart` (OP-181), `moved` (restored on another screen, OP-139), `realm-closed`, `nest-closed`, or a close reason (`too many frames`, `too many moves`, `text frames only`, `frame too large`, `malformed frame`, `hello first`, `duplicate hello`) |
| `dropped` | `code <n>` (the close code, when there is one), or `error` |
| `user`, `afk`, `timeout` | none |

### `read_failed`

| Where | Component, level | What could not be read | Fields |
| --- | --- | --- | --- |
| `sqlStore.ts`, `sqlNestStore.ts`, `sqlScoreStore.ts`, `parkStats.ts` | `collections`, error | A stored collection field, nest field, score-wall picture or list of rooms | `error` |
| `Overflow.ts` | `overflow`, error | A busy-night setting in storage | `key`, `error` |
| `Overflow.ts` | `overflow`, error | A tree room's ledge draft in storage | `room`, `error` |
| `Overflow.ts` | `overflow`, error | The rooms' count | `error` |
| `overflowState.ts` | `overflow`, error | The overflow object | `error` |
| `overflowState.ts` | `overflow`, warn | A room object's count of owls | `object`, `error` |
| `routes/account.ts`, `routes/admin.ts` | `overflow`, error | Which copies of rooms are open | `error` |
| `routes/masks.ts` | `overflow`, error | A tree room's ledge draft, for `GET /api/masks/<room>` | `room`, `status` |
| `RoomObject.ts` | `overflow`, warn | The busy ribbon | `status` or `error` |
| `rooms.ts` | `room.join`, error | `ROOM_CAPS` is not JSON. Once per isolate | `error` |
| `rooms.ts` | `room.join`, error | `SPECTATOR_SHARE` is not a share from 0 to 1. Once per isolate (OP-191) | `value` (first 40 characters), `share` (`DEFAULT_SPECTATOR_SHARE`, 0.75) |
| `RoomObject.ts` | `room.join`, warn | Which screen holds the owl | socket fields, `error` |
| `RoomObject.ts` | `room.join`, warn | What an owl owns | `collector_hash`, `error` |
| `RoomObject.ts` | `room.nest`, error | The street's doors | socket fields, `error` |
| `RoomObject.ts` | `room.play`, warn | The arcade's score wall | socket fields, `error` |
| `RoomObject.ts` | `collections.travel`, warn | Whether the owl walked through the gate (it is let in) | socket fields, `error` |
| `routes/visit.ts` | `collections.travel`, error | Where the owl has walked (`/api/travel`) | `collector_hash`, `error` |
| `routes/visit.ts` | `worker.accounts`, error | Which screen holds the owl (`/api/pass`; the pass goes out as before) | `collector_hash`, `error` |
| `accountBook.ts` | `worker.accounts`, error | An account's stored picture | `error` |
| `gateSwitch.ts` | `worker.admin`, error | The opening switch | `error` |

### `write_failed`

| Where | Component, level | What was not kept or told | Fields |
| --- | --- | --- | --- |
| `routes/park.ts` (`logPurchase`) | `worker.tickets`, warn | A ticket event for the park's log (OP-192) | `reason` (the event: `paid`, `claimed`, `refunded`, `cancelled`, `scanned`), `order_hash` (when it has an order), `error` |
| `storeHooks.ts` | `worker.tickets`, warn | A paid order's tickets onto the owl that checked out (its claim email still does it) | `order_hash`, `status` or `error` |
| `sqlTicketStore.ts`, `sqlVoteStore.ts` | `worker.tickets`, error | A table brought up to date | `table`, `column`, `error` |
| `routes/store.ts` (`logContact`) | `worker.store`, warn | A paid order's buyer to the owner's contacts (OP-192); the next webhook sends it again | `order_hash`, `error` |
| `storeHooks.ts` | `worker.store`, warn | An order's webhook lease let go (it runs out within 20 s) | `order_hash`, `error` |
| `routes/park.ts` (`offerProtectByOrder`) | `worker.accounts`, error | A ticket's buyer offered a protect link (OP-186) | `collector_hash`, `order_hash`, `error` |
| `routes/account.ts` | `worker.accounts`, error | A room object told an owl moved to another screen | `object`, `collector_hash`, `error` |
| `routes/admin.ts` | `worker.admin`, error | The opening switch (the vote ledger refused it) | `status` |
| `routes/admin.ts` | `worker.admin`, warn | A change to the busy-night settings | `status` |
| `routes/admin.ts` (`restartPark`) | `worker`, error | The nightly restart's time (passes from before it still pass the turnstiles; the rooms restart all the same) | `by`, `error` |
| `routes/masks.ts` | `overflow`, error | A tree room's ledge draft (the overflow object refused it) | `room`, `status` |
| `Overflow.ts` | `overflow`, warn | A room object told the ribbon or the realms switch (it asks again within a minute) | `object`, `error` |
| `RoomObject.ts` | `room.join`, warn | The owl's picture for its account; what the owl wears in its collection | socket fields, `error` |
| `RoomObject.ts` | `room.nest`, error | An owner's change to its nest | socket fields, `error` |
| `RoomObject.ts` | `room.play`, error | A quest step (with `frame`); an activity or game step; feathers for the lantern beam or the stage quiz (with `feathers`) | socket fields, `frame` or `feathers`, `error` |
| `RoomObject.ts` | `room.play`, warn | A quest event counted | socket fields, `kind`, `error` |
| `RoomObject.ts` | `collections.travel`, error | Where the owl walked | socket fields, `error` |
| `RoomObject.ts` | `collections`, warn | The player stats' sighting of an owl (socket fields) or heartbeat of the owls still here (`owls`, the object's logger) | `error` |

### `send_failed`

| Where | Component, level | What did not go | Fields |
| --- | --- | --- | --- |
| `routes/admin.ts` (`restartPark`) | `worker`, error | A room object told of the nightly restart (its owls stay until they leave) | `object`, `by`, `error` |
| `RoomObject.ts` (`closeSocket`) | `room.leave`, warn | A socket still open would not close | `code`, `reason`, `error` |
| `routes/rooms.ts` (`turnedAway`) | `room.queue`, warn | A socket the Worker turned away would not close | `code`, `error` |
| `Room.ts` | `room.tick`, warn | A frame to an owl in the room | `room`, `frame` (its type), `error` |
| `RoomObject.ts` | `room.tick`, warn | A frame to an open socket | `frame`, `error` |

### `unhandled_error`

| Where | Component | When | Fields |
| --- | --- | --- | --- |
| `index.ts` | `worker` | A request failed with an error no route handled | `route`, `error` |
| `index.ts` | `worker` | A cron failed: the Realm Vote's month-end close, the nightly restart, or a cron with no job | `job` (`vote-close`, `restart`, or `none`), `cron`, `error` |
| `RoomObject.ts` | `room.join` | A socket's owl could not be put back in its room after the object woke; the socket is closed | `error` |
| `RoomObject.ts` | `room.tick` | A frame failed | socket fields (when the socket has its attachment), `error` |
| `RoomObject.ts` | `room.play` | A visitor's quest or game work failed | socket fields, `error` |

## What is not logged [BUILT]

- Sleeping is one flag on the owl (`rest` frames); the page's idle timers are never logged. The room
  server logs `afk_sleep` and `afk_leave` (OP-126).
- `position_rejected` lines are expected while a keeper tries a ledge draft (`?paint=1`'s Try,
  OP-156): the owl stands on a draft the room does not have.

## Every event, checked

`LOG_EVENTS` holds 58 events, every one in the table above: `log_field_refused`,
`signing_key_missing`, `pass_issued`, `pass_verified`, `pass_rejected`, `claim_moved`,
`claim_in_use`, `order_protect_mailed`, `order_protect_unsent`, `room_join_ok`,
`room_join_refused`, `room_leave`, `reconnect_ok`, `queue_enter`, `queue_admit`, `queue_depth`,
`tick_latency_p95`, `emote_throttled`, `position_rejected`, `webhook_received`,
`webhook_rejected`, `webhook_duplicate`, `webhook_failed`, `order_recorded`, `store_unreachable`,
`admin_denied`, `admin_ok`, `request_refused`, `rate_limited`, `csp_violation`, `gate_switched`,
`park_restart`, `room_restart`, `room_setup`, `setup_on`, `setup_off`, `capacity_set`, `realms_set`, `masks_saved`, `masks_refused`,
`collect_logged`, `collect_log_failed`, `collect_log_retried`, `collect_log_full`,
`collect_log_dropped`, `afk_sleep`, `afk_leave`, `gate_crossed`, `gate_flag_cleared`,
`health_check`, `climb_band_refused`, `spectator_refused`, `spectator_admitted`, `read_failed`,
`write_failed`, `send_failed`, `unhandled_error`, `fraud_scored`, `fraud_timeout`,
`fraud_fail_open`, `fraud_restored`.

- `RESERVED_LOG_EVENTS`: `fraud_scored`, `fraud_timeout`, `fraud_fail_open`, `fraud_restored` (the
  fraud link, OP-053). No code logs them.
- `LOGGER_EVENTS`: `log_field_refused`. Only the shared logger logs it.
- Every other event has at least one call in `apps/edge/src` or `apps/park/src`. No call logs an
  event outside the list.
- `worker.feedback` and `worker.fraud` are in `LOG_COMPONENTS` with no line under them yet.
