import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { doorTarget } from './doorways';
import { FOLDED_ROOMS, roomForLink } from './newMap';

describe('rooms folded into another (OP-306)', () => {
  it('lands an old link to the root stair in the arcade, and any other link where it points', () => {
    expect(roomForLink('m3-under')).toBe('arcade');
    for (const id of ['lobby', 'm3-hall', 'arcade', 'grove']) expect(roomForLink(id), id).toBe(id);
  });

  it('folds a room only into one that exists', () => {
    for (const [from, into] of Object.entries(FOLDED_ROOMS)) expect(ROOMS[into], `${from} -> ${into}`).toBeDefined();
  });

  it('leads the Great Hollow’s hatch down into the arcade, and the arcade’s stair back up to the hatch', () => {
    const down = ROOMS['m3-hall']!.doors.find((d) => d.id === 'down')!;
    expect(doorTarget(down, 3)).toEqual({ room: 'arcade', spawn: 'from-cavern' });
    const up = ROOMS['arcade']!.doors.find((d) => d.id === 'to-market')!;
    expect(doorTarget(up, 3)).toEqual({ room: 'm3-hall', spawn: 'from-under' });
    // Today's park keeps its street: the arcade's doorway still goes back to the market.
    expect(doorTarget(up, 1)).toEqual({ room: 'market', spawn: 'from-arcade' });
  });
});
