import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArcadeBook,
  CLOSE,
  CollectionBook,
  EDGE_PROTOCOL_VERSION,
  FURNITURE,
  MemoryCollectionStore,
  MemoryNestStore,
  MemoryScoreStore,
  NEST_SPOTS,
  PLAY_FEATHERS_PER_DAY,
  NestBook,
  STARTER_FURNITURE,
  STARTER_LAYOUT,
  STREET_DOORS,
  leastRunMs,
  runFeathers,
  type ClientFrame,
  type NestLook,
  type OwlLook,
  type PortraitLook,
  type RunResult,
  type ServerFrame,
} from '@owl-park/shared';
import type { Env } from '../src/env';

// The Workers runtime is not here: its Durable Object base class and the two globals the room object
// touches stand in, and each socket is a fake that keeps its attachment and what was sent to it.
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

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const OWNER = 'c_ownerAAAA';
const GUEST = 'c_guestBBBB';
const OTHER = 'c_otherCCCC';
const COLOURS: NestLook = { body: '#2F3E5C', belly: '#E0D4F0', accent: '#FF2AA1' };
const LOOK: OwlLook = { ...COLOURS, species: 'barn' };
const FREE_FLOOR = NEST_SPOTS.find((s) => s.place === 'floor' && !(s.id in STARTER_LAYOUT))!.id;

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

/** Just enough of the Durable Object's state: the sockets with their tags, and a storage that keeps nothing. */
class FakeState {
  readonly sockets: Array<{ ws: FakeSocket; tags: string[] }> = [];
  readonly storage = { get: async () => undefined, put: async () => undefined, getAlarm: async () => null, setAlarm: async () => undefined };
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
  waitUntil(p: Promise<unknown>) {
    void p.catch(() => undefined);
  }
}

/** The collections object over RPC: the real nest book on memory stores, answers copied as RPC copies them. */
class FakeCollections {
  private made = 0;
  readonly store = new MemoryNestStore();
  readonly book = new CollectionBook(new MemoryCollectionStore());
  readonly nests = new NestBook(this.store, this.book, { newId: () => `nest${String(++this.made).padStart(4, '0')}`, random: Math.random });
  readonly arcade = new ArcadeBook(new MemoryScoreStore(), this.book);
  /** While set, nest lookups wait for it: the collections object is slow to answer. */
  hold: Promise<void> | null = null;
  down = false;
  private answer<T>(v: T): Promise<T> {
    return this.down ? Promise.reject(new Error('offline')) : Promise.resolve(structuredClone(v));
  }
  /** Reads the nest when asked and answers once `hold` lets it, so the answer may be out of date by then, as over RPC. */
  async nestById(nestId: string, cid?: string) {
    const visit = this.nests.visit(nestId, cid ?? null, Date.now());
    await this.hold;
    return this.answer(visit);
  }
  myNest(cid: string, look: NestLook | null) {
    return this.answer(this.nests.mine(cid, look, Date.now()));
  }
  setNestSpot(cid: string, spot: string, item: string | null) {
    return this.answer(this.nests.setSpot(cid, spot, item, Date.now()));
  }
  setNestOpen(cid: string, open: boolean) {
    return this.answer(this.nests.setOpen(cid, open, Date.now()));
  }
  streetNests(cid: string, n: number) {
    return this.answer(this.nests.street(cid, n));
  }
  tasks(cid: string) {
    return this.answer(this.book.tasks(cid, Date.now()));
  }
  questEvent() {
    return this.answer({ updates: [] });
  }
  setEquipped() {
    return this.answer(null);
  }
  arcadeRun(cid: string, run: RunResult, look: PortraitLook) {
    return this.answer(this.arcade.finish(cid, run, look, Date.now()));
  }
  arcadeWalls(cid: string | null) {
    return this.answer({ walls: this.arcade.walls(Date.now()), mine: cid ? this.arcade.mine(cid, Date.now()) : {} });
  }
}

let clock = MON;
let state: FakeState;
let collections: FakeCollections;
let sockets = 0;

