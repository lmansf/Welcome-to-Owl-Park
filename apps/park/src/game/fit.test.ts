import { FIT, SPRITES } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ANCHORS, type OwlAnchors } from '../collect/pixels';
import { EYE_SPREAD, FEET, centreOrigin, footOrigin, hitArea, solidTop, wornAt } from './fit';

describe('sprites placed by what they draw (OP-127)', () => {
  it('stands a padded sprite on its drawn bottom, centred on what it draws', () => {
    // The leaf crown's 140 x 100 frame is 12 px empty under its brim.
    expect(SPRITES['item-leaf-crown']!.solid).toEqual([20, 19, 99, 69]);
    const o = footOrigin('item-leaf-crown');
    expect(o.y * 100).toBeCloseTo(88);
    expect(o.x * 140).toBeCloseTo(69.5);
    // A sprite the manifest does not know keeps its frame's bottom middle.
    expect(footOrigin('no-such-sprite')).toEqual({ x: 0.5, y: 1 });
    expect(footOrigin(undefined, { x: 0.5, y: 0.9 })).toEqual({ x: 0.5, y: 0.9 });
  });

  it('centres a centred sprite on what it draws', () => {
    const fit = SPRITES['item-heart-glasses']!;
    const o = centreOrigin('item-heart-glasses');
    expect(o.x * fit.size[0]).toBeCloseTo(fit.centre![0]);
    expect(o.y * fit.size[1]).toBeCloseTo(fit.centre![1]);
    expect(centreOrigin('no-such-sprite')).toEqual({ x: 0.5, y: 0.5 });
  });

  it("measures a hat's own top, not its frame's", () => {
    // The glass circlet's frame is mostly air above the ring.
    expect(solidTop('item-glass-circlet')).toBeGreaterThan(0.3);
    expect(solidTop('no-such-sprite')).toBe(0);
  });

  it("hugs an idol's tap area round the idol, not its glow", () => {
    // The stained-glass idol's glow fills its 520 px frame; the owl itself is 198 x 363 of it.
    const idol = SPRITES['glass-idol']!;
    expect(idol.drawn![2]).toBeGreaterThan(450);
    const scale = 0.55; // room pixels per frame pixel
    const area = hitArea('glass-idol', scale)!;
    const [x, y, w, h] = idol.solid!;
    expect(area.w).toBeCloseTo(w + (2 * FIT.margin) / scale);
    expect(area.h).toBeCloseTo(h + (2 * FIT.margin) / scale);
    expect(area.x + area.w / 2).toBeCloseTo(x + w / 2);
    expect(area.y + area.h / 2).toBeCloseTo(y + h / 2);
    // Never smaller than a fingertip, however small the sprite is drawn.
    const tiny = hitArea('item-leaf-crown', 0.05)!;
    expect(tiny.w * 0.05).toBeGreaterThanOrEqual(FIT.minSide - 1e-9);
    expect(tiny.h * 0.05).toBeGreaterThanOrEqual(FIT.minSide - 1e-9);
    expect(hitArea('no-such-sprite', 1)).toBeNull();
  });
});

describe('worn items placed by anchor (OP-127)', () => {
  /** Where a worn item's own top and bottom edges land, in owl canvas rows. */
  const edges = (slot: 'head' | 'face' | 'neck', a: OwlAnchors, art: string) => {
    const p = wornAt(slot, a, art);
    const top = p.y + FEET.y - p.h * (p.origin.y - solidTop(art));
    const h = SPRITES[art]!.solid![3];
    return { top, bottom: top + (h / SPRITES[art]!.size[1]) * p.h };
  };

  it('brings a hat down over the forehead, its own bottom just above the eyes', () => {
    const hat = edges('head', DEFAULT_ANCHORS, 'item-wizard-hat');
    expect(hat.bottom).toBeCloseTo(DEFAULT_ANCHORS.brow - 4);
    expect(hat.bottom).toBeGreaterThan(DEFAULT_ANCHORS.head.y + 8);
    // A halo floats over the crown and a party hat perches on it: they stay up there.
    expect(edges('head', DEFAULT_ANCHORS, 'item-halo').bottom).toBeCloseTo(DEFAULT_ANCHORS.head.y + 8);
    expect(edges('head', DEFAULT_ANCHORS, 'item-party-hat').bottom).toBeCloseTo(DEFAULT_ANCHORS.head.y + 8);
    // A head painted low, its crown nearly on the eyes: even those stop above the eyes.
    const low = { ...DEFAULT_ANCHORS, head: { ...DEFAULT_ANCHORS.head, y: 60 } };
    expect(edges('head', low, 'item-halo').bottom).toBeCloseTo(low.brow - 4);
  });

  it('hangs a collar from the neck, never up over the beak', () => {
    const scarf = edges('neck', DEFAULT_ANCHORS, 'item-knit-scarf');
    expect(scarf.top).toBeGreaterThanOrEqual(DEFAULT_ANCHORS.chin);
    expect(scarf.top).toBeLessThan(DEFAULT_ANCHORS.neck.y);
    // A short-necked owl (the burrowing owl's chest starts just under its beak): the scarf comes down to the chin.
    const short = { ...DEFAULT_ANCHORS, neck: { ...DEFAULT_ANCHORS.neck, y: 98 }, chin: 97 };
    expect(edges('neck', short, 'item-knit-scarf').top).toBeCloseTo(97);
  });

  it('centres glasses on the eyes, and a monocle on one of them', () => {
    const p = wornAt('face', DEFAULT_ANCHORS, 'item-heart-glasses');
    expect(p.x + FEET.x).toBe(DEFAULT_ANCHORS.eyes.x);
    expect(p.y + FEET.y).toBe(DEFAULT_ANCHORS.eyes.y);
    expect(p.origin).toEqual(centreOrigin('item-heart-glasses'));
    const m = wornAt('face', DEFAULT_ANCHORS, 'item-monocle');
    expect(m.x + FEET.x).toBeCloseTo(DEFAULT_ANCHORS.eyes.x + DEFAULT_ANCHORS.eyes.w * EYE_SPREAD);
  });
});
