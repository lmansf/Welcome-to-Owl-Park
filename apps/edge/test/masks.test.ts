import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MASK_LIST_MAX, MAX_PERCH_TOP, emptyMasks, type MaskDraft, type SavedMasks } from '@owl-park/shared';
import type { Env } from '../src/env';
import { forgetViolations } from '../src/guard';
import { API_LIMITS, forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import { MASKS_KEEP_MS, forgetMasks } from '../src/overflowState';
import { mintKeeper, mintPass } from '../src/pass';
import { logged } from './logged';
import { sqlStorage } from './sqlite';

// ---- The ledge painter's drafts (OP-156): saved by a keeper, kept by the overflow object, read back by anyone ----

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
const { Overflow } = await import('../src/Overflow');

const KEY = 'test-signing-key-0123456789abcdef';
const ADMIN = 'keepers-key-0123456789';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const nowS = () => Math.floor(Date.now() / 1000);

/** A draft as the painter sends one: a ledge of the room's and one drawn, a wall, a hazard, a front. */
const DRAFT: MaskDraft = {
  ledges: [
    { id: 'boulder', x0: 680, x1: 850, top: 110 },
    { id: 'ledge-1', x0: 2380, x1: 2480, top: 100 },
  ],
  walls: [{ id: 'wall-1', x: 640, y0: 520, y1: 770 }],
  hazards: [{ id: 'hazard-1', x0: 3000, x1: 3100, top: 12 }],
  fronts: [
    {
      id: 'front-1',
      points: [
        { x: 2000, y: 400 },
        { x: 2060, y: 400 },
        { x: 2060, y: 770 },
        { x: 2000, y: 770 },
      ],
    },
  ],
};

/** The overflow object as the platform runs it: its own SQLite, no alarms needed here. */
class FakeState {
  readonly storage = { sql: sqlStorage(), getAlarm: async () => null, setAlarm: async () => {} };
}

/** The park behind the Worker: a real overflow object, or `overflow` standing in for it. */
function park(more: Record<string, string> = {}, overflow?: (req: Request) => Response | Promise<Response>) {
  const state = new FakeState();
  const obj = new Overflow(state as unknown as DurableObjectState, { ROOMS: { idFromName: (n: string) => n, get: () => ({ fetch: async () => Response.json({}) }) }, ROOM_SHARDING: 'single' } as unknown as Env);
  const answer = overflow ?? ((req: Request) => obj.fetch(req));
  const env = {
    OVERFLOW: { idFromName: (n: string) => n, get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input) }) },
    ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }) },
    GATE: 'open',
    PASS_SIGNING_KEY: KEY,
    ADMIN_KEY: ADMIN,
    // The limits have a test of their own below.
    RATE_LIMITS: 'off',
    ...more,
  } as unknown as Env;
  return { env, state, obj };
}

