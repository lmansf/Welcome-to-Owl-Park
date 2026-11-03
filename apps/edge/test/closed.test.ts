import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, OPEN_VIEW, REALMS_DEFAULTS, RIBBON_DEFAULTS, SETUP_DEFAULTS, SETUP_WORDS, cleanSetup, closedView, readClosedView, withSetupChanges, type SetupSettings } from '@owl-park/shared';
import type { Env } from '../src/env';
import { forgetGate } from '../src/gateSwitch';
import { API_LIMITS, forgetLimits, isPublicCall } from '../src/limits';
import { captureLogs } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { CLOSED_CACHE } from '../src/routes/line';

// ---- OP-233: whether the park is closed for setup, as anyone may read it (GET /api/closed) ----

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

const T0 = Date.UTC(2026, 10, 2, 22, 0);
const HOUR = 3_600_000;
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

/** The overflow object's state as the Worker reads it: the keepers' settings, a busy line and all. */
const stateWith = (setup: SetupSettings | undefined): OverflowState => ({
  line: { ...LINE_DEFAULTS, mode: 'on', threshold: 37 },
  active: true,
  waiting: 12,
  front: 40,
  rate: 3.5,
  ribbon: { ...RIBBON_DEFAULTS, on: true, words: 'Busy tonight' },
  notice: 'Busy tonight',
  copies: { hub: { '2': 'open' } },
  count: 81,
  countedAt: T0,
  realms: { ...REALMS_DEFAULTS, open: ['glass'], portal: true },
  ...(setup ? { setup } : {}),
});
let state = stateWith(SETUP_DEFAULTS);
let reads = 0;
const stub = (answer: (req: Request) => Response) => ({
  idFromName: (name: string) => name,
  get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input) }),
});
const env = () =>
  ({
    VOTES: stub((req) => (new URL(req.url).pathname === '/gate' ? Response.json({ gate: null }) : Response.json({ error: 'not found' }, { status: 404 }))),
    OVERFLOW: stub(() => {
      reads += 1;
      return Response.json(state);
    }),
    ROOMS: stub(() => new Response('in')),
    ASSETS: { fetch: async () => new Response('page') },
    GATE: 'open',
    PASS_SIGNING_KEY: 'test-signing-key-0123456789abcdef',
    ADMIN_KEY: 'keepers-key-0123456789',
  }) as unknown as Env;
const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), env(), CTX);
const read = async () => {
  const r = await call('/api/closed');
  return { status: r.status, headers: r.headers, body: (await r.json()) as unknown };
};

let cap: ReturnType<typeof captureLogs>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  state = stateWith(SETUP_DEFAULTS);
  reads = 0;
  forgetGate();
  forgetOverflow();
  forgetCounts();
  forgetLimits();
  cap = captureLogs();
});
afterEach(() => {
  cap.restore();
  vi.useRealTimers();
});

