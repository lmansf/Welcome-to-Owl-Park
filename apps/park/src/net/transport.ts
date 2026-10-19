import type { OwlLook, ParkMessage, PlayerState, Vec2, Walk } from '@owl-park/shared';
import type { QuestLink, QuestPushes } from '../collect/service';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

/** What a room scene needs to hear from the network (quest pushes come only from the room server). */
export interface RoomHandlers extends QuestPushes {
  /** A peer appeared or refreshed its full state (position, look, current walk). */
  onPeerState(state: PlayerState): void;
  /** A peer started walking. */
  onPeerMove(id: string, walk: Walk): void;
  /** A peer left the room or timed out. */
  onPeerLeave(id: string): void;
  onStatus(status: ConnectionStatus): void;
  /** Authoritative transports place the local owl where the server put it. */
  onSelf?(pos: Vec2): void;
  /** The server corrected one of our walks (clamped, or started from a different point). */
  onSelfWalk?(walk: Walk): void;
  onPeerLook?(id: string, look: OwlLook): void;
  /** Park-wide room populations, when the transport knows them. */
  onCounts?(rooms: Record<string, number>): void;
  /** The room we tried to enter is full. */
  onFull?(room: string): void;
  /** A peer played an emote. */
  onPeerEmote?(id: string, emote: string): void;
}

export interface RoomConnection {
  /** Broadcast a message to everyone else in the room. */
  send(msg: ParkMessage): void;
  /** Update the full state others will see when they join later. */
  track(state: PlayerState): void;
  leave(): Promise<void>;
  /** Quests, talks and uses checked by an authoritative server (the room server only). */
  link?: QuestLink;
}

/**
 * A transport connects one owl to one room at a time. Implementations:
 *  - LocalTransport: BroadcastChannel between tabs of one browser (zero backend).
 *  - SupabaseTransport: Supabase Realtime Presence + Broadcast (shared over the internet, no server code).
 *  - EdgeTransport: the authoritative room server (Cloudflare Durable Object) over one WebSocket.
 */
export interface ParkTransport {
  readonly kind: 'local' | 'supabase' | 'edge';
  join(roomId: string, self: PlayerState, handlers: RoomHandlers): Promise<RoomConnection>;
  /** Cast a Realm Vote as this visitor; only transports with an authenticated server offer it. */
  vote?(realm: string): Promise<Response>;
}
