import type { ParkConfig } from '../config';
import { EdgeTransport } from './edge';
import { LocalTransport } from './local';
import type { ParkTransport } from './transport';

export type { AccountConfirm, AccountLink, AccountSend, Entry, LineLink, ParkTransport, RoomConnection, RoomHandlers, ConnectionStatus, ScanRefusal, ScanReply, TicketWallet, WalletEntry } from './transport';
export { OPEN_ENTRY } from './transport';

export function createTransport(cfg: ParkConfig): ParkTransport {
  if (cfg.transport === 'edge') return new EdgeTransport(cfg.edgeUrl, { keeper: cfg.keeper });
  return new LocalTransport();
}
