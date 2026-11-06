import { describe, expect, it } from 'vitest';
import { INTERACTABLES } from '../src/interactables';
import { kitProblems } from '../src/kit';
import { groundAt, perchTopLimit } from '../src/perches';
import { mapOf, spawnTop } from '../src/room';
import { perchTiers } from '../src/routes';
import { HALL_GROUND, HALL_H, HALL_ID, HALL_LEVELS, HALL_LIFT, HALL_ROOM, KNOT_TOP, hallSpawn } from './hollowHall';
import { ANCHORS, ROOMS, TREE_REALMS } from './index';

const hall = ROOMS[HALL_ID]!;
const doorOf = (id: string) => hall.doors.find((d) => d.id === id)!;

describe('the hollow hall (Nov 6)', () => {
  it("is the keepers' for now, five screens high, seen from the side, with nothing wrong in its kit", () => {
    expect(hall).toBe(HALL_ROOM);
    expect(hall.keeperOnly).toBe(true);
    expect(mapOf(hall)).toBe(2);
    expect(hall.size.h).toBe(HALL_H);
    expect(hall.kit!.ground).toBe(HALL_GROUND);
    expect(kitProblems(hall)).toEqual([]);
    for (const p of hall.perches ?? []) expect(p.top, p.id).toBeLessThanOrEqual(perchTopLimit(hall.size.h));
    expect(TREE_REALMS.has(HALL_ID)).toBe(false);
  });

  it('has a landing a level, top to bottom glass, ink, the clearing and neon, on alternate sides, and the knothole over them', () => {
    expect(HALL_LEVELS.map((l) => l.level)).toEqual(['glass', 'ink', 'grove', 'market']);
    expect(HALL_LEVELS.map((l) => l.side)).toEqual(['west', 'east', 'west', 'east']);
    const tops = (hall.perches ?? []).filter((p) => p.id.startsWith('landing-')).map((p) => [p.id, p.top]);
    expect(Object.fromEntries(tops)).toEqual({ 'landing-market': 820, 'landing-grove': 1640, 'landing-ink': 2460, 'landing-glass': 3280, 'landing-knot': KNOT_TOP });
  });

  it('reaches every shelf and landing by the climb, and the column of air lifts a glider to the knothole', () => {
    const tiers = perchTiers(hall);
    for (const [ledge, tier] of Object.entries(tiers)) expect(tier, ledge).not.toBeNull();
    // The climb alone still reaches every landing: the column is the quick way, not the only way.
    const climbOnly = perchTiers({ ...hall, updrafts: [] });
    for (const l of ['landing-market', 'landing-grove', 'landing-ink', 'landing-glass', 'landing-knot']) expect(climbOnly[l], l).not.toBeNull();
    expect(HALL_LIFT.top).toBeGreaterThan(KNOT_TOP);
  });

  it("stands each landing's doorway on its landing, by the trunk's wall, into its own Commons, and the Commons lead back to it", () => {
    for (const l of HALL_LEVELS) {
      const d = doorOf(`to-${l.level}`);
      expect(d.top, l.level).toBe(l.top);
      const mid = d.rect.x + d.rect.w / 2;
      expect(groundAt(hall.perches, { x: mid, y: HALL_GROUND }, l.top), l.level).toBe(l.top);
      expect(d.to).toEqual({ room: l.commons, spawn: 'from-hall' });
      const commons = ROOMS[l.commons]!;
      expect(commons.keeperOnly, l.commons).toBe(true);
      expect(commons.spawns['from-hall'], l.commons).toBeDefined();
      expect(commons.doors.find((x) => x.id === 'out')!.to).toEqual({ room: HALL_ID, spawn: hallSpawn(l.level) });
    }
    expect(doorOf('up').top).toBe(KNOT_TOP);
    expect(doorOf('up').way).toBe('up');
    expect(doorOf('down').way).toBe('down');
    expect(doorOf('down').rect.x).toBeLessThan(doorOf('to-party').rect.x);
  });

  it('brings an owl out of a Commons standing on its landing, and down from the knothole on the top landing', () => {
    for (const l of HALL_LEVELS) {
      const name = hallSpawn(l.level);
      expect(spawnTop(hall, name), name).toBe(l.top);
      expect(groundAt(hall.perches, hall.spawns[name]!, l.top), name).toBe(l.top);
    }
    expect(spawnTop(hall, 'from-lobby')).toBe(KNOT_TOP);
    expect(groundAt(hall.perches, hall.spawns['from-lobby']!, KNOT_TOP)).toBe(KNOT_TOP);
    for (const floor of ['default', 'from-under', 'from-party']) expect(spawnTop(hall, floor), floor).toBe(0);
  });

  it('ends each nook off the climb in a leaf pile, up on its shelf', () => {
    const piles = INTERACTABLES.filter((t) => t.room === HALL_ID);
    expect(piles.map((p) => p.id).sort()).toEqual(['m3-hall-leaves-nook-east', 'm3-hall-leaves-nook-west']);
    for (const p of piles) expect(groundAt(hall.perches, p.pos, p.top ?? 0), p.id).toBe(p.top);
  });
});

describe("the hollow hall's four Commons", () => {
  it('stand an idol over the Realm Vote in each Commons of a voted realm, and none in the ink-wash Commons', () => {
    expect(ROOMS['commons-glass']!.votesFor).toBe('glass');
    expect(ROOMS['commons-grove']!.votesFor).toBe('grove');
    expect(ROOMS['commons-market']!.votesFor).toBe('market');
    expect(ROOMS['commons-ink']!.votesFor).toBeUndefined();
    expect(ROOMS['commons-ink']!.doors.some((d) => d.id === 'idol')).toBe(false);
    for (const id of ['commons-glass', 'commons-grove', 'commons-market']) {
      const idol = ROOMS[id]!.doors.find((d) => d.id === 'idol');
      expect(idol, id).toBeDefined();
      expect(Object.keys(ANCHORS[id] ?? {}).length, id).toBeGreaterThan(0);
    }
  });

  it("lead to their realms where a realm is open, the clearing's middle arch to the Updraft Canopy, and keep the ink-wash arch shut", () => {
    expect(ROOMS['commons-glass']!.doors.find((d) => d.id === 'to-realm')!.to?.room).toBe('glass');
    expect(ROOMS['commons-grove']!.doors.find((d) => d.id === 'to-realm')!.to?.room).toBe('grove');
    expect(ROOMS['commons-market']!.doors.find((d) => d.id === 'to-realm')!.to?.room).toBe('market');
    const ink = ROOMS['commons-ink']!.doors.find((d) => d.id === 'to-realm')!;
    expect(ink.to).toBeUndefined();
    expect(ink.closedSign).toBeDefined();
    expect(ROOMS['commons-grove']!.doors.find((d) => d.id === 'to-course')!.to).toEqual({ room: 'canopy-1', spawn: 'from-gate' });
    expect(ROOMS['canopy-1']!.doors.find((d) => d.id === 'to-commons')!.to).toEqual({ room: 'commons-grove', spawn: 'from-course' });
  });

  it("draw the Commons' own screens, the hub's paintings standing in until theirs land", () => {
    for (const l of HALL_LEVELS) expect(ROOMS[l.commons]!.backgrounds?.map((b) => b.key), l.commons).toEqual(['commons-west', 'commons', 'commons-east']);
  });
});
