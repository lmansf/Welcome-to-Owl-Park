import { describe, expect, it } from 'vitest';
import { ROOMS, ROOM_LAYOUT } from '../rooms';
import { MemoryCollectionStore, CollectionBook } from './book';
import { DUPLICATE_FEATHERS, EMOTE_IDS, STARTER_PACK, parseVariant } from './collectibles';
import { isWalkable, pointInRect } from './geometry';
import { INTERACTABLES, KIND_RULES, LEAF_FEATHERS_PER_DAY, getInteractable, leafFeathers } from './interactables';
import { NPCS, NPC_TALK_RADIUS, getNpc } from './npcs';
import { nextParkDayAt, nextParkWeekAt, parkDay, parkWeek } from './parktime';
import { DAILY_POOL, QUESTS, STORY_QUESTS, WEEKLY_POOL, getQuest } from './questCatalog';
import { QuestBook, dailyQuestIds, weeklyQuestIds, type QuestSpots } from './questbook';
import { DAILY_QUEST_FEATHERS, MAX_ACTIVE_QUESTS, WEEKLY_QUEST_FEATHERS, goalCount, goalText, isRewardItem, questFeathers, type QuestDef } from './quests';
import { DAILY_ITEMS, SHOP_PRICES, WEEKLY_MIX, offerFor, shopRotation } from './shop';
import { SPECIES, getSpecies, isSpecies, selectableSpecies } from './species';
import { isLook } from './validate';
import { distance } from './geometry';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const SPOTS: QuestSpots = Object.fromEntries(Object.values(ROOMS).map((r) => [r.id, r.spots ?? []]));
/**
 * Realm names stay internal (they never appear in this public repository): visitor-facing text is
 * checked against FNV-1a hashes of the names, one word or two at a time.
 */
const REALM_NAME_HASHES = new Set([4043222138, 2996958903, 2993060258, 1657857906, 3763573739, 3235944325]);
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
function namesRealm(text: string): boolean {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.some((w, i) => REALM_NAME_HASHES.has(fnv(w)) || (i > 0 && REALM_NAME_HASHES.has(fnv(`${words[i - 1]} ${w}`))));
}

function rig() {
  const store = new MemoryCollectionStore();
  const book = new CollectionBook(store);
  const quests = new QuestBook(store, book, SPOTS);
  return { store, book, quests };
}

describe('park clock', () => {
  it('keys days and Monday weeks in Eastern time', () => {
    expect(parkDay(MON)).toBe('2026-10-19');
    expect(parkWeek(MON)).toBe('W2026-10-19');
    // 23:30 Sunday Eastern is still the week before.
    expect(parkWeek(Date.UTC(2026, 9, 26, 3, 30))).toBe('W2026-10-19');
    expect(parkWeek(Date.UTC(2026, 9, 26, 4, 30))).toBe('W2026-10-26');
  });

  it('finds the next midnight exactly, across the end of daylight saving', () => {
    expect(nextParkDayAt(MON)).toBe(Date.UTC(2026, 9, 20, 4, 0, 0));
    // Clocks go back on 2026-11-01: that day is 25 hours long.
    const sat = Date.UTC(2026, 9, 31, 16, 0, 0);
    expect(nextParkDayAt(sat)).toBe(Date.UTC(2026, 10, 1, 4, 0, 0));
    expect(nextParkDayAt(Date.UTC(2026, 10, 1, 16, 0, 0))).toBe(Date.UTC(2026, 10, 2, 5, 0, 0));
    expect(nextParkWeekAt(MON)).toBe(Date.UTC(2026, 9, 26, 4, 0, 0));
  });
});

