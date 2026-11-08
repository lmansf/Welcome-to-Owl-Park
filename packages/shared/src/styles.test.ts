import { describe, expect, it } from 'vitest';
import { CATALOGUE, HUB_STYLE, SEASONAL_STYLE } from './collectibles';
import { FURNITURE, furnitureGift, type Furniture } from './homes';
import { STYLE_SETS, capstonesDue, setProgress, styleOf, styleSetProblems, type StyleSet } from './styles';

/** Drop 1's twelve things (COLLECTIBLES.md). */
const DROP_1 = ['bat-headband', 'candy-corn-cap', 'earmuffs', 'holly-crown', 'mummy-wrap', 'jack-o-lantern-shades', 'candy-necklace', 'vampire-collar', 'ghost', 'pumpkin-sprite', 'snow-bunny', 'black-kitten'];

// The real sets come with the realms: these made-up pieces stand in for a realm's new furniture.
const piece = (id: string, extra: Partial<Furniture> = {}): Furniture => ({ id, name: id, place: 'floor', art: `decor-${id}`, size: { w: 100, h: 100 }, style: SEASONAL_STYLE, ...extra });
const SNOW_RUG = piece('test-snow-rug');
const LANTERN = piece('test-lantern', { capstone: true });
const CATALOGUE_PLUS = [...FURNITURE, SNOW_RUG, LANTERN];
const SEASON: StyleSet = { style: SEASONAL_STYLE, name: 'First frost', collectibles: ['earmuffs', 'snow-bunny'], furniture: ['test-snow-rug'], capstone: 'test-lantern' };

describe('styles', () => {
  it("gives every collectible and piece of furniture a style: the park's own, Drop 1 seasonal", () => {
    expect(CATALOGUE.filter((i) => styleOf(i) === SEASONAL_STYLE).map((i) => i.id).sort()).toEqual([...DROP_1].sort());
    expect(CATALOGUE.filter((i) => styleOf(i) !== SEASONAL_STYLE).every((i) => styleOf(i) === HUB_STYLE)).toBe(true);
    expect(FURNITURE.every((f) => styleOf(f) === HUB_STYLE && !f.capstone)).toBe(true);
  });

  it('lists only sets that hold together', () => {
    expect(styleSetProblems(STYLE_SETS)).toEqual([]);
    expect(styleSetProblems([SEASON], CATALOGUE_PLUS)).toEqual([]);
  });
});

describe('progress on a set', () => {
  it('counts any colourway of a collectible, and each thing once', () => {
    const [p] = setProgress(['earmuffs~3', 'earmuffs~7', 'hoot'], ['test-snow-rug', 'rug'], [SEASON]);
    expect(p).toMatchObject({ style: SEASONAL_STYLE, name: 'First frost', have: 2, of: 3, done: false, capstone: { id: 'test-lantern', owned: false } });
    expect(p!.pieces).toEqual([
      { id: 'earmuffs', kind: 'collectible', name: 'Earmuffs', owned: true },
      { id: 'snow-bunny', kind: 'collectible', name: 'Snow Bunny', owned: false },
      { id: 'test-snow-rug', kind: 'furniture', name: 'test-snow-rug', owned: true },
    ]);
  });

  it('is done once the owl has everything, and the capstone is due until it is given', () => {
    const owned = ['earmuffs~0', 'snow-bunny~2'];
    expect(setProgress(owned, ['test-snow-rug'], [SEASON])[0]).toMatchObject({ have: 3, of: 3, done: true });
    expect(capstonesDue(owned, ['test-snow-rug'], [SEASON])).toEqual(['test-lantern']);
    expect(capstonesDue(owned, ['test-snow-rug', 'test-lantern'], [SEASON])).toEqual([]);
    expect(capstonesDue(owned, [], [SEASON])).toEqual([]);
    expect(capstonesDue(owned, ['test-snow-rug'], [])).toEqual([]);
  });

  it('names the pieces as visitors see them, and the capstone by its art', () => {
    const set: StyleSet = { style: HUB_STYLE, name: 'Park', collectibles: ['acorn-cap'], furniture: ['armchair'], capstone: 'bookshelf' };
    const [p] = setProgress([], [], [set]);
    expect(p!.pieces.map((x) => x.name)).toEqual(['Acorn Cap', 'Armchair']);
    expect(p!.capstone).toEqual({ id: 'bookshelf', name: 'Bookshelf', art: 'decor-bookshelf', owned: false });
  });
});

describe('what is wrong with a set', () => {
  const problems = (set: Partial<StyleSet>, more: StyleSet[] = []) => styleSetProblems([{ ...SEASON, ...set }, ...more], CATALOGUE_PLUS);

  it('finds things that do not exist or are of another style', () => {
    expect(problems({ collectibles: ['earmuffs', 'no-such-hat'] })).toEqual(['seasonal: no collectible no-such-hat']);
    expect(problems({ collectibles: ['earmuffs', 'crown'] })).toEqual(['seasonal: crown is the hub style']);
    expect(problems({ furniture: ['test-snow-rug', 'armchair'] })).toEqual(['seasonal: armchair is the hub style']);
    expect(problems({ furniture: ['no-such-chair'] })).toEqual(['seasonal: no piece of furniture no-such-chair']);
    expect(problems({ collectibles: ['earmuffs', 'earmuffs'] })).toEqual(['seasonal: earmuffs twice']);
    expect(problems({ collectibles: ['constructor'] })).toEqual(['seasonal: no collectible constructor']);
  });

  it('holds a capstone to its rules', () => {
    expect(problems({ furniture: ['test-lantern'], capstone: 'test-lantern' })).toEqual(['seasonal: test-lantern is a capstone, not a piece to collect']);
    expect(problems({ capstone: 'armchair' })).toEqual(['seasonal: armchair is not marked as a capstone', 'seasonal: the capstone armchair is the hub style', 'test-lantern: marked as a capstone, but no set gives it']);
    expect(problems({ capstone: 'nothing' })).toEqual(['seasonal: no piece of furniture nothing for the capstone', 'test-lantern: marked as a capstone, but no set gives it']);
    const rug = piece('rug', { capstone: true, style: HUB_STYLE });
    expect(styleSetProblems([{ style: HUB_STYLE, name: 'Park', collectibles: ['crown'], furniture: [], capstone: 'rug' }], [rug])).toEqual(['hub: the capstone rug is a starter piece']);
  });

  it('wants one set per style, a name, something to collect, and each capstone in one set', () => {
    expect(problems({}, [{ ...SEASON, name: 'Again' }])).toEqual(['seasonal: a second set for this style', 'test-lantern: the capstone of two sets']);
    expect(problems({ name: ' ' })).toEqual(['seasonal: no name']);
    expect(problems({ collectibles: [], furniture: [] })).toEqual(['seasonal: nothing to collect']);
    expect(styleSetProblems([], CATALOGUE_PLUS)).toEqual(['test-lantern: marked as a capstone, but no set gives it']);
  });
});

describe("the day's gift and capstones", () => {
  it('never gives a capstone, and pays feathers once only capstones are missing', () => {
    for (const r of [0, 0.5, 0.999999]) expect(furnitureGift([], () => r, [LANTERN, SNOW_RUG])).toEqual({ item: 'test-snow-rug', feathers: 0 });
    expect(furnitureGift([...FURNITURE.map((f) => f.id), 'test-snow-rug'], () => 0, CATALOGUE_PLUS)).toMatchObject({ item: null });
  });
});
