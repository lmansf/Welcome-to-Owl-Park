/**
 * The courses' book (OP-224, course.ts): per owl and course, what it has done there for good (cleared,
 * its best time, the once-only rewards paid, the lost feathers found, the shortcuts opened), and per
 * owl the one run under way. Kept in a store beside the owl's collection (the collections object's
 * SQLite on the room server, sqlCourseStore.ts; this browser's storage in the local mode), as the
 * climb's runs are (climbbook.ts), and written without platform APIs so both run the same rules.
 *
 * The room server decides every reward here: a page only asks, and where the owl stands is the
 * caller's to check before it asks the book (the room object's `reaches`, the local mode's own
 * reckoning), as the quests' gather is. A spectator's run (OP-191) is practice: its lost feathers and
 * shortcuts are kept, as its quests' progress would be, but its finish pays nothing and clears nothing.
 *
 * TODO-DOCS (OP-224): docs/ARCHITECTURE.md gains the course kit: course.ts, coursebook.ts, dash.ts, the
 * `course` and `dash` frames (edge.ts), and the collections object's course tables.
 */
import type { CollectionBook } from './book';
import { GOLDEN_MOUSE } from './collectibles';
import { COURSE_FIRST_FEATHERS, COURSE_REPEAT_DAILY, COURSE_REPEAT_FEATHERS, COURSE_RUN_MAX_MS, LOST_FEATHERS, courseParts, coursePieces, courseRoomIds, mouseCourses, pieceIn, shortcutIn, type CourseDef, type PieceKind } from './course';
import { parkDay } from './parktime';
import type { Vec2 } from './protocol';
import { findSpawn, type RoomDef } from './room';
import { isObj } from './validate';

/** What an owl has done in one course for good. */
export interface CourseRow {
  cid: string;
  course: string;
  /** When it first cleared the course (ms); null until it has. */
  clearedAt: number | null;
  /** Its best clear (ms). */
  bestMs: number | null;
  /** The gold item is paid. */
  gold: boolean;
  /** The course's emote is paid. */
  emote: boolean;
  /** The lost feathers it has found, and the shortcuts it has opened. */
  feathers: string[];
  shortcuts: string[];
  /** The park day of its later clears' feathers, and what they paid that day. */
  repeatDay: string;
  repeatPaid: number;
}

/** The run under way: one per owl, whichever course. */
export interface CourseRunRow {
  cid: string;
  course: string;
  startedAt: number;
  /** The objective's parts reached in this run. */
  parts: string[];
  /** The last bench reached in this run, and its room. */
  bench: { id: string; room: string } | null;
  /** A spectator's run (OP-191): its finish pays nothing. */
  practice?: true;
}

export interface CourseStore {
  course(cid: string, course: string): CourseRow | null;
  /** Insert or replace by (cid, course). */
  putCourse(row: CourseRow): void;
  courses(cid: string): CourseRow[];
  run(cid: string): CourseRunRow | null;
  /** Insert or replace the owl's run. */
  putRun(row: CourseRunRow): void;
  dropRun(cid: string): void;
}

/** An owl's course as its page is told it, on arrival in an act and with every answer. */
export interface CourseView {
  course: string;
  /** The run under way in this course: how long since it started (ms), the parts reached and the last bench. */
  run: { ms: number; parts: string[]; bench: string | null; practice?: true } | null;
  feathers: string[];
  shortcuts: string[];
  cleared: boolean;
  bestMs: number | null;
}

/** What the finish shrine paid. */
export interface CoursePaid {
  /** The clear's time (ms), and whether it is the owl's best. */
  ms: number;
  best: boolean;
  /** The owl's first clear of this course. */
  first: boolean;
  /** Feathers added, and the balance. */
  feathers: number;
  total: number;
  /** Granted now: the course's item (first clear), the gold item, the emote. */
  item?: string;
  gold?: string;
  emote?: string;
  /** The Golden Mouse, granted now: this clear leaves the owl with every course cleared (mouseCourses). */
  mouse?: string;
  /** A later clear that paid less than COURSE_REPEAT_FEATHERS: today's are paid already, or the activities' daily cap is reached. */
  why?: 'paid-today' | 'capped';
  /** A spectator's clear (OP-191): it paid nothing. */
  practice?: true;
}

