import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS, hashForLog } from '@owl-park/shared';
import type { Env } from '../src/env';
import { forgetGate } from '../src/gateSwitch';
import { captureLogs } from '../src/logs';
import { forgetCatalogue, storeCatalogue } from '../src/opening';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow, overflowNow } from '../src/overflowState';
import { forgetLimits } from '../src/limits';
import { mintPass, verifyKeeper } from '../src/pass';
import { webhookSignature } from '../src/shopify';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { ticketDesk } from '../src/ticketDesk';
import { DEFAULT_LENGTH_MS } from '../src/tickets';
import { FakeStore, seq } from './fakeStore';
import { logged } from './logged';

// ---- The Worker's log (OP-134), with the ledger, the overflow object and the rooms standing in ----

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
// Node's Response refuses a 101; the Workers runtime returns one for an upgraded socket.
class WorkerResponse extends Response {
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
    super(body, init?.status === 101 ? { ...init, status: 200 } : init);
  }
}
/** The two platform globals the Worker meets here; a test that stands in for `fetch` puts them back after. */
function platform(): void {
  vi.stubGlobal('Response', WorkerResponse);
  vi.stubGlobal(
    'WebSocketPair',
    class {
      0 = {};
      1 = { accept() {}, addEventListener() {}, close() {}, readyState: 1 };
    },
  );
}
platform();
const worker = (await import('../src/index')).default;

const KEY = 'test-signing-key-0123456789abcdef';
const ADMIN = 'keepers-key-0123456789';
const HOOKS = 'store-webhook-key-0123456789';
const SHOP = 'owl-test.myshopify.com';
const waits: Array<Promise<unknown>> = [];
const CTX = { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;

/** The park behind the Worker: the vote ledger (the gate switch and the ticket desk), the overflow object, the rooms and the collections. */
class Park {
  readonly book = new TicketBook(new MemoryTicketStore(), seq());
  /** The opening switch as the ledger keeps it (GateSet): its mode and when it was set. */
  gate: { mode: string; at: number } | null = null;
  state: OverflowState = { line: LINE_DEFAULTS, active: false, waiting: 0, front: 0, rate: 0, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms: REALMS_DEFAULTS };
  /** What the overflow object answers a change with. */
  settingsStatus = 200;
  collectionsDown = false;
  private readonly stub = (answer: (req: Request) => Promise<Response> | Response) => ({
    idFromName: (name: string) => name,
    get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input) }),
  });
  readonly votes = this.stub(async (req) => {
    const path = new URL(req.url).pathname;
    if (path === '/gate' && req.method === 'POST') {
      const { mode } = (await req.json()) as { mode: string | null };
      this.gate = mode === null ? null : { mode, at: Date.now() };
      return Response.json({ gate: this.gate });
    }
    if (path === '/gate') return Response.json({ gate: this.gate });
    if (path.startsWith('/tickets/')) return ticketDesk(this.book, req, Date.now(), () => ({ cast: 0, today: false }));
    return new Response('not found', { status: 404 });
  });
  readonly overflow = this.stub((req) => {
    const path = new URL(req.url).pathname;
    if (path === '/settings') return this.settingsStatus === 200 ? Response.json(this.state) : Response.json({ error: 'bad line' }, { status: this.settingsStatus });
    return Response.json(this.state);
  });
  readonly rooms = this.stub(() => Response.json({ hub: 0 }));
  readonly collections = {
    getByName: () => ({
      ping: async () => {
        if (this.collectionsDown) throw new Error('the collections object is away');
      },
      inventory: async () => {
        throw new Error('the collections object is away');
      },
    }),
  };
  env(more: Record<string, string | undefined> = {}): Env {
    return { VOTES: this.votes, OVERFLOW: this.overflow, ROOMS: this.rooms, COLLECTIONS: this.collections, GATE: 'open', PASS_SIGNING_KEY: KEY, ADMIN_KEY: ADMIN, ...more } as unknown as Env;
  }
}

