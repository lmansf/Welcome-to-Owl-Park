import { describe, expect, it } from 'vitest';
import { fraudConfig, HELD_TAG, HOLD_MS, responsePost, saltedUuid, scoreOrder, scoreRequest, type ScoreRequest } from '../src/fraudLink';
import { gidTail, ORDER_QUERY, ticketLines, type AdminOrder } from '../src/shopify';
import { claimLink, refundHeld, releaseDue, releaseHeld, RELEASE_TAG, storeWebhook, type Desk, type HookDeps } from '../src/storeHooks';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { ticketDesk } from '../src/ticketDesk';

const T0 = Date.UTC(2026, 11, 5, 1, 0, 0);
const SALT = 'a-test-salt-not-a-secret';
const CFG = { url: 'https://pipeline.example/score', key: 'test-key', salt: SALT };

function seq(): (n: number) => Uint8Array {
  let x = 57;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 1103515245 + 12345) >>> 0) >>> 16);
}

const money = (amount: string) => ({ shopMoney: { amount } });

/** An order of two day tickets and a mug, paid by card, from a customer without an account. */
function order(id: string, over: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: `gid://shopify/Order/${id}`,
    name: `#${id}`,
    processedAt: new Date(T0).toISOString(),
    cancelledAt: null,
    totalDiscountsSet: money('0.0'),
    totalTaxSet: money('1.84'),
    totalPriceSet: money('24.82'),
    discountCodes: [],
    customAttributes: [],
    customer: { id: 'gid://shopify/Customer/777', state: 'DISABLED' },
    transactions: [{ kind: 'SALE', status: 'SUCCESS', gateway: 'shopify_payments', paymentDetails: { bin: '424242', number: '•••• •••• •••• 4242' } }],
    risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }] },
    lineItems: {
      nodes: [
        { id: 'gid://shopify/LineItem/11', quantity: 2, originalTotalSet: money('7.98'), discountAllocations: [], product: { handle: 'day-ticket', productType: 'Ticket', kind: { value: 'day' }, hours: null, start: null, end: null } },
        { id: 'gid://shopify/LineItem/12', quantity: 1, originalTotalSet: money('15.00'), discountAllocations: [], product: { handle: 'owl-mug', productType: 'Mug', kind: null, hours: null, start: null, end: null } },
      ],
    },
    ...over,
  };
}

const CLIENT = { user_agent: 'Mozilla/5.0 (Test)', accept_language: 'en-US', browser_width: 1280, browser_height: 800, browser_ip: '203.0.113.9' };

describe('the fraud link (C45): settings', () => {
  it('is on only with an https endpoint, a key and a salt (http only for a stand-in on this machine)', () => {
    expect(fraudConfig({})).toBeNull();
    expect(fraudConfig({ FRAUD_SCORE_URL: CFG.url, FRAUD_SCORE_KEY: 'k' })).toBeNull();
    expect(fraudConfig({ FRAUD_SCORE_URL: CFG.url, FRAUD_SCORE_KEY: 'k', FRAUD_HASH_SALT: 'short' })).toBeNull();
    expect(fraudConfig({ FRAUD_SCORE_URL: CFG.url, FRAUD_SCORE_KEY: 'k', FRAUD_HASH_SALT: SALT })).toEqual({ url: CFG.url, key: 'k', salt: SALT });
    expect(fraudConfig({ FRAUD_SCORE_URL: 'http://pipeline.example/score', FRAUD_SCORE_KEY: 'k', FRAUD_HASH_SALT: SALT })).toBeNull();
    expect(fraudConfig({ FRAUD_SCORE_URL: 'http://localhost:8790/score', FRAUD_SCORE_KEY: 'k', FRAUD_HASH_SALT: SALT })?.url).toBe('http://localhost:8790/score');
    expect(fraudConfig({ FRAUD_SCORE_URL: 'not a url', FRAUD_SCORE_KEY: 'k', FRAUD_HASH_SALT: SALT })).toBeNull();
  });
});

