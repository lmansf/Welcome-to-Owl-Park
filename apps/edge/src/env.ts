import type { RoomObject } from './RoomObject';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>;
  ASSETS: Fetcher;
  ROOM_SHARDING?: 'single' | 'room';
  GATE?: 'open' | 'ticket';
  PASS_SIGNING_KEY?: string;
  /** Optional JSON object of per-room caps, e.g. {"hub":80,"grove":40}. */
  ROOM_CAPS?: string;
  /** Sockets allowed per client address per object (default 8). */
  MAX_SOCKETS_PER_IP?: string;
  /** Local load testing only: trust X-Forwarded-For as the client address. Never set in production. */
  TRUST_FORWARDED_FOR?: string;
}
