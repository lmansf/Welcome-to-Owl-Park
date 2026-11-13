import { AIRBORNE, GLIDING, GROUNDED, LIFTED, type Air } from '@owl-park/shared';

/**
 * The park's sounds for what the visitor's own owl does (OP-350): one table of cues, each a few short,
 * quiet tones or breaths of noise that the player (sfx.ts) makes on the spot, the way the Menu makes its
 * knock on wood. No sound files. They are stand-ins, as the art is: a sound designer replaces a cue by
 * giving its name a recording, and nothing that plays a cue changes.
 *
 * This file is the rules, with nothing of the browser in it: what each cue is made of, which cues the
 * owl's flight gives as it changes, and how soon a cue may sound again.
 *
 * TODO-DOCS (OP-350): docs/ARCHITECTURE.md's client rules: the park's sounds are made in code from the
 * cue table in apps/park/src/game/sfxCues.ts and played by sfx.ts for the visitor's own owl only, under
 * the Settings switch "Sounds". On for every visitor since the owner's word of Nov 12 (they were
 * behind a `?sfx=1` flag until then).
 */

/** One part of a cue: a tone that may slide in pitch, or a breath of noise through a band that may slide. */
export interface Voice {
  /** A tone's shape, or `noise` (white noise through a band at `from` to `to` Hz). */
  wave: 'sine' | 'triangle' | 'noise';
  /** When it starts, in seconds after the cue. */
  at: number;
  /** How long it sounds, in seconds: it has died away by then. */
  dur: number;
  /** Its pitch (the band's middle, for noise) as it starts, in Hz. */
  from: number;
  /** Its pitch as it ends: the same as `from` when left out. */
  to?: number;
  /** How loud it is at its loudest, of 1, before the player's own volume. */
  gain: number;
  /** How long it takes to reach that, in seconds: a few thousandths (a struck sound) when left out. */
  attack?: number;
  /** Noise only: how narrow its band is (1 when left out; higher whistles, lower hisses). */
  q?: number;
}

