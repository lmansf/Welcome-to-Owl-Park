import { describe, expect, it } from 'vitest';
import { EDGE_PROTOCOL_VERSION, TAG_COUNTDOWN_MS, TAG_REACH, TAG_RING, TAG_ROUND_MS, TAG_REST_MS, TAG_STANDIN, TAG_STANDIN_HOLD_MS, TAG_ROOM, TAG_STANDIN_WAIT_MS, standInAt, tagAt, type ClientHello, type ServerFrame, type Vec2 } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { Room, type Peer } from '../src/Room';

/**
 * Feather tag in the Great Hollow on the room server (OP-403, D5; the Party Grove's until Nov 19): the room lets an owl into the game only
 * standing in the tag ring, passes the feather only from its holder to an owl it touches in the ring,
 * tells everyone each change, and takes an owl out of the game when it leaves the room. Its rules are
 * packages/shared/src/party/tag.test.ts; the park's side is apps/park/e2e/tag.spec.ts.
 */
class FakePeer implements Peer {
  frames: ServerFrame[] = [];
  send(text: string) {
    this.frames.push(JSON.parse(text));
  }
  close() {}
  tags() {
    return this.frames.filter((f): f is Extract<ServerFrame, { t: 'tag' }> => f.t === 'tag');
  }
  lastTag() {
    return this.tags().at(-1);
  }
}

const look = { body: '#111111', belly: '#222222', accent: '#333333' };
const hello = (pos: Vec2): ClientHello => ({ t: 'hello', v: EDGE_PROTOCOL_VERSION, look, spawn: 'default', pos });

const IN_A = { x: TAG_RING.x - 40, y: TAG_RING.y };
const IN_B = { x: TAG_RING.x + 40, y: TAG_RING.y };
const IN_C = { x: TAG_RING.x + 40 + TAG_REACH + 120, y: TAG_RING.y };
const OUT = { ...ROOMS[TAG_ROOM]!.spawns['default']! };

function hollow() {
  let now = 5_000_000;
  const room = new Room(ROOMS[TAG_ROOM]!, { now: () => now, random: () => 0, cap: 80 });
  const owl = (id: string, at: Vec2) => {
    const p = new FakePeer();
    expect(room.join(p, id, hello(OUT))).toBe('ok');
    // Put down where the test wants it (as a fall in a course is), standing on the hollow's floor.
    expect(room.place(id, at)).toBe(true);
    expect(room.positionOf(id)).toEqual(at);
    return p;
  };
  return { room, owl, tick: (ms: number) => (now += ms), now: () => now };
}

describe('feather tag on the room server (OP-403)', () => {
  it('lets an owl in only standing in the ring, and starts the countdown with two', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    const b = g.owl('b', IN_B);
    const out = g.owl('o', OUT);
    g.room.tag('o', { t: 'tag', op: 'join' });
    expect(out.lastTag()).toMatchObject({ refused: 'far' });
    expect(g.room.tagNow()).toBeNull();
    g.room.tag('a', { t: 'tag', op: 'join' });
    expect(out.lastTag()?.tag.players).toEqual(['a']);
    g.room.tag('b', { t: 'tag', op: 'join' });
    const seen = a.lastTag()!.tag;
    expect(seen).toMatchObject({ players: ['a', 'b'], holder: 'a', round: 1, startsAt: g.now() + TAG_COUNTDOWN_MS });
    expect(b.lastTag()?.tag).toEqual(seen);
    expect(out.lastTag()?.tag).toEqual(seen);
  });

  it('passes the feather when its holder touches another owl in the ring, and not from afar or before the round', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.owl('c', IN_C);
    for (const id of ['a', 'b', 'c']) g.room.tag(id, { t: 'tag', op: 'join' });
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'b' });
    expect(a.lastTag()).toMatchObject({ refused: 'not-live' });
    g.tick(TAG_COUNTDOWN_MS);
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'c' });
    expect(a.lastTag()).toMatchObject({ refused: 'far' });
    g.room.tag('b', { t: 'tag', op: 'pass', at: 'a' });
    expect(g.room.tagNow()?.holder).toBe('a');
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'b' });
    expect(g.room.tagNow()).toMatchObject({ holder: 'b', from: 'a' });
    // Straight back is refused.
    g.room.tag('b', { t: 'tag', op: 'pass', at: 'a' });
    expect(g.room.tagNow()?.holder).toBe('b');
  });

  it('leaves the holder at the end holding it, by the clock, and starts the next round with them', () => {
    const g = hollow();
    g.owl('a', IN_A);
    const b = g.owl('b', IN_B);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.room.tag('b', { t: 'tag', op: 'join' });
    g.tick(TAG_COUNTDOWN_MS + TAG_ROUND_MS + TAG_REST_MS);
    g.room.tag('b', { t: 'tag', op: 'view' });
    expect(b.lastTag()?.tag).toMatchObject({ round: 2, holder: 'a', left: 'a' });
  });

  it('takes an owl out of the game when it leaves the room, and stops the round below two', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.room.tag('b', { t: 'tag', op: 'join' });
    g.room.leave('b');
    expect(a.lastTag()?.tag).toMatchObject({ players: ['a'], holder: null, startsAt: 0 });
  });

  it('plays only in the Great Hollow: no longer in the Party Grove, nor anywhere else', () => {
    let now = 1;
    for (const id of ['hub', 'grove']) {
      const room = new Room(ROOMS[id]!, { now: () => now, cap: 80 });
      const p = new FakePeer();
      room.join(p, 'a', { t: 'hello', v: EDGE_PROTOCOL_VERSION, look });
      expect(room.tag('a', { t: 'tag', op: 'view' })).toBe(false);
      expect(p.tags()).toEqual([]);
    }
    const room = new Room(ROOMS['grove']!, { now: () => now, cap: 80 });
    const p = new FakePeer();
    room.join(p, 'a', { t: 'hello', v: EDGE_PROTOCOL_VERSION, look });
    expect(room.tag('a', { t: 'tag', op: 'view' })).toBe(false);
    expect(p.tags()).toEqual([]);
    now += 1;
  });
});

