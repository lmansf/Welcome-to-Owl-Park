import type { ParkConfig } from '../config';
import { LocalTransport } from './local';
import { SupabaseTransport } from './supabase';
import type { ParkTransport } from './transport';

export type { ParkTransport, RoomConnection, RoomHandlers, ConnectionStatus } from './transport';

export function createTransport(cfg: ParkConfig): ParkTransport {
  if (cfg.transport === 'supabase') return new SupabaseTransport(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return new LocalTransport();
}
