import { describe, expect, it } from 'vitest';
import { FEEDBACK_BUG_WORDS, bugIcon, feedbackBugShown } from './feedbackBug';
import { FULL_OPENING_MS } from './preview';

// The feedback bug (OP-208): on screen everywhere until the park fully opens on December 1.

describe('the feedback bug (OP-208)', () => {
  it('shows before the full opening', () => {
    expect(feedbackBugShown(Date.parse('2026-11-02T13:30:00-05:00'))).toBe(true);
    expect(feedbackBugShown(FULL_OPENING_MS - 1)).toBe(true);
  });

  it('goes away on its own at midnight Eastern on December 1', () => {
    expect(feedbackBugShown(FULL_OPENING_MS)).toBe(false);
    expect(feedbackBugShown(Date.parse('2026-12-15T12:00:00-05:00'))).toBe(false);
  });

  it('stays away with its switch off, whatever the date', () => {
    expect(feedbackBugShown(Date.parse('2026-11-02T13:30:00-05:00'), false)).toBe(false);
  });

  it('says what it is to a screen reader', () => {
    expect(FEEDBACK_BUG_WORDS.label).toMatch(/^Send feedback/);
  });

  it("draws the same bug for the Menu's Feedback button in the colours it is given (OP-242)", () => {
    const svg = bugIcon('currentColor', 'red');
    expect(svg).toMatch(/^<svg /);
    expect(svg).not.toContain('#FFD36A');
    expect(svg.match(/currentColor/g)).toHaveLength(3);
    expect(svg.match(/"red"/g)).toHaveLength(2);
  });
});
