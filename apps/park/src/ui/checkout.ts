/**
 * Buying a ticket without leaving the park (OP-175), at the turnstiles since OP-180. The store's
 * checkout cannot sit inside the park (it refuses to be framed), so a turnstile reached without a
 * ticket opens it in a window of its own over the game, after the card before the store: a popup on a
 * computer, a new tab on a phone. The cart carries a one-time token the park made for this owl (its
 * collector id, so the ticket is the owl's on any screen it plays on), and the paid order's tickets
 * land on this owl on the server, with no email needed. This page watches the wallet meanwhile and,
 * when the ticket comes, says so and takes the owl through the turnstiles (OP-190). The window is cut
 * off from the park, so once it shows the store's page most browsers no longer let the park close it:
 * the store sends the buyer back to the park's return address instead (checkoutReturn.ts), which
 * tells this page at once and closes itself where the browser lets it.
 */
import type { WalletEntry } from '../net';

/** The checkout window's name: a second Buy reuses the same window instead of opening another. */
export const CHECKOUT_WINDOW = 'owl-park-checkout';
/** A popup over the game on a computer; phones open a new tab whatever this asks. */
export const CHECKOUT_FEATURES = 'popup,width=480,height=760';
/** How often the wallet is looked at while checkout is open, and for how long at most. */
export const LOOK_MS = 4_000;
export const LOOK_FOR_MS = 30 * 60_000;
/** After Cancel: a payment that went through just before it still gets its note for this long. */
export const AFTER_CANCEL_MS = 2 * 60_000;

export const CHECKOUT_WORDS = {
  opening: 'Opening checkout…',
  open: 'Checkout is open in its own window. Your ticket appears here as soon as it is paid.',
  blocked: 'Your browser blocked the checkout window. Open it here instead, and your ticket appears here once it is paid.',
  openLink: 'Open checkout',
  back: 'Back to checkout',
  cancel: 'Cancel',
  cancelled: 'Checkout closed. If you paid, the ticket still lands on this owl, and your email has its link too.',
  fallback: 'Checkout is open in another window. Your ticket comes by email: open its link here to add it to this owl.',
  none: 'Tickets cannot be bought right now. Try again in a minute.',
  /** The ticket came with the owl at the turnstiles: it goes through them by itself (OP-190). */
  added: 'Your ticket is here. In you go!',
  /** The ticket came with the owl somewhere else: it works at the turnstiles. */
  addedAway: 'Your ticket is here. It works at the turnstiles.',
  /** The ticket came while the home screen is up (back from checkout in a new page): Play takes the owl in. */
  addedHome: 'Your ticket is here. Press Play and in you go!',
  /** The ticket came held for the store's check: no owl goes in on it until it works. */
  addedHeld: 'Your ticket is here. It works as soon as the store’s quick check is done.',
} as const;

/**
 * What the page says when the bought ticket has come (OP-190): held for the store's check, the owl
 * going through the turnstiles with it, or the owl elsewhere (the ticket works at the turnstiles).
 */
export function arrivedWords(ticket: Pick<WalletEntry, 'status'>, goingIn: boolean): string {
  if (ticket.status === 'held') return CHECKOUT_WORDS.addedHeld;
  return goingIn ? CHECKOUT_WORDS.added : CHECKOUT_WORDS.addedAway;
}

export type Opener = (url: string, target: string, features: string) => Window | null;

export type Started =
  /** Checkout is open in its own window, with this owl's token in the cart. */
  | { kind: 'popup'; url: string; win: Window }
  /** The browser blocked the window: the turnstiles offer the same link to tap. */
  | { kind: 'blocked'; url: string }
  /** No token could be had: the store's ticket page instead (the ticket then comes by email). */
  | { kind: 'fallback'; url: string; win: Window | null }
  /** Nothing to open. */
  | { kind: 'none' };

export interface StartDeps {
  open: Opener;
  /** The cart link with this owl's checkout token; null when the park cannot make one. */
  link: () => Promise<string | null>;
  /** The store's ticket page, used when no link can be had. */
  fallbackUrl: string | null;
}

/**
 * Opens checkout. Called in the click itself: the window opens blank at once, before the link comes
 * back, so a popup blocker lets it through. It is cut off from this page (no opener) before the
 * store's page loads in it.
 */
