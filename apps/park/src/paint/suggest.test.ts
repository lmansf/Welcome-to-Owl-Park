import { describe, expect, it } from 'vitest';
import { MAX_PERCH_TOP, type RoomDef } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { SUGGEST_RULES, columnTops, notYetLedges, playfieldAt, suggestLedges, type AlphaPicture } from './suggest';

// The ledge painter's Suggest (OP-156), on pictures made up as alpha arrays: 255 solid, 0 clear.

/** A w x h picture, solid where `solid(x, y)` says. */
function picture(w: number, h: number, solid: (x: number, y: number) => boolean | number): AlphaPicture {
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = solid(x, y);
    alpha[y * w + x] = typeof v === 'number' ? v : v ? 255 : 0;
  }
  return { alpha, width: w, height: h };
}

/** Placed at the room's second screen, a room px a picture px, its ground line at room y 200. */
const AT = { x: 1600, y: 0, scale: 1, ground: 200 };
/** The ground: solid from the ground line down. */
const ground = (y: number) => y >= 200;

describe('Suggest’s tops (OP-156)', () => {
  it('finds where clear turns solid going down, with enough clear above it', () => {
    // A column: clear, a slab from 40, clear again from 60 to 63 (four rows: too few), solid from 64,
    // clear from 80 to 89 (ten rows), solid from 90.
    const pic = picture(1, 120, (_, y) => (y >= 40 && y < 60) || (y >= 64 && y < 80) || y >= 90);
    expect(columnTops(pic)).toEqual([[40, 90]]);
    // Solid from the top row: nothing is known above it, so no top.
    expect(columnTops(picture(1, 20, () => true))).toEqual([[]]);
    // Alpha under SUGGEST_RULES.solid is clear; at it, solid.
    expect(columnTops(picture(1, 20, (_, y) => (y >= 10 ? SUGGEST_RULES.solid : SUGGEST_RULES.solid - 1)))).toEqual([[10]]);
    expect(columnTops(picture(1, 20, (_, y) => (y >= 10 ? SUGGEST_RULES.solid - 1 : 0)))).toEqual([[]]);
  });

  it('reads a canvas’s RGBA data as it reads a bare alpha channel', () => {
    const bare = picture(50, 220, (x, y) => (x >= 5 && x < 45 && y >= 120) || ground(y));
    const rgba = new Uint8ClampedArray(bare.width * bare.height * 4);
    for (let i = 0; i < bare.width * bare.height; i++) rgba.set([10, 20, 30, bare.alpha[i]!], i * 4);
    expect(columnTops({ alpha: rgba, width: bare.width, height: bare.height, stride: 4, offset: 3 })).toEqual(columnTops(bare));
  });
});