describe('the fraud link (C45): what the Worker sends', () => {
  it('sends the order in the raw transaction shape, with hashes for the guest, the device and the card', async () => {
    const o = order('1001');
    const req = await scoreRequest(o, ticketLines(o), CLIENT, SALT, { transaction: 'tx-1', request: 'rq-1' }, T0);
    const t = req.transaction;
    expect(t).toMatchObject({
      transaction_id: 'tx-1',
      request_id: 'rq-1',
      source_system: 'shopify',
      channel: 'owl-park-web',
      order_number: '#1001',
      event_ts: new Date(T0).toISOString(),
      currency: 'USD',
      subtotal: 22.98,
      discount: 0,
      tax: 1.84,
      total: 24.82,
      is_guest_checkout: true,
      payment_gateway: 'shopify_payments',
      store_risk: 'LOW',
    });
    expect(t.cart).toEqual([
      { line_number: 1, product_handle: 'day-ticket', product_type: 'ticket', qty: 2, unit_price: 3.99, line_discount: 0, line_total: 7.98, attributes: {} },
      { line_number: 2, product_handle: 'owl-mug', product_type: 'merch', qty: 1, unit_price: 15, line_discount: 0, line_total: 15, attributes: {} },
    ]);
    expect(t.guest_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(t.guest_id).toBe(await saltedUuid(SALT, 'guest', '777'));
    expect(t.device_id).toMatch(/^[0-9a-f]{64}$/);
    expect(t.payment_token).toMatch(/^[0-9a-f]{64}$/);
    // The same guest and card hash the same way next time; another salt hashes differently.
    const again = await scoreRequest(o, ticketLines(o), CLIENT, SALT, { transaction: 'tx-2', request: 'rq-2' }, T0);
    expect([again.transaction.guest_id, again.transaction.device_id, again.transaction.payment_token]).toEqual([t.guest_id, t.device_id, t.payment_token]);
    const other = await scoreRequest(o, ticketLines(o), CLIENT, `${SALT}-2`, { transaction: 'tx-3', request: 'rq-3' }, T0);
    expect(other.transaction.guest_id).not.toBe(t.guest_id);
    // Nothing that names or locates the buyer leaves: no IP, no card digits, no customer id.
    const sent = JSON.stringify(req);
    for (const secret of ['203.0.113.9', '424242', '4242', 'Customer/777', 'Mozilla']) expect(sent).not.toContain(secret);
  });

  it("marks a pass from opening night's link with its ticket, and a member checkout as not a guest", async () => {
    const o = order('1002', {
      customer: { id: 'gid://shopify/Customer/9', state: 'ENABLED' },
      customAttributes: [{ key: 'from_ticket', value: 'OWL-7K3Q-PX9M' }],
      totalDiscountsSet: money('14.99'),
      totalTaxSet: money('0.0'),
      totalPriceSet: money('0.0'),
      risk: null,
      transactions: [],
      lineItems: { nodes: [{ id: 'gid://shopify/LineItem/21', quantity: 1, originalTotalSet: money('14.99'), discountAllocations: [{ allocatedAmountSet: money('14.99') }], product: { handle: 'annual-pass', productType: 'Ticket', kind: { value: 'annual' }, hours: null, start: null, end: null } }] },
    });
    const t = (await scoreRequest(o, ticketLines(o), null, SALT, { transaction: 'tx', request: 'rq' }, T0)).transaction;
    expect(t.cart[0]).toMatchObject({ product_type: 'pass', attributes: { from_ticket: 'OWL-7K3Q-PX9M' } });
    expect(t.is_guest_checkout).toBe(false);
    expect([t.device_id, t.payment_token, t.store_risk]).toEqual([null, null, 'NONE']);
    expect([t.subtotal, t.discount, t.total, t.cart[0]!.line_discount, t.cart[0]!.line_total]).toEqual([0, 0, 0, 14.99, 0]);
  });

  it('puts each discount on its line, a code’s and an order-wide one alike, so the amounts add up as in the pipeline', async () => {
    // The annual pass at half price with the night's code ($7.50 off), and $0.75 of a 10% order code shared onto it.
    const o = order('1003', {
      discountCodes: ['NIGHT-CODE'],
      totalDiscountsSet: money('8.25'),
      totalTaxSet: money('0.47'),
      totalPriceSet: money('7.21'),
      lineItems: {
        nodes: [
          {
            id: 'gid://shopify/LineItem/31',
            quantity: 1,
            originalTotalSet: money('14.99'),
            discountAllocations: [{ allocatedAmountSet: money('7.50') }, { allocatedAmountSet: money('0.75') }],
            product: { handle: 'annual-pass', productType: 'Ticket', kind: { value: 'annual' }, hours: null, start: null, end: null },
          },
        ],
      },
    });
    const t = (await scoreRequest(o, ticketLines(o), null, SALT, { transaction: 'tx', request: 'rq' }, T0)).transaction;
    expect(t.cart[0]).toMatchObject({ product_type: 'pass', qty: 1, unit_price: 14.99, line_discount: 8.25, line_total: 6.74 });
    expect(t).toMatchObject({ subtotal: 6.74, discount: 0, tax: 0.47, total: 7.21, promo_code: 'NIGHT-CODE' });
    expect(Math.round((t.subtotal - t.discount + t.tax) * 100)).toBe(Math.round(t.total * 100));
    // A discount the store keeps off every line (on shipping, say) is the order's own.
    const shipped = (await scoreRequest({ ...o, totalDiscountsSet: money('9.25') }, ticketLines(o), null, SALT, { transaction: 'tx', request: 'rq' }, T0)).transaction;
    expect(shipped.discount).toBe(1);
  });
});

/** A scoring endpoint that answers with `answer` after `delayMs`, and records what it was sent. */
function endpoint(answer: unknown, delayMs = 0, status = 200) {
  const got: unknown[] = [];
  const fetchFn = (async (_url: string, init: RequestInit) => {
    got.push(JSON.parse(String(init.body)));
    await new Promise<void>((done, fail) => {
      const t = setTimeout(done, delayMs);
      init.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        fail(new DOMException('aborted', 'AbortError'));
      });
    });
    return Response.json(answer, { status });
  }) as typeof fetch;
  return { fetchFn, got };
}

