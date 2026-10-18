/**
 * Wire protocol shared by every transport (local tabs, Supabase Realtime,
 * or a future dedicated room server). Version 1 is presence: owls appear,
 * walk, change their look (colours and collectible wear), play emotes and
 * leave. Nothing here carries text written by visitors.
 */
import type { Wear } from './collectibles';

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
  /** Realm this owl pledged to today in the Realm Vote (a gold mark at its feet); cosmetic. */
  pledge?: string;
  /** Collectibles worn: one variant id per slot (head, face, neck, pet, fx). */
  wear?: Wear;
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

/** A player played one of its emotes (an emote id from the collectibles catalogue). */
export interface EmoteMessage {
  t: 'emote';
  id: string;
  e: string;
}

export type ParkMessage = HelloMessage | StateMessage | MoveMessage | ByeMessage | EmoteMessage;
