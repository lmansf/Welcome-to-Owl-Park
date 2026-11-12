import { describe, expect, it } from 'vitest';
import { doorTarget } from '../src/doorways';
import { pointInPolygon } from '../src/geometry';
import { GROWN_BASE, GROWN_WAYS, HALL_SCALE, HALL_WAYS, RIM_LENGTH, WAY_STEP, rimAt } from '../src/hollowOval';
import { INTERACTABLES } from '../src/interactables';
import { kitProblems } from '../src/kit';
import { KIT_ART } from '../src/kitArt';
import { GLIDE_SLOPE, MAX_AIR_Z } from '../src/flight';
import { hopTier, perchTiers } from '../src/routes';
import { inThermal, thermalProblems } from '../src/thermal';
import { WALK_SPEED } from '../src/walk';
import { idolRealms, mapOf, voteRealmAt } from '../src/room';
import {
  GROWN_ART,
  HALL_BOWL,
  HALL_COMMONS,
  HALL_CX,
  HALL_CY,
  HALL_GROWN,
  HALL_ID,
  HALL_LIGHT,
  HEART_THERMAL,
  HALL_MIDDLE,
  HALL_ROOM,
  HALL_RX,
  HALL_RY,
  HALL_W,
  OWL_ROOM_PX2,
  ROOT_ART,
  ROOT_RUNS,
  RUN_END_CLEAR,
  RUN_HALF,
  RUN_START,
  RUN_Y,
  atFront,
  courseDoor,
  fromCourse,
  fromRealm,
  idolAt,
  plazaAt,
  realmDoor,
  rootId,
  voteDoor,
  wayS,
  type HallLevel,
  type RootKind,
} from './hollowHall';
import { ANCHORS, HALL_IDOL_REALMS, ROOMS, TREE_REALMS, roomOnMap } from './index';

