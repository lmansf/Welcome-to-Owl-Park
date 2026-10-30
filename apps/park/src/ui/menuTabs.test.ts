import { TRAVEL_WORDS } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { MAP_LIT_KEY, MAP_PLACES, newlyLit, placeCard } from './menuTabs';

const walked = (places: string[], gate = false) => ({ places, gate });

describe('the map’s travel cards (OP-130)', () => {
  it('travels home from anywhere but home, and says so when the owl is there', () => {
    expect(placeCard('nest', 'grove', walked([]))).toEqual({ line: null, button: { label: TRAVEL_WORDS.home, to: 'nest' } });
    expect(placeCard('nest', 'nest', walked([]))).toEqual({ line: TRAVEL_WORDS.youAreHere, button: null });
  });

  it('offers no travel to a place not walked into yet, and says how it lights up', () => {
    for (const place of ['grove', 'market', 'arcade', 'homes', 'lobby', 'hub']) expect(placeCard(place, 'nest', walked([])), place).toEqual({ line: TRAVEL_WORDS.notYet, button: null });
  });

  it('takes the great tree’s card to the gate, outside the turnstiles, and only says the way in when the owl is at the gate', () => {
    expect(placeCard('hub', 'homes', walked(['homes', 'lobby', 'hub']))).toEqual({ line: TRAVEL_WORDS.throughGate, button: { label: TRAVEL_WORDS.gate, to: 'hub' } });
    expect(placeCard('hub', 'lobby', walked(['homes', 'lobby', 'hub']))).toEqual({ line: TRAVEL_WORDS.atGate, button: null });
    expect(placeCard('lobby', 'homes', walked(['homes', 'lobby']))).toEqual({ line: null, button: { label: TRAVEL_WORDS.gate, to: 'lobby' } });
  });

  it('offers the gate instead of a place inside the park until the owl has walked through it', () => {
    const before = walked(['homes', 'lobby', 'hub', 'grove', 'market']);
    expect(placeCard('grove', 'nest', before)).toEqual({ line: TRAVEL_WORDS.gateFirst, button: { label: TRAVEL_WORDS.gate, to: 'hub' } });
    // At the gate already: the card says why, and the turnstiles are the way.
    expect(placeCard('grove', 'lobby', before)).toEqual({ line: TRAVEL_WORDS.gateFirst, button: null });
    // Through it: realm to realm, and back out.
    const inside = { ...before, gate: true };
    expect(placeCard('grove', 'market', inside)).toEqual({ line: null, button: { label: TRAVEL_WORDS.here, to: 'grove' } });
    expect(placeCard('homes', 'market', inside)).toEqual({ line: null, button: { label: TRAVEL_WORDS.here, to: 'homes' } });
    expect(placeCard('market', 'market', inside)).toEqual({ line: TRAVEL_WORDS.youAreHere, button: null });
  });

  it('has a card for every open place of the map', () => {
    for (const p of MAP_PLACES.filter((p) => !p.closed)) expect(placeCard(p.id, null, walked(['homes', 'lobby', 'hub', 'grove', 'market', 'arcade'], true)).button, p.id).not.toBeNull();
  });

  it('sparkles a place the first time this device shows it lit, and never again', () => {
    const kept = new Map<string, string>();
    const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
    expect(newlyLit(storage, ['homes', 'lobby'])).toEqual(['homes', 'lobby']);
    expect(newlyLit(storage, ['homes', 'lobby'])).toEqual([]);
    expect(newlyLit(storage, ['homes', 'lobby', 'hub'])).toEqual(['hub']);
    expect(JSON.parse(kept.get(MAP_LIT_KEY)!)).toEqual(['homes', 'lobby', 'hub']);
    // Where the browser keeps nothing, or keeps it badly, nothing sparkles.
    expect(newlyLit(null, ['grove'])).toEqual([]);
    expect(newlyLit({ getItem: () => { throw new Error('denied'); }, setItem: () => undefined }, ['grove'])).toEqual([]);
    kept.set(MAP_LIT_KEY, '{"not":"a list"}');
    expect(newlyLit(storage, ['grove'])).toEqual(['grove']);
  });
});
