import { isNestId, parseTravelState, type BuyResult, type FurnitureGiftResult, type GiftResult, type Inventory, type ShopView, type TravelState } from '@owl-park/shared';
import type { EdgeTransport } from '../net/edge';
import type { RoomConnection } from '../net/transport';
import type { ActivityLink, CollectionService, FurnitureGiftReply, NestLink, QuestLink } from './service';

/**
 * The collection kept by the room server. Inventory and the shop go over HTTP with the visitor's
 * pass; quests go over the room's WebSocket (the connection's `link`), because only the room
 * knows where the owl stands.
 */
export class EdgeCollections implements CollectionService {
  readonly mode = 'edge' as const;

  constructor(private readonly transport: EdgeTransport) {}

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.transport.api(path, init);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return (await res.json()) as T;
  }

  async inventory(): Promise<Inventory> {
    return this.json<Inventory>('/api/collection');
  }

  async shop(): Promise<ShopView> {
    return this.json<ShopView>('/api/shop');
  }

  async buy(variant: string): Promise<BuyResult> {
    return this.json<BuyResult>('/api/shop/buy', { method: 'POST', body: JSON.stringify({ variant }) });
  }

  async claimGift(): Promise<GiftResult> {
    return this.json<GiftResult>('/api/shop/gift', { method: 'POST' });
  }

  questLink(_room: string, conn: RoomConnection | null): QuestLink | null {
    // The transport routes the room's pushes to the scene's handlers itself.
    return conn?.link ?? null;
  }

  activityLink(_room: string, conn: RoomConnection | null): ActivityLink | null {
    return conn?.acts ?? null;
  }

  nestLink(_room: string, conn: RoomConnection | null): NestLink | null {
    return conn?.nests ?? null;
  }

  async claimFurnitureGift(): Promise<FurnitureGiftReply> {
    try {
      return await this.json<FurnitureGiftResult>('/api/nest/gift', { method: 'POST' });
    } catch {
      return { ok: false, reason: 'offline' };
    }
  }

  async homeNest(): Promise<string | null> {
    try {
      const { nestId } = await this.json<{ nestId: unknown }>('/api/nest');
      return isNestId(nestId) ? nestId : null;
    } catch {
      return null;
    }
  }

  async travel(): Promise<TravelState | null> {
    try {
      return parseTravelState(await this.json<unknown>('/api/travel'));
    } catch {
      return null;
    }
  }

  travelEntered(): void {
    // The room server keeps it, from the rooms it lets the owl into.
  }
}
