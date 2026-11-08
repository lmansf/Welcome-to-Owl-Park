/**
 * The Edge Function's entry point (Deno, in the fraud pipeline's Supabase project): the platform
 * gives it SUPABASE_DB_URL, a connection to the project's database, whose `game` schema keeps the
 * park's rows; FRAUD_SCORE_KEY is the owner's function secret (the project's, shared with
 * owl-park-score), the same value as the park's Worker secret of that name. See README.md.
 */
import postgres from 'npm:postgres@3.4.9';
import { gameTables, handle } from './handler.ts';

const url = Deno.env.get('SUPABASE_DB_URL');
// No prepared statements: the connection may go through a pooler in transaction mode, which keeps none.
const tables = url ? gameTables(postgres(url, { prepare: false, max: 2 })) : null;

Deno.serve((request) => handle(request, { key: Deno.env.get('FRAUD_SCORE_KEY'), tables }));
