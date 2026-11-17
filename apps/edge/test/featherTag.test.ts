import { describe, expect, it } from 'vitest';
import { EDGE_PROTOCOL_VERSION, TAG_COUNTDOWN_MS, TAG_REACH, TAG_RING, TAG_ROUND_MS, TAG_REST_MS, type ClientHello, type ServerFrame, type Vec2 } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { Room, type Peer } from '../src/Room';

/**
 * Feather tag in the Party Grove on the room server (OP-403, D5): the room lets an owl into the game only
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
const OUT = { ...ROOMS['hub']!.spawns['default']! };

function grove() {
  let now = 5_000_000;
  const room = new Room(ROOMS['hub']!, { now: () => now, random: () => 0, cap: 80 });
  const owl = (id: string, at: Vec2) => {
    const p = new FakePeer();
    expect(room.join(p, id, hello(OUT))).toBe('ok');
    // Put down where the test wants it (as a fall in a course is), standing on the plaza's floor.
    expect(room.place(id, at)).toBe(true);
    expect(room.positionOf(id)).toEqual(at);
    return p;
  };
  return { room, owl, tick: (ms: number) => (now += ms), now: () => now };
}

describe('feather tag on the room server (OP-403)', () => {
  it('lets an owl in only standing in the ring, and starts the countdown with two', () => {
    const g = grove();
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
    const g = grove();
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
    const g = grove();
    g.owl('a', IN_A);
    const b = g.owl('b', IN_B);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.room.tag('b', { t: 'tag', op: 'join' });
    g.tick(TAG_COUNTDOWN_MS + TAG_ROUND_MS + TAG_REST_MS);
    g.room.tag('b', { t: 'tag', op: 'view' });
    expect(b.lastTag()?.tag).toMatchObject({ round: 2, holder: 'a', left: 'a' });
  });

  it('takes an owl out of the game when it leaves the room, and stops the round below two', () => {
    const g = grove();
    const a = g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.room.tag('b', { t: 'tag', op: 'join' });
    g.room.leave('b');
    expect(a.lastTag()?.tag).toMatchObject({ players: ['a'], holder: null, startsAt: 0 });
  });

  it('plays only in the Party Grove', () => {
    let now = 1;
    const room = new Room(ROOMS['grove']!, { now: () => now, cap: 80 });
    const p = new FakePeer();
    room.join(p, 'a', { t: 'hello', v: EDGE_PROTOCOL_VERSION, look });
    expect(room.tag('a', { t: 'tag', op: 'view' })).toBe(false);
    expect(p.tags()).toEqual([]);
    now += 1;
  });
});