/** Why the book would not do what a page asked. */
export type CourseRefusal = 'unknown' | 'idle' | 'parts' | 'too-fast' | 'forgotten';

export type CourseAnswer = { ok: true; view: CourseView } | { ok: false; reason: CourseRefusal };
export type ReachAnswer = { ok: true; view: CourseView; first: boolean } | { ok: false; reason: CourseRefusal };
/** Where a fall takes the owl: `at` on the floor, or up on the bench's ledge `top` high when the bench stands on one. */
export type FallAnswer = { ok: true; view: CourseView; at: Vec2; top?: number } | { ok: false; reason: CourseRefusal };
export type FinishAnswer = { ok: true; view: CourseView; paid: CoursePaid } | { ok: false; reason: CourseRefusal };

/** One course on the course board (for a Commons to show): what the owl has cleared, its best, what is left to earn. */
export interface CourseBoardRow {
  course: string;
  cleared: boolean;
  bestMs: number | null;
  /** Lost feathers found, of LOST_FEATHERS. */
  feathers: number;
  /** Rewards still to be had: the first clear's, the gold item, the emote, and the later clears' feathers today. */
  left: { first: boolean; gold: boolean; emote: boolean; today: number };
}

const blankRow = (cid: string, course: string): CourseRow => ({ cid, course, clearedAt: null, bestMs: null, gold: false, emote: false, feathers: [], shortcuts: [], repeatDay: '', repeatPaid: 0 });

/** What a later clear may still pay today. */
function repeatLeft(row: CourseRow | null, day: string): number {
  const paid = row && row.repeatDay === day ? row.repeatPaid : 0;
  return Math.max(0, COURSE_REPEAT_DAILY - paid);
}

/**
 * The course board: per course, what this owl has cleared, its best time and the rewards left. A pure
 * reading of its rows, for a Commons to show; keeper courses are left out unless asked for.
 */
export function courseBoard(defs: readonly CourseDef[], rows: readonly CourseRow[], now: number, keepers = false): CourseBoardRow[] {
  const day = parkDay(now);
  return defs
    .filter((d) => keepers || !d.keeper)
    .map((d) => {
      const row = rows.find((r) => r.course === d.id) ?? null;
      const cleared = row?.clearedAt != null;
      const feathers = row?.feathers.length ?? 0;
      return {
        course: d.id,
        cleared,
        bestMs: row?.bestMs ?? null,
        feathers,
        left: { first: !cleared, gold: !row?.gold, emote: !row?.emote, today: cleared ? Math.min(COURSE_REPEAT_FEATHERS, repeatLeft(row, day)) : 0 },
      };
    });
}

export class CourseBook {
  constructor(
    private readonly store: CourseStore,
    private readonly book: CollectionBook,
    private readonly courses: Readonly<Record<string, CourseDef>>,
    private readonly rooms: (id: string) => RoomDef | undefined,
  ) {}

  /** The course a room is an act of, with the room. */
  private where(roomId: string): { def: CourseDef; room: RoomDef } | null {
    const room = this.rooms(roomId);
    const id = room?.course?.id;
    const def = id !== undefined && Object.hasOwn(this.courses, id) ? this.courses[id] : undefined;
    return room && def && courseRoomIds(def).includes(roomId) ? { def, room } : null;
  }

  /** The owl's run, if it is in this course and not forgotten (a forgotten one is let go). */
  private runIn(cid: string, course: string, now: number): CourseRunRow | null {
    const run = this.store.run(cid);
    if (!run) return null;
    if (now - run.startedAt > COURSE_RUN_MAX_MS) {
      this.store.dropRun(cid);
      return null;
    }
    return run.course === course ? run : null;
  }

