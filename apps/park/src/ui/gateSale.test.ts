import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletEntry } from '../net';
import { CHECKOUT_FEATURES, CHECKOUT_WINDOW, CHECKOUT_WORDS, LOOK_MS, type Opener, type Started, type WatchClock } from './checkout';
import { createGateSale, gateBuy, saleLines, type GateSale } from './gateSale';
import { PREVIEW_WORDS } from './preview';
import { goOn, type AskStore, type LinkMaker, type StoreGo } from './storeCard';
import { GATE_WORDS, PASS_WORDS, OPENING_WORDS, createFreePassCard, forgetOffers, gateRefusal, offerOnce } from './tickets';

const CART = 'https://owl-test.myshopify.com/cart/100:1?attributes%5Bowl_checkout%5D=tok';
const PAGE = 'https://owl-test.myshopify.com/collections/tickets';
const PASS = 'https://owl-test.myshopify.com/cart/200:1?discount=HALF&attributes%5Bfrom_ticket%5D=OWL-DAYT-ICKT';
const ticket = (id: string, over: Partial<WalletEntry> = {}): WalletEntry => ({ id, kind: 'day', status: 'unused', msLeft: 1, firstScan: null, validFrom: null, validUntil: null, voteToday: 'none', ...over });

/**
 * Just enough of a page for the turnstiles' sale and the pass offer to be drawn in a test (the unit
 * tests run without a browser): elements with classes, data, children and clicks.
 */
class FakeEl {
  textContent = '';
  className = '';
  type = '';
  hidden = false;
  readonly dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  private readonly classes = new Set<string>();
  private readonly clicks: Array<() => void> = [];
  readonly classList = {
    add: (c: string) => void this.classes.add(c),
    remove: (c: string) => void this.classes.delete(c),
    contains: (c: string) => this.classes.has(c),
  };
  constructor(readonly tagName: string) {}
  set innerHTML(_v: string) {
    this.children = [];
  }
  append(...nodes: FakeEl[]): void {
    this.children.push(...nodes);
  }
  appendChild(node: FakeEl): FakeEl {
    this.children.push(node);
    return node;
  }
  setAttribute(): void {}
  addEventListener(type: string, cb: () => void): void {
    if (type === 'click') this.clicks.push(cb);
  }
  click(): void {
    for (const cb of this.clicks) cb();
  }
  all(): FakeEl[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  /** The element whose `data-<key>` is `value`. */
  find(key: string, value: string): FakeEl | undefined {
    return this.all().find((e) => e.dataset[key] === value);
  }
}

/** A window as the page holds it. */
function fakeWindow() {
  return { opener: {} as unknown, closed: false, focused: 0, location: { href: 'about:blank' }, document: { title: '', body: { textContent: '' } }, close() { this.closed = true; }, focus() { this.focused++; } };
}

/** An opener that writes down each window asked for. */
function opener(win: ReturnType<typeof fakeWindow> | null = fakeWindow()) {
  const calls: string[][] = [];
  const open: Opener = (u, t, f) => (calls.push([u, t, f]), win as unknown as Window);
  return { calls, open, win };
}

/** The link maker the card hands out, as a fake page's anchor. */
const link: LinkMaker = (url, text) => {
  const a = new FakeEl('a');
  a.dataset['href'] = url;
  a.textContent = text;
  return a as unknown as HTMLAnchorElement;
};

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a Day Ticket at the turnstiles (OP-180)', () => {
  it('says why the turnstiles stayed shut, that a Day Ticket can be had right here, and the early preview’s warning while it runs', () => {
    expect(GATE_WORDS.buy).toBe('You can get a Day Ticket right here.');
    expect(saleLines({ line: 'You need a ticket to go in.', preview: false })).toEqual(['You need a ticket to go in. You can get a Day Ticket right here.']);
    expect(saleLines({ line: "This ticket's time has run out.", preview: true })).toEqual(["This ticket's time has run out. You can get a Day Ticket right here.", PREVIEW_WORDS.gate]);
  });

