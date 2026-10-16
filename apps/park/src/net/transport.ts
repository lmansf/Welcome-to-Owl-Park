import type { ParkMessage, PlayerState, Walk } from '@owl-park/shared';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

/** What a room scene needs to hear from the network. */
export interface RoomHandlers {
  /** A peer appeared or refreshed its full state (position, look, current walk). */
  onPeerState(state: PlayerState): void;
  /** A peer started walking. */
  onPeerMove(id: string, walk: Walk): void;
  /** A peer left the room or timed out. */
  onPeerLeave(id: string): void;
  onStatus(status: ConnectionStatus): void;
}

export interface RoomConnection {
  /** Broadcast a message to everyone else in the room. */
  send(msg: ParkMessage): void;
  /** Update the full state others will see when they join later. */
  track(state: PlayerState): void;
  leave(): Promise<void>;
}

/**
 * A transport connects one owl to one room at a time. Implementations:
 *  - LocalTransport: BroadcastChannel between tabs of one browser (zero backend).
 *  - SupabaseTransport: Supabase Realtime Presence + Broadcast (shared over the internet).
 * A dedicated room server would be a third implementation of this same interface.
 */
export interface ParkTransport {
  readonly kind: 'local' | 'supabase';
  join(roomId: string, self: PlayerState, handlers: RoomHandlers): Promise<RoomConnection>;
}
