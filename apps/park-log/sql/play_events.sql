-- Play events (OP-304, Logan Nov 8: "Start all three", for real player data: where players quit,
-- fail or get lost). Applied once in the fraud pipeline's Supabase project as the migration
-- `game_play_events`, after `game_quest_progress` (pg_cron on), and before the owl-park-log function
-- and the Worker that send `play_event` go live; kept here so it can be read and made again. The
-- function never runs it.
--
-- One table beside game.room_stay and game.quest_progress, for what those do not show:
--   game.play_event   one row per thing an owl did in play: a parkour run begun (course_start), a
--                     bench or part of it reached for the first time in the run (course_bench,
--                     course_part), a fall (course_fall, with where, to 10 px), the run cleared
--                     (course_clear, with its time), and a thing used (interact: a leaf pile, a
--                     stall, the moonbeam). Rows go 90 days after they happened.
-- A run that began and was never cleared is a quit: game.v_course_run tells which.
--
-- What a row never holds: a name, email, age, ticket, order or address. The owl is its collector
-- id's salted hash and the visit and run are salted uuids, as in every game row, so this joins
-- game.room_stay on collector_id and time, or session_id. A position is kept for a fall alone.

create table game.play_event (
  event_id uuid primary key,
  event text not null check (event in ('course_start', 'course_bench', 'course_part', 'course_fall', 'course_clear', 'interact')),
  collector_id text not null check (collector_id ~ '^[0-9a-f]{64}$'),
  session_id uuid,
  run_id uuid,
  occurred_at timestamptz not null,
  realm text check (realm ~ '^[a-z][a-z0-9-]{0,19}$'),
  course_id text check (course_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  thing text check (thing ~ '^[a-z0-9][a-z0-9-]{0,47}(:[a-z0-9][a-z0-9-]{0,63})?$'),
  pos_x integer check (pos_x between -100000 and 100000),
  pos_y integer check (pos_y between -100000 and 100000),
  ms integer check (ms between 0 and 86400000),
  practice boolean not null default false,
  created_at timestamptz not null default now(),
  constraint play_event_interact_course_check check (event = 'interact' or course_id is not null),
  constraint play_event_interact_thing_check check (event <> 'interact' or thing is not null),
  constraint play_event_fall_pos_check check (event = 'course_fall' or (pos_x is null and pos_y is null))
);
comment on table game.play_event is 'Owl Park (OP-304): one row per course step (start, bench, part, fall, clear) or thing used, sent live by the park''s collections object. Anonymous: collector_id is a salted hash, session_id and run_id salted uuids. Deleted 90 days after it happened (game.prune_play_events).';
comment on column game.play_event.session_id is 'The visit, as game.room_stay.session_id; null when the owl was in no room the park knew of.';
comment on column game.play_event.run_id is 'One parkour run (one start through the trail gate): every step of the run shares it. Null for a thing used, and for a fall outside a run.';
comment on column game.play_event.realm is 'The room it happened in, as game.room_stay.realm.';
comment on column game.play_event.thing is 'A bench''s or part''s id (course_bench, course_part), or a thing used as kind:id (leaf-pile:hub-leaves-1).';
comment on column game.play_event.pos_x is 'Where the owl fell, in the room''s pixels, to 10 px (course_fall only).';
comment on column game.play_event.ms is 'A clear''s run time in milliseconds (course_clear only).';
comment on column game.play_event.practice is 'A spectator''s (an owl without a ticket that works, OP-191): its run pays nothing, its use turns up no feathers.';

create index play_event_occurred_idx on game.play_event (occurred_at);
create index play_event_run_idx on game.play_event (run_id) where run_id is not null;
create index play_event_course_idx on game.play_event (course_id, event, occurred_at) where course_id is not null;
create index play_event_collector_idx on game.play_event (collector_id, occurred_at);

alter table game.play_event enable row level security;
revoke all on game.play_event from public, anon, authenticated;

-- Each run whole: when it began, how far it got, how often the owl fell, and how it ended.
-- cleared: the shrine paid out; open: begun within the hour a run lasts (COURSE_RUN_MAX_MS) and not
-- cleared; quit: older than that, or the owl began another run of the same course since.
create view game.v_course_run with (security_invoker = true) as
with runs as (
  select run_id, min(collector_id) as collector_id, min(course_id) as course_id, min(session_id::text)::uuid as session_id,
    min(occurred_at) filter (where event = 'course_start') as started_at,
    min(occurred_at) filter (where event = 'course_clear') as cleared_at,
    min(ms) filter (where event = 'course_clear') as clear_ms,
    count(*) filter (where event = 'course_fall') as falls,
    count(*) filter (where event = 'course_bench') as benches,
    count(*) filter (where event = 'course_part') as parts,
    max(occurred_at) as last_at,
    (array_agg(realm order by occurred_at desc))[1] as last_realm,
    bool_or(practice) as practice
  from game.play_event
  where run_id is not null
  group by run_id
)
select r.*,
  case
    when r.cleared_at is not null then 'cleared'
    when r.started_at < now() - interval '1 hour' then 'quit'
    when exists (select 1 from runs n where n.collector_id = r.collector_id and n.course_id = r.course_id and n.started_at > r.started_at) then 'quit'
    else 'open'
  end as outcome
from runs r;
comment on view game.v_course_run is 'Owl Park (OP-304): each parkour run with its falls, benches and parts, the room it was last in, and its outcome: cleared, open (under an hour old) or quit.';
revoke all on game.v_course_run from public, anon, authenticated;

-- Each visit's last room, and how it ended: where sessions end.
create view game.v_session_end with (security_invoker = true) as
select distinct on (s.session_id) s.session_id, s.collector_id, s.realm as last_realm, s.realm_kind, s.map_id, s.entered_at, s.left_at as ended_at, s.exit_reason
from game.room_stay s
where s.left_at is not null
  and not exists (select 1 from game.room_stay o where o.session_id = s.session_id and o.left_at is null)
order by s.session_id, s.entered_at desc;
comment on view game.v_session_end is 'Owl Park (OP-304): each visit that is over, with the room it was last in and how it ended (logoff, timeout, server_restart).';
revoke all on game.v_session_end from public, anon, authenticated;

create function game.prune_play_events(keep interval default interval '90 days') returns integer
language plpgsql
set search_path = ''
as $$
declare
  pruned integer;
begin
  if keep < interval '30 days' then
    raise exception 'keep is at least 30 days';
  end if;
  delete from game.play_event where occurred_at < now() - keep;
  get diagnostics pruned = row_count;
  return pruned;
end;
$$;
comment on function game.prune_play_events(interval) is 'Owl Park (OP-304), daily by pg_cron: deletes play events that happened more than keep ago (90 days; never under 30).';
revoke all on function game.prune_play_events(interval) from public, anon, authenticated;

select cron.schedule('owl-park-play-event-prune', '40 10 * * *', $$select game.prune_play_events()$$);
