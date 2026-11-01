import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, VOTABLE_REALMS, hexToInt, isHexColour, isPledge, lookFromSeed, sanitizeLook } from './look';
import { isParkMessage } from './validate';

describe('looks', () => {
  it('accepts only 6-digit hex colours', () => {
    expect(isHexColour('#C9A227')).toBe(true);
    expect(isHexColour('#fff')).toBe(false);
    expect(isHexColour('red')).toBe(false);
    expect(isHexColour(42)).toBe(false);
  });
  it('keeps a well-formed pledge and drops a bad one', () => {
    expect(sanitizeLook({ ...DEFAULT_LOOK, pledge: 'grove' }).pledge).toBe('grove');
    expect(sanitizeLook({ ...DEFAULT_LOOK, pledge: 'Hoot<script>' }).pledge).toBeUndefined();
    expect(sanitizeLook({ ...DEFAULT_LOOK })).not.toHaveProperty('pledge');
  });

  it('takes only a votable realm as a pledge, so no free text rides on a look (OP-093)', () => {
    for (const realm of VOTABLE_REALMS) expect(isPledge(realm)).toBe(true);
    for (const bad of ['hello-everyone', 'abc', 'grove2', '', 'GROVE', 42, null]) expect(isPledge(bad)).toBe(false);
    expect(sanitizeLook({ ...DEFAULT_LOOK, pledge: 'call-me-now' }).pledge).toBeUndefined();
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
    const walk = { from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, startedAt: 5 };
    expect(isParkMessage({ t: 'move', id: 'a', walk })).toBe(true);
    expect(isParkMessage({ t: 'move', id: 'a', walk: {} })).toBe(false);
    expect(isParkMessage({ t: 'state', state: { id: 'x' } })).toBe(false);
    expect(isParkMessage({ t: 'state', state: { id: 'x', look: DEFAULT_LOOK, pos: { x: 1, y: 1 }, walk: null, v: 1 } })).toBe(true);
    expect(isParkMessage({ t: 'bye', id: 'a'.repeat(65) })).toBe(false);
    expect(isParkMessage({ t: 'nope' })).toBe(false);
    expect(isParkMessage(null)).toBe(false);
    expect(isParkMessage('move')).toBe(false);
  });
});
