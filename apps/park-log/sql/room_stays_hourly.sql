-- Room stays by the hour (OP-265, Logan Nov 4: "Make it hourly"): what stays of game.room_stay after
-- 90 days is counts per hour, park and room, for long-term traffic models (the daily curve, weekends,
-- holidays). Applied once as the migration `game_room_stays_hourly`, after `game_room_stays`
-- (sql/room_stays.sql). It replaces game.room_stay_daily, which never held a row (its first rollup
-- would have been 90 days out): a day's stays, minutes and exits are the sum of its hours. A day's
-- distinct owls is not; game.fact_session keeps every visit for that.
--
-- Anonymous like the daily table: no collector and no session, only counts. An hour is an hour of
-- the park's clock (America/New_York), kept as the instant it starts, so the fall-back night's two
-- 1 AMs are two rows.
--
-- Each hour is counted once and in full: a run counts every whole hour before the cutoff that is not
-- counted yet, from every stay still in the table that touches it (a stay crossing the cutoff
-- included), then deletes only the stays that ended before the cutoff. A stay crossing the cutoff
-- stays until the next run, which counts its later hours. So the distinct owls in an hour are exact.

-- Only an empty daily table goes: should one ever hold rows, the migration stops instead.
do $$
begin
  if exists (select 1 from game.room_stay_daily) then
    raise exception 'game.room_stay_daily holds rows: roll them into game.room_stay_hourly by hand first';
  end if;
end;
$$;
drop table game.room_stay_daily;

create table game.room_stay_hourly (
  hour_start timestamptz not null check (date_trunc('hour', hour_start, 'America/New_York') = hour_start),
  local_day date not null,
  local_hour smallint not null check (local_hour between 0 and 23),
  map_id smallint not null check (map_id in (1, 2)),
  realm text not null check (realm ~ '^[a-z][a-z0-9-]{0,19}$'),
  realm_kind text not null check (realm_kind in ('realm', 'hub', 'nest')),
  owls_present integer not null check (owls_present >= 0),
  owl_minutes numeric not null check (owl_minutes >= 0),
  stays_started integer not null default 0 check (stays_started >= 0),
  owls_arrived integer not null default 0 check (owls_arrived >= 0),
  exits_moved integer not null default 0 check (exits_moved >= 0),
  exits_logoff integer not null default 0 check (exits_logoff >= 0),
  exits_timeout integer not null default 0 check (exits_timeout >= 0),
  exits_server_restart integer not null default 0 check (exits_server_restart >= 0),
  primary key (hour_start, map_id, realm)
);
create index room_stay_hourly_realm_idx on game.room_stay_hourly (map_id, realm, hour_start);
comment on table game.room_stay_hourly is 'Owl Park (OP-265): game.room_stay rolled up per hour of the park''s clock (America/New_York), park and room, once its rows are 90 days old; kept for good. Holds no collector or session: owls present, owl-minutes (a stay crossing hours split between them), stays started and owls arrived in the hour, exits in the hour by reason.';
comment on column game.room_stay_hourly.hour_start is 'The instant the hour starts; local_day and local_hour say it on the park''s clock.';
comment on column game.room_stay_hourly.owls_present is 'Distinct owls in the room at any time in the hour.';
comment on column game.room_stay_hourly.owl_minutes is 'Minutes of owls in the room in the hour, summed; divided by 60 it is the hour''s average owls in the room.';
comment on column game.room_stay_hourly.stays_started is 'Stays that began in the hour (an owl coming in, or back after the restart).';
comment on column game.room_stay_hourly.owls_arrived is 'Distinct owls among the stays that began in the hour.';
alter table game.room_stay_hourly enable row level security;
revoke all on game.room_stay_hourly from public, anon, authenticated;

-- The daily job, the same name and schedule as before: rows left open over a day are closed (a leave
-- that never came: the park restarts every night, so no stay is that long), every whole hour before
-- the cutoff not yet counted is counted, and the stays that ended before the cutoff are deleted, in
-- one transaction. Returns how many rows were deleted.
create or replace function game.roll_up_room_stays(keep interval default interval '90 days') returns integer
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

  -- Midnight on the park's clock, keep ago: every hour before it is whole and over.
  cutoff := date_trunc('day', now() - keep, 'America/New_York');

  insert into game.room_stay_hourly (hour_start, local_day, local_hour, map_id, realm, realm_kind, owls_present, owl_minutes,
    stays_started, owls_arrived, exits_moved, exits_logoff, exits_timeout, exits_server_restart)
  select p.h, (p.h at time zone 'America/New_York')::date, extract(hour from p.h at time zone 'America/New_York')::smallint,
    p.map_id, p.realm, min(p.realm_kind),
    count(distinct p.collector_id) filter (where p.secs > 0 or p.entered_at = p.left_at),
    round(sum(p.secs) / 60.0, 2),
    count(*) filter (where p.starts),
    count(distinct p.collector_id) filter (where p.starts),
    count(*) filter (where p.ends and p.exit_reason = 'moved'),
    count(*) filter (where p.ends and p.exit_reason = 'logoff'),
    count(*) filter (where p.ends and p.exit_reason = 'timeout'),
    count(*) filter (where p.ends and p.exit_reason = 'server_restart')
  from (
    -- Each stay cut into the hours it touches, from the hour it began to the hour it ended.
    select h.h, s.map_id, s.realm, s.realm_kind, s.collector_id, s.entered_at, s.left_at, s.exit_reason,
      extract(epoch from (least(s.left_at, h.h + interval '1 hour') - greatest(s.entered_at, h.h))) as secs,
      h.h = date_trunc('hour', s.entered_at, 'America/New_York') as starts,
      h.h = date_trunc('hour', s.left_at, 'America/New_York') as ends
    from game.room_stay s
    cross join lateral generate_series(
      date_trunc('hour', s.entered_at, 'America/New_York'),
      date_trunc('hour', s.left_at, 'America/New_York'),
      interval '1 hour') as h(h)
    where s.left_at is not null and s.entered_at < cutoff
  ) p
  where p.h < cutoff
  group by p.h, p.map_id, p.realm
  -- An hour already counted (by a run before, from the stays then) is never counted again.
  on conflict (hour_start, map_id, realm) do nothing;

  delete from game.room_stay s where s.left_at is not null and s.left_at < cutoff;
  get diagnostics rolled = row_count;
  return rolled;
end;
$$;
comment on function game.roll_up_room_stays(interval) is 'Owl Park (OP-265), daily by pg_cron: closes stays left open over a day (timeout), counts every whole hour (America/New_York) older than keep (90 days; never under 30) into game.room_stay_hourly once, and deletes the stays that ended before it.';
revoke all on function game.roll_up_room_stays(interval) from public, anon, authenticated;

comment on table game.room_stay is 'Owl Park (OP-265): one row per owl''s stay in one room, sent live. The open row (left_at null) is the owl''s room now. Anonymous: collector_id is a salted hash, no position in the room. Rows older than 90 days roll into game.room_stay_hourly and are deleted (game.roll_up_room_stays).';
