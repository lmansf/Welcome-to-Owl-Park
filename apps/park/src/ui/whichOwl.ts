/**
 * Which owl are you (OP-076, rebuilt in OP-325 to OP-331): a new owl's first run, between Make your
 * owl and the owl builder. One screen of welcome (OP-367; it was three), eight questions about owl life (a quick
 * either/or, six cards of two to four answers, a quick either/or), a last card for the owl's colors,
 * a short pause, then the reveal: the owl glides in big in its new kind and colors (the builder's
 * preview scene draws it in the frame this screen leaves for it, under the see-through reveal), its
 * name, what the player shares with that owl, a true owl fact and something to try in the park, with
 * Play as this owl (a first run, OP-367: straight into the park; a retake says Keep it), Make it yours, and Not me? Try again. Skip, in the corner, goes to the builder at once.
 * Retake the quiz (the Menu's Settings tab) runs it again for an owl that already exists: only its
 * kind and colors change, never its id, friend code or what it wears.
 *
 * Nothing typed, no names, no score shown, no back button. The answers are kept nowhere: only the
 * result goes on, as the look. The words, picture slots and points are in
 * packages/shared/src/whichOwlBank.ts. Until an artist paints the answers' pictures (OP-326,
 * docs/QUIZ-ART.md) a visitor sees each answer as a card of words (OP-365): the slot, a box with its
 * painted size on it, shows only on a painter's or a keeper's tab (showsArtBoxes), where the box
 * tells the artist what to make.
 *
 * TODO-DOCS (OP-365): docs/QUIZ-ART.md says the game draws the dashed box for every visitor; it
 * draws it with `?paint=1` or `?keeper=1` in the address, and word cards otherwise.
 */
import { COLOUR_SETS, QUIZ_ART_SIZE, WHICH_OWL_WORDS as W, drawCards, getSpecies, natureDef, natureOf, quizLook, type ColourSetId, type Nature, type OwlLook, type QuizAnswer, type QuizCard } from '@owl-park/shared';
import { createModal } from './modal';
import type { PreviewFrame } from './owlBuilder';

/**
 * Whether the answers' picture slots show (OP-365): on a painter's or a keeper's tab (`?paint=1` or
 * `?keeper=1` in the address, config.ts), where each is a dashed box with the size to paint it at and
 * its art key. Every other visitor sees the answers as words alone: a box that says "96 × 96" reads
 * as a park not finished (the owner's audit of Nov 12, and his word the same day).
 */
export function showsArtBoxes(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.get('paint') === '1' || q.get('keeper') === '1';
}

/** How a run ended: the owl's new look, and which button took it on. */
export type WhichOwlEnd = { kind: 'keep' | 'make'; look: OwlLook } | { kind: 'skip' } | { kind: 'closed' };

export interface WhichOwlRun {
  /** The look the result is laid over (what the owl wears stays on). */
  base(): OwlLook;
  /** A seed for the cards; each retake adds its own count, so it draws another set. */
  seed: string;
  /** The result is shown: the look it gives (the owl is made here on a first run, OP-139). */
  reveal(look: OwlLook): void;
  /** Where to draw the owl at the reveal; null when the reveal is gone. */
  preview(frame: PreviewFrame | null): void;
  /** The run is over: Keep it, Make it yours, Skip, or closed any other way (Escape, Close). */
  done(end: WhichOwlEnd): void;
  /** A first run shows Skip in the corner; a retake from Settings shows Close there instead. */
  firstRun: boolean;
}

