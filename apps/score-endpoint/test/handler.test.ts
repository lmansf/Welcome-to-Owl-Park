import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameTables, handle, MODEL_VERSION, type Db, type Deps, type Row, type Table, type Tables } from '../src/handler.ts';

const KEY = 'test-key-not-a-secret-0123456789';
const T0 = Date.UTC(2026, 11, 6, 0, 4, 13);
const TX = '0b7d6c1e-5f2a-4c39-9e0a-7d4b2f8a1c55';
const REQ = 'c2a9e4f0-81d3-4b6e-a7f5-3e9d0c4b6a12';
const HASH = 'a'.repeat(64);

/** The scoring request in the contract's shape (docs/ARCHITECTURE.md, the fraud link). */
const transaction = (extra: Record<string, unknown> = {}) => ({
  transaction_id: TX,
  request_id: REQ,
  source_system: 'shopify',
  channel: 'owl-park-web',
  order_number: '#1042',
  event_ts: '2026-12-06T00:04:12Z',
  currency: 'USD',
  subtotal: 7.49,
  discount: 0,
  tax: 0.52,
  total: 8.01,
  promo_code: 'NIGHT-CODE',
  is_guest_checkout: true,
  guest_id: '9a3e51c0-7b2d-4f18-a6c3-52e0d17b8f94',
  device_id: HASH,
  payment_token: 'b'.repeat(64),
  payment_gateway: 'shopify_payments',
  store_risk: 'LOW',
  cart: [{ line_number: 1, product_handle: 'annual-pass', product_type: 'pass', qty: 1, unit_price: 14.99, line_discount: 7.5, line_total: 7.49, attributes: { from_ticket: 'OWL-7K3Q-PX9M' } }],
  ...extra,
});

const response = (outcome: string, extra: Record<string, unknown> = {}) => ({
  transaction_id: TX,
  request_id: REQ,
  request_received_at: '2026-12-06T00:04:13.120Z',
  response_sent_at: '2026-12-06T00:04:13.410Z',
  response_status: 'approved',
  customer_message_code: 'ORDER_CONFIRMED',
  total_latency_ms: 290,
  fraud_scoring_ms: 212,
  payment_auth_ms: null,
  fraud_timeout: false,
  fallback_used: false,
  fallback_policy: null,
  channel: 'owl-park-web',
  model_version: MODEL_VERSION,
  outcome,
  ...extra,
});

/** The pipeline's tables in memory. */
class FakeTables implements Tables {
  readonly rows: Array<{ table: Table; row: Row }> = [];
  readonly statuses: Array<[string, string]> = [];
  fail = false;
  async check() {
    if (this.fail) throw new Error('the database is down');
  }
  async insert(table: Table, row: Row) {
    if (this.fail) throw new Error('the database is down');
    this.rows.push({ table, row });
  }
  async setStatus(transactionId: string, status: 'completed' | 'declined') {
    if (this.fail) throw new Error('the database is down');
    this.statuses.push([transactionId, status]);
  }
  of(table: Table): Row[] {
    return this.rows.filter((r) => r.table === table).map((r) => r.row);
  }
}

function setup(extra: Partial<Deps> = {}) {
  const tables = new FakeTables();
  let n = 0;
  const deps: Deps = { key: KEY, tables, now: () => T0, uuid: () => `00000000-0000-4000-8000-00000000000${n++}`, ...extra };
  return { tables, deps };
}

const post = (body: unknown, key = KEY, init: RequestInit = {}) =>
  new Request('https://pipeline.example/functions/v1/owl-park-score', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body), ...init });

afterEach(() => vi.restoreAllMocks());

