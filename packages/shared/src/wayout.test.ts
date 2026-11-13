import { describe, expect, it } from 'vitest';
import { ROOMS, TREE_ARRIVAL, roomFor } from '../rooms';
import { doorTarget } from './doorways';
import { distanceToRect, isWalkable, pointInRect, rectCenter } from './geometry';
import { STREET_ROOM, TREE_STREET_ROOM, isStreetRoom, streetOf } from './homes';
import { resolveTarget } from './resolveTarget';
import { ROOM_H, findSpawn } from './room';
import { LEFT_PARK_SPAWN, LOBBY_ROOM, WAY_OUT_DOOR, WAY_OUT_WORDS, insidePark, isFreeRoom, parkwardDoor } from './wayout';

describe('leaving the park', () => {
  const hub = ROOMS['hub']!;
  const lobby = ROOMS[LOBBY_ROOM]!;
  const gate = lobby.doors.find((d) => d.id === 'gate')!;
  const wayOut = hub.doors.find((d) => d.id === WAY_OUT_DOOR)!;

  it('knows the rooms inside the park from those outside the turnstiles', () => {
    for (const room of [LOBBY_ROOM, STREET_ROOM, 'nest-k3x9q2ab']) {
      expect(isFreeRoom(room), room).toBe(true);
      expect(insidePark(room), room).toBe(false);
    }
    for (const room of ['hub', 'grove', 'market', 'arcade']) expect(insidePark(room), room).toBe(true);
  });

  it('walks out where the owls walk in: the ring painted in the hub’s floor, below the turnstiles’ arrival spot', () => {
    expect(gate.to).toEqual({ room: 'hub', spawn: 'default' });
    const arrival = hub.spawns['default']!;
    expect(wayOut.to).toEqual({ room: LOBBY_ROOM, spawn: LEFT_PARK_SPAWN });
    // At the painting's foot (its floor runs on below as a plaza, Nov 8), straight below the arrival spot, but not where an owl arrives.
    expect(wayOut.rect.y + wayOut.rect.h).toBe(ROOM_H);
    expect(wayOut.rect.y).toBeGreaterThan(arrival.y);
    expect(arrival.x).toBeGreaterThan(wayOut.rect.x);
    expect(arrival.x).toBeLessThan(wayOut.rect.x + wayOut.rect.w);
    expect(pointInRect(arrival, wayOut.rect)).toBe(false);
    expect(isWalkable(rectCenter(wayOut.rect), hub.walkable)).toBe(true);
    // The ring that marks it lies inside it.
    expect(pointInRect(wayOut.marker!, wayOut.rect)).toBe(true);
    // A quest never hides an item in it.
    for (const spot of hub.spots ?? []) expect(pointInRect(spot, wayOut.rect), `${spot.x},${spot.y}`).toBe(false);
  });

  it('puts an owl that leaves in front of the turnstiles, outside the gate', () => {
    const outside = lobby.spawns[LEFT_PARK_SPAWN]!;
    expect(isWalkable(outside, lobby.walkable)).toBe(true);
    for (const door of lobby.doors) expect(pointInRect(outside, door.rect), door.id).toBe(false);
    expect(outside.x).toBeGreaterThan(gate.rect.x);
    expect(outside.x).toBeLessThan(gate.rect.x + gate.rect.w);
    expect(outside.y).toBeGreaterThan(gate.rect.y + gate.rect.h);
  });

  it('says only Logan’s words', () => {
    expect(Object.values(WAY_OUT_WORDS)).toEqual(['Leave the park', 'Leave the park? Your ticket keeps running.', 'Leave', 'Stay']);
  });
});

