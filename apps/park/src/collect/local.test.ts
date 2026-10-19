import { describe, expect, it } from 'vitest';
import { LEAF_FEATHERS_PER_DAY, STARTER_PACK, USE_COOLDOWN_MS, getNpc, shopRotation, type QuestBoard, type Vec2 } from '@owl-park/shared';
import { LocalCollections, type KeyValueStorage } from './local';
import type { QuestPushes } from './service';

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

/** 2026-10-19 12:00 Eastern, a Monday. */
const at = Date.UTC(2026, 9, 19, 16, 0);

function rig(collector = 'c_test', clock = { now: at }) {
  const storage = new MemoryStorage();
  const page = new LocalCollections(storage, { collector, tz: 'America/New_York', now: () => clock.now, random: () => 0.1 });
  return { storage, page, clock };
}

/** A quest link in `room` with the owl standing at `pos` (movable), recording what is pushed. */
function linkIn(page: LocalCollections, room: string, pos: Vec2) {
  const pushed: { boards: QuestBoard[]; used: Array<[string, string | null, number]>; objects: Array<Record<string, number>> } = { boards: [], used: [], objects: [] };
  const pushes: QuestPushes = {
    onQuests: (board) => pushed.boards.push(board),
    onUsed: (id, by, until) => pushed.used.push([id, by, until]),
    onObjects: (until) => pushed.objects.push(until),
  };
  const where = { ...pos };
  return { link: page.questLink(room, null, pushes, () => where), where, pushed };
}

describe('LocalCollections', () => {
  it('keeps one collection per browser and remembers its id', () => {
    const storage = new MemoryStorage();
    const one = new LocalCollections(storage, { tz: 'America/New_York', now: () => at });
    const two = new LocalCollections(storage, { tz: 'America/New_York', now: () => at });
    expect(two.cid).toBe(one.cid);
    expect(new LocalCollections(storage, { collector: 'e2e-a', now: () => at }).cid).toBe('e2e-a');
  });

  it('starts with the starter pack, and talks only to an NPC owl standing close', async () => {
    const { page } = rig();
    expect((await page.inventory()).owned.sort()).toEqual([...STARTER_PACK].sort());
    const bramble = getNpc('bramble')!;
    const { link, where } = linkIn(page, 'hub', { x: bramble.pos.x + 400, y: bramble.pos.y });
    expect(await link.talk('bramble')).toMatchObject({ ok: false, reason: 'far' });
    expect(await link.talk('hazel')).toMatchObject({ ok: false, reason: 'unknown' }); // she stands in the clearing
    where.x = bramble.pos.x + 60;
    const res = await link.talk('bramble');
    expect(res.ok).toBe(true);
    expect(res.board?.offers['bramble']?.map((o) => o.id)).toContain('story-welcome');
  });

  it('runs the welcome quest across rooms, counting visits and emotes, and pays on hand-in', async () => {
    const { page, storage } = rig();
    const npc = (id: string) => getNpc(id)!.pos;
    const hub = linkIn(page, 'hub', npc('bramble'));
    expect((await hub.link.accept('story-welcome')).ok).toBe(true);
    hub.where.x = npc('pip').x;
    hub.where.y = npc('pip').y;
    expect((await hub.link.talk('pip')).updates[0]).toMatchObject({ quest: 'story-welcome', count: 1, need: 1 });

    const grove = linkIn(page, 'grove', { x: 900, y: 835 });
    grove.link.note({ kind: 'visit', room: 'grove' });
    expect(grove.pushed.boards.at(-1)?.active[0]?.step).toBe(2);
    const flop = await grove.link.use('grove-leaves-1');
    expect(flop).toMatchObject({ ok: true, updates: [{ quest: 'story-welcome', count: 1 }] });
    expect(flop.board?.active[0]?.step).toBe(3);

    const market = linkIn(page, 'market', npc('nova'));
    await market.link.talk('nova');
    const back = linkIn(page, 'hub', npc('bramble'));
    back.link.note({ kind: 'emote', emote: 'hoot', room: 'hub', near: ['bramble'] });
    expect(back.pushed.boards.at(-1)?.active[0]?.ready).toBe(true);
    const res = await back.link.handIn('story-welcome');
    expect(res).toMatchObject({ ok: true, award: { variant: 'leaf-crown~0', dup: false } });

    // Another tab of the same browser sees the same collection.
    const other = new LocalCollections(storage, { collector: 'c_test', now: () => at });
    expect((await other.inventory()).owned).toContain('leaf-crown~0');
  });

  it('poofs a leaf pile for a while, pays feathers up to the daily cap, and spaces out flops', async () => {
    const { page, clock } = rig();
    const { link, pushed } = linkIn(page, 'grove', { x: 900, y: 835 });
    await Promise.resolve(); // the used-up objects are reported once the scene listens
    expect(pushed.objects).toEqual([{}]);
    const first = await link.use('grove-leaves-1');
    expect(first.ok).toBe(true);
    expect(pushed.used).toHaveLength(1);
    const [id, by, until] = pushed.used[0]!;
    expect([id, by]).toEqual(['grove-leaves-1', null]);
    expect(until).toBeGreaterThan(at);
    clock.now += USE_COOLDOWN_MS;
    expect(await link.use('grove-leaves-1')).toMatchObject({ ok: false, reason: 'gone' });
    expect(await link.use('grove-leaves-2')).toMatchObject({ ok: false, reason: 'far' });
    // random() = 0.1: every flop finds feathers, until the day's cap.
    let total = first.feathers;
    for (let i = 0; i < 40; i++) {
      clock.now = until + i * USE_COOLDOWN_MS * 200;
      const res = await link.use('grove-leaves-1');
      expect(res.ok).toBe(true);
      total += res.feathers;
    }
    expect(total).toBe(LEAF_FEATHERS_PER_DAY);
  });

  it('sells from the shop for feathers and gives the daily gift once', async () => {
    const { page, storage } = rig();
    await page.inventory();
    const item = shopRotation(at).weekly[0]!;
    expect(await page.buy(item.variant)).toEqual({ ok: false, reason: 'feathers', feathers: 0 });
    const key = 'owl-park:collection:c_test';
    const snap = JSON.parse(storage.getItem(key)!);
    snap.collectors[0].feathers = item.price;
    storage.setItem(key, JSON.stringify(snap));
    expect(await page.buy(item.variant)).toEqual({ ok: true, variant: item.variant, price: item.price, feathers: 0 });
    expect((await page.shop()).owned).toContain(item.variant);
    // Today's free gift, once.
    expect(await page.claimGift()).toMatchObject({ ok: true, variant: shopRotation(at).gift!.variant });
    expect(await page.claimGift()).toMatchObject({ ok: false, reason: 'taken' });
    expect((await page.shop()).giftTaken).toBe(true);
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
    garbage.setItem('owl-park:collection:c_y', '{"collectors":[{"cid":42}],"owned":[["c_y","nope~9"]],"drops":"x","quests":[{"cid":7}]}');
    const g = new LocalCollections(garbage, { collector: 'c_y', now: () => at });
    expect((await g.inventory()).owned.sort()).toEqual([...STARTER_PACK].sort());
  });
});