export interface Cue {
  voices: readonly Voice[];
  /** How soon it may sound again, in ms: a held key or five feathers at once is one sound, not a rattle. */
  gapMs: number;
  /** How far its pitch may wander each time (0.04 is four in a hundred): what is heard often is never twice the same. */
  wander?: number;
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.5;
const G6 = 1567.98;

/**
 * The cues. Phones play little under 200 Hz, so nothing rests on a low tone alone: a thud has a knock of
 * noise in it. Everything is over within a second. The gains were set by rendering each cue and measuring
 * it against the Menu's knock on wood (menuShell.ts), which a visitor already hears: what sounds at every
 * jump is about as loud as the knock, a glide is softer, and a moment of a course a little louder. A
 * breath of noise comes out of its band at about a third of its gain (NOISE_PASSES), so its gain is higher.
 */
export const CUES = {
  /** Off the ground: a push and a small breath. */
  jump: { gapMs: 90, wander: 0.04, voices: [{ wave: 'sine', at: 0, dur: 0.11, from: 280, to: 460, gain: 0.1 }, { wave: 'noise', at: 0, dur: 0.06, from: 900, gain: 0.04 }] },
  /** A flap in the air: one beat of the wings. */
  flap: { gapMs: 90, wander: 0.06, voices: [{ wave: 'noise', at: 0, dur: 0.17, from: 780, to: 320, gain: 0.28, attack: 0.03, q: 0.8 }, { wave: 'sine', at: 0, dur: 0.1, from: 240, to: 190, gain: 0.06 }] },
  /** The wings spread: air over feathers. */
  glide: { gapMs: 450, voices: [{ wave: 'noise', at: 0, dur: 0.38, from: 1300, to: 1900, gain: 0.09, attack: 0.12, q: 0.6 }] },
  /** Caught by rising air: a breath that climbs. */
  lift: { gapMs: 700, voices: [{ wave: 'noise', at: 0, dur: 0.55, from: 600, to: 2200, gain: 0.08, attack: 0.2, q: 0.7 }, { wave: 'sine', at: 0.04, dur: 0.45, from: 330, to: 660, gain: 0.04, attack: 0.1 }] },
  /** Down on something: talons on wood. */
  land: { gapMs: 120, wander: 0.05, voices: [{ wave: 'sine', at: 0, dur: 0.1, from: 230, to: 120, gain: 0.14 }, { wave: 'noise', at: 0, dur: 0.045, from: 420, gain: 0.07, q: 1.4 }] },
  /** A dash: the air torn through. */
  dash: { gapMs: 150, voices: [{ wave: 'noise', at: 0, dur: 0.22, from: 2400, to: 500, gain: 0.25, attack: 0.02, q: 0.9 }] },
  /** A part of a course done (a bell rung, a seal set, a breaker thrown): a small bell. */
  part: { gapMs: 200, voices: [{ wave: 'sine', at: 0, dur: 0.85, from: E6, gain: 0.07 }, { wave: 'sine', at: 0, dur: 0.6, from: E5, gain: 0.04 }, { wave: 'sine', at: 0, dur: 0.22, from: E6 * 2.76, gain: 0.012 }] },
  /** A feather found: a light pluck. */
  feather: { gapMs: 120, voices: [{ wave: 'triangle', at: 0, dur: 0.08, from: C6, to: G6, gain: 0.1 }, { wave: 'sine', at: 0.06, dur: 0.2, from: G6, gain: 0.06 }] },
  /** A bench reached, or a first of something done: two notes, the second higher. */
  bench: { gapMs: 400, voices: [{ wave: 'triangle', at: 0, dur: 0.15, from: C5, gain: 0.11 }, { wave: 'triangle', at: 0.11, dur: 0.26, from: G5, gain: 0.11 }] },
  /** A fall: a whistle on its way down. */
  fall: { gapMs: 600, voices: [{ wave: 'sine', at: 0, dur: 0.34, from: 620, to: 190, gain: 0.09, attack: 0.02 }, { wave: 'triangle', at: 0, dur: 0.3, from: 930, to: 285, gain: 0.02, attack: 0.02 }] },
  /** Through a doorway: a knock on the frame and the air of the next room. */
  door: { gapMs: 400, voices: [{ wave: 'sine', at: 0, dur: 0.1, from: 300, to: 210, gain: 0.11 }, { wave: 'noise', at: 0, dur: 0.035, from: 1200, gain: 0.04, q: 1.2 }, { wave: 'noise', at: 0.05, dur: 0.28, from: 850, to: 400, gain: 0.04, attack: 0.09, q: 0.7 }] },
  /** A way opened (a shortcut): a latch lifting. */
  open: { gapMs: 500, voices: [{ wave: 'noise', at: 0, dur: 0.03, from: 1600, gain: 0.05, q: 1.5 }, { wave: 'sine', at: 0.02, dur: 0.2, from: 294, to: 440, gain: 0.08, attack: 0.02 }] },
  /** A course finished: four notes up. */
  clear: {
    gapMs: 1500,
    voices: [
      { wave: 'triangle', at: 0, dur: 0.16, from: C5, gain: 0.08 },
      { wave: 'triangle', at: 0.1, dur: 0.16, from: E5, gain: 0.08 },
      { wave: 'triangle', at: 0.2, dur: 0.16, from: G5, gain: 0.08 },
      { wave: 'triangle', at: 0.3, dur: 0.55, from: C6, gain: 0.09 },
      { wave: 'sine', at: 0.3, dur: 0.5, from: C6 * 2, gain: 0.03 },
    ],
  },
  /**
   * The guardian's hoot (OP-359, guardian.ts): a great horned owl's call, low and soft, three notes with the last one long. An octave rides
   * over each so a phone, which plays little this low, still sounds it, and a breath goes with the long one.
   */
  guardianHoot: {
    gapMs: 2000,
    wander: 0.02,
    voices: [
      { wave: 'sine', at: 0, dur: 0.2, from: 300, to: 286, gain: 0.1, attack: 0.04 },
      { wave: 'sine', at: 0, dur: 0.18, from: 600, to: 572, gain: 0.02, attack: 0.04 },
      { wave: 'sine', at: 0.22, dur: 0.16, from: 300, to: 288, gain: 0.09, attack: 0.03 },
      { wave: 'sine', at: 0.22, dur: 0.14, from: 600, to: 576, gain: 0.018, attack: 0.03 },
      { wave: 'sine', at: 0.42, dur: 0.52, from: 292, to: 262, gain: 0.11, attack: 0.07 },
      { wave: 'sine', at: 0.42, dur: 0.44, from: 584, to: 524, gain: 0.022, attack: 0.07 },
      { wave: 'noise', at: 0.42, dur: 0.4, from: 520, to: 380, gain: 0.05, attack: 0.1, q: 0.8 },
    ],
  },
} as const satisfies Record<string, Cue>;

export type CueName = keyof typeof CUES;

/** How long a cue lasts, in seconds. */
export function cueLength(cue: Cue): number {
  return Math.max(...cue.voices.map((v) => v.at + v.dur));
}

/** How much of a breath of noise comes out of its band, about: a third of its gain (measured). */
export const NOISE_PASSES = 1 / 3;

/** How loud a voice is at its loudest, of 1, as it is heard: a tone at its gain, noise at what its band passes. */
export function voiceLoudness(v: Voice): number {
  return v.wave === 'noise' ? v.gain * NOISE_PASSES : v.gain;
}

/** The loudest a cue can be, of 1: its voices' peaks together where they overlap at their starts. */
export function cueLoudness(cue: Cue): number {
  return Math.max(...cue.voices.map((v) => cue.voices.filter((o) => o.at <= v.at && v.at < o.at + o.dur).reduce((sum, o) => sum + voiceLoudness(o), 0)));
}

/** A cue the owl's flight gives, and how strongly (1 when left out). */
export interface AirCue {
  cue: CueName;
  strength?: number;
}

/** The fall (px/s) at and under which a landing is at its softest, and at and over which it is at its fullest. */
export const LAND_SOFT = 150;
export const LAND_HARD = 900;
/** The least a landing sounds, of 1: a step down a kerb is still heard, quietly. */
export const LAND_LEAST = 0.35;

/** How strongly a landing sounds for the speed the owl came down at (`vz`, falling is negative): a glide sets down softly, a drop thuds. */
export function landStrength(vz: number): number {
  const fall = Math.max(0, -vz);
  const t = Math.min(1, Math.max(0, (fall - LAND_SOFT) / (LAND_HARD - LAND_SOFT)));
  return LAND_LEAST + (1 - LAND_LEAST) * t;
}

/**
 * The cues one step of the owl's flight gives (flight.ts, stepFlier: `prev` before the step, `next`
 * after). Read from the flight itself and not from the keys, so the space bar, the Jump button, a tap
 * and a test all sound the same, and a press that did nothing is silent:
 * - off the ground and rising is a jump (a step off an edge is not);
 * - a flap spent in the air is a flap;
 * - wings that were not spread and now are is a glide, and into rising air a lift;
 * - in the air and now on something is a landing, as strong as the fall was fast.
 */
export function airCues(prev: Air, next: Air): AirCue[] {
  const out: AirCue[] = [];
  if (prev.s === GROUNDED) {
    if (next.s === AIRBORNE && next.vz > 0) out.push({ cue: 'jump' });
    return out;
  }
  if (next.s === GROUNDED) {
    out.push({ cue: 'land', strength: landStrength(prev.vz) });
    return out;
  }
  if (next.f < prev.f) out.push({ cue: 'flap' });
  if (next.s === LIFTED && prev.s !== LIFTED) out.push({ cue: 'lift' });
  else if (next.s === GLIDING && prev.s !== GLIDING && prev.s !== LIFTED) out.push({ cue: 'glide' });
  return out;
}

/** Whether a cue may sound `now` (ms), having last sounded at `last` (ms, undefined for never): its own gap has passed. */
export function maySound(cue: Cue, now: number, last: number | undefined): boolean {
  return last === undefined || now - last >= cue.gapMs;
}

/** A cue's pitch this time, as a factor: 1 for a cue that does not wander, else within its `wander` of 1 (`rand` in 0 to 1). */
export function pitchOf(cue: Cue, rand: number): number {
  const w = cue.wander ?? 0;
  return 1 + (rand * 2 - 1) * w;
}
