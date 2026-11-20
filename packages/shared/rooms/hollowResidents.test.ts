import { describe, expect, it } from 'vitest';
import { distance, isWalkable } from '../src/geometry';
import { interactablesIn } from '../src/interactables';
import { NEW_MAP_HOMES, NPCS, npcsIn } from '../src/npcs';
import { STUMP_AT, STUMP_REACH } from '../src/party/ids';
import { HALL_LEAVES, HALL_RINGS, voteAt } from '../src/hollowOval';
import { HALL_COMMONS, HALL_ID, clearOfRoots } from './hollowHall';
import { getRoom } from './index';

/**
 * The Party Grove's owls at home in the Great Hollow (Dec 1 plan D5; Nov 19, the owner's "Fold into the
 * hub"): each on the hollow's open floor, clear of the roots, and as far from a doorway, a spot where
 * owls arrive, a leaf pile and the other owls as the Commons' quest owls are (commonsQuests.test.ts), so
 * no prompt sits on another (the tag ring and the bowling lane are kept clear of them in tagLayout.test.ts).
 */
const room = getRoom(HALL_ID)!;

describe('Bramble and Pip in the Great Hollow', () => {
  it('live in the hollow on the new map, on open floor clear of the roots', () => {
    expect(Object.keys(NEW_MAP_HOMES).sort()).toEqual(['bramble', 'pip']);
    for (const [id, home] of Object.entries(NEW_MAP_HOMES)) {
      expect(home.room, id).toBe(HALL_ID);
      expect(isWalkable(home.pos, room.walkable), id).toBe(true);
      expect(clearOfRoots(home.pos), id).toBe(true);
    }
  });

  it('stand clear of the doorways, signs, arrivals, leaf piles, rings, vote stones, hiding spots, the Old Stump and each other, as the Commons owls do', () => {
    const far = [
      ...HALL_LEAVES.map((l) => ({ id: `leaves ${l.id}`, p: l.pos })),
      ...HALL_RINGS.map((r) => ({ id: `ring ${r.id}`, p: r.pos })),
      ...room.doors.flatMap((d) => [{ id: d.id, p: { x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 } }, ...(d.labelAt ? [{ id: `${d.id} sign`, p: d.labelAt }] : [])]),
      ...Object.entries(room.spawns).map(([id, p]) => ({ id, p })),
      ...HALL_COMMONS.filter((c) => c.votesFor).map((c) => ({ id: `vote stone ${c.level}`, p: voteAt(c.level) })),
      ...npcsIn(HALL_ID, 3).map((n) => ({ id: n.id, p: n.pos })),
    ];
    for (const [id, home] of Object.entries(NEW_MAP_HOMES)) {
      for (const o of far) if (o.id !== id) expect(distance(home.pos, o.p), `${id} by ${o.id}`).toBeGreaterThanOrEqual(250);
      for (const p of room.spots ?? []) expect(distance(home.pos, p), `${id} by a hiding spot`).toBeGreaterThanOrEqual(110);
      for (const t of interactablesIn(HALL_ID)) expect(distance(home.pos, t.pos), `${id} by ${t.id}`).toBeGreaterThanOrEqual(120);
      expect(distance(home.pos, STUMP_AT), `${id} by the stump`).toBeGreaterThanOrEqual(STUMP_REACH + 150);
    }
  });

  it('still stand in today’s park’s plaza there, and keep their looks and words in the hollow', () => {
    for (const id of Object.keys(NEW_MAP_HOMES)) {
      const own = NPCS.find((n) => n.id === id)!;
      expect(own.room).toBe('hub');
      const moved = npcsIn(HALL_ID, 3).find((n) => n.id === id)!;
      expect(moved.look).toEqual(own.look);
      expect(moved.greetings).toEqual(own.greetings);
    }
  });
});