const hall = ROOMS[HALL_ID]!;
const doorOf = (id: string) => hall.doors.find((d) => d.id === id)!;
const onFloor = (p: { x: number; y: number }) => hall.walkable.some((poly) => pointInPolygon(p, poly));
const middle = (id: string) => {
  const r = doorOf(id).rect;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
/** Where a way stands: its doorway's middle, or for a way the tree has grown over (no doorway) its point on the rim. */
const spot = (id: (typeof HALL_WAYS)[number]) => (hall.doors.some((d) => d.id === id) ? middle(id) : rimAt(wayS(id)));
/** Where a room's ways lead on the new map (doorTarget with map 3). */
const leadsTo = (room: string) => ROOMS[room]!.doors.map((d) => doorTarget(d, 3)).filter((t) => t !== undefined);
/** How far out a point is on the oval: 1 on the rim. */
const ovalR = (p: { x: number; y: number }) => Math.hypot((p.x - HALL_CX) / HALL_RX, (p.y - HALL_CY) / HALL_RY);

describe('the Great Hollow (Nov 7; an oval, Nov 8)', () => {
  it('is one top-down room, four screens wide, open to every owl, with nothing wrong in its kit', () => {
    expect(hall).toBe(HALL_ROOM);
    expect(hall.keeperOnly).toBeUndefined();
    expect(mapOf(hall)).not.toBe(2);
    expect(hall.size.w).toBe(HALL_W);
    expect(kitProblems(hall)).toEqual([]);
    expect(TREE_REALMS.has(HALL_ID)).toBe(false);
    for (const level of ['glass', 'ink', 'grove', 'market']) expect(ROOMS[`commons-${level}`], level).toBeUndefined();
  });

  it('is a huge oval floor, its wall drawn round it with height: a face at the back, a top at the front', () => {
    expect(hall.bowl).toBe(HALL_BOWL);
    expect(HALL_BOWL).toMatchObject({ cx: HALL_CX, cy: HALL_CY, rx: HALL_RX, ry: HALL_RY });
    expect(HALL_BOWL.face).toBeGreaterThan(150);
    expect(HALL_BOWL.face).toBeLessThan(HALL_CY - HALL_RY);
    expect(HALL_CY + HALL_RY + HALL_BOWL.lip).toBeLessThan(hall.size.h);
    // The floor is the oval, but where it is cut in round an idol's base or the roots over a grown-over way.
    for (const p of hall.walkable[0]!) expect(ovalR(p), `${p.x},${p.y}`).toBeLessThanOrEqual(1.001);
    expect(hall.walkable[0]!.filter((p) => ovalR(p) > 0.995).length / hall.walkable[0]!.length).toBeGreaterThan(0.8);
    // Each way out at the front has its opening in the near wall's top.
    for (const id of HALL_WAYS.filter((w) => atFront(w) && w !== 'down'))
      expect(
        HALL_BOWL.gaps!.some((g) => Math.hypot(g.x - middle(id).x, g.y - middle(id).y) < 5),
        id,
      ).toBe(true);
  });

  it('spaces every way out evenly round the rim, so no two doorways stand side by side', () => {
    expect(HALL_WAYS).toHaveLength(11);
    expect(new Set(HALL_WAYS).size).toBe(HALL_WAYS.length);
    // Every way is a doorway, or the tree has grown over it (OP-337): never both.
    for (const id of HALL_WAYS)
      expect(
        hall.doors.some((d) => d.id === id),
        id,
      ).toBe(!HALL_GROWN.includes(id));
    HALL_WAYS.forEach((id, i) => {
      expect(wayS(id)).toBeCloseTo(i * WAY_STEP, 6);
      const next = HALL_WAYS[(i + 1) % HALL_WAYS.length]!;
      // A step apart along the rim, and far apart across the floor too.
      expect(Math.hypot(spot(id).x - spot(next).x, spot(id).y - spot(next).y), `${id} to ${next}`).toBeGreaterThan(900);
    });
    expect(WAY_STEP * HALL_WAYS.length).toBeCloseTo(RIM_LENGTH, 6);
    // Each doorway straddles the rim (the hatch lies just in from it).
    for (const id of HALL_WAYS) expect(Math.abs(ovalR(spot(id)) - 1), id).toBeLessThan(id === 'down' ? 0.08 : 0.01);
    // Every Commons has a way on each half of its stretch of rim: its realm on one side of its idol, its course on the other.
    for (const c of HALL_COMMONS) expect(Math.abs(wayS(realmDoor(c.level)) - wayS(courseDoor(c.level)))).toBeCloseTo(WAY_STEP, 6);
  });

  it('gives every spawn floor to stand on, and every doorway a bit of floor to step into', () => {
    for (const [name, at] of Object.entries(hall.spawns)) expect(onFloor(at), name).toBe(true);
    for (const d of hall.doors) expect(onFloor(middle(d.id)) || onFloor(d.marker!), d.id).toBe(true);
  });

  it('opens each Commons on its realm and its course; a way with nothing behind it yet is no doorway, the tree grown over it (OP-337)', () => {
    for (const c of HALL_COMMONS) {
      for (const [id, way] of [
        [realmDoor(c.level), c.realm],
        [courseDoor(c.level), c.course],
      ] as const) {
        const door = hall.doors.find((d) => d.id === id);
        if (way) {
          expect(door?.to, id).toEqual(way);
          expect(ROOMS[way.room]?.spawns[way.spawn], way.room).toBeDefined();
          expect(HALL_GROWN, id).not.toContain(id);
        } else {
          expect(door, id).toBeUndefined();
          expect(HALL_GROWN, id).toContain(id);
        }
      }
    }
    expect(HALL_GROWN).toBe(GROWN_WAYS);
    expect([...HALL_GROWN]).toEqual(['to-ink', 'course-glass']);
    // No blockade and no closed sign anywhere in the room (OP-286): every doorway leads somewhere, or is an idol's vote spot.
    expect(hall.doors.filter((d) => d.closedSign)).toEqual([]);
    for (const d of hall.doors) expect(d.to !== undefined || d.id.startsWith('idol-'), d.id).toBe(true);
    for (const id of HALL_GROWN) {
      // Roots the kit already has stand over the knothole painted at the way...
      const roots = hall.pieces!.find((p) => p.id === `${id}-grown`)!;
      expect(roots.key).toBe(GROWN_ART);
      expect(KIT_ART[GROWN_ART]).toBeDefined();
      const rim = rimAt(wayS(id));
      expect(Math.hypot(roots.x - rim.x, roots.y - rim.y), id).toBeLessThan(140);
      // ... their foot off the floor, the floor stopping in front of them: owls walk up to the roots, never through.
      expect(onFloor({ x: roots.x, y: roots.y }), id).toBe(false);
      // No owl stands behind them either: the mound is drawn up the screen from its foot, over an owl stood
      // further back, so none of the floor lies under its body (its lower two thirds, a little in from its sides).
      const art = KIT_ART[GROWN_ART]!;
      for (let x = roots.x - art.w / 2 + 40; x <= roots.x + art.w / 2 - 40; x += 20)
        for (let y = roots.y - Math.round((art.h * 2) / 3); y <= roots.y; y += 20) expect(onFloor({ x, y }), `${id}: ${x},${y} behind the roots`).toBe(false);
      expect(onFloor(rimAt(wayS(id), GROWN_BASE - 30)), id).toBe(false);
      expect(onFloor(rimAt(wayS(id), GROWN_BASE + 40)), id).toBe(true);
      // No arrival spot is kept for a way nothing comes in by.
      expect(hall.spawns[id.startsWith('to-') ? fromRealm(id.slice(3) as HallLevel) : fromCourse(id.slice(7) as HallLevel)], id).toBeUndefined();
    }
  });

  it('brings an owl back from each realm and course to its own doorway', () => {
    for (const c of HALL_COMMONS) {
      if (c.realm) expect(leadsTo(c.realm.room), c.level).toContainEqual({ room: HALL_ID, spawn: fromRealm(c.level) });
      if (c.course) expect(leadsTo(c.course.room), c.level).toContainEqual({ room: HALL_ID, spawn: fromCourse(c.level) });
    }
    // Each comes back in front of its own doorway, not across the hall.
    for (const c of HALL_COMMONS) {
      for (const [spawn, way, open] of [
        [fromRealm(c.level), realmDoor(c.level), c.realm],
        [fromCourse(c.level), courseDoor(c.level), c.course],
      ] as const) {
        if (!open) continue;
        const at = hall.spawns[spawn]!;
        expect(Math.hypot(at.x - middle(way).x, at.y - middle(way).y), spawn).toBeLessThan(560);
      }
    }
  });

  it('stands an idol on its base between each voted Commons’ two ways, over its Realm Vote spot, and none for the ink-wash realm', () => {
    expect(idolRealms(hall)).toEqual(['grove', 'market', 'glass']);
    for (const realm of ['glass', 'grove', 'market'] as const) {
      expect(voteRealmAt(hall, voteDoor(realm)), realm).toBe(realm);
      expect(onFloor(middle(voteDoor(realm))), realm).toBe(true);
      // The idol stands on its base, off the floor, so owls walk round it.
      expect(onFloor(idolAt(realm)), realm).toBe(false);
      const between = rimAt((wayS(realmDoor(realm)) + wayS(courseDoor(realm))) / 2);
      expect(Math.hypot(idolAt(realm).x - between.x, idolAt(realm).y - between.y), realm).toBeLessThan(80);
    }
    expect(hall.doors.some((d) => d.id === voteDoor('ink'))).toBe(false);
    expect(voteRealmAt(hall, 'idol')).toBeNull();
    expect(Object.keys(ANCHORS[HALL_ID] ?? {}).sort()).toEqual(['gathering', 'guardian', 'idol', 'robot']);
  });

  it('takes each realm’s own idol away on the new map, now it stands in the hollow, and leaves today’s park its vote', () => {
    expect([...HALL_IDOL_REALMS].sort()).toEqual(['glass', 'grove', 'market']);
    const changed = Object.keys(ROOMS).filter((id) => roomOnMap(ROOMS[id]!, 3) !== ROOMS[id]);
    expect(changed.sort()).toEqual(['glass', 'grove', 'market']);
    for (const realm of changed) {
      const onNew = roomOnMap(ROOMS[realm]!, 3);
      expect(idolRealms(onNew), realm).toEqual([]);
      expect(
        onNew.doors.some((d) => d.id === 'idol'),
        realm,
      ).toBe(false);
      expect(voteRealmAt(onNew, 'idol'), realm).toBeNull();
      // Every other way of the realm is as it was.
      expect(onNew.doors.length, realm).toBe(ROOMS[realm]!.doors.length - 1);
      for (const map of [1, 2] as const) expect(roomOnMap(ROOMS[realm]!, map), `${realm} on map ${map}`).toBe(ROOMS[realm]);
      expect(voteRealmAt(ROOMS[realm]!, 'idol'), realm).toBe(realm);
    }
    expect(roomOnMap(hall, 3)).toBe(hall);
  });

  it('names every open way out on a sign in front of it, the Party Grove among them, clear of its doorway’s art', () => {
    const named = hall.doors.filter((d) => d.label);
    for (const d of hall.doors) expect(!!d.label, d.id).toBe(!!d.to && !d.closedSign);
    expect(new Set(named.map((d) => d.label)).size).toBe(named.length);
    expect(doorOf('to-party').label).toBe('Out to the Party Grove');
    expect(doorOf('up').label).toBe('Up to the Treetop Commons');
    expect(doorOf('down').label).toBe('Down to the arcade');
    for (const d of named) {
      // On the floor, by its own doorway, where an owl walking up to it reads it.
      expect(onFloor(d.labelAt!), d.id).toBe(true);
      expect(Math.hypot(d.labelAt!.x - middle(d.id).x, d.labelAt!.y - middle(d.id).y), d.id).toBeLessThan(500);
      // At the front its doorway's art stands up over the floor before it: the sign stands above that art.
      const art = hall.pieces!.find((p) => Math.hypot(p.x - middle(d.id).x, p.y - middle(d.id).y) < 120);
      if (art && atFront(d.id as (typeof HALL_WAYS)[number]) && d.id !== 'down')
        expect(d.labelAt!.y, d.id).toBeLessThan(art.y - KIT_ART[art.key]!.h * (art.scale ?? 1));
      // At an end the art stands beside the floor, and the sign beside the art, level with the doorway:
      // the sign's own near edge stands at its spot (labelAnchor), just in from the art, so no word slips
      // under the doorway whatever the label's length (the neon street read "The neon stre", Nov 9).
      if (art && d.rect.h > d.rect.w) {
        const east = art.x > HALL_MIDDLE;
        expect(d.labelAnchor, d.id).toBe(east ? 1 : 0);
        const a = KIT_ART[art.key]!;
        const half = (a.left !== undefined && a.right !== undefined ? a.right - a.left : a.w) / 2;
        const gap = east ? art.x - half - d.labelAt!.x : d.labelAt!.x - (art.x + half);
        expect(gap, d.id).toBeGreaterThan(0);
        expect(gap, d.id).toBeLessThan(40);
        expect(Math.abs(d.labelAt!.y - middle(d.id).y), d.id).toBeLessThan(60);
        // And clear of the idol that stands between the Commons' two ways (OP-346): a short sign stood across its face.
        for (const c of HALL_COMMONS) {
          if (!c.votesFor) continue;
          const idol = middle(voteDoor(c.level));
          const clear = Math.abs(d.labelAt!.x - idol.x) > 200 || d.labelAt!.y > idol.y || d.labelAt!.y < idol.y - 560;
          expect(clear, `${d.id} and the idol of ${c.level}`).toBe(true);
        }
      } else expect(d.labelAnchor, d.id).toBeUndefined();
    }
  });

  it('puts the way up at the very back, and the ways out to the Party Grove and down to the arcade at the front', () => {
    expect(doorOf('up').to).toEqual({ room: 'lobby', spawn: 'from-hub' });
    expect(doorOf('to-party').to).toEqual({ room: 'hub', spawn: 'default' });
    expect(doorOf('down').to).toEqual({ room: 'arcade', spawn: 'from-cavern' });
    expect(middle('up').x).toBe(HALL_MIDDLE);
    expect(Math.min(...hall.doors.map((d) => middle(d.id).y))).toBe(middle('up').y);
    for (const id of ['to-party', 'down']) expect(middle(id).y, id).toBeGreaterThan(HALL_CY + 0.8 * HALL_RY);
    const piles = INTERACTABLES.filter((t) => t.room === HALL_ID);
    for (const c of HALL_COMMONS)
      expect(
        piles.some((p) => p.id === `m3-hall-leaves-${c.level}`),
        c.level,
      ).toBe(true);
    for (const p of piles) expect(onFloor(p.pos), p.id).toBe(true);
  });

  it('gives each Commons a plaza a crowd of 80 owls can gather in, with its moonbeam in the middle', () => {
    for (const c of HALL_COMMONS) {
      const at = plazaAt(c.level);
      let floor = 0;
      for (let x = at.x - 700; x <= at.x + 700; x += 20)
        for (let y = at.y - 700; y <= at.y + 700; y += 20) if (Math.hypot(x - at.x, y - at.y) <= 700 && onFloor({ x, y })) floor += 400;
      expect(floor / OWL_ROOM_PX2, c.level).toBeGreaterThanOrEqual(80);
      expect(
        INTERACTABLES.some((t) => t.room === HALL_ID && t.kind === 'moonbeam' && t.pos.x === at.x && t.pos.y === at.y),
        c.level,
      ).toBe(true);
    }
  });

  it('gives every stretch of the floor something close by to do: a doorway, an idol, a moonbeam, a leaf pile or a root to climb', () => {
    const things = [
      ...INTERACTABLES.filter((t) => t.room === HALL_ID).map((t) => t.pos),
      ...(hall.perches ?? []).map((p) => ({
        x: p.area.reduce((a, q) => a + q.x, 0) / p.area.length,
        y: p.area.reduce((a, q) => a + q.y, 0) / p.area.length,
      })),
      ...hall.doors.map((d) => d.marker ?? { x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 }),
    ];
    expect(INTERACTABLES.filter((t) => t.room === HALL_ID && t.kind === 'moonbeam')).toHaveLength(HALL_COMMONS.length + 1);
    for (let x = 40; x < HALL_W; x += 40)
      for (let y = 40; y < hall.size.h; y += 40) {
        if (!onFloor({ x, y })) continue;
        // A few seconds' walk at most (WALK_SPEED is 260 px a second).
        const near = Math.min(...things.map((t) => Math.hypot(t.x - x, t.y - y)));
        expect(near, `${x},${y}`).toBeLessThanOrEqual(560);
      }
  });
});

describe('the Great Hollow, sized for the park that is open (OP-339)', () => {
  /** How the hollow was first laid out and painted: the size its painting's places are measured against. */
  const FIRST = { w: 6400, h: 2800, cx: 3200, cy: 1480, rx: 2950, ry: 1150 };

  it('is still a town centre, and no longer most of nine of them: between four and six and a half times the floor 80 owls need', () => {
    const floor = Math.PI * HALL_RX * HALL_RY;
    const crowd = 80 * OWL_ROOM_PX2;
    expect(floor / crowd).toBeGreaterThan(4);
    expect(floor / crowd).toBeLessThan(6.5);
  });

  it('puts something to play within seven seconds’ walk of where the turnstiles land an owl', () => {
    const landing = hall.spawns['from-lobby']!;
    const play = hall.doors.filter((d) => d.to && (ROOMS[d.to.room]?.course !== undefined || d.to.room === 'arcade'));
    expect(play.map((d) => d.id).sort()).toEqual(['course-grove', 'course-ink', 'course-market', 'down']);
    const nearest = Math.min(...play.map((d) => Math.hypot(d.marker!.x - landing.x, d.marker!.y - landing.y)));
    expect(nearest / WALK_SPEED).toBeLessThan(7);
  });

  it('keeps every place where the room’s painting has it: the room, the oval and each way are one size of the first layout', () => {
    expect(HALL_W / FIRST.w).toBeCloseTo(HALL_SCALE, 3);
    expect(hall.size.h / FIRST.h).toBeCloseTo(HALL_SCALE, 3);
    expect(HALL_CX / FIRST.cx).toBeCloseTo(HALL_SCALE, 3);
    expect(HALL_CY / FIRST.cy).toBeCloseTo(HALL_SCALE, 3);
    expect(HALL_RX / FIRST.rx).toBeCloseTo(HALL_SCALE, 3);
    expect(HALL_RY / FIRST.ry).toBeCloseTo(HALL_SCALE, 3);
    // The knothole up is at the middle of the back wall, as painted; the ways an equal step apart round the rim.
    expect(rimAt(wayS('up'))).toEqual({ x: HALL_CX, y: HALL_CY - HALL_RY });
    expect(WAY_STEP * HALL_WAYS.length).toBeCloseTo(RIM_LENGTH, 6);
    // What is not painted keeps the size owls and art are: an arrival stands as far in from its doorway as ever.
    expect(Math.hypot(hall.spawns['from-lobby']!.x - HALL_CX, hall.spawns['from-lobby']!.y - (HALL_CY - HALL_RY))).toBeCloseTo(190, 0);
  });

  it('still has room for the root runs, the same length and the same glide apart, clear of the middle and of the rim', () => {
    // From the middle out: clear floor to walk through between the two inner runs, and past each outer stump to the rim.
    expect(RUN_START).toBeGreaterThanOrEqual(200);
    for (const run of ROOT_RUNS) {
      const xs = run.steps.map(([, x]) => Math.abs(x - HALL_CX));
      // A run's roots stand 220 and 200 apart, whatever the hollow's size: their art is the size it is.
      expect(xs[1]! - xs[0]!).toBe(220);
      expect(xs[2]! - xs[1]!).toBe(200);
      const art = KIT_ART[ROOT_ART.stump.key]!;
      expect(xs[2]! + art.w / 2, run.level).toBeLessThanOrEqual(HALL_RX - RUN_END_CLEAR);
    }
    // The inner run's start to the outer run's: the glide between them is as long as it was.
    const starts = (level: HallLevel) => Math.abs(ROOT_RUNS.find((r) => r.level === level)!.steps[0]![1] - HALL_CX);
    expect(starts('market') - starts('grove')).toBe(1400);
    expect(starts('glass') - starts('ink')).toBe(1400);
  });

  it('leaves each idol’s vote stone the room its art had: no leaf pile nearer than at the first size', () => {
    const piles = INTERACTABLES.filter((t) => t.id.startsWith('m3-hall-leaves-'));
    for (const idol of hall.idols ?? []) {
      const stone = hall.doors.find((d) => d.id === idol.door)!.rect;
      const mid = { x: stone.x + stone.w / 2, y: stone.y + stone.h / 2 };
      for (const pile of piles) expect(Math.hypot(pile.pos.x - mid.x, pile.pos.y - mid.y), `${idol.door} and ${pile.id}`).toBeGreaterThanOrEqual(116);
    }
  });
});

describe('the thermal at the Great Hollow’s heart (OP-340)', () => {
  const heart = INTERACTABLES.find((t) => t.id === 'm3-hall-moonbeam-heart')!.pos;

  it('rises where the heart’s moonbeam falls, a column an owl can stand in, on open floor', () => {
    expect(hall.thermals).toEqual([HEART_THERMAL]);
    expect(thermalProblems(HEART_THERMAL)).toEqual([]);
    expect(HEART_THERMAL.pos).toEqual(heart);
    // All of the column is floor, clear of the root runs and every doorway.
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 8) {
      const edge = { x: heart.x + HEART_THERMAL.r * Math.cos(a), y: heart.y + HEART_THERMAL.r * Math.sin(a) };
      expect(onFloor(edge), `${Math.round(edge.x)},${Math.round(edge.y)}`).toBe(true);
    }
    for (const p of hall.perches ?? []) for (const q of p.area) expect(inThermal(HEART_THERMAL, q, 60), p.id).toBe(false);
    for (const d of hall.doors) expect(inThermal(HEART_THERMAL, d.marker ?? middle(d.id), 200), d.id).toBe(false);
    // No owl arrives inside it: a jump on landing in the room is only a jump.
    for (const [name, at] of Object.entries(hall.spawns)) expect(inThermal(HEART_THERMAL, at, 40), name).toBe(false);
  });

  it('lifts high enough for a held glide to reach where any way’s arrivals stand, and no higher than an owl may be', () => {
    const reach = HEART_THERMAL.top * GLIDE_SLOPE;
    let farthest = 0;
    for (const [name, at] of Object.entries(hall.spawns)) {
      const far = Math.hypot(at.x - heart.x, at.y - heart.y);
      expect(far, name).toBeLessThan(reach);
      farthest = Math.max(farthest, far);
    }
    // Not much over: the farthest arrival, and a turn's worth to spare.
    expect(reach - farthest).toBeLessThan(200);
    expect(HEART_THERMAL.top).toBeLessThan(MAX_AIR_Z);
  });
});

