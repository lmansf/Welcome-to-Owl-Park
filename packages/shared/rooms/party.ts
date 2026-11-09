/**
 * A party game's own room (OP-314): one screen of the Party Grove's floor round the Old Stump, under
 * the grove's own painting. Like NEST_ROOM it is a template rather than a room of the registry: each
 * game is this room under its own id, `party-<id>`, as roomFor gives it, and its owls see the game's
 * screen over it. Its one way out leads back to the stump in the Party Grove.
 */
import { FROM_STUMP_SPAWN } from '../src/party/ids';
import { ROOM_H, ROOM_W, type RoomDef } from '../src/room';

export const PARTY_ROOM: RoomDef = {
  id: 'party',
  size: { w: ROOM_W, h: ROOM_H },
  background: 'hub',
  mood: 'hub',
  walkable: [
    [
      { x: 120, y: 900 },
      { x: 120, y: 724 },
      { x: 1480, y: 724 },
      { x: 1480, y: 900 },
    ],
  ],
  spawns: {
    'default': { x: 800, y: 800 },
    'seat-0': { x: 620, y: 800 },
    'seat-1': { x: 740, y: 770 },
    'seat-2': { x: 860, y: 770 },
    'seat-3': { x: 980, y: 800 },
  },
  doors: [{ id: 'to-party-grove', rect: { x: 700, y: 870, w: 200, h: 30 }, to: { room: 'hub', spawn: FROM_STUMP_SPAWN }, marker: { x: 800, y: 880 }, labelNew: 'Back to the Party Grove' }],
};
