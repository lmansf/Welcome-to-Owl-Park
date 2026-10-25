-- The player stats (OP-111) in the fraud pipeline's Supabase project, beside the collection log
-- (sql/collect.sql, applied first). Applied once there as the migration `game_player_stats`; kept here
-- so it can be read and made again. The function never runs it.
--
-- The park side of a small star: owls' versions (a type 2 dimension) and their visits. Anonymous like
-- the collection log: the owl is its collector id's salted hash, its kind is the park's fixed list of
-- species, its colour a hex value, and a visit holds times and counts. Purchases and the one table that
-- may tie a ticket to an owl (Logan only) come with the store and the ticket gate (OP-024, OP-010).

-- One row per version of an owl: a new one whenever its kind or colour changes.
create table game.dim_player (
  player_sk bigint generated always as identity primary key,
  event_id uuid not null unique,
  collector_id text not null check (collector_id ~ '^[0-9a-f]{64}$'),
  owl_type text not null check (owl_type in ('great-horned', 'barn', 'burrowing', 'snowy', 'screech')),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  valid_from timestamptz not null,
  valid_to timestamptz,
  is_current boolean not null default true,
  change_reason text not null check (change_reason in ('first', 'chosen', 'quest', 'seasonal')),
  created_at timestamptz not null default now()
);
comment on table game.dim_player is 'Owl Park (OP-111): one row per version of an owl, its kind and body colour from valid_from to valid_to (null while current). Anonymous: collector_id is a salted hash.';
comment on column game.dim_player.owl_type is 'The park''s fixed list of species.';
comment on column game.dim_player.color is 'The owl''s body colour, #rrggbb.';
comment on column game.dim_player.change_reason is 'first (its first visit), chosen (it chose another kind or colour); quest and seasonal for later.';
-- At most one current version an owl.
create unique index dim_player_current_idx on game.dim_player (collector_id) where is_current;
create index dim_player_collector_idx on game.dim_player (collector_id, valid_from);

-- Versions applied in order, one by one: each closes its owl's current version and opens its own,
-- unless the event is here already, the owl already looks so, or a later version is (one sent late).
create function game.add_player_versions(rows jsonb) returns integer
language plpgsql
set search_path = ''
as $$
declare
  r record;
  cur record;
  kept integer := 0;
begin
  for r in
    select * from jsonb_to_recordset(rows) as x(event_id uuid, collector_id text, owl_type text, color text, changed_at timestamptz, change_reason text)
    order by changed_at, event_id
  loop
    if exists (select 1 from game.dim_player d where d.event_id = r.event_id) then
      continue;
    end if;
    select d.player_sk, d.owl_type, d.color, d.valid_from into cur from game.dim_player d where d.collector_id = r.collector_id and d.is_current;
    if found then
      if cur.owl_type = r.owl_type and cur.color = r.color then
        continue;
      end if;
      if cur.valid_from > r.changed_at then
        continue;
      end if;
      update game.dim_player set valid_to = r.changed_at, is_current = false where player_sk = cur.player_sk;
    end if;
    insert into game.dim_player (event_id, collector_id, owl_type, color, valid_from, change_reason)
    values (r.event_id, r.collector_id, r.owl_type, r.color, r.changed_at, r.change_reason);
    kept := kept + 1;
  end loop;
  return kept;
end
$$;
comment on function game.add_player_versions(jsonb) is 'Owl Park (OP-111): applies versions of owls to game.dim_player in order (the owl-park-log Edge Function''s only way in).';

-- One row per visit (a page load), once it is over.
create table game.fact_session (
  session_id uuid primary key,
  player_sk bigint references game.dim_player (player_sk),
  collector_id text not null check (collector_id ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  duration_min numeric generated always as (round((extract(epoch from (ended_at - started_at)) / 60.0)::numeric, 1)) stored,
  device_class text check (device_class in ('phone', 'desktop')),
  realms_entered integer not null default 0,
  collectibles_gained integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table game.fact_session is 'Owl Park (OP-111): one row per visit (a page load) once it is over. ended_at is when the visit was last seen: its last socket''s close, or its last minute heartbeat if the tab died. session_id matches game.collect_log.session_id.';
comment on column game.fact_session.player_sk is 'The owl''s version when the visit began.';
comment on column game.fact_session.realms_entered is 'Rooms the visit went into (neutral ids, counted).';
comment on column game.fact_session.collectibles_gained is 'Collectibles that came in the visit (game.collect_log rows with its session_id).';
create index fact_session_collector_idx on game.fact_session (collector_id, started_at);

-- Nothing in the public API reaches these: row level security on with no policies, and no grants.
alter table game.dim_player enable row level security;
alter table game.fact_session enable row level security;
revoke all on all tables in schema game from public, anon, authenticated;
revoke all on all sequences in schema game from public, anon, authenticated;
revoke all on function game.add_player_versions(jsonb) from public, anon, authenticated;

-- Per owl as it is now: when it was first and last seen, its visits and time, its versions, and what
-- it collected. Sets (OP-110) and purchases (through the ticket gate's table, OP-010) come later.
create view game.v_player_lifetime with (security_invoker = true) as
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
  null::numeric as lifetime_value
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
where d.is_current;
comment on view game.v_player_lifetime is 'Owl Park, per owl as it is now (OP-111): first and last seen, visits, minutes played, versions, collectibles. sets_completed waits on OP-110; purchases_count and lifetime_value on the store and the ticket gate (OP-024, OP-010).';

revoke all on game.v_player_lifetime from public, anon, authenticated;
