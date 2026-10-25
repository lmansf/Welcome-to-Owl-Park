import { describe, expect, it } from 'vitest';
import { FIELD_H, FIELD_W } from './field';
import { BRANCH_W, GROUND_Y as FLAP_GROUND } from './flap';
import { HopGame } from './hop';
import { CRATE } from './knock';
import { BRANCH_ART, GAME_ART, GROUND_TILE_W, STAND_ART, branchHalves, groundTiles, paintable, standPieces } from './paint';

describe("the arcade's games in their paintings", () => {
  it('paint each field whole, and each piece at the size the game plays it', () => {
    for (const key of ['arcade-hop-bg', 'arcade-flap-bg', 'arcade-knock-bg']) {
      const field = Object.values(GAME_ART).find((g) => key in g)![key];
      expect(field, key).toEqual({ w: FIELD_W, h: FIELD_H });
    }
    const vehicles = [1, 2, 3, 4, 5].flatMap((seed) => new HopGame(seed).lanes.flatMap((l) => l.vehicles));
    expect(new Set(vehicles.filter((v) => v.kind === 'drone').map((v) => v.w))).toEqual(new Set([GAME_ART.crossing['arcade-hop-drone']!.w]));
    expect(new Set(vehicles.filter((v) => v.kind === 'cart').map((v) => v.w))).toEqual(new Set([GAME_ART.crossing['arcade-hop-cart']!.w]));
    expect(GAME_ART.sling['arcade-knock-crate']).toEqual({ w: CRATE, h: CRATE });
    // Two crates wide, the stand's painting is stretched (cut in nine) to every stand.
    expect(STAND_ART.w).toBe(2 * CRATE);
  });

  it('paint a game only once all of its pieces are there', () => {
    const loaded = new Set(['arcade-hop-bg', 'arcade-hop-drone', 'arcade-hop-cart', 'arcade-flap-bg', 'arcade-flap-branch']);
    expect(paintable('crossing', (k) => loaded.has(k))).toBe(true);
    expect(paintable('flight', (k) => loaded.has(k))).toBe(false);
    expect(paintable('sling', (k) => loaded.has(k))).toBe(false);
  });

  it("put a branch's trunk over the branch the game plays, its halves at the gap's edges", () => {
    const { left, topY, bottomY } = branchHalves(300, 330, 170);
    // Mirrored, the trunk's middle is trunkX in from the painting's right edge.
    expect(left + BRANCH_ART.w - BRANCH_ART.trunkX).toBe(300);
    expect(topY + BRANCH_ART.h).toBe(330 - 85);
    expect(bottomY).toBe(330 + 85);
    // The painting is long enough for the longest half: from the highest gap's top edge up off the
    // field, and from the lowest gap's bottom edge down to the ground.
    expect(BRANCH_ART.h).toBeGreaterThanOrEqual(FLAP_GROUND - (150 + 150 / 2));
    expect(BRANCH_ART.h).toBeGreaterThanOrEqual(490 - 150 / 2);
    // Nothing of a branch is left on the field once the game drops it, past x = -BRANCH_W.
    expect(branchHalves(-BRANCH_W, 330, 170).left + BRANCH_ART.w).toBeLessThan(0);
  });

  it('tile the ground across the whole field as it scrolls, every other tile mirrored, each keeping its side', () => {
    for (const offset of [0, 1, 179, 180, 359.5, 4321]) {
      const tiles = groundTiles(offset);
      expect(tiles[0]!.x, `offset ${offset}`).toBeLessThanOrEqual(0);
      expect(tiles.at(-1)!.x + GROUND_TILE_W, `offset ${offset}`).toBeGreaterThanOrEqual(FIELD_W);
      tiles.slice(1).forEach((t, i) => {
        expect(t.x - tiles[i]!.x).toBe(GROUND_TILE_W);
        expect(t.flip).toBe(!tiles[i]!.flip);
      });
    }
    // A tile 180 px on keeps its mirroring: the second tile at the start is the first a tile later.
    expect(groundTiles(0)[1]).toEqual({ x: GROUND_TILE_W, flip: true });
    expect(groundTiles(GROUND_TILE_W)[0]).toEqual({ x: 0, flip: true });
  });

  it("cut a stand's painting in nine that cover the stand edge to edge, the corners at their own size", () => {
    const box = { x: 330, y: 470, w: 72, h: 90 };
    const pieces = standPieces(box);
    expect(pieces).toHaveLength(9);
    expect(pieces.reduce((a, p) => a + p.dst.w * p.dst.h, 0)).toBe(box.w * box.h);
    expect(pieces.reduce((a, p) => a + p.src.w * p.src.h, 0)).toBe(STAND_ART.w * STAND_ART.h);
    for (const corner of [0, 2, 6, 8]) {
      expect(pieces[corner]!.dst.w).toBe(pieces[corner]!.src.w);
      expect(pieces[corner]!.dst.h).toBe(pieces[corner]!.src.h);
    }
    // The widest and the shortest stands of the ten stacks still have a middle.
    expect(standPieces({ x: 290, y: 480, w: 5 * 36, h: 80 })[4]!.dst.w).toBeGreaterThan(0);
    expect(standPieces({ x: 290, y: 500, w: 72, h: 60 })[4]!.dst.h).toBeGreaterThan(0);
  });
});
