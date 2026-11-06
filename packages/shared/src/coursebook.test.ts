import { describe, expect, it } from 'vitest';
import { COURSES, ROOMS } from '../rooms';
import { TRIAL_COURSE } from '../rooms/trialCourse';
import { CANOPY_COURSE } from '../rooms/updraftCanopy';
import { PLAY_FEATHERS_PER_DAY } from './activities';
import { CollectionBook, MemoryCollectionStore } from './book';
import { GOLDEN_MOUSE } from './collectibles';
import { COURSE_FIRST_FEATHERS, COURSE_REPEAT_FEATHERS, COURSE_RUN_MAX_MS, LOST_FEATHERS, courseProblems, holdsDash, inPit, inThorns, mouseCourses, openerAt, shutShortcuts, type CourseDef } from './course';
import { CourseBook, MemoryCourseStore } from './coursebook';
import { nextParkDayAt } from './parktime';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const CID = 'c_owlaaaaa';
const rooms = (id: string) => ROOMS[id];

function setup(store = new MemoryCourseStore(), coll = new MemoryCollectionStore()) {
  const book = new CollectionBook(coll);
  return { store, book, coll, courses: new CourseBook(store, book, COURSES, rooms) };
}

/** A run through every act from `t`: started at the gate, each bell rung, the shrine reached `ms` later. */
function run(courses: CourseBook, t: number, ms = 30_000, practice = false) {
  expect(courses.start(CID, 'trail-1', t, practice).ok).toBe(true);
  expect(courses.reach(CID, 'trail-1', 'part', 'bell-1', t + 1000).ok).toBe(true);
  expect(courses.reach(CID, 'trail-2', 'part', 'bell-2', t + 2000).ok).toBe(true);
  expect(courses.reach(CID, 'trail-3', 'part', 'bell-3', t + 3000).ok).toBe(true);
  return courses.finish(CID, 'trail-3', t + ms, practice);
}

const owns = (book: CollectionBook, v: string) => book.inventory(CID, 'America/New_York', MON).owned.includes(v);

describe('the test course (OP-224)', () => {
  it('uses every part of the course kit and has nothing wrong with it', () => {
    expect(courseProblems(TRIAL_COURSE, rooms)).toEqual([]);
    const pieces = TRIAL_COURSE.acts.map((id) => ROOMS[id]!.course!);
    expect(pieces.flatMap((c) => c.feathers ?? []).length).toBe(LOST_FEATHERS);
    expect(pieces.some((c) => (c.shortcuts ?? []).length > 0)).toBe(true);
    expect(pieces.every((c) => (c.pits ?? []).length > 0 && (c.benches ?? []).length > 0)).toBe(true);
    for (const id of [...TRIAL_COURSE.acts, TRIAL_COURSE.gate.room]) expect(ROOMS[id]?.keeperOnly, id).toBe(true);
  });

  it('is reached from no room visitors walk', () => {
    const trail = new Set([...TRIAL_COURSE.acts, TRIAL_COURSE.gate.room]);
    for (const id of trail) expect(ROOMS[id]!.keeperOnly, id).toBe(true);
    // The keepers' rooms (the Updraft Canopy's too, whose trail gate stands in the trailhead for now) may lead here.
    for (const room of Object.values(ROOMS)) {
      if (trail.has(room.id) || room.keeperOnly) continue;
      for (const d of room.doors) expect(trail.has(d.to?.room ?? ''), `${room.id}:${d.id}`).toBe(false);
    }
  });

  it('gives the dash in its acts only: the trail gate grants it, the exit takes it away', () => {
    expect(holdsDash(ROOMS['trail-head'])).toBe(false);
    for (const id of TRIAL_COURSE.acts) expect(holdsDash(ROOMS[id]), id).toBe(true);
    expect(holdsDash(ROOMS['hub'])).toBe(false);
    const exit = ROOMS['trail-3']!.doors.find((d) => d.id === TRIAL_COURSE.exit.door)!;
    expect(holdsDash(ROOMS[exit.to!.room])).toBe(false);
  });

  it('finds courseProblems in a broken course', () => {
    const broken = { ...TRIAL_COURSE, acts: ['trail-2', 'trail-1'], gold: { ms: 1000, item: 'sparkle~9' } };
    const problems = courseProblems(broken, rooms);
    expect(problems.some((p) => p.includes('is not act 1'))).toBe(true);
    expect(problems.some((p) => p.includes('gold time'))).toBe(true);
  });
});

