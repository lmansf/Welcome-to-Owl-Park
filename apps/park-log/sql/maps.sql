-- Which park a time in a room was in (OP-113, for the tree, OP-128). Applied once in the fraud
-- pipeline's Supabase project as the migration `game_realm_visit_map`, after `game_realm_visit_travel`
-- (sql/travel.sql), and before the owl-park-log function and the Worker that send `map_id` go live;
-- kept here so it can be read and made again. The function never runs it.
--
-- The tree is a second map beside today's park. Its rooms are the levels `l0` to `l5`, which the old
-- realm check (letters only) refused, so the log could not take a time spent on a level of the tree,
-- or a note sent from one. A realm both maps share (the market, and every nest) is counted for the
-- park the owl was walking: `map_id` is 1 for today's park and 2 for the tree, and every row from
-- before is 1, since the tree was dark to everyone but keepers.

alter table game.fact_realm_visit add column map_id smallint not null default 1 check (map_id in (1, 2));
comment on column game.fact_realm_visit.map_id is 'The park the owl was walking: 1 today''s park, 2 the tree (OP-128). A room both share (the market, a nest) takes the park of the room the owl came from in the visit.';
create index fact_realm_visit_map_idx on game.fact_realm_visit (map_id, realm, entered_at);

alter table game.fact_realm_visit drop constraint fact_realm_visit_realm_check;
alter table game.fact_realm_visit add constraint fact_realm_visit_realm_check check (realm ~ '^[a-z][a-z0-9]{0,19}$');
alter table game.feedback drop constraint feedback_realm_check;
alter table game.feedback add constraint feedback_realm_check check (realm ~ '^[a-z][a-z0-9]{0,19}$');

-- A stay keeps its park: a run of reconnects is one room, so one park. Added as the last column, so
-- the views over it stand as they are.
create or replace view game.v_realm_stay with (security_invoker = true) as
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
  sum(collectibles_gained) as collectibles_gained,
  min(map_id) as map_id
from numbered
group by session_id, stay_no;

-- Per room and park: v_realm_time's numbers with the two maps apart, so the market, which both
-- share, shows how each park's owls use it. v_realm_time itself stays as it is (both maps together).
create view game.v_realm_time_by_map with (security_invoker = true) as
with firsts as (
  select distinct on (collector_id, map_id, realm) collector_id, map_id, realm, seconds
  from game.v_realm_stay
  order by collector_id, map_id, realm, entered_at
)
select s.map_id,
  s.realm,
  min(s.realm_kind) as realm_kind,
  count(*) as visits,
  count(distinct s.collector_id) as unique_players,
  round(sum(s.seconds) / 60.0, 1) as total_minutes,
  round((percentile_cont(0.5) within group (order by s.seconds) / 60.0)::numeric, 2) as median_minutes,
  (select round((percentile_cont(0.5) within group (order by f.seconds) / 60.0)::numeric, 2) from firsts f where f.realm = s.realm and f.map_id = s.map_id) as median_first_visit_min,
  round(avg(case when s.seconds < 60 then 1.0 else 0.0 end), 3) as bounce_rate,
  sum(s.reconnects) as reconnects,
  sum(s.collectibles_gained) as collectibles_gained,
  round(sum(s.collectibles_gained) / nullif(sum(s.seconds) / 60.0, 0), 3) as collectibles_per_minute
from game.v_realm_stay s
group by s.map_id, s.realm;
comment on view game.v_realm_time_by_map is 'Owl Park (OP-113, OP-128): game.v_realm_time per park: map_id 1 today''s park, 2 the tree.';
revoke all on game.v_realm_time_by_map from public, anon, authenticated;
