import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS, type Copies } from '@owl-park/shared';
import { withCopy } from '../src/copies';
import type { Env } from '../src/env';
import { captureLogs, loggerFor } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { isPublicCall } from '../src/limits';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { SHARES_CACHE, tellHallShares } from '../src/routes/vote';
import { logged } from './logged';

// ---- The vote desk in the Great Hollow (OP-288): the Worker's side, with the vote ledger and the room objects standing in ----

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));
const worker = (await import('../src/index')).default;

const SHARES = { month: '2026-11', shares: { grove: 50, market: 30, glass: 20 } };
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

/** What reached each room object, by its name. */
let told: Record<string, unknown[]>;
let cap: ReturnType<typeof captureLogs>;

function env(more: { sharding?: string; copies?: Copies; ledger?: () => Response } = {}): Env {
  const overflow: OverflowState = {
    line: LINE_DEFAULTS,
    active: false,
    waiting: 0,
    front: 0,
    rate: 1,
    ribbon: RIBBON_DEFAULTS,
    notice: null,
    copies: more.copies ?? {},
    count: null,
    countedAt: null,
    realms: REALMS_DEFAULTS,
  };
  const stub = (answer: (name: string, req: Request) => Response | Promise<Response>) => ({
    idFromName: (n: string) => n,
    get: (name: string) => ({
      fetch: async (input: Request | string, init?: RequestInit) =>
        answer(name, typeof input === 'string' ? new Request(input, init) : input),
    }),
  });
  return {
    VOTES: stub((_n, req) =>
      new URL(req.url).pathname === '/shares' ? (more.ledger?.() ?? Response.json(SHARES)) : Response.json({ ok: true }),
    ),
    OVERFLOW: stub(() => Response.json(overflow)),
    ROOMS: stub(async (name, req) => {
      told[name] = [...(told[name] ?? []), await req.json()];
      return Response.json({ ok: true });
    }),
    ASSETS: { fetch: async () => new Response('<!doctype html>') },
    GATE: 'open',
    PASS_SIGNING_KEY: 'test-signing-key-0123456789abcdef',
    RATE_LIMITS: 'off',
    ...(more.sharding ? { ROOM_SHARDING: more.sharding } : {}),
  } as unknown as Env;
}

beforeEach(() => {
  told = {};
  forgetOverflow();
  forgetCounts();
  cap = captureLogs();
});
afterEach(() => {
  cap.restore();
  vi.restoreAllMocks();
});

describe('the vote desk’s shares (OP-288)', () => {
  it('gives anyone this month’s shares in whole percents, never a count, for a short while', async () => {
    const r = await worker.fetch(new Request('https://park.example/api/vote/shares'), env(), CTX);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe(SHARES_CACHE);
    expect(await r.json()).toEqual(SHARES);
    // A page asks before it has a pass, and the rate limits let that through as they do the counts.
    expect(isPublicCall('/api/vote/shares')).toBe(true);
  });

  it('tells the one park object, or every open copy of the Great Hollow, the new shares after a vote', async () => {
    await tellHallShares(env(), loggerFor({}));
    expect(told).toEqual({ park: [SHARES] });
    told = {};
    forgetOverflow();
    await tellHallShares(env({ sharding: 'room', copies: withCopy(withCopy({}, 'm3-hall', 2, 'open'), 'hub', 2, 'open') }), loggerFor({}));
    expect(told).toEqual({ 'room:m3-hall': [SHARES], 'room:m3-hall~2': [SHARES] });
  });

  it('logs and tells no room when the ledger cannot say', async () => {
    await tellHallShares(env({ ledger: () => new Response('down', { status: 500 }) }), loggerFor({}));
    expect(told).toEqual({});
    logged(cap.lines, 'write_failed', { component: 'worker' });
  });
});
