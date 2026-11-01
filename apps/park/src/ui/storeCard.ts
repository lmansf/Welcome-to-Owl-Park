/**
 * Before the store (OP-153): a way from the park to the store's pages first shows this one card: a
 * short line and two buttons, Continue and Not now. No timer and no spending limit. Since OP-180 it
 * shows once for each purchase, right before it: a turnstile reached without a ticket that works
 * asks it before checkout opens for a Day Ticket, with what the turnstiles say above its line;
 * opening night's pass offer after the turnstiles asks it before the pass's checkout; and the gift
 * shop's door asks it before the store's page.
 *
 * Continue goes on exactly as the way would, in the same click, so a popup blocker still lets the
 * window through: a way that opens a window gets the opener in Continue's click, and a link is
 * Continue itself. That opener, and the link maker beside it, are how what follows the same purchase
 * reaches the store without asking again (OP-180: Back to checkout, Open checkout when the browser
 * blocked the window, and the half-price pass offered once the Day Ticket has come). Not now, Escape
 * or a tap beside the card goes back to where the visitor was, the focus on the control that asked
 * (if any). The card takes the focus as it opens (not Continue, so a stray key never buys), and Tab
 * reaches both buttons; both are 44 px or more, in the Menu's base theme.
 *
 * This file is the only place in the park's code that opens a window or makes a link off the park:
 * storeCard.test.ts reads the code for any other, so no new way can skip the card.
 *
 * TODO-DOCS (OP-153, OP-180): the card before the store in docs/ARCHITECTURE.md (the purchase path)
 * and docs/PLAYBOOK.md section 7, with its line, which the owner approves (`STORE_WORDS.ask`).
 */
import { createModal } from './modal';
import { MENU_THEMES, themeAt, tokenStyle } from './menuTheme';
import type { Opener } from './checkout';

/** Everything the card says, in one place. */
export const STORE_WORDS = {
  /** The card's line: a draft until the owner approves the final words. */
  ask: 'Ask a grown-up before buying',
  go: 'Continue',
  stay: 'Not now',
  /** What a screen reader calls the card. */
  label: 'Before the store',
} as const;

/**
 * Makes a link to a store page, opened in a new tab (a tap on a link gets past a popup blocker).
 * Handed out with Continue only: what follows a purchase the card let through uses it (OP-180).
 */
export type LinkMaker = (url: string, text: string) => HTMLAnchorElement;

/** Where Continue goes. */
export type StoreGo =
  /** A store page in a new tab: Continue is that link. `then` runs as it opens (opening night's pass is then looked for). */
  | { link: string; then?: () => void }
  /**
   * A way that opens a window itself (the gate's checkout, OP-180): it runs in Continue's click,
   * handed the page's opener and the link maker for what follows the same purchase.
   */
  | { run: (open: Opener, link: LinkMaker) => void };

/**
 * Asks before the store; `opener` takes the focus back after Not now. `say`: lines the card shows
 * above its own (what the turnstiles say before they sell a Day Ticket, OP-180).
 */
export type AskStore = (go: StoreGo, opener?: HTMLElement | null, say?: readonly string[]) => void;

export interface StoreCard {
  ask: AskStore;
  close(): void;
  isOpen(): boolean;
}

/** The page's own window opener: the one call in the park that opens a window. */
export const openWindow: Opener = (url, target, features) => window.open(url, target, features);

/** A link to a store page, in a new tab and cut off from the park. */
export const storeLink: LinkMaker = (url, text) => {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = text;
  return a;
};

/**
 * What Continue does, in its click: a way that opens a window opens it now, before anything is
 * awaited; a link opens by itself (the browser follows it), and its `then` runs.
 */
export function goOn(go: StoreGo, open: Opener, link: LinkMaker = storeLink): void {
  if ('run' in go) go.run(open, link);
  else go.then?.();
}