describe('the fraud link (C45): the verdict', () => {
  const req = { kind: 'score' } as ScoreRequest;

  it('reads the verdict, its score and reason codes', async () => {
    const e = endpoint({ decision: 'review', score: 0.74, reason_codes: ['HIGH_DEVICE_VELOCITY', 7], model_version: 'rules-v0', decision_id: 'd-1' });
    const r = await scoreOrder(CFG, req, e.fetchFn, 500);
    expect(r).toMatchObject({ timedOut: false, verdict: { decision: 'review', score: 0.74, reasonCodes: ['HIGH_DEVICE_VELOCITY'], modelVersion: 'rules-v0', decisionId: 'd-1' } });
  });

  it('gives no verdict when none comes within the budget, or what comes is not one', async () => {
    const slow = await scoreOrder(CFG, req, endpoint({ decision: 'approve', score: 0.1 }, 300).fetchFn, 40);
    expect(slow).toMatchObject({ verdict: null, timedOut: true });
    expect(slow.ms).toBeLessThan(250);
    expect(await scoreOrder(CFG, req, endpoint({ decision: 'maybe', score: 0.1 }).fetchFn, 500)).toMatchObject({ verdict: null, timedOut: false });
    expect(await scoreOrder(CFG, req, endpoint({ error: 'down' }, 0, 500).fetchFn, 500)).toMatchObject({ verdict: null, timedOut: false });
  });

  it("says what the buyer got in the pipeline's words", () => {
    const facts = { transaction: 'tx', request: 'rq', receivedAt: T0, scoringMs: 9, timedOut: false, fallback: false, modelVersion: 'rules-v0' };
    const r = (o: Parameters<typeof responsePost>[2], f = facts) => responsePost('response', f, o, T0 + 40).response;
    expect(r('approved')).toMatchObject({ response_status: 'approved', customer_message_code: 'ORDER_CONFIRMED', total_latency_ms: 40, fraud_scoring_ms: 9, fallback_used: false, fallback_policy: null });
    expect(r('held')).toMatchObject({ response_status: 'step_up', customer_message_code: 'VERIFY_IDENTITY' });
    expect(r('refunded')).toMatchObject({ response_status: 'declined', customer_message_code: 'PAYMENT_NOT_PROCESSED' });
    expect(r('switched-off')).toMatchObject({ response_status: 'declined', customer_message_code: 'PAYMENT_NOT_PROCESSED' });
    expect(r('fail-open', { ...facts, timedOut: true, fallback: true, scoringMs: 2000 })).toMatchObject({ response_status: 'approved', fraud_timeout: true, fallback_used: true, fallback_policy: 'fail_open' });
    expect(responsePost('outcome', facts, 'released-after-24h', T0 + HOLD_MS).response).toMatchObject({ customer_message_code: 'ORDER_CONFIRMED', fallback_used: true, fallback_policy: 'fail_open', outcome: 'released-after-24h' });
  });
});

