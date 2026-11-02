import { STREET_ROOM, TREE_STREET_ROOM, type DoorDef } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { NEST_ROOM, ROOMS } from '../rooms';
import { AHEAD_PX, DOOR_AIM_PX, UP_GRACE_MS, WAY_DOOR_PX, doorwayUnder, doorwaysOff, roomsAhead, takesDoorway, upCounts } from './doors';

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

describe('takesDoorway seen from the side (the tree, OP-212)', () => {
  it('passes a doorway by on the held keys, and stays standing in one', () => {
    expect(takesDoorway(door, { x: 2400, y: 640 }, true, false, true)).toBe(false);
    expect(takesDoorway(door, { x: 1765, y: 655 }, true, false, true)).toBe(false);
    expect(takesDoorway(door, null, false, false, true)).toBe(false);
  });

  it('still takes a tap aimed at the doorway itself, and never one on an errand', () => {
    expect(takesDoorway(door, { x: 1765, y: 655 }, false, false, true)).toBe(true);
    expect(takesDoorway(door, { x: 1765, y: 610 - DOOR_AIM_PX }, false, false, true)).toBe(true);
    expect(takesDoorway(door, { x: 2000, y: 640 }, false, false, true)).toBe(false);
    expect(takesDoorway(door, { x: 1765, y: 655 }, false, true, true)).toBe(false);
  });

  it('leaves a room seen from above as it was: the held keys and standing in it go through', () => {
    expect(takesDoorway(door, { x: 2400, y: 640 }, true, false, false)).toBe(true);
    expect(takesDoorway(door, null, false, false, false)).toBe(true);
  });
});

describe('upCounts (OP-212)', () => {
  it('counts a press for a moment after it, and none before it or once the moment is past', () => {
    expect(upCounts(1000, 1000)).toBe(true);
    expect(upCounts(1000, 1000 + UP_GRACE_MS)).toBe(true);
    expect(upCounts(1000, 1001 + UP_GRACE_MS)).toBe(false);
    expect(upCounts(1000, 999)).toBe(false);
    expect(upCounts(0, 100)).toBe(false);
  });
});

describe('doorwayUnder (OP-212)', () => {
  const l1 = ROOMS['l1']!;
  const stairDown = l1.doors.find((d) => d.id === 'stair-l1-l0')!;
  const stairUp = l1.doors.find((d) => d.id === 'stair-l2-l1')!;
  const middle = (d: DoorDef) => ({ x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 });
  const level = (z: number) => (d: DoorDef) => d.top === undefined || d.top === z;
  const leads = (d: DoorDef) => !!d.to;

  it('is the doorway the owl stands in at its height, leading somewhere', () => {
    expect(doorwayUnder(l1.doors, middle(stairDown), level(0), leads)?.id).toBe('stair-l1-l0');
    expect(doorwayUnder(l1.doors, middle(stairUp), level(286), leads)?.id).toBe('stair-l2-l1');
  });

  it('is none under the stair up’s landing on the floor, beside a doorway, or at one that leads nowhere now', () => {
    expect(doorwayUnder(l1.doors, middle(stairUp), level(0), leads)).toBeNull();
    expect(doorwayUnder(l1.doors, { x: stairDown.rect.x - 20, y: 770 }, level(0), leads)).toBeNull();
    expect(doorwayUnder(l1.doors, middle(stairDown), level(0), () => false)).toBeNull();
  });
});

describe('doorwaysOff (OP-148)', () => {
  const street = ROOMS[STREET_ROOM]!;
  const hub = ROOMS['hub']!;
  const middle = (id: string) => {
    const r = street.doors.find((d) => d.id === id)!.rect;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };

  it('is each doorway a tap’s way round could take the owl through but the one it is aimed at, a little wider than drawn', () => {
    const off = doorwaysOff(street, { x: 470, y: 870 }, middle('nest-door-0'), () => false);
    const door1 = street.doors.find((d) => d.id === 'nest-door-1')!.rect;
    expect(off).toHaveLength(6); // the other five nest doors and the way to the lobby
    expect(off).toContainEqual({ x: door1.x - WAY_DOOR_PX, y: door1.y - WAY_DOOR_PX, w: door1.w + 2 * WAY_DOOR_PX, h: door1.h + 2 * WAY_DOOR_PX });
  });

  it('leaves out an arch whose realm is closed (its floor is shut already), the idol and other spots, and a doorway the owl stands in', () => {
    const ids = (pos: { x: number; y: number }, closed: (id: string) => boolean) => doorwaysOff(hub, pos, { x: 1200, y: 780 }, closed).length;
    const doors = hub.doors.filter((d) => d.to).length;
    expect(ids({ x: 2400, y: 760 }, () => false)).toBe(doors);
    expect(ids({ x: 2400, y: 760 }, (id) => id === 'glass')).toBe(doors - 1);
    // Standing in the way out's doorway, widened: it is not kept out of.
    expect(ids({ x: 2400, y: 860 }, () => false)).toBe(doors - 1);
  });
});

