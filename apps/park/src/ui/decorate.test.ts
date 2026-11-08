import { describe, expect, it } from 'vitest';
import { NEST_WORDS } from '@owl-park/shared';
import { giftButton, spotHeading } from './decorate';

describe('the Decorate sheet', () => {
  it('names a spot by its number of the twelve and where it is', () => {
    expect(spotHeading('f1')).toEqual({ n: 1, of: 12, where: NEST_WORDS.onTheFloor });
    expect(spotHeading('f8')).toEqual({ n: 8, of: 12, where: NEST_WORDS.onTheFloor });
    expect(spotHeading('w1')).toEqual({ n: 9, of: 12, where: NEST_WORDS.onTheWall });
  });

  it('offers today’s furniture gift until it is taken, and hides the button when the park could not say', () => {
    expect(giftButton({ taken: false })).toEqual({ label: "Today's furniture gift", ready: true });
    expect(giftButton({ taken: true })).toEqual({ label: 'Next gift tomorrow', ready: false });
    expect(giftButton(null)).toBeNull();
  });
});
