import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ROOM_H, ROOM_W, backgroundTiles, foregroundTiles } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { ART_LOOKS, DEFAULT_ART_LOOK, artLookRoom, artLookWanted, lookKey, lookKeys } from './artLooks';
import { drawnRoom } from './kitView';
import { ART } from './art';

// The drawing code is not run here: only which room is drawn.
vi.mock('phaser', () => ({ default: {} }));

const PUBLIC_ART = join(__dirname, '../../public/art');

describe('layered room looks (artLooks.ts)', () => {
  it('draw the Party Grove’s layers for everyone, and the earlier paintings only on ?art=old', () => {
    expect(DEFAULT_ART_LOOK).toBe('partygrove');
    expect(artLookWanted(null)).toBe('partygrove');
    expect(artLookWanted('nope')).toBe('partygrove');
    expect(artLookWanted('__proto__')).toBe('partygrove');
    expect(artLookWanted('partygrove')).toBe('partygrove');
    expect(artLookWanted('old')).toBeNull();
  });

  it('draws the Party Grove in four layers per screen, and leaves its floor, perches and doorways as they are', () => {
    const hub = ROOMS.hub!;
    const room = artLookRoom(hub, 'partygrove');
    expect(room.walkable).toBe(hub.walkable);
    expect(room.doors).toBe(hub.doors);
    expect(room.perches).toBe(hub.perches);
    const back = backgroundTiles(room);
    const rates = (keys: string) => back.filter((t) => t.key.includes(keys)).map((t) => t.rate);
    expect(rates('-back-')).toEqual([0.5, 0.5, 0.5]);
    expect(rates('-mid-')).toEqual([0.75, 0.75, 0.75]);
    expect(rates('-play-')).toEqual([1, 1, 1]);
    expect(foregroundTiles(room).map((t) => t.rate)).toEqual([1.2, 1.2, 1.2]);
    // The playable layer is never faded; the middle screen, faded on both sides, is drawn over its neighbours.
    expect(back.filter((t) => t.rate === 1).every((t) => t.plain && !t.fade)).toBe(true);
    expect(back.filter((t) => t.rate === 0.5).map((t) => [t.x, t.fade])).toEqual([
      [0, { right: 220 }],
      [2 * ROOM_W, { left: 220 }],
      [ROOM_W, { left: 220, right: 220 }],
    ]);
  });

  it('is what the park draws for the Party Grove, and for no other room', () => {
    expect(backgroundTiles(drawnRoom(ROOMS.hub!, { kit: true, art: 'partygrove' }))).toHaveLength(9);
    expect(drawnRoom(ROOMS.hub!, { kit: false, art: null })).toBe(ROOMS.hub);
    expect(artLookRoom(ROOMS.grove!, 'partygrove')).toBe(ROOMS.grove);
    expect(artLookRoom(ROOMS.hub!, null)).toBe(ROOMS.hub);
  });

  it('ships every layer in the build, as room-sized art', () => {
    for (const name of Object.keys(ART_LOOKS)) {
      const keys = lookKeys(name);
      expect(keys).toHaveLength(ART_LOOKS[name]!.screens * 4);
      for (const key of keys) {
        expect(existsSync(join(PUBLIC_ART, `${key}.webp`)), `${key}.webp`).toBe(true);
        expect(ART[key]).toEqual({ w: ROOM_W, h: ROOM_H, kind: 'room' });
      }
    }
    expect(lookKey('partygrove', 'front', 2)).toBe('partygrove-front-2');
  });
});
