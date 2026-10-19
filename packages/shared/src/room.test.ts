import { describe, expect, it } from 'vitest';
import { ROOM_H, ROOM_W, backgroundTiles, foregroundTiles, type RoomDef } from './room';

const base: RoomDef = { id: 'r', size: { w: ROOM_W, h: ROOM_H }, background: 'r', walkable: [], spawns: { default: { x: 1, y: 1 } }, doors: [], mood: 'hub' };

describe('room tiles', () => {
  it('treats a room of one screen as one tile at the origin', () => {
    expect(backgroundTiles(base)).toEqual([{ key: 'r', x: 0, y: 0 }]);
    expect(foregroundTiles(base)).toEqual([]);
    expect(foregroundTiles({ ...base, foreground: 'r-fg' })).toEqual([{ key: 'r-fg', x: 0, y: 0 }]);
  });

  it('uses the tile lists of a wider room instead', () => {
    const wide: RoomDef = {
      ...base,
      size: { w: ROOM_W * 2, h: ROOM_H },
      foreground: 'r-fg',
      backgrounds: [
        { key: 'r', x: 0, y: 0 },
        { key: 'r-east', x: ROOM_W, y: 0 },
      ],
      foregrounds: [{ key: 'r-east-fg', x: ROOM_W, y: 0 }],
    };
    expect(backgroundTiles(wide).map((t) => t.key)).toEqual(['r', 'r-east']);
    expect(foregroundTiles(wide)).toEqual([{ key: 'r-east-fg', x: ROOM_W, y: 0 }]);
  });
});
