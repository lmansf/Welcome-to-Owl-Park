import { TRAVEL_WORDS, doorTarget } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { describe, expect, it } from 'vitest';
import { MAP_LIT_KEY, MAP_PLACES, NEW_MAP_COURSE_PLACES, mapLayout, mapNote, mapPlaceOf, newlyLit, placeCard } from './menuTabs';

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

describe('the map on the new map (OP-282)', () => {
  const NEW_ROOMS = ['homes', 'lobby', 'm3-hall', 'glass', 'grove', 'market', 'hub', 'm3-under', 'arcade'];

  it("shows 'You are here' in every room of the new map, and in a nest", () => {
    for (const room of NEW_ROOMS) expect(mapPlaceOf(room, true, [], 3), room).toBe(room);
    expect(mapPlaceOf('nest-abc', true, [], 3)).toBe('nest');
    expect(mapPlaceOf('nest-abc', false, [], 3)).toBe('homes');
  });

  it('has a place for every room an owl can walk into on the new map, from the Treetop Commons on (OP-303)', () => {
    const seen = new Set(['lobby']);
    const todo = ['lobby'];
    while (todo.length > 0) {
      const room = ROOMS[todo.shift()!]!;
      for (const door of room.doors) {
        const to = doorTarget(door, 3)?.room;
        if (to && ROOMS[to] && !seen.has(to)) {
          seen.add(to);
          todo.push(to);
        }
      }
    }
    // The walk reaches the Great Hollow and each course beyond its Commons, so a new room can't go unmarked.
    expect(seen.has('m3-hall')).toBe(true);
    expect(seen.has('brush-1')).toBe(true);
    for (const room of seen) expect(mapPlaceOf(room, true, [], 3), room).not.toBeNull();
  });

  it("puts the ink-wash realm's course on the map, and each course's rooms at its realm (OP-303)", () => {
    const ink = mapLayout(3).places.find((p) => p.id === 'ink');
    expect(ink).toMatchObject({ name: 'Brushstroke Bridges', noTravel: true });
    expect(mapLayout(3).paths).toContainEqual(['m3-hall', 'ink']);
    for (const room of ['brush-1', 'brush-2', 'brush-falls', 'brush-3a', 'brush-3b']) expect(mapPlaceOf(room, true, [], 3), room).toBe('ink');
    expect(mapPlaceOf('canopy-hut', true, [], 3)).toBe('grove');
    expect(mapPlaceOf('circuit-3', true, [], 3)).toBe('market');
    for (const place of Object.values(NEW_MAP_COURSE_PLACES)) expect(mapLayout(3).places.some((p) => p.id === place), place).toBe(true);
    // The old map keeps its places: a course room there is no place.
    expect(mapPlaceOf('brush-1', true, [], 1)).toBeNull();
  });

  it('leaves the old map as it was (?newmap=0): the Great Hollow is not on it', () => {
    expect(mapPlaceOf('m3-hall', true, [], 1)).toBeNull();
    expect(mapPlaceOf('m3-hall', true, [], 2)).toBeNull();
    expect(mapLayout(1).places).toBe(MAP_PLACES);
    expect(mapPlaceOf('hub', true)).toBe('hub');
  });

  it('puts each place in its own cell, joins only places on the map, and offers travel only where it has a landing', () => {
    const { places, paths, cols, rows } = mapLayout(3);
    const cells = places.map((p) => `${p.col},${p.row}`);
    expect(new Set(cells).size).toBe(places.length);
    for (const p of places) expect(p.col < cols && p.row < rows, p.id).toBe(true);
    for (const [a, b] of paths) expect(places.some((p) => p.id === a) && places.some((p) => p.id === b), `${a}-${b}`).toBe(true);
    for (const p of places.filter((p) => !p.noTravel)) expect(placeCard(p.id, null, walked([], true), 3).button, p.id).not.toBeNull();
  });

  it('travels to every place of the new map from the start, not only the places walked into (OP-305)', () => {
    // The ink course is the one place without a landing: its realm has no room yet, the course is walked into from its Commons (OP-303).
    expect(mapLayout(3).places.filter((p) => p.noTravel).map((p) => p.id)).toEqual(['ink']);
    for (const room of NEW_ROOMS) expect(placeCard(room, 'nest', walked([], true), 3), room).toEqual({ line: null, button: { label: TRAVEL_WORDS.here, to: room } });
  });

  it('keeps the way into the park through the Treetop Commons turnstiles on the new map (OP-305)', () => {
    // Outside, not through yet: a place inside offers the Commons, and the Commons says the turnstiles are the way.
    expect(placeCard('grove', 'nest', walked([]), 3)).toEqual({ line: TRAVEL_WORDS.newGateFirst, button: { label: TRAVEL_WORDS.newGate, to: 'lobby' } });
    expect(placeCard('m3-hall', 'lobby', walked([]), 3)).toEqual({ line: TRAVEL_WORDS.newGateFirst, button: null });
    // The places outside the turnstiles travel without it.
    expect(placeCard('homes', 'grove', walked([]), 3)).toEqual({ line: null, button: { label: TRAVEL_WORDS.here, to: 'homes' } });
    expect(placeCard('lobby', 'nest', walked([]), 3)).toEqual({ line: null, button: { label: TRAVEL_WORDS.here, to: 'lobby' } });
  });
});

describe('the map note on the way in', () => {
  it('names the Treetop Commons on the new map and the front gate on today’s park', () => {
    expect(mapNote(3)).toContain('through the Treetop Commons');
    expect(mapNote(3)).not.toContain('front gate');
    expect(mapNote(1)).toBe(TRAVEL_WORDS.map);
    expect(mapNote(2)).toBe(TRAVEL_WORDS.map);
  });
});
