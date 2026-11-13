import { describe, expect, it } from 'vitest';
import { AIRBORNE, GLIDING, GROUNDED, LIFTED, ON_GROUND, PARK_FLIGHT, ALL_FLIGHT, newFlier, stepFlier, type Air, type Flier } from '@owl-park/shared';
import { createSfx } from './sfx';
import { CUES, LAND_HARD, LAND_LEAST, LAND_SOFT, NOISE_PASSES, airCues, cueLength, cueLoudness, landStrength, maySound, pitchOf, voiceLoudness, type Cue, type CueName } from './sfxCues';

const names = Object.keys(CUES) as CueName[];
const cueOf = (n: CueName): Cue => CUES[n];

describe('the cue table (OP-350)', () => {
  it('every cue is short: over within a second', () => {
    for (const n of names) expect(cueLength(cueOf(n)), n).toBeLessThanOrEqual(1);
  });

  it('every cue is quiet: no voice louder than the Menu’s knock, no cue louder than a quarter at once', () => {
    // The knock on wood as the Menu opens (menuTheme.ts, tapGain): what a visitor already hears.
    const KNOCK = 0.18;
    for (const n of names) {
      for (const v of cueOf(n).voices) expect(voiceLoudness(v), n).toBeLessThanOrEqual(KNOCK);
      expect(cueLoudness(cueOf(n)), n).toBeLessThanOrEqual(0.25);
    }
    expect(voiceLoudness({ wave: 'noise', at: 0, dur: 0.1, from: 800, gain: 0.3 })).toBeCloseTo(0.3 * NOISE_PASSES, 6);
    expect(voiceLoudness({ wave: 'sine', at: 0, dur: 0.1, from: 800, gain: 0.3 })).toBe(0.3);
  });

  it('what is heard at every jump and landing is quieter than a moment of a course', () => {
    for (const often of ['jump', 'flap', 'glide', 'land'] as const) expect(cueLength(cueOf(often)), often).toBeLessThanOrEqual(0.4);
    expect(cueLength(cueOf('clear'))).toBeGreaterThan(cueLength(cueOf('bench')));
  });

  it('every voice can be made: a length, a start, a pitch a phone can play, an attack shorter than itself', () => {
    for (const n of names) {
      expect(cueOf(n).voices.length, n).toBeGreaterThan(0);
      for (const v of cueOf(n).voices) {
        expect(v.dur, n).toBeGreaterThan(0.02);
        expect(v.at, n).toBeGreaterThanOrEqual(0);
        expect(v.gain, n).toBeGreaterThan(0);
        for (const hz of [v.from, v.to ?? v.from]) {
          expect(hz, n).toBeGreaterThanOrEqual(110);
          expect(hz, n).toBeLessThanOrEqual(4000);
        }
        expect(v.attack ?? 0, n).toBeLessThan(v.dur);
      }
    }
  });

  it('nothing rests on a low tone alone: a cue whose tones are all under 300 Hz has a breath of noise in it', () => {
    for (const n of names) {
      const tones = cueOf(n).voices.filter((v) => v.wave !== 'noise');
      const low = tones.length > 0 && tones.every((v) => Math.max(v.from, v.to ?? v.from) < 300);
      if (low) expect(cueOf(n).voices.some((v) => v.wave === 'noise'), n).toBe(true);
    }
  });

  it('no two cues are the same sound', () => {
    const seen = new Set(names.map((n) => JSON.stringify(cueOf(n).voices)));
    expect(seen.size).toBe(names.length);
  });

  it('a cue waits its own gap before it sounds again, and a cue that wanders stays near its pitch', () => {
    expect(maySound(CUES.jump, 1000, undefined)).toBe(true);
    expect(maySound(CUES.jump, 1000 + CUES.jump.gapMs - 1, 1000)).toBe(false);
    expect(maySound(CUES.jump, 1000 + CUES.jump.gapMs, 1000)).toBe(true);
    for (const n of names) expect(cueOf(n).gapMs, n).toBeGreaterThanOrEqual(80);
    expect(pitchOf(CUES.part, 0)).toBe(1);
    expect(pitchOf(CUES.part, 0.99)).toBe(1);
    expect(pitchOf(CUES.jump, 0)).toBeCloseTo(0.96, 5);
    expect(pitchOf(CUES.jump, 0.5)).toBeCloseTo(1, 5);
    expect(pitchOf(CUES.jump, 1)).toBeCloseTo(1.04, 5);
  });
});

describe('a landing is as loud as the fall was fast', () => {
  it('a glide sets down softly, a drop thuds, and nothing is silent', () => {
    expect(landStrength(0)).toBe(LAND_LEAST);
    expect(landStrength(-LAND_SOFT)).toBe(LAND_LEAST);
    expect(landStrength(-LAND_HARD)).toBe(1);
    expect(landStrength(-5000)).toBe(1);
    const mid = landStrength(-(LAND_SOFT + LAND_HARD) / 2);
    expect(mid).toBeGreaterThan(LAND_LEAST);
    expect(mid).toBeLessThan(1);
    // Rising as it lands (it never does): the least, not less.
    expect(landStrength(300)).toBe(LAND_LEAST);
  });
});

