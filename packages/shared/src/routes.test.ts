import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { JUMP_RISE } from './flight';
import type { Polygon } from './geometry';
import type { Perch } from './perches';
import { ROUTE_MARGIN, gapBetween, hopTier, perchTiers } from './routes';

const box = (x: number, y: number, w: number, h: number): Polygon => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
/** A room with a floor 1000 px wide and these perches. */
const room = (...perches: Perch[]) => ({ walkable: [box(0, 500, 1000, 300)], perches });

describe('route tiers (OP-084)', () => {
  it('calls a hop by what it takes: a jump, the second flap, a glide, or nothing', () => {
    // Straight up: a jump, short of its top; then the flap; past both, nothing.
    expect(hopTier(80, 0)).toBe(1);
    expect(hopTier(JUMP_RISE - ROUTE_MARGIN, 0)).toBe(1);
    expect(hopTier(JUMP_RISE - ROUTE_MARGIN + 1, 0)).toBe(2);
    expect(hopTier(184, 0)).toBe(2); // the hub's bench to its beam
    expect(hopTier(264, 0)).toBeNull(); // the hub's floor to its beam, without the bench
    // Across at one height: a jump's width, a flap's, then only a glide's.
    expect(hopTier(0, 120)).toBe(1);
    expect(hopTier(0, 200)).toBe(2);
    expect(hopTier(0, 500)).toBe(3);
    expect(hopTier(0, 2000)).toBeNull();
    // Down and across reaches farther than across: the fall takes longer.
    expect(hopTier(0, 160)).toBe(2);
    expect(hopTier(-150, 160)).toBe(1);
  });

  it('measures the gap between two areas on the plan: none when they meet, overlap or cross', () => {
    expect(gapBetween(box(0, 0, 100, 100), box(100, 0, 50, 50))).toBe(0);
    expect(gapBetween(box(0, 0, 100, 100), box(50, 50, 100, 100))).toBe(0);
    expect(gapBetween(box(40, 0, 20, 100), box(0, 40, 100, 20))).toBe(0); // a cross: no corner inside the other
    expect(gapBetween(box(0, 0, 100, 100), box(130, 0, 50, 50))).toBe(30);
    expect(gapBetween(box(0, 0, 100, 100), box(130, 140, 50, 50))).toBeCloseTo(50);
  });

  it("takes a perch's easiest route: a stair of single jumps beats a flap straight up, and a glide reaches what nothing else does", () => {
    const step1 = { id: 'step1', area: box(100, 450, 100, 60), top: 90 };
    const step2 = { id: 'step2', area: box(150, 450, 100, 60), top: 180 };
    const shelf = { id: 'shelf', area: box(200, 450, 200, 60), top: 230 };
    // Far along the room, as high as the shelf: no jump reaches it from the floor or a step.
    const far = { id: 'far', area: box(800, 300, 100, 60), top: 300 };
    const tiers = perchTiers(room(step1, step2, shelf, far));
    expect(tiers).toEqual({ step1: 1, step2: 1, shelf: 1, far: 3 });
    // Take the stair away: the shelf needs the flap, from the floor.
    expect(perchTiers(room(shelf))).toEqual({ shelf: 2 });
    // And nothing at all reaches a top past a jump and a flap with nothing under it.
    expect(perchTiers(room({ id: 'moon', area: box(500, 450, 50, 50), top: 400 }))).toEqual({ moon: null });
  });

  it("finds the hub's bench a jump up and its lantern beam a jump and a flap from the bench", () => {
    expect(perchTiers(ROOMS['hub']!)).toEqual({ 'hub-bench': 1, 'hub-beam': 2 });
  });

  it("finds the grove's ladder single jumps to the loft, and its far treehouse a glide from there", () => {
    expect(perchTiers(ROOMS['grove']!)).toEqual({ 'grove-log': 1, 'grove-rung': 1, 'grove-porch': 1, 'grove-loft': 1, 'grove-hut': 3 });
  });

  it("finds the market's roofs single jumps up, and its food stall and tent a jump and the flap from the plaza", () => {
    expect(perchTiers(ROOMS['market']!)).toEqual({
      'market-stalls': 1,
      'market-boards': 1,
      'market-shop': 1,
      'market-food': 2,
      'market-roofs': 1,
      'market-tent': 2,
    });
  });
});
