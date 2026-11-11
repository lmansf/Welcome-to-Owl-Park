import { describe, expect, it } from 'vitest';
import { courseParts } from '@owl-park/shared';
import { COURSES, ROOMS, groundOf } from '../rooms';
import { COURSE_WORDS } from '../ui/courseWords';
import { TIP_REACH, courseTips, tipFor, type CourseTip } from './courseTips';

const rooms = (id: string) => ROOMS[id];
const LIVE = Object.values(COURSES).filter((c) => !c.keeper && !c.test);
const tipsOf = (id: string, touch = false) => courseTips(COURSES[id]!, rooms, groundOf, touch);
const tip = (tips: CourseTip[], id: string) => tips.find((t) => t.id === id)!;

describe("a course's tips (OP-344)", () => {
  it('every course open to visitors says, in its first act, what it asks, the moves, what a fall does, and what a bench and a part are', () => {
    expect(LIVE.map((c) => c.id).sort()).toEqual(['brush', 'canopy', 'circuit']);
    for (const def of LIVE) {
      const tips = courseTips(def, rooms, groundOf, false);
      const first = def.acts[0]!;
      for (const id of ['start', 'pit', 'bench', 'part']) expect(tip(tips, id)?.room, `${def.id} ${id}`).toBe(first);
      // One tip for each thing, and every one stands inside its room.
      expect(new Set(tips.map((t) => t.id)).size).toBe(tips.length);
      for (const t of tips) {
        const r = ROOMS[t.room]!;
        expect(t.at.x, `${def.id} ${t.id}`).toBeGreaterThan(0);
        expect(t.at.x, `${def.id} ${t.id}`).toBeLessThan(r.size.w);
        expect(t.at.y, `${def.id} ${t.id}`).toBeGreaterThan(0);
        expect(t.at.y, `${def.id} ${t.id}`).toBeLessThan(groundOf(r));
      }
    }
  });

  it('the first tip says how many parts the course has and names the keys, or the buttons on a phone', () => {
    const keys = tip(tipsOf('canopy'), 'start');
    expect(keys.words).toBe(`Ring all ${courseParts(COURSES['canopy']!, rooms).length} bells, then reach the finish.\n${COURSE_WORDS.tips.moves.keys}`);
    expect(keys.words).toContain('Space to jump');
    expect(keys.words).toContain('Shift to dash');
    const touch = tip(tipsOf('canopy', true), 'start');
    expect(touch.words).toContain('Tap Jump to jump');
    expect(touch.words).not.toContain('Space');
    expect(tip(tipsOf('circuit'), 'start').words).toContain('Switch on all 3 breakers');
    expect(tip(tipsOf('brush'), 'start').words).toContain('Find all 4 seals');
    // It stands by the way in from the trail gate, over the owl's head.
    const way = ROOMS['canopy-1']!.spawns['from-gate']!;
    expect(keys.at.x).toBeGreaterThan(way.x);
    expect(keys.at.x - way.x).toBeLessThan(TIP_REACH.x);
    expect(keys.at.y).toBeLessThan(way.y - 200);
    expect(keys.top).toBe(0);
  });

  it('each new thing has its tip at the first of it: the gusts and the wind, the ink stones, the neon signs', () => {
    const canopy = tipsOf('canopy');
    const u = [...ROOMS['canopy-1']!.updrafts!].sort((a, b) => a.x - b.x)[0]!;
    expect(tip(canopy, 'updraft')).toMatchObject({ room: 'canopy-1', at: { x: u.x + u.w / 2 }, words: COURSE_WORDS.tips.updraft });
    expect(tip(canopy, 'wind').words).toBe(COURSE_WORDS.tips.wind);
    expect(tip(canopy, 'stone')).toBeUndefined();
    expect(tip(canopy, 'sign')).toBeUndefined();
    const brush = tipsOf('brush');
    const stone = [...ROOMS['brush-1']!.brushStones!].sort((a, b) => a.x0 - b.x0)[0]!;
    expect(tip(brush, 'stone')).toMatchObject({ room: 'brush-1', at: { x: (stone.x0 + stone.x1) / 2 }, words: COURSE_WORDS.tips.stone });
    expect(tip(brush, 'pit').words).toBe('Water sends you back to your checkpoint. Cross on the stones.');
    const circuit = tipsOf('circuit');
    expect(tip(circuit, 'sign')).toMatchObject({ room: 'circuit-1', words: COURSE_WORDS.tips.sign });
    expect(tip(circuit, 'pit').words).toContain('street');
    expect(tip(canopy, 'pit').words).toContain('Bramble');
  });

  it("a course with no line of its own for a fall says the plain one, and a thing up high has its tip hung under it", () => {
    const plain = courseTips({ ...COURSES['canopy']!, id: 'another' }, rooms, groundOf, false);
    expect(tip(plain, 'pit').words).toBe(COURSE_WORDS.tips.fall);
    // The canopy's first bell hangs 480 up: its tip is under it, where an owl comes to it from; a bench on the floor has its tip over it.
    const canopy = tipsOf('canopy');
    const g = groundOf(ROOMS['canopy-1']!);
    const bell = ROOMS['canopy-1']!.course!.parts![0]!;
    expect(bell.top).toBeGreaterThanOrEqual(300);
    expect(tip(canopy, 'part').at).toEqual({ x: bell.at.x, y: g - bell.top! + 150 });
    const bench = [...ROOMS['canopy-1']!.course!.benches!].sort((a, b) => a.at.x - b.at.x)[0]!;
    expect(bench.top ?? 0).toBe(0);
    expect(tip(canopy, 'bench').at).toEqual({ x: bench.at.x, y: g - 240 });
  });

  it('shows the one tip an owl is walking up to: the nearest across at about its height, none when it is far across or far below', () => {
    const tips: CourseTip[] = [
      { id: 'a', room: 'r', at: { x: 500, y: 430 }, top: 100, words: 'A' },
      { id: 'b', room: 'r', at: { x: 740, y: 530 }, top: 0, words: 'B' },
      { id: 'high', room: 'r', at: { x: 760, y: 440 }, top: 480, words: 'High' },
    ];
    // By A on the floor, with B on the floor not much further on: A, the one it stands at.
    expect(tipFor(tips, 510, 0)?.id).toBe('a');
    // Past the middle between them: B, though a thing up high stands right over it.
    expect(tipFor(tips, 700, 0)?.id).toBe('b');
    // Up near the high thing's height: its tip, not the floor's under it.
    expect(tipFor(tips, 700, 400)?.id).toBe('high');
    // At the very edge of the reach across, and just past it.
    expect(tipFor(tips, 740 + TIP_REACH.x, 0)?.id).toBe('b');
    expect(tipFor(tips, 761 + TIP_REACH.x, 0)).toBeNull();
    // A thing up high is out of reach of an owl too far below it, and in reach from just near enough.
    const alone = [tips[2]!];
    expect(tipFor(alone, 760, 480 - TIP_REACH.z - 1)).toBeNull();
    expect(tipFor(alone, 760, 480 - TIP_REACH.z)?.id).toBe('high');
    expect(tipFor([], 0, 0)).toBeNull();
  });

  it('in every course, an owl standing at the way in reads the first tip, and one at the bank where the walk first ends reads what a fall does', () => {
    for (const def of LIVE) {
      const room = ROOMS[def.acts[0]!]!;
      const tips = courseTips(def, rooms, groundOf, false).filter((t) => t.room === room.id);
      const way = room.spawns[def.gate.spawn]!;
      expect(tipFor(tips, way.x, 0)?.id, def.id).toBe('start');
      const bank = Math.min(...room.course!.pits!.map((p) => Math.min(...p.map((v) => v.x))));
      expect(tipFor(tips, bank - 20, 0)?.id, def.id).toBe('pit');
    }
  });
});
