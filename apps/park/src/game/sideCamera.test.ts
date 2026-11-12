import { describe, expect, it } from 'vitest';
import { FLAP_RISE, GRAVITY, JUMP_RISE, MAX_FALL } from '@owl-park/shared';
import { BAND_DOWN, BAND_UP, EASE_MS, LEAD_AT_REST, LEAD_FULL_SPEED, LEAD_MS, LEAD_SHARE, LEVEL_MS, LIFT_BAND, SPEED_MS, STEP_MOST_MS, eased, leadFor, levelFor, sideCamAt, sideCamStep, speedAlong, type CamOwl, type SideCam } from './sideCamera';

const VIEW = 1440;
/** A phone held upright: a course is this many room px across on it. */
const PHONE = 442;
const MOST = LEAD_SHARE * VIEW;
const GROUND = 770;
const owl = (over: Partial<CamOwl> = {}): CamOwl => ({ x: 1000, y: GROUND, z: 0, grounded: true, vx: 0, vz: 0, lifted: false, facing: 1, ...over });
const inAir = (z: number, lifted = false) => ({ z, grounded: false, lifted });
const standing = (z: number) => ({ z, grounded: true, lifted: false });

/**
 * The camera after `ms` of an owl doing `at(t)`, stepped `fps` times a second on a screen `view` wide, and
 * what `watch` made of each step. The owl's speed up or down is read off how its height changes, as the
 * flight gives it to the park.
 */
function run(from: SideCam, at: (tMs: number) => CamOwl, ms: number, fps: number, view = VIEW, watch?: (cam: SideCam, o: CamOwl, tMs: number) => void): SideCam {
  let cam = from;
  const dt = 1000 / fps;
  let was = at(0);
  for (let t = dt; t <= ms + 1e-6; t += dt) {
    const o = at(t);
    const flying = { ...o, vz: o.grounded ? 0 : ((o.z - was.z) / dt) * 1000 };
    cam = sideCamStep(cam, flying, view, dt);
    watch?.(cam, flying, t);
    was = o;
  }
  return cam;
}

/** An owl that steps off a ledge `from` high at t = 0 and falls as the park's owls fall, onto ground at `onto`. */
function falling(from: number, onto = 0): (tMs: number) => CamOwl {
  return (tMs) => {
    // Stepped finely from the top each time: the rules are asked at any frame rate, the fall is the same fall.
    let z = from;
    let vz = 0;
    for (let t = 0; t < tMs && z > onto; t += 1) {
      vz = Math.max(-MAX_FALL, vz - GRAVITY / 1000);
      z = Math.max(onto, z + vz / 1000);
    }
    return owl({ z, grounded: z <= onto });
  };
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
    expect(levelFor(0, standing(200))).toBe(200);
    expect(levelFor(300, standing(0))).toBe(0);
  });

  it('is held through a whole jump, and not through a jump with a flap on top', () => {
    expect(levelFor(0, inAir(JUMP_RISE))).toBe(0);
    expect(levelFor(200, inAir(200 + JUMP_RISE))).toBe(200);
    expect(levelFor(0, inAir(JUMP_RISE + FLAP_RISE))).toBeGreaterThan(60);
  });

  it('is held through a jump that stays in its band, climbs with what goes higher, and follows a fall', () => {
    expect(levelFor(0, inAir(BAND_UP - 1))).toBe(0);
    expect(levelFor(0, inAir(BAND_UP + 80))).toBe(80);
    expect(levelFor(300, inAir(300 - BAND_DOWN + 1))).toBe(300);
    expect(levelFor(300, inAir(100))).toBe(100 + BAND_DOWN);
  });

  it('in rising air climbs once the owl is a little over it, long before a jump would move it (OP-352)', () => {
    expect(LIFT_BAND).toBeLessThan(BAND_UP / 2);
    expect(levelFor(0, inAir(LIFT_BAND - 1, true))).toBe(0);
    expect(levelFor(0, inAir(LIFT_BAND + 80, true))).toBe(80);
    // The same height without the air under it: still inside a jump's band.
    expect(levelFor(0, inAir(LIFT_BAND + 80))).toBe(0);
    // Out of the column with the wings spread, the height it was taken to is held until it sinks under it.
    expect(levelFor(400, inAir(400 + LIFT_BAND + 30))).toBe(400);
  });
});

