-- Room stays (OP-265): which room each owl is in now, and every room it was in, from when to when
-- and why it left. Applied once in the fraud pipeline's Supabase project as the migration
-- `game_room_stays`, after `game_visitor_profiles` (sql/profiles.sql), and before the owl-park-log
-- function and the Worker that send `room_stay` go live; kept here so it can be read and made again.
-- The function never runs it.
--
-- A type 2 history kept live: one row per owl's stay in one room. The park sends an `enter` when an
-- owl comes into a room and a `leave` when it goes, so the open row (no `left_at` yet) is the room the
-- owl is in now. game.fact_realm_visit (sql/realms.sql) keeps the same rooms only once a visit is
-- over, with no reason the owl left; this table is the live one, and its rows go after 90 days.
--
-- Why an owl left (`exit_reason`) takes the place of a log-off flag:
--   moved           it went into another room of the visit (a door, the turnstile, the map)
--   logoff          the page closed its connection (closed or left the tab) and the owl did not come
--                   back within the visit's three-minute grace
--   timeout         its line dropped or went quiet and did not come back within the grace
--   server_restart  the park's nightly restart (4 AM Eastern) sent it to the home screen
-- A dropped line that comes back into the same room within the grace continues the stay: no new row.
--
-- What a row never holds: a name, email, age, ticket, order, address or browser, or where in the room
-- the owl stood. The owl is its collector id's salted hash (the same as every game row, free guests
-- included), the visit its session's salted uuid, the place a room's neutral id.

create table game.room_stay (
  stay_id uuid primary key,
  session_id uuid not null,
  collector_id text not null check (collector_id ~ '^[0-9a-f]{64}$'),
  realm text not null check (realm ~ '^[a-z][a-z0-9-]{0,19}$'),
  realm_kind text not null check (realm_kind in ('realm', 'hub', 'nest')),
  map_id smallint not null default 1 check (map_id in (1, 2)),
  entered_at timestamptz not null,
  left_at timestamptz check (left_at >= entered_at),
  entry_source text not null check (entry_source in ('walked', 'spawn', 'deep_link', 'travel')),
  exit_reason text check (exit_reason in ('moved', 'logoff', 'timeout', 'server_restart')),
  created_at timestamptz not null default now(),
  -- Open (both null) or closed (both set): never one without the other.
  constraint room_stay_closed_check check ((left_at is null) = (exit_reason is null))
);
comment on table game.room_stay is 'Owl Park (OP-265): one row per owl''s stay in one room, sent live. The open row (left_at null) is the owl''s room now. Anonymous: collector_id is a salted hash, no position in the room. Rows older than 90 days roll into game.room_stay_daily and are deleted (game.roll_up_room_stays).';
comment on column game.room_stay.session_id is 'The visit (one page load), as game.fact_session.session_id. An owl with two tabs open is two visits, so two open rows.';
comment on column game.room_stay.realm is 'The room''s neutral id (grove, market, l1, l5-street, ...), or nest for any owl''s nest.';
comment on column game.room_stay.map_id is 'The park the owl was walking when it came in: 1 today''s park, 2 the tree. A room both share takes the park of the room before it in the visit.';
comment on column game.room_stay.entry_source is 'walked (from another room of the visit), spawn (the visit''s first room from Play, or back in after the restart), deep_link (the visit''s first room named by the page''s address), travel (the Menu''s map).';
comment on column game.room_stay.exit_reason is 'moved (another room), logoff (the page closed the connection and the owl did not come back), timeout (the line dropped or went quiet), server_restart (the nightly restart). Null while the owl is still there.';

-- One open row per visit: a visit is in one room at a time.
create unique index room_stay_open_idx on game.room_stay (session_id) where left_at is null;
create index room_stay_collector_idx on game.room_stay (collector_id, entered_at);
create index room_stay_realm_idx on game.room_stay (map_id, realm, entered_at);
create index room_stay_entered_idx on game.room_stay (entered_at);

-- Nothing in the public API reaches it: row level security on with no policies, and no grants. Only
-- the function's own connection (the schema's owner) and the owner's queries read it; no player can.
alter table game.room_stay enable row level security;
revoke all on game.room_stay from public, anon, authenticated;

-- What stays after 90 days: counts per day (Eastern), park and room, and nothing about any one owl.
create table game.room_stay_daily (
  day date not null,
  map_id smallint not null check (map_id in (1, 2)),
  realm text not null check (realm ~ '^[a-z][a-z0-9-]{0,19}$'),
  realm_kind text not null check (realm_kind in ('realm', 'hub', 'nest')),
  stays integer not null check (stays >= 0),
  owls integer not null check (owls >= 0),
  minutes numeric not null check (minutes >= 0),
  exits_moved integer not null default 0,
  exits_logoff integer not null default 0,
  exits_timeout integer not null default 0,
  exits_server_restart integer not null default 0,
  primary key (day, map_id, realm)
);
comment on table game.room_stay_daily is 'Owl Park (OP-265): game.room_stay rolled up per day (America/New_York), park and room once its rows are 90 days old: stays, distinct owls, minutes and exits by reason. Holds no collector or session.';
alter table game.room_stay_daily enable row level security;
revoke all on game.room_stay_daily from public, anon, authenticated;

