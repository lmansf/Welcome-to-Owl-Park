import { describe, expect, it } from 'vitest';
import { FULL_OPENING_MS, PREVIEW_WORDS, earlyPreview } from './preview';

describe('the early preview warning', () => {
  const before = Date.parse('2026-11-15T12:00:00-05:00');

  it('shows while the gate takes tickets, before the full opening', () => {
    expect(earlyPreview('ticket', before)).toBe(true);
  });

  it('stays hidden while the turnstiles let everyone through', () => {
    expect(earlyPreview('open', before)).toBe(false);
  });

  it('goes away on its own at midnight Eastern on December 1', () => {
    expect(earlyPreview('ticket', FULL_OPENING_MS - 1)).toBe(true);
    expect(earlyPreview('ticket', FULL_OPENING_MS)).toBe(false);
    expect(new Date(FULL_OPENING_MS).toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });

  it('names the full opening date', () => {
    expect(PREVIEW_WORDS.booth).toContain('December 1');
  });
});
