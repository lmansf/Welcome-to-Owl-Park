import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS } from '@owl-park/shared';
import type { Env } from '../src/env';
import { forgetViolations } from '../src/guard';
import { forgetGate } from '../src/gateSwitch';
import { forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { ticketDesk } from '../src/ticketDesk';
import { seq } from './fakeStore';

// ---- OP-092: no keepers' route is reachable without the keepers' key ----

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
class WorkerResponse extends Response {
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
    super(body, init?.status === 101 ? { ...init, status: 200 } : init);
  }
}
vi.stubGlobal('Response', WorkerResponse);
const worker = (await import('../src/index')).default;

const KEY = 'test-signing-key-0123456789abcdef';
const ADMIN = 'keepers-key-0123456789';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const ASSET_BODY = '<!doctype html><!-- static asset fallthrough -->';

/** Every backend the Worker may ask: each call is recorded, so a refusal can be shown to have reached nothing. */
class Park {
  readonly book = new TicketBook(new MemoryTicketStore(), seq());
  readonly reached: string[] = [];
  private stub = (name: string, answer: (req: Request) => Response | Promise<Response>) => ({
    idFromName: (n: string) => n,
    get: () => ({
      fetch: async (input: Request | string, init?: RequestInit) => {
        const req = typeof input === 'string' ? new Request(input, init) : input;
        this.reached.push(`${name} ${new URL(req.url).pathname}`);
        return answer(req);
      },
    }),
  });
  env(more: Record<string, string | undefined> = {}): Env {
    const state = (): OverflowState => ({ line: LINE_DEFAULTS, active: false, waiting: 0, front: 0, rate: 1, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms: REALMS_DEFAULTS });
    return {
      VOTES: this.stub('votes', (req) => {
        const path = new URL(req.url).pathname;
        if (path === '/gate') return Response.json({ gate: null });
        if (path.startsWith('/tickets/')) return ticketDesk(this.book, req, Date.now(), () => ({ cast: 0, today: false }));
        return Response.json({ ok: true });
      }),
      OVERFLOW: this.stub('overflow', () => Response.json(state())),
      ROOMS: this.stub('rooms', () => Response.json({})),
      COLLECTIONS: {
        getByName: () =>
          new Proxy({}, {
            get: (_, call: string) => async () => {
              this.reached.push(`collections ${call}`);
              return call === 'feedback' ? [] : {};
            },
          }),
      },
      ASSETS: { fetch: async () => new Response(ASSET_BODY, { status: 200, headers: { 'Content-Type': 'text/html' } }) },
      GATE: 'open',
      PASS_SIGNING_KEY: KEY,
      ADMIN_KEY: ADMIN,
      VOTE_TALLY_PUBLIC: 'false',
      RATE_LIMITS: 'off',
      ...more,
    } as unknown as Env;
  }
}

/** Every keepers' API route and the methods it acts on, with a body that gets past auth. */
const ROUTES: Array<{ path: string; method: 'GET' | 'POST'; body?: unknown }> = [
  { path: '/api/admin/ping', method: 'GET' },
  { path: '/api/admin/keeper', method: 'POST' },
  { path: '/api/admin/masks/l1', method: 'POST', body: {} },
  { path: '/api/admin/grant', method: 'POST', body: {} },
  { path: '/api/admin/climb', method: 'GET' },
  { path: '/api/admin/collect-log', method: 'GET' },
  { path: '/api/admin/collect-log', method: 'POST' },
  { path: '/api/admin/store', method: 'GET' },
  { path: '/api/admin/tickets', method: 'POST', body: { kind: 'annual', lifetime: true } },
  { path: '/api/admin/feedback', method: 'GET' },
  { path: '/api/admin/feedback', method: 'POST', body: { id: 1, status: 'done' } },
  { path: '/api/admin/opening', method: 'GET' },
  { path: '/api/admin/opening?csv', method: 'GET' },
  { path: '/api/admin/gate', method: 'GET' },
  { path: '/api/admin/gate', method: 'POST', body: { mode: 'ticket' } },
  { path: '/api/admin/capacity', method: 'GET' },
  { path: '/api/admin/capacity', method: 'POST', body: { line: { mode: 'on' } } },
  { path: '/api/admin/restart', method: 'POST' },
  { path: '/api/vote/tally', method: 'GET' },
  { path: '/api/vote/close', method: 'POST' },
];
const PAGES = ['/admin/feedback', '/admin/opening', '/admin/gate', '/admin/capacity'];

