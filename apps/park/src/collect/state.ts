import { allVariants, type CraftResult, type Inventory, type TzResult } from '@owl-park/shared';
import type { CollectionService } from './service';

type Listener = (inv: Inventory | null) => void;

/**
 * The visitor's collection as the page knows it: loaded once, kept current from finds and
 * crafts, refreshed from the service when in doubt. The HUD panel and the room scene listen.
 */
export class CollectionState {
  inv: Inventory | null = null;
  private owned = new Set<string>();
  private readonly listeners = new Set<Listener>();
  private loading: Promise<void> | null = null;

  constructor(readonly service: CollectionService) {}

  get total(): number {
    return allVariants().length;
  }

  get count(): number {
    return this.owned.size;
  }

  owns(variant: string): boolean {
    return this.owned.has(variant);
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private set(inv: Inventory | null): void {
    this.inv = inv;
    this.owned = new Set(inv?.owned ?? []);
    for (const cb of this.listeners) cb(inv);
  }

  /** Load (or reload) from the service; concurrent calls share one request. */
  refresh(): Promise<void> {
    if (!this.loading) {
      this.loading = this.service
        .inventory()
        .then((inv) => this.set(inv))
        .catch(() => undefined)
        .finally(() => (this.loading = null));
    }
    return this.loading;
  }

  /** A find came in: add it (or credit the duplicate's feathers) without a round trip. */
  found(variant: string, feathers: number): void {
    if (!this.inv) return void this.refresh();
    const owned = this.inv.owned.includes(variant) ? this.inv.owned : [...this.inv.owned, variant];
    this.set({ ...this.inv, owned, feathers });
  }

  async craft(variant: string): Promise<CraftResult> {
    const res = await this.service.craft(variant);
    if (res.ok && this.inv) this.set({ ...this.inv, owned: [...this.inv.owned, variant], feathers: res.feathers });
    else if (this.inv) this.set({ ...this.inv, feathers: res.feathers });
    return res;
  }

  async setTimeZone(tz: string): Promise<TzResult> {
    const res = await this.service.setTimeZone(tz);
    await this.refresh();
    return res;
  }
}
