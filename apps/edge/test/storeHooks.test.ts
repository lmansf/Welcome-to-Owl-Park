import { describe, expect, it } from 'vitest';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { FakeStore, seq } from './fakeStore';
import { claimLink, mirrorTickets, orderIdOf, RELEASE_TAG, storeWebhook, type Desk, type HookDeps } from '../src/storeHooks';
import { ticketDesk } from '../src/ticketDesk';
import type { TicketMirror } from '../src/storeApi';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);

function park(store: FakeStore, opts: { failSent?: number } = {}) {
  const book = new TicketBook(new MemoryTicketStore(), seq());
  let failSent = opts.failSent ?? 0;
  const desk: Desk = async (path, body) => {
    if (path === '/tickets/sent' && failSent > 0) {
      failSent--;
      return { status: 500, body: { error: 'down' } };
    }
    const req = body === undefined ? new Request(`https://park${path}`) : new Request(`https://park${path}`, { method: 'POST', body: JSON.stringify(body) });
    const r = await ticketDesk(book, req, T0, () => ({ cast: 0, today: false }));
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  const deps: HookDeps = { store: { shop: 'owl-test.myshopify.com', token: 'shpat_test' }, desk, claimUrl: (s) => claimLink('https://park.example', s), fetchFn: store.fetch, wait: async () => {} };
  const secretOf = (fulfillment: Record<string, unknown>) => String((fulfillment['trackingInfo'] as { url: string }).url).split('#claim=')[1]!;
  return { book, deps, secretOf };
}

const PAID = { id: 1001, admin_graphql_api_id: 'gid://shopify/Order/1001', tags: '' };

describe('the store webhooks', () => {
  it('a paid order rated low risk gets its tickets, and the store emails the claim link with only the ticket line', async () => {
    const store = new FakeStore();
    const { book, deps, secretOf } = park(store);
    const r = await storeWebhook('orders/paid', PAID, deps);
    // Made just now (OP-134 logs it as order_recorded).
    expect(r).toEqual({ status: 200, body: { tickets: 2, sent: true }, mirror: '1001', recorded: { tickets: 2, held: false } });
    expect(store.sent).toHaveLength(1);
    const f = store.sent[0]!;
    expect(f['notifyCustomer']).toBe(true);
    expect(f['lineItemsByFulfillmentOrder']).toEqual([{ fulfillmentOrderId: 'gid://shopify/FulfillmentOrder/7', fulfillmentOrderLineItems: [{ id: 'gid://shopify/FulfillmentOrderLineItem/71', quantity: 2 }] }]);
    const tracking = f['trackingInfo'] as { company: string; numbers: string[]; url: string };
    expect(tracking.company).toBe('Owl Park');
    expect(tracking.url).toMatch(/^https:\/\/park\.example\/#claim=[A-Za-z0-9_-]{43}$/);
    expect(tracking.numbers).toEqual(book.orderOf('1001')!.tickets.map((t) => t.id));
    // The link works, and the store sending the webhook again changes nothing.
    expect(await book.claim(secretOf(f), 'c_buyer')).toHaveLength(2);
    // Again: nothing new is recorded, and the repeat is said (OP-134's webhook_duplicate).
    expect(await storeWebhook('orders/paid', PAID, deps)).toEqual({ status: 200, body: { tickets: 2, sent: true }, mirror: '1001', repeat: true });
    expect(store.sent).toHaveLength(1);
    expect(book.orderOf('1001')!.tickets).toHaveLength(2);
  });

  it('a paid order from the booth’s checkout puts its tickets on the owl that paid, and the claim email still goes (OP-175)', async () => {
    const store = new FakeStore();
    const { book, deps } = park(store);
    store.attributes = [{ key: 'owl_checkout', value: await book.newCheckout('c_buyer', T0) }];
    const r = await storeWebhook('orders/paid', PAID, deps);
    expect(r).toMatchObject({ status: 200, body: { tickets: 2, sent: true }, placed: { device: 'c_buyer', tickets: 2 } });
    expect(book.wallet('c_buyer', T0)).toHaveLength(2);
    expect(store.sent).toHaveLength(1);
    // Again: nothing moves a second time.
    expect(await storeWebhook('orders/paid', PAID, deps)).not.toHaveProperty('placed');
  });

  it('a checkout token that does not work, or a desk that fails to place, never fails the webhook: the email does it (OP-175)', async () => {
    const store = new FakeStore();
    const { book, deps } = park(store);
    store.attributes = [{ key: 'owl_checkout', value: 'B'.repeat(43) }];
    expect(await storeWebhook('orders/paid', PAID, deps)).not.toHaveProperty('placed');
    expect(store.sent).toHaveLength(1);
    const other = new FakeStore();
    const p2 = park(other);
    other.attributes = [{ key: 'owl_checkout', value: await p2.book.newCheckout('c_buyer', T0) }];
    const broken: HookDeps = { ...p2.deps, desk: async (path, body) => (path === '/tickets/place' ? Promise.reject(new Error('desk away')) : p2.deps.desk(path, body)) };
    expect(await storeWebhook('orders/paid', PAID, broken)).toMatchObject({ status: 200, body: { tickets: 2, sent: true } });
    expect(other.sent).toHaveLength(1);
    expect(p2.book.wallet('c_buyer', T0)).toHaveLength(0);
    expect(book.wallet('c_buyer', T0)).toHaveLength(0);
  });

  it('a held order from the booth’s checkout waits on the owl, held, with no email until it is released (OP-175)', async () => {
    const store = new FakeStore();
    store.risk = ['MEDIUM'];
    const { book, deps } = park(store);
    store.attributes = [{ key: 'owl_checkout', value: await book.newCheckout('c_buyer', T0) }];
    expect(await storeWebhook('orders/paid', PAID, deps)).toMatchObject({ body: { tickets: 2, held: true }, placed: { device: 'c_buyer', tickets: 2 } });
    expect(book.wallet('c_buyer', T0).map((t) => t.status)).toEqual(['held', 'held']);
    expect(store.sent).toHaveLength(0);
  });

  it('the store sending an order’s webhook twice at once: one link goes out, and it opens the tickets', async () => {
    // A free order's orders/create and orders/paid come together (C42); a paid order's webhook can come twice.
    const store = new FakeStore();
    store.fulfilDelayMs = 30;
    const { book, deps, secretOf } = park(store);
    const live: HookDeps = { ...deps, wait: (ms) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 10))) };
    const both = await Promise.all([storeWebhook('orders/paid', PAID, live), storeWebhook('orders/paid', PAID, live)]);
    expect(both.map((r) => r.body)).toEqual([
      { tickets: 2, sent: true },
      { tickets: 2, sent: true },
    ]);
    expect(store.sent).toHaveLength(1);
    expect(await book.claim(secretOf(store.sent[0]!), 'c_buyer')).toHaveLength(2);
  });

  it('a webhook that finds another working on its order too long fails, so the store sends it again later', async () => {
    const store = new FakeStore();
    const { book, deps } = park(store);
    expect(book.lease('1001', T0)).toBe(true);
    await expect(storeWebhook('orders/paid', PAID, deps)).rejects.toThrow(/busy/);
    expect(store.sent).toHaveLength(0);
    book.unlease('1001');
    expect((await storeWebhook('orders/paid', PAID, deps)).body).toEqual({ tickets: 2, sent: true });
  });

  it('an order of merch only makes no tickets and writes nothing to the store', async () => {
    const store = new FakeStore();
    const { deps } = park(store);
    store.order = () => ({ id: 'gid://shopify/Order/1001', risk: null, lineItems: { nodes: [{ id: 'gid://shopify/LineItem/12', quantity: 1, product: { productType: 'Mug' } }] } });
    expect(await storeWebhook('orders/paid', PAID, deps)).toEqual({ status: 200, body: { tickets: 0 } });
    expect(store.ops()).toEqual(['OwlParkOrder']);
  });

  it('looks once more at a rating still in progress before holding the order', async () => {
    const store = new FakeStore();
    store.risk = ['PENDING', 'LOW'];
    const { deps } = park(store);
    expect((await storeWebhook('orders/paid', PAID, deps)).body).toEqual({ tickets: 2, sent: true });
    expect(store.ops().slice(0, 2)).toEqual(['OwlParkOrder', 'OwlParkOrder']);
  });

  it('holds an order the store does not rate low risk, until the owner tags it or a later rating is low', async () => {
    const store = new FakeStore();
    store.risk = ['MEDIUM'];
    const { book, deps, secretOf } = park(store);
    expect((await storeWebhook('orders/paid', PAID, deps)).body).toEqual({ tickets: 2, held: true });
    expect(store.sent).toHaveLength(0);
    expect(book.orderOf('1001')!.tickets.every((t) => t.held)).toBe(true);
    // An unrelated change to the order: still held.
    expect((await storeWebhook('orders/updated', { ...PAID, tags: 'gift' }, deps)).body).toEqual({ held: true });
    // The owner's fraud check passes it.
    expect(await storeWebhook('orders/updated', { ...PAID, tags: `gift, ${RELEASE_TAG}` }, deps)).toEqual({ status: 200, body: { released: true }, mirror: '1001' });
    expect(store.sent).toHaveLength(1);
    expect(await book.claim(secretOf(store.sent[0]!), 'c_buyer')).toHaveLength(2);
    // Later updates leave it alone.
    expect((await storeWebhook('orders/updated', { ...PAID, tags: RELEASE_TAG }, deps)).body).toEqual({ held: false });
    expect(store.sent).toHaveLength(1);
  });

  it('releases a held order when a later rating comes back low', async () => {
    const store = new FakeStore();
    store.risk = ['PENDING'];
    const { deps } = park(store);
    expect((await storeWebhook('orders/paid', PAID, deps)).body).toMatchObject({ held: true });
    store.risk = ['LOW'];
    expect((await storeWebhook('orders/risk_assessment_changed', PAID, deps)).body).toEqual({ released: true });
    expect(store.sent).toHaveLength(1);
  });

  it('a send that failed is tried again with a new link; the one that never went out stops working', async () => {
    const store = new FakeStore();
    store.failFulfil = 1;
    const { book, deps, secretOf } = park(store);
    await expect(storeWebhook('orders/paid', PAID, deps)).rejects.toThrow(/503/);
    const firstClaim = store.calls.length; // the store retries the webhook later
    expect(firstClaim).toBeGreaterThan(0);
    expect((await storeWebhook('orders/paid', PAID, deps)).body).toEqual({ tickets: 2, sent: true });
    expect(store.sent).toHaveLength(1);
    expect(await book.claim(secretOf(store.sent[0]!), 'c_buyer')).toHaveLength(2);
    expect(book.orderOf('1001')!.record.sent).toBe(true);
  });

  it('a link that went out is never replaced, even when the park missed that it went', async () => {
    const store = new FakeStore();
    const { book, deps, secretOf } = park(store, { failSent: 1 });
    await expect(storeWebhook('orders/paid', PAID, deps)).rejects.toThrow(/sent/);
    expect(store.sent).toHaveLength(1);
    expect((await storeWebhook('orders/paid', PAID, deps)).body).toEqual({ tickets: 2, sent: true });
    expect(store.sent).toHaveLength(1);
    expect(await book.claim(secretOf(store.sent[0]!), 'c_buyer')).toHaveLength(2);
  });

  it('a refund switches off that many tickets of the line; a cancellation the rest', async () => {
    const store = new FakeStore();
    const { book, deps } = park(store);
    await storeWebhook('orders/paid', PAID, deps);
    const refund = { id: 5, order_id: 1001, refund_line_items: [{ line_item_id: 11, quantity: 1 }, { line_item_id: 12, quantity: 1 }] };
    expect(await storeWebhook('refunds/create', refund, deps)).toEqual({ status: 200, body: { revoked: 1 }, mirror: '1001' });
    expect(book.orderOf('1001')!.tickets.filter((t) => t.revoked !== null)).toHaveLength(1);
    expect((await storeWebhook('refunds/create', { id: 6, order_id: 1001, refund_line_items: [] }, deps)).body).toEqual({ revoked: 0 });
    expect((await storeWebhook('orders/cancelled', PAID, deps)).body).toEqual({ revoked: 1 });
    expect(book.orderOf('1001')!.tickets.every((t) => t.revoked !== null)).toBe(true);
  });

  it('leaves alone what it does not handle', async () => {
    const store = new FakeStore();
    const { deps } = park(store);
    expect((await storeWebhook('products/update', PAID, deps)).body).toEqual({ ignored: 'products/update' });
    expect((await storeWebhook('orders/paid', { id: 'x' }, deps)).body).toEqual({ ignored: 'no order' });
    expect((await storeWebhook('orders/updated', { id: 2002 }, deps)).body).toEqual({ tickets: 0 });
    expect(store.calls).toHaveLength(0);
  });
});

