import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOSE,
  CollectionBook,
  EDGE_PROTOCOL_VERSION,
  FROM_STUMP_SPAWN,
  MemoryCollectionStore,
  PARTY_FEATHERS,
  PARTY_LONGEST_MS,
  PARTY_PAID_GAMES,
  RESTART_HOUR_UTC,
  STUMP_ROOM,
  isPartyRoom,
  nextRestartAt,
  type ClientFrame,
  type OwlLook,
  type PartyOp,
  type ServerFrame,
} from '@owl-park/shared';
import type { Env } from '../src/env';
import { captureLogs } from '../src/logs';
import { RESTART_CRON } from '../src/crons';
import { publicCounts, roomCap } from '../src/rooms';
import { logged } from './logged';

// The Workers runtime is not here: its Durable Object base class and the globals the room object
// touches stand in (as in RoomObject.test.ts), with a storage that keeps what it is given.
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
vi.stubGlobal('WebSocketRequestResponsePair', class {});
vi.stubGlobal('WebSocket', { READY_STATE_OPEN: 1 });
const { RoomObject } = await import('../src/RoomObject');

/** 2026-11-08 18:00 UTC: hours before the night's restart. */
const DAY = Date.UTC(2026, 10, 8, 18, 0, 0);
const LOOK: OwlLook = { body: '#2F3E5C', belly: '#E0D4F0', accent: '#FF2AA1', species: 'barn' };

class FakeSocket {
  readyState = 1;
  frames: ServerFrame[] = [];
  closed: { code: number; reason: string } | null = null;
  private att: unknown = null;
  send(text: string) {
    if (this.readyState !== 1) throw new Error('closed');
    this.frames.push(JSON.parse(text) as ServerFrame);
  }
  close(code: number, reason: string) {
    this.readyState = 3;
    this.closed ??= { code, reason };
  }
  serializeAttachment(v: unknown) {
    this.att = structuredClone(v);
  }
  deserializeAttachment() {
    return structuredClone(this.att);
  }
  of<T extends ServerFrame['t']>(t: T): Array<Extract<ServerFrame, { t: T }>> {
    return this.frames.filter((f) => f.t === t) as Array<Extract<ServerFrame, { t: T }>>;
  }
  last<T extends ServerFrame['t']>(t: T): Extract<ServerFrame, { t: T }> | undefined {
    return this.of(t).at(-1);
  }
}

class FakeState {
  readonly sockets: Array<{ ws: FakeSocket; tags: string[] }> = [];
  readonly kept = new Map<string, unknown>();
  alarm: number | null = null;
  readonly storage = {
    get: async (key: string) => structuredClone(this.kept.get(key)),
    put: async (key: string, value: unknown) => void this.kept.set(key, structuredClone(value)),
    delete: async (key: string) => this.kept.delete(key),
    getAlarm: async () => this.alarm,
    setAlarm: async (at: number) => void (this.alarm = at),
  };
  setWebSocketAutoResponse() {}
  acceptWebSocket(ws: FakeSocket, tags: string[]) {
    this.sockets.push({ ws, tags });
  }
  getWebSockets(tag?: string) {
    return this.sockets.filter((s) => s.ws.readyState === 1 && (tag === undefined || s.tags.includes(tag))).map((s) => s.ws);
  }
  blockConcurrencyWhile<T>(fn: () => Promise<T>) {
    return fn();
  }
  /** Every page heartbeats as it should. */
  getWebSocketAutoResponseTimestamp() {
    return new Date(clock);
  }
  waitUntil(p: Promise<unknown>) {
    void p.catch(() => undefined);
  }
}

/** The collections object: the real book pays the party games; every other call answers nothing much. */
class FakeCollections {
  readonly book = new CollectionBook(new MemoryCollectionStore());
  readonly paid: Array<{ cid: string; place: number }> = [];
  partyGame(cid: string, place: number) {
    this.paid.push({ cid, place });
    return Promise.resolve(this.book.partyGame(cid, place, Date.now()));
  }
  questEvent() {
    return Promise.resolve({ updates: [] });
  }
}
const fakeCollections = (c: FakeCollections) => new Proxy(c, { get: (t, k) => (t as unknown as Record<string | symbol, unknown>)[k] ?? (() => Promise.resolve(null)) });