describe('Suggest’s ledges (OP-156)', () => {
  it('suggests a flat top as a ledge over the ground line, in room px; not the ground itself', () => {
    // A crate 60 wide whose top is 50 over the ground line, on the ground.
    const pic = picture(200, 240, (x, y) => (x >= 10 && x < 70 && y >= 150) || ground(y));
    expect(suggestLedges(pic, AT)).toEqual([{ x0: 1610, x1: 1670, top: 50 }]);
    // Placed elsewhere, the same crate is elsewhere.
    expect(suggestLedges(pic, { ...AT, x: 0, y: 20 })).toEqual([{ x0: 10, x1: 70, top: 30 }]);
  });

  it('keeps only runs minWidth room px wide or more, and nothing higher than a perch may be', () => {
    const pic = picture(300, 240, (x, y) => (x >= 10 && x < 49 && y >= 150) || (x >= 100 && x < 140 && y >= 150) || ground(y));
    expect(suggestLedges(pic, AT)).toEqual([{ x0: 1700, x1: 1740, top: 50 }]);
    // A tall picture: a roof higher than MAX_PERCH_TOP, and one just at it.
    const tall = picture(300, 700, (x, y) => (x >= 0 && x < 100 && y >= 600 - MAX_PERCH_TOP - 1) || (x >= 150 && x < 250 && y >= 600 - MAX_PERCH_TOP) || y >= 600);
    expect(suggestLedges(tall, { ...AT, ground: 600 })).toEqual([{ x0: 1750, x1: 1850, top: MAX_PERCH_TOP }]);
    // Just over the ground line is the ground (a kerb, the grass): under minTop is left out, at it is in.
    const kerb = picture(200, 240, (x, y) => (x < 80 && y >= 200 - SUGGEST_RULES.minTop + 1) || (x >= 120 && y >= 200 - SUGGEST_RULES.minTop) || ground(y));
    expect(suggestLedges(kerb, AT)).toEqual([{ x0: 1720, x1: 1800, top: SUGGEST_RULES.minTop }]);
  });

  it('joins neighbouring columns whose tops are within a few px, and splits a step higher than that', () => {
    // A ragged top, 0 or 2 px down column by column: one ledge at its median.
    const ragged = picture(200, 240, (x, y) => (x >= 20 && x < 120 && y >= 150 + (x % 2) * 2) || ground(y));
    expect(suggestLedges(ragged, AT)).toEqual([{ x0: 1620, x1: 1720, top: 48 }]);
    // A step of 4 px halfway: two ledges.
    const step = picture(200, 240, (x, y) => (x >= 20 && x < 120 && y >= (x < 70 ? 150 : 154)) || ground(y));
    expect(suggestLedges(step, AT)).toEqual([
      { x0: 1620, x1: 1670, top: 50 },
      { x0: 1670, x1: 1720, top: 46 },
    ]);
  });

  it('passes over a column missing from a top, but not two', () => {
    const gap = (missing: number[]) => picture(200, 240, (x, y) => (x >= 20 && x < 120 && !missing.includes(x) && y >= 150) || ground(y));
    expect(suggestLedges(gap([60]), AT)).toEqual([{ x0: 1620, x1: 1720, top: 50 }]);
    expect(suggestLedges(gap([60, 61]), AT)).toEqual([
      { x0: 1620, x1: 1660, top: 50 },
      { x0: 1662, x1: 1720, top: 50 },
    ]);
  });

  it('finds a shelf over a lower top in the same columns, each its own ledge', () => {
    // A shelf 10 thick at 100 over the ground, sky under it, and a crate under that at 40.
    const pic = picture(200, 240, (x, y) => (x >= 20 && x < 120 && y >= 100 && y < 110) || (x >= 40 && x < 100 && y >= 160) || ground(y));
    expect(suggestLedges(pic, AT)).toEqual([
      { x0: 1620, x1: 1720, top: 100 },
      { x0: 1640, x1: 1700, top: 40 },
    ]);
  });

  it('scales a picture painted bigger than the room (2048 px a screen) down to room px', () => {
    const s = 1600 / 2048;
    // A top 64 picture px wide (50 room px) at picture row 128, the ground line at room y 200 (picture row 256).
    const pic = picture(300, 300, (x, y) => (x >= 128 && x < 192 && y >= 128) || y >= 256);
    expect(suggestLedges(pic, { x: 3200, y: 0, scale: s, ground: 200 })).toEqual([{ x0: 3300, x1: 3350, top: 100 }]);
    // 48 picture px is 37.5 room px: too narrow.
    const narrow = picture(300, 300, (x, y) => (x >= 128 && x < 176 && y >= 128) || y >= 256);
    expect(suggestLedges(narrow, { x: 3200, y: 0, scale: s, ground: 200 })).toEqual([]);
  });

  it('leaves out what a ledge of the draft already covers', () => {
    const found = [
      { x0: 100, x1: 200, top: 50 },
      { x0: 300, x1: 400, top: 120 },
      { x0: 500, x1: 600, top: 80 },
    ];
    const ledges = [
      // Over most of the first, a few px off its height: covered.
      { x0: 90, x1: 170, top: 55 },
      // Over all of the second but too far below it: not covered.
      { x0: 280, x1: 420, top: 110 },
      // Over less than half of the third: not covered.
      { x0: 560, x1: 700, top: 80 },
    ];
    expect(notYetLedges(found, ledges)).toEqual(found.slice(1));
  });
});

describe('the playfield under the camera (OP-156)', () => {
  it('is the tile of the room’s screen that scrolls with the room, not its sky or middle distance', () => {
    const tree = ROOMS['l1']!;
    expect(playfieldAt(tree, 2400)?.key).toBe('tree-l1-0-play');
    expect(playfieldAt(tree, 0)?.key).toBe('tree-l1-w1-play');
    expect(playfieldAt(tree, 6399)?.key).toBe('tree-l1-e2-play');
    expect(playfieldAt(tree, 6400)).toBeNull();
    const plain = { ...ROOMS['hub']!, backgrounds: undefined, background: 'painting' } as unknown as RoomDef;
    expect(playfieldAt(plain, 800)?.key).toBe('painting');
  });
});