describe('Pip stands in on the room server (OP-426)', () => {
  it('steps in for an owl alone in the ring a few seconds, and not sooner, nor for an owl outside it or with company', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.owl('o', OUT);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.tick(TAG_STANDIN_WAIT_MS - 1000);
    g.room.tag('a', { t: 'tag', op: 'standin' });
    expect(a.lastTag()).toMatchObject({ refused: 'early' });
    g.room.tag('o', { t: 'tag', op: 'standin' });
    expect(g.room.tagNow()?.players).toEqual(['a']);
    g.tick(1000);
    g.room.tag('a', { t: 'tag', op: 'standin' });
    expect(g.room.tagNow()).toMatchObject({ players: ['a', TAG_STANDIN], holder: 'a', round: 1 });
    // Everyone here is told: the other page draws Pip in the ring too.
    expect(a.lastTag()?.tag.players).toEqual(['a', TAG_STANDIN]);
  });

  it('lets the owl catch Pip where the clock has Pip, gives the feather back by itself, and lets go when the owl leaves', () => {
    const g = hollow();
    g.owl('a', IN_A);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.tick(TAG_STANDIN_WAIT_MS);
    g.room.tag('a', { t: 'tag', op: 'standin' });
    g.tick(TAG_COUNTDOWN_MS + 1500);
    // Away from Pip: no pass. Then put right beside Pip: the feather goes.
    const pip = standInAt(g.room.tagNow()!, g.now());
    g.room.place('a', { x: TAG_RING.x - (pip.x - TAG_RING.x), y: TAG_RING.y - (pip.y - TAG_RING.y) });
    g.room.tag('a', { t: 'tag', op: 'pass', at: TAG_STANDIN });
    expect(g.room.tagNow()?.holder).toBe('a');
    g.room.place('a', { x: pip.x + 20, y: pip.y });
    g.room.tag('a', { t: 'tag', op: 'pass', at: TAG_STANDIN });
    expect(g.room.tagNow()?.holder).toBe(TAG_STANDIN);
    g.tick(TAG_STANDIN_HOLD_MS);
    g.room.tag('a', { t: 'tag', op: 'view' });
    // Read on the clock, as every page reads it: back with the owl.
    expect(g.room.tagNow()).toBeTruthy();
    expect(tagAt(g.room.tagNow()!, g.now()).holder).toBe('a');
    g.room.tag('a', { t: 'tag', op: 'leave' });
    expect(g.room.tagNow()?.players).toEqual([]);
  });

  it('plays out the round when a second owl steps in, then steps out', () => {
    const g = hollow();
    g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.room.place('b', OUT);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.tick(TAG_STANDIN_WAIT_MS);
    g.room.tag('a', { t: 'tag', op: 'standin' });
    g.room.place('b', IN_B);
    g.room.tag('b', { t: 'tag', op: 'join' });
    expect(g.room.tagNow()?.players).toEqual(['a', TAG_STANDIN, 'b']);
    g.tick(TAG_COUNTDOWN_MS + TAG_ROUND_MS + TAG_REST_MS);
    g.room.tag('b', { t: 'tag', op: 'view' });
    expect(tagAt(g.room.tagNow()!, g.now()).players).toEqual(['a', 'b']);
  });
});