describe('the course book: runs and checkpoints', () => {
  it('starts a run in the first act only', () => {
    const { courses } = setup();
    expect(courses.start(CID, 'trail-2', MON)).toEqual({ ok: false, reason: 'unknown' });
    expect(courses.start(CID, 'hub', MON)).toEqual({ ok: false, reason: 'unknown' });
    const r = courses.start(CID, 'trail-1', MON);
    expect(r.ok && r.view.run).toEqual({ ms: 0, parts: [], bench: null });
  });

  it('counts benches and parts only in a run', () => {
    const { courses } = setup();
    expect(courses.reach(CID, 'trail-1', 'bench', 'b1', MON)).toEqual({ ok: false, reason: 'idle' });
    expect(courses.reach(CID, 'trail-1', 'part', 'bell-1', MON)).toEqual({ ok: false, reason: 'idle' });
    expect(courses.reach(CID, 'trail-1', 'part', 'bell-9', MON)).toEqual({ ok: false, reason: 'unknown' });
    courses.start(CID, 'trail-1', MON);
    expect(courses.reach(CID, 'trail-1', 'part', 'bell-1', MON + 1)).toMatchObject({ ok: true, first: true });
    expect(courses.reach(CID, 'trail-1', 'part', 'bell-1', MON + 2)).toMatchObject({ ok: true, first: false });
  });

  it('sends a fall back to the last bench reached in that room, else the act’s way in', () => {
    const { courses } = setup();
    courses.start(CID, 'trail-1', MON);
    expect(courses.fall(CID, 'trail-1', MON + 1)).toMatchObject({ ok: true, at: ROOMS['trail-1']!.spawns['from-gate'] });
    courses.reach(CID, 'trail-1', 'bench', 'b1', MON + 2);
    courses.reach(CID, 'trail-1', 'bench', 'b2', MON + 3);
    expect(courses.fall(CID, 'trail-1', MON + 4)).toMatchObject({ ok: true, at: { x: 1020, y: 450 } });
    // In the next act, its own way in until a bench there is reached.
    expect(courses.fall(CID, 'trail-2', MON + 5)).toMatchObject({ ok: true, at: ROOMS['trail-2']!.spawns['default'] });
    courses.reach(CID, 'trail-2', 'bench', 'b4', MON + 6);
    expect(courses.fall(CID, 'trail-2', MON + 7)).toMatchObject({ ok: true, at: { x: 960, y: 450 } });
  });

  it('reads thorns hanging in a side-view act as a fall at any height inside them, and nowhere else', () => {
    const act = { course: { id: 'x', act: 1, thorns: [{ id: 'h1', x0: 1960, x1: 2020, z0: 260, z1: 940 }] } };
    expect(inThorns(act, 1990, 300)).toBe(true);
    expect(inThorns(act, 1990, 940)).toBe(true);
    expect(inThorns(act, 1990, 250)).toBe(false);
    expect(inThorns(act, 2030, 300)).toBe(false);
    expect(inThorns({}, 1990, 300)).toBe(false);
  });

  it('reads a pit as a fall, a shut shortcut as floor no owl crosses, and its opener from the far side', () => {
    const one = ROOMS['trail-1'];
    expect(inPit(one, { x: 800, y: 600 })).toBe(true);
    expect(inPit(one, { x: 300, y: 600 })).toBe(false);
    const two = ROOMS['trail-2'];
    expect(shutShortcuts(two, new Set())).toHaveLength(1);
    expect(shutShortcuts(two, new Set(['bridge']))).toHaveLength(0);
    expect(openerAt(two, { x: 830, y: 720 }, new Set())?.id).toBe('bridge');
    expect(openerAt(two, { x: 830, y: 720 }, new Set(['bridge']))).toBeUndefined();
    expect(openerAt(two, { x: 500, y: 720 }, new Set())).toBeUndefined();
  });
});

