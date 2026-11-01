/**
 * A Day Ticket at the turnstiles (OP-180). The ticket booth is gone: a turnstile reached without a
 * ticket that works asks the card before the store (OP-153), with what the turnstiles say above its
 * line, and its Continue opens the store's checkout for one Day Ticket in a window of its own
 * (OP-175, checkout.ts). A small card over the game then says where checkout stands, with Back to
 * checkout and Cancel, while the page watches the wallet. When the ticket comes the card closes, the
 * owl goes through the turnstiles with it if it is still at them (OP-190), the page says so, and what
 * follows the purchase (the half-price pass offer) gets the opener the card handed out, so the card is
 * asked once, right before the purchase, and not again. The store's return address
 * (checkoutReturn.ts) tells this page that checkout is done, and it looks at the wallet at once.
 *
 * The ticket is the owl's, not the screen's: the checkout token names the owl's collector id, as the
 * claim and share links do, so it lets the owl in on any screen it plays on.
 */
import type { WalletEntry } from '../net';
import { CHECKOUT_FEATURES, CHECKOUT_WINDOW, CHECKOUT_WORDS, arrivedWords, createCheckoutWatch, startCheckout, type CheckoutWatch, type Opener, type Started, type WatchClock } from './checkout';
import { ANSWER_AFTER_MS, answerReturns, pageChannel, type MakeChannel } from './checkoutReturn';
import { PREVIEW_WORDS } from './preview';
import type { AskStore, LinkMaker, StoreGo } from './storeCard';
import { GATE_WORDS } from './tickets';

export interface GateSale {
  /** Why the turnstiles stayed shut (gateRefusal's line). */
  line: string;
  /** The early preview's warning shows too (preview.ts): tickets sell before the full opening. */
  preview: boolean;
  /** The store's ticket page: where checkout goes when the park cannot make this owl's cart link. */
  ticketsUrl: string | null;
  /** The Day Ticket's cart link with this owl's one-time token (OP-175); null when there is none. */
  checkout?: () => Promise<string | null>;
  /** The tickets on this owl, read again while checkout is open. */
  wallet: () => Promise<WalletEntry[]>;
  /** The tickets on this owl before checkout opened: the bought one is the one not among them. */
  before: ReadonlySet<string>;
  /**
   * The bought ticket has come: the owl goes through the turnstiles with it where it can (true when it
   * does, OP-190), and what follows the purchase gets the opener the card handed out.
   */
  bought?: (ticket: WalletEntry, open: Opener) => boolean;
}

/** What the card says above its own line: why the turnstiles stayed shut and that they sell a Day Ticket, then the early preview's warning. */
export function saleLines(sale: Pick<GateSale, 'line' | 'preview'>): string[] {
  return [`${sale.line} ${GATE_WORDS.buy}`, ...(sale.preview ? [PREVIEW_WORDS.gate] : [])];
}

/**
 * What the card's Continue does for a Day Ticket at the turnstiles, in its click: checkout in its own
 * window with this owl's token (OP-175), the window opened before anything is awaited, or the store's
 * ticket page when no token can be had. `started` hears how it went, with the opener and link maker
 * the card handed out.
 */
export function gateBuy(sale: Pick<GateSale, 'ticketsUrl' | 'checkout'>, started: (s: Started, open: Opener, link: LinkMaker) => void): StoreGo {
  return {
    run: (open, link) => {
      const checkout = sale.checkout ?? (() => Promise.resolve(null));
      void startCheckout({ open, link: checkout, fallbackUrl: sale.ticketsUrl }).then((s) => started(s, open, link));
    },
  };
}

const CSS = `
#hud .gate-sale{position:absolute;z-index:11;left:50%;top:20%;transform:translateX(-50%);width:min(340px,90vw);display:none;flex-direction:column;align-items:center;gap:10px;padding:16px 18px;border-radius:16px;text-align:center;pointer-events:auto;
  background:linear-gradient(160deg,#F6F1E3,#EADFC3);color:#0C1E36;box-shadow:0 0 0 2px #C9A227,0 0 30px rgba(201,162,39,.7),0 10px 30px rgba(0,0,0,.45)}
#hud .gate-sale.open{display:flex}
#hud .gate-sale p{margin:0;font-size:15px;font-weight:700;line-height:1.4}
#hud .gate-sale .row{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
#hud .gate-sale button,#hud .gate-sale a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;padding:8px 18px;color:#0C1E36;border-color:rgba(12,30,54,.3)}
#hud .gate-sale a{border:2px solid #C9A227;border-radius:999px;font-weight:800;text-decoration:none;background:#C9A227}
`;

export interface GateSalePanel {
  /** The card before the store, then checkout; while a checkout is under way, its card comes back instead. */
  sell(sale: GateSale): void;
  /** A checkout is open and its ticket is being watched for (not after Cancel). */
  busy(): boolean;
}

