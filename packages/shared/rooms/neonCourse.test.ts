import { describe, expect, it } from 'vitest';
import { CollectionBook, MemoryCollectionStore } from '../src/book';
import { SIGN_WARN_MS, litPerches, signEnding, signLit } from '../src/circuit';
import { courseParts, coursePieces, courseProblems, holdsDash, inPit, inThorns, LOST_FEATHERS } from '../src/course';
import { CourseBook, MemoryCourseStore } from '../src/coursebook';
import { kitProblems } from '../src/kit';
import { groundAt, perchTopLimit } from '../src/perches';
import type { Polygon } from '../src/geometry';
import { mapOf, spawnTop, type RoomDef } from '../src/room';
import { perchTiers } from '../src/routes';
import { CIRCUIT_COURSE, CIRCUIT_GROUND, CIRCUIT_ROOMS } from './neonCourse';
import { COURSES, ROOMS, TREE_GROUND, TREE_REALMS } from './index';

const rooms = (id: string) => ROOMS[id];
const ids = [...CIRCUIT_COURSE.acts, ...(CIRCUIT_COURSE.rooms ?? [])];
/** A room's floor less its pits (the drops to the street): where an owl takes off from without falling. */
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
/** What each ledge takes from the safe floor, with the signs lit but those in `dark`. */
const tiersFrom = (id: string, dark: readonly string[] = []) => {
  const r = ROOMS[id]!;
  return perchTiers({ ...r, walkable: safeFloor(r), perches: (r.perches ?? []).filter((p) => !dark.includes(p.id)) });
};
const signIds = (id: string) => (ROOMS[id]!.neonSigns ?? []).map((s) => s.id);

