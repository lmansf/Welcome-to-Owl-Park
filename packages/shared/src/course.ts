/**
 * Parkour courses (OP-224): a realm's parkour is a level of up to MAX_ACTS acts, each a room, joined
 * by doors. An owl comes in through the course's trail gate, a door in the room before its first act,
 * and holds the dash (dash.ts) in every act until the course's exit takes it out. Each course has:
 *  - an objective: its parts (bells to ring, breakers to switch on, seals to collect), spread over its
 *    acts, every one reached in one run before the finish shrine takes the run;
 *  - benches: checkpoints. A fall (landing in, or walking into, one of an act's pits) puts the owl back
 *    at the last bench it reached in this run, in that room, or at the act's way in;
 *  - shortcuts: a gate that opens from its far side the first time an owl reaches its opener, and
 *    stays open for that owl from then on (kept with its saved state, coursebook.ts);
 *  - five lost feathers, each collected once per owl;
 *  - the finish shrine, which pays: the course's item and COURSE_FIRST_FEATHERS on the first clear,
 *    up to COURSE_REPEAT_DAILY feathers a park day for later clears, the gold item once for a clear
 *    within the course's gold time, and the course's emote once all five lost feathers are found.
 *
 * The room server decides every reward (coursebook.ts); a page only asks. Where each piece stands is
 * the room's (`course` on RoomDef); what the course is, its acts and its rewards, is the course's.
 */
import { pointInPolygon, pointInRect, type Polygon, type Rect } from './geometry';
import type { Raised } from './perches';
import type { Vec2 } from './protocol';
import type { RoomDef } from './room';

/** A course has at most three acts. */
export const MAX_ACTS = 3;
/** Every course hides five lost feathers. */
export const LOST_FEATHERS = 5;
/** How near a piece an owl reaches it (room px, the room server adds its latency slack). */
export const COURSE_REACH = 64;
/** The first clear's feathers, paid once with the course's item. */
export const COURSE_FIRST_FEATHERS = 50;
/** A later clear's feathers, up to COURSE_REPEAT_DAILY a park day for each course. */
export const COURSE_REPEAT_FEATHERS = 10;
export const COURSE_REPEAT_DAILY = 10;
/** A run not finished within this long is forgotten: the next way in starts a new one. */
export const COURSE_RUN_MAX_MS = 60 * 60_000;
/** How near the trail gate's way into the first act a run starts (room px). */
export const COURSE_START_REACH = 240;

/** What a course's parts are: what the objective strip counts. */
export type ObjectiveKind = 'bells' | 'breakers' | 'seals';
export const OBJECTIVE_KINDS: readonly ObjectiveKind[] = ['bells', 'breakers', 'seals'];

/** A piece of a course in its room: where it stands (and, up on a perch, that perch's top). */
export interface CoursePiece extends Raised {
  id: string;
  at: Vec2;
}

/**
 * A shortcut: `gate` is the way it closes while shut (a stretch of floor no owl walks across), and
 * `opener` the stretch on its far side where an owl, reaching it, opens it for good.
 */
export interface CourseShortcut {
  id: string;
  gate: Polygon;
  opener: Rect;
}

/** What a room that is an act of a course holds (RoomDef's `course`). */
export interface RoomCourse {
  /** The course (COURSES, packages/shared/rooms). */
  id: string;
  /** Which act, from 1. */
  act: number;
  /** Floor an owl falls through: standing on it, it is back at its last bench. Inside the walkable floor. */
  pits?: Polygon[];
  benches?: CoursePiece[];
  parts?: CoursePiece[];
  feathers?: CoursePiece[];
  shortcuts?: CourseShortcut[];
  /** The finish shrine, in the last act. */
  shrine?: CoursePiece;
}

export interface CourseDef {
  id: string;
  objective: ObjectiveKind;
  /** The rooms of its acts, first to last (one to MAX_ACTS). */
  acts: readonly string[];
  /** The trail gate: the door (in the room before the first act) whose way in grants the dash, and the spawn in the first act it leads to. */
  gate: { room: string; door: string; spawn: string };
  /** The way out of the last act: its door, which takes the dash away. */
  exit: { room: string; door: string };
  /** The first clear's item (a variant id). */
  item: string;
  /** The emote all five lost feathers pay (an emote id). */
  emote: string;
  /** The gold time (ms) and the item a clear within it pays, once. */
  gold: { ms: number; item: string };
  /** The least time a clear can take (ms): a finish sooner than this is refused. */
  floorMs: number;
  /** Seen by keepers only (the test course): its rooms are keeper-only. */
  keeper?: true;
}

/** A piece and the room it stands in. */
export type PlacedPiece = CoursePiece & { room: string };

/** The kinds of piece a page asks the room about as its owl reaches one. */
export type PieceKind = 'bench' | 'part' | 'feather';

/** The pieces of one kind in a room (none for a room that is no act). */
export function piecesIn(room: Pick<RoomDef, 'course'> | undefined, kind: PieceKind): CoursePiece[] {
  const c = room?.course;
  if (!c) return [];
  return [...((kind === 'bench' ? c.benches : kind === 'part' ? c.parts : c.feathers) ?? [])];
}