/** What the page does when the return page says checkout is done: asks for the focus (most browsers keep it where it is). */
const askFocus = () => {
  try {
    globalThis.focus?.();
  } catch {
    // Nothing to do: the return page says where the ticket is.
  }
};

/**
 * The turnstiles' sale: the card before the store, then the small card that says where checkout
 * stands. `toast` says when the ticket has come (or checkout closed). While a checkout is watched,
 * the store's return page (checkoutReturn.ts, on `channel`) gets an answer, and the wallet is looked
 * at at once.
 */
export function createGateSale(root: HTMLElement, ask: AskStore, toast: (message: string, ms?: number) => void, clock?: WatchClock, channel: MakeChannel = pageChannel, focus: () => void = askFocus): GateSalePanel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('section');
  el.className = 'gate-sale';
  el.setAttribute('aria-label', 'Checkout');
  el.dataset['gateSale'] = '';
  root.appendChild(el);

  let sale: GateSale | null = null;
  let opener: Opener | null = null;
  /** The buyer pressed Cancel: the ticket is still watched for a little, but the turnstiles may sell again. */
  let cancelled = false;
  const now = () => clock?.now() ?? Date.now();
  /** When the bought ticket last came: the store's return page still gets an answer a while after. */
  let cameAt: number | null = null;
  const watch: CheckoutWatch = createCheckoutWatch((message, came) => {
    if (!came) return toast(message, 6000);
    cameAt = now();
    el.classList.remove('open');
    const s = sale;
    // In through the turnstiles with it where the owl still stands at them (never on a held ticket), else where it works.
    const goingIn = s && opener && s.bought ? s.bought(came, opener) : false;
    toast(arrivedWords(came, goingIn), 6000);
  }, clock);
  answerReturns(channel, () => {
    const lately = cameAt !== null && now() - cameAt < ANSWER_AFTER_MS;
    if (!watch.active() && !lately) return false;
    watch.look();
    focus();
    return true;
  });

  const button = (text: string, what: string, run: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.dataset['checkout'] = what;
    b.addEventListener('click', run);
    return b;
  };
  const close = () => button('Close', 'close', () => el.classList.remove('open'));
  /** The card's words and buttons, in place of what it showed. */
  const show = (text: string, ...buttons: HTMLElement[]) => {
    el.innerHTML = '';
    const p = document.createElement('p');
    p.dataset['checkout'] = 'status';
    p.textContent = text;
    const row = document.createElement('div');
    row.className = 'row';
    row.append(...buttons);
    el.append(p, row);
    el.classList.add('open');
  };
  const cancel = () =>
    button(CHECKOUT_WORDS.cancel, 'cancel', () => {
      cancelled = true;
      watch.cancel();
      show(CHECKOUT_WORDS.cancelled, close());
    });

  /** Where checkout stands once Continue has opened it (or could not). */
  const started = (s: Started, open: Opener, link: LinkMaker) => {
    opener = open;
    const current = sale;
    if (!current) return;
    const watchFor = (win: Window | null) => watch.start({ wallet: current.wallet, before: current.before, win });
    const openLink = (url: string) => {
      const a = link(url, CHECKOUT_WORDS.openLink);
      a.dataset['checkout'] = 'link';
      return a;
    };
    switch (s.kind) {
      case 'popup': {
        // Checkout still open: back to it. Closed: opened again in this click, with no second card (OP-180).
        const back = button(CHECKOUT_WORDS.back, 'back', () => {
          if (!s.win.closed) s.win.focus();
          else open(s.url, CHECKOUT_WINDOW, CHECKOUT_FEATURES);
        });
        show(CHECKOUT_WORDS.open, back, cancel());
        watchFor(s.win);
        return;
      }
      case 'blocked':
        show(CHECKOUT_WORDS.blocked, openLink(s.url), cancel());
        watchFor(null);
        return;
      case 'fallback':
        // The store's own page: the ticket comes by email, so there is nothing to watch for.
        if (s.win) show(CHECKOUT_WORDS.fallback, close());
        else show(CHECKOUT_WORDS.fallback, openLink(s.url), close());
        return;
      case 'none':
        show(CHECKOUT_WORDS.none, close());
    }
  };

  return {
    sell(next) {
      if (watch.active() && sale && !cancelled) {
        // A checkout is under way: its card again, and the turnstiles' reason, not a second card before the store.
        el.classList.add('open');
        toast(next.line);
        return;
      }
      sale = next;
      opener = null;
      cancelled = false;
      el.classList.remove('open');
      ask(gateBuy(next, started), null, saleLines(next));
    },
    busy: () => watch.active() && !cancelled,
  };
}
