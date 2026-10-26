import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_DEFAULTS, RIBBON_WORDS, lineRate, ribbonNow, waitMinutes, withLineChanges, withRibbonChanges, REALMS_DEFAULTS } from '@owl-park/shared';
import { CLAIM_GRACE_MS, Line } from '../src/line';
import { ENTRY_TTL_S, mintEntry, mintPass, verifyEntry, verifyPass } from '../src/pass';
import type { Env } from '../src/env';
import type { LineAnswer, OverflowState } from '../src/Overflow';
import { sqlStorage } from './sqlite';

// The Workers runtime is not here: its Durable Object base class stands in.
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
const { Overflow, TICK_MS } = await import('../src/Overflow');

const T0 = Date.UTC(2026, 11, 1, 23, 0);
const MIN = 60_000;
const HOLD = 3 * MIN;

describe('the line (OP-075)', () => {
  it('hands out numbers in order and calls them in order; a browser keeps the number it holds', () => {
    const line = new Line(sqlStorage());
    const a = line.join('c_aaaaaaaa', T0, HOLD);
    const b = line.join('c_bbbbbbbb', T0 + 1, HOLD);
    const c = line.join('c_cccccccc', T0 + 2, HOLD);
    expect([a, b, c]).toEqual([1, 2, 3]);
    expect(line.join('c_bbbbbbbb', T0 + 3, HOLD)).toBe(b);
    expect(line.waiting()).toBe(3);
    expect(line.status(c, 'c_cccccccc', T0 + 3, HOLD)).toEqual({ state: 'waiting', place: 3 });
    expect(line.tick(T0 + 5, HOLD, 2)).toBe(2);
    expect(line.front()).toBe(b);
    expect(line.status(a, 'c_aaaaaaaa', T0 + 5, HOLD)).toEqual({ state: 'called', holdUntil: T0 + 5 + HOLD });
    expect(line.status(c, 'c_cccccccc', T0 + 5, HOLD)).toEqual({ state: 'waiting', place: 1 });
    // Nobody else takes a number's turn.
    expect(line.status(a, 'c_bbbbbbbb', T0 + 6, HOLD)).toEqual({ state: 'unknown' });
    expect(line.claim(a, 'c_bbbbbbbb', T0 + 6, HOLD)).toBe(false);
    expect(line.claim(a, 'c_aaaaaaaa', T0 + 6, HOLD)).toBe(true);
    expect(line.status(a, 'c_aaaaaaaa', T0 + 7, HOLD)).toEqual({ state: 'claimed' });
  });

  it('holds a called place for its minutes, then gives it up; the owl takes a new number at the back', () => {
    const line = new Line(sqlStorage());
    const a = line.join('c_aaaaaaaa', T0, HOLD);
    const b = line.join('c_bbbbbbbb', T0, HOLD);
    line.tick(T0, HOLD, 1);
    // Called and still held: it counts against the free places.
    expect(line.outstanding(T0 + HOLD - 1, HOLD)).toBe(1);
    expect(line.claim(a, 'c_aaaaaaaa', T0 + HOLD, HOLD)).toBe(false);
    expect(line.tick(T0 + HOLD, HOLD, 1)).toBe(1);
    expect(line.status(a, 'c_aaaaaaaa', T0 + HOLD, HOLD)).toEqual({ state: 'expired' });
    expect(line.status(b, 'c_bbbbbbbb', T0 + HOLD, HOLD)).toEqual({ state: 'called', holdUntil: T0 + 2 * HOLD });
    const again = line.join('c_aaaaaaaa', T0 + HOLD + 1, HOLD);
    expect(again).toBe(3);
    expect(line.status(again, 'c_aaaaaaaa', T0 + HOLD + 1, HOLD)).toEqual({ state: 'waiting', place: 1 });
  });

  it('counts an owl let in a little longer, until it is in a room', () => {
    const line = new Line(sqlStorage());
    const a = line.join('c_aaaaaaaa', T0, HOLD);
    line.tick(T0, HOLD, 1);
    line.claim(a, 'c_aaaaaaaa', T0 + 1_000, HOLD);
    expect(line.outstanding(T0 + 1_000 + CLAIM_GRACE_MS - 1, HOLD)).toBe(1);
    expect(line.outstanding(T0 + 1_000 + CLAIM_GRACE_MS, HOLD)).toBe(0);
  });

  it('taken down, spends every number in it; a later line starts at place 1, after old numbers are forgotten too', () => {
    const line = new Line(sqlStorage());
    const a = line.join('c_aaaaaaaa', T0, HOLD);
    line.join('c_bbbbbbbb', T0, HOLD);
    line.tick(T0, HOLD, 1);
    line.clear(T0 + 1);
    expect([line.waiting(), line.outstanding(T0 + 1, HOLD)]).toEqual([0, 0]);
    expect(line.status(a, 'c_aaaaaaaa', T0 + 1, HOLD)).toEqual({ state: 'expired' });
    expect(line.tick(T0 + 2, HOLD, 5)).toBe(0);
    // A number taken now is first in line, though two numbers below it were never called.
    const c = line.join('c_cccccccc', T0 + 3, HOLD);
    expect(c - line.front()).toBe(1);
    // Hours on, the old numbers are forgotten; numbers go on from where they were, places from 1.
    const later = T0 + 7 * 60 * MIN;
    const d = line.join('c_dddddddd', later, HOLD);
    line.tick(later, HOLD, 0);
    expect(d).toBe(4);
    expect(d - line.front()).toBe(1);
    expect(line.status(d, 'c_dddddddd', later, HOLD)).toEqual({ state: 'waiting', place: 1 });
  });

  it('measures its pace over ten minutes, for a rough wait', () => {
    expect(lineRate([T0 - 11 * MIN, T0 - 9 * MIN, T0 - MIN, T0], T0)).toBe(0.3);
    expect(waitMinutes(12, 0)).toBeNull();
    expect(waitMinutes(1, 6)).toBe(1);
    expect(waitMinutes(12, 2.5)).toBe(5);
  });
});