function roomObject(caps?: Record<string, number>) {
  const env = { GATE: 'open', COLLECTIONS: { getByName: () => collections }, ...(caps ? { ROOM_CAPS: JSON.stringify(caps) } : {}) } as unknown as Env;
  return new RoomObject(state as unknown as DurableObjectState, env);
}
type Obj = ReturnType<typeof roomObject>;

/** A socket the Worker sent to a room (what fetch() does, without the platform's socket pair). */
function connect(room: string, id: string, cid?: string): FakeSocket {
  const ws = new FakeSocket();
  ws.serializeAttachment({ room, id, sid: `sid${++sockets}`, ip: '192.0.2.1', joinedAt: clock, state: null, ...(cid ? { cid } : {}) });
  state.acceptWebSocket(ws, [`id:${id}`, 'ip:192.0.2.1', `room:${room}`]);
  return ws;
}

const send = (obj: Obj, ws: FakeSocket, frame: ClientFrame | Record<string, unknown>) => obj.webSocketMessage(ws as unknown as WebSocket, JSON.stringify(frame));
const hello = (obj: Obj, ws: FakeSocket) => send(obj, ws, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK });
/** Let queued requests (quests, the street, nest changes) run to the end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function join(obj: Obj, room: string, id: string, cid?: string) {
  const ws = connect(room, id, cid);
  await hello(obj, ws);
  return ws;
}

/** Every frame any socket was sent, as text. */
const everything = () => JSON.stringify(state.sockets.map((s) => s.ws.frames));

