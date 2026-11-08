/**
 * The bot owl and the kid's routes, held to the game's own rules: a quick check (pnpm test) that the sim
 * the playtest reads still moves as the game does, so a change to the movement code shows here first.
 */
import { describe, expect, it } from 'vitest';
import { GROUNDED, JUMP_RISE } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { botRoom, owlAt, stepOwl, STEPS_PER_S } from './owl';
import { KID_BAR } from './playtest';
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

  it('falls into a course’s pit, as the game sends the owl back to its bench', () => {
    const pit = brush.room.course!.pits![0]!;
    const x = (pit[0]!.x + pit[1]!.x) / 2;
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
