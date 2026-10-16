import type { RoomObject } from './RoomObject';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>;
  ASSETS: Fetcher;
  ROOM_SHARDING?: 'single' | 'room';
  GATE?: 'open' | 'ticket';
  PASS_SIGNING_KEY?: string;
  /** Optional JSON object of per-room caps, e.g. {"hub":80,"grove":40}. */
  ROOM_CAPS?: string;
}
