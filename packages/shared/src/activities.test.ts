import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import {
  BITE_AFTER_MS,
  BITE_WINDOW_MS,
  BOBBER_AT,
  COPY_BASE_EMOTES,
  COPY_FEATHERS,
  COPY_FIRST,
  COPY_LAST,
  COPY_NOTE_MS,
  COPY_ROOM,
  COPY_SPOT,
  COPY_WAIT_MS,
  COPY_WIN_FEATHERS,
  FISH,
  FISHING_ROOM,
  FISHING_SPOT,
  LANTERNS,
  LANTERN_BURN_MS,
  LANTERN_EVERY_MS,
  LANTERN_FLOOR,
  LANTERN_GLOW_MS,
  LANTERN_ROOM,
  PLAY_FEATHERS_PER_DAY,
  QUIZ_BANK,
  QUIZ_EVERY_MS,
  QUIZ_OPEN_MS,
  QUIZ_ROOM,
  QUIZ_STRIDE,
  QUIZ_ZONES,
  QUIZ_ZONE_IDS,
  TASKS_BONUS,
  TASK_FEATHERS,
  TASK_SLOTS,
  biteDelay,
  copyNote,
  copyNotes,
  dailyTasks,
  darkLanterns,
  lanternFeathers,
  lanternsAt,
  lightLantern,
  quizRound,
  quizRoundAt,
  quizZoneAt,
  reelOutcome,
  rollFish,
  startCopy,
  taskProgress,
  type CopyGame,
  type LanternState,
} from './activities';
import { CollectionBook, MemoryCollectionStore } from './book';
import { isWalkable, rectCenter } from './geometry';
import { parkDay } from './parktime';

