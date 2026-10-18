import type { CraftResult, DropView, Inventory, TzResult, Vec2 } from '@owl-park/shared';

/** This window's unclaimed drops, with `next` on this device's clock. */
export interface DropsInfo {
  window: string;
  next: number;
  drops: DropView[];
  feathers: number;
}

export type PickupResult = { ok: true; n: number; variant: string; dup: boolean; feathers: number } | { ok: false; n: number; reason: 'far' | 'gone' | 'busy' | 'offline' };

/** What an authoritative room connection offers for drops (the room server checks positions). */
export interface DropLink {
  drops(): Promise<DropsInfo>;
  pickup(n: number): Promise<PickupResult>;
}

/**
 * A visitor's collection. Two implementations share the rules in `@owl-park/shared`:
 *  - LocalCollections: zero backend, everything in this browser's localStorage (local and
 *    Supabase transports, development, the end-to-end tests);
 *  - EdgeCollections: the room server's Collections object (inventory over HTTP, drops and
 *    pickups over the room's WebSocket so the server can check where the owl stands).
 */
export interface CollectionService {
  readonly mode: 'local' | 'edge';
  inventory(): Promise<Inventory>;
  drops(link: DropLink | null): Promise<DropsInfo>;
  pickup(n: number, room: string, pos: Vec2, link: DropLink | null): Promise<PickupResult>;
  craft(variant: string): Promise<CraftResult>;
  setTimeZone(tz: string): Promise<TzResult>;
}

/** This device's IANA time zone, if the browser reports a usable one. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
