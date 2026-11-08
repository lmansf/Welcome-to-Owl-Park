import { describe, expect, it } from 'vitest';
import { COURSE_FIRST_FEATHERS, CollectionBook, CourseBook, MemoryCollectionStore, MemoryCourseStore, type CourseStore } from '@owl-park/shared';
import { COURSES, ROOMS } from '@owl-park/shared/rooms';
import { SqlCourseStore } from '../src/sqlCourseStore';
import { sqlStorage } from './sqlite';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const CID = 'c_owlaaaaa';

/** Both stores keep the same promises: in memory (the local mode) and the collections object's SQLite tables (OP-224). */
const STORES: Array<[string, () => CourseStore]> = [
  ['memory', () => new MemoryCourseStore()],
  ['sqlite', () => new SqlCourseStore(sqlStorage())],
];

for (const [name, make] of STORES) {
  describe(`the course store (${name})`, () => {
    it('keeps one row per owl and course, and one run per owl, the newest replacing the last', () => {
      const s = make();
      expect(s.course(CID, 'trail')).toBeNull();
      expect(s.run(CID)).toBeNull();
      const row = { cid: CID, course: 'trail', clearedAt: MON, bestMs: 42_000, gold: true, emote: false, feathers: ['f1', 'f3'], shortcuts: ['bridge'], repeatDay: '2026-10-19', repeatPaid: 10 };
      s.putCourse(row);
      s.putCourse({ ...row, cid: 'c_owlbbbbb', feathers: [] });
      expect(s.course(CID, 'trail')).toEqual(row);
      expect(s.courses(CID)).toEqual([row]);
      s.putRun({ cid: CID, course: 'trail', startedAt: MON, parts: ['bell-1'], bench: { id: 'b2', room: 'trail-1' } });
      expect(s.run(CID)).toEqual({ cid: CID, course: 'trail', startedAt: MON, parts: ['bell-1'], bench: { id: 'b2', room: 'trail-1' } });
      s.putRun({ cid: CID, course: 'trail', startedAt: MON + 5, parts: [], bench: null, practice: true });
      expect(s.run(CID)).toEqual({ cid: CID, course: 'trail', startedAt: MON + 5, parts: [], bench: null, practice: true });
      s.dropRun(CID);
      expect(s.run(CID)).toBeNull();
    });

    it('settles a clear the same way as the book’s memory store, once only', () => {
      const book = new CollectionBook(new MemoryCollectionStore());
      const courses = new CourseBook(make(), book, COURSES, (id) => ROOMS[id]);
      courses.open(CID, 'trail-2', 'bridge', MON);
      const clear = (t: number) => {
        courses.start(CID, 'trail-1', t);
        for (const [room, bell] of [['trail-1', 'bell-1'], ['trail-2', 'bell-2'], ['trail-3', 'bell-3']] as const) courses.reach(CID, room, 'part', bell, t + 1000);
        return courses.finish(CID, 'trail-3', t + 30_000);
      };
      expect(clear(MON)).toMatchObject({ ok: true, paid: { first: true, feathers: COURSE_FIRST_FEATHERS, gold: 'sparkle~9' } });
      expect(clear(MON + 60_000)).toMatchObject({ ok: true, paid: { first: false, feathers: 10 } });
      const again = clear(MON + 120_000);
      expect(again.ok && again.paid).toMatchObject({ feathers: 0, why: 'paid-today' });
      expect(again.ok && again.paid.gold).toBeUndefined();
      expect(again.ok && again.view.shortcuts).toEqual(['bridge']);
    });
  });
}
