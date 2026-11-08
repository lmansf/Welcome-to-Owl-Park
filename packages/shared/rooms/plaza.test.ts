import { describe, expect, it } from 'vitest';
import { edgeArt, edgeDraws } from '../src/edges';
import { pointInPolygon } from '../src/geometry';
import { interactablesIn } from '../src/interactables';
import { ROOM_H } from '../src/room';
import { OWL_ROOM_PX2 } from './hollowHall';
import { ARCADE_PLAZA, GLASS_PLAZA, GROVE_PLAZA, HOMES_PLAZA, HUB_PLAZA, LOBBY_PLAZA, MARKET_PLAZA, getRoom } from './index';
import { keptRun } from './plaza';

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
    { id: 'homes', plaza: HOMES_PLAZA },
    { id: 'market', plaza: MARKET_PLAZA },
    { id: 'glass', plaza: GLASS_PLAZA },
    { id: 'grove', plaza: GROVE_PLAZA },
    { id: 'hub', plaza: HUB_PLAZA },
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

describe("the Party Grove's plaza", () => {
  it('keeps the way back into the Great Hollow on the ring painted in its floor, clear of the moonbeams', () => {
    const hub = getRoom('hub')!;
    const back = hub.doors.find((d) => d.id === 'to-lobby')!;
    expect(back.rect).toEqual({ x: 2310, y: 862, w: 180, h: 38 });
    const ring = edgeArt('edge-party-ring');
    for (const r of HUB_PLAZA.rings) expect(Math.abs(r.x - (back.rect.x + back.rect.w / 2)), `ring at ${r.x}`).toBeGreaterThan(ring.w / 2 + back.rect.w / 2);
  });
});

describe('opening a floor onto a plaza (keptRun)', () => {
  it('keeps the back and sides of a floor as one run, west to east', () => {
    const box = [{ x: 0, y: 700 }, { x: 100, y: 700 }, { x: 100, y: 880 }, { x: 0, y: 880 }];
    expect(keptRun(box, 870)).toEqual([{ x: 0, y: 700 }, { x: 100, y: 700 }]);
    expect(keptRun([...box].reverse(), 870)).toEqual([{ x: 0, y: 700 }, { x: 100, y: 700 }]);
  });

  it('leaves a floor that never reaches the opening, and refuses one whose back comes in pieces', () => {
    expect(keptRun([{ x: 0, y: 600 }, { x: 50, y: 600 }, { x: 50, y: 650 }], 870)).toBeNull();
    const notched = [{ x: 0, y: 700 }, { x: 300, y: 700 }, { x: 300, y: 880 }, { x: 200, y: 880 }, { x: 150, y: 800 }, { x: 100, y: 880 }, { x: 0, y: 880 }];
    expect(() => keptRun(notched, 870)).toThrow(/runs/);
  });
});
