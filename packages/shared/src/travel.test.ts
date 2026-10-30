import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { CLOSE } from './edge';
import { STREET_ROOM } from './homes';
import { GATE_ARRIVAL, TRAVEL_LANDINGS, TRAVEL_WORDS, canTravel, gateAfter, needsGate, parseTravelState, throughGate, travelAfter, visitedPlace } from './travel';
import { LEFT_PARK_SPAWN, LOBBY_ROOM } from './wayout';

describe('travel from the map (OP-130)', () => {
  it('counts the turnstiles’ way into the hub as walking through the gate, and nothing else', () => {
    const gate = ROOMS[LOBBY_ROOM]!.doors.find((d) => d.id === 'gate')!;
    expect(gate.to).toEqual(GATE_ARRIVAL);
    expect(throughGate('hub', 'default')).toBe(true);
    for (const spawn of ['from-grove', 'from-market', 'from-glass', undefined]) expect(throughGate('hub', spawn), String(spawn)).toBe(false);
    expect(throughGate('grove', 'default')).toBe(false);
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
