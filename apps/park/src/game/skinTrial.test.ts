import { describe, expect, it } from 'vitest';
import { skinTrialWanted, trialFilesOf, updraftBitsKey } from './skinTrial';

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
});
