import { describe, expect, it } from 'vitest';
import { ROOMS } from '.';
import { doorTarget } from '../src/doorways';
import { LOBBY_ROOM } from '../src/wayout';

/**
 * Loops, not dead ends (OP-307): on the new map a room with one way out is a dead end unless that way is
 * straight back to a hub (the Treetop Commons, the Great Hollow or the Party Grove), where every other
 * way is a step away. The few that are dead ends on purpose say why.
 */
const HUBS = new Set([LOBBY_ROOM, 'm3-hall', 'hub']);
const ON_PURPOSE: Readonly<Record<string, string>> = {
  'brush-falls': 'a reward cave off the ink course: a seal and a lost feather, one doorway in',
  'canopy-roots': 'a reward den off the Updraft Canopy: a lost feather, one doorway in',
  arcade: 'down the root stair today; its own doorway off the Great Hollow makes it a loop (OP-305)',
};

/** Every room the new map reaches from the Commons, with the rooms its doorways lead to. */
function newMapExits(): Map<string, Set<string>> {
  const exits = new Map<string, Set<string>>();
  const queue = [LOBBY_ROOM];
  while (queue.length > 0) {
    const room = queue.shift()!;
    const to = new Set<string>();
    for (const d of ROOMS[room]?.doors ?? []) {
      const next = doorTarget(d, 3)?.room;
      if (!next || !ROOMS[next]) continue;
      to.add(next);
      if (!exits.has(next) && !queue.includes(next)) queue.push(next);
    }
    exits.set(room, to);
  }
  return exits;
}

describe('the new map’s loops (OP-307)', () => {
  it('has no dead end but those on purpose: a room with one way out leads straight back to a hub', () => {
    const dead = [...newMapExits()].filter(([room, to]) => to.size === 1 && !HUBS.has([...to][0]!) && !(room in ON_PURPOSE)).map(([room]) => room);
    expect(dead).toEqual([]);
  });

  it('keeps the list of dead ends on purpose to rooms that are still dead ends', () => {
    const exits = newMapExits();
    for (const room of Object.keys(ON_PURPOSE)) expect(exits.get(room)?.size, room).toBe(1);
  });
});
