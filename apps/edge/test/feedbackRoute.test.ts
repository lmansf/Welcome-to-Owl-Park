import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS, hashForLog, type FeedbackDraft } from '@owl-park/shared';
import type { Env } from '../src/env';
import { forgetGate } from '../src/gateSwitch';
import { forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { mintPass } from '../src/pass';
import { FEEDBACK_PER_ADDRESS, forgetFeedbackAddresses } from '../src/routes/feedback';
import { logged } from './logged';

// ---- The feedback box at the Worker (OP-236): what reaches the keepers, and how much one address may send ----

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
const state: OverflowState = { line: LINE_DEFAULTS, active: false, waiting: 0, front: 0, rate: 0, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms: REALMS_DEFAULTS };
const stub = (answer: (req: Request) => Response) => ({
  idFromName: (name: string) => name,
  get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input) }),
});

/** Every note that reached the collections object, and whether each climbs the thanks ladder (OP-272). */
let kept: FeedbackDraft[] = [];
let earned: boolean[] = [];
let closedFor: string[] = [];
const env = (more: Record<string, string> = {}) =>
  ({
    VOTES: stub((req) => (new URL(req.url).pathname === '/gate' ? Response.json({ gate: null }) : Response.json({ ok: true }))),
    OVERFLOW: stub(() => Response.json(state)),
    ROOMS: stub(() => new Response('in')),
    COLLECTIONS: {
      getByName: () => ({
        addFeedback: async (_cid: string, draft: FeedbackDraft, _ua: unknown, _visit: unknown, earns: boolean) => {
          kept.push(draft);
          earned.push(earns);
          return { ok: true, id: kept.length };
        },
        feedbackRewards: async () => ({ given: 1, closed: false }),
        closeFeedbackCard: async (cid: string) => {
          closedFor.push(cid);
          return { given: 0, closed: true };
        },
      }),
    },
    ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }) },
    GATE: 'open',
    PASS_SIGNING_KEY: KEY,
    ...more,
  }) as unknown as Env;

let n = 0;
const passFor = (cid: string, adm = true) => mintPass(KEY, { id: `v_note${String(++n).padStart(5, '0')}`, exp: Math.floor(Date.now() / 1000) + 600, adm, cid });
const send = async (text: string, pass: string, ip = '198.51.100.7', e = env()) =>
  worker.fetch(
    new Request('https://park.example/api/feedback', { method: 'POST', headers: { Authorization: `Bearer ${pass}`, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({ kind: 'bug', text }) }),
    e,
    CTX,
  );

let cap: ReturnType<typeof captureLogs>;
beforeEach(() => {
  kept = [];
  earned = [];
  closedFor = [];
  forgetLimits();
  forgetFeedbackAddresses();
  forgetGate();
  forgetOverflow();
  forgetCounts();
  cap = captureLogs();
});
afterEach(() => {
  cap.restore();
  vi.useRealTimers();
});

describe('the feedback box at the Worker (OP-236)', () => {
  it('keeps the note with its email, phone number, link and address taken out', async () => {
    const r = await send('the gate froze. my email is kid@example.com, call 813-555-0142, I live at 12 Pine Road, my site is owlfan.com', await passFor('c_notes00001'));
    expect(r.status).toBe(200);
    expect(kept.map((d) => d.text)).toEqual(['the gate froze. my email is [email], call [phone], I live at [address], my site is [link]']);
  });

  it('takes this many notes an hour from one address, however many owls send them, then 429 and one line; another address goes on', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T20:00:00Z'));
    const statuses: number[] = [];
    // A fresh owl for every note: the owl's own limits never come into it.
    for (let i = 0; i < FEEDBACK_PER_ADDRESS.limit + 3; i++) statuses.push((await send(`note number ${i}`, await passFor(`c_flood${String(i).padStart(5, '0')}`))).status);
    expect(statuses.slice(0, FEEDBACK_PER_ADDRESS.limit)).toEqual(Array(FEEDBACK_PER_ADDRESS.limit).fill(200));
    expect(statuses.slice(FEEDBACK_PER_ADDRESS.limit)).toEqual([429, 429, 429]);
    expect(kept).toHaveLength(FEEDBACK_PER_ADDRESS.limit);
    logged(cap.lines, 'rate_limited', { component: 'worker.guard', level: 'warn', route: '/api/feedback', limit: 'feedback-address', collector_hash: hashForLog(`c_flood${String(FEEDBACK_PER_ADDRESS.limit).padStart(5, '0')}`) });
    expect(cap.lines.filter((l) => l.event === 'rate_limited')).toHaveLength(1);
    expect((await send('from next door', await passFor('c_neighbor01'), '198.51.100.8')).status).toBe(200);
    // The hour out, the address may send again.
    vi.setSystemTime(Date.now() + FEEDBACK_PER_ADDRESS.windowMs);
    expect((await send('back again', await passFor('c_flood99999'))).status).toBe(200);
  });

  it('counts nothing with RATE_LIMITS off (a load test’s throwaway copy)', async () => {
    const off = env({ RATE_LIMITS: 'off' });
    for (let i = 0; i < FEEDBACK_PER_ADDRESS.limit + 1; i++) expect((await send(`note ${i}`, await passFor(`c_load${String(i).padStart(6, '0')}`), '198.51.100.7', off)).status).toBe(200);
  });
});

describe('the thanks ladder at the Worker (OP-272)', () => {
  const call = async (path: string, method: string, pass: string, e = env()) =>
    worker.fetch(new Request(`https://park.example${path}`, { method, headers: { Authorization: `Bearer ${pass}`, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) }), e, CTX);

  it('lets an owl past the turnstiles climb it, and keeps a guest’s note without it', async () => {
    const tickets = env({ GATE: 'ticket' });
    expect((await send('the gate froze on me twice', await passFor('c_ticket0001'), '198.51.100.7', tickets)).status).toBe(200);
    expect((await send('the gate froze on me twice', await passFor('c_guest00001', false), '198.51.100.7', tickets)).status).toBe(200);
    expect(earned).toEqual([true, false]);
    expect(kept).toHaveLength(2);
  });

  it('answers the ladder as it stands, with whether this owl earns, and closes the card for this owl only', async () => {
    const tickets = env({ GATE: 'ticket' });
    expect(await (await call('/api/feedback/reward', 'GET', await passFor('c_ticket0002'), tickets)).json()).toEqual({ earns: true, given: 1, closed: false });
    expect(await (await call('/api/feedback/reward', 'GET', await passFor('c_guest00002', false), tickets)).json()).toEqual({ earns: false, given: 1, closed: false });
    expect(await (await call('/api/feedback/close', 'POST', await passFor('c_ticket0003'), tickets)).json()).toEqual({ earns: true, given: 0, closed: true });
    expect(closedFor).toEqual(['c_ticket0003']);
  });

  it('refuses the wrong method, and a request without a pass', async () => {
    const pass = await passFor('c_ticket0004');
    expect((await call('/api/feedback/reward', 'POST', pass)).status).toBe(404);
    expect((await call('/api/feedback/close', 'GET', pass)).status).toBe(404);
    expect((await call('/api/feedback', 'GET', pass)).status).toBe(404);
    expect((await worker.fetch(new Request('https://park.example/api/feedback/reward'), env(), CTX)).status).toBe(401);
    expect(closedFor).toEqual([]);
  });
});
