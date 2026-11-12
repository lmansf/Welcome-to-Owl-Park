import { describe, expect, it } from 'vitest';
import { FLAP_RISE, JUMP_RISE } from '@owl-park/shared';
import { BAND_DOWN, BAND_UP, EASE_MS, LEAD_AT_REST, LEAD_FULL_SPEED, LEAD_MS, LEAD_SHARE, LEVEL_MS, SPEED_MS, eased, leadFor, levelFor, sideCamAt, sideCamStep, speedAlong, type CamOwl, type SideCam } from './sideCamera';

const VIEW = 1440;
const MOST = LEAD_SHARE * VIEW;
const owl = (over: Partial<CamOwl> = {}): CamOwl => ({ x: 1000, y: 770, z: 0, grounded: true, vx: 0, facing: 1, ...over });

/** The camera after `ms` of an owl doing `at(t)`, stepped `fps` times a second. */
function run(from: SideCam, at: (tMs: number) => CamOwl, ms: number, fps: number): SideCam {
  let cam = from;
  const dt = 1000 / fps;
  for (let t = dt; t <= ms + 1e-6; t += dt) cam = sideCamStep(cam, at(t), VIEW, dt);
  return cam;
}

describe('the ease (OP-351)', () => {
  it('covers nothing in no time, about two thirds in its own time, and never more than all', () => {
    expect(eased(0, 150)).toBe(0);
    expect(eased(150, 150)).toBeCloseTo(1 - 1 / Math.E, 6);
    expect(eased(10_000, 150)).toBeCloseTo(1, 6);
    expect(eased(16, 0)).toBe(1);
    expect(eased(-5, 150)).toBe(0);
  });

  it('is the same ease at any frame rate: two half steps are one whole step', () => {
    const one = eased(32, EASE_MS);
    const half = eased(16, EASE_MS);
    expect(half + (1 - half) * half).toBeCloseTo(one, 9);
  });
});

describe('the lead', () => {
  it('looks the way a still owl faces, a little', () => {
    expect(leadFor({ vx: 0, facing: 1 }, VIEW)).toBeCloseTo(MOST * LEAD_AT_REST, 6);
    expect(leadFor({ vx: 0, facing: -1 }, VIEW)).toBeCloseTo(-MOST * LEAD_AT_REST, 6);
    expect(leadFor({ vx: 12, facing: -1 }, VIEW)).toBeCloseTo(-MOST * LEAD_AT_REST, 6);
  });

  it('leads the way the owl travels, more the faster, and never more than its share of the screen', () => {
    const slow = leadFor({ vx: 100, facing: 1 }, VIEW);
    const fast = leadFor({ vx: LEAD_FULL_SPEED, facing: 1 }, VIEW);
    expect(slow).toBeGreaterThan(MOST * LEAD_AT_REST);
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeCloseTo(MOST, 6);
    expect(leadFor({ vx: 5000, facing: 1 }, VIEW)).toBeCloseTo(MOST, 6);
    // Travel wins over facing: a glide carried backwards leads backwards.
    expect(leadFor({ vx: -LEAD_FULL_SPEED, facing: 1 }, VIEW)).toBeCloseTo(-MOST, 6);
    // A narrow screen leads by less.
    expect(leadFor({ vx: LEAD_FULL_SPEED, facing: 1 }, 390)).toBeCloseTo(LEAD_SHARE * 390, 6);
  });
});

describe('the height held', () => {
  it('is where the owl stands, whatever it was', () => {
    expect(levelFor(0, { z: 200, grounded: true })).toBe(200);
    expect(levelFor(300, { z: 0, grounded: true })).toBe(0);
  });

  it('is held through a whole jump, and not through a jump with a flap on top', () => {
    expect(levelFor(0, { z: JUMP_RISE, grounded: false })).toBe(0);
    expect(levelFor(200, { z: 200 + JUMP_RISE, grounded: false })).toBe(200);
    expect(levelFor(0, { z: JUMP_RISE + FLAP_RISE, grounded: false })).toBeGreaterThan(60);
  });

  it('is held through a jump that stays in its band, climbs with what goes higher, and follows a fall', () => {
    expect(levelFor(0, { z: BAND_UP - 1, grounded: false })).toBe(0);
    expect(levelFor(0, { z: BAND_UP + 80, grounded: false })).toBe(80);
    expect(levelFor(300, { z: 300 - BAND_DOWN + 1, grounded: false })).toBe(300);
    expect(levelFor(300, { z: 100, grounded: false })).toBe(100 + BAND_DOWN);
  });
});