describe('the scoring endpoint: who may call it', () => {
  it('refuses everything until its key is set, and refuses a short key', async () => {
    for (const key of [undefined, '', 'short-key']) expect((await handle(post({ kind: 'score' }), setup({ key }).deps)).status).toBe(503);
  });

  it('takes only the park’s key, as a bearer token', async () => {
    const { deps } = setup();
    expect((await handle(post({ kind: 'score', transaction: transaction() }, 'someone-elses-key-0123456789'), deps)).status).toBe(401);
    const bare = new Request('https://pipeline.example/', { method: 'POST', headers: { Authorization: KEY }, body: '{}' });
    expect((await handle(bare, deps)).status).toBe(401);
    expect((await handle(new Request('https://pipeline.example/', { method: 'POST', body: '{}' }), deps)).status).toBe(401);
  });

  it('answers only a POST of JSON it knows, of a sensible size', async () => {
    const { deps, tables } = setup();
    const get = new Request('https://pipeline.example/', { headers: { Authorization: `Bearer ${KEY}` } });
    expect((await handle(get, deps)).status).toBe(405);
    expect((await handle(post('not json'), deps)).status).toBe(400);
    expect((await handle(post({ kind: 'refund' }), deps)).status).toBe(400);
    expect((await handle(post({ kind: 'score', transaction: transaction({ transaction_id: 'nope' }) }), deps)).status).toBe(400);
    expect((await handle(post({ kind: 'response', response: response('approved', { request_id: 7 }) }), deps)).status).toBe(400);
    expect((await handle(post({ kind: 'score', pad: 'x'.repeat(70_000) }), deps)).status).toBe(413);
    expect(tables.rows).toEqual([]);
  });
});

