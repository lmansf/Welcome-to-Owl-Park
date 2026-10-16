import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, hexToInt, isHexColour, lookFromSeed, sanitizeLook } from './look';
import { isParkMessage } from './protocol';

describe('looks', () => {
  it('accepts only 6-digit hex colours', () => {
    expect(isHexColour('#C9A227')).toBe(true);
    expect(isHexColour('#fff')).toBe(false);
    expect(isHexColour('red')).toBe(false);
    expect(isHexColour(42)).toBe(false);
  });
  it('sanitizes untrusted input field by field', () => {
    expect(sanitizeLook({ body: '#123456', belly: 'javascript:alert(1)', accent: null })).toEqual({ body: '#123456', belly: DEFAULT_LOOK.belly, accent: DEFAULT_LOOK.accent });
    expect(sanitizeLook(undefined)).toEqual(DEFAULT_LOOK);
  });
  it('derives a stable look from an id', () => {
    expect(lookFromSeed('owl-a')).toEqual(lookFromSeed('owl-a'));
    expect(isHexColour(lookFromSeed('x').body)).toBe(true);
  });
  it('converts hex to tint ints', () => {
    expect(hexToInt('#FF2AA1')).toBe(0xff2aa1);
  });
});

describe('protocol guard', () => {
  it('recognises message shapes', () => {
    expect(isParkMessage({ t: 'move', id: 'a', walk: {} })).toBe(true);
    expect(isParkMessage({ t: 'nope' })).toBe(false);
    expect(isParkMessage(null)).toBe(false);
    expect(isParkMessage('move')).toBe(false);
  });
});
