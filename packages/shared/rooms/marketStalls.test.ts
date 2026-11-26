import { describe, expect, it } from 'vitest';
import { distance } from '../src/geometry';
import { INTERACTABLES, KIND_RULES } from '../src/interactables';
import { ROOMS } from './index';

/**
 * The neon street's stalls are browsed at the stall row, not at the doorway an owl comes in by: "Browse
 * the stall" came up as an owl arrived from the tree (the Nov 25 QA walk), because the first stall stood
 * within reach of where it lands.
 */
const market = ROOMS['market']!;
const stalls = INTERACTABLES.filter((t) => t.room === market.id && t.kind === 'stall');
const reach = KIND_RULES.stall.reach;

describe('the neon street’s stalls', () => {
  it('are none of them within reach of where an owl comes into the street', () => {
    expect(stalls.length).toBeGreaterThan(0);
    for (const t of stalls) {
      for (const [name, at] of Object.entries(market.spawns)) {
        expect(distance(at, t.pos), `${t.id} from the ${name} arrival`).toBeGreaterThan(reach);
      }
    }
  });

  it('are none of them within reach of the doorway back to the tree', () => {
    const door = market.doors.find((d) => d.id === 'to-hub')!;
    const nearest = (p: { x: number; y: number }) => ({
      x: Math.max(door.rect.x, Math.min(p.x, door.rect.x + door.rect.w)),
      y: Math.max(door.rect.y, Math.min(p.y, door.rect.y + door.rect.h)),
    });
    for (const t of stalls) expect(distance(nearest(t.pos), t.pos), t.id).toBeGreaterThan(reach);
  });

  it('stand along the painted stall row', () => {
    const row = market.perches!.find((p) => p.id === 'market-stalls')!;
    const xs = row.area.map((p) => p.x);
    for (const t of stalls) {
      expect(t.pos.x, t.id).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(t.pos.x, t.id).toBeLessThanOrEqual(Math.max(...xs));
    }
  });
});
