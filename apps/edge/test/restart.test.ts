import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS } from '@owl-park/shared';
import type { Env } from '../src/env';
import { RESTART_CRON, VOTE_CLOSE_CRON, jobOf } from '../src/crons';
import { forgetGate } from '../src/gateSwitch';
import { forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { ROOMS } from '../src/rooms';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { ticketDesk } from '../src/ticketDesk';
import { seq } from './fakeStore';
import { logged } from './logged';

// ---- The park's nightly restart (OP-181) through the Worker: its cron, the keepers' route, and the turnstiles after it ----

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

declare global {
  interface ImportMeta {
    glob(pattern: string | string[], options: { query: '?raw'; import: 'default'; eager: true }): Record<string, string>;
  }
}
const wrangler = Object.values(import.meta.glob('../wrangler.jsonc', { query: '?raw', import: 'default', eager: true }))[0]!;

const KEY = 'test-signing-key-0123456789abcdef';
const ADMIN = 'keepers-key-0123456789';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
/** 2026-11-02 03:00 Eastern: an owl in the park the night before the 09:00 UTC restart. */
const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);

/** The park behind the Worker: the vote ledger (the switch, the restart, the ticket desk), the overflow object and the rooms, each call kept. */
class Park {
  readonly book = new TicketBook(new MemoryTicketStore(), seq());
  readonly reached: string[] = [];
  gate: { mode: string; at: number } | null = null;
  restartAt: number | null = null;
  /** Room objects that do not answer the restart. */
  readonly down = new Set<string>();
  private stub(name: string, answer: (req: Request, object: string) => Response | Promise<Response>) {
    return {
      idFromName: (n: string) => n,
      get: (object: string) => ({
        fetch: async (input: Request | string, init?: RequestInit) => {
          const req = typeof input === 'string' ? new Request(input, init) : input;
          this.reached.push(`${name}:${object} ${new URL(req.url).pathname}`);
          return answer(req, object);
        },
      }),
    };
  }
  env(more: Record<string, string> = {}): Env {
    const overflow: OverflowState = { line: LINE_DEFAULTS, active: false, waiting: 0, front: 0, rate: 1, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms: REALMS_DEFAULTS };
    return {
      VOTES: this.stub('votes', (req) => {
        const path = new URL(req.url).pathname;
        if (path === '/gate') return Response.json({ gate: this.gate, restartAt: this.restartAt });
        if (path === '/restart') return Response.json({ restartAt: (this.restartAt = Date.now()) });
        if (path.startsWith('/tickets/')) return ticketDesk(this.book, req, Date.now(), () => ({ cast: 0, today: false }));
        return Response.json({ ok: true });
      }),
      OVERFLOW: this.stub('overflow', () => Response.json(overflow)),
      ROOMS: this.stub('rooms', (req, object) => {
        if (new URL(req.url).pathname !== '/restart') return Response.json({});
        if (this.down.has(object)) throw new Error('the room object is away');
        return Response.json({ owls: 2, sockets: 2 });
      }),
      COLLECTIONS: { getByName: () => new Proxy({}, { get: () => async () => ({}) }) },
      ASSETS: { fetch: async () => new Response('<!doctype html>') },
      GATE: 'ticket',
      PASS_SIGNING_KEY: KEY,
      ADMIN_KEY: ADMIN,
      RATE_LIMITS: 'off',
      ...more,
    } as unknown as Env;
  }
}

