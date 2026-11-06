import { describe, expect, it } from 'vitest';
import { CollectionBook, MemoryCollectionStore } from '../src/book';
import { courseParts, coursePieces, courseProblems, holdsDash, inPit, inThorns, LOST_FEATHERS } from '../src/course';
import { CourseBook, MemoryCourseStore } from '../src/coursebook';
import { mapOf } from '../src/room';
import { perchTiers } from '../src/routes';
import { COURSES, ROOMS, TREE_GROUND, TREE_REALMS } from './index';
import { CANOPY_COURSE, CANOPY_GROUND, CANOPY_ROOMS } from './updraftCanopy';

const rooms = (id: string) => ROOMS[id];
const ids = [...CANOPY_COURSE.acts, ...(CANOPY_COURSE.rooms ?? [])];

describe('the Updraft Canopy (OP-226)', () => {
  it('is a course with nothing wrong with it: three acts, seven rooms, five bells, four benches, five lost feathers and the shrine in the hut', () => {
    expect(COURSES[CANOPY_COURSE.id]).toBe(CANOPY_COURSE);
    expect(courseProblems(CANOPY_COURSE, rooms)).toEqual([]);
    expect(Object.keys(CANOPY_ROOMS).sort()).toEqual([...ids].sort());
    expect(courseParts(CANOPY_COURSE, rooms).map((p) => p.id)).toEqual(['bell-1', 'bell-2', 'bell-3', 'bell-4', 'bell-5']);
    expect(coursePieces(CANOPY_COURSE, rooms, 'bench')).toHaveLength(4);
    const feathers = coursePieces(CANOPY_COURSE, rooms, 'feather');
    expect(feathers).toHaveLength(LOST_FEATHERS);
    // The third is in the hidden room under the roots, act 1's: counted with its act, before act 2's.
    expect(feathers.map((f) => `${f.room}:${f.id}`)).toEqual(['canopy-1:feather-1', 'canopy-1:feather-2', 'canopy-roots:feather-3', 'canopy-2b:feather-4', 'canopy-3:feather-5']);
    expect(ROOMS['canopy-hut']!.course!.shrine).toBeDefined();
  });

  it("is the keepers' for now, seen from the side on the tree's ground line, holding the dash in every room, and no level of the tree", () => {
    expect(CANOPY_GROUND).toBe(TREE_GROUND);
    expect(CANOPY_COURSE.keeper).toBe(true);
    for (const id of ids) {
      const r = ROOMS[id]!;
      expect(r.keeperOnly, id).toBe(true);
      expect(mapOf(r), id).toBe(2);
      expect(holdsDash(r), id).toBe(true);
    }
    expect(TREE_REALMS.has('trail-head')).toBe(false);
    for (const id of ids) expect(TREE_REALMS.has(id), id).toBe(false);
  });

  it('every ledge is reached, and the high ones only through an updraft', () => {
    for (const id of ids) {
      const tiers = perchTiers(ROOMS[id]!);
      for (const [ledge, tier] of Object.entries(tiers)) expect(tier, `${id} ${ledge}`).not.toBeNull();
    }
    // Without its columns, the fern floor's bells and the crown's limbs are out of reach (thorns aside).
    const without = (id: string) => perchTiers({ ...ROOMS[id]!, updrafts: [] });
    expect(without('canopy-1')).toMatchObject({ b1: null, b2: null, l5: null, l6: null, l8: null });
    expect(without('canopy-2b')).toMatchObject({ u2: null, u3: null, 'knot-shelf': null });
    expect(without('canopy-2c')).toMatchObject({ v2: null, v3: null, v4: null });
    expect(without('canopy-3')).toMatchObject({ c3: null, c5: null, c7: null, c10: null, c13: null, c14: null, c15: null });
  });

  it("puts each piece on its ledge, the pits on the floor and the thorns inside the room's air", () => {
    for (const id of ids) {
      const r = ROOMS[id]!;
      const c = r.course!;
      for (const p of [...(c.benches ?? []), ...(c.parts ?? []), ...(c.feathers ?? []), ...(c.shrine ? [c.shrine] : [])]) {
        if (!p.top) {
          expect(inPit(r, p.at), `${id} ${p.id} is on safe floor`).toBe(false);
          continue;
        }
        const ledge = r.perches!.find((l) => l.top === p.top && Math.min(...l.area.map((v) => v.x)) <= p.at.x && p.at.x <= Math.max(...l.area.map((v) => v.x)));
        expect(ledge, `${id} ${p.id} stands on a ledge ${p.top} high`).toBeDefined();
      }
      for (const name of Object.keys(r.spawns)) expect(inPit(r, r.spawns[name]!), `${id} spawn ${name}`).toBe(false);
      for (const t of c.thorns ?? []) expect(t.x0 >= 0 && t.x1 <= r.size.w && t.z0 < t.z1, `${id} ${t.id}`).toBe(true);
    }
    // The hanging thorns over the log's west mouth reach down to 260, and a glide under them passes.
    expect(inThorns(ROOMS['canopy-1'], 1990, 300)).toBe(true);
    expect(inThorns(ROOMS['canopy-1'], 1990, 200)).toBe(false);
  });

  it('keeps a run going through every room of an act: a bell in a storey above, a feather in the hidden room, the shrine in the hut', () => {
    const store = new MemoryCourseStore();
    const book = new CollectionBook(new MemoryCollectionStore());
    const courses = new CourseBook(store, book, COURSES, rooms);
    const cid = 'c_owlaaaaa';
    const t = Date.UTC(2026, 10, 6, 16);
    // A run starts only at the first act's way in.
    expect(courses.start(cid, 'canopy-roots', t).ok).toBe(false);
    expect(courses.start(cid, 'canopy-1', t).ok).toBe(true);
    expect(courses.reach(cid, 'canopy-roots', 'feather', 'feather-3', t + 1000)).toMatchObject({ ok: true, first: true });
    // A fall in a room with no bench of its own puts the owl back at that room's way in.
    expect(courses.fall(cid, 'canopy-2b', t + 2000)).toMatchObject({ ok: true, at: ROOMS['canopy-2b']!.spawns['default'] });
    for (const [room, bell] of [['canopy-1', 'bell-1'], ['canopy-1', 'bell-2'], ['canopy-2a', 'bell-3'], ['canopy-3', 'bell-4']] as const) expect(courses.reach(cid, room, 'part', bell, t + 3000).ok).toBe(true);
    expect(courses.finish(cid, 'canopy-hut', t + 60_000)).toMatchObject({ ok: false, reason: 'parts' });
    expect(courses.reach(cid, 'canopy-3', 'part', 'bell-5', t + 61_000).ok).toBe(true);
    const done = courses.finish(cid, 'canopy-hut', t + 62_000);
    expect(done).toMatchObject({ ok: true });
  });

  it("finds a room listed with a course that is none of its acts' rooms", () => {
    const stray = { ...CANOPY_COURSE, rooms: [...CANOPY_COURSE.rooms!, 'trail-2'] };
    expect(courseProblems(stray, rooms)).toContain('trail-2: is no act of canopy');
    const twoShrines = { ...CANOPY_COURSE, rooms: CANOPY_COURSE.rooms!.filter((id) => id !== 'canopy-hut') };
    expect(courseProblems(twoShrines, rooms)).toContain('canopy: has 0 finish shrines');
  });
});
