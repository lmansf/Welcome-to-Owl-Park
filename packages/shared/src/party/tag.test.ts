import { describe, expect, it } from 'vitest';
import {
  TAG_BACK_MS,
  TAG_COUNTDOWN_MS,
  TAG_MAX_OWLS,
  TAG_REACH,
  TAG_REST_MS,
  TAG_RING,
  TAG_ROUND_MS,
  TAG_STANDIN,
  TAG_STANDIN_HOLD_MS,
  TAG_STANDIN_SPEED,
  TAG_STANDIN_WAIT_MS,
  TAG_WORDS,
  isStandIn,
  realPlayers,
  standInAt,
  tagStandIn,
  inTagRing,
  isTagState,
  newTag,
  tagAt,
  tagJoin,
  tagLeave,
  tagPass,
  tagPhase,
  tagTouches,
  type TagResult,
  type TagState,
} from './tag';

const first = () => 0;
const ok = (r: TagResult): TagState => {
  expect(r.ok, r.ok ? '' : r.reason).toBe(true);
  return r.state;
};
/** Two owls in at time 0: a and b, a holding the feather. */
function two(): TagState {
  return ok(tagJoin(ok(tagJoin(newTag(), 'a', 0, first)), 'b', 0, first));
}
const LIVE = TAG_COUNTDOWN_MS;
const END = TAG_COUNTDOWN_MS + TAG_ROUND_MS;

describe('feather tag (OP-403)', () => {
  it('waits for a second owl, then counts down with the feather on the owl picked', () => {
    const one = ok(tagJoin(newTag(), 'a', 0, first));
    expect(tagPhase(one, 0)).toBe('waiting');
    expect(one.holder).toBeNull();
    const s = ok(tagJoin(one, 'b', 100, () => 1));
    expect(s.holder).toBe('b');
    expect(s.round).toBe(1);
    expect(tagPhase(s, 100)).toBe('countdown');
    expect(tagPhase(s, 100 + TAG_COUNTDOWN_MS)).toBe('live');
    expect(tagPhase(s, 100 + TAG_COUNTDOWN_MS + TAG_ROUND_MS)).toBe('over');
  });

  it('passes the feather only in a live round, from its holder, to another owl in the ring', () => {
    const s = two();
    expect(tagPass(s, 'a', 'b', LIVE - 1)).toMatchObject({ ok: false, reason: 'not-live' });
    expect(tagPass(s, 'b', 'a', LIVE)).toMatchObject({ ok: false, reason: 'not-holder' });
    expect(tagPass(s, 'a', 'a', LIVE)).toMatchObject({ ok: false, reason: 'self' });
    expect(tagPass(s, 'a', 'c', LIVE)).toMatchObject({ ok: false, reason: 'not-player' });
    const passed = ok(tagPass(s, 'a', 'b', LIVE));
    expect(passed).toMatchObject({ holder: 'b', from: 'a', passedAt: LIVE });
    expect(tagPass(passed, 'b', 'a', END)).toMatchObject({ ok: false, reason: 'not-live' });
  });

  it('will not hand the feather straight back to the owl that just passed it', () => {
    const s = ok(tagJoin(two(), 'c', 0, first));
    const passed = ok(tagPass(s, 'a', 'b', LIVE));
    expect(tagPass(passed, 'b', 'a', LIVE + TAG_BACK_MS - 1)).toMatchObject({ ok: false, reason: 'back' });
    expect(ok(tagPass(passed, 'b', 'c', LIVE + 10)).holder).toBe('c');
    expect(ok(tagPass(passed, 'b', 'a', LIVE + TAG_BACK_MS)).holder).toBe('a');
  });

  it('leaves whoever holds the feather at the end holding it, then starts the next round with them holding it', () => {
    const passed = ok(tagPass(two(), 'a', 'b', LIVE + 5));
    const over = tagAt(passed, END);
    expect(tagPhase(over, END)).toBe('over');
    expect(over.left).toBe('b');
    const next = tagAt(passed, END + TAG_REST_MS);
    expect(next).toMatchObject({ round: 2, holder: 'b', left: 'b', startsAt: END + TAG_REST_MS + TAG_COUNTDOWN_MS, from: null });
    expect(tagPhase(next, END + TAG_REST_MS)).toBe('countdown');
  });

  it('moves on by the clock alone, the same whenever it is read', () => {
    const s = two();
    const t = END + TAG_REST_MS + TAG_COUNTDOWN_MS + TAG_ROUND_MS + 10;
    expect(tagAt(s, t)).toEqual(tagAt(tagAt(s, END + 1), t));
    expect(tagAt(s, t).round).toBe(2);
    expect(tagAt(s, t).left).toBe('a');
  });

  it('lets owls join a round going on, up to eight, and no more', () => {
    let s = two();
    for (let i = 3; i <= TAG_MAX_OWLS; i++) s = ok(tagJoin(s, `o${i}`, LIVE + i, first));
    expect(s.players).toHaveLength(TAG_MAX_OWLS);
    expect(s.round).toBe(1);
    expect(tagJoin(s, 'late', LIVE + 20, first)).toMatchObject({ ok: false, reason: 'full' });
    expect(ok(tagJoin(s, 'a', LIVE + 20, first))).toEqual(tagAt(s, LIVE + 20));
  });

  it('gives the feather to the next owl when its holder steps out, and stops the round below two', () => {
    const s = ok(tagJoin(two(), 'c', 0, first));
    const out = tagLeave(s, 'a', LIVE + 1);
    expect(out.players).toEqual(['b', 'c']);
    expect(out.holder).toBe('b');
    expect(tagPhase(out, LIVE + 1)).toBe('live');
    const alone = tagLeave(out, 'c', LIVE + 2);
    expect(tagPhase(alone, LIVE + 2)).toBe('waiting');
    expect(alone.holder).toBeNull();
    // Back to two: a fresh countdown.
    expect(tagPhase(ok(tagJoin(alone, 'd', LIVE + 3, first)), LIVE + 3)).toBe('countdown');
  });

  it('keeps a finished round’s result on show when an owl steps out, and waits if too few are left after it', () => {
    const s = two();
    const out = tagLeave(s, 'b', END + 10);
    expect(tagPhase(out, END + 10)).toBe('over');
    expect(out.left).toBe('a');
    expect(tagPhase(tagAt(out, END + TAG_REST_MS), END + TAG_REST_MS)).toBe('waiting');
  });

  it('starts the next round with the first owl in when the owl left holding the feather has gone', () => {
    const s = ok(tagJoin(two(), 'c', 0, first));
    const out = tagLeave(s, 'a', END + 10);
    expect(tagAt(out, END + TAG_REST_MS).holder).toBe('b');
  });

  it('knows its ring and when two owls touch', () => {
    expect(inTagRing({ x: TAG_RING.x, y: TAG_RING.y })).toBe(true);
    expect(inTagRing({ x: TAG_RING.x + TAG_RING.rx + 1, y: TAG_RING.y })).toBe(false);
    expect(inTagRing({ x: TAG_RING.x + TAG_RING.rx + 1, y: TAG_RING.y }, 10)).toBe(true);
    expect(tagTouches({ x: 0, y: 0 }, { x: TAG_REACH, y: 0 })).toBe(true);
    expect(tagTouches({ x: 0, y: 0 }, { x: TAG_REACH + 1, y: 0 })).toBe(false);
  });

  it('checks a state sent to a page', () => {
    expect(isTagState(two())).toBe(true);
    expect(isTagState(newTag())).toBe(true);
    expect(isTagState({ ...two(), players: 'a' })).toBe(false);
    expect(isTagState({ ...two(), holder: 3 })).toBe(false);
    expect(isTagState({ ...two(), startsAt: -1 })).toBe(false);
    expect(isTagState(null)).toBe(false);
  });

  it('says it plainly, with no “grown ups”', () => {
    for (const w of Object.values(TAG_WORDS)) {
      const text = typeof w === 'function' ? w(3) : w;
      expect(text.toLowerCase()).not.toContain('grown');
      expect(text.length).toBeLessThan(80);
    }
  });
});

