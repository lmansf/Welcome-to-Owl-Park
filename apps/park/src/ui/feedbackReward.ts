import { FEEDBACK_MOUSE, feedbackCardShown, nextFeedbackRung, type FeedbackReward, type FeedbackRewardView } from '@owl-park/shared';
import { feedbackBugShown } from './feedbackBug';
import { variantIcon } from './itemIcon';

/**
 * Thanks for feedback, the page's half (OP-272, Logan, 2026-11-05). A grey mouse sits beside the
 * feedback bug holding up a little card, "Your first note wins a grey mouse!", until this owl has won
 * the mouse or closed the card (the park keeps the close for the owl, so it stays closed on every
 * device). Tapping the card opens the Feedback form, which says what this note will bring; the thanks
 * says what it brought. The card goes with the bug on December 1 (OP-208), hides where the bug hides
 * (a phone's park view, where Feedback lives in the Menu) and under a covering screen, and never
 * shows to a guest, whose notes bring nothing.
 *
 * The words are drafts for the owner's approval.
 */
export const FEEDBACK_REWARD_WORDS = {
  /** The card beside the bug. */
  card: 'Your first note wins a grey mouse!',
  /** What a screen reader calls the card's button. */
  cardLabel: 'Send feedback and win a grey mouse',
  /** The card's close button. */
  close: 'Hide this',
  /** The form, before the first note that counts. */
  firstNote: 'Your first note wins a grey mouse.',
  /** The thanks once the mouse is in. */
  mouse: 'Thank you! A grey mouse is waiting in your collection.',
} as const;

const feathersOf = (n: number) => `${n} feather${n === 1 ? '' : 's'}`;

/** What the form says this note will bring, or null when it brings nothing (a guest, no server, the top of the ladder). */
export function rewardLine(view: FeedbackRewardView | null): string | null {
  if (!view?.earns) return null;
  const rung = nextFeedbackRung(view.given);
  if (!rung) return null;
  if ('item' in rung) return FEEDBACK_REWARD_WORDS.firstNote;
  return `Your next note earns ${feathersOf(rung.feathers)}.`;
}

/** The thanks for a note that climbed the ladder. */
export function rewardThanks(r: FeedbackReward): string {
  if (r.item && !r.dup) return FEEDBACK_REWARD_WORDS.mouse;
  if (r.item) return `Thank you! You already have the grey mouse, so here are ${feathersOf(r.feathers)}.`;
  return `Thank you! Here are ${feathersOf(r.feathers)} for your note.`;
}

/** The ladder after a note climbed it. */
export function afterReward(view: FeedbackRewardView | null, r: FeedbackReward): FeedbackRewardView {
  return { earns: true, closed: view?.closed ?? false, given: Math.max(view?.given ?? 0, r.step) };
}

/** Whether the card shows now: by the ladder, and while the bug does. */
export function feedbackCardVisible(view: FeedbackRewardView | null, now: number = Date.now()): boolean {
  return feedbackCardShown(view) && feedbackBugShown(now);
}

const CSS = `
#hud .fb-card{position:fixed;z-index:21;left:calc(max(6px,env(safe-area-inset-left)) + 54px);top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:2px;padding:2px;border-radius:14px;background:rgba(12,30,54,.88);border:1px solid rgba(255,211,106,.55);box-shadow:0 2px 10px rgba(0,0,0,.4);color:#F6F1E3}
/* The card's tail points back at the bug the mouse sits beside. */
#hud .fb-card::before{content:'';position:absolute;left:-7px;top:50%;width:12px;height:12px;transform:translateY(-50%) rotate(45deg);background:rgba(12,30,54,.88);border-left:1px solid rgba(255,211,106,.55);border-bottom:1px solid rgba(255,211,106,.55)}
#hud .fb-card .fb-card-open{display:flex;align-items:center;gap:6px;min-height:44px;max-width:min(210px,calc(100vw - 150px));padding:2px 6px 2px 4px;background:none;border:0;box-shadow:none;color:inherit;font:inherit;font-size:13px;line-height:1.25;text-align:left;cursor:pointer}
#hud .fb-card .fb-card-open canvas{flex:none;width:40px;height:32px}
#hud .fb-card .fb-card-x{flex:none;width:32px;height:32px;min-height:32px;padding:0;border-radius:50%;background:none;border:0;box-shadow:none;color:rgba(246,241,227,.75);font-size:18px;line-height:1}
#hud .fb-card button:focus-visible{outline:2px solid #FFD36A;outline-offset:1px}
/* On the home screen the bug keeps to the right edge, so the card sits to its left with the tail on its right. */
#hud.at-home:not(.covered) .fb-card{left:auto;right:calc(max(6px,env(safe-area-inset-right)) + 54px)}
#hud.at-home:not(.covered) .fb-card::before{left:auto;right:-7px;transform:translateY(-50%) rotate(225deg)}
/* Only over the park and the home screen: a covering screen or a game has the room to itself. */
#hud.covered .fb-card,#hud .fb-card[hidden]{display:none}
/* A phone's park view keeps Feedback in the Menu (OP-242), so the card goes with the bug. */
@media (pointer:coarse){#hud:not(.at-home):not(.covered) .fb-card{display:none}}
`;

export interface FeedbackCard {
  readonly el: HTMLElement;
  /** Show or hide it for the ladder as it stands (and the date). */
  refresh(view: FeedbackRewardView | null): void;
}

/** How often a page left open checks the date, so the card goes with the bug at the opening. */
const CHECK_EVERY_MS = 60_000;

/** The card, in the HUD's root beside the feedback bug. `open` opens the form; `close` hides it for this owl. */
export function createFeedbackCard(root: HTMLElement, open: (from: HTMLElement) => void, close: () => void, now: () => number = Date.now): FeedbackCard {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'fb-card';
  el.dataset['feedbackCard'] = '';
  el.hidden = true;
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'fb-card-open';
  openBtn.setAttribute('aria-label', FEEDBACK_REWARD_WORDS.cardLabel);
  openBtn.append(variantIcon(FEEDBACK_MOUSE, 40, 32));
  const words = document.createElement('span');
  words.textContent = FEEDBACK_REWARD_WORDS.card;
  openBtn.append(words);
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'fb-card-x';
  x.dataset['feedbackCardClose'] = '';
  x.setAttribute('aria-label', FEEDBACK_REWARD_WORDS.close);
  x.title = FEEDBACK_REWARD_WORDS.close;
  x.textContent = '×';
  el.append(openBtn, x);
  // Its own taps only: the park underneath never hears them as a step or a jump.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    open(openBtn);
  });
  x.addEventListener('click', (e) => {
    e.stopPropagation();
    el.hidden = true;
    close();
  });
  root.appendChild(el);

  let last: FeedbackRewardView | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const refresh = (view: FeedbackRewardView | null) => {
    last = view;
    el.hidden = !feedbackCardVisible(view, now());
    if (!el.hidden && timer === null) timer = setInterval(() => refresh(last), CHECK_EVERY_MS);
    if (el.hidden && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  return { el, refresh };
}