describe('the closed state as anyone reads it (OP-233)', () => {
  it('says open, with no words and no time, while the park is open (and before the switch was ever set)', async () => {
    expect(await read()).toMatchObject({ status: 200, body: { closed: false, words: null, reopenAt: null } });
    forgetOverflow();
    state = stateWith(undefined);
    expect((await read()).body).toEqual(OPEN_VIEW);
  });

  it('says closed with the closed card’s own words, or the keepers’, and the reopen time they gave', async () => {
    state = stateWith({ on: true, words: null, reopenAt: null });
    expect((await read()).body).toEqual({ closed: true, words: SETUP_WORDS, reopenAt: null });
    forgetOverflow();
    state = stateWith({ on: true, words: 'Setting up the tree. Back soon!', reopenAt: T0 + 2 * HOUR });
    expect((await read()).body).toEqual({ closed: true, words: 'Setting up the tree. Back soon!', reopenAt: T0 + 2 * HOUR });
  });

  it('leaves out a reopen time that has passed, and any time while the park is open', async () => {
    state = stateWith({ on: true, words: null, reopenAt: T0 + HOUR });
    vi.setSystemTime(T0 + HOUR);
    expect((await read()).body).toEqual({ closed: true, words: SETUP_WORDS, reopenAt: null });
    expect(closedView({ on: false, words: 'Old words', reopenAt: T0 + HOUR }, T0)).toEqual(OPEN_VIEW);
    expect(closedView({ on: true, words: null, reopenAt: T0 + HOUR }, T0 + HOUR - 1).reopenAt).toBe(T0 + HOUR);
  });

  it('tells nothing else of the keepers’ settings: no line, ribbon, copies, count, realms or token', async () => {
    state = stateWith({ on: true, words: 'Back soon', reopenAt: T0 + HOUR });
    const r = await call('/api/closed', { headers: { 'X-Admin-Key': 'keepers-key-0123456789' } });
    const text = await r.text();
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(['closed', 'reopenAt', 'words']);
    for (const secret of ['line', 'ribbon', 'Busy tonight', 'copies', 'count', 'glass', 'portal', 'keepers-key', 'signing-key']) expect(text).not.toContain(secret);
  });

  it('may be kept a few seconds by the browser or a cache in between, and needs no pass', async () => {
    const r = await read();
    expect(r.headers.get('Cache-Control')).toBe(CLOSED_CACHE);
    expect(CLOSED_CACHE).toBe('public, max-age=5');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(isPublicCall('/api/closed')).toBe(true);
  });

  it('answers only GET (and the preflight), never a change', async () => {
    expect((await call('/api/closed', { method: 'POST', body: JSON.stringify({ setup: { on: false } }) })).status).toBe(404);
    expect((await call('/api/closed', { method: 'OPTIONS' })).status).toBe(200);
  });

  it('is read through the Worker’s short keep: a page polling it costs the overflow object one read every few seconds', async () => {
    state = stateWith({ on: true, words: null, reopenAt: null });
    for (let i = 0; i < 20; i++) expect((await read()).status).toBe(200);
    expect(reads).toBe(1);
  });

  it('counts against the calls that need no pass: 300 a minute from one address, then 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < API_LIMITS.public.limit + 1; i++) statuses.push((await call('/api/closed')).status);
    expect(statuses.slice(0, API_LIMITS.public.limit).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('the reopen time in the setup switch (OP-233)', () => {
  const closed: SetupSettings = { on: true, words: 'Back soon', reopenAt: null };

  it('takes a time, clears it with null, and refuses anything that is not a time this century', () => {
    expect(withSetupChanges(closed, { reopenAt: T0 + HOUR })).toEqual({ ...closed, reopenAt: T0 + HOUR });
    expect(withSetupChanges({ ...closed, reopenAt: T0 }, { reopenAt: null })).toEqual(closed);
    for (const reopenAt of ['tomorrow', 0, -5, 1.5, Number.POSITIVE_INFINITY, Date.UTC(2100, 0, 1), {}]) expect(withSetupChanges(closed, { reopenAt })).toBeNull();
    // The words' own rules still hold beside it.
    expect(withSetupChanges(closed, { words: 'x'.repeat(200), reopenAt: T0 })).toBeNull();
  });

  it('forgets the time when the park opens, unless the keepers give one with the opening', () => {
    expect(withSetupChanges({ ...closed, reopenAt: T0 }, { on: false })).toEqual({ on: false, words: 'Back soon', reopenAt: null });
    expect(withSetupChanges({ ...closed, reopenAt: T0 }, { on: false, reopenAt: T0 + HOUR })).toEqual({ on: false, words: 'Back soon', reopenAt: T0 + HOUR });
    expect(withSetupChanges({ ...closed, reopenAt: T0 }, { on: true })).toEqual({ ...closed, reopenAt: T0 });
  });

  it('reads a stored or sent switch from before the reopen time as having none', () => {
    expect(cleanSetup({ on: true, words: 'Back soon' })).toEqual(closed);
    expect(cleanSetup({ on: true, words: null, reopenAt: 'soon' })).toEqual({ on: true, words: null, reopenAt: null });
    expect(cleanSetup({ on: true, words: null, reopenAt: T0 })).toEqual({ on: true, words: null, reopenAt: T0 });
  });
});

describe('the closed state as the page reads it (OP-233)', () => {
  it('takes what the Worker sends, and anything else as no answer', () => {
    expect(readClosedView({ closed: false, words: null, reopenAt: null })).toEqual(OPEN_VIEW);
    expect(readClosedView({ closed: true, words: 'Back soon', reopenAt: T0 })).toEqual({ closed: true, words: 'Back soon', reopenAt: T0 });
    // Closed with no words or a bad time: the card's own words, and no time.
    expect(readClosedView({ closed: true, words: '', reopenAt: 'soon' })).toEqual({ closed: true, words: SETUP_WORDS, reopenAt: null });
    expect(readClosedView({ closed: true, words: 'x'.repeat(500), reopenAt: null })?.words).toHaveLength(90);
    for (const v of [null, 'closed', [], {}, { closed: 'yes' }, { error: 'too-many' }]) expect(readClosedView(v)).toBeNull();
  });
});
