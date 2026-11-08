/**
 * The playtest of a room seen from the side (every room of the tree, the new map and every course act):
 * what a kid bot can reach in it from each way in, how many tries it takes, the hardest hop on the way,
 * and where an owl gets stuck. Courses (playtestCourse) are their acts' rooms read together.
 *
 * What it looks for, every room, with nothing listed by hand:
 *  - every open doorway, leaf pile, hiding spot and course piece (bench, part, lost feather, shrine);
 *  - from every spawn;
 *  - stuck spots: a surface a kid can get to with no way from it to any doorway (and, in a course, no
 *    pit to fall back to a bench by).
 */
import { COURSE_REACH, INTERACTABLES, KIND_RULES, PERCH_SLACK, type CourseDef, type RoomDef } from '@owl-park/shared';
import { COURSES, ROOMS } from '@owl-park/shared/rooms';
import { actionsToward, canAim, type Action } from './kid';
import { botRoom } from './owl';
import { routeFrom, solve, type Goal, type Hop } from './route';
import { heightOf, surfaceAt, surfacesOf, type Surface } from './surfaces';

/**
 * The kid bar (the owner's, Nov 7: "something a 10 year old can do in a few tries"): every hop a course
 * needs lands at least this share of a kid's tries. At 50% a kid makes a hop every other try, so three
 * tries clear it seven times in eight.
 */
export const KID_BAR = 0.5;

export type Kind = 'door' | 'leaves' | 'spot' | 'bench' | 'part' | 'feather' | 'shrine';

export interface TargetReport {
  id: string;
  kind: Kind;
  /** A course needs it (its parts, its shrine, the doorways on through it). */
  required: boolean;
  /** Reached from at least one way in. */
  reachable: boolean;
  /** The fewest tries from a way in, and that route's weakest hop. */
  tries: number | null;
  from: string | null;
  weakest: Hop | null;
  hops: Hop[];
}

export interface RoomReport {
  room: string;
  course: string | null;
  act: number | null;
  surfaces: number;
  starts: string[];
  targets: TargetReport[];
  /** Surfaces a kid reaches and cannot leave for any doorway. */
  stuck: Array<{ surface: string; x0: number; x1: number; top: number }>;
  /** Spawns that stand on nothing. */
  floating: string[];
  ms: number;
}

const ROUND = (n: number) => Math.round(n * 1000) / 1000;

/** A doorway's destination, on any map. */
function leadsOn(d: RoomDef['doors'][number]): string | null {
  return d.to?.room ?? d.toNew?.room ?? d.toTree?.room ?? null;
}

/** The surfaces from which a thing at `x0` to `x1`, `top` up (null: any height), is reached. */
function on(surfaces: readonly Surface[], x0: number, x1: number, top: number | null): Set<string> {
  const out = new Set<string>();
  for (const s of surfaces) {
    const a = Math.max(s.x0, x0);
    const b = Math.min(s.x1, x1);
    if (a > b) continue;
    if (top === null) {
      out.add(s.id);
      continue;
    }
    for (let x = a; x <= b; x += 4) {
      if (Math.abs(heightOf(s, x) - top) <= (s.perch ? PERCH_SLACK : 0.5)) {
        out.add(s.id);
        break;
      }
    }
  }
  return out;
}

/**
 * The spawns an owl comes into a room by. In a course, only the ways in going forward: the trail gate's
 * spawn, and those a doorway of an earlier act leads to (for a side room of an act, also a doorway of its
 * own act). A way back in from a later act is not a start, since the course is played forward.
 */
function waysIn(room: RoomDef, course: CourseDef | undefined): string[] {
  if (!course) return Object.keys(room.spawns);
  const used = new Set<string>();
  const act = room.course?.act ?? 0;
  const side = course?.rooms?.includes(room.id) ?? false;
  if (course.acts[0] === room.id) used.add(course.gate.spawn);
  for (const r of Object.values(ROOMS)) {
    if (r.id === room.id) continue;
    if (r.course?.id !== course.id) continue;
    const from = r.course.act;
    if (!(from < act || (side && from === act))) continue;
    for (const d of r.doors) for (const to of [d.to, d.toNew, d.toTree]) if (to?.room === room.id) used.add(to.spawn);
  }
  const ids = Object.keys(room.spawns).filter((s) => used.has(s));
  return ids.length > 0 ? ids : Object.keys(room.spawns);
}