describe('the busy-night settings (OP-075)', () => {
  it('takes changes within bounds and refuses the rest', () => {
    expect(withLineChanges(LINE_DEFAULTS, { mode: 'auto', threshold: 120 })).toEqual({ mode: 'auto', threshold: 120, holdMin: 3 });
    expect(withLineChanges(LINE_DEFAULTS, { mode: 'maybe' })).toBeNull();
    expect(withLineChanges(LINE_DEFAULTS, { threshold: -1 })).toBeNull();
    expect(withLineChanges(LINE_DEFAULTS, { threshold: 2.5 })).toBeNull();
    expect(withLineChanges(LINE_DEFAULTS, { holdMin: 0 })).toBeNull();
    expect(withLineChanges(LINE_DEFAULTS, { holdMin: 16 })).toBeNull();
    const ribbon = { on: false, words: null };
    expect(withRibbonChanges(ribbon, { on: true, words: '  The hub is   packed tonight  ' })).toEqual({ on: true, words: 'The hub is packed tonight' });
    expect(withRibbonChanges(ribbon, { words: '' })).toEqual({ on: false, words: null });
    expect(withRibbonChanges(ribbon, { words: 'x'.repeat(91) })).toBeNull();
    expect(withRibbonChanges(ribbon, { on: 'yes' })).toBeNull();
  });

  it('shows the ribbon while it is on, and by itself while the line is', () => {
    expect(ribbonNow({ on: false, words: null }, false)).toBeNull();
    expect(ribbonNow({ on: true, words: null }, false)).toBe(RIBBON_WORDS);
    expect(ribbonNow({ on: false, words: 'Busy!' }, true)).toBe('Busy!');
  });
});

