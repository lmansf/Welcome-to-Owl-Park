import { describe, expect, it } from 'vitest';
import { isWalkable, pointInRect } from '../src/geometry';
import { ROOMS } from './index';

/**
 * Neon Roost's cabinets offer Play wherever an owl walks up against them (the Nov 25 QA walk: at Hoot &
 * Hop's side panel or the right of its front, and at Moon Flap's tree-painted side, there was no prompt,
 * because each cabinet's spot covered only part of the cabinet the painting draws).
 */
const arcade = ROOMS['arcade']!;
const spot = (id: string) => arcade.doors.find((d) => d.id === id)!.rect;

/** Where each cabinet's foot meets the floor in the painting (arcade.webp, arcade-mid.webp), west to east, in room px. */
const PAINTED_FOOT = {
  'cabinet-crossing': { from: 460, to: 755 },
  'cabinet-flight': { from: 1740, to: 1990 },
} as const;

/** The floor's back edge at `x`: where an owl walked up against what stands behind it stops. */
function front(x: number): number {
  for (let y = 600; y < 900; y++) if (isWalkable({ x, y }, arcade.walkable)) return y;
  throw new Error(`no floor at ${x}`);
}

describe('Neon Roost’s cabinets', () => {
  for (const [id, foot] of Object.entries(PAINTED_FOOT)) {
    it(`${id}: an owl against the painted cabinet anywhere along its foot is at the cabinet`, () => {
      const r = spot(id);
      const missed: number[] = [];
      for (let x = foot.from; x <= foot.to; x += 5) {
        // Standing against it, and a step out in front of it.
        for (const dy of [1, 12]) if (!pointInRect({ x, y: front(x) + dy }, r)) missed.push(x);
      }
      expect([...new Set(missed)], `${id}: no Play at x`).toEqual([]);
    });
  }
});
