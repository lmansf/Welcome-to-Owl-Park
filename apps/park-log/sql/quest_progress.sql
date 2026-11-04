-- Quest progress (OP-266, Logan Nov 4: "Can we have another table that tracks per owl quest
-- progress? That's going to be a strong signal for predicting location. We should also have a
-- reference table of quests, and individual quest steps are important for this"). Applied once in
-- the fraud pipeline's Supabase project as the migration `game_quest_progress`, after
-- `game_room_stays` (sql/room_stays.sql, which turned pg_cron on), and before the owl-park-log
-- function and the Worker that send `quest_progress` and `quest_catalogue` go live; kept here so it
-- can be read and made again. The function never runs it.
--
-- Three tables beside game.room_stay, for models of where an owl goes next:
--   game.dim_quest        every quest in the park's catalogue (kept for good)
--   game.dim_quest_step   every step of each, with the room it happens in; handing the quest in to
--                         its giver is the last step (`hand_in`), as it is a trip too (kept for good)
--   game.quest_progress   a type 2 log, one row per owl's step of one run of a quest: the open row
--                         (no completed_at) is the step the owl is on now; rows go 90 days after
--                         they end
-- A run is one acceptance of a quest: a quest given up and taken again is a new run.
--
-- What a row never holds: a name, email, age, ticket, order or address, or anything of a puzzle's
-- run (its codes, keys and guesses stay in the park). The owl is its collector id's salted hash (as
-- every game row, and as game.room_stay, so the two join on collector_id and time, or session_id).