beforeEach(() => {
  clock = MON;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  state = new FakeState();
  collections = new FakeCollections();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a nest in the room object', () => {
  it("holds a newcomer's frames behind its hello while the collections object answers", async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = roomObject();
    let answer!: () => void;
    collections.hold = new Promise((resolve) => (answer = resolve));
    const ws = connect(`nest-${nestId}`, 'v_guest', GUEST);
    const helloDone = hello(obj, ws);
    const moved = send(obj, ws, { t: 'move', to: { x: 800, y: 760 }, seq: 1 });
    const asked = send(obj, ws, { t: 'act', a: 'tasks', r: 7 });
    await settle();
    expect(ws.closed).toBeNull(); // not "hello first"
    expect(ws.frames).toEqual([]);
    answer();
    await Promise.all([helloDone, moved, asked]);
    await settle();
    expect(ws.closed).toBeNull();
    expect(ws.frames.map((f) => f.t).filter((t) => t !== 'counts')).toEqual(['welcome', 'objects', 'nest', 'move', 'act']);
    expect(ws.last('welcome')?.room).toBe(`nest-${nestId}`);
    expect(ws.last('nest')).toEqual({ t: 'nest', nest: { nestId, open: true, layout: STARTER_LAYOUT, look: COLOURS }, mine: false });
    expect(ws.last('move')?.seq).toBe(1);
    expect(ws.last('act')).toMatchObject({ r: 7, a: 'tasks', ok: true });
  });

  it('lets its owner in with what it owns and its gift, and turns visitors away from a closed nest or none', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    collections.nests.setOpen(OWNER, false, clock);
    const obj = roomObject();
    const guest = await join(obj, `nest-${nestId}`, 'v_guest', GUEST);
    expect(guest.frames).toEqual([{ t: 'closed', room: `nest-${nestId}`, why: 'closed' }]);
    expect(guest.closed?.code).toBe(CLOSE.NEST_CLOSED);
    const stranger = await join(obj, 'nest-zzzzzzzz', 'v_stranger', GUEST);
    expect(stranger.frames).toEqual([{ t: 'closed', room: 'nest-zzzzzzzz', why: 'gone' }]);
    expect(stranger.closed?.code).toBe(CLOSE.NEST_CLOSED);
    const owner = await join(obj, `nest-${nestId}`, 'v_owner', OWNER);
    expect(owner.closed).toBeNull();
    expect(owner.last('nest')).toMatchObject({ t: 'nest', nest: { nestId, open: false }, mine: true, owned: FURNITURE.map((f) => f.id).filter((id) => STARTER_FURNITURE.includes(id)), gift: { taken: false } });
  });

  it('lets its owner into a full nest, and nobody else', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = roomObject({ nest: 1 });
    expect((await join(obj, `nest-${nestId}`, 'v_guest', GUEST)).closed).toBeNull();
    const second = await join(obj, `nest-${nestId}`, 'v_other', OTHER);
    expect(second.last('full')).toEqual({ t: 'full', room: `nest-${nestId}`, cap: 1 });
    expect(second.closed?.code).toBe(CLOSE.ROOM_FULL);
    const owner = await join(obj, `nest-${nestId}`, 'v_owner', OWNER);
    expect(owner.closed).toBeNull();
    expect(owner.last('welcome')?.owls.map((o) => o.id)).toEqual(['v_guest']);
  });

  it('closes the socket for another try when the collections object does not answer', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    collections.down = true;
    const ws = await join(roomObject(), `nest-${nestId}`, 'v_guest', GUEST);
    expect(ws.closed?.code).toBe(1011);
    expect(ws.frames).toEqual([]);
  });

  it('shows the owner\'s changes to everyone inside, and takes them from nobody else', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = roomObject();
    const owner = await join(obj, `nest-${nestId}`, 'v_owner', OWNER);
    const guest = await join(obj, `nest-${nestId}`, 'v_guest', GUEST);
    await send(obj, owner, { t: 'nest', r: 1, spot: FREE_FLOOR, item: 'lamp' });
    await settle();
    const answer = owner.last('nest')!;
    expect(answer).toMatchObject({ t: 'nest', r: 1, ok: true, nest: { nestId, layout: { [FREE_FLOOR]: 'lamp' } } });
    expect(guest.last('nest')).toEqual({ t: 'nest', nest: answer.nest });
    // Too soon after the last change; then a piece in the wrong place; and a visitor may change nothing.
    await send(obj, owner, { t: 'nest', r: 2, open: false });
    clock += 1000;
    await send(obj, owner, { t: 'nest', r: 3, spot: 'w1', item: 'lamp' });
    await send(obj, guest, { t: 'nest', r: 4, open: false });
    await settle();
    expect(owner.of('nest').slice(-2)).toEqual([
      { t: 'nest', r: 2, ok: false, reason: 'busy' },
      { t: 'nest', r: 3, ok: false, reason: 'wrong-place' },
    ]);
    expect(guest.last('nest')).toEqual({ t: 'nest', r: 4, ok: false, reason: 'not-owner' });
    // A newcomer finds the nest as it now stands.
    const late = await join(obj, `nest-${nestId}`, 'v_other', OTHER);
    expect(late.last('nest')?.nest).toEqual(answer.nest);
  });

  it('sends every visitor out when its owner closes it, keeps newcomers out, and lets them in again once it opens', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = roomObject();
    const owner = await join(obj, `nest-${nestId}`, 'v_owner', OWNER);
    const guests = [await join(obj, `nest-${nestId}`, 'v_guest', GUEST), await join(obj, `nest-${nestId}`, 'v_other', OTHER)];
    await send(obj, owner, { t: 'nest', r: 1, open: false });
    await settle();
    expect(owner.last('nest')).toMatchObject({ r: 1, ok: true, nest: { open: false } });
    expect(owner.closed).toBeNull();
    for (const g of guests) {
      expect(g.last('closed')).toEqual({ t: 'closed', room: `nest-${nestId}`, why: 'closed' });
      expect(g.closed?.code).toBe(CLOSE.NEST_CLOSED);
    }
    expect(owner.of('leave').map((f) => f.id).sort()).toEqual(['v_guest', 'v_other']);
    const knocking = await join(obj, `nest-${nestId}`, 'v_late', GUEST);
    expect(knocking.last('closed')?.why).toBe('closed');
    clock += 1000;
    await send(obj, owner, { t: 'nest', r: 2, open: true });
    await settle();
    expect((await join(obj, `nest-${nestId}`, 'v_again', GUEST)).last('nest')?.nest?.open).toBe(true);
  });

  it('turns away an owl whose answer said open when its owner closed the nest meanwhile', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = roomObject();
    const owner = await join(obj, `nest-${nestId}`, 'v_owner', OWNER);
    // The guest's answer is read while the nest is open, and reaches the room after it closed and its owner left.
    let answer!: () => void;
    collections.hold = new Promise((resolve) => (answer = resolve));
    const guest = connect(`nest-${nestId}`, 'v_guest', GUEST);
    const knocking = hello(obj, guest);
    await send(obj, owner, { t: 'nest', r: 1, open: false });
    await settle();
    await send(obj, owner, { t: 'bye' });
    answer();
    await knocking;
    expect(guest.last('closed')?.why).toBe('closed');
    expect(guest.closed?.code).toBe(CLOSE.NEST_CLOSED);
  });

  it('has no activities, only the day\'s tasks', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = roomObject();
    const owner = await join(obj, `nest-${nestId}`, 'v_owner', OWNER);
    await send(obj, owner, { t: 'act', a: 'cast', r: 1 });
    await send(obj, owner, { t: 'act', a: 'tasks', r: 2 });
    await settle();
    expect(owner.of('act').map((f) => [f.r, f.ok])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(owner.of('act')[0]).toMatchObject({ reason: 'unknown' });
  });

  it('lets an empty nest go, and keeps its owls and its owner through a wake-up', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = roomObject();
    const owner = await join(obj, `nest-${nestId}`, 'v_owner', OWNER);
    const guest = await join(obj, `nest-${nestId}`, 'v_guest', GUEST);
    const inner = (o: Obj) => o as unknown as { rooms: Map<string, unknown>; nestViews: Map<string, unknown> };
    expect(inner(obj).rooms.has(`nest-${nestId}`)).toBe(true);
    // The object wakes up from hibernation: the nest is rebuilt from the sockets, its owner still its owner.
    const woken = roomObject();
    expect(owner.closed).toBeNull();
    expect(guest.closed).toBeNull();
    await send(woken, owner, { t: 'nest', r: 1, spot: FREE_FLOOR, item: 'rug' });
    await settle();
    expect(owner.last('nest')).toMatchObject({ r: 1, ok: true });
    expect(guest.last('nest')?.nest?.layout[FREE_FLOOR]).toBe('rug');
    await send(woken, guest, { t: 'bye' });
    owner.close(1001, 'gone');
    await woken.webSocketClose(owner as unknown as WebSocket);
    expect(inner(woken).rooms.has(`nest-${nestId}`)).toBe(false);
    expect(inner(woken).nestViews.size).toBe(0);
  });
});

