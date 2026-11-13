import { describe, expect, it } from 'vitest';
import { IDOL_FLARE } from './idolFlare';

// OP-324: an idol's answer to a pledge stays gentle for young and light-sensitive players.
describe('idol flare', () => {
  it('peaks well short of white', () => {
    expect(IDOL_FLARE.glowPeak).toBeLessThanOrEqual(0.6);
    expect(IDOL_FLARE.sparkAlpha).toBeLessThanOrEqual(0.6);
    expect(IDOL_FLARE.glowSwell).toBeLessThanOrEqual(1.2);
  });

  it('swells far slower than three flashes a second', () => {
    // One swell is a rise and a fall; three a second would be about 333 ms each.
    expect(2 * IDOL_FLARE.riseMs).toBeGreaterThanOrEqual(1200);
  });

  it('sends up a few sparks, not a burst', () => {
    expect(IDOL_FLARE.sparks).toBeLessThanOrEqual(24);
  });
});