describe('never a one-owl game: Pip stands in (OP-426)', () => {
  const live = TAG_COUNTDOWN_MS;
  /** Owl a alone in the ring since time 0, and Pip asked for at TAG_STANDIN_WAIT_MS. */
  function withPip(): TagState {
    const alone = ok(tagJoin(newTag(), 'a', 0, first));
    return ok(tagStandIn(alone, 'a', TAG_STANDIN_WAIT_MS, 0));
  }
  const t0 = TAG_STANDIN_WAIT_MS;

  it('steps in only for an owl alone in the ring for a few seconds, with no round going', () => {
    const alone = ok(tagJoin(newTag(), 'a', 0, first));
    expect(tagPhase(alone, 1000)).toBe('waiting');
    expect(tagStandIn(alone, 'a', TAG_STANDIN_WAIT_MS - 1, 0)).toMatchObject({ ok: false, reason: 'early' });
    expect(tagStandIn(alone, 'b', TAG_STANDIN_WAIT_MS, 0)).toMatchObject({ ok: false, reason: 'not-player' });
    const pair = ok(tagJoin(alone, 'b', 1000, first));
    expect(tagStandIn(pair, 'a', TAG_STANDIN_WAIT_MS, 0)).toMatchObject({ ok: false, reason: 'not-alone' });
    const s = withPip();
    expect(s.players).toEqual(['a', TAG_STANDIN]);
    expect(realPlayers(s)).toEqual(['a']);
    expect(isStandIn(TAG_STANDIN)).toBe(true);
    expect(isStandIn('a')).toBe(false);
    // A round at once, the owl starting with the feather and Pip to catch.
    expect(s.holder).toBe('a');
    expect(tagPhase(s, t0 + 1)).toBe('countdown');
    expect(tagPhase(s, t0 + live)).toBe('live');
    expect(isTagState(s)).toBe(true);
  });

  it('runs round inside the ring at half an owl’s walk, the same on every page', () => {
    const s = withPip();
    let last = standInAt(s, t0);
    let walked = 0;
    for (let t = t0 + 100; t <= t0 + live + TAG_ROUND_MS; t += 100) {
      const p = standInAt(s, t);
      expect(inTagRing(p), `t=${t}`).toBe(true);
      walked += Math.hypot(p.x - last.x, p.y - last.y);
      last = p;
    }
    const secs = (live + TAG_ROUND_MS) / 1000;
    expect(walked / secs).toBeGreaterThan(TAG_STANDIN_SPEED * 0.7);
    expect(walked / secs).toBeLessThan(TAG_STANDIN_SPEED * 1.3);
    expect(TAG_STANDIN_SPEED).toBeLessThanOrEqual(260 / 2);
    expect(standInAt(s, t0 + 7000)).toEqual(standInAt(s, t0 + 7000));
  });

  it('is caught like any owl, and gives the feather back after a short wait', () => {
    const s = withPip();
    const at = t0 + live + 2000;
    const caught = ok(tagPass(s, 'a', TAG_STANDIN, at));
    expect(caught.holder).toBe(TAG_STANDIN);
    expect(tagAt(caught, at + TAG_STANDIN_HOLD_MS - 1).holder).toBe(TAG_STANDIN);
    const back = tagAt(caught, at + TAG_STANDIN_HOLD_MS);
    expect(back).toMatchObject({ holder: 'a', from: TAG_STANDIN, passedAt: at + TAG_STANDIN_HOLD_MS });
    expect(TAG_STANDIN_HOLD_MS).toBeGreaterThan(TAG_BACK_MS);
    // And straight back to Pip is the usual tag rule: not for TAG_BACK_MS.
    expect(tagPass(back, 'a', TAG_STANDIN, at + TAG_STANDIN_HOLD_MS + 10)).toMatchObject({ ok: false, reason: 'back' });
    expect(ok(tagPass(back, 'a', TAG_STANDIN, at + TAG_STANDIN_HOLD_MS + TAG_BACK_MS)).holder).toBe(TAG_STANDIN);
  });

  it('plays a round to its end: caught just before the bell, Pip is left holding the feather and the owl got away', () => {
    const s = withPip();
    const end = s.endsAt;
    const caught = ok(tagPass(s, 'a', TAG_STANDIN, end - 2000));
    const over = tagAt(caught, end + 100);
    expect(tagPhase(over, end + 100)).toBe('over');
    expect(over.left).toBe(TAG_STANDIN);
    // Still alone, the owl plays on with Pip: the next round starts with Pip holding the feather, who gives it back.
    const next = tagAt(over, end + TAG_REST_MS);
    expect(next.players).toEqual(['a', TAG_STANDIN]);
    expect(next.round).toBe(2);
    expect(next.holder).toBe(TAG_STANDIN);
    expect(tagAt(next, next.startsAt + TAG_STANDIN_HOLD_MS).holder).toBe('a');
  });

  it('plays out the round when a second real owl steps in, then steps out', () => {
    const s = withPip();
    const joined = ok(tagJoin(s, 'b', t0 + live + 1000, first));
    expect(joined.players).toEqual(['a', TAG_STANDIN, 'b']);
    expect(joined.round).toBe(1);
    const next = tagAt(joined, joined.endsAt + TAG_REST_MS);
    expect(next.players).toEqual(['a', 'b']);
    expect(next.round).toBe(2);
    expect(tagPhase(next, next.startsAt)).toBe('live');
    // A real owl that stepped in can't ask for Pip once it has company.
    expect(tagStandIn(next, 'a', next.startsAt, 0)).toMatchObject({ ok: false, reason: 'not-alone' });
  });

  it('goes when the owl it played with steps out', () => {
    const s = withPip();
    const gone = tagLeave(s, 'a', t0 + live + 1000);
    expect(gone.players).toEqual([]);
    expect(tagPhase(gone, t0 + live + 1000)).toBe('waiting');
  });

  it('says it plainly', () => {
    for (const w of [TAG_WORDS.standIn, TAG_WORDS.pipHas, TAG_WORDS.pipLeft]) {
      expect(w).not.toMatch(/grown/i);
      expect(w.length).toBeLessThan(100);
    }
  });
});

describe('feather tag’s frames (OP-403)', () => {
  it('reads a page’s tag frame, and nothing else', async () => {
    const { parseClientFrame, parseServerFrame } = await import('../edge');
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'join' }))).toEqual({ t: 'tag', op: 'join' });
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'view', at: 'x' }))).toEqual({ t: 'tag', op: 'view' });
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'pass', at: 'v_b' }))).toEqual({ t: 'tag', op: 'pass', at: 'v_b' });
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'pass' }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'win' }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'standin' }))).toEqual({ t: 'tag', op: 'standin' });
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'pass', at: TAG_STANDIN }))).toEqual({ t: 'tag', op: 'pass', at: TAG_STANDIN });
    expect(parseServerFrame(JSON.stringify({ t: 'tag', tag: newTag() }))).toEqual({ t: 'tag', tag: newTag() });
  });
});
