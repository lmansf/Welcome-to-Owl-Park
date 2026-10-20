import { describe, expect, it } from 'vitest';
import { DOOR_AIM_PX, takesDoorway } from './doors';

const door = { x: 1700, y: 610, w: 130, h: 90 };

describe('takesDoorway', () => {
  it('takes a walk that ends in the doorway or at its arch, the held keys, and an owl standing in it', () => {
    expect(takesDoorway(door, { x: 1765, y: 655 }, false, false)).toBe(true);
    expect(takesDoorway(door, { x: 1765, y: 610 - DOOR_AIM_PX }, false, false)).toBe(true); // a tap on the arch, stopped at the floor's edge
    expect(takesDoorway(door, { x: 2400, y: 640 }, true, false)).toBe(true);
    expect(takesDoorway(door, null, false, false)).toBe(true);
  });

  it('passes it by on a walk across the room or up to something to do', () => {
    expect(takesDoorway(door, { x: 2000, y: 640 }, false, false)).toBe(false);
    expect(takesDoorway(door, { x: 1765, y: 700 + DOOR_AIM_PX + 1 }, false, false)).toBe(false);
    expect(takesDoorway(door, { x: 1765, y: 655 }, false, true)).toBe(false);
  });
});