let park: Park;
let cap: ReturnType<typeof captureLogs>;
const nowS = () => Math.floor(Date.now() / 1000);
const call = (e: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), e, CTX);
const asKeeper = (key: string | null, init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(key === null ? {} : { 'X-Admin-Key': key }), ...(init.headers as Record<string, string> | undefined) } });

beforeEach(() => {
  park = new Park();
  forgetGate();
  forgetOverflow();
  forgetCounts();
  forgetLimits();
  forgetCatalogue();
  cap = captureLogs();
});

afterEach(() => {
  cap.restore();
  vi.unstubAllGlobals();
  platform();
});

describe('the Worker’s log (OP-134)', () => {
  it('tells each pass it gives out, takes and refuses with why, and says once that no signing key is set', async () => {
    const noKey = park.env({ PASS_SIGNING_KEY: undefined });
    await call(noKey, '/api/pass');
    await call(noKey, '/api/pass');
    logged(cap.lines, 'signing_key_missing', { level: 'warn', component: 'worker.pass' });
    expect(cap.lines.filter((l) => l.event === 'signing_key_missing')).toHaveLength(1);
    logged(cap.lines, 'pass_issued', { component: 'worker.pass', new_collector: true });
    const e = park.env({ LOG_LEVEL: 'debug' });
    const good = await mintPass(KEY, { id: 'v_pass00001', exp: nowS() + 600, adm: false, cid: 'c_owl0000001' });
    await call(e, '/api/entry', { headers: { Authorization: `Bearer ${good}` } });
    logged(cap.lines, 'pass_verified', { route: '/api/entry', session_id: hashForLog('v_pass00001'), level: 'debug' });
    await call(e, '/api/entry', { headers: { Authorization: 'Bearer nonsense' } });
    logged(cap.lines, 'pass_rejected', { route: '/api/entry', reason: 'invalid' });
    await call(e, '/api/entry');
    logged(cap.lines, 'pass_rejected', { route: '/api/entry', reason: 'missing' });
    const old = await mintPass(KEY, { id: 'v_pass00002', exp: nowS() - 10, adm: false });
    await call(e, `/api/entry?pass=${encodeURIComponent(old)}`);
    logged(cap.lines, 'pass_rejected', { route: '/api/entry', reason: 'expired' });
    // A pass's id and collector go in hashed, never as they are.
    expect(JSON.stringify(cap.lines)).not.toContain('v_pass00001');
    expect(JSON.stringify(cap.lines)).not.toContain('c_owl0000001');
  });

  it('tells each keepers’ route asked, with the keepers’ key or without it and why, and never the key', async () => {
    await call(park.env({ ADMIN_KEY: undefined }), '/api/admin/ping', asKeeper('anything-at-all-0000'));
    logged(cap.lines, 'admin_denied', { route: '/api/admin/ping', reason: 'no-key-set', level: 'warn' });
    await call(park.env(), '/api/admin/ping', asKeeper(null));
    logged(cap.lines, 'admin_denied', { reason: 'no-key-given' });
    await call(park.env(), '/api/admin/ping', asKeeper('wrong-key-wrong-key-0'));
    logged(cap.lines, 'admin_denied', { reason: 'wrong-key' });
    await call(park.env(), '/api/admin/ping', asKeeper(ADMIN));
    logged(cap.lines, 'admin_ok', { route: '/api/admin/ping' });
    expect(JSON.stringify(cap.lines)).not.toContain(ADMIN);
    expect(JSON.stringify(cap.lines)).not.toContain('wrong-key-wrong-key-0');
  });

  it('gives a keeper a token for the tree only for the keepers’ key, by POST, and never logs the key or the token (OP-156)', async () => {
    expect((await call(park.env(), '/api/admin/keeper', asKeeper(ADMIN))).status).toBe(403); // asked by GET
    expect((await call(park.env(), '/api/admin/keeper', asKeeper(null, { method: 'POST' }))).status).toBe(403);
    expect((await call(park.env(), '/api/admin/keeper', asKeeper('wrong-key-wrong-key-0', { method: 'POST' }))).status).toBe(403);
    const r = await call(park.env(), '/api/admin/keeper', asKeeper(ADMIN, { method: 'POST' }));
    expect(r.status).toBe(200);
    const { token, ttl } = (await r.json()) as { token: string; ttl: number };
    expect(ttl).toBe(12 * 60 * 60);
    expect(await verifyKeeper(KEY, token)).toBe(true);
    logged(cap.lines, 'admin_ok', { route: '/api/admin/keeper' });
    expect(JSON.stringify(cap.lines)).not.toContain(ADMIN);
    expect(JSON.stringify(cap.lines)).not.toContain(token.split('.')[1]);
  });

  it('takes a keepers’ key of 16 characters or more, and treats a shorter one as none set (OP-131)', async () => {
    const short = 'keepers-key-012';
    expect(short).toHaveLength(15);
    expect((await call(park.env({ ADMIN_KEY: short }), '/api/admin/ping', asKeeper(short))).status).not.toBe(200);
    logged(cap.lines, 'admin_denied', { route: '/api/admin/ping', reason: 'no-key-set' });
    const sixteen = 'keepers-key-0123';
    expect((await call(park.env({ ADMIN_KEY: sixteen }), '/api/admin/ping', asKeeper(sixteen))).status).toBe(200);
    logged(cap.lines, 'admin_ok', { route: '/api/admin/ping' });
  });

  it('puts a chaos run’s id on every line of a request that names one well', async () => {
    await call(park.env(), '/api/admin/ping', asKeeper(null, { headers: { 'X-Chaos-Run': 'chaos-42' } }));
    logged(cap.lines, 'admin_denied', { run_id: 'chaos-42' });
    await call(park.env(), '/api/admin/ping', asKeeper(null, { headers: { 'X-Chaos-Run': 'not a run!' } }));
    expect(cap.lines.at(-1)).not.toHaveProperty('run_id');
  });

  it('tells the opening switch flipped, the busy-night settings changed, and a change that did not take', async () => {
    await call(park.env(), '/api/admin/gate', asKeeper(ADMIN, { method: 'POST', body: JSON.stringify({ mode: 'ticket' }) }));
    logged(cap.lines, 'gate_switched', { component: 'worker.admin', gate: 'ticket', by: 'switch' });
    park.state = { ...park.state, line: { ...LINE_DEFAULTS, mode: 'on' } };
    await call(park.env(), '/api/admin/capacity', asKeeper(ADMIN, { method: 'POST', body: JSON.stringify({ line: { mode: 'on' } }) }));
    logged(cap.lines, 'capacity_set', { line: 'on', threshold: LINE_DEFAULTS.threshold, ribbon: RIBBON_DEFAULTS.on });
    park.settingsStatus = 400;
    const r = await call(park.env(), '/api/admin/capacity', asKeeper(ADMIN, { method: 'POST', body: JSON.stringify({ line: { mode: 'sideways' } }) }));
    expect(r.status).toBe(400);
    logged(cap.lines, 'write_failed', { component: 'worker.admin', status: 400 });
  });

  it('tells each health check with every part, and a part that did not answer', async () => {
    await call(park.env(), '/api/health');
    logged(cap.lines, 'health_check', { level: 'info', ok: true, parts: { rooms: true, tickets: true, collections: true } });
    park.collectionsDown = true;
    await call(park.env(), '/api/health');
    logged(cap.lines, 'health_check', { level: 'error', ok: false, parts: { rooms: true, tickets: true, collections: false } });
  });

  it('tells a room socket refused at the door: its pass, the gate, the line', async () => {
    const ws = (e: Env, pass: string) => call(e, `/ws/hub?pass=${encodeURIComponent(pass)}`, { headers: { Upgrade: 'websocket', Origin: 'https://park.example' } });
    await ws(park.env(), 'nonsense');
    logged(cap.lines, 'room_join_refused', { component: 'room.join', room: 'hub', reason: 'pass', pass: 'invalid' });
    const guest = await mintPass(KEY, { id: 'v_guest0001', exp: nowS() + 600, adm: false, cid: 'c_guest00001' });
    await ws(park.env({ GATE: 'ticket' }), guest);
    logged(cap.lines, 'room_join_refused', { room: 'hub', reason: 'gate', session_id: hashForLog('v_guest0001'), collector_hash: hashForLog('c_guest00001') });
    park.state = { ...park.state, active: true };
    forgetGate();
    await ws(park.env(), guest);
    logged(cap.lines, 'room_join_refused', { room: 'hub', reason: 'queue' });
  });

  it('tells a claim link that moved an order’s tickets onto a device, from another, with each device’s class', async () => {
    const { claim } = await park.book.issue('1001', [{ line: '11', quantity: 2, kind: 'day', lengthMs: DEFAULT_LENGTH_MS.day, validFrom: null, validUntil: null }], false, Date.now());
    const claimOn = async (cid: string, ua: string) => {
      const pass = await mintPass(KEY, { id: `v_${cid.slice(2, 12)}`, exp: nowS() + 600, adm: false, cid });
      return call(park.env(), '/api/tickets/claim', { method: 'POST', headers: { Authorization: `Bearer ${pass}`, 'User-Agent': ua }, body: JSON.stringify({ secret: claim }) });
    };
    const first = await claimOn('c_phone00001', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    expect(await first.json()).not.toHaveProperty('moved');
    logged(cap.lines, 'claim_moved', { component: 'worker.tickets', via: 'claim', tickets: 2, from_other_device: 0, device_class: 'phone', order_hash: hashForLog('1001') });
    await claimOn('c_desk000001', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    logged(cap.lines, 'claim_moved', { via: 'claim', tickets: 2, from_other_device: 2, device_class: 'desktop', in_use: 0 });
  });

  it('tells a claim link that found its order already in use on another owl, and moved nothing (OP-174)', async () => {
    const { claim, tickets } = await park.book.issue('1002', [{ line: '11', quantity: 1, kind: 'day', lengthMs: DEFAULT_LENGTH_MS.day, validFrom: null, validUntil: null }], false, Date.now());
    const claimOn = async (cid: string) => {
      const pass = await mintPass(KEY, { id: `v_${cid.slice(2, 12)}`, exp: nowS() + 600, adm: false, cid });
      return call(park.env(), '/api/tickets/claim', { method: 'POST', headers: { Authorization: `Bearer ${pass}`, 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, body: JSON.stringify({ secret: claim }) });
    };
    expect((await claimOn('c_first00001')).status).toBe(200);
    expect(park.book.scan(tickets[0]!.id, 'c_first00001', Date.now()).ok).toBe(true);
    const forwarded = await claimOn('c_second0001');
    expect(forwarded.status).toBe(409);
    // The order stays with the Worker.
    expect(await forwarded.json()).toEqual({ error: 'in use' });
    logged(cap.lines, 'claim_in_use', { component: 'worker.tickets', via: 'claim', in_use: 1, collector_hash: hashForLog('c_second0001'), order_hash: hashForLog('1002'), device_class: 'phone' });
    expect(park.book.get(tickets[0]!.id)?.device).toBe('c_first00001');
  });

  it('gives an owl the gate’s checkout link, and tells the paid order’s tickets landing on that owl (OP-175)', async () => {
    const store = new FakeStore();
    vi.stubGlobal('fetch', store.fetch);
    const e = park.env({ SHOPIFY_SHOP: SHOP, SHOPIFY_ADMIN_TOKEN: 'shpat_test', SHOPIFY_WEBHOOK_SECRET: HOOKS });
    const pass = await mintPass(KEY, { id: 'v_buyer00001', exp: nowS() + 600, adm: false, cid: 'c_buyer00001' });
    const auth = { Authorization: `Bearer ${pass}` };
    // No pass, no link.
    expect((await call(e, '/api/tickets/checkout', { method: 'POST', body: '{}' })).status).toBe(401);
    const r = await call(e, '/api/tickets/checkout', { method: 'POST', headers: auth, body: '{}' });
    expect(r.status).toBe(200);
    const link = new URL(((await r.json()) as { url: string }).url);
    expect(link.origin + link.pathname).toBe(`https://${SHOP}/cart/100:1`);
    const token = link.searchParams.get('attributes[owl_checkout]')!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The owl is nowhere in the link.
    expect(link.href).not.toContain('c_buyer00001');
    store.attributes = [{ key: 'owl_checkout', value: token }];
    const body = JSON.stringify({ id: 1001, admin_graphql_api_id: 'gid://shopify/Order/1001', tags: '' });
    const hook = await call(e, '/api/store/webhook', { method: 'POST', headers: { 'X-Shopify-Hmac-Sha256': await webhookSignature(HOOKS, body), 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Shop-Domain': SHOP }, body });
    expect(hook.status).toBe(200);
    logged(cap.lines, 'claim_moved', { component: 'worker.tickets', via: 'checkout', tickets: 2, collector_hash: hashForLog('c_buyer00001'), order_hash: hashForLog('1001') });
    const wallet = (await (await call(e, '/api/tickets', { headers: auth })).json()) as { tickets: unknown[] };
    expect(wallet.tickets).toHaveLength(2);
    expect(JSON.stringify(cap.lines)).not.toContain(token);
  });

  it('answers the gate’s checkout as not set up without a store or a Day Ticket on sale (OP-175)', async () => {
    const pass = await mintPass(KEY, { id: 'v_buyer00002', exp: nowS() + 600, adm: false, cid: 'c_buyer00002' });
    const r = await call(park.env(), '/api/tickets/checkout', { method: 'POST', headers: { Authorization: `Bearer ${pass}` }, body: '{}' });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'not-set-up' });
  });

  it('offers a Day ticket’s owl the half-price pass only while opening night runs, and not without the code (OP-180)', async () => {
    const night = false;
    const catalogue = async (_url: string, init: RequestInit) => {
      const { query } = JSON.parse(String(init.body)) as { query: string };
      if (!query.includes('OwlParkCatalogue')) return Response.json({ data: null });
      const nodes = [
        { kind: { value: 'day' }, start: null, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/100' }] } },
        { kind: { value: 'annual' }, start: null, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/200' }] } },
        ...(night ? [{ kind: { value: 'opening-night' }, start: { value: new Date(Date.now() - 3_600_000).toISOString() }, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/300' }] } }] : []),
      ];
      return Response.json({ data: { products: { nodes } } });
    };
    vi.stubGlobal('fetch', catalogue);
    const { claim, tickets } = await park.book.issue('1101', [{ line: 'D1', quantity: 1, kind: 'day', lengthMs: DEFAULT_LENGTH_MS.day, validFrom: null, validUntil: null }], false, Date.now());
    await park.book.claim(claim!, 'c_buyer00003');
    const id = tickets[0]!.id;
    const pass = await mintPass(KEY, { id: 'v_buyer00003', exp: nowS() + 600, adm: false, cid: 'c_buyer00003' });
    const ask = (e: Env) => call(e, '/api/tickets/pass', { method: 'POST', headers: { Authorization: `Bearer ${pass}` }, body: JSON.stringify({ id }) });
    const store = { SHOPIFY_SHOP: SHOP, SHOPIFY_ADMIN_TOKEN: 'shpat_test', SHOPIFY_TEST_ORIGIN: 'http://localhost:8799' };
    // Without the code, nothing to offer.
    const unset = await ask(park.env(store));
    expect(unset.status).toBe(503);
    expect(await unset.json()).toEqual({ ok: false, reason: 'not-set-up' });
    // With it, any day of the season (not only opening night): the pass's cart link, with the code and the Day ticket it comes from.
    const e = park.env({ ...store, OPENING_PASS_CODE: 'OPENTONIGHT' });
    const r = await ask(e);
    expect(r.status).toBe(200);
    const link = new URL(((await r.json()) as { url: string }).url);
    expect(link.origin + link.pathname).toBe(`https://${SHOP}/cart/200:1`);
    expect(link.searchParams.get('discount')).toBe('OPENTONIGHT');
    expect(link.searchParams.get('attributes[from_ticket]')).toBe(id);
    // Another owl may not have this ticket's offer.
    const other = await mintPass(KEY, { id: 'v_buyer00004', exp: nowS() + 600, adm: false, cid: 'c_buyer00004' });
    const theirs = await call(e, '/api/tickets/pass', { method: 'POST', headers: { Authorization: `Bearer ${other}` }, body: JSON.stringify({ id }) });
    expect(theirs.status).toBe(409);
    expect(await theirs.json()).toEqual({ ok: false, reason: 'not-yours' });
  });

  it('tells each store webhook: turned away, taken, an order recorded, a repeat, and one that failed', async () => {
    const store = new FakeStore();
    vi.stubGlobal('fetch', store.fetch);
    const e = park.env({ SHOPIFY_SHOP: SHOP, SHOPIFY_ADMIN_TOKEN: 'shpat_test', SHOPIFY_WEBHOOK_SECRET: HOOKS });
    const body = JSON.stringify({ id: 1001, admin_graphql_api_id: 'gid://shopify/Order/1001', tags: '' });
    const hook = async (signature: string) =>
      call(e, '/api/store/webhook', { method: 'POST', headers: { 'X-Shopify-Hmac-Sha256': signature, 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Shop-Domain': SHOP }, body });
    await hook('not-the-signature');
    logged(cap.lines, 'webhook_rejected', { component: 'worker.store', topic: 'orders/paid', reason: 'signature' });
    const signed = await webhookSignature(HOOKS, body);
    expect((await hook(signed)).status).toBe(200);
    logged(cap.lines, 'webhook_received', { topic: 'orders/paid', status: 200, order_hash: hashForLog('1001') });
    logged(cap.lines, 'order_recorded', { order_hash: hashForLog('1001'), tickets: 2, held: false });
    await hook(signed);
    logged(cap.lines, 'webhook_duplicate', { topic: 'orders/paid', order_hash: hashForLog('1001') });
    expect(cap.lines.filter((l) => l.event === 'order_recorded')).toHaveLength(1);
    // The store out of reach: the webhook fails, and the store sends it again later.
    vi.stubGlobal('fetch', async () => {
      throw new Error('the store is away');
    });
    expect((await hook(signed)).status).toBe(500);
    logged(cap.lines, 'webhook_failed', { level: 'error', topic: 'orders/paid', order_hash: hashForLog('1001') });
    expect(JSON.stringify(cap.lines)).not.toContain('"1001"');
  });

  it('tells the store and the overflow object out of reach, with the last answer standing', async () => {
    await storeCatalogue({ SHOPIFY_SHOP: SHOP, SHOPIFY_ADMIN_TOKEN: 'shpat_test' } as Env, (async () => {
      throw new Error('the store is away');
    }) as unknown as typeof fetch);
    logged(cap.lines, 'store_unreachable', { component: 'worker.store', level: 'error' });
    await overflowNow(async () => {
      throw new Error('the overflow object is away');
    });
    logged(cap.lines, 'read_failed', { component: 'overflow', level: 'error' });
  });

  it('tells a request that failed with an error no route handled, and fails it as before', async () => {
    const pass = await mintPass(KEY, { id: 'v_pass00003', exp: nowS() + 600, adm: false, cid: 'c_owl0000003' });
    await expect(call(park.env(), '/api/collection', { headers: { Authorization: `Bearer ${pass}` } })).rejects.toThrow('away');
    logged(cap.lines, 'unhandled_error', { component: 'worker', route: '/api/collection', error: { name: 'Error', message: 'the collections object is away' } });
  });
});
