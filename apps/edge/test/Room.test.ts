import { beforeEach, describe, expect, it } from 'vitest';
import { CLOSE, EDGE_PROTOCOL_VERSION, WALK_SPEED, type ClientHello, type RoomDef, type ServerFrame } from '@owl-park/shared';
import { Room, LIMITS, type Peer, type VisitorState } from '../src/Room';

const def: RoomDef = {
  id: 'test',
  size: { w: 1600, h: 900 },
  background: 'x',
  mood: 'hub',
  walkable: [
    [
      { x: 100, y: 500 },
      { x: 1500, y: 500 },
      { x: 1500, y: 880 },
      { x: 100, y: 880 },
    ],
  ],
  spawns: { default: { x: 800, y: 700 }, 'from-left': { x: 200, y: 700 } },
  doors: [],
};
const look = { body: '#111111', belly: '#222222', accent: '#333333' };

class FakePeer implements Peer {
  frames: ServerFrame[] = [];
  closed: { code: number; reason: string } | null = null;
  persisted: VisitorState[] = [];
  send(text: string) {
    this.frames.push(JSON.parse(text));
  }
  persist(st: VisitorState) {
    this.persisted.push(structuredClone(st));
  }
  close(code: number, reason: string) {
    this.closed = { code, reason };
  }
  last<T extends ServerFrame['t']>(t: T): Extract<ServerFrame, { t: T }> | undefined {
    return [...this.frames].reverse().find((f) => f.t === t) as Extract<ServerFrame, { t: T }> | undefined;
  }
  count(t: ServerFrame['t']) {
    return this.frames.filter((f) => f.t === t).length;
  }
}

const hello = (extra: Partial<ClientHello> = {}): ClientHello => ({ t: 'hello', v: EDGE_PROTOCOL_VERSION, look, ...extra });