/** A store and a pipeline together: the Admin API answers from `orders`, and the endpoint from `verdicts`. */
class World {
  readonly orders = new Map<string, AdminOrder>();
  readonly verdicts = new Map<string, { answer: unknown; delayMs?: number; status?: number }>();
  readonly scored: ScoreRequest[] = [];
  readonly told: Array<{ kind: string; response: Record<string, unknown> }> = [];
  readonly ops: Array<{ op: string; variables: Record<string, unknown> }> = [];
  readonly fulfilled = new Set<string>();
  clock = T0;
  /** The store will not let the app read the customer (an app without that scope). */
  refuseCustomer = false;

  readonly fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    if (url === CFG.url) {
      if (body['kind'] !== 'score') {
        this.told.push(body as { kind: string; response: Record<string, unknown> });
        return Response.json({ ok: true });
      }
      const req = body as unknown as ScoreRequest;
      this.scored.push(req);
      const v = this.verdicts.get(req.transaction.order_number.replace('#', '')) ?? { answer: { decision: 'approve', score: 0.1, reason_codes: [] } };
      await new Promise<void>((done, fail) => {
        const t = setTimeout(done, v.delayMs ?? 0);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          fail(new DOMException('aborted', 'AbortError'));
        });
      });
      return Response.json(v.answer, { status: v.status ?? 200 });
    }
    const { query, variables } = body as { query: string; variables: Record<string, unknown> };
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)![1]!;
    this.ops.push({ op, variables });
    const data = (d: unknown) => Response.json({ data: d });
    const id = gidTail(String(variables['id'] ?? variables['orderId'] ?? ''));
    switch (op) {
      case 'OwlParkOrder': {
        // The ticket query never asks who paid (see the payer test below).
        const o = this.orders.get(id);
        return data({ order: o ? { ...o, customer: undefined, transactions: undefined } : null });
      }
      case 'OwlParkOrderPayer': {
        const o = this.orders.get(id);
        if (this.refuseCustomer) return Response.json({ data: { order: o ? { customer: null, transactions: o.transactions ?? [] } : null }, errors: [{ message: 'Access denied for customer field.' }] });
        return data({ order: o ? { customer: o.customer ?? null, transactions: o.transactions ?? [] } : null });
      }
      case 'OwlParkFulfillmentOrders': {
        const done = this.fulfilled.has(id);
        const nodes = this.orders.get(id)!.lineItems.nodes.map((li) => ({ id: `${li.id}0`, remainingQuantity: done ? 0 : li.quantity, lineItem: { id: li.id } }));
        return data({ order: { fulfillmentOrders: { nodes: [{ id: `gid://shopify/FulfillmentOrder/${id}`, status: done ? 'CLOSED' : 'OPEN', lineItems: { nodes } }] } } });
      }
      case 'OwlParkSendTickets': {
        const f = variables['fulfillment'] as { lineItemsByFulfillmentOrder: Array<{ fulfillmentOrderId: string }> };
        this.fulfilled.add(gidTail(f.lineItemsByFulfillmentOrder[0]!.fulfillmentOrderId));
        return data({ fulfillmentCreate: { fulfillment: { id: 'gid://shopify/Fulfillment/1', status: 'SUCCESS' }, userErrors: [] } });
      }
      case 'OwlParkTagsAdd':
        return data({ tagsAdd: { node: { id: variables['id'] }, userErrors: [] } });
      case 'OwlParkTagsRemove':
        return data({ tagsRemove: { node: { id: variables['id'] }, userErrors: [] } });
      case 'OwlParkRefund': {
        const o = this.orders.get(id)!;
        this.orders.set(id, { ...o, cancelledAt: new Date(this.clock).toISOString() });
        return data({ orderCancel: { job: { id: 'gid://shopify/Job/1' }, orderCancelUserErrors: [] } });
      }
      default:
        return data(null);
    }
  }) as typeof fetch;

  opsOf(name: string): Array<Record<string, unknown>> {
    return this.ops.filter((o) => o.op === name).map((o) => o.variables);
  }
}