describe('entries (OP-075)', () => {
  const KEY = 'test-signing-key-0123456789abcdef';
  it('let their own browser in until they run out, and are never a pass', async () => {
    const nowS = Math.floor(T0 / 1000);
    const e = await mintEntry(KEY, 'c_aaaaaaaa', nowS + ENTRY_TTL_S);
    expect(await verifyEntry(KEY, e, 'c_aaaaaaaa', nowS)).toBe(true);
    expect(await verifyEntry(KEY, e, 'c_bbbbbbbb', nowS)).toBe(false);
    expect(await verifyEntry(KEY, e, 'c_aaaaaaaa', nowS + ENTRY_TTL_S + 1)).toBe(false);
    expect(await verifyEntry('another-key-0123456789abcdefgh', e, 'c_aaaaaaaa', nowS)).toBe(false);
    expect(await verifyEntry(KEY, null, 'c_aaaaaaaa', nowS)).toBe(false);
    expect(await verifyPass(KEY, e, nowS)).toBeNull();
    const pass = await mintPass(KEY, { id: 'v_abcdefgh', exp: nowS + 600, adm: false, cid: 'c_aaaaaaaa' });
    expect(await verifyEntry(KEY, pass, 'c_aaaaaaaa', nowS)).toBe(false);
  });
});

/** The park's room objects as the overflow object sees them: counts per object, and the ribbon they were told. */
class FakeRooms {
  counts = new Map<string, Record<string, number>>();
  asked: string[] = [];
  told: Array<{ name: string; words: string | null }> = [];
  idFromName(name: string) {
    return name;
  }
  get(name: string) {
    return {
      fetch: async (url: string, init?: RequestInit) => {
        if (url.endsWith('/counts')) {
          this.asked.push(name);
          return Response.json(this.counts.get(name) ?? {});
        }
        if (url.endsWith('/notice')) {
          this.told.push({ name, words: (JSON.parse(String(init?.body)) as { words: string | null }).words });
          return Response.json({ ok: true });
        }
        return new Response('not found', { status: 404 });
      },
    };
  }
}

class FakeState {
  alarm: number | null = null;
  readonly storage = {
    sql: sqlStorage(),
    getAlarm: async () => this.alarm,
    setAlarm: async (at: number) => {
      this.alarm = at;
    },
  };
}