export interface WhichOwlScreen {
  open(run: WhichOwlRun, opener?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  /** Called after it closes, whichever way. */
  onClose(cb: () => void): void;
}

const CSS = `
#hud .layer.full .modal.which-owl{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;justify-content:safe center;gap:clamp(14px,3vh,26px);
  padding:calc(max(10px,env(safe-area-inset-top)) + 56px) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:radial-gradient(ellipse at 50% 18%,rgba(255,211,106,.3),rgba(255,211,106,0) 48%),linear-gradient(180deg,#24497A,#1B3A63 60%,#16304F);color:#F6F1E3;overflow:auto;transition:background-color .5s ease-out}
/* The reveal is see-through (OP-325): the owl is drawn on the game canvas under the HUD, over the builder scene's own dusk backdrop. */
#hud .layer.full .modal.which-owl.bright{background:radial-gradient(ellipse at 50% 40%,rgba(255,211,106,.26),rgba(255,211,106,0) 60%)}
#hud .which-owl-layer.full .scrim{background:transparent}
/* The corner stays on top and its row stays clear (OP-330): a reveal taller than a phone scrolls under it, never over Close. */
#hud .which-owl .wo-corner{position:absolute;z-index:2;top:max(10px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;align-items:center;gap:10px}
#hud .which-owl .wo-count{font-size:14px;opacity:.75}
#hud .which-owl .wo-corner button{min-height:44px;padding:6px 16px;font-size:15px}
#hud .which-owl .wo-say{max-width:34em;margin:0;text-align:center;font-size:clamp(19px,3.2vh,26px);line-height:1.35;text-shadow:0 2px 10px rgba(0,0,0,.6)}
#hud .which-owl .wo-picks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(8px,2vw,18px);width:min(640px,100%)}
#hud .which-owl .wo-picks.n2{grid-template-columns:repeat(2,minmax(0,1fr));width:min(440px,100%)}
#hud .which-owl .wo-picks.n4{grid-template-columns:repeat(4,minmax(0,1fr));width:min(760px,100%)}
#hud .which-owl .wo-picks.four{grid-template-columns:repeat(4,minmax(0,1fr));width:min(560px,100%)}
@media (max-width:560px){#hud .which-owl .wo-picks.n4{grid-template-columns:repeat(2,minmax(0,1fr));width:min(400px,100%)}}
#hud .which-owl .wo-pick{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;min-height:44px;padding:14px 8px 12px;border-radius:20px;
  background:rgba(246,241,227,.08);border:2px solid rgba(246,241,227,.2);color:#F6F1E3;box-shadow:none;font-size:15px;font-weight:700;line-height:1.25;white-space:normal}
#hud .which-owl .wo-pick:hover,#hud .which-owl .wo-pick:focus-visible{border-color:#FFD36A;background:rgba(255,211,106,.12)}
/* Words alone (OP-365), as every visitor sees an answer until its picture is painted: a card tall enough to be an easy tap, its words in the middle. */
#hud .which-owl .wo-picks.words .wo-pick{justify-content:center;min-height:clamp(76px,15vh,120px);padding:14px 12px;font-size:clamp(16px,2.6vh,20px)}
/* Three answers across a phone held upright leave each a column a word wide: there they stack, one to a row. */
@media (max-width:560px){#hud .which-owl .wo-picks.words.n3{grid-template-columns:minmax(0,1fr);width:min(360px,100%)}
  #hud .which-owl .wo-picks.words.n3 .wo-pick{min-height:64px}}
/* The picture's place (OP-326), on a painter's or keeper's tab: a box with the size to paint it at, until the art comes. */
#hud .which-owl .wo-pic{display:flex;align-items:center;justify-content:center;width:clamp(64px,12vh,${QUIZ_ART_SIZE}px);aspect-ratio:1;border:2px dashed rgba(246,241,227,.5);border-radius:12px;
  font-size:12px;font-weight:600;letter-spacing:.02em;color:rgba(246,241,227,.75);background:rgba(246,241,227,.05)}
#hud .which-owl .wo-feather{width:clamp(48px,10vh,76px);height:clamp(48px,10vh,76px)}
/* The owl is the reveal's centrepiece: it never gives up its room when the words run past a phone's
   screen (a flex child shrinks by default, which left a thumb-sized owl), and on a phone the owl
   itself stands about a third of the screen wide. */
#hud .which-owl .wo-stage{flex:0 0 auto;width:min(380px,88vw);height:min(400px,50vh,100vw)}
#hud .which-owl .wo-you{margin:0;font-size:15px;opacity:.85;letter-spacing:.04em;text-transform:uppercase}
#hud .which-owl .wo-name{margin:0;font-size:clamp(28px,5vh,40px);color:#FFD36A;text-shadow:0 2px 12px rgba(0,0,0,.55)}
#hud .which-owl .wo-fact{max-width:30em;margin:0;text-align:center;font-size:16px;line-height:1.4;opacity:.92}
#hud .which-owl .wo-about{max-width:32em;margin:0;text-align:center;font-size:17px;line-height:1.45}
#hud .which-owl .wo-enjoy{max-width:30em;margin:0;text-align:center;font-size:16px;line-height:1.4;color:#FFD36A}
#hud .which-owl .wo-thinking{font-style:italic;opacity:.9}
@media (max-height:720px) and (min-aspect-ratio:1/1){#hud .which-owl .wo-stage{height:min(260px,34vh)}}
@media (max-height:720px){#hud .which-owl .wo-about,#hud .which-owl .wo-fact,#hud .which-owl .wo-enjoy{font-size:15px}}
/* The reveal's words come in one by one, after the owl has landed (OP-330). */
@media (prefers-reduced-motion:no-preference){#hud .which-owl .wo-later{animation:wo-fade .5s ease-out both}}
@keyframes wo-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
#hud .which-owl .wo-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
#hud .which-owl .wo-actions button{min-height:48px;padding:8px 22px;font-size:17px}
@media (prefers-reduced-motion:no-preference){#hud .which-owl .wo-step{animation:wo-in .28s ease-out}}
@keyframes wo-in{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
/* While the quiz is up the feedback button keeps to the corner's row, at its other end (OP-369): halfway down the left edge it
   lay over the first answer on a phone. The row is the one the quiz keeps clear for Skip, so nothing of a card is ever there. */
#hud.quiz-up .fb-bug{top:max(10px,env(safe-area-inset-top));transform:none}
`;

let styled = false;

/** A feather in a colour set (drawn inline, so the card costs nothing to fetch). */
function feather(body: string, belly: string, accent: string): string {
  return `<svg class="wo-feather" viewBox="0 0 64 64" aria-hidden="true"><path d="M50 6C30 8 14 24 12 46l-4 12 4-2c4-6 8-9 14-10C44 42 56 26 50 6z" fill="${body}"/><path d="M46 12C34 18 22 30 16 50" stroke="${belly}" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="44" cy="16" r="5" fill="${accent}"/></svg>`;
}

export function createWhichOwlScreen(root: HTMLElement): WhichOwlScreen {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const modal = createModal(root, { name: 'which-owl', label: W.label, layout: 'full' });
  const box = modal.box;
  box.dataset['whichOwl'] = '';
  const artBoxes = showsArtBoxes(globalThis.location?.search ?? '');

  let run: WhichOwlRun | null = null;
  let attempt = 0;
  let cards: QuizCard[] = [];
  let answers: QuizAnswer[] = [];
  let nature: Nature = 'gentle';
  let stage: HTMLElement | null = null;

  const button = (text: string, cls = '', data: Record<string, string> = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    if (cls) b.className = cls;
    b.textContent = text;
    for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
    return b;
  };
  const say = (text: string) => Object.assign(document.createElement('p'), { className: 'wo-say', textContent: text });
  /** Clear the screen for the next step, with the corner (Skip on a first run, the count on a card). */
  const step = (count: string | null) => {
    if (pause !== null) {
      window.clearTimeout(pause);
      pause = null;
    }
    box.innerHTML = '';
    box.classList.remove('bright');
    if (stage) {
      stage = null;
      stageSize?.disconnect();
      run?.preview(null);
    }
    const corner = document.createElement('div');
    corner.className = 'wo-corner';
    if (count) corner.append(Object.assign(document.createElement('span'), { className: 'wo-count', textContent: count }));
    if (run?.firstRun) {
      const skip = button(W.skip, 'ghost', { woSkip: '' });
      skip.addEventListener('click', () => end({ kind: 'skip' }));
      corner.append(skip);
    } else {
      const x = button('Close', 'ghost', { close: '' });
      x.addEventListener('click', () => modal.close());
      corner.append(x);
    }
    box.append(corner);
    return box;
  };
  const focusFirst = (sel: string) => requestAnimationFrame(() => box.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true }));

  function intro(i: number): void {
    const el = step(null);
    const line = say(W.intro[i]!);
    line.classList.add('wo-step');
    line.dataset['woIntro'] = String(i);
    const next = button(W.next, '', { woNext: '' });
    next.addEventListener('click', () => (i + 1 < W.intro.length ? intro(i + 1) : ask(0)));
    el.append(line, next);
    focusFirst('[data-wo-next]');
  }

  function ask(i: number): void {
    const card = cards[i]!;
    const el = step(W.counter(i + 1, cards.length));
    const q = say(card.ask);
    q.classList.add('wo-step');
    const picks = document.createElement('div');
    picks.className = `wo-picks n${card.answers.length}${artBoxes ? '' : ' words'} wo-step`;
    picks.dataset['woCard'] = card.id;
    card.answers.forEach((a, n) => {
      const b = button('', 'wo-pick', { woAnswer: String(n) });
      if (artBoxes) {
        // For the artist: the art key names the picture, and the box says the size to paint it at.
        const pic = Object.assign(document.createElement('span'), { className: 'wo-pic', textContent: `${QUIZ_ART_SIZE} × ${QUIZ_ART_SIZE}` });
        pic.setAttribute('aria-hidden', 'true');
        pic.dataset['woArt'] = a.pic;
        b.append(pic);
      }
      b.append(Object.assign(document.createElement('span'), { textContent: a.label }));
      b.addEventListener('click', () => {
        // No undo: the next card slides in.
        answers.push(a);
        if (i + 1 < cards.length) ask(i + 1);
        else {
          nature = natureOf(answers);
          answers = [];
          colours();
        }
      });
      picks.append(b);
    });
    el.append(q, picks);
    focusFirst('[data-wo-answer="0"]');
  }

  function colours(): void {
    const el = step(null);
    const q = say(W.colours);
    q.classList.add('wo-step');
    const picks = document.createElement('div');
    picks.className = 'wo-picks four wo-step';
    const natural = getSpecies(natureDef(nature).species).natural;
    for (const set of COLOUR_SETS) {
      const c = set.colours ?? natural;
      const b = button('', 'wo-pick', { woColours: set.id });
      b.setAttribute('aria-label', set.name);
      b.innerHTML = feather(c.body, c.belly, c.accent);
      b.addEventListener('click', () => thinking(set.id));
      picks.append(b);
    }
    el.append(q, picks);
    focusFirst('[data-wo-colours]');
  }

  /** A short pause before the reveal (OP-330), so the answer lands as a moment, not a jump. */
  let pause: number | null = null;
  function thinking(set: ColourSetId): void {
    const el = step(null);
    const line = say(W.thinking);
    line.classList.add('wo-step', 'wo-thinking');
    line.dataset['woThinking'] = '';
    el.append(line);
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    pause = window.setTimeout(() => {
      pause = null;
      reveal(set);
    }, calm ? 400 : 1200);
  }

  function reveal(set: ColourSetId): void {
    if (!run) return;
    const r = run;
    const def = natureDef(nature);
    const look = quizLook(r.base(), nature, set);
    r.reveal(look);
    const el = step(null);
    el.classList.add('bright');
    const line = say(def.line);
    const owl = document.createElement('div');
    owl.className = 'wo-stage';
    owl.dataset['woStage'] = '';
    const you = Object.assign(document.createElement('p'), { className: 'wo-you', textContent: W.youAre });
    const name = Object.assign(document.createElement('h2'), { className: 'wo-name', textContent: def.title });
    name.dataset['woResult'] = def.species;
    name.dataset['woNature'] = def.id;
    const about = Object.assign(document.createElement('p'), { className: 'wo-about', textContent: def.about });
    about.dataset['woAbout'] = '';
    const fact = Object.assign(document.createElement('p'), { className: 'wo-fact', textContent: def.fact });
    fact.dataset['woFact'] = '';
    const enjoy = Object.assign(document.createElement('p'), { className: 'wo-enjoy', textContent: def.enjoy });
    enjoy.dataset['woEnjoy'] = '';
    const actions = document.createElement('div');
    actions.className = 'wo-actions';
    // A first run goes straight into the park from here (OP-367); a retake is already in it.
    const keep = button(r.firstRun ? W.play : W.keep, '', { woKeep: '' });
    keep.addEventListener('click', () => end({ kind: 'keep', look }));
    const makeBtn = button(W.makeYours, 'ghost', { woMake: '' });
    makeBtn.addEventListener('click', () => end({ kind: 'make', look }));
    const again = button(W.again, 'ghost', { woAgain: '' });
    again.addEventListener('click', () => begin(false));
    actions.append(keep, makeBtn, again);
    // The owl glides in first (about a second); its name and the words follow, one after another.
    [line, you, name, about, fact, enjoy, actions].forEach((w, i) => {
      w.classList.add('wo-later');
      w.style.animationDelay = `${(i < 3 ? 0.9 : 1.3) + i * 0.15}s`;
    });
    el.append(line, owl, you, name, about, fact, enjoy, actions);
    stage = owl;
    arriving = true;
    stageSize?.disconnect();
    stageSize?.observe(owl);
    // Once now, and again once the layout has settled (fonts, the buttons wrapping).
    requestAnimationFrame(() => {
      frame();
      requestAnimationFrame(frame);
    });
    focusFirst('[data-wo-keep]');
  }

  /** The first frame of a reveal carries the glide in; the ones after only move the frame. */
  let arriving = false;
  const frame = () => {
    if (!stage || !modal.isOpen() || !run) return;
    const r = stage.getBoundingClientRect();
    run.preview({ x: r.left, y: r.top, w: r.width, h: r.height, close: true, ...(arriving ? { arrive: true } : {}) });
    arriving = false;
  };
  window.addEventListener('resize', frame);
  // On a short phone the reveal scrolls: the owl's frame follows the stage (OP-325).
  box.addEventListener('scroll', frame, { passive: true });
  const stageSize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => frame()) : null;

  /** A run from the top (`withIntro`), or again from the first card with a fresh draw (Not me? Try again). */
  function begin(withIntro: boolean): void {
    if (!run) return;
    attempt += 1;
    cards = drawCards(`${run.seed}:${attempt}`);
    answers = [];
    if (withIntro) intro(0);
    else ask(0);
  }

  /** How the run ended, for the close that follows (a close with none set is Escape or Close). */
  let ending: WhichOwlEnd | null = null;
  function end(how: WhichOwlEnd): void {
    ending = how;
    modal.close();
  }

  modal.onClose(() => {
    root.classList.remove('quiz-up');
    const r = run;
    if (pause !== null) window.clearTimeout(pause);
    pause = null;
    if (stage) r?.preview(null);
    stage = null;
    stageSize?.disconnect();
    answers = [];
    run = null;
    box.innerHTML = '';
    const how = ending ?? { kind: 'closed' };
    ending = null;
    r?.done(how);
  });

  return {
    open(next, opener) {
      run = next;
      ending = null;
      attempt = 0;
      root.classList.add('quiz-up');
      modal.open(opener);
      begin(true);
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
    onClose: (cb) => modal.onClose(cb),
  };
}