/** Whether a doorway of a course's room leads on through the course: to a later act, to a room of its act holding what the course needs, or out by the exit. */
function onward(course: CourseDef, room: RoomDef, to: string): boolean {
  if (course.exit.room === room.id && leadsOn(room.doors.find((d) => d.id === course.exit.door)!) === to) return true;
  const next = ROOMS[to];
  if (!next?.course || next.course.id !== course.id) return false;
  if (next.course.act > room.course!.act) return true;
  return next.course.act === room.course!.act && ((next.course.parts?.length ?? 0) > 0 || next.course.shrine !== undefined);
}

export function playtestRoom(id: string): RoomReport {
  const t0 = Date.now();
  const room = ROOMS[id]!;
  const br = botRoom(room);
  const surfaces = surfacesOf(br);
  const ids = surfaces.map((s) => s.id);
  const actions = new Map<string, Action[]>();
  for (const F of surfaces) {
    const list: Action[] = [];
    for (const T of surfaces) if (canAim(br, F, T)) list.push(...actionsToward(br, surfaces, F, T));
    actions.set(F.id, list);
  }
  const course = room.course ? COURSES[room.course.id] : undefined;
  const starts = waysIn(room, course);
  const startOn = new Map<string, string>();
  const floating: string[] = [];
  for (const s of starts) {
    const p = room.spawns[s]!;
    const z = room.spawnTops?.[s] ?? 0;
    const surf = surfaceAt(surfaces, p.x, z) ?? surfaces.find((q) => p.x >= q.x0 - 8 && p.x <= q.x1 + 8 && Math.abs(heightOf(q, p.x) - z) < 1) ?? null;
    if (surf) startOn.set(s, surf.id);
    else floating.push(s);
  }

  type T = { id: string; kind: Kind; required: boolean; goal: Goal };
  const targets: T[] = [];
  for (const d of room.doors) {
    const to = leadsOn(d);
    if (!to) continue;
    targets.push({ id: d.id, kind: 'door', required: course ? onward(course, room, to) : false, goal: { id: d.id, on: on(surfaces, d.rect.x, d.rect.x + d.rect.w, d.top ?? null) } });
  }
  for (const it of INTERACTABLES.filter((i) => i.room === id && i.kind === 'leaf-pile')) {
    const reach = KIND_RULES['leaf-pile'].reach;
    targets.push({ id: it.id, kind: 'leaves', required: false, goal: { id: it.id, on: on(surfaces, it.pos.x - reach, it.pos.x + reach, it.top ?? 0) } });
  }
  (room.spots ?? []).forEach((s, i) => {
    targets.push({ id: `spot-${i + 1}`, kind: 'spot', required: false, goal: { id: `spot-${i + 1}`, on: on(surfaces, s.x - 40, s.x + 40, s.top ?? 0) } });
  });
  const c = room.course;
  for (const [kind, list] of [
    ['bench', c?.benches],
    ['part', c?.parts],
    ['feather', c?.feathers],
    ['shrine', c?.shrine ? [c.shrine] : []],
  ] as const) {
    for (const p of list ?? []) targets.push({ id: p.id, kind, required: kind === 'part' || kind === 'shrine', goal: { id: p.id, on: on(surfaces, p.at.x - COURSE_REACH, p.at.x + COURSE_REACH, p.top ?? 0) } });
  }

  const reports: TargetReport[] = [];
  const doorV: Array<Map<string, number>> = [];
  for (const t of targets) {
    const solved = solve(ids, actions, t.goal);
    if (t.kind === 'door') doorV.push(solved.v);
    let best: ReturnType<typeof routeFrom> | null = null;
    for (const [s, surf] of startOn) {
      const r = routeFrom(surf, solved, t.goal);
      if (r.tries !== Infinity && (!best || r.tries < best.tries)) best = { ...r, start: s };
    }
    const hops = (best?.hops ?? []).map((h) => ({ ...h, rate: ROUND(h.rate), fall: ROUND(h.fall) }));
    const weakest = hops.length ? hops.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
    reports.push({ id: t.id, kind: t.kind, required: t.required, reachable: best !== null, tries: best ? ROUND(best.tries) : null, from: best?.start ?? null, weakest, hops });
  }

  // Stuck: reached from a way in, with no way on to any doorway and no fall back to a bench.
  const reached = new Set<string>(startOn.values());
  const queue = [...reached];
  while (queue.length) {
    const s = queue.pop()!;
    for (const a of actions.get(s) ?? []) for (const [k, p] of a.out) if (p > 0 && k !== 'fall' && k !== 'miss' && !reached.has(k)) {
      reached.add(k);
      queue.push(k);
    }
  }
  const stuck: RoomReport['stuck'] = [];
  if (doorV.length > 0) {
    for (const s of reached) {
      const out = doorV.some((v) => (v.get(s) ?? Infinity) < Infinity);
      const falls = (actions.get(s) ?? []).some((a) => (a.out.get('fall') ?? 0) > 0);
      if (!out && !(c && falls)) {
        const surf = surfaces.find((q) => q.id === s)!;
        stuck.push({ surface: s, x0: surf.x0, x1: surf.x1, top: surf.perch?.top ?? 0 });
      }
    }
  }
  return { room: id, course: c?.id ?? null, act: c?.act ?? null, surfaces: surfaces.length, starts, targets: reports, stuck, floating, ms: Date.now() - t0 };
}

