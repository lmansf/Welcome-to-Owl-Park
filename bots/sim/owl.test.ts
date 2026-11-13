/**
 * The bot owl and the kid's routes, held to the game's own rules: a quick check (pnpm test) that the sim
 * the playtest reads still moves as the game does, so a change to the movement code shows here first.
 */
import { describe, expect, it } from 'vitest';
import { GROUNDED, JUMP_RISE } from '@owl-park/shared';
import { COURSES, ROOMS } from '@owl-park/shared/rooms';
import { botRoom, owlAt, stepOwl, STEPS_PER_S } from './owl';
import { KID_BAR, onward } from './playtest';
import { progress, solve, type Goal } from './route';
import { surfaceAt, surfacesOf } from './surfaces';
import type { Action } from './kid';

const brush = botRoom(ROOMS['brush-1']!);

describe('the bot owl', () => {
  it('jumps as high as a jump carries the game’s owl, and comes back down on the floor', () => {
    // A spot on the floor with no ledge over it.
    const ss = surfacesOf(brush);
    const x = Array.from({ length: 160 }, (_, i) => 20 + i * 4).find((x) => !ss.some((s) => s.perch && x >= s.x0 - 40 && x <= s.x1 + 40))!;
    const o = owlAt(x, 0, 100_000);
    let peak = 0;
    let landed = false;
    for (let i = 0; i < 3 * STEPS_PER_S; i++) {
      stepOwl(brush, o, { way: 0, pressed: i === 0, held: i < STEPS_PER_S / 2 });
      peak = Math.max(peak, o.fl.air.z);
      if (i > 2 && o.fl.air.s === GROUNDED) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    expect(o.fl.air.z).toBe(0);
    expect(Math.abs(peak - JUMP_RISE)).toBeLessThan(6);
  });

  it('walks only where the room has floor: stops at the wall', () => {
    const o = owlAt(100, 0, 100_000);
    for (let i = 0; i < 2 * STEPS_PER_S; i++) stepOwl(brush, o, { way: -1, pressed: false, held: false });
    expect(o.x).toBeGreaterThanOrEqual(brush.room.walkable[0]![0]!.x - 1);
  });

  it('steps off a ledge’s end over a pit without falling there: it is in the air, as the game’s owl is, and falls from that height', () => {
    // The Updraft Canopy's low bough c12, over the crown's drop.
    const crown = botRoom(ROOMS['canopy-3']!);
    const c12 = surfacesOf(crown).find((s) => s.id === 'c12')!;
    const o = owlAt(c12.x1 - 2, c12.low, 100_000);
    let event: ReturnType<typeof stepOwl> = null;
    let steps = 0;
    // East off its end, nothing pressed: no fall while it is still up, then the drop's.
    for (; steps < 3 * STEPS_PER_S && event === null; steps++) {
      event = stepOwl(crown, o, { way: 1, pressed: false, held: false });
      if (event === null && o.x > c12.x1 + 2) expect(o.fl.air.s === GROUNDED && o.fl.air.z > 0, `at x ${Math.round(o.x)}`).toBe(false);
    }
    expect(event).toBe('fall');
    expect(o.fl.air.z).toBe(0);
    // It fell the bough's height first: longer than a step or two.
    expect(steps).toBeGreaterThan(STEPS_PER_S / 4);
  });

  it('falls into a course’s pit, as the game sends the owl back to its bench', () => {
    const pit = brush.room.course!.pits![0]!;
    // Over open water just inside the pond's near edge, clear of its rocks and islands (the first stone's bridge is not painted).
    const x = pit[0]!.x + 60;
    const o = owlAt(x, 40, 100_000);
    let fell = false;
    for (let i = 0; i < 2 * STEPS_PER_S && !fell; i++) fell = stepOwl(brush, o, { way: 0, pressed: false, held: false }) === 'fall';
    expect(fell).toBe(true);
  });
});

describe('the surfaces a kid stands on', () => {
  it('finds the floor between the pits and every ledge', () => {
    const ss = surfacesOf(brush);
    expect(ss.filter((s) => s.id.startsWith('floor')).length).toBeGreaterThanOrEqual(2);
    for (const p of brush.room.perches ?? []) expect(ss.some((s) => s.id === p.id), p.id).toBe(true);
    expect(surfaceAt(ss, 300, 0)?.id).toBe('floor0');
  });
});

describe('what a course needs', () => {
  const canopy = COURSES['canopy']!;
  const through = (room: string, door: string) => ROOMS[room]!.doors.find((d) => d.id === door)!.to!.room;

  it('counts a storey that only leads on as part of the course: every hatch up the canopy’s trunk is needed', () => {
    // The trunk is a storey a room, and only the first holds a bell: the two above lead on to the crown.
    for (const storey of ['canopy-2a', 'canopy-2b', 'canopy-2c']) expect(onward(canopy, ROOMS[storey]!, through(storey, 'hatch-up')), storey).toBe(true);
    expect(onward(canopy, ROOMS['canopy-1']!, through('canopy-1', 'to-trunk'))).toBe(true);
    expect(onward(canopy, ROOMS['canopy-3']!, through('canopy-3', 'hut'))).toBe(true);
  });

  it('leaves out a room that leads nowhere on, and every way back', () => {
    // The den under the roots holds a lost feather and one doorway.
    expect(onward(canopy, ROOMS['canopy-1']!, through('canopy-1', 'roots'))).toBe(false);
    for (const room of ['canopy-2a', 'canopy-2b', 'canopy-2c', 'canopy-3']) expect(onward(canopy, ROOMS[room]!, through(room, 'down')), room).toBe(false);
    // A room off an act that holds a part is needed, and its way back out is not.
    const brush = COURSES['brush']!;
    const side = ROOMS['brush-2']!.doors.find((d) => d.to?.room === 'brush-falls')!;
    expect(onward(brush, ROOMS['brush-2']!, side.to!.room)).toBe(true);
    for (const d of ROOMS['brush-falls']!.doors) if (d.to) expect(onward(brush, ROOMS['brush-falls']!, d.to.room), d.id).toBe(false);
  });
});

describe('a kid’s routes', () => {
  const act = (from: string, to: string, rate: number, mode: Action['mode'] = 'jump'): Action => ({ from, to, x: 0, mode, out: new Map([[to, rate], ['miss', 1 - rate]]) });
  const goal: Goal = { id: 'g', on: new Set(['c']) };

  it('takes 1/rate tries for a hop that lands rate of the time, and adds hops up', () => {
    const { v } = solve(['a', 'b', 'c'], new Map([['a', [act('a', 'b', 0.5)]], ['b', [act('b', 'c', 0.25)]]]), goal);
    expect(v.get('b')).toBeCloseTo(4);
    expect(v.get('a')).toBeCloseTo(6);
  });

  it('counts a walk off an edge as progress, though it costs no try', () => {
    const actions = new Map([['a', [act('a', 'b', 1, 'walk')]], ['b', [act('b', 'c', 0.5)]]]);
    const solved = solve(['a', 'b', 'c'], actions, goal);
    expect(progress(actions.get('a')![0]!, solved.v).rate).toBe(1);
  });

  it('holds courses to the kid bar of every other try', () => {
    expect(KID_BAR).toBe(0.5);
  });
});
