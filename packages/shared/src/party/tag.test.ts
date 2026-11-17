import { describe, expect, it } from 'vitest';
import {
  TAG_BACK_MS,
  TAG_COUNTDOWN_MS,
  TAG_MAX_OWLS,
  TAG_REACH,
  TAG_REST_MS,
  TAG_RING,
  TAG_ROUND_MS,
  TAG_WORDS,
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

describe('feather tag’s frames (OP-403)', () => {
  it('reads a page’s tag frame, and nothing else', async () => {
    const { parseClientFrame, parseServerFrame } = await import('../edge');
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'join' }))).toEqual({ t: 'tag', op: 'join' });
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'view', at: 'x' }))).toEqual({ t: 'tag', op: 'view' });
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'pass', at: 'v_b' }))).toEqual({ t: 'tag', op: 'pass', at: 'v_b' });
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'pass' }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'tag', op: 'win' }))).toBeNull();
    expect(parseServerFrame(JSON.stringify({ t: 'tag', tag: newTag() }))).toEqual({ t: 'tag', tag: newTag() });
  });
});
