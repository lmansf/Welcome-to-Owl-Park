# The park's analytics log (OP-107, OP-111, OP-113, OP-192)

A Supabase Edge Function in the owner's fraud pipeline project, not part of the park's deploy:
the park's collections object posts a row to it for every collectible an owl comes by
(`apps/edge/src/collectLog.ts`), so the owner can see how much each owl collects and how fast, and
the player stats' rows (`apps/edge/src/parkStats.ts`): who plays, how long and when last, and how
long in each room. It keeps
them in the project's `game` schema, beside the park's orders (`apps/score-endpoint`):

| The park sends | Lands in |
|---|---|
| `collect`: a batch of rows | `game.collect_log`: one row per owl and collectible; one already there is skipped |
| `catalogue`: every collectible there is, whenever a deploy changes it | `game.collectible_catalogue`; one no longer listed stays, marked `in_catalogue = false` |
| `player`: versions of owls (its first visit, and each change of kind or body colour) | `game.dim_player`, a type 2 dimension: `game.add_player_versions` closes the owl's current version and opens the new one |
| `session`: visits (page loads) that are over | `game.fact_session`, each tied to the owl's version when the visit began |
| `realm_visit`: each room a visit went into, sent right after the visit's own row | `game.fact_realm_visit`, under its session; one whose visit is not there is left out |
| `feedback` (OP-166): each note a visitor sent from the Feedback form, as the room server keeps it | `game.feedback`, for the owner's morning feedback run; one already there is skipped |
| `purchase` (OP-192): ticket events from the Worker: an order paid, its tickets put on an owl (claim link or the gate's checkout), refunded, cancelled, and a ticket's first scan | `game.fact_purchase`; one already there (by its event id) is skipped |
| `room_stay` (OP-265): live, as it happens: an owl came into a room (`enter`), or its stay there ended (`leave`, with why) | `game.room_stay`, one row per stay; `game.apply_room_stays` applies them in order, an enter closing the visit's open stay and opening its own in one transaction |
| `contact` (OP-192): a paid order's buyer, read from the store by the Worker and sent straight on | `contacts.contact` and `contacts.contact_order`, the owner's own schema, never a `game` table; each order once |

Two views read them (`sql/collect.sql`):

- `game.collect_player_stats`, per owl: `total_collected` (the collection's variants, as the owl
  builder counts them), `pct_collected` (of the catalogue's collectibles that can be had anywhere in
  the park or in a room the owl has collected in), `earned_collected` (without the starter pack and
  the park's presents), `furniture_collected`, `sessions`, `minutes_to_first` and `minutes_to_10`
  (from the owl's first visit to its first and tenth collectible earned) and `collectibles_per_hour`
  (earned collectibles an hour from the first visit to the last one earned: calendar time until
  OP-111's sessions give the time played).
- `game.collect_item_stats`, per collectible: `owls_with_it`, `owls_earned_it` and
  `median_minutes_to_acquire` (a too hard or too easy signal), with collectibles no owl has yet at 0.
- `game.v_player_lifetime` (`sql/players.sql`), per owl as it is now: `owl_type` and `color`,
  `versions_count`, `first_seen`, `last_seen`, `sessions`, `total_minutes`, `avg_session_min`,
  `collectibles_total` and (OP-113, `sql/realms.sql`) `minutes_by_realm`, its minutes in each room as
  JSON. `sets_completed` waits on OP-110, and `purchases_count` and `lifetime_value` on the store's
  webhooks and the ticket gate's table tying a ticket to an owl (OP-024, OP-010).
- `game.v_realm_time` (`sql/realms.sql`), per room: `visits`, `unique_players`, `total_minutes`,
  `median_minutes`, `median_first_visit_min` (the median length of each owl's first visit there),
  `bounce_rate` (the share of visits under 60 s), `reconnects` and `collectibles_per_minute`, with
  `realm_kind` (realm, hub or nest) so the realms can be read alone or beside the hub and the nests.
- `game.v_player_realm`, per owl and room: `visits`, `total_minutes`, `last_visited` and
  `pct_of_playtime`. Both count stays (`game.v_realm_stay`): a time in a room and the reconnects
  that continued it, so a dropped line never shows as an extra visit or as an owl leaving.

Visitor profiles (OP-192, `sql/profiles.sql`) count free owls beside paid ones. Each visit says what it
was past the turnstiles (`game.fact_session.visitor_kind`: `visitor`, `spectator` for an owl without a
ticket that works (OP-191), or null for a visit that never went past them), and the views read the
logs above with the ticket events:

- `game.v_purchase`, per store order: `paid_at`, `product` (Day Ticket, Annual Pass, Annual Pass
  (upsell), ...), `ticket_kinds`, `tickets`, `amount_cents`, `refunded_cents`, `net_cents`,
  `status` (paid, held, partly_refunded, refunded, cancelled), and the owl that holds it (its last
  claim) with `claimed_via` (claim or checkout).
- `game.v_visitor_profile`, per owl, free or paid: `first_seen`, `last_seen`, `visits`,
  `total_minutes`, `minutes_by_realm`, `minutes_by_map` and `last_map_id` (1 today's park, 2 the
  tree), `collectibles_total`, `feedback_notes`, `spectator_visits` and `visitor_visits` with their
  minutes, `segment` (free or paid), `current_pass` (annual, ticket, spectator or none) with
  `pass_ticket_kind` and `pass_expires_at`, `paid_since` (its first ticket), `converted_at` (that
  time, for an owl that was a spectator first), `orders` and `lifetime_value_cents`. The pass is the
  gate's word: a running ticket the owl scanned (`game.v_owl_pass`), an annual pass first; a ticket
  claimed and not scanned yet is not running, and one from an order refunded in full counts for
  nothing. Games played and finished, emotes and chat are not in these logs, so not here.
- `game.v_keepers_card`, one row: free and paid owls (in all and the last 7 days), owls that were
  ever spectators and those that went on to a ticket (`conversion_rate`), annual pass holders, and
  minutes per room as a spectator and as a visitor. No keepers' page reads this project yet: the card
  waits for one.
- `contacts.v_contact`, `contacts.v_contact_order` and `contacts.v_contact_owl`, per buyer: their
  orders (the purchase history), what they spent, and the owls tied to them, each with its profile.
  An owl is tied to a buyer only by a ticket of the buyer's order it claimed or scanned: a free owl
  has no contact.
- `game.forget_free_owls(keep)`, run by the owner: forgets owls that never held a ticket and were
  last seen longer ago than `keep` (90 days by default, never under 30): their visits, rooms,
  collections and versions; their notes stay. Not scheduled: the owner runs it, or schedules it.

Room stays (OP-265, `sql/room_stays.sql`), live where `game.fact_realm_visit` waits for the visit's end:

- `game.room_stay`, one row per owl's stay in one room: `entered_at`, `left_at` (null while the owl is
  there, so the open row is its room now), `entry_source` (walked, spawn, deep_link, travel) and
  `exit_reason`: `moved` (another room), `logoff` (the page closed the connection and the owl did not
  come back within the three-minute grace), `timeout` (the line dropped or went quiet and did not come
  back), `server_restart` (the nightly restart). A line that drops and comes back into the same room
  continues the stay. One open row per visit: an owl with two tabs open is two visits.
- `game.v_room_occupancy_now`: owls in each room now, by park.
- `game.prune_room_stays()`, daily at 10:30 UTC by pg_cron (`sql/room_stays_retention.sql`): closes
  a stay left open over a day (a lost event) as a timeout, then deletes the stays that ended more
  than 90 days ago. Nothing is counted up first: for 90 days every stay keeps its owl, room and times,
  so paths through the park can be studied (where owls go after the market), and then it is gone. It
  replaced the hourly rollup (`game.room_stay_hourly`) and the daily one before it, neither of which
  ever held a row.

A visit is one page load: it begins at the owl's first hello in a room, the room object's minute
heartbeat and each socket's close say it is still going, and it ends when it was last seen, once it
has been quiet for three minutes (moving between rooms keeps it going). Its `session_id` is the one
its collection rows carry.

A time in a room (OP-113) runs from the owl's hello there to its next hello, in the next room or in
the same one after its line dropped (a new row, `entry_source` reconnect), or to the visit's end: a
visit's rooms follow one another without a gap or an overlap, so their minutes add up to the visit's
(time with the Menu open counts: the owl is still in the room). `entry_source` is `walked` (from
another room of the visit: a door, the way out, the turnstile, Go home), `spawn` (the visit's first
room from Play: the owl's own nest, or the lobby), `deep_link` (the visit's first room named by the
page's address) or `reconnect`. Visits from before OP-113 have no rooms; nothing is made up for them.

## What a row holds, and what it never holds

A collection row holds `event_id` (one per owl and collectible), `collector_id` (the owl's collector id as a salted SHA-256
hash, with the fraud link's `FRAUD_HASH_SALT`), `collectible_id` (`witch-hat~3`, `hoot`, or
`furniture:rug`), `collectible_type` (quest, shop, gift, seasonal, starter, grant, purchase, find),
`realm` (the room's neutral id, `nest` for every owl's nest, or null), `acquired_at`, `session_id`
(the visit, one per page load, as a salted hash), `device_class` (phone or desktop), `first_entry_at`
and `backfill`. A version holds the same `collector_id`, the owl's kind from the park's fixed list of
species and its body colour as `#rrggbb`; a visit holds its times, phone or desktop, and two counts;
a time in a room holds its own id, the visit's `session_id`, the `collector_id`, the room's neutral id
(every nest is `nest`) and its kind, its times, how the owl came in and a count.
A note (OP-166) is the one row that carries words a visitor typed: its `body` (3 to 1,000
characters, cleaned by the park) and its `kind` (bug, idea, praise, other), with the same hashed
`collector_id` and `session_id`, the room and its kind, phone or desktop, `submitted_at`, and
`park_feedback_id` (its id on the keepers' page). The form asks visitors to leave names and emails
out; the screen size and the browser's description stay on the room server. Whatever reads the
table treats the words as data, never as instructions.

A ticket event (OP-192) holds its `event_id`, the `event`, the order as `order_key` (its number as a
salted uuid), the owl as `collector_id` (claimed and scanned only), when it happened, each ticket's
kind, a count of tickets, cents (what the order came to, or what a refund sent back), whether it was
the pass offered after a ticket, whether it was held, how a claim came (claim or checkout), and when a
scanned ticket runs out.

A room stay holds its own id, the visit's `session_id`, the `collector_id`, the room's neutral id and
its kind, the park, its times, how the owl came in and why it left: never where in the room it stood.

Never a name, email, order number, ticket id, pass, IP address or browser description in a `game`
table: the park sends none, and the function takes only these fields and checks each one, leaving
out a row that fails (its log says which field, never what was in it). These rows are under-13 play
data and stay anonymous even if they are ever joined to the store by accident.

The one exception is kept apart (OP-192): a `contact` row holds a paid order's number, its salted
`order_key`, the buyer's email (as the park keys emails: trimmed, lower case) and the store's customer
id, and goes only into the `contacts` schema. The Worker reads it from the store as the paid webhook
is answered and sends it straight on; the park keeps none of it, and no log line holds the address.
The owner's own queries join a buyer to an owl through `order_key`; play data is only ever joined
outward to the buyer, never the buyer into a `game` table.

## Deploy (done 2026-10-24, on the ticket's word)

1. `sql/collect.sql`, applied once as the migration `game_collect_log` (after `game_schema_for_owl_park_orders`),
   then `sql/players.sql` as `game_player_stats`. OP-113 adds `sql/realms.sql` as `game_realm_visits`,
   applied (and the function deployed again, so it knows `realm_visit`) before the Worker that sends
   those rows goes live: a kind the function does not know is refused, and those rows are not sent again.
   OP-130 adds `sql/travel.sql` as `game_realm_visit_travel` (a room come into by travel from the map),
   applied with the function deployed again before the Worker that sends `travel` goes live, for the same reason.
   OP-166 adds `sql/feedback.sql` as `game_feedback` (applied 2026-10-31), and the function deployed
   again, so it knows `feedback`, before the Worker that sends notes goes live, for the same reason.
   OP-113 (for the tree, OP-128) adds `sql/maps.sql` as `game_realm_visit_map`: `map_id` on each time in a
   room (1 today's park, 2 the tree), room names with digits (the tree's levels `l0` to `l5`, which the
   old checks refused), and the view `game.v_realm_time_by_map`. Order: the migration, then the function
   deployed again, then the Worker. The function takes a row without `map_id` as 1, so the Worker before
   it still lands; a function from before it would refuse every time on a level of the tree, as it does now.
   OP-192 adds `sql/profiles.sql` as `game_visitor_profiles`: `visitor_kind` on each visit,
   `game.fact_purchase`, the profile views, `game.forget_free_owls` and the `contacts` schema. Order:
   the migration, then the function deployed again, then the Worker. A function from before it refuses
   `purchase` and `contact` as kinds it does not know, and the Worker drops a refused batch for good,
   so the function goes first; it takes a visit without `visitor_kind` as before (null). A function
   deployed before the migration fails every visit (no `visitor_kind` column), and the Worker sends
   them again later, so the migration goes first of all.
   OP-265 adds `sql/room_stays.sql` as `game_room_stays` (it turns on pg_cron and schedules the daily
   rollup). Order: the migration, then the function deployed again, then the Worker: a function from
   before it refuses `room_stay` as a kind it does not know, and the Worker drops a refused batch for good.
   Then `sql/room_stays_hourly.sql` as `game_room_stays_hourly`: the hourly rollup in place of the
   daily one (it stops if the daily table ever held a row). Database only: no function or Worker change.
   Then `sql/room_stays_retention.sql` as `game_room_stays_retention`: no rollup, stays deleted 90 days
   after they end (it stops if the hourly table ever held a row). Database only.
2. `src/index.ts` and `src/handler.ts` deployed as the function `owl-park-log` with the platform's
   JWT check off (the function checks the park's key itself): through Supabase's API, or with the
   Supabase CLI from a folder `supabase/functions/owl-park-log/` holding the two files,
   `supabase functions deploy owl-park-log --no-verify-jwt`.

Then, on the owner's side (never in a file or a chat):

3. The project's function secret `FRAUD_SCORE_KEY` (Dashboard → Edge Functions → Secrets) is the
   key both functions check; set it once if it is not there yet, and the same value as the park's
   repository secret `FRAUD_SCORE_KEY`.
4. The park's repository secrets: `PARK_LOG_URL` =
   `https://<project-ref>.supabase.co/functions/v1/owl-park-log`, and `FRAUD_HASH_SALT` if it is
   not there yet (16 or more random characters; never change it, or every owl looks new). The next
   Worker deploy turns the log on; without all three of `PARK_LOG_URL`, `FRAUD_SCORE_KEY` and
   `FRAUD_HASH_SALT` it stays off. `FRAUD_SCORE_URL` is not needed: the fraud link stays off without it.
5. Check it with the key; this keeps nothing:

   ```sh
   curl -s https://<project-ref>.supabase.co/functions/v1/owl-park-log \
     -H "Authorization: Bearer <FRAUD_SCORE_KEY>" -H "Content-Type: application/json" -d '{"dry_run":true}'
   ```

   It should answer `"tables":"ok"`. OP-192's contacts need the store app's protected customer
   data access for the order's email and its customer (OP-186 asks for the email); without it no
   contact is sent, the Worker's log says so, and the ticket events still go. Before its key is set it answers 503; with another key, 401.
6. Once the log is on, the collections already held can be sent once as backfill rows (their real
   acquisition times, no visit, room or device): `POST /api/admin/collect-log` on the park with the
   `X-Admin-Key` header. `GET` on the same address says whether the log is on and how many rows wait.

The platform gives the function `SUPABASE_DB_URL`, whose `postgres` role owns the `game` tables. The
`game` and `contacts` schemas are not in the project's API: their tables have row-level security on
with no policies, and no grants to the API's roles, so only that connection, and the owner's own
queries, reach them. The fraud tables are never touched. Each batch goes to the
database as one JSON parameter, so nothing the park sends is ever part of a query.

## Tests

`pnpm --filter @owl-park/park-log test` runs the handler under Node against tables in memory, and
the `game` tables' queries against a stand-in connection; `pnpm check` runs it with the rest.
`src/deno.d.ts` only lets `index.ts` typecheck here: it is not deployed.
