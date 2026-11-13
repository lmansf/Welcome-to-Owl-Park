import { describe, expect, it } from 'vitest';
import { FEEDBACK_BUG_WORDS, feedbackBugShown, feedbackIcon } from './feedbackBug';
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

  it("draws a mouse for the bug and the Menu's Feedback button, in the colour it is given (OP-242)", () => {
    const svg = feedbackIcon('currentColor');
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('#C9CED6');
    // Tail, body and ear wear the colour; the eye and the ear's edge are cut out, not painted.
    expect(svg.match(/currentColor/g)).toHaveLength(3);
    expect(svg).toMatch(/mask="url\(#fb-mouse-cut-\d+\)"/);
  });

  it('gives each drawing its own cut-out, so a hidden copy never takes the eye from a shown one', () => {
    const ids = [feedbackIcon('#fff'), feedbackIcon('#fff')].map((svg) => svg.match(/<mask id="([^"]+)"/)?.[1]);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
    for (const [i, svg] of [feedbackIcon('#fff', 'a'), feedbackIcon('#fff', 'b')].entries()) expect(svg).toContain(`mask="url(#${'ab'[i]})"`);
  });
});
