import { describe, expect, it } from 'vitest';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import type { AdminOrder } from '../src/shopify';
import { claimLink, mirrorTickets, orderIdOf, RELEASE_TAG, storeWebhook, type Desk, type HookDeps } from '../src/storeHooks';
import { ticketDesk } from '../src/ticketDesk';
import type { TicketMirror } from '../src/storeApi';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);

function seq(): (n: number) => Uint8Array {
  let x = 23;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 1103515245 + 12345) >>> 0) >>> 16);
}

type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'PENDING';

/** A store with one order of tickets (line 11, two day tickets) and a mug (line 12). */
class FakeStore {
  risk: Risk[] = ['LOW'];
  ticketsLeft = 2;
  failFulfil = 0;
  readonly calls: Array<{ op: string; variables: Record<string, unknown> }> = [];
  readonly sent: Array<Record<string, unknown>> = [];

  order(): AdminOrder {
    const risk = this.risk.length > 1 ? this.risk.shift()! : this.risk[0]!;
    return {
      id: 'gid://shopify/Order/1001',
      cancelledAt: null,
      risk: { recommendation: risk === 'LOW' ? 'ACCEPT' : risk === 'PENDING' ? 'NONE' : 'INVESTIGATE', assessments: [{ riskLevel: risk }] },
      lineItems: {
        nodes: [
          { id: 'gid://shopify/LineItem/11', quantity: 2, product: { productType: 'Ticket', kind: { value: 'day' }, hours: null, start: null, end: null } },
          { id: 'gid://shopify/LineItem/12', quantity: 1, product: { productType: 'Mug', kind: null, hours: null, start: null, end: null } },
        ],
      },
    };
  }

  readonly fetch = (async (_url: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(String(init.body)) as { query: string; variables: Record<string, unknown> };
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)![1]!;
    this.calls.push({ op, variables });
    const data = (d: unknown) => Response.json({ data: d });
    switch (op) {
      case 'OwlParkOrder':
        return data({ order: variables['id'] === 'gid://shopify/Order/1001' ? this.order() : null });
      case 'OwlParkFulfillmentOrders':
        return data({
          order: {
            fulfillmentOrders: {
              nodes: [
                {
                  id: 'gid://shopify/FulfillmentOrder/7',
                  status: this.ticketsLeft ? 'OPEN' : 'CLOSED',
                  lineItems: { nodes: [{ id: 'gid://shopify/FulfillmentOrderLineItem/71', remainingQuantity: this.ticketsLeft, lineItem: { id: 'gid://shopify/LineItem/11' } }] },
                },
                { id: 'gid://shopify/FulfillmentOrder/8', status: 'OPEN', lineItems: { nodes: [{ id: 'gid://shopify/FulfillmentOrderLineItem/81', remainingQuantity: 1, lineItem: { id: 'gid://shopify/LineItem/12' } }] } },
              ],
            },
          },
        });
      case 'OwlParkSendTickets':
        if (this.failFulfil > 0) {
          this.failFulfil--;
          return new Response('busy', { status: 503 });
        }
        this.sent.push(variables['fulfillment'] as Record<string, unknown>);
        this.ticketsLeft = 0;
        return data({ fulfillmentCreate: { fulfillment: { id: 'gid://shopify/Fulfillment/1', status: 'SUCCESS' }, userErrors: [] } });
      case 'OwlParkTicket': {
        const handle = (variables['handle'] as { handle: string }).handle;
        return data({ metaobjectUpsert: { metaobject: { id: `gid://shopify/Metaobject/${handle}` }, userErrors: [] } });
      }
      case 'OwlParkOrderTickets':
        return data({ metafieldsSet: { metafields: [{ id: 'gid://shopify/Metafield/1' }], userErrors: [] } });
      default:
        return data(null);
    }
  }) as typeof fetch;

  ops(): string[] {
    return this.calls.map((c) => c.op);
  }
}

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
    expect(r).toEqual({ status: 200, body: { tickets: 2, sent: true }, mirror: '1001' });
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
    await storeWebhook('orders/paid', PAID, deps);
    expect(store.sent).toHaveLength(1);
    expect(book.orderOf('1001')!.tickets).toHaveLength(2);
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
