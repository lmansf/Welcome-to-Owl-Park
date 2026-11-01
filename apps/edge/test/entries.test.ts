import { afterEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS, type RealmsSettings } from '@owl-park/shared';
import type { Env } from '../src/env';
import { forgetGate } from '../src/gateSwitch';
import { forgetLimits } from '../src/limits';
import type { OverflowState } from '../src/Overflow';
import { forgetOverflow } from '../src/overflowState';

// ---- The entries setting (OP-156) through the Worker: which park a new owl's pass sends it to ----

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

const KEY = 'test-signing-key-0123456789abcdef';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

/** The park behind the Worker: the gate as the keepers set it and the realms switch with the tree's share. */
function park(realms: RealmsSettings, gate: 'open' | 'ticket'): Env {
  const stub = (answer: (path: string) => Response) => ({
    idFromName: (n: string) => n,
    get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(new URL((typeof input === 'string' ? new Request(input, init) : input).url).pathname) }),
  });
  const overflow: OverflowState = { line: LINE_DEFAULTS, active: false, waiting: 0, front: 0, rate: 1, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms };
  return {
    VOTES: stub((path) => (path === '/gate' ? Response.json({ gate: null, restartAt: null }) : Response.json({ ok: true }))),
    OVERFLOW: stub(() => Response.json(overflow)),
    ROOMS: stub(() => Response.json({})),
    COLLECTIONS: { getByName: () => new Proxy({}, { get: () => async () => ({}) }) },
    ASSETS: { fetch: async () => new Response('<!doctype html>') },
    GATE: gate,
    PASS_SIGNING_KEY: KEY,
    RATE_LIMITS: 'off',
  } as unknown as Env;
}

/** A new owl's pass reply, or the same owl's again with its collector token. */
const pass = async (env: Env, collector?: string) =>
  (await (await worker.fetch(new Request('https://park.example/api/pass', collector ? { headers: { 'X-Collector': collector } } : {}), env, CTX)).json()) as { map?: number; collector: string; gate: string };

afterEach(() => {
  forgetOverflow();
  forgetGate();
  forgetLimits();
});

describe('the entries setting (OP-156)', () => {
  it('says nothing of a park while the tree takes no share: every owl starts in today’s park', async () => {
    const r = await pass(park(REALMS_DEFAULTS, 'open'));
    expect(r.map).toBeUndefined();
  });

  it('sends every new owl into the tree at 100, while the front gate lets everyone in', async () => {
    const env = park({ ...REALMS_DEFAULTS, tree: 100 }, 'open');
    const first = await pass(env);
    expect(first.map).toBe(2);
    // The same owl on its next visit starts there again.
    expect((await pass(env, first.collector)).map).toBe(2);
  });

  it('sends no guest into the tree while the park takes tickets: its pass would not get it past the gate there', async () => {
    const r = await pass(park({ ...REALMS_DEFAULTS, tree: 100 }, 'ticket'));
    expect(r.gate).toBe('ticket');
    expect(r.map).toBeUndefined();
  });

  it('sends about its share of owls, each the same way every visit', async () => {
    const env = park({ ...REALMS_DEFAULTS, tree: 50 }, 'open');
    const owls = await Promise.all(Array.from({ length: 120 }, () => pass(env)));
    const inTree = owls.filter((o) => o.map === 2);
    expect(inTree.length).toBeGreaterThan(30);
    expect(inTree.length).toBeLessThan(90);
    for (const o of owls.slice(0, 20)) expect((await pass(env, o.collector)).map).toBe(o.map);
  });
});
