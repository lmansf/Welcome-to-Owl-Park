import { describe, expect, it } from 'vitest';
import {
  BITE_AFTER_MS,
  BITE_WINDOW_MS,
  CAST_EVERY_MS,
  COPY_FIRST,
  COPY_SPOT,
  FISHING_SPOT,
  LANTERNS,
  LANTERN_EVERY_MS,
  LANTERN_GLOW_MS,
  QUIZ_ZONES,
  quizRound,
  rectCenter,
  type Vec2,
} from '@owl-park/shared';
import { Activities, NOTE_EVERY_MS, REEL_SLACK_MS } from '../src/Activities';
import type { Room } from '../src/Room';

/** A room as Activities sees it: an id, who is in it, and where each owl stands. */
function roomOf(id: string, positions: Record<string, Vec2>): Room {
  return { id, ids: () => Object.keys(positions), positionOf: (v: string) => positions[v] ?? null } as unknown as Room;
}

const T0 = Date.UTC(2026, 9, 20, 18, 0, 0);
const under = (i: number): Vec2 => ({ x: LANTERNS[i]!.pos.x, y: 760 });

describe('the lantern beam on the room server', () => {
  it('lights the lantern above the owl, refuses one out of reach or in another room', () => {
    const pos: Record<string, Vec2> = { a: under(0), b: { x: 2400, y: 760 } };
    let now = T0;
    const acts = new Activities(roomOf('hub', pos), () => now);
    expect(acts.light('a')).toEqual({ ok: true, id: 'lantern-1', full: null });
    expect(acts.light('b')).toEqual({ ok: false, reason: 'far' });
    expect(acts.light('nobody')).toEqual({ ok: false, reason: 'far' });
    expect(acts.lanternFrame({ id: 'lantern-1', by: 'a' })).toEqual({ t: 'lanterns', lit: { 'lantern-1': T0 + 20_000 }, glowUntil: 0, id: 'lantern-1', by: 'a' });
    now += 1000;
    expect(acts.light('a')).toEqual({ ok: false, reason: 'busy' });
    expect(new Activities(roomOf('grove', { a: under(0) }), () => now).light('a')).toEqual({ ok: false, reason: 'far' });
  });

  it('two owls light the whole beam together and both are named for the pay', () => {
    const pos: Record<string, Vec2> = { a: under(0), b: under(6) };
    let now = T0;
    const acts = new Activities(roomOf('hub', pos), () => now);
    let full: string[] | null = null;
    for (let k = 0; k < 4 && !full; k++) {
      pos['a'] = under(k);
      pos['b'] = under(6 - k);
      for (const who of ['a', 'b']) {
        const r = acts.light(who);
        if (r.ok && r.full) full = r.full;
      }
      now += LANTERN_EVERY_MS;
    }
    expect(full?.sort()).toEqual(['a', 'b']);
    expect(acts.lanternState().glowUntil).toBeGreaterThan(now);
    now += LANTERN_GLOW_MS;
    expect(acts.lanternFrame()).toEqual({ t: 'lanterns', lit: {}, glowUntil: 0 });
  });

  it('brings a saved beam back unless it has burnt out', () => {
    let now = T0;
    const acts = new Activities(roomOf('hub', { a: under(0) }), () => now);
    acts.restoreLanterns({ lit: { 'lantern-2': T0 + 5000 }, glowUntil: 0, helpers: {} });
    expect(Object.keys(acts.lanternState().lit)).toEqual(['lantern-2']);
    now += 6000;
    expect(acts.lanternState().lit).toEqual({});
  });
});