describe('owl species', () => {
  it('offers the five species, the screech owl to everyone for now', () => {
    expect(SPECIES.map((s) => s.id)).toEqual(['great-horned', 'barn', 'burrowing', 'snowy', 'screech']);
    expect(selectableSpecies().map((s) => s.id)).toContain('screech');
    expect(getSpecies('screech').size).toBeLessThan(getSpecies('burrowing').size);
    expect(getSpecies('nope').id).toBe('great-horned');
  });

  it('accepts a known species on a look and refuses anything else', () => {
    const look = { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' };
    expect(isLook({ ...look, species: 'snowy' })).toBe(true);
    expect(isLook(look)).toBe(true);
    expect(isLook({ ...look, species: 'penguin' })).toBe(false);
    expect(isSpecies('barn')).toBe(true);
  });
});

describe('NPC owls and interactables', () => {
  const exits = (room: string) => ROOMS[room]!.doors.filter((d) => d.to).map((d) => d.rect);

  it('stand on walkable floor, outside every doorway', () => {
    for (const thing of [...NPCS, ...INTERACTABLES]) {
      const room = ROOMS[thing.room]!;
      expect(room, thing.id).toBeDefined();
      expect(isWalkable(thing.pos, room.walkable), `${thing.id} walkable`).toBe(true);
      for (const r of exits(thing.room)) expect(pointInRect(thing.pos, r), `${thing.id} in a doorway`).toBe(false);
    }
  });

  it('keep their distance from one another', () => {
    const all = [...NPCS, ...INTERACTABLES];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) if (all[i]!.room === all[j]!.room) expect(distance(all[i]!.pos, all[j]!.pos), `${all[i]!.id} / ${all[j]!.id}`).toBeGreaterThanOrEqual(120);
  });

  it('give NPCs real catalogue wear and emotes', () => {
    for (const n of NPCS) {
      expect(isLook(n.look), n.id).toBe(true);
      for (const e of n.idle) expect(EMOTE_IDS, `${n.id} idle ${e}`).toContain(e);
      expect(n.greetings.length).toBeGreaterThan(0);
    }
    expect(NPCS.filter((n) => n.shop).map((n) => n.id)).toEqual(['nova']);
  });

  it('turn up feathers from leaf piles at the published odds', () => {
    let seq = [0.1, 0.0];
    expect(leafFeathers(() => seq.shift()!)).toBe(1);
    seq = [0.1, 0.99];
    expect(leafFeathers(() => seq.shift()!)).toBe(3);
    expect(leafFeathers(() => 0.9)).toBe(0);
    expect(KIND_RULES['leaf-pile'].shared).toBe(true);
  });
});

