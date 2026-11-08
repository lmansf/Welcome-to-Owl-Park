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

  it('sign nothing in a room seen from the side', () => {
    const side = Object.values(ROOMS).find((r) => r.map === 2)!;
    const named = { ...side, doors: side.doors.map((d) => ({ ...d, label: 'Somewhere' })) };
    expect(signedDoors(named)).toEqual([]);
  });
});
