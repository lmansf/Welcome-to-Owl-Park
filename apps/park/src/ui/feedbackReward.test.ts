import { describe, expect, it } from 'vitest';
import { FEEDBACK_MOUSE } from '@owl-park/shared';
import { FEEDBACK_REWARD_WORDS, afterReward, feedbackCardVisible, rewardLine, rewardThanks } from './feedbackReward';
import { FULL_OPENING_MS } from './preview';

// ---- The thanks ladder, the page's half (OP-272) ----

const BEFORE = Date.parse('2026-11-05T18:00:00-05:00');

describe('the thanks ladder on the page (OP-272)', () => {
  it('says what this note will bring, and nothing to a guest, without a server or at the top', () => {
    expect(rewardLine({ earns: true, given: 0, closed: true })).toBe(FEEDBACK_REWARD_WORDS.firstNote);
    expect([1, 2, 3].map((given) => rewardLine({ earns: true, given, closed: false }))).toEqual(['Your next note earns 10 feathers.', 'Your next note earns 15 feathers.', 'Your next note earns 20 feathers.']);
    expect(rewardLine({ earns: true, given: 4, closed: false })).toBeNull();
    expect(rewardLine({ earns: false, given: 0, closed: false })).toBeNull();
    expect(rewardLine(null)).toBeNull();
  });

  it('thanks the owl with what came', () => {
    expect(rewardThanks({ step: 1, item: FEEDBACK_MOUSE, dup: false, feathers: 0, total: 0 })).toBe(FEEDBACK_REWARD_WORDS.mouse);
    expect(rewardThanks({ step: 1, item: FEEDBACK_MOUSE, dup: true, feathers: 5, total: 5 })).toBe('Thank you! You already have the grey mouse, so here are 5 feathers.');
    expect(rewardThanks({ step: 2, item: null, dup: false, feathers: 10, total: 15 })).toBe('Thank you! Here are 10 feathers for your note.');
  });

  it('moves up the ladder after a note, keeping the card closed if it was', () => {
    expect(afterReward(null, { step: 1, item: FEEDBACK_MOUSE, dup: false, feathers: 0, total: 0 })).toEqual({ earns: true, given: 1, closed: false });
    expect(afterReward({ earns: true, given: 1, closed: true }, { step: 2, item: null, dup: false, feathers: 10, total: 10 })).toEqual({ earns: true, given: 2, closed: true });
  });

  it('shows the card until the mouse is won or the card closed, and goes with the bug at the full opening', () => {
    const fresh = { earns: true, given: 0, closed: false };
    expect(feedbackCardVisible(fresh, BEFORE)).toBe(true);
    expect(feedbackCardVisible({ ...fresh, given: 1 }, BEFORE)).toBe(false);
    expect(feedbackCardVisible({ ...fresh, closed: true }, BEFORE)).toBe(false);
    expect(feedbackCardVisible({ ...fresh, earns: false }, BEFORE)).toBe(false);
    expect(feedbackCardVisible(fresh, FULL_OPENING_MS)).toBe(false);
  });

  it('keeps its words short enough for the card beside the bug', () => {
    expect(FEEDBACK_REWARD_WORDS.card.length).toBeLessThanOrEqual(40);
  });
});