let park: Park;
let clock = T0;
let cap: ReturnType<typeof captureLogs>;
const call = (e: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), e, CTX);
const post = (e: Env, path: string, body: unknown, headers: Record<string, string> = {}) => call(e, path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const admin = { 'X-Admin-Key': ADMIN };
const cron = (e: Env, at: string) => worker.scheduled({ cron: at, scheduledTime: clock, noRetry() {} } as ScheduledController, e);
const bearer = (pass: string) => ({ Authorization: `Bearer ${pass}` });
const entry = async (e: Env, pass: string) => (await (await call(e, '/api/entry', { headers: bearer(pass) })).json()) as { gate: string; admitted: boolean };
const socket = (e: Env, room: string, pass: string) => call(e, `/ws/${room}?pass=${encodeURIComponent(pass)}`, { headers: { Upgrade: 'websocket', Origin: 'https://park.example' } });

/** An owl on this device with a ticket of its own (a Day Ticket, `hours` long once it runs), its guest pass, and the pass the turnstiles gave it. */
async function owlWithTicket(e: Env, hours = 12): Promise<{ guest: string; admitted: string }> {
  const issued = (await (await post(e, '/api/admin/tickets', { kind: 'day', hours }, admin)).json()) as { link: string };
  const guest = ((await (await call(e, '/api/pass')).json()) as { pass: string }).pass;
  expect((await post(e, '/api/tickets/claim', { secret: issued.link.split('#claim=')[1] }, bearer(guest))).status).toBe(200);
  return { guest, admitted: await scan(e, guest) };
}

/** The turnstiles scan this device's ticket with this pass: the pass they admit, or null when they refuse. */
async function scan(e: Env, pass: string): Promise<string> {
  const r = (await (await post(e, '/api/tickets/scan', {}, bearer(pass))).json()) as { ok: boolean; pass?: string; reason?: string };
  return r.ok ? r.pass! : `refused:${r.reason}`;
}

beforeEach(() => {
  park = new Park();
  clock = T0;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  forgetGate();
  forgetOverflow();
  forgetCounts();
  forgetLimits();
  cap = captureLogs();
});

afterEach(() => {
  cap.restore();
  vi.restoreAllMocks();
});

describe('the nightly restart’s cron (OP-181)', () => {
  it('is in wrangler.jsonc beside the month-end one, at 09:00 UTC every day', () => {
    const crons = /"crons":\s*(\[[^\]]*\])/.exec(wrangler)?.[1];
    expect(JSON.parse(crons ?? 'null')).toEqual([VOTE_CLOSE_CRON, RESTART_CRON]);
    expect(RESTART_CRON).toBe('0 9 * * *');
    expect(jobOf(RESTART_CRON)).toBe('restart');
    expect(jobOf(VOTE_CLOSE_CRON)).toBe('vote-close');
    expect(jobOf('* * * * *')).toBeNull();
  });

  it('restarts the park on its own cron, and closes no Realm Vote', async () => {
    await cron(park.env(), RESTART_CRON);
    expect(park.reached).toEqual(['votes:park /restart', 'overflow:park /state', 'rooms:park /restart']);
    expect(park.restartAt).toBe(T0);
    logged(cap.lines, 'park_restart', { component: 'worker', level: 'info', by: 'cron', objects: 1, missed: 0, owls: 2, restart_at: new Date(T0).toISOString() });
  });

  it('closes the Realm Vote on the month-end cron, and restarts nothing', async () => {
    await cron(park.env(), VOTE_CLOSE_CRON);
    expect(park.reached).toEqual(['votes:park /close']);
    expect(park.restartAt).toBeNull();
  });

  it('runs nothing on a cron the park has no job for, and says so', async () => {
    await expect(cron(park.env(), '*/5 * * * *')).rejects.toThrow('no job');
    expect(park.reached).toEqual([]);
    logged(cap.lines, 'unhandled_error', { component: 'worker', level: 'error', job: 'none', cron: '*/5 * * * *' });
  });

  it('reaches every room object and copy with one object per room, and says which it missed', async () => {
    park.down.add('room:grove');
    await cron(park.env({ ROOM_SHARDING: 'room' }), RESTART_CRON);
    const told = park.reached.filter((r) => r.startsWith('rooms:') && r.endsWith(' /restart'));
    expect(told).toHaveLength(Object.keys(ROOMS).length);
    logged(cap.lines, 'send_failed', { component: 'worker', level: 'error', object: 'room:grove', by: 'cron' });
    logged(cap.lines, 'park_restart', { level: 'warn', objects: Object.keys(ROOMS).length, missed: 1, owls: 2 * (Object.keys(ROOMS).length - 1) });
  });

  it('restarts the rooms though the ledger does not keep its time, and says so', async () => {
    const e = park.env();
    (e as unknown as { VOTES: unknown }).VOTES = { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response('away', { status: 503 }) }) };
    await cron(e, RESTART_CRON);
    expect(park.reached).toContain('rooms:park /restart');
    logged(cap.lines, 'write_failed', { component: 'worker', level: 'error', by: 'cron' });
    const line = logged(cap.lines, 'park_restart', { by: 'cron', missed: 0 });
    expect(line['restart_at']).toBeUndefined();
  });
});