function park(world: World) {
  const book = new TicketBook(new MemoryTicketStore(), seq());
  const desk: Desk = async (path, body) => {
    const req = body === undefined ? new Request(`https://park${path}`) : new Request(`https://park${path}`, { method: 'POST', body: JSON.stringify(body) });
    const r = await ticketDesk(book, req, world.clock, () => ({ cast: 0, today: false }));
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  let n = 0;
  const deps: HookDeps = {
    store: { shop: 'owl-test.myshopify.com', token: 'shpat_test' },
    desk,
    claimUrl: (s) => claimLink('https://park.example', s),
    origin: 'https://park.example',
    fetchFn: world.fetch,
    wait: async () => {},
    fraud: CFG,
    now: () => world.clock,
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    scoreBudgetMs: 60,
  };
  return { book, deps };
}

const PAID = (id: string) => ({ id: Number(id), admin_graphql_api_id: `gid://shopify/Order/${id}`, tags: '', client_details: CLIENT });

describe('the fraud link (C45): orders through the webhooks', () => {
  it('approve: scored once, released, the link sent, and the pipeline told ORDER_CONFIRMED', async () => {
    const w = new World();
    w.orders.set('2001', order('2001'));
    const { book, deps } = park(w);
    expect((await storeWebhook('orders/paid', PAID('2001'), deps)).body).toEqual({ tickets: 2, sent: true, check: 'approved' });
    expect(w.scored).toHaveLength(1);
    expect(book.orderOf('2001')!.record).toMatchObject({ held: false, sent: true });
    expect(w.told.map((t) => [t.kind, t.response['customer_message_code']])).toEqual([['response', 'ORDER_CONFIRMED']]);
    expect(book.check('2001')).toMatchObject({ decision: 'approve', score: 0.1, outcome: 'approved', responded: true, origin: 'https://park.example' });
    // The store sends the webhook again: no second score, and the pipeline is not told twice.
    await storeWebhook('orders/paid', PAID('2001'), deps);
    expect([w.scored.length, w.told.length, w.opsOf('OwlParkSendTickets').length]).toEqual([1, 1, 1]);
  });

  it('a free order’s two webhooks at the same moment: scored once, one link, and the pipeline told once', async () => {
    const w = new World();
    w.orders.set('2020', order('2020', { totalPriceSet: money('0.0'), transactions: [], risk: null }));
    w.verdicts.set('2020', { answer: { decision: 'approve', score: 0.05, reason_codes: [] }, delayMs: 20 });
    const { deps } = park(w);
    const live: HookDeps = { ...deps, wait: (ms) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 10))) };
    const both = await Promise.all([storeWebhook('orders/create', PAID('2020'), live), storeWebhook('orders/paid', PAID('2020'), live)]);
    expect(both.map((r) => r.body)).toEqual([
      { tickets: 2, sent: true, check: 'approved' },
      { tickets: 2, sent: true, check: 'approved' },
    ]);
    expect([w.scored.length, w.told.length, w.opsOf('OwlParkSendTickets').length]).toEqual([1, 1, 1]);
  });

  it('the owner’s Release while the store’s tag webhook for the same order runs: released once', async () => {
    const w = new World();
    w.orders.set('2021', order('2021'));
    w.verdicts.set('2021', { answer: { decision: 'review', score: 0.75 } });
    const { book, deps } = park(w);
    await storeWebhook('orders/paid', PAID('2021'), deps);
    const live: HookDeps = { ...deps, wait: (ms) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 10))) };
    const [owner, tag] = await Promise.all([releaseHeld(live, '2021', 'released'), storeWebhook('orders/updated', { ...PAID('2021'), tags: RELEASE_TAG }, live)]);
    expect(owner.body).toEqual({ released: true, outcome: 'released' });
    // The tag's webhook waited, then found the order no longer held.
    expect(tag.body).toEqual({ held: false });
    expect(w.opsOf('OwlParkSendTickets')).toHaveLength(1);
    expect(w.told.map((t) => t.kind)).toEqual(['response', 'outcome']);
    expect(book.check('2021')!.outcome).toBe('released');
  });

  it('who paid comes from a query of its own: a store that keeps the customer from the app costs the guest, never the tickets', async () => {
    expect(ORDER_QUERY).not.toMatch(/\bcustomer\b|\btransactions\b/);
    const w = new World();
    w.orders.set('2010', order('2010'));
    w.orders.set('2011', order('2011'));
    const { deps } = park(w);
    await storeWebhook('orders/paid', PAID('2010'), deps);
    expect(w.scored[0]!.transaction.guest_id).toBe(await saltedUuid(SALT, 'guest', '777'));
    w.refuseCustomer = true;
    expect((await storeWebhook('orders/paid', PAID('2011'), deps)).body).toEqual({ tickets: 2, sent: true, check: 'approved' });
    expect(w.scored[1]!.transaction).toMatchObject({ guest_id: null, is_guest_checkout: true });
    expect(w.scored[1]!.transaction.payment_token).toBe(w.scored[0]!.transaction.payment_token);
  });

  it('review: held and tagged, no link; the owner releases it and the link goes out', async () => {
    const w = new World();
    w.orders.set('2002', order('2002'));
    w.verdicts.set('2002', { answer: { decision: 'review', score: 0.74, reason_codes: ['IP_BILLING_MISMATCH'], model_version: 'rules-v0' } });
    const { book, deps } = park(w);
    expect((await storeWebhook('orders/paid', PAID('2002'), deps)).body).toEqual({ tickets: 2, held: true, check: 'held' });
    expect(w.opsOf('OwlParkTagsAdd')).toEqual([{ id: 'gid://shopify/Order/2002', tags: [HELD_TAG] }]);
    expect(w.opsOf('OwlParkSendTickets')).toHaveLength(0);
    expect(w.told.map((t) => t.response['customer_message_code'])).toEqual(['VERIFY_IDENTITY']);
    expect(book.checks(10).held.map((c) => [c.order, c.reasons, c.holdUntil])).toEqual([['2002', ['IP_BILLING_MISMATCH'], T0 + HOLD_MS]]);
    // Shopify's own later rating does not release it: the pipeline decided.
    expect((await storeWebhook('orders/risk_assessment_changed', PAID('2002'), deps)).body).toEqual({ held: true });
    const r = await releaseHeld(deps, '2002', 'released');
    expect(r).toMatchObject({ status: 200, body: { released: true, outcome: 'released' } });
    expect(w.opsOf('OwlParkSendTickets')).toHaveLength(1);
    expect(w.opsOf('OwlParkTagsRemove')).toEqual([{ id: 'gid://shopify/Order/2002', tags: [HELD_TAG] }]);
    expect(book.orderOf('2002')!.record.held).toBe(false);
    expect(w.told.at(-1)).toMatchObject({ kind: 'outcome', response: { outcome: 'released', customer_message_code: 'ORDER_CONFIRMED', fallback_used: false } });
    expect(book.checks(10).held).toEqual([]);
    expect((await releaseHeld(deps, '2002', 'released')).status).toBe(409);
  });

  it("review: the owner's order tag releases it too", async () => {
    const w = new World();
    w.orders.set('2003', order('2003'));
    w.verdicts.set('2003', { answer: { decision: 'review', score: 0.7 } });
    const { book, deps } = park(w);
    await storeWebhook('orders/paid', PAID('2003'), deps);
    expect((await storeWebhook('orders/updated', { ...PAID('2003'), tags: `x, ${RELEASE_TAG}` }, deps)).body).toEqual({ released: true, outcome: 'released' });
    expect(book.check('2003')!.outcome).toBe('released');
  });

  it('review: left 24 hours with no action, it is released (fail open)', async () => {
    const w = new World();
    w.orders.set('2004', order('2004'));
    w.verdicts.set('2004', { answer: { decision: 'review', score: 0.8 } });
    const { book, deps } = park(w);
    await storeWebhook('orders/paid', PAID('2004'), deps);
    w.clock = T0 + HOLD_MS - 1;
    expect(await releaseDue(deps)).toBe(0);
    w.clock = T0 + HOLD_MS;
    expect(await releaseDue(deps)).toBe(1);
    expect(book.check('2004')!.outcome).toBe('released-after-24h');
    expect(book.orderOf('2004')!.record).toMatchObject({ held: false, sent: true });
    expect(w.told.at(-1)!.response).toMatchObject({ outcome: 'released-after-24h', fallback_used: true, fallback_policy: 'fail_open' });
  });

  it('review: one held before the fraud link was switched off is still released after its 24 hours', async () => {
    const w = new World();
    w.orders.set('2012', order('2012'));
    w.verdicts.set('2012', { answer: { decision: 'review', score: 0.77 } });
    const { book, deps } = park(w);
    await storeWebhook('orders/paid', PAID('2012'), deps);
    const off: HookDeps = { ...deps };
    delete off.fraud;
    w.clock = T0 + HOLD_MS;
    expect(await releaseDue(off)).toBe(1);
    expect(book.orderOf('2012')!.record).toMatchObject({ held: false, sent: true });
    expect(w.opsOf('OwlParkTagsRemove')).toEqual([{ id: 'gid://shopify/Order/2012', tags: [HELD_TAG] }]);
    // With the link off the pipeline hears nothing more.
    expect(w.told.map((t) => t.kind)).toEqual(['response']);
  });

  it('review: the owner refunds it through the store, and its tickets stop working', async () => {
    const w = new World();
    w.orders.set('2005', order('2005'));
    w.verdicts.set('2005', { answer: { decision: 'review', score: 0.81 } });
    const { book, deps } = park(w);
    await storeWebhook('orders/paid', PAID('2005'), deps);
    expect((await refundHeld(deps, '2005')).body).toEqual({ refunded: true, outcome: 'refunded' });
    expect(w.opsOf('OwlParkRefund')).toEqual([{ orderId: 'gid://shopify/Order/2005', refundMethod: { originalPaymentMethodsRefund: true } }]);
    expect(book.orderOf('2005')!.tickets.every((t) => t.revoked !== null)).toBe(true);
    expect(w.told.at(-1)!.response).toMatchObject({ outcome: 'refunded', customer_message_code: 'PAYMENT_NOT_PROCESSED' });
    // Nothing is left to release after its 24 hours.
    w.clock = T0 + HOLD_MS;
    expect(await releaseDue(deps)).toBe(0);
  });

  it('review: cancelled in the store meanwhile, it is settled and never released', async () => {
    const w = new World();
    w.orders.set('2006', order('2006'));
    w.verdicts.set('2006', { answer: { decision: 'review', score: 0.75 } });
    const { book, deps } = park(w);
    await storeWebhook('orders/paid', PAID('2006'), deps);
    await storeWebhook('orders/cancelled', PAID('2006'), deps);
    expect(book.check('2006')!.outcome).toBe('refunded');
    w.clock = T0 + HOLD_MS;
    expect(await releaseDue(deps)).toBe(0);
    expect(w.opsOf('OwlParkSendTickets')).toHaveLength(0);
  });

  it('decline: refunded through the store at once, with no ticket made', async () => {
    const w = new World();
    w.orders.set('2007', order('2007'));
    w.verdicts.set('2007', { answer: { decision: 'decline', score: 0.93, reason_codes: ['MANY_CARDS_ON_DEVICE'] } });
    const { book, deps } = park(w);
    expect((await storeWebhook('orders/paid', PAID('2007'), deps)).body).toEqual({ tickets: 0, check: 'refunded' });
    expect(w.opsOf('OwlParkRefund')).toHaveLength(1);
    expect(book.orderOf('2007')).toBeNull();
    expect(w.told.map((t) => t.response['customer_message_code'])).toEqual(['PAYMENT_NOT_PROCESSED']);
    // The store's cancellation webhook that follows changes nothing.
    expect((await storeWebhook('orders/cancelled', PAID('2007'), deps)).body).toEqual({ revoked: 0 });
  });

  it('decline: a free order has nothing to refund, so it is only switched off', async () => {
    const w = new World();
    w.orders.set('2008', order('2008', { totalPriceSet: money('0.0'), transactions: [], risk: null }));
    w.verdicts.set('2008', { answer: { decision: 'decline', score: 0.9 } });
    const { book, deps } = park(w);
    expect((await storeWebhook('orders/create', PAID('2008'), deps)).body).toEqual({ tickets: 0, check: 'switched-off' });
    expect(w.opsOf('OwlParkRefund')).toHaveLength(0);
    expect(book.orderOf('2008')).toBeNull();
    expect(book.check('2008')!.outcome).toBe('switched-off');
  });

  it('no answer within 2 seconds: released (fail open), and a verdict that comes later changes nothing', async () => {
    const w = new World();
    w.orders.set('2009', order('2009'));
    w.verdicts.set('2009', { answer: { decision: 'decline', score: 0.95 }, delayMs: 400 });
    const { book, deps } = park(w);
    expect((await storeWebhook('orders/paid', PAID('2009'), deps)).body).toEqual({ tickets: 2, sent: true, check: 'fail-open' });
    expect(book.check('2009')).toMatchObject({ decision: 'fail-open', timedOut: true, fallback: true, score: null });
    expect(w.told[0]!.response).toMatchObject({ customer_message_code: 'ORDER_CONFIRMED', fraud_timeout: true, fallback_used: true, fallback_policy: 'fail_open' });
    await new Promise((r) => setTimeout(r, 450));
    expect(w.opsOf('OwlParkRefund')).toHaveLength(0);
    expect(book.check('2009')!.outcome).toBe('fail-open');
  });

  it('an endpoint that answers with an error fails open too, without a timeout', async () => {
    const w = new World();
    w.orders.set('2010', order('2010'));
    w.verdicts.set('2010', { answer: { error: 'down' }, status: 500 });
    const { book, deps } = park(w);
    expect((await storeWebhook('orders/paid', PAID('2010'), deps)).body).toMatchObject({ sent: true, check: 'fail-open' });
    expect(book.check('2010')).toMatchObject({ timedOut: false, fallback: true });
  });
});
