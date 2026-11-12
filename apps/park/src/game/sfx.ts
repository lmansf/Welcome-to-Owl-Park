import { CUES, maySound, pitchOf, type Cue, type CueName, type Voice } from './sfxCues';

/**
 * The player of the park's sounds (OP-350): it makes each cue of the table (sfxCues.ts) on the spot with
 * the browser's own audio, as the Menu makes its knock on wood. One for the page, so a doorway's sound
 * carries over into the next room. A device with no audio, or one that will not start it, plays nothing
 * and nothing else changes.
 */
export interface Sfx {
  /** Play a cue, `strength` (0 to 1, 1 when left out) as loud as it can be. Nothing when the sounds are off or the cue has only just sounded. */
  play(cue: CueName, strength?: number): void;
  /** The cues played on this page, the newest last (a few dozen kept): what a test, or the debug state, reads. */
  heard(): readonly CueName[];
}

export interface SfxOptions {
  /** Whether the park's sounds are on (Settings). */
  on(): boolean;
  /** The time, in ms (the clock, when left out). */
  now?(): number;
  /** A number from 0 up to 1 (Math.random, when left out): how a cue's pitch wanders. */
  rand?(): number;
}

/** The player's own volume, over every cue: the table's gains are already the Menu's knock's and the loader's hoot's size. */
export const SFX_VOLUME = 1;
/** How many cues `heard` keeps. */
const HEARD_KEPT = 40;
/** A sound's gain is never set to nothing: the fall of an exponential ramp has to end above it. */
const SILENT = 0.0001;

type AudioCtor = typeof AudioContext;
/** The audio a cue is made in: the page's own, or one that renders to a buffer (a sound board, a test). */
type Ctx = BaseAudioContext;

function audioCtor(): AudioCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
}

/** One second of white noise for the page, made once: every breath of noise plays a stretch of it through its own band. */
export function noiseOf(ctx: Ctx, kept: { buffer: AudioBuffer | null }, rand: () => number): AudioBuffer {
  if (kept.buffer && kept.buffer.sampleRate === ctx.sampleRate) return kept.buffer;
  const len = Math.floor(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
  kept.buffer = buffer;
  return buffer;
}

/** One voice of a cue, from `t0` (the context's time): its source through its own gain into `out`. */
function sound(ctx: Ctx, out: AudioNode, v: Voice, t0: number, pitch: number, loud: number, noise: () => AudioBuffer): void {
  const start = t0 + v.at;
  const end = start + v.dur;
  const attack = Math.min(v.attack ?? 0.004, v.dur / 2);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SILENT, start);
  gain.gain.linearRampToValueAtTime(Math.max(SILENT, v.gain * loud), start + attack);
  gain.gain.exponentialRampToValueAtTime(SILENT, end);
  gain.connect(out);
  const from = v.from * pitch;
  const to = (v.to ?? v.from) * pitch;
  if (v.wave === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = v.q ?? 1;
    band.frequency.setValueAtTime(from, start);
    if (to !== from) band.frequency.exponentialRampToValueAtTime(to, end);
    src.connect(band);
    band.connect(gain);
    src.start(start);
    src.stop(end + 0.02);
    return;
  }
  const osc = ctx.createOscillator();
  osc.type = v.wave;
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, end);
  osc.connect(gain);
  osc.start(start);
  osc.stop(end + 0.02);
}

/**
 * A whole cue, from `t0` (the context's time) into `out`: `pitch` a factor on every voice (pitchOf), `loud`
 * 0 to 1 on every gain. The one way a cue is made, for the player below and for anything that renders one.
 */
export function scheduleCue(ctx: Ctx, out: AudioNode, cue: Cue, t0: number, pitch: number, loud: number, noise: () => AudioBuffer): void {
  for (const v of cue.voices) sound(ctx, out, v, t0, pitch, loud, noise);
}

export function createSfx(opts: SfxOptions): Sfx {
  const now = opts.now ?? (() => Date.now());
  const rand = opts.rand ?? Math.random;
  const last = new Map<CueName, number>();
  const heard: CueName[] = [];
  const kept: { buffer: AudioBuffer | null } = { buffer: null };
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;

  /** The page's audio, made at the first sound; null where there is none. */
  const audio = (): { ctx: AudioContext; master: GainNode } | null => {
    try {
      if (!ctx) {
        const AC = audioCtor();
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = SFX_VOLUME;
        master.connect(ctx.destination);
      }
      // A browser holds a page's audio until the visitor has pressed or tapped something: a jump is one.
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      return master ? { ctx, master } : null;
    } catch {
      return null;
    }
  };

  // The first press or tap wakes the audio from inside the gesture itself, where a phone asks for it.
  if (typeof window !== 'undefined') {
    const wake = () => {
      if (opts.on()) audio();
    };
    window.addEventListener('pointerdown', wake, { capture: true, passive: true });
    window.addEventListener('keydown', wake, { capture: true, passive: true });
  }

  return {
    play(name, strength = 1) {
      if (!opts.on()) return;
      const cue: Cue = CUES[name];
      const t = now();
      if (!maySound(cue, t, last.get(name))) return;
      last.set(name, t);
      heard.push(name);
      if (heard.length > HEARD_KEPT) heard.shift();
      const a = audio();
      if (!a) return;
      try {
        const pitch = pitchOf(cue, rand());
        const loud = Math.min(1, Math.max(0, strength));
        const t0 = a.ctx.currentTime + 0.005;
        scheduleCue(a.ctx, a.master, cue, t0, pitch, loud, () => noiseOf(a.ctx, kept, rand));
      } catch {
        /* no sound on this device: the park plays on all the same */
      }
    },
    heard: () => heard,
  };
}

let page: Sfx | null = null;

/** The page's one player, made the first time it is asked for. `on`: whether the park's sounds are on (Settings), read at each cue. */
export function parkSfx(on: () => boolean): Sfx {
  page ??= createSfx({ on });
  return page;
}
