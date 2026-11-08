-- Visitor profiles (OP-192) in the fraud pipeline's Supabase project, beside the park's other
-- analytics. Applied once there as the migration `game_visitor_profiles`, after `game_realm_visit_map`
-- (sql/maps.sql), and before the owl-park-log function and the Worker that send `visitor_kind`,
-- `purchase` and `contact` go live; kept here so it can be read and made again. The function never
-- runs it, except `contacts.add_contacts`, its one way into the contacts.
--
-- Three parts:
--
-- 1. Free owls counted beside paid ones: each visit says whether it went past the turnstiles as a
--    spectator (OP-191: no ticket that works; it plays but earns nothing) or as a full visitor.
-- 2. Tickets: `game.fact_purchase`, a row for each thing that happened to a ticket order (paid, its
--    tickets put on an owl, refunded, cancelled) and for each ticket's first scan at the gate. Anonymous
--    like every other game table: the order is a salted key, the owl its collector id's salted hash.
--    `game.v_purchase` makes one row per order of them, and `game.v_visitor_profile` one row per owl,
--    free or paid, from the logs the park already sends (visits, rooms, collections, notes).
-- 3. The owner's contacts, in a schema of their own: each paid order's buyer (the email and the
--    store's customer id) and the order's salted key, so the owner's own queries join a buyer to the
--    owl that claimed the order's tickets. An owl that never bought or claimed a ticket has no contact.
--    The game tables keep their rule: no name, email or age.
--
-- Nothing here is in the project's API: row-level security on with no policies, and no grants to the
-- API's roles, so only the owner's own queries (the database's own role, or the service role) read it.
-- The fraud tables (raw_transactions and the rest) are not touched.

-- ---------- 1. free and paid visits ----------

alter table game.fact_session add column visitor_kind text check (visitor_kind in ('visitor', 'spectator'));
comment on column game.fact_session.visitor_kind is 'What the visit was past the turnstiles (OP-192): visitor (a full visitor at any time in it, a spectator whose ticket went through mid-visit included), spectator (only ever a spectator there, OP-191), or null (it never went past them; or a visit from before OP-192).';

-- ---------- 2. tickets ----------

-- One row per thing that happened to a ticket order, or to a ticket at the gate.
create table game.fact_purchase (
  event_id uuid primary key,
  event text not null check (event in ('paid', 'claimed', 'refunded', 'cancelled', 'scanned')),
  order_key uuid,
  collector_id text check (collector_id ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null,
  ticket_kinds text[] not null default '{}' check (ticket_kinds <@ array['day', 'night', 'annual', 'event', 'opening-night']::text[]),
  tickets integer not null default 0 check (tickets >= 0),
  amount_cents integer check (amount_cents >= 0),
  upsell boolean not null default false,
  held boolean not null default false,
  via text check (via in ('claim', 'checkout')),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  -- Every event but a scan names its order (a ticket the keepers gave has none); a claim and a scan name their owl.
  constraint fact_purchase_order_check check (order_key is not null or event = 'scanned'),
  constraint fact_purchase_owl_check check (collector_id is not null or event not in ('claimed', 'scanned'))
);
comment on table game.fact_purchase is 'Owl Park (OP-192): one row per ticket event, from the park''s Worker: paid (an order''s tickets made), claimed (put on an owl by the claim link or the gate''s checkout), refunded, cancelled, scanned (a ticket''s first scan started its time on an owl). Anonymous: order_key is the order''s salted key, collector_id a salted hash; never a name, email, order number or ticket id.';
comment on column game.fact_purchase.order_key is 'The store order''s salted key (contacts.contact_order holds the order''s number beside it). Null only for a scan of a ticket the keepers gave.';
comment on column game.fact_purchase.collector_id is 'claimed: the owl the tickets went onto; scanned: the owl that scanned; null for the order''s own events.';
comment on column game.fact_purchase.ticket_kinds is 'paid: each ticket''s kind, one per ticket; scanned: the ticket''s own.';
comment on column game.fact_purchase.tickets is 'Tickets made (paid), moved (claimed), switched off (refunded, cancelled), or 1 (scanned).';
comment on column game.fact_purchase.amount_cents is 'paid: what the order came to (tax and discounts in); refunded: what went back, where the refund says. In the shop''s currency.';
comment on column game.fact_purchase.upsell is 'paid: the annual pass offered after a ticket (opening night''s half price, OP-062, OP-180).';
comment on column game.fact_purchase.held is 'paid: its tickets waited for the owner''s fraud check when they were made.';
comment on column game.fact_purchase.valid_until is 'scanned: when the ticket''s time runs out.';
create index fact_purchase_order_idx on game.fact_purchase (order_key, occurred_at);
create index fact_purchase_collector_idx on game.fact_purchase (collector_id, occurred_at);

alter table game.fact_purchase enable row level security;
revoke all on game.fact_purchase from public, anon, authenticated;

-- One row per store order: what it was, whose owl holds it, and what went back.
create view game.v_purchase with (security_invoker = true) as
with orders as (
  select distinct order_key from game.fact_purchase where order_key is not null
),
paid as (
  select distinct on (order_key) order_key, occurred_at, ticket_kinds, tickets, amount_cents, upsell, held
  from game.fact_purchase
  where event = 'paid'
  order by order_key, occurred_at
),
holder as (
  -- The last claim of the order: a claim link opened on another owl moves its unscanned tickets there.
  select distinct on (order_key) order_key, collector_id, occurred_at, via
  from game.fact_purchase
  where event = 'claimed'
  order by order_key, occurred_at desc
),
firsts as (
  select order_key, min(occurred_at) as first_claimed_at
  from game.fact_purchase
  where event = 'claimed'
  group by order_key
),
back as (
  select order_key,
    coalesce(sum(tickets) filter (where event = 'refunded'), 0) as tickets_refunded,
    sum(amount_cents) filter (where event = 'refunded') as refunded_cents,
    bool_or(event = 'cancelled') as cancelled,
    count(*) filter (where event = 'scanned') as tickets_scanned,
    min(occurred_at) filter (where event = 'scanned') as first_scan_at,
    max(occurred_at) as last_event_at
  from game.fact_purchase
  where order_key is not null
  group by order_key
)
select o.order_key,
  p.occurred_at as paid_at,
  case
    when p.order_key is null then null
    when p.upsell then 'Annual Pass (upsell)'
    when p.ticket_kinds <@ array['annual']::text[] then 'Annual Pass'
    when p.ticket_kinds <@ array['day']::text[] then 'Day Ticket'
    when p.ticket_kinds <@ array['night']::text[] then 'Night Ticket'
    when p.ticket_kinds <@ array['opening-night']::text[] then 'Opening Night Ticket'
    when p.ticket_kinds <@ array['event']::text[] then 'Event Ticket'
    else 'Mixed'
  end as product,
  p.ticket_kinds,
  p.tickets,
  coalesce(p.upsell, false) as upsell,
  p.amount_cents,
  b.refunded_cents,
  p.amount_cents - coalesce(b.refunded_cents, 0) as net_cents,
  b.tickets_refunded,
  b.tickets_scanned,
  case
    when b.cancelled then 'cancelled'
    when p.tickets is not null and b.tickets_refunded >= p.tickets then 'refunded'
    when b.tickets_refunded > 0 then 'partly_refunded'
    when p.held and h.order_key is null and b.tickets_scanned = 0 then 'held'
    else 'paid'
  end as status,
  h.collector_id,
  h.via as claimed_via,
  f.first_claimed_at,
  h.occurred_at as claimed_at,
  b.first_scan_at,
  b.last_event_at
from orders o
left join paid p using (order_key)
left join holder h using (order_key)
left join firsts f using (order_key)
left join back b using (order_key);
comment on view game.v_purchase is 'Owl Park (OP-192), per store order: when paid, what (product, each ticket''s kind, upsell), what it came to and what went back (cents), its status (paid, held, partly_refunded, refunded, cancelled), and the owl that holds it (the last claim). Orders paid before the log took ticket events have no paid_at or product.';

-- Per owl: the pass it holds now, by the gate's word: the ticket whose first scan let it in and is
-- still running, an annual pass before any other, and none from an order refunded or cancelled in full.
create view game.v_owl_pass with (security_invoker = true) as
select distinct on (s.collector_id) s.collector_id,
  s.ticket_kinds[1] as ticket_kind,
  s.valid_until,
  s.occurred_at as scanned_at,
  s.order_key
from game.fact_purchase s
left join game.v_purchase o on o.order_key = s.order_key
where s.event = 'scanned'
  and s.valid_until > now()
  and coalesce(o.status, 'paid') not in ('refunded', 'cancelled')
order by s.collector_id, (s.ticket_kinds[1] = 'annual') desc, s.valid_until desc;
comment on view game.v_owl_pass is 'Owl Park (OP-192), per owl holding a running ticket: its kind and when it runs out (an annual pass first). A ticket claimed and not scanned yet is not running.';

-- One row per owl, free or paid: when it came, how long it stayed and where, what it holds, and what it bought.
create view game.v_visitor_profile with (security_invoker = true) as
with owls as (
  select collector_id from game.dim_player where is_current
  union
  select collector_id from game.fact_purchase where collector_id is not null
),
visits as (
  select collector_id,
    count(*) filter (where visitor_kind = 'spectator') as spectator_visits,
    count(*) filter (where visitor_kind = 'visitor') as visitor_visits,
    round(coalesce(sum(duration_min) filter (where visitor_kind = 'spectator'), 0), 1) as spectator_minutes,
    round(coalesce(sum(duration_min) filter (where visitor_kind = 'visitor'), 0), 1) as visitor_minutes,
    min(started_at) filter (where visitor_kind = 'spectator') as first_spectator_at
  from game.fact_session
  group by collector_id
),
last_visit as (
  select distinct on (collector_id) collector_id, visitor_kind
  from game.fact_session
  order by collector_id, started_at desc
),
maps as (
  select collector_id, jsonb_object_agg(map_id::text, minutes) as minutes_by_map
  from (
    select collector_id, map_id, round(sum(duration_min), 1) as minutes
    from game.fact_realm_visit
    group by collector_id, map_id
  ) m
  group by collector_id
),
last_map as (
  select distinct on (collector_id) collector_id, map_id
  from game.fact_realm_visit
  order by collector_id, entered_at desc
),
paid as (
  -- The owl's first ticket: a claim of an order onto it, or a first scan (a shared or given ticket).
  select collector_id, min(occurred_at) as paid_since
  from game.fact_purchase
  where event in ('claimed', 'scanned') and collector_id is not null
  group by collector_id
),
held as (
  select collector_id, count(*) as orders, sum(net_cents) as lifetime_value_cents
  from game.v_purchase
  where collector_id is not null
  group by collector_id
),
notes as (
  select collector_id, count(*) as feedback_notes
  from game.feedback
  group by collector_id
)
select o.collector_id,
  l.owl_type,
  l.color,
  l.first_seen,
  l.last_seen,
  coalesce(l.sessions, 0) as visits,
  coalesce(l.total_minutes, 0) as total_minutes,
  coalesce(l.minutes_by_realm, '{}'::jsonb) as minutes_by_realm,
  coalesce(m.minutes_by_map, '{}'::jsonb) as minutes_by_map,
  lm.map_id as last_map_id,
  coalesce(l.collectibles_total, 0) as collectibles_total,
  coalesce(n.feedback_notes, 0) as feedback_notes,
  coalesce(v.spectator_visits, 0) as spectator_visits,
  coalesce(v.visitor_visits, 0) as visitor_visits,
  coalesce(v.spectator_minutes, 0) as spectator_minutes,
  coalesce(v.visitor_minutes, 0) as visitor_minutes,
  case when p.paid_since is not null then 'paid' else 'free' end as segment,
  case
    when cp.ticket_kind = 'annual' then 'annual'
    when cp.ticket_kind is not null then 'ticket'
    when lv.visitor_kind = 'spectator' then 'spectator'
    else 'none'
  end as current_pass,
  cp.ticket_kind as pass_ticket_kind,
  cp.valid_until as pass_expires_at,
  p.paid_since,
  case when v.first_spectator_at < p.paid_since then p.paid_since end as converted_at,
  coalesce(h.orders, 0) as orders,
  h.lifetime_value_cents
from owls o
left join game.v_player_lifetime l using (collector_id)
left join visits v using (collector_id)
left join last_visit lv using (collector_id)
left join maps m using (collector_id)
left join last_map lm using (collector_id)
left join paid p using (collector_id)
left join game.v_owl_pass cp using (collector_id)
left join held h using (collector_id)
left join notes n using (collector_id);
comment on view game.v_visitor_profile is 'Owl Park (OP-192), one row per owl, free or paid: first and last seen, visits, minutes (in all, per room, per map, as a spectator and as a visitor), the map it was last on (1 today''s park, 2 the tree), collectibles, feedback notes, segment (free or paid), current_pass (annual, ticket, spectator or none) with its kind and end, when it first held a ticket and, for a spectator first, when it converted, and the orders it holds with their value. Games played, emotes and chat are not in the park''s logs, so not here.';

-- The keepers' card, when a keepers' page reads the project (left for later): free and paid owls,
-- conversion, and minutes per room as a spectator and as a visitor.
create view game.v_keepers_card with (security_invoker = true) as
with room_minutes as (
  select r.realm, s.visitor_kind, round(sum(r.duration_min), 1) as minutes
  from game.fact_realm_visit r
  join game.fact_session s using (session_id)
  where s.visitor_kind is not null
  group by r.realm, s.visitor_kind
)
select count(*) as owls,
  count(*) filter (where p.segment = 'free') as free_owls,
  count(*) filter (where p.segment = 'paid') as paid_owls,
  count(*) filter (where p.segment = 'free' and p.last_seen >= now() - interval '7 days') as free_owls_7d,
  count(*) filter (where p.segment = 'paid' and p.last_seen >= now() - interval '7 days') as paid_owls_7d,
  count(*) filter (where p.spectator_visits > 0) as owls_ever_spectators,
  count(*) filter (where p.converted_at is not null) as converted_owls,
  round(count(*) filter (where p.converted_at is not null)::numeric / nullif(count(*) filter (where p.spectator_visits > 0), 0), 3) as conversion_rate,
  count(*) filter (where p.current_pass = 'annual') as annual_pass_owls,
  (select coalesce(jsonb_object_agg(realm, minutes), '{}'::jsonb) from room_minutes where visitor_kind = 'spectator') as spectator_minutes_by_realm,
  (select coalesce(jsonb_object_agg(realm, minutes), '{}'::jsonb) from room_minutes where visitor_kind = 'visitor') as visitor_minutes_by_realm
from game.v_visitor_profile p;
comment on view game.v_keepers_card is 'Owl Park (OP-192), one row: owls free and paid (in all and seen in the last 7 days), owls that were ever spectators and those of them that went on to a ticket (conversion_rate), annual pass holders, and minutes per room spent as a spectator and as a full visitor.';

revoke all on game.v_purchase, game.v_owl_pass, game.v_visitor_profile, game.v_keepers_card from public, anon, authenticated;

-- Free owls who never come back are forgotten after a while (OP-192: 90 days unless the owner says
-- otherwise): their visits, rooms, collections and versions. An owl that ever held a ticket is kept,
-- and so are notes (game.feedback), which the morning run has filed. Not scheduled here: the owner
-- runs it, or schedules it, on their own word.
create function game.forget_free_owls(keep interval default interval '90 days') returns integer
language plpgsql
set search_path = ''
as $$
declare
  owls text[];
begin
  if keep < interval '30 days' then
    raise exception 'keep free owls at least 30 days';
  end if;
  select coalesce(array_agg(l.collector_id), '{}') into owls
  from game.v_player_lifetime l
  where coalesce(l.last_seen, l.first_seen) < now() - keep
    and not exists (select 1 from game.fact_purchase p where p.collector_id = l.collector_id);
  delete from game.fact_realm_visit where collector_id = any (owls);
  delete from game.fact_session where collector_id = any (owls);
  delete from game.collect_log where collector_id = any (owls);
  delete from game.dim_player where collector_id = any (owls);
  return cardinality(owls);
end
$$;
comment on function game.forget_free_owls(interval) is 'Owl Park (OP-192): forgets owls that never held a ticket and were last seen longer ago than keep (90 days by default, never under 30): their visits, rooms, collections and versions. Returns how many owls. Run by the owner, never the function.';
revoke all on function game.forget_free_owls(interval) from public, anon, authenticated;

-- ---------- 3. the owner's contacts ----------

create schema if not exists contacts;
comment on schema contacts is 'Owl Park (OP-192): the owner''s buyers, apart from the park''s anonymous game schema. Read only by the owner''s own queries.';
revoke all on schema contacts from public, anon, authenticated;

-- One row per buyer, by email (the store keys its customers by email too).
create table contacts.contact (
  contact_id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 254),
  shopify_customer_id text check (shopify_customer_id ~ '^\d{1,20}$'),
  first_order_at timestamptz not null,
  last_order_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table contacts.contact is 'Owl Park (OP-192): one row per buyer of tickets: the order email and the store''s customer id (null for a guest checkout, or a store that will not say). Never in a game table.';

-- One row per paid store order, under its buyer, with the salted key the game tables know it by.
create table contacts.contact_order (
  shopify_order_id text primary key check (shopify_order_id ~ '^\d{1,20}$'),
  order_key uuid not null unique,
  contact_id bigint not null references contacts.contact (contact_id),
  ordered_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table contacts.contact_order is 'Owl Park (OP-192): one row per paid ticket order: the store''s order number, its buyer, and order_key, the key game.fact_purchase and game.v_purchase know it by.';
create index contact_order_contact_idx on contacts.contact_order (contact_id, ordered_at);

-- Buyers applied in order: each kept by email (its customer id filled in once the store says it), and
-- each order once. The owl-park-log function's only way in.
create function contacts.add_contacts(rows jsonb) returns integer
language plpgsql
set search_path = ''
as $$
declare
  r record;
  who bigint;
  n integer;
  kept integer := 0;
begin
  for r in
    select * from jsonb_to_recordset(rows) as x(shopify_order_id text, order_key uuid, email text, shopify_customer_id text, ordered_at timestamptz)
    order by ordered_at, shopify_order_id
  loop
    insert into contacts.contact as c (email, shopify_customer_id, first_order_at, last_order_at)
    values (r.email, r.shopify_customer_id, r.ordered_at, r.ordered_at)
    on conflict (email) do update set
      shopify_customer_id = coalesce(excluded.shopify_customer_id, c.shopify_customer_id),
      first_order_at = least(c.first_order_at, excluded.first_order_at),
      last_order_at = greatest(c.last_order_at, excluded.last_order_at),
      updated_at = now()
    returning c.contact_id into who;
    insert into contacts.contact_order (shopify_order_id, order_key, contact_id, ordered_at)
    values (r.shopify_order_id, r.order_key, who, r.ordered_at)
    on conflict do nothing;
    get diagnostics n = row_count;
    kept := kept + n;
  end loop;
  return kept;
end
$$;
comment on function contacts.add_contacts(jsonb) is 'Owl Park (OP-192): keeps paid orders'' buyers in contacts.contact and their orders in contacts.contact_order, each order once (the owl-park-log Edge Function''s only way in).';

-- Per buyer and owl: an owl is tied to a buyer only by a ticket of the buyer's order it claimed or scanned.
create view contacts.v_contact_owl with (security_invoker = true) as
select c.contact_id,
  c.email,
  c.shopify_customer_id,
  e.collector_id,
  min(e.occurred_at) as linked_at,
  p.segment,
  p.current_pass,
  p.pass_ticket_kind,
  p.pass_expires_at,
  p.first_seen,
  p.last_seen,
  p.visits,
  p.total_minutes,
  p.minutes_by_realm,
  p.last_map_id,
  p.converted_at
from contacts.contact c
join contacts.contact_order co on co.contact_id = c.contact_id
join game.fact_purchase e on e.order_key = co.order_key and e.event in ('claimed', 'scanned')
left join game.v_visitor_profile p on p.collector_id = e.collector_id
group by c.contact_id, c.email, c.shopify_customer_id, e.collector_id, p.segment, p.current_pass, p.pass_ticket_kind, p.pass_expires_at, p.first_seen, p.last_seen, p.visits, p.total_minutes, p.minutes_by_realm, p.last_map_id, p.converted_at;
comment on view contacts.v_contact_owl is 'Owl Park (OP-192), per buyer and owl: the owls that claimed or scanned a ticket of the buyer''s orders, with each owl''s profile (game.v_visitor_profile).';

-- Per buyer's order: the purchase history.
create view contacts.v_contact_order with (security_invoker = true) as
select c.contact_id,
  c.email,
  co.shopify_order_id,
  co.ordered_at,
  p.product,
  p.ticket_kinds,
  p.tickets,
  p.upsell,
  p.amount_cents,
  p.refunded_cents,
  p.net_cents,
  p.status,
  p.collector_id,
  p.claimed_at,
  p.first_scan_at
from contacts.contact c
join contacts.contact_order co on co.contact_id = c.contact_id
left join game.v_purchase p on p.order_key = co.order_key;
comment on view contacts.v_contact_order is 'Owl Park (OP-192), per buyer''s order: the store''s order number, what it was, what it came to and what went back, its status, and the owl that holds it.';

-- Per buyer: their orders, what they spent, and their owls.
create view contacts.v_contact with (security_invoker = true) as
select c.contact_id,
  c.email,
  c.shopify_customer_id,
  c.first_order_at,
  c.last_order_at,
  (select count(*) from contacts.v_contact_order o where o.contact_id = c.contact_id) as orders,
  (select sum(o.net_cents) from contacts.v_contact_order o where o.contact_id = c.contact_id) as net_cents,
  (select count(distinct w.collector_id) from contacts.v_contact_owl w where w.contact_id = c.contact_id) as owls,
  (select w.current_pass from contacts.v_contact_owl w where w.contact_id = c.contact_id
    order by case w.current_pass when 'annual' then 0 when 'ticket' then 1 when 'spectator' then 2 else 3 end limit 1) as best_current_pass,
  (select max(w.last_seen) from contacts.v_contact_owl w where w.contact_id = c.contact_id) as last_seen
from contacts.contact c;
comment on view contacts.v_contact is 'Owl Park (OP-192), per buyer: orders, net spend in cents, owls tied to them, the best pass any of those owls holds now, and when one was last seen.';

-- Nothing in the public API reaches these: row level security on with no policies, and no grants.
alter table contacts.contact enable row level security;
alter table contacts.contact_order enable row level security;
revoke all on all tables in schema contacts from public, anon, authenticated;
revoke all on all sequences in schema contacts from public, anon, authenticated;
revoke all on function contacts.add_contacts(jsonb) from public, anon, authenticated;