describe('fishing on the room server', () => {
  it('casts from the jetty, and reeling in on the bite catches something', () => {
    const pos: Record<string, Vec2> = { a: FISHING_SPOT, b: { x: 2600, y: 800 } };
    let now = T0;
    const acts = new Activities(roomOf('grove', pos), () => now, () => 0);
    expect(acts.cast('b')).toEqual({ ok: false, reason: 'far' });
    expect(acts.reel('a')).toEqual({ ok: false, reason: 'idle' });
    const c = acts.cast('a');
    expect(c).toEqual({ ok: true, biteAt: T0 + BITE_AFTER_MS[0] });
    expect(acts.cast('a')).toEqual({ ok: false, reason: 'busy' });
    now = T0 + BITE_AFTER_MS[0] + BITE_WINDOW_MS + REEL_SLACK_MS - 1;
    expect(acts.reel('a')).toMatchObject({ ok: true, outcome: 'caught', fish: { id: 'minnow' } });
    // One reel per cast.
    expect(acts.reel('a')).toEqual({ ok: false, reason: 'idle' });
  });

  it('too early or too late, the fish gets away; walking off the jetty ends the cast', () => {
    const pos: Record<string, Vec2> = { a: FISHING_SPOT };
    let now = T0;
    const acts = new Activities(roomOf('grove', pos), () => now, () => 0);
    acts.cast('a');
    now += 1000;
    expect(acts.reel('a')).toEqual({ ok: true, outcome: 'early' });
    now += CAST_EVERY_MS;
    acts.cast('a');
    now += BITE_AFTER_MS[0] + BITE_WINDOW_MS + REEL_SLACK_MS + 1;
    expect(acts.reel('a')).toEqual({ ok: true, outcome: 'late' });
    now += CAST_EVERY_MS;
    acts.cast('a');
    pos['a'] = { x: 2600, y: 800 };
    now += BITE_AFTER_MS[0];
    expect(acts.reel('a')).toEqual({ ok: false, reason: 'far' });
  });
});

describe("the robot owl's copy game on the room server", () => {
  it('starts by the robot owl and takes the tune note by note', () => {
    const pos: Record<string, Vec2> = { a: rectCenter(COPY_SPOT), b: { x: 300, y: 740 } };
    let now = T0;
    const acts = new Activities(roomOf('market', pos), () => now);
    expect(acts.startCopy('b', ['hoot', 'flap'])).toEqual({ ok: false, reason: 'far' });
    expect(acts.note('a', 'hoot')).toEqual({ kind: 'idle' });
    const start = acts.startCopy('a', ['hoot', 'flap']);
    if (!start.ok) throw new Error('expected a game');
    expect(start.game.tune).toHaveLength(COPY_FIRST);
    now = start.game.listenUntil;
    expect(acts.note('a', start.game.tune[0]!)).toMatchObject({ kind: 'note' });
    expect(acts.note('a', start.game.tune[1]!)).toEqual({ kind: 'busy' });
    now += NOTE_EVERY_MS;
    const wrong = start.game.tune[1] === 'hoot' ? 'flap' : 'hoot';
    expect(acts.note('a', wrong)).toMatchObject({ kind: 'wrong', level: 0 });
    // The game is over: notes no longer count.
    now += NOTE_EVERY_MS;
    expect(acts.note('a', 'hoot')).toEqual({ kind: 'idle' });
  });
});

describe('the stage quiz on the room server', () => {
  it('settles each round once, while its answer shows, paying the owls in the right zone', () => {
    const round = quizRound(Math.floor(T0 / 90_000) + 1);
    const wrong = round.right === 'a' ? 'b' : 'a';
    const pos: Record<string, Vec2> = { a: rectCenter(QUIZ_ZONES[round.right]), b: rectCenter(QUIZ_ZONES[wrong]), c: { x: 2400, y: 760 } };
    let now = round.startsAt + 1000;
    const acts = new Activities(roomOf('hub', pos), () => now);
    expect(acts.quizDue()).toBeNull();
    expect(acts.nextQuizClose()).toBe(round.revealAt);
    now = round.revealAt + 50;
    const due = acts.quizDue();
    expect(due?.n).toBe(round.n);
    expect(acts.settleQuiz(due!)).toEqual({ right: round.right, winners: ['a'] });
    expect(acts.quizDue()).toBeNull();
    expect(acts.nextQuizClose()).toBe(quizRound(round.n + 1).revealAt);
    // Too late to settle: the answer stopped showing.
    const later = new Activities(roomOf('hub', pos), () => round.endsAt + 1);
    expect(later.quizDue()).toBeNull();
    // Only the hub has a stage.
    expect(new Activities(roomOf('grove', pos), () => round.revealAt + 50).quizDue()).toBeNull();
  });
});