create table game.dim_quest (
  quest_id text primary key check (quest_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  title text not null check (length(title) between 1 and 200),
  giver_npc text not null,
  giver_room text check (giver_room ~ '^[a-z][a-z0-9-]{0,19}$'),
  quest_type text not null check (quest_type in ('talk', 'visit', 'interact', 'emote', 'gather', 'mixed', 'puzzle')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  length text not null check (length in ('short', 'medium', 'long')),
  cadence text not null check (cadence in ('story', 'daily', 'weekly', 'monthly')),
  template text,
  step_count smallint not null check (step_count >= 1),
  reward_feathers integer not null check (reward_feathers >= 0),
  reward_item text,
  requires text[] not null default '{}',
  puzzle_id text,
  in_catalogue boolean not null default true,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table game.dim_quest is 'Owl Park (OP-266): every quest the park has offered, from the park''s own catalogue (sent by the Worker whenever a deploy changes it). One no longer offered stays, in_catalogue false.';
comment on column game.dim_quest.cadence is 'story (done once), daily, weekly or monthly (offered again each park day, week or month; a run expires with its period).';
comment on column game.dim_quest.step_count is 'Its work steps. game.dim_quest_step holds one more: handing it in (step_count + 1).';
comment on column game.dim_quest.reward_item is 'A collectible variant, pick (one chosen by the quest''s odds), or null.';
comment on column game.dim_quest.puzzle_id is 'The puzzle a puzzle quest''s one step opens; its locks are not steps here (OP-266 question 1).';
alter table game.dim_quest enable row level security;
revoke all on game.dim_quest from public, anon, authenticated;

create table game.dim_quest_step (
  quest_id text not null,
  step_no smallint not null check (step_no >= 1),
  goal_kind text not null check (goal_kind in ('talk', 'visit', 'interact', 'emote', 'gather', 'puzzle', 'hand_in')),
  target_room text check (target_room ~ '^[a-z][a-z0-9-]{0,19}$'),
  target_realm_kind text check (target_realm_kind in ('realm', 'hub', 'nest')),
  target_npc text,
  target_thing text,
  need_count smallint not null check (need_count >= 1),
  distinct_only boolean not null default false,
  step_text text not null check (length(step_text) between 1 and 200),
  in_catalogue boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (quest_id, step_no)
);
comment on table game.dim_quest_step is 'Owl Park (OP-266): each step of each quest in game.dim_quest, from 1; the last (goal_kind hand_in) is handing the quest in to its giver.';
comment on column game.dim_quest_step.target_room is 'The room the step happens in (a talk''s, an emote for an NPC''s and a hand-in''s are the NPC''s room), as game.room_stay.realm; null where any room will do, and for a puzzle, whose locks sit in several rooms.';
comment on column game.dim_quest_step.target_thing is 'What it asks for: a kind of thing to use (leaf-pile, stall, moonbeam), an item to find (acorn, gear, moonstone), an emote, or the puzzle''s id.';
comment on column game.dim_quest_step.distinct_only is 'An interact step that counts different ones (three stalls, not one stall thrice).';
alter table game.dim_quest_step enable row level security;
revoke all on game.dim_quest_step from public, anon, authenticated;

create table game.quest_progress (
  progress_id uuid primary key,
  run_id uuid not null,
  collector_id text not null check (collector_id ~ '^[0-9a-f]{64}$'),
  quest_id text not null check (quest_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  period text not null check (period ~ '^$|^[WM]?[0-9]{4}-[0-9]{2}(-[0-9]{2})?$'),
  step_no smallint not null check (step_no between 1 and 100),
  started_at timestamptz not null,
  started_session_id uuid,
  started_realm text check (started_realm ~ '^[a-z][a-z0-9-]{0,19}$'),
  expires_at timestamptz,
  completed_at timestamptz check (completed_at >= started_at),
  completed_session_id uuid,
  completed_realm text check (completed_realm ~ '^[a-z][a-z0-9-]{0,19}$'),
  outcome text check (outcome in ('done', 'abandoned', 'expired', 'retired')),
  created_at timestamptz not null default now(),
  -- Open (both null) or closed (both set): never one without the other.
  constraint quest_progress_closed_check check ((completed_at is null) = (outcome is null))
);
comment on table game.quest_progress is 'Owl Park (OP-266): one row per owl''s step of one run of a quest, sent live. The open row (completed_at null) is the step the owl is on now; join game.dim_quest_step on (quest_id, step_no) for where it happens. Anonymous: collector_id is a salted hash, as game.room_stay''s. Deleted 90 days after it ends (game.prune_quest_progress).';
comment on column game.quest_progress.run_id is 'One acceptance of the quest: every step of the run shares it. A quest given up and taken again is a new run.';
comment on column game.quest_progress.period is 'The run''s period: empty for a story quest, else its park day (2026-11-04), week (W2026-11-02, by its Monday) or month (M2026-11).';
comment on column game.quest_progress.started_session_id is 'The visit the step began in, as game.room_stay.session_id; null when the owl was in no room (a step begun by a call from outside one).';
comment on column game.quest_progress.started_realm is 'The room the owl was in as the step began, as game.room_stay.realm.';
comment on column game.quest_progress.expires_at is 'When the run''s day, week or month ends; null for a story quest. A step still open then is closed as expired (game.prune_quest_progress).';
comment on column game.quest_progress.outcome is 'done (the step, or for hand_in the quest), abandoned (given up), expired (its period ended), retired (the quest left the catalogue). Null while the owl is on it. A step a visit to the room the owl stood in finished as the quest was taken begins and ends at once.';

-- One open step per run: a run is on one step at a time.
create unique index quest_progress_open_idx on game.quest_progress (run_id) where completed_at is null;
create index quest_progress_collector_idx on game.quest_progress (collector_id, started_at);
create index quest_progress_quest_idx on game.quest_progress (quest_id, step_no);
create index quest_progress_started_idx on game.quest_progress (started_at);
create index quest_progress_expires_idx on game.quest_progress (expires_at) where completed_at is null;

alter table game.quest_progress enable row level security;
revoke all on game.quest_progress from public, anon, authenticated;

-- A batch from the park, applied in order in one transaction (the function's one call):
--   start: {event, progress_id, run_id, collector_id, session_id, quest_id, period, step_no, at, realm, expires_at}
--          a step not here yet closes the run's open step (done, at this time: its end went missing)
--          and opens its own; one already here (a batch sent again) changes nothing.
--   end:   {event, progress_id, at, session_id, realm, outcome}
--          closes the step if it is still open; a closed or unknown one is left as it is.
-- The function checks every field before it calls this. Returns how many events changed a row.
create function game.apply_quest_progress(events jsonb) returns integer
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
    if e ->> 'event' = 'start' then
      if exists (select 1 from game.quest_progress p where p.progress_id = (e ->> 'progress_id')::uuid) then
        continue;
      end if;
      update game.quest_progress p
      set completed_at = greatest(p.started_at, t), outcome = 'done',
        completed_session_id = (e ->> 'session_id')::uuid, completed_realm = e ->> 'realm'
      where p.run_id = (e ->> 'run_id')::uuid and p.completed_at is null;
      insert into game.quest_progress (progress_id, run_id, collector_id, quest_id, period, step_no, started_at, started_session_id, started_realm, expires_at)
      values ((e ->> 'progress_id')::uuid, (e ->> 'run_id')::uuid, e ->> 'collector_id', e ->> 'quest_id', e ->> 'period',
        (e ->> 'step_no')::smallint, t, (e ->> 'session_id')::uuid, e ->> 'realm', (e ->> 'expires_at')::timestamptz);
      changed := changed + 1;
    elsif e ->> 'event' = 'end' then
      update game.quest_progress p
      set completed_at = greatest(p.started_at, t), outcome = e ->> 'outcome',
        completed_session_id = (e ->> 'session_id')::uuid, completed_realm = e ->> 'realm'
      where p.progress_id = (e ->> 'progress_id')::uuid and p.completed_at is null;
      get diagnostics n = row_count;
      changed := changed + n;
    end if;
  end loop;
  return changed;
end;
$$;
comment on function game.apply_quest_progress(jsonb) is 'Owl Park (OP-266): applies the park''s quest_progress events in order: start closes the run''s open step (done) and opens a new one; end closes a step. A batch sent twice changes nothing the second time.';
revoke all on function game.apply_quest_progress(jsonb) from public, anon, authenticated;

-- The park's quest catalogue, whole (the function refuses a part of one): every quest and step in it
-- is put in or brought up to date, and every other one marked out of the catalogue, in one transaction.
create function game.set_quest_catalogue(quests jsonb, steps jsonb) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into game.dim_quest as d (quest_id, title, giver_npc, giver_room, quest_type, difficulty, length, cadence, template, step_count, reward_feathers, reward_item, requires, puzzle_id, in_catalogue, updated_at)
  select q.quest_id, q.title, q.giver_npc, q.giver_room, q.quest_type, q.difficulty, q.length, q.cadence, q.template, q.step_count, q.reward_feathers, q.reward_item,
    coalesce(array(select jsonb_array_elements_text(x.value -> 'requires')), '{}'), q.puzzle_id, true, now()
  from jsonb_array_elements(quests) x
  cross join lateral jsonb_populate_record(null::game.dim_quest, x.value - 'requires') q
  on conflict (quest_id) do update set
    title = excluded.title, giver_npc = excluded.giver_npc, giver_room = excluded.giver_room, quest_type = excluded.quest_type,
    difficulty = excluded.difficulty, length = excluded.length, cadence = excluded.cadence, template = excluded.template,
    step_count = excluded.step_count, reward_feathers = excluded.reward_feathers, reward_item = excluded.reward_item,
    requires = excluded.requires, puzzle_id = excluded.puzzle_id, in_catalogue = true, updated_at = now();
  update game.dim_quest d set in_catalogue = false, updated_at = now()
  where d.in_catalogue and not exists (select 1 from jsonb_array_elements(quests) x where x.value ->> 'quest_id' = d.quest_id);

  insert into game.dim_quest_step as d (quest_id, step_no, goal_kind, target_room, target_realm_kind, target_npc, target_thing, need_count, distinct_only, step_text, in_catalogue, updated_at)
  select s.quest_id, s.step_no, s.goal_kind, s.target_room, s.target_realm_kind, s.target_npc, s.target_thing, s.need_count, s.distinct_only, s.step_text, true, now()
  from jsonb_populate_recordset(null::game.dim_quest_step, steps) s
  on conflict (quest_id, step_no) do update set
    goal_kind = excluded.goal_kind, target_room = excluded.target_room, target_realm_kind = excluded.target_realm_kind,
    target_npc = excluded.target_npc, target_thing = excluded.target_thing, need_count = excluded.need_count,
    distinct_only = excluded.distinct_only, step_text = excluded.step_text, in_catalogue = true, updated_at = now();
  update game.dim_quest_step d set in_catalogue = false, updated_at = now()
  where d.in_catalogue and not exists (
    select 1 from jsonb_array_elements(steps) x where x.value ->> 'quest_id' = d.quest_id and (x.value ->> 'step_no')::smallint = d.step_no);
end;
$$;
comment on function game.set_quest_catalogue(jsonb, jsonb) is 'Owl Park (OP-266): makes game.dim_quest and game.dim_quest_step the park''s catalogue: each quest and step in it up to date, every other marked out (in_catalogue false), never deleted.';
revoke all on function game.set_quest_catalogue(jsonb, jsonb) from public, anon, authenticated;

-- The daily job: steps still open past their run's expires_at are closed as expired then (the park
-- only notices the next time the owl's quests are read, and may never), then rows that ended more
-- than `keep` ago are deleted, and so are steps still open that began more than `keep` ago (an owl
-- gone that long), in one transaction. The reference tables are kept. Returns how many rows went.
create function game.prune_quest_progress(keep interval default interval '90 days') returns integer
language plpgsql
set search_path = ''
as $$
declare
  pruned integer;
begin
  if keep < interval '30 days' then
    raise exception 'keep is at least 30 days';
  end if;
  update game.quest_progress p
  set completed_at = greatest(p.started_at, p.expires_at), outcome = 'expired'
  where p.completed_at is null and p.expires_at < now();

  delete from game.quest_progress p
  where (p.completed_at is not null and p.completed_at < now() - keep)
     or (p.completed_at is null and p.started_at < now() - keep);
  get diagnostics pruned = row_count;
  return pruned;
end;
$$;
comment on function game.prune_quest_progress(interval) is 'Owl Park (OP-266), daily by pg_cron: closes steps open past their expires_at (expired), then deletes progress rows that ended, or began and never ended, more than keep ago (90 days; never under 30). Keeps game.dim_quest and game.dim_quest_step.';
revoke all on function game.prune_quest_progress(interval) from public, anon, authenticated;

-- The step each owl is on now, with where it happens: the model's "next room" signal.
create view game.v_quest_step_now with (security_invoker = true) as
select p.collector_id, p.run_id, p.quest_id, q.cadence, p.step_no, s.goal_kind, s.target_room, s.target_realm_kind, s.target_npc, s.target_thing,
  p.started_at, p.started_realm, p.expires_at
from game.quest_progress p
left join game.dim_quest q on q.quest_id = p.quest_id
left join game.dim_quest_step s on s.quest_id = p.quest_id and s.step_no = p.step_no
where p.completed_at is null;
comment on view game.v_quest_step_now is 'Owl Park (OP-266): each owl''s open quest steps, with the room each happens in.';
revoke all on game.v_quest_step_now from public, anon, authenticated;

-- Each run whole: when it began and ended, how far it got and how it ended.
create view game.v_quest_run with (security_invoker = true) as
select p.run_id, min(p.collector_id) as collector_id, min(p.quest_id) as quest_id, min(p.period) as period,
  min(p.started_at) as accepted_at,
  max(p.completed_at) filter (where s.goal_kind = 'hand_in' and p.outcome = 'done') as handed_in_at,
  count(*) filter (where p.outcome = 'done' and s.goal_kind is distinct from 'hand_in') as steps_done,
  min(q.step_count) as step_count,
  case
    when bool_or(s.goal_kind = 'hand_in' and p.outcome = 'done') then 'handed_in'
    when bool_or(p.completed_at is null) then 'open'
    else (array_agg(p.outcome order by p.step_no desc))[1]
  end as run_outcome
from game.quest_progress p
left join game.dim_quest q on q.quest_id = p.quest_id
left join game.dim_quest_step s on s.quest_id = p.quest_id and s.step_no = p.step_no
group by p.run_id;
comment on view game.v_quest_run is 'Owl Park (OP-266): one row per run of a quest: accepted, handed in, steps done of step_count, and run_outcome (handed_in, open, abandoned, expired, retired).';
revoke all on game.v_quest_run from public, anon, authenticated;

-- Every day at 05:35 Eastern in winter (10:35 UTC), beside the room stays' job.
select cron.schedule('owl-park-quest-progress-prune', '35 10 * * *', $$select game.prune_quest_progress()$$);
