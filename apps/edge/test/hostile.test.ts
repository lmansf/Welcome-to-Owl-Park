import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS, type FeedbackDraft } from '@owl-park/shared';
import type { Env } from '../src/env';
import { forgetViolations } from '../src/guard';
import { forgetGate } from '../src/gateSwitch';
import { forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { mintPass } from '../src/pass';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { ticketDesk } from '../src/ticketDesk';
import { DEFAULT_LENGTH_MS } from '../src/tickets';
import { seq } from './fakeStore';

// ---- What a visitor sends, at its worst (OP-143): the audit's strings against every value the Worker takes ----

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

/** The audit's strings (2.8): an SQL quote, a NoSQL operator (as text and as an object), markup with a script in it, a path out, a NUL, and a name far too long. */
const HOSTILE: readonly unknown[] = ["' OR '1'='1", '{"$ne": null}', { $ne: null }, '<img src=x onerror=alert(1)>', '../../../etc/passwd', '%00', '\u0000', 'x'.repeat(10_000)];
/** A hostile value as an answer could echo it back. */
const echoOf = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

const KEY = 'test-signing-key-0123456789abcdef';
const ADMIN = 'keepers-key-0123456789';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const nowS = () => Math.floor(Date.now() / 1000);

/** The park behind the Worker: the ticket desk, the line, the rooms, and a collections object that keeps what reaches it. */
class Park {
  readonly book = new TicketBook(new MemoryTicketStore(), seq());
  /** Every call that reached the collections object, with what it was given. */
  readonly reached: Array<{ call: string; args: unknown[] }> = [];
  /** Every room socket that reached a room object, by its room. */
  readonly rooms: string[] = [];
  line = false;
  private stub = (answer: (req: Request) => Response | Promise<Response>) => ({
    idFromName: (name: string) => name,
    get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input) }),
  });
  env(more: Record<string, string> = {}): Env {
    const state = (): OverflowState => ({ line: LINE_DEFAULTS, active: this.line, waiting: 3, front: 10, rate: 1, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms: REALMS_DEFAULTS });
    const keep = (call: string) => async (...args: unknown[]) => {
      this.reached.push({ call, args });
      if (call === 'addFeedback') return { ok: true };
      if (call === 'feedback') return [];
      return {};
    };
    return {
      VOTES: this.stub((req) => {
        const path = new URL(req.url).pathname;
        if (path === '/gate') return Response.json({ gate: null });
        if (path.startsWith('/tickets/')) return ticketDesk(this.book, req, Date.now(), () => ({ cast: 0, today: false }));
        return Response.json({ ok: true });
      }),
      OVERFLOW: this.stub((req) => (new URL(req.url).pathname === '/line/status' ? Response.json({ state: 'waiting', n: 11, place: 1, waitMin: 1 }) : Response.json(state()))),
      ROOMS: this.stub((req) => {
        this.rooms.push(req.headers.get('X-Room') ?? '');
        return new Response('in');
      }),
      COLLECTIONS: { getByName: () => new Proxy({}, { get: (_, call: string) => keep(call) }) },
      ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }) },
      GATE: 'open',
      PASS_SIGNING_KEY: KEY,
      ADMIN_KEY: ADMIN,
      // What is checked here is each value, not how fast they come (guard.test.ts has the limits).
      RATE_LIMITS: 'off',
      ...more,
    } as unknown as Env;
  }
}

