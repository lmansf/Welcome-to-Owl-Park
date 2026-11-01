import { describe, expect, it } from 'vitest';
import { REALMS_DEFAULTS, cleanRealms, entryMap, realmShut, sameRealms, treeShare, withRealmsChanges, type RealmsSettings } from './overflow';

// The entries setting (OP-156): the tree's share of new arrivals, kept with the realms switch.

const gated = (r: string) => r === 'glass' || r === 'l1';
const night = (k: string) => k === 'easy';
const glass = { id: 'glass', gated: true } as const;
const tree = { id: 'l1', gated: true, map: 2 } as const;
const hub = { id: 'hub' } as const;

describe('the tree’s share of new arrivals (OP-156)', () => {
  it('is kept by the realms switch from 0 to 100, whole numbers only, and is absent at 0 so an untouched switch reads as before', () => {
    const forty = withRealmsChanges(REALMS_DEFAULTS, { tree: 40 }, gated, night)!;
    expect(forty).toEqual({ open: [], portal: false, night: null, tree: 40 });
    expect(treeShare(forty)).toBe(40);
    // Another change keeps the share; 0 takes it away again.
    expect(withRealmsChanges(forty, { open: ['glass'] }, gated, night)).toEqual({ open: ['glass'], portal: false, night: null, tree: 40 });
    expect(withRealmsChanges(forty, { tree: 0 }, gated, night)).toEqual(REALMS_DEFAULTS);
    for (const bad of [-1, 101, 2.5, '50', null, true]) expect(withRealmsChanges(REALMS_DEFAULTS, { tree: bad }, gated, night), String(bad)).toBeNull();
    expect(treeShare(REALMS_DEFAULTS)).toBe(0);
  });

  it('comes through a notice or a stored copy only as a whole number from 0 to 100, and counts when comparing two switches', () => {
    expect(cleanRealms({ open: [], portal: false, night: null, tree: 25 })).toEqual({ open: [], portal: false, night: null, tree: 25 });
    for (const odd of [0, -3, 400, 1.5, 'all']) expect(cleanRealms({ open: [], portal: false, night: null, tree: odd }), String(odd)).toEqual(REALMS_DEFAULTS);
    const a: RealmsSettings = { open: ['glass'], portal: true, night: 'easy' };
    expect(sameRealms(a, { ...a })).toBe(true);
    expect(sameRealms(a, { ...a, tree: 10 })).toBe(false);
    expect(sameRealms({ ...a, tree: 10 }, { ...a, tree: 10 })).toBe(true);
  });

  it('sends an owl to the same park every time, the tree for about its share of owls, and nobody while the share is 0', () => {
    const owls = Array.from({ length: 2000 }, (_, i) => `c_owl${i.toString(36).padStart(8, '0')}`);
    expect(owls.every((o) => entryMap(o, 0) === 1)).toBe(true);
    expect(owls.every((o) => entryMap(o, 100) === 2)).toBe(true);
    const tree30 = owls.filter((o) => entryMap(o, 30) === 2);
    expect(tree30.length).toBeGreaterThan(2000 * 0.25);
    expect(tree30.length).toBeLessThan(2000 * 0.35);
    // The same owl, asked again, starts in the same park; one sent at 30 is still sent at a larger share.
    expect(owls.map((o) => entryMap(o, 30))).toEqual(owls.map((o) => entryMap(o, 30)));
    expect(tree30.every((o) => entryMap(o, 60) === 2)).toBe(true);
  });

  it('keeps the tree’s gated rooms shut while it takes no share, opens them while it does, and never touches other rooms', () => {
    const dark: RealmsSettings = REALMS_DEFAULTS;
    const open: RealmsSettings = { ...REALMS_DEFAULTS, tree: 5 };
    expect(realmShut(tree, dark)).toBe(true);
    expect(realmShut(tree, open)).toBe(false);
    expect(realmShut(tree, { ...dark, open: ['l1'] })).toBe(false);
    // Today's gated realm follows its own checkbox only.
    expect(realmShut(glass, open)).toBe(true);
    expect(realmShut(glass, { ...dark, open: ['glass'] })).toBe(false);
    expect(realmShut(hub, dark)).toBe(false);
    expect(realmShut(undefined, dark)).toBe(false);
  });
});
