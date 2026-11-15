import { describe, expect, it } from 'vitest';
import { MemoryCollectionStore, CollectionBook } from './book';
import { allVariants, isRewardVariant, parseVariant } from './collectibles';
import { BUNNY_VARIANT, EASTER_HATCH_AT, EGG_VARIANT, eggBubble, eggTilt, eggWobble, hatchGrants } from './easter';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

describe('the painted egg and the Easter hatch (OP-261, OP-262)', () => {
  it('hatches at midnight Eastern as Easter Sunday 2027 begins', () => {
    expect(new Date(EASTER_HATCH_AT).toISOString()).toBe('2027-03-28T04:00:00.000Z');
  });

  it('are pets of their own: one colourway, never sold, given or drawn as a prize', () => {
    for (const v of [EGG_VARIANT, BUNNY_VARIANT]) {
      expect(parseVariant(v)?.item.kind).toBe('pet');
      expect(isRewardVariant(v)).toBe(true);
    }
    expect(allVariants().filter((v) => v.startsWith('painted-egg~'))).toEqual([EGG_VARIANT]);
    expect(allVariants().filter((v) => v.startsWith('rainbow-bunny~'))).toEqual([BUNNY_VARIANT]);
  });

  it('rocks more as Easter nears, cracks on the last day and rests still once hatched (five dates on a fixed clock)', () => {
    const at = (left: number) => eggWobble(EASTER_HATCH_AT - left);
    const today = eggWobble(Date.UTC(2026, 10, 15, 12));
    expect(today).toEqual({ everyMs: 6000, degrees: 4, crack: 'none', hatched: false });
    expect(at(20 * DAY)).toEqual({ everyMs: 3000, degrees: 8, crack: 'none', hatched: false });
    expect(at(3 * DAY)).toEqual({ everyMs: 1200, degrees: 12, crack: 'none', hatched: false });
    expect(at(10 * HOUR)).toEqual({ everyMs: 700, degrees: 14, crack: 'light', hatched: false });
    expect(at(HOUR)).toEqual({ everyMs: 500, degrees: 16, crack: 'heavy', hatched: false });
    expect(eggWobble(EASTER_HATCH_AT + DAY).hatched).toBe(true);
    // Each step rocks at least as hard and as often as the one before.
    const steps = [today, at(20 * DAY), at(3 * DAY), at(10 * HOUR), at(HOUR)];
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.degrees).toBeGreaterThan(steps[i - 1]!.degrees);
      expect(steps[i]!.everyMs).toBeLessThan(steps[i - 1]!.everyMs);
    }
  });

  it('rocks at the start of each beat and is still between, and still once hatched', () => {
    const w = eggWobble(Date.UTC(2026, 10, 15, 12));
    const beat = 6000 * 1000;
    expect(Math.abs(eggTilt(w, beat + 120))).toBeGreaterThan(1);
    expect(Math.abs(eggTilt(w, beat + 120))).toBeLessThanOrEqual(w.degrees);
    expect(eggTilt(w, beat + 3000)).toBe(0);
    expect(eggTilt(eggWobble(EASTER_HATCH_AT + 1), beat + 120)).toBe(0);
  });

  it('says how many days are left when tapped, then that it hatched', () => {
    expect(eggBubble(EASTER_HATCH_AT - 10 * DAY)).toBe('Hatches in 10 days');
    expect(eggBubble(EASTER_HATCH_AT - 10 * DAY + 1)).toBe('Hatches in 10 days');
    expect(eggBubble(EASTER_HATCH_AT - 30 * HOUR)).toBe('Hatches in 2 days');
    expect(eggBubble(EASTER_HATCH_AT - 5 * HOUR)).toBe('Hatches tomorrow!');
    expect(eggBubble(EASTER_HATCH_AT + 12 * HOUR)).toBe('Hatched today!');
    expect(eggBubble(EASTER_HATCH_AT + 3 * DAY)).toBe('Hatched on Easter 2027');
  });

  it('grants the bunny to an egg holder from the hatch on, once, and never takes the egg', () => {
    expect(hatchGrants([EGG_VARIANT], EASTER_HATCH_AT - 1)).toEqual([]);
    expect(hatchGrants([EGG_VARIANT], EASTER_HATCH_AT)).toEqual([BUNNY_VARIANT]);
    expect(hatchGrants([EGG_VARIANT, BUNNY_VARIANT], EASTER_HATCH_AT + DAY)).toEqual([]);
    expect(hatchGrants(['bat~0'], EASTER_HATCH_AT + DAY)).toEqual([]);
  });

  it('adds the bunny when the collection is read: before, on and after hatch day, an offline owl, a late finder, an owl without the egg', () => {
    const book = new CollectionBook(new MemoryCollectionStore());
    const before = EASTER_HATCH_AT - DAY;
    // Holds the egg before Easter: no bunny yet.
    book.ensure('holder', 'UTC', before);
    book.grant('holder', EGG_VARIANT, 'granted', before);
    expect(book.owned('holder', 'UTC', before)).not.toContain(BUNNY_VARIANT);
    // On hatch day: the bunny, and the egg kept.
    const onDay = book.owned('holder', 'UTC', EASTER_HATCH_AT + HOUR);
    expect(onDay).toContain(BUNNY_VARIANT);
    expect(onDay).toContain(EGG_VARIANT);
    expect(book.owned('holder', 'UTC', EASTER_HATCH_AT + 2 * HOUR).filter((v) => v === BUNNY_VARIANT)).toHaveLength(1);
    // Offline on the day: the bunny on the next visit, weeks later.
    book.ensure('away', 'UTC', before);
    book.grant('away', EGG_VARIANT, 'granted', before);
    expect(book.owned('away', 'UTC', EASTER_HATCH_AT + 30 * DAY)).toEqual(expect.arrayContaining([EGG_VARIANT, BUNNY_VARIANT]));
    // A late finder: the egg after the hatch brings the bunny at once.
    const late = EASTER_HATCH_AT + 40 * DAY;
    book.ensure('late', 'UTC', late);
    book.grant('late', EGG_VARIANT, 'granted', late);
    expect(book.owned('late', 'UTC', late)).toEqual(expect.arrayContaining([EGG_VARIANT, BUNNY_VARIANT]));
    // Never had the egg: nothing.
    expect(book.owned('plain', 'UTC', EASTER_HATCH_AT + DAY)).not.toContain(BUNNY_VARIANT);
  });
});
