import { allVariants, type BuyResult, type GiftResult, type Inventory, type ShopView } from '@owl-park/shared';
import type { CollectionService } from './service';

type Listener = (inv: Inventory | null) => void;

/**
 * The visitor's collection as the page knows it: loaded once, kept current from quest rewards,
 * leaf-pile feathers and shop buys, refreshed from the service when in doubt. The HUD panels and
 * the room scene listen.
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

  /** The feather balance changed (a quest, a leaf pile, a duplicate); negative means unknown. */
  setFeathers(feathers: number): void {
    if (feathers < 0 || !this.inv || this.inv.feathers === feathers) return;
    this.set({ ...this.inv, feathers });
  }

  /** A collectible came in (a quest reward, a buy): add it, and take the new balance, without a round trip. */
  added(variant: string, feathers: number): void {
    if (!this.inv) return void this.refresh();
    const owned = this.inv.owned.includes(variant) ? this.inv.owned : [...this.inv.owned, variant];
    this.set({ ...this.inv, owned, feathers: feathers >= 0 ? feathers : this.inv.feathers });
  }

  shop(): Promise<ShopView> {
    return this.service.shop();
  }

  async buy(variant: string): Promise<BuyResult> {
    const res = await this.service.buy(variant);
    if (res.ok) this.added(variant, res.feathers);
    else this.setFeathers(res.feathers);
    return res;
  }

  async claimGift(): Promise<GiftResult> {
    const res = await this.service.claimGift();
    if (res.ok && !res.dup) this.added(res.variant, res.total);
    else this.setFeathers(res.total);
    return res;
  }
}
