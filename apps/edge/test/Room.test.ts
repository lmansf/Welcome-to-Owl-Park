import { beforeEach, describe, expect, it } from 'vitest';
import { AIRBORNE, LIFTED, UPDRAFT_RISE, AIR_DASH_COOLDOWN_MS, AIR_DASH_DISTANCE, AIR_DASH_MS, AIR_DASH_SPEED, DASH_SLACK_PX, CLOSE, EDGE_PROTOCOL_VERSION, EMOTE_EVERY_MS, GROUNDED, ON_GROUND, STREET_DOORS, STREET_ROOM, WALK_SPEED, arrivalPoint, distance, isWalkable, nestDoorIndex, resolveTarget, type Air, type ClientHello, type RoomDef, type ServerFrame, type Vec2 } from '@owl-park/shared';
import { ROOMS, roomFor } from '@owl-park/shared/rooms';
import { Room, LIMITS, type Peer, type PositionRejection, type VisitorState } from '../src/Room';

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

  it('lets spectators in only below their share of the cap, ticket holders up to the cap, and says so in the welcome (OP-191)', () => {
    const r = new Room(def, { now: () => now, cap: 4, spectatorLimit: 2, counts: () => ({}) });
    expect(r.spectatorLimit).toBe(2);
    const a = new FakePeer();
    expect(r.join(a, 'a', hello(), 'sa', { spectator: true })).toBe('ok');
    expect(a.last('welcome')?.spectator).toBe(true);
    expect(r.join(new FakePeer(), 'b', hello(), 'sb')).toBe('ok');
    // Two owls in: no more spectators, though there is room for ticket holders.
    expect(r.join(new FakePeer(), 'c', hello(), 'sc', { spectator: true })).toBe('full');
    const d = new FakePeer();
    expect(r.join(d, 'd', hello(), 'sd')).toBe('ok');
    expect(d.last('welcome')?.spectator).toBeUndefined();
    // A spectator back on a new socket replaces its own owl, however full.
    expect(r.join(new FakePeer(), 'a', hello(), 'sa2', { spectator: true })).toBe('ok');
    expect(r.join(new FakePeer(), 'e', hello(), 'se')).toBe('ok');
    expect(r.join(new FakePeer(), 'f', hello(), 'sf')).toBe('full');
    // Nobody inside is sent out, and a limit above the cap is the cap.
    expect(r.count).toBe(4);
    expect(new Room(def, { now: () => now, cap: 3, spectatorLimit: 9 }).spectatorLimit).toBe(3);
    expect(new Room(def, { now: () => now, cap: 3 }).spectatorLimit).toBe(3);
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

describe('Room: where an owl is, is the room’s, whatever its page says (OP-149)', () => {
  let now = 1_000_000;
  let said: Array<{ id: string; why: PositionRejection }>;
  let room: Room;
  // The fixture room with a bench along its back wall (its front face over the floor's back edge).
  const withBench: RoomDef = { ...def, perches: [{ id: 'bench', area: [{ x: 300, y: 440 }, { x: 600, y: 440 }, { x: 600, y: 520 }, { x: 300, y: 520 }], top: 80, solid: true }] };
  const standing = { z: 80, vz: 0, s: GROUNDED, f: 0 } as const;
  beforeEach(() => {
    now = 1_000_000;
    said = [];
    room = new Room(withBench, { now: () => now, random: () => 0.5, cap: 5, rejected: (id, why) => said.push({ id, why }) });
  });

  it('walks an owl from where the room has it, at a walk: an ask to go far is a walk there, however often it is asked', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    const start = room.positionOf('a')!;
    room.move('a', { t: 'move', to: { x: 1450, y: 860 }, seq: 1 }); // across the room in one ask
    expect(b.last('move')).toMatchObject({ from: start, to: { x: 1450, y: 860 }, at: now });
    now += 100;
    expect(distance(room.positionOf('a')!, start)).toBeLessThanOrEqual(WALK_SPEED * 0.1 + 1);
    // Asked again and again on the way, each walk starts where the room has the owl by then.
    for (let i = 2; i <= 5; i++) {
      now += 200;
      const here = room.positionOf('a')!;
      room.move('a', { t: 'move', to: { x: 1450 - i * 10, y: 860 }, seq: i });
      expect(b.last('move')!.from).toEqual(here);
    }
    now += 200;
    expect(distance(room.positionOf('a')!, start)).toBeLessThanOrEqual(WALK_SPEED * 1.1 + 1);
    expect(said).toEqual([]);
  });

  it('drops a walk to a point outside the room, says so, and closes a page that keeps asking for one', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    const start = room.positionOf('a');
    room.move('a', { t: 'move', to: { x: def.size.w + 400, y: 700 }, seq: 1 });
    expect(a.count('move') + b.count('move')).toBe(0);
    expect(said).toEqual([{ id: 'a', why: 'room' }]);
    expect(a.closed).toBeNull();
    room.move('a', { t: 'move', to: { x: 700, y: def.size.h + 1 }, seq: 2 });
    room.move('a', { t: 'move', to: { x: 6000, y: 1700 }, seq: 3 });
    expect(a.closed).toEqual({ code: CLOSE.RATE_LIMITED, reason: 'too many moves' });
    expect(a.count('move') + b.count('move')).toBe(0);
    expect(room.positionOf('a')).toEqual(start);
  });

  it('walks a walk aimed off every floor as far as the floor goes, and says so; a walk on the floor, or onto a perch, says nothing', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    room.move('a', { t: 'move', to: { x: 1200, y: 100 }, seq: 1 }); // into the sky, over the floor's back edge
    expect(b.last('move')!.to).toEqual({ x: 1200, y: 500 });
    expect(said).toEqual([{ id: 'a', why: 'floor' }]);
    room.move('a', { t: 'move', to: { x: 1000, y: 600 }, seq: 2 });
    room.move('a', { t: 'move', to: { x: 450, y: 470 }, seq: 3 }); // the bench's top
    room.move('a', { t: 'move', to: { x: 100, y: 880 }, seq: 4 }); // the floor's corner
    expect(said).toHaveLength(1);
  });

  it('keeps an owl standing up on a perch only where that perch is: under it, or by it on the rest of its walk', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    // By the spawn, far from the bench: 80 px up there is standing in mid-air.
    expect(room.air('a', standing)).toBe(false);
    expect(b.count('air')).toBe(0);
    expect(said).toEqual([{ id: 'a', why: 'perch' }]);
    // Under way to the bench, its page a moment ahead and up on it already, the room's copy short of it still.
    room.move('a', { t: 'move', to: { x: 450, y: 480 }, seq: 1 });
    now += 300;
    expect(room.air('a', standing)).toBe(true);
    expect(b.last('air')!.air).toEqual(standing);
    // Arrived, on its top: up there for a newcomer too.
    now += 5000;
    expect(room.air('a', standing)).toBe(true);
    expect(room.snapshot().find((o) => o.id === 'a')?.air).toMatchObject(standing);
    // A step off its front edge, as the room has it a moment behind: still up there; far off, not.
    room.move('a', { t: 'move', to: { x: 450, y: 520 + LIMITS.perchReachPx - 4 }, seq: 2 });
    now += 5000;
    expect(room.air('a', standing)).toBe(true);
    room.move('a', { t: 'move', to: { x: 1200, y: 800 }, seq: 3 });
    now += 5000;
    expect(room.air('a', standing)).toBe(false);
    expect(said.map((s) => s.why)).toEqual(['perch', 'perch']);
  });

  it('lets an owl in by its spawn when its page says it is far from there, says so, and shows the others only where the room has it', () => {
    const a = new FakePeer();
    const others = new FakePeer();
    room.join(others, 'o', hello({ pos: { x: 1000, y: 600 } })); // near the spawn: taken, nothing said
    expect(others.last('welcome')!.you.pos).toEqual({ x: 1000, y: 600 });
    expect(said).toEqual([]);
    room.join(a, 'a', hello({ pos: { x: 1400, y: 850 } }));
    const pos = a.last('welcome')!.you.pos;
    expect(distance(pos, { x: 1400, y: 850 })).toBeGreaterThan(LIMITS.resumeRadius);
    expect(others.last('enter')!.owl.pos).toEqual(pos);
    expect(said).toEqual([{ id: 'a', why: 'arrival' }]);
    // Off every floor (the room's top corner): by the spawn too.
    const c = new FakePeer();
    room.join(c, 'c', hello({ pos: { x: 10, y: 10 } }));
    expect(distance(c.last('welcome')!.you.pos, withBench.spawns['default']!)).toBeLessThanOrEqual(LIMITS.scatterDefault * 1.5);
    expect(said.at(-1)).toEqual({ id: 'c', why: 'arrival' });
  });

  it('takes nothing more from an owl that has left, as for a page changing rooms', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello(), 's0');
    room.join(b, 'b', hello());
    room.leave('a', 's0');
    const seen = b.frames.length;
    room.move('a', { t: 'move', to: { x: 1000, y: 700 }, seq: 9 });
    expect(room.air('a', { z: 30, vz: 100, s: AIRBORNE, f: 1 })).toBe(false);
    expect(b.frames.length).toBe(seen);
    expect(said).toEqual([]);
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

  it('spaces emotes by the shared EMOTE_EVERY_MS, the spacing the page keeps to (OP-210)', () => {
    expect(LIMITS.emoteEveryMs).toBe(EMOTE_EVERY_MS);
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
      { z: LIMITS.maxRise + 1, vz: 0, s: AIRBORNE, f: 1 },
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

  it('takes the triple jump: two flaps left after the jump, then one, then none, as high as both flaps go and never a fourth (OP-239)', () => {
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    // The allowance covers a jump and both flaps above the room's highest top (the floor here).
    expect(LIMITS.maxRise).toBeGreaterThan(371);
    for (const air of [
      { z: 7.2, vz: 858.3, s: AIRBORNE, f: 2 },
      { z: 149, vz: 760, s: AIRBORNE, f: 1 },
      { z: 260, vz: 760, s: AIRBORNE, f: 0 },
      { z: 370, vz: -10, s: AIRBORNE, f: 0 },
    ] as Air[]) {
      expect(room.air('a', air), JSON.stringify(air)).toBe(true);
      now += 100;
    }
    expect(b.count('air')).toBe(4);
    expect(b.last('air')!.air).toEqual({ z: 370, vz: -10, s: AIRBORNE, f: 0 });
    // A fourth take-off's worth of flaps, and a height past every flap, are dropped.
    expect(room.air('a', { z: 30, vz: 100, s: AIRBORNE, f: 3 } as unknown as Air)).toBe(false);
    expect(room.air('a', { z: LIMITS.maxRise + 1, vz: -10, s: AIRBORNE, f: 0 })).toBe(false);
    expect(b.count('air')).toBe(4);
  });

  it('believes an owl standing anywhere along a slope where it is, and refuses one off the slope (OP-238)', () => {
    // The fixture room with a hill across the middle of its floor: up gently 80 over 320, down again.
    const hilly: RoomDef = {
      ...def,
      perches: [
        {
          id: 'hill',
          area: [{ x: 300, y: 700 }, { x: 940, y: 700 }, { x: 940, y: 900 }, { x: 300, y: 900 }],
          top: 80,
          solid: true,
          profile: [{ x: 300, top: 0 }, { x: 620, top: 80 }, { x: 940, top: 0 }],
        },
      ],
    };
    const r = new Room(hilly, { now: () => now, random: () => 0.5, cap: 3 });
    const a = new FakePeer();
    const b = new FakePeer();
    r.join(a, 'a', hello({ pos: { x: 460, y: 800 } }), 's0');
    r.join(b, 'b', hello());
    // Half way up the slope, standing at its height there: believed, and told.
    expect(r.air('a', { z: 40, vz: 0, s: GROUNDED, f: 0 })).toBe(true);
    expect(b.last('air')!.air).toEqual({ z: 40, vz: 0, s: GROUNDED, f: 0 });
    // Standing at a height along the hill's range but not its height here, or above all of it: refused.
    expect(r.air('a', { z: 78, vz: 0, s: GROUNDED, f: 0 })).toBe(false);
    expect(r.air('a', { z: 120, vz: 0, s: GROUNDED, f: 0 })).toBe(false);
  });

  it('keeps an owl standing on a perch up there, lets it walk and come back there, and believes its air to a jump above the highest (OP-084)', () => {
    // The fixture room with a bench along its back wall (its front face over the floor's back edge) and a beam above it.
    const withPerches: RoomDef = {
      ...def,
      perches: [
        { id: 'bench', area: [{ x: 300, y: 440 }, { x: 600, y: 440 }, { x: 600, y: 520 }, { x: 300, y: 520 }], top: 80, solid: true },
        { id: 'beam', area: [{ x: 320, y: 450 }, { x: 520, y: 450 }, { x: 520, y: 490 }, { x: 320, y: 490 }], top: 230 },
      ],
    };
    const perched = new Room(withPerches, { now: () => now, random: () => 0.5, cap: 3 });
    const a = new FakePeer();
    const b = new FakePeer();
    perched.join(a, 'a', hello(), 's0');
    perched.join(b, 'b', hello());
    // A walk onto the bench's top, off the floor: the page has the owl's height, so the room takes it.
    const onBench = { x: 400, y: 470 };
    perched.move('a', { t: 'move', to: onBench, seq: 1 });
    expect(a.last('move')!.to).toEqual(onBench);
    expect(b.last('move')!.to).toEqual(onBench);
    // Behind the wall is nowhere an owl can be, at any height.
    perched.move('a', { t: 'move', to: { x: 400, y: 300 }, seq: 2 });
    expect(a.last('move')!.to.y).toBeGreaterThanOrEqual(440);
    // Landed on it: told, kept, and told to a newcomer long after, as standing up there.
    now += 2000;
    const standing = { z: 80, vz: 0, s: GROUNDED, f: 0 } as const;
    expect(perched.air('a', standing)).toBe(true);
    expect(b.last('air')).toEqual({ t: 'air', id: 'a', air: standing, at: now });
    const told = now;
    now += 60_000;
    expect(perched.snapshot().find((o) => o.id === 'a')?.air).toEqual({ ...standing, at: told });
    // Standing on nothing at a height is refused; a jump and a flap above the beam is believed, and no higher.
    expect(perched.air('a', { z: 50, vz: 0, s: GROUNDED, f: 0 })).toBe(false);
    expect(perched.air('a', { z: 230 + LIMITS.maxRise, vz: -10, s: AIRBORNE, f: 0 })).toBe(true);
    expect(perched.air('a', { z: 231 + LIMITS.maxRise, vz: -10, s: AIRBORNE, f: 0 })).toBe(false);
    // Walked off its edge: in the air from up there, then down on the floor by the time a newcomer asks.
    expect(perched.air('a', { z: 80, vz: 0, s: AIRBORNE, f: 1 })).toBe(true);
    now += 3000;
    expect(perched.snapshot().find((o) => o.id === 'a')?.air).toBeUndefined();
    // Back on the bench, and back again after the connection drops: where it was, on the perch's top.
    perched.move('a', { t: 'move', to: onBench, seq: 3 });
    now += 5000;
    perched.leave('a', 's0', true);
    const a2 = new FakePeer();
    perched.join(a2, 'a', hello({ pos: onBench }), 's1');
    expect(a2.last('welcome')!.you.pos).toEqual(onBench);
  });

  it('reaches what sits up on a perch only from that perch, and what is on the floor only from the floor (OP-084)', () => {
    const withBench: RoomDef = { ...def, perches: [{ id: 'bench', area: [{ x: 300, y: 440 }, { x: 600, y: 440 }, { x: 600, y: 520 }, { x: 300, y: 520 }], top: 80, solid: true }] };
    const perched = new Room(withBench, { now: () => now, random: () => 0.5, cap: 3 });
    perched.join(new FakePeer(), 'a', hello());
    const onBench = { x: 400, y: 470 };
    const upThere = { top: 80 };
    perched.move('a', { t: 'move', to: onBench, seq: 1 });
    now += 5000;
    // There on the plan but not up: the ground under the owl is the floor, so the floor's things.
    expect(perched.groundOf('a')).toBe(0);
    expect(perched.reaches('a', onBench, 40, upThere)).toBe(false);
    expect(perched.reaches('a', onBench, 40, {})).toBe(true);
    // Landed up there: the bench's things, and not the floor's.
    expect(perched.air('a', { z: 80, vz: 0, s: GROUNDED, f: 0 })).toBe(true);
    expect(perched.groundOf('a')).toBe(80);
    expect(perched.reaches('a', onBench, 40, upThere)).toBe(true);
    expect(perched.reaches('a', onBench, 40, {})).toBe(false);
    // Along the bench out of reach is out of reach at any height.
    expect(perched.reaches('a', { x: 560, y: 470 }, 40, upThere)).toBe(false);
    // In the air above the bench, coming down on it: still the bench's.
    expect(perched.air('a', { z: 140, vz: 0, s: AIRBORNE, f: 0 })).toBe(true);
    expect(perched.groundOf('a')).toBe(80);
    expect(perched.groundOf('nobody')).toBe(0);
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

describe('Room: the dash, in a parkour course (OP-224)', () => {
  let now = 1_000_000;
  const refused: string[] = [];
  const rejected: PositionRejection[] = [];
  const make = (d: RoomDef) => new Room(d, { now: () => now, random: () => 0.5, cap: 5, rejected: (_id, why) => rejected.push(why), dashRefused: (_id, why) => refused.push(why) });
  const jump: Air = { z: 7.2, vz: 858.3, s: AIRBORNE, f: 1 };
  let seq = 0;
  beforeEach(() => {
    now = 1_000_000;
    refused.length = 0;
    rejected.length = 0;
    seq = 0;
  });
  const dash = (room: Room, to: Vec2) => room.dash('a', { t: 'dash', to, seq: ++seq });

  it('is the dash’s numbers: 900 px/s, 162 px, once a jump, 350 ms apart', () => {
    expect([AIR_DASH_SPEED, AIR_DASH_DISTANCE, AIR_DASH_COOLDOWN_MS]).toEqual([900, 162, 350]);
  });

  it('is refused outside a course, and the owl walks on as the room had it', () => {
    const room = make(def);
    const a = new FakePeer();
    room.join(a, 'a', hello());
    room.air('a', jump);
    const at = room.positionOf('a')!;
    dash(room, { x: at.x + 160, y: at.y });
    expect(refused).toEqual(['not-held']);
    expect(rejected).toEqual(['dash']);
    expect(a.last('move')).toMatchObject({ from: at, to: at, seq: 1 });
    expect(a.last('move')?.dash).toBeUndefined();
  });

  it('is refused on the ground, even in a course', () => {
    const room = make(ROOMS['trail-1']!);
    const a = new FakePeer();
    room.join(a, 'a', hello());
    const at = room.positionOf('a')!;
    dash(room, { x: at.x + 160, y: at.y });
    expect(refused).toEqual(['grounded']);
  });

  it('is taken in the air in a course: a walk at the dash’s pace, told to the others, and no further than a dash goes', () => {
    const room = make(ROOMS['trail-1']!);
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    const at = room.positionOf('a')!;
    room.air('a', jump);
    now += 50;
    dash(room, { x: at.x + 1000, y: at.y });
    expect(refused).toEqual([]);
    const told = b.last('move')!;
    expect(told).toMatchObject({ id: 'a', from: at, dash: true });
    expect(distance(told.from, told.to)).toBeLessThanOrEqual(AIR_DASH_DISTANCE + DASH_SLACK_PX);
    expect(told.to.x).toBeGreaterThan(at.x + AIR_DASH_DISTANCE - 1);
    expect(a.last('move')).toMatchObject({ seq: 1, dash: true });
    // Over in about AIR_DASH_MS (a little more for the slack): where the room has the owl then is the dash's end.
    now += AIR_DASH_MS + 50;
    expect(room.positionOf('a')).toEqual(told.to);
  });

  it('goes once a jump: a second dash in the same jump is refused, and the landing brings it back', () => {
    const room = make(ROOMS['trail-1']!);
    const a = new FakePeer();
    room.join(a, 'a', hello());
    const at = room.positionOf('a')!;
    room.air('a', jump);
    dash(room, { x: at.x + 100, y: at.y });
    now += AIR_DASH_COOLDOWN_MS + 10;
    // A flap, still up: the dash stays spent.
    room.air('a', { z: 80, vz: 500, s: AIRBORNE, f: 0 });
    dash(room, { x: at.x + 300, y: at.y });
    expect(refused).toEqual(['spent']);
    // Down (well after the jump), up again: the dash is back.
    now += 3000;
    room.air('a', jump);
    dash(room, { x: at.x + 400, y: at.y });
    expect(refused).toEqual(['spent']);
    expect(a.last('move')?.dash).toBe(true);
  });

  it('waits out the cooldown, however quick the landing and the next jump', () => {
    const room = make(ROOMS['trail-1']!);
    const a = new FakePeer();
    room.join(a, 'a', hello());
    const at = room.positionOf('a')!;
    room.air('a', jump);
    dash(room, { x: at.x + 100, y: at.y });
    now += 100;
    room.air('a', ON_GROUND);
    now += 50;
    room.air('a', jump);
    dash(room, { x: at.x, y: at.y + 100 });
    expect(refused).toEqual(['cooldown']);
  });

  it('puts an owl down where a fall takes it, standing, with its dash back', () => {
    const room = make(ROOMS['trail-1']!);
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    room.air('a', jump);
    const at = room.positionOf('a')!;
    dash(room, { x: at.x + 100, y: at.y });
    expect(room.place('a', { x: 340, y: 450 })).toBe(true);
    expect(room.positionOf('a')).toEqual({ x: 340, y: 450 });
    expect(b.last('move')).toMatchObject({ id: 'a', from: { x: 340, y: 450 }, to: { x: 340, y: 450 } });
    expect(room.place('a', { x: 10, y: 10 })).toBe(false);
    now += AIR_DASH_COOLDOWN_MS;
    room.air('a', jump);
    dash(room, { x: 500, y: 450 });
    expect(refused).toEqual([]);
  });

  it('puts an owl back up on a bench that stands on a ledge, and on the floor when no ledge is that high there', () => {
    const room = make(ROOMS['brush-1']!);
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    const bench = ROOMS['brush-1']!.course!.benches!.find((p) => p.id === 'bench-1')!;
    expect(room.place('a', bench.at, bench.top)).toBe(true);
    expect(b.last('air')).toMatchObject({ id: 'a', air: { z: 360, s: GROUNDED } });
    const frames = b.frames.length;
    // A height with no ledge under it is the floor, as a fall always was.
    expect(room.place('a', { x: 120, y: bench.at.y }, 360)).toBe(true);
    expect(b.frames.slice(frames).some((f) => f.t === 'air')).toBe(false);
  });
});

describe('Room: updrafts, in a room seen from the side (OP-226)', () => {
  let now = 1_000_000;
  const rejected: PositionRejection[] = [];
  beforeEach(() => {
    now = 1_000_000;
    rejected.length = 0;
  });

  it('takes a lifted owl only inside a column that is on, rising to its top, and tells the others', () => {
    const probe = new Room(def, { now: () => now, random: () => 0.5, cap: 5 });
    probe.join(new FakePeer(), 'p', hello());
    const x = probe.positionOf('p')!.x;
    // One column over where an owl comes in, always on; one that gusts for 3 s in 5, starting at park time 0 (1_000_000 is a whole number of cycles).
    const columns = { ...def, updrafts: [{ id: 'up', x: x - 60, w: 120, top: 300 }, { id: 'gust', x: x - 60, w: 120, top: 250, onMs: 3000, offMs: 2000 }] };
    const room = new Room(columns, { now: () => now, random: () => 0.5, cap: 5, rejected: (_id, why) => rejected.push(why) });
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    const lifted: Air = { z: 120, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 300 };
    expect(room.air('a', lifted)).toBe(true);
    expect(b.last('air')).toMatchObject({ id: 'a', air: lifted });
    // A top no column here has: refused.
    expect(room.air('a', { ...lifted, h: 280 })).toBe(false);
    expect(rejected).toEqual(['lift']);
    // The gust while it is on, and a moment after it drops; not once it has been off a while.
    now += 1000;
    expect(room.air('a', { ...lifted, h: 250 })).toBe(true);
    now += 2300;
    expect(room.air('a', { ...lifted, h: 250 })).toBe(true);
    now += 500;
    expect(room.air('a', { ...lifted, h: 250 })).toBe(false);
    expect(rejected).toEqual(['lift', 'lift']);
  });

  it('refuses a lifted owl in a room with no updrafts', () => {
    const room = new Room(def, { now: () => now, random: () => 0.5, cap: 5, rejected: (_id, why) => rejected.push(why) });
    room.join(new FakePeer(), 'a', hello());
    expect(room.air('a', { z: 120, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 300 })).toBe(false);
    expect(rejected).toEqual(['lift']);
  });
});

describe('Room: a thermal, in a room seen from above (OP-340)', () => {
  let now = 1_000_000;
  const rejected: PositionRejection[] = [];
  beforeEach(() => {
    now = 1_000_000;
    rejected.length = 0;
  });

  it('takes a lifted owl only inside the thermal, rising to its top, as high as it lifts and a jump over', () => {
    const probe = new Room(def, { now: () => now, random: () => 0.5, cap: 5 });
    probe.join(new FakePeer(), 'p', hello());
    const at = probe.positionOf('p')!;
    // Without a thermal the room holds its owls to a jump and its flaps over the floor.
    expect(probe.air('p', { z: 600, vz: 0, s: AIRBORNE, f: 0 })).toBe(false);

    // One over where an owl comes in, 900 high; another far across the room.
    const warm = { ...def, thermals: [{ id: 'heart', pos: { x: at.x, y: at.y }, r: 160, top: 900 }, { id: 'far', pos: { x: at.x + 1200, y: at.y }, r: 160, top: 500 }] };
    const room = new Room(warm, { now: () => now, random: () => 0.5, cap: 5, rejected: (_id, why) => rejected.push(why) });
    const a = new FakePeer();
    const b = new FakePeer();
    room.join(a, 'a', hello());
    room.join(b, 'b', hello());
    const lifted: Air = { z: 400, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 900 };
    expect(room.air('a', lifted)).toBe(true);
    expect(b.last('air')).toMatchObject({ id: 'a', air: lifted });
    // To the top, and a glide on from there: both as high as the thermal lifts.
    expect(room.air('a', { ...lifted, z: 900 })).toBe(true);
    expect(room.air('a', { z: 880, vz: -80, s: 2, f: 0 })).toBe(true);
    // A top this thermal has not (the far one's, which the owl is nowhere near): refused.
    expect(room.air('a', { ...lifted, h: 500 })).toBe(false);
    expect(rejected).toEqual(['lift']);
    // Higher than any thermal here lifts, and a jump and its flaps: no air state at all.
    expect(room.air('a', { z: 900 + 400, vz: 0, s: AIRBORNE, f: 0 })).toBe(false);
  });

  it('refuses a lifted owl that stands outside every thermal of the room', () => {
    const probe = new Room(def, { now: () => now, random: () => 0.5, cap: 5 });
    probe.join(new FakePeer(), 'p', hello());
    const at = probe.positionOf('p')!;
    const warm = { ...def, thermals: [{ id: 'far', pos: { x: at.x + 1200, y: at.y }, r: 160, top: 900 }] };
    const room = new Room(warm, { now: () => now, random: () => 0.5, cap: 5, rejected: (_id, why) => rejected.push(why) });
    room.join(new FakePeer(), 'a', hello());
    expect(room.air('a', { z: 120, vz: UPDRAFT_RISE, s: LIFTED, f: 0, h: 900 })).toBe(false);
    expect(rejected).toEqual(['lift']);
  });
});

describe('no walk ends on top of another owl (OP-248)', () => {
  let now = 1_000_000;
  let room: Room;
  let seq = 0;
  const peers = new Map<string, FakePeer>();
  beforeEach(() => {
    now = 1_000_000;
    seq = 0;
    peers.clear();
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    room = new Room(def, { now: () => now, random, cap: 20 });
  });
  const join = (id: string) => {
    const p = new FakePeer();
    peers.set(id, p);
    room.join(p, id, hello());
    return p;
  };
  /** Send a walk and let it finish; returns where the room said it ends. */
  const walk = (id: string, to: Vec2, finish = true) => {
    room.move(id, { t: 'move', to, seq: ++seq });
    const end = peers.get(id)!.last('move')!;
    if (finish) now += 60_000;
    return end;
  };
  /** An owl standing at exactly `at`, far from where any other owl stands. */
  const standing = (id: string, at: Vec2) => {
    join(id);
    expect(walk(id, at).to).toEqual(at);
  };
  const gap = LIMITS.minSpacingPx;

  it('a walk aimed dead on a standing owl ends just beside them, on the side it came from', () => {
    standing('a', { x: 800, y: 700 });
    standing('b', { x: 400, y: 700 });
    const echo = walk('b', { x: 800, y: 700 });
    expect(distance(echo.to, { x: 800, y: 700 })).toBeGreaterThanOrEqual(gap);
    expect(distance(echo.to, { x: 800, y: 700 })).toBeLessThanOrEqual(gap + LIMITS.spacingSlackPx + 1);
    expect(echo.to.x).toBeLessThan(800); // short of them, on the walker's side
    expect(echo.seq).toBe(seq);
    // Everyone else is told the same spot, and the room has the owl there once it arrives.
    expect(peers.get('a')!.last('move')!.to).toEqual(echo.to);
    expect(room.positionOf('b')).toEqual(echo.to);
  });

  it('a walk aimed a little off another owl ends just outside them on the side it was aimed at', () => {
    standing('a', { x: 800, y: 700 });
    standing('b', { x: 400, y: 600 });
    const aim = { x: 800, y: 712 }; // just below them, from the walker's left
    const end = walk('b', aim).to;
    expect(distance(end, { x: 800, y: 700 })).toBeGreaterThanOrEqual(gap);
    expect(end.y).toBeGreaterThan(700);
    expect(distance(end, aim)).toBeLessThan(gap);
  });

  it('a walk aimed just past another owl ends past them, not short of them', () => {
    standing('a', { x: 800, y: 700 });
    standing('b', { x: 400, y: 700 });
    const end = walk('b', { x: 812, y: 700 }).to;
    expect(end.x).toBeGreaterThanOrEqual(800 + gap);
  });

  it('counts where a walking owl will stop, not where it is on the way', () => {
    standing('a', { x: 300, y: 700 });
    standing('b', { x: 1200, y: 700 });
    walk('a', { x: 800, y: 700 }, false); // under way, still far from its end
    const end = walk('b', { x: 800, y: 700 }).to;
    expect(distance(end, { x: 800, y: 700 })).toBeGreaterThanOrEqual(gap);
    expect(end.x).toBeGreaterThan(800);
  });

  it('lets a walk end where another owl only was, once it has walked off', () => {
    standing('a', { x: 800, y: 700 });
    standing('b', { x: 400, y: 700 });
    walk('a', { x: 1300, y: 700 }, false); // leaving: its walk ends far away
    expect(walk('b', { x: 800, y: 700 }).to).toEqual({ x: 800, y: 700 });
  });

  it('keeps the spot beside them on the floor when the side it was aimed at is off it', () => {
    standing('a', { x: 800, y: 505 }); // at the top edge of the floor
    standing('b', { x: 800, y: 800 });
    const end = walk('b', { x: 800, y: 480 }).to; // past them, off the floor
    expect(isWalkable(end, def.walkable)).toBe(true);
    expect(distance(end, { x: 800, y: 505 })).toBeGreaterThanOrEqual(gap);
  });

  it('finds a free side when the nearest spot beside them is taken by a third owl', () => {
    standing('a', { x: 800, y: 700 });
    standing('c', { x: 800 - gap - LIMITS.spacingSlackPx, y: 700 }); // right where a walk from the left would stop
    standing('b', { x: 400, y: 700 });
    const end = walk('b', { x: 800, y: 700 }).to;
    expect(end.y).toBeLessThan(700); // the next side round from the walker's, the same one every time
    for (const id of ['a', 'c']) {
      const at = room.positionOf(id)!;
      expect(distance(end, at)).toBeGreaterThanOrEqual(gap);
    }
  });

  it('an owl already beside another owl that aims onto them stays put, and its page is told so', () => {
    standing('a', { x: 800, y: 700 });
    standing('b', { x: 400, y: 700 });
    const beside = walk('b', { x: 800, y: 700 }).to;
    const echo = walk('b', { x: 800, y: 700 });
    expect(echo.from).toEqual(beside);
    expect(echo.to).toEqual(beside);
    expect(echo.seq).toBe(seq);
  });

  it('with no free spot reachable beside them, a walk ends where it was aimed, as before', () => {
    const box: RoomDef = { ...def, walkable: [[{ x: 785, y: 685 }, { x: 815, y: 685 }, { x: 815, y: 715 }, { x: 785, y: 715 }]], spawns: { default: { x: 800, y: 700 } } };
    room = new Room(box, { now: () => now, random: () => 0.5, cap: 20 });
    join('a');
    join('b');
    walk('a', { x: 800, y: 700 });
    expect(walk('b', { x: 787, y: 687 }).to).toEqual({ x: 787, y: 687 });
    expect(walk('b', { x: 800, y: 700 }).to).toEqual({ x: 800, y: 700 });
  });

  it('leaves a walk aimed near nobody exactly as it was aimed', () => {
    standing('a', { x: 800, y: 700 });
    standing('b', { x: 400, y: 700 });
    expect(walk('b', { x: 800 - gap - 10, y: 700 }).to).toEqual({ x: 800 - gap - 10, y: 700 });
    expect(walk('b', { x: 800 - gap, y: 700 }).to).toEqual({ x: 800 - gap, y: 700 }); // the spacing itself is clear
  });
});
