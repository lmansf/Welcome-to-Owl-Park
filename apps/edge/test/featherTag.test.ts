import { describe, expect, it } from 'vitest';
import { EDGE_PROTOCOL_VERSION, TAG_CALL_MS, TAG_COUNTDOWN_MS, TAG_GRACE_MS, TAG_MAX_OWLS, TAG_REACH, TAG_RING, TAG_ROUND_MS, TAG_REST_MS, TAG_STANDIN, TAG_STANDIN_HOLD_MS, TAG_ROOM, standInAt, tagAt, type ClientHello, type ServerFrame, type TagRoundResult, type Vec2 } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { Room, type Peer } from '../src/Room';

/**
 * Feather tag across the Great Hollow on the room server (OP-434): any owl in the hollow starts a game
 * or joins its call from wherever it stands, the feather passes only from its holder to an owl it
 * touches, everyone is told each change, a round whose time runs out is handed to the room object once
 * to be paid, and a round is void when the owl with the feather leaves. Its rules are
 * packages/shared/src/party/tag.test.ts; the prizes, packages/shared/src/tagPrize.test.ts; the park's
 * side, apps/park/e2e/tag.spec.ts.
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
  const rounds: TagRoundResult[] = [];
  const room = new Room(ROOMS[TAG_ROOM]!, { now: () => now, random: () => 0, cap: 80, tagRound: (r) => rounds.push(r) });
  const owl = (id: string, at: Vec2) => {
    const p = new FakePeer();
    expect(room.join(p, id, hello(OUT))).toBe('ok');
    // Put down where the test wants it (as a fall in a course is), standing on the hollow's floor.
    expect(room.place(id, at)).toBe(true);
    expect(room.positionOf(id)).toEqual(at);
    return p;
  };
  return { room, owl, rounds, tick: (ms: number) => (now += ms), now: () => now };
}

/** From the start of a game's call to its round being live. */
const TO_LIVE = TAG_CALL_MS + TAG_COUNTDOWN_MS;

