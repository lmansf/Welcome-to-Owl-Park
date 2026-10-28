import { describe, expect, it } from 'vitest';
import { JUMP_PX, jumpWatch } from './posOverlay';

describe('the position overlay’s jump count (OP-138)', () => {
  it('counts a move further than an owl’s width between two frames, never a walk or a new room', () => {
    const watch = jumpWatch();
    expect(watch.see({ x: 100, y: 700 }, 'hub')).toBe(false);
    // A walk: a few pixels a frame, however long.
    for (let x = 104; x <= 400; x += 4) expect(watch.see({ x, y: 700 }, 'hub')).toBe(false);
    // Across the room in one frame.
    expect(watch.see({ x: 400 + JUMP_PX + 1, y: 700 }, 'hub')).toBe(true);
    // In through a door: the owl starts somewhere else, in another room.
    expect(watch.see({ x: 2400, y: 730 }, 'grove')).toBe(false);
    expect(watch.count).toBe(1);
  });
});