describe('Room', () => {
  let now = 1_000_000;
  let room: Room;
  beforeEach(() => {
    now = 1_000_000;
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    room = new Room(def, { now: () => now, random, cap: 3, counts: () => ({ test: room.count }) });
  });

  it('welcomes a visitor on walkable ground and announces it to the others', () => {
    const a = new FakePeer();
    expect(room.join(a, 'a', hello())).toBe('ok');
    const w = a.last('welcome')!;
    expect(w.id).toBe('a');
    expect(w.owls).toEqual([]);
    expect(w.you.pos.y).toBeGreaterThanOrEqual(500);
    expect(w.counts).toEqual({ test: 1 });

    const b = new FakePeer();
    room.join(b, 'b', hello({ spawn: 'from-left' }));
    expect(a.last('enter')!.owl.id).toBe('b');
    expect(b.last('welcome')!.owls.map((o) => o.id)).toEqual(['a']);
    // door entries scatter within the small radius
    const bp = b.last('welcome')!.you.pos;
    expect(Math.abs(bp.x - 200)).toBeLessThanOrEqual(LIMITS.scatterDoor);
    expect(b.persisted.at(-1)?.pos).toEqual(bp); // the adapter can rebuild the room from what was persisted
  });

  it('keeps door arrivals close to the door even when the spawn is named "default"', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello({ spawn: 'default' }));
    const p = a.last('welcome')!.you.pos;
    expect(Math.abs(p.x - 800)).toBeLessThanOrEqual(LIMITS.scatterDoor);
  });

  it('never scatters an arrival into an exit doorway', () => {
    const withExit: RoomDef = { ...def, spawns: { default: { x: 650, y: 700 } }, doors: [{ id: 'out', rect: { x: 700, y: 600, w: 200, h: 200 }, to: { room: 'other', spawn: 'default' } }] };
    const r2 = new Room(withExit, { now: () => now, cap: 50 });
    for (let i = 0; i < 40; i++) {
      const p = new FakePeer();
      r2.join(p, `v${i}`, hello());
      const pos = p.last('welcome')!.you.pos;
      const inside = pos.x >= 700 && pos.x <= 900 && pos.y >= 600 && pos.y <= 800;
      expect(inside).toBe(false);
    }
  });

  it('refuses when full and replaces a duplicate session', () => {
    const peers = ['a', 'b', 'c'].map((id, i) => {
      const p = new FakePeer();
      room.join(p, id, hello(), `s${i}`);
      return p;
    });
    const d = new FakePeer();
    expect(room.join(d, 'd', hello())).toBe('full');
    const a2 = new FakePeer();
    expect(room.join(a2, 'a', hello(), 's9')).toBe('ok');
    expect(peers[0]!.closed?.code).toBe(CLOSE.REPLACED);
    expect(peers[1]!.last('leave')!.id).toBe('a');
    expect(peers[1]!.last('enter')!.owl.id).toBe('a');
    // The replaced socket's late close must not remove the new session.
    room.leave('a', 's0');
    expect(room.has('a')).toBe(true);
    expect(room.sessionOf('a')).toBe('s9');
    room.leave('a', 's9');
    expect(room.has('a')).toBe(false);
  });

  it('lets a replacement session resume where the old one stood', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello(), 's0');
    room.move('a', { t: 'move', to: { x: 1300, y: 800 }, seq: 1 });
    now += 60_000;
    const a2 = new FakePeer();
    room.join(a2, 'a', hello({ pos: { x: 1295, y: 795 } }), 's1');
    expect(a2.last('welcome')!.you.pos).toEqual({ x: 1295, y: 795 });
  });

  it('clamps walks to the walkable area, echoes with seq, and fans out without it', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    room.move('a', { t: 'move', to: { x: 800, y: 100 }, seq: 1 }); // into the sky
    const echo = a.last('move')!;
    expect(echo.seq).toBe(1);
    expect(echo.to.y).toBe(500);
    const seen = b.last('move')!;
    expect(seen.seq).toBeUndefined();
    expect(seen.to).toEqual(echo.to);
    expect(seen.at).toBe(now);
  });

  it('continues from the mid-walk position when redirected', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello());
    const start = a.last('welcome')!.you.pos;
    room.move('a', { t: 'move', to: { x: start.x + 400, y: start.y }, seq: 1 });
    now += 500; // half a second: WALK_SPEED/2 px along the way
    room.move('a', { t: 'move', to: { x: start.x, y: start.y }, seq: 2 });
    const second = a.last('move')!;
    expect(second.from.x).toBeCloseTo(start.x + WALK_SPEED / 2, 0);
  });

  it('ignores stale seq and tiny moves', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello());
    room.move('a', { t: 'move', to: { x: 300, y: 600 }, seq: 5 });
    room.move('a', { t: 'move', to: { x: 400, y: 600 }, seq: 4 });
    expect(a.count('move')).toBe(1);
    now += 10_000;
    room.move('a', { t: 'move', to: { x: 301, y: 600 }, seq: 6 });
    expect(a.count('move')).toBe(1);
  });

  it('stops a walking owl that asks to walk to where it already is', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    const start = a.last('welcome')!.you.pos;
    room.move('a', { t: 'move', to: { x: start.x + 400, y: start.y }, seq: 1 });
    now += 500;
    const here = { x: start.x + WALK_SPEED / 2, y: start.y };
    room.move('a', { t: 'move', to: here, seq: 2 }); // letting go of the arrow keys
    const seen = b.last('move')!;
    expect(seen.from).toEqual(here);
    expect(seen.to).toEqual(here);
    expect(a.last('move')!.seq).toBe(2);
    now += 2000;
    expect(room.positionOf('a')).toEqual(here); // it stays where it stopped
  });

  it('rate limits bursts of moves and closes after repeated strikes', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello());
    for (let i = 1; i <= LIMITS.moveBurst; i++) room.move('a', { t: 'move', to: { x: 200 + i * 50, y: 600 }, seq: i });
    expect(a.count('move')).toBe(LIMITS.moveBurst);
    for (let i = 0; i < LIMITS.strikesToClose; i++) room.move('a', { t: 'move', to: { x: 1000, y: 600 }, seq: 100 + i });
    expect(a.closed?.code).toBe(CLOSE.RATE_LIMITED);
    expect(a.count('move')).toBe(LIMITS.moveBurst);
  });

  it('refills tokens over time', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello());
    for (let i = 1; i <= LIMITS.moveBurst; i++) room.move('a', { t: 'move', to: { x: 200 + i * 50, y: 600 }, seq: i });
    now += 1000;
    room.move('a', { t: 'move', to: { x: 1200, y: 600 }, seq: 50 });
    expect(a.count('move')).toBe(LIMITS.moveBurst + 1);
  });

  it('broadcasts leave and lets a quick return resume near the last spot', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    room.move('a', { t: 'move', to: { x: 1300, y: 800 }, seq: 1 });
    now += 60_000;
    room.leave('a');
    expect(b.last('leave')!.id).toBe('a');
    const a2 = new FakePeer();
    room.join(a2, 'a', hello({ pos: { x: 1290, y: 790 } }));
    expect(a2.last('welcome')!.you.pos).toEqual({ x: 1290, y: 790 });
  });

  it('does not honour a resume position far from the spawn for a stranger', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello({ pos: { x: 1400, y: 850 } }));
    const p = a.last('welcome')!.you.pos;
    expect(Math.hypot(p.x - 800, p.y - 700)).toBeLessThanOrEqual(LIMITS.scatterDefault * 1.5);
  });

  it('restores visitors without sending frames', () => {
    const a = new FakePeer();
    room.restore(a, { id: 'z', look, pos: { x: 500, y: 600 }, walk: null });
    expect(a.frames).toEqual([]);
    expect(room.count).toBe(1);
    expect(room.snapshot()[0]!.id).toBe('z');
  });
});

