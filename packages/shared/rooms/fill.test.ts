import { describe, expect, it } from 'vitest';
import { LANTERN_FLOOR, LANTERN_ROOM, QUIZ_ROOM, QUIZ_ZONES } from '../src/activities';
import { distance, distanceToRect, pointInPolygon, type Rect } from '../src/geometry';
import { interactablesIn } from '../src/interactables';
import { npcsIn } from '../src/npcs';
import type { Vec2 } from '../src/protocol';
import { seenFromSide, type RoomDef } from '../src/room';
import { WALK_SPEED } from '../src/walk';
import { STREET_ROOM } from '../src/homes';
import { LOBBY_ROOM } from '../src/wayout';
import { getRoom } from './index';

/**
 * Fewer, fuller rooms (OP-306): in every room seen from above that the new map walks through, outside
 * the courses, an owl is never more than a few seconds' walk from something to do, wherever it stands.
 * Something to do is a doorway (a cabinet's spot counts), a leaf pile, a stall, a moonbeam, an owl to
 * talk to, a perch to hop up on, or one of the Party Grove's games.
 */
const ROOMS_WALKED = [LOBBY_ROOM, STREET_ROOM, 'm3-hall', 'glass', 'ink', 'grove', 'market', 'hub', 'arcade'];

/** The longest walk to the nearest thing to do, in seconds at walking speed. */
const MOST_S = 3;

function middle(poly: readonly Vec2[]): Vec2 {
  return { x: poly.reduce((a, p) => a + p.x, 0) / poly.length, y: poly.reduce((a, p) => a + p.y, 0) / poly.length };
}

/** The games' floors in a room: the lanterns and the quiz in the Party Grove. */
function gamesIn(room: string): Rect[] {
  return [...(room === LANTERN_ROOM ? [LANTERN_FLOOR] : []), ...(room === QUIZ_ROOM ? Object.values(QUIZ_ZONES) : [])];
}

/** The spot on a room's floor farthest from anything to do, and how far that is (room px). */
function farthestFromAThing(room: RoomDef, step = 20): { at: Vec2; px: number } {
  const spots: Vec2[] = [...interactablesIn(room.id).map((i) => i.pos), ...npcsIn(room.id).map((n) => n.pos), ...(room.perches ?? []).map((q) => middle(q.area))];
  const rects: Rect[] = [...room.doors.map((d) => d.rect), ...gamesIn(room.id)];
  let worst = { at: { x: 0, y: 0 }, px: 0 };
  for (let x = step / 2; x < room.size.w; x += step) {
    for (let y = step / 2; y < room.size.h; y += step) {
      const p = { x, y };
      if (!room.walkable.some((poly) => pointInPolygon(p, poly))) continue;
      let near = Infinity;
      for (const r of rects) near = Math.min(near, distanceToRect(p, r));
      for (const s of spots) near = Math.min(near, distance(p, s));
      if (near > worst.px) worst = { at: p, px: near };
    }
  }
  return worst;
}

describe('fewer, fuller rooms (OP-306)', () => {
  it.each(ROOMS_WALKED)('%s: something to do within a few seconds of every spot on its floor', (id) => {
    const room = getRoom(id)!;
    expect(seenFromSide(room), `${id} is seen from above`).toBe(false);
    const { at, px } = farthestFromAThing(room);
    expect(px / WALK_SPEED, `${id}: ${Math.round(px)} px of nothing from (${at.x}, ${at.y})`).toBeLessThanOrEqual(MOST_S);
  });

  it('every leaf pile and stall in these rooms stands on its floor', () => {
    for (const id of ROOMS_WALKED) {
      const room = getRoom(id)!;
      for (const it of interactablesIn(id)) if (!it.top) expect(room.walkable.some((poly) => pointInPolygon(it.pos, poly)), `${it.id} on ${id}'s floor`).toBe(true);
    }
  });
});
