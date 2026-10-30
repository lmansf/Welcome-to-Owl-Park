/**
 * Leaving the park (C43, approved 2026-10-22). There are three ways out:
 * - The spot in the hub where owls arrive from the turnstiles is also the way back. Walking off the
 *   floor's bottom edge there puts the owl in the lobby, outside the gate.
 * - "Leave the park" in the Menu does the same from any room inside the park, after asking.
 * - Travel home, on the Menu's map (OP-130; "Go home" in the Menu until then), goes straight to the
 *   owl's own nest, from anywhere.
 * Leaving changes nothing on a ticket: a day ticket's hours keep running from its first scan, and
 * coming back in is the gate's quick scan (C35).
 */
import { STREET_ROOM, isNestRoom } from './homes';

/** The front gate, outside the turnstiles: an owl that leaves the park is back here (every visit starts in its own nest, OP-105). */
export const LOBBY_ROOM = 'lobby';
/** Where an owl that left the park stands in the lobby: in front of the turnstiles, outside the gate. */
export const LEFT_PARK_SPAWN = 'from-hub';
/** The hub's way out: the doorway on its floor's bottom edge, where owls arrive from the turnstiles. */
export const WAY_OUT_DOOR = 'to-lobby';

/** What a visitor reads about leaving (Logan's words, C43). */
export const WAY_OUT_WORDS = {
  leave: 'Leave the park',
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

/**
 * The way to the park from a room outside it (OP-105): out of a nest by its door, along the street
 * to the lobby, and through the turnstiles. Every visit starts in the owl's own nest, so the way is
 * marked "To the park" all along: by a sign on the nest's door and at the street's end (the
 * turnstiles, under the carved owls' wings, are a sign of their own), and on the chip at the
 * screen's edge while the doorway is off screen. Null inside the park.
 */
export function parkwardDoor(roomId: string): string | null {
  if (isNestRoom(roomId)) return 'to-street';
  if (roomId === STREET_ROOM) return 'to-lobby';
  if (roomId === LOBBY_ROOM) return 'gate';
  return null;
}