  private view(cid: string, course: string, now: number): CourseView {
    const row = this.store.course(cid, course);
    const run = this.runIn(cid, course, now);
    return {
      course,
      run: run ? { ms: now - run.startedAt, parts: [...run.parts], bench: run.bench?.id ?? null, ...(run.practice ? { practice: true as const } : {}) } : null,
      feathers: [...(row?.feathers ?? [])],
      shortcuts: [...(row?.shortcuts ?? [])],
      cleared: row?.clearedAt != null,
      bestMs: row?.bestMs ?? null,
    };
  }

  /** The owl's course as it stands, in the course this room is an act of. */
  state(cid: string, roomId: string, now: number): CourseAnswer {
    const at = this.where(roomId);
    if (!at) return { ok: false, reason: 'unknown' };
    return { ok: true, view: this.view(cid, at.def.id, now) };
  }

  /**
   * A run starts (or starts again) as the owl comes through the trail gate into the first act: the
   * caller has checked it stands by the gate's way in. Parts and bench start afresh; `practice`: a
   * spectator's (OP-191).
   */
  start(cid: string, roomId: string, now: number, practice = false): CourseAnswer {
    const at = this.where(roomId);
    if (!at || roomId !== at.def.acts[0]) return { ok: false, reason: 'unknown' };
    this.store.putRun({ cid, course: at.def.id, startedAt: now, parts: [], bench: null, ...(practice ? { practice: true as const } : {}) });
    return { ok: true, view: this.view(cid, at.def.id, now) };
  }

  /**
   * The owl reached a piece (the caller has checked it stands at it): a bench is the run's checkpoint,
   * a part counts for the run's objective, a lost feather is found for good. `first`: it was new.
   */
  reach(cid: string, roomId: string, kind: PieceKind, id: string, now: number): ReachAnswer {
    const at = this.where(roomId);
    if (!at || !pieceIn(at.room, kind, id)) return { ok: false, reason: 'unknown' };
    const course = at.def.id;
    if (kind === 'feather') {
      const row = this.store.course(cid, course) ?? blankRow(cid, course);
      const first = !row.feathers.includes(id);
      if (first) this.store.putCourse({ ...row, feathers: [...row.feathers, id] });
      return { ok: true, view: this.view(cid, course, now), first };
    }
    const run = this.runIn(cid, course, now);
    if (!run) return { ok: false, reason: 'idle' };
    let first: boolean;
    if (kind === 'bench') {
      first = run.bench?.id !== id;
      if (first) this.store.putRun({ ...run, bench: { id, room: roomId } });
    } else {
      first = !run.parts.includes(id);
      if (first) this.store.putRun({ ...run, parts: [...run.parts, id] });
    }
    return { ok: true, view: this.view(cid, course, now), first };
  }

  /** A shortcut opened from its far side (the caller has checked the owl stands at its opener): open for this owl from now on. */
  open(cid: string, roomId: string, id: string, now: number): ReachAnswer {
    const at = this.where(roomId);
    if (!at || !shortcutIn(at.room, id)) return { ok: false, reason: 'unknown' };
    const row = this.store.course(cid, at.def.id) ?? blankRow(cid, at.def.id);
    const first = !row.shortcuts.includes(id);
    if (first) this.store.putCourse({ ...row, shortcuts: [...row.shortcuts, id] });
    return { ok: true, view: this.view(cid, at.def.id, now), first };
  }

  /**
   * A fall (the caller has checked the owl is over a pit): where it goes back to, the last bench of its
   * run in this room, else the act's way in (the trail gate's spawn in the first act, the default
   * spawn in any other). A bench up on a ledge puts the owl back standing on that ledge (`top`), not on
   * the floor under it, which over a pit would be a fall again.
   */
  fall(cid: string, roomId: string, now: number): FallAnswer {
    const at = this.where(roomId);
    if (!at) return { ok: false, reason: 'unknown' };
    const run = this.runIn(cid, at.def.id, now);
    const bench = run?.bench && run.bench.room === roomId ? pieceIn(at.room, 'bench', run.bench.id) : undefined;
    const back = bench ? bench.at : findSpawn(at.room, roomId === at.def.acts[0] ? at.def.gate.spawn : undefined);
    const top = bench?.top ?? 0;
    return { ok: true, view: this.view(cid, at.def.id, now), at: { x: back.x, y: back.y }, ...(top > 0 ? { top } : {}) };
  }

