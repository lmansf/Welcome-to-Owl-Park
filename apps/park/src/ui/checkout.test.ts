import { describe, expect, it } from 'vitest';
import type { WalletEntry } from '../net';
import { AFTER_CANCEL_MS, CHECKOUT_FEATURES, CHECKOUT_WINDOW, CHECKOUT_WORDS, LOOK_FOR_MS, LOOK_MS, createCheckoutWatch, newTicket, startCheckout, type WatchClock } from './checkout';

const CART = 'https://owl-test.myshopify.com/cart/100:1?attributes%5Bowl_checkout%5D=tok';
const PAGE = 'https://owl-test.myshopify.com/products/day-ticket';
const ticket = (id: string, over: Partial<WalletEntry> = {}): WalletEntry => ({ id, kind: 'day', status: 'unused', msLeft: 1, firstScan: null, validFrom: null, validUntil: null, voteToday: 'none', ...over });

/** A window as the page holds it: where it was sent, whether it was closed, and what was written in it while blank. */
function fakeWindow(opts: { cutOff?: boolean } = {}) {
  const w = {
    opener: {} as unknown,
    closed: false,
    focused: 0,
    location: { href: 'about:blank' },
    document: { title: '', body: { textContent: '' } },
    close() {
      if (opts.cutOff) throw new Error('cut off');
      this.closed = true;
    },
    focus() {
      this.focused++;
    },
  };
  return w;
}

describe('opening checkout from the booth (OP-175)', () => {
  it('opens a blank window in the click, cuts it off from the park, then sends it to the cart link with the owl’s token', async () => {
    const w = fakeWindow();
    const opened: string[][] = [];
    let release!: (url: string) => void;
    const link = () => new Promise<string | null>((r) => (release = r));
    const started = startCheckout({ open: (u, t, f) => (opened.push([u, t, f]), w as unknown as Window), link, fallbackUrl: PAGE });
    // The window is open before the link comes back, so a popup blocker lets it through.
    expect(opened).toEqual([['', CHECKOUT_WINDOW, CHECKOUT_FEATURES]]);
    expect(w.opener).toBeNull();
    expect(w.document.body.textContent).toBe(CHECKOUT_WORDS.opening);
    release(CART);
    expect(await started).toEqual({ kind: 'popup', url: CART, win: w });
    expect(w.location.href).toBe(CART);
  });

  it('a blocked window gives the link to tap; no link gives the store’s page; neither closes the blank window', async () => {
    expect(await startCheckout({ open: () => null, link: async () => CART, fallbackUrl: PAGE })).toEqual({ kind: 'blocked', url: CART });
    const w = fakeWindow();
    expect(await startCheckout({ open: () => w as unknown as Window, link: async () => null, fallbackUrl: PAGE })).toEqual({ kind: 'fallback', url: PAGE, win: w });
    expect(w.location.href).toBe(PAGE);
    expect(await startCheckout({ open: () => null, link: () => Promise.reject(new Error('offline')), fallbackUrl: PAGE })).toEqual({ kind: 'fallback', url: PAGE, win: null });
    const lone = fakeWindow();
    expect(await startCheckout({ open: () => lone as unknown as Window, link: async () => null, fallbackUrl: null })).toEqual({ kind: 'none' });
    expect(lone.closed).toBe(true);
  });

  it('finds the ticket that came since the booth opened, and nothing spent or refunded', () => {
    const before = new Set(['OWL-AAAA-AAAA']);
    expect(newTicket([ticket('OWL-AAAA-AAAA')], before)).toBeNull();
    expect(newTicket([ticket('OWL-BBBB-BBBB', { status: 'revoked' })], before)).toBeNull();
    expect(newTicket([ticket('OWL-AAAA-AAAA'), ticket('OWL-CCCC-CCCC', { status: 'held' })], before)?.id).toBe('OWL-CCCC-CCCC');
  });
});

/** A clock the test turns: the interval and the page coming back into view, by hand. */
function testClock() {
  let now = 0;
  let tick: (() => void) | null = null;
  let back: (() => void) | null = null;
  const clock: WatchClock = {
    now: () => now,
    every: (fn) => ((tick = fn), 1),
    stop: () => {
      tick = null;
    },
    onReturn: (fn) => {
      back = fn;
      return () => {
        back = null;
      };
    },
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return {
    clock,
    advance: async (ms: number) => {
      now += ms;
      tick?.();
      await settle();
    },
    comeBack: async () => {
      back?.();
      await settle();
    },
    running: () => tick !== null,
  };
}

describe('watching for the bought ticket (OP-175)', () => {
  it('says when the ticket has come and closes the checkout window', async () => {
    const t = testClock();
    const said: Array<[string, boolean]> = [];
    const watch = createCheckoutWatch((m, came) => said.push([m, came]), t.clock);
    let wallet: WalletEntry[] = [];
    const w = fakeWindow();
    watch.start({ wallet: async () => wallet, before: new Set(), win: w as unknown as Window });
    await t.advance(LOOK_MS);
    expect(said).toEqual([]);
    wallet = [ticket('OWL-NEWT-ICKT')];
    await t.advance(LOOK_MS);
    expect(said).toEqual([[CHECKOUT_WORDS.added, true]]);
    expect(w.closed).toBe(true);
    expect(watch.active()).toBe(false);
    expect(t.running()).toBe(false);
  });

  it('looks at once when the page comes back from the checkout tab (a phone), and a held order says so', async () => {
    const t = testClock();
    const said: string[] = [];
    const watch = createCheckoutWatch((m) => said.push(m), t.clock);
    watch.start({ wallet: async () => [ticket('OWL-HELD-TCKT', { status: 'held' })], before: new Set(), win: null });
    await t.comeBack();
    expect(said).toEqual([CHECKOUT_WORDS.addedHeld]);
  });

  it('a window the store cut off from the park is left for the buyer to close', async () => {
    const t = testClock();
    const said: string[] = [];
    const watch = createCheckoutWatch((m) => said.push(m), t.clock);
    const w = fakeWindow({ cutOff: true });
    watch.start({ wallet: async () => [ticket('OWL-NEWT-ICKT')], before: new Set(), win: w as unknown as Window });
    await t.advance(LOOK_MS);
    expect(said).toEqual([CHECKOUT_WORDS.added]);
  });

  it('Cancel says checkout closed and looks two minutes more; with nothing, it stops after half an hour', async () => {
    const t = testClock();
    const said: Array<[string, boolean]> = [];
    const watch = createCheckoutWatch((m, came) => said.push([m, came]), t.clock);
    let wallet: WalletEntry[] = [];
    watch.start({ wallet: async () => wallet, before: new Set(), win: null });
    watch.cancel();
    expect(said).toEqual([[CHECKOUT_WORDS.cancelled, false]]);
    // Paid just before Cancel: the ticket still gets its note.
    wallet = [ticket('OWL-LATE-TCKT')];
    await t.advance(AFTER_CANCEL_MS - 1);
    expect(said.at(-1)).toEqual([CHECKOUT_WORDS.added, true]);

    const quiet = createCheckoutWatch(() => undefined, t.clock);
    quiet.start({ wallet: async () => [], before: new Set(), win: null });
    await t.advance(LOOK_FOR_MS + 1);
    expect(quiet.active()).toBe(false);
  });
});
