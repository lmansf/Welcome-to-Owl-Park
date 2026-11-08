import { describe, expect, it } from 'vitest';
import { ROOM_H, ROOM_W } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { skirtStrips } from './plazaSkirt';

describe("a plaza's skirt (the painting's foot run on over its floor)", () => {
  it.each(['lobby', 'arcade'])('%s: every painted screen along its foot gets one, at the foot', (id) => {
    const room = ROOMS[id]!;
    const strips = skirtStrips(room);
    const screens = (room.backgrounds ?? []).filter((t) => (t.rate ?? 1) === 1 && !t.plain && t.y === 0);
    expect(strips.map((s) => s.key).sort()).toEqual(screens.map((t) => t.key).sort());
    for (const s of strips) {
      expect(s.y).toBe(ROOM_H);
      expect(s.h).toBeGreaterThan(0);
      expect(s.h).toBeLessThanOrEqual(room.size.h - ROOM_H);
    }
    // Together they run the room's whole width.
    expect(Math.max(...strips.map((s) => s.x + ROOM_W))).toBeGreaterThanOrEqual(room.size.w);
  });

  it('a room that was not grown has none', () => {
    expect(skirtStrips(ROOMS['nest-0'] ?? ROOMS['l1']!)).toEqual([]);
  });
});
