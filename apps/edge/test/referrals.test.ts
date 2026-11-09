import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFERRAL_MEMBER_FEATHERS, hashForLog } from '@owl-park/shared';
import type { Env } from '../src/env';
import { forgetGate } from '../src/gateSwitch';
import { forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import { forgetCatalogue } from '../src/opening';
import { mintPass } from '../src/pass';
import { webhookSignature } from '../src/shopify';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { ticketDesk } from '../src/ticketDesk';
import { DEFAULT_LENGTH_MS } from '../src/tickets';
import { FakeStore, seq } from './fakeStore';
import { logged } from './logged';
import { sqlStorage } from './sqlite';

// ---- Bring a friend (OP-056), through the Worker: the card, a friend's code, the free Day Ticket and the thank-you ----

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));
const worker = (await import('../src/index')).default;
const { Collections } = await import('../src/Collections');

const KEY = 'test-signing-key-0123456789abcdef';
const HOOKS = 'store-webhook-key-0123456789';
const SHOP = 'owl-test.myshopify.com';
const CODE = 'OWLFRIEND';
const waits: Array<Promise<unknown>> = [];
const CTX = { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;
const settle = async () => {
  while (waits.length) await waits.shift();
};

function park(more: Record<string, unknown> = {}) {
  const book = new TicketBook(new MemoryTicketStore(), seq());
  const stub = (answer: (req: Request) => Response | Promise<Response>) => ({
    idFromName: (name: string) => name,
    get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input) }),
  });
  const ctx = { storage: { sql: sqlStorage(), getAlarm: async () => null, setAlarm: async () => {} }, waitUntil: (p: Promise<unknown>) => void waits.push(p) };
  const objects = new Collections(ctx as unknown as DurableObjectState, {} as Env);
  const env = {
    VOTES: stub((req) => {
      const path = new URL(req.url).pathname;
      if (path === '/gate') return Response.json({ gate: null });
      if (path.startsWith('/tickets/')) return ticketDesk(book, req, Date.now(), () => ({ cast: 0, today: false }));
      return Response.json({ ok: true });
    }),
    COLLECTIONS: { getByName: () => objects },
    ASSETS: { fetch: async () => new Response('<!doctype html>') },
    GATE: 'open',
    PASS_SIGNING_KEY: KEY,
    RATE_LIMITS: 'off',
    REFERRALS: 'preview',
    SHOPIFY_SHOP: SHOP,
    SHOPIFY_ADMIN_TOKEN: 'shpat_test',
    SHOPIFY_WEBHOOK_SECRET: HOOKS,
    ...more,
  } as unknown as Env;
  return { env, book, objects };
}