describe('quest catalogue', () => {
  it('has story quests and a bulk daily and weekly pool with unique ids', () => {
    expect(STORY_QUESTS.length).toBeGreaterThanOrEqual(6);
    expect(DAILY_POOL.length).toBeGreaterThan(60);
    expect(WEEKLY_POOL.length).toBeGreaterThanOrEqual(12);
    expect(WEEKLY_POOL.every((q) => q.template === 'grand')).toBe(true);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    expect(QUESTS.length).toBeGreaterThan(90);
  });

  it('refers only to real NPCs, rooms, interactables, emotes and rewards', () => {
    const starterEmotes = new Set<string>(STARTER_PACK.filter((v) => parseVariant(v)?.item.kind === 'emote'));
    for (const q of QUESTS) {
      expect(getNpc(q.giver), `${q.id} giver`).toBeDefined();
      expect(q.steps.length, q.id).toBeGreaterThan(0);
      expect(isRewardItem(q.reward.item), `${q.id} reward`).toBe(true);
      for (const { goal } of q.steps) {
        switch (goal.kind) {
          case 'talk':
            expect(getNpc(goal.npc), `${q.id} talk`).toBeDefined();
            expect(goal.npc, `${q.id} talks to its own giver`).not.toBe(q.giver);
            break;
          case 'visit':
            expect(ROOMS[goal.room], `${q.id} visit`).toBeDefined();
            break;
          case 'interact': {
            const there = INTERACTABLES.filter((i) => i.kind === goal.what && (goal.room === undefined || i.room === goal.room));
            expect(there.length, `${q.id} ${goal.what}`).toBeGreaterThan(0);
            if (goal.distinct) expect(there.length, `${q.id} distinct ${goal.what}`).toBeGreaterThanOrEqual(goal.count);
            break;
          }
          case 'emote':
            // Everyone owns these from the start, so no quest asks for an emote a visitor cannot play.
            expect(starterEmotes.has(goal.emote), `${q.id} emote ${goal.emote}`).toBe(true);
            if (goal.npc) expect(getNpc(goal.npc), `${q.id} emote npc`).toBeDefined();
            break;
          case 'gather':
            expect((SPOTS[goal.room] ?? []).length, `${q.id} gather spots`).toBeGreaterThanOrEqual(goal.count + 2);
            break;
        }
      }
    }
  });

  it('labels length by step count, pays daily quests by difficulty and weekly ones about seven times as much', () => {
    for (const q of QUESTS) {
      const n = q.steps.length;
      expect(q.length, q.id).toBe(n <= 1 ? 'short' : n <= 3 ? 'medium' : 'long');
      if (q.cadence !== 'story') expect(q.reward.feathers, q.id).toBe(questFeathers(q.cadence, q.difficulty));
    }
    // Canon C31: 15, 25 or 40 a daily quest; a weekly one about seven times a daily one (around 150).
    expect(DAILY_QUEST_FEATHERS).toEqual({ easy: 15, medium: 25, hard: 40 });
    const day = (DAILY_QUEST_FEATHERS.easy + DAILY_QUEST_FEATHERS.medium + DAILY_QUEST_FEATHERS.hard) / 3;
    expect(WEEKLY_QUEST_FEATHERS / day).toBeGreaterThan(5);
    expect(WEEKLY_QUEST_FEATHERS / day).toBeLessThan(8);
  });

  it('writes public-safe text: no realm names anywhere', () => {
    for (const q of QUESTS) {
      for (const text of [q.title, q.offer, q.thanks, ...q.steps.map((s) => goalText(s.goal))]) expect(namesRealm(text), `${q.id}: ${text}`).toBe(false);
    }
    for (const n of NPCS) for (const text of [n.name, n.role, ...n.greetings]) expect(namesRealm(text), `${n.id}: ${text}`).toBe(false);
  });

  it('offers one daily quest of each difficulty and two weekly ones, the same for everyone, from different NPCs', () => {
    const day = dailyQuestIds('2026-10-19');
    expect(day).toEqual(dailyQuestIds('2026-10-19'));
    expect(dailyQuestIds('2026-10-20')).not.toEqual(day);
    for (let i = 0; i < 60; i++) {
      const d = parkDay(MON + i * DAY);
      const ids = dailyQuestIds(d).map((id) => getQuest(id)!);
      expect(ids.map((q) => q.difficulty), d).toEqual(['easy', 'medium', 'hard']);
      expect(new Set(ids.map((q) => q.giver)).size, d).toBe(3);
      expect(new Set(ids.map((q) => q.template)).size, d).toBe(3);
      const week = weeklyQuestIds(parkWeek(MON + i * DAY)).map((id) => getQuest(id)!);
      expect(week.map((q) => q.difficulty)).toEqual(['medium', 'hard']);
      expect(week[0]!.giver).not.toBe(week[1]!.giver);
      expect(week[0]!.title).not.toBe(week[1]!.title);
      expect(new Set(ids.map((q) => q.title)).size, d).toBe(3);
    }
  });
});

