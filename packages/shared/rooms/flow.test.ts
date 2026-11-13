import { describe, expect, it } from 'vitest';
import { ROOMS } from '.';
import { doorTarget } from '../src/doorways';
import { NEW_MAP_LANDINGS } from '../src/travel';
import { LOBBY_ROOM } from '../src/wayout';

/** Doorways from `start` to every room an owl walking the new map can reach from it, each way taken as the owl walked it. */
function doorwaysFrom(start: string): Map<string, number> {
  const far = new Map<string, number>([[start, 0]]);
  let edge: Array<{ room: string; from?: string }> = [{ room: start }];
  for (let step = 1; edge.length > 0; step++) {
    const next: typeof edge = [];
    for (const { room, from } of edge) {
      for (const d of ROOMS[room]?.doors ?? []) {
        const to = doorTarget(d, 3, from)?.room;
        if (!to || far.has(to) || !ROOMS[to]) continue;
        far.set(to, step);
        next.push({ room: to, from: room });
      }
    }
    edge = next;
  }
  return far;
}

/** The areas of the new map a guest goes looking for (OP-305): the realms' Commons, each course's start, the Party Grove and the arcade. */
const AREAS = ['m3-hall', 'glass', 'grove', 'market', 'brush-1', 'canopy-1', 'circuit-1', 'hub', 'arcade'];
describe('the new map’s flow: hub and spokes from the Treetop Commons (OP-305)', () => {
  it('reaches every area within two doorways of the Commons', () => {
    const far = doorwaysFrom(LOBBY_ROOM);
    for (const room of AREAS) expect(far.get(room), room).toBeLessThanOrEqual(2);
  });

  it('walks back to the Commons from every area in as few doorways', () => {
    for (const room of AREAS) expect(doorwaysFrom(room).get(LOBBY_ROOM), room).toBeLessThanOrEqual(2);
  });

  it('puts every area but the courses on the map, a tap away', () => {
    for (const room of AREAS.filter((r) => !/-1$/.test(r))) expect(NEW_MAP_LANDINGS[room], room).toBeDefined();
  });
});
