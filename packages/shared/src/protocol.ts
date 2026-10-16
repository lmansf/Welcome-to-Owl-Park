/**
 * Wire protocol shared by every transport (local tabs, Supabase Realtime,
 * or a future dedicated room server). Version 1 is presence only: owls
 * appear, walk, and leave. Nothing here carries text written by visitors.
 */
export const PROTOCOL_VERSION = 1;

export interface Vec2 {
  x: number;
  y: number;
}

/** Colours are CSS hex strings like "#C9A227". */
export interface OwlLook {
  body: string;
  belly: string;
  accent: string;
}

/**
 * A walk is fully described by its endpoints and start time, so other clients
 * can animate it without receiving per-frame positions.
 */
export interface Walk {
  from: Vec2;
  to: Vec2;
  /** Unix epoch milliseconds on the sender's clock. */
  startedAt: number;
}

export interface PlayerState {
  id: string;
  look: OwlLook;
  /** Where the owl is standing (or where its current walk started). */
  pos: Vec2;
  /** The walk in progress, if any. */
  walk: Walk | null;
  /** Protocol version the sender speaks. */
  v: number;
}

/** A newcomer announces itself; everyone already present replies with `state`. */
export interface HelloMessage {
  t: 'hello';
  state: PlayerState;
}

/** Full state of one player. Sent in reply to `hello` and as a periodic heartbeat. */
export interface StateMessage {
  t: 'state';
  state: PlayerState;
}

/** A player started walking. */
export interface MoveMessage {
  t: 'move';
  id: string;
  walk: Walk;
}

/** A player left the room (closing the tab, or walking through a door). */
export interface ByeMessage {
  t: 'bye';
  id: string;
}

export type ParkMessage = HelloMessage | StateMessage | MoveMessage | ByeMessage;

export function isParkMessage(value: unknown): value is ParkMessage {
  if (!value || typeof value !== 'object') return false;
  const t = (value as { t?: unknown }).t;
  return t === 'hello' || t === 'state' || t === 'move' || t === 'bye';
}