let clock = DAY;
let state: FakeState;
let collections: FakeCollections;
let sockets = 0;

const roomObject = () => new RoomObject(state as unknown as DurableObjectState, { GATE: 'open', COLLECTIONS: { getByName: () => fakeCollections(collections) } } as unknown as Env);
type Obj = ReturnType<typeof roomObject>;

function connect(room: string, id: string, cid?: string, spec = false): FakeSocket {
  const ws = new FakeSocket();
  ws.serializeAttachment({ room, id, sid: `sid${++sockets}`, ip: '192.0.2.1', joinedAt: clock, state: null, ...(cid ? { cid } : {}), ...(spec ? { spec: true } : {}) });
  state.acceptWebSocket(ws, [`id:${id}`, 'ip:192.0.2.1', `room:${room}`]);
  return ws;
}
const send = (obj: Obj, ws: FakeSocket, frame: ClientFrame | Record<string, unknown>) => obj.webSocketMessage(ws as unknown as WebSocket, JSON.stringify(frame));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** An owl in the Party Grove, in front of the stump. */
async function atStump(obj: Obj, id: string, opts: { cid?: string; spec?: boolean } = {}) {
  const ws = connect(STUMP_ROOM, id, opts.cid, opts.spec);
  await send(obj, ws, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK, spawn: FROM_STUMP_SPAWN });
  return ws;
}
let r = 0;
const party = (obj: Obj, ws: FakeSocket, op: PartyOp, more: Record<string, unknown> = {}) => send(obj, ws, { t: 'party', op, r: ++r, ...more });

/** Into the game's room the stump sent this owl to. */
async function intoGame(obj: Obj, from: FakeSocket, id: string, opts: { cid?: string; spec?: boolean } = {}) {
  const go = from.of('stump').find((f) => f.go)?.go;
  expect(isPartyRoom(go)).toBe(true);
  const ws = connect(go!, id, opts.cid, opts.spec);
  await send(obj, ws, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK });
  return ws;
}

/** Run the object's alarm at each time it asks for, until the game's room is let go; the pages ask for the game now and then, as a page in play does. */
async function playOut(obj: Obj, room: string, pages: FakeSocket[], limit = PARTY_LONGEST_MS) {
  const end = clock + limit;
  let asked = clock;
  while (clock < end && state.kept.get(`party:${room}`) !== undefined) {
    clock = Math.max(clock + 1, state.alarm ?? clock + 1_000);
    state.alarm = null;
    await obj.alarm();
    if (clock - asked > 30_000) {
      asked = clock;
      for (const ws of pages) if (ws.readyState === 1) await party(obj, ws, 'view');
    }
    await settle();
  }
}

