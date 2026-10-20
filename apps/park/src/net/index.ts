import type { ParkConfig } from '../config';
import { EdgeTransport } from './edge';
import { LocalTransport } from './local';
import { SupabaseTransport } from './supabase';
import type { ParkTransport } from './transport';

export type { Entry, ParkTransport, RoomConnection, RoomHandlers, ConnectionStatus, ScanRefusal, ScanReply, TicketWallet, WalletEntry } from './transport';
export { OPEN_ENTRY } from './transport';

export function createTransport(cfg: ParkConfig): ParkTransport {
  if (cfg.transport === 'edge') return new EdgeTransport(cfg.edgeUrl);
  if (cfg.transport === 'supabase') return new SupabaseTransport(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return new LocalTransport();
}
