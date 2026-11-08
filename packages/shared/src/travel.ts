/**
 * Fast travel from the Menu's map (OP-130). Every place of the map can be travelled to from the start
 * (the owner's "lets have the whole map unlocked all the time for players", Nov 8): no place waits to
 * be walked into first, and travel lands the owl where walking in would have.
 *
 * Every way into the park proper is through the front gate (Logan, 2026-10-27): the great tree's
 * place travels to the gate, outside the turnstiles, and a place inside the park can be travelled to
 * only while the owl has walked through the turnstiles since it was last outside. Going home, walking
 * out, and every new visit (each starts in the owl's own nest) put it outside again. The room server
 * keeps whether it has walked through and turns a travel away without it; the page only shows it.
 */
import { STREET_ROOM, isNestRoom } from './homes';
import { LOBBY_ROOM, insidePark } from './wayout';

/** Through the turnstiles an owl lands in the hub at its default spawn: the one way the gate is walked through. */
export const GATE_ARRIVAL = { room: 'hub', spawn: 'default' } as const;

/** Through the turnstiles on the new map (OP-282) an owl comes down the knothole into the Great Hollow. */
export const HALL_GATE_ARRIVAL = { room: 'm3-hall', spawn: 'from-lobby' } as const;

/** Through the tree's front gate (OP-158) an owl lands in the canopy under its entrance arch, at its default spawn. */
export const TREE_GATE_ARRIVAL = { room: 'l5', spawn: 'default' } as const;

/** Whether joining a room at this spawn is the owl walking through a front gate: today's park's, the new map's or the tree's. */
export function throughGate(room: string, spawn: string | undefined): boolean {
  return [GATE_ARRIVAL, HALL_GATE_ARRIVAL, TREE_GATE_ARRIVAL].some((g) => room === g.room && spawn === g.spawn);
}

/**
 * How joining a room at a spawn changes whether the owl has walked through the gate: true through
 * the turnstiles, false outside the park again (the gate, the nests' street, any nest), null no change.
 */
export function gateAfter(room: string, spawn: string | undefined): boolean | null {
  if (throughGate(room, spawn)) return true;
  return insidePark(room) ? null : false;
}

/** Where travel puts the owl: a room and its spawn. */
export interface Landing {
  room: string;
  spawn: string;
}

/**
 * Where travel to each place of the map lands the owl (the owl's own nest, `nest`, is found when it
 * travels, before its mirror): the great tree and the gate both outside the turnstiles, near them;
 * every other place where an owl walking in through its doorway arrives.
 */
export const TRAVEL_LANDINGS: Readonly<Record<string, Landing>> = {
  hub: { room: LOBBY_ROOM, spawn: 'default' },
  lobby: { room: LOBBY_ROOM, spawn: 'default' },
  homes: { room: STREET_ROOM, spawn: 'default' },
  grove: { room: 'grove', spawn: 'default' },
  market: { room: 'market', spawn: 'default' },
  arcade: { room: 'arcade', spawn: 'from-market' },
  glass: { room: 'glass', spawn: 'from-hub' },
  // The new map's own places (OP-282): the Great Hollow at the foot of the knothole, the root stair at the foot of the hatch.
  'm3-hall': { room: 'm3-hall', spawn: 'from-lobby' },
  'm3-under': { room: 'm3-under', spawn: 'from-l1' },
};

/**
 * Where travel lands on the new map (3) where it differs: there the great tree's place is the Party
 * Grove, out of the trunk's door, and travel puts the owl in it rather than outside the turnstiles.
 */
const NEW_MAP_LANDINGS: Readonly<Record<string, Landing>> = {
  hub: { room: 'hub', spawn: 'default' },
};

/** Where travel to a place lands an owl walking map `walking`, or undefined for no such place (the nest is found when it travels). */
export function travelLanding(place: string, walking = 1): Landing | undefined {
  return (walking === 3 ? NEW_MAP_LANDINGS[place] : undefined) ?? TRAVEL_LANDINGS[place];
}

/** The place of the map a room counts as for travel once walked into; null for a nest (the owl's own is always there to go to). */
export function visitedPlace(room: string): string | null {
  return isNestRoom(room) ? null : room in TRAVEL_LANDINGS ? room : null;
}

/** Whether a place can be travelled to: the owl's own nest and every place of the map with a landing, walked into or not. */
export function canTravel(place: string): boolean {
  return place === 'nest' || place in TRAVEL_LANDINGS;
}

/** Whether travel to a place needs the owl to have walked through the gate since it was last outside. */
export function needsGate(place: string, walking = 1): boolean {
  const to = travelLanding(place, walking);
  return to !== undefined && insidePark(to.room);
}

/** What the room server tells a page about its owl's travel: the places it has walked into, and whether it has walked through the gate. */
export interface TravelState {
  places: string[];
  gate: boolean;
}

/**
 * The travel state once the owl has joined a room at a spawn, by the rules the room server keeps:
 * the place walked into added (in the order first walked into), and the gate as gateAfter says. A
 * browser with no room server keeps its own this way; a page with one puts the room it is in on top
 * of what the server last said, which changes nothing once the server has it too.
 */
export function travelAfter(state: TravelState, room: string, spawn: string | undefined): TravelState {
  const place = visitedPlace(room);
  return {
    places: place && !state.places.includes(place) ? [...state.places, place] : state.places,
    gate: gateAfter(room, spawn) ?? state.gate,
  };
}

/** A travel state as told (the room server's answer, or this browser's own copy), or null when it is not one. */
export function parseTravelState(v: unknown): TravelState | null {
  if (typeof v !== 'object' || v === null) return null;
  const { places, gate } = v as { places?: unknown; gate?: unknown };
  if (!Array.isArray(places) || typeof gate !== 'boolean') return null;
  return { places: places.filter((p): p is string => typeof p === 'string' && p in TRAVEL_LANDINGS), gate };
}

/** Why the owl cannot travel to a place just now: already there, not a place travel goes to, not through the gate, or busy (a climb, a game, the turnstiles). */
export type TravelRefusal = 'here' | 'not-yet' | 'gate' | 'busy';

/** What a visitor reads about travel (OP-130). */
export const TRAVEL_WORDS = {
  here: 'Travel here',
  home: 'Travel home',
  gate: 'Travel to the gate',
  hold: 'Hold to travel.',
  youAreHere: 'You are here.',
  atGate: 'You are at the gate: walk through the turnstiles to go in.',
  throughGate: 'Into the park is always through the front gate.',
  gateFirst: 'Enter the park through the gate first.',
  notYet: 'Travel does not go there yet.',
  busy: 'Finish what you are doing, then travel.',
  map: 'Tap a place to travel there. Into the park is always through the front gate.',
  /** The same on the new map, whose way in is the Treetop Commons. */
  newMap: 'Tap a place to travel there. Into the park is always through the Treetop Commons.',
} as const;
