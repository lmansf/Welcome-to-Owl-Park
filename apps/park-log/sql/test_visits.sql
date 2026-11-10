-- Our own test visits (Logan, Nov 10: keep our test runs out of the park report). Applied once in the
-- fraud pipeline's Supabase project as the migration `game_test_visits`, before the owl-park-log
-- function that sends `is_test` is deployed again; kept here so it can be read and made again. The
-- function never runs it.
--
-- The scripted checks (the fresh-visitor run, screenshot runs, playtest bots, QA walks) come into the
-- park as fresh owls and were counted as players. A page driven by a browser automation tool, or one
-- whose address has ?test=1, says so on its socket (apps/park/src/net/testVisit.ts); the Worker also
-- marks a headless browser's own user agent. The visit is kept, marked, and the reports leave it out.

alter table game.fact_session add column is_test boolean not null default false;
comment on column game.fact_session.is_test is 'One of our own test visits (scripted checks, playtest bots, QA walks, ?test=1): kept for the record, left out of the visitor reports and the dashboard. False for every visit from before the mark (Nov 10, 2026) unless backfilled.';

-- Real players' visits only: what the reports count.
create view game.v_player_session with (security_invoker = on) as
  select * from game.fact_session where not is_test;
comment on view game.v_player_session is 'Owl Park: game.fact_session without our own test visits (is_test). What the morning report and the visitor dashboard count.';