describe('the overflow object (OP-075)', () => {
  let rooms: FakeRooms;
  let state: FakeState;
  let obj: InstanceType<typeof Overflow>;
  const make = (sharding: 'single' | 'room' = 'single') => {
    rooms = new FakeRooms();
    state = new FakeState();
    obj = new Overflow(state as unknown as DurableObjectState, { ROOMS: rooms, ROOM_SHARDING: sharding } as unknown as Env);
  };
  const post = async <T>(path: string, body: unknown): Promise<{ status: number; body: T }> => {
    const r = await obj.fetch(new Request(`https://park${path}`, { method: 'POST', body: JSON.stringify(body) }));
    return { status: r.status, body: (await r.json()) as T };
  };
  const st = async () => (await (await obj.fetch(new Request('https://park/state'))).json()) as OverflowState;
  const join = (who: string) => post<LineAnswer>('/line/join', { who });
  const look = (n: number, who: string) => post<LineAnswer>('/line/status', { n, who });
  const at = (ms: number) => vi.setSystemTime(ms);

  beforeEach(() => {
    vi.useFakeTimers();
    at(T0);
    make();
  });
  afterEach(() => vi.useRealTimers());

  it('is quiet while off: no line, and the rooms are never asked', async () => {
    rooms.counts.set('park', { hub: 500 });
    expect(await st()).toMatchObject({ active: false, line: LINE_DEFAULTS, notice: null, count: null });
    expect((await join('c_aaaaaaaa')).body).toEqual({ state: 'go' });
    expect(rooms.asked).toEqual([]);
  });

  it('on by itself: a line from the threshold, places called in order as owls leave, and it ends once empty', async () => {
    rooms.counts.set('park', { lobby: 1, hub: 2 });
    await post('/settings', { line: { mode: 'auto', threshold: 3, holdMin: 3 } });
    expect((await st()).active).toBe(true);
    const a = (await join('c_aaaaaaaa')).body;
    const b = (await join('c_bbbbbbbb')).body;
    expect(a).toMatchObject({ state: 'waiting', n: 1, place: 1, waitMin: null });
    expect(b).toMatchObject({ state: 'waiting', n: 2, place: 2 });
    expect(state.alarm).toBe(T0 + TICK_MS);
    // An owl leaves: one place frees, and the next tick calls the first in line.
    rooms.counts.set('park', { lobby: 0, hub: 2 });
    at(T0 + TICK_MS);
    await obj.alarm();
    const turn = (await look(1, 'c_aaaaaaaa')).body;
    expect(turn).toEqual({ state: 'called', n: 1, holdUntil: T0 + TICK_MS + 3 * MIN });
    // Let in, it still counts until it is in a room: no place for the next yet.
    at(T0 + 2 * TICK_MS);
    await obj.alarm();
    expect((await look(2, 'c_bbbbbbbb')).body).toMatchObject({ state: 'waiting', place: 1, waitMin: 10 });
    // It reached the lobby, and two owls left: room for the next.
    rooms.counts.set('park', { lobby: 1, hub: 0 });
    at(T0 + 3 * TICK_MS);
    await obj.alarm();
    expect((await look(2, 'c_bbbbbbbb')).body).toMatchObject({ state: 'called', n: 2 });
    // Both in, the park below the threshold and the line empty: no line once the grace runs out.
    rooms.counts.set('park', { lobby: 2, hub: 0 });
    at(T0 + 3 * TICK_MS + CLAIM_GRACE_MS + 1);
    expect((await st()).active).toBe(false);
    expect((await join('c_cccccccc')).body).toEqual({ state: 'go' });
  });

  it('gives up a place held too long, calling the next, and the late owl joins again at the back', async () => {
    rooms.counts.set('park', { hub: 2 });
    await post('/settings', { line: { mode: 'on', threshold: 2, holdMin: 1 } });
    expect((await join('c_aaaaaaaa')).body).toMatchObject({ state: 'waiting', n: 1, place: 1 });
    expect((await join('c_bbbbbbbb')).body).toMatchObject({ state: 'waiting', n: 2, place: 2 });
    // An owl leaves: the next tick calls the first in line, whose page is away (a phone locked, say).
    rooms.counts.set('park', { hub: 1 });
    at(T0 + TICK_MS);
    await obj.alarm();
    // Its place is held for the minute, then given up to the next owl.
    at(T0 + TICK_MS + MIN + 1);
    await obj.alarm();
    expect((await look(1, 'c_aaaaaaaa')).body).toEqual({ state: 'expired' });
    expect((await look(2, 'c_bbbbbbbb')).body).toMatchObject({ state: 'called', n: 2 });
    expect((await join('c_aaaaaaaa')).body).toMatchObject({ state: 'waiting', n: 3, place: 1 });
  });

  it('turned off, takes the line down: everyone in it goes in, and a line started later calls none of them', async () => {
    rooms.counts.set('park', { hub: 1 });
    await post('/settings', { line: { mode: 'on', threshold: 1 } });
    expect((await join('c_aaaaaaaa')).body).toMatchObject({ state: 'waiting', n: 1, place: 1 });
    await post('/settings', { line: { mode: 'off' } });
    expect((await look(1, 'c_aaaaaaaa')).body).toEqual({ state: 'go' });
    // On by itself with room in the park: no line, and no old number holding a place.
    rooms.counts.set('park', {});
    expect((await post<OverflowState>('/settings', { line: { mode: 'auto' } })).body).toMatchObject({ active: false, waiting: 0 });
    expect((await join('c_bbbbbbbb')).body).toEqual({ state: 'go' });
    // On again, with the park full: the next number is first in line.
    rooms.counts.set('park', { hub: 1 });
    await post('/settings', { line: { mode: 'on' } });
    expect((await join('c_cccccccc')).body).toMatchObject({ state: 'waiting', n: 2, place: 1 });
    expect(await st()).toMatchObject({ waiting: 1, front: 1 });
  });

  it('on: every newcomer takes a number, called at once while the park has room; a claimed number goes in', async () => {
    rooms.counts.set('park', {});
    await post('/settings', { line: { mode: 'on', threshold: 10 } });
    const a = (await join('c_aaaaaaaa')).body;
    expect(a).toEqual({ state: 'called', n: 1, holdUntil: T0 + 3 * MIN });
    // Called as it arrived, it took its turn then: asked again, it goes in.
    expect((await look(1, 'c_aaaaaaaa')).body).toEqual({ state: 'go' });
    // Someone else's number tells them nothing.
    expect((await look(1, 'c_bbbbbbbb')).body).toEqual({ state: 'expired' });
  });

  it('holds no place for an owl called as it arrived once it is in: when it leaves, the next is called', async () => {
    rooms.counts.set('park', {});
    await post('/settings', { line: { mode: 'on', threshold: 1, holdMin: 3 } });
    expect((await join('c_aaaaaaaa')).body).toMatchObject({ state: 'called', n: 1 });
    // In the lobby now; the next owl waits for its place.
    rooms.counts.set('park', { lobby: 1 });
    expect((await join('c_bbbbbbbb')).body).toMatchObject({ state: 'waiting', n: 2, place: 1 });
    // A minute on, the first owl leaves: its place goes to the next at once, not when its hold would have run out.
    rooms.counts.set('park', {});
    at(T0 + MIN);
    await obj.alarm();
    expect((await look(2, 'c_bbbbbbbb')).body).toMatchObject({ state: 'called', n: 2 });
  });

  it('tells the rooms the ribbon: on, its own words, on by itself with the line, and off', async () => {
    await post('/settings', { ribbon: { on: true } });
    expect(rooms.told.at(-1)).toEqual({ name: 'park', words: RIBBON_WORDS });
    await post('/settings', { ribbon: { words: 'The market is packed tonight' } });
    expect(rooms.told.at(-1)).toEqual({ name: 'park', words: 'The market is packed tonight' });
    await post('/settings', { ribbon: { on: false } });
    expect(rooms.told.at(-1)).toEqual({ name: 'park', words: null });
    rooms.counts.set('park', { hub: 1 });
    await post('/settings', { line: { mode: 'on', threshold: 1 } });
    expect(rooms.told.at(-1)).toEqual({ name: 'park', words: 'The market is packed tonight' });
    expect((await (await obj.fetch(new Request('https://park/notice'))).json()) as unknown).toEqual({ words: 'The market is packed tonight', realms: REALMS_DEFAULTS });
  });

  it('keeps the realms switch (the stained-glass climb), refuses a room that is not gated or a night it does not know, and tells the rooms', async () => {
    expect((await post('/settings', { realms: { open: ['hub'] } })).status).toBe(400);
    expect((await post('/settings', { realms: { night: 'never' } })).status).toBe(400);
    expect((await post('/settings', { realms: { portal: 'yes' } })).status).toBe(400);
    const r = await post<OverflowState>('/settings', { realms: { open: ['glass'], portal: true, night: 'hard' } });
    expect(r.status).toBe(200);
    const realms = { open: ['glass'], portal: true, night: 'hard' };
    expect(r.body.realms).toEqual(realms);
    expect((await (await obj.fetch(new Request('https://park/notice'))).json()) as unknown).toEqual({ words: null, realms });
    // Closing it again reaches the rooms through the same notice.
    await post('/settings', { realms: { open: [] } });
    expect((await (await obj.fetch(new Request('https://park/notice'))).json()) as unknown).toEqual({ words: null, realms: { ...realms, open: [] } });
  });

  it('refuses settings out of bounds, and copies while the park runs in one object', async () => {
    expect((await post('/settings', { line: { threshold: -5 } })).status).toBe(400);
    expect((await post('/settings', { ribbon: { words: 'x'.repeat(200) } })).status).toBe(400);
    expect((await post('/settings', { copy: { room: 'hub', n: 2, state: 'open' } })).status).toBe(409);
    expect((await post('/settings', { copy: { room: 'nowhere', n: 2, state: 'open' } })).status).toBe(400);
    expect((await post('/settings', { copy: { room: 'hub', n: 1, state: 'open' } })).status).toBe(400);
  });

  it('with one object per room: opens, drains and closes copies, and counts every room and copy', async () => {
    make('room');
    rooms.counts.set('room:hub', { hub: 70 });
    rooms.counts.set('room:hub~2', { hub: 12 });
    rooms.counts.set('room:lobby', { lobby: 5 });
    expect((await post<OverflowState>('/settings', { copy: { room: 'hub', n: 2, state: 'open' } })).body.copies).toEqual({ hub: { '2': 'open' } });
    expect((await post<OverflowState>('/settings', { copy: { room: 'hub', n: 2, state: 'draining' } })).body.copies).toEqual({ hub: { '2': 'draining' } });
    await post('/settings', { line: { mode: 'auto', threshold: 100 } });
    expect(await st()).toMatchObject({ count: 87, active: false });
    expect(rooms.asked).toContain('room:hub~2');
    expect((await post<OverflowState>('/settings', { copy: { room: 'hub', n: 2, state: 'closed' } })).body.copies).toEqual({});
  });
});

