import { describe, expect, it } from 'vitest';
import { ROOMS, roomFor } from '../rooms';
import { isWalkable, pointInRect, rectCenter } from './geometry';
import { STREET_ROOM } from './homes';
import { resolveTarget } from './resolveTarget';
import { findSpawn } from './room';
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

  it('walks out where the owls walk in: the hub floor’s bottom edge below the turnstiles’ arrival spot', () => {
    expect(gate.to).toEqual({ room: 'hub', spawn: 'default' });
    const arrival = hub.spawns['default']!;
    expect(wayOut.to).toEqual({ room: LOBBY_ROOM, spawn: LEFT_PARK_SPAWN });
    // On the floor's bottom edge, straight below the arrival spot, but not where an owl arrives.
    expect(wayOut.rect.y + wayOut.rect.h).toBe(hub.size.h);
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
