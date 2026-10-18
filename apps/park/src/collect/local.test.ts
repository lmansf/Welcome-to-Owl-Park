import { describe, expect, it } from 'vitest';
import { CRAFT_COST, STARTER_PACK } from '@owl-park/shared';
import { LocalCollections, localSeed, type KeyValueStorage } from './local';

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

// 10:00 in New York on 18 October 2026.
const at = Date.UTC(2026, 9, 18, 14, 0);

describe('LocalCollections', () => {
  it('derives a 32-byte seed without WebCrypto, stable per collector and window', () => {
    const a = localSeed('c_test', '2026-10-18:AM');
    expect(a).toHaveLength(32);
    expect(localSeed('c_test', '2026-10-18:AM')).toEqual(a);
    expect(localSeed('c_test', '2026-10-18:PM')).not.toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(8); // spread, not a repeated byte
  });

  it('keeps one collection per browser and remembers its id', () => {
    const storage = new MemoryStorage();
    const one = new LocalCollections(storage, { tz: 'America/New_York', now: () => at });
    const two = new LocalCollections(storage, { tz: 'America/New_York', now: () => at });
    expect(two.cid).toBe(one.cid);
    expect(new LocalCollections(storage, { collector: 'e2e-a', now: () => at }).cid).toBe('e2e-a');
  });

  it('starts with the starter pack and finds drops that persist across pages', async () => {
    const storage = new MemoryStorage();
    const page = new LocalCollections(storage, { collector: 'c_test', tz: 'America/New_York', now: () => at });
    expect((await page.inventory()).owned.sort()).toEqual([...STARTER_PACK].sort());
    const { drops, window } = await page.drops(null);
    expect(window).toBe('2026-10-18:AM');
    expect(drops.length).toBeGreaterThanOrEqual(2);
    const d = drops[0]!;
    expect(await page.pickup(d.n, d.room, { x: d.x + 500, y: d.y }, null)).toMatchObject({ ok: false, reason: 'far' });
    const res = await page.pickup(d.n, d.room, { x: d.x, y: d.y }, null);
    expect(res.ok).toBe(true);

    // Another tab of the same browser sees the same window, minus what was found.
    const other = new LocalCollections(storage, { collector: 'c_test', tz: 'America/New_York', now: () => at });
    expect((await other.drops(null)).drops.map((x) => x.n)).not.toContain(d.n);
    if (res.ok) expect((await other.inventory()).owned).toContain(res.variant);
  });

  it('crafts with feathers and refuses a second zone change within the cooldown', async () => {
    const storage = new MemoryStorage();
    const page = new LocalCollections(storage, { collector: 'c_test', tz: 'UTC', now: () => at });
    expect(await page.craft('crown~0')).toMatchObject({ ok: false, reason: 'feathers' });
    // Hand the collection some feathers the way a long run of duplicates would.
    const key = 'owl-park:collection:c_test';
    const snap = JSON.parse(storage.getItem(key)!);
    snap.collectors[0].feathers = CRAFT_COST.epic;
    storage.setItem(key, JSON.stringify(snap));
    expect(await page.craft('crown~0')).toEqual({ ok: true, variant: 'crown~0', feathers: 0 });
    expect(await page.setTimeZone('Europe/Paris')).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('survives storage that throws or holds garbage', async () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const page = new LocalCollections(broken, { collector: 'c_x', now: () => at });
    expect((await page.inventory()).owned.length).toBe(STARTER_PACK.length);
    const garbage = new MemoryStorage();
    garbage.setItem('owl-park:collection:c_y', '{"collectors":[{"cid":42}],"owned":[["c_y","nope~9"]],"drops":"x"}');
    const g = new LocalCollections(garbage, { collector: 'c_y', now: () => at });
    expect((await g.inventory()).owned.sort()).toEqual([...STARTER_PACK].sort());
  });
});