beforeEach(() => {
  clock = DAY;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  state = new FakeState();
  collections = new FakeCollections();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Old Stump (OP-314)', () => {
  it('seats owls who stand by it, shows the seats to those watching, and turns a fifth owl away', async () => {
    const lines = captureLogs();
    const obj = roomObject();
    const owls = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => atStump(obj, id)));
    await party(obj, owls[0]!, 'stump');
    expect(owls[0]!.last('stump')).toMatchObject({ ok: true, stump: { seats: [null, null, null, null], starter: null, closing: false } });
    for (const ws of owls.slice(0, 4)) await party(obj, ws, 'sit');
    expect(owls[3]!.last('stump')).toMatchObject({ ok: true });
    // The watcher heard each owl sit; the first to sit starts.
    expect(owls[0]!.last('stump')!.stump.seats.map((s) => s?.owl)).toEqual(['a', 'b', 'c', 'd']);
    expect(owls[0]!.last('stump')!.stump.starter).toBe(0);
    await party(obj, owls[4]!, 'sit');
    expect(owls[4]!.last('stump')).toMatchObject({ ok: false, reason: 'full' });
    logged(lines.lines, 'party_refused', { reason: 'full' });
    // Standing up frees the seat for it.
    await party(obj, owls[2]!, 'stand');
    await party(obj, owls[4]!, 'sit');
    expect(owls[4]!.last('stump')!.stump.seats[2]?.owl).toBe('e');
  });

  it('seats nobody far from the stump', async () => {
    const obj = roomObject();
    const ws = connect(STUMP_ROOM, 'far');
    await send(obj, ws, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK });
    await party(obj, ws, 'sit');
    expect(ws.last('stump')).toMatchObject({ ok: false, reason: 'far' });
  });

  it('starts only from the first owl to sit, with two owls or more, and sends each owl seated to the game', async () => {
    const lines = captureLogs();
    const obj = roomObject();
    const a = await atStump(obj, 'a', { cid: 'c_aaaaAAAA' });
    const b = await atStump(obj, 'b', { cid: 'c_bbbbBBBB' });
    await party(obj, a, 'sit');
    await party(obj, a, 'start');
    expect(a.last('stump')).toMatchObject({ ok: false, reason: 'few' });
    await party(obj, b, 'sit');
    await party(obj, b, 'start');
    expect(b.last('stump')).toMatchObject({ ok: false, reason: 'not-starter' });
    await party(obj, a, 'start', { bots: true });
    const go = a.of('stump').find((f) => f.go)!.go!;
    expect(isPartyRoom(go)).toBe(true);
    expect(b.of('stump').find((f) => f.go)!.go).toBe(go);
    // The seats are free again for the next game.
    expect(a.last('stump')!.stump.seats).toEqual([null, null, null, null]);
    logged(lines.lines, 'party_started', { owls: 2, bots: 2 });
    // Only the owls it invited come into the game's room; a stranger is sent back.
    const stranger = connect(go, 'z');
    await send(obj, stranger, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK });
    expect(stranger.closed?.code).toBe(CLOSE.PARTY_CLOSED);
    expect(stranger.last('closed')).toMatchObject({ why: 'party' });
    logged(lines.lines, 'room_join_refused', { reason: 'party' });
    const ga = await intoGame(obj, a, 'a', { cid: 'c_aaaaAAAA' });
    const gb = await intoGame(obj, b, 'b', { cid: 'c_bbbbBBBB' });
    expect(gb.last('party')!.view).toMatchObject({ phase: 'turn', you: 1, round: 1 });
    expect(ga.last('party')!.view!.owls.map((o) => o.bot)).toEqual([false, false, true, true]);
    // The roll is the owl's whose turn it is, and the server's.
    await party(obj, gb, 'in', { k: 'roll', v: 6 });
    expect(gb.last('party')!.view!.turn!.roll).toBe(0);
    await party(obj, ga, 'in', { k: 'roll', v: 0 });
    expect(gb.last('party')!.view!.turn!.roll).toBeGreaterThan(0);
  });

  it('starts no game that could not finish before the night’s restart', async () => {
    clock = nextRestartAt(DAY) - PARTY_LONGEST_MS + 1;
    const obj = roomObject();
    const a = await atStump(obj, 'a');
    await party(obj, a, 'stump');
    expect(a.last('stump')!.stump.closing).toBe(true);
    await party(obj, a, 'sit');
    expect(a.last('stump')).toMatchObject({ ok: false, reason: 'closing' });
    // The restart's own hour is the cron's.
    expect(RESTART_CRON).toBe(`0 ${RESTART_HOUR_UTC} * * *`);
  });

  it('plays a game to its end by itself, pays the visitors who stayed by place, once, and never a free guest or a park owl', async () => {
    const lines = captureLogs();
    const obj = roomObject();
    const a = await atStump(obj, 'a', { cid: 'c_aaaaAAAA' });
    const s = await atStump(obj, 's', { cid: 'c_ssssSSSS', spec: true });
    await party(obj, a, 'sit');
    await party(obj, s, 'sit');
    await party(obj, a, 'start', { bots: true });
    const go = a.of('stump').find((f) => f.go)!.go!;
    const ga = await intoGame(obj, a, 'a', { cid: 'c_aaaaAAAA' });
    const gs = await intoGame(obj, s, 's', { cid: 'c_ssssSSSS', spec: true });
    // A woken object picks the game up from storage where it was.
    expect(state.kept.get('parties')).toEqual([go]);
    await playOut(obj, go, [ga, gs]);
    const over = ga.of('party').filter((f) => f.view?.phase === 'over');
    expect(over.length).toBeGreaterThan(0);
    expect(over[0]!.view!.winners!.length).toBeGreaterThan(0);
    expect(collections.paid.map((p) => p.cid)).toEqual(['c_aaaaAAAA']);
    const place = over[0]!.view!.standings!.indexOf(0) + 1;
    expect(ga.last('party')!.paid ?? ga.of('party').find((f) => f.paid)!.paid).toMatchObject({ feathers: expect.any(Number), games: 1 });
    expect(collections.paid[0]!.place).toBeGreaterThanOrEqual(1);
    expect(collections.paid[0]!.place).toBeLessThanOrEqual(place);
    expect(gs.of('party').find((f) => f.paid)!.paid).toEqual({ feathers: 0, practice: true });
    logged(lines.lines, 'party_ended', { why: 'finished' });
    logged(lines.lines, 'party_paid', { games: 1 });
    // Its room is let go: the owls still in it are sent back to the Party Grove.
    expect(ga.closed?.code).toBe(CLOSE.PARTY_CLOSED);
    expect(state.kept.get(`party:${go}`)).toBeUndefined();
  });

  it('ends a game everyone left, and pays nobody for it', async () => {
    const lines = captureLogs();
    const obj = roomObject();
    const a = await atStump(obj, 'a', { cid: 'c_aaaaAAAA' });
    const b = await atStump(obj, 'b', { cid: 'c_bbbbBBBB' });
    await party(obj, a, 'sit');
    await party(obj, b, 'sit');
    await party(obj, a, 'start');
    const ga = await intoGame(obj, a, 'a', { cid: 'c_aaaaAAAA' });
    const gb = await intoGame(obj, b, 'b', { cid: 'c_bbbbBBBB' });
    await send(obj, ga, { t: 'bye' });
    await obj.webSocketClose(gb as unknown as WebSocket, 1006);
    logged(lines.lines, 'party_ended', { why: 'empty' });
    expect(collections.paid).toEqual([]);
    expect(state.kept.get('parties')).toEqual([]);
  });

  it('pays feathers for the first few games of a day only', () => {
    const book = new CollectionBook(new MemoryCollectionStore());
    const paid = Array.from({ length: PARTY_PAID_GAMES + 1 }, () => book.partyGame('c_aaaaAAAA', 1, DAY));
    expect(paid.map((p) => p.added)).toEqual([...Array(PARTY_PAID_GAMES).fill(PARTY_FEATHERS[0]), 0]);
    expect(paid.at(-1)!.total).toBe(book.feathers('c_aaaaAAAA', DAY));
    expect(book.partyGame('c_bbbbBBBB', 4, DAY).added).toBe(PARTY_FEATHERS[3]);
    // A new park day pays again.
    expect(book.partyGame('c_aaaaAAAA', 2, DAY + 24 * 3600_000).added).toBe(PARTY_FEATHERS[1]);
  });

  it('holds four owls in a game’s room, and counts every game’s room under one key', () => {
    expect(roomCap({ ROOM_CAPS: '{"party-abcd1234": 90}' } as unknown as Env, 'party-abcd1234')).toBe(4);
    expect(publicCounts([['party-abcd1234', { count: 2 }], ['party-efgh5678', { count: 3 }], ['hub', { count: 9 }]])).toEqual({ parties: 5, hub: 9 });
  });
});
