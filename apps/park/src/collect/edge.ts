import type { CraftResult, Inventory, TzResult, Vec2 } from '@owl-park/shared';
import type { EdgeTransport } from '../net/edge';
import type { CollectionService, DropLink, DropsInfo, PickupResult } from './service';

/**
 * The collection kept by the room server. Inventory, crafting and the home time zone go over
 * HTTP with the visitor's pass; drops and pickups go over the room's WebSocket (the `DropLink`),
 * because only the room knows where the owl stands.
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
    const inv = await this.json<Inventory>('/api/collection');
    // `next` comes from the server clock; close enough for the panel (the HUD uses the room link's).
    return inv;
  }

  async drops(link: DropLink | null): Promise<DropsInfo> {
    if (!link) return { window: '', next: 0, drops: [], feathers: 0 };
    return link.drops();
  }

  async pickup(n: number, _room: string, _pos: Vec2, link: DropLink | null): Promise<PickupResult> {
    if (!link) return { ok: false, n, reason: 'offline' };
    return link.pickup(n);
  }

  async craft(variant: string): Promise<CraftResult> {
    return this.json<CraftResult>('/api/collection/craft', { method: 'POST', body: JSON.stringify({ variant }) });
  }

  async setTimeZone(tz: string): Promise<TzResult> {
    return this.json<TzResult>('/api/collection/tz', { method: 'POST', body: JSON.stringify({ tz }) });
  }
}
