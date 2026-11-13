import { describe, expect, it } from 'vitest';
import { FURNITURE, LEAF_FEATHERS_PER_DAY, PRESENTS, STARTER_FURNITURE, STARTER_PACK, USE_COOLDOWN_MS, getNpc, shopRotation, type QuestBoard, type Vec2, CLIMB_FLOORS } from '@owl-park/shared';

/** What every collector holds from the start: the starter pack and the park's presents. */
const EVERYONES = [...STARTER_PACK, ...PRESENTS.map((p) => p.variant)];
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

describe("a course's fall in this browser's own park (OP-343)", () => {
  /** A course link in `room` with the owl at `where`, `z` up, in by `entry`: all three movable. */
  function courseIn(page: LocalCollections, room: string, at: Vec2, entry?: string) {
    const me = { pos: { ...at }, z: 0, ground: 0, entry };
    const link = page.courseLink(room, null, () => me.pos, () => me.ground, () => ({ z: me.z, entry: me.entry }))!;
    return { link, me };
  }

  it('is a fall as the room server sees one: down in a pit or in thorns at any height, and nowhere else', async () => {
    const { page } = rig();
    const { link, me } = courseIn(page, 'canopy-1', { x: 120, y: 770 }, 'from-gate');
    expect((await link.start()).ok).toBe(true);
    // On the walk before the bramble: no fall.
    expect(await link.fall()).toEqual({ ok: false, reason: 'far' });
    // Down in the bramble: a fall, back at the way in.
    me.pos.x = 900;
    expect(await link.fall()).toMatchObject({ ok: true, at: { x: 120, y: 770 } });
    // Up on a frond over the bramble (standing 160 up): not one.
    me.ground = 160;
    me.z = 160;
    expect(await link.fall()).toEqual({ ok: false, reason: 'far' });
    // In the thorns that hang over safe floor (H1, from 260 up), which a preview used to let an owl fly through.
    me.pos.x = 1990;
    me.ground = 0;
    me.z = 400;
    expect(await link.fall()).toMatchObject({ ok: true });
    // Under them, well clear: not one.
    me.z = 100;
    expect(await link.fall()).toEqual({ ok: false, reason: 'far' });
  });

  it('goes back the way the owl came into the room, as the room server sends it', async () => {
    const { page } = rig();
    const gate = courseIn(page, 'canopy-1', { x: 120, y: 770 }, 'from-gate');
    expect((await gate.link.start()).ok).toBe(true);
    // In again at the far end (down from the trunk), into the bramble near there: back at that way in.
    const far = courseIn(page, 'canopy-1', { x: 3900, y: 770 }, 'from-trunk');
    expect(await far.link.fall()).toMatchObject({ ok: true, at: { x: 4660, y: 770 } });
    // No way in known: the act's own, the gate.
    const plain = courseIn(page, 'canopy-1', { x: 3900, y: 770 });
    expect(await plain.link.fall()).toMatchObject({ ok: true, at: { x: 120, y: 770 } });
  });
});

