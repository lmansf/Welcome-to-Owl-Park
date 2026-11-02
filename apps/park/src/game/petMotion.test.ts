import { describe, expect, it } from 'vitest';
import { AIRBORNE, GLIDE_SINK, GLIDING, GROUNDED, ON_GROUND, WALK_SPEED, carryOn, newFlier, stepFlier, type Air } from '@owl-park/shared';
import { NO_HOP, PET_HOP, PET_RESPAWN, SETTLED, hopHeight, stepHop, stepRespawn, type PetHop, type PetRespawn } from './petMotion';

/** One step into a jump, as the jumping page tells it. */
const up = stepFlier(newFlier(), { pressed: true, held: true }).air;
const FRAME = 16;

/** Draw the pet's hop frame by frame from `from` to `to` (ms), its owl's air at each frame from `airAt`. */
function hops(airAt: (t: number) => Air, from: number, to: number, size = 1, start: PetHop = NO_HOP): Array<{ t: number; h: number }> {
  let hop = start;
  const out: Array<{ t: number; h: number }> = [];
  for (let t = from; t <= to; t += FRAME) {
    hop = stepHop(hop, t, airAt(t));
    out.push({ t, h: hopHeight(hop, t, size) });
  }
  return out;
}

/** An owl standing until 1000 ms, then jumping and carried on until it lands. */
const jumpAt1000 = (t: number): Air => (t < 1000 ? ON_GROUND : carryOn(up, t - 1000));

describe('a pet hops when its owl jumps (OP-194)', () => {
  it('waits a beat after the owl leaves the ground, then hops and lands', () => {
    const drawn = hops(jumpAt1000, 0, 3000);
    const at = (t: number) => drawn.find((d) => d.t >= t)!.h;
    expect(at(990)).toBe(0);
    expect(at(1000 + PET_HOP.delayMs - 20)).toBe(0);
    expect(at(1000 + PET_HOP.delayMs + PET_HOP.ms / 2)).toBeGreaterThan(PET_HOP.height * 0.9);
    expect(at(1000 + PET_HOP.delayMs + PET_HOP.ms + FRAME)).toBe(0);
    expect(drawn.filter((d) => d.t > 1500).every((d) => d.h === 0)).toBe(true);
  });

  it('never hops higher than its cap, at any owl size, however high the owl goes', () => {
    for (const size of [0.8, 1, 1.4]) {
      let hop: PetHop = NO_HOP;
      let top = 0;
      for (let t = 0; t <= 3000; t += 1) {
        hop = stepHop(hop, t, jumpAt1000(t));
        top = Math.max(top, hopHeight(hop, t, size));
      }
      expect(top, `size ${size}`).toBeLessThanOrEqual(PET_HOP.height * size);
      expect(top, `size ${size}`).toBeGreaterThan(PET_HOP.height * size * 0.99);
    }
  });

  it('stays on the ground while its owl flies on: one hop for the take-off, none for its flaps and glide', () => {
    // A jump, a flap at 1500 (rising again in the air), a glide from 2000 to 6000, then down.
    const flight = (t: number): Air => {
      if (t < 1000) return ON_GROUND;
      if (t < 1500) return carryOn(up, t - 1000);
      if (t < 2000) return { ...carryOn(up, t - 1500), z: 200, s: AIRBORNE };
      if (t < 6000) return { z: 150, vz: -GLIDE_SINK, s: GLIDING, f: 0 };
      return ON_GROUND;
    };
    const drawn = hops(flight, 0, 7000);
    const off = drawn.filter((d) => d.h > 0);
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((d) => d.t >= 1000 + PET_HOP.delayMs && d.t <= 1000 + PET_HOP.delayMs + PET_HOP.ms)).toBe(true);
  });

  it('hops again for the next jump once its owl is down', () => {
    const twice = (t: number): Air => (t < 1000 ? ON_GROUND : t < 3000 ? jumpAt1000(t) : t < 4000 ? ON_GROUND : carryOn(up, t - 4000));
    const drawn = hops(twice, 0, 5000);
    expect(drawn.some((d) => d.t > 4000 + PET_HOP.delayMs && d.h > 0)).toBe(true);
  });

  it('does not hop when its owl only drops off a ledge or is picked up into a game’s glide', () => {
    const drop = (t: number): Air => (t < 1000 ? { z: 80, vz: 0, s: GROUNDED, f: 0 } : { z: 80, vz: -50, s: AIRBORNE, f: 1 });
    expect(hops(drop, 0, 2000).every((d) => d.h === 0)).toBe(true);
    const held = (t: number): Air => (t < 1000 ? ON_GROUND : { z: 0, vz: 0, s: GLIDING, f: 0 });
    expect(hops(held, 0, 2000).every((d) => d.h === 0)).toBe(true);
  });
});