export async function startCheckout(d: StartDeps): Promise<Started> {
  const win = d.open('', CHECKOUT_WINDOW, CHECKOUT_FEATURES);
  if (win) {
    try {
      win.opener = null;
      win.document.title = 'Owl Park checkout';
      win.document.body.textContent = CHECKOUT_WORDS.opening;
    } catch {
      // The named window already shows the store's page (a second Buy): it is simply pointed again below.
    }
  }
  const url = await d.link().catch(() => null);
  if (url) {
    if (!win) return { kind: 'blocked', url };
    win.location.href = url;
    return { kind: 'popup', url, win };
  }
  if (d.fallbackUrl) {
    if (win) win.location.href = d.fallbackUrl;
    return { kind: 'fallback', url: d.fallbackUrl, win };
  }
  win?.close();
  return { kind: 'none' };
}

/** The ticket that came since checkout opened: one not in the wallet before, still to be used. */
export function newTicket(wallet: readonly WalletEntry[], before: ReadonlySet<string>): WalletEntry | null {
  return wallet.find((t) => !before.has(t.id) && (t.status === 'unused' || t.status === 'held' || t.status === 'active')) ?? null;
}

export interface WatchOptions {
  wallet: () => Promise<WalletEntry[]>;
  /** The tickets on this device before checkout opened. */
  before: ReadonlySet<string>;
  /** The checkout window, closed when the ticket comes (where the browser lets the park close it). */
  win: Window | null;
}

export interface CheckoutWatch {
  start(o: WatchOptions): void;
  /** Look at the wallet now (the buyer came back from checkout, OP-190); nothing when no watch is running. */
  look(): void;
  /** The buyer says they are done with checkout: look a little longer, then stop. */
  cancel(): void;
  active(): boolean;
}

/** What the watch needs from the page: the clock, and the page coming back into view. */
export interface WatchClock {
  now(): number;
  every(fn: () => void, ms: number): unknown;
  stop(handle: unknown): void;
  /** Calls `fn` when the page is shown or focused again (a phone coming back from the checkout tab); returns how to stop. */
  onReturn(fn: () => void): () => void;
}

const pageClock: WatchClock = {
  now: () => Date.now(),
  every: (fn, ms) => setInterval(fn, ms),
  stop: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  onReturn: (fn) => {
    const g = globalThis as { addEventListener?: Window['addEventListener']; removeEventListener?: Window['removeEventListener']; document?: Document };
    const seen = () => {
      if (g.document?.visibilityState !== 'hidden') fn();
    };
    g.addEventListener?.('focus', seen);
    g.document?.addEventListener('visibilitychange', seen);
    return () => {
      g.removeEventListener?.('focus', seen);
      g.document?.removeEventListener('visibilitychange', seen);
    };
  },
};

/**
 * Watches the wallet while checkout is open (OP-175): every few seconds, and at once when the page
 * comes back into view (or when told, `look`). When the bought ticket is there it says so (`came`:
 * that ticket; the words as for an owl going in, which the caller may change) and closes the checkout
 * window; Cancel says checkout closed (`came` null) and looks a little longer.
 */
export function createCheckoutWatch(say: (message: string, came: WalletEntry | null) => void, clock: WatchClock = pageClock): CheckoutWatch {
  let run: { o: WatchOptions; until: number; timer: unknown; unhook: () => void; looking: boolean } | null = null;
  const stop = () => {
    if (!run) return;
    clock.stop(run.timer);
    run.unhook();
    run = null;
  };
  const look = () => {
    const r = run;
    if (!r || r.looking) return;
    if (clock.now() > r.until) return stop();
    r.looking = true;
    void r.o.wallet().then(
      (wallet) => {
        r.looking = false;
        if (run !== r) return;
        const t = newTicket(wallet, r.o.before);
        if (!t) return;
        stop();
        try {
          if (r.o.win && !r.o.win.closed) r.o.win.close();
        } catch {
          // The store's page cut the park's hold on the window: the buyer closes it.
        }
        say(arrivedWords(t, true), t);
      },
      () => {
        r.looking = false;
      },
    );
  };
  return {
    start(o) {
      stop();
      const r = { o, until: clock.now() + LOOK_FOR_MS, timer: null as unknown, unhook: () => {}, looking: false };
      run = r;
      r.timer = clock.every(look, LOOK_MS);
      r.unhook = clock.onReturn(look);
    },
    look,
    cancel() {
      if (!run) return;
      run.until = Math.min(run.until, clock.now() + AFTER_CANCEL_MS);
      say(CHECKOUT_WORDS.cancelled, null);
    },
    active: () => run !== null,
  };
}
