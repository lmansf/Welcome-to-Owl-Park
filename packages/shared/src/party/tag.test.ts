import { describe, expect, it } from 'vitest';
import {
  TAG_BACK_MS,
  TAG_CALL_MS,
  TAG_COUNTDOWN_MS,
  TAG_MAX_OWLS,
  TAG_REST_MS,
  TAG_ROUND_MS,
  TAG_STANDIN,
  TAG_STANDIN_HOLD_MS,
  TAG_STATION,
  atTagStation,
  inTagRing,
  isTagState,
  newTag,
  standInAt,
  tagAt,
  tagJoin,
  tagLeave,
  tagPass,
  tagPhase,
  tagResult,
  tagScore,
  type TagState,
} from './tag';

/**
 * Feather tag across the whole Great Hollow (OP-434): anyone starts it, others join during the call, a
 * 30 s round, a point a pass times the different owls who held the feather, and no prizes if the owl
 * with the feather leaves. Pip fills in for a lone owl (OP-426). The room server's side is
 * apps/edge/test/featherTag.test.ts; the park's, apps/park/e2e/tag.spec.ts.
 */
const T0 = 1_000_000;
const ok = (r: ReturnType<typeof tagJoin>) => {
  expect(r.ok).toBe(true);
  return r.state;
};
/** A game called by `ids[0]` at T0 that `ids` joined, its call over: the round's countdown on. */
function called(ids: string[]): { s: TagState; live: number } {
  let s = newTag();
  for (const id of ids) s = ok(tagJoin(s, id, T0));
  const live = T0 + TAG_CALL_MS + TAG_COUNTDOWN_MS;
  return { s, live };
}