describe('feather tag on the room server (OP-434)', () => {
  it('lets any owl in the hollow start a game, and others join the call from anywhere in it', () => {
    const g = hollow();
    const a = g.owl('a', OUT);
    const b = g.owl('b', IN_C);
    g.room.tag('a', { t: 'tag', op: 'join' });
    expect(b.lastTag()?.tag).toMatchObject({ players: ['a'], callEndsAt: g.now() + TAG_CALL_MS });
    g.tick(4000);
    g.room.tag('b', { t: 'tag', op: 'join' });
    expect(a.lastTag()?.tag.players).toEqual(['a', 'b']);
    g.tick(TAG_CALL_MS);
    g.room.tag('b', { t: 'tag', op: 'view' });
    expect(b.lastTag()?.tag).toMatchObject({ players: ['a', 'b'], holder: 'a', round: 1, callEndsAt: 0 });
  });

  it('closes the game to new owls once the call is over, and to a twenty-first owl', () => {
    const g = hollow();
    g.owl('a', IN_A);
    g.owl('b', IN_B);
    const late = g.owl('late', OUT);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.room.tag('b', { t: 'tag', op: 'join' });
    g.tick(TAG_CALL_MS);
    g.room.tag('late', { t: 'tag', op: 'join' });
    expect(late.lastTag()).toMatchObject({ refused: 'closed' });

    const h = hollow();
    for (let i = 0; i < TAG_MAX_OWLS; i++) {
      h.owl(`o${i}`, OUT);
      h.room.tag(`o${i}`, { t: 'tag', op: 'join' });
    }
    const extra = h.owl('extra', OUT);
    h.room.tag('extra', { t: 'tag', op: 'join' });
    expect(extra.lastTag()).toMatchObject({ refused: 'full' });
  });

  it('passes the feather when its holder touches another owl, and not from afar or before the round', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.owl('c', IN_C);
    for (const id of ['a', 'b', 'c']) g.room.tag(id, { t: 'tag', op: 'join' });
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'b' });
    expect(a.lastTag()).toMatchObject({ refused: 'not-live' });
    g.tick(TO_LIVE);
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'c' });
    expect(a.lastTag()).toMatchObject({ refused: 'far' });
    g.room.tag('b', { t: 'tag', op: 'pass', at: 'a' });
    expect(tagAt(g.room.tagNow()!, g.now()).holder).toBe('a');
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'b' });
    expect(g.room.tagNow()).toMatchObject({ holder: 'b', from: 'a', passes: 1, holders: ['a', 'b'] });
    // Straight back is refused.
    g.room.tag('b', { t: 'tag', op: 'pass', at: 'a' });
    expect(g.room.tagNow()?.holder).toBe('b');
  });

  it('hands a round whose time ran out to the room object once, with its owls and score', () => {
    const g = hollow();
    g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.room.tag('b', { t: 'tag', op: 'join' });
    expect(g.room.tagDue()).toBe(g.now() + TO_LIVE + TAG_ROUND_MS);
    g.tick(TO_LIVE);
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'b' });
    g.tick(TAG_ROUND_MS - 1);
    expect(g.room.settleTag(g.now())).toBeNull();
    g.tick(1);
    expect(g.room.settleTag(g.now())).toEqual({ round: 1, players: ['a', 'b'], score: 2 });
    // Never twice: not at the next wake, nor on the next tag frame, nor after the rest.
    expect(g.room.settleTag(g.now() + 1)).toBeNull();
    g.room.tag('a', { t: 'tag', op: 'view' });
    g.tick(TAG_REST_MS);
    g.room.tag('a', { t: 'tag', op: 'view' });
    expect(g.rounds).toEqual([{ round: 1, players: ['a', 'b'], score: 2 }]);
    expect(g.room.tagDue()).toBe(0);
  });

  it('settles the last round first when a new game starts after it, so its result is not lost', () => {
    const g = hollow();
    g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.room.tag('b', { t: 'tag', op: 'join' });
    g.tick(TO_LIVE + TAG_ROUND_MS + TAG_REST_MS);
    g.room.tag('b', { t: 'tag', op: 'join' });
    expect(g.rounds).toEqual([{ round: 1, players: ['a', 'b'], score: 0 }]);
    expect(g.room.tagNow()).toMatchObject({ players: ['b'], round: 1 });
  });

  it('ends the round with no prizes when the owl holding the feather leaves the room', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.owl('c', IN_C);
    for (const id of ['a', 'b', 'c']) g.room.tag(id, { t: 'tag', op: 'join' });
    g.tick(TO_LIVE);
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'b' });
    g.room.leave('b');
    expect(a.lastTag()?.tag).toMatchObject({ ended: 'left', holder: null, players: ['a', 'c'] });
    expect(g.room.tagDue()).toBe(0);
    g.tick(TAG_ROUND_MS + TAG_REST_MS);
    g.room.tag('a', { t: 'tag', op: 'view' });
    expect(g.rounds).toEqual([]);
  });

  it('keeps an owl whose line dropped in the game while it comes back within its grace, the feather and all', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.owl('b', IN_B);
    for (const id of ['a', 'b']) g.room.tag(id, { t: 'tag', op: 'join' });
    g.tick(TO_LIVE);
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'b' });
    g.room.leave('b', undefined, true);
    expect(a.lastTag()?.tag).toMatchObject({ ended: null, holder: 'b', players: ['a', 'b'] });
    expect(g.room.tagDue()).toBe(g.now() + TAG_GRACE_MS);
    g.tick(TAG_GRACE_MS - 1000);
    expect(g.room.join(new FakePeer(), 'b', hello(IN_B))).toBe('ok');
    g.tick(2000);
    g.room.settleTag(g.now());
    g.room.tag('a', { t: 'tag', op: 'view' });
    expect(a.lastTag()?.tag).toMatchObject({ ended: null, holder: 'b', players: ['a', 'b'] });
  });

  it('ends the round once the grace of a holder whose line dropped runs out, with no prizes', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.owl('b', IN_B);
    for (const id of ['a', 'b']) g.room.tag(id, { t: 'tag', op: 'join' });
    g.tick(TO_LIVE);
    g.room.tag('a', { t: 'tag', op: 'pass', at: 'b' });
    g.room.leave('b', undefined, true);
    g.tick(TAG_GRACE_MS);
    // The room object's wake comes at the grace's end, and settles it.
    g.room.settleTag(g.now());
    expect(a.lastTag()?.tag).toMatchObject({ ended: 'left', holder: null, players: ['a'] });
    g.tick(TAG_ROUND_MS + TAG_REST_MS);
    g.room.tag('a', { t: 'tag', op: 'view' });
    expect(g.rounds).toEqual([]);
  });

  it('plays on when an owl without the feather leaves', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.owl('c', IN_C);
    for (const id of ['a', 'b', 'c']) g.room.tag(id, { t: 'tag', op: 'join' });
    g.tick(TO_LIVE);
    g.room.tag('c', { t: 'tag', op: 'leave' });
    expect(a.lastTag()?.tag).toMatchObject({ ended: null, holder: 'a', players: ['a', 'b'] });
  });

  it('plays only in the Great Hollow: no longer in the Party Grove, nor anywhere else', () => {
    const now = 1;
    for (const id of ['hub', 'grove']) {
      const room = new Room(ROOMS[id]!, { now: () => now, cap: 80 });
      const p = new FakePeer();
      room.join(p, 'a', { t: 'hello', v: EDGE_PROTOCOL_VERSION, look });
      expect(room.tag('a', { t: 'tag', op: 'view' })).toBe(false);
      expect(p.tags()).toEqual([]);
    }
  });
});