/** The rooms the bots playtest: every room seen from the side (the tree, the new map, the courses' acts). */
export function sideRooms(): string[] {
  return Object.values(ROOMS)
    .filter((r) => r.map === 2)
    .map((r) => r.id);
}

export interface CourseReport {
  course: string;
  keeper: boolean;
  rooms: string[];
  /** Every hop the course needs, room by room: the routes to its required pieces and doorways. */
  hops: Array<Hop & { room: string; goal: string }>;
  weakest: (Hop & { room: string; goal: string }) | null;
  /** Hops a kid lands less than KID_BAR of the time. */
  underBar: Array<Hop & { room: string; goal: string }>;
  /** Required pieces and doorways no route reaches. */
  unreachable: Array<{ room: string; id: string; kind: Kind }>;
  /** Falls a kid can expect on a clear: one less than the tries each needed hop takes, summed. */
  falls: number;
  /** The chance a kid clears every needed hop in one go with no fall: what a clean run is. */
  cleanRun: number;
}

export function playtestCourse(def: CourseDef, rooms: ReadonlyMap<string, RoomReport>): CourseReport {
  const ids = [...def.acts, ...(def.rooms ?? [])];
  const hops: CourseReport['hops'] = [];
  const unreachable: CourseReport['unreachable'] = [];
  for (const id of ids) {
    const r = rooms.get(id);
    if (!r) continue;
    const seen = new Set<string>();
    for (const t of r.targets.filter((t) => t.required)) {
      if (!t.reachable) unreachable.push({ room: id, id: t.id, kind: t.kind });
      for (const h of t.hops) {
        const key = `${h.from}>${h.to}`;
        if (seen.has(key) || h.mode === 'walk' && h.rate >= 0.999) continue;
        seen.add(key);
        hops.push({ ...h, room: id, goal: t.id });
      }
    }
  }
  const weakest = hops.length ? hops.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
  const falls = hops.reduce((s, h) => s + (h.rate > 0 ? 1 / h.rate - 1 : 0), 0);
  const cleanRun = hops.reduce((s, h) => s * h.rate, 1);
  return { course: def.id, keeper: !!def.keeper, rooms: ids, hops, weakest, underBar: hops.filter((h) => h.rate < KID_BAR), unreachable, falls: ROUND(falls), cleanRun: ROUND(cleanRun) };
}
