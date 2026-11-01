/**
 * Which owl are you (OP-076): a new owl's first run, between Make your owl and the owl builder. A
 * voice in the dark (the Keeper, never drawn) says three lines, asks eight questions answered with a
 * tap on one of three pictures, then a last card for the owl's colours, and tells the owl which owl it
 * is: the owl drawn big in its new kind and colours (the builder's preview scene draws it in the frame
 * this screen leaves for it), with Keep it, Make it yours, and Not me? Try again. Skip, in the corner,
 * goes to the builder at once. Retake the quiz (the Menu's Settings tab) runs it again for an owl that
 * already exists: only its kind and colours change, never its id, friend code or what it wears.
 *
 * Nothing typed, no names, no score shown, no back button. The answers are kept nowhere: only the
 * result goes on, as the look. The words, pictures and points are in packages/shared/src/whichOwlBank.ts.
 * TODO-DOCS (OP-076): PLAYBOOK.md section 7 ("Your owl") and the home screen's first run say Make your
 * owl opens the builder; it now opens this quiz first (Skip, Make it yours and Not me? as above), and
 * the Menu's Settings tab has Retake the quiz.
 */
import { COLOUR_SETS, WHICH_OWL_WORDS as W, drawCards, getSpecies, natureDef, natureOf, quizLook, type ColourSetId, type Nature, type OwlLook, type QuizAnswer, type QuizCard } from '@owl-park/shared';
import { createModal } from './modal';
import type { PreviewFrame } from './owlBuilder';

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
#hud .layer.full .modal.which-owl{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(14px,3vh,26px);
  padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:radial-gradient(ellipse at 50% 18%,rgba(255,211,106,.22),rgba(255,211,106,0) 42%),#0A1626;color:#F6F1E3;overflow:auto;transition:background-color .5s ease-out}
#hud .layer.full .modal.which-owl.bright{background:radial-gradient(ellipse at 50% 40%,rgba(255,211,106,.32),rgba(255,211,106,0) 60%),#163256}
#hud .which-owl .wo-corner{position:absolute;top:max(10px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;align-items:center;gap:10px}
#hud .which-owl .wo-count{font-size:14px;opacity:.75}
#hud .which-owl .wo-corner button{min-height:44px;padding:6px 16px;font-size:15px}
#hud .which-owl .wo-say{max-width:34em;margin:0;text-align:center;font-size:clamp(19px,3.2vh,26px);line-height:1.35;text-shadow:0 2px 10px rgba(0,0,0,.6)}
#hud .which-owl .wo-picks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(8px,2vw,18px);width:min(640px,100%)}
#hud .which-owl .wo-picks.four{grid-template-columns:repeat(4,minmax(0,1fr));width:min(560px,100%)}
#hud .which-owl .wo-pick{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;min-height:44px;padding:14px 8px 12px;border-radius:20px;
  background:rgba(246,241,227,.08);border:2px solid rgba(246,241,227,.2);color:#F6F1E3;box-shadow:none;font-size:15px;font-weight:700;line-height:1.25;white-space:normal}
#hud .which-owl .wo-pick:hover,#hud .which-owl .wo-pick:focus-visible{border-color:#FFD36A;background:rgba(255,211,106,.12)}
#hud .which-owl .wo-pic{font-size:clamp(44px,9vh,72px);line-height:1}
#hud .which-owl .wo-feather{width:clamp(48px,10vh,76px);height:clamp(48px,10vh,76px)}
#hud .which-owl .wo-stage{width:min(320px,70vw);height:min(340px,38vh)}
#hud .which-owl .wo-you{margin:0;font-size:15px;opacity:.85;letter-spacing:.04em;text-transform:uppercase}
#hud .which-owl .wo-name{margin:0;font-size:clamp(28px,5vh,40px);color:#FFD36A;text-shadow:0 2px 12px rgba(0,0,0,.55)}
#hud .which-owl .wo-fact{max-width:30em;margin:0;text-align:center;font-size:16px;line-height:1.4;opacity:.92}
#hud .which-owl .wo-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
#hud .which-owl .wo-actions button{min-height:48px;padding:8px 22px;font-size:17px}
@media (prefers-reduced-motion:no-preference){#hud .which-owl .wo-step{animation:wo-in .28s ease-out}}
@keyframes wo-in{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
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
    box.innerHTML = '';
    box.classList.remove('bright');
    if (stage) {
      stage = null;
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
    picks.className = 'wo-picks wo-step';
    picks.dataset['woCard'] = card.id;
    card.answers.forEach((a, n) => {
      const b = button('', 'wo-pick', { woAnswer: String(n) });
      b.innerHTML = `<span class="wo-pic" aria-hidden="true">${a.pic}</span><span></span>`;
      b.lastElementChild!.textContent = a.label;
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
      b.addEventListener('click', () => reveal(set.id));
      picks.append(b);
    }
    el.append(q, picks);
    focusFirst('[data-wo-colours]');
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
    const fact = Object.assign(document.createElement('p'), { className: 'wo-fact', textContent: def.fact });
    const actions = document.createElement('div');
    actions.className = 'wo-actions';
    const keep = button(W.keep, '', { woKeep: '' });
    keep.addEventListener('click', () => end({ kind: 'keep', look }));
    const makeBtn = button(W.makeYours, 'ghost', { woMake: '' });
    makeBtn.addEventListener('click', () => end({ kind: 'make', look }));
    const again = button(W.again, 'ghost', { woAgain: '' });
    again.addEventListener('click', () => begin(false));
    actions.append(keep, makeBtn, again);
    el.append(line, owl, you, name, fact, actions);
    stage = owl;
    requestAnimationFrame(frame);
    focusFirst('[data-wo-keep]');
  }

  const frame = () => {
    if (!stage || !modal.isOpen() || !run) return;
    const r = stage.getBoundingClientRect();
    run.preview({ x: r.left, y: r.top, w: r.width, h: r.height });
  };
  window.addEventListener('resize', frame);

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
    const r = run;
    if (stage) r?.preview(null);
    stage = null;
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
      modal.open(opener);
      begin(true);
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
    onClose: (cb) => modal.onClose(cb),
  };
}
