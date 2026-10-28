import { STREET_ROOM } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { NEST_ROOM, ROOMS } from '../rooms';
import { AHEAD_PX, DOOR_AIM_PX, roomsAhead, takesDoorway } from './doors';

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

describe('roomsAhead (OP-129)', () => {
  const hub = ROOMS['hub']!;
  const open = () => false;

  it('is the room through the doorway a walk ends at, from anywhere in the room', () => {
    // From the hub's middle to the grove's arch, across the room: the grove is fetched ahead from the first step.
    expect(roomsAhead(hub, { x: 2400, y: 700 }, { x: 1765, y: 655 }, open).map((r) => r.id)).toEqual(['grove']);
  });

  it('is nothing for an owl standing still, or walking across the room past no doorway', () => {
    expect(roomsAhead(hub, { x: 2400, y: 700 }, null, open)).toEqual([]);
    expect(roomsAhead(hub, { x: 2100, y: 760 }, { x: 2300, y: 760 }, open)).toEqual([]);
  });

  it('is a room whose doorway a walking owl passes close by (the held keys say nothing of where they go)', () => {
    expect(roomsAhead(hub, { x: 3015, y: 760 }, { x: 3500, y: 760 }, open).map((r) => r.id)).toEqual(['market']);
    expect(roomsAhead(hub, { x: 3015, y: 760 + AHEAD_PX + 20 }, { x: 3500, y: 760 + AHEAD_PX + 20 }, open)).toEqual([]);
  });

  it('is never a realm that is closed', () => {
    expect(roomsAhead(hub, { x: 2400, y: 700 }, { x: 2665, y: 650 }, (id) => id === 'glass')).toEqual([]);
    expect(roomsAhead(hub, { x: 2400, y: 700 }, { x: 2665, y: 650 }, open).map((r) => r.id)).toEqual(['glass']);
  });

  it('on the street is a nest behind any nest door, every nest having the same art', () => {
    const street = ROOMS[STREET_ROOM]!;
    const door = street.doors.find((d) => d.id === 'nest-door-0')!;
    const at = { x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2 };
    expect(roomsAhead(street, { x: at.x - 400, y: at.y }, at, open)).toEqual([NEST_ROOM]);
  });
});