describe('the Great Hollow’s root runs (OP-308)', () => {
  const tiers = perchTiers(hall);
  const perch = (level: HallLevel, kind: RootKind) => hall.perches!.find((p) => p.id === rootId(level, kind))!;
  const span = (level: HallLevel, kind: RootKind) => {
    const xs = perch(level, kind).area.map((p) => p.x);
    return [Math.min(...xs), Math.max(...xs)] as const;
  };

  it('climbs each run a single jump at a time: a fallen root, a knot, a stump', () => {
    for (const run of ROOT_RUNS) {
      expect(run.steps.map(([k]) => k)).toEqual(['log', 'knot', 'stump']);
      for (const [kind] of run.steps) expect(tiers[rootId(run.level, kind)], rootId(run.level, kind)).toBe(1);
      expect(perch(run.level, 'log').top).toBeLessThan(perch(run.level, 'knot').top);
      expect(perch(run.level, 'knot').top).toBeLessThan(perch(run.level, 'stump').top);
    }
  });

  it('glides from the stump by the hatch over the seam to the next Commons’ run, both ways from the middle', () => {
    for (const [from, to] of [
      ['ink', 'glass'],
      ['grove', 'market'],
    ] as const) {
      const a = span(from, 'stump');
      const b = span(to, 'log');
      const gap = Math.max(b[0] - a[1], a[0] - b[1]);
      expect(gap, `${from} to ${to}`).toBeGreaterThan(600);
      // A glide gets there, with the routes' room to spare; a jump alone doesn't.
      expect(hopTier(perch(to, 'log').top - perch(from, 'stump').top, gap, 1)).toBe(3);
    }
    // Each run starts beside the hatch's side of its Commons and climbs away from the middle.
    for (const run of ROOT_RUNS) {
      const xs = run.steps.map(([, x]) => Math.abs(x - HALL_MIDDLE));
      expect([...xs].sort((p, q) => p - q)).toEqual(xs);
    }
  });

  it('stands every root on the floor where an owl walks round it, with the floor clear in front of the run', () => {
    for (const p of hall.perches!) {
      const xs = p.area.map((q) => q.x);
      const ys = p.area.map((q) => q.y);
      const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
      for (let x = x0; x <= x1; x += 10) expect(onFloor({ x, y: Math.max(...ys) + 40 }), `${p.id} at ${x}`).toBe(true);
      // Its piece stands at the strip's back edge, so an owl stood on it is drawn over it.
      const piece = hall.pieces!.find((q) => q.id === p.id)!;
      expect(piece.y).toBe(Math.min(...ys));
      expect(KIT_ART[piece.key], piece.key).toBeDefined();
    }
    // Between the roots of a run and the runs, the floor goes on along the run's line (a take-off spot).
    for (const x of [HALL_MIDDLE - 300, HALL_MIDDLE + 300, 1600, 4800]) expect(onFloor({ x, y: RUN_Y }), String(x)).toBe(true);
  });

  it('hides nothing a visitor looks for behind a root: no leaf pile, hiding spot, spawn or doorway under its art', () => {
    const boxes = hall
      .pieces!.filter((q) => hall.perches!.some((p) => p.id === q.id))
      .map((q) => {
        const a = KIT_ART[q.key]!;
        return { id: q.id, x0: q.x - a.w / 2, x1: q.x + a.w / 2, y0: q.y - a.h, y1: q.y + RUN_HALF * 2 };
      });
    const things = [
      // A moonbeam is a ring of light across its whole plaza: a root at its rim hides none of it.
      ...INTERACTABLES.filter((i) => i.room === HALL_ID && i.kind !== 'moonbeam').map((i) => ({ id: i.id, ...i.pos })),
      ...(hall.spots ?? []).map((s, i) => ({ id: `spot-${i}`, ...s })),
      ...Object.entries(hall.spawns).map(([id, p]) => ({ id, ...p })),
      ...hall.doors.map((d) => ({ id: d.id, ...middle(d.id) })),
    ];
    for (const b of boxes)
      for (const t of things) expect(t.x > b.x0 - 40 && t.x < b.x1 + 40 && t.y > b.y0 && t.y < b.y1, `${t.id} behind ${b.id}`).toBe(false);
  });
});

describe('what stands in the Great Hollow takes its light (OP-348)', () => {
  it('multiplies every root by the room\'s light, and its idols by a paler one', () => {
    const roots = hall.pieces!.filter((p) => p.id.startsWith('root-') && p.id !== 'root-hatch');
    expect(roots).toHaveLength(ROOT_RUNS.length * 3);
    for (const r of roots) expect(r.tint, r.id).toBe(HALL_LIGHT.roots);
    expect(HALL_BOWL.light).toBe(HALL_LIGHT.idols);
    // A doorway keeps its realm's own colours: it is the way into another light.
    for (const p of hall.pieces!.filter((q) => q.id.endsWith('-door'))) expect(p.tint, p.id).toBeUndefined();
  });

  it('is a warm light, and takes less from an idol than from a root', () => {
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;
    for (const c of [HALL_LIGHT.roots, HALL_LIGHT.idols]) {
      const [r, g, b] = rgb(c);
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThan(b);
    }
    expect(rgb(HALL_LIGHT.idols)[2]).toBeGreaterThan(rgb(HALL_LIGHT.roots)[2]);
  });
});
