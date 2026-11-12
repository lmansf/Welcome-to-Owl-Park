import { courseParts, roomsByAct, type CourseDef, type RoomDef, type Vec2 } from '@owl-park/shared';
import { COURSE_WORDS } from '../ui/courseWords';

/**
 * The tips a parkour course shows in its rooms (OP-344): a line of words in the room itself at the
 * first of each thing a visitor has to understand, shown only while the owl is near it, one at a
 * time. A course said nothing about how it is played: not what it asks, not the moves, not what a
 * column of leaves or an ink stone does (the play log: 8 of 9 runs quit, most before the first
 * bench). The tips stand where the thing is, so they are read when they are needed and need no
 * card to close and nothing remembered between visits.
 *
 * This file works out which tips a course has and where each stands, from the course's own rooms
 * (pure, so it is unit-tested); courseTipSigns.ts draws them.
 */
export interface CourseTip {
  /** What it is about: `start`, `pit`, `updraft`, `wind`, `stone`, `sign`, `bench`, `part`. One of each for a course. */
  id: string;
  room: string;
  /** Where its words stand: the middle of their foot (room px). */
  at: Vec2;
  /** How high over the ground line the thing it is about is (room px): an owl about that high is the one it speaks to. */
  top: number;
  words: string;
}

/** How near the thing a tip is about the owl is for the tip to show: this far across, and this far above or below its height (room px). */
export const TIP_REACH = { x: 400, z: 460 } as const;
/** How far over the thing it is about a tip's words stand (room px): clear of an owl standing on it. */
const TIP_LIFT = 240;
/**
 * A thing this high over the ground line or higher has its tip hung under it instead, this far below
 * where an owl stands at it: over it the words would be off the top of the room, and an owl comes to a
 * high thing from below.
 */
const TIP_HIGH = 300;
const TIP_UNDER = 150;

/**
 * A course's tips, in the order its rooms are met (act by act): for each thing, one tip, at the first
 * room that has it and the westmost one there, since every act is entered at its west end. `ground`
 * gives a room's ground line (room y); `touch`, whether the device plays with the pad's buttons.
 */
export function courseTips(def: CourseDef, rooms: (id: string) => RoomDef | undefined, ground: (room: RoomDef) => number, touch: boolean): CourseTip[] {
  const order = roomsByAct(def, rooms).flatMap((id) => rooms(id) ?? []);
  const out: CourseTip[] = [];
  const tip = (id: string, room: RoomDef, x: number, top: number, words: string): CourseTip => ({ id, room: room.id, at: { x: Math.round(x), y: Math.round(ground(room) - top + (top >= TIP_HIGH ? TIP_UNDER : -TIP_LIFT)) }, top, words });
  /** The first room with a thing of this kind, and the westmost one in it. */
  const first = <T>(things: (r: RoomDef) => readonly T[] | undefined, x: (t: T) => number): { room: RoomDef; thing: T } | null => {
    for (const room of order) {
      const all = [...(things(room) ?? [])].sort((a, b) => x(a) - x(b));
      if (all[0] !== undefined) return { room, thing: all[0] };
    }
    return null;
  };
  // At the trail gate's way in: what the course asks and the moves.
  const gate = rooms(def.acts[0] ?? '');
  const way = gate?.spawns[def.gate.spawn];
  if (gate && way) {
    const moves = touch ? COURSE_WORDS.tips.moves.touch : COURSE_WORDS.tips.moves.keys;
    out.push(tip('start', gate, way.x + 140, 0, `${COURSE_WORDS.tips.goal[def.objective](courseParts(def, rooms).length)}\n${moves}`));
  }
  const pit = first((r) => r.course?.pits, (p) => Math.min(...p.map((v) => v.x)));
  if (pit) out.push(tip('pit', pit.room, Math.min(...pit.thing.map((v) => v.x)) + 40, 0, COURSE_WORDS.tips.pit[def.id] ?? COURSE_WORDS.tips.fall));
  const bench = first((r) => r.course?.benches, (b) => b.at.x);
  if (bench) out.push(tip('bench', bench.room, bench.thing.at.x, bench.thing.top ?? 0, COURSE_WORDS.tips.bench));
  const part = first((r) => r.course?.parts, (p) => p.at.x);
  if (part) out.push(tip('part', part.room, part.thing.at.x, part.thing.top ?? 0, COURSE_WORDS.tips.part[def.objective]));
  // A column of rising air is come into from the floor at its foot; a wind, a stone and a sign at their own height.
  const updraft = first((r) => r.updrafts, (u) => u.x);
  if (updraft) out.push(tip('updraft', updraft.room, updraft.thing.x + updraft.thing.w / 2, 0, COURSE_WORDS.tips.updraft));
  const wind = first((r) => r.winds, (w) => Math.min(w.x0, w.x1));
  if (wind) out.push(tip('wind', wind.room, wind.thing.dir === 1 ? wind.thing.x0 : wind.thing.x1, wind.thing.z, COURSE_WORDS.tips.wind));
  const stone = first((r) => r.brushStones, (st) => st.x0);
  if (stone) out.push(tip('stone', stone.room, (stone.thing.x0 + stone.thing.x1) / 2, stone.thing.top, COURSE_WORDS.tips.stone));
  const sign = first((r) => r.neonSigns, (sg) => sg.x0);
  if (sign) out.push(tip('sign', sign.room, (sign.thing.x0 + sign.thing.x1) / 2, sign.thing.top, COURSE_WORDS.tips.sign));
  return out;
}

/**
 * The one tip to show an owl at `x`, `z` up over the ground line: of the room's tips whose thing is
 * within TIP_REACH of it, the nearest, counting the way across in full and the difference in height as
 * half; null when none is in reach. One at a time, so two tips close together never stand over each
 * other. An owl walking the floor reads the tip for the thing on the floor it is walking up to, and a
 * tip about a thing up high speaks to an owl that is up there, or on its way up under it.
 */
export function tipFor(tips: readonly CourseTip[], x: number, z: number): CourseTip | null {
  let best: CourseTip | null = null;
  let near = Number.POSITIVE_INFINITY;
  for (const t of tips) {
    const dx = Math.abs(t.at.x - x);
    const dz = Math.abs(t.top - z);
    if (dx > TIP_REACH.x || dz > TIP_REACH.z) continue;
    const d = dx + dz / 2;
    if (d < near) {
      best = t;
      near = d;
    }
  }
  return best;
}