describe('the shop', () => {
  it('rotates eight items a week, plus featured, three daily items and a free daily gift, all different', () => {
    const rot = shopRotation(MON);
    expect(rot.weekly).toHaveLength(Object.values(WEEKLY_MIX).reduce((a, b) => a + b, 0));
    for (const o of [...rot.weekly, ...rot.daily]) expect(o.price).toBe(SHOP_PRICES[o.rarity]);
    expect(rot.featuredTitle).toBe('Owlloween');
    expect(rot.featured.length).toBeGreaterThan(0);
    expect(rot.daily).toHaveLength(DAILY_ITEMS);
    expect(rot.gift).toMatchObject({ section: 'gift', price: 0 });
    expect(rot.gift!.rarity).not.toBe('epic');
    expect(offerFor(rot, rot.gift!.variant)).toBeNull(); // taken, not bought
    const items = [...rot.weekly, ...rot.daily, rot.gift!].map((o) => parseVariant(o.variant)!.item.id);
    expect(new Set(items).size).toBe(items.length);
    for (const v of STARTER_PACK) expect(offerFor(rot, v)).toBeNull();
    // The same moment gives the same shop; the next day the daily items, the gift and the featured items move.
    expect(shopRotation(MON + HOUR)).toEqual(rot);
    const tomorrow = shopRotation(MON + DAY);
    expect(tomorrow.weekly).toEqual(rot.weekly);
    expect(tomorrow.daily).not.toEqual(rot.daily);
    expect(tomorrow.nextFeatured).toBe(tomorrow.nextDay);
  });

  it('gives today’s gift once a park day, paying feathers for one already owned', () => {
    const { book, store } = rig();
    const gift = shopRotation(MON).gift!;
    expect(book.shop('c1', MON).giftTaken).toBe(false);
    expect(book.claimGift('c1', MON)).toEqual({ ok: true, variant: gift.variant, dup: false, feathers: 0, total: 0 });
    expect(book.claimGift('c1', MON + HOUR)).toEqual({ ok: false, reason: 'taken', total: 0 });
    expect(book.shop('c1', MON).giftTaken).toBe(true);
    const next = shopRotation(MON + DAY).gift!;
    store.addOwned('c1', next.variant, 'granted', MON);
    expect(book.claimGift('c1', MON + DAY)).toEqual({ ok: true, variant: next.variant, dup: true, feathers: DUPLICATE_FEATHERS[next.rarity], total: DUPLICATE_FEATHERS[next.rarity] });
  });

  it('features the week’s rarest outside a set’s dates', () => {
    const rot = shopRotation(Date.UTC(2027, 1, 10, 16));
    expect(rot.featuredTitle).toBe('Featured');
    expect(rot.featured.map((o) => o.rarity)).toEqual(['rare', 'epic']);
    expect(rot.nextFeatured).toBe(rot.nextWeek);
  });

  it('sells only what is offered, once, for enough feathers', () => {
    const { book, store } = rig();
    const rot = shopRotation(MON);
    const item = rot.weekly[0]!;
    expect(book.buy('c1', 'crown~9', MON)).toMatchObject({ ok: false });
    expect(book.buy('c1', item.variant, MON)).toEqual({ ok: false, reason: 'feathers', feathers: 0 });
    store.setFeathers('c1', 1000);
    expect(book.buy('c1', item.variant, MON)).toEqual({ ok: true, variant: item.variant, price: item.price, feathers: 1000 - item.price });
    expect(book.buy('c1', item.variant, MON)).toMatchObject({ ok: false, reason: 'owned' });
    expect(book.shop('c1', MON).owned).toContain(item.variant);
  });

  it('caps feathers from leaf piles per park day', () => {
    const { book } = rig();
    let total = 0;
    for (let i = 0; i < 30; i++) total += book.earnCapped('c1', 'leaves', 3, LEAF_FEATHERS_PER_DAY, MON).added;
    expect(total).toBe(LEAF_FEATHERS_PER_DAY);
    expect(book.earnCapped('c1', 'leaves', 3, LEAF_FEATHERS_PER_DAY, MON + DAY).added).toBe(3);
  });
});