  /**
   * The finish shrine (the caller has checked the owl stands at it): the run is over once every part
   * of the objective was reached in it, no sooner than the course's floor, and it pays as course.ts
   * says. Each once-only reward is marked paid in the same step it is granted.
   */
  finish(cid: string, roomId: string, now: number, practice = false): FinishAnswer {
    const at = this.where(roomId);
    if (!at || !at.room.course?.shrine) return { ok: false, reason: 'unknown' };
    const { def } = at;
    const stored = this.store.run(cid);
    if (stored && stored.course === def.id && now - stored.startedAt > COURSE_RUN_MAX_MS) {
      this.store.dropRun(cid);
      return { ok: false, reason: 'forgotten' };
    }
    const run = this.runIn(cid, def.id, now);
    if (!run) return { ok: false, reason: 'idle' };
    if (!courseParts(def, this.rooms).every((p) => run.parts.includes(p.id))) return { ok: false, reason: 'parts' };
    const ms = now - run.startedAt;
    if (ms < def.floorMs) return { ok: false, reason: 'too-fast' };
    this.store.dropRun(cid);
    if (practice || run.practice) {
      return { ok: true, view: this.view(cid, def.id, now), paid: { ms, best: false, first: false, feathers: 0, total: this.book.feathers(cid, now), practice: true } };
    }
    const row = this.store.course(cid, def.id) ?? blankRow(cid, def.id);
    const next: CourseRow = { ...row, feathers: [...row.feathers], shortcuts: [...row.shortcuts] };
    const first = row.clearedAt === null;
    const paid: CoursePaid = { ms, best: row.bestMs === null || ms < row.bestMs, first, feathers: 0, total: 0 };
    if (first) {
      next.clearedAt = now;
      this.book.addFeathers(cid, COURSE_FIRST_FEATHERS, now);
      paid.feathers = COURSE_FIRST_FEATHERS;
      const g = this.book.grant(cid, def.item, 'granted', now);
      if (g.ok) paid.item = def.item;
    } else {
      // Later clears: the climb's way (climbbook.ts), a day's worth under the activities' shared cap.
      const day = parkDay(now);
      const due = Math.min(COURSE_REPEAT_FEATHERS, repeatLeft(row, day));
      if (due === 0) paid.why = 'paid-today';
      else {
        const res = this.book.play(cid, due, null, now);
        paid.feathers = res.added;
        if (res.added < due) paid.why = 'capped';
        next.repeatPaid = (row.repeatDay === day ? row.repeatPaid : 0) + res.added;
        next.repeatDay = day;
      }
    }
    if (!row.gold && ms <= def.gold.ms) {
      next.gold = true;
      if (this.book.grant(cid, def.gold.item, 'granted', now).ok) paid.gold = def.gold.item;
    }
    const lost = new Set(coursePieces(def, this.rooms, 'feather').map((p) => p.id));
    if (!row.emote && row.feathers.filter((f) => lost.has(f)).length >= LOST_FEATHERS) {
      next.emote = true;
      if (this.book.grant(cid, def.emote, 'granted', now).ok) paid.emote = def.emote;
    }
    if (paid.best) next.bestMs = ms;
    this.store.putCourse(next);
    if (this.clearedAll(cid)) {
      const g = this.book.grant(cid, GOLDEN_MOUSE, 'granted', now);
      if (g.ok && g.added) paid.mouse = GOLDEN_MOUSE;
    }
    paid.total = this.book.feathers(cid, now);
    return { ok: true, view: this.view(cid, def.id, now), paid };
  }

  /** Whether the owl has cleared every course that pays the Golden Mouse (mouseCourses). */
  private clearedAll(cid: string): boolean {
    const counting = mouseCourses(Object.values(this.courses));
    if (counting.length === 0) return false;
    const cleared = new Set(this.store.courses(cid).filter((r) => r.clearedAt !== null).map((r) => r.course));
    return counting.every((d) => cleared.has(d.id));
  }

