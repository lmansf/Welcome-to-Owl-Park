-- Room stays kept as they are, for 90 days (OP-265, Logan Nov 4: "I want to model sequences like where
-- an owl goes after the market. Let's drop the rollup, but drop data older than 90 days"). Applied
-- once as the migration `game_room_stays_retention`, after `game_room_stays_hourly`
-- (sql/room_stays_hourly.sql). Nothing is counted up any more: every stay keeps its owl, room and
-- times, so paths through the park can be studied, and a stay that ended more than 90 days ago is
-- deleted. game.room_stay_hourly, which never held a row (its first count would have been 90 days
-- out), goes.

-- Only an empty hourly table goes: should one ever hold rows, the migration stops instead.
do $$
begin
  if exists (select 1 from game.room_stay_hourly) then
    raise exception 'game.room_stay_hourly holds rows: decide what happens to them by hand first';
  end if;
end;
$$;

-- The old job and its function go; the new one takes the same hour.
select cron.unschedule('owl-park-room-stay-rollup');
drop function game.roll_up_room_stays(interval);
drop table game.room_stay_hourly;

-- The daily job: rows left open over a day are closed (a leave that never came: the park restarts
-- every night, so no stay is that long), then the stays that ended more than `keep` ago are deleted,
-- in one transaction. Returns how many rows were deleted.
create function game.prune_room_stays(keep interval default interval '90 days') returns integer
language plpgsql
set search_path = ''
as $$
declare
  pruned integer;
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

  delete from game.room_stay s where s.left_at is not null and s.left_at < now() - keep;
  get diagnostics pruned = row_count;
  return pruned;
end;
$$;
comment on function game.prune_room_stays(interval) is 'Owl Park (OP-265), daily by pg_cron: closes stays left open over a day (timeout), then deletes the stays that ended more than keep ago (90 days; never under 30).';
revoke all on function game.prune_room_stays(interval) from public, anon, authenticated;

comment on table game.room_stay is 'Owl Park (OP-265): one row per owl''s stay in one room, sent live. The open row (left_at null) is the owl''s room now. Anonymous: collector_id is a salted hash, no position in the room. A stay is deleted 90 days after it ended (game.prune_room_stays); nothing is kept from it.';

-- Every day at 05:30 Eastern in winter (10:30 UTC), after the nightly restart has closed the night's stays.
select cron.schedule('owl-park-room-stay-prune', '30 10 * * *', $$select game.prune_room_stays()$$);
