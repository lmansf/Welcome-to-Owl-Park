/**
 * Back from the store's checkout (OP-190). Once a ticket is paid, the store sends the buyer to the
 * park's return address, `https://exploreowlpark.com/?checkout=done` (docs/ARCHITECTURE.md, the
 * store's theme snippet), a plain address with nothing secret in it. That page is most often the
 * checkout window itself (a popup on a computer, a second tab on a phone), with the game still open
 * in the window the buyer came from.
 *
 * The page says on a BroadcastChannel that checkout is done. A game page that is watching for a
 * bought ticket answers at once, looks at its wallet (so its owl goes through the turnstiles with
 * the ticket) and asks for the focus. An answer within a moment means the game is open elsewhere: this
 * window tries to close itself and, where the browser keeps it open, shows a small plain screen
 * that says the ticket is waiting in the park window, with Play here instead. No answer (a phone
 * whose game tab is asleep or gone, or checkout in the game's own window) means this window becomes
 * the park: the address loses its `checkout` and the game starts as usual, and Play takes the owl to
 * the turnstiles and through them once the ticket is there (main.ts).
 *
 * Nothing here uses `window.opener`: the park cuts it before the store's page loads, and a browser
 * that kept it would change nothing.
 */

/** The channel the return page and the game's pages share (one per site and browser). */
export const RETURN_CHANNEL = 'owl-park-checkout';
/** The return address's query: `?checkout=done`. */
export const RETURN_PARAM = 'checkout';
export const RETURN_VALUE = 'done';
/** How long the return page waits for a game page to answer before it becomes the park itself. */
export const ANSWER_MS = 400;
/**
 * A game page whose ticket came a little while ago still answers: it often sees the ticket before
 * the store has sent the buyer back, and the checkout window should not start a second park.
 */
export const ANSWER_AFTER_MS = 10 * 60_000;

export const RETURN_WORDS = {
  done: "You're all set. Your ticket is waiting in the park window.",
  playHere: 'Play here instead',
} as const;

/** What goes over the channel: the return page's word that checkout is done, and a game page's answer to it. */
export type ReturnMessage = { t: 'done'; id: string } | { t: 'here'; id: string };

/** Just what the page uses of a BroadcastChannel. */
export interface ReturnChannel {
  postMessage(message: ReturnMessage): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

/** A channel, or null in a browser without BroadcastChannel (then no game page can be told). */
export type MakeChannel = () => ReturnChannel | null;

export const pageChannel: MakeChannel = () => {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(RETURN_CHANNEL) as unknown as ReturnChannel;
  } catch {
    return null;
  }
};

/** Whether the page's address is the return address (`?checkout=done`). */
export function isCheckoutReturn(search: string): boolean {
  return new URLSearchParams(search).get(RETURN_PARAM) === RETURN_VALUE;
}

/** The page's address without its `checkout`, for history.replaceState. */
export function withoutCheckoutReturn(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(RETURN_PARAM);
  return url.toString();
}

function isMessage(data: unknown): data is ReturnMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as { t?: unknown; id?: unknown };
  return (m.t === 'done' || m.t === 'here') && typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 64;
}

/**
 * The return page asks whether a game page is watching for a ticket: true when one answers within
 * `ms`, false when none does (or the browser has no channel).
 */
export function askForGamePage(make: MakeChannel, id: string, ms = ANSWER_MS, wait: (ms: number) => Promise<void> = (t) => new Promise((r) => setTimeout(r, t))): Promise<boolean> {
  const channel = make();
  if (!channel) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const end = (answered: boolean) => {
      if (done) return;
      done = true;
      channel.onmessage = null;
      channel.close();
      resolve(answered);
    };
    channel.onmessage = (ev) => {
      if (isMessage(ev.data) && ev.data.t === 'here' && ev.data.id === id) end(true);
    };
    channel.postMessage({ t: 'done', id });
    void wait(ms).then(() => end(false));
  });
}

/**
 * A game page listens for the return page: when it says checkout is done and `heard` says this page
 * is watching for a ticket (and looks at the wallet at once), the page answers. Returns how to stop.
 */
export function answerReturns(make: MakeChannel, heard: () => boolean): () => void {
  const channel = make();
  if (!channel) return () => {};
  channel.onmessage = (ev) => {
    if (!isMessage(ev.data) || ev.data.t !== 'done') return;
    if (heard()) channel.postMessage({ t: 'here', id: ev.data.id });
  };
  return () => {
    channel.onmessage = null;
    channel.close();
  };
}

/** What the return page does: close itself (a game page answered), or start the park here. */
export type ReturnPlan = 'close' | 'boot';

/** The return page's decision (OP-190): a game page answered, so this is the checkout window; else this window becomes the park. */
export function returnPlan(answered: boolean): ReturnPlan {
  return answered ? 'close' : 'boot';
}

/** What the return page needs from the browser. */
export interface ReturnDeps {
  make: MakeChannel;
  /** A fresh id for this return, so an answer is to this page and no other. */
  id: string;
  /** Takes `checkout` out of the address bar. */
  clean(): void;
  /** Closes this window where the browser lets the page close it. */
  close(): void;
  /** The plain screen; `play` boots the park in this window. */
  screen(play: () => void): void;
  wait?: (ms: number) => Promise<void>;
}

/**
 * The return page: asks for a game page, then either closes itself (showing the plain screen while the
 * browser keeps it open) or goes on. Resolves when the park should start in this window: at once with
 * `returned` (no game page answered), or with `here` once Play here instead is pressed.
 */
export async function checkoutReturnPage(d: ReturnDeps): Promise<'returned' | 'here'> {
  d.clean();
  const answered = await askForGamePage(d.make, d.id, ANSWER_MS, d.wait);
  if (returnPlan(answered) === 'boot') return 'returned';
  try {
    d.close();
  } catch {
    // The browser keeps the window: the screen says where the ticket is.
  }
  return new Promise((resolve) => d.screen(() => resolve('here')));
}

/**
 * The plain screen on the checkout window, over the load screen, while the browser keeps it open:
 * the ticket waits in the park window, or the park can start here.
 */
export function showReturnScreen(doc: Document, play: () => void): void {
  const el = doc.createElement('section');
  el.dataset['checkoutReturn'] = '';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Checkout done');
  el.style.cssText =
    'position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;box-sizing:border-box;background:#0C1E36;color:#F6F1E3;text-align:center;font:700 18px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const p = doc.createElement('p');
  p.style.cssText = 'margin:0;max-width:340px';
  p.textContent = RETURN_WORDS.done;
  const b = doc.createElement('button');
  b.type = 'button';
  b.dataset['checkoutReturn'] = 'play';
  b.textContent = RETURN_WORDS.playHere;
  b.style.cssText = 'min-height:44px;padding:8px 22px;border-radius:999px;border:2px solid #C9A227;background:transparent;color:#F6F1E3;font:inherit;font-size:16px;cursor:pointer';
  b.addEventListener('click', () => {
    el.remove();
    play();
  });
  el.append(p, b);
  doc.body.appendChild(el);
  b.focus();
}

/** A fresh id for one return. */
export function returnId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