describe('the camera, stepped', () => {
  it('starts on the owl at its height, looking the way it faces', () => {
    const cam = sideCamAt(owl({ z: 160, facing: -1 }), VIEW);
    expect(cam).toEqual({ x: 1000 - MOST * LEAD_AT_REST, y: GROUND - 160, lead: -MOST * LEAD_AT_REST, level: 160 });
  });

  it('leads a walking owl by its whole share of the screen, with nothing trailing (OP-352)', () => {
    const speed = LEAD_FULL_SPEED;
    const walking = (t: number) => owl({ x: 1000 + (speed * t) / 1000, vx: speed });
    const cam = run(sideCamAt(owl(), VIEW), walking, 4000, 60);
    expect(cam.x - walking(4000).x).toBeGreaterThan(MOST - 1);
    expect(cam.x - walking(4000).x).toBeLessThanOrEqual(MOST + 1e-6);
  });

  it('leads it by the same at ten frames a second as at a hundred and forty-four, and on a phone held upright', () => {
    const speed = LEAD_FULL_SPEED;
    const walking = (t: number) => owl({ x: 1000 + (speed * t) / 1000, vx: speed });
    for (const view of [VIEW, PHONE]) {
      for (const fps of [10, 30, 60, 144]) {
        const cam = run(sideCamAt(owl(), view), walking, 4000, fps, view);
        // An ease alone trails a walk by its speed for the ease's own time, 39 px: over half a phone's 71 px of lead.
        expect(Math.abs(cam.x - walking(4000).x - LEAD_SHARE * view), `${view} px wide at ${fps} frames a second`).toBeLessThan(1.5);
      }
    }
    expect((speed * EASE_MS) / 1000).toBeGreaterThan((LEAD_SHARE * PHONE) / 2);
  });

  it('eases a start and a stop: the view neither jumps off with the owl nor stops dead with it', () => {
    // The owl's speed comes to the camera averaged (speedAlong), as the park gives it.
    let cam = sideCamAt(owl(), VIEW);
    let vx = 0;
    let x = 1000;
    const dt = 1000 / 60;
    const step = (speed: number) => {
      const was = cam.x;
      const dx = (speed * dt) / 1000;
      x += dx;
      vx = speedAlong(vx, dx, dt);
      cam = sideCamStep(cam, owl({ x, vx }), VIEW, dt);
      return cam.x - was;
    };
    // The first frame of a walk: the owl has gone a walk's step, the view much less than that.
    const first = step(LEAD_FULL_SPEED);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(((LEAD_FULL_SPEED * dt) / 1000) * 0.6);
    for (let i = 0; i < 240; i++) step(LEAD_FULL_SPEED);
    // The first frame of a stop: the owl has not moved, the view is still going.
    expect(step(0)).toBeGreaterThan(((LEAD_FULL_SPEED * dt) / 1000) * 0.4);
    // And it comes to rest ahead of the owl by a still owl's lead.
    for (let i = 0; i < 600; i++) step(0);
    expect(cam.x - x).toBeCloseTo(MOST * LEAD_AT_REST, 0);
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
    let moved = 0;
    run(sideCamAt(owl(), VIEW), hop, 900, 60, VIEW, (cam) => {
      moved = Math.max(moved, Math.abs(cam.y - GROUND));
    });
    expect(moved).toBeLessThan(1e-6);
    // Up onto a ledge 240 high and standing there: the view comes up to it.
    const up = run(sideCamAt(owl(), VIEW), (t) => owl({ z: Math.min(240, t * 0.6), grounded: t * 0.6 >= 240 }), 3000, 60);
    expect(up.level).toBeCloseTo(240, 0);
    expect(up.y).toBeCloseTo(GROUND - 240, 0);
  });

  it('goes down with a fall faster than it climbs', () => {
    const high = sideCamAt(owl({ z: 400 }), VIEW);
    const fallen = run(high, () => owl({ z: 0, grounded: false }), LEVEL_MS, 60);
    const low = sideCamAt(owl({ z: 0 }), VIEW);
    const risen = run(low, () => owl({ z: 400 + BAND_UP, grounded: false }), LEVEL_MS, 60);
    // In the same time the view has covered more of the way down than of the way up.
    expect(400 - fallen.level).toBeGreaterThan(risen.level + 40);
  });

  it('is with a falling owl all the way down: never more than its band under the height held (OP-352)', () => {
    // The height was eased once and the view to it once more: at a fall's full speed that left the owl
    // 300 px under the middle of the view, at the foot of a phone held sideways.
    expect((MAX_FALL * 2 * EASE_MS) / 1000).toBeGreaterThan(300);
    for (const fps of [10, 30, 60, 144]) {
      for (const from of [150, 540, 900]) {
        let under = 0;
        let off = 0;
        const cam = run(sideCamAt(owl({ z: from }), VIEW), falling(from), 2500, fps, VIEW, (c, o) => {
          // In the air: where it lands the height is eased to it, so the view settles and does not stop dead.
          if (!o.grounded) under = Math.max(under, c.level - o.z);
          off = Math.max(off, Math.abs(c.y - (GROUND - c.level)));
        });
        expect(under, `from ${from} at ${fps} frames a second`).toBeLessThanOrEqual(BAND_DOWN + 1e-6);
        // The view's own height is the height held, with nothing trailing it.
        expect(off, `from ${from} at ${fps} frames a second`).toBeLessThan(1e-6);
        // Landed and settled: on the owl.
        expect(cam.level).toBeCloseTo(0, 1);
      }
    }
  });

  it('leaves the band with the owl, not ahead of it: the first frame of a fall moves the view by no more than the owl is past the edge', () => {
    const fall = falling(540);
    let first: number | null = null;
    run(sideCamAt(owl({ z: 540 }), VIEW), fall, 400, 60, VIEW, (c, o) => {
      if (first === null && c.level < 540) first = 540 - BAND_DOWN - o.z - (540 - c.level);
      // Out of the band the height held is the band's edge over the owl: not a pixel under it.
      if (o.z < 540 - BAND_DOWN) expect(c.level).toBeGreaterThanOrEqual(o.z + BAND_DOWN - 1e-6);
      else expect(c.level).toBe(540);
    });
    expect(first).not.toBeNull();
    expect(Math.abs(first!)).toBeLessThan(1e-6);
  });

  it('in rising air is with the owl all the way up, and a flap over a jump is only eased up to (OP-352)', () => {
    // A gust takes an owl from the ground up to 500 at 300 px a second.
    const rising = (lifted: boolean) => (t: number) => owl({ z: Math.min(500, t * 0.3), grounded: false, lifted });
    for (const fps of [10, 60]) {
      let over = 0;
      run(sideCamAt(owl(), VIEW), rising(true), 1600, fps, VIEW, (c, o) => {
        over = Math.max(over, o.z - c.level);
      });
      expect(over, `at ${fps} frames a second`).toBeLessThanOrEqual(LIFT_BAND + 1e-6);
    }
    // Without the air under it the view waits for a whole jump's band, then follows behind.
    let over = 0;
    run(sideCamAt(owl(), VIEW), rising(false), 1600, 60, VIEW, (c, o) => {
      over = Math.max(over, o.z - c.level);
    });
    expect(over).toBeGreaterThan(BAND_UP + 20);
  });

  it('eases to a ground line that changes, and is not thrown by it', () => {
    const cam = sideCamAt(owl(), VIEW);
    const one = sideCamStep(cam, owl({ y: GROUND + 200 }), VIEW, 1000 / 60);
    expect(one.y - cam.y).toBeGreaterThan(0);
    expect(one.y - cam.y).toBeLessThan(40);
    expect(run(cam, () => owl({ y: GROUND + 200 }), 2000, 60).y).toBeCloseTo(GROUND + 200, 0);
  });

  it('ends in the same place at 30 frames a second as at 120', () => {
    const flight = (t: number) => owl({ x: 1000 + 0.26 * t, vx: 260, z: Math.max(0, 180 * Math.sin((Math.PI * Math.min(t, 1500)) / 1500)), grounded: t >= 1500 });
    const slow = run(sideCamAt(owl(), VIEW), flight, 2000, 30);
    const quick = run(sideCamAt(owl(), VIEW), flight, 2000, 120);
    expect(Math.abs(slow.x - quick.x)).toBeLessThan(6);
    expect(Math.abs(slow.y - quick.y)).toBeLessThan(6);
    expect(Math.abs(slow.lead - quick.lead)).toBeLessThan(2);
  });

  it('takes no step longer than a quarter of a second, and that is long enough for a slow phone', () => {
    // Ten frames a second is a step of 100 ms, four of 250: both whole. A page that stalled is longer, and is eased.
    expect(STEP_MOST_MS).toBeGreaterThanOrEqual(250);
    expect(STEP_MOST_MS).toBeLessThanOrEqual(400);
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
