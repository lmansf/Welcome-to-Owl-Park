import { describe, expect, it } from 'vitest';
import { type Rect, type Vec2, VOTABLE_REALMS, interactablesIn, voteShares } from '@owl-park/shared';
import { HALL_ROOM, ROOT_RUNS } from '@owl-park/shared/rooms';
import { guardianShade } from './guardian';
import { DESK_WORDS, VOTE_DESK, VOTE_DESK_ROOM, deskBox, deskLines, deskRows } from './voteDesk';

/** How far a point lies from a box (0 inside it). */
const fromBox = (p: Vec2, b: Rect) => Math.hypot(Math.max(b.x - p.x, 0, p.x - (b.x + b.w)), Math.max(b.y - p.y, 0, p.y - (b.y + b.h)));
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the vote desk in the Great Hollow (OP-288)', () => {
  const box = deskBox();
  /** The floor the desk's board and foot take, with an owl's room either side. */
  const footprint: Rect = { x: box.x - 40, y: box.y, w: box.w + 80, h: box.h + 60 };

  it('stands in the hall, off the heart’s rising air, the moonbeams, the leaf piles and where owls arrive', () => {
    expect(VOTE_DESK_ROOM).toBe('m3-hall');
    for (const t of HALL_ROOM.thermals ?? []) expect(fromBox(t.pos, footprint), t.id).toBeGreaterThan(t.r + 60);
    for (const thing of interactablesIn('m3-hall')) expect(fromBox(thing.pos, footprint), thing.id).toBeGreaterThan(120);
    for (const [name, at] of Object.entries(HALL_ROOM.spawns)) expect(fromBox(at, footprint), name).toBeGreaterThan(150);
    for (const [i, spot] of (HALL_ROOM.spots ?? []).entries()) expect(fromBox(spot, footprint), `spot ${i}`).toBeGreaterThan(100);
  });

  it('stands clear of the guardian’s picture, the root runs and every doorway', () => {
    for (const shade of guardianShade()) expect(overlaps(footprint, shade)).toBe(false);
    for (const run of ROOT_RUNS)
      for (const [kind, x] of run.steps) expect(fromBox({ x, y: 1258 }, footprint), `${run.level} ${kind}`).toBeGreaterThan(200);
    for (const door of HALL_ROOM.doors) expect(overlaps(footprint, door.rect), door.id).toBe(false);
  });

  it('shows each realm’s share in whole percents by the names visitors know, never a count', () => {
    const shares = voteShares({ grove: 7, market: 2, glass: 1 }, VOTABLE_REALMS);
    expect(deskRows(shares)).toEqual([
      { realm: 'grove', name: 'The treehouse clearing', pct: 70 },
      { realm: 'market', name: 'The neon street', pct: 20 },
      { realm: 'glass', name: 'The glass street', pct: 10 },
    ]);
    const lines = deskLines(shares);
    expect(lines).toEqual([
      DESK_WORDS.title,
      DESK_WORDS.sub,
      'The treehouse clearing 70%',
      'The neon street 20%',
      'The glass street 10%',
      DESK_WORDS.call,
    ]);
    // The counts behind the shares appear nowhere on it.
    expect(lines.join(' ')).not.toMatch(/\b(7|2|1) (votes?|owls?)\b/);
    expect(lines.join(' ')).not.toMatch(/\bvotes?\b.*\d/);
  });

  it('says so when nobody has voted this month', () => {
    expect(deskRows({})).toEqual([]);
    expect(deskRows(null)).toEqual([]);
    expect(deskLines({})).toEqual([DESK_WORDS.title, DESK_WORDS.sub, DESK_WORDS.empty, DESK_WORDS.call]);
  });

  it('keeps a realm the shares leave out at 0%, and never shows past 100%', () => {
    expect(deskRows({ grove: 100 }).map((r) => r.pct)).toEqual([100, 0, 0]);
    expect(deskRows({ grove: 140, market: -3, glass: 0 }).map((r) => r.pct)).toEqual([100, 0, 0]);
  });

  it('has a board big enough for its words, standing up from its foot', () => {
    expect(box).toEqual({ x: VOTE_DESK.at.x - VOTE_DESK.w / 2, y: VOTE_DESK.at.y - VOTE_DESK.h, w: VOTE_DESK.w, h: VOTE_DESK.h });
  });
});
