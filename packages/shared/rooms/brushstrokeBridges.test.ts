import { describe, expect, it } from 'vitest';
import { CollectionBook, MemoryCollectionStore } from '../src/book';
import { allStrokes, brushStrokes } from '../src/brush';
import { courseParts, coursePieces, courseProblems, holdsDash, inPit, inThorns, LOST_FEATHERS } from '../src/course';
import { CourseBook, MemoryCourseStore } from '../src/coursebook';
import { kitProblems } from '../src/kit';
import { groundAt, perchTopLimit } from '../src/perches';
import type { Polygon } from '../src/geometry';
import { mapOf, spawnTop, type RoomDef } from '../src/room';
import { perchTiers } from '../src/routes';
import { BRUSH_COURSE, BRUSH_GROUND, BRUSH_ROOMS } from './brushstrokeBridges';
import { COURSES, ROOMS, TREE_GROUND, TREE_REALMS } from './index';

const rooms = (id: string) => ROOMS[id];
const ids = [...BRUSH_COURSE.acts, ...(BRUSH_COURSE.rooms ?? [])];
/** A room's floor less its hazards (the water, the mist): where an owl takes off from without falling. */
const safeFloor = (r: RoomDef): Polygon[] => {
  const xs = (p: Polygon) => p.map((v) => v.x);
  const cuts = (r.course?.pits ?? []).map((p) => [Math.min(...xs(p)), Math.max(...xs(p))] as const).sort((a, b) => a[0] - b[0]);
  const out: Polygon[] = [];
  let from = 8;
  const strip = (x0: number, x1: number) => [
    { x: x0, y: TREE_GROUND - 4 },
    { x: x1, y: TREE_GROUND - 4 },
    { x: x1, y: TREE_GROUND + 4 },
    { x: x0, y: TREE_GROUND + 4 },
  ];
  for (const [a, b] of cuts) {
    if (a > from) out.push(strip(from, a));
    from = Math.max(from, b);
  }
  if (from < r.size.w - 8) out.push(strip(from, r.size.w - 8));
  return out;
};
/** What each ledge takes from the safe floor, with every stroke of ink painted, or (`ink` false) none. */
const tiersFrom = (id: string, ink = true) => {
  const r = ROOMS[id]!;
  const strokes = new Set(allStrokes(r.brushStones).map((s) => s.id));
  return perchTiers({ ...r, walkable: safeFloor(r), perches: (r.perches ?? []).filter((p) => ink || !strokes.has(p.id)) });
};

