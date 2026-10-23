/**
 * The scoring endpoint of the owner's fraud pipeline (C45, OP-052), first version. The park's Worker
 * posts each ticket order here before its tickets go out (`apps/edge/src/fraudLink.ts`; the contract
 * is in docs/ARCHITECTURE.md). This version approves every order (the pipeline's own scoring comes
 * later) and lands what the park sends in the pipeline project's `game` schema, apart from the
 * simulated tables in `public` but with the same columns, each row marked `source_system = 'shopify'`:
 *
 * - `kind: "score"`: the order in `raw_transactions` and the verdict in `raw_fraud_decisions`, then
 *   the verdict back to the Worker. With `dry_run: true` (the owner's check, never the Worker) it
 *   keeps nothing, and says whether it can reach the tables.
 * - `kind: "response"`: what the buyer got, in `raw_checkout_responses`, and the order's status.
 * - `kind: "outcome"`: what became of a held order later: the order's status only.
 *
 * The Worker's key (`FRAUD_SCORE_KEY`, sent as a bearer token) is checked here: the function is
 * deployed with the platform's JWT check off. Only hashes, amounts and order numbers arrive: no name,
 * email, address, IP address or card number. It runs as a Supabase Edge Function (index.ts); this
 * file is plain web code, so the tests run it under Node.
 */

export const MODEL_VERSION = 'approve-all-v0';

/** The largest request taken: an order of up to 50 lines is a few kilobytes. */
const MAX_BODY = 64 * 1024;

/** The shortest key taken: the Worker's is a long random string. */
const MIN_KEY = 16;

export type Table = 'raw_transactions' | 'raw_fraud_decisions' | 'raw_checkout_responses';
export type Row = Record<string, unknown>;

/** Where the rows go: the `game` schema through a database connection (`gameTables`), or a fake in tests. */
export interface Tables {
  /** Throws unless the tables answer (the dry run's check of the key). */
  check(): Promise<void>;
  insert(table: Table, row: Row): Promise<void>;
  /** The final status of the park's order (`completed` or `declined`) on its raw_transactions row. */
  setStatus(transactionId: string, status: 'completed' | 'declined'): Promise<void>;
}

export interface Deps {
  /** FRAUD_SCORE_KEY, the key the park's Worker sends. Unset: every request is refused. */
  key: string | undefined;
  /** Null when the function cannot reach the tables: it still answers, and logs that nothing was kept. */
  tables: Tables | null;
  now?: () => number;
  uuid?: () => string;
}

/** The pipeline's word for the park's product types (the park sends ticket, pass or merch). */
const PRODUCT_TYPE: Record<string, string> = { ticket: 'day_ticket', pass: 'annual_pass', merch: 'merch' };

/** The final status of an order, from the park's word for what the buyer got; none while it is held. */
const STATUS: Record<string, 'completed' | 'declined'> = {
  approved: 'completed',
  'fail-open': 'completed',
  released: 'completed',
  'released-after-24h': 'completed',
  refunded: 'declined',
  'switched-off': 'declined',
};

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOf = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null);
const hashOf = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : null);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | null => (values.includes(v as T) ? (v as T) : null);
const cents = (n: number): number => Math.round(n * 100) / 100;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function iso(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Whether two keys are the same, compared by their digests so the time taken says nothing of either. */
async function sameKey(given: string, want: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(want))]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i]! ^ y[i]!;
  return d === 0;
}

/** A cart line in the pipeline's shape. The park sends no product name; its handle stands in for the SKU. */
function cartLine(v: unknown, i: number): Row {
  const l = obj(v);
  const qty = Number.isInteger(l['qty']) && (l['qty'] as number) > 0 ? (l['qty'] as number) : 1;
  const total = num(l['line_total']) ?? 0;
  const discount = num(l['line_discount']) ?? 0;
  const attributes: Record<string, string> = {};
  for (const [k, a] of Object.entries(obj(l['attributes'])).slice(0, 10)) if (/^[a-z_]{1,30}$/.test(k) && typeof a === 'string' && a.length <= 60) attributes[k] = a;
  return {
    line_number: Number.isInteger(l['line_number']) ? l['line_number'] : i + 1,
    sku: str(l['product_handle'], 100),
    product_name: null,
    product_type: PRODUCT_TYPE[String(l['product_type'])] ?? 'other',
    qty,
    unit_price: num(l['unit_price']) ?? cents((total + discount) / qty),
    line_discount: discount,
    line_total: total,
    attributes,
  };
}

