import { FULL_OPENING_MS } from './preview';

/**
 * The feedback bug (OP-208, Logan, 2026-11-02): until the park fully opens on December 1, a small
 * button (a grey mouse since 2026-11-05; it was a bug) stays on screen everywhere (the home screen, every room, and over the arcade, the climb
 * and the owl builder) and opens the one Feedback form. It pins to the left edge, halfway down, clear
 * of the top bar, the screens' close buttons and the movement controls along the bottom (on the home
 * screen, whose buttons fill its left side, to the right edge). It switches
 * itself off at the full opening with no deploy; FEEDBACK_BUG_ON turns it off sooner. On a phone's park
 * view it gives way to the Menu's own Feedback button (OP-242), one tap away.
 */

/** One switch: false takes the bug away everywhere, whatever the date. */
export const FEEDBACK_BUG_ON = true;

/** Its words (for the owner's approval). */
export const FEEDBACK_BUG_WORDS = {
  label: 'Send feedback: found a bug or have an idea?',
} as const;

/** Whether the bug shows: switched on, and the full opening has not come. */
export function feedbackBugShown(now: number = Date.now(), on: boolean = FEEDBACK_BUG_ON): boolean {
  return on && now < FULL_OPENING_MS;
}

/** How often a page left open checks the date, so the bug goes at the opening without a reload. */
const CHECK_EVERY_MS = 60_000;

/**
 * The feedback button's picture: a grey mouse (Logan, 2026-11-05, in place of the bug it began as), the
 * same Mouse that a first note wins (OP-272), so the button and the card beside it tell one story. It is
 * drawn in `body`, with its eye and the line round its ear cut out so whatever is behind shows through
 * (the Menu's Feedback button wears it too, OP-242). The inside of its ear and its nose stay pink.
 */
let cuts = 0;
/** Each drawing has a cut-out of its own: a hidden Menu holding the first one with a shared id would leave the button's mouse without its eye. */
export const feedbackIcon = (body: string, id = `fb-mouse-cut-${++cuts}`) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><circle cx="14.4" cy="8.4" r="3.5" fill="#000"/><circle cx="17.7" cy="12.6" r="1" fill="#000"/></mask><g mask="url(#${id})"><path d="M6 16.7C4 17.3 2.6 16.2 2.8 14.3" fill="none" stroke="${body}" stroke-width="1.5" stroke-linecap="round"/><path d="M5.4 15.3C5.4 11.4 8.4 8.7 12.4 8.7c2.6 0 4.4 1.1 5.8 2.9l3.3 2.2c.5.3.4 1-.1 1.2l-2.6.9c-1 1.6-3.2 2.6-6.4 2.6H7.3C6.2 18.5 5.4 17.5 5.4 16.5z" fill="${body}"/></g><circle cx="14.4" cy="8.4" r="3" fill="${body}"/><circle cx="14.4" cy="8.4" r="1.5" fill="#F2A7B5"/><circle cx="21.6" cy="14.4" r=".8" fill="#F2A7B5"/></svg>`;

/** The grey of the Mouse that a first note wins (Mouse · Original). */
const MOUSE_GREY = '#C9CED6';

const BUG_ICON = feedbackIcon(MOUSE_GREY);

const CSS = `
#hud .fb-bug{position:fixed;z-index:21;left:max(6px,env(safe-area-inset-left));top:50%;transform:translateY(-50%);width:44px;height:44px;min-height:44px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(12,30,54,.72);border:1px solid rgba(255,211,106,.55);box-shadow:0 2px 10px rgba(0,0,0,.4);opacity:.85;touch-action:manipulation}
#hud .fb-bug:hover,#hud .fb-bug:focus-visible{opacity:1}
#hud .fb-bug:focus-visible{outline:2px solid #FFD36A;outline-offset:2px}
#hud .fb-bug svg{width:26px;height:26px}
/* The home screen's buttons fill its left side, so there the bug keeps to the right edge (under a covering screen, the left again). */
#hud.at-home:not(.covered) .fb-bug{left:auto;right:max(6px,env(safe-area-inset-right))}
#hud .fb-bug[hidden]{display:none}
/* A phone's park view keeps it in the Menu, by Close (OP-242); on the home screen and over a covering screen it stays. */
@media (pointer:coarse){#hud:not(.at-home):not(.covered) .fb-bug{display:none}}
`;

export interface FeedbackBug {
  readonly button: HTMLButtonElement;
  /** Show or hide it now, by the date. */
  refresh(): void;
}

/**
 * The bug button, in the HUD's root (outside the parts that hide under a covering screen). It sits
 * over every screen but under the Feedback form itself. `open` is given the button, which takes the
 * focus back when the form closes.
 */
export function createFeedbackBug(root: HTMLElement, open: (button: HTMLElement) => void, now: () => number = Date.now): FeedbackBug {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const button = document.createElement('button');
  button.className = 'fb-bug';
  button.dataset['feedbackBug'] = '';
  button.setAttribute('aria-label', FEEDBACK_BUG_WORDS.label);
  button.title = FEEDBACK_BUG_WORDS.label;
  button.innerHTML = BUG_ICON;
  // Its own tap only: the park underneath never hears it as a step or a jump.
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    open(button);
  });
  root.appendChild(button);

  let timer: ReturnType<typeof setInterval> | null = null;
  const refresh = () => {
    const shown = feedbackBugShown(now());
    button.hidden = !shown;
    if (!shown && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  refresh();
  if (feedbackBugShown(now())) timer = setInterval(refresh, CHECK_EVERY_MS);
  return { button, refresh };
}
