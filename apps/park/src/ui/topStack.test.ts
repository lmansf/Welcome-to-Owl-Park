import { describe, expect, it } from 'vitest';
import { TOP_GAP, clearTop } from './topStack';

/** The keepers' ribbon as it stands under the bar on a computer, and a guest's badge under it. */
const RIBBON = { left: 12, right: 572, top: 54, bottom: 100 };
const BADGE = { left: 12, right: 243, top: 108, bottom: 154 };

describe('the top of the screen, kept clear (OP-369)', () => {
  it('leaves a chip where it is put when nothing is in its way', () => {
    expect(clearTop({ left: 453, wide: 457, tall: 30 }, 64, [])).toBe(64);
  });

  it('puts the objective strip under the ribbon it would lie over, a gap below it', () => {
    // 1363 wide: the strip, 457 across in the middle, starts at 453 and the ribbon reaches 572.
    expect(clearTop({ left: 453, wide: 457, tall: 30 }, 64, [RIBBON])).toBe(RIBBON.bottom + TOP_GAP);
  });

  it('leaves it at its own height beside a ribbon that ends short of it', () => {
    const short = { ...RIBBON, right: 330 };
    expect(clearTop({ left: 453, wide: 457, tall: 30 }, 64, [short])).toBe(64);
  });

  it('counts a chip closer than the gap as in the way', () => {
    const near = { ...RIBBON, right: 450 };
    expect(clearTop({ left: 453, wide: 457, tall: 30 }, 64, [near])).toBe(RIBBON.bottom + TOP_GAP);
  });

  it('moved under one chip, clears the next one down too', () => {
    // A narrow screen: the strip reaches over both the ribbon and the badge under it.
    expect(clearTop({ left: 100, wide: 457, tall: 30 }, 64, [RIBBON, BADGE])).toBe(BADGE.bottom + TOP_GAP);
    // Whatever order they are given in.
    expect(clearTop({ left: 100, wide: 457, tall: 30 }, 64, [BADGE, RIBBON])).toBe(BADGE.bottom + TOP_GAP);
  });

  it('is not moved by a chip well below where it stands', () => {
    const low = { left: 400, right: 900, top: 300, bottom: 340 };
    expect(clearTop({ left: 453, wide: 457, tall: 30 }, 64, [low])).toBe(64);
  });

  it('puts a notice under the strip it shares the middle with', () => {
    const strip = { left: 453, right: 910, top: 106, bottom: 136 };
    expect(clearTop({ left: 541, wide: 280, tall: 34 }, 64, [RIBBON, strip])).toBe(strip.bottom + TOP_GAP);
  });
});