describe('Room hooks for collectibles, quests and interactables', () => {
  let now = 2_000_000;
  let room: Room;
  beforeEach(() => {
    now = 2_000_000;
    room = new Room(def, { now: () => now, random: () => 0.5, cap: 3 });
  });

  it('reports where a visitor stands on the server clock, mid-walk included', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello());
    const start = a.last('welcome')!.you.pos;
    expect(room.positionOf('a')).toEqual(start);
    room.move('a', { t: 'move', to: { x: start.x + 520, y: start.y }, seq: 1 });
    now += 1000; // WALK_SPEED px along
    const mid = room.positionOf('a')!;
    expect(Math.abs(mid.x - (start.x + WALK_SPEED))).toBeLessThanOrEqual(1);
    now += 5000;
    expect(room.positionOf('a')).toEqual({ x: start.x + 520, y: start.y });
    expect(room.positionOf('nobody')).toBeNull();
  });

  it('broadcasts emotes to the others, at most one per interval', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    expect(room.emote('a', 'hoot')).toBe(true);
    expect(b.last('emote')).toEqual({ t: 'emote', id: 'a', e: 'hoot' });
    expect(a.count('emote')).toBe(0); // the sender plays it locally
    expect(room.emote('a', 'flap')).toBe(false);
    now += LIMITS.emoteEveryMs;
    expect(room.emote('a', 'flap')).toBe(true);
    expect(b.count('emote')).toBe(2);
  });

  it('sends used-up objects on join and lets a shared object be used once until it is back', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    expect(a.last('objects')).toEqual({ t: 'objects', until: {} });
    expect(room.useObject('a', 'pile', now + 5000)).toBe(true);
    expect(a.last('used')).toEqual({ t: 'used', id: 'pile', by: 'a', until: now + 5000 }); // the user plays it too
    expect(room.useObject('a', 'pile', now + 9000)).toBe(false);
    room.join(b, 'b', hello());
    expect(b.last('objects')).toEqual({ t: 'objects', until: { pile: now + 5000 } });
    now += 5000;
    expect(room.objectStates()).toEqual({});
    expect(room.useObject('b', 'pile', now + 5000)).toBe(true);
    expect(a.last('used')!.by).toBe('b');
    // After an eviction the saved states come back, minus any that are already back.
    const fresh = new Room(def, { now: () => now, random: () => 0.5, cap: 3 });
    fresh.restoreObjects({ pile: now + 5000, old: now - 1 });
    expect(fresh.objectStates()).toEqual({ pile: now + 5000 });
  });

  it('checks reach on the server clock with a little slack, and spaces out uses', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello());
    const p = a.last('welcome')!.you.pos;
    expect(room.near('a', { x: p.x + 100 + LIMITS.reachSlackPx, y: p.y }, 100)).toBe(true);
    expect(room.near('a', { x: p.x + 101 + LIMITS.reachSlackPx, y: p.y }, 100)).toBe(false);
    expect(room.near('nobody', p, 100)).toBe(false);
    expect(room.takeUse('a')).toBe(true);
    expect(room.takeUse('a')).toBe(false);
    now += LIMITS.useEveryMs;
    expect(room.takeUse('a')).toBe(true);
  });

  it('applies a vetted look without counting it twice, and closes floods on adapter frames', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    const worn = { ...look, wear: { head: 'crown~0' } };
    room.look('a', worn, true);
    expect(b.last('look')).toEqual({ t: 'look', id: 'a', look: worn });
    expect(room.lookOf('a')).toEqual(worn);
    for (let i = 0; i < LIMITS.framesPerWindow; i++) expect(room.admit('a')).toBe(true);
    expect(room.admit('a')).toBe(false);
    expect(a.closed?.code).toBe(CLOSE.RATE_LIMITED);
  });
});
