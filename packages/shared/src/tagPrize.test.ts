import { describe, expect, it } from 'vitest';
import { PLAY_FEATHERS_PER_DAY } from './activities';
import { CollectionBook, MemoryCollectionStore } from './book';
import { FURNITURE } from './homes';
import { ITEMS } from './collectibles';
import { MemoryNestStore, NestBook, secureNestId } from './nestbook';
import { TAG_JACKPOT_FEATHERS, TAG_LOW_FEATHERS, TAG_PRIZE_LOOKS, TAG_PRIZE_PETS, isTagPrize, payTagPrize, tagTier } from './tagPrize';

/**
 * What a round of feather tag pays each owl in it (OP-434, Logan's words): "High tier gives preset pets
 * and customization unlocks, middle gives jackpot feathers or furniture unlocks, low gives feathers".
 * Feathers stay inside the day's play cap; one item prize a park day; guests keep items, earn no feathers.
 */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const DAY = 24 * 3600_000;
const A = 'c_owlaaaaa';
const cryptoBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function rig() {
  const book = new CollectionBook(new MemoryCollectionStore());
  const nests = new NestBook(new MemoryNestStore(), book, { newId: () => secureNestId(cryptoBytes), random: () => 0 });
  const pay = (tier: Parameters<typeof payTagPrize>[3], now = MON, guest = false) => payTagPrize(book, nests, A, tier, guest, now, () => 0);
  return { book, nests, pay };
}

describe('feather tag prizes (OP-434)', () => {
  it('names only pets and looks the catalogue has', () => {
    for (const v of [...TAG_PRIZE_PETS, ...TAG_PRIZE_LOOKS]) expect(ITEMS[v.split('~')[0]!], v).toBeTruthy();
  });

  it('puts a score in a tier', () => {
    expect(tagTier(0)).toBeNull();
    expect(tagTier(1)).toBe('low');
    expect(tagTier(39)).toBe('low');
    expect(tagTier(40)).toBe('middle');
    expect(tagTier(119)).toBe('middle');
    expect(tagTier(120)).toBe('high');
  });

  it('pays the low tier in feathers, inside the day’s play cap', () => {
    const { pay } = rig();
    expect(pay('low')).toMatchObject({ tier: 'low', prize: { kind: 'feathers', feathers: TAG_LOW_FEATHERS, jackpot: false } });
    let last = pay('low');
    for (let i = 0; i < PLAY_FEATHERS_PER_DAY; i++) last = pay('low');
    expect(last).toMatchObject({ prize: { kind: 'feathers', feathers: 0 }, capped: true });
  });

  it('gives the high tier a preset pet it lacks, then a look, one a park day, and a jackpot after', () => {
    const { book, pay } = rig();
    const first = pay('high');
    expect(first.prize.kind).toBe('item');
    const variant = first.prize.kind === 'item' ? first.prize.variant : '';
    expect(TAG_PRIZE_PETS).toContain(variant);
    expect(book.owned(A, undefined, MON)).toContain(variant);
    expect(pay('high')).toMatchObject({ prize: { kind: 'feathers', feathers: TAG_JACKPOT_FEATHERS, jackpot: true } });
    // Next day, and once every pet is held, a look.
    let day = MON;
    for (let i = 1; i < TAG_PRIZE_PETS.length; i++) {
      day += DAY;
      expect(pay('high', day).prize.kind).toBe('item');
    }
    day += DAY;
    const look = pay('high', day);
    expect(look.prize.kind === 'item' && TAG_PRIZE_LOOKS.includes(look.prize.variant)).toBe(true);
  });

  it('gives the middle tier a furniture piece it lacks, one a park day, and a jackpot after', () => {
    const { nests, pay } = rig();
    const first = pay('middle');
    expect(first.prize.kind).toBe('furniture');
    const item = first.prize.kind === 'furniture' ? first.prize.item : '';
    expect(FURNITURE.map((f) => f.id)).toContain(item);
    expect(nests.missingPiece(A, MON)).toBe(true);
    expect(pay('middle')).toMatchObject({ prize: { kind: 'feathers', feathers: TAG_JACKPOT_FEATHERS, jackpot: true } });
  });

  it('lets a guest keep items and earn no feathers (OP-428, Nov 18)', () => {
    const { pay } = rig();
    expect(pay('low', MON, true).prize).toEqual({ kind: 'none' });
    expect(pay('high', MON, true).prize.kind).toBe('item');
    expect(pay('middle', MON + DAY, true).prize.kind).toBe('furniture');
    expect(pay('middle', MON + DAY, true).prize).toEqual({ kind: 'none' });
  });

  it('checks a prize from the room server', () => {
    expect(isTagPrize({ kind: 'feathers', feathers: 5, jackpot: false })).toBe(true);
    expect(isTagPrize({ kind: 'item', variant: 'hedgehog~0', name: 'Hedgehog' })).toBe(true);
    expect(isTagPrize({ kind: 'none' })).toBe(true);
    expect(isTagPrize({ kind: 'feathers', feathers: -1, jackpot: false })).toBe(false);
    expect(isTagPrize({ kind: 'item', variant: '' })).toBe(false);
    expect(isTagPrize(null)).toBe(false);
  });
});
