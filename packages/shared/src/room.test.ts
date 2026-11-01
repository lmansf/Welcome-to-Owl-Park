import { describe, expect, it } from 'vitest';
import { ROOM_H, ROOM_W, TILE_GROW, backgroundTiles, foregroundTiles, mapOf, tilePlacement, type RoomDef, type RoomTile } from './room';

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

// ---- Parallax (OP-156): a tile that scrolls at its own rate, drawn by Phaser with that scroll factor ----
describe('a tile that scrolls at a rate of its own', () => {
  // Phaser draws a thing at x with scroll factor f at x - f * scrollX (zoomed about the view's middle),
  // and a camera centred on a point scrolls to that point less half the view.
  const drawnAt = (x: number, f: number, scroll: number) => x - f * scroll;
  const view = { w: 1280, h: 720 };
  const screen: RoomTile = { key: 'tree-sky', x: ROOM_W, y: 0, rate: 0.5 };
  const centred = { x: ROOM_W + ROOM_W / 2 - view.w / 2, y: ROOM_H / 2 - view.h / 2 };

  it('is where the room puts it, at its size, when it scrolls with the room', () => {
    expect(tilePlacement({ key: 'hub', x: ROOM_W, y: 0 }, view)).toEqual({ x: ROOM_W, y: 0, w: ROOM_W, h: ROOM_H });
    expect(tilePlacement({ key: 'hub', x: ROOM_W, y: 0, rate: 1 }, view)).toEqual({ x: ROOM_W, y: 0, w: ROOM_W, h: ROOM_H });
  });

  it('lines up with its screen when the camera is centred on it, and lags by half the camera\'s move at half the rate', () => {
    const p = tilePlacement(screen, view);
    // Drawn larger about the screen's centre: its centre is the screen's centre when the camera is centred.
    expect(p.w).toBeCloseTo(ROOM_W * (1 + 0.5 * TILE_GROW));
    expect(p.h).toBeCloseTo(ROOM_H * (1 + 0.5 * TILE_GROW));
    expect(drawnAt(p.x + p.w / 2, 0.5, centred.x)).toBeCloseTo(drawnAt(screen.x + ROOM_W / 2, 1, centred.x));
    expect(drawnAt(p.y + p.h / 2, 0.5, centred.y)).toBeCloseTo(drawnAt(ROOM_H / 2, 1, centred.y));
    for (const d of [-300, 120, 640]) {
      const moved = drawnAt(p.x, 0.5, centred.x + d) - drawnAt(p.x, 0.5, centred.x);
      expect(moved).toBeCloseTo(-d / 2);
    }
  });

  it('never shows its edge while it lags by up to its growth, and a near layer is not grown', () => {
    const p = tilePlacement(screen, view);
    // At the most the camera can lag a centred far layer within the screen, the layer still covers the view.
    const lag = (ROOM_W - view.w) / 2;
    for (const d of [-lag, 0, lag]) {
      // The view is drawn from 0 to its width: the layer reaches past both sides.
      const left = drawnAt(p.x, 0.5, centred.x + d);
      expect(left, `camera ${d} from centred`).toBeLessThanOrEqual(0);
      expect(left + p.w, `camera ${d} from centred`).toBeGreaterThanOrEqual(view.w);
    }
    const near = tilePlacement({ key: 'tree-leaves', x: 0, y: 0, rate: 1.2 }, view);
    expect([near.w, near.h]).toEqual([ROOM_W, ROOM_H]);
    expect(drawnAt(near.x, 1.2, ROOM_W / 2 - view.w / 2)).toBeCloseTo(drawnAt(0, 1, ROOM_W / 2 - view.w / 2));
  });

  it('belongs to today\'s park unless the room says the tree', () => {
    expect(mapOf({})).toBe(1);
    expect(mapOf({ map: 2 })).toBe(2);
  });
});