describe('feather tag across the Great Hollow (OP-434)', () => {
  it('starts with a call from anyone, and the owl that started it holds the feather', () => {
    const s0 = ok(tagJoin(newTag(), 'a', T0));
    expect(tagPhase(s0, T0)).toBe('call');
    expect(s0.callEndsAt).toBe(T0 + TAG_CALL_MS);
    const s1 = ok(tagJoin(s0, 'b', T0 + 4000));
    expect(s1.players).toEqual(['a', 'b']);
    const s2 = tagAt(s1, T0 + TAG_CALL_MS);
    expect(tagPhase(s2, T0 + TAG_CALL_MS)).toBe('countdown');
    expect(s2.holder).toBe('a');
    expect(s2.holders).toEqual(['a']);
    expect(s2.round).toBe(1);
    expect(s2.endsAt - s2.startsAt).toBe(TAG_ROUND_MS);
    expect(TAG_ROUND_MS).toBe(30_000);
    expect(tagPhase(s2, s2.startsAt)).toBe('live');
  });

  it('is closed to new owls once the call is over, and holds at most TAG_MAX_OWLS', () => {
    const { s, live } = called(['a', 'b']);
    const late = tagJoin(s, 'c', live);
    expect(late).toMatchObject({ ok: false, reason: 'closed' });
    let full = ok(tagJoin(newTag(), 'o0', T0));
    for (let i = 1; i < TAG_MAX_OWLS; i++) full = ok(tagJoin(full, `o${i}`, T0 + 1));
    expect(tagJoin(full, 'one-too-many', T0 + 2)).toMatchObject({ ok: false, reason: 'full' });
  });

  it('counts a point a pass, times the different owls who held the feather', () => {
    const { s, live } = called(['a', 'b', 'c']);
    let t = tagAt(s, live);
    t = tagPass(t, 'a', 'b', live + 100).state;
    t = tagPass(t, 'b', 'c', live + 200).state;
    // c can't give it straight back to b, but can to a, who already held it.
    expect(tagPass(t, 'c', 'b', live + 300)).toMatchObject({ ok: false, reason: 'back' });
    t = tagPass(t, 'c', 'a', live + 300).state;
    expect(t.passes).toBe(3);
    expect(t.holders).toEqual(['a', 'b', 'c']);
    expect(tagScore(t)).toBe(9);
    // Only the holder passes, only to an owl in the game.
    expect(tagPass(t, 'b', 'c', live + 400)).toMatchObject({ ok: false, reason: 'not-holder' });
    expect(tagPass(t, 'a', 'zz', live + 400)).toMatchObject({ ok: false, reason: 'not-player' });
  });

  it('ends on time with a result, then frees the hollow after the rest', () => {
    const { s, live } = called(['a', 'b']);
    let t = tagPass(tagAt(s, live), 'a', 'b', live + 1000).state;
    const end = live + TAG_ROUND_MS;
    expect(tagResult(t, end - 1)).toBeNull();
    expect(tagResult(t, end)).toEqual({ round: 1, players: ['a', 'b'], score: 2 });
    t = tagAt(t, end + 10);
    expect(tagPhase(t, end + 10)).toBe('over');
    expect(t.left).toBe('b');
    // The result is still there for the room to pay even after the hollow is free again, from the stored state.
    expect(tagResult(t, end + TAG_REST_MS + 1)).toEqual({ round: 1, players: ['a', 'b'], score: 2 });
    const free = tagAt(t, end + TAG_REST_MS);
    expect(tagPhase(free, end + TAG_REST_MS)).toBe('waiting');
    expect(free.round).toBe(1);
    // The next game is round 2.
    const next = tagAt(ok(tagJoin(ok(tagJoin(free, 'b', end + TAG_REST_MS)), 'a', end + TAG_REST_MS)), end + TAG_REST_MS + TAG_CALL_MS);
    expect(next.round).toBe(2);
    expect(next.holder).toBe('b');
  });

  it('reads a game stored as its call, with no frame since, as the round it opened', () => {
    const { s, live } = called(['a', 'b']);
    expect(s.callEndsAt).not.toBe(0);
    expect(tagResult(s, live + TAG_ROUND_MS - 1)).toBeNull();
    expect(tagResult(s, live + TAG_ROUND_MS)).toEqual({ round: 1, players: ['a', 'b'], score: 0 });
    expect(tagResult(ok(tagJoin(newTag(), 'a', T0)), T0 + 1)).toBeNull();
  });

  it('ends at once with no prizes when the owl holding the feather leaves', () => {
    const { s, live } = called(['a', 'b', 'c']);
    let t = tagPass(tagAt(s, live), 'a', 'b', live + 1000).state;
    t = tagLeave(t, 'b', live + 2000);
    expect(t.ended).toBe('left');
    expect(tagPhase(t, live + 2000)).toBe('over');
    expect(tagResult(t, live + TAG_ROUND_MS + 1)).toBeNull();
    expect(tagPhase(t, live + 2000 + TAG_REST_MS)).toBe('waiting');
    // In the countdown too.
    const { s: s2 } = called(['a', 'b']);
    const cd = tagLeave(tagAt(s2, T0 + TAG_CALL_MS + 1), 'a', T0 + TAG_CALL_MS + 1);
    expect(cd.ended).toBe('left');
    expect(tagResult(cd, T0 + TAG_CALL_MS + TAG_COUNTDOWN_MS + TAG_ROUND_MS + 1)).toBeNull();
  });

  it('plays on when an owl without the feather leaves, and an owl leaving the call is just out', () => {
    const { s, live } = called(['a', 'b', 'c']);
    const t = tagLeave(tagAt(s, live), 'c', live + 1000);
    expect(t.ended).toBeNull();
    expect(t.players).toEqual(['a', 'b']);
    const call = tagLeave(ok(tagJoin(ok(tagJoin(newTag(), 'a', T0)), 'b', T0)), 'a', T0 + 1);
    expect(call.players).toEqual(['b']);
    expect(tagPhase(tagLeave(call, 'b', T0 + 2), T0 + 2)).toBe('waiting');
  });

  it('brings Pip in for a lone owl; Pip earns no points and never counts toward the multiplier (OP-426)', () => {
    const { s, live } = called(['a']);
    let t = tagAt(s, live);
    expect(t.players).toEqual(['a', TAG_STANDIN]);
    const pip = standInAt(t, live);
    expect(inTagRing(pip)).toBe(true);
    t = tagPass(t, 'a', TAG_STANDIN, live + 1000).state;
    expect(t.passes).toBe(1);
    expect(t.holders).toEqual(['a']);
    // Pip gives it back after the hold, which is no pass.
    t = tagAt(t, live + 1000 + TAG_STANDIN_HOLD_MS);
    expect(t.holder).toBe('a');
    expect(t.passes).toBe(1);
    const r = tagResult(t, live + TAG_ROUND_MS);
    expect(r).toEqual({ round: 1, players: ['a'], score: 1 });
    expect(TAG_BACK_MS).toBeLessThan(TAG_STANDIN_HOLD_MS);
  });

  it('brings Pip in when every other owl leaves a round but one', () => {
    const { s, live } = called(['a', 'b']);
    const t = tagLeave(tagAt(s, live), 'b', live + 1000);
    expect(t.players).toEqual(['a', TAG_STANDIN]);
    expect(t.ended).toBeNull();
  });

  it('has a station on the floor to start from', () => {
    expect(atTagStation({ x: TAG_STATION.x, y: TAG_STATION.y + 40 })).toBe(true);
    expect(atTagStation({ x: TAG_STATION.x + 400, y: TAG_STATION.y })).toBe(false);
  });

  it('checks a state from the room server', () => {
    const { s, live } = called(['a', 'b']);
    expect(isTagState(tagAt(s, live))).toBe(true);
    expect(isTagState(newTag())).toBe(true);
    expect(isTagState({ ...newTag(), ended: 'nope' })).toBe(false);
    expect(isTagState({ ...newTag(), passes: -1 })).toBe(false);
    expect(isTagState({ ...newTag(), players: Array.from({ length: TAG_MAX_OWLS + 2 }, (_, i) => `o${i}`) })).toBe(false);
  });
});
