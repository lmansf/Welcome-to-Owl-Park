import { ROOM_W, mapOf, treeLevelOf } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { MINIMAP_SIZE, TREE_LEVEL_NAMES, TREE_ROOM_SCREENS, levelNameOf, minimapLayout, owlOnMinimap } from './treeMinimap';

const layout = minimapLayout();
const strip = (room: string) => layout.bands.flatMap((b) => b.strips).find((s) => s.room === room)!;
const bandOf = (room: string) => layout.bands.find((b) => b.strips.some((s) => s.room === room))!;

describe('the tree’s minimap (OP-213)', () => {
  it('places every room of the tree, each on its own level', () => {
    const tree = Object.values(ROOMS).filter((r) => mapOf(r) === 2);
    expect(tree.length).toBeGreaterThanOrEqual(8);
    for (const room of tree) {
      expect(TREE_ROOM_SCREENS[room.id], room.id).toBeDefined();
      expect(bandOf(room.id).level, room.id).toBe(treeLevelOf(room.id));
    }
  });

  it('stacks the six levels bottom to top, each with its name', () => {
    expect(layout.bands.map((b) => b.name)).toEqual(['Underground', 'Ground level', 'Low branches', 'High branches', 'Sky landing', 'Top of the canopy']);
    expect(TREE_LEVEL_NAMES).toHaveLength(6);
    for (let i = 1; i < layout.bands.length; i++) expect(layout.bands[i]!.y).toBeLessThan(layout.bands[i - 1]!.y);
    expect(layout.bands[5]!.y - MINIMAP_SIZE.band / 2).toBeGreaterThanOrEqual(0);
    expect(layout.bands[0]!.y + MINIMAP_SIZE.band / 2).toBeLessThanOrEqual(layout.h);
  });

  it('draws each room as wide as its screens, west to east of the trunk, inside the map and none over another', () => {
    const per = layout.perScreen;
    expect(strip('l1').w).toBeCloseTo(4 * per);
    expect(strip('l4').w).toBeCloseTo(2 * per);
    // The trunk's screen begins at the same place on every level: the canopy's street ends there plus a screen, where the canopy begins.
    expect(strip('l3').x).toBeCloseTo(layout.west);
    expect(strip('l1').x).toBeCloseTo(layout.west - per);
    expect(strip('l5-street').x + strip('l5-street').w).toBeCloseTo(strip('l5').x);
    expect(strip('l0').x + strip('l0').w).toBeCloseTo(strip('l0-arcade').x);
    for (const band of layout.bands) {
      const xs = band.strips.map((s) => [s.x, s.x + s.w] as const);
      for (const [x0, x1] of xs) {
        expect(x0).toBeGreaterThanOrEqual(MINIMAP_SIZE.pad - 1e-9);
        expect(x1).toBeLessThanOrEqual(layout.w - MINIMAP_SIZE.pad + 1e-9);
      }
      for (let i = 1; i < xs.length; i++) expect(xs[i]![0]).toBeGreaterThanOrEqual(xs[i - 1]![1] - 1e-9);
    }
  });

  it('marks each stair at both ends, reaching toward the other level, the two ends near each other', () => {
    const stairs = layout.marks.filter((m) => m.stair);
    for (const id of ['stair-l1-l0', 'stair-l2-l1', 'stair-l3-l2', 'stair-l4-l3', 'stair-l5-l4']) {
      const ends = stairs.filter((m) => m.door === id);
      expect(ends, id).toHaveLength(2);
      const [upper, lower] = [...ends].sort((a, b) => a.y0 - b.y0);
      expect(upper!.y1).toBeGreaterThan(upper!.y0); // reaching down
      expect(lower!.y1).toBeLessThan(lower!.y0); // reaching up
      expect(Math.abs(upper!.x - lower!.x), id).toBeLessThanOrEqual(1.25 * layout.perScreen);
    }
    // A doorway along a level (the canopy's gate, the cavern's mouth) or out of the tree is a tick, not a stair.
    expect(layout.marks.find((m) => m.door === 'to-arcade')?.stair).toBe(false);
    expect(layout.marks.find((m) => m.door === 'to-market')?.stair).toBe(false);
  });

  it('puts the owl’s dot along its room’s strip as far as it is across the room, kept on the strip', () => {
    const l1 = strip('l1');
    const y = bandOf('l1').y;
    expect(owlOnMinimap(layout, 'l1', 0)).toEqual({ x: l1.x, y, level: 1 });
    expect(owlOnMinimap(layout, 'l1', 4 * ROOM_W)!.x).toBeCloseTo(l1.x + l1.w);
    expect(owlOnMinimap(layout, 'l1', 2 * ROOM_W)!.x).toBeCloseTo(l1.x + l1.w / 2);
    expect(owlOnMinimap(layout, 'l1', -50)!.x).toBeCloseTo(l1.x);
    expect(owlOnMinimap(layout, 'l1', 9 * ROOM_W)!.x).toBeCloseTo(l1.x + l1.w);
    expect(owlOnMinimap(layout, 'l5', 800)!.level).toBe(5);
    expect(owlOnMinimap(layout, 'hub', 800)).toBeNull();
  });

  it('names a room’s level, and none for a room out of the tree', () => {
    expect(levelNameOf('l0-arcade')).toBe('Underground');
    expect(levelNameOf('l1')).toBe('Ground level');
    expect(levelNameOf('l5-street')).toBe('Top of the canopy');
    expect(levelNameOf('hub')).toBeNull();
    expect(levelNameOf('market')).toBeNull();
  });
});
