/**
 * OP-145, ticket gate hardening: a replayed webhook, a double claim, an invalid scan and a refund,
 * for paid orders and for opening night's $0 orders alike.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { captureLogs } from '../src/logs';
import { webhookSignature, type AdminOrder } from '../src/shopify';
import { claimLink, storeWebhook, type Desk, type HookDeps } from '../src/storeHooks';
import { ticketDesk } from '../src/ticketDesk';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { DAY_MS, HOUR_MS } from '../src/tickets';
import { FakeStore, seq } from './fakeStore';
import { logged } from './logged';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const PAID = { id: 1001, admin_graphql_api_id: 'gid://shopify/Order/1001', tags: '' };
const REFUND = { id: 5, order_id: 1001, refund_line_items: [{ line_item_id: 11, quantity: 1 }] };

/** Opening night's order: the same two tickets, $0, with nothing to rate (C42). */
class FreeStore extends FakeStore {
  override order(): AdminOrder {
    return { ...super.order(), risk: null, totalPriceSet: { shopMoney: { amount: '0.00' } } };
  }
}

function park(store: FakeStore) {
  const book = new TicketBook(new MemoryTicketStore(), seq());
  const writes: string[] = [];
  const desk: Desk = async (path, body) => {
    if (body !== undefined) writes.push(path);
    const req = body === undefined ? new Request(`https://park${path}`) : new Request(`https://park${path}`, { method: 'POST', body: JSON.stringify(body) });
    const r = await ticketDesk(book, req, T0, () => ({ cast: 0, today: false }));
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  const deps: HookDeps = { store: { shop: 'owl-test.myshopify.com', token: 'shpat_test' }, desk, claimUrl: (s) => claimLink('https://park.example', s), fetchFn: store.fetch, wait: async () => {} };
  const secretOf = (n: number) => String((store.sent[n]!['trackingInfo'] as { url: string }).url).split('#claim=')[1]!;
  const scan = async (device: string, id: unknown, now = T0 + HOUR_MS) => {
    const r = await ticketDesk(book, new Request('https://park/tickets/scan', { method: 'POST', body: JSON.stringify(id === undefined ? { device } : { device, id }) }), now, () => ({ cast: 0, today: false }));
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  return { book, deps, writes, secretOf, scan };
}

for (const [name, Store] of [
  ['a paid order', FakeStore],
  ['a $0 opening-night order', FreeStore],
] as const) {
  describe(`OP-145: ${name}`, () => {
    it('a replayed orders/paid makes no second ticket, sends no second email and leaves the first link working', async () => {
      const store = new Store();
      const { book, deps, secretOf } = park(store);
      const first = await storeWebhook('orders/paid', PAID, deps);
      expect(first.body).toEqual({ tickets: 2, sent: true });
      expect(first.recorded).toEqual({ tickets: 2, held: false });
      const ids = book.orderOf('1001')!.tickets.map((t) => t.id);
      // The same delivery again, later (a retry or a replay of the signed body).
      const again = await storeWebhook('orders/paid', PAID, deps);
      expect(again).toMatchObject({ repeat: true, body: { tickets: 2, sent: true } });
      expect(again.recorded).toBeUndefined();
      expect(book.orderOf('1001')!.tickets.map((t) => t.id)).toEqual(ids);
      expect(store.sent).toHaveLength(1);
      expect(await book.claim(secretOf(0), 'c_buyer')).toHaveLength(2);
    });

    it('a claim link opened twice puts the same tickets on one owl, never a second set', async () => {
      const store = new Store();
      const { book, deps, secretOf, scan } = park(store);
      await storeWebhook('orders/paid', PAID, deps);
      const secret = secretOf(0);
      expect(await book.claim(secret, 'c_buyer')).toHaveLength(2);
      expect(await book.claim(secret, 'c_buyer')).toHaveLength(2);
      expect(book.wallet('c_buyer', T0)).toHaveLength(2);
      expect(book.orderOf('1001')!.tickets).toHaveLength(2);
      // Scanned, then the link opened on a second device: nothing moves, and the second owl is refused at the gate.
      const id = book.orderOf('1001')!.tickets[0]!.id;
      expect((await scan('c_buyer', id)).body).toMatchObject({ ok: true, started: true });
      await book.claim(secret, 'c_other');
      expect((await scan('c_other', id)).body).toEqual({ ok: false, reason: 'elsewhere', id });
      expect(book.get(id)!.device).toBe('c_buyer');
    });

    it('a refund turns a ticket off and the gate refuses it; a cancellation turns off the rest', async () => {
      const store = new Store();
      const { book, deps, secretOf, scan } = park(store);
      await storeWebhook('orders/paid', PAID, deps);
      await book.claim(secretOf(0), 'c_buyer');
      expect((await storeWebhook('refunds/create', REFUND, deps)).body).toEqual({ revoked: 1 });
      const off = book.orderOf('1001')!.tickets.find((t) => t.revoked !== null)!;
      expect((await scan('c_buyer', off.id)).body).toEqual({ ok: false, reason: 'revoked', id: off.id, kind: 'day' });
      expect((await storeWebhook('orders/cancelled', PAID, deps)).body).toEqual({ revoked: 1 });
      expect((await scan('c_buyer', undefined)).body).toEqual({ ok: false, reason: 'none' });
    });

    // OP-145: the store's retry (or a replayed signed body) of one refund must not switch off a second
    // ticket; the book remembers each refund by its id.
    it('a replayed refunds/create switches off only the tickets that refund paid back', async () => {
      const store = new Store();
      const { book, deps } = park(store);
      await storeWebhook('orders/paid', PAID, deps);
      await storeWebhook('refunds/create', REFUND, deps);
      expect((await storeWebhook('refunds/create', REFUND, deps)).body).toEqual({ revoked: 0 });
      expect(book.orderOf('1001')!.tickets.filter((t) => t.revoked !== null)).toHaveLength(1);
      // A second, different refund of the same line still switches off the next ticket.
      await storeWebhook('refunds/create', { ...REFUND, id: 6 }, deps);
      expect(book.orderOf('1001')!.tickets.filter((t) => t.revoked !== null)).toHaveLength(2);
    });
  });
}

describe('OP-145: a scan that cannot go through fails closed and changes nothing', () => {
  it('refuses an unknown, malformed, held, expired, used or someone else’s ticket by reason only', async () => {
    const store = new FakeStore();
    const { book, deps, secretOf, scan } = park(store);
    await storeWebhook('orders/paid', PAID, deps);
    await book.claim(secretOf(0), 'c_buyer');
    const [a, b] = book.orderOf('1001')!.tickets.map((t) => t.id);
    const before = JSON.stringify(book.orderOf('1001'));
    // Unknown and malformed ids: never said back, never swapped for another ticket in the wallet.
    expect((await scan('c_buyer', 'OWL-2222-2222')).body).toEqual({ ok: false, reason: 'unknown' });
    expect(await scan('c_buyer', '<script>')).toEqual({ status: 200, body: { ok: false, reason: 'unknown' } });
    expect(await scan('c_buyer', 'x'.repeat(21))).toEqual({ status: 400, body: { error: 'bad request' } });
    expect(await scan('c_buyer', 42)).toEqual({ status: 400, body: { error: 'bad request' } });
    expect((await scan('c_thief', a)).body).toEqual({ ok: false, reason: 'elsewhere', id: a });
    // Expired unused (a year and a day on).
    expect((await scan('c_buyer', a, T0 + 366 * DAY_MS)).body).toMatchObject({ ok: false, reason: 'expired' });
    expect(JSON.stringify(book.orderOf('1001'))).toBe(before);
    // Used: its 24 hours ran out after the first scan.
    expect((await scan('c_buyer', b, T0 + HOUR_MS)).body).toMatchObject({ ok: true, started: true });
    expect((await scan('c_buyer', b, T0 + HOUR_MS + DAY_MS)).body).toEqual({ ok: false, reason: 'used', id: b, kind: 'day' });
    // Held for the fraud check, on the owl that checked out at the booth (OP-175).
    const held = new FakeStore();
    held.risk = ['HIGH'];
    const h = park(held);
    held.attributes = [{ key: 'owl_checkout', value: await h.book.newCheckout('c_buyer', T0) }];
    await storeWebhook('orders/paid', PAID, h.deps);
    const hid = h.book.orderOf('1001')!.tickets[0]!.id;
    expect(h.book.get(hid)!.device).toBe('c_buyer');
    expect((await h.scan('c_buyer', hid)).body).toEqual({ ok: false, reason: 'held', id: hid, kind: 'day' });
    expect(h.book.get(hid)!.firstScan).toBeNull();
  });
});

describe('OP-145: an unsigned or forged webhook at the Worker', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is turned away with 401 and logged, and nothing reaches the ticket book or the store', async () => {
    const worker = (await import('../src/index')).default;
    const HOOKS = 'store-webhook-key-0123456789';
    const SHOP = 'owl-test.myshopify.com';
    const store = new FakeStore();
    vi.stubGlobal('fetch', store.fetch);
    const deskCalls: string[] = [];
    const votes = { idFromName: (n: string) => n, get: () => ({ fetch: async (r: Request) => (deskCalls.push(new URL(r.url).pathname), Response.json({})) }) };
    const env = { VOTES: votes, GATE: 'ticket', PASS_SIGNING_KEY: 'test-signing-key-0123456789abcdef', SHOPIFY_SHOP: SHOP, SHOPIFY_ADMIN_TOKEN: 'shpat_test', SHOPIFY_WEBHOOK_SECRET: HOOKS } as unknown as Env;
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
    const cap = captureLogs();
    try {
      const body = JSON.stringify(PAID);
      const post = (headers: Record<string, string>, b = body) => worker.fetch(new Request('https://park.example/api/store/webhook', { method: 'POST', headers: { 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Shop-Domain': SHOP, ...headers }, body: b }), env, ctx);
      expect((await post({})).status).toBe(401);
      expect((await post({ 'X-Shopify-Hmac-Sha256': await webhookSignature('another-key', body) })).status).toBe(401);
      // Signed, then changed in flight.
      expect((await post({ 'X-Shopify-Hmac-Sha256': await webhookSignature(HOOKS, body) }, body.replace('1001', '1002'))).status).toBe(401);
      // Signed by the park's key, for another store.
      expect((await post({ 'X-Shopify-Hmac-Sha256': await webhookSignature(HOOKS, body), 'X-Shopify-Shop-Domain': 'someone-else.myshopify.com' })).status).toBe(401);
      expect(deskCalls).toEqual([]);
      expect(store.calls).toEqual([]);
      logged(cap.lines, 'webhook_rejected', { component: 'worker.store', topic: 'orders/paid', reason: 'signature' });
      logged(cap.lines, 'webhook_rejected', { component: 'worker.store', topic: 'orders/paid', reason: 'other-store' });
    } finally {
      cap.restore();
    }
  });
});
