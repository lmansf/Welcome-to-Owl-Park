import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { CLOSE } from './edge';
import { doorTarget } from './doorways';
import { STREET_ROOM } from './homes';
import { GATE_ARRIVAL, NEW_GATE_ARRIVAL, NEW_MAP_LANDINGS, TREE_GATE_ARRIVAL, TRAVEL_LANDINGS, TRAVEL_WORDS, canTravel, gateAfter, needsGate, parseTravelState, throughGate, travelLanding, travelAfter, visitedPlace } from './travel';
import { LEFT_PARK_SPAWN, LOBBY_ROOM } from './wayout';

describe('travel from the map (OP-130)', () => {
  it('counts the turnstiles’ way into the hub as walking through the gate, and nothing else', () => {
    const gate = ROOMS[LOBBY_ROOM]!.doors.find((d) => d.id === 'gate')!;
    expect(gate.to).toEqual(GATE_ARRIVAL);
    expect(throughGate('hub', 'default')).toBe(true);
    for (const spawn of ['from-grove', 'from-market', 'from-glass', undefined]) expect(throughGate('hub', spawn), String(spawn)).toBe(false);
    expect(throughGate('grove', 'default')).toBe(false);
    // The tree's front gate (OP-128) lands the owl under the arch, on level 5's canopy.
    const treeGate = ROOMS['l5-street']!.doors.find((d) => d.id === 'gate')!;
    expect(treeGate.to).toEqual(TREE_GATE_ARRIVAL);
    expect(throughGate('l5', 'default')).toBe(true);
    for (const spawn of ['from-l4', 'east']) expect(throughGate('l5', spawn), spawn).toBe(false);
  });

  it('keeps the gate walked through inside the park, and forgets it outside', () => {
    expect(gateAfter('hub', 'default')).toBe(true);
    for (const [room, spawn] of [['hub', 'from-grove'], ['grove', 'default'], ['market', undefined], ['arcade', 'from-market'], ['glass', 'from-hub']] as const) expect(gateAfter(room, spawn), room).toBeNull();
    for (const room of [LOBBY_ROOM, STREET_ROOM, 'nest-k3x9q2ab']) expect(gateAfter(room, 'default'), room).toBe(false);
  });

  it('lands the owl at a spawn its room has, the great tree’s and the gate’s outside the turnstiles', () => {
    for (const [place, to] of Object.entries(TRAVEL_LANDINGS)) expect(ROOMS[to.room]?.spawns[to.spawn], place).toBeDefined();
    expect(TRAVEL_LANDINGS['hub']).toEqual({ room: LOBBY_ROOM, spawn: 'default' });
    expect(TRAVEL_LANDINGS['lobby']).toEqual(TRAVEL_LANDINGS['hub']);
    // Inside the park, where an owl walking in through the place's doorway arrives.
    const doorInto = (room: string) => Object.values(ROOMS).flatMap((r) => r.doors).find((d) => d.to?.room === room)?.to;
    for (const place of ['grove', 'market', 'arcade', 'glass']) expect(TRAVEL_LANDINGS[place], place).toEqual(doorInto(place));
  });

  it('travels to the owl’s own nest always, and anywhere else once walked into', () => {
    expect(canTravel('nest', [])).toBe(true);
    expect(canTravel('grove', [])).toBe(false);
    expect(canTravel('grove', ['grove'])).toBe(true);
    expect(canTravel('grove', new Set(['grove']))).toBe(true);
    expect(canTravel('closed-a', ['closed-a'])).toBe(false);
    expect(visitedPlace('grove')).toBe('grove');
    expect(visitedPlace('nest-k3x9q2ab')).toBeNull();
    expect(visitedPlace('no-such-room')).toBeNull();
  });

  it('needs the gate walked through only for places inside the park', () => {
    for (const place of ['grove', 'market', 'arcade', 'glass']) expect(needsGate(place), place).toBe(true);
    for (const place of ['hub', 'lobby', 'homes', 'nest']) expect(needsGate(place), place).toBe(false);
  });

  it('carries the state on through each room joined, as the room server does', () => {
    let s = { places: [] as string[], gate: false };
    s = travelAfter(s, 'nest-k3x9q2ab', 'mirror');
    expect(s).toEqual({ places: [], gate: false });
    s = travelAfter(s, STREET_ROOM, 'from-nest-0');
    s = travelAfter(s, LOBBY_ROOM, 'from-homes');
    s = travelAfter(s, 'hub', 'default');
    s = travelAfter(s, 'grove', 'default');
    expect(s).toEqual({ places: ['homes', 'lobby', 'hub', 'grove'], gate: true });
    // Back where it has been: nothing new, and the gate still walked through inside the park.
    const again = travelAfter(s, 'hub', 'from-grove');
    expect(again).toEqual(s);
    expect(again.places).toBe(s.places);
    // Out of the park again: the gate is forgotten, the places kept.
    expect(travelAfter(s, LOBBY_ROOM, LEFT_PARK_SPAWN)).toEqual({ places: s.places, gate: false });
  });

  it('reads a told state, keeping only the places of the map', () => {
    expect(parseTravelState({ places: ['grove', 'nowhere', 3, 'hub'], gate: true })).toEqual({ places: ['grove', 'hub'], gate: true });
    for (const bad of [null, 'x', { places: 'grove', gate: true }, { places: [], gate: 'yes' }, {}]) expect(parseTravelState(bad), JSON.stringify(bad)).toBeNull();
  });

  it('turns a travel away with its own close code, and says why in plain words', () => {
    expect(CLOSE.NOT_THROUGH_GATE).toBe(4015);
    expect(TRAVEL_WORDS.gateFirst).toBe('Enter the park through the gate first.');
    expect(TRAVEL_WORDS.hold).toBe('Hold to travel.');
  });
});