/** A piece of a room by kind and id. */
export function pieceIn(room: Pick<RoomDef, 'course'> | undefined, kind: PieceKind, id: string): CoursePiece | undefined {
  return piecesIn(room, kind).find((p) => p.id === id);
}

/** A shortcut of a room by id. */
export function shortcutIn(room: Pick<RoomDef, 'course'> | undefined, id: string): CourseShortcut | undefined {
  return room?.course?.shortcuts?.find((s) => s.id === id);
}

/** Every piece of a kind over a course's acts, act by act. */
export function coursePieces(def: CourseDef, rooms: (id: string) => RoomDef | undefined, kind: PieceKind): PlacedPiece[] {
  return def.acts.flatMap((id) => piecesIn(rooms(id), kind).map((p) => ({ ...p, room: id })));
}

/** The objective's parts over the course, act by act: what the objective strip counts. */
export function courseParts(def: CourseDef, rooms: (id: string) => RoomDef | undefined): PlacedPiece[] {
  return coursePieces(def, rooms, 'part');
}

/** Whether a point is over one of a room's pits. */
export function inPit(room: Pick<RoomDef, 'course'> | undefined, p: Vec2): boolean {
  return (room?.course?.pits ?? []).some((pit) => pointInPolygon(p, pit));
}

/** The shortcuts of a room still shut for an owl that has opened `open`: their gates, as floor no owl crosses. */
export function shutShortcuts(room: Pick<RoomDef, 'course'> | undefined, open: ReadonlySet<string>): Polygon[] {
  return (room?.course?.shortcuts ?? []).filter((s) => !open.has(s.id)).map((s) => s.gate);
}

/** The shortcut whose opener a point stands in, if any (a shut one only). */
export function openerAt(room: Pick<RoomDef, 'course'> | undefined, p: Vec2, open: ReadonlySet<string>): CourseShortcut | undefined {
  return room?.course?.shortcuts?.find((s) => !open.has(s.id) && pointInRect(p, s.opener));
}

/** The course a room is an act of. */
export function courseOfRoom(room: Pick<RoomDef, 'course'> | undefined, courses: Readonly<Record<string, CourseDef>>): CourseDef | undefined {
  const id = room?.course?.id;
  return id !== undefined && Object.hasOwn(courses, id) ? courses[id] : undefined;
}

/** Whether an owl in this room holds the dash: the room is an act of a course. */
export function holdsDash(room: Pick<RoomDef, 'course'> | undefined): boolean {
  return room?.course !== undefined;
}

/**
 * What is wrong with a course against its rooms (empty when nothing): its acts, its pieces' ids, its
 * five lost feathers, a bench in every act, a shrine in the last act only, its parts, the trail gate
 * and the exit. The rooms' own invariants (floors, doors, spawns) are rooms.test.ts's.
 */
export function courseProblems(def: CourseDef, rooms: (id: string) => RoomDef | undefined): string[] {
  const out: string[] = [];
  if (def.acts.length < 1 || def.acts.length > MAX_ACTS) out.push(`${def.id}: has ${def.acts.length} acts`);
  def.acts.forEach((id, i) => {
    const r = rooms(id);
    if (!r) {
      out.push(`${def.id}: no room ${id}`);
      return;
    }
    if (r.course?.id !== def.id || r.course.act !== i + 1) out.push(`${id}: is not act ${i + 1} of ${def.id}`);
    if (piecesIn(r, 'bench').length === 0) out.push(`${id}: has no bench`);
    const last = i === def.acts.length - 1;
    if (last !== (r.course?.shrine !== undefined)) out.push(`${id}: ${last ? 'has no shrine' : 'has a shrine but is not the last act'}`);
  });
  for (const kind of ['bench', 'part', 'feather'] as const) {
    const ids = coursePieces(def, rooms, kind).map((p) => p.id);
    if (new Set(ids).size !== ids.length) out.push(`${def.id}: two ${kind}s share an id`);
  }
  const shortcuts = def.acts.flatMap((id) => rooms(id)?.course?.shortcuts ?? []).map((s) => s.id);
  if (new Set(shortcuts).size !== shortcuts.length) out.push(`${def.id}: two shortcuts share an id`);
  if (coursePieces(def, rooms, 'feather').length !== LOST_FEATHERS) out.push(`${def.id}: hides ${coursePieces(def, rooms, 'feather').length} lost feathers, not ${LOST_FEATHERS}`);
  if (courseParts(def, rooms).length === 0) out.push(`${def.id}: its objective has no parts`);
  const gateRoom = rooms(def.gate.room);
  const gate = gateRoom?.doors.find((d) => d.id === def.gate.door);
  if (gate?.to?.room !== def.acts[0] || gate?.to?.spawn !== def.gate.spawn) out.push(`${def.id}: its trail gate does not lead into its first act`);
  if (gateRoom?.course) out.push(`${def.id}: its trail gate stands inside a course`);
  const last = def.acts[def.acts.length - 1];
  const exitRoom = rooms(def.exit.room);
  const exit = exitRoom?.doors.find((d) => d.id === def.exit.door);
  if (def.exit.room !== last || !exit?.to || rooms(exit.to.room)?.course) out.push(`${def.id}: its exit does not lead out of the course from its last act`);
  if (!(def.gold.ms > def.floorMs)) out.push(`${def.id}: its gold time is no longer than its floor`);
  return out;
}
