-- Time per realm (OP-113) in the fraud pipeline's Supabase project, under the player stats' visits
-- (sql/players.sql, applied first). Applied once there as the migration `game_realm_visits`; kept here
-- so it can be read and made again. The function never runs it.
--
-- A row for each room a visit went into, from the owl's hello there until it went on: into the next
-- room, into the same room again after its line dropped (a new row, entry_source reconnect), or the
-- end of the visit. A visit's rooms follow one another without a gap or an overlap, so their minutes
-- add up to the visit's. The hub and the nests are rooms here too, told apart by realm_kind. Anonymous
-- like the rest: the owl is its collector id's salted hash, the place a room's neutral id (every nest
-- is `nest`), and nothing else about the visit is kept.

create table game.fact_realm_visit (
  visit_id uuid primary key,
  session_id uuid not null references game.fact_session (session_id),
  player_sk bigint references game.dim_player (player_sk),
  collector_id text not null check (collector_id ~ '^[0-9a-f]{64}$'),
  realm text not null check (realm ~ '^[a-z]{1,20}$'),
  realm_kind text not null check (realm_kind in ('realm', 'hub', 'nest')),
  entered_at timestamptz not null,
  exited_at timestamptz not null check (exited_at >= entered_at),
  duration_min numeric generated always as (round((extract(epoch from (exited_at - entered_at)) / 60.0)::numeric, 2)) stored,
  entry_source text not null check (entry_source in ('walked', 'spawn', 'deep_link', 'reconnect')),
  collectibles_gained integer not null default 0 check (collectibles_gained >= 0),
  created_at timestamptz not null default now()
);
comment on table game.fact_realm_visit is 'Owl Park (OP-113): one row per room a visit went into, from entering until the next room, a reconnect or the visit''s end. A visit''s rows are contiguous, so their durations add up to game.fact_session.duration_min. Anonymous: collector_id is a salted hash.';
comment on column game.fact_realm_visit.player_sk is 'The owl''s version when it came into the room.';
comment on column game.fact_realm_visit.realm is 'The room''s neutral id (grove, market, arcade, glass, hub, lobby, homes), or nest for any owl''s nest.';
comment on column game.fact_realm_visit.realm_kind is 'realm (the realms; the arcade is the market''s), hub (the lobby, the hub, the street of nests) or nest.';
comment on column game.fact_realm_visit.entry_source is 'walked (from another room of the visit: a door, the way out, the turnstile, Go home), spawn (the visit''s first room from Play: the owl''s own nest, or the lobby), deep_link (the visit''s first room named by the page''s address), reconnect (the same room again after the line dropped).';
comment on column game.fact_realm_visit.collectibles_gained is 'Collectibles that came while the owl was in the room (a share of game.fact_session.collectibles_gained).';
create index fact_realm_visit_session_idx on game.fact_realm_visit (session_id, entered_at);
create index fact_realm_visit_collector_idx on game.fact_realm_visit (collector_id, entered_at);
create index fact_realm_visit_realm_idx on game.fact_realm_visit (realm, entered_at);

-- Nothing in the public API reaches it: row level security on with no policies, and no grants.
alter table game.fact_realm_visit enable row level security;
revoke all on game.fact_realm_visit from public, anon, authenticated;

-- A stay: an owl's time in a room, one row or a run of rows joined by reconnects, since a line that
-- dropped and came back in is not a new arrival. The views below count stays, so a flaky connection
-- never shows as many short visits, or as owls leaving.
create view game.v_realm_stay with (security_invoker = true) as
with numbered as (
  select v.*,
    count(*) filter (where v.entry_source <> 'reconnect') over (partition by v.session_id order by v.entered_at, v.visit_id) as stay_no
  from game.fact_realm_visit v
)
select session_id,
  stay_no,
  min(collector_id) as collector_id,
  min(realm) as realm,
  min(realm_kind) as realm_kind,
  min(entered_at) as entered_at,
  max(exited_at) as exited_at,
  sum(extract(epoch from (exited_at - entered_at)))::numeric as seconds,
  count(*) - 1 as reconnects,
  sum(collectibles_gained) as collectibles_gained
from numbered
group by session_id, stay_no;
comment on view game.v_realm_stay is 'Owl Park (OP-113): game.fact_realm_visit with each run of reconnects joined into the stay it continued.';

