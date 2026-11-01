import { describe, expect, it } from 'vitest';
import { MASK_ID } from './masks';
import { TREE_LEVEL_MAX, TREE_SPOTS, screenOn, treeLevelOf, treeSpotsFor } from './treeSpots';
import { ROOMS } from '../rooms';

// The tree's named spots (OP-155's list), which the ledge painter places on each level's screens (OP-156).

const spot = (id: string) => TREE_SPOTS.find((s) => s.id === id)!;
const levels = Array.from({ length: TREE_LEVEL_MAX + 1 }, (_, n) => n);

describe('the tree’s named spots (OP-155, OP-156)', () => {
  it('each has an id the painter’s draft takes, and no two the same', () => {
    const ids = TREE_SPOTS.map((s) => s.id);
    for (const id of ids) expect(MASK_ID.test(id), id).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each is on one level, a stair between two levels on both, adjacent, the upper first, with a screen on each', () => {
    for (const s of TREE_SPOTS) {
      expect(s.screen, s.id).toHaveLength(s.levels.length);
      for (const n of s.levels) expect(Number.isInteger(n) && n >= 0 && n <= TREE_LEVEL_MAX, `${s.id} on level ${n}`).toBe(true);
      for (const x of s.screen) expect(Number.isInteger(x), `${s.id} on screen ${x}`).toBe(true);
      const between = /^stair-l(\d)-l(\d)$/.exec(s.id);
      if (s.kind === 'stair' && s.levels.length === 2) {
        expect(between, s.id).not.toBeNull();
        expect(s.levels, s.id).toEqual([Number(between![1]), Number(between![2])]);
        expect(s.levels[0]! - s.levels[1]!, s.id).toBe(1);
      } else {
        expect(between, s.id).toBeNull();
        expect(s.levels, s.id).toHaveLength(1);
      }
    }
    // A stair from every level down to the next, the top's off its trunk's screen, the rest at the trunk.
    const stairs = TREE_SPOTS.filter((s) => s.kind === 'stair' && s.levels.length === 2);
    expect(stairs.map((s) => [s.id, s.levels, s.screen])).toEqual([
      ['stair-l5-l4', [5, 4], [1, 0]],
      ['stair-l4-l3', [4, 3], [0, 0]],
      ['stair-l3-l2', [3, 2], [0, 0]],
      ['stair-l2-l1', [2, 1], [0, 0]],
      ['stair-l1-l0', [1, 0], [0, 0]],
    ]);
    // The one stair on a single level leads out of the tree, from level 0: the challenge's, closed until OP-115.
    expect(TREE_SPOTS.filter((s) => s.kind === 'stair' && s.levels.length === 1).map((s) => [s.id, s.levels, s.screen])).toEqual([['stair-challenge', [0], [-1]]]);
    expect([screenOn(spot('stair-l5-l4'), 5), screenOn(spot('stair-l5-l4'), 4), screenOn(spot('stair-l5-l4'), 3)]).toEqual([1, 0, null]);
  });

  it('every level from 0 to 5 has spots, and its stairs to the levels beside it', () => {
    for (const n of levels) {
      const here = treeSpotsFor(`l${n}`);
      expect(here.length, `level ${n}`).toBeGreaterThan(0);
      expect(here.every((s) => s.levels.includes(n))).toBe(true);
      const stairsTo = here.filter((s) => s.kind === 'stair' && s.levels.length === 2).flatMap((s) => s.levels.filter((m) => m !== n));
      expect(stairsTo.sort(), `level ${n}'s stairs`).toEqual([n - 1, n + 1].filter((m) => m >= 0 && m <= TREE_LEVEL_MAX));
    }
    // Every spot is on some level's list.
    expect(new Set(levels.flatMap((n) => treeSpotsFor(`l${n}`).map((s) => s.id))).size).toBe(TREE_SPOTS.length);
  });

  it('lists a level’s spots west to east, l1’s doors among them by their own ids', () => {
    expect(treeSpotsFor('l1').map((s) => [s.id, screenOn(s, 1)])).toEqual([
      ['closed-west', -1],
      ['stair-l2-l1', 0],
      ['stair-l1-l0', 0],
      ['booth-lobby', 0],
      ['idol-market', 1],
      ['guardian-market', 1],
      ['game-market', 1],
      ['to-market', 2],
    ]);
    const l1 = treeSpotsFor('l1').map((s) => s.id);
    for (const d of ROOMS['l1']!.doors) expect(l1, d.id).toContain(d.id);
    expect(treeSpotsFor('l0').map((s) => s.id)).toEqual(['stair-challenge', 'stair-l1-l0', 'find-cavern', 'cabinet-hoot-hop', 'cabinet-moon-flap', 'cabinet-talon-toss', 'score-wall']);
  });

  it('knows a level of the tree by its room’s id, and nothing else as one', () => {
    expect(levels.map((n) => treeLevelOf(`l${n}`))).toEqual(levels);
    for (const id of ['l6', 'l9', 'l-1', 'l01', 'l', 'L1', 'l1 ', 'hub', 'market', 'nest-l1', '']) {
      expect(treeLevelOf(id), id).toBeNull();
      expect(treeSpotsFor(id), id).toEqual([]);
    }
  });
});
