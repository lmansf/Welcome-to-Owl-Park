import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  DUPLICATE_FEATHERS,
  PRESENTS,
  STARTER_PACK,
  allVariants,
  duplicatePayout,
  equipSlotOf,
  filterOwnedWear,
  isTimeZone,
  isWear,
  normalizeTimeZone,
  parseVariant,
  putOn,
  sanitizeWear,
  variantName,
  variantsByRarity,
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
  it('has 59 wearables, 24 pets, 24 effects and 24 emotes: 1190 variants', () => {
    const by = (k: string) => CATALOGUE.filter((i) => i.kind === k).length;
    expect([by('wear'), by('pet'), by('fx'), by('emote')]).toEqual([59, 24, 24, 24]);
    expect(CATALOGUE.filter((i) => i.slot === 'head')).toHaveLength(36);
    expect(CATALOGUE.filter((i) => i.slot === 'face')).toHaveLength(11);
    expect(CATALOGUE.filter((i) => i.slot === 'neck')).toHaveLength(12);
    expect(allVariants()).toHaveLength(590 + 192 + 384 + 24);
    expect(new Set(allVariants()).size).toBe(1190);
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

  it("gives the park's presents as real variants, each with a note for the visitor", () => {
    expect(PRESENTS.map((p) => p.variant)).toContain('bat~0');
    for (const p of PRESENTS) {
      expect(parseVariant(p.variant)).not.toBeNull();
      expect(p.note.length).toBeGreaterThan(10);
    }
  });

  it('pays duplicates by rarity', () => {
    expect(duplicatePayout('beanie~2')).toBe(DUPLICATE_FEATHERS.common);
    expect(duplicatePayout('crown~0')).toBe(60);
    expect(duplicatePayout('nope')).toBe(0);
  });

  it('lists every variant by rarity, once each', () => {
    const by = variantsByRarity();
    const all = [...by.common, ...by.uncommon, ...by.rare, ...by.epic];
    expect(all.length).toBe(allVariants().length);
    expect(new Set(all).size).toBe(all.length);
    for (const v of by.epic) expect(parseVariant(v)!.rarity).toBe('epic');
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

  it('puts a variant on in its slot, or takes the slot off', () => {
    const on = putOn(DEFAULT_LOOK, 'head', 'crown~0');
    expect(on).toEqual({ ...DEFAULT_LOOK, wear: { head: 'crown~0' } });
    expect(putOn(on, 'pet', 'mouse~1').wear).toEqual({ head: 'crown~0', pet: 'mouse~1' });
    expect(putOn(on, 'head', 'crown~2').wear).toEqual({ head: 'crown~2' });
    // The last thing off leaves no wear at all.
    expect(putOn(on, 'head', null)).toEqual(DEFAULT_LOOK);
    expect(putOn(on, 'head', null)).not.toHaveProperty('wear');
  });

  it('relays emotes between peers only for catalogue emotes', () => {
    expect(isParkMessage({ t: 'emote', id: 'a', e: 'hoot' })).toBe(true);
    expect(isParkMessage({ t: 'emote', id: 'a', e: 'crown~0' })).toBe(false);
    expect(isParkMessage({ t: 'emote', id: 'a', e: '<b>hi</b>' })).toBe(false);
    // Phrases travel as numbers the list has; anything else is dropped.
    expect(isParkMessage({ t: 'say', id: 'a', n: 1 })).toBe(true);
    expect(isParkMessage({ t: 'say', id: 'a', n: 25 })).toBe(false);
    expect(isParkMessage({ t: 'say', id: 'a', n: 'Hi!' })).toBe(false);
    expect(isParkMessage({ t: 'say', id: '', n: 1 })).toBe(false);
  });
});

describe('time zones', () => {
  it('validates IANA zones and falls back to UTC', () => {
    expect(isTimeZone('America/New_York')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Asia/Kolkata')).toBe(true);
    for (const bad of ['Mars/Olympus_Mons', '', '../etc/passwd', 'a'.repeat(80), 42, null, 'America New York']) expect(isTimeZone(bad)).toBe(false);
    expect(normalizeTimeZone('Mars/Olympus_Mons')).toBe('UTC');
    expect(normalizeTimeZone('Europe/Paris')).toBe('Europe/Paris');
  });
});