  it('sells only to an owl with no ticket that works; one whose ticket waits is told why', () => {
    for (const r of ['none', 'unknown', 'elsewhere', 'used', 'expired', 'revoked'] as const) expect(gateRefusal(r).buy).toBe(true);
    for (const r of ['held', 'not-yet', 'no-length', 'offline'] as const) expect(gateRefusal(r).buy).toBe(false);
  });

  it('asking opens nothing: the way only runs on Continue', () => {
    const o = opener();
    let began = 0;
    gateBuy({ ticketsUrl: PAGE, checkout: () => (began++, Promise.resolve(CART)) }, () => {});
    expect(began).toBe(0);
    expect(o.calls).toEqual([]);
  });

  it('Continue opens checkout’s window at once, then sends it to the cart link with the owl’s token, and hands on the opener', async () => {
    const o = opener();
    let release!: (url: string) => void;
    const got: Array<[Started, Opener]> = [];
    const go = gateBuy({ ticketsUrl: PAGE, checkout: () => new Promise((r) => (release = r)) }, (s, open) => got.push([s, open]));
    goOn(go, o.open, link);
    expect(o.calls).toEqual([['', CHECKOUT_WINDOW, CHECKOUT_FEATURES]]);
    release(CART);
    await settle();
    expect(got).toEqual([[{ kind: 'popup', url: CART, win: o.win }, o.open]]);
    expect(o.win!.location.href).toBe(CART);
  });

  it('with no token to be had, Continue sends the window to the store’s ticket page; with neither, nothing', async () => {
    const o = opener();
    const got: Started[] = [];
    goOn(gateBuy({ ticketsUrl: PAGE }, (s) => got.push(s)), o.open, link);
    await settle();
    expect(got).toEqual([{ kind: 'fallback', url: PAGE, win: o.win }]);
    goOn(gateBuy({ ticketsUrl: null, checkout: async () => null }, (s) => got.push(s)), opener().open, link);
    await settle();
    expect(got.at(-1)).toEqual({ kind: 'none' });
  });
});

/** A clock the test turns by hand (as checkout.test.ts's). */
function testClock() {
  let now = 0;
  let tick: (() => void) | null = null;
  const clock: WatchClock = { now: () => now, every: (fn) => ((tick = fn), 1), stop: () => (tick = null), onReturn: () => () => {} };
  return {
    clock,
    advance: async (ms: number) => {
      now += ms;
      tick?.();
      await settle();
    },
  };
}

describe('the turnstiles’ sale on the page (OP-180)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag), head: new FakeEl('head') });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup(o = opener()) {
    const root = new FakeEl('div');
    const asked: Array<{ go: StoreGo; say: readonly string[] | undefined }> = [];
    const ask: AskStore = (go, _opener, say) => asked.push({ go, say });
    const toasts: string[] = [];
    const t = testClock();
    const panel = createGateSale(root as unknown as HTMLElement, ask, (m) => toasts.push(m), t.clock);
    const card = () => root.find('gateSale', '')!;
    let wallet: WalletEntry[] = [];
    const bought: Array<[WalletEntry, Opener]> = [];
    const sale: GateSale = { line: 'You need a ticket to go in.', preview: false, ticketsUrl: PAGE, checkout: async () => CART, wallet: async () => wallet, before: new Set(), bought: (tk, open) => bought.push([tk, open]) };
    return { root, asked, toasts, t, panel, card, sale, bought, o, setWallet: (w: WalletEntry[]) => (wallet = w) };
  }

  it('asks once, right before the purchase; checkout open, the ticket comes, and what follows gets the card’s opener', async () => {
    const s = setup();
    s.panel.sell(s.sale);
    expect(s.asked).toHaveLength(1);
    expect(s.asked[0]!.say).toEqual(['You need a ticket to go in. You can get a Day Ticket right here.']);
    // Continue.
    goOn(s.asked[0]!.go, s.o.open, link);
    await settle();
    expect(s.card().classList.contains('open')).toBe(true);
    expect(s.card().find('checkout', 'status')!.textContent).toBe(CHECKOUT_WORDS.open);
    expect(s.panel.busy()).toBe(true);
    // Walking into the turnstiles again meanwhile: no second card, only why.
    s.panel.sell(s.sale);
    expect(s.asked).toHaveLength(1);
    expect(s.toasts).toEqual(['You need a ticket to go in.']);
    // Back to checkout, once its window was closed, opens it again in that click without asking.
    s.o.win!.closed = true;
    s.card().find('checkout', 'back')!.click();
    expect(s.o.calls.at(-1)).toEqual([CART, CHECKOUT_WINDOW, CHECKOUT_FEATURES]);
    expect(s.asked).toHaveLength(1);
    // The ticket comes.
    s.setWallet([ticket('OWL-DAYT-ICKT')]);
    await s.t.advance(LOOK_MS);
    expect(s.toasts.at(-1)).toBe(CHECKOUT_WORDS.added);
    expect(s.card().classList.contains('open')).toBe(false);
    expect(s.bought.map(([t, open]) => [t.id, open])).toEqual([['OWL-DAYT-ICKT', s.o.open]]);
    expect(s.panel.busy()).toBe(false);
  });

  it('a blocked window gives the card’s link to tap; Cancel says so, and the turnstiles may sell again', async () => {
    const s = setup(opener(null));
    s.panel.sell(s.sale);
    goOn(s.asked[0]!.go, s.o.open, link);
    await settle();
    expect(s.card().find('checkout', 'status')!.textContent).toBe(CHECKOUT_WORDS.blocked);
    const a = s.card().find('checkout', 'link')!;
    expect([a.tagName, a.dataset['href'], a.textContent]).toEqual(['a', CART, CHECKOUT_WORDS.openLink]);
    s.card().find('checkout', 'cancel')!.click();
    expect(s.card().find('checkout', 'status')!.textContent).toBe(CHECKOUT_WORDS.cancelled);
    expect(s.panel.busy()).toBe(false);
    s.panel.sell(s.sale);
    expect(s.asked).toHaveLength(2);
  });
});

