import { describe, expect, it } from 'vitest';
import { INTERACTABLES, LEAF_PILES_A_ROOM, LEAF_PILES_IN_THE_HOLLOW, LEAF_RESPAWN_MS } from './interactables';
import { ROOM_H } from './room';
import { ARCADE_PLAZA, GLASS_PLAZA, GROVE_PLAZA, HOMES_PLAZA, HUB_PLAZA, INK_PLAZA, LOBBY_PLAZA, MARKET_PLAZA } from '../rooms/index';

const piles = INTERACTABLES.filter((i) => i.kind === 'leaf-pile');
const PLAZAS: Record<string, { front: number; rings: readonly { x: number; y: number }[] }> = {
  lobby: LOBBY_PLAZA,
  arcade: ARCADE_PLAZA,
  homes: HOMES_PLAZA,
  market: MARKET_PLAZA,
  glass: GLASS_PLAZA,
  ink: INK_PLAZA,
  grove: GROVE_PLAZA,
  hub: HUB_PLAZA,
};

describe("leaf piles where the wind would leave them (OP-417, the owner's Nov 14 note: \"assets scattered around randomly\")", () => {
  it('lays three piles a room at most, and five in the Great Hollow', () => {
    const count: Record<string, number> = {};
    for (const p of piles) count[p.room] = (count[p.room] ?? 0) + 1;
    for (const [room, n] of Object.entries(count)) expect(n, room).toBeLessThanOrEqual(room === 'm3-hall' ? LEAF_PILES_IN_THE_HOLLOW : LEAF_PILES_A_ROOM);
  });

  it("leaves none out in a plaza's open middle, where its crowd gathers round the moonbeam", () => {
    for (const p of piles) {
      const plaza = PLAZAS[p.room];
      // Up on a perch, or back in the painting, is not out on the plaza's floor.
      if (!plaza || p.top || p.pos.y < ROOM_H) continue;
      for (const r of plaza.rings) expect(Math.hypot(p.pos.x - r.x, p.pos.y - r.y), `${p.id} by the ring at ${r.x}`).toBeGreaterThan(500);
    }
  });

  it('grows each pile back sooner, so fewer piles still give about as many flops a day', () => {
    const [lo, hi] = LEAF_RESPAWN_MS;
    expect(lo).toBeLessThan(hi);
    expect(hi).toBeLessThanOrEqual(90_000);
  });
});