/** Ways of asking without the key in the one place it is read (the X-Admin-Key header). */
const WRONG: Record<string, { headers?: Record<string, string>; query?: string }> = {
  'no key': {},
  'empty key': { headers: { 'X-Admin-Key': '' } },
  'wrong key': { headers: { 'X-Admin-Key': 'wrong-key-wrong-key-0' } },
  'key prefix': { headers: { 'X-Admin-Key': ADMIN.slice(0, -1) } },
  'key plus suffix': { headers: { 'X-Admin-Key': `${ADMIN}x` } },
  'key upper-cased': { headers: { 'X-Admin-Key': ADMIN.toUpperCase() } },
  'key with %00': { headers: { 'X-Admin-Key': `${ADMIN}%00` } },
  'key url-encoded': { headers: { 'X-Admin-Key': encodeURIComponent(ADMIN).replace(/-/g, '%2D') } },
  'key twice': { headers: { 'X-Admin-Key': `${ADMIN}, ${ADMIN}` } },
  'key as Bearer': { headers: { Authorization: `Bearer ${ADMIN}` } },
  'key in cookie': { headers: { Cookie: `owl-park:admin-key=${ADMIN}; admin-key=${ADMIN}; X-Admin-Key=${ADMIN}` } },
  'key in other header': { headers: { 'X-Keeper-Key': ADMIN, 'Admin-Key': ADMIN } },
  'key in query (key)': { query: `key=${ADMIN}` },
  'key in query (admin_key)': { query: `admin_key=${ADMIN}&adminKey=${ADMIN}` },
  'key in query (X-Admin-Key)': { query: `X-Admin-Key=${ADMIN}&x-admin-key=${ADMIN}` },
  'key in query (pass)': { query: `pass=${ADMIN}` },
};

let park: Park;
let cap: ReturnType<typeof captureLogs>;
let upstream: ReturnType<typeof vi.spyOn>;
const call = (e: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), e, CTX);
const withQuery = (path: string, q?: string) => (q ? `${path}${path.includes('?') ? '&' : '?'}${q}` : path);
const ask = (e: Env, r: (typeof ROUTES)[number], headers: Record<string, string> = {}, query?: string, path = r.path) =>
  call(e, withQuery(path, query), r.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(r.body ?? {}) } : { headers });

beforeEach(() => {
  park = new Park();
  forgetGate();
  forgetOverflow();
  forgetCounts();
  forgetLimits();
  forgetViolations();
  cap = captureLogs();
  // The store check and the collection log may reach out: nothing leaves this machine.
  upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('no', { status: 503 }));
});
afterEach(() => {
  cap.restore();
  upstream.mockRestore();
});

describe('OP-092: every keepers’ API route refuses without the key in X-Admin-Key', () => {
  it('controls: the right key in X-Admin-Key gets past every guard (so the refusals below are not vacuous)', async () => {
    for (const r of ROUTES) {
      const res = await ask(park.env(), r, { 'X-Admin-Key': ADMIN });
      expect(res.status, `${r.method} ${r.path}`).not.toBe(403);
    }
  });

  for (const [how, { headers, query }] of Object.entries(WRONG)) {
    it(`${how}: 403, a bare error, nothing behind the Worker asked`, async () => {
      for (const r of ROUTES) {
        park.reached.length = 0;
        const res = await ask(park.env(), r, headers, query);
        const where = `${how}: ${r.method} ${r.path}`;
        expect(res.status, where).toBe(403);
        const body = (await res.json()) as Record<string, unknown>;
        expect(Object.keys(body), where).toEqual(['error']);
        expect(park.reached, where).toEqual([]);
      }
      expect(cap.lines.filter((l) => l.event === 'admin_ok')).toEqual([]);
      expect(JSON.stringify(cap.lines)).not.toContain(ADMIN);
    });
  }

  it('the right key in the header still refuses when ADMIN_KEY is unset or shorter than 16', async () => {
    for (const set of [undefined, '', 'short-key']) {
      for (const r of ROUTES) {
        const res = await ask(park.env({ ADMIN_KEY: set }), r, { 'X-Admin-Key': set ?? ADMIN });
        expect(res.status, `ADMIN_KEY=${String(set)} ${r.method} ${r.path}`).toBe(403);
      }
    }
  });

  it('other methods (PUT, DELETE, PATCH) with no key are refused too; OPTIONS answers no data', async () => {
    for (const r of ROUTES) {
      for (const method of ['PUT', 'DELETE', 'PATCH']) {
        const res = await call(park.env(), r.path, { method });
        expect(res.status, `${method} ${r.path}`).toBe(403);
      }
      const pre = await call(park.env(), r.path, { method: 'OPTIONS' });
      expect(await pre.text(), `OPTIONS ${r.path}`).toBe('');
    }
    expect(park.reached).toEqual([]);
  });
});

