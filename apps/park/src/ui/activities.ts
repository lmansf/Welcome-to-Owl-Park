import { QUIZ_EVERY_MS, QUIZ_ZONE_IDS, variantName, type QuizZone } from '@owl-park/shared';
import { variantIcon } from './itemIcon';

/** The stage quiz as the card shows it while the owl is by the stage. */
export type QuizView =
  | {
      phase: 'open' | 'reveal';
      question: string;
      /** The answer standing in each zone. */
      answers: Record<QuizZone, string>;
      /** Whole seconds until the question closes (open) or the answer goes (reveal). */
      seconds: number;
      /** The zone the owl stands in. */
      mine: QuizZone | null;
      /** After the question closes: the right zone, and whether the room counted this owl's answer. */
      right?: QuizZone;
      won?: boolean;
    }
  | { phase: 'wait'; seconds: number };

/** The robot owl's copy game as its card shows it. */
export interface CopyView {
  /** The robot plays the tune (`playing`: the note sounding now, -1 between notes), then waits for the owl. */
  phase: 'listen' | 'play';
  tune: string[];
  playing: number;
  /** Notes copied so far, and tunes copied this game. */
  got: number;
  level: number;
  /** Whole seconds left for the next note. */
  seconds: number;
  /** The emotes the robot plays this game: one button each. */
  notes: string[];
}

export interface ActivityCards {
  setQuiz(view: QuizView | null): void;
  setCopy(view: CopyView | null): void;
  /** A note button (an emote), or null for Stop. */
  onCopy(cb: (note: string | null) => void): void;
}

const ZONE_TINTS: Record<QuizZone, string> = { a: '#9FE8FF', b: '#FFD36A', c: '#FF8CC6' };