describe('the street in the room object', () => {
  it("answers with the visitor's own nest and five doors of other owls' open nests", async () => {
    collections.nests.mine(OWNER, COLOURS, clock);
    collections.nests.mine(OTHER, { body: '#3E6B48', belly: '#F6F1E3', accent: '#00E5FF' }, clock);
    collections.nests.mine('c_closedDDDD', COLOURS, clock);
    collections.nests.setOpen('c_closedDDDD', false, clock);
    const obj = roomObject();
    const ws = await join(obj, 'homes', 'v_guest', GUEST);
    await send(obj, ws, { t: 'street', r: 1 });
    await settle();
    const street = ws.last('street')!;
    const own = collections.store.nestOf(GUEST)!;
    expect(street.own).toEqual({ nestId: own.nestId, open: true });
    expect(street.doors).toHaveLength(STREET_DOORS - 1);
    expect(street.doors.filter((d) => d !== null).map((d) => d!.nestId).sort()).toEqual([collections.store.nestOf(OWNER)!.nestId, collections.store.nestOf(OTHER)!.nestId].sort());
    expect(street.doors.slice(2)).toEqual([null, null, null]);
    // The visitor's colours are kept for the flag on its own door.
    expect(own.look).toEqual(COLOURS);
    // Once per use cooldown; and only on the street, for a page with a collection.
    await send(obj, ws, { t: 'street', r: 2 });
    const lobby = await join(obj, 'lobby', 'v_lobby', OTHER);
    await send(obj, lobby, { t: 'street', r: 3 });
    const nobody = await join(obj, 'homes', 'v_nobody');
    await send(obj, nobody, { t: 'street', r: 4 });
    await settle();
    expect(ws.last('refused')).toEqual({ t: 'refused', r: 2, reason: 'busy' });
    expect(lobby.last('refused')).toEqual({ t: 'refused', r: 3, reason: 'unknown' });
    expect(nobody.last('refused')).toEqual({ t: 'refused', r: 4, reason: 'unknown' });
  });

  it('never names a collector in any frame, nor a nest in the counts', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    collections.nests.mine(OTHER, COLOURS, clock);
    const obj = roomObject();
    const street = await join(obj, 'homes', 'v_street', GUEST);
    await send(obj, street, { t: 'street', r: 1 });
    const owner = await join(obj, `nest-${nestId}`, 'v_owner', OWNER);
    const guest = await join(obj, `nest-${nestId}`, 'v_guest', OTHER);
    await send(obj, owner, { t: 'nest', r: 2, spot: FREE_FLOOR, item: 'lamp' });
    await settle();
    clock += 20_000;
    await send(obj, owner, { t: 'nest', r: 3, open: false });
    await settle();
    expect(guest.closed?.code).toBe(CLOSE.NEST_CLOSED);
    const sent = everything();
    expect(sent).not.toMatch(/c_[A-Za-z0-9]{8}/);
    for (const s of state.sockets) for (const f of [...s.ws.of('counts').map((c) => c.rooms), ...s.ws.of('welcome').map((w) => w.counts)]) expect(Object.keys(f).join()).not.toMatch(/nest-/);
    expect(owner.last('welcome')?.counts).toEqual({ homes: 1, nests: 1 });
  });
});