describe('LocalCollections', () => {
  it('keeps one collection per browser and remembers its id', () => {
    const storage = new MemoryStorage();
    const one = new LocalCollections(storage, { tz: 'America/New_York', now: () => at });
    const two = new LocalCollections(storage, { tz: 'America/New_York', now: () => at });
    expect(two.cid).toBe(one.cid);
    expect(new LocalCollections(storage, { collector: 'e2e-a', now: () => at }).cid).toBe('e2e-a');
  });

  it('starts with the starter pack and the presents, and talks only to an NPC owl standing close', async () => {
    const { page } = rig();
    expect((await page.inventory()).owned.sort()).toEqual([...EVERYONES].sort());
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

    const grove = linkIn(page, 'grove', { x: 2500, y: 835 });
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
    const { link, pushed } = linkIn(page, 'grove', { x: 2500, y: 835 });
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

  it('reaches the leaf pile up on the lantern beam only from the beam, and a pile on the floor only from the floor (OP-084)', async () => {
    const { page, clock } = rig();
    const ground = { top: 80 };
    const beam = page.questLink('hub', null, {}, () => ({ x: 930, y: 696 }), () => ground.top);
    // On the bench under it: out of reach. Up on the beam: a flop.
    expect(await beam.use('hub-leaves-beam')).toMatchObject({ ok: false, reason: 'far' });
    ground.top = 264;
    expect((await beam.use('hub-leaves-beam')).ok).toBe(true);
    clock.now += USE_COOLDOWN_MS;
    const floor = page.questLink('hub', null, {}, () => ({ x: 1930, y: 820 }), () => ground.top);
    expect(await floor.use('hub-leaves-1')).toMatchObject({ ok: false, reason: 'far' });
    ground.top = 0;
    expect((await floor.use('hub-leaves-1')).ok).toBe(true);
  });

  it("carries the owl's furniture with its collection (for the style sets), once its nest is made", async () => {
    const { page } = rig();
    expect((await page.inventory()).furniture).toEqual([]);
    await page.homeNest();
    expect((await page.inventory()).furniture).toEqual(FURNITURE.filter((f) => STARTER_FURNITURE.includes(f.id)).map((f) => f.id));
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
    expect((await page.inventory()).owned.length).toBe(EVERYONES.length);
    const garbage = new MemoryStorage();
    garbage.setItem('owl-park:collection:c_y', '{"collectors":[{"cid":42}],"owned":[["c_y","nope~9"]],"drops":"x","quests":[{"cid":7}]}');
    const g = new LocalCollections(garbage, { collector: 'c_y', now: () => at });
    expect((await g.inventory()).owned.sort()).toEqual([...EVERYONES].sort());
  });
});

describe('the stained-glass climb in the local mode', () => {
  const PORTAL = { x: 1500, y: 600 };
  const FLOORS_EASY = CLIMB_FLOORS['city-2']!.easy;

  function climber(storage = new MemoryStorage(), clock = { now: at }) {
    const page = new LocalCollections(storage, { collector: 'c_climber', tz: 'America/New_York', now: () => clock.now, random: () => 0.1, night: 'easy' });
    const where = { ...PORTAL };
    const link = page.activityLink('glass', null, {}, () => where, () => ({ body: '#2F3E5C', belly: '#E0D4F0', accent: '#FF2AA1' }));
    return { storage, clock, page, link, where };
  }

  it('opens a run at the portal on the pinned night, pays the storeys reached, and keeps the run across pages', async () => {
    const { storage, clock, page, link, where } = climber();
    where.x = 1200;
    expect(await link.climb()).toEqual({ ok: false, reason: 'far' });
    where.x = PORTAL.x;
    const started = await link.climb();
    expect(started).toMatchObject({ ok: true, night: 'easy', tier: 'easy', banked: 0, remainingCap: 25, bestBandToday: 0, resumed: false, previousForgotten: false });
    const seed = (started as { seed: number }).seed;
    expect(await link.ascent(seed, 1)).toEqual({ ok: false, reason: 'too-fast' });
    clock.now = at + FLOORS_EASY[1]! + 250;
    const two = await link.ascent(seed, 2);
    expect(two).toMatchObject({ ok: true, banked: 2, added: 2, total: 2 });
    expect((await page.inventory()).feathers).toBe((await climber().page.inventory()).feathers + 2);
    // Another page on the same browser finds the run where it was, wherever the owl stands.
    const again = climber(storage, clock);
    again.where.x = 100;
    expect(await again.link.climb()).toMatchObject({ ok: true, seed, banked: 2, resumed: true, remainingCap: 23, bestBandToday: 2 });
    clock.now = at + FLOORS_EASY[5]! + 250;
    const clouds = await again.link.ascent(seed, 6);
    expect(clouds).toMatchObject({ ok: true, banked: 6, added: 8, total: 10, item: { variant: 'glass-circlet~0', first: true } });
    expect((await again.page.inventory()).owned).toContain('glass-circlet~0');
  });
});

describe('puzzle quests in this browser (OP-255)', () => {
  it('starts a run, picks up a key where it stands, keeps the run in storage and has nobody to join', async () => {
    const { page, storage } = rig('c_puzzle');
    const pip = getNpc('pip')!.pos;
    const stand = { x: pip.x, y: pip.y, top: 0 };
    const link = page.questLink('hub', null, {}, () => stand, () => stand.top);
    expect(await link.puzzle('state', 'puzzle-moon-gate')).toMatchObject({ ok: false, reason: 'not-active' });
    expect((await link.accept('puzzle-moon-gate')).ok).toBe(true);
    const before = await link.puzzle('state', 'puzzle-moon-gate');
    expect(before.ok).toBe(true);
    expect(before.view?.run).toBeNull();
    const started = await link.puzzle('start', 'puzzle-moon-gate');
    expect(started.view?.run).toMatchObject({ members: 1, host: true });
    // The root door's key is hidden in this room: standing at it picks it up.
    const door = started.view!.locks.find((l) => l.id === 'root-door')!;
    expect(door.key?.room).toBe('hub');
    // Well away from the key (its spot is picked per run, so it can fall next to Pip).
    Object.assign(stand, { x: door.key!.x + 3000, y: door.key!.y, top: 0 });
    expect((await link.puzzle('take', 'puzzle-moon-gate', { lock: 'root-door' })).reason).toBe('far');
    Object.assign(stand, { x: door.key!.x, y: door.key!.y, top: door.key!.top ?? 0 });
    const took = await link.puzzle('take', 'puzzle-moon-gate', { lock: 'root-door' });
    expect(took.ok).toBe(true);
    expect(took.view?.locks.find((l) => l.id === 'root-door')?.hasKey).toBe(true);
    // A code lock checks the code here too; a wrong one says how many tries are left.
    const dial = took.view!.locks.find((l) => l.id === 'moth-dial')!;
    Object.assign(stand, { x: dial.post.x, y: dial.post.y, top: dial.post.top ?? 0 });
    const tried = await link.puzzle('open', 'puzzle-moon-gate', { lock: 'moth-dial', code: ['moon', 'moon', 'moon'] });
    if (!tried.ok) expect(tried).toMatchObject({ reason: 'wrong', left: 4 });
    // The run is kept in this browser: a new page picks it back up.
    expect(storage.data.has('owl-park:puzzles')).toBe(true);
    const again = new LocalCollections(storage, { collector: 'c_puzzle', tz: 'America/New_York', now: () => at }).questLink('hub', null, {}, () => stand, () => stand.top);
    const kept = await again.puzzle('state', 'puzzle-moon-gate');
    expect(kept.view?.run?.id).toBe(started.view!.run!.id);
    expect(kept.view?.locks.find((l) => l.id === 'root-door')?.hasKey).toBe(true);
    // Nobody else plays in this browser.
    expect(await again.puzzle('near', 'puzzle-moon-gate')).toMatchObject({ ok: true, near: [] });
    expect(await again.puzzle('join', 'puzzle-moon-gate', { with: 'someone' })).toMatchObject({ ok: false, reason: 'far' });
  });
});