describe('quest ledger', () => {
  const welcome = getQuest('story-welcome')!;

  it('offers the welcome story quest first, then the ones it unlocks', () => {
    const { quests } = rig();
    const board = quests.board('c1', MON);
    expect(board.offers['bramble']!.map((o) => o.id)).toContain('story-welcome');
    expect(Object.values(board.offers).flat().some((o) => o.id === 'story-hazel-acorns')).toBe(false);
    const daily = dailyQuestIds(board.day);
    for (const id of daily) expect(board.offers[getQuest(id)!.giver]!.map((o) => o.id)).toContain(id);
  });

  it('walks the welcome quest step by step and pays on hand-in', () => {
    const { quests, book } = rig();
    expect(quests.accept('c1', 'story-welcome', MON, 'hub').ok).toBe(true);
    expect(quests.accept('c1', 'story-welcome', MON).ok).toBe(false);
    // Wrong order does nothing: only the current step can move.
    expect(quests.event('c1', { kind: 'talk', npc: 'nova' }, MON)).toEqual([]);
    expect(quests.event('c1', { kind: 'talk', npc: 'pip' }, MON, 'hub')[0]).toMatchObject({ quest: 'story-welcome', step: 0, count: 1, need: 1, ready: false });
    quests.event('c1', { kind: 'visit', room: 'grove' }, MON, 'grove');
    quests.event('c1', { kind: 'interact', what: 'leaf-pile', id: 'grove-leaves-1', room: 'grove' }, MON, 'grove');
    quests.event('c1', { kind: 'talk', npc: 'nova' }, MON, 'market');
    expect(quests.handIn('c1', 'story-welcome', 'bramble', MON, () => 0.5)).toMatchObject({ ok: false, reason: 'not-ready' });
    // An emote far from Bramble does not count; near him it does.
    expect(quests.event('c1', { kind: 'emote', emote: 'hoot', room: 'hub', near: [] }, MON, 'hub')).toEqual([]);
    expect(quests.event('c1', { kind: 'emote', emote: 'hoot', room: 'hub', near: ['bramble'] }, MON, 'hub')[0]!.ready).toBe(true);
    expect(quests.handIn('c1', 'story-welcome', 'pip', MON, () => 0.5)).toMatchObject({ ok: false, reason: 'wrong-npc' });
    const res = quests.handIn('c1', 'story-welcome', 'bramble', MON, () => 0.5);
    expect(res).toMatchObject({ ok: true, feathers: welcome.reward.feathers, total: welcome.reward.feathers, award: { variant: 'leaf-crown~0', dup: false } });
    expect(book.owned('c1', undefined, MON)).toContain('leaf-crown~0');
    const board = quests.board('c1', MON);
    expect(board.storyDone).toContain('story-welcome');
    expect(board.offers['hazel']!.map((o) => o.id)).toContain('story-hazel-acorns');
    expect(board.offers['bramble']?.some((o) => o.id === 'story-welcome') ?? false).toBe(false);
  });

  it('counts different stalls for a distinct step, and skips a visit to the room you stand in', () => {
    const { quests, store } = rig();
    store.putQuest({ cid: 'c1', quest: 'story-welcome', period: '', step: 0, count: 0, seen: [], items: [], acceptedAt: MON, doneAt: MON });
    expect(quests.accept('c1', 'story-nova-window', MON, 'market').ok).toBe(true);
    const stall = (id: string) => quests.event('c1', { kind: 'interact', what: 'stall', id, room: 'market' }, MON, 'market');
    expect(stall('market-stall-1')[0]!.count).toBe(1);
    expect(stall('market-stall-1')).toEqual([]);
    stall('market-stall-2');
    expect(stall('market-stall-3')[0]).toMatchObject({ count: 3, need: 3 });
    expect(quests.board('c1', MON).active[0]!.current!.text).toBe('Talk to Flicker at the neon street');
  });

  it('places quest items on hiding spots for one collector and picks them up only close by', () => {
    const { quests, store } = rig();
    store.putQuest({ cid: 'c1', quest: 'story-welcome', period: '', step: 0, count: 0, seen: [], items: [], acceptedAt: MON, doneAt: MON });
    expect(quests.accept('c1', 'story-hazel-acorns', MON, 'grove').ok).toBe(true);
    const items = quests.board('c1', MON).active[0]!.items;
    expect(items).toHaveLength(3);
    for (const it of items) {
      expect(it.room).toBe('grove');
      expect(SPOTS['grove']!.some((p) => p.x === it.x && p.y === it.y)).toBe(true);
      for (const blocker of [...NPCS, ...INTERACTABLES].filter((b) => b.room === 'grove')) expect(distance(it, blocker.pos)).toBeGreaterThanOrEqual(90);
    }
    const [a, b, c] = items;
    expect(quests.gather('c1', 'story-hazel-acorns', a!.n, 'grove', { x: a!.x + 200, y: a!.y }, MON)).toEqual({ ok: false, reason: 'far' });
    expect(quests.gather('c1', 'story-hazel-acorns', a!.n, 'grove', { x: a!.x, y: a!.y }, MON).ok).toBe(true);
    expect(quests.gather('c1', 'story-hazel-acorns', a!.n, 'grove', { x: a!.x, y: a!.y }, MON)).toEqual({ ok: false, reason: 'gone' });
    quests.gather('c1', 'story-hazel-acorns', b!.n, 'grove', b!, MON);
    const last = quests.gather('c1', 'story-hazel-acorns', c!.n, 'grove', c!, MON);
    expect(last.ok && last.updates[0]!.ready).toBe(true);
  });

  it('moves quest items saved under the one-screen rooms along with the rooms, once', () => {
    const item = (room: string, x: number, y: number, n: number) => ({ n, step: 0, room, x, y, kind: 'acorn' as const, taken: false });
    const before = { collectors: [], owned: [], quests: [{ cid: 'c1', quest: 'story-hazel-acorns', period: '', step: 0, count: 0, seen: [], items: [item('grove', 380, 840, 0), item('hub', 60, 820, 1), item('market', 330, 860, 2)], acceptedAt: MON, doneAt: null }] };
    const moved = MemoryCollectionStore.from(before).quests('c1')[0]!.items;
    expect(moved.map((i) => [i.room, i.x, i.y])).toEqual([['grove', 1980, 840], ['hub', 1660, 820], ['market', 330, 860]]);
    for (const i of moved) expect(SPOTS[i.room]!.some((p) => p.x === i.x && p.y === i.y), `${i.room} ${i.x},${i.y} is a spot again`).toBe(true);
    const snap = MemoryCollectionStore.from(before).snapshot();
    expect(snap.layout).toBe(ROOM_LAYOUT);
    expect(MemoryCollectionStore.from(snap).quests('c1')[0]!.items).toEqual(moved);
  });

  it('caps active quests and forgets yesterday’s daily quests', () => {
    const { quests } = rig();
    const board = quests.board('c1', MON);
    const all = Object.values(board.offers).flat();
    for (const o of all.slice(0, MAX_ACTIVE_QUESTS)) expect(quests.accept('c1', o.id, MON).ok, o.id).toBe(true);
    const extra = all[MAX_ACTIVE_QUESTS];
    if (extra) expect(quests.accept('c1', extra.id, MON)).toMatchObject({ ok: false, reason: 'full' });
    const daily = quests.board('c1', MON).active.filter((a) => a.cadence === 'daily');
    expect(daily.length).toBeGreaterThan(0);
    expect(daily[0]!.endsAt).toBe(nextParkDayAt(MON));
    const later = quests.board('c1', MON + DAY);
    expect(later.active.some((a) => a.cadence === 'daily')).toBe(false);
  });

  it('pays a picked collectible by difficulty, and a duplicate in feathers', () => {
    const { quests, store } = rig();
    const id = dailyQuestIds(parkDay(MON))[0]!;
    const q: QuestDef = getQuest(id)!;
    expect(quests.accept('c1', id, MON).ok).toBe(true);
    const row = store.quests('c1').find((r) => r.quest === id)!;
    store.putQuest({ ...row, step: q.steps.length, count: 0 });
    const res = quests.handIn('c1', id, q.giver, MON, () => 0.01);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.award).not.toBeNull();
      expect(parseVariant(res.award!.variant)).not.toBeNull();
      expect(res.feathers).toBe(q.reward.feathers + res.award!.feathers);
    }
    expect(quests.accept('c1', id, MON)).toMatchObject({ ok: false, reason: 'done' });
  });

  it('pays a weekly quest about 150 feathers and a rare-or-better collectible', () => {
    for (let k = 0; k < 6; k++) {
      const { quests, store } = rig();
      const id = weeklyQuestIds(parkWeek(MON))[k % 2]!;
      const q = getQuest(id)!;
      expect(quests.accept('c1', id, MON).ok).toBe(true);
      const row = store.quests('c1').find((r) => r.quest === id)!;
      store.putQuest({ ...row, step: q.steps.length, count: 0 });
      const res = quests.handIn('c1', id, q.giver, MON, () => k / 6);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.feathers - res.award!.feathers).toBe(150);
        expect(['rare', 'epic']).toContain(parseVariant(res.award!.variant)!.rarity);
      }
    }
  });

  it('describes steps with their counts', () => {
    const q = getQuest('leaves-hazel-medium')!;
    expect(goalCount(q.steps[0]!.goal)).toBe(4);
    expect(goalText(q.steps[0]!.goal)).toBe('Flop into 4 leaf piles');
    expect(getInteractable('grove-leaves-1')!.kind).toBe('leaf-pile');
    expect(NPC_TALK_RADIUS).toBeGreaterThan(KIND_RULES['leaf-pile'].reach);
  });
});
