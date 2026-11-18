import { describe, expect, it } from 'vitest';
import { interactablesIn } from '../src/interactables';
import { isWalkable } from '../src/geometry';
import { npcsIn } from '../src/npcs';
import { BOWLING_LANE, TAG_RING, TAG_ROOM, inTagRing } from '../src/party/tag';
import { STUMP_AT, STUMP_REACH } from '../src/party/ids';
import { BOWL_REACH, BOWL_SPOT, atBowlSpot } from '../src/party/bowling';
import { getRoom } from './index';

/**
 * The Party Grove's game spaces (OP-403, D5): the tag ring and the bowling lane lie on the plaza's open
 * floor, every bit of them walkable, and clear of everything else on it (the floor's little scenes and
 * their perches, the doorways, where owls arrive, the Old Stump and the park's owls), so a game never
 * runs through a bird bath or a doorway out.
 */
const room = getRoom(TAG_ROOM)!;

/** Points over the ring, its rim included, 20 px apart. */
function ringPoints(): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let x = TAG_RING.x - TAG_RING.rx; x <= TAG_RING.x + TAG_RING.rx; x += 20)
    for (let y = TAG_RING.y - TAG_RING.ry; y <= TAG_RING.y + TAG_RING.ry; y += 20) if (inTagRing({ x, y })) out.push({ x, y });
  return out;
}
function lanePoints(): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let x = BOWLING_LANE.x; x <= BOWLING_LANE.x + BOWLING_LANE.w; x += 20)
    for (let y = BOWLING_LANE.y; y <= BOWLING_LANE.y + BOWLING_LANE.h; y += 15) out.push({ x, y });
  return out;
}
const inLane = (p: { x: number; y: number }, slack = 0) =>
  p.x >= BOWLING_LANE.x - slack && p.x <= BOWLING_LANE.x + BOWLING_LANE.w + slack && p.y >= BOWLING_LANE.y - slack && p.y <= BOWLING_LANE.y + BOWLING_LANE.h + slack;

describe('the Party Grove’s game spaces (OP-403)', () => {
  it('are in the Party Grove, and every bit of them is open floor', () => {
    expect(TAG_ROOM).toBe('hub');
    for (const p of [...ringPoints(), ...lanePoints()]) expect(isWalkable(p, room.walkable), `${p.x},${p.y}`).toBe(true);
  });

  it('do not overlap each other', () => {
    for (const p of lanePoints()) expect(inTagRing(p, 40), `${p.x},${p.y}`).toBe(false);
  });

  it('keep clear of the floor’s things, its perches, doorways, arrivals, the Old Stump and the park’s owls', () => {
    const things = interactablesIn(TAG_ROOM).map((t) => ({ id: t.id, p: t.pos }));
    const perches = (room.perches ?? []).flatMap((p) => p.area.map((q) => ({ id: p.id, p: q })));
    const doors = room.doors.flatMap((d) => [
      { id: d.id, p: { x: d.rect.x, y: d.rect.y } },
      { id: d.id, p: { x: d.rect.x + d.rect.w, y: d.rect.y + d.rect.h } },
      { id: d.id, p: { x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 } },
    ]);
    const spawns = Object.entries(room.spawns).map(([id, p]) => ({ id, p }));
    const npcs = npcsIn(TAG_ROOM).map((n) => ({ id: n.id, p: n.pos }));
    for (const { id, p } of [...things, ...perches, ...doors, ...spawns, ...npcs]) {
      expect(inTagRing(p, 40), `${id} at ${p.x},${p.y} in the tag ring`).toBe(false);
      expect(inLane(p, 40), `${id} at ${p.x},${p.y} in the bowling lane`).toBe(false);
    }
    expect(inLane(STUMP_AT, STUMP_REACH)).toBe(false);
    expect(inTagRing(STUMP_AT, STUMP_REACH)).toBe(false);
  });

  it('the spot where an owl stands to bowl is open floor, clear of the ring, the Old Stump and the doorways', () => {
    expect(isWalkable(BOWL_SPOT, room.walkable)).toBe(true);
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 8) {
      const p = { x: BOWL_SPOT.x + Math.cos(a) * BOWL_REACH * 0.6, y: BOWL_SPOT.y + Math.sin(a) * BOWL_REACH * 0.6 };
      expect(inTagRing(p, 40)).toBe(false);
      expect(isWalkable(p, room.walkable), `${p.x},${p.y}`).toBe(true);
    }
    expect(Math.hypot(BOWL_SPOT.x - STUMP_AT.x, BOWL_SPOT.y - STUMP_AT.y)).toBeGreaterThan(BOWL_REACH + STUMP_REACH);
    for (const d of room.doors) expect(atBowlSpot({ x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 }), d.id).toBe(false);
    for (const [id, p] of Object.entries(room.spawns)) expect(atBowlSpot(p), id).toBe(false);
  });
});
