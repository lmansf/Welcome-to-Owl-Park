import { CollectionBook, MemoryCollectionStore, allSpots, normalizeTimeZone, type CraftResult, type Inventory, type TzResult, type Vec2 } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import type { CollectionService, DropLink, DropsInfo, PickupResult } from './service';

const COLLECTOR_KEY = 'owl-park:local-collector';
const STORE_PREFIX = 'owl-park:collection:';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The seed of a window's drops in local mode. Not a secret (there is no server to keep one):
 * a fast 128-bit string hash spread over 32 bytes, which also works where WebCrypto does not
 * (a phone opening the dev server over the LAN is not a secure context).
 */
export function localSeed(cid: string, windowKey: string): Uint8Array {
  const str = `owl-park-local|${cid}|${windowKey}`;
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  const out = new Uint8Array(32);
  let s = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  for (let i = 0; i < 32; i += 4) {
    // xorshift128 to spread the four words over 32 bytes
    let t = s[3]!;
    const x = s[0]!;
    s = [t, x, s[1]!, s[2]!];
    t ^= t << 11;
    t ^= t >>> 8;
    const w = (t ^ x ^ (x >>> 19)) >>> 0;
    s[0] = w;
    out[i] = w & 0xff;
    out[i + 1] = (w >>> 8) & 0xff;
    out[i + 2] = (w >>> 16) & 0xff;
    out[i + 3] = (w >>> 24) & 0xff;
  }
  return out;
}

function randomCid(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const c = globalThis.crypto;
  const bytes = c && typeof c.getRandomValues === 'function' ? c.getRandomValues(new Uint8Array(12)) : Uint8Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
  let s = 'c_';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

/**
 * The whole collection in this browser (no server). Same rules and numbers as the room server;
 * positions are trusted because there is nobody to cheat. Tabs share one collection: the store
 * is re-read before and written after every operation.
 */
export class LocalCollections implements CollectionService {
  readonly mode = 'local' as const;
  readonly cid: string;
  private readonly tz: string;
  private readonly spots = allSpots(ROOMS);

  constructor(
    private readonly storage: KeyValueStorage | null,
    opts: { collector?: string | undefined; tz?: string | undefined; now?: () => number } = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.tz = normalizeTimeZone(opts.tz);
    let cid = opts.collector && /^[A-Za-z0-9_-]{1,32}$/.test(opts.collector) ? opts.collector : null;
    if (!cid) {
      try {
        cid = storage?.getItem(COLLECTOR_KEY) ?? null;
      } catch {
        cid = null;
      }
    }
    if (!cid) {
      cid = randomCid();
      try {
        storage?.setItem(COLLECTOR_KEY, cid);
      } catch {
        /* private mode: this page keeps its own collection */
      }
    }
    this.cid = cid;
  }

  private readonly now: () => number;
  private memory: MemoryCollectionStore | null = null;

  /** Run against the latest stored collection, then store it again. */
  private use<T>(fn: (book: CollectionBook) => T): T {
    let store: MemoryCollectionStore;
    try {
      const raw = this.storage?.getItem(STORE_PREFIX + this.cid) ?? null;
      store = raw ? MemoryCollectionStore.from(JSON.parse(raw)) : (this.memory ?? new MemoryCollectionStore());
    } catch {
      store = this.memory ?? new MemoryCollectionStore();
    }
    const out = fn(new CollectionBook(store, this.spots));
    this.memory = store;
    try {
      this.storage?.setItem(STORE_PREFIX + this.cid, JSON.stringify(store.snapshot()));
    } catch {
      /* storage full or unavailable: the collection lives for this page only */
    }
    return out;
  }

  async inventory(): Promise<Inventory> {
    return this.use((book) => book.inventory(this.cid, this.tz, this.now()));
  }

  async drops(_link: DropLink | null): Promise<DropsInfo> {
    return this.use((book) => {
      const now = this.now();
      const cur = book.current(this.cid, this.tz, now);
      const rows = cur.rows ?? book.storeDrops(this.cid, cur.window, localSeed(this.cid, cur.window));
      return book.info(book.ensure(this.cid, this.tz, now), cur.window, cur.next, rows);
    });
  }

  async pickup(n: number, room: string, pos: Vec2, _link: DropLink | null): Promise<PickupResult> {
    return this.use((book) => book.claim(this.cid, this.tz, n, room, pos, this.now()));
  }

  async craft(variant: string): Promise<CraftResult> {
    return this.use((book) => book.craft(this.cid, this.tz, variant, this.now()));
  }

  async setTimeZone(tz: string): Promise<TzResult> {
    return this.use((book) => book.setTimeZone(this.cid, this.tz, tz, this.now()));
  }
}
