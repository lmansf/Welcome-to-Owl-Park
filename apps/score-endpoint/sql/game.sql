-- The `game` schema in the fraud pipeline's Supabase project, where the scoring endpoint keeps the
-- park's orders (OP-052). Applied once there, on the owner's go, as the migration
-- `game_schema_for_owl_park_orders`; kept here so it can be read and made again. The function never
-- runs it.

-- Owl Park's real ticket orders (OP-052), kept apart from the simulated pipeline in public.
-- Written only by the owl-park-score Edge Function, which connects as the database's own role.
create schema if not exists game;
comment on schema game is 'Owl Park''s real ticket orders from its Shopify store, written by the owl-park-score Edge Function (source_system shopify). Same columns as the raw tables in public; no ground truth yet.';

create table game.raw_transactions (like public.raw_transactions including all);
create table game.raw_fraud_decisions (like public.raw_fraud_decisions including all);
create table game.raw_checkout_responses (like public.raw_checkout_responses including all);

alter table game.raw_transactions alter column source_system set default 'shopify';
alter table game.raw_fraud_decisions alter column source_system set default 'shopify';
alter table game.raw_checkout_responses alter column source_system set default 'shopify';

-- The function finds an order's rows by its transaction id (the final status, joins).
create index raw_transactions_transaction_id_idx on game.raw_transactions (transaction_id);
create index raw_fraud_decisions_transaction_id_idx on game.raw_fraud_decisions (transaction_id);
create index raw_checkout_responses_transaction_id_idx on game.raw_checkout_responses (transaction_id);

-- Nothing in the public API reaches these: row level security on with no policies, and no grants.
alter table game.raw_transactions enable row level security;
alter table game.raw_fraud_decisions enable row level security;
alter table game.raw_checkout_responses enable row level security;
revoke all on schema game from public, anon, authenticated;
revoke all on all tables in schema game from public, anon, authenticated;
revoke all on all sequences in schema game from public, anon, authenticated;
