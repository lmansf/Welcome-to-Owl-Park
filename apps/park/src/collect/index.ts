import type { ParkConfig } from '../config';
import type { ParkTransport } from '../net';
import { EdgeTransport } from '../net/edge';
import { EdgeCollections } from './edge';
import { LocalCollections } from './local';
import { deviceTimeZone, type CollectionService } from './service';

export type { CollectionService, DropLink, DropsInfo, PickupResult } from './service';

/** The room server keeps collections; every other transport keeps them in this browser. */
export function createCollections(cfg: ParkConfig, transport: ParkTransport): CollectionService {
  if (transport instanceof EdgeTransport) return new EdgeCollections(transport);
  let storage: Storage | null = null;
  try {
    storage = globalThis.localStorage ?? null;
  } catch {
    storage = null;
  }
  return new LocalCollections(storage, { collector: cfg.collector, tz: cfg.tz ?? deviceTimeZone() });
}