describe('Pip stands in on the room server (OP-426, OP-434)', () => {
  it('joins an owl that started a game no one else joined, once the call is over', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.tick(TAG_CALL_MS);
    g.room.tag('a', { t: 'tag', op: 'view' });
    expect(a.lastTag()?.tag).toMatchObject({ players: ['a', TAG_STANDIN], holder: 'a', round: 1 });
  });

  it('lets the owl catch Pip where the clock has Pip, and gives the feather back by itself; Pip adds no multiplier', () => {
    const g = hollow();
    g.owl('a', IN_A);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.tick(TO_LIVE + 1500);
    g.room.tag('a', { t: 'tag', op: 'view' });
    // Away from Pip: no pass. Then put right beside Pip: the feather goes.
    const pip = standInAt(tagAt(g.room.tagNow()!, g.now()), g.now());
    g.room.place('a', { x: TAG_RING.x - (pip.x - TAG_RING.x), y: TAG_RING.y - (pip.y - TAG_RING.y) });
    g.room.tag('a', { t: 'tag', op: 'pass', at: TAG_STANDIN });
    expect(tagAt(g.room.tagNow()!, g.now()).holder).toBe('a');
    g.room.place('a', { x: pip.x + 20, y: pip.y });
    g.room.tag('a', { t: 'tag', op: 'pass', at: TAG_STANDIN });
    expect(g.room.tagNow()?.holder).toBe(TAG_STANDIN);
    g.tick(TAG_STANDIN_HOLD_MS);
    expect(tagAt(g.room.tagNow()!, g.now()).holder).toBe('a');
    g.tick(TAG_ROUND_MS);
    g.room.tag('a', { t: 'tag', op: 'view' });
    expect(g.rounds).toEqual([{ round: 1, players: ['a'], score: 1 }]);
  });

  it('comes in when every other owl leaves a round but one', () => {
    const g = hollow();
    const a = g.owl('a', IN_A);
    g.owl('b', IN_B);
    g.room.tag('a', { t: 'tag', op: 'join' });
    g.room.tag('b', { t: 'tag', op: 'join' });
    g.tick(TO_LIVE);
    g.room.leave('b');
    expect(a.lastTag()?.tag).toMatchObject({ players: ['a', TAG_STANDIN], holder: 'a', ended: null });
  });
});
