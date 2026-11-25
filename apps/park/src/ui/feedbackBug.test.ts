import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEEDBACK_BUG_WORDS, createFeedbackBug, feedbackBugShown, feedbackIcon, feedbackOffered } from './feedbackBug';
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

// Feedback off on December 1 (OP-449, the owner's "Feedback button off Dec 1"): the bug, the Menu's Send
// feedback and Settings' row all follow one switch, midnight Eastern at the start of December 1.
describe('Feedback goes at the full opening (OP-449)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is offered until 2026-12-01T05:00Z (midnight in New York) and never after', () => {
    expect(feedbackOffered(Date.parse('2026-12-01T04:59:59.999Z'))).toBe(true);
    expect(feedbackOffered(Date.parse('2026-11-30T23:59:00-05:00'))).toBe(true);
    expect(feedbackOffered(Date.parse('2026-12-01T05:00:00.000Z'))).toBe(false);
    expect(feedbackOffered(Date.parse('2026-12-01T00:00:00-05:00'))).toBe(false);
    expect(feedbackOffered(Date.parse('2027-03-01T12:00:00Z'))).toBe(false);
    // The bug is the same switch.
    expect(feedbackBugShown).toBe(feedbackOffered);
  });

  it('takes the bug away in a page left open across midnight, and tells the HUD once so the Menu’s entry goes too', () => {
    const made: Array<Record<string, unknown>> = [];
    const el = () => {
      const e: Record<string, unknown> = { dataset: {}, hidden: false, setAttribute: () => undefined, addEventListener: () => undefined, appendChild: () => undefined };
      made.push(e);
      return e;
    };
    vi.stubGlobal('document', { createElement: el, head: { appendChild: () => undefined } });
    vi.useFakeTimers();
    let now = Date.parse('2026-11-30T23:59:30-05:00');
    const gone = vi.fn();
    const bug = createFeedbackBug(el() as unknown as HTMLElement, () => undefined, () => now, gone);
    expect(bug.button.hidden).toBe(false);
    expect(bug.offered()).toBe(true);
    now = Date.parse('2026-12-01T00:00:30-05:00');
    vi.advanceTimersByTime(60_000);
    expect(bug.button.hidden).toBe(true);
    expect(bug.offered()).toBe(false);
    expect(gone).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600_000);
    bug.refresh();
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it('starts with no bug, and tells the HUD at once, in a page opened after the opening', () => {
    const el = () => ({ dataset: {}, hidden: false, setAttribute: () => undefined, addEventListener: () => undefined, appendChild: () => undefined });
    vi.stubGlobal('document', { createElement: el, head: { appendChild: () => undefined } });
    const gone = vi.fn();
    const bug = createFeedbackBug(el() as unknown as HTMLElement, () => undefined, () => Date.parse('2026-12-02T09:00:00-05:00'), gone);
    expect(bug.button.hidden).toBe(true);
    expect(gone).toHaveBeenCalledTimes(1);
  });
});
