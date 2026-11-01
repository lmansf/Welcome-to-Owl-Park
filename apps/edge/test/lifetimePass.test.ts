import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { forgetGate } from '../src/gateSwitch';
import { MemoryTicketStore, TicketBook } from '../src/TicketBook';
import { ticketDesk } from '../src/ticketDesk';
import { LIFETIME_MS } from '../src/tickets';
import { seq } from './fakeStore';

// ---- A pass that never runs out (OP-171): only the keepers' route makes one, and only one annual pass at a time ----

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
const ADMIN = 'keepers-key-0123456789';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function park(): { env: Env; book: TicketBook; store: MemoryTicketStore } {
  const store = new MemoryTicketStore();
  const book = new TicketBook(store, seq());
  const stub = (answer: (req: Request) => Response | Promise<Response>) => ({
    idFromName: (name: string) => name,
    get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input) }),
  });
  const env = {
    VOTES: stub((req) => {
      const path = new URL(req.url).pathname;
      if (path === '/gate') return Response.json({ gate: { mode: 'ticket', at: Date.now() - 1000 } });
      if (path.startsWith('/tickets/')) return ticketDesk(book, req, Date.now(), () => ({ cast: 0, today: false }));
      return Response.json({ ok: true });
    }),
    COLLECTIONS: { getByName: () => new Proxy({}, { get: () => async () => ({}) }) },
    ASSETS: { fetch: async () => new Response('<!doctype html>') },
    GATE: 'ticket',
    PASS_SIGNING_KEY: KEY,
    ADMIN_KEY: ADMIN,
    RATE_LIMITS: 'off',
  } as unknown as Env;
  return { env, book, store };
}

const call = (e: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), e, CTX);
const post = (e: Env, path: string, body: unknown, headers: Record<string, string> = {}) => call(e, path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const admin = { 'X-Admin-Key': ADMIN };

describe('a lifetime pass from the keepers (OP-171)', () => {
  it('is one annual pass a lifetime long, claimed by its link onto one device, and admits that owl', async () => {
    forgetGate();
    const { env, book } = park();
    const issued = await post(env, '/api/admin/tickets', { kind: 'annual', lifetime: true }, admin);
    expect(issued.status).toBe(200);
    const { order, tickets, link } = (await issued.json()) as { order: string; tickets: string[]; link: string };
    expect(order.startsWith('comp-')).toBe(true);
    expect(tickets).toHaveLength(1);
    expect(book.get(tickets[0]!)).toMatchObject({ kind: 'annual', lengthMs: LIFETIME_MS, device: null });

    const passed = (await (await call(env, '/api/pass')).json()) as { pass: string };
    const auth = { Authorization: `Bearer ${passed.pass}` };
    const secret = link.split('#claim=')[1];
    const claimed = await post(env, '/api/tickets/claim', { secret }, auth);
    expect(claimed.status).toBe(200);
    const wallet = ((await claimed.json()) as { tickets: Array<{ id: string; status: string; msLeft: number | null }> }).tickets;
    expect(wallet).toEqual([expect.objectContaining({ id: tickets[0], status: 'unused', msLeft: null })]);

    const scanned = (await (await post(env, '/api/tickets/scan', {}, auth)).json()) as { ok: boolean; id: string; adm: boolean; pass: string };
    expect(scanned).toMatchObject({ ok: true, id: tickets[0], adm: true });
    expect(book.get(tickets[0]!)?.validUntil).toBeGreaterThan(Date.now() + 99 * 365 * 24 * 3600_000);
  });

  it('is refused for any other kind, with hours, for more than one, without the keepers’ key, or with a lifetime that is not true', async () => {
    const { env, store } = park();
    for (const body of [
      { kind: 'day', lifetime: true },
      { kind: 'opening-night', lifetime: true, from: '2026-12-01T00:00:00Z' },
      { kind: 'annual', lifetime: true, hours: 24 },
      { kind: 'annual', lifetime: true, quantity: 2 },
      { kind: 'annual', lifetime: 'yes' },
      { kind: 'annual', lifetime: 1 },
    ]) expect((await post(env, '/api/admin/tickets', body, admin)).status, JSON.stringify(body)).toBe(400);
    expect((await post(env, '/api/admin/tickets', { kind: 'annual', lifetime: true })).status).toBe(403);
    expect((await post(env, '/api/admin/tickets', { kind: 'annual', lifetime: true }, { 'X-Admin-Key': 'not-the-keepers-key' })).status).toBe(403);
    expect(store.ofKind('annual')).toEqual([]);
  });
});