describe('the arcade in the room object', () => {
  /**
   * Walk an owl in the arcade to a cabinet (the middle of its spot) and let the walk finish: first
   * onto the open floor, since an owl appears anywhere near the entrance and a straight walk from
   * there may meet the floor's edge.
   */
  async function toCabinet(obj: Obj, ws: FakeSocket, x: number) {
    await send(obj, ws, { t: 'move', to: { x: 300, y: 850 }, seq: 1 });
    clock += 10_000;
    await send(obj, ws, { t: 'move', to: { x, y: 780 }, seq: 2 });
    clock += 10_000;
  }
  const FLIGHT_X = 803;

  /** Start a run and play it for as long as a score of `score` takes; the run's seed. */
  async function run(obj: Obj, ws: FakeSocket, r: number, game: 'flight' | 'crossing', score: number) {
    await send(obj, ws, { t: 'act', a: 'run', g: game, r });
    await settle();
    const started = ws.of('act').find((f) => f.r === r);
    expect(started).toMatchObject({ a: 'run', ok: true, game });
    clock += leastRunMs({ game, score }) + 100;
    return (started as { seed: number }).seed;
  }

  it('gives a newcomer the score wall and its own bests', async () => {
    const obj = roomObject();
    const ws = await join(obj, 'arcade', 'v_a', OWNER);
    await settle();
    expect(ws.last('wall')).toEqual({ t: 'wall', walls: ['crossing', 'flight', 'sling'].map((game) => ({ game, top: [] })), mine: {} });
  });

  it('pays a run at its cabinet, and shows the new best to everyone in the arcade', async () => {
    const obj = roomObject();
    const a = await join(obj, 'arcade', 'v_a', OWNER);
    const b = await join(obj, 'arcade', 'v_b', GUEST);
    await toCabinet(obj, a, FLIGHT_X);
    const seed = await run(obj, a, 1, 'flight', 12);
    await send(obj, a, { t: 'act', a: 'score', g: 'flight', s: 12, k: seed, r: 2 });
    await settle();
    const paid = a.of('act').find((f) => f.r === 2) as Extract<ServerFrame, { t: 'act'; a: 'score'; ok: true }>;
    expect(paid.paid).toMatchObject({ game: 'flight', score: 12, best: true, top: true, added: runFeathers('flight', 12) + 3, mine: { flight: 12 } });
    expect(paid.paid.wall.top).toEqual([{ score: 12, look: { body: LOOK.body, belly: LOOK.belly, accent: LOOK.accent, species: 'barn' } }]);
    // The other owl sees the wall change; the player has it in the answer.
    expect(b.last('wall')?.walls).toEqual([paid.paid.wall]);
    expect(a.of('wall').map((w) => w.walls.length)).toEqual([3]);
    // One result per run: the same seed again is no run at all.
    await send(obj, a, { t: 'act', a: 'score', g: 'flight', s: 12, k: seed, r: 3 });
    await settle();
    expect(a.of('act').find((f) => f.r === 3)).toMatchObject({ ok: false, reason: 'idle' });
  });

  it('starts no run away from the cabinet, and takes no score too quick for its run', async () => {
    const obj = roomObject();
    const a = await join(obj, 'arcade', 'v_a', OWNER);
    await send(obj, a, { t: 'act', a: 'run', g: 'flight', r: 1 });
    await settle();
    expect(a.of('act').find((f) => f.r === 1)).toMatchObject({ ok: false, reason: 'far' });
    await toCabinet(obj, a, FLIGHT_X);
    await send(obj, a, { t: 'act', a: 'run', g: 'flight', r: 2 });
    await settle();
    const seed = (a.of('act').find((f) => f.r === 2) as { seed: number }).seed;
    clock += 3_000;
    await send(obj, a, { t: 'act', a: 'score', g: 'flight', s: 30, k: seed, r: 3 });
    await settle();
    expect(a.of('act').find((f) => f.r === 3)).toMatchObject({ ok: false, reason: 'unknown' });
    // The run is over all the same, and nothing was paid.
    await send(obj, a, { t: 'act', a: 'score', g: 'flight', s: 1, k: seed, r: 4 });
    await settle();
    expect(a.of('act').find((f) => f.r === 4)).toMatchObject({ ok: false, reason: 'idle' });
    expect(collections.book.feathers(OWNER, clock)).toBe(0);
  });

  it('keeps a run on the socket through the object’s sleep', async () => {
    const obj = roomObject();
    const a = await join(obj, 'arcade', 'v_a', OWNER);
    await toCabinet(obj, a, FLIGHT_X);
    const seed = await run(obj, a, 1, 'flight', 3);
    // The object sleeps and wakes as a new instance over the same sockets.
    const woken = roomObject();
    await send(woken, a, { t: 'act', a: 'score', g: 'flight', s: 3, k: seed, r: 2 });
    await settle();
    expect(a.of('act').find((f) => f.r === 2)).toMatchObject({ ok: true, paid: { score: 3 } });
  });

  it('pays runs no more than the activities’ daily cap', async () => {
    const obj = roomObject();
    const a = await join(obj, 'arcade', 'v_a', OWNER);
    await toCabinet(obj, a, FLIGHT_X);
    let paid = 0;
    for (let i = 0; i < 6; i++) {
      const seed = await run(obj, a, 10 + 2 * i, 'flight', 40);
      await send(obj, a, { t: 'act', a: 'score', g: 'flight', s: 40, k: seed, r: 11 + 2 * i });
      await settle();
      paid += (a.of('act').find((f) => f.r === 11 + 2 * i) as { paid: { added: number } }).paid.added;
    }
    expect(paid).toBe(PLAY_FEATHERS_PER_DAY);
    expect(collections.book.feathers(OWNER, clock)).toBeGreaterThanOrEqual(PLAY_FEATHERS_PER_DAY);
  });
});

