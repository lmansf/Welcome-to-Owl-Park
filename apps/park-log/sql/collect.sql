-- The collection log (OP-107) in the fraud pipeline's Supabase project, beside the park's orders in
-- the `game` schema (apps/score-endpoint's sql/game.sql made the schema). Applied once there as the
-- migration `game_collect_log`; kept here so it can be read and made again. The function never runs it.
--
-- One row per collectible an owl comes by, written only by the owl-park-log Edge Function for the
-- park's Worker. Anonymous by construction: hashes in place of the owl and its visit, the device as
-- phone or desktop, the place as a room's neutral id. Nothing here names a person, an order or a ticket.
create schema if not exists game;

create table game.collect_log (
  event_id uuid primary key,
  collector_id text not null check (collector_id ~ '^[0-9a-f]{64}$'),
  collectible_id text not null,
  collectible_type text not null check (collectible_type in ('quest', 'shop', 'gift', 'seasonal', 'starter', 'grant', 'purchase', 'find')),
  realm text,
  acquired_at timestamptz not null,
  session_id uuid,
  device_class text check (device_class in ('phone', 'desktop')),
  first_entry_at timestamptz,
  backfill boolean not null default false,
  created_at timestamptz not null default now(),
  -- The grain: one owl coming by one collectible, once (nothing leaves a collection today).
  unique (collector_id, collectible_id)
);
comment on table game.collect_log is 'Owl Park: one row per collectible an owl comes by (OP-107), written by the owl-park-log Edge Function for the park''s Worker. Anonymous: no field names a person, an order or a ticket.';
comment on column game.collect_log.event_id is 'One id per collector and collectible (a salted hash in the shape of a uuid): the same acquisition sent twice lands once.';
comment on column game.collect_log.collector_id is 'The owl''s collector id as a salted SHA-256 hash (FRAUD_HASH_SALT, the fraud link''s salt), never the id itself.';
comment on column game.collect_log.collectible_id is 'A collection variant (witch-hat~3; an emote is its bare id, hoot) or a piece of nest furniture (furniture:rug).';
comment on column game.collect_log.collectible_type is 'How it came: quest, shop, gift (the shop''s or the nest''s daily gift), seasonal (a present from the park), starter, grant (the keepers), purchase (the store), find (retired hiding spots).';
comment on column game.collect_log.realm is 'The room it came in, by its neutral id (hub, grove, market, arcade, lobby, homes, nest for every owl''s nest); null when not in a room (the shop, the gifts, the keepers).';
comment on column game.collect_log.acquired_at is 'When the owl first owned it (UTC).';
comment on column game.collect_log.session_id is 'The visit (one per page load) as a salted hash in the shape of a uuid; null for backfill and the keepers'' grants.';
comment on column game.collect_log.device_class is 'phone (a phone or tablet) or desktop, from the browser''s own words; null when unknown.';
comment on column game.collect_log.first_entry_at is 'When the owl''s collection began (its first visit), copied in so pace is one subtraction.';
comment on column game.collect_log.backfill is 'True for rows written afterwards from the collections as they stood (OP-107''s backfill): their time is the real acquisition time, with no visit, room or device.';
comment on column game.collect_log.created_at is 'When the row was loaded (not when it happened).';

create index collect_log_collector_idx on game.collect_log (collector_id, acquired_at);
create index collect_log_collectible_idx on game.collect_log (collectible_id);

-- Every collectible there is, sent by the park whenever a deploy changes it: what "% collected" counts.
create table game.collectible_catalogue (
  collectible_id text primary key,
  kind text not null,
  rarity text,
  realm text,
  in_catalogue boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on table game.collectible_catalogue is 'Owl Park: every collectible there is (the collection''s variants and the nest''s furniture), sent by the park''s Worker whenever a deploy changes it. One no longer in the park stays, with in_catalogue false.';
comment on column game.collectible_catalogue.kind is 'wear, pet, fx, emote or furniture.';
comment on column game.collectible_catalogue.realm is 'Where it can be had, by a room''s neutral id; null for anywhere in the park, which is every collectible today.';

-- Nothing in the public API reaches these: row level security on with no policies, and no grants.
alter table game.collect_log enable row level security;
alter table game.collectible_catalogue enable row level security;
revoke all on all tables in schema game from public, anon, authenticated;

-- Per owl. "Collected" counts the collection's variants, as the park's owl builder does ("N of 1,180
-- collected"); furniture is counted apart. Pace counts what the owl earned, not what every owl is
-- given (the starter pack, the park's presents). The share is of the collectibles in the park's
-- catalogue that can be had anywhere in the park or in a room the owl has collected in, so a closed
-- realm's never count against it (OP-111's sessions will say which rooms an owl has entered).
create view game.collect_player_stats with (security_invoker = true) as
with tagged as (
  select l.*,
    coalesce(c.kind, case when l.collectible_id like 'furniture:%' then 'furniture' else 'unknown' end) as kind,
    l.collectible_type not in ('starter', 'seasonal') as earned
  from game.collect_log l
  left join game.collectible_catalogue c using (collectible_id)
),
earned_in_order as (
  select collector_id, acquired_at, row_number() over (partition by collector_id order by acquired_at, event_id) as n
  from tagged
  where earned and kind <> 'furniture'
),
per_owl as (
  select collector_id,
    min(first_entry_at) as first_entry_at,
    max(acquired_at) as last_acquired_at,
    count(*) filter (where kind <> 'furniture') as total_collected,
    count(*) filter (where kind <> 'furniture' and earned) as earned_collected,
    count(*) filter (where kind = 'furniture') as furniture_collected,
    max(acquired_at) filter (where kind <> 'furniture' and earned) as last_earned_at,
    count(distinct session_id) as sessions,
    coalesce(array_agg(distinct realm) filter (where realm is not null), '{}') as realms
  from tagged
  group by collector_id
)
select p.collector_id,
  p.first_entry_at,
  p.last_acquired_at,
  p.total_collected,
  round(100.0 * o.n / nullif(d.n, 0), 2) as pct_collected,
  d.n as collectibles_there,
  p.earned_collected,
  p.furniture_collected,
  p.sessions,
  round((extract(epoch from (f.first_at - p.first_entry_at)) / 60.0)::numeric, 1) as minutes_to_first,
  round((extract(epoch from (t.tenth_at - p.first_entry_at)) / 60.0)::numeric, 1) as minutes_to_10,
  -- Earned collectibles an hour, from the first visit to the last one earned (calendar time until
  -- OP-111's sessions give the time actually played).
  case when p.earned_collected > 0 then round((p.earned_collected / greatest(extract(epoch from (p.last_earned_at - p.first_entry_at)) / 3600.0, 1.0 / 60))::numeric, 2) end as collectibles_per_hour
from per_owl p
left join lateral (select min(e.acquired_at) as first_at from earned_in_order e where e.collector_id = p.collector_id) f on true
left join lateral (select e.acquired_at as tenth_at from earned_in_order e where e.collector_id = p.collector_id and e.n = 10) t on true
cross join lateral (
  select count(*) as n from game.collectible_catalogue c
  where c.in_catalogue and c.kind <> 'furniture' and (c.realm is null or c.realm = any (p.realms))
) d
cross join lateral (
  select count(*) as n from tagged x join game.collectible_catalogue c using (collectible_id)
  where x.collector_id = p.collector_id and c.in_catalogue and c.kind <> 'furniture' and (c.realm is null or c.realm = any (p.realms))
) o;
comment on view game.collect_player_stats is 'Owl Park, per owl (OP-107): total and share collected, furniture apart, and pace (minutes from the first visit to the first and the tenth collectible earned, and earned collectibles an hour).';

-- Per collectible: how many owls have it, and how long after their first visit owls earned it (a too
-- hard or too easy signal). Collectibles no owl has yet are listed too, with 0.
create view game.collect_item_stats with (security_invoker = true) as
select c.collectible_id,
  c.kind,
  c.rarity,
  c.realm,
  c.in_catalogue,
  count(l.event_id) as owls_with_it,
  count(l.event_id) filter (where l.collectible_type not in ('starter', 'seasonal')) as owls_earned_it,
  round(
    (percentile_cont(0.5) within group (order by (extract(epoch from (l.acquired_at - l.first_entry_at)) / 60.0)::float8)
      filter (where l.collectible_type not in ('starter', 'seasonal') and l.first_entry_at is not null))::numeric,
    1
  ) as median_minutes_to_acquire,
  min(l.acquired_at) as first_acquired_at,
  max(l.acquired_at) as last_acquired_at
from game.collectible_catalogue c
left join game.collect_log l using (collectible_id)
group by c.collectible_id, c.kind, c.rarity, c.realm, c.in_catalogue;
comment on view game.collect_item_stats is 'Owl Park, per collectible (OP-107): owls that have it and that earned it, and the median minutes from an owl''s first visit to earning it.';

revoke all on game.collect_player_stats, game.collect_item_stats from public, anon, authenticated;