describe('the Worker reading the overflow object (OP-075)', () => {
  it('looks again every few seconds while anything is on, and every half minute on a quiet night', async () => {
    const { overflowNow, forgetOverflow, OVERFLOW_KEEP_MS, OVERFLOW_QUIET_KEEP_MS, QUIET } = await import('../src/overflowState');
    forgetOverflow();
    let state: OverflowState = QUIET;
    const read = vi.fn(async () => state);
    await overflowNow(read, T0);
    await overflowNow(read, T0 + OVERFLOW_QUIET_KEEP_MS - 1);
    expect(read).toHaveBeenCalledTimes(1);
    state = { ...QUIET, ribbon: { on: true, words: null }, notice: RIBBON_WORDS };
    expect((await overflowNow(read, T0 + OVERFLOW_QUIET_KEEP_MS)).notice).toBe(RIBBON_WORDS);
    await overflowNow(read, T0 + OVERFLOW_QUIET_KEEP_MS + OVERFLOW_KEEP_MS - 1);
    expect(read).toHaveBeenCalledTimes(2);
    await overflowNow(read, T0 + OVERFLOW_QUIET_KEEP_MS + OVERFLOW_KEEP_MS);
    expect(read).toHaveBeenCalledTimes(3);
    // The object out of reach: the last answer stands.
    const down = vi.fn(async (): Promise<OverflowState> => {
      throw new Error('away');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await overflowNow(down, T0 + 10 * OVERFLOW_QUIET_KEEP_MS)).notice).toBe(RIBBON_WORDS);
    forgetOverflow();
  });
});

describe('the rooms asking for the ribbon (OP-075)', () => {
  it('answer from the last count, so a park of many room objects never makes each of them count it again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const rooms = new FakeRooms();
    const state = new FakeState();
    const obj = new Overflow(state as unknown as DurableObjectState, { ROOMS: rooms, ROOM_SHARDING: 'room' } as unknown as Env);
    await obj.fetch(new Request('https://park/settings', { method: 'POST', body: JSON.stringify({ line: { mode: 'auto', threshold: 10 } }) }));
    rooms.asked.length = 0;
    vi.setSystemTime(T0 + 60_000);
    expect((await (await obj.fetch(new Request('https://park/notice'))).json()) as unknown).toEqual({ words: null, realms: REALMS_DEFAULTS });
    expect(rooms.asked).toEqual([]);
    vi.useRealTimers();
  });
});