/** `kind: "score"`: keep the order and its verdict, and answer approve. */
async function score(t: Record<string, unknown>, deps: Deps, dryRun: boolean): Promise<Response> {
  const transaction = uuidOf(t['transaction_id']);
  const request = uuidOf(t['request_id']);
  if (!transaction || !request) return json({ error: 'transaction_id and request_id must be UUIDs' }, 400);
  const decidedAt = new Date((deps.now ?? Date.now)()).toISOString();
  const decisionId = (deps.uuid ?? (() => crypto.randomUUID()))();
  const cart = (Array.isArray(t['cart']) ? t['cart'] : []).slice(0, 100).map(cartLine);
  const guest = bool(t['is_guest_checkout']);
  const total = num(t['total']);
  const verdict = { decision: 'approve', score: 0, reason_codes: [] as string[], model_version: MODEL_VERSION, decision_id: decisionId };
  const order: Row = {
    source_system: 'shopify',
    raw_payload: t,
    transaction_id: transaction,
    request_id: request,
    event_ts: iso(t['event_ts']) ?? decidedAt,
    guest_id: uuidOf(t['guest_id']),
    is_guest_checkout: guest,
    channel: str(t['channel'], 40),
    device_id: hashOf(t['device_id']),
    payment_token: hashOf(t['payment_token']),
    currency: str(t['currency'], 3) ?? 'USD',
    subtotal: num(t['subtotal']),
    discount: num(t['discount']),
    tax: num(t['tax']),
    total,
    promo_code: str(t['promo_code'], 100),
    cart,
  };
  const decision: Row = {
    source_system: 'shopify',
    decision_id: decisionId,
    transaction_id: transaction,
    request_id: request,
    decided_at: decidedAt,
    score: verdict.score,
    decision: verdict.decision,
    reason_codes: verdict.reason_codes,
    model_version: MODEL_VERSION,
    model_latency_ms: 0,
    // What is known from the order itself; the velocity and network features wait for real scoring.
    features_json: {
      order_total: total,
      n_items: cart.reduce((n, l) => n + (l['qty'] as number), 0),
      is_guest_checkout: guest,
      account_age_days: null,
      device_txn_1h: null,
      device_distinct_cards_1h: null,
      ip_billing_mismatch: null,
      headless_browser: null,
      n_distinct_guest_names: 0,
      gift_card_share: 0,
    },
  };
  if (dryRun) {
    const tables = deps.tables ? await deps.tables.check().then(() => 'ok', (e) => `unreachable: ${message(e)}`) : 'not set up';
    return json({ ...verdict, dry_run: true, tables });
  }
  // Kept before the answer, so the response the Worker posts next finds its order.
  if (deps.tables) {
    await Promise.all([deps.tables.insert('raw_transactions', order), deps.tables.insert('raw_fraud_decisions', decision)]).catch((e) =>
      console.error('[owl-park-score] the order was not kept:', message(e)),
    );
  } else console.error('[owl-park-score] no tables to keep the order in');
  return json(verdict);
}

