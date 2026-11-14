import { ROOMS } from '@owl-park/shared/rooms';
import { describe, expect, it } from 'vitest';
import { SIGN_DEPTH, signDepth, signY, signedDoors } from './hints';

describe('door signs', () => {
  it('draw over the pieces seen from above, where a tall idol stands in front of a doorway, and under them elsewhere', () => {
    const hall = ROOMS['m3-hall']!;
    // Over every piece and owl in the Great Hollow (each draws at its foot's y, at most the room's height).
    expect(signDepth(hall)).toBeGreaterThan(hall.size.h);
    for (const p of hall.pieces ?? []) expect(signDepth(hall), p.key).toBeGreaterThan(p.y);
    // A room seen from the side keeps its signs on the floor, under its pieces.
    expect(signDepth(ROOMS['m3-ground']!)).toBe(SIGN_DEPTH);
  });

  it('sign the Great Hollow’s open ways, the Party Grove’s among them', () => {
    const ids = signedDoors(ROOMS['m3-hall']!).map((d) => d.id);
    expect(ids).toContain('to-party');
    expect(ids).toContain('up');
    expect(ids).toContain('down');
    // The ink-wash realm's way opened on its room, the ink garden (OP-402), and has its sign.
    expect(ids).toContain('to-ink');
    // A way with nothing behind it yet is no doorway at all (OP-337): no sign, no blockade.
    expect(ids).not.toContain('course-glass');
  });

  it('sign the Party Grove’s ways on the new map, back into the Great Hollow first, and nothing on today’s park', () => {
    const grove = ROOMS['hub']!;
    const signs = signedDoors(grove, 3);
    expect(Object.fromEntries(signs.map((d) => [d.id, d.label]))).toEqual({
      'to-grove': 'To the treehouse clearing',
      'to-market': 'To the neon street',
      'to-glass': 'To the glass realm',
      'to-lobby': 'Back into the Great Hollow',
    });
    // Its way back stands just below where an owl comes out of the Great Hollow.
    const back = signs.find((d) => d.id === 'to-lobby')!;
    const arrive = grove.spawns['default']!;
    expect(Math.abs(back.labelAt!.x - arrive.x)).toBeLessThan(10);
    expect(back.labelAt!.y - arrive.y).toBeGreaterThan(0);
    expect(back.labelAt!.y - arrive.y).toBeLessThan(120);
    // A shut realm's arch keeps its blockade and no name.
    expect(signedDoors(grove, 3, (room) => room === 'glass').map((d) => d.id)).not.toContain('to-glass');
    expect(signedDoors(grove, 1)).toEqual([]);
  });

  it('sign nothing in a room seen from the side', () => {
    const side = Object.values(ROOMS).find((r) => r.map === 2)!;
    const named = { ...side, doors: side.doors.map((d) => ({ ...d, label: 'Somewhere' })) };
    expect(signedDoors(named)).toEqual([]);
  });
});

describe('the one door sign showing (OP-309)', () => {
  const at = { x: 1000, y: 700 };
  it('stands at its spot while the owl is clear of it', () => {
    expect(signY(at, 200, 30, { x: 1400, y: 700 })).toBe(700);
    expect(signY(at, 200, 30, { x: 1000, y: 500 })).toBe(700);
  });
  it('slides just under the owl’s feet while the owl would cover its words', () => {
    expect(signY(at, 200, 30, { x: 1020, y: 690 })).toBe(700);
    expect(signY(at, 200, 30, { x: 1020, y: 760 })).toBe(770);
  });
});