  /** The course board for this owl (courseBoard): keeper courses only when asked for. */
  board(cid: string, now: number, keepers = false): CourseBoardRow[] {
    return courseBoard(Object.values(this.courses), this.store.courses(cid), now, keepers);
  }
}

// ---------- in memory ----------

export interface MemoryCourseSnapshot {
  courses: CourseRow[];
  runs: CourseRunRow[];
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const strings = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 48))] : []);

/** A course row as stored, or null for one that is not (anything malformed is skipped rather than trusted). */
export function cleanCourseRow(v: unknown): CourseRow | null {
  if (!isObj(v) || typeof v['cid'] !== 'string' || !v['cid'] || typeof v['course'] !== 'string' || !v['course']) return null;
  const cleared = v['clearedAt'];
  const best = v['bestMs'];
  return {
    cid: v['cid'],
    course: v['course'],
    clearedAt: typeof cleared === 'number' && Number.isFinite(cleared) ? cleared : null,
    bestMs: typeof best === 'number' && Number.isFinite(best) && best >= 0 ? best : null,
    gold: v['gold'] === true,
    emote: v['emote'] === true,
    feathers: strings(v['feathers']),
    shortcuts: strings(v['shortcuts']),
    repeatDay: typeof v['repeatDay'] === 'string' ? v['repeatDay'] : '',
    repeatPaid: Math.max(0, Math.floor(num(v['repeatPaid']))),
  };
}

/** A run as stored, or null. */
export function cleanCourseRun(v: unknown): CourseRunRow | null {
  if (!isObj(v) || typeof v['cid'] !== 'string' || !v['cid'] || typeof v['course'] !== 'string' || !v['course']) return null;
  const b = v['bench'];
  const bench = isObj(b) && typeof b['id'] === 'string' && typeof b['room'] === 'string' ? { id: b['id'], room: b['room'] } : null;
  return { cid: v['cid'], course: v['course'], startedAt: num(v['startedAt']), parts: strings(v['parts']), bench, ...(v['practice'] === true ? { practice: true as const } : {}) };
}

/** In-memory store for tests and the local mode. */
export class MemoryCourseStore implements CourseStore {
  private rows = new Map<string, CourseRow>();
  private runs = new Map<string, CourseRunRow>();

  snapshot(): MemoryCourseSnapshot {
    return { courses: [...this.rows.values()].map((r) => ({ ...r, feathers: [...r.feathers], shortcuts: [...r.shortcuts] })), runs: [...this.runs.values()].map((r) => ({ ...r, parts: [...r.parts] })) };
  }

  static from(input: unknown): MemoryCourseStore {
    const store = new MemoryCourseStore();
    const snap = isObj(input) ? input : {};
    for (const v of Array.isArray(snap['courses']) ? snap['courses'] : []) {
      const row = cleanCourseRow(v);
      if (row) store.putCourse(row);
    }
    for (const v of Array.isArray(snap['runs']) ? snap['runs'] : []) {
      const run = cleanCourseRun(v);
      if (run) store.putRun(run);
    }
    return store;
  }

  course(cid: string, course: string) {
    const r = this.rows.get(`${cid}|${course}`);
    return r ? { ...r, feathers: [...r.feathers], shortcuts: [...r.shortcuts] } : null;
  }
  putCourse(row: CourseRow) {
    this.rows.set(`${row.cid}|${row.course}`, { ...row, feathers: [...row.feathers], shortcuts: [...row.shortcuts] });
  }
  courses(cid: string) {
    return [...this.rows.values()].filter((r) => r.cid === cid).map((r) => ({ ...r, feathers: [...r.feathers], shortcuts: [...r.shortcuts] }));
  }
  run(cid: string) {
    const r = this.runs.get(cid);
    return r ? { ...r, parts: [...r.parts], bench: r.bench ? { ...r.bench } : null } : null;
  }
  putRun(row: CourseRunRow) {
    this.runs.set(row.cid, { ...row, parts: [...row.parts], bench: row.bench ? { ...row.bench } : null });
  }
  dropRun(cid: string) {
    this.runs.delete(cid);
  }
}
