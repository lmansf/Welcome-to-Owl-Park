import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS, hashForLog } from '@owl-park/shared';
import type { Env } from '../src/env';
import { HSTS, REPORT_EVERY_MS, forgetViolations, originAllowed, parkPolicy, withNonce } from '../src/guard';
import { forgetGate } from '../src/gateSwitch';
import { API_LIMITS, Counter, forgetLimits, isPublicCall, isTicketCall } from '../src/limits';
import { captureLogs } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { mintPass } from '../src/pass';
import { logged } from './logged';

// ---- The Worker's front door (OP-140, OP-141, OP-142, OP-144), with the park's objects standing in ----

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
vi.stubGlobal('Response', WorkerResponse);
const worker = (await import('../src/index')).default;

const KEY = 'test-signing-key-0123456789abcdef';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
/** The page as the build makes it: two scripts of its own words, then its bundle. */
const PAGE = '<!doctype html><html><head><script>addEventListener("error", f);</script></head><body><script>paint();</script><script type="module" crossorigin src="/assets/index-1.js"></script></body></html>';

const state: OverflowState = { line: LINE_DEFAULTS, active: false, waiting: 0, front: 0, rate: 0, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms: REALMS_DEFAULTS };
const stub = (answer: (req: Request) => Response) => ({
  idFromName: (name: string) => name,
  get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input) }),
});
const env = (more: Record<string, string> = {}) =>
  ({
    VOTES: stub((req) => (new URL(req.url).pathname === '/gate' ? Response.json({ gate: null }) : Response.json({ error: 'not found' }, { status: 404 }))),
    OVERFLOW: stub(() => Response.json(state)),
    ROOMS: stub(() => new Response('in')),
    // As the static files' own rules (public/_headers) send it.
    ASSETS: { fetch: async () => new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"page-1"', 'X-Content-Type-Options': 'nosniff', 'Strict-Transport-Security': 'max-age=31536000' } }) },
    GATE: 'open',
    PASS_SIGNING_KEY: KEY,
    ...more,
  }) as unknown as Env;
const call = (path: string, init: RequestInit = {}, e = env(), base = 'https://park.example') => worker.fetch(new Request(`${base}${path}`, init), e, CTX);
const nowS = () => Math.floor(Date.now() / 1000);
let n = 0;
const passFor = (cid: string, adm = true) => mintPass(KEY, { id: `v_door${String(++n).padStart(5, '0')}`, exp: nowS() + 600, adm, cid });

let cap: ReturnType<typeof captureLogs>;
beforeEach(() => {
  forgetGate();
  forgetOverflow();
  forgetCounts();
  forgetLimits();
  forgetViolations();
  cap = captureLogs();
});
afterEach(() => {
  cap.restore();
  vi.useRealTimers();
});

describe('the park’s page and every answer (OP-140)', () => {
  it('runs only its own scripts, its inline ones by a nonce fresh each load, and talks only to its own host; no page may frame it', async () => {
    const r = await call('/');
    const csp = r.headers.get('Content-Security-Policy') ?? '';
    const nonce = /script-src 'self' 'nonce-([0-9a-f]{32})'/.exec(csp)?.[1];
    expect(nonce).toBeDefined();
    const html = await r.text();
    // Every script on the page carries it, the bundle's too; nothing else on the page changed.
    expect(html.match(/<script nonce="([0-9a-f]+)"/g)).toHaveLength(3);
    expect(html.split(`nonce="${nonce}"`)).toHaveLength(4);
    expect(html.replaceAll(` nonce="${nonce}"`, '')).toBe(PAGE);
    expect(csp).toBe(parkPolicy(new URL('https://park.example/'), nonce!));
    expect(csp).toContain("connect-src 'self' wss://park.example;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('report-uri /api/csp-report');
    expect(csp).not.toContain('unsafe-eval');
    expect(r.headers.get('X-Frame-Options')).toBe('DENY');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Strict-Transport-Security')).toBe(HSTS);
    expect(r.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    // Still never kept, and no tag that would let a browser reuse it: its words change with every load.
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('ETag')).toBeNull();
    const again = await call('/index.html');
    expect(again.headers.get('Content-Security-Policy')).not.toContain(nonce);
  });

  it('keeps HSTS to a year on the hostname that answers, never its subdomains or a preload list, and never on this machine’s http', async () => {
    expect(HSTS).toBe('max-age=31536000');
    const local = await call('/', {}, env(), 'http://localhost:8787');
    expect(local.headers.get('Strict-Transport-Security')).toBeNull();
    // The browser tests' page talks to its own server's sockets, over ws.
    expect(local.headers.get('Content-Security-Policy')).toContain("connect-src 'self' ws://localhost:8787;");
    const api = await call('/api/notice');
    expect(api.headers.get('Strict-Transport-Security')).toBe(HSTS);
    expect(api.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('puts the nonce on a script tag however it is written, and on nothing that only starts like one', () => {
    expect(withNonce('<script>a</script><SCRIPT\nsrc="b"></SCRIPT><scripts></scripts><noscript></noscript>', 'n1')).toBe('<script nonce="n1">a</script><SCRIPT nonce="n1"\nsrc="b"></SCRIPT><scripts></scripts><noscript></noscript>');
  });

  it('logs what the policy blocked as the browser reports it, a line per kind a while, never a page’s query (a claim link’s secret)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const report = (blocked: string) =>
      call('/api/csp-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/csp-report' },
        body: JSON.stringify({ 'csp-report': { 'document-uri': 'https://park.example/?claim=SECRET-CLAIM-123#x', 'effective-directive': 'script-src-elem', 'blocked-uri': blocked, 'source-file': 'https://park.example/assets/index-1.js?v=2', 'line-number': 12, 'script-sample': 'SECRET-SAMPLE' } }),
      });
    expect((await report('https://cdn.example/x.js?token=SECRET-TOKEN')).status).toBe(204);
    const line = logged(cap.lines, 'csp_violation', { component: 'worker.guard', level: 'warn', directive: 'script-src-elem', blocked: 'https://cdn.example/x.js', page: '/', source: 'https://park.example/assets/index-1.js', line: 12, count: 1 });
    expect(line).toBeDefined();
    // The same kind again within ten minutes is counted, not told; after them, told with the count.
    for (let i = 0; i < 5; i++) await report('https://cdn.example/x.js');
    expect(cap.lines.filter((l) => l.event === 'csp_violation')).toHaveLength(1);
    await report('inline');
    logged(cap.lines, 'csp_violation', { blocked: 'inline', count: 1 });
    vi.setSystemTime(Date.now() + REPORT_EVERY_MS);
    await report('https://cdn.example/x.js');
    logged(cap.lines, 'csp_violation', { blocked: 'https://cdn.example/x.js', count: 6 });
    expect(JSON.stringify(cap.lines)).not.toMatch(/SECRET/);
    // Not a report, too large, or asked the wrong way: refused, nothing logged.
    const before = cap.lines.length;
    expect((await call('/api/csp-report', { method: 'POST', body: JSON.stringify({ hello: 1 }) })).status).toBe(400);
    expect((await call('/api/csp-report', { method: 'POST', headers: { 'Content-Length': '9000' }, body: 'x' })).status).toBe(413);
    expect((await call('/api/csp-report')).status).toBe(404);
    expect(cap.lines.length).toBe(before);
  });
});

describe('the front door: https only, and the park’s own pages (OP-141, OP-144)', () => {
  it('sends a page asked for over http to https, and refuses the API and the sockets over http, off this machine only', async () => {
    const page = await call('/nest?x=1', {}, env(), 'http://park.example');
    expect(page.status).toBe(301);
    expect(page.headers.get('Location')).toBe('https://park.example/nest?x=1');
    const api = await call('/api/pass', {}, env(), 'http://park.example');
    expect(api.status).toBe(403);
    expect(await api.json()).toEqual({ error: 'https-only' });
    logged(cap.lines, 'request_refused', { component: 'worker.guard', route: '/api/pass', reason: 'http' });
    const ws = await call('/ws/hub', { headers: { Upgrade: 'websocket', Origin: 'http://park.example' } }, env(), 'http://park.example');
    expect(ws.status).toBe(403);
    // Local development and the browser tests are http on this machine.
    expect((await call('/api/pass', {}, env(), 'http://localhost:8787')).status).toBe(200);
  });

  it('opens a room socket only for the park’s own page: another site’s page, or none named, is refused before its pass is read', async () => {
    const pass = await passFor('c_door000001', false);
    const ws = (origin: string | null, base = 'https://park.example', e = env()) => call(`/ws/hub?pass=${encodeURIComponent(pass)}`, { headers: { Upgrade: 'websocket', ...(origin === null ? {} : { Origin: origin }) } }, e, base);
    expect((await ws('https://evil.example')).status).toBe(403);
    logged(cap.lines, 'room_join_refused', { component: 'room.join', room: 'hub', reason: 'origin', origin: 'https://evil.example' });
    expect((await ws(null)).status).toBe(403);
    logged(cap.lines, 'room_join_refused', { reason: 'origin', origin: 'none' });
    // A look-alike is another site.
    expect((await ws('https://park.example.evil.example')).status).toBe(403);
    expect((await ws('null')).status).toBe(403);
    expect(cap.lines.filter((l) => l.event === 'room_join_refused' && l['reason'] === 'pass')).toEqual([]);
    // The park's own page goes on to the room; so does a page PARK_ORIGINS lists, and on this machine any local page.
    expect((await ws('https://park.example')).status).toBe(200);
    expect((await ws('https://owner.github.io', 'https://park.example', env({ PARK_ORIGINS: 'https://a.example, https://owner.github.io' }))).status).toBe(200);
    expect((await ws('http://localhost:5173', 'http://localhost:8787')).status).toBe(200);
    expect((await ws('http://localhost:5173')).status).toBe(403);
  });

  it('refuses an API call from another site’s page, and answers the park’s own pages’ CORS by name, never `*`', async () => {
    const theirs = await call('/api/pass', { headers: { Origin: 'https://evil.example' } });
    expect(theirs.status).toBe(403);
    expect(theirs.headers.get('Access-Control-Allow-Origin')).toBeNull();
    logged(cap.lines, 'request_refused', { route: '/api/pass', reason: 'origin', origin: 'https://evil.example' });
    const preflight = await call('/api/feedback', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const ours = await call('/api/pass', { headers: { Origin: 'https://park.example' } });
    expect(ours.status).toBe(200);
    expect(ours.headers.get('Access-Control-Allow-Origin')).toBe('https://park.example');
    expect(ours.headers.get('Vary')).toContain('Origin');
    // A call that names no page (the uptime check, a same-origin GET, the store) is answered, with no CORS at all.
    const plain = await call('/api/notice');
    expect(plain.status).toBe(200);
    expect(plain.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('knows the park’s own pages: its own origin exactly, those listed, and on this machine any local page', () => {
    const park = new URL('https://park.example/ws/hub');
    expect(originAllowed('https://park.example', park, undefined)).toBe(true);
    expect(originAllowed('http://park.example', park, undefined)).toBe(false);
    expect(originAllowed('https://www.park.example', park, undefined)).toBe(false);
    expect(originAllowed('https://park.example:8443', park, undefined)).toBe(false);
    expect(originAllowed('https://x.example', park, ' https://x.example ,https://y.example')).toBe(true);
    expect(originAllowed('http://127.0.0.1:5173', new URL('http://localhost:8787/'), undefined)).toBe(true);
    expect(originAllowed('not a url', new URL('http://localhost:8787/'), undefined)).toBe(false);
  });
});

describe('rate limits (OP-142)', () => {
  it('answers 200 calls in a minute to /api/vote with a pass: the owl’s 120, then 429 with Retry-After, logged once', async () => {
    const pass = await passFor('c_voter00001');
    const statuses: number[] = [];
    let retry: string | null = null;
    for (let i = 0; i < 200; i++) {
      const r = await call('/api/vote', { method: 'POST', headers: { Authorization: `Bearer ${pass}` }, body: JSON.stringify({ realm: 'grove' }) });
      statuses.push(r.status);
      if (r.status === 429) retry ??= r.headers.get('Retry-After');
    }
    expect(statuses.slice(0, API_LIMITS.visitor.limit).every((s) => s !== 429)).toBe(true);
    expect(statuses.slice(API_LIMITS.visitor.limit)).toEqual(Array(200 - API_LIMITS.visitor.limit).fill(429));
    expect(Number(retry)).toBeGreaterThanOrEqual(1);
    expect(Number(retry)).toBeLessThanOrEqual(60);
    logged(cap.lines, 'rate_limited', { component: 'worker.guard', level: 'warn', route: '/api/vote', limit: 'visitor', collector_hash: hashForLog('c_voter00001') });
    expect(cap.lines.filter((l) => l.event === 'rate_limited')).toHaveLength(1);
  });

  it('answers 200 calls in a minute to /api/vote with no pass, or a forged one: 60 refusals by address, then 429; the next minute starts over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const statuses: number[] = [];
    for (let i = 0; i < 200; i++) statuses.push((await call('/api/vote', { method: 'POST', ...(i % 2 ? { headers: { Authorization: 'Bearer forged' } } : {}) })).status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(API_LIMITS.refused.limit);
    expect(statuses.filter((s) => s === 429)).toHaveLength(200 - API_LIMITS.refused.limit);
    logged(cap.lines, 'rate_limited', { limit: 'refused', route: '/api/vote' });
    // The calls that need no pass have a count of their own: a page can still ask for its pass.
    expect((await call('/api/pass')).status).toBe(200);
    // Another address is its own count; this one waits out its minute.
    expect((await call('/api/vote', { method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.9' } })).status).toBe(401);
    expect((await call('/api/vote', { method: 'POST' })).status).toBe(429);
    vi.setSystemTime(Date.now() + 60_000);
    expect((await call('/api/vote', { method: 'POST' })).status).toBe(401);
  });

  it('lets a classroom on one address open the park together: 300 calls a minute that need no pass, then 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < API_LIMITS.public.limit + 1; i++) statuses.push((await call(i % 2 ? '/api/pass' : '/api/notice')).status);
    expect(statuses.slice(0, API_LIMITS.public.limit).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    logged(cap.lines, 'rate_limited', { limit: 'public' });
    expect(['/api/pass', '/api/notice', '/api/counts', '/api/health', '/api/csp-report', '/api/vote/tally', '/api/admin/gate', '/api/admin/masks/l1', '/api/masks/l1', '/api/account/restore'].every(isPublicCall)).toBe(true);
    expect(['/api/vote', '/api/entry', '/api/tickets', '/api/collection', '/ws/hub'].some(isPublicCall)).toBe(false);
  });

  it('holds an address to 600 calls a minute however many owls share it, sockets included', async () => {
    const passes = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => passFor(`c_house0000${i}`)));
    for (const p of passes) for (let i = 0; i < 100; i++) expect((await call('/api/entry', { headers: { Authorization: `Bearer ${p}` } })).status).toBe(200);
    const ws = await call(`/ws/hub?pass=${encodeURIComponent(passes[0]!)}`, { headers: { Upgrade: 'websocket', Origin: 'https://park.example' } });
    expect(ws.status).toBe(429);
    expect(Number(ws.headers.get('Retry-After'))).toBeGreaterThan(0);
    logged(cap.lines, 'rate_limited', { limit: 'address', route: '/ws/hub' });
    // The address's count is no owl's: its line names none.
    expect(cap.lines.find((l) => l.event === 'rate_limited')).not.toHaveProperty('collector_hash');
  });

  it('allows an owl ten ticket calls a minute (claims, shares, scans, the pass link, the account links)', async () => {
    const pass = await passFor('c_claims0001');
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await call('/api/tickets/claim', { method: 'POST', headers: { Authorization: `Bearer ${pass}` }, body: JSON.stringify({ secret: 'x' }) })).status);
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(statuses[10]).toBe(429);
    logged(cap.lines, 'rate_limited', { limit: 'ticket', route: '/api/tickets/claim', collector_hash: hashForLog('c_claims0001') });
    // Its other calls go on.
    expect((await call('/api/entry', { headers: { Authorization: `Bearer ${pass}` } })).status).toBe(200);
    expect(['/api/tickets/claim', '/api/tickets/take', '/api/tickets/share', '/api/tickets/scan', '/api/tickets/pass', '/api/account/link'].every(isTicketCall)).toBe(true);
    expect(['/api/tickets', '/api/vote', '/api/shop/buy', '/api/pass'].some(isTicketCall)).toBe(false);
  });

  it('never counts the store’s webhooks, and counts nothing with RATE_LIMITS off (a load test’s throwaway copy)', async () => {
    for (let i = 0; i < 700; i++) expect((await call('/api/store/webhook', { method: 'POST', body: '{}' })).status).not.toBe(429);
    const off = env({ RATE_LIMITS: 'off' });
    for (let i = 0; i < 700; i++) expect((await call('/api/notice', {}, off)).status).toBe(200);
    expect(cap.lines.filter((l) => l.event === 'rate_limited')).toEqual([]);
  });

  it('keeps a count a window at a time, says which call is the first over, and forgets stale keys when full', () => {
    const c = new Counter({ limit: 2, windowMs: 10_000 }, 3);
    expect(c.take('a', 0)).toBeNull();
    expect(c.take('a', 1_000)).toBeNull();
    expect(c.take('a', 2_500)).toEqual({ wait: 8, first: true });
    expect(c.take('a', 9_999)).toEqual({ wait: 1, first: false });
    expect(c.take('a', 10_000)).toBeNull();
    c.take('b', 10_000);
    c.take('c', 10_000);
    expect(c.size).toBe(3);
    // Full: the stale ones go first; with none stale, every count starts over.
    c.take('d', 20_000);
    expect(c.size).toBe(1);
    c.take('e', 20_001);
    c.take('f', 20_002);
    c.take('g', 20_003);
    expect(c.size).toBe(1);
  });
});