let park: Park;
let cap: ReturnType<typeof captureLogs>;
let n = 0;
const passFor = (adm = true) => mintPass(KEY, { id: `v_bad${String(++n).padStart(6, '0')}`, exp: nowS() + 600, adm, cid: `c_bad${String(n).padStart(7, '0')}` });
const call = (e: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), e, CTX);
const post = (e: Env, path: string, body: unknown, headers: Record<string, string> = {}) => call(e, path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Every hostile value refused with a 4xx, never echoed back, never a 5xx. */
async function refusedEach(answer: (v: unknown) => Promise<Response>): Promise<void> {
  for (const v of HOSTILE) {
    const r = await answer(v);
    const text = await r.text();
    expect(r.status, `${echoOf(v).slice(0, 40)} -> ${r.status} ${text.slice(0, 80)}`).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    if (echoOf(v).length > 2) expect(text).not.toContain(echoOf(v));
  }
}

beforeEach(() => {
  park = new Park();
  forgetGate();
  forgetOverflow();
  forgetCounts();
  forgetLimits();
  forgetViolations();
  cap = captureLogs();
});
afterEach(() => cap.restore());

describe('hostile values at every door the Worker has (OP-143)', () => {
  it('the vote, the shop and the travel and nest calls refuse them before anything is asked', async () => {
    const auth = { Authorization: `Bearer ${await passFor()}` };
    await refusedEach((v) => post(park.env(), '/api/vote', { realm: v }, auth));
    await refusedEach((v) => post(park.env(), '/api/shop/buy', { variant: v }, auth));
    expect(park.reached).toEqual([]);
  });

  it('a claim, a share, a scan and the pass link: a hostile secret or ticket id finds nothing and moves nothing', async () => {
    await park.book.issue('1001', [{ line: '1', quantity: 1, kind: 'day', lengthMs: DEFAULT_LENGTH_MS.day, validFrom: null, validUntil: null }], false, Date.now());
    const auth = { Authorization: `Bearer ${await passFor()}` };
    for (const path of ['/api/tickets/claim', '/api/tickets/take']) await refusedEach((v) => post(park.env(), path, { secret: v }, auth));
    for (const path of ['/api/tickets/share', '/api/tickets/pass']) await refusedEach((v) => post(park.env(), path, { id: v }, auth));
    // The gate fails closed: a ticket id that is no ticket admits nothing, mints no pass, and is not said back.
    for (const v of HOSTILE) {
      const r = await post(park.env(), '/api/tickets/scan', { id: v }, auth);
      const text = await r.text();
      if (r.status === 200) expect(JSON.parse(text)).toEqual({ ok: false, reason: 'unknown' });
      else expect(r.status).toBe(400);
      expect(text).not.toContain('"pass"');
    }
    // The order's ticket is still waiting for its claim, on no device.
    const wallet = await call(park.env(), '/api/tickets', { headers: auth });
    expect(((await wallet.json()) as { tickets: unknown[] }).tickets).toEqual([]);
  });

  it('the account links (protect, restore, confirm, bind) refuse a hostile email, link or friend code', async () => {
    const e = park.env({ ACCOUNTS: 'on', ACCOUNT_SECRET: 'account-secret-0123456789abcdef0123', RESEND_API_KEY: 're_test', MAIL_FROM: 'owls@park.example' });
    const auth = { Authorization: `Bearer ${await passFor()}` };
    await refusedEach((v) => post(e, '/api/account/protect', { email: v }, auth));
    await refusedEach((v) => post(e, '/api/account/restore', { email: v }));
    for (const route of ['confirm', 'owls', 'bind']) await refusedEach((v) => post(e, `/api/account/${route}`, { token: v, code: v }));
    expect(park.reached).toEqual([]);
  });

  it('a feedback note keeps hostile words as plain words (a NUL dropped), and refuses a hostile kind, or words far too long', async () => {
    const auth = { Authorization: `Bearer ${await passFor()}` };
    for (const words of HOSTILE.filter((v): v is string => typeof v === 'string' && v.length < 1000 && v.length >= 3)) {
      expect((await post(park.env(), '/api/feedback', { kind: 'idea', text: words, room: words, screen: words }, auth)).status).toBe(200);
      const draft = park.reached.at(-1)!.args[1] as FeedbackDraft;
      expect(draft).toEqual({ kind: 'idea', text: words, room: null, screen: null });
    }
    await refusedEach((v) => post(park.env(), '/api/feedback', { kind: v, text: 'a fine note' }, auth));
    for (const v of [{ $ne: null }, 'x'.repeat(10_000), '\u0000']) expect((await post(park.env(), '/api/feedback', { kind: 'bug', text: v }, auth)).status).toBe(400);
  });

  it('the line, the pass and the rooms: a hostile number, time zone, collector or room is refused or set aside', async () => {
    park.line = true;
    const auth = { Authorization: `Bearer ${await passFor()}` };
    for (const v of HOSTILE) {
      const asked = await call(park.env(), `/api/line?n=${encodeURIComponent(echoOf(v))}`, { headers: auth });
      expect(asked.status).toBe(400);
      // A pass still goes out: the hostile time zone and collector are set aside, and nothing is echoed.
      // A header cannot carry a NUL at all: the browser and the platform refuse it before the Worker sees it.
      const header = /^[\x20-\x7e]*$/.test(echoOf(v)) ? { 'X-Collector': echoOf(v).slice(0, 4000) } : {};
      const pass = await call(park.env(), `/api/pass?tz=${encodeURIComponent(echoOf(v))}`, { headers: header });
      expect(pass.status).toBe(200);
      const body = (await pass.json()) as { pass: string; collector: string };
      expect(JSON.stringify(body)).not.toContain(echoOf(v).length > 2 ? echoOf(v) : '\u0001');
      const payload = JSON.parse(atob(body.pass.split('.')[0]!.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
      expect(payload['tz']).toBeUndefined();
      // A room that is none of the park's goes nowhere.
      const ws = await call(park.env(), `/ws/${encodeURIComponent(echoOf(v))}?pass=${encodeURIComponent(await passFor())}`, { headers: { Upgrade: 'websocket', Origin: 'https://park.example' } });
      expect(ws.status).toBe(404);
    }
    expect(park.rooms).toEqual([]);
  });

  it('the keepers’ calls, with the keepers’ key, refuse hostile ids, refs, statuses and switches too', async () => {
    const admin = { 'X-Admin-Key': ADMIN };
    await refusedEach((v) => post(park.env(), '/api/admin/grant', { cid: v, variant: v, source: v }, admin));
    await refusedEach((v) => call(park.env(), `/api/admin/climb?ref=${encodeURIComponent(echoOf(v))}`, { headers: admin }));
    await refusedEach((v) => post(park.env(), '/api/admin/feedback', { id: v, status: v }, admin));
    await refusedEach((v) => call(park.env(), `/api/admin/feedback?status=${encodeURIComponent(echoOf(v))}`, { headers: admin }));
    await refusedEach((v) => post(park.env(), '/api/admin/gate', { mode: v }, admin));
    await refusedEach((v) => post(park.env(), '/api/admin/tickets', { kind: v, quantity: v, hours: v }, admin));
    expect(park.reached).toEqual([]);
    // A hostile limit on the keepers' list is a number the list keeps between 1 and 500 (feedbackBox.ts), or the default.
    for (const v of HOSTILE) expect((await call(park.env(), `/api/admin/feedback?status=open&limit=${encodeURIComponent(echoOf(v))}`, { headers: admin })).status).toBe(200);
  });

  it('a hostile report of what the page’s policy blocked is refused, or logged as words with no page query', async () => {
    for (const v of HOSTILE) {
      const r = await post(park.env(), '/api/csp-report', { 'csp-report': { 'document-uri': v, 'effective-directive': v, 'blocked-uri': v } });
      expect(r.status).toBe(400);
    }
    const r = await post(park.env(), '/api/csp-report', { 'csp-report': { 'document-uri': 'https://park.example/?claim=<img src=x onerror=alert(1)>', 'effective-directive': 'img-src', 'blocked-uri': '<img src=x onerror=alert(1)>' } });
    expect(r.status).toBe(204);
    const line = cap.lines.find((l) => l.event === 'csp_violation')!;
    expect(line['page']).toBe('/');
    expect(line['blocked']).toBe('<img src=x onerror=alert(1)>');
  });
});
