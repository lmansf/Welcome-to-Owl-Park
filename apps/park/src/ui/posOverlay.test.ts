import { describe, expect, it } from 'vitest';
import { AIR_DASH_SPEED, LANE_SPEED, WALK_SPEED } from '@owl-park/shared';
import { JUMP_PX, WALK_FRAME_MS, jumpWatch } from './posOverlay';

describe('the position overlay’s jump count (OP-138)', () => {
  it('counts a move further than an owl’s width between two frames, never a walk or a new room', () => {
    const watch = jumpWatch();
    let t = 0;
    expect(watch.see({ x: 100, y: 700 }, 'hub', t)).toBe(false);
    // A walk: a few pixels a frame, however long.
    for (let x = 104; x <= 400; x += 4) expect(watch.see({ x, y: 700 }, 'hub', (t += 16))).toBe(false);
    // Across the room in one frame.
    expect(watch.see({ x: 400 + JUMP_PX + 5, y: 700 }, 'hub', (t += 16))).toBe(true);
    // In through a door: the owl starts somewhere else, in another room.
    expect(watch.see({ x: 2400, y: 730 }, 'grove', (t += 16))).toBe(false);
    expect(watch.count).toBe(1);
  });

  it('allows a slow frame its walk, but not a long sleep’s: a jump after the tab wakes still counts', () => {
    const watch = jumpWatch();
    watch.see({ x: 100, y: 700 }, 'nest', 0);
    // A quarter-second frame on a busy phone: the walk goes 65 px, more than an owl's width.
    expect(watch.see({ x: 100 + (WALK_SPEED * 250) / 1000, y: 700 }, 'nest', 250)).toBe(false);
    // Twenty seconds asleep: only WALK_FRAME_MS of walk is allowed for, so a jump across the room shows.
    const allowed = JUMP_PX + (WALK_SPEED * WALK_FRAME_MS) / 1000;
    expect(watch.see({ x: 165 + allowed + 1, y: 700 }, 'nest', 20_250)).toBe(true);
    expect(watch.count).toBe(1);
  });

  it('allows a faster owl its own pace: a glide lane’s carry and a dash are no jumps on a slow frame, and are at a walk’s pace (OP-287)', () => {
    const lane = (LANE_SPEED * 250) / 1000;
    const dash = (AIR_DASH_SPEED * 250) / 1000;
    // A quarter-second frame of each is further than an owl's width beyond a walk's 65 px.
    expect(lane).toBeGreaterThan(JUMP_PX + (WALK_SPEED * 250) / 1000);
    const told = jumpWatch();
    told.see({ x: 100, y: 700 }, 'arcade', 0);
    expect(told.see({ x: 100 + lane, y: 700 }, 'arcade', 250, LANE_SPEED)).toBe(false);
    expect(told.see({ x: 100 + lane + dash, y: 700 }, 'arcade', 500, AIR_DASH_SPEED)).toBe(false);
    expect(told.count).toBe(0);
    // Taken for a walk's, each of those frames is a jump: the pace is what tells them apart.
    const untold = jumpWatch();
    untold.see({ x: 100, y: 700 }, 'arcade', 0);
    expect(untold.see({ x: 100 + lane, y: 700 }, 'arcade', 250)).toBe(true);
    expect(untold.see({ x: 100 + lane + dash, y: 700 }, 'arcade', 500)).toBe(true);
    expect(untold.count).toBe(2);
    // And the pace allows no more than its own frame: a jump across the room at a lane's pace still counts.
    expect(told.see({ x: 100 + lane + dash + JUMP_PX + lane + 1, y: 700 }, 'arcade', 750, LANE_SPEED)).toBe(true);
  });
});
