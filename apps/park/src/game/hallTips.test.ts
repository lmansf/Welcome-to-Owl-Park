import { describe, expect, it } from 'vitest';
import { HALL_MIDDLE, HALL_ROOM, ROOT_RUNS } from '@owl-park/shared/rooms';
import { pointInPolygon } from '@owl-park/shared';
import { HALL_WORDS } from '../ui/hallWords';
import { FIRST_FLIGHT, glidedOff, hallTipFor, hallTips, innerRuns, rootSpots } from './hallTips';

const tips = hallTips(HALL_ROOM, false);
const perch = (id: string) => HALL_ROOM.perches!.find((p) => p.id === id)!;

describe('a first flight where owls arrive (OP-347)', () => {
  it('picks the run nearest the middle on each side of the hall', () => {
    const inner = innerRuns();
    expect(inner).toHaveLength(2);
    const [west, east] = inner;
    expect(west!.steps[0]![1]).toBeLessThan(HALL_MIDDLE);
    expect(east!.steps[0]![1]).toBeGreaterThan(HALL_MIDDLE);
    for (const r of ROOT_RUNS) {
      const mine = r.steps[0]![1] < HALL_MIDDLE ? west! : east!;
      expect(Math.abs(mine.steps[0]![1] - HALL_MIDDLE)).toBeLessThanOrEqual(Math.abs(r.steps[0]![1] - HALL_MIDDLE));
    }
  });

  it('has a tip for the hop and one for the glide at each inner run, in the words of the device', () => {
    expect(tips.map((t) => t.id).sort()).toEqual(innerRuns().flatMap((r) => [`glide-${r.level}`, `hop-${r.level}`]).sort());
    for (const t of tips) expect(t.words).toBe(t.id.startsWith('hop') ? HALL_WORDS.hop.keys : HALL_WORDS.glide.keys);
    for (const t of hallTips(HALL_ROOM, true)) expect(t.words).toBe(t.id.startsWith('hop') ? HALL_WORDS.hop.touch : HALL_WORDS.glide.touch);
    expect(HALL_WORDS.hop.touch).not.toContain('Space');
    expect(HALL_WORDS.glide.touch).not.toContain('Space');
  });

  it('stands each tip over the art of its own root, inside the room', () => {
    for (const t of tips) {
      expect(t.at.y, t.id).toBeLessThan(t.spot.y - 100);
      expect(t.at.y, t.id).toBeGreaterThan(200);
      expect(t.at.x, t.id).toBe(t.spot.x);
    }
  });

  it('speaks of the hop to an owl on the floor by the first root or stood on it, and of the glide to one up on the knot or the stump', () => {
    for (const run of innerRuns()) {
      const log = perch(`root-${run.level}-log`);
      const knot = perch(`root-${run.level}-knot`);
      const stump = perch(`root-${run.level}-stump`);
      const mid = (p: typeof log) => ({ x: (p.area[0]!.x + p.area[1]!.x) / 2, y: (p.area[0]!.y + p.area[2]!.y) / 2 });
      // Walking up to the root from the hall's way in, and stood before it.
      expect(hallTipFor(tips, { x: mid(log).x, y: mid(log).y - 300 }, 0)?.id).toBe(`hop-${run.level}`);
      expect(hallTipFor(tips, { x: mid(log).x, y: mid(log).y + 80 }, 0)?.id).toBe(`hop-${run.level}`);
      // Stood on the root itself: still the way up.
      expect(hallTipFor(tips, mid(log), log.top)?.id).toBe(`hop-${run.level}`);
      // Up on the knot and on the stump: how to leave.
      expect(hallTipFor(tips, mid(knot), knot.top)?.id).toBe(`glide-${run.level}`);
      expect(hallTipFor(tips, mid(stump), stump.top)?.id).toBe(`glide-${run.level}`);
    }
  });

  it('says nothing to an owl far from the roots: at the way in, or out by the rim', () => {
    expect(hallTipFor(tips, HALL_ROOM.spawns['from-lobby']!, 0)).toBeNull();
    expect(hallTipFor(tips, { x: HALL_MIDDLE, y: HALL_ROOM.size.h - 300 }, 0)).toBeNull();
    expect(hallTipFor([], { x: HALL_MIDDLE, y: 1200 }, 0)).toBeNull();
  });

  it('leads the trail to the floor before each inner run\'s first root: walkable, clear of the root, a jump from its top', () => {
    const spots = rootSpots(HALL_ROOM);
    expect(spots).toHaveLength(2);
    for (const s of spots) {
      const middle = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      expect(HALL_ROOM.walkable.some((poly) => pointInPolygon(middle, poly)), 'on the floor').toBe(true);
      for (const p of HALL_ROOM.perches ?? []) expect(pointInPolygon(middle, p.area), `not on ${p.id}`).toBe(false);
      // The hop's tip speaks to an owl stood there.
      expect(hallTipFor(tips, middle, 0)?.id.startsWith('hop-')).toBe(true);
    }
  });

  it('counts a glide off the stump as the first flight, and not a hop between roots or a step off the first one', () => {
    const run = innerRuns()[0]!;
    const stump = perch(`root-${run.level}-stump`);
    const log = perch(`root-${run.level}-log`);
    expect(stump.top).toBeGreaterThanOrEqual(FIRST_FLIGHT.from);
    expect(log.top).toBeLessThan(FIRST_FLIGHT.from);
    const at = { x: stump.area[0]!.x, y: stump.area[0]!.y };
    expect(glidedOff(at, stump.top, { x: at.x - 600, y: at.y })).toBe(true);
    expect(glidedOff(at, stump.top, { x: at.x - 120, y: at.y })).toBe(false);
    expect(glidedOff(at, log.top, { x: at.x - 600, y: at.y })).toBe(false);
  });
});