/** `kind: "response"` and `kind: "outcome"`: what the buyer got, and the order's final status. */
async function response(kind: 'response' | 'outcome', r: Record<string, unknown>, deps: Deps): Promise<Response> {
  const transaction = uuidOf(r['transaction_id']);
  const request = uuidOf(r['request_id']);
  if (!transaction || !request) return json({ error: 'transaction_id and request_id must be UUIDs' }, 400);
  const outcome = str(r['outcome'], 40);
  const status = outcome ? STATUS[outcome] : undefined;
  if (!deps.tables) {
    console.error('[owl-park-score] no tables to keep the response in');
    return json({ ok: true });
  }
  const work: Array<Promise<void>> = [];
  // An outcome (a held order released or refunded later) is not a checkout response: only the status changes.
  if (kind === 'response') {
    work.push(
      deps.tables.insert('raw_checkout_responses', {
        source_system: 'shopify',
        raw_payload: { outcome },
        response_id: (deps.uuid ?? (() => crypto.randomUUID()))(),
        transaction_id: transaction,
        request_id: request,
        request_received_at: iso(r['request_received_at']),
        response_sent_at: iso(r['response_sent_at']),
        response_status: oneOf(r['response_status'], ['approved', 'declined', 'step_up'] as const),
        customer_message_code: oneOf(r['customer_message_code'], ['ORDER_CONFIRMED', 'CARD_DECLINED', 'PAYMENT_NOT_PROCESSED', 'VERIFY_IDENTITY'] as const),
        total_latency_ms: num(r['total_latency_ms']),
        fraud_scoring_ms: num(r['fraud_scoring_ms']),
        payment_auth_ms: num(r['payment_auth_ms']),
        fraud_timeout: bool(r['fraud_timeout']),
        fallback_used: bool(r['fallback_used']),
        fallback_policy: oneOf(r['fallback_policy'], ['fail_open'] as const),
        channel: str(r['channel'], 40),
        model_version: str(r['model_version'], 100),
      }),
    );
  }
  if (status) work.push(deps.tables.setStatus(transaction, status));
  await Promise.all(work).catch((e) => console.error(`[owl-park-score] the ${kind} was not kept:`, message(e)));
  return json({ ok: true });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const key = deps.key?.trim() ?? '';
  if (key.length < MIN_KEY) return json({ error: 'not set up' }, 503);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !(await sameKey(auth.slice(7).trim(), key))) return json({ error: 'unauthorized' }, 401);
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY) return json({ error: 'too large' }, 413);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let body: Record<string, unknown>;
  try {
    body = obj(JSON.parse(text));
  } catch {
    return json({ error: 'not JSON' }, 400);
  }
  switch (body['kind']) {
    case 'score':
      return score(obj(body['transaction']), deps, body['dry_run'] === true);
    case 'response':
    case 'outcome':
      return response(body['kind'], obj(body['response']), deps);
    default:
      return json({ error: 'kind must be score, response or outcome' }, 400);
  }
}

/** The schema the park's rows go to, in the fraud pipeline's project (the owner's call, OP-052). */
export const SCHEMA = 'game';

/** What the tables need of a Postgres client: a query with numbered parameters. postgres.js's `sql.unsafe` is one. */
export interface Db {
  unsafe(query: string, params: unknown[]): PromiseLike<unknown>;
}

const COLUMN = /^[a-z_]{1,40}$/;

/**
 * The park's tables in the `game` schema, over a direct connection to the project's database (the
 * function's own SUPABASE_DB_URL): the schema is not in the project's public API at all, and the
 * connection's role owns it. A row goes as one parameter, its JSON, and the database gives each value
 * its column's type (the order as sent, the cart and the verdict's lists stay JSON), so nothing the
 * park sends is spliced into the query.
 */
export function gameTables(db: Db): Tables {
  return {
    async check() {
      await db.unsafe(`select 1 from ${SCHEMA}.raw_transactions limit 1`, []);
    },
    async insert(table, row) {
      const cols = Object.keys(row).filter((c) => row[c] !== undefined);
      for (const c of cols) if (!COLUMN.test(c)) throw new Error(`not a column: ${c}`);
      const list = cols.join(', ');
      // Sent as text and read as JSON by the database: a client that encodes JSON parameters itself
      // (postgres.js does) would otherwise encode it twice and keep a string.
      await db.unsafe(`insert into ${SCHEMA}.${table} (${list}) select ${list} from jsonb_populate_record(null::${SCHEMA}.${table}, $1::text::jsonb)`, [
        JSON.stringify(row),
      ]);
    },
    async setStatus(transactionId, status) {
      await db.unsafe(`update ${SCHEMA}.raw_transactions set status = $1 where transaction_id = $2 and source_system = 'shopify'`, [status, transactionId]);
    },
  };
}
