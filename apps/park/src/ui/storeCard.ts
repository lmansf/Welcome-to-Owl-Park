/**
 * Before the store (OP-153): every way from the park to the store's pages first shows this one card:
 * a short line and two buttons, Continue and Not now. No timer, no spending limit, and it shows every
 * time. The ways are the booth's Get a ticket (checkout in its own window, OP-175, or the store's
 * ticket page), the booth's Open checkout when the browser blocked that window and Back to checkout
 * once it was closed, opening night's pass (the booth's wallet and the card after the turnstiles, C42),
 * and the gift shop's door.
 *
 * Continue goes on exactly as the way did before, in the same click, so a popup blocker still lets the
 * window through: a way that opens a window gets the opener in Continue's click, and a link is
 * Continue itself. Not now, Escape or a tap beside the card goes back to where the visitor was, the
 * focus on the control that asked. The card takes the focus as it opens (not Continue, so a stray key
 * never buys), and Tab reaches both buttons; both are 44 px or more, in the Menu's base theme.
 *
 * This file is the only place in the park's code that opens a window or makes a link off the park:
 * storeCard.test.ts reads the code for any other, so no new way can skip the card.
 *
 * TODO-DOCS (OP-153): the card before the store in docs/ARCHITECTURE.md (the purchase path) and
 * docs/PLAYBOOK.md section 7, with its line, which the owner approves (`STORE_WORDS.ask`).
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

/** Where Continue goes. */
export type StoreGo =
  /** A store page in a new tab: Continue is that link. `then` runs as it opens (opening night's pass is then looked for). */
  | { link: string; then?: () => void }
  /** A way that opens a window itself (the booth's checkout): it runs in Continue's click, handed the page's opener. */
  | { run: (open: Opener) => void };

/** Asks before the store; `opener` takes the focus back after Not now. */
export type AskStore = (go: StoreGo, opener?: HTMLElement | null) => void;

export interface StoreCard {
  ask: AskStore;
  close(): void;
  isOpen(): boolean;
}

/** The page's own window opener: the one call in the park that opens a window. */
export const openWindow: Opener = (url, target, features) => window.open(url, target, features);

/**
 * What Continue does, in its click: a way that opens a window opens it now, before anything is
 * awaited; a link opens by itself (the browser follows it), and its `then` runs.
 */
export function goOn(go: StoreGo, open: Opener): void {
  if ('run' in go) go.run(open);
  else go.then?.();
}

const CSS = `
#hud .layer .modal.store-ask{width:min(360px,calc(100vw - 32px));align-items:center;text-align:center;gap:16px;padding:22px 18px 18px;background-color:var(--m-surface);background-image:var(--m-grain);background-size:360px 150px;color:var(--m-text);border:2px solid var(--m-frame);border-radius:var(--m-radius);box-shadow:var(--m-shadow);font-size:var(--m-body);line-height:1.4}
#hud .modal.store-ask:focus{outline:none}
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
  box.setAttribute('aria-describedby', line.id);
  const row = document.createElement('div');
  row.className = 'row';
  const stay = document.createElement('button');
  stay.type = 'button';
  stay.className = 'stay';
  stay.dataset['store'] = 'not-now';
  stay.textContent = STORE_WORDS.stay;
  stay.addEventListener('click', () => modal.close());
  row.appendChild(stay);
  box.append(line, row);
  // Escape is Not now, and only that: the booth or the card under this one stays open.
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
      const a = document.createElement('a');
      a.href = go.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      c = a;
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
    ask(go, opener) {
      if (modal.isOpen()) modal.close();
      waiting = go;
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
