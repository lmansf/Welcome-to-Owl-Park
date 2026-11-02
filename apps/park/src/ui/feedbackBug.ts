import { FULL_OPENING_MS } from './preview';

/**
 * The feedback bug (OP-208, Logan, 2026-11-02): until the park fully opens on December 1, a small
 * bug button stays on screen everywhere (the home screen, every room, and over the arcade, the climb
 * and the owl builder) and opens the one Feedback form. It pins to the left edge, halfway down, clear
 * of the top bar, the screens' close buttons and the movement controls along the bottom (on the home
 * screen, whose buttons fill its left side, to the right edge). It switches
 * itself off at the full opening with no deploy; FEEDBACK_BUG_ON turns it off sooner.
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

const BUG_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="#FFD36A" stroke-width="1.8" stroke-linecap="round"><path d="M8 6.5 6 4.5M16 6.5l2-2M5 11H2.5M21.5 11H19M5.5 16 3 17.5M18.5 16l2.5 1.5"/></g><ellipse cx="12" cy="13" rx="6" ry="7" fill="#FFD36A"/><path d="M12 7v13" stroke="#0C1E36" stroke-width="1.6"/><circle cx="12" cy="6.5" r="3" fill="#FFD36A" stroke="#0C1E36" stroke-width="1.2"/></svg>`;

const CSS = `
#hud .fb-bug{position:fixed;z-index:21;left:max(6px,env(safe-area-inset-left));top:50%;transform:translateY(-50%);width:44px;height:44px;min-height:44px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(12,30,54,.72);border:1px solid rgba(255,211,106,.55);box-shadow:0 2px 10px rgba(0,0,0,.4);opacity:.85;touch-action:manipulation}
#hud .fb-bug:hover,#hud .fb-bug:focus-visible{opacity:1}
#hud .fb-bug:focus-visible{outline:2px solid #FFD36A;outline-offset:2px}
#hud .fb-bug svg{width:22px;height:22px}
/* The home screen's buttons fill its left side, so there the bug keeps to the right edge (under a covering screen, the left again). */
#hud.at-home:not(.covered) .fb-bug{left:auto;right:max(6px,env(safe-area-inset-right))}
#hud .fb-bug[hidden]{display:none}
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
