-- Travel from the map (OP-130): a room can be come into by travel from the Menu's map. Applied once in
-- the fraud pipeline's Supabase project as the migration `game_realm_visit_travel`, after
-- `game_realm_visits` (sql/realms.sql), when the Worker that sends `travel` goes live; kept here so it
-- can be read and made again. The function never runs it.

alter table game.fact_realm_visit drop constraint fact_realm_visit_entry_source_check;
alter table game.fact_realm_visit add constraint fact_realm_visit_entry_source_check
  check (entry_source in ('walked', 'spawn', 'deep_link', 'reconnect', 'travel'));
comment on column game.fact_realm_visit.entry_source is 'walked (from another room of the visit: a door, the way out, the turnstile), spawn (the visit''s first room from Play: the owl''s own nest, or the lobby), deep_link (the visit''s first room named by the page''s address), reconnect (the same room again after the line dropped), travel (from another room of the visit by the Menu''s map, OP-130, which also took the place of Go home).';
