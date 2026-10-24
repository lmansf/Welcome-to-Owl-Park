import { describe, expect, it } from 'vitest';
import { MENU_THEMES, blend, contrast, themeAt, tokenStyle } from './menuTheme';

describe("the Menu's themes (OP-108)", () => {
  for (const [id, t] of Object.entries(MENU_THEMES)) {
    it(`${id}: every text 4.5:1 or better on its surface, the wood grain's lines included`, () => {
      // The darkest (or lightest) the grain makes the wood under a letter.
      const grained = blend(t.grainLine, t.surface, t.grainAlpha);
      for (const ground of [t.surface, grained, t.raised]) {
        expect(contrast(t.text, ground), `text on ${ground}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.muted, ground), `notes on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(t.onAccent, t.accent), 'a button').toBeGreaterThanOrEqual(4.5);
      // The focus ring and the active tab's bar stand out from the wood (3:1, the rule for parts of the screen).
      expect(contrast(t.focus, t.surface)).toBeGreaterThanOrEqual(3);
    });

    it(`${id}: nothing smaller than the rules allow, and the motion as asked`, () => {
      expect(t.bodyPx).toBeGreaterThanOrEqual(16);
      expect(t.headingPx).toBeGreaterThan(t.bodyPx);
      expect(t.targetPx).toBeGreaterThanOrEqual(44);
      expect(t.motionMs).toBe(200);
      expect(t.tapGain).toBeGreaterThan(0);
      expect(t.tapGain).toBeLessThanOrEqual(0.3);
    });
  }

  it('flips to the night variant in the evening and back in the morning, on the visitor’s clock', () => {
    const at = (h: number) => new Date(2026, 9, 24, h, 30);
    expect([6, 7, 12, 18, 19, 23, 0].map((h) => themeAt(at(h)))).toEqual(['night', 'day', 'day', 'day', 'night', 'night', 'night']);
  });

  it('gives the shell every value as a custom property, the wood and the branch drawn inline', () => {
    const css = tokenStyle(MENU_THEMES.day);
    for (const name of ['surface', 'grain', 'raised', 'branch', 'frame', 'accent', 'on-accent', 'text', 'muted', 'focus', 'radius', 'tab-radius', 'motion', 'body', 'target']) {
      expect(css, name).toContain(`--m-${name}:`);
    }
    expect(css).toContain('--m-grain:url("data:image/svg+xml,');
    expect(css).not.toMatch(/https?:/);
  });
});