/** Run the left-behind rule frame by frame, the gap at each frame from `gapAt`. */
function run(gapAt: (t: number) => number, from: number, to: number, start: PetRespawn = SETTLED) {
  let r = start;
  const out: Array<{ t: number; snap: boolean; fade: number }> = [];
  for (let t = from; t <= to; t += FRAME) {
    const s = stepRespawn(r, t, gapAt(t), 100);
    r = s.r;
    out.push({ t, snap: s.snap, fade: s.fade });
  }
  return { out, r };
}

describe('a pet left behind comes back beside its owl (OP-194)', () => {
  const far = 100 * PET_RESPAWN.farOwlWidths + 1;

  it('never fires at the gaps of an ordinary trot, or a turn about', () => {
    // Easing at 5/s, a pet trails a walking owl by WALK_SPEED / 5 beyond its spot; a turn adds the trail twice over.
    const trot = WALK_SPEED / 5 + 2 * 46;
    const { out } = run(() => trot, 0, 10_000);
    expect(out.every((d) => !d.snap && d.fade === 1)).toBe(true);
  });

  it('waits until it has been too far for long enough, fades out, comes back once and fades in', () => {
    const { out } = run((t) => (t < 1000 ? 0 : far), 0, 2600);
    const snaps = out.filter((d) => d.snap);
    expect(snaps.length).toBe(1);
    const at = snaps[0]!.t;
    expect(at).toBeGreaterThanOrEqual(1000 + PET_RESPAWN.farMs + PET_RESPAWN.fadeOutMs);
    // Fully shown until the wait is up, fading out before the jump, fading back in after it.
    expect(out.filter((d) => d.t < 1000 + PET_RESPAWN.farMs).every((d) => d.fade === 1)).toBe(true);
    const before = out.filter((d) => d.t > 1000 + PET_RESPAWN.farMs && d.t < at);
    expect(before.some((d) => d.fade < 1 && d.fade > 0)).toBe(true);
    expect(before.map((d) => d.fade)).toEqual([...before.map((d) => d.fade)].sort((a, b) => b - a));
    expect(out.find((d) => d.t === at + FRAME)!.fade).toBeLessThan(1);
    expect(out.find((d) => d.t >= at + PET_RESPAWN.fadeInMs)!.fade).toBe(1);
  });

  it('starts the wait again whenever it catches up', () => {
    // Far for 900 ms at a time, near for a frame between: never long enough.
    const { out } = run((t) => (t % 900 < FRAME ? 0 : far), 0, 10_000);
    expect(out.some((d) => d.snap)).toBe(false);
  });

  it('comes back at most once in its cooldown, however far its owl keeps running', () => {
    const { out } = run(() => far, 0, 10_000);
    const snaps = out.filter((d) => d.snap).map((d) => d.t);
    expect(snaps.length).toBeGreaterThan(1);
    for (let i = 1; i < snaps.length; i++) expect(snaps[i]! - snaps[i - 1]!).toBeGreaterThanOrEqual(PET_RESPAWN.cooldownMs);
  });
});