const T0 = Date.UTC(2026, 9, 20, 18, 0, 0);
const under = (i: number) => ({ x: LANTERNS[i]!.pos.x, y: 760 });
/** A fixed sequence standing in for Math.random. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};

describe('every activity stands where the painting has it', () => {
  it('on the floor of its room', () => {
    for (const l of LANTERNS) expect(isWalkable(under(LANTERNS.indexOf(l)), ROOMS[LANTERN_ROOM]!.walkable)).toBe(true);
    for (const z of QUIZ_ZONE_IDS) expect(isWalkable(rectCenter(QUIZ_ZONES[z]), ROOMS[QUIZ_ROOM]!.walkable)).toBe(true);
    expect(isWalkable(FISHING_SPOT, ROOMS[FISHING_ROOM]!.walkable)).toBe(true);
    expect(isWalkable(BOBBER_AT, ROOMS[FISHING_ROOM]!.walkable)).toBe(false); // out on the water
    expect(isWalkable(rectCenter(COPY_SPOT), ROOMS[COPY_ROOM]!.walkable)).toBe(true);
  });

  it('with the lanterns along the beam above their floor', () => {
    for (const l of LANTERNS) {
      expect(l.pos.x).toBeGreaterThanOrEqual(LANTERN_FLOOR.x);
      expect(l.pos.x).toBeLessThanOrEqual(LANTERN_FLOOR.x + LANTERN_FLOOR.w);
      expect(l.pos.y).toBeLessThan(LANTERN_FLOOR.y);
    }
  });
});

describe('the lanterns', () => {
  it('an owl lights the dark lantern nearest above it, once every little while', () => {
    const r = lightLantern(darkLanterns(), 'v_a', under(2), T0);
    expect(r).toMatchObject({ ok: true, id: 'lantern-3', full: null });
    const s = (r as { state: LanternState }).state;
    expect(lightLantern(s, 'v_a', under(3), T0 + 1000)).toEqual({ ok: false, reason: 'busy' });
    // Another owl may light the next one straight away; the same one picks the nearest still dark.
    const r2 = lightLantern(s, 'v_b', under(2), T0 + 1000);
    expect(r2).toMatchObject({ ok: true });
    expect((r2 as { id: string }).id).not.toBe('lantern-3');
    expect(lightLantern(darkLanterns(), 'v_a', { x: 2400, y: 760 }, T0)).toEqual({ ok: false, reason: 'far' });
    expect(lightLantern(darkLanterns(), 'v_a', { x: under(0).x, y: 600 }, T0)).toEqual({ ok: false, reason: 'far' });
  });

  it('a lantern burns out, and once the beam is all dark the round starts over', () => {
    const s = (lightLantern(darkLanterns(), 'v_a', under(0), T0) as { state: LanternState }).state;
    expect(Object.keys(lanternsAt(s, T0 + LANTERN_BURN_MS - 1).lit)).toEqual(['lantern-1']);
    expect(lanternsAt(s, T0 + LANTERN_BURN_MS)).toEqual(darkLanterns());
  });

  it('one owl alone can light the whole beam; it then glows and pays everyone who helped', () => {
    let s = darkLanterns();
    let full = null as string[] | null;
    LANTERNS.forEach((_, i) => {
      const r = lightLantern(s, 'v_a', under(i), T0 + i * LANTERN_EVERY_MS);
      expect(r.ok).toBe(true);
      if (r.ok) ({ state: s, full } = r);
    });
    // With time to walk along the beam between lanterns: at least five seconds to spare.
    expect(LANTERN_EVERY_MS * (LANTERNS.length - 1) + 5_000).toBeLessThan(LANTERN_BURN_MS);
    expect(full).toEqual(['v_a']);
    expect(s.glowUntil).toBe(T0 + 6 * LANTERN_EVERY_MS + LANTERN_GLOW_MS);
    expect(lightLantern(s, 'v_b', under(0), T0 + 20_000)).toEqual({ ok: false, reason: 'glowing' });
    expect(lanternsAt(s, s.glowUntil)).toEqual(darkLanterns());
    expect([lanternFeathers(1), lanternFeathers(3), lanternFeathers(20)]).toEqual([4, 6, 8]);
  });

  it('owls lighting together share the full beam', () => {
    let s = darkLanterns();
    let full = null as string[] | null;
    const owls = ['v_a', 'v_b', 'v_c'];
    LANTERNS.forEach((_, i) => {
      const r = lightLantern(s, owls[i % 3]!, under(i), T0 + Math.floor(i / 3) * LANTERN_EVERY_MS);
      if (r.ok) ({ state: s, full } = r);
    });
    expect(full?.sort()).toEqual(owls);
  });
});

describe('the stage quiz', () => {
  it('runs on the park clock: the same round for everyone, every question before any repeats', () => {
    const r = quizRoundAt(T0 + 12_345);
    expect(r).toEqual(quizRound(r.n));
    expect(r.startsAt).toBeLessThanOrEqual(T0 + 12_345);
    expect(r.revealAt - r.startsAt).toBe(QUIZ_OPEN_MS);
    expect(quizRoundAt(r.startsAt + QUIZ_EVERY_MS).n).toBe(r.n + 1);
    const seen = new Set(Array.from({ length: QUIZ_BANK.length }, (_, k) => quizRound(r.n + k).question));
    expect(seen.size).toBe(QUIZ_BANK.length);
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    expect(gcd(QUIZ_STRIDE, QUIZ_BANK.length)).toBe(1);
  });

  it('puts the right answer in a different zone from round to round', () => {
    const zones = new Set(Array.from({ length: 6 }, (_, k) => quizRound(1000 + k).right));
    expect(zones.size).toBe(3);
    for (let k = 0; k < 12; k++) {
      const r = quizRound(k);
      expect(r.order[QUIZ_ZONE_IDS.indexOf(r.right)]).toBe(0);
      expect([...r.order].sort()).toEqual([0, 1, 2]);
    }
  });

  it('reads an answer from where an owl stands', () => {
    expect(quizZoneAt(rectCenter(QUIZ_ZONES.b))).toBe('b');
    expect(quizZoneAt({ x: 3780, y: 800 })).toBeNull(); // between two zones
    for (const q of QUIZ_BANK) expect(new Set(q.answers).size).toBe(3);
  });
});

describe('fishing', () => {
  it('a fish bites after a while and stays on the hook a moment', () => {
    expect(biteDelay(() => 0)).toBe(BITE_AFTER_MS[0]);
    expect(biteDelay(() => 0.999999)).toBeLessThanOrEqual(BITE_AFTER_MS[1]);
    expect(reelOutcome(T0, T0 - 1000)).toBe('early');
    expect(reelOutcome(T0, T0 + 10)).toBe('caught');
    expect(reelOutcome(T0, T0 + BITE_WINDOW_MS + 1)).toBe('late');
    expect(reelOutcome(T0, T0 + BITE_WINDOW_MS + 200, 300)).toBe('caught');
  });

  it('what bites follows the table, golden koi rarely', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const f = rollFish(() => i / 1000);
      counts[f.id] = (counts[f.id] ?? 0) + 1;
    }
    const total = FISH.reduce((s, f) => s + f.weight, 0);
    for (const f of FISH) expect(counts[f.id]).toBe((f.weight / total) * 1000);
  });
});

describe("the robot owl's copy game", () => {
  it('plays tunes from the emotes the owl owns, the starter pair always among them', () => {
    expect(copyNotes(['hoot', 'flap'], Math.random)).toEqual([...COPY_BASE_EMOTES]);
    const notes = copyNotes(['hoot', 'flap', 'wave', 'dance', 'spin', 'nod'], seq(0, 0));
    expect(notes).toHaveLength(4);
    expect(notes.slice(0, 2)).toEqual(['hoot', 'flap']);
  });

  it('copying a tune pays and plays a longer one; a wrong or late note ends the game', () => {
    let g: CopyGame = startCopy(['hoot', 'flap'], seq(0.1, 0.9, 0.1, 0.9), T0);
    expect(g.tune).toHaveLength(COPY_FIRST);
    expect(copyNote(g, g.tune[0]!, Math.random, T0 + 100)).toMatchObject({ kind: 'early' });
    let now = g.listenUntil + 10;
    let step = copyNote(g, g.tune[0]!, Math.random, now);
    expect(step.kind).toBe('note');
    if (step.kind !== 'note') return;
    g = step.game;
    expect(copyNote(g, g.tune[1] === 'hoot' ? 'flap' : 'hoot', Math.random, now)).toMatchObject({ kind: 'wrong', level: 0, expected: g.tune[1] });
    expect(copyNote(g, g.tune[1]!, Math.random, now + COPY_WAIT_MS + 1)).toMatchObject({ kind: 'slow' });
    step = copyNote(g, g.tune[1]!, Math.random, now);
    if (step.kind !== 'note') throw new Error('expected a note');
    step = copyNote(step.game, step.game.tune[2]!, Math.random, now);
    expect(step).toMatchObject({ kind: 'tune', feathers: COPY_FEATHERS });
    if (step.kind !== 'tune') return;
    expect(step.game.tune).toHaveLength(COPY_FIRST + 1);
    expect(step.game.level).toBe(1);
    expect(step.game.listenUntil).toBe(now + step.game.tune.length * COPY_NOTE_MS + 400);
  });

  it('copying the longest tune wins the game', () => {
    let g = startCopy(['hoot', 'flap'], Math.random, T0);
    let result: ReturnType<typeof copyNote> | null = null;
    let now = T0;
    for (let guard = 0; guard < 100 && !result; guard++) {
      now = g.listenUntil;
      for (const note of g.tune) {
        const s = copyNote(g, note, Math.random, now);
        if (s.kind === 'note') g = s.game;
        else if (s.kind === 'tune') g = s.game;
        else {
          result = s;
          break;
        }
      }
    }
    expect(result).toEqual({ kind: 'won', level: COPY_LAST - COPY_FIRST + 1, feathers: COPY_FEATHERS + COPY_WIN_FEATHERS });
  });
});

describe('three small tasks a day', () => {
  it('the same three for everyone, one from each slot, never the same kind twice', () => {
    for (let d = 0; d < 60; d++) {
      const day = parkDay(T0 + d * 86_400_000);
      const tasks = dailyTasks(day);
      expect(dailyTasks(day)).toEqual(tasks);
      expect(tasks).toHaveLength(3);
      tasks.forEach((t, i) => expect(TASK_SLOTS[i]).toContain(t));
      expect(new Set(tasks.map((t) => t.kind)).size).toBe(3);
    }
    // Over a couple of months every task comes up.
    const seen = new Set(Array.from({ length: 90 }, (_, d) => dailyTasks(parkDay(T0 + d * 86_400_000))).flat());
    expect(seen.size).toBe(TASK_SLOTS.flat().length);
  });

  it('progress counts the right events, and finishes a task once', () => {
    const tasks = [
      { kind: 'light' as const, count: 2, text: '' },
      { kind: 'fish' as const, count: 1, text: '' },
      { kind: 'flop' as const, count: 2, text: '' },
    ];
    let p = taskProgress(tasks, [0, 0, 0], { kind: 'light' });
    expect(p).toEqual({ counts: [1, 0, 0], finished: [] });
    p = taskProgress(tasks, p.counts, { kind: 'light' });
    expect(p).toEqual({ counts: [2, 0, 0], finished: [0] });
    expect(taskProgress(tasks, p.counts, { kind: 'light' })).toEqual({ counts: [2, 0, 0], finished: [] });
    expect(taskProgress(tasks, p.counts, { kind: 'quiz' }).finished).toEqual([]);
  });

  it('the ledger pays each task and the bonus once, and caps activity feathers for the day', () => {
    const book = new CollectionBook(new MemoryCollectionStore());
    const tasks = dailyTasks(parkDay(T0));
    let last = book.taskEvent('c_a', { kind: tasks[0]!.kind }, T0);
    expect(last.tasks.tasks[0]!.done).toBe(1);
    for (const [i, t] of tasks.entries()) for (let k = i === 0 ? 1 : 0; k < t.count; k++) last = book.taskEvent('c_a', { kind: t.kind }, T0 + 1000);
    expect(last.tasks.bonus).toBe(true);
    expect(book.feathers('c_a', T0)).toBe(3 * TASK_FEATHERS + TASKS_BONUS);
    // Again: nothing more.
    expect(book.taskEvent('c_a', { kind: tasks[0]!.kind }, T0 + 2000).paid).toBe(0);
    // The next park day brings new tasks and a fresh count.
    expect(book.tasks('c_a', T0 + 86_400_000).tasks.every((t) => t.done === 0)).toBe(true);
    // Activity feathers share one cap a day.
    const before = book.feathers('c_a', T0);
    for (let i = 0; i < 20; i++) book.earnPlay('c_a', 4, T0);
    expect(book.feathers('c_a', T0) - before).toBe(PLAY_FEATHERS_PER_DAY);
    expect(book.earnPlay('c_a', 4, T0 + 86_400_000).added).toBe(4);
  });

  it('an activity pays under the cap and brings the tasks back only when it moved them', () => {
    const book = new CollectionBook(new MemoryCollectionStore());
    const tasks = dailyTasks(parkDay(T0));
    const counted = tasks[0]!.kind;
    const other = (['light', 'beam', 'fish', 'quiz', 'copy', 'flop', 'browse'] as const).find((k) => !tasks.some((t) => t.kind === k))!;
    expect(book.play('c_b', 3, { kind: other }, T0)).toEqual({ added: 3, total: 3 });
    const moved = book.play('c_b', 0, { kind: counted }, T0);
    expect(moved.added).toBe(0);
    expect(moved.tasks?.tasks.tasks[0]!.done).toBe(1);
    expect(book.play('c_b', 2, null, T0)).toEqual({ added: 2, total: 5 + (moved.tasks?.paid ?? 0) });
  });
});
