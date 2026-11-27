import { describe, expect, it } from 'vitest';
import { courseParts } from '@owl-park/shared';
import { COURSES, ROOMS, groundOf } from '../rooms';
import { COURSE_WORDS, forDevice, type DeviceWords } from '../ui/courseWords';
import { TIP_REACH, courseName, courseTips, tipFor, type CourseTip } from './courseTips';

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

  it('the first tip names the course, so an owl coming in through its gate is told where it is (OP-475)', () => {
    expect(tip(tipsOf('brush'), 'start').words.split('\n')[0]).toBe('Brushstroke Bridges');
    expect(tip(tipsOf('brush', true), 'start').words.split('\n')[0]).toBe('Brushstroke Bridges');
    for (const def of LIVE) {
      const name = courseName(def);
      expect(name, def.id).toBeTruthy();
      expect(courseTips(def, rooms, groundOf, false).find((t) => t.id === 'start')!.words.split('\n')[0], def.id).toBe(name);
      // Said where the owl comes in: the first tip it reads, standing at the gate's spawn.
      const way = ROOMS[def.acts[0]!]!.spawns[def.gate.spawn]!;
      expect(tipFor(courseTips(def, rooms, groundOf, false), way.x, 0)?.id, def.id).toBe('start');
    }
  });

  it('the first tip says how many parts the course has and names the keys, or the buttons on a phone', () => {
    const keys = tip(tipsOf('canopy'), 'start');
    expect(keys.words).toBe(`Updraft Canopy\nRing all ${courseParts(COURSES['canopy']!, rooms).length} bells, then reach the finish.\n${COURSE_WORDS.tips.moves.keys}`);
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
    // The canopy's first bell hangs 480 up: its tip is under it, where an owl comes to it from; a bench low down has its tip over it.
    const canopy = tipsOf('canopy');
    const g = groundOf(ROOMS['canopy-1']!);
    const bell = ROOMS['canopy-1']!.course!.parts![0]!;
    expect(bell.top).toBeGreaterThanOrEqual(300);
    expect(tip(canopy, 'part').at).toEqual({ x: bell.at.x, y: g - bell.top! + 150 });
    const bench = [...ROOMS['canopy-1']!.course!.benches!].sort((a, b) => a.at.x - b.at.x)[0]!;
    // The first bench stands low, on the frond before the first rising air (OP-361): its tip is over it.
    expect(bench.top ?? 0).toBeLessThan(bell.top!);
    expect(tip(canopy, 'bench').at).toEqual({ x: bench.at.x, y: g - (bench.top ?? 0) - 240 });
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

/** A keyboard's words: none of them may reach a player on a touch screen (OP-498). */
const KEYBOARD = /\b(space|shift|press(es|ed)?|keys?|click|arrows?|enter|esc)\b/i;
/** The touch pad's buttons by their own names (hud.ts: the pad's aria-labels). */
const PAD_BUTTONS = ['Jump', 'Dash'];
const isDeviceWords = (v: unknown): v is DeviceWords => typeof v === 'object' && v !== null && typeof (v as DeviceWords).keys === 'string' && typeof (v as DeviceWords).touch === 'string';

/** Every line in COURSE_WORDS by its path: a keyboard/touch pair as one, a line said on every device as its words (a function's with sample numbers). */
function courseLines(v: unknown = COURSE_WORDS, path = 'COURSE_WORDS'): { path: string; pair?: DeviceWords; words?: string }[] {
  if (typeof v === 'string') return [{ path, words: v }];
  if (typeof v === 'function') {
    const out = (v as (...a: unknown[]) => unknown)(3, 5);
    return typeof out === 'string' ? [{ path, words: out }] : [];
  }
  if (isDeviceWords(v)) return [{ path, pair: v }];
  if (typeof v === 'object' && v !== null) return Object.entries(v).flatMap(([k, w]) => courseLines(w, `${path}.${k}`));
  return [];
}

describe('a course tip on a touch screen (OP-498)', () => {
  it('every line a course says with a keyboard has a touch line with no keyboard words, naming the pad by its buttons', () => {
    const pairs = courseLines().filter((l) => l.pair);
    // The moves at the way in and the walk stopped at a hazard's edge, at least.
    expect(pairs.map((l) => l.path)).toEqual(expect.arrayContaining(['COURSE_WORDS.tips.moves', 'COURSE_WORDS.jumpHere']));
    for (const { path, pair } of pairs) {
      expect(pair!.keys, path).toMatch(KEYBOARD);
      expect(pair!.touch, path).not.toMatch(KEYBOARD);
      expect(pair!.touch, path).toMatch(/\b(tap|hold)\b/i);
      expect(pair!.touch, path).toContain('Jump');
    }
    // The moves name both of the pad's buttons a course has, and nothing else as a button.
    for (const b of PAD_BUTTONS) expect(COURSE_WORDS.tips.moves.touch).toContain(b);
    expect(COURSE_WORDS.jumpHere.touch).toBe('Jump here to cross: tap Jump.');
  });

  it('every line a course says on every device has no keyboard words, so none is missing its touch line', () => {
    const shared = courseLines().filter((l) => l.words !== undefined);
    expect(shared.length).toBeGreaterThan(10);
    for (const { path, words } of shared) expect(words, path).not.toMatch(KEYBOARD);
  });

  it('the chooser picks the touch line when the device plays with the pad, and the keyboard line when not', () => {
    expect(forDevice(COURSE_WORDS.jumpHere, true)).toBe(COURSE_WORDS.jumpHere.touch);
    expect(forDevice(COURSE_WORDS.jumpHere, false)).toBe(COURSE_WORDS.jumpHere.keys);
    expect(forDevice(COURSE_WORDS.tips.moves, true)).toBe(COURSE_WORDS.tips.moves.touch);
    expect(forDevice(COURSE_WORDS.tips.moves, false)).toBe(COURSE_WORDS.tips.moves.keys);
  });

  it('in every course, Brushstroke Bridges among them, no tip on a touch screen has a keyboard word, and the moves are the touch ones', () => {
    const all = Object.values(COURSES);
    expect(all.map((c) => c.id)).toContain('brush');
    for (const def of all) {
      const touch = courseTips(def, rooms, groundOf, true);
      const keys = courseTips(def, rooms, groundOf, false);
      expect(touch.length, def.id).toBeGreaterThan(0);
      // The same tips at the same places; only the words for the moves differ.
      expect(touch.map((t) => [t.id, t.room, t.at]), def.id).toEqual(keys.map((t) => [t.id, t.room, t.at]));
      for (const t of touch) expect(t.words, `${def.id} ${t.id}`).not.toMatch(KEYBOARD);
      const start = touch.find((t) => t.id === 'start');
      if (!start) continue;
      expect(start.words, def.id).toContain(COURSE_WORDS.tips.moves.touch);
      expect(keys.find((t) => t.id === 'start')!.words, def.id).toContain(COURSE_WORDS.tips.moves.keys);
    }
  });
});