describe("the neon realm's course", () => {
  it('is a course with nothing wrong with it: three acts, three breakers, four benches, five lost feathers and the shrine on the tallest roof', () => {
    expect(COURSES[CIRCUIT_COURSE.id]).toBe(CIRCUIT_COURSE);
    expect(courseProblems(CIRCUIT_COURSE, rooms)).toEqual([]);
    expect(Object.keys(CIRCUIT_ROOMS).sort()).toEqual([...ids].sort());
    expect(CIRCUIT_COURSE.objective).toBe('breakers');
    expect(courseParts(CIRCUIT_COURSE, rooms).map((p) => p.id)).toEqual(['breaker-1', 'breaker-2', 'breaker-3']);
    expect(coursePieces(CIRCUIT_COURSE, rooms, 'bench')).toHaveLength(4);
    expect(coursePieces(CIRCUIT_COURSE, rooms, 'feather')).toHaveLength(LOST_FEATHERS);
    expect(ROOMS['circuit-3']!.course!.shrine).toBeDefined();
  });

  it("is the keepers' for now, seen from the side on the tree's ground line, holding the dash in every room, with nothing wrong in its kit", () => {
    expect(CIRCUIT_GROUND).toBe(TREE_GROUND);
    expect(CIRCUIT_COURSE.keeper).toBe(true);
    for (const id of ids) {
      const r = ROOMS[id]!;
      expect(r.keeperOnly, id).toBe(true);
      expect(mapOf(r), id).toBe(2);
      expect(holdsDash(r), id).toBe(true);
      expect(kitProblems(r), id).toEqual([]);
      for (const p of r.perches ?? []) expect(p.top, `${id} ${p.id}`).toBeLessThanOrEqual(perchTopLimit(r.size.h));
      expect(TREE_REALMS.has(id), id).toBe(false);
    }
  });

  it("is reached through the neon Commons' middle arch, shut to any owl but a keeper's, and the tallest roof's door leads back there", () => {
    const arch = ROOMS['commons-market']!.doors.find((d) => d.id === 'to-course')!;
    expect(arch.to).toEqual({ room: 'circuit-1', spawn: 'from-gate' });
    expect(arch.closedSign).toBe('Not Yet Fledged');
    expect(ROOMS['commons-market']!.spawns['from-course']).toBeDefined();
    expect(ROOMS['circuit-3']!.doors.find((d) => d.id === 'home')!.to).toEqual({ room: 'commons-market', spawn: 'from-course' });
  });

  it('declares every sign as a perch of its room, so the room believes an owl standing on one, and leaves the dark ones out as the circuits take turns', () => {
    for (const id of ids) {
      const r = ROOMS[id]!;
      expect(r.neonSigns?.length, id).toBeGreaterThan(0);
      for (const s of r.neonSigns ?? []) {
        const perch = r.perches!.find((p) => p.id === s.id);
        expect(perch, `${id} ${s.id}`).toBeDefined();
        expect(perch!.top, `${id} ${s.id}`).toBe(s.top);
      }
    }
    // The two circuits take turns: every moment of a turn one of them is lit, and for a spell at each change both are.
    for (const id of ids) {
      const signs = ROOMS[id]!.neonSigns!;
      const a = signs.find((s) => s.circuit === 'a')!;
      const b = signs.find((s) => s.circuit === 'b');
      if (!b) continue;
      const cycle = a.onMs + a.offMs;
      let both = 0;
      for (let t = 0; t < cycle; t += 50) {
        expect(signLit(a, t) || signLit(b, t), `${id} at ${t}`).toBe(true);
        if (signLit(a, t) && signLit(b, t)) both += 50;
        // A sign that goes dark has flickered first.
        if (signLit(a, t) && !signLit(a, t + 50)) expect(signEnding(a, t - SIGN_WARN_MS + 100)).toBe(true);
      }
      expect(both, id).toBeGreaterThanOrEqual(600);
    }
    // An owl on a sign stands on it while it is lit and drops through once it is dark.
    const r = ROOMS['circuit-1']!;
    const s1 = r.neonSigns!.find((s) => s.id === 's1')!;
    const on = { x: 790, y: CIRCUIT_GROUND };
    expect(groundAt(litPerches(r.perches, r.neonSigns, 100), on, s1.top)).toBe(s1.top);
    expect(groundAt(litPerches(r.perches, r.neonSigns, s1.onMs + 100), on, s1.top)).toBe(0);
  });

  it('reaches every ledge with the signs lit, and the high roofs only by them', () => {
    for (const id of ids) {
      for (const [ledge, tier] of Object.entries(tiersFrom(id))) expect(tier, `${id} ${ledge}`).not.toBeNull();
    }
    // With every sign dark the high roofs, the breakers' roofs and the summit are out of reach.
    expect(tiersFrom('circuit-1', signIds('circuit-1'))).toMatchObject({ b1: null, b2: null, board1: null, bridge1: null });
    expect(tiersFrom('circuit-2', signIds('circuit-2'))).toMatchObject({ r1: null, r2: null, r3: null });
    expect(tiersFrom('circuit-3', signIds('circuit-3'))).toMatchObject({ m1: null, m2: null, summit: null });
    // The climbs: up the second roof of act 1 either sign alone is not enough; up the tall roof of act 2 the last sign is the way (over the dark block the wires make the signs the way, below).
    expect(tiersFrom('circuit-1', ['s2'])).toMatchObject({ b2: null });
    expect(tiersFrom('circuit-1', ['s3'])).toMatchObject({ b2: null });
    expect(tiersFrom('circuit-2', ['s8'])).toMatchObject({ r3: null });
    // Without the dash nothing of the course is skipped: the street gaps stay shut to a glide alone too.
    const r = ROOMS['circuit-1']!;
    const { course: _course, ...noCourse } = r;
    expect(perchTiers({ ...noCourse, walkable: safeFloor(r), perches: (r.perches ?? []).filter((p) => !signIds('circuit-1').includes(p.id)) })).toMatchObject({ b1: null });
  });

  it('puts each piece on a ledge that is not a sign, the wires over the street, and every spawn on safe ground', () => {
    for (const id of ids) {
      const r = ROOMS[id]!;
      const c = r.course!;
      const signs = new Set(signIds(id));
      for (const p of [...(c.benches ?? []), ...(c.parts ?? []), ...(c.feathers ?? []), ...(c.shrine ? [c.shrine] : [])]) {
        if (!p.top) {
          expect(inPit(r, p.at), `${id} ${p.id} is on safe floor`).toBe(false);
          continue;
        }
        expect(groundAt(r.perches!.filter((q) => !signs.has(q.id)), p.at, p.top), `${id} ${p.id} stands on a ledge ${p.top} high`).toBe(p.top);
      }
      for (const name of Object.keys(r.spawns)) {
        const top = spawnTop(r, name);
        if (top) expect(groundAt(r.perches, r.spawns[name]!, top), `${id} spawn ${name}`).toBe(top);
        else expect(inPit(r, r.spawns[name]!), `${id} spawn ${name}`).toBe(false);
      }
      for (const t of c.thorns ?? []) expect(t.x0 >= 0 && t.x1 <= r.size.w && t.z0 < t.z1, `${id} ${t.id}`).toBe(true);
      // No sign stands in the wires.
      for (const s of r.neonSigns ?? []) expect(inThorns(r, (s.x0 + s.x1) / 2, s.top), `${id} ${s.id}`).toBe(false);
    }
    // Over the dark block the signs run between the wires: under them is a fall, and a jump with both flaps up into the ones above.
    expect(inThorns(ROOMS['circuit-2'], 1500, 300)).toBe(true);
    expect(inThorns(ROOMS['circuit-2'], 1500, 470 + 260)).toBe(true);
    expect(inThorns(ROOMS['circuit-2'], 1500, 470 + 149)).toBe(false);
    // A glide off the first dark roof over the block, from as high as the wires above let it (the flap, under 680) and with the dash
    // (115 px with no fall), still meets the wires below before it is past them: the signs are the way across, not a glide.
    const r1 = ROOMS['circuit-2']!.perches!.find((p) => p.id === 'r1')!;
    const r1x = Math.max(...r1.area.map((v) => v.x));
    const line = Array.from({ length: 94 }, (_, i) => 1110 + i * 10).map((x) => ({ x, z: 679 - Math.max(0, x - r1x - 115) / 3 }));
    expect(line.some((p) => inThorns(ROOMS['circuit-2'], p.x, p.z))).toBe(true);
  });

  it('keeps a run going through every act: a breaker on each, the shrine on the tallest roof', () => {
    const book = new CollectionBook(new MemoryCollectionStore());
    const courses = new CourseBook(new MemoryCourseStore(), book, COURSES, rooms);
    const cid = 'c_owlccccc';
    const t = Date.UTC(2026, 10, 6, 20);
    expect(courses.start(cid, 'circuit-2', t).ok).toBe(false);
    expect(courses.start(cid, 'circuit-1', t).ok).toBe(true);
    for (const [room, b] of [['circuit-1', 'breaker-1'], ['circuit-2', 'breaker-2']] as const) expect(courses.reach(cid, room, 'part', b, t + 5000).ok).toBe(true);
    expect(courses.finish(cid, 'circuit-3', t + 50_000)).toMatchObject({ ok: false, reason: 'parts' });
    expect(courses.reach(cid, 'circuit-3', 'part', 'breaker-3', t + 51_000).ok).toBe(true);
    expect(courses.finish(cid, 'circuit-3', t + 52_000)).toMatchObject({ ok: true });
  });
});
