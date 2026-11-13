import { describe, expect, it } from 'vitest';
import { isTestVisit } from './testVisit';

describe('our own test visits', () => {
  it('a page an automation tool drives is one', () => {
    expect(isTestVisit('', true)).toBe(true);
    expect(isTestVisit('?room=m3-hall', true)).toBe(true);
  });

  it('a page whose address asks with ?test=1 is one', () => {
    expect(isTestVisit('?test=1', false)).toBe(true);
    expect(isTestVisit('?room=m3-hall&test=1', undefined)).toBe(true);
  });

  it('an ordinary player is not', () => {
    expect(isTestVisit('', false)).toBe(false);
    expect(isTestVisit('', undefined)).toBe(false);
    expect(isTestVisit('?test=0', false)).toBe(false);
    expect(isTestVisit('?test=yes&room=hub', false)).toBe(false);
  });
});
