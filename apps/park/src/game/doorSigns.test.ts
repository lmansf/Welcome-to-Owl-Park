import { ROOMS } from '@owl-park/shared/rooms';
import { describe, expect, it } from 'vitest';
import { signedDoors } from './hints';

describe('door signs', () => {
  it('sign the Great Hollow’s open ways, the Party Grove’s among them', () => {
    const ids = signedDoors(ROOMS['m3-hall']!).map((d) => d.id);
    expect(ids).toContain('to-party');
    expect(ids).toContain('up');
    expect(ids).toContain('down');
    // A shut doorway shows its blockade, not a name.
    expect(ids).not.toContain('to-ink');
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
