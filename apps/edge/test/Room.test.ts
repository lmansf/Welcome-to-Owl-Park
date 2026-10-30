import { beforeEach, describe, expect, it } from 'vitest';
import { AIRBORNE, CLOSE, EDGE_PROTOCOL_VERSION, GROUNDED, ON_GROUND, STREET_DOORS, STREET_ROOM, WALK_SPEED, arrivalPoint, distance, isWalkable, nestDoorIndex, resolveTarget, type Air, type ClientHello, type RoomDef, type ServerFrame, type Vec2 } from '@owl-park/shared';
import { ROOMS, roomFor } from '@owl-park/shared/rooms';
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

  it("keeps an owl where it came through a doorway, as far across as it was (OP-124)", () => {
    const hub = new Room(ROOMS['hub']!, { now: () => now, cap: 50 });
    // Through the gate's left turnstile: the hub's path at its left, not its middle.
    const pos = arrivalPoint(ROOMS['hub']!, 'default', 'lobby', { axis: 'x', t: 0 });
    expect(pos.x).toBeLessThan(ROOMS['hub']!.spawns['default']!.x - 60);
    const a = new FakePeer();
    hub.join(a, 'a', hello({ spawn: 'default', pos }));
    expect(a.last('welcome')!.you.pos).toEqual(pos);
  });

  it('tells the others an owl fell asleep, shows a newcomer it asleep, and wakes it for everyone when it walks (OP-126)', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    room.rest('a', true);
    expect(b.last('rest')).toEqual({ t: 'rest', id: 'a', asleep: true });
    expect(a.count('rest')).toBe(0); // its own page knows
    room.rest('a', true); // already asleep: nothing new to tell
    expect(b.count('rest')).toBe(1);
    expect(a.persisted.at(-1)?.asleep).toBe(true);
    // A newcomer sees it asleep, and the one awake as it is.
    const c = new FakePeer();
    room.join(c, 'c', hello());
    const owls = c.last('welcome')!.owls;
    expect(owls.find((o) => o.id === 'a')?.asleep).toBe(true);
    expect(owls.find((o) => o.id === 'b')?.asleep).toBeUndefined();
    // Walking wakes it, for everyone, before the walk.
    room.move('a', { t: 'move', to: { x: 1000, y: 700 }, seq: 1 });
    const seen = b.frames.slice(-2).map((f) => f.t);
    expect(seen).toEqual(['rest', 'move']);
    expect(b.last('rest')).toEqual({ t: 'rest', id: 'a', asleep: false });
    expect(room.snapshot().find((o) => o.id === 'a')?.asleep).toBeUndefined();
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

  it('lets a page back from a dropped connection resume as far off as its owl could have walked meanwhile (OP-138)', () => {
    for (const [id, downMs, kept] of [['a', 2_000, true], ['b', 100, false]] as const) {
      const p = new FakePeer();
      room.join(p, id, hello());
      room.move(id, { t: 'move', to: { x: 1450, y: 850 }, seq: 1 });
      now += 60_000;
      room.leave(id);
      now += downMs;
      // 450 px from where it left and away from the spawn: two seconds on foot cover that, a tenth of one does not.
      const back = new FakePeer();
      room.join(back, id, hello({ pos: { x: 1000, y: 850 } }));
      const pos = back.last('welcome')!.you.pos;
      if (kept) expect(pos).toEqual({ x: 1000, y: 850 });
      else expect(Math.hypot(pos.x - 800, pos.y - 700)).toBeLessThanOrEqual(LIMITS.scatterDefault * 1.5);
      room.leave(id);
    }
    expect(LIMITS.resumeRadius + WALK_SPEED * 0.1).toBeLessThan(450);
  });

  it('hands over where owls left lately, and a room made again from them lets one back resume there (OP-138)', () => {
    for (const [id, x] of [['a', 1450], ['b', 300], ['c', 1400]] as const) {
      room.join(new FakePeer(), id, hello());
      room.move(id, { t: 'move', to: { x, y: 850 }, seq: 1 });
    }
    now += 60_000;
    room.leave('a');
    now += 30_000;
    room.leave('b');
    // Only the window's leavers, as copies: 'a' falls out of it, 'c' never left.
    now += LIMITS.leaverMemoryMs - 30_000 + 1;
    const kept = room.leaversNow();
    expect(kept).toEqual({ b: { pos: { x: 300, y: 850 }, leftAt: now - LIMITS.leaverMemoryMs + 29_999 } });
    kept['b']!.pos.x = 0;
    expect(room.leaversNow()['b']!.pos.x).toBe(300);
    // A room made again (an empty nest let go, the object woken) knows them from what was kept.
    const again = new Room(def, { now: () => now, random: () => 0.5, cap: 3 });
    again.join(new FakePeer(), 'c', hello());
    again.restoreLeavers({
      ...room.leaversNow(),
      c: { pos: { x: 1400, y: 850 }, leftAt: now - 1_000 }, // in the room now: its own counts
      d: { pos: { x: 1400, y: 850 }, leftAt: now - LIMITS.leaverMemoryMs - 1 }, // too long ago
    });
    expect(Object.keys(again.leaversNow())).toEqual(['b']);
    // The newer of two records stands, whichever side has it.
    again.restoreLeavers({ b: { pos: { x: 900, y: 850 }, leftAt: now - 100_000 } });
    expect(again.leaversNow()['b']!.pos).toEqual({ x: 300, y: 850 });
    again.restoreLeavers({ b: { pos: { x: 280, y: 850 }, leftAt: now - 80_000 } });
    expect(again.leaversNow()['b']!.pos).toEqual({ x: 280, y: 850 });
    const back = new FakePeer();
    again.join(back, 'b', hello({ pos: { x: 320, y: 840 } }));
    expect(back.last('welcome')!.you.pos).toEqual({ x: 320, y: 840 });
    expect(again.leaversNow()).toEqual({});
    // Without them it would have been a stranger far from the spawn.
    const stranger = new FakePeer();
    new Room(def, { now: () => now, random: () => 0.5, cap: 3 }).join(stranger, 'b', hello({ pos: { x: 320, y: 840 } }));
    expect(stranger.last('welcome')!.you.pos).not.toEqual({ x: 320, y: 840 });
  });

  it('does not honour a resume position far from the spawn for a stranger', () => {
    const a = new FakePeer();
    room.join(a, 'a', hello({ pos: { x: 1400, y: 850 } }));
    const p = a.last('welcome')!.you.pos;
    expect(Math.hypot(p.x - 800, p.y - 700)).toBeLessThanOrEqual(LIMITS.scatterDefault * 1.5);
  });

  it('lets a stranger in near the spawn where its copy can walk straight to where its page has it (OP-138)', () => {
    // A page that walked off across the hub before it joined: the room will not have it there, and
    // from some spots near the spawn the straight walk east meets the pillar beside the glass arch.
    const hubDef = ROOMS['hub']!;
    const spawn = hubDef.spawns['default']!;
    const there = { x: 3400, y: 780 };
    for (let s = 1; s <= 200; s++) {
      let seed = s;
      const random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const a = new FakePeer();
      new Room(hubDef, { now: () => now, random, cap: 50 }).join(a, 'a', hello({ pos: there }));
      const pos = a.last('welcome')!.you.pos;
      expect(Math.hypot(pos.x - spawn.x, pos.y - spawn.y)).toBeLessThanOrEqual(LIMITS.scatterDefault * 1.5);
      expect(distance(resolveTarget(pos, there, hubDef.walkable), there)).toBeLessThan(3);
    }
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

  // One step into a jump, as the page sends it (OP-084).
  const up: Air = { z: 7.2, vz: 858.3, s: AIRBORNE, f: 1 };

  it('relays an owl’s air to the others on the room’s clock, shows a newcomer an owl still up, and wakes a sleeper that jumps (OP-084)', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    const at = room.positionOf('a');
    room.rest('a', true);
    expect(room.air('a', up)).toBe(true);
    // Awake first, for everyone, then up.
    expect(b.frames.slice(-2)).toEqual([
      { t: 'rest', id: 'a', asleep: false },
      { t: 'air', id: 'a', air: up, at: now },
    ]);
    expect(a.count('air')).toBe(0); // its own page flies it
    expect(a.persisted.at(-1)?.air).toEqual({ ...up, at: now });
    // Flight is a height over the floor: the owl's spot in the room is where it was.
    expect(room.positionOf('a')).toEqual(at);
    // A newcomer a moment later is told the state and when, to carry it on from there.
    const told = now;
    now += 200;
    const c = new FakePeer();
    room.join(c, 'c', hello());
    const owls = c.last('welcome')!.owls;
    expect(owls.find((o) => o.id === 'a')?.air).toEqual({ ...up, at: told });
    expect(owls.find((o) => o.id === 'b')?.air).toBeUndefined();
    // Down by now: the landing is never sent (every page reckons it), and the room has the owl on the ground.
    now += 3000;
    expect(room.snapshot().find((o) => o.id === 'a')?.air).toBeUndefined();
    // Up again, then told it is on the ground (the page put it there): the same.
    expect(room.air('a', up)).toBe(true);
    expect(room.air('a', ON_GROUND)).toBe(true);
    expect(b.last('air')).toEqual({ t: 'air', id: 'a', air: ON_GROUND, at: now });
    expect(room.snapshot().find((o) => o.id === 'a')?.air).toBeUndefined();
    expect(room.air('nobody', up)).toBe(false);
  });

  it('drops air it cannot believe, and air past the allowance, closing only a page that floods (OP-084)', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    // Above the room's top, on the ground in mid-air, a mode it does not know.
    for (const bad of [
      { z: LIMITS.maxAirZ + 1, vz: 0, s: AIRBORNE, f: 1 },
      { z: 30, vz: 0, s: GROUNDED, f: 0 },
      { z: 30, vz: 0, s: 7, f: 0 },
    ]) {
      expect(room.air('a', bad as Air)).toBe(false);
    }
    expect(b.count('air')).toBe(0);
    // Each frame spends the allowance; past it they are dropped quietly, and it comes back with time.
    for (let i = 3; i < LIMITS.airBurst; i++) expect(room.air('a', up)).toBe(true);
    expect(room.air('a', up)).toBe(false);
    expect(a.closed).toBeNull();
    now += 1000 / LIMITS.airRefillPerS;
    expect(room.air('a', up)).toBe(true);
    expect(b.count('air')).toBe(LIMITS.airBurst - 3 + 1);
    // Only the dropped ones count towards the flood, which closes the socket.
    let dropped = 1;
    while (!a.closed && dropped <= 100) {
      room.air('a', up);
      dropped++;
    }
    expect(a.closed).toEqual({ code: CLOSE.RATE_LIMITED, reason: 'too many frames' });
    expect(dropped).toBe(LIMITS.framesPerWindow + 1);
  });

  it('relays a phrase’s number to the others, one phrase every three seconds per owl', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    expect(room.say('a', 3)).toBe(true);
    expect(b.last('say')).toEqual({ t: 'say', id: 'a', n: 3 });
    expect(a.count('say')).toBe(0); // the sender shows its own bubble
    // Too soon: dropped, and the next owl's phrases are its own business.
    now += LIMITS.sayEveryMs - 1;
    expect(room.say('a', 1)).toBe(false);
    expect(room.say('b', 1)).toBe(true);
    now += 1;
    expect(room.say('a', 24)).toBe(true);
    expect(b.count('say')).toBe(2);
    expect(LIMITS.sayEveryMs).toBe(3000);
  });

  it('drops a phrase the list does not have, and says nothing for a visitor who is not here', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    for (const n of [0, 25, 999, -1, 2.5]) expect(room.say('a', n), String(n)).toBe(false);
    expect(room.say('nobody', 1)).toBe(false);
    expect(b.count('say')).toBe(0);
    // A dropped number does not use up the owl's turn.
    expect(room.say('a', 2)).toBe(true);
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

  it("spaces out an owner's changes to its nest", () => {
    const a = new FakePeer();
    room.join(a, 'a', hello());
    expect(room.takeArrange('a')).toBe(true);
    expect(room.takeArrange('a')).toBe(false);
    now += LIMITS.arrangeEveryMs - 1;
    expect(room.takeArrange('a')).toBe(false);
    now += 1;
    expect(room.takeArrange('a')).toBe(true);
    expect(room.takeArrange('nobody')).toBe(false);
    // Its own cooldown: changing the nest does not spend a use, nor the other way round.
    expect(room.takeUse('a')).toBe(true);
    now += LIMITS.arrangeEveryMs;
    expect(room.takeArrange('a')).toBe(true);
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

describe('Room: the street and the nests', () => {
  const now = 3_000_000;
  const inRect = (p: Vec2, r: { x: number; y: number; w: number; h: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  it('never puts an arrival in a nest door, though a nest door has no `to`', () => {
    const doorway = { x: 700, y: 600, w: 200, h: 200 };
    const withNestDoor: RoomDef = { ...def, spawns: { default: { x: 650, y: 700 } }, doors: [{ id: 'nest-door-2', rect: doorway }] };
    const r = new Room(withNestDoor, { now: () => now, cap: 100 });
    for (let i = 0; i < 40; i++) {
      const p = new FakePeer();
      r.join(p, `v${i}`, hello(i % 2 ? { spawn: 'default' } : {}));
      expect(inRect(p.last('welcome')!.you.pos, doorway), `v${i}`).toBe(false);
    }
  });

  it("lands owls coming out of each nest on the street's floor, clear of every doorway", () => {
    const street = ROOMS[STREET_ROOM]!;
    const doorways = street.doors.filter((d) => d.to !== undefined || nestDoorIndex(d.id) !== null);
    expect(doorways.filter((d) => nestDoorIndex(d.id) !== null)).toHaveLength(STREET_DOORS);
    const r = new Room(street, { now: () => now, cap: 500 });
    for (let n = 0; n < STREET_DOORS; n++) {
      for (let i = 0; i < 30; i++) {
        const p = new FakePeer();
        r.join(p, `n${n}-${i}`, hello({ spawn: `from-nest-${n}` }));
        const pos = p.last('welcome')!.you.pos;
        expect(isWalkable(pos, street.walkable), `from-nest-${n}`).toBe(true);
        for (const d of doorways) expect(inRect(pos, d.rect), `from-nest-${n} in ${d.id}`).toBe(false);
      }
    }
  });

  it("welcomes owls to a nest under the nest's own room id, and lets its owner in however full it is", () => {
    const nest = roomFor('nest-k3x9q2ab')!;
    const r = new Room(nest, { now: () => now, cap: 2 });
    const peers = ['a', 'b'].map((id) => {
      const p = new FakePeer();
      expect(r.join(p, id, hello())).toBe('ok');
      return p;
    });
    expect(peers[0]!.last('welcome')!.room).toBe('nest-k3x9q2ab');
    expect(r.join(new FakePeer(), 'c', hello())).toBe('full');
    const owner = new FakePeer();
    expect(r.join(owner, 'owner', hello(), 's1', { overCap: true })).toBe('ok');
    expect(r.count).toBe(3);
    expect(owner.last('welcome')!.room).toBe('nest-k3x9q2ab');
    expect(peers[1]!.last('enter')!.owl.id).toBe('owner');
  });
});