describe('the course book: shortcuts and lost feathers stay with the owl', () => {
  it('keeps a shortcut open for good, through the store’s saved state and in later runs', () => {
    const first = setup();
    expect(first.courses.open(CID, 'trail-2', 'bridge', MON)).toMatchObject({ ok: true, first: true });
    expect(first.courses.open(CID, 'trail-2', 'nope', MON)).toEqual({ ok: false, reason: 'unknown' });
    const saved = JSON.parse(JSON.stringify(first.store.snapshot()));
    const later = setup(MemoryCourseStore.from(saved));
    const s = later.courses.state(CID, 'trail-1', MON + 86_400_000);
    expect(s.ok && s.view.shortcuts).toEqual(['bridge']);
    expect(later.courses.open(CID, 'trail-2', 'bridge', MON + 86_400_000)).toMatchObject({ ok: true, first: false });
    run(later.courses, MON + 86_400_000);
    const after = later.courses.state(CID, 'trail-2', MON + 86_400_000 + 60_000);
    expect(after.ok && after.view.shortcuts).toEqual(['bridge']);
  });

  it('finds each lost feather once, run or no run', () => {
    const { courses, store } = setup();
    expect(courses.reach(CID, 'trail-1', 'feather', 'f1', MON)).toMatchObject({ ok: true, first: true });
    expect(courses.reach(CID, 'trail-1', 'feather', 'f1', MON + 1)).toMatchObject({ ok: true, first: false });
    const r = courses.reach(CID, 'trail-3', 'feather', 'f4', MON + 2);
    expect(r.ok && r.view.feathers).toEqual(['f1', 'f4']);
    const again = setup(MemoryCourseStore.from(JSON.parse(JSON.stringify(store.snapshot()))));
    const s = again.courses.state(CID, 'trail-2', MON + 3);
    expect(s.ok && s.view.feathers).toEqual(['f1', 'f4']);
  });

  it('cleans what it reads from storage: a bad list reads as empty, a row with no owl is skipped', () => {
    const store = MemoryCourseStore.from({ courses: [{ cid: CID, course: 'trail', feathers: 'nope', shortcuts: ['bridge', 7] }, null, { course: 'trail' }], runs: [{ cid: 3 }] });
    expect(store.courses(CID)).toEqual([{ cid: CID, course: 'trail', clearedAt: null, bestMs: null, gold: false, emote: false, feathers: [], shortcuts: ['bridge'], repeatDay: '', repeatPaid: 0 }]);
    expect(store.run(CID)).toBeNull();
  });
});

