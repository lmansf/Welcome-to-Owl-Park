import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS, type Copies } from '@owl-park/shared';
import { copiesIn, copyObjectName, pickCopy, withCopy } from '../src/copies';
import type { Env } from '../src/env';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { mintEntry, mintPass } from '../src/pass';

describe('copies of a room (OP-075)', () => {
  it('lists a room’s copies by state, and opens, drains and closes them', () => {
    let c: Copies = {};
    c = withCopy(c, 'hub', 2, 'open');
    c = withCopy(c, 'hub', 3, 'open');
    c = withCopy(c, 'hub', 3, 'draining');
    expect(copiesIn(c, 'hub')).toEqual({ open: [2], draining: [3] });
    expect(copiesIn(c, 'grove')).toEqual({ open: [], draining: [] });
    c = withCopy(withCopy(c, 'hub', 2, 'closed'), 'hub', 3, 'closed');
    expect(c).toEqual({});
    expect(copyObjectName('hub', 1)).toBe('room:hub');
    expect(copyObjectName('hub', 2)).toBe('room:hub~2');
  });

  it('sends a newcomer to the copy with the most free places, back to its own copy while it is there, and never to a draining one', () => {
    expect(pickCopy([2], [], { 1: 30, 2: 10 }, 80, null)).toBe(2);
    expect(pickCopy([2], [], { 1: 10, 2: 10 }, 80, null)).toBe(1);
    expect(pickCopy([2, 3], [], { 1: 40, 2: 20, 3: 20 }, 80, null)).toBe(2);
    expect(pickCopy([], [2], { 1: 70, 2: 0 }, 80, null)).toBe(1);
    // A dropped socket goes back to the copy it was in, draining or not, while it has a place.
    expect(pickCopy([], [2], { 1: 10, 2: 30 }, 80, 2)).toBe(2);
    expect(pickCopy([3], [], { 1: 10, 3: 79 }, 80, 3)).toBe(3);
    expect(pickCopy([3], [], { 1: 10, 3: 80 }, 80, 3)).toBe(1);
    // A copy that is gone is no home to go back to.
    expect(pickCopy([], [], { 1: 10, 2: 0 }, 80, 2)).toBe(1);
    // All full: the emptiest, which turns the owl away.
    expect(pickCopy([2], [], { 1: 80, 2: 80 }, 80, null)).toBe(1);
  });
});