describe('Brushstroke Bridges (OP-235)', () => {
  it('is a course with nothing wrong with it: three acts, five rooms, four seals, a bench on every screen, five lost feathers and the shrine at the summit', () => {
    expect(COURSES[BRUSH_COURSE.id]).toBe(BRUSH_COURSE);
    expect(courseProblems(BRUSH_COURSE, rooms)).toEqual([]);
    expect(Object.keys(BRUSH_ROOMS).sort()).toEqual([...ids].sort());
    expect(BRUSH_COURSE.objective).toBe('seals');
    expect(courseParts(BRUSH_COURSE, rooms).map((p) => p.id)).toEqual(['seal-1', 'seal-2', 'seal-3', 'seal-4']);
    // A bench on every screen past the first of each act (eased for younger players, Nov 7): a fall is a
    // screen's climb again at most, never an act's.
    expect(coursePieces(BRUSH_COURSE, rooms, 'bench').map((b) => `${b.room}:${b.id}`)).toEqual([
      'brush-1:bench-1',
      'brush-1:bench-1b',
      'brush-2:bench-2',
      'brush-2:bench-2b',
      'brush-2:bench-2c',
      'brush-3a:bench-3',
      'brush-3a:bench-3b',
      'brush-3a:bench-3c',
      'brush-3b:bench-4',
      'brush-3b:bench-4b',
    ]);
    const feathers = coursePieces(BRUSH_COURSE, rooms, 'feather');
    expect(feathers).toHaveLength(LOST_FEATHERS);
    expect(feathers.map((f) => `${f.room}:${f.id}`)).toEqual(['brush-1:feather-1', 'brush-1:feather-2', 'brush-2:feather-4', 'brush-falls:feather-3', 'brush-3a:feather-5']);
    expect(ROOMS['brush-3b']!.course!.shrine).toBeDefined();
  });

  it("is open to every owl (OP-285), seen from the side on the tree's ground line, holding the dash in every room, with nothing wrong in its kit", () => {
    expect(BRUSH_GROUND).toBe(TREE_GROUND);
    expect(BRUSH_COURSE.keeper).toBeUndefined();
    for (const id of ids) {
      const r = ROOMS[id]!;
      expect(r.keeperOnly, id).toBeUndefined();
      expect(mapOf(r), id).toBe(2);
      expect(holdsDash(r), id).toBe(true);
      expect(kitProblems(r), id).toEqual([]);
      for (const p of r.perches ?? []) expect(p.top, `${id} ${p.id}`).toBeLessThanOrEqual(perchTopLimit(r.size.h));
      expect(TREE_REALMS.has(id), id).toBe(false);
    }
  });

  it("is reached through the paper Commons' middle arch, open to every owl (OP-285), and the summit's moon gate leads back there", () => {
    const arch = ROOMS['commons-ink']!.doors.find((d) => d.id === 'to-course')!;
    expect(arch.to).toEqual({ room: 'brush-1', spawn: 'from-gate' });
    expect(arch.closedSign).toBeUndefined();
    expect(ROOMS['commons-ink']!.spawns['from-course']).toBeDefined();
    expect(ROOMS['brush-3b']!.doors.find((d) => d.id === 'home')!.to).toEqual({ room: 'commons-ink', spawn: 'from-course' });
  });

  it('declares every stroke its stones paint as a perch of its room, so the room believes an owl standing on one', () => {
    for (const id of ids) {
      const r = ROOMS[id]!;
      for (const st of allStrokes(r.brushStones)) {
        const perch = r.perches!.find((p) => p.id === st.id);
        expect(perch, `${id} ${st.id}`).toBeDefined();
        expect(perch!.top, `${id} ${st.id}`).toBe(st.top);
      }
      for (const s of r.brushStones ?? []) expect(r.perches!.some((p) => p.id === s.id && p.top === s.top), `${id} stone ${s.id}`).toBe(true);
    }
    // Out in the rain every stone's ink fades in four seconds, but under the temple eaves, where it keeps its six.
    const rain = Object.fromEntries((ROOMS['brush-2']!.brushStones ?? []).map((s) => [s.id, s.ms ?? 6000]));
    expect(rain).toEqual({ k6: 4000, k7: 6000, k8: 6000, k9: 4000, k10: 4000, kE: 4000 });
    expect(ROOMS['brush-2']!.weather).toBe('rain');
  });

  it('reaches every ledge with ink, and the far ones only with it', () => {
    // From the safe floor alone (the water and the mist are a fall), every ledge with the ink painted.
    for (const id of ids) {
      for (const [ledge, tier] of Object.entries(tiersFrom(id))) expect(tier, `${id} ${ledge}`).not.toBeNull();
    }
    // With no ink at all the cliffs, the crossing to the falls and the high ledges of the scroll are out of reach.
    expect(tiersFrom('brush-1', false)).toMatchObject({ c1: null, c2: null, c3: null, reed1: null });
    expect(tiersFrom('brush-2', false)).toMatchObject({ post: null, r2: null, k9: null, k10: null, 'falls-ledge': null });
    // On the scroll the treads are the way up; the cloud banks that stop the long glides past k14's and
    // k18's bridges are hazards in the air, which the route check does not count (the plan's section 5).
    expect(tiersFrom('brush-3a', false)).toMatchObject({ pine: null, m1: null, m3: null, m4: null });
    expect(tiersFrom('brush-3b', false)).toMatchObject({ n1: null });
    // The dash gap: n2 to n3 takes the dash, which an owl holds only in a course.
    const r = ROOMS['brush-3b']!;
    const { course: _course, ...noCourse } = r;
    expect(perchTiers({ ...noCourse, walkable: safeFloor(r) })).toMatchObject({ n3: null, n4: null });
  });

  it("puts each piece on its ledge, the hazards on the floor, the waterfall's dry band at the ledge behind it, and every spawn on safe ground", () => {
    for (const id of ids) {
      const r = ROOMS[id]!;
      const c = r.course!;
      for (const p of [...(c.benches ?? []), ...(c.parts ?? []), ...(c.feathers ?? []), ...(c.shrine ? [c.shrine] : [])]) {
        if (!p.top) {
          expect(inPit(r, p.at), `${id} ${p.id} is on safe floor`).toBe(false);
          continue;
        }
        expect(groundAt(r.perches, p.at, p.top), `${id} ${p.id} stands on a ledge ${p.top} high`).toBe(p.top);
        // On a ledge, not only on a stroke of ink.
        const strokes = new Set(allStrokes(r.brushStones).map((s) => s.id));
        expect(groundAt(r.perches!.filter((q) => !strokes.has(q.id)), p.at, p.top), `${id} ${p.id}`).toBe(p.top);
      }
      for (const name of Object.keys(r.spawns)) {
        const top = spawnTop(r, name);
        if (top) expect(groundAt(r.perches, r.spawns[name]!, top), `${id} spawn ${name}`).toBe(top);
        else expect(inPit(r, r.spawns[name]!), `${id} spawn ${name}`).toBe(false);
      }
      for (const t of c.thorns ?? []) expect(t.x0 >= 0 && t.x1 <= r.size.w && t.z0 < t.z1, `${id} ${t.id}`).toBe(true);
    }
    // k10's bridge runs through the dry band behind the falls, at 540: the falls above and below it are a fall.
    const [k10] = brushStrokes(ROOMS['brush-2']!.brushStones!.find((s) => s.id === 'k10')!);
    expect(inThorns(ROOMS['brush-2'], 4270, k10!.top)).toBe(false);
    expect(inThorns(ROOMS['brush-2'], 4270, 300)).toBe(true);
    expect(inThorns(ROOMS['brush-2'], 4270, 700)).toBe(true);
  });

  it('keeps a run going through every room: a seal in the cave behind the falls, two on the second panel, the shrine at the summit', () => {
    const book = new CollectionBook(new MemoryCollectionStore());
    const courses = new CourseBook(new MemoryCourseStore(), book, COURSES, rooms);
    const cid = 'c_owlbbbbb';
    const t = Date.UTC(2026, 10, 6, 18);
    expect(courses.start(cid, 'brush-2', t).ok).toBe(false);
    expect(courses.start(cid, 'brush-1', t).ok).toBe(true);
    for (const [room, seal] of [['brush-1', 'seal-1'], ['brush-falls', 'seal-2'], ['brush-3b', 'seal-3']] as const) expect(courses.reach(cid, room, 'part', seal, t + 5000).ok).toBe(true);
    expect(courses.finish(cid, 'brush-3b', t + 60_000)).toMatchObject({ ok: false, reason: 'parts' });
    expect(courses.reach(cid, 'brush-3b', 'part', 'seal-4', t + 61_000).ok).toBe(true);
    expect(courses.finish(cid, 'brush-3b', t + 62_000)).toMatchObject({ ok: true });
  });
});
