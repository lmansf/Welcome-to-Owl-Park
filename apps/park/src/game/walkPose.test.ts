import { describe, expect, it } from 'vitest';
import { SHUFFLE, walkPose, type WalkPose, type WalkPoseIn } from './walkPose';

const FRAME = 1 / 60;

/** Draw `frames` frames from `start` at 60 a second, as Owl.tick does, keeping every pose. */
function run(start: WalkPose, frames: number, at: Partial<WalkPoseIn> & { t0?: number } = {}): WalkPose[] {
  const out: WalkPose[] = [];
  let pose = start;
  const t0 = at.t0 ?? 1000;
  for (let i = 1; i <= frames; i++) {
    pose = walkPose({ amount: pose.amount, walking: true, grounded: true, calm: false, dt: FRAME, ...at, now: t0 + i * FRAME * 1000 });
    out.push(pose);
  }
  return out;
}

const last = (poses: WalkPose[]) => poses[poses.length - 1]!;

describe('the walking shuffle (OP-199)', () => {
  it('is nothing at all for an owl standing still', () => {
    for (const now of [0, 77, 220, 5000, 123_456]) {
      expect(walkPose({ amount: 0, walking: false, grounded: true, dt: FRAME, now, calm: false })).toEqual({ amount: 0, tilt: 0 });
    }
    expect(run({ amount: 0, tilt: 0 }, 120, { walking: false }).every((p) => p.amount === 0 && p.tilt === 0)).toBe(true);
  });

  it('eases in from nothing as a walk starts, with no jump on its first frame', () => {
    const poses = run({ amount: 0, tilt: 0 }, 60);
    expect(Math.abs(poses[0]!.tilt)).toBeLessThan(SHUFFLE.tilt * 0.05);
    for (let i = 1; i < poses.length; i++) expect(poses[i]!.amount).toBeGreaterThanOrEqual(poses[i - 1]!.amount);
    expect(last(poses).amount).toBe(1);
  });

  it('never tips further than its bound, and does tip both ways while walking', () => {
    const poses = run({ amount: 0, tilt: 0 }, 600);
    const tilts = poses.map((p) => p.tilt);
    expect(Math.max(...tilts.map(Math.abs))).toBeLessThanOrEqual(SHUFFLE.tilt);
    expect(Math.max(...tilts)).toBeGreaterThan(SHUFFLE.tilt * 0.9);
    expect(Math.min(...tilts)).toBeLessThan(-SHUFFLE.tilt * 0.9);
  });

  it('keeps in step with the bob: tipped furthest as the bob is highest, upright between steps', () => {
    const at = (now: number) => walkPose({ amount: 1, walking: true, grounded: true, dt: FRAME, now, calm: false }).tilt;
    expect(Math.abs(at((Math.PI / 2) * SHUFFLE.stepMs))).toBeCloseTo(SHUFFLE.tilt, 6);
    expect(at(Math.PI * SHUFFLE.stepMs)).toBeCloseTo(0, 6);
  });

  it('eases out to nothing after the walk stops, never snapping, and stays at rest', () => {
    const walking = last(run({ amount: 0, tilt: 0 }, 120));
    const after = run(walking, 60, { walking: false, t0: 3000 });
    for (let i = 1; i < after.length; i++) expect(after[i]!.amount).toBeLessThanOrEqual(after[i - 1]!.amount);
    // The first frame after stopping tips the body barely less than the walk could have.
    expect(after[0]!.amount).toBeGreaterThan(0.9);
    // Gone within its easing time, and nothing after.
    const frames = Math.ceil(SHUFFLE.outMs / 1000 / FRAME);
    expect(after[frames]).toEqual({ amount: 0, tilt: 0 });
    expect(after.slice(frames).every((p) => p.amount === 0 && p.tilt === 0)).toBe(true);
  });

  it('changes nothing in the air: no tilt flying, gliding or held aloft, and none to land with', () => {
    for (const walking of [true, false]) {
      for (const amount of [0, 0.4, 1]) {
        expect(walkPose({ amount, walking, grounded: false, dt: FRAME, now: 1234, calm: false })).toEqual({ amount: 0, tilt: 0 });
      }
    }
  });

  it('dies away in calm motion and does not come in', () => {
    const calm = run({ amount: 0, tilt: 0 }, 120, { calm: true });
    expect(calm.every((p) => p.tilt === 0)).toBe(true);
    const turnedCalm = run({ amount: 1, tilt: 0 }, 60, { calm: true });
    expect(last(turnedCalm)).toEqual({ amount: 0, tilt: 0 });
  });

  it('takes a long frame in its stride: amount stays in 0..1', () => {
    const big = walkPose({ amount: 0.5, walking: true, grounded: true, dt: 5, now: 99, calm: false });
    expect(big.amount).toBe(1);
    const back = walkPose({ amount: 0.5, walking: false, grounded: true, dt: 5, now: 99, calm: false });
    expect(back).toEqual({ amount: 0, tilt: 0 });
    const negative = walkPose({ amount: 0.5, walking: true, grounded: true, dt: -1, now: 99, calm: false });
    expect(negative.amount).toBe(0.5);
  });
});