describe('the cues the flight gives', () => {
  const air = (s: Air['s'], z: number, vz: number, f: Air['f']): Air => ({ z, vz, s, f });

  it('off the ground and rising is a jump; a step off an edge is not', () => {
    expect(airCues(ON_GROUND, air(AIRBORNE, 4, 600, 1))).toEqual([{ cue: 'jump' }]);
    expect(airCues(air(GROUNDED, 120, 0, 0), air(AIRBORNE, 119, -8, 1))).toEqual([]);
    expect(airCues(ON_GROUND, ON_GROUND)).toEqual([]);
  });

  it('a flap spent in the air is a flap, and only then', () => {
    expect(airCues(air(AIRBORNE, 80, -40, 1), air(AIRBORNE, 84, 500, 0))).toEqual([{ cue: 'flap' }]);
    expect(airCues(air(AIRBORNE, 80, -40, 2), air(AIRBORNE, 84, 500, 1))).toEqual([{ cue: 'flap' }]);
    expect(airCues(air(GLIDING, 80, -60, 1), air(AIRBORNE, 84, 500, 0))).toEqual([{ cue: 'flap' }]);
    expect(airCues(air(AIRBORNE, 80, 200, 1), air(AIRBORNE, 84, 190, 1))).toEqual([]);
  });

  it('wings that were not spread and now are is a glide; into rising air, a lift, once', () => {
    expect(airCues(air(AIRBORNE, 80, -10, 1), air(GLIDING, 79, -60, 1))).toEqual([{ cue: 'glide' }]);
    expect(airCues(air(GLIDING, 80, -60, 1), air(GLIDING, 79, -60, 1))).toEqual([]);
    expect(airCues(air(GLIDING, 80, -60, 1), { ...air(LIFTED, 82, 300, 1), h: 400 })).toEqual([{ cue: 'lift' }]);
    expect(airCues({ ...air(LIFTED, 82, 300, 1), h: 400 }, { ...air(LIFTED, 86, 300, 1), h: 400 })).toEqual([]);
    // Out of the column with the wings still spread: no second breath of air.
    expect(airCues({ ...air(LIFTED, 400, 0, 1), h: 400 }, air(GLIDING, 399, -60, 1))).toEqual([]);
  });

  it('in the air and now on something is a landing, as strong as the fall, and never also a flap', () => {
    expect(airCues(air(AIRBORNE, 3, -LAND_HARD, 1), ON_GROUND)).toEqual([{ cue: 'land', strength: 1 }]);
    expect(airCues(air(GLIDING, 3, -60, 0), air(GROUNDED, 120, 0, 0))).toEqual([{ cue: 'land', strength: LAND_LEAST }]);
  });

  /** A whole flight, stepped as the park steps it: the cues it gives, in order. */
  function flown(presses: (step: number) => { pressed: boolean; held: boolean }, steps: number, can = ALL_FLIGHT): string[] {
    let fl: Flier = newFlier();
    const out: string[] = [];
    for (let i = 0; i < steps; i++) {
      const before = fl.air;
      fl = stepFlier(fl, presses(i), 0, can);
      for (const c of airCues(before, fl.air)) out.push(c.cue);
    }
    return out;
  }

  it('a tap of Jump is a jump and a landing', () => {
    expect(flown((i) => ({ pressed: i === 0, held: i < 2 }), 400)).toEqual(['jump', 'land']);
  });

  it('a jump, two flaps in the tree, held into a glide, and down: each is heard once, in order', () => {
    const at = new Set([0, 30, 60]);
    const cues = flown((i) => ({ pressed: at.has(i), held: i >= 60 }), 3000);
    expect(cues).toEqual(['jump', 'flap', 'flap', 'glide', 'land']);
  });

  it('in today’s park there is one flap: a third press in the air is silent', () => {
    const at = new Set([0, 30, 60]);
    const cues = flown((i) => ({ pressed: at.has(i), held: false }), 3000, PARK_FLIGHT);
    expect(cues).toEqual(['jump', 'flap', 'land']);
  });
});

describe('the player', () => {
  it('plays nothing with the sounds off, keeps what it played, and holds a cue to its gap', () => {
    let on = false;
    let t = 0;
    const sfx = createSfx({ on: () => on, now: () => t, rand: () => 0.5 });
    sfx.play('jump');
    expect(sfx.heard()).toEqual([]);
    on = true;
    sfx.play('jump');
    t += CUES.jump.gapMs - 1;
    sfx.play('jump');
    sfx.play('land', 0.4);
    expect(sfx.heard()).toEqual(['jump', 'land']);
    t += 1;
    sfx.play('jump');
    expect(sfx.heard()).toEqual(['jump', 'land', 'jump']);
  });

  it('keeps only the last few dozen', () => {
    let t = 0;
    const sfx = createSfx({ on: () => true, now: () => t, rand: () => 0.5 });
    for (let i = 0; i < 100; i++) {
      t += 1000;
      sfx.play(i % 2 ? 'jump' : 'land');
    }
    expect(sfx.heard().length).toBe(40);
    expect(sfx.heard()[39]).toBe('jump');
  });
});