// ---- The Worker routing owls across copies, with the room objects and the overflow object standing in ----

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
  /** The page's end of an upgraded socket (the runtime's own `webSocket`). */
  readonly socket: unknown;
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
    super(body, init?.status === 101 ? { ...init, status: 200 } : init);
    this.socket = init?.webSocket ?? null;
  }
}
vi.stubGlobal('Response', WorkerResponse);
class FakeServerSocket {
  closed: { code: number; reason: string } | null = null;
  readonly listeners = new Map<string, Array<() => void>>();
  accept() {}
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  /** The page's end speaks (its hello). */
  hello() {
    for (const fn of this.listeners.get('message') ?? []) fn();
  }
  close(code: number, reason: string) {
    this.closed = { code, reason };
  }
}
/** What the Worker leaves running after it answers (a turned-away socket waiting for its page). */
const waits: Array<Promise<unknown>> = [];
const CTX = { waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;
vi.stubGlobal(
  'WebSocketPair',
  class {
    0 = { side: 'client' };
    1 = new FakeServerSocket();
  },
);
const worker = (await import('../src/index')).default;

const KEY = 'test-signing-key-0123456789abcdef';

/** The room objects: each socket that reaches one is counted in it, and remembered with its headers. */
class FakeRooms {
  readonly owls = new Map<string, number>();
  readonly arrivals: Array<{ name: string; copy: string | null; entry: boolean }> = [];
  idFromName(name: string) {
    return name;
  }
  get(name: string) {
    return {
      fetch: async (input: Request | string) => {
        const req = typeof input === 'string' ? new Request(input) : input;
        if (new URL(req.url).pathname === '/counts') return Response.json({ hub: this.owls.get(name) ?? 0 });
        this.owls.set(name, (this.owls.get(name) ?? 0) + 1);
        this.arrivals.push({ name, copy: req.headers.get('X-Room-Copy'), entry: !!req.headers.get('X-Entry') });
        return new Response('in');
      },
    };
  }
}

function overflowWith(state: Partial<OverflowState>) {
  const full: OverflowState = { line: LINE_DEFAULTS, active: false, waiting: 0, front: 0, rate: 0, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms: REALMS_DEFAULTS, ...state };
  return { idFromName: () => 'park', get: () => ({ fetch: async () => Response.json(full) }) };
}

const VOTES = { idFromName: () => 'park', get: () => ({ fetch: async () => Response.json({ gate: null }) }) };

describe('the Worker sends owls across two copies of a room (OP-075)', () => {
  let rooms: FakeRooms;
  let n = 0;
  const env = (over: Partial<OverflowState>, sharding = 'room') =>
    ({ ROOMS: rooms, OVERFLOW: overflowWith(over), VOTES, ROOM_SHARDING: sharding, GATE: 'open', PASS_SIGNING_KEY: KEY, ROOM_CAPS: '{"hub":3}' }) as unknown as Env;
  const pass = async (cid: string) => mintPass(KEY, { id: `v_owl${String(++n).padStart(5, '0')}`, exp: Math.floor(Date.now() / 1000) + 600, adm: false, cid });
  const arrive = async (e: Env, query = '', cid = `c_owl${String(n + 1).padStart(5, '0')}`) =>
    worker.fetch(new Request(`https://park.example/ws/hub?pass=${encodeURIComponent(await pass(cid))}${query}`, { headers: { Upgrade: 'websocket' } }), e, CTX);

  beforeEach(() => {
    rooms = new FakeRooms();
    forgetOverflow();
    forgetCounts();
  });
  afterEach(() => {
    forgetOverflow();
    forgetCounts();
  });

  it('splits newcomers between the room and its open copy, each its own object, the most free places first', async () => {
    const e = env({ copies: { hub: { '2': 'open' } } });
    for (let i = 0; i < 6; i++) await arrive(e);
    expect(rooms.arrivals.map((a) => a.name)).toEqual(['room:hub', 'room:hub~2', 'room:hub', 'room:hub~2', 'room:hub', 'room:hub~2']);
    expect(rooms.arrivals.map((a) => a.copy)).toEqual(['1', '2', '1', '2', '1', '2']);
    // Every socket carries a fresh entry for the next room.
    expect(rooms.arrivals.every((a) => a.entry)).toBe(true);
  });

  it('sends no newcomer to a draining copy, but a dropped socket back to it while it is there', async () => {
    rooms.owls.set('room:hub~2', 2);
    forgetCounts();
    const e = env({ copies: { hub: { '2': 'draining' } } });
    await arrive(e);
    await arrive(e, '&copy=2');
    expect(rooms.arrivals.map((a) => a.name)).toEqual(['room:hub', 'room:hub~2']);
    // Closed: the copy is no home to go back to.
    forgetOverflow();
    await arrive(env({ copies: {} }), '&copy=2');
    expect(rooms.arrivals.at(-1)?.name).toBe('room:hub');
  });

  it('keeps every room in one object while the park runs that way, copies or not', async () => {
    const e = env({ copies: { hub: { '2': 'open' } } }, 'single');
    for (let i = 0; i < 3; i++) await arrive(e);
    expect(rooms.arrivals.map((a) => a.name)).toEqual(['park', 'park', 'park']);
  });

  it('turns a newcomer away to the line while there is one, and lets an owl with an entry in', async () => {
    const e = env({ active: true });
    const away = (await arrive(e)) as WorkerResponse;
    expect(away.socket).toEqual({ side: 'client' });
    expect(rooms.arrivals).toHaveLength(0);
    const cid = 'c_insider01';
    const entry = await mintEntry(KEY, cid);
    await arrive(e, `&entry=${encodeURIComponent(entry)}`, cid);
    expect(rooms.arrivals.map((a) => a.name)).toEqual(['room:hub']);
    // Someone else's entry is no good.
    await arrive(e, `&entry=${encodeURIComponent(entry)}`, 'c_stranger1');
    expect(rooms.arrivals).toHaveLength(1);
  });

  it('closes a turned-away socket with the line’s own code', async () => {
    const opened: FakeServerSocket[] = [];
    vi.stubGlobal(
      'WebSocketPair',
      class {
        0 = { side: 'client' };
        1 = (() => {
          const s = new FakeServerSocket();
          opened.push(s);
          return s;
        })();
      },
    );
    const before = waits.length;
    await arrive(env({ active: true }));
    // Not before the page holds its end of the socket (its hello says so): closed sooner, the connection is lost instead.
    expect(opened[0]?.closed).toBeNull();
    opened[0]?.hello();
    expect(opened[0]?.closed).toEqual({ code: CLOSE.QUEUED, reason: 'line' });
    await Promise.all(waits.slice(before));
  });
});

describe('the Worker answering looks at a long line (OP-075)', () => {
  it('answers a number waiting when it last read the line itself, and asks the line about one called or taken since', async () => {
    forgetOverflow();
    const asked: number[] = [];
    const read: OverflowState = { line: { mode: 'on', threshold: 1, holdMin: 3 }, active: true, waiting: 3, front: 40, rate: 2, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: 1, countedAt: 0, realms: REALMS_DEFAULTS };
    const OVERFLOW = {
      idFromName: () => 'park',
      get: () => ({
        fetch: async (url: string, init?: RequestInit) => {
          if (url.endsWith('/state')) return Response.json(read);
          const n = (JSON.parse(String(init?.body)) as { n: number }).n;
          asked.push(n);
          return Response.json({ state: 'waiting', n, place: n - 40, waitMin: 2 });
        },
      }),
    };
    const e = { OVERFLOW, VOTES, ROOM_SHARDING: 'single', GATE: 'open', PASS_SIGNING_KEY: KEY } as unknown as Env;
    const pass = await mintPass(KEY, { id: 'v_waiting1', exp: Math.floor(Date.now() / 1000) + 600, adm: false, cid: 'c_waiting1' });
    const look = async (n: number) => (await worker.fetch(new Request(`https://park.example/api/line?n=${n}`, { headers: { Authorization: `Bearer ${pass}` } }), e, {} as ExecutionContext)).json();
    expect(await look(42)).toEqual({ state: 'waiting', n: 42, place: 2, waitMin: 1 });
    expect(await look(43)).toEqual({ state: 'waiting', n: 43, place: 3, waitMin: 2 });
    expect(asked).toEqual([]);
    // Taken since (above every number waiting then), or called since (at or below the front).
    await look(44);
    await look(40);
    expect(asked).toEqual([44, 40]);
    forgetOverflow();
  });
});
