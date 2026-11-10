import { describe, expect, it } from 'vitest';
import { CollectionBook, MemoryCollectionStore } from '../src/book';
import { courseParts, coursePieces, courseProblems, fellInPit, holdsDash, inPit, inThorns, LOST_FEATHERS } from '../src/course';
import { CourseBook, MemoryCourseStore } from '../src/coursebook';
import { ALL_FLIGHT, FLAP_RISE, FLIGHT_STEP_MS, GROUNDED, JUMP_RISE, LIFTED, newFlier, stepFlier, type Flier } from '../src/flight';
import { groundAt, type Perch } from '../src/perches';
import { ROOM_W, mapOf, type RoomDef } from '../src/room';
import { perchTiers } from '../src/routes';
import { UPDRAFT_RISE, liftAt, type Updraft } from '../src/updraft';
import { WALK_SPEED } from '../src/walk';
import { COURSES, ROOMS, TREE_GROUND, TREE_REALMS } from './index';
import { CANOPY_COURSE, CANOPY_GROUND, CANOPY_ROOMS } from './updraftCanopy';

const rooms = (id: string) => ROOMS[id];
const ids = [...CANOPY_COURSE.acts, ...(CANOPY_COURSE.rooms ?? [])];

describe('the Updraft Canopy (OP-226)', () => {
  it('is a course with nothing wrong with it: three acts, seven rooms, five bells, a bench on every screen, five lost feathers and the shrine in the hut', () => {
    expect(COURSES[CANOPY_COURSE.id]).toBe(CANOPY_COURSE);
    expect(courseProblems(CANOPY_COURSE, rooms)).toEqual([]);
    expect(Object.keys(CANOPY_ROOMS).sort()).toEqual([...ids].sort());
    expect(courseParts(CANOPY_COURSE, rooms).map((p) => p.id)).toEqual(['bell-1', 'bell-2', 'bell-3', 'bell-4', 'bell-5']);
    expect(coursePieces(CANOPY_COURSE, rooms, 'bench').map((b) => `${b.room}:${b.id}`)).toEqual([
      'canopy-1:bench-1',
      'canopy-1:bench-1b',
      'canopy-2a:bench-2',
      'canopy-3:bench-3',
      'canopy-3:bench-3b',
      'canopy-3:bench-4',
      'canopy-3:bench-4b',
    ]);
    const feathers = coursePieces(CANOPY_COURSE, rooms, 'feather');
    expect(feathers).toHaveLength(LOST_FEATHERS);
    // The third is in the hidden room under the roots, act 1's: counted with its act, before act 2's.
    expect(feathers.map((f) => `${f.room}:${f.id}`)).toEqual(['canopy-1:feather-1', 'canopy-1:feather-2', 'canopy-roots:feather-3', 'canopy-2b:feather-4', 'canopy-3:feather-5']);
    expect(ROOMS['canopy-hut']!.course!.shrine).toBeDefined();
  });

  it("is open to every owl (OP-285), seen from the side on the tree's ground line, holding the dash in every room, and no level of the tree", () => {
    expect(CANOPY_GROUND).toBe(TREE_GROUND);
    expect(CANOPY_COURSE.keeper).toBeUndefined();
    for (const id of ids) {
      const r = ROOMS[id]!;
      expect(r.keeperOnly, id).toBeUndefined();
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
      for (const name of Object.keys(r.spawns)) {
        // A spawn up on a ledge (spawnTops) stands on it, wherever the floor is under it; one on the floor stands on safe floor.
        const top = r.spawnTops?.[name] ?? 0;
        const at = r.spawns[name]!;
        if (top) expect(r.perches!.some((l) => l.top === top && Math.min(...l.area.map((v) => v.x)) <= at.x && at.x <= Math.max(...l.area.map((v) => v.x))), `${id} spawn ${name} on a ledge ${top} high`).toBe(true);
        else expect(inPit(r, at), `${id} spawn ${name}`).toBe(false);
      }
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

/**
 * The course as a 10 year old plays it (the owner's kid bar, Nov 7: "something a 10 year old can do in a
 * few tries"). The kid sim (bots/) plays every hop thousands of ways; these hold the layout to the rules
 * that make those hops easy, with the game's own flight (stepFlier), so a ledge moved later cannot
 * quietly break one.
 */
describe('the Updraft Canopy, laid out for a 10 year old', () => {
  const G = CANOPY_GROUND;
  const perch = (room: RoomDef, id: string): Perch => room.perches!.find((p) => p.id === id)!;
  const span = (p: Perch): [number, number] => [Math.min(...p.area.map((v) => v.x)), Math.max(...p.area.map((v) => v.x))];
  const column = (room: RoomDef, id: string): Updraft => room.updrafts!.find((u) => u.id === id)!;

  /**
   * An owl flown as the page flies its own (RoomScene's `fly`): the flight's step, the ground under it,
   * the room's gusts by park time, and its way across at the walk's pace, until it stands on something,
   * touches thorns or comes down in a pit. `keys` says what is held each step.
   */
  function fly(room: RoomDef, start: { x: number; flier: Flier; t?: number }, keys: (o: { x: number; z: number; step: number }) => { way: -1 | 0 | 1; held: boolean; pressed?: boolean }): { end: 'landed' | 'thorns' | 'pit' | 'aloft'; x: number; z: number } {
    let x = start.x;
    let fl = start.flier;
    let t = start.t ?? 0;
    for (let step = 0; step < 12 * 120; step++) {
      const k = keys({ x, z: fl.air.z, step });
      const lift = liftAt(room.updrafts, x, fl.air.z, t)?.top ?? null;
      fl = stepFlier(fl, { pressed: k.pressed ?? false, held: k.held }, groundAt(room.perches, { x, y: G }, fl.air.z), ALL_FLIGHT, lift);
      x += (k.way * WALK_SPEED * FLIGHT_STEP_MS) / 1000;
      t += FLIGHT_STEP_MS;
      if (inThorns(room, x, fl.air.z)) return { end: 'thorns', x, z: fl.air.z };
      if (fellInPit(room, { x, y: G }, fl.air.s === GROUNDED, fl.air.z)) return { end: 'pit', x, z: 0 };
      if (step > 0 && fl.air.s === GROUNDED) return { end: 'landed', x, z: fl.air.z };
    }
    return { end: 'aloft', x, z: fl.air.z };
  }
  const standing = (z: number): Flier => ({ ...newFlier(), air: { z, vz: 0, s: GROUNDED, f: 0 } });

  it('has a bench on every screen past the first of each act, so a fall is a screen again at most', () => {
    // Act 2 is a room a screen: a fall there is back at that room's way in.
    for (const id of ['canopy-1', 'canopy-3']) {
      const r = ROOMS[id]!;
      const at = (r.course!.benches ?? []).map((b) => b.at.x);
      for (let screen = 1; screen < r.size.w / ROOM_W; screen++) {
        expect(at.some((x) => x >= screen * ROOM_W - 200 && x < (screen + 1) * ROOM_W), `${id} screen ${screen + 1}`).toBe(true);
      }
    }
  });

  it('blows every gust on one clock, long enough to ride from its foot to its top with a second to spare', () => {
    const timed = ids.flatMap((id) => (ROOMS[id]!.updrafts ?? []).filter((u) => u.onMs !== undefined).map((u) => ({ id, u })));
    expect(timed.length).toBeGreaterThan(8);
    for (const { id, u } of timed) {
      expect([u.onMs, u.offMs], `${id} ${u.id}`).toEqual([4000, 2000]);
      expect(u.onMs!, `${id} ${u.id}`).toBeGreaterThanOrEqual((u.top / UPDRAFT_RISE) * 1000 + 1000);
    }
  });

  // Each high ledge an owl leaves by dropping under hanging thorns, and the low one it lands on.
  const DROPS: ReadonlyArray<readonly [room: string, high: string, low: string]> = [
    ['canopy-1', 'l5', 'l5b'],
    ['canopy-1', 'l6', 'l7'],
    ['canopy-1', 'l8', 'l9'],
    ['canopy-2b', 'u2', 'u2b'],
    ['canopy-2c', 'v2', 'v2b'],
    ['canopy-3', 'c10', 'c11'],
  ];

  it('lands an owl that walks off the end of a high ledge on the ledge under it, steering on or letting go, clear of the thorns', () => {
    for (const [id, high, low] of DROPS) {
      const r = ROOMS[id]!;
      const from = perch(r, high);
      const to = perch(r, low);
      const edge = span(from)[1];
      // Letting go at the edge; holding east the whole way; and the same on a slow device, whose page
      // sees the edge a frame late (13 px at 20 frames a second).
      for (const [name, way, late] of [['letting go', 0, 0], ['steering on', 1, 0], ['steering on, a frame late', 1, 13]] as const) {
        const got = fly(r, { x: edge + 1 + late, flier: standing(from.top) }, () => ({ way, held: false }));
        expect(got, `${id} ${high}: ${name}`).toMatchObject({ end: 'landed', z: to.top });
        // With room to stop: not at the low ledge's very end.
        expect(span(to)[1] - got.x, `${id} ${high}: ${name}`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('keeps a full jump off each low ledge under the foot of the thorns over it', () => {
    for (const [id, , low] of DROPS) {
      const r = ROOMS[id]!;
      const [x0, x1] = span(perch(r, low));
      // The hanging thorns a jump off it can come under: over it, or within a jump's reach of its ends.
      const over = (r.course!.thorns ?? []).filter((t) => t.z0 > 0 && t.x1 > x0 - 200 && t.x0 < x1 + 200);
      expect(over.length, `${id} ${low}`).toBeGreaterThan(0);
      for (const t of over) expect(perch(r, low).top + JUMP_RISE, `${id} ${low} under ${t.id}`).toBeLessThan(t.z0 - 10);
    }
  });

  // Each gust and the ledge it leads to.
  const GUSTS: ReadonlyArray<readonly [room: string, gust: string, ledge: string]> = [
    ['canopy-1', 'U1', 'b1'],
    ['canopy-1', 'U2', 'l5'],
    ['canopy-1', 'U3', 'l6'],
    ['canopy-1', 'U4', 'l8'],
    ['canopy-1', 'U5', 'b2'],
    ['canopy-2a', 'U6', 't3'],
    ['canopy-2b', 'U7', 'u2'],
    ['canopy-2b', 'U8', 'u3'],
    ['canopy-2c', 'U9', 'v2'],
    ['canopy-2c', 'U10', 'v3'],
    ['canopy-3', 'U11', 'c3'],
    ['canopy-3', 'U12', 'c5'],
    ['canopy-3', 'U13', 'c7'],
    ['canopy-3', 'U14', 'c10'],
  ];

  it('lands an owl that keeps holding Jump off the top of a gust on the ledge the gust leads to', () => {
    for (const [id, gust, ledge] of GUSTS) {
      const r = ROOMS[id]!;
      const u = column(r, gust);
      const to = perch(r, ledge);
      const [x0, x1] = span(to);
      const way = x0 > u.x ? 1 : -1;
      // Held at the gust's top (it has just come on), from each side of the column and its middle.
      for (const x of [u.x + 10, u.x + u.w / 2, u.x + u.w - 10]) {
        const lifted: Flier = { ...newFlier(), air: { z: u.top, vz: UPDRAFT_RISE, s: LIFTED, f: 2, h: u.top } };
        const t = u.onMs === undefined ? 0 : -(u.phase ?? 0) * (u.onMs + u.offMs!);
        const got = fly(r, { x, flier: lifted, t }, () => ({ way, held: true }));
        expect(got, `${id} ${gust} from x ${x}`).toMatchObject({ end: 'landed', z: to.top });
        // With room to spare before the ledge's far end: a slow device's page sees the column's edge a frame late.
        expect(way > 0 ? x1 - got.x : got.x - x0, `${id} ${gust} from x ${x}`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  // Each high ledge a gust leads to, the low ledge (or the floor, null) an owl sets off from for it, and
  // the hanging thorns it comes under on the way from the high ledge before, where there are any.
  const NEEDS: ReadonlyArray<readonly [room: string, high: string, low: string | null, thorns: string | null]> = [
    ['canopy-1', 'b1', 'f2', null],
    ['canopy-1', 'l5', 's4', 'H1'],
    ['canopy-1', 'l6', 'l5b', 'H2'],
    ['canopy-1', 'l8', 'l7', 'H3'],
    ['canopy-1', 'b2', 'l9', 'H4'],
    ['canopy-1', 'b2', null, null],
    ['canopy-2a', 't3', null, 'vine'],
    ['canopy-2b', 'u2', 'u1', null],
    ['canopy-2b', 'u3', 'u2b', 'curtain'],
    ['canopy-2c', 'v2', 'v1', null],
    ['canopy-2c', 'v3', 'v2b', 'hanging'],
    ['canopy-3', 'c3', 'c2', null],
    ['canopy-3', 'c5', 'c4', 'K1'],
    ['canopy-3', 'c7', 'c6', 'K2'],
    ['canopy-3', 'c10', 'c9', 'K3'],
    ['canopy-3', 'c13', 'c11', 'K4'],
  ];

  it('still needs every gust: no jump with both flaps reaches a high ledge from the low one before it, nor from under the thorns', () => {
    // A jump and both flaps, each at the top of the last, and both flaps alone (an owl in the air under thorns has no jump).
    const jumpAndFlaps = JUMP_RISE + 2 * FLAP_RISE;
    for (const [id, high, low, thorns] of NEEDS) {
      const r = ROOMS[id]!;
      const top = perch(r, high).top;
      expect(top - (low ? perch(r, low).top : 0), `${id} ${high} from ${low ?? 'the floor'}`).toBeGreaterThan(jumpAndFlaps);
      if (thorns) {
        const t = r.course!.thorns!.find((h) => h.id === thorns)!;
        expect(top - t.z0, `${id} ${high} from under ${thorns}`).toBeGreaterThan(2 * FLAP_RISE);
      }
    }
  });

  it("rises bell 2's gust from safe moss, so an owl that came the low way still rings it, and a miss is no fall", () => {
    const r = ROOMS['canopy-1']!;
    const u5 = column(r, 'U5');
    for (const x of [u5.x, u5.x + u5.w / 2, u5.x + u5.w]) expect(inPit(r, { x, y: G }), `x ${x}`).toBe(false);
    // Standing in it on the moss as it comes on: a jump held is carried up, and steering east lands on bell 2's bough.
    const b2 = perch(r, 'b2');
    const t0 = -(u5.phase ?? 0) * (u5.onMs! + u5.offMs!);
    let east = false;
    const got = fly(r, { x: u5.x + u5.w / 2, flier: standing(0), t: t0 }, ({ z, step }) => {
      east ||= z >= u5.top - 2;
      return { way: east ? 1 : 0, held: true, pressed: step === 0 };
    });
    expect(got).toMatchObject({ end: 'landed', z: b2.top });
  });

  it("reaches bell 3's branch with a careful jump (a flap at the top of each rise), the dash to spare", () => {
    const r = ROOMS['canopy-2a']!;
    const t2 = perch(r, 't2');
    const b3 = perch(r, 'b3');
    // Jump off the shelf's west end, tap Jump again each time the rise runs out (twice), and hold it to glide.
    let last = t2.top;
    let taps = 0;
    const got = fly(r, { x: span(t2)[0] + 1, flier: standing(t2.top) }, ({ step, z }) => {
      const topped = step > 0 && z < last && taps < 2;
      last = z;
      if (topped) taps += 1;
      return { way: -1, held: true, pressed: step === 0 || topped };
    });
    expect(got).toMatchObject({ end: 'landed', z: b3.top });
    expect(taps).toBe(2);
  });
});