describe('the course book: the finish shrine pays once, then a little each day', () => {
  it('refuses a finish with no run, with parts left, too fast or too long ago', () => {
    const { courses } = setup();
    expect(courses.finish(CID, 'trail-3', MON)).toEqual({ ok: false, reason: 'idle' });
    expect(courses.finish(CID, 'trail-2', MON)).toEqual({ ok: false, reason: 'unknown' });
    courses.start(CID, 'trail-1', MON);
    courses.reach(CID, 'trail-1', 'part', 'bell-1', MON + 1);
    expect(courses.finish(CID, 'trail-3', MON + 20_000)).toEqual({ ok: false, reason: 'parts' });
    courses.reach(CID, 'trail-2', 'part', 'bell-2', MON + 2);
    courses.reach(CID, 'trail-3', 'part', 'bell-3', MON + 3);
    expect(courses.finish(CID, 'trail-3', MON + TRIAL_COURSE.floorMs - 1)).toEqual({ ok: false, reason: 'too-fast' });
    expect(courses.finish(CID, 'trail-3', MON + COURSE_RUN_MAX_MS + 1)).toEqual({ ok: false, reason: 'forgotten' });
    expect(courses.finish(CID, 'trail-3', MON + COURSE_RUN_MAX_MS + 2)).toEqual({ ok: false, reason: 'idle' });
  });

  it('pays the first clear the course’s item and 50 feathers, once', () => {
    const { courses, book } = setup();
    const before = book.feathers(CID, MON);
    const r = run(courses, MON, 90_000);
    expect(r.ok && r.paid).toMatchObject({ first: true, best: true, feathers: COURSE_FIRST_FEATHERS, item: TRIAL_COURSE.item, total: before + COURSE_FIRST_FEATHERS });
    expect(r.ok && r.paid.gold).toBeUndefined();
    expect(owns(book, TRIAL_COURSE.item)).toBe(true);
    const again = run(courses, MON + 120_000, 90_000);
    expect(again.ok && again.paid.first).toBe(false);
    expect(again.ok && again.paid.item).toBeUndefined();
    expect(again.ok && again.paid.feathers).toBe(COURSE_REPEAT_FEATHERS);
  });

  it('pays later clears up to 10 feathers a park day, then nothing until the next', () => {
    const { courses } = setup();
    run(courses, MON);
    const second = run(courses, MON + 60_000);
    expect(second.ok && second.paid).toMatchObject({ first: false, feathers: COURSE_REPEAT_FEATHERS });
    const third = run(courses, MON + 120_000);
    expect(third.ok && third.paid).toMatchObject({ feathers: 0, why: 'paid-today' });
    const tomorrow = nextParkDayAt(MON) + 60_000;
    const next = run(courses, tomorrow);
    expect(next.ok && next.paid).toMatchObject({ feathers: COURSE_REPEAT_FEATHERS });
  });

  it('shares the activities’ day cap for later clears', () => {
    const { courses, book } = setup();
    run(courses, MON);
    book.play(CID, PLAY_FEATHERS_PER_DAY - 4, null, MON + 1000);
    const capped = run(courses, MON + 60_000);
    expect(capped.ok && capped.paid).toMatchObject({ feathers: 4, why: 'capped' });
  });

  it('pays the gold sparkle once, for a clear within the gold time', () => {
    const { courses, book } = setup();
    const slow = run(courses, MON, TRIAL_COURSE.gold.ms + 1);
    expect(slow.ok && slow.paid.gold).toBeUndefined();
    const quick = run(courses, MON + 120_000, TRIAL_COURSE.gold.ms);
    expect(quick.ok && quick.paid).toMatchObject({ gold: TRIAL_COURSE.gold.item, best: true });
    expect(owns(book, TRIAL_COURSE.gold.item)).toBe(true);
    const quicker = run(courses, MON + 240_000, TRIAL_COURSE.gold.ms - 5000);
    expect(quicker.ok && quicker.paid.gold).toBeUndefined();
    expect(quicker.ok && quicker.paid.best).toBe(true);
    const st = courses.state(CID, 'trail-1', MON + 400_000);
    expect(st.ok && st.view.bestMs).toBe(TRIAL_COURSE.gold.ms - 5000);
  });

  it('pays the course’s emote once, at the shrine, once all five lost feathers are found', () => {
    const { courses, book } = setup();
    for (const [room, f] of [['trail-1', 'f1'], ['trail-1', 'f2'], ['trail-2', 'f3'], ['trail-3', 'f4']] as const) courses.reach(CID, room, 'feather', f, MON);
    const four = run(courses, MON);
    expect(four.ok && four.paid.emote).toBeUndefined();
    courses.reach(CID, 'trail-3', 'feather', 'f5', MON + 50_000);
    const five = run(courses, MON + 60_000);
    expect(five.ok && five.paid.emote).toBe(TRIAL_COURSE.emote);
    expect(owns(book, TRIAL_COURSE.emote)).toBe(true);
    const six = run(courses, MON + 120_000);
    expect(six.ok && six.paid.emote).toBeUndefined();
  });

  it('pays a spectator’s clear nothing, and leaves its rewards to earn (OP-191)', () => {
    const { courses, book } = setup();
    const before = book.feathers(CID, MON);
    const r = run(courses, MON, 30_000, true);
    expect(r.ok && r.paid).toMatchObject({ practice: true, feathers: 0, first: false });
    expect(book.feathers(CID, MON + 30_000)).toBe(before);
    expect(owns(book, TRIAL_COURSE.item)).toBe(false);
    const board = courses.board(CID, MON + 31_000, true);
    expect(board[0]).toMatchObject({ course: 'trail', cleared: false, left: { first: true, gold: true, emote: true } });
  });

  it('shows the course board: what is cleared, the best time and what is left (keeper courses only when asked)', () => {
    const { courses } = setup();
    expect(courses.board(CID, MON)).toEqual([]);
    run(courses, MON, 45_000);
    const [row] = courses.board(CID, MON + 50_000, true);
    expect(row).toMatchObject({ course: 'trail', cleared: true, bestMs: 45_000, left: { first: false, gold: false, emote: true, today: COURSE_REPEAT_FEATHERS } });
    run(courses, MON + 60_000);
    expect(courses.board(CID, MON + 100_000, true)[0]?.left.today).toBe(0);
  });
});