describe('the camera, stepped', () => {
  it('starts on the owl at its height, looking the way it faces', () => {
    const cam = sideCamAt(owl({ z: 160, facing: -1 }), VIEW);
    expect(cam).toEqual({ x: 1000 - MOST * LEAD_AT_REST, y: 770 - 160, lead: -MOST * LEAD_AT_REST, level: 160 });
  });

  it('comes to lead a walking owl by its share of the screen', () => {
    const speed = LEAD_FULL_SPEED;
    const walking = (t: number) => owl({ x: 1000 + (speed * t) / 1000, vx: speed });
    const cam = run(sideCamAt(owl(), VIEW), walking, 3000, 60);
    const at = walking(3000);
    // The view trails the point it makes for by the ease's own lag at this speed, no more.
    expect(cam.x - at.x).toBeGreaterThan(MOST - (speed * EASE_MS) / 1000 - 12);
    expect(cam.x - at.x).toBeLessThanOrEqual(MOST);
  });

  it('swings round unhurried when the owl turns: half way there in about its own time, not at once', () => {
    const right = run(sideCamAt(owl(), VIEW), () => owl({ vx: LEAD_FULL_SPEED }), 4000, 60);
    expect(right.lead).toBeCloseTo(MOST, 0);
    const turned = (ms: number) => run(right, () => owl({ vx: -LEAD_FULL_SPEED, facing: -1 }), ms, 60).lead;
    expect(turned(50)).toBeGreaterThan(MOST * 0.7);
    expect(turned(LEAD_MS)).toBeGreaterThan(-MOST * 0.5);
    expect(turned(LEAD_MS)).toBeLessThan(MOST * 0.5);
    expect(turned(4000)).toBeCloseTo(-MOST, 0);
  });

  it('holds its height through a hop on the spot, and climbs with a jump up onto a ledge', () => {
    // Up 100 and down again in 700 ms: under the band.
    const hop = (t: number) => owl({ z: Math.max(0, 100 * Math.sin((Math.PI * Math.min(t, 700)) / 700)), grounded: t >= 700 });
    let cam = sideCamAt(owl(), VIEW);
    let moved = 0;
    for (let t = 16; t <= 900; t += 16) {
      cam = sideCamStep(cam, hop(t), VIEW, 16);
      moved = Math.max(moved, Math.abs(cam.y - 770));
    }
    expect(moved).toBeLessThan(1);
    // Up onto a ledge 240 high and standing there: the view comes up to it.
    const up = run(sideCamAt(owl(), VIEW), (t) => owl({ z: Math.min(240, t * 0.6), grounded: t * 0.6 >= 240 }), 3000, 60);
    expect(up.level).toBeCloseTo(240, 0);
    expect(up.y).toBeCloseTo(770 - 240, 0);
  });

  it('goes down with a fall faster than it climbs', () => {
    const high = sideCamAt(owl({ z: 400 }), VIEW);
    const fallen = run(high, () => owl({ z: 0, grounded: false }), LEVEL_MS, 60);
    const low = sideCamAt(owl({ z: 0 }), VIEW);
    const risen = run(low, () => owl({ z: 400 + BAND_UP, grounded: false }), LEVEL_MS, 60);
    // In the same time the view has covered more of the way down than of the way up.
    expect(400 - fallen.level).toBeGreaterThan(risen.level + 40);
  });

  it('ends in the same place at 30 frames a second as at 120', () => {
    const flight = (t: number) => owl({ x: 1000 + 0.26 * t, vx: 260, z: Math.max(0, 180 * Math.sin((Math.PI * Math.min(t, 1500)) / 1500)), grounded: t >= 1500 });
    const slow = run(sideCamAt(owl(), VIEW), flight, 2000, 30);
    const quick = run(sideCamAt(owl(), VIEW), flight, 2000, 120);
    expect(Math.abs(slow.x - quick.x)).toBeLessThan(6);
    expect(Math.abs(slow.y - quick.y)).toBeLessThan(6);
    expect(Math.abs(slow.lead - quick.lead)).toBeLessThan(2);
  });
});

describe('the owl’s speed along', () => {
  it('comes to the speed the owl holds, and one rough frame does not throw it', () => {
    let v = 0;
    for (let i = 0; i < 60; i++) v = speedAlong(v, 4, 16);
    expect(v).toBeCloseTo(250, 0);
    // One frame four times as long with the same step: a stall, not a stop.
    const stalled = speedAlong(v, 4, 64);
    expect(stalled).toBeGreaterThan(150);
    expect(speedAlong(v, 0, 0)).toBe(v);
    // Standing: down to nothing in a few of its own times.
    let still = v;
    for (let t = 0; t < SPEED_MS * 6; t += 16) still = speedAlong(still, 0, 16);
    expect(Math.abs(still)).toBeLessThan(2);
  });
});