describe('the way to the park (OP-105)', () => {
  it('leads from where Play puts the owl, out of its nest, along the street and through the lobby into the hub, one walk a room', () => {
    let at = { room: 'nest-k3x9q2ab', spawn: 'mirror' };
    const walked: string[] = [];
    while (isFreeRoom(at.room)) {
      const room = roomFor(at.room)!;
      const door = room.doors.find((d) => d.id === parkwardDoor(at.room));
      expect(door, at.room).toBeDefined();
      // From where the owl comes in, one walk toward the doorway ends in it.
      const end = resolveTarget(findSpawn(room, at.spawn), rectCenter(door!.rect), room.walkable);
      expect(pointInRect(end, door!.rect), at.room).toBe(true);
      walked.push(at.room);
      at = { room: door!.to!.room, spawn: door!.to!.spawn };
      expect(walked.length).toBeLessThan(6);
    }
    expect([...walked, at.room]).toEqual(['nest-k3x9q2ab', STREET_ROOM, LOBBY_ROOM, 'hub']);
  });

  it('is no door inside the park', () => {
    for (const room of ['hub', 'grove', 'market', 'arcade']) expect(parkwardDoor(room), room).toBeNull();
  });
});

describe('the tree\'s street, outside its front gate (OP-128)', () => {
  it('is a free room like the nests\' street, and level 5\'s canopy is inside the park', () => {
    expect(isStreetRoom(TREE_STREET_ROOM)).toBe(true);
    expect(isStreetRoom(STREET_ROOM)).toBe(true);
    for (const room of ['l5', 'l4', 'l1', LOBBY_ROOM, undefined]) expect(isStreetRoom(room), String(room)).toBe(false);
    expect(streetOf(1)).toBe(STREET_ROOM);
    expect(streetOf(2)).toBe(TREE_STREET_ROOM);
    expect(isFreeRoom(TREE_STREET_ROOM)).toBe(true);
    expect(insidePark(TREE_STREET_ROOM)).toBe(false);
    for (const room of ['l5', 'l4', 'l3', 'l2', 'l1']) expect(insidePark(room), room).toBe(true);
  });

  it('is where an owl of the tree comes out of its nest, in front of its own door, and it walks along the street through the front gate', () => {
    expect(TREE_ARRIVAL).toEqual({ room: TREE_STREET_ROOM, spawn: 'from-nest-0' });
    const nestDoor = roomFor('nest-k3x9q2ab')!.doors.find((d) => d.id === parkwardDoor('nest-k3x9q2ab'))!;
    expect(doorTarget(nestDoor, 2)).toEqual(TREE_ARRIVAL);
    const street = roomFor(TREE_STREET_ROOM)!;
    const gate = street.doors.find((d) => d.id === parkwardDoor(TREE_STREET_ROOM))!;
    expect(gate.id).toBe('gate');
    const end = resolveTarget(findSpawn(street, TREE_ARRIVAL.spawn), rectCenter(gate.rect), street.walkable);
    expect(pointInRect(end, gate.rect)).toBe(true);
    expect(gate.to).toEqual({ room: 'l5', spawn: 'default' });
  });

  it('has six nest doors, each with the spawn just beside it (not on the doorstep, which would walk the owl back in), and the seventh painted door hatching soon', () => {
    const street = roomFor(TREE_STREET_ROOM)!;
    for (let n = 0; n < 6; n++) {
      const door = street.doors.find((d) => d.id === `nest-door-${n}`)!;
      expect(door, String(n)).toBeDefined();
      const spawn = street.spawns[`from-nest-${n}`]!;
      expect(isWalkable(spawn, street.walkable), String(n)).toBe(true);
      expect(pointInRect(spawn, door.rect), String(n)).toBe(false);
      expect(distanceToRect(spawn, door.rect), String(n)).toBeLessThanOrEqual(40);
    }
    expect(street.doors.find((d) => d.id === 'spare-nest')?.closedSign).toBe('Hatching Soon');
  });

  it('puts an owl that leaves the tree, or comes back from checkout, before the front gate', () => {
    const street = roomFor(TREE_STREET_ROOM)!;
    const gate = street.doors.find((d) => d.id === 'gate')!;
    const outside = street.spawns[LEFT_PARK_SPAWN]!;
    expect(isWalkable(outside, street.walkable)).toBe(true);
    for (const door of street.doors) expect(pointInRect(outside, door.rect), door.id).toBe(false);
    expect(outside.x).toBeLessThan(gate.rect.x);
  });
});