const CSS = `
#hud .layer .modal.store-ask{width:min(360px,calc(100vw - 32px));align-items:center;text-align:center;gap:16px;padding:22px 18px 18px;background-color:var(--m-surface);background-image:var(--m-grain);background-size:360px 150px;color:var(--m-text);border:2px solid var(--m-frame);border-radius:var(--m-radius);box-shadow:var(--m-shadow);font-size:var(--m-body);line-height:1.4}
#hud .modal.store-ask:focus{outline:none}
#hud .store-ask .says{display:flex;flex-direction:column;gap:8px}
#hud .store-ask .says[hidden]{display:none}
#hud .store-ask .say{margin:0}
#hud .store-ask .say.small{font-size:calc(var(--m-body) * .88);opacity:.9}
#hud .store-ask .ask{margin:0;font-size:var(--m-heading);font-weight:800}
#hud .store-ask .row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
#hud .store-ask .row > .go,#hud .store-ask .row > .stay{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:var(--m-target);min-width:max(var(--m-target),116px);margin:0;padding:10px 20px;border-radius:999px;font:inherit;font-size:var(--m-body);font-weight:800;text-decoration:none;box-shadow:none;text-shadow:none;cursor:pointer}
#hud .store-ask .row > .go{background:var(--m-accent);color:var(--m-on-accent);border:2px solid var(--m-accent)}
#hud .store-ask .row > .stay{background:transparent;color:var(--m-text);border:2px solid var(--m-frame)}
#hud .store-ask :focus-visible{outline:3px solid var(--m-focus);outline-offset:2px}
`;

let styled = false;

/**
 * The card before the store. One for the whole park: every way to the store asks through it.
 * `open` is the window opener a way's Continue is handed (the page's own; tests give another).
 */
export function createStoreCard(root: HTMLElement, open: Opener = openWindow): StoreCard {
  const modal = createModal(root, { name: 'store-ask', label: STORE_WORDS.label, layout: 'card', sheet: false });
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const box = modal.box;
  box.tabIndex = -1;
  box.dataset['storeCard'] = '';
  const line = document.createElement('p');
  line.className = 'ask';
  line.id = 'store-ask-line';
  line.textContent = STORE_WORDS.ask;
  /** What the way says above the card's own line (the turnstiles' reason and offer, OP-180). */
  const says = document.createElement('div');
  says.className = 'says';
  says.id = 'store-ask-say';
  says.hidden = true;
  box.setAttribute('aria-describedby', `${says.id} ${line.id}`);
  says.dataset['store'] = 'say';
  const row = document.createElement('div');
  row.className = 'row';
  const stay = document.createElement('button');
  stay.type = 'button';
  stay.className = 'stay';
  stay.dataset['store'] = 'not-now';
  stay.textContent = STORE_WORDS.stay;
  stay.addEventListener('click', () => modal.close());
  row.appendChild(stay);
  box.append(says, line, row);
  // Escape is Not now, and only that: whatever is under this card stays open.
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.code !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    modal.close();
  });

  /** The way waiting on Continue; a press of an older card's Continue does nothing. */
  let waiting: StoreGo | null = null;
  modal.onClose(() => {
    waiting = null;
  });

  /** Continue for this way: the link itself, or a button that opens the way's window in its click. */
  const continueFor = (go: StoreGo): HTMLElement => {
    let c: HTMLAnchorElement | HTMLButtonElement;
    if ('link' in go) {
      c = storeLink(go.link, '');
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      c = b;
    }
    c.className = 'go';
    c.dataset['store'] = 'continue';
    c.textContent = STORE_WORDS.go;
    c.addEventListener('click', (e) => {
      if (waiting !== go) {
        e.preventDefault();
        return;
      }
      // The card closes first (the focus goes back to what asked), then the way goes on in this same click.
      modal.close();
      goOn(go, open);
    });
    return c;
  };

  return {
    ask(go, opener, say) {
      if (modal.isOpen()) modal.close();
      waiting = go;
      says.innerHTML = '';
      says.hidden = !say?.length;
      for (const [i, text] of (say ?? []).entries()) {
        const p = document.createElement('p');
        // The first line is what the turnstiles say; a second (the early preview's warning) is smaller.
        p.className = i === 0 ? 'say' : 'say small';
        p.textContent = text;
        says.appendChild(p);
      }
      row.querySelector('[data-store="continue"]')?.remove();
      row.appendChild(continueFor(go));
      box.setAttribute('style', tokenStyle(MENU_THEMES[themeAt(new Date())]));
      modal.open(opener ?? null);
      box.focus({ preventScroll: true });
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
  };
}