describe('the keepers’ restart by hand (OP-181)', () => {
  it('restarts the park with the admin key, as its cron does, and answers what it reached', async () => {
    const r = await post(park.env(), '/api/admin/restart', {}, admin);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ restartAt: T0, objects: 1, missed: 0, owls: 2 });
    logged(cap.lines, 'park_restart', { by: 'key' });
    // Only POST, and only with the key.
    park.reached.length = 0;
    expect((await call(park.env(), '/api/admin/restart', { headers: admin })).status).toBe(403);
    expect((await post(park.env(), '/api/admin/restart', {})).status).toBe(403);
    expect(park.reached).toEqual([]);
  });
});

describe('the turnstiles after the nightly restart (OP-181)', () => {
  it('let no pass from before it past them: the owl scans its ticket again and walks in on the pass that gives', async () => {
    const e = park.env();
    const { guest, admitted } = await owlWithTicket(e);
    expect(await entry(e, admitted)).toEqual({ gate: 'ticket', admitted: true });
    expect((await socket(e, 'hub', admitted)).status).not.toBe(403);
    clock += 60 * 60_000;
    await post(e, '/api/admin/restart', {}, admin);
    clock += 15_000;
    // The pass from before opens the lobby and the nests, nothing past the turnstiles.
    expect(await entry(e, admitted)).toEqual({ gate: 'ticket', admitted: false });
    expect((await socket(e, 'hub', admitted)).status).toBe(403);
    expect((await socket(e, 'lobby', admitted)).status).not.toBe(403);
    logged(cap.lines, 'room_join_refused', { room: 'hub', reason: 'gate' });
    // Its ticket is still good: the turnstiles scan it (with the old guest pass too) and the new pass walks in.
    const again = await scan(e, guest);
    expect(again.startsWith('refused')).toBe(false);
    expect(await entry(e, again)).toEqual({ gate: 'ticket', admitted: true });
    expect((await socket(e, 'hub', again)).status).not.toBe(403);
  });

  it('refuse a ticket that ran out meanwhile, so the owl stays outside', async () => {
    const e = park.env();
    const { guest } = await owlWithTicket(e, 1);
    clock += 2 * 60 * 60_000;
    await cron(e, RESTART_CRON);
    clock += 15_000;
    // The pass the turnstiles gave ran out with the ticket; the guest pass is good, but goes no further.
    expect(await scan(e, guest)).toMatch(/^refused:/);
    expect(await entry(e, guest)).toEqual({ gate: 'ticket', admitted: false });
    expect((await socket(e, 'grove', guest)).status).toBe(403);
  });

  it('change nothing while the gate is open', async () => {
    const e = park.env({ GATE: 'open' });
    const before = ((await (await call(e, '/api/pass')).json()) as { pass: string }).pass;
    clock += 60 * 60_000;
    await cron(e, RESTART_CRON);
    clock += 15_000;
    expect(await entry(e, before)).toEqual({ gate: 'open', admitted: false });
    expect((await socket(e, 'hub', before)).status).not.toBe(403);
  });
});
