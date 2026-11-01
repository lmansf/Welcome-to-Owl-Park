import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArcadeBook,
  CLIMB_RUN_MAX_MS,
  CLOSE,
  ClimbBook,
  CollectionBook,
  EDGE_PROTOCOL_VERSION,
  FURNITURE,
  MemoryClimbStore,
  MemoryCollectionStore,
  MemoryNestStore,
  MemoryScoreStore,
  NEST_SPOTS,
  NIGHTS,
  PLAY_FEATHERS_PER_DAY,
  RESTART_NOTICE,
  ROOM_W,
  NestBook,
  STARTER_FURNITURE,
  STARTER_LAYOUT,
  STREET_DOORS,
  climbRef,
  hashForLog,
  leastClimbMs,
  leastRunMs,
  runFeathers,
  type ArcadeGame,
  type ClientFrame,
  type NestLook,
  type OwlLook,
  type PortraitLook,
  type RunResult,
  type ServerFrame,
  type Vec2,
} from '@owl-park/shared';
import type { Env } from '../src/env';
import { captureLogs, loggerFor } from '../src/logs';
import { mintEntry, mintKeeper } from '../src/pass';
import { roomDef } from '../src/rooms';
import { TravelBook } from '../src/travelBook';
import { eventsOf, logged } from './logged';
import { sqlStorage } from './sqlite';

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
const { RESTART_CLOSE_MS, RoomObject } = await import('../src/RoomObject');
const { LIMITS, Room } = await import('../src/Room');

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
  readonly storage: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void>; getAlarm(): Promise<number | null>; setAlarm(): Promise<void> } = {
    get: async () => undefined,
    put: async () => undefined,
    getAlarm: async () => null,
    setAlarm: async () => undefined,
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
  getWebSocketAutoResponseTimestamp() {
    return null;
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
  readonly climbStore = new MemoryClimbStore();
  readonly climb = new ClimbBook(this.climbStore, this.book, () => 0x5eed);
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
  arcadeStart(cid: string, game: ArcadeGame, seed: number) {
    return this.answer({ startedAt: this.arcade.start(cid, game, seed, Date.now()).startedAt });
  }
  arcadeRecord(cid: string, run: RunResult, seed: number, look: PortraitLook) {
    return this.answer(this.arcade.record(cid, run, seed, look, Date.now()));
  }
  arcadeRun(cid: string, run: RunResult, seed: number, look: PortraitLook) {
    return this.answer(this.arcade.finish(cid, run, seed, look, Date.now()));
  }
  arcadeWalls(cid: string | null) {
    return this.answer({ walls: this.arcade.walls(Date.now()), mine: cid ? this.arcade.mine(cid, Date.now()) : {} });
  }
  /** The climb's calls, with the flags the room object passed. */
  readonly climbStarts: unknown[] = [];
  climbStart(cid: string, flags: { atPortal: boolean; portalLive: boolean; special: string | null }) {
    this.climbStarts.push(flags);
    return this.answer(this.climb.start(cid, flags, Date.now()));
  }
  climbBand(cid: string, seed: number, band: number) {
    return this.answer(this.climb.band(cid, seed, band, Date.now()));
  }
  climbLookup(ref: string) {
    return this.answer(this.climb.lookup(ref));
  }
  /** The player stats' calls (OP-111), as they came. */
  readonly seenCalls: unknown[][] = [];
  readonly aliveCalls: unknown[] = [];
  seen(sighting: unknown, look: unknown) {
    this.seenCalls.push([sighting, look]);
    return this.answer(undefined);
  }
  /** The accounts' calls (OP-139): the device each owl is on (none: any holds it), and the looks sent. */
  readonly devices = new Map<string, string>();
  readonly lookCalls: unknown[][] = [];
  readonly holdsCalls: unknown[][] = [];
  accountHolds(cid: string, dev: string | null) {
    this.holdsCalls.push([cid, dev]);
    const d = this.devices.get(cid);
    return this.answer(d === undefined || d === dev);
  }
  accountLook(cid: string, look: unknown) {
    this.lookCalls.push([cid, look]);
    return this.answer(undefined);
  }
  alive(sightings: unknown) {
    this.aliveCalls.push(sightings);
    return this.answer(undefined);
  }
  /** Travel from the map (OP-130): the real travel book, on an SQLite of its own. */
  readonly travel = new TravelBook(sqlStorage());
  travelEntered(cid: string, room: string, spawn: string | null) {
    return this.answer(this.travel.entered(cid, room, spawn ?? undefined, Date.now()));
  }
  travelThroughGate(cid: string) {
    return this.answer(this.travel.throughGate(cid));
  }
}

let clock = MON;
let state: FakeState;
let collections: FakeCollections;
let sockets = 0;

function roomObject(caps?: Record<string, number>, more: Record<string, string> = {}) {
  const env = { GATE: 'open', COLLECTIONS: { getByName: () => collections }, ...(caps ? { ROOM_CAPS: JSON.stringify(caps) } : {}), ...more } as unknown as Env;
  return new RoomObject(state as unknown as DurableObjectState, env);
}
type Obj = ReturnType<typeof roomObject>;

/** A socket the Worker sent to a room (what fetch() does, without the platform's socket pair). */
function connect(room: string, id: string, cid?: string, dev?: string): FakeSocket {
  const ws = new FakeSocket();
  ws.serializeAttachment({ room, id, sid: `sid${++sockets}`, ip: '192.0.2.1', joinedAt: clock, state: null, ...(cid ? { cid } : {}), ...(dev ? { dev } : {}) });
  state.acceptWebSocket(ws, [`id:${id}`, 'ip:192.0.2.1', `room:${room}`, ...(cid ? [`cid:${cid}`] : [])]);
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

describe("a nest's mirror in the room object (OP-077)", () => {
  it("changes only the owl looking into it: a visitor's new look in another owl's nest leaves the owner and the nest as they were", async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = roomObject();
    const owner = await join(obj, `nest-${nestId}`, 'v_owner', OWNER);
    const guest = await join(obj, `nest-${nestId}`, 'v_guest', GUEST);
    // The mirror is the client's: what reaches the room is the owl's own look, as from anywhere.
    const mirrored: OwlLook = { body: '#3E6B48', belly: '#F2E6C9', accent: '#C9A227', species: 'snowy' };
    await send(obj, guest, { t: 'look', look: mirrored });
    await settle();
    expect(owner.last('look')).toEqual({ t: 'look', id: 'v_guest', look: mirrored });
    expect(guest.of('look')).toEqual([]);
    // A newcomer finds the guest changed, the owner as it was, and the nest as it was.
    const late = await join(obj, `nest-${nestId}`, 'v_other', OTHER);
    const looks = Object.fromEntries(late.last('welcome')!.owls.map((o) => [o.id, o.look]));
    expect(looks).toEqual({ v_owner: LOOK, v_guest: mirrored });
    expect(late.last('nest')?.nest).toEqual({ nestId, open: true, layout: STARTER_LAYOUT, look: COLOURS });
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
   * straight down onto the open floor, since an owl appears anywhere near the entrance, perhaps up in
   * the corner past the west bay's edge, where a straight walk east meets the floor's edge (it did, at
   * 187,703). The floor at y 850 runs the hall's whole width, and below any point of it.
   */
  async function toCabinet(obj: Obj, ws: FakeSocket, to: { x: number; y: number }) {
    const at = ws.last('welcome')!.you.pos;
    await send(obj, ws, { t: 'move', to: { x: at.x, y: 850 }, seq: 1 });
    clock += 10_000;
    await send(obj, ws, { t: 'move', to, seq: 2 });
    clock += 10_000;
  }
  /** Moon Flap's cabinet, in the hall's second bay. */
  const FLIGHT = { x: 1900, y: 820 };

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
    await toCabinet(obj, a, FLIGHT);
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
    await toCabinet(obj, a, FLIGHT);
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

  it('keeps a run through the object’s sleep', async () => {
    const obj = roomObject();
    const a = await join(obj, 'arcade', 'v_a', OWNER);
    await toCabinet(obj, a, FLIGHT);
    const seed = await run(obj, a, 1, 'flight', 3);
    // The object sleeps and wakes as a new instance over the same sockets.
    const woken = roomObject();
    await send(woken, a, { t: 'act', a: 'score', g: 'flight', s: 3, k: seed, r: 2 });
    await settle();
    expect(a.of('act').find((f) => f.r === 2)).toMatchObject({ ok: true, paid: { score: 3 } });
  });

  it('keeps a run’s best as it goes, for everyone in the arcade, and pays only its end (OP-137)', async () => {
    const obj = roomObject();
    const a = await join(obj, 'arcade', 'v_a', OWNER);
    const b = await join(obj, 'arcade', 'v_b', GUEST);
    await toCabinet(obj, a, FLIGHT);
    const seed = await run(obj, a, 1, 'flight', 5);
    await send(obj, a, { t: 'act', a: 'record', g: 'flight', s: 5, k: seed, r: 2 });
    await settle();
    const kept = a.of('act').find((f) => f.r === 2) as Extract<ServerFrame, { t: 'act'; a: 'record'; ok: true }>;
    expect(kept).toMatchObject({ ok: true, mine: { flight: 5 } });
    expect(kept.wall.top.map((e) => e.score)).toEqual([5]);
    expect(b.last('wall')?.walls).toEqual([kept.wall]);
    expect(collections.book.feathers(OWNER, clock)).toBe(0);
    // A record too quick for its run is not kept, and the run goes on.
    await send(obj, a, { t: 'act', a: 'record', g: 'flight', s: 30, k: seed, r: 3 });
    await settle();
    expect(a.of('act').find((f) => f.r === 3)).toMatchObject({ ok: false, reason: 'unknown' });
    clock += leastRunMs({ game: 'flight', score: 7 });
    await send(obj, a, { t: 'act', a: 'score', g: 'flight', s: 7, k: seed, r: 4 });
    await settle();
    expect(a.of('act').find((f) => f.r === 4)).toMatchObject({ ok: true, paid: { score: 7, best: true, top: true, added: runFeathers('flight', 7) + 3 } });
  });

  it('keeps a run for a page back from a dropped connection, on a new socket (OP-137)', async () => {
    const obj = roomObject();
    const a = await join(obj, 'arcade', 'v_a', OWNER);
    await toCabinet(obj, a, FLIGHT);
    const seed = await run(obj, a, 1, 'flight', 4);
    await obj.webSocketClose(a as unknown as WebSocket);
    await settle();
    const back = await join(obj, 'arcade', 'v_a', OWNER);
    await send(obj, back, { t: 'act', a: 'score', g: 'flight', s: 4, k: seed, r: 2 });
    await settle();
    expect(back.of('act').find((f) => f.r === 2)).toMatchObject({ ok: true, paid: { score: 4, best: true } });
  });

  it('pays runs no more than the activities’ daily cap', async () => {
    const obj = roomObject();
    const a = await join(obj, 'arcade', 'v_a', OWNER);
    await toCabinet(obj, a, FLIGHT);
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

describe('prewritten chat in the room object', () => {
  it('relays a phrase’s number to the other owls in the room, and nothing for a number the list lacks', async () => {
    const obj = roomObject();
    const a = await join(obj, 'hub', 'v_a', OWNER);
    const b = await join(obj, 'hub', 'v_b');
    await send(obj, a, { t: 'say', n: 5 });
    expect(b.last('say')).toEqual({ t: 'say', id: 'v_a', n: 5 });
    expect(a.of('say')).toEqual([]);
    // A page without a collection may speak too: every phrase is everyone's.
    clock += 3_000;
    await send(obj, b, { t: 'say', n: 24 });
    expect(a.last('say')).toEqual({ t: 'say', id: 'v_b', n: 24 });
    // A number in range the list does not have is dropped; the socket stays open.
    clock += 3_000;
    await send(obj, a, { t: 'say', n: 777 });
    expect(b.of('say')).toHaveLength(1);
    expect(a.closed).toBeNull();
    // Words never travel: a frame that carries them is malformed.
    const words: Record<string, unknown> = { t: 'say', n: 'Hi!' };
    await send(obj, a, words);
    expect(a.closed?.code).toBe(CLOSE.BAD_PROTOCOL);
  });
});


describe('busy nights in the room object (OP-075)', () => {
  /** A socket as the Worker sends it: with the copy it chose and the entry it made. */
  function connectWith(room: string, id: string, headers: { copy?: number; entry?: string }): FakeSocket {
    const ws = connect(room, id);
    const att = ws.deserializeAttachment() as Record<string, unknown>;
    ws.serializeAttachment({ ...att, ...(headers.copy ? { copy: headers.copy } : {}), ...(headers.entry ? { entry: headers.entry } : {}) });
    return ws;
  }

  it('welcomes an owl with its copy, its entry (then let go) and the ribbon as it stands', async () => {
    const obj = roomObject();
    const ws = connectWith('hub', 'v_copied', { copy: 2, entry: 'entry-token' });
    await hello(obj, ws);
    expect(ws.last('welcome')).toMatchObject({ room: 'hub', copy: 2, entry: 'entry-token', notice: null });
    expect((ws.deserializeAttachment() as Record<string, unknown>)['entry']).toBeUndefined();
    // The room itself says no copy.
    const plain = await join(obj, 'hub', 'v_plain');
    expect(plain.last('welcome')?.copy).toBeUndefined();
  });

  it('shows the ribbon to everyone inside when the overflow object says it changed, woken from hibernation or not', async () => {
    const obj = roomObject();
    const a = await join(obj, 'hub', 'v_one');
    const b = await join(obj, 'grove', 'v_two');
    const tell = (o: Obj, words: string | null) => o.fetch(new Request('https://park/notice', { method: 'POST', body: JSON.stringify({ words }) }));
    await tell(obj, "It's busy tonight; things may be slow");
    expect(a.last('notice')).toEqual({ t: 'notice', words: "It's busy tonight; things may be slow" });
    expect(b.last('notice')).toEqual({ t: 'notice', words: "It's busy tonight; things may be slow" });
    // A newcomer gets it in its welcome.
    const c = await join(obj, 'hub', 'v_three');
    expect(c.last('welcome')?.notice).toBe("It's busy tonight; things may be slow");
    // Woken from hibernation, the object holds no words while its owls still show them: off reaches them all the same.
    const woken = roomObject();
    await tell(woken, null);
    expect(a.last('notice')).toEqual({ t: 'notice', words: null });
    expect(b.last('notice')).toEqual({ t: 'notice', words: null });
    expect(c.last('notice')).toEqual({ t: 'notice', words: null });
  });
});

/** A state whose storage keeps what is put in it, as the platform's does across a wake from hibernation. */
class KeepingState extends FakeState {
  readonly kept = new Map<string, unknown>();
  override readonly storage = {
    get: async (key: string) => this.kept.get(key),
    put: async (key: string, value: unknown) => {
      this.kept.set(key, value);
    },
    getAlarm: async () => null,
    setAlarm: async () => undefined,
  };
}

describe('an owl back from a dropped connection (OP-138)', () => {
  /** A page's hello from where its owl stands now. */
  const helloAt = (obj: Obj, ws: FakeSocket, pos: Vec2) => send(obj, ws, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK, pos });
  const lost = async (obj: Obj, ws: FakeSocket) => {
    ws.close(1006, 'network gone');
    await obj.webSocketClose(ws as unknown as WebSocket);
  };

  it('resumes where its owl walked on to, though its empty nest was let go meanwhile', async () => {
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const room = `nest-${nestId}`;
    const obj = roomObject();
    const owner = await join(obj, room, 'v_owner', OWNER);
    await send(obj, owner, { t: 'move', to: { x: 1250, y: 800 }, seq: 1 });
    clock += 5_000;
    await lost(obj, owner);
    expect((obj as unknown as { rooms: Map<string, unknown> }).rooms.has(room)).toBe(false);
    // Back two seconds on, a little further along: there, not by the door.
    clock += 2_000;
    const back = connect(room, 'v_owner', OWNER);
    await helloAt(obj, back, { x: 1300, y: 800 });
    await settle();
    expect(back.last('welcome')?.you.pos).toEqual({ x: 1300, y: 800 });
  });

  it('resumes where its owl walked on to, though the room object slept meanwhile, and keeps only the last two minutes', async () => {
    state = new KeepingState();
    const obj = roomObject();
    // On the spawn, as its page says: from there the walk east is clear. Scattered north of the
    // spawn, it would meet the wall beside the east arch and stop short.
    const a = connect('hub', 'v_a');
    await helloAt(obj, a, { x: 2400, y: 730 });
    const b = await join(obj, 'hub', 'v_b');
    await send(obj, a, { t: 'move', to: { x: 3400, y: 780 }, seq: 1 });
    clock += 6_000;
    await lost(obj, a);
    // Its connection dropped (no goodbye), so one back soon has reconnected (OP-134).
    expect((state as KeepingState).kept.get('leavers')).toEqual({ hub: { v_a: { pos: { x: 3400, y: 780 }, leftAt: clock, dropped: true } } });
    // The object sleeps with the other owl's socket open, and wakes on the same storage.
    clock += 2_000;
    const woken = roomObject();
    await settle(); // the constructor reads its storage
    const back = connect('hub', 'v_a');
    await helloAt(woken, back, { x: 3300, y: 780 });
    expect(back.last('welcome')?.you.pos).toEqual({ x: 3300, y: 780 });
    expect(b.last('enter')?.owl).toMatchObject({ id: 'v_a', pos: { x: 3300, y: 780 } });
    // An owl gone longer than the room remembers is let in by the door like any other.
    await lost(woken, back);
    clock += LIMITS.leaverMemoryMs + 1;
    await lost(woken, b);
    expect((state as KeepingState).kept.get('leavers')).toEqual({ hub: { v_b: { pos: expect.any(Object), leftAt: clock, dropped: true } } });
    const late = connect('hub', 'v_a');
    await helloAt(roomObject(), late, { x: 3300, y: 780 });
    expect(late.last('welcome')?.you.pos).not.toEqual({ x: 3300, y: 780 });
  });
});

describe('the realms switch (the stained-glass climb)', () => {
  const tell = (o: Obj, realms: unknown) => o.fetch(new Request('https://park/notice', { method: 'POST', body: JSON.stringify({ words: null, realms }) }));

  it('turns an owl away from a gated realm until the keepers open it, with the arch’s phrase, and lets everyone know the switch', async () => {
    const obj = roomObject();
    const hub = await join(obj, 'hub', 'v_hub');
    expect(hub.last('welcome')?.realms).toEqual({ open: [], portal: false, night: null });
    const shut = await join(obj, 'glass', 'v_shut');
    expect(shut.last('closed')).toEqual({ t: 'closed', room: 'glass', why: 'realm', sign: 'Hatching Soon' });
    expect(shut.closed?.code).toBe(CLOSE.REALM_CLOSED);
    expect(shut.last('welcome')).toBeUndefined();
    // An ungated room never consults the switch.
    expect((await join(obj, 'grove', 'v_grove')).last('welcome')).toBeDefined();
    await tell(obj, { open: ['glass'], portal: true, night: null });
    expect(hub.last('realms')).toEqual({ t: 'realms', realms: { open: ['glass'], portal: true, night: null } });
    const inside = await join(obj, 'glass', 'v_in');
    expect(inside.last('welcome')?.realms?.open).toEqual(['glass']);
    expect(inside.closed).toBeNull();
  });

  it('sends the owls out of a realm that closes, and keeps the switch in storage across a wake', async () => {
    state = new KeepingState();
    const obj = roomObject();
    await tell(obj, { open: ['glass'], portal: true, night: 'easy' });
    const a = await join(obj, 'glass', 'v_a');
    const b = await join(obj, 'glass', 'v_b');
    expect(a.closed).toBeNull();
    // Woken from hibernation on the same storage, the object still has the realm open.
    const woken = roomObject();
    await settle(); // the constructor reads its storage
    const c = await join(woken, 'glass', 'v_c');
    expect(c.last('welcome')?.realms).toEqual({ open: ['glass'], portal: true, night: 'easy' });
    await tell(woken, { open: [], portal: true, night: 'easy' });
    expect(c.last('closed')).toEqual({ t: 'closed', room: 'glass', why: 'realm', sign: 'Hatching Soon' });
    expect(c.closed?.code).toBe(CLOSE.REALM_CLOSED);
    // The first object, told the same, sends its owls out too; a malformed switch is read as closed.
    await tell(obj, { open: [], portal: true, night: 'easy' });
    expect(a.closed?.code).toBe(CLOSE.REALM_CLOSED);
    expect(b.closed?.code).toBe(CLOSE.REALM_CLOSED);
    await tell(obj, 'nonsense');
    expect((await join(obj, 'glass', 'v_d')).closed?.code).toBe(CLOSE.REALM_CLOSED);
  });
});

describe('the tree (map 2), dark until it opens (OP-156)', () => {
  const KEY = 'keeper-tests-signing-key-0123456789';
  const helloWith = (obj: Obj, ws: FakeSocket, keeper?: unknown) => send(obj, ws, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK, ...(keeper === undefined ? {} : { keeper }) });
  const nowS = () => Math.floor(clock / 1000);

  it('turns away an owl without a keeper’s token and lets a keeper’s owl in, onto the ground line', async () => {
    const obj = roomObject(undefined, { PASS_SIGNING_KEY: KEY });
    const guest = await join(obj, 'l1', 'v_guest');
    expect(guest.last('closed')).toMatchObject({ t: 'closed', room: 'l1', why: 'realm' });
    expect(guest.closed?.code).toBe(CLOSE.REALM_CLOSED);
    const keeper = connect('l1', 'v_keeper');
    await helloWith(obj, keeper, await mintKeeper(KEY, nowS() + 60));
    expect(keeper.closed).toBeNull();
    // Spread from the spawn as every arrival is, still within the screen the spawn is on (the lobby,
    // the level's second), and on the ground line's strip.
    const at = keeper.last('welcome')!.you.pos;
    const screen = Math.floor(roomDef('l1')!.spawns['default']!.x / ROOM_W) * ROOM_W;
    expect(at.x).toBeGreaterThan(screen + 24);
    expect(at.x).toBeLessThan(screen + ROOM_W - 24);
    expect(Math.abs(at.y - 770)).toBeLessThanOrEqual(4);
  });

  it('takes no token run out, signed with another key or of another kind, and drops a hello whose token is malformed', async () => {
    const obj = roomObject(undefined, { PASS_SIGNING_KEY: KEY });
    for (const token of [await mintKeeper(KEY, nowS() - 1), await mintKeeper('another-signing-key-0123456789', nowS() + 60), await mintEntry(KEY, 'v_late', nowS() + 60)]) {
      const late = connect('l1', 'v_late');
      await helloWith(obj, late, token);
      expect(late.closed?.code, token).toBe(CLOSE.REALM_CLOSED);
    }
    const broken = connect('l1', 'v_broken');
    await helloWith(obj, broken, 'not a token');
    expect(broken.closed?.code).toBe(CLOSE.BAD_PROTOCOL);
  });

  it('opens to every owl with the realms switch, as a gated realm does', async () => {
    const obj = roomObject(undefined, { PASS_SIGNING_KEY: KEY });
    await obj.fetch(new Request('https://park/notice', { method: 'POST', body: JSON.stringify({ words: null, realms: { open: ['l1'], portal: false, night: null } }) }));
    const owl = await join(obj, 'l1', 'v_owl');
    expect(owl.closed).toBeNull();
    expect(owl.last('welcome')).toBeDefined();
  });
});

describe('flight in the room object (OP-084)', () => {
  const up = { z: 7.2, vz: 858.3, s: 1, f: 1 } as const;

  it('goes to the other owls without asking for a collection, moves no quest, and is never logged', async () => {
    const obj = roomObject();
    const a = await join(obj, 'hub', 'v_a', OWNER);
    const b = await join(obj, 'hub', 'v_b');
    const questEvent = vi.spyOn(collections, 'questEvent');
    await send(obj, a, { t: 'air', air: up });
    await settle();
    expect(b.last('air')).toEqual({ t: 'air', id: 'v_a', air: up, at: expect.any(Number) });
    expect(a.of('air')).toEqual([]);
    expect(questEvent).not.toHaveBeenCalled();
    // A page without a collection flies too: every owl has it.
    await send(obj, b, { t: 'air', air: up });
    expect(a.last('air')).toMatchObject({ t: 'air', id: 'v_b', air: up });
    // Air the room cannot believe is dropped, and never closes the socket (OP-084): too high, of a kind it does not know, or none.
    for (const odd of [{ ...up, z: 5000 }, { ...up, s: 9 }, 'up', null]) await send(obj, a, { t: 'air', air: odd } as Record<string, unknown>);
    expect(b.of('air')).toHaveLength(1);
    expect(a.closed).toBeNull();
    // The old hop is gone with it.
    await send(obj, b, { t: 'emote', e: 'jump' });
    expect(b.closed?.code).toBe(CLOSE.BAD_PROTOCOL);
  });
});

describe('the player stats from the room object (OP-111)', () => {
  const LOGGED = { PARK_LOG_URL: 'https://log.example/functions/v1/owl-park-log', FRAUD_SCORE_KEY: 'k'.repeat(32), FRAUD_HASH_SALT: 's'.repeat(24) };
  const PASS = 'v_visitAAAA1';

  it('tells the collections object of each owl that comes in, changes its look, is still here, and leaves', async () => {
    const env = { GATE: 'open', COLLECTIONS: { getByName: () => collections }, ...LOGGED } as unknown as Env;
    const obj = new RoomObject(state as unknown as DurableObjectState, env);
    const ws = await join(obj, 'hub', PASS, OWNER);
    await settle();
    const me = { cid: OWNER, pass: PASS, device: null, room: 'hub' };
    // Its hello: it came into the room (OP-113).
    expect(collections.seenCalls).toEqual([[{ ...me, entered: true }, { body: LOOK.body, species: 'barn' }]]);
    await send(obj, ws, { t: 'look', look: { ...LOOK, species: 'snowy' } });
    await settle();
    expect(collections.seenCalls.at(-1)).toEqual([me, { body: LOOK.body, species: 'snowy' }]);
    // The minute heartbeat: every owl still here, at once.
    await obj.alarm();
    expect(collections.aliveCalls).toEqual([[me]]);
    // Its socket closes: the visit was here until now.
    await obj.webSocketClose(ws as unknown as WebSocket);
    await settle();
    expect(collections.aliveCalls).toEqual([[me], [me]]);
  });

  it("says an owl coming into its own nest is home, and one coming into another's is not (OP-113)", async () => {
    const env = { GATE: 'open', COLLECTIONS: { getByName: () => collections }, ...LOGGED } as unknown as Env;
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = new RoomObject(state as unknown as DurableObjectState, env);
    await join(obj, `nest-${nestId}`, PASS, OWNER);
    await join(obj, `nest-${nestId}`, 'v_visitBBBB2', GUEST);
    await settle();
    expect(collections.seenCalls.map(([s]) => s)).toEqual([
      { cid: OWNER, pass: PASS, device: null, room: `nest-${nestId}`, entered: true, own: true },
      { cid: GUEST, pass: 'v_visitBBBB2', device: null, room: `nest-${nestId}`, entered: true },
    ]);
  });

  it('asks nothing of the collections object for them while the log is off', async () => {
    const obj = roomObject();
    const ws = await join(obj, 'hub', PASS, OWNER);
    await obj.alarm();
    await obj.webSocketClose(ws as unknown as WebSocket);
    await settle();
    expect(collections.seenCalls).toEqual([]);
    expect(collections.aliveCalls).toEqual([]);
  });
});

describe('the climb in the room object (the stained-glass realm)', () => {
  const open = (o: Obj, realms: unknown) => o.fetch(new Request('https://park/notice', { method: 'POST', body: JSON.stringify({ words: null, realms }) }));
  const LIVE = { open: ['glass'], portal: true, night: 'easy' };
  const EASY = NIGHTS['easy']!;
  /** Walk an owl from the glass room's doorway to the portal at its far end and let the walk finish. */
  async function toPortal(obj: Obj, ws: FakeSocket) {
    // In front of the idol's plinth (no floor itself, OP-127), then along the street.
    await send(obj, ws, { t: 'move', to: { x: 1200, y: 850 }, seq: 1 });
    clock += 10_000;
    await send(obj, ws, { t: 'move', to: { x: 2885, y: 745 }, seq: 2 });
    clock += 10_000;
  }
  const act = (ws: FakeSocket, r: number) => ws.of('act').find((f) => f.r === r);

  it('starts a run only at the portal while the switch has it live, with the night the keepers lit', async () => {
    const obj = roomObject();
    await open(obj, { ...LIVE, portal: false });
    const ws = await join(obj, 'glass', 'v_climber', OWNER);
    // Not a collector: unknown. Portal off: closed. Away from the portal: far.
    const guest = await join(obj, 'glass', 'v_guest');
    await send(obj, guest, { t: 'act', a: 'climb', r: 1 });
    await settle();
    expect(act(guest, 1)).toMatchObject({ a: 'climb', ok: false, reason: 'unknown' });
    await send(obj, ws, { t: 'act', a: 'climb', r: 1 });
    await settle();
    expect(act(ws, 1)).toMatchObject({ a: 'climb', ok: false, reason: 'closed' });
    await open(obj, LIVE);
    await send(obj, ws, { t: 'act', a: 'climb', r: 2 });
    await settle();
    expect(act(ws, 2)).toMatchObject({ a: 'climb', ok: false, reason: 'far' });
    expect(collections.climbStarts).toEqual([
      { atPortal: false, portalLive: false, special: 'easy' },
      { atPortal: false, portalLive: true, special: 'easy' },
    ]);
    await toPortal(obj, ws);
    await send(obj, ws, { t: 'act', a: 'climb', r: 3 });
    await settle();
    expect(act(ws, 3)).toEqual({ t: 'act', a: 'climb', r: 3, ok: true, seed: 0x5eed, startedAt: clock, night: 'easy', tier: 'easy', banked: 0, remainingCap: PLAY_FEATHERS_PER_DAY, bestBandToday: 0, resumed: false, previousForgotten: false });
    expect(JSON.stringify(ws.frames)).not.toContain(OWNER);
  });

  it('pays the bands reached, refuses one reached too fast, resumes the run on a new socket anywhere, and forgets it after an hour', async () => {
    const obj = roomObject();
    await open(obj, LIVE);
    const ws = await join(obj, 'glass', 'v_climber', OWNER);
    await toPortal(obj, ws);
    await send(obj, ws, { t: 'act', a: 'climb', r: 1 });
    await settle();
    const started = act(ws, 1) as { seed: number; startedAt: number };
    expect(started).toMatchObject({ ok: true, banked: 0 });
    const seed = started.seed;
    // Band 2 before its floor: refused, nothing banked.
    clock = started.startedAt + leastClimbMs(EASY, 2) - 3_000;
    await send(obj, ws, { t: 'act', a: 'ascent', k: seed, band: 2, r: 2 });
    await settle();
    expect(act(ws, 2)).toMatchObject({ a: 'ascent', ok: false, reason: 'too-fast' });
    // Another seed: idle.
    await send(obj, ws, { t: 'act', a: 'ascent', k: seed + 1, band: 1, r: 3 });
    await settle();
    expect(act(ws, 3)).toMatchObject({ a: 'ascent', ok: false, reason: 'idle' });
    // Honest: bands 1 and 2 paid together.
    clock = started.startedAt + leastClimbMs(EASY, 2) + 250;
    await send(obj, ws, { t: 'act', a: 'ascent', k: seed, band: 2, r: 4 });
    await settle();
    expect(act(ws, 4)).toEqual({ t: 'act', a: 'ascent', r: 4, ok: true, banked: 2, added: 2, feathers: collections.book.feathers(OWNER, clock), total: 2, brisk: 0, ref: climbRef(OWNER, seed) });
    // The connection drops: a new socket in the hub, away from any portal, gets the run back.
    ws.close(1001, 'gone');
    const again = await join(obj, 'hub', 'v_climber2', OWNER);
    await send(obj, again, { t: 'act', a: 'climb', r: 5 });
    await settle();
    expect(act(again, 5)).toMatchObject({ a: 'climb', ok: true, seed, banked: 2, resumed: true, previousForgotten: false, remainingCap: PLAY_FEATHERS_PER_DAY - 2 });
    clock = started.startedAt + leastClimbMs(EASY, 3) + 250;
    await send(obj, again, { t: 'act', a: 'ascent', k: seed, band: 3, r: 6 });
    await settle();
    // Within band 2's arrival and the brisk window: the table's two feathers and the brisk one.
    expect(act(again, 6)).toMatchObject({ a: 'ascent', ok: true, banked: 3, added: 3, total: 5, brisk: 1 });
    // An hour on: the run is forgotten, and the next start from the hub is far from the portal.
    clock = started.startedAt + CLIMB_RUN_MAX_MS + 1;
    await send(obj, again, { t: 'act', a: 'ascent', k: seed, band: 4, r: 7 });
    await settle();
    expect(act(again, 7)).toMatchObject({ a: 'ascent', ok: false, reason: 'forgotten' });
    await send(obj, again, { t: 'act', a: 'climb', r: 8 });
    await settle();
    expect(act(again, 8)).toMatchObject({ a: 'climb', ok: false, reason: 'far' });
    expect(collections.climbStore.openRun(OWNER)?.banked).toBe(3);
    // The collections object away: offline, as every activity answers.
    collections.down = true;
    await send(obj, again, { t: 'act', a: 'climb', r: 9 });
    await settle();
    expect(act(again, 9)).toMatchObject({ a: 'climb', ok: false, reason: 'offline' });
  });
});

describe('an owl restored on another screen (OP-139)', () => {
  const ACCOUNTS = { ACCOUNTS: 'on' };
  const moved = (obj: Obj, cid: string, dev: string) => obj.fetch(new Request('https://park/moved', { method: 'POST', body: JSON.stringify({ cid, dev }) }));

  it('sends the moved card at once to the owl’s sockets from every other screen, and leaves the rest', async () => {
    const obj = roomObject(undefined, ACCOUNTS);
    const old = connect('hub', 'v_oldscreen', OWNER, 'd_oldscreen1');
    await hello(obj, old);
    const legacy = await join(obj, 'hub', 'v_legacytab', OWNER);
    const fresh = connect('hub', 'v_newscreen', OWNER, 'd_newscreen1');
    await hello(obj, fresh);
    const other = connect('hub', 'v_someoneel', GUEST, 'd_guestscrn1');
    await hello(obj, other);
    await settle();
    expect((await moved(obj, OWNER, 'd_newscreen1')).status).toBe(200);
    expect(old.closed?.code).toBe(CLOSE.MOVED);
    expect(legacy.closed?.code).toBe(CLOSE.MOVED);
    expect(fresh.closed).toBeNull();
    expect(other.closed).toBeNull();
    // Gone from the room for everyone still in it.
    expect(fresh.of('leave').map((f) => f.id)).toEqual(expect.arrayContaining(['v_oldscreen', 'v_legacytab']));
    // A notice that is not one changes nothing.
    await obj.fetch(new Request('https://park/moved', { method: 'POST', body: JSON.stringify({ cid: GUEST, dev: 'no' }) }));
    expect(other.closed).toBeNull();
  });

  it('turns away at its hello a page from a screen its owl has moved from', async () => {
    collections.devices.set(OWNER, 'd_newscreen1');
    const obj = roomObject(undefined, ACCOUNTS);
    const old = connect('hub', 'v_oldscreen', OWNER, 'd_oldscreen1');
    await hello(obj, old);
    const fresh = connect('hub', 'v_newscreen', OWNER, 'd_newscreen1');
    await hello(obj, fresh);
    await settle();
    expect(collections.holdsCalls).toEqual([
      [OWNER, 'd_oldscreen1'],
      [OWNER, 'd_newscreen1'],
    ]);
    expect(old.closed?.code).toBe(CLOSE.MOVED);
    expect(fresh.closed).toBeNull();
  });

  it('keeps the owl’s colours and kind for its picture, sent again only when they change', async () => {
    const obj = roomObject(undefined, ACCOUNTS);
    const ws = connect('hub', 'v_ownerpage', OWNER, 'd_oldscreen1');
    await hello(obj, ws);
    await send(obj, ws, { t: 'look', look: { ...LOOK, pledge: 'neon' } });
    await send(obj, ws, { t: 'look', look: { ...LOOK, body: '#111111' } });
    await settle();
    expect(collections.lookCalls).toEqual([
      [OWNER, { body: LOOK.body, belly: LOOK.belly, accent: LOOK.accent, species: 'barn' }],
      [OWNER, { body: '#111111', belly: LOOK.belly, accent: LOOK.accent, species: 'barn' }],
    ]);
  });

  it('asks nothing of the accounts while they are off', async () => {
    collections.devices.set(OWNER, 'd_newscreen1');
    const obj = roomObject();
    const old = connect('hub', 'v_oldscreen', OWNER, 'd_oldscreen1');
    await hello(obj, old);
    await settle();
    expect(old.closed).toBeNull();
    expect(collections.holdsCalls).toEqual([]);
    expect(collections.lookCalls).toEqual([]);
  });
});

describe('travel from the map (OP-130)', () => {
  /** A page's hello: through a doorway (its spawn) or, `travel`, from the map. */
  const helloFrom = (obj: Obj, ws: FakeSocket, spawn?: string, travel = false) =>
    send(obj, ws, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK, ...(spawn ? { spawn } : {}), ...(travel ? { via: 'travel' } : {}) });
  /** An owl into a room, through a doorway or by travel; its socket. */
  const into = async (obj: Obj, room: string, spawn?: string, travel = false) => {
    clock += 1000;
    const ws = connect(room, `v_${room}${++sockets}`, OWNER);
    await helloFrom(obj, ws, spawn, travel);
    await settle();
    return ws;
  };

  it('turns a travel into the park away until the owl has walked through the gate, and lets it in once it has', async () => {
    const obj = roomObject();
    await into(obj, 'lobby', 'from-homes');
    const early = await into(obj, 'grove', 'default', true);
    expect(early.frames.map((f) => f.t)).toEqual(['closed']);
    expect(early.last('closed')).toEqual({ t: 'closed', room: 'grove', why: 'gate' });
    expect(early.closed?.code).toBe(CLOSE.NOT_THROUGH_GATE);
    // In by the turnstiles: the hub at its default spawn.
    await into(obj, 'hub', 'default');
    const later = await into(obj, 'grove', 'default', true);
    expect(later.closed).toBeNull();
    expect(later.last('welcome')?.room).toBe('grove');
    // And on from there, realm to realm.
    expect((await into(obj, 'market', 'default', true)).last('welcome')?.room).toBe('market');
  });

  it('counts only the turnstiles as the gate: not the hub by its address or another room’s doorway', async () => {
    const obj = roomObject();
    await into(obj, 'hub');
    await into(obj, 'hub', 'from-grove');
    expect((await into(obj, 'grove', 'default', true)).closed?.code).toBe(CLOSE.NOT_THROUGH_GATE);
  });

  it('forgets the gate once the owl is outside again, by the way out, the street or its nest', async () => {
    for (const [room, spawn] of [['lobby', 'from-hub'], ['homes', 'from-lobby']] as const) {
      collections = new FakeCollections();
      const obj = roomObject();
      await into(obj, 'hub', 'default');
      await into(obj, room, spawn);
      expect((await into(obj, 'grove', 'default', true)).closed?.code, room).toBe(CLOSE.NOT_THROUGH_GATE);
    }
    collections = new FakeCollections();
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    const obj = roomObject();
    await into(obj, 'hub', 'default');
    await into(obj, `nest-${nestId}`, 'mirror', true);
    expect((await into(obj, 'grove', 'default', true)).closed?.code).toBe(CLOSE.NOT_THROUGH_GATE);
  });

  it('lets a travel outside the park in without the gate', async () => {
    const obj = roomObject();
    expect((await into(obj, 'lobby', 'default', true)).last('welcome')?.room).toBe('lobby');
    expect((await into(obj, 'homes', 'default', true)).last('welcome')?.room).toBe('homes');
  });

  it('keeps every place an owl walks or travels into for its map, but not one it was turned away from', async () => {
    const obj = roomObject();
    await into(obj, 'homes', 'from-nest-0');
    await into(obj, 'lobby', 'from-homes');
    await into(obj, 'market', 'default', true);
    await into(obj, 'hub', 'default');
    await into(obj, 'grove', 'default', true);
    expect(collections.travel.state(OWNER)).toEqual({ places: ['homes', 'lobby', 'hub', 'grove'], gate: true });
  });

  it('holds a page’s frames behind its travel hello while the gate is asked, and answers them in order', async () => {
    const obj = roomObject();
    await into(obj, 'hub', 'default');
    const ws = connect('grove', 'v_quick', OWNER);
    const hello = helloFrom(obj, ws, 'default', true);
    const moved = send(obj, ws, { t: 'move', to: { x: 2500, y: 850 }, seq: 1 });
    await Promise.all([hello, moved]);
    await settle();
    expect(ws.closed).toBeNull();
    expect(ws.frames.map((f) => f.t).filter((t) => t === 'welcome' || t === 'move')).toEqual(['welcome', 'move']);
  });

  it('lets a travel in when the collections object does not answer: the gate welcomes, it does not lock', async () => {
    const obj = roomObject();
    collections.down = true;
    const ws = await into(obj, 'grove', 'default', true);
    expect(ws.closed).toBeNull();
    expect(ws.last('welcome')?.room).toBe('grove');
  });

  it('tells the player stats a room was come into by travel (OP-113)', async () => {
    const LOGGED = { PARK_LOG_URL: 'https://log.example/functions/v1/owl-park-log', FRAUD_SCORE_KEY: 'k'.repeat(32), FRAUD_HASH_SALT: 's'.repeat(24) };
    const env = { GATE: 'open', COLLECTIONS: { getByName: () => collections }, ...LOGGED } as unknown as Env;
    const obj = new RoomObject(state as unknown as DurableObjectState, env);
    await into(obj, 'hub', 'default');
    await into(obj, 'grove', 'default', true);
    const entered = collections.seenCalls.map(([s]) => s as { room: string; entered?: boolean; travel?: boolean }).filter((s) => s.entered);
    expect(entered.map((s) => [s.room, s.travel ?? false])).toEqual([
      ['hub', false],
      ['grove', true],
    ]);
  });
});

describe('the room server’s log (OP-134)', () => {
  let cap: ReturnType<typeof captureLogs>;
  beforeEach(() => {
    cap = captureLogs();
  });
  afterEach(() => cap.restore());
  /** How a socket's owl shows on its lines: hashed, never as it is. */
  const owl = (id: string, cid?: string) => ({ session_id: hashForLog(id), ...(cid ? { collector_hash: hashForLog(cid) } : {}) });
  const count = (event: string) => eventsOf(cap.lines).filter((e) => e === event).length;

  it('tells an owl joining and leaving and why: a goodbye, a page that closed, and a goodbye said asleep (afk), never a collector id', async () => {
    const obj = roomObject();
    const a = await join(obj, 'hub', 'v_a', GUEST);
    logged(cap.lines, 'room_join_ok', { component: 'room.join', room: 'hub', ...owl('v_a', GUEST), owls: 1 });
    await send(obj, a, { t: 'bye' });
    logged(cap.lines, 'room_leave', { room: 'hub', ...owl('v_a', GUEST), reason: 'user' });
    const b = await join(obj, 'hub', 'v_b');
    await obj.webSocketClose(b as unknown as WebSocket, 1001);
    logged(cap.lines, 'room_leave', { ...owl('v_b'), reason: 'user' });
    // Asleep (OP-126), and away half a minute before its page leaves.
    const c = await join(obj, 'hub', 'v_c', OTHER);
    await send(obj, c, { t: 'rest', asleep: true });
    logged(cap.lines, 'afk_sleep', { component: 'room.rest', room: 'hub', ...owl('v_c', OTHER) });
    clock += 30_000;
    await send(obj, c, { t: 'bye' });
    logged(cap.lines, 'room_leave', { ...owl('v_c', OTHER), reason: 'afk', stayed_ms: 30_000 });
    logged(cap.lines, 'afk_leave', { ...owl('v_c', OTHER), asleep_ms: 30_000 });
    expect(JSON.stringify(cap.lines)).not.toContain(GUEST);
    expect(JSON.stringify(cap.lines)).not.toContain(OTHER);
  });

  it('tells a dropped connection, and the gap once its owl is back on a new socket; a goodbye and a walk back in is no reconnect', async () => {
    const obj = roomObject();
    const a = await join(obj, 'hub', 'v_a', GUEST);
    await obj.webSocketClose(a as unknown as WebSocket, 1006);
    logged(cap.lines, 'room_leave', { ...owl('v_a', GUEST), reason: 'dropped', detail: 'code 1006' });
    clock += 4_000;
    await join(obj, 'hub', 'v_a', GUEST);
    logged(cap.lines, 'reconnect_ok', { ...owl('v_a', GUEST), gap_ms: 4_000 });
    // Back before the room saw its old socket go.
    await join(obj, 'hub', 'v_a', GUEST);
    logged(cap.lines, 'reconnect_ok', { ...owl('v_a', GUEST), gap_ms: 0, replaced: true });
    const before = count('reconnect_ok');
    const b = await join(obj, 'hub', 'v_b');
    await send(obj, b, { t: 'bye' });
    await join(obj, 'hub', 'v_b');
    expect(count('reconnect_ok')).toBe(before);
  });

  it('tells why it sent an owl away: a frame it cannot read, a socket silent too long, and one that never said hello', async () => {
    const obj = roomObject();
    const a = await join(obj, 'hub', 'v_a');
    await obj.webSocketMessage(a as unknown as WebSocket, 'not a frame');
    expect(a.closed?.code).toBe(CLOSE.BAD_PROTOCOL);
    await obj.webSocketClose(a as unknown as WebSocket, CLOSE.BAD_PROTOCOL);
    logged(cap.lines, 'room_leave', { ...owl('v_a'), reason: 'kick', detail: 'malformed frame' });
    await join(obj, 'hub', 'v_quiet');
    connect('hub', 'v_mute');
    clock += 90_001;
    await obj.alarm();
    logged(cap.lines, 'room_leave', { ...owl('v_quiet'), reason: 'timeout' });
    logged(cap.lines, 'room_join_refused', { ...owl('v_mute'), reason: 'no-hello' });
  });

  it('tells each owl it turned away and why: a full room, a closed realm, a closed nest, a travel before the gate', async () => {
    const full = roomObject({ hub: 1 });
    await join(full, 'hub', 'v_a');
    await join(full, 'hub', 'v_b');
    logged(cap.lines, 'room_join_refused', { room: 'hub', ...owl('v_b'), reason: 'cap', cap: 1 });
    const obj = roomObject();
    await join(obj, 'glass', 'v_c');
    logged(cap.lines, 'room_join_refused', { room: 'glass', ...owl('v_c'), reason: 'realm' });
    const nestId = collections.nests.mine(OWNER, COLOURS, clock).nest.nestId;
    collections.nests.setOpen(OWNER, false, clock);
    await join(obj, `nest-${nestId}`, 'v_d', GUEST);
    await settle();
    logged(cap.lines, 'room_join_refused', { ...owl('v_d', GUEST), reason: 'nest', detail: 'closed' });
    const travel = connect('grove', 'v_e', GUEST);
    await send(obj, travel, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK, via: 'travel' });
    await settle();
    logged(cap.lines, 'room_join_refused', { room: 'grove', ...owl('v_e', GUEST), reason: 'gate' });
  });

  it('tells the front gate walked through, and the flag cleared once the owl is outside the park again (OP-130)', async () => {
    const obj = roomObject();
    const ws = connect('hub', 'v_a', GUEST);
    await send(obj, ws, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK, spawn: 'default' });
    await settle();
    logged(cap.lines, 'gate_crossed', { component: 'collections.travel', room: 'hub', ...owl('v_a', GUEST) });
    await send(obj, ws, { t: 'bye' });
    await join(obj, 'lobby', 'v_a', GUEST);
    await settle();
    logged(cap.lines, 'gate_flag_cleared', { room: 'lobby', ...owl('v_a', GUEST) });
  });

  it('tells emotes dropped for coming too fast, with how many, and those still untold as the owl leaves', async () => {
    (collections as unknown as { owned: () => Promise<string[]> }).owned = async () => ['hoot'];
    const obj = roomObject();
    const ws = await join(obj, 'hub', 'v_a', GUEST);
    for (let i = 0; i < 3; i++) await send(obj, ws, { t: 'emote', e: 'hoot' });
    logged(cap.lines, 'emote_throttled', { component: 'room.emote', ...owl('v_a', GUEST), count: 1 });
    await send(obj, ws, { t: 'bye' });
    expect(cap.lines.filter((l) => l.event === 'emote_throttled').map((l) => l['count'])).toEqual([1, 1]);
  });

  it('tells a place the room would not take as a page asked for it: at once, then once a minute with how many, and the rest as the owl leaves (OP-149)', async () => {
    const obj = roomObject();
    const ws = await join(obj, 'hub', 'v_a', GUEST);
    // Outside the hub, though inside the biggest room there is (a frame past that is malformed).
    await send(obj, ws, { t: 'move', to: { x: 6000, y: 1700 }, seq: 1 });
    logged(cap.lines, 'position_rejected', { component: 'room.move', room: 'hub', ...owl('v_a', GUEST), reason: 'room', count: 1 });
    await send(obj, ws, { t: 'move', to: { x: 2400, y: 20 }, seq: 2 }); // the hub's sky
    expect(count('position_rejected')).toBe(1);
    clock += 60_000;
    await send(obj, ws, { t: 'move', to: { x: 2400, y: 20 }, seq: 3 });
    logged(cap.lines, 'position_rejected', { reason: 'floor', count: 2 });
    await send(obj, ws, { t: 'move', to: { x: 6000, y: 1700 }, seq: 4 });
    await send(obj, ws, { t: 'bye' });
    expect(cap.lines.filter((l) => l.event === 'position_rejected').map((l) => [l['reason'], l['count']])).toEqual([
      ['room', 1],
      ['floor', 2],
      ['room', 1],
    ]);
  });

  it('tells a band of the climb it refused, by the run’s reference', async () => {
    const obj = roomObject();
    const ws = await join(obj, 'hub', 'v_a', OWNER);
    await send(obj, ws, { t: 'act', a: 'ascent', k: 7, band: 1, r: 1 });
    await settle();
    logged(cap.lines, 'climb_band_refused', { component: 'collections.climb', climb_ref: climbRef(OWNER, 7), band: 1, reason: 'idle' });
  });

  it('samples how long a room’s frames take, every ten seconds', async () => {
    const obj = roomObject();
    const ws = await join(obj, 'hub', 'v_a');
    await send(obj, ws, { t: 'move', to: { x: 2450, y: 740 }, seq: 1 });
    expect(count('tick_latency_p95')).toBe(0);
    clock += 10_000;
    await send(obj, ws, { t: 'move', to: { x: 2400, y: 730 }, seq: 2 });
    logged(cap.lines, 'tick_latency_p95', { component: 'room.tick', room: 'hub', p95_ms: 0, frames: 3, window_ms: 10_000 });
  });

  it('tells a call to the collections object that failed, and lets the owl in all the same', async () => {
    collections.down = true;
    const obj = roomObject();
    const ws = connect('grove', 'v_a', GUEST);
    await send(obj, ws, { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK, via: 'travel' });
    await settle();
    logged(cap.lines, 'read_failed', { component: 'collections.travel', level: 'warn', ...owl('v_a', GUEST) });
    logged(cap.lines, 'write_failed', { component: 'collections.travel', level: 'error', ...owl('v_a', GUEST) });
    expect(ws.last('welcome')).toBeDefined();
  });

  it('carries the chaos run’s id on every line about a socket opened under one', async () => {
    const obj = roomObject();
    const ws = new FakeSocket();
    ws.serializeAttachment({ room: 'hub', id: 'v_run', sid: 'sid-run', ip: '192.0.2.1', joinedAt: clock, state: null, run: 'chaos-7' });
    state.acceptWebSocket(ws, ['id:v_run', 'ip:192.0.2.1', 'room:hub']);
    await hello(obj, ws);
    logged(cap.lines, 'room_join_ok', { run_id: 'chaos-7', ...owl('v_run') });
  });

  it('tells a frame the room could not send, and goes on', () => {
    const room = new Room(roomDef('hub')!, { now: () => clock, cap: 10, log: loggerFor({}) });
    const gone = {
      send: () => {
        throw new Error('the socket is gone');
      },
      close: () => {},
    };
    expect(room.join(gone, 'v_a', { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK }, 'sid')).toBe('ok');
    logged(cap.lines, 'send_failed', { component: 'room.tick', room: 'hub', frame: 'welcome' });
  });
});

/** A state whose storage keeps what is put in it and the alarm set, and lets a key go, as the platform's does. */
class AlarmState extends FakeState {
  readonly kept = new Map<string, unknown>();
  alarmAt: number | null = null;
  override readonly storage = {
    get: async (key: string) => this.kept.get(key),
    put: async (key: string, value: unknown) => {
      this.kept.set(key, value);
    },
    delete: async (key: string) => this.kept.delete(key),
    getAlarm: async () => this.alarmAt,
    setAlarm: async (at?: number) => {
      this.alarmAt = at ?? null;
    },
  };
}

describe('the park’s nightly restart (OP-181)', () => {
  let cap: ReturnType<typeof captureLogs>;
  let alarms: AlarmState;
  beforeEach(() => {
    cap = captureLogs();
    alarms = new AlarmState();
    state = alarms;
  });
  afterEach(() => cap.restore());
  const restart = async (o: Obj) => (await o.fetch(new Request('https://park/restart', { method: 'POST' }))).json() as Promise<{ owls: number; sockets: number }>;

  it('tells every socket first, then closes each with the restart code at its alarm, and its owl leaves', async () => {
    const obj = roomObject();
    const a = await join(obj, 'hub', 'v_a');
    const b = await join(obj, 'grove', 'v_b', GUEST);
    expect(await restart(obj)).toEqual({ owls: 2, sockets: 2 });
    for (const ws of [a, b]) {
      expect(ws.last('restart')).toEqual({ t: 'restart', words: RESTART_NOTICE, ms: RESTART_CLOSE_MS });
      expect(ws.closed).toBeNull();
    }
    expect(alarms.alarmAt).toBe(clock + RESTART_CLOSE_MS);
    logged(cap.lines, 'room_restart', { component: 'room.leave', level: 'info', owls: 2, sockets: 2, close_in_ms: RESTART_CLOSE_MS });
    // Not before its moment.
    clock += RESTART_CLOSE_MS - 1;
    await obj.alarm();
    expect(a.closed).toBeNull();
    expect(alarms.alarmAt).toBe(MON + RESTART_CLOSE_MS);
    clock += 1;
    await obj.alarm();
    for (const ws of [a, b]) expect(ws.closed).toEqual({ code: CLOSE.RESTART, reason: 'park restart' });
    logged(cap.lines, 'room_leave', { session_id: hashForLog('v_a'), reason: 'kick', detail: 'restart' });
    expect(await (await obj.fetch(new Request('https://park/counts'))).json()).toMatchObject({ hub: 0, grove: 0 });
    expect(alarms.kept.has('restart')).toBe(false);
    // Owls who come in after it are let be.
    const later = await join(obj, 'hub', 'v_later');
    clock += 60_000;
    await obj.alarm();
    expect(later.closed).toBeNull();
  });

  it('closes them though the object slept between the notice and its alarm', async () => {
    const obj = roomObject();
    const a = await join(obj, 'hub', 'v_a');
    await restart(obj);
    const woken = roomObject();
    await settle(); // the constructor reads its storage
    clock += RESTART_CLOSE_MS;
    await woken.alarm();
    expect(a.closed?.code).toBe(CLOSE.RESTART);
  });

  it('keeps an earlier alarm (a quiz question closing) and still closes at its moment after it', async () => {
    const obj = roomObject();
    const a = await join(obj, 'hub', 'v_a');
    alarms.alarmAt = clock + 2_000;
    await restart(obj);
    expect(alarms.alarmAt).toBe(clock + 2_000);
    clock += 2_000;
    await obj.alarm();
    expect(a.closed).toBeNull();
    expect(alarms.alarmAt).toBe(MON + RESTART_CLOSE_MS);
  });

  it('sets nothing in an object with no sockets, and sends nobody home for a close found long past', async () => {
    const empty = roomObject();
    expect(await restart(empty)).toEqual({ owls: 0, sockets: 0 });
    expect(alarms.alarmAt).toBeNull();
    logged(cap.lines, 'room_restart', { owls: 0, sockets: 0, close_in_ms: 0 });
    alarms.kept.set('restart', clock - 10 * 60_000);
    const woken = roomObject();
    await settle();
    const a = await join(woken, 'hub', 'v_a');
    await woken.alarm();
    expect(a.closed).toBeNull();
    expect(alarms.kept.has('restart')).toBe(false);
  });
});