describe('the scoring endpoint: an order to score', () => {
  it('approves it and keeps the order and the verdict, marked as the park’s', async () => {
    const { deps, tables } = setup();
    const res = await handle(post({ kind: 'score', transaction: transaction() }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ decision: 'approve', score: 0, reason_codes: [], model_version: MODEL_VERSION, decision_id: '00000000-0000-4000-8000-000000000000' });

    const [order] = tables.of('raw_transactions');
    expect(order).toEqual({
      source_system: 'shopify',
      raw_payload: transaction(),
      transaction_id: TX,
      request_id: REQ,
      event_ts: '2026-12-06T00:04:12.000Z',
      guest_id: '9a3e51c0-7b2d-4f18-a6c3-52e0d17b8f94',
      is_guest_checkout: true,
      channel: 'owl-park-web',
      device_id: HASH,
      payment_token: 'b'.repeat(64),
      currency: 'USD',
      subtotal: 7.49,
      discount: 0,
      tax: 0.52,
      total: 8.01,
      promo_code: 'NIGHT-CODE',
      cart: [{ line_number: 1, sku: 'annual-pass', product_name: null, product_type: 'annual_pass', qty: 1, unit_price: 14.99, line_discount: 7.5, line_total: 7.49, attributes: { from_ticket: 'OWL-7K3Q-PX9M' } }],
    });
    // No column that could name the buyer is ever set.
    for (const col of ['email', 'phone', 'ip_address', 'user_agent', 'card_bin', 'card_last4', 'billing_name', 'billing_postal']) expect(order).not.toHaveProperty(col);

    expect(tables.of('raw_fraud_decisions')).toEqual([
      {
        source_system: 'shopify',
        decision_id: '00000000-0000-4000-8000-000000000000',
        transaction_id: TX,
        request_id: REQ,
        decided_at: new Date(T0).toISOString(),
        score: 0,
        decision: 'approve',
        reason_codes: [],
        model_version: MODEL_VERSION,
        model_latency_ms: 0,
        features_json: {
          order_total: 8.01,
          n_items: 1,
          is_guest_checkout: true,
          account_age_days: null,
          device_txn_1h: null,
          device_distinct_cards_1h: null,
          ip_billing_mismatch: null,
          headless_browser: null,
          n_distinct_guest_names: 0,
          gift_card_share: 0,
        },
      },
    ]);
  });

  it('maps the park’s product types and fills what an older Worker leaves out', async () => {
    const { deps, tables } = setup();
    const cart = [
      { line_number: 1, product_handle: 'day-ticket', product_type: 'ticket', qty: 2, line_total: 7.98, attributes: {} },
      { line_number: 2, product_handle: 'owl-pin', product_type: 'merch', qty: 1, line_total: 5, attributes: { note: 'x'.repeat(80), 'Bad Key': 'y' } },
      { product_type: 'gift', qty: 0, line_total: 'free' },
    ];
    await handle(post({ kind: 'score', transaction: transaction({ cart, guest_id: null, device_id: 'not-a-hash', event_ts: 'yesterday' }) }), deps);
    const [order] = tables.of('raw_transactions');
    expect(order!['cart']).toEqual([
      { line_number: 1, sku: 'day-ticket', product_name: null, product_type: 'day_ticket', qty: 2, unit_price: 3.99, line_discount: 0, line_total: 7.98, attributes: {} },
      { line_number: 2, sku: 'owl-pin', product_name: null, product_type: 'merch', qty: 1, unit_price: 5, line_discount: 0, line_total: 5, attributes: {} },
      { line_number: 3, sku: null, product_name: null, product_type: 'other', qty: 1, unit_price: 0, line_discount: 0, line_total: 0, attributes: {} },
    ]);
    expect([order!['guest_id'], order!['device_id'], order!['event_ts']]).toEqual([null, null, new Date(T0).toISOString()]);
    expect((tables.of('raw_fraud_decisions')[0]!['features_json'] as Row)['n_items']).toBe(4);
  });

  it('still approves when the tables cannot take the order, and says so in the log', async () => {
    const { deps, tables } = setup();
    tables.fail = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handle(post({ kind: 'score', transaction: transaction() }), deps);
    expect(await res.json()).toMatchObject({ decision: 'approve', score: 0 });
    expect(log).toHaveBeenCalledWith('[owl-park-score] the order was not kept:', 'the database is down');
    const none = await handle(post({ kind: 'score', transaction: transaction() }), setup({ tables: null }).deps);
    expect(await none.json()).toMatchObject({ decision: 'approve' });
    expect(log).toHaveBeenCalledWith('[owl-park-score] no tables to keep the order in');
  });

  it('keeps nothing on a dry run, and says whether it can reach the tables', async () => {
    const { deps, tables } = setup();
    const dry = { kind: 'score', dry_run: true, transaction: { transaction_id: TX, request_id: REQ, total: 3.99, cart: [] } };
    expect(await (await handle(post(dry), deps)).json()).toMatchObject({ decision: 'approve', score: 0, dry_run: true, tables: 'ok' });
    expect(tables.rows).toEqual([]);
    tables.fail = true;
    expect(await (await handle(post(dry), deps)).json()).toMatchObject({ decision: 'approve', tables: 'unreachable: the database is down' });
    expect(await (await handle(post(dry), setup({ tables: null }).deps)).json()).toMatchObject({ tables: 'not set up' });
  });

  it('keeps the order before it answers, so the response that follows finds it', async () => {
    const { deps, tables } = setup();
    let kept = false;
    const slow: Tables = {
      check: () => tables.check(),
      insert: async (table, row) => {
        await new Promise((r) => setTimeout(r, 20));
        await tables.insert(table, row);
        kept = true;
      },
      setStatus: (id, s) => tables.setStatus(id, s),
    };
    await handle(post({ kind: 'score', transaction: transaction() }), { ...deps, tables: slow });
    expect(kept).toBe(true);
  });
});

