import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS } from '@owl-park/shared';
import type { Env } from '../src/env';
import { forgetGate } from '../src/gateSwitch';
import { forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { ticketDesk } from '../src/ticketDesk';
import { seq } from './fakeStore';
import { logged } from './logged';

// ---- Spectators (OP-191) through the Worker: who goes past the turnstiles as one, how the room object is told, and what stays locked ----

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
/** 2026-11-02 14:00 Eastern: the park open, taking tickets. */
const T0 = Date.UTC(2026, 10, 2, 19, 0, 0);

/** The park behind the Worker: the vote ledger (the gate, the ticket desk), the overflow object, and the room objects, with each socket's headers kept. */
class Park {
  readonly book = new TicketBook(new MemoryTicketStore(), seq());
  /** The headers of every socket the Worker passed on to a room object. */
  readonly sockets: Headers[] = [];
  /** Every call that reached the collections object, by name. */
  readonly collected: string[] = [];
  private stub(answer: (req: Request) => Response | Promise<Response>) {
    return {
      idFromName: (n: string) => n,
      get: () => ({
        fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input),
      }),
    };
  }
  env(more: Record<string, string> = {}): Env {
    const overflow: OverflowState = { line: LINE_DEFAULTS, active: false, waiting: 0, front: 0, rate: 1, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms: REALMS_DEFAULTS };
    return {
      VOTES: this.stub((req) => {
        const path = new URL(req.url).pathname;
        if (path === '/gate') return Response.json({ gate: null, restartAt: null });
        if (path.startsWith('/tickets/')) return ticketDesk(this.book, req, Date.now(), () => ({ cast: 0, today: false }));
        return Response.json({ ok: true });
      }),
      OVERFLOW: this.stub(() => Response.json(overflow)),
      ROOMS: this.stub((req) => {
        // The room object answers the upgrade; here it only keeps what the Worker told it.
        if (req.headers.get('Upgrade') === 'websocket') this.sockets.push(new Headers(req.headers));
        return Response.json({});
      }),
      COLLECTIONS: {
        getByName: () =>
          new Proxy(
            {},
            {
              get: (_t, name: string) => async () => {
                this.collected.push(name);
                return {};
              },
            },
          ),
      },
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
let cap: ReturnType<typeof captureLogs>;
const call = (e: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), e, CTX);
const post = (e: Env, path: string, body: unknown, headers: Record<string, string> = {}) => call(e, path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const bearer = (pass: string) => ({ Authorization: `Bearer ${pass}` });
const guestPass = async (e: Env) => ((await (await call(e, '/api/pass')).json()) as { pass: string }).pass;
const entry = async (e: Env, pass: string) => (await (await call(e, '/api/entry', { headers: bearer(pass) })).json()) as Record<string, unknown>;
const socket = (e: Env, room: string, pass: string, headers: Record<string, string> = {}) =>
  call(e, `/ws/${room}?pass=${encodeURIComponent(pass)}`, { headers: { Upgrade: 'websocket', Origin: 'https://park.example', ...headers } });

/** An owl on this device with a Day Ticket of its own: its guest pass, and the pass the turnstiles gave it. */
async function owlWithTicket(e: Env): Promise<{ guest: string; admitted: string }> {
  const issued = (await (await post(e, '/api/admin/tickets', { kind: 'day', hours: 12 }, { 'X-Admin-Key': ADMIN })).json()) as { link: string };
  const guest = await guestPass(e);
  expect((await post(e, '/api/tickets/claim', { secret: issued.link.split('#claim=')[1] }, bearer(guest))).status).toBe(200);
  const r = (await (await post(e, '/api/tickets/scan', {}, bearer(guest))).json()) as { pass: string };
  return { guest, admitted: r.pass };
}

beforeEach(() => {
  park = new Park();
  vi.spyOn(Date, 'now').mockImplementation(() => T0);
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

describe('spectators at the turnstiles (OP-191)', () => {
  it('start off in wrangler.jsonc, with a share of three quarters', () => {
    expect(/"SPECTATORS":\s*"off"/.test(wrangler)).toBe(true);
    expect(/"SPECTATOR_SHARE":\s*"0\.75"/.test(wrangler)).toBe(true);
  });

  it('with SPECTATORS off, turn an owl without a ticket away past the turnstiles as before, and say nothing of spectators', async () => {
    const e = park.env();
    const guest = await guestPass(e);
    expect((await socket(e, 'hub', guest)).status).toBe(403);
    logged(cap.lines, 'room_join_refused', { room: 'hub', reason: 'gate' });
    expect(await entry(e, guest)).toEqual({ gate: 'ticket', admitted: false });
    // Outside the turnstiles it is a visitor, as everyone is.
    expect((await socket(e, 'lobby', guest)).status).not.toBe(403);
    expect(park.sockets.map((h) => h.get('X-Visitor-Kind'))).toEqual(['visitor']);
  });

  it('with SPECTATORS on, let it in as a spectator, said by the Worker alone, and say so at the turnstiles', async () => {
    const e = park.env({ SPECTATORS: 'on' });
    const guest = await guestPass(e);
    expect(await entry(e, guest)).toEqual({ gate: 'ticket', admitted: false, spectators: true });
    // The page's own word for its kind goes: only the Worker's reaches the room object.
    expect((await socket(e, 'hub', guest, { 'X-Visitor-Kind': 'visitor' })).status).not.toBe(403);
    expect((await socket(e, 'arcade', guest)).status).not.toBe(403);
    expect((await socket(e, 'lobby', guest, { 'X-Visitor-Kind': 'spectator' })).status).not.toBe(403);
    expect(park.sockets.map((h) => [h.get('X-Room'), h.get('X-Visitor-Kind')])).toEqual([
      ['hub', 'spectator'],
      ['arcade', 'spectator'],
      ['lobby', 'visitor'],
    ]);
  });

  it('let a ticket holder in as a visitor, and everyone while the gate is open', async () => {
    const e = park.env({ SPECTATORS: 'on' });
    const { admitted } = await owlWithTicket(e);
    expect(await entry(e, admitted)).toEqual({ gate: 'ticket', admitted: true, spectators: true });
    expect((await socket(e, 'hub', admitted, { 'X-Visitor-Kind': 'spectator' })).status).not.toBe(403);
    // The Worker keeps what it read of the gate a moment: this one is another deployment's.
    forgetGate();
    const open = park.env({ SPECTATORS: 'on', GATE: 'open' });
    expect((await socket(open, 'hub', await guestPass(open))).status).not.toBe(403);
    expect(park.sockets.map((h) => h.get('X-Visitor-Kind'))).toEqual(['visitor', 'visitor']);
  });

  it('keep the stores and the Realm Vote locked to a spectator, whatever the switch says', async () => {
    for (const e of [park.env({ SPECTATORS: 'on' }), park.env()]) {
      const guest = await guestPass(e);
      expect((await call(e, '/api/shop', { headers: bearer(guest) })).status).toBe(403);
      expect((await post(e, '/api/shop/buy', { variant: 'hoot~0' }, bearer(guest))).status).toBe(403);
      expect((await post(e, '/api/shop/gift', {}, bearer(guest))).status).toBe(403);
      expect((await post(e, '/api/vote', { realm: 'glass' }, bearer(guest))).status).toBe(403);
      expect((await call(e, '/api/vote/me', { headers: bearer(guest) })).status).toBe(403);
      // The collection itself shows anywhere.
      expect((await call(e, '/api/collection', { headers: bearer(guest) })).status).toBe(200);
    }
    expect(park.collected).toEqual(['inventory', 'inventory']);
  });
});
