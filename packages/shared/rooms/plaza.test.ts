import { describe, expect, it } from 'vitest';
import { edgeArt, edgeDraws } from '../src/edges';
import { pointInPolygon } from '../src/geometry';
import { interactablesIn } from '../src/interactables';
import { ROOM_H } from '../src/room';
import { OWL_ROOM_PX2 } from './hollowHall';
import { ARCADE_PLAZA, LOBBY_PLAZA, getRoom } from './index';

/** Owls a room's floor holds standing gathered (OWL_ROOM_PX2 each), counted on a 20 px grid. */
function owlsFit(id: string): number {
  const room = getRoom(id)!;
  let cells = 0;
  for (let x = 10; x < room.size.w; x += 20) for (let y = 10; y < room.size.h; y += 20) if (room.walkable.some((p) => pointInPolygon({ x, y }, p))) cells++;
  return Math.floor((cells * 400) / OWL_ROOM_PX2);
}

describe('the painted common rooms grown into plazas (Nov 8: somewhere 80 owls could gather)', () => {
  const plazas = [
    { id: 'lobby', plaza: LOBBY_PLAZA },
    { id: 'arcade', plaza: ARCADE_PLAZA },
  ];

  it.each(plazas)('$id holds 80 owls gathered, with room to spare', ({ id }) => {
    expect(owlsFit(id)).toBeGreaterThanOrEqual(100);
  });

  it.each(plazas)('$id runs on below its painting, its floor whole from the painting to its front', ({ id, plaza }) => {
    const room = getRoom(id)!;
    expect(room.size.h).toBe(plaza.front + 15);
    const floor = room.walkable[0]!;
    // Straight down the room, every 200 px across: floor from the painting's foot to near the front.
    for (let x = 200; x < room.size.w - 200; x += 200) {
      for (let y = ROOM_H; y <= plaza.front - 80; y += 20) expect(pointInPolygon({ x, y }, floor), `${id} at ${x}, ${y}`).toBe(true);
    }
  });

  it.each(plazas)('$id keeps every doorway, spawn and thing to do on its floor, and a moonbeam in each ring', ({ id, plaza }) => {
    const room = getRoom(id)!;
    const onFloor = (p: { x: number; y: number }) => room.walkable.some((poly) => pointInPolygon(p, poly));
    for (const [name, at] of Object.entries(room.spawns)) expect(onFloor(at), name).toBe(true);
    for (const t of interactablesIn(id)) if (!t.top) expect(onFloor(t.pos), t.id).toBe(true);
    for (const r of plaza.rings) expect(interactablesIn(id).some((t) => t.kind === 'moonbeam' && t.pos.x === r.x && t.pos.y === r.y), `${id} ring at ${r.x}`).toBe(true);
  });

  it.each(plazas)("$id's edge pieces stay in the room, each a known piece", ({ id }) => {
    const room = getRoom(id)!;
    for (const d of edgeDraws(room.edges ?? [])) {
      expect(d.x >= 0 && d.x + d.w <= room.size.w, d.id).toBe(true);
      expect(d.y + d.h <= room.size.h + 40, d.id).toBe(true);
      expect(edgeArt(d.key).w).toBe(d.w);
    }
  });
});
