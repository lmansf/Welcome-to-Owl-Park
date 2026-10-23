/**
 * Leaving the park (C43, approved 2026-10-22). There are three ways out:
 * - The spot in the hub where owls arrive from the turnstiles is also the way back. Walking off the
 *   floor's bottom edge there puts the owl in the lobby, outside the gate.
 * - "Leave the park" in the Menu does the same from any room inside the park, after asking.
 * - "Go home" goes straight to the owl's own nest, from anywhere.
 * Leaving changes nothing on a ticket: a day ticket's hours keep running from its first scan, and
 * coming back in is the gate's quick scan (C35).
 */
import { STREET_ROOM, isNestRoom } from './homes';

/** Every visitor arrives in the lobby, and an owl that leaves the park is back there. */
export const LOBBY_ROOM = 'lobby';
/** Where an owl that left the park stands in the lobby: in front of the turnstiles, outside the gate. */
export const LEFT_PARK_SPAWN = 'from-hub';
/** The hub's way out: the doorway on its floor's bottom edge, where owls arrive from the turnstiles. */
export const WAY_OUT_DOOR = 'to-lobby';

/** What a visitor reads about leaving (Logan's words, C43). */
export const WAY_OUT_WORDS = {
  leave: 'Leave the park',
  home: 'Go home',
  /** The card that asks before "Leave the park" takes the owl out. */
  ask: 'Leave the park? Your ticket keeps running.',
  yes: 'Leave',
  no: 'Stay',
} as const;

/** Rooms outside the turnstiles, free to every pass: the lobby, the street of nests and the nests. */
export function isFreeRoom(roomId: string): boolean {
  return roomId === LOBBY_ROOM || roomId === STREET_ROOM || isNestRoom(roomId);
}

/** Inside the park, past the turnstiles: where "Leave the park" is offered. */
export function insidePark(roomId: string): boolean {
  return !isFreeRoom(roomId);
}