const CSS = `
#hud .cards{display:flex;flex-direction:column;gap:8px;margin-top:8px;width:min(380px,calc(100vw - 24px))}
@media (min-width:761px){#hud .cards{position:absolute;margin:0;top:calc(max(10px,env(safe-area-inset-top)) + 52px);right:max(12px,env(safe-area-inset-right))}}
@media (max-width:760px){#hud.playing .tracker.show{display:none}}
#hud .play-card{pointer-events:auto;background:rgba(12,30,54,.9);border:1px solid rgba(246,241,227,.18);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 6px 24px rgba(0,0,0,.45);backdrop-filter:blur(6px);animation:hud-in .25s ease-out}
#hud .play-card header{display:flex;align-items:baseline;gap:8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;opacity:.85}
#hud .play-card header b{flex:1;color:#FFD36A}
#hud .play-card .q{font-size:15px;font-weight:700;line-height:1.3}
#hud .play-card .answers{display:flex;flex-direction:column;gap:4px}
#hud .play-card .ans{display:flex;gap:8px;align-items:center;font-size:14px;padding:5px 8px;border-radius:10px;border:1px solid rgba(246,241,227,.12)}
#hud .play-card .ans b{width:24px;height:24px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#0C1E36;background:var(--tint);font-size:13px}
#hud .play-card .ans.mine{border-color:var(--tint);background:rgba(246,241,227,.08)}
#hud .play-card .ans.right{border-color:#FFD36A;background:rgba(255,211,106,.18)}
#hud .play-card .ans.wrong{opacity:.45}
#hud .play-card .foot{font-size:13px;opacity:.9}
#hud .play-card .slots{display:flex;gap:6px;flex-wrap:wrap;min-height:36px;align-items:center}
#hud .play-card .slot{width:34px;height:34px;border-radius:50%;border:2px solid rgba(246,241,227,.25);display:flex;align-items:center;justify-content:center;font-size:13px}
#hud .play-card .slot.on{border-color:#FFD36A;box-shadow:0 0 10px rgba(255,211,106,.6)}
#hud .play-card .slot.got{border-color:#8FE3A8;color:#8FE3A8}
#hud .play-card .slot canvas{width:22px;height:22px}
#hud .play-card .notes{display:flex;gap:6px;flex-wrap:wrap}
#hud .play-card .notes button{min-height:40px;padding:6px 10px;font-size:13px;background:rgba(246,241,227,.1);color:#F6F1E3;border:1px solid rgba(246,241,227,.22);box-shadow:none;display:flex;align-items:center;gap:6px}
#hud .play-card .notes button:disabled{opacity:.45;cursor:default}
#hud .play-card .notes canvas{width:18px;height:18px}
#hud .play-card .play-foot{display:flex;justify-content:space-between;align-items:center;gap:8px}
#hud .play-card .play-foot button{min-height:34px;padding:5px 12px;font-size:13px}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const letter = (z: QuizZone) => z.toUpperCase();

/**
 * The activity cards under the top bar: the stage quiz's question while the owl is by the stage, and
 * the robot owl's tune while its copy game runs. The quest tracker steps aside while one shows.
 */
export function createActivityCards(root: HTMLElement, bar: HTMLElement): ActivityCards {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const cards = el('div', 'cards');
  bar.insertAdjacentElement('afterend', cards);
  const quizCard = el('section', 'play-card quiz');
  quizCard.setAttribute('aria-label', 'Stage quiz');
  quizCard.setAttribute('aria-live', 'polite');
  const copyCard = el('section', 'play-card copy');
  copyCard.setAttribute('aria-label', "The robot owl's tune");
  let copyCb: ((note: string | null) => void) | null = null;
  let quizKey = '';
  let copyKey = '';

  const shown = () => root.classList.toggle('playing', cards.childElementCount > 0);
  const place = (card: HTMLElement, on: boolean) => {
    if (on && !card.isConnected) cards.appendChild(card);
    else if (!on && card.isConnected) card.remove();
    shown();
  };

  const renderQuiz = (v: QuizView) => {
    quizCard.innerHTML = '';
    quizCard.dataset['phase'] = v.phase;
    const head = el('header');
    head.append(el('b', '', 'Stage quiz'));
    if (v.phase === 'wait') {
      head.append(el('span', '', `next question in ${v.seconds} s`));
      quizCard.append(head, el('div', 'foot', `A new question every ${Math.round(QUIZ_EVERY_MS / 1000)} seconds: stand on your answer in front of the stage.`));
      return;
    }
    head.append(el('span', '', v.phase === 'open' ? `${v.seconds} s left` : 'the answer'));
    quizCard.append(head, el('div', 'q', v.question));
    const list = el('div', 'answers');
    for (const z of QUIZ_ZONE_IDS) {
      const cls = ['ans', v.mine === z ? 'mine' : '', v.right ? (v.right === z ? 'right' : 'wrong') : ''].filter(Boolean).join(' ');
      const row = el('div', cls);
      row.dataset['zone'] = z;
      row.style.setProperty('--tint', ZONE_TINTS[z]);
      row.append(el('b', '', letter(z)), el('span', '', v.answers[z]));
      list.appendChild(row);
    }
    quizCard.appendChild(list);
    let foot: string;
    if (v.phase === 'open') foot = v.mine ? `Your answer: ${letter(v.mine)}. Stay on it until the time is up.` : 'Stand on A, B or C in front of the stage to answer.';
    else if (v.won || (v.right && v.mine === v.right)) foot = 'Right!';
    else if (v.right && v.mine) foot = `Not this time: the answer was ${letter(v.right)}.`;
    else foot = v.right ? `The answer was ${letter(v.right)}. Stand on a letter next time.` : 'The answer is...';
    quizCard.appendChild(el('div', 'foot', foot));
  };

  // The copy card is built once and updated in place, so a note button never moves under a tap.
  const copyLevel = el('span');
  const copyHead = el('header');
  copyHead.append(el('b', '', "The robot owl's tune"), copyLevel);
  const slots = el('div', 'slots');
  const notesBox = el('div', 'notes');
  const copyFoot = el('span', 'foot');
  const stop = el('button', 'ghost', 'Stop');
  stop.addEventListener('click', () => copyCb?.(null));
  const copyRow = el('div', 'play-foot');
  copyRow.append(copyFoot, stop);
  copyCard.append(copyHead, slots, notesBox, copyRow);
  let notesShown = '';

  const renderCopy = (v: CopyView) => {
    copyCard.dataset['phase'] = v.phase;
    copyLevel.textContent = `tune ${v.level + 1}`;
    slots.innerHTML = '';
    v.tune.forEach((note, i) => {
      const lit = v.phase === 'listen' && i === v.playing;
      const slot = el('div', `slot${lit ? ' on' : ''}${v.phase === 'play' && i < v.got ? ' got' : ''}`);
      if (lit) {
        slot.appendChild(variantIcon(note, 22, 22));
        slot.title = variantName(note);
      } else if (v.phase === 'play' && i < v.got) slot.textContent = '✓';
      slots.appendChild(slot);
    });
    if (v.notes.join() !== notesShown) {
      notesShown = v.notes.join();
      notesBox.innerHTML = '';
      for (const n of v.notes) {
        const b = el('button');
        b.dataset['note'] = n;
        b.append(variantIcon(n, 18, 18), document.createTextNode(variantName(n)));
        b.addEventListener('click', () => copyCb?.(n));
        notesBox.appendChild(b);
      }
    }
    for (const b of notesBox.querySelectorAll('button')) b.disabled = v.phase !== 'play';
    copyFoot.textContent = v.phase === 'listen' ? 'Listen to the robot owl...' : `Your turn! Next note within ${v.seconds} s.`;
  };

  return {
    setQuiz(v) {
      const key = v ? JSON.stringify(v) : '';
      if (key === quizKey) return;
      quizKey = key;
      if (v) renderQuiz(v);
      place(quizCard, v !== null);
    },
    setCopy(v) {
      const key = v ? JSON.stringify(v) : '';
      if (key === copyKey) return;
      copyKey = key;
      if (v) renderCopy(v);
      place(copyCard, v !== null);
    },
    onCopy(cb) {
      copyCb = cb;
    },
  };
}