-- Per room: which one holds attention and which one owls leave.
create view game.v_realm_time with (security_invoker = true) as
with firsts as (
  select distinct on (collector_id, realm) collector_id, realm, seconds
  from game.v_realm_stay
  order by collector_id, realm, entered_at
)
select s.realm,
  min(s.realm_kind) as realm_kind,
  count(*) as visits,
  count(distinct s.collector_id) as unique_players,
  round(sum(s.seconds) / 60.0, 1) as total_minutes,
  round((percentile_cont(0.5) within group (order by s.seconds) / 60.0)::numeric, 2) as median_minutes,
  (select round((percentile_cont(0.5) within group (order by f.seconds) / 60.0)::numeric, 2) from firsts f where f.realm = s.realm) as median_first_visit_min,
  round(avg(case when s.seconds < 60 then 1.0 else 0.0 end), 3) as bounce_rate,
  sum(s.reconnects) as reconnects,
  sum(s.collectibles_gained) as collectibles_gained,
  round(sum(s.collectibles_gained) / nullif(sum(s.seconds) / 60.0, 0), 3) as collectibles_per_minute
from game.v_realm_stay s
group by s.realm;
comment on view game.v_realm_time is 'Owl Park (OP-113), per room: visits (stays), unique owls, total and median minutes, the median length of each owl''s first visit, bounce_rate (the share of visits under 60 s), reconnects, and collectibles per minute.';

-- Per owl and room: where each owl spends its time.
create view game.v_player_realm with (security_invoker = true) as
select s.collector_id,
  s.realm,
  min(s.realm_kind) as realm_kind,
  count(*) as visits,
  round(sum(s.seconds) / 60.0, 1) as total_minutes,
  max(s.exited_at) as last_visited,
  round(100.0 * sum(s.seconds) / nullif(sum(sum(s.seconds)) over (partition by s.collector_id), 0), 1) as pct_of_playtime
from game.v_realm_stay s
group by s.collector_id, s.realm;
comment on view game.v_player_realm is 'Owl Park (OP-113), per owl and room: visits (stays), minutes, when last there, and the share of the owl''s playtime.';

-- The lifetime view as players.sql made it, with each owl's minutes per room added at the end.
create or replace view game.v_player_lifetime with (security_invoker = true) as
select d.collector_id,
  d.player_sk,
  d.owl_type,
  d.color,
  v.versions_count,
  least(s.first_seen, v.first_version) as first_seen,
  greatest(s.last_seen, v.last_version) as last_seen,
  coalesce(s.sessions, 0) as sessions,
  coalesce(s.total_minutes, 0) as total_minutes,
  s.avg_session_min,
  coalesce(c.collectibles_total, 0) as collectibles_total,
  null::integer as sets_completed,
  null::integer as purchases_count,
  null::numeric as lifetime_value,
  coalesce(r.minutes_by_realm, '{}'::jsonb) as minutes_by_realm
from game.dim_player d
join (
  select collector_id, count(*) as versions_count, min(valid_from) as first_version, max(valid_from) as last_version
  from game.dim_player
  group by collector_id
) v using (collector_id)
left join (
  select collector_id, min(started_at) as first_seen, max(ended_at) as last_seen, count(*) as sessions,
    round(sum(duration_min), 1) as total_minutes, round(avg(duration_min), 1) as avg_session_min
  from game.fact_session
  group by collector_id
) s using (collector_id)
left join (
  select collector_id, count(*) filter (where collectible_id not like 'furniture:%') as collectibles_total
  from game.collect_log
  group by collector_id
) c using (collector_id)
left join (
  select collector_id, jsonb_object_agg(realm, total_minutes) as minutes_by_realm
  from game.v_player_realm
  group by collector_id
) r using (collector_id)
where d.is_current;
comment on view game.v_player_lifetime is 'Owl Park, per owl as it is now (OP-111): first and last seen, visits, minutes played, versions, collectibles, and (OP-113) minutes_by_realm, its minutes in each room. sets_completed waits on OP-110; purchases_count and lifetime_value on the store and the ticket gate (OP-024, OP-010).';

revoke all on game.v_realm_stay, game.v_realm_time, game.v_player_realm, game.v_player_lifetime from public, anon, authenticated;