describe('the half-price pass after a Day Ticket at the turnstiles (OP-180)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag), head: new FakeEl('head') });
    forgetOffers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says it in plain words, and opens the pass with the opener of the purchase, asking nothing more', () => {
    const root = new FakeEl('div');
    const asked: StoreGo[] = [];
    const card = createFreePassCard(root as unknown as HTMLElement, () => {}, (go) => asked.push(go));
    const o = opener();
    card.show({ link: PASS, words: 'day', claimed: async () => false, open: o.open });
    const el = root.find('freePass', 'day')!;
    expect(el.classList.contains('open')).toBe(true);
    expect(el.all().map((e) => e.textContent)).toEqual([PASS_WORDS.offer, '', PASS_WORDS.get, PASS_WORDS.close]);
    el.find('claim', '')!.click();
    expect(o.calls).toEqual([[PASS, '_blank', 'noopener']]);
    expect(asked).toEqual([]);
    expect(el.classList.contains('open')).toBe(false);
  });

  it('opening night’s offer, with no purchase before it, asks first', () => {
    const root = new FakeEl('div');
    const asked: StoreGo[] = [];
    const card = createFreePassCard(root as unknown as HTMLElement, () => {}, (go) => asked.push(go));
    card.show({ link: PASS, words: 'night', claimed: async () => false });
    const el = root.find('freePass', 'night')!;
    expect(el.all()[0]!.textContent).toBe(OPENING_WORDS.offer);
    el.find('claim', '')!.click();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ link: PASS });
  });

  it('is offered once per ticket, kept where the browser lets the page keep it', () => {
    let kept: string | null = null;
    const store = { get: () => kept, set: (v: string) => void (kept = v) };
    expect(offerOnce('OWL-AAAA-AAAA', store)).toBe(true);
    expect(offerOnce('OWL-AAAA-AAAA', store)).toBe(false);
    expect(offerOnce('OWL-BBBB-BBBB', store)).toBe(true);
    // A new page load (the memory gone), the browser's copy remembers.
    forgetOffers();
    expect(offerOnce('OWL-AAAA-AAAA', store)).toBe(false);
    // A browser that keeps nothing: the page still offers once.
    forgetOffers();
    const none = { get: () => null, set: () => {} };
    expect(offerOnce('OWL-CCCC-CCCC', none)).toBe(true);
    expect(offerOnce('OWL-CCCC-CCCC', none)).toBe(false);
  });
});