const call = (e: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), e, CTX);
const as = async (cid: string) => ({ Authorization: `Bearer ${await mintPass(KEY, { id: `v_${cid.slice(2)}`, exp: Math.floor(Date.now() / 1000) + 600, adm: false, cid })}`, 'CF-Connecting-IP': `ip-${cid}` });
const post = async (e: Env, path: string, cid: string, body: unknown = {}) => call(e, path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await as(cid)) }, body: JSON.stringify(body) });
const view = async (e: Env, cid: string) => (await (await call(e, '/api/referral', { headers: await as(cid) })).json()) as Record<string, unknown> & { code: string; offers: Array<{ kind: string }> };
const hook = async (e: Env) => {
  const body = JSON.stringify({ id: 1001, admin_graphql_api_id: 'gid://shopify/Order/1001', tags: '' });
  return call(e, '/api/store/webhook', { method: 'POST', headers: { 'X-Shopify-Hmac-Sha256': await webhookSignature(HOOKS, body), 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Shop-Domain': SHOP }, body });
};

let cap: ReturnType<typeof captureLogs>;
beforeEach(() => {
  forgetGate();
  forgetLimits();
  forgetCatalogue();
  waits.length = 0;
  cap = captureLogs();
});
afterEach(() => {
  cap.restore();
  vi.unstubAllGlobals();
});

describe('bringing a friend through the Worker (OP-056)', () => {
  it('answers nothing with REFERRALS off', async () => {
    const { env } = park({ REFERRALS: 'off' });
    expect((await call(env, '/api/referral', { headers: await as('c_alice00001') })).status).toBe(404);
    expect((await post(env, '/api/referral/invite', 'c_bea0000001', { code: 'ABCD' })).status).toBe(404);
  });

  it('takes a friend’s code, checks out the free Day Ticket at $0, and thanks the owl that brought them when the friend comes through the gate', async () => {
    const store = new FakeStore();
    vi.stubGlobal('fetch', store.fetch);
    const { env, book } = park({ REFERRAL_CODE: CODE });
    const alice = await view(env, 'c_alice00001');
    expect(alice).toMatchObject({ mode: 'preview', free: true, invited: false, canEnterCode: true, offers: [] });

    // A code typed by an owl that has it wrong, or its own: refused, and said why.
    expect(await (await post(env, '/api/referral/invite', 'c_alice00001', { code: alice.code })).json()).toEqual({ ok: false, reason: 'self' });
    logged(cap.lines, 'referral_refused', { component: 'worker.accounts', reason: 'self', collector_hash: hashForLog('c_alice00001') });
    expect((await post(env, '/api/referral/invite', 'c_bea0000001', { code: 'no!' })).status).toBe(400);

    const invited = await post(env, '/api/referral/invite', 'c_bea0000001', { code: alice.code.toLowerCase() });
    expect(invited.status).toBe(200);
    expect(await invited.json()).toMatchObject({ ok: true, invited: true, canEnterCode: false, offers: [{ kind: 'friend' }] });
    logged(cap.lines, 'referral_invited', { component: 'worker.accounts', collector_hash: hashForLog('c_bea0000001') });

    // The free Day Ticket's link: one Day Ticket, the store's code and the owl's checkout token.
    const r = await post(env, '/api/tickets/checkout', 'c_bea0000001', { referral: true });
    expect(r.status).toBe(200);
    const link = new URL(((await r.json()) as { url: string }).url);
    expect(link.origin + link.pathname).toBe(`https://${SHOP}/cart/100:1`);
    expect(link.searchParams.get('discount')).toBe(CODE);
    const token = link.searchParams.get('attributes[owl_checkout]')!;
    // An owl with no offer gets no free link.
    expect((await post(env, '/api/tickets/checkout', 'c_carl000001', { referral: true })).status).toBe(409);

    // The store's $0 order comes back through that checkout: it goes out at once, onto Bea.
    Object.assign(store, { total: '0.00', dayTickets: 1, ticketsLeft: 1, codes: [CODE], attributes: [{ key: 'owl_checkout', value: token }] });
    expect((await hook(env)).status).toBe(200);
    expect(book.wallet('c_bea0000001', Date.now())).toEqual([expect.objectContaining({ kind: 'day', status: 'unused' })]);
    expect((await view(env, 'c_bea0000001')).offers).toEqual([]);

    // Through the gate: Alice is thanked with a free Day Ticket of her own.
    const scanned = await post(env, '/api/tickets/scan', 'c_bea0000001');
    expect(await scanned.json()).toMatchObject({ ok: true });
    await settle();
    logged(cap.lines, 'referral_thanked', { component: 'worker.tickets', reason: 'ticket', collector_hash: hashForLog('c_alice00001') });
    expect((await view(env, 'c_alice00001')).offers).toEqual([expect.objectContaining({ kind: 'reward' })]);
    // Once: Bea's next ticket thanks nobody again.
    expect(await (await post(env, '/api/referral/invite', 'c_bea0000001', { code: alice.code })).json()).toEqual({ ok: false, reason: 'already-invited' });
  });

  it('thanks an owl with an annual pass with feathers, and refuses a friend who has had a ticket', async () => {
    const { env, book, objects } = park();
    const pass = await book.issue('comp-1', [{ line: 'p', quantity: 1, kind: 'annual', lengthMs: null, validFrom: null, validUntil: null }], false, Date.now());
    await book.claim(pass.claim!, 'c_alice00001');
    const day = await book.issue('comp-2', [{ line: 'd', quantity: 1, kind: 'day', lengthMs: null, validFrom: null, validUntil: null }], false, Date.now());
    await book.claim(day.claim!, 'c_dan0000001');
    const { code } = await view(env, 'c_alice00001');
    expect(await (await post(env, '/api/referral/invite', 'c_dan0000001', { code })).json()).toEqual({ ok: false, reason: 'has-ticket' });
    expect((await post(env, '/api/referral/invite', 'c_bea0000001', { code })).status).toBe(200);
    // No store code set: no free Day Ticket can be checked out, but bringing a friend still works.
    expect((await post(env, '/api/tickets/checkout', 'c_bea0000001', { referral: true })).status).toBe(503);
    const gift = await book.issue('comp-3', [{ line: 'd', quantity: 1, kind: 'day', lengthMs: DEFAULT_LENGTH_MS.day, validFrom: null, validUntil: null }], false, Date.now());
    await book.claim(gift.claim!, 'c_bea0000001');
    const before = await objects.feathers('c_alice00001');
    expect(await (await post(env, '/api/tickets/scan', 'c_bea0000001')).json()).toMatchObject({ ok: true });
    await settle();
    logged(cap.lines, 'referral_thanked', { reason: 'feathers' });
    expect(await objects.feathers('c_alice00001')).toBe(before + REFERRAL_MEMBER_FEATHERS);
  });

  it('holds an order that used the code without a checkout the park opened for it', async () => {
    const store = new FakeStore();
    vi.stubGlobal('fetch', store.fetch);
    const { env } = park({ REFERRAL_CODE: CODE });
    Object.assign(store, { total: '0.00', dayTickets: 1, ticketsLeft: 1, codes: [CODE.toLowerCase()] });
    expect((await hook(env)).status).toBe(200);
    logged(cap.lines, 'referral_held', { component: 'worker.store', order_hash: hashForLog('1001') });
    logged(cap.lines, 'order_recorded', { held: true });
    expect(store.sent).toHaveLength(0);
  });
});
