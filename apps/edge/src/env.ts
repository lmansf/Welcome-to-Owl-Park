import type { RoomObject } from './RoomObject';
import type { VoteLedger } from './VoteLedger';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>;
  VOTES: DurableObjectNamespace<VoteLedger>;
  /** Time zone that defines the park's day for the Realm Vote (default America/New_York). */
  PARK_TZ?: string;
  /** "true" makes the vote tally readable by anyone; otherwise it needs the admin key. */
  VOTE_TALLY_PUBLIC?: string;
  /** Secret for admin routes (tally when private, month close). */
  ADMIN_KEY?: string;
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
