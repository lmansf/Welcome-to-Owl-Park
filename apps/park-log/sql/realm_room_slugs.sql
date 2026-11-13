-- Allow current room slugs in realm visits and mirrored keeper feedback, matching the ingestion
-- function. Private nests still use the single neutral id `nest`. Run after sql/maps.sql.
begin;

alter table game.fact_realm_visit
  drop constraint fact_realm_visit_realm_check,
  add constraint fact_realm_visit_realm_check
    check (realm ~ '^[a-z][a-z0-9-]{0,19}$' and realm not like 'nest-%') not valid;

alter table game.feedback
  drop constraint feedback_realm_check,
  add constraint feedback_realm_check
    check (realm ~ '^[a-z][a-z0-9-]{0,19}$' and realm not like 'nest-%') not valid;

commit;

alter table game.fact_realm_visit validate constraint fact_realm_visit_realm_check;
alter table game.feedback validate constraint feedback_realm_check;
