import { describe, expect, it } from 'vitest';
import { ArcadeBook, CollectionBook, MemoryCollectionStore, MemoryScoreStore, nextParkDayAt, parkDay, type PortraitLook, type ScoreRow, type ScoreStore } from '@owl-park/shared';
import { SqlScoreStore } from '../src/sqlScoreStore';
import { sqlStorage } from './sqlite';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const DAY = parkDay(MON);
const LOOK: PortraitLook = { body: '#2F3E5C', belly: '#E0D4F0', accent: '#FF2AA1', species: 'barn' };
const row = (cid: string, score: number, extra: Partial<ScoreRow> = {}): ScoreRow => ({ day: DAY, game: 'flight', cid, score, look: LOOK, at: MON, bonus: false, ...extra });

/** Both stores keep the same promises: in memory (the local mode) and the collections object's SQLite table. */
const STORES: Array<[string, () => ScoreStore]> = [
  ['memory', () => new MemoryScoreStore()],
  ['sqlite', () => new SqlScoreStore(sqlStorage())],
];

for (const [name, make] of STORES) {
  describe(`the score store (${name})`, () => {
    it('keeps one best per owl, game and day, and lists the best five first', () => {
      const s = make();
      [3, 9, 9, 1, 7, 12].forEach((score, i) => s.putScore(row(`c_owl${i}aaaa`, score, { at: MON + i })));
      s.putScore(row('c_owl0aaaa', 4, { at: MON + 10, bonus: true }));
      expect(s.top(DAY, 'flight', 5).map((r) => [r.cid, r.score])).toEqual([
        ['c_owl5aaaa', 12],
        ['c_owl1aaaa', 9],
        ['c_owl2aaaa', 9],
        ['c_owl4aaaa', 7],
        ['c_owl0aaaa', 4],
      ]);
      expect(s.bests(DAY, 'c_owl0aaaa')).toEqual([row('c_owl0aaaa', 4, { at: MON + 10, bonus: true })]);
      expect(s.top(DAY, 'crossing', 5)).toEqual([]);
    });

    it('leaves a score of 0 off the wall, and forgets earlier days at a new day’s first score', () => {
      const s = make();
      s.putScore(row('c_owlaaaaa', 0));
      expect(s.top(DAY, 'flight', 5)).toEqual([]);
      const next = parkDay(nextParkDayAt(MON) + 1000);
      s.putScore(row('c_owlbbbbb', 5, { day: next }));
      expect(s.bests(DAY, 'c_owlaaaaa')).toEqual([]);
      expect(s.top(next, 'flight', 5).map((r) => r.score)).toEqual([5]);
    });

    it('keeps one run per collector, the latest in place of the one before, until it is dropped (OP-137)', () => {
      const s = make();
      expect(s.openRun('c_owlaaaaa')).toBeNull();
      s.putRun({ cid: 'c_owlaaaaa', game: 'flight', seed: 7, startedAt: MON, bestBefore: null });
      s.putRun({ cid: 'c_owlbbbbb', game: 'sling', seed: 2 ** 32 - 1, startedAt: MON, bestBefore: 4 });
      s.putRun({ cid: 'c_owlaaaaa', game: 'crossing', seed: 8, startedAt: MON + 5, bestBefore: 3 });
      expect(s.openRun('c_owlaaaaa')).toEqual({ cid: 'c_owlaaaaa', game: 'crossing', seed: 8, startedAt: MON + 5, bestBefore: 3 });
      expect(s.openRun('c_owlbbbbb')).toEqual({ cid: 'c_owlbbbbb', game: 'sling', seed: 2 ** 32 - 1, startedAt: MON, bestBefore: 4 });
      s.dropRun('c_owlaaaaa');
      expect(s.openRun('c_owlaaaaa')).toBeNull();
      expect(s.openRun('c_owlbbbbb')).not.toBeNull();
    });

    it('settles runs the same way as the book’s memory store', () => {
      const arcade = new ArcadeBook(make(), new CollectionBook(new MemoryCollectionStore()));
      arcade.start('c_owlaaaaa', 'sling', 1, MON - 60_000);
      arcade.start('c_owlbbbbb', 'sling', 2, MON - 60_000);
      const a = arcade.finish('c_owlaaaaa', { game: 'sling', score: 9, shots: 5 }, 1, LOOK, MON);
      expect(a.ok && a.paid).toMatchObject({ best: true, top: true, mine: { sling: 9 } });
      const b = arcade.finish('c_owlbbbbb', { game: 'sling', score: 9, shots: 5 }, 2, LOOK, MON + 1);
      expect(b.ok && b.paid).toMatchObject({ best: true, top: false });
      expect(arcade.wall('sling', MON).top.map((e) => e.score)).toEqual([9, 9]);
    });
  });
}

describe('the score table', () => {
  it('reads broken colours as a plain owl rather than failing', () => {
    const sql = sqlStorage();
    const s = new SqlScoreStore(sql);
    s.putScore(row('c_owlaaaaa', 6));
    sql.exec(`UPDATE arcade_scores SET look = 'not json'`);
    expect(s.top(DAY, 'flight', 5)[0]!.look).toEqual({ body: '#8A6A4A', belly: '#F6F1E3', accent: '#C9A227' });
  });
});
