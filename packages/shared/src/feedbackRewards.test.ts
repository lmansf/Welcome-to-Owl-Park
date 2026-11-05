import { describe, expect, it } from 'vitest';
import { FEEDBACK_LADDER, FEEDBACK_MOUSE, FEEDBACK_REWARD_MIN_CHARS, feedbackCardShown, nextFeedbackRung, noteCounts } from './feedbackRewards';
import { SHOP_PRICES } from './shop';
import { parseVariant } from './collectibles';

// ---- The thanks ladder for feedback (OP-272) ----

describe('the thanks ladder (OP-272)', () => {
  it('is the grey mouse, then 10, 15 and 20 feathers, then nothing', () => {
    expect(nextFeedbackRung(0)).toEqual({ item: FEEDBACK_MOUSE });
    expect([1, 2, 3].map(nextFeedbackRung)).toEqual([{ feathers: 10 }, { feathers: 15 }, { feathers: 20 }]);
    expect(nextFeedbackRung(4)).toBeNull();
    expect(nextFeedbackRung(99)).toBeNull();
  });

  it('gives a real collectible, the Mouse in its Original (grey) colourway', () => {
    expect(parseVariant(FEEDBACK_MOUSE)).toMatchObject({ item: { id: 'mouse', kind: 'pet' }, colour: { n: 0, name: 'Original' } });
  });

  it('pays about one common shop item in feathers in all', () => {
    const feathers = FEEDBACK_LADDER.reduce((n, r) => n + ('feathers' in r ? r.feathers : 0), 0);
    expect(feathers).toBe(45);
    expect(Math.abs(feathers - SHOP_PRICES.common)).toBeLessThanOrEqual(10);
  });

  it('counts a note long enough that is not words the owl sent before', () => {
    expect(noteCounts('x'.repeat(FEEDBACK_REWARD_MIN_CHARS - 1), [])).toBe(false);
    expect(noteCounts('The gate froze when I tapped it', [])).toBe(true);
    expect(noteCounts('the gate, froze when i TAPPED it!', ['The gate froze when I tapped it'])).toBe(false);
    expect(noteCounts('The gate froze when I tapped it again', ['The gate froze when I tapped it'])).toBe(true);
  });

  it('shows the card only to an owl that earns, before the mouse, until it is closed', () => {
    expect(feedbackCardShown(null)).toBe(false);
    expect(feedbackCardShown({ earns: true, given: 0, closed: false })).toBe(true);
    expect(feedbackCardShown({ earns: false, given: 0, closed: false })).toBe(false);
    expect(feedbackCardShown({ earns: true, given: 1, closed: false })).toBe(false);
    expect(feedbackCardShown({ earns: true, given: 0, closed: true })).toBe(false);
  });
});