const call = (e: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), e, CTX);
const save = (e: Env, body: unknown, headers: Record<string, string>, room = 'l1') => call(e, `/api/admin/masks/${room}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const read = (e: Env, room = 'l1') => call(e, `/api/masks/${room}`);

let cap: ReturnType<typeof captureLogs>;
beforeEach(() => {
  forgetLimits();
  forgetViolations();
  forgetMasks();
  cap = captureLogs();
});
afterEach(() => {
  cap.restore();
  vi.useRealTimers();
});

describe('saving a ledge draft (OP-156)', () => {
  it('needs a keeper’s token or the keepers’ key: none, one run out, one forged or a pass in its place is refused', async () => {
    const { env } = park();
    expect((await save(env, DRAFT, {})).status).toBe(403);
    logged(cap.lines, 'admin_denied', { route: '/api/admin/masks/l1', reason: 'no-key-given' });
    for (const token of [await mintKeeper(KEY, nowS() - 1), await mintKeeper('another-signing-key-0123456789'), await mintPass(KEY, { id: 'v_keeper0001', exp: nowS() + 600, adm: true }), 'not.a-token']) {
      expect((await save(env, DRAFT, { 'X-Keeper-Token': token })).status).toBe(403);
    }
    logged(cap.lines, 'admin_denied', { route: '/api/admin/masks/l1', reason: 'bad-keeper-token' });
    expect((await save(env, DRAFT, { 'X-Admin-Key': 'not-the-keepers-key' })).status).toBe(403);
    logged(cap.lines, 'admin_denied', { reason: 'wrong-key' });
    // Only a save: a GET of the keepers' route is refused like any other.
    expect((await call(env, '/api/admin/masks/l1', { headers: { 'X-Keeper-Token': await mintKeeper(KEY) } })).status).toBe(403);
    expect(cap.lines.filter((l) => l.event === 'masks_saved')).toEqual([]);
    expect((await read(env)).status).toBe(404);
  });

  it('keeps a draft saved with a keeper’s token, and one saved with the keepers’ key in its place; anyone reads back the last', async () => {
    const { env } = park();
    const r = await save(env, DRAFT, { 'X-Keeper-Token': await mintKeeper(KEY) });
    expect(r.status).toBe(200);
    const said = (await r.json()) as { ok: boolean; room: string; savedAt: number };
    expect(said).toEqual({ ok: true, room: 'l1', savedAt: expect.any(Number) });
    logged(cap.lines, 'admin_ok', { route: '/api/admin/masks/l1', by: 'keeper' });
    logged(cap.lines, 'masks_saved', { component: 'worker.admin', level: 'info', room: 'l1', by: 'keeper', ledges: 2, walls: 1, hazards: 1, fronts: 1 });
    const back = await read(env);
    expect(back.status).toBe(200);
    expect(back.headers.get('Cache-Control')).toBe('no-store');
    expect((await back.json()) as SavedMasks).toEqual({ room: 'l1', ...DRAFT, savedAt: said.savedAt });
    // The keepers' key saves too; the new draft replaces the old, whole.
    const next: MaskDraft = { ...emptyMasks(), ledges: [{ id: 'ledge-2', x0: 100, x1: 200, top: MAX_PERCH_TOP }] };
    expect((await save(env, next, { 'X-Admin-Key': ADMIN })).status).toBe(200);
    logged(cap.lines, 'masks_saved', { room: 'l1', by: 'key', ledges: 1, walls: 0, hazards: 0, fronts: 0 });
    expect((await (await read(env)).json()) as SavedMasks).toMatchObject({ room: 'l1', ...next });
    // A token that is not good, with the key beside it: the key decides.
    expect((await save(env, next, { 'X-Keeper-Token': 'not.a-token', 'X-Admin-Key': ADMIN })).status).toBe(200);
  });

  it('refuses a draft that breaks a rule with 400 and why, logs it, and keeps nothing', async () => {
    const { env } = park();
    const keeper = { 'X-Keeper-Token': await mintKeeper(KEY) };
    const cases: Array<[unknown, Record<string, unknown>]> = [
      ['{"ledges": [', { reason: 'body' }],
      [[DRAFT], { reason: 'body' }],
      [{ ledges: [], walls: [], hazards: [] }, { reason: 'body' }],
      [{ ...DRAFT, extra: [] }, { reason: 'body' }],
      [{ ...DRAFT, walls: 'none' }, { reason: 'list', list: 'walls' }],
      [{ ...DRAFT, ledges: Array.from({ length: MASK_LIST_MAX + 1 }, (_, i) => ({ id: `ledge-${i}`, x0: i, x1: i + 5, top: 50 })) }, { reason: 'too-many', list: 'ledges' }],
      [{ ...DRAFT, ledges: [{ ...DRAFT.ledges[0], solid: true }] }, { reason: 'item', list: 'ledges', index: 0 }],
      [{ ...DRAFT, ledges: [{ ...DRAFT.ledges[0], id: 'Boulder!' }] }, { reason: 'id', list: 'ledges', index: 0 }],
      [{ ...DRAFT, hazards: [{ ...DRAFT.hazards[0], id: 'ledge-1' }] }, { reason: 'same-id', list: 'hazards', index: 0 }],
      [{ ...DRAFT, ledges: [DRAFT.ledges[0], { ...DRAFT.ledges[1], top: '100' }] }, { reason: 'number', list: 'ledges', index: 1 }],
      [{ ...DRAFT, ledges: [{ ...DRAFT.ledges[0], x1: 6401 }] }, { reason: 'outside', list: 'ledges', index: 0 }],
      [{ ...DRAFT, walls: [{ ...DRAFT.walls[0], y0: 800, y1: 700 }] }, { reason: 'order', list: 'walls', index: 0 }],
      [{ ...DRAFT, ledges: [{ ...DRAFT.ledges[0], top: MAX_PERCH_TOP + 1 }] }, { reason: 'top', list: 'ledges', index: 0 }],
      [{ ...DRAFT, hazards: [{ ...DRAFT.hazards[0], top: 0 }] }, { reason: 'top', list: 'hazards', index: 0 }],
      [{ ...DRAFT, fronts: [{ id: 'front-1', points: DRAFT.fronts[0]!.points.slice(0, 2) }] }, { reason: 'points', list: 'fronts', index: 0 }],
    ];
    for (const [body, why] of cases) {
      const r = await save(env, body, keeper);
      expect(r.status, JSON.stringify(why)).toBe(400);
      expect(await r.json()).toEqual({ error: 'bad request', ...why });
      logged(cap.lines, 'masks_refused', { component: 'worker.admin', level: 'warn', room: 'l1', by: 'keeper', ...why });
    }
    // A room of today's park, one that is not a room, and one past the id's rules: not the painter's.
    for (const room of ['hub', 'nest-abc', 'nowhere', '..%2F..%2Fetc']) {
      const r = await save(env, DRAFT, keeper, room);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'bad request', reason: 'room' });
    }
    logged(cap.lines, 'masks_refused', { room: 'hub', reason: 'room' });
    // A hostile id is never logged as the room.
    expect(cap.lines.filter((l) => l.event === 'masks_refused' && l['reason'] === 'room').map((l) => l['room'])).toEqual(['hub', 'nest-abc', 'nowhere', undefined]);
    // Far too big to read.
    const big = await save(env, DRAFT, { ...keeper, 'Content-Length': String(2_000_000) });
    expect(big.status).toBe(413);
    logged(cap.lines, 'masks_refused', { reason: 'too-large' });
    expect((await read(env)).status).toBe(404);
    expect(cap.lines.filter((l) => l.event === 'masks_saved')).toEqual([]);
  });

  it('says so when the overflow object does not keep or give a draft (502, 503), and logs it', async () => {
    const down = park({}, () => Response.json({ error: 'away' }, { status: 500 }));
    expect((await save(down.env, DRAFT, { 'X-Admin-Key': ADMIN })).status).toBe(502);
    logged(cap.lines, 'write_failed', { component: 'overflow', room: 'l1', status: 500 });
    expect((await read(down.env)).status).toBe(503);
    logged(cap.lines, 'read_failed', { component: 'overflow', room: 'l1', status: 500 });
    expect(cap.lines.filter((l) => l.event === 'masks_saved')).toEqual([]);
  });

  it('answers the painter’s page from another of the park’s origins: the token’s header is allowed', async () => {
    const { env } = park({ PARK_ORIGINS: 'https://pages.example' });
    const pre = await call(env, '/api/admin/masks/l1', { method: 'OPTIONS', headers: { Origin: 'https://pages.example', 'Access-Control-Request-Headers': 'content-type, x-keeper-token' } });
    expect(pre.status).toBe(200);
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('X-Keeper-Token');
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('https://pages.example');
  });
});

describe('reading a ledge draft back (OP-156)', () => {
  it('is 404 before a draft is saved, for a room not of the tree, and for anything but a GET', async () => {
    const { env } = park();
    for (const room of ['l1', 'hub', 'lobby', 'nest-abc', 'nowhere', '%3Cb%3E']) expect((await read(env, room)).status).toBe(404);
    await save(env, DRAFT, { 'X-Admin-Key': ADMIN });
    expect((await read(env)).status).toBe(200);
    expect((await read(env, 'hub')).status).toBe(404);
    expect((await call(env, '/api/masks/l1', { method: 'POST', body: '{}' })).status).toBe(404);
  });

  it('asks the overflow object, which also runs the line, at most once a room every few seconds; a save through this Worker reads back at once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const { obj } = park();
    const asked: string[] = [];
    const { env } = park({}, (req) => {
      asked.push(`${req.method} ${new URL(req.url).pathname}`);
      return obj.fetch(req);
    });
    expect((await read(env)).status).toBe(404);
    expect((await read(env)).status).toBe(404);
    expect(asked).toEqual(['GET /masks/l1']);
    expect((await save(env, DRAFT, { 'X-Admin-Key': ADMIN })).status).toBe(200);
    const back = await read(env);
    expect(back.status).toBe(200);
    expect(await back.json()).toEqual({ room: 'l1', ...DRAFT, savedAt: Date.parse('2026-11-01T12:00:00Z') });
    expect(asked).toEqual(['GET /masks/l1', 'POST /masks/l1']);
    // Past MASKS_KEEP_MS this copy of the Worker asks again: a save through another copy reaches it then.
    vi.setSystemTime(Date.now() + MASKS_KEEP_MS - 1);
    expect((await read(env)).status).toBe(200);
    expect(asked).toHaveLength(2);
    vi.setSystemTime(Date.now() + 1);
    expect((await read(env)).status).toBe(200);
    expect(asked).toEqual(['GET /masks/l1', 'POST /masks/l1', 'GET /masks/l1']);
  });
});

describe('the drafts in the overflow object (OP-156)', () => {
  it('keeps one per tree room under masks:<room> with when it was saved, checking each again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const { obj, state } = park();
    const post = (path: string, body: unknown) => obj.fetch(new Request(`https://park${path}`, { method: 'POST', body: JSON.stringify(body) }));
    expect((await obj.fetch(new Request('https://park/masks/l1'))).status).toBe(404);
    expect((await post('/masks/l1', { ...DRAFT, ledges: [{ id: 'x', x0: 5, x1: 1, top: 9 }] })).status).toBe(400);
    expect((await post('/masks/hub', DRAFT)).status).toBe(404);
    const kept = (await (await post('/masks/l1', DRAFT)).json()) as SavedMasks;
    expect(kept).toEqual({ room: 'l1', ...DRAFT, savedAt: Date.parse('2026-11-01T12:00:00Z') });
    expect((await (await obj.fetch(new Request('https://park/masks/l1'))).json()) as SavedMasks).toEqual(kept);
    expect(state.storage.sql.exec<{ key: string }>(`SELECT key FROM overflow_settings WHERE key LIKE 'masks:%'`).toArray()).toEqual([{ key: 'masks:l1' }]);
    // The busy-night settings beside it are as they were.
    expect(((await (await obj.fetch(new Request('https://park/state'))).json()) as { line: { mode: string } }).line.mode).toBe('off');
  });

  it('reads a draft it cannot parse as none, and says so in the log', async () => {
    const { obj, state } = park();
    state.storage.sql.exec(`INSERT OR REPLACE INTO overflow_settings (key, value) VALUES (?, ?)`, 'masks:l1', '{"ledges": [');
    expect((await obj.fetch(new Request('https://park/masks/l1'))).status).toBe(404);
    logged(cap.lines, 'read_failed', { component: 'overflow', room: 'l1' });
  });
});

describe('the drafts’ calls under the rate limits (OP-142, OP-156)', () => {
  it('count as calls that need no pass: an address’s 300 a minute, the save and the read together, then 429', async () => {
    const { env } = park({ RATE_LIMITS: 'on' });
    const token = await mintKeeper(KEY);
    const statuses: number[] = [];
    for (let i = 0; i < API_LIMITS.public.limit; i++) statuses.push((i % 2 ? await save(env, DRAFT, { 'X-Keeper-Token': token }) : await read(env)).status);
    expect(statuses.every((s) => s === 200 || s === 404)).toBe(true);
    const over = await save(env, DRAFT, { 'X-Keeper-Token': token });
    expect(over.status).toBe(429);
    expect(Number(over.headers.get('Retry-After'))).toBeGreaterThan(0);
    logged(cap.lines, 'rate_limited', { limit: 'public', route: '/api/admin/masks/l1' });
    expect((await read(env)).status).toBe(429);
  });
});