describe('OP-092: case and trailing-slash variants do not reach a keepers’ handler', () => {
  const variants = (p: string) => {
    const bare = p.split('?')[0]!;
    return [bare.toUpperCase(), bare.replace('/api/', '/API/'), bare.replace('/admin/', '/Admin/'), `${bare}/`, bare.replace('/api/admin/', '/api/admin//'), `${bare}%2F`, `${bare};`, bare.replace(/\/([a-z-]+)$/, (_, s: string) => `/${s[0]!.toUpperCase()}${s.slice(1)}`)];
  };

  it('with the right key or none, a variant falls to the static assets: no handler, no backend, no admin_ok', async () => {
    for (const r of ROUTES) {
      for (const v of variants(r.path)) {
        if (v === r.path.split('?')[0]) continue;
        for (const headers of [{}, { 'X-Admin-Key': ADMIN }]) {
          park.reached.length = 0;
          const res = await ask(park.env(), r, headers, undefined, v);
          const text = await res.text();
          const where = `${r.method} ${v} key=${'X-Admin-Key' in headers}`;
          // A refusal (403/404) or the static-asset fallthrough; never a keeper's answer.
          if (res.status === 200) expect(text, where).toBe(ASSET_BODY);
          expect(park.reached.filter((x) => !x.startsWith('rooms')), where).toEqual([]);
        }
      }
    }
    // /api/admin/masks/ is a prefix route: '/api/admin/masks/l1/' is still behind its guard (the key passed; the room id is then refused 400).
    expect(cap.lines.filter((l) => l.event === 'admin_ok' && !String(l['route']).startsWith('/api/admin/masks/'))).toEqual([]);
  });

  it('a mixed-case page path (/Admin/gate, /admin/gate/) is not the keepers’ page', async () => {
    for (const p of PAGES) {
      for (const v of [p.replace('/admin/', '/Admin/'), `${p}/`, p.toUpperCase()]) {
        const res = await call(park.env(), v);
        expect(await res.text(), v).toBe(ASSET_BODY);
      }
    }
  });
});

describe('OP-092: the keepers’ pages are locked shells', () => {
  it('serve with no key, ask nothing behind the Worker, and hold no park data', async () => {
    for (const p of PAGES) {
      park.reached.length = 0;
      for (const q of ['', `?key=${ADMIN}`]) {
        const res = await call(park.env(), `${p}${q}`);
        expect(res.status, p).toBe(200);
        const html = await res.text();
        expect(park.reached, p).toEqual([]);
        expect(html, p).not.toContain(ADMIN);
        // The key form never submits: JS stops it, and the policy forbids any form action (so no ?key= in a URL or log).
        expect(res.headers.get('Content-Security-Policy') ?? '', p).toContain("form-action 'none'");
        expect(html, p).toMatch(/preventDefault\(\)/);
        expect(html, p).toContain("'X-Admin-Key'");
        expect(html, p).not.toMatch(/[?&](key|admin_key)=/);
      }
    }
  });
});

describe('sameKey (OP-092): the keepers’ key is compared without stopping at the first difference', () => {
  it('matches only the same key', async () => {
    const { sameKey } = await import('../src/guard');
    const key = 'k'.repeat(24);
    expect(sameKey(key, key)).toBe(true);
    expect(sameKey('', key)).toBe(false);
    expect(sameKey(key.slice(0, -1), key)).toBe(false);
    expect(sameKey(key + 'k', key)).toBe(false);
    expect(sameKey('j' + key.slice(1), key)).toBe(false);
    expect(sameKey(key.slice(0, -1) + 'K', key)).toBe(false);
  });
});