-- A batch from the park, applied in order in one transaction (the function's one call):
--   enter: {event, stay_id, session_id, collector_id, at, realm, realm_kind, map_id, entry_source}
--          a stay not here yet closes the visit's open row (moved, at this time) and opens its own;
--          one already here (a batch sent again) changes nothing.
--   leave: {event, stay_id, at, exit_reason}
--          closes the stay if it is still open; a closed or unknown one is left as it is.
-- The function checks every field before it calls this. Returns how many events changed a row.
create function game.apply_room_stays(events jsonb) returns integer
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  t timestamptz;
  changed integer := 0;
  n integer;
begin
  for e in select value from jsonb_array_elements(events) loop
    t := (e ->> 'at')::timestamptz;
    if e ->> 'event' = 'enter' then
      if exists (select 1 from game.room_stay s where s.stay_id = (e ->> 'stay_id')::uuid) then
        continue;
      end if;
      -- The leave before it went missing, or has not come: the room before this one ends here.
      update game.room_stay s set left_at = greatest(s.entered_at, t), exit_reason = 'moved'
      where s.session_id = (e ->> 'session_id')::uuid and s.left_at is null;
      insert into game.room_stay (stay_id, session_id, collector_id, realm, realm_kind, map_id, entered_at, entry_source)
      values ((e ->> 'stay_id')::uuid, (e ->> 'session_id')::uuid, e ->> 'collector_id', e ->> 'realm', e ->> 'realm_kind',
        coalesce((e ->> 'map_id')::smallint, 1), t, e ->> 'entry_source');
      changed := changed + 1;
    elsif e ->> 'event' = 'leave' then
      update game.room_stay s set left_at = greatest(s.entered_at, t), exit_reason = e ->> 'exit_reason'
      where s.stay_id = (e ->> 'stay_id')::uuid and s.left_at is null;
      get diagnostics n = row_count;
      changed := changed + n;
    end if;
  end loop;
  return changed;
end;
$$;
comment on function game.apply_room_stays(jsonb) is 'Owl Park (OP-265): applies the park''s room_stay events in order: enter closes the visit''s open stay (moved) and opens a new one; leave closes a stay. A batch sent twice changes nothing the second time.';
revoke all on function game.apply_room_stays(jsonb) from public, anon, authenticated;

-- The daily job: rows left open over a day are closed (a leave that never came: the park restarts
-- every night, so no stay is that long), then whole days older than `keep` roll into the daily
-- counts and their rows are deleted, in one transaction. Returns how many rows were rolled up.
create function game.roll_up_room_stays(keep interval default interval '90 days') returns integer
language plpgsql
set search_path = ''
as $$
declare
  cutoff timestamptz;
  rolled integer;
begin
  if keep < interval '30 days' then
    raise exception 'keep is at least 30 days';
  end if;
  update game.room_stay s
  set left_at = greatest(s.entered_at, coalesce(
      (select f.ended_at from game.fact_session f where f.session_id = s.session_id and f.ended_at >= s.entered_at),
      s.entered_at)),
    exit_reason = 'timeout'
  where s.left_at is null and s.entered_at < now() - interval '1 day';

  -- Whole days only, in the park's time zone, so a day is rolled up once and in full.
  cutoff := (date_trunc('day', (now() - keep) at time zone 'America/New_York')) at time zone 'America/New_York';
  insert into game.room_stay_daily as d (day, map_id, realm, realm_kind, stays, owls, minutes, exits_moved, exits_logoff, exits_timeout, exits_server_restart)
  select (s.entered_at at time zone 'America/New_York')::date, s.map_id, s.realm, min(s.realm_kind),
    count(*), count(distinct s.collector_id),
    round(sum(extract(epoch from (s.left_at - s.entered_at))) / 60.0, 1),
    count(*) filter (where s.exit_reason = 'moved'),
    count(*) filter (where s.exit_reason = 'logoff'),
    count(*) filter (where s.exit_reason = 'timeout'),
    count(*) filter (where s.exit_reason = 'server_restart')
  from game.room_stay s
  where s.entered_at < cutoff and s.left_at is not null
  group by 1, 2, 3
  -- A day is rolled once; should a late row of a rolled day ever come, it adds to that day.
  on conflict (day, map_id, realm) do update set
    stays = d.stays + excluded.stays,
    owls = d.owls + excluded.owls,
    minutes = d.minutes + excluded.minutes,
    exits_moved = d.exits_moved + excluded.exits_moved,
    exits_logoff = d.exits_logoff + excluded.exits_logoff,
    exits_timeout = d.exits_timeout + excluded.exits_timeout,
    exits_server_restart = d.exits_server_restart + excluded.exits_server_restart;

  delete from game.room_stay s where s.entered_at < cutoff and s.left_at is not null;
  get diagnostics rolled = row_count;
  return rolled;
end;
$$;
comment on function game.roll_up_room_stays(interval) is 'Owl Park (OP-265), daily by pg_cron: closes stays left open over a day (timeout), then rolls whole days older than keep (90 days; never under 30) into game.room_stay_daily and deletes their rows.';
revoke all on function game.roll_up_room_stays(interval) from public, anon, authenticated;

-- Where the owls are now: open stays per park and room.
create view game.v_room_occupancy_now with (security_invoker = true) as
select s.map_id, s.realm, min(s.realm_kind) as realm_kind, count(*) as owls_now, min(s.entered_at) as longest_since
from game.room_stay s
where s.left_at is null
group by s.map_id, s.realm;
comment on view game.v_room_occupancy_now is 'Owl Park (OP-265): owls in each room now (open stays), by park and room.';
revoke all on game.v_room_occupancy_now from public, anon, authenticated;

-- Every day at 05:30 Eastern in winter (10:30 UTC), after the nightly restart has closed the night's stays.
create extension if not exists pg_cron;
select cron.schedule('owl-park-room-stay-rollup', '30 10 * * *', $$select game.roll_up_room_stays()$$);
