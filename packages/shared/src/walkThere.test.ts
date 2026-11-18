import { describe, expect, it } from 'vitest';
import { HAZARD_STOP_PX, inPit, walkStopsShort } from './course';
import { ROOMS } from '../rooms/index';

/** Whether a straight walk from `a` to `b` on the floor goes over a pit or into thorns at `z`, looked at every 2 px. */
function walksIntoHazard(id: string, a: { x: number; y: number }, b: { x: number; y: number }, z: number): boolean {
  const room = ROOMS[id]!;
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
  for (let i = 0; i <= n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
    if ((z < 1 && inPit(room, p)) || (room.course?.thorns ?? []).some((h) => p.x >= h.x0 && p.x <= h.x1 && z >= h.z0 && z <= h.z1)) return true;
  }
  return false;
}

describe('a walk there in a course stops at a hazard’s edge, never in it (OP-422)', () => {
  it('stops Updraft Canopy’s first walk to the next part at the bramble’s edge, where a jump crosses', () => {
    const from = ROOMS['canopy-1']!.spawns['from-gate']!;
    const stop = walkStopsShort(ROOMS['canopy-1'], from, { x: 4740, y: 770 }, 0)!;
    expect(stop).not.toBeNull();
    // The bramble starts at x 2000: the owl stands just short of it, on the bank.
    expect(stop.x).toBeGreaterThan(2000 - HAZARD_STOP_PX - 5);
    expect(stop.x).toBeLessThan(2000);
    expect(walksIntoHazard('canopy-1', from, stop, 0)).toBe(false);
  });

  it('stops a walk along a bough at the edge of the thorns hanging at its height, and not where they hang higher', () => {
    const at = { x: 2500, y: 770 };
    const stop = walkStopsShort(ROOMS['canopy-1'], at, { x: 3000, y: 770 }, 300)!;
    expect(stop.x).toBeGreaterThan(2700 - HAZARD_STOP_PX - 5);
    expect(stop.x).toBeLessThan(2700);
    // Under them (below their foot), and up on the bough over the bramble: the way is clear.
    expect(walkStopsShort(ROOMS['canopy-1'], at, { x: 3000, y: 770 }, 200)).toBeNull();
  });

  it('leaves a clear way alone, and a room with no hazards', () => {
    expect(walkStopsShort(ROOMS['canopy-1'], { x: 120, y: 770 }, { x: 1500, y: 770 }, 0)).toBeNull();
    expect(walkStopsShort(ROOMS['canopy-roots'], { x: 180, y: 770 }, { x: 50, y: 770 }, 0)).toBeNull();
    expect(walkStopsShort(ROOMS['hub'], { x: 900, y: 760 }, { x: 2400, y: 730 }, 0)).toBeNull();
  });

  it('in every course room, from every way in to every doorway, walks the owl into no pit and no thorns', () => {
    let checked = 0;
    for (const room of Object.values(ROOMS)) {
      if (!room.course) continue;
      for (const [name, from] of Object.entries(room.spawns)) {
        for (const door of room.doors) {
          const aim = { x: door.rect.x + door.rect.w / 2, y: from.y };
          const end = walkStopsShort(room, from, aim, 0) ?? aim;
          // Already in a hazard where it comes in is no walk of its own.
          if (inPit(room, from)) continue;
          expect(walksIntoHazard(room.id, from, end, 0), `${room.id} ${name} to ${door.id}`).toBe(false);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
});
