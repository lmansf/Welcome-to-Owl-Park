# The scoring endpoint (C45, OP-052)

The fraud pipeline's side of the fraud link: a Supabase Edge Function in the owner's pipeline
project, not part of the park's deploy. The park's Worker posts each ticket order to it before the
tickets go out, and what the buyer got after (the contract is in `docs/ARCHITECTURE.md`, the fraud
link).

This first version approves every order (score 0, model `approve-all-v0`), so the fraud link runs
end to end before the pipeline's own scoring is ready (OP-072). It keeps what the park sends in the
pipeline project's `game` schema (`sql/game.sql`): three tables kept apart from the simulated raw
tables in `public` but with the same columns, every row marked `source_system = 'shopify'`:

| The park sends | Lands in |
|---|---|
| `score` | `raw_transactions` (the order, status empty) and `raw_fraud_decisions` (the verdict), before it answers |
| `response` | `raw_checkout_responses`, and the order's status: `completed` (approved, released) or `declined` (refunded, switched off) |
| `outcome` (a held order, later) | the order's status only |

The park sends hashes only (guest, device, card), so the columns that would name a buyer (email,
phone, IP address, user agent, card digits, billing) stay empty. The order as the park sent it is
in `raw_payload`: its order number, the store's risk level and the payment gateway have no columns
of their own. A cart line takes the park's product handle as its `sku`; `ticket` becomes
`day_ticket` and `pass` `annual_pass`. `features_json` carries what the order itself says (the
total, the items, a guest checkout); the velocity features stay null until the real scoring. A
table that refuses a row is logged in the function's logs, and the order is approved all the same.

## Deploy (on the owner's go)

1. The `game` schema and its tables come first: `sql/game.sql`, applied once as a migration in the
   pipeline project (done, as `game_schema_for_owl_park_orders`).
2. Deploy `src/index.ts` and `src/handler.ts` as the function `owl-park-score` with the platform's
   JWT check off (the function checks the park's key itself): through Supabase's API, or with the
   Supabase CLI from a folder `supabase/functions/owl-park-score/` holding the two files,
   `supabase functions deploy owl-park-score --no-verify-jwt`.
3. Make one long random string (32 characters or more) in a password manager and set it in two
   places, never in a file or a chat: the function's secret `FRAUD_SCORE_KEY` (Dashboard → Edge
   Functions → Secrets), and the park's repository secret `FRAUD_SCORE_KEY`.
4. The park's repository secret `FRAUD_SCORE_URL` is
   `https://<project-ref>.supabase.co/functions/v1/owl-park-score`. With `FRAUD_HASH_SALT` as well,
   the next Worker deploy turns the fraud link on (`docs/DEPLOY.md`).
5. Check it with the key; this keeps nothing:

   ```sh
   curl -s https://<project-ref>.supabase.co/functions/v1/owl-park-score \
     -H "Authorization: Bearer <FRAUD_SCORE_KEY>" -H "Content-Type: application/json" \
     -d '{"kind":"score","dry_run":true,"transaction":{"transaction_id":"00000000-0000-4000-8000-000000000001","request_id":"00000000-0000-4000-8000-000000000002","total":3.99,"cart":[]}}'
   ```

   It should answer `"decision":"approve"` and `"tables":"ok"`. Before its key is set it answers
   503; with another key, 401.

The platform gives the function `SUPABASE_DB_URL`, a connection to the project's database, whose
`postgres` role owns the `game` tables; it needs nothing else, and nothing in the Dashboard changes.
The `game` schema is not in the project's API: its tables have row-level security on with no
policies, and no grants to the API's roles, so only that connection reaches them. Each row goes to
the database as one JSON parameter, which `jsonb_populate_record` spreads over the table's columns,
so nothing the park sends is ever part of the query.

## Tests

`pnpm --filter @owl-park/score-endpoint test` runs the handler under Node against tables in memory,
and the `game` tables' queries against a stand-in connection; `pnpm check` runs it with the rest. `src/deno.d.ts` only lets `index.ts` typecheck here: it is not
deployed.
