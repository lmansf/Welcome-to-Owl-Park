import { describe, expect, it } from 'vitest';
import { drawnRect, FIT, interactBox, markerAt, SPRITES } from './sprites';

describe('the sprite manifest (OP-127)', () => {
  it('holds each drawn box inside its sprite, with its centre in the middle of it', () => {
    for (const [key, fit] of Object.entries(SPRITES)) {
      if (!fit.drawn || !fit.centre) continue;
      const [x, y, w, h] = fit.drawn;
      expect(x >= 0 && y >= 0 && w > 0 && h > 0, key).toBe(true);
      expect(x + w <= fit.size[0] && y + h <= fit.size[1], key).toBe(true);
      expect(Math.abs(fit.centre[0] - (x + w / 2)) <= 1 && Math.abs(fit.centre[1] - (y + h / 2)) <= 1, key).toBe(true);
      // The object sits inside what is drawn round it.
      if (fit.solid) {
        const [sx, sy, sw, sh] = fit.solid;
        expect(sx >= x && sy >= y && sx + sw <= x + w && sy + sh <= y + h, key).toBe(true);
      }
    }
  });
});

describe('the fit rules (OP-127)', () => {
  it('places a sprite by its origin and scale, on what it draws rather than its frame', () => {
    // A nest armchair: drawn 16..138 across and 25..144 down in its 150 x 150 frame.
    const chair = SPRITES['decor-armchair']!;
    expect(chair.drawn).toEqual([16, 25, 122, 119]);
    // Drawn standing at (500, 700), its feet at the frame's bottom middle.
    expect(drawnRect('decor-armchair', { at: { x: 500, y: 700 }, origin: { x: 0.5, y: 1 } })).toEqual({ x: 441, y: 575, w: 122, h: 119 });
    expect(drawnRect('decor-armchair', { at: { x: 500, y: 700 }, origin: { x: 0.5, y: 1 }, scale: 0.5 })).toEqual({ x: 470.5, y: 637.5, w: 61, h: 59.5 });
    expect(drawnRect('no-such-sprite', { at: { x: 0, y: 0 } })).toBeNull();
  });

  it('grows a trigger box by the margin, never below a fingertip, centred where it was', () => {
    expect(interactBox({ x: 100, y: 100, w: 80, h: 60 })).toEqual({ x: 88, y: 88, w: 104, h: 84 });
    // Something small still gets a box a finger can find.
    expect(interactBox({ x: 100, y: 100, w: 10, h: 6 })).toEqual({ x: 83, y: 81, w: FIT.minSide, h: FIT.minSide });
    // Owls to talk to may reach further.
    expect(interactBox({ x: 100, y: 100, w: 80, h: 60 }, 20)).toEqual({ x: 68, y: 68, w: 144, h: 124 });
  });

  it('stands a marker just above what is drawn, in its middle', () => {
    expect(markerAt({ x: 441, y: 575, w: 122, h: 119 })).toEqual({ x: 502, y: 569 });
  });
});
