import { OWL_FACTS, owlFact } from '@owl-park/shared';

/** A load quicker than this (art the browser has already) never shows the screen. */
export const SHOW_AFTER_MS = 300;
/** The first owl fact comes after this long on screen, then the next every FACT_MS. */
export const FIRST_FACT_MS = 2000;
export const FACT_MS = 7000;
/** The fade in and out, as index.html's stylesheet has them. */
const FADE_MS = 300;

/** What the browser tests read: whether it is up, its progress (0 to 1), the fact showing and the owl's hoots. */
export interface LoadScreenState {
  shown: boolean;
  progress: number;
  fact: string | null;
  hoots: number;
}

/**
 * The load screen (OP-129): an owl on a branch that grows as the park loads, the branch's length the
 * share of the bytes that have come. The page shows it from its first paint (index.html); this takes
 * it over. After two seconds an owl fact comes, a new one now and then; tapping the owl makes it hop
 * and hoot (no sound with the park's sounds off).
 *
 * TODO-DOCS (OP-129): docs/ARCHITECTURE.md: the load screen (index.html's #loader, this module), the
 * boot and each room reporting their art on it (loadArt's onProgress, bytes over the sizes the art
 * list carries), and that any new wait for art should show on it the same way.
 */
export interface LoadScreen {
  /**
   * A load starts, its progress empty: the screen comes up with these words after a moment (a quick
   * load never shows it), or stays up with its own if it is up already (the page's first load).
   */
  show(words: string): void;
  /** Real progress: `done` bytes of `total` have come (0 of 0 is done). It never goes back within a load. */
  progress(done: number, total: number): void;
  hide(): void;
  /** The owl in the visitor's own colours. */
  colour(look: { body: string; belly: string; accent: string }): void;
  state(): LoadScreenState;
}

/** The share of a load that has come, 0 to 1: nothing to load is all of it. */
export function shareLoaded(done: number, total: number): number {
  if (!(total > 0)) return 1;
  return Math.min(1, Math.max(0, done / total));
}

export function createLoadScreen(opts: { sound: () => boolean; calm: () => boolean }): LoadScreen {
  const root = document.getElementById('loader');
  if (!root) return { show() {}, progress() {}, hide() {}, colour() {}, state: () => ({ shown: false, progress: 0, fact: null, hoots: 0 }) };
  const bar = root.querySelector<SVGElement>('[role="progressbar"]');
  const words = root.querySelector<HTMLElement>('.lo-words');
  const fact = root.querySelector<HTMLElement>('.lo-fact');
  const audio: { ctx: AudioContext | null } = { ctx: null };
  // Each page starts the facts somewhere else in the list.
  const first = Math.floor(Math.random() * OWL_FACTS.length);
  let facts = 0;
  let shown = !root.hidden;
  let p = 0;
  let hoots = 0;
  let showing: ReturnType<typeof setTimeout> | null = null;
  let hiding: ReturnType<typeof setTimeout> | null = null;
  let factTimer: ReturnType<typeof setTimeout> | null = null;
  let hop: ReturnType<typeof setTimeout> | null = null;

  const setProgress = (to: number) => {
    p = to;
    root.style.setProperty('--p', to.toFixed(3));
    bar?.setAttribute('aria-valuenow', String(Math.round(to * 100)));
  };
  const nextFact = () => {
    if (!fact) return;
    const text = owlFact(first, facts++);
    if (opts.calm() || !fact.textContent) fact.textContent = text;
    else {
      // The old line fades, the new one comes in its place.
      fact.classList.add('fade');
      factTimer = setTimeout(() => {
        fact.textContent = text;
        fact.classList.remove('fade');
        factTimer = setTimeout(nextFact, FACT_MS);
      }, 400);
      return;
    }
    factTimer = setTimeout(nextFact, FACT_MS);
  };
  /** Facts from FIRST_FACT_MS after the screen came up (`since`, page time). */
  const startFacts = (since: number) => {
    if (factTimer) clearTimeout(factTimer);
    if (fact) fact.textContent = '';
    factTimer = setTimeout(nextFact, Math.max(0, since + FIRST_FACT_MS - performance.now()));
  };
  const up = () => {
    showing = null;
    if (hiding) clearTimeout(hiding);
    hiding = null;
    root.classList.toggle('calm', opts.calm());
    root.classList.remove('out');
    root.hidden = false;
    if (!shown) startFacts(performance.now());
    shown = true;
  };

  root.querySelector('.lo-tap')?.addEventListener('click', () => {
    hoots += 1;
    if (opts.sound()) hoot(audio);
    if (opts.calm()) return;
    // The hop and the words start over on each tap.
    root.classList.remove('hoot');
    void root.offsetWidth;
    root.classList.add('hoot');
    if (hop) clearTimeout(hop);
    hop = setTimeout(() => root.classList.remove('hoot'), 1100);
  });

  // Up from the page's first paint: its facts count from then.
  if (shown) {
    root.classList.toggle('calm', opts.calm());
    startFacts(0);
  }

  return {
    show(text) {
      setProgress(0);
      if (shown && !hiding) return;
      if (words) words.textContent = text;
      bar?.setAttribute('aria-label', text);
      if (hiding) up();
      else if (!showing) showing = setTimeout(up, SHOW_AFTER_MS);
    },
    progress(done, total) {
      setProgress(Math.max(p, shareLoaded(done, total)));
    },
    hide() {
      if (showing) clearTimeout(showing);
      showing = null;
      if (!shown || hiding) return;
      setProgress(1);
      root.classList.add('out');
      hiding = setTimeout(() => {
        hiding = null;
        shown = false;
        root.hidden = true;
        root.classList.remove('out', 'hoot');
        if (factTimer) clearTimeout(factTimer);
        factTimer = null;
        if (fact) fact.textContent = '';
      }, FADE_MS);
    },
    colour(look) {
      for (const k of ['body', 'belly', 'accent'] as const) if (/^#[0-9a-fA-F]{6}$/.test(look[k])) root.style.setProperty(`--lo-${k}`, look[k]);
    },
    state: () => ({ shown: shown && !hiding, progress: p, fact: fact?.textContent || null, hoots }),
  };
}

/** A soft hoot, two notes, the second longer and lower, made on the spot (no sound file), as the Menu's knock is. */
function hoot(audio: { ctx: AudioContext | null }): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio.ctx ??= new AC();
    const ctx = audio.ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const [at, len, from, to] of [
      [0, 0.24, 410, 370],
      [0.32, 0.46, 390, 310],
    ] as const) {
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, now + at);
      out.gain.exponentialRampToValueAtTime(0.14, now + at + 0.06);
      out.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      out.connect(ctx.destination);
      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(from, now + at);
      tone.frequency.exponentialRampToValueAtTime(to, now + at + len);
      tone.connect(out);
      tone.start(now + at);
      tone.stop(now + at + len + 0.02);
    }
  } catch {
    /* no sound here: the hop is enough */
  }
}
