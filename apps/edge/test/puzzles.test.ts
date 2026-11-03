import { describe, expect, it } from 'vitest';
import { PuzzleBook, getPuzzle, layoutRun, parkMonth, type PuzzleSpots } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { SqlPuzzleStore } from '../src/sqlPuzzleStore';
import { sqlStorage } from './sqlite';

/** 2026-11-03 12:00 Eastern. */
const NOW = Date.UTC(2026, 10, 3, 17, 0, 0);
const MONTH = parkMonth(NOW);
const SPOTS: PuzzleSpots = Object.fromEntries(Object.values(ROOMS).map((r) => [r.id, r.spots ?? []]));

describe('SqlPuzzleStore (OP-255)', () => {
  it('keeps a run and each owl’s own progress across a fresh object, and forgets an older month', () => {
    const sql = sqlStorage();
    let n = 0;
    const deps = { newSeed: () => `seed${++n}`, newId: () => `run${n}` };
    const book = new PuzzleBook(new SqlPuzzleStore(sql), SPOTS, deps);
    expect(book.start('c_ann', 'lockbox', MONTH, NOW).ok).toBe(true);
    expect(book.join('c_bob', 'c_ann', 'lockbox', MONTH, NOW).ok).toBe(true);
    const store = new SqlPuzzleStore(sql);
    const run = store.run('run1')!;
    expect(run).toMatchObject({ id: 'run1', seed: 'seed1', host: 'c_ann', members: ['c_ann', 'c_bob'], opened: [], misses: {} });
    // Open the latch from a fresh book over the same storage, as an evicted object would.
    const again = new PuzzleBook(new SqlPuzzleStore(sql), SPOTS, deps);
    const lay = layoutRun(getPuzzle('lockbox')!, run.seed, SPOTS)[0]!;
    lay.hidden.forEach((h, i) => expect(again.look('c_bob', 'lockbox', 'bark-latch', i, h.room, h, h.top ?? 0, MONTH, NOW).ok).toBe(true));
    const res = again.open('c_ann', 'lockbox', 'bark-latch', lay.code, lay.post.room, lay.post, lay.post.top ?? 0, MONTH, NOW);
    expect(res).toMatchObject({ ok: true, credited: ['c_ann', 'c_bob'] });
    expect(store.progress('c_bob', 'lockbox', MONTH)).toEqual({ cid: 'c_bob', puzzle: 'lockbox', period: MONTH, opened: ['bark-latch'], run: 'run1' });
    expect(store.run('run1')!.found).toHaveLength(3);
    store.dropStale('lockbox', 'M2026-12');
    expect(store.run('run1')).toBeNull();
    expect(store.progress('c_bob', 'lockbox', MONTH)).toBeNull();
  });

  it('reads garbage in a stored list as empty, never as a crash', () => {
    const sql = sqlStorage();
    const store = new SqlPuzzleStore(sql);
    sql.exec(`INSERT INTO puzzle_runs (id, puzzle, period, seed, host, members, opened, found, keys, misses, created_at) VALUES ('r', 'lockbox', 'M', 's', 'h', 'nope', '[1,"a"]', '{}', '[]', '[]', 0)`);
    expect(store.run('r')).toMatchObject({ members: [], opened: ['a'], found: [], misses: {} });
  });
});