describe('reading a webhook', () => {
  it('finds the order number in an order or a refund', () => {
    expect(orderIdOf({ admin_graphql_api_id: 'gid://shopify/Order/450789469', id: 450789469 }, 'orders/paid')).toBe('450789469');
    expect(orderIdOf({ id: 450789469 }, 'orders/cancelled')).toBe('450789469');
    expect(orderIdOf({ id: 509562969, order_id: 450789469 }, 'refunds/create')).toBe('450789469');
    expect(orderIdOf({ admin_graphql_api_id: 'gid://shopify/Order/abc' }, 'orders/paid')).toBeNull();
    expect(orderIdOf({}, 'orders/paid')).toBeNull();
  });
});

describe("the store's copy of tickets", () => {
  const mirror = (id: string, order: string): TicketMirror => ({ id, kind: 'day', status: 'unused', order, firstScan: null, validUntil: null, votesCast: 0, voteToday: 'none' });

  it('keeps a metaobject per ticket and lists them on the order; tickets the park gave away stay out', async () => {
    const store = new FakeStore();
    const { deps } = park(store);
    await mirrorTickets(deps, [mirror('OWL-AAAA-AAAA', '1001'), mirror('OWL-BBBB-BBBB', '1001')], true);
    expect(store.ops()).toEqual(['OwlParkTicket', 'OwlParkTicket', 'OwlParkOrderTickets']);
    const link = store.calls[2]!.variables['metafields'] as Array<Record<string, string>>;
    expect(link[0]).toMatchObject({ ownerId: 'gid://shopify/Order/1001', namespace: 'owl_park', key: 'tickets', type: 'list.metaobject_reference' });
    expect(JSON.parse(link[0]!['value']!)).toEqual(['gid://shopify/Metaobject/owl-aaaa-aaaa', 'gid://shopify/Metaobject/owl-bbbb-bbbb']);
    await mirrorTickets(deps, [mirror('OWL-CCCC-CCCC', 'comp-1')], true);
    expect(store.calls).toHaveLength(3);
  });
});
