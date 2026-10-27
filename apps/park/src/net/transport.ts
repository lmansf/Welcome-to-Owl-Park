import type { FeedbackDraft, LineStatus, OwlLook, ParkMessage, PlayerState, RealmsSettings, Vec2, Walk } from '@owl-park/shared';
import type { ActivityLink, ActivityPushes, NestLink, NestPushes, QuestLink, QuestPushes } from '../collect/service';
import type { TicketLink } from './ticketLinks';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

/** What a room scene needs to hear from the network (quest, activity and nest pushes come only from the room server). */
export interface RoomHandlers extends QuestPushes, ActivityPushes, NestPushes {
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
  /** A peer said a prewritten phrase (its number in the phrase list). */
  onPeerSay?(id: string, phrase: number): void;
  /** A peer's owl fell asleep or woke (OP-126). */
  onPeerRest?(id: string, asleep: boolean): void;
  /** The park has a line (OP-075) and this owl has not come through it: it waits on the home screen. */
  onQueued?(): void;
  /** The busy ribbon's words (OP-075), or null when it goes off. */
  onNotice?(words: string | null): void;
  /** The realms switch (the stained-glass climb): which gated realms are open, whether the portal is live, the night. */
  onRealms?(realms: RealmsSettings): void;
  /** The realm this owl is in (or was entering) is closed: the page walks it back to the hub and shows the phrase. */
  onRealmClosed?(sign: string): void;
}

export interface RoomConnection {
  /** Broadcast a message to everyone else in the room. */
  send(msg: ParkMessage): void;
  /** Update the full state others will see when they join later. */
  track(state: PlayerState): void;
  leave(): Promise<void>;
  /** Quests, talks and uses checked by an authoritative server (the room server only). */
  link?: QuestLink;
  /** The room's activities, run by the same server. */
  acts?: ActivityLink;
  /** The nests on the street and in a nest, kept by the same server. */
  nests?: NestLink;
  /** Drop the socket as a bad network would (the room server only); it reconnects on its own. For the browser tests. */
  drop?(): void;
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
  /** Send the visitor's feedback to the park's keepers; only the room server keeps it (net/feedback.ts). */
  feedback?(draft: FeedbackDraft): Promise<Response>;
  /**
   * What the front gate needs: whether the park takes tickets yet, and whether this visitor's pass
   * goes through. Transports without a server have an open gate.
   */
  entry?(): Promise<Entry>;
  /** The ticket wallet on this device (C35); only the room server keeps tickets. */
  readonly tickets?: TicketWallet;
  /** The line in front of the park on busy nights (OP-075); only the room server has one. */
  readonly line?: LineLink;
}

/** The line in front of the park (OP-075), as the home screen uses it. */
export interface LineLink {
  /** A place in the line, or go straight in (no line, or this browser was in the park lately). */
  join(): Promise<LineStatus>;
  /** Where this browser's number stands; a called number takes its turn. */
  poll(n: number): Promise<LineStatus>;
  /** The busy ribbon's words now, null while it is off. */
  notice(): Promise<string | null>;
}

/** A ticket in this device's wallet, as the server shows it. */
export interface WalletEntry {
  /** Visual ID, `OWL-XXXX-XXXX`. */
  id: string;
  kind: 'day' | 'night' | 'annual' | 'event' | 'opening-night';
  status: 'held' | 'unused' | 'active' | 'used' | 'expired' | 'revoked';
  /** Time left once it is running, or until an unused ticket expires. */
  msLeft: number | null;
  firstScan: number | null;
  /** Windowed tickets (an event, opening night): their window. */
  validFrom: number | null;
  validUntil: number | null;
  /** Today's Realm Vote: free, spent, or none while the ticket is not running. */
  voteToday: 'ready' | 'used' | 'none';
  /** An Opening Night Ticket's half-price pass (C42, OP-062): ready to claim tonight, or claimed. */
  freePass?: 'ready' | 'claimed';
}

/** Why the gate did not take a ticket (`none`: this device holds no ticket it could scan). */
export type ScanRefusal = 'none' | 'held' | 'used' | 'expired' | 'revoked' | 'not-yet' | 'no-length' | 'unknown' | 'elsewhere' | 'offline';

export type ScanReply = { ok: true; id: string; kind: WalletEntry['kind']; started: boolean; validUntil: number | null } | { ok: false; reason: ScanRefusal; id?: string; kind?: WalletEntry['kind'] };

export interface TicketWallet {
  wallet(): Promise<WalletEntry[]>;
  /** An emailed claim link or a share link: its tickets move onto this device. Null for a link that no longer works. */
  open(link: TicketLink): Promise<WalletEntry[] | null>;
  /** A share secret for one ticket this device holds; null when it cannot be passed on. */
  share(id: string): Promise<string | null>;
  /** The gate scans a ticket (the server picks one when none is named); a ticket that goes through admits this visitor. */
  scan(id?: string): Promise<ScanReply>;
  /** Whether opening night is on (C42), as the last look at the wallet said. */
  openingNight(): boolean;
  /** Opening night's half-price pass for an Opening Night Ticket on this device: the store's cart link; null when there is none to have. */
  freePass(id: string): Promise<string | null>;
}

/** The front gate: `open` lets everyone through; `ticket` lets through admitted passes only. */
export interface Entry {
  gate: 'open' | 'ticket';
  admitted: boolean;
}

export const OPEN_ENTRY: Entry = { gate: 'open', admitted: true };
