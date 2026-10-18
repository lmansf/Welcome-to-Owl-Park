import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import {
  CATALOGUE,
  CRAFT_COST,
  DUPLICATE_FEATHERS,
  RARITY_WEIGHTS,
  STARTER_PACK,
  UNOWNED_BOOST,
  allSpots,
  allVariants,
  craftCost,
  duplicatePayout,
  equipSlotOf,
  filterOwnedWear,
  generateDrops,
  isTimeZone,
  isWear,
  localClock,
  nextWindowAt,
  normalizeTimeZone,
  parseVariant,
  sanitizeWear,
  variantName,
  windowInfo,
  windowKeyAt,
} from './collectibles';
import { DEFAULT_LOOK, sanitizeLook } from './look';
import { isLook, isParkMessage } from './validate';

const seedOf = (k: number): Uint8Array => {
  // A cheap, well-spread 32-byte seed per integer (the server uses HMAC-SHA256).
  const out = new Uint8Array(32);
  let x = (k + 1) * 2654435761;
  for (let i = 0; i < 32; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
};

describe('catalogue', () => {
  it('has 50 wearables, 20 pets, 24 effects and 24 emotes: 1068 variants', () => {
    const by = (k: string) => CATALOGUE.filter((i) => i.kind === k).length;
    expect([by('wear'), by('pet'), by('fx'), by('emote')]).toEqual([50, 20, 24, 24]);
    expect(CATALOGUE.filter((i) => i.slot === 'head')).toHaveLength(30);
    expect(CATALOGUE.filter((i) => i.slot === 'face')).toHaveLength(10);
    expect(CATALOGUE.filter((i) => i.slot === 'neck')).toHaveLength(10);
    expect(allVariants()).toHaveLength(500 + 160 + 384 + 24);
    expect(new Set(allVariants()).size).toBe(1068);
    expect(new Set(CATALOGUE.map((i) => i.id)).size).toBe(CATALOGUE.length);
  });

  it('gives wearables and pets an art key and nothing else one', () => {
    for (const i of CATALOGUE) {
      if (i.kind === 'wear' || i.kind === 'pet') expect(i.art).toBe(`item-${i.id}`);
      else expect(i.art).toBeUndefined();
    }
  });

  it('parses exactly the catalogue spellings', () => {
    for (const id of allVariants()) expect(parseVariant(id)?.id).toBe(id);
    for (const bad of ['witch-hat', 'witch-hat~10', 'witch-hat~01', 'hoot~0', 'nope~1', 'mouse~8', 'aura~16', '', 'Witch-Hat~1', 42, null]) expect(parseVariant(bad)).toBeNull();
    expect(equipSlotOf(parseVariant('witch-hat~3')!)).toBe('head');
    expect(equipSlotOf(parseVariant('monocle~0')!)).toBe('face');
    expect(equipSlotOf(parseVariant('cape~9')!)).toBe('neck');
    expect(equipSlotOf(parseVariant('mouse~7')!)).toBe('pet');
    expect(equipSlotOf(parseVariant('glitch~15')!)).toBe('fx');
    expect(equipSlotOf(parseVariant('hoot')!)).toBeNull();
  });

  it('names variants for display', () => {
    expect(variantName('witch-hat~0')).toBe('Witch Hat');
    expect(variantName('witch-hat~3')).toBe('Witch Hat · Dusk');
    expect(variantName('mouse~7')).toBe('Mouse · Eclipse');
    expect(variantName('aura~0')).toBe('Aura · Gold');
    expect(variantName('aura~6')).toBe('Aura · Moss');
    expect(variantName('flip')).toBe('Backflip');
  });

  it('starts every collector with two emotes and an effect, all real variants', () => {
    for (const v of STARTER_PACK) expect(parseVariant(v)).not.toBeNull();
  });

  it('prices duplicates and crafting by rarity', () => {
    expect(duplicatePayout('beanie~2')).toBe(DUPLICATE_FEATHERS.common);
    expect(duplicatePayout('crown~0')).toBe(60);
    expect(craftCost('crown~0')).toBe(CRAFT_COST.epic);
    expect(craftCost('twirl')).toBe(600);
    expect(craftCost('nope')).toBeNull();
    expect(duplicatePayout('nope')).toBe(0);
  });
});

describe('wear on a look', () => {
  it('accepts only catalogue variants in their own slot', () => {
    expect(isWear({})).toBe(true);
    expect(isWear({ head: 'witch-hat~1', face: 'monocle~0', neck: 'cape~2', pet: 'mouse~3', fx: 'aura~4' })).toBe(true);
    expect(isWear({ head: 'monocle~0' })).toBe(false); // wrong slot
    expect(isWear({ hat: 'witch-hat~1' })).toBe(false); // unknown slot
    expect(isWear({ head: 'witch-hat~99' })).toBe(false);
    expect(isWear({ fx: 'hoot' })).toBe(false); // emotes are not worn
    expect(isWear([])).toBe(false);
    expect(isWear('witch-hat~1')).toBe(false);
  });

  it('keeps old looks valid and validates new ones strictly', () => {
    expect(isLook(DEFAULT_LOOK)).toBe(true);
    expect(isLook({ ...DEFAULT_LOOK, wear: { head: 'crown~0' } })).toBe(true);
    expect(isLook({ ...DEFAULT_LOOK, wear: { head: 'crown~42' } })).toBe(false);
    expect(isLook({ ...DEFAULT_LOOK, wear: 'crown~0' })).toBe(false);
  });

  it('sanitizes wear slot by slot', () => {
    expect(sanitizeWear({ head: 'crown~0', face: 'crown~0', pet: 'mouse~1', junk: 1 })).toEqual({ head: 'crown~0', pet: 'mouse~1' });
    expect(sanitizeWear({ head: 'nope' })).toBeUndefined();
    expect(sanitizeLook({ ...DEFAULT_LOOK, wear: { head: 'crown~0', neck: 'x' } }).wear).toEqual({ head: 'crown~0' });
    expect(sanitizeLook({ ...DEFAULT_LOOK, wear: {} })).not.toHaveProperty('wear');
  });

  it('filters wear down to what is owned', () => {
    const owned = new Set(['crown~0', 'mouse~1']);
    expect(filterOwnedWear({ head: 'crown~0', pet: 'mouse~2', fx: 'aura~0' }, owned)).toEqual({ head: 'crown~0' });
    expect(filterOwnedWear({ pet: 'mouse~2' }, owned)).toBeUndefined();
    expect(filterOwnedWear(undefined, owned)).toBeUndefined();
  });

  it('relays emotes between peers only for catalogue emotes', () => {
    expect(isParkMessage({ t: 'emote', id: 'a', e: 'hoot' })).toBe(true);
    expect(isParkMessage({ t: 'emote', id: 'a', e: 'crown~0' })).toBe(false);
    expect(isParkMessage({ t: 'emote', id: 'a', e: '<b>hi</b>' })).toBe(false);
  });
});

describe('time zones and half-day windows', () => {
  it('validates IANA zones and falls back to UTC', () => {
    expect(isTimeZone('America/New_York')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Asia/Kolkata')).toBe(true);
    for (const bad of ['Mars/Olympus_Mons', '', '../etc/passwd', 'a'.repeat(80), 42, null, 'America New York']) expect(isTimeZone(bad)).toBe(false);
    expect(normalizeTimeZone('Mars/Olympus_Mons')).toBe('UTC');
    expect(normalizeTimeZone('Europe/Paris')).toBe('Europe/Paris');
  });

  it('splits the local day at noon and midnight', () => {
    const tz = 'America/New_York';
    expect(windowKeyAt(Date.UTC(2026, 9, 18, 15, 59, 59, 999), tz)).toBe('2026-10-18:AM'); // 11:59:59 EDT
    expect(windowKeyAt(Date.UTC(2026, 9, 18, 16, 0, 0), tz)).toBe('2026-10-18:PM'); // 12:00 EDT
    expect(windowKeyAt(Date.UTC(2026, 9, 19, 3, 59), tz)).toBe('2026-10-18:PM'); // 23:59 EDT
    expect(windowKeyAt(Date.UTC(2026, 9, 19, 4, 0), tz)).toBe('2026-10-19:AM');
    expect(windowKeyAt(Date.UTC(2026, 9, 18, 12, 0), 'UTC')).toBe('2026-10-18:PM');
  });

  it('finds the next refresh exactly, across daylight saving changes', () => {
    const ny = 'America/New_York';
    // Spring forward (8 March 2026): the morning window is only 11 hours long.
    expect(nextWindowAt(Date.UTC(2026, 2, 8, 5, 0, 0) + 1, ny)).toBe(Date.UTC(2026, 2, 8, 16, 0, 0));
    // Fall back (1 November 2026): the morning window is 13 hours long.
    expect(nextWindowAt(Date.UTC(2026, 10, 1, 4, 0, 0), ny)).toBe(Date.UTC(2026, 10, 1, 17, 0, 0));
    // Half-hour and three-quarter-hour zones.
    expect(nextWindowAt(Date.UTC(2026, 9, 18, 0, 0), 'Asia/Kolkata')).toBe(Date.UTC(2026, 9, 18, 6, 30));
    expect(nextWindowAt(Date.UTC(2026, 9, 18, 12, 0), 'Pacific/Chatham')).toBe(Date.UTC(2026, 9, 18, 22, 15));
    expect(windowInfo(Date.UTC(2026, 9, 18, 12, 0), 'UTC')).toEqual({ key: '2026-10-18:PM', half: 'PM', next: Date.UTC(2026, 9, 19, 0, 0) });
  });

  it('handles a zone whose midnight does not exist on the change day', () => {
    // Chile moves its clocks at midnight; whatever the rules, the boundary is the first instant of a new window.
    const tz = 'America/Santiago';
    for (const at of [Date.UTC(2026, 8, 5, 23, 0), Date.UTC(2026, 3, 4, 23, 0), Date.UTC(2026, 9, 18, 2, 0)]) {
      const key = windowKeyAt(at, tz);
      const next = nextWindowAt(at, tz);
      expect(next).toBeGreaterThan(at);
      expect(next - at).toBeLessThanOrEqual(14 * 3600_000);
      expect(windowKeyAt(next - 1, tz)).toBe(key);
      expect(windowKeyAt(next, tz)).not.toBe(key);
    }
  });

  it('formats a local clock for the HUD', () => {
    expect(localClock(Date.UTC(2026, 9, 18, 16, 0), 'America/New_York')).toBe('12:00');
    expect(localClock(Date.UTC(2026, 9, 19, 4, 0), 'America/New_York')).toBe('00:00');
  });
});

describe('drops', () => {
  const spots = allSpots(ROOMS);

  it('lists every hiding spot in a stable order', () => {
    expect(spots.length).toBeGreaterThanOrEqual(24);
    expect(spots[0]!.room).toBe('grove'); // rooms in id order
    expect(allSpots(ROOMS)).toEqual(spots);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const a = generateDrops(seedOf(1), spots, new Set());
    expect(generateDrops(seedOf(1), spots, new Set())).toEqual(a);
    expect(generateDrops(seedOf(2), spots, new Set())).not.toEqual(a);
  });

  it('gives two or three drops on distinct spots, with distinct catalogue variants', () => {
    const counts = { 2: 0, 3: 0 } as Record<number, number>;
    for (let k = 0; k < 400; k++) {
      const drops = generateDrops(seedOf(k), spots, new Set());
      counts[drops.length] = (counts[drops.length] ?? 0) + 1;
      expect(drops.map((d) => d.n)).toEqual(drops.map((_, i) => i));
      expect(new Set(drops.map((d) => `${d.room}:${d.x},${d.y}`)).size).toBe(drops.length);
      expect(new Set(drops.map((d) => d.variant)).size).toBe(drops.length);
      for (const d of drops) {
        expect(parseVariant(d.variant)).not.toBeNull();
        expect(spots).toContainEqual({ room: d.room, x: d.x, y: d.y });
      }
    }
    expect(counts[2]! + counts[3]!).toBe(400);
    expect(counts[2]).toBeGreaterThan(140);
    expect(counts[3]).toBeGreaterThan(140);
  });

  it('draws rarities by the published weights', () => {
    const tally: Record<string, number> = { common: 0, uncommon: 0, rare: 0, epic: 0 };
    let total = 0;
    for (let k = 0; k < 6000; k++) {
      for (const d of generateDrops(seedOf(k), spots, new Set())) {
        tally[parseVariant(d.variant)!.rarity]! += 1;
        total += 1;
      }
    }
    for (const [r, w] of Object.entries(RARITY_WEIGHTS)) expect(Math.abs(tally[r]! / total - w / 100)).toBeLessThan(0.02);
  });

  it('favours variants the collector does not own yet', () => {
    const commons = allVariants().filter((v) => parseVariant(v)!.rarity === 'common');
    const missing = commons[7]!;
    const owned = new Set(allVariants().filter((v) => v !== missing));
    let commonDrops = 0;
    let hits = 0;
    for (let k = 0; k < 6000; k++) {
      for (const d of generateDrops(seedOf(k), spots, owned)) {
        if (parseVariant(d.variant)!.rarity !== 'common') continue;
        commonDrops += 1;
        if (d.variant === missing) hits += 1;
      }
    }
    const expected = UNOWNED_BOOST / (UNOWNED_BOOST + commons.length - 1);
    expect(Math.abs(hits / commonDrops - expected)).toBeLessThan(expected * 0.35);
  });
});
