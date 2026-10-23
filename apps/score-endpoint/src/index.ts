/**
 * The Edge Function's entry point (Deno, in the fraud pipeline's Supabase project): the platform
 * gives it the project's address and secret key; FRAUD_SCORE_KEY is set by the owner as a function
 * secret, the same value as the park's Worker secret of that name. See README.md.
 */
import { handle, restTables, secretKey } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL');
const secret = secretKey((name) => Deno.env.get(name));
const tables = url && secret ? restTables(url, secret.key, secret.legacy) : null;

Deno.serve((request) => handle(request, { key: Deno.env.get('FRAUD_SCORE_KEY'), tables }));