describe('the scoring endpoint: what the buyer got', () => {
  it('keeps the checkout response and sets the order’s final status', async () => {
    const { deps, tables } = setup();
    const res = await handle(post({ kind: 'response', response: response('approved') }), deps);
    expect(await res.json()).toEqual({ ok: true });
    expect(tables.of('raw_checkout_responses')).toEqual([
      {
        source_system: 'shopify',
        raw_payload: { outcome: 'approved' },
        response_id: '00000000-0000-4000-8000-000000000000',
        transaction_id: TX,
        request_id: REQ,
        request_received_at: '2026-12-06T00:04:13.120Z',
        response_sent_at: '2026-12-06T00:04:13.410Z',
        response_status: 'approved',
        customer_message_code: 'ORDER_CONFIRMED',
        total_latency_ms: 290,
        fraud_scoring_ms: 212,
        payment_auth_ms: null,
        fraud_timeout: false,
        fallback_used: false,
        fallback_policy: null,
        channel: 'owl-park-web',
        model_version: MODEL_VERSION,
      },
    ]);
    expect(tables.statuses).toEqual([[TX, 'completed']]);
  });

  it('leaves a held order without a status until its outcome, which changes only the status', async () => {
    const { deps, tables } = setup();
    await handle(post({ kind: 'response', response: response('held', { response_status: 'step_up', customer_message_code: 'VERIFY_IDENTITY' }) }), deps);
    expect(tables.of('raw_checkout_responses').map((r) => r['response_status'])).toEqual(['step_up']);
    expect(tables.statuses).toEqual([]);
    await handle(post({ kind: 'outcome', response: response('released-after-24h', { fallback_used: true, fallback_policy: 'fail_open' }) }), deps);
    expect(tables.of('raw_checkout_responses')).toHaveLength(1);
    expect(tables.statuses).toEqual([[TX, 'completed']]);
  });

  it('marks a refunded or switched-off order declined', async () => {
    const { deps, tables } = setup();
    await handle(post({ kind: 'response', response: response('refunded', { response_status: 'declined', customer_message_code: 'PAYMENT_NOT_PROCESSED' }) }), deps);
    await handle(post({ kind: 'outcome', response: response('switched-off') }), deps);
    expect(tables.statuses).toEqual([
      [TX, 'declined'],
      [TX, 'declined'],
    ]);
  });

  it('drops a value it does not know rather than keep it', async () => {
    const { deps, tables } = setup();
    await handle(post({ kind: 'response', response: response('approved', { response_status: 'maybe', fallback_policy: 'fail_closed', total_latency_ms: 'slow', outcome: 'lost' }) }), deps);
    expect(tables.of('raw_checkout_responses')[0]).toMatchObject({ response_status: null, fallback_policy: null, total_latency_ms: null, raw_payload: { outcome: 'lost' } });
    expect(tables.statuses).toEqual([]);
  });
});

describe('the park’s tables in the pipeline’s game schema', () => {
  function recorder(fail?: Error) {
    const calls: Array<{ query: string; params: unknown[] }> = [];
    const db: Db = {
      async unsafe(query, params) {
        calls.push({ query, params });
        if (fail) throw fail;
        return [];
      },
    };
    return { calls, db };
  }

  it('inserts a row as one parameter, its JSON, which the database spreads over the columns named', async () => {
    const { calls, db } = recorder();
    await gameTables(db).insert('raw_fraud_decisions', { decision: 'approve', reason_codes: ['A'], features_json: { n_items: 1 }, model_latency_ms: undefined });
    expect(calls).toEqual([
      {
        query:
          'insert into game.raw_fraud_decisions (decision, reason_codes, features_json) select decision, reason_codes, features_json from jsonb_populate_record(null::game.raw_fraud_decisions, $1::text::jsonb)',
        params: ['{"decision":"approve","reason_codes":["A"],"features_json":{"n_items":1}}'],
      },
    ]);
  });

  it('sets the status on the park’s row only', async () => {
    const { calls, db } = recorder();
    await gameTables(db).setStatus(TX, 'declined');
    expect(calls).toEqual([{ query: "update game.raw_transactions set status = $1 where transaction_id = $2 and source_system = 'shopify'", params: ['declined', TX] }]);
  });

  it('checks the connection with a read of one row', async () => {
    const { calls, db } = recorder();
    await gameTables(db).check();
    expect(calls).toEqual([{ query: 'select 1 from game.raw_transactions limit 1', params: [] }]);
  });

  it('never writes a name it does not trust into the query', async () => {
    const { calls, db } = recorder();
    await expect(gameTables(db).insert('raw_transactions', { 'status) select 1; --': 'x' })).rejects.toThrow('not a column');
    expect(calls).toEqual([]);
  });

  it('throws when the database refuses, with what it said', async () => {
    const { db } = recorder(new Error('permission denied for schema game'));
    await expect(gameTables(db).insert('raw_transactions', { status: null })).rejects.toThrow('permission denied for schema game');
    await expect(gameTables(db).check()).rejects.toThrow('permission denied for schema game');
  });
});
