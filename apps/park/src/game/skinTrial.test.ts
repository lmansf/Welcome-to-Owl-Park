import { describe, expect, it } from 'vitest';
import { KIT_ART } from '@owl-park/shared';
import { artBox, fitRect, isRightEnd, skinTrialWanted, trialFilesOf, updraftBitsKey } from './skinTrial';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('skin trials (?skin=)', () => {
  it('are off for a visitor, on for the tab once asked for, and off again with ?skin=0', () => {
    const s = memory();
    expect(skinTrialWanted(null, s)).toBeNull();
    expect(skinTrialWanted('dusk', s)).toBe('dusk');
    expect(skinTrialWanted(null, s)).toBe('dusk');
    expect(skinTrialWanted('0', s)).toBeNull();
    expect(skinTrialWanted(null, s)).toBeNull();
  });

  it('take only a plain name', () => {
    expect(skinTrialWanted('../x', memory())).toBeNull();
    expect(skinTrialWanted('Dusk', memory())).toBeNull();
  });

  it('draw a realm slot, and a stand-in in it, from the trial’s files when it has them', () => {
    const published = new Map([
      ['trial-dusk-kit-clearing-perch-small.webp', 'a'],
      ['trial-dusk-kit-clearing-updraft-bits.webp', 'b'],
    ]);
    expect(trialFilesOf('kit-clearing-perch-small--clearing-bough-perch', 'dusk', published)).toBe('trial-dusk-kit-clearing-perch-small');
    expect(trialFilesOf(updraftBitsKey('kit-clearing-updraft'), 'dusk', published)).toBe('trial-dusk-kit-clearing-updraft-bits');
    // A slot the trial has no file for, another trial, no trial, and a key that is no slot.
    expect(trialFilesOf('kit-clearing-hazard--clearing-bramble-patch', 'dusk', published)).toBeNull();
    expect(trialFilesOf('kit-clearing-perch-small--clearing-bough-perch', 'forest', published)).toBeNull();
    expect(trialFilesOf('kit-clearing-perch-small--clearing-bough-perch', null, published)).toBeNull();
    expect(trialFilesOf('hub', 'dusk', published)).toBeNull();
  });

  it('measure a piece’s art as the kit measures it: its top across the middle half, so a raised end does not set it', () => {
    // 10 x 6: a bar on rows 3 to 5, and a post at the left end rising to row 0.
    const w = 10, h = 6, a = new Array(w * h).fill(0);
    for (let y = 3; y < 6; y++) for (let x = 1; x < 9; x++) a[y * w + x] = 255;
    for (let y = 0; y < 3; y++) a[y * w + 1] = 255;
    expect(artBox(a, w, h)).toEqual({ x0: 1, y0: 3, x1: 9, y1: 6 });
    expect(artBox(new Array(w * h).fill(0), w, h)).toBeNull();
  });

  it('fit the trial’s art to the stand-in’s outline, so its drawn top is the walk line the course plays on', () => {
    const tall = KIT_ART['kit-clearing-perch-small--clearing-bough-end-perch']!;
    // A 240 x 60 perch drawn into a 240 x 200 stand-in starts at its walk line, 120 px down, not at the top of the box.
    expect(fitRect(tall, 2)).toEqual({ x0: tall.left! * 2, y0: tall.top! * 2, x1: tall.right! * 2, y1: tall.foot! * 2 });
    expect(tall.top).toBeGreaterThan(100);
    // A texture or a backdrop is not fitted.
    expect(fitRect(KIT_ART['kit-clearing-texture-ground--tex-clearing-fern-floor']!, 1)).toBeNull();
  });

  it('mirror the one end piece at a run’s right end', () => {
    expect(isRightEnd('kit-clearing-perch-end--cut-earth-path-cap-right')).toBe(true);
    expect(isRightEnd('kit-clearing-perch-end--cut-earth-path-cap-left')).toBe(false);
  });
});