describe('the Golden Mouse: clearing every course pays it, once', () => {
  const cleared = (course: string, at: number) => ({ cid: CID, course, clearedAt: at, bestMs: 60_000, gold: false, emote: false, feathers: [], shortcuts: [], repeatDay: '', repeatPaid: 0 });
  /** The test course standing in for an open course, beside another course already cleared or not. */
  function withTwo(otherCleared: boolean) {
    const store = new MemoryCourseStore();
    if (otherCleared) store.putCourse(cleared(CANOPY_COURSE.id, MON - 1000));
    const book = new CollectionBook(new MemoryCollectionStore());
    const { test: _test, keeper: _keeper, ...open } = TRIAL_COURSE;
    const { keeper: _k, ...canopy } = CANOPY_COURSE;
    const defs: Record<string, CourseDef> = { [open.id]: open, [canopy.id]: canopy };
    return { book, courses: new CourseBook(store, book, defs, rooms) };
  }

  it('counts the open courses, the test course aside; while none is open, every course but the test course', () => {
    const ids = (defs: readonly CourseDef[]) => mouseCourses(defs).map((d) => d.id);
    expect(ids(Object.values(COURSES))).not.toContain(TRIAL_COURSE.id);
    expect(ids(Object.values(COURSES)).sort()).toEqual(Object.values(COURSES).filter((d) => !d.test).map((d) => d.id).sort());
    const { keeper: _k, ...canopyOpen } = CANOPY_COURSE;
    expect(ids([TRIAL_COURSE, canopyOpen, ...Object.values(COURSES).filter((d) => d.id !== CANOPY_COURSE.id)])).toEqual([CANOPY_COURSE.id]);
    expect(ids([TRIAL_COURSE])).toEqual([]);
  });

  it('pays the Mouse on the clear that leaves every course cleared, and never again', () => {
    const { courses, book } = withTwo(true);
    const r = run(courses, MON, 45_000);
    expect(r.ok && r.paid.mouse).toBe(GOLDEN_MOUSE);
    expect(owns(book, GOLDEN_MOUSE)).toBe(true);
    const again = run(courses, MON + 60_000, 45_000);
    expect(again.ok && again.paid.mouse).toBeUndefined();
  });

  it('holds the Mouse back while a course is left to clear', () => {
    const { courses, book } = withTwo(false);
    const r = run(courses, MON, 45_000);
    expect(r.ok && r.paid.first).toBe(true);
    expect(r.ok && r.paid.mouse).toBeUndefined();
    expect(owns(book, GOLDEN_MOUSE)).toBe(false);
  });

  it('counts nothing for the test course, and pays a spectator nothing', () => {
    const { courses, book } = setup();
    const r = run(courses, MON, 45_000);
    expect(r.ok && r.paid.mouse).toBeUndefined();
    const watch = withTwo(true);
    const p = run(watch.courses, MON, 45_000, true);
    expect(p.ok && p.paid).toMatchObject({ practice: true });
    expect(p.ok && p.paid.mouse).toBeUndefined();
    expect(owns(book, GOLDEN_MOUSE) || owns(watch.book, GOLDEN_MOUSE)).toBe(false);
  });
});