describe('travel on the new map (OP-305)', () => {
  it('counts the Treetop Commons turnstiles into the Great Hollow as walking through the gate', () => {
    const gate = ROOMS[LOBBY_ROOM]!.doors.find((d) => d.id === 'gate')!;
    expect(doorTarget(gate, 3)).toEqual(NEW_GATE_ARRIVAL);
    expect(throughGate('m3-hall', 'from-lobby')).toBe(true);
    expect(gateAfter('m3-hall', 'from-lobby')).toBe(true);
    // Coming back up from a Commons, or travelling in, is not the turnstiles.
    for (const spawn of ['default', 'from-glass', undefined]) expect(throughGate('m3-hall', spawn), String(spawn)).toBe(false);
  });

  it('lands the owl at a spawn its room has, for every place on the new map', () => {
    for (const [place, to] of Object.entries(NEW_MAP_LANDINGS)) expect(ROOMS[to.room]?.spawns[to.spawn], place).toBeDefined();
    expect(travelLanding('hub', 3)).toEqual({ room: 'hub', spawn: 'default' });
    // Today's park keeps its own: the great tree lands at the gate, outside the turnstiles.
    expect(travelLanding('hub')).toEqual(TRAVEL_LANDINGS['hub']);
    expect(travelLanding('m3-hall')).toBeUndefined();
  });

  it('travels to every place from the start, and into the park only once through the turnstiles', () => {
    for (const place of Object.keys(NEW_MAP_LANDINGS)) expect(canTravel(place, [], 3), place).toBe(true);
    expect(canTravel('no-such-place', [], 3)).toBe(false);
    expect(canTravel('grove', [])).toBe(false);
    for (const place of ['m3-hall', 'glass', 'grove', 'market', 'hub', 'm3-under', 'arcade']) expect(needsGate(place, 3), place).toBe(true);
    for (const place of ['lobby', 'homes', 'nest']) expect(needsGate(place, 3), place).toBe(false);
  });

  it('keeps the new map’s places in a told state and as places walked into', () => {
    expect(visitedPlace('m3-hall')).toBe('m3-hall');
    expect(parseTravelState({ places: ['m3-under', 'hub'], gate: false })).toEqual({ places: ['m3-under', 'hub'], gate: false });
  });
});
