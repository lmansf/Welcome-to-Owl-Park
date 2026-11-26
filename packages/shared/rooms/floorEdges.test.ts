import { describe, expect, it } from 'vitest';
import { isWalkable } from '../src/geometry';
import { INTERACTABLES } from '../src/interactables';
import { ROOMS } from './index';

/** A floor edge from the Nov 25 cleanup walk: where a room's floor ran over what is drawn standing in it. */
describe("the neon street's floor along the candy stall counter (OP-483)", () => {
  const market = ROOMS['market']!;
  const floor = (p: { x: number; y: number }) => isWalkable(p, market.walkable);

  it('ends at the counter’s foot: no walking up behind it', () => {
    for (const x of [1560, 1640, 1720]) {
      expect(floor({ x, y: 715 }), `${x} behind the counter`).toBe(false);
      expect(floor({ x, y: 740 }), `${x} in front of it`).toBe(true);
    }
  });

  it('keeps every hiding spot and thing to walk to on the street on the floor', () => {
    for (const s of market.spots ?? []) if (!s.top) expect(floor(s), `spot ${s.x},${s.y}`).toBe(true);
    for (const t of INTERACTABLES.filter((i) => i.room === 'market' && !i.top)) expect(floor(t.pos), t.id).toBe(true);
  });
});
