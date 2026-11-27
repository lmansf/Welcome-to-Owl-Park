import { NEW_MAP_LANDINGS, STREET_ROOM } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { firstDoor, leadIn, mapDoorsOf, walkRoute, type RouteDoor } from './walkRoute';

const graph: Record<string, RouteDoor[]> = {
  a: [
    { id: 'to-b', to: 'b' },
    { id: 'to-c', to: 'c' },
    { id: 'shut', to: undefined },
  ],
  b: [
    { id: 'to-a', to: 'a' },
    { id: 'to-d', to: 'd' },
  ],
  c: [
    { id: 'to-a', to: 'a' },
    { id: 'to-d', to: 'd' },
    { id: 'to-e', to: 'e' },
  ],
  d: [{ id: 'to-b', to: 'b' }],
  e: [],
  island: [],
};
const doorsOf = (room: string) => graph[room] ?? [];

describe('walkRoute', () => {
  it('is empty when the owl is already there', () => {
    expect(walkRoute('a', 'a', doorsOf)).toEqual([]);
    expect(firstDoor('a', 'a', doorsOf)).toBeNull();
  });

  it('takes the fewest doorways, one per room, in order', () => {
    expect(walkRoute('a', 'd', doorsOf)).toEqual([
      ['a', 'to-b'],
      ['b', 'to-d'],
    ]);
    expect(walkRoute('a', 'e', doorsOf)).toEqual([
      ['a', 'to-c'],
      ['c', 'to-e'],
    ]);
    expect(firstDoor('d', 'e', doorsOf)).toBe('to-b');
  });

  it('is null where no way on foot reaches the place', () => {
    expect(walkRoute('a', 'island', doorsOf)).toBeNull();
    expect(walkRoute('e', 'a', doorsOf)).toBeNull();
  });
});

describe('leadIn', () => {
  const lead = { place: 'circuit-1', room: 'circuit-1', next: 'm3-hall' };
  it('arrives in the place’s room, goes on in the next room, and ends anywhere else', () => {
    expect(leadIn(lead, 'circuit-1')).toBe('arrived');
    expect(leadIn(lead, 'm3-hall')).toBe('on');
    expect(leadIn(lead, 'glass')).toBe('lost');
    expect(leadIn({ ...lead, next: null }, 'glass')).toBe('on');
  });
});

describe('mapDoorsOf, on the new map', () => {
  const doors = mapDoorsOf(3);
  const places = Object.entries(NEW_MAP_LANDINGS);

  it('finds a way on foot to every place of the map from the Treetop Commons and from the Great Hollow', () => {
    for (const from of ['lobby', 'm3-hall']) {
      for (const [place, landing] of places) {
        const way = walkRoute(from, landing.room, doors);
        expect(way, `${from} to ${place}`).not.toBeNull();
      }
    }
  });

  it('finds the way back from each course and realm to the Treetop Commons', () => {
    for (const [place, landing] of places) {
      expect(walkRoute(landing.room, 'lobby', doors), `${place} to the lobby`).not.toBeNull();
    }
  });

  it('starts the way from the nests’ street to the Blackout Circuit through the street’s own doorway', () => {
    const way = walkRoute(STREET_ROOM, 'circuit-1', doors)!;
    expect(way[0]![0]).toBe(STREET_ROOM);
    expect(way.at(-1)![0]).not.toBe('circuit-1');
  });

  it('goes into no realm that is not open', () => {
    const shut = mapDoorsOf(3, (room) => room === 'market');
    expect(walkRoute('m3-hall', 'market', shut)).toBeNull();
  });
});