describe('roomsAhead (OP-129)', () => {
  const hub = ROOMS['hub']!;
  const open = () => false;

  it('is the room through the doorway a walk ends at, from anywhere in the room', () => {
    // From the hub's middle to the grove's arch, across the room: the grove is fetched ahead from the first step.
    expect(roomsAhead(hub, { x: 2400, y: 700 }, { x: 1765, y: 655 }, false, open).map((r) => r.id)).toEqual(['grove']);
  });

  it('is nothing for an owl standing still, or walking across the room past no doorway', () => {
    expect(roomsAhead(hub, { x: 2400, y: 700 }, null, false, open)).toEqual([]);
    expect(roomsAhead(hub, { x: 2100, y: 760 }, { x: 2300, y: 760 }, false, open)).toEqual([]);
  });

  it('is a room whose doorway an owl on the held keys passes close by (the keys say nothing of where they go)', () => {
    expect(roomsAhead(hub, { x: 3015, y: 760 }, { x: 3500, y: 760 }, true, open).map((r) => r.id)).toEqual(['market']);
    expect(roomsAhead(hub, { x: 3015, y: 760 + AHEAD_PX + 20 }, { x: 3500, y: 760 + AHEAD_PX + 20 }, true, open)).toEqual([]);
  });

  it('is not a room whose doorway a tapped walk only passes: it goes through none but the one it ends at', () => {
    // Tapped from the hub's middle to the market's arch, the owl walks right by the stained-glass realm's.
    expect(roomsAhead(hub, { x: 2665, y: 705 }, { x: 3015, y: 655 }, false, open).map((r) => r.id)).toEqual(['market']);
    expect(roomsAhead(hub, { x: 3015, y: 760 }, { x: 3500, y: 760 }, false, open)).toEqual([]);
  });

  it('is never a realm that is closed', () => {
    expect(roomsAhead(hub, { x: 2400, y: 700 }, { x: 2665, y: 650 }, false, (id) => id === 'glass')).toEqual([]);
    expect(roomsAhead(hub, { x: 2400, y: 700 }, { x: 2665, y: 650 }, false, open).map((r) => r.id)).toEqual(['glass']);
  });

  it('on the street is a nest behind any nest door, every nest having the same art', () => {
    const street = ROOMS[STREET_ROOM]!;
    const door = street.doors.find((d) => d.id === 'nest-door-0')!;
    const at = { x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2 };
    expect(roomsAhead(street, { x: at.x - 400, y: at.y }, at, false, open)).toEqual([NEST_ROOM]);
  });

  it('seen from the side, is the room behind a doorway an owl stands in, which up may take it through (OP-212)', () => {
    const l1 = ROOMS['l1']!;
    const stair = l1.doors.find((d) => d.id === 'stair-l1-l0')!.rect;
    const at = { x: stair.x + stair.w / 2, y: 770 };
    expect(roomsAhead(l1, at, null, false, open, 2, true).map((r) => r.id)).toEqual(['l0']);
    expect(roomsAhead(l1, { x: stair.x - 200, y: 770 }, null, false, open, 2, true)).toEqual([]);
    // Seen from above, an owl standing still is going nowhere.
    expect(roomsAhead(l1, at, null, false, open, 2, false)).toEqual([]);
  });

  it('on the tree’s street, is a nest behind the nest door an owl stands in', () => {
    const street = ROOMS[TREE_STREET_ROOM]!;
    const door = street.doors.find((d) => d.id === 'nest-door-2')!.rect;
    expect(roomsAhead(street, { x: door.x + door.w / 2, y: 770 }, null, false, open, 2, true)).toEqual([NEST_ROOM]);
  });
});
