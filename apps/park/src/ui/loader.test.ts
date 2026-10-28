import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACT_MS, FIRST_FACT_MS, SHOW_AFTER_MS, shareLoaded } from './loader';

describe('the load screen (OP-129)', () => {
  it('grows the branch by the share of the bytes that have come, nothing to load being all of it', () => {
    expect(shareLoaded(0, 1000)).toBe(0);
    expect(shareLoaded(250, 1000)).toBe(0.25);
    expect(shareLoaded(1000, 1000)).toBe(1);
    // More than expected (a fallback file larger than the first choice) is still all of it.
    expect(shareLoaded(1500, 1000)).toBe(1);
    expect(shareLoaded(0, 0)).toBe(1);
  });

  it('waits a moment before it shows, and brings its first fact after two seconds, the next after several more', () => {
    expect(SHOW_AFTER_MS).toBeLessThanOrEqual(500);
    expect(FIRST_FACT_MS).toBe(2000);
    expect(FACT_MS).toBeGreaterThan(FIRST_FACT_MS);
  });

  it('is in the page itself, so it shows before the script has come, and its leaves come in order along the branch', () => {
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain('id="loader"');
    expect(html).toMatch(/role="progressbar"/);
    const leaves = [...html.matchAll(/class="lo-leaf" style="--at: ([.\d]+)"/g)].map((m) => Number(m[1]));
    expect(leaves.length).toBeGreaterThanOrEqual(5);
    expect([...leaves].sort((a, b) => a - b)).toEqual(leaves);
    expect(leaves.every((at) => at > 0 && at < 1)).toBe(true);
    // A device that asks for less motion gets the branch and the words, nothing that moves by itself.
    expect(html).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
