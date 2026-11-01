/**
 * Tickets in the lobby (C35), in words: a wallet line per ticket, the card that flips up when the
 * turnstiles scan one, what the turnstiles say when a ticket cannot go through (and whether they
 * offer a Day Ticket then, OP-180), and what opening a ticket link did. The words are pure
 * functions, so they are unit-tested.
 */
import type { ScanRefusal, ScanReply, WalletEntry } from '../net';
import type { TicketLink } from '../net/ticketLinks';
import type { Opener } from './checkout';
import type { AskStore } from './storeCard';

export const KIND_LABEL: Readonly<Record<WalletEntry['kind'], string>> = { day: 'Day ticket', night: 'Night ticket', annual: 'Annual pass', event: 'Event ticket', 'opening-night': 'Opening Night Ticket' };

/**
 * Opening night's words (C42, the owner's): the pass offer and its button, and the pass come. The
 * pass is half price on the night (OP-062; it was free at first). The booth's line that every pass
 * is half price went with the booth (OP-180): the offer itself says so.
 */
export const OPENING_WORDS = {
  offer: 'Your pass is half price tonight.',
  claim: 'Claim it',
  claimed: 'Your annual pass is in your wallet',
} as const;

/**
 * The annual pass offered right after a Day Ticket bought at the gate (OP-180): opening night's
 * half price, for the owner's approval. `close` is the offer's second button (opening night's says Close).
 */
export const PASS_WORDS = {
  offer: 'Come back all year! The annual pass is half price tonight.',
  get: 'Get the pass',
  close: 'No thanks',
} as const;

/** Kinds with a night of their own rather than a length from the first scan. */
const windowed = (kind: WalletEntry['kind']) => kind === 'event' || kind === 'opening-night';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** How much time is left, rounded down: "364 days", "5 h 12 m", "40 m". */
export function timeLeft(ms: number): string {
  if (ms >= 2 * DAY) return `${Math.floor(ms / DAY)} days`;
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)} h ${Math.floor((ms % HOUR) / MIN)} m`;
  return `${Math.max(1, Math.floor(ms / MIN))} m`;
}

const shortDate = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export interface WalletLine {
  title: string;
  status: string;
  /** Today's Realm Vote, while the ticket is running. */
  vote: string | null;
  /** It can be passed on with a share link (unused tickets). */
  share: boolean;
  /** An Opening Night Ticket's pass offer (C42): to claim tonight, or claimed. */
  freePass: 'ready' | 'claimed' | null;
}

/** One ticket on this owl: what it is, what it can do now, and today's vote (Settings' Tickets row). */
export function walletLine(t: WalletEntry, now: number, date: (ms: number) => string = shortDate): WalletLine {
  const title = KIND_LABEL[t.kind];
  const vote = t.status !== 'active' ? null : t.voteToday === 'used' ? "Today's vote: cast" : "Today's vote: ready at a realm's idol";
  const freePass = t.freePass ?? null;
  switch (t.status) {
    case 'held':
      return { title, status: 'Waiting on a quick check from the store; it works as soon as that is done', vote, share: false, freePass };
    case 'unused':
      if (windowed(t.kind)) {
        const status = t.validFrom !== null && t.validFrom > now ? `For ${date(t.validFrom)}` : 'Its night is on: walk through the turnstiles';
        return { title, status, vote, share: true, freePass };
      }
      return { title, status: 'Ready: its time starts when the turnstiles scan it', vote, share: true, freePass };
    case 'active':
      return { title, status: t.msLeft === null ? 'Running' : `Running: ${timeLeft(t.msLeft)} left`, vote, share: false, freePass };
    case 'used':
      return { title, status: 'Used', vote, share: false, freePass };
    case 'expired':
      return { title, status: windowed(t.kind) ? 'Its night has passed' : 'Expired unused', vote, share: false, freePass };
    case 'revoked':
      return { title, status: 'Refunded', vote, share: false, freePass: null };
  }
}

/** Running, then ready, then waiting on the store: the ticket the home line is about. */
const RANK: Partial<Record<WalletEntry['status'], number>> = { active: 3, unused: 2, held: 1 };
/** Time left for ordering: none given sorts with the longest. */
const leftOf = (t: WalletEntry) => t.msLeft ?? Number.MAX_SAFE_INTEGER;

/** The ticket on this device that matters most (a running one, the longest first), or null when none can get in. */
export function bestTicket(tickets: readonly WalletEntry[]): WalletEntry | null {
  return tickets.filter((t) => RANK[t.status] !== undefined).sort((a, b) => RANK[b.status]! - RANK[a.status]! || leftOf(b) - leftOf(a))[0] ?? null;
}

export interface GateCard {
  kind: string;
  id: string;
  line: string;
}

/** The card that flips up at the turnstiles: the ticket's ID, and that the visit starts (or how long is left). */
export function gateCard(scan: Extract<ScanReply, { ok: true }>, now: number): GateCard {
  const left = scan.validUntil === null ? null : Math.max(0, scan.validUntil - now);
  let line: string;
  if (windowed(scan.kind)) line = scan.started ? 'Your night starts now' : 'Welcome back';
  else if (scan.started) line = left === null ? 'Your visit starts now' : `Your visit starts now: ${timeLeft(left)}`;
  else line = left === null ? 'Welcome back' : `Welcome back: ${timeLeft(left)} left`;
  return { kind: KIND_LABEL[scan.kind], id: scan.id, line };
}

/** What the turnstiles say before they sell a Day Ticket (OP-180), for the owner's approval. */
export const GATE_WORDS = {
  /** After the reason, on the card before the store: the turnstiles sell a Day Ticket right there. */
  buy: 'You can get a Day Ticket right here.',
} as const;

/**
 * What the turnstiles say when a ticket does not go through (`kind`: the ticket's, when it is this
 * owl's), and whether they offer a Day Ticket for it (OP-180): an owl with no ticket that works can
 * buy one right there; one whose ticket waits on the store, waits for its night, or cannot be
 * checked just now is only told why.
 */
export function gateRefusal(reason: ScanRefusal, kind?: WalletEntry['kind']): { line: string; buy: boolean } {
  switch (reason) {
    case 'none':
    case 'unknown':
    case 'elsewhere':
      return { line: 'You need a ticket to go in.', buy: true };
    case 'used':
      return { line: "This ticket's time has run out.", buy: true };
    case 'expired':
      return { line: 'This ticket expired before it was used.', buy: true };
    case 'revoked':
      return { line: 'This ticket was refunded.', buy: true };
    case 'held':
      return { line: 'Your ticket is waiting on a quick check from the store. It works as soon as that is done.', buy: false };
    case 'not-yet':
      return { line: kind === 'opening-night' ? 'Your Opening Night Ticket opens the turnstiles on opening night. See you then!' : 'Your event ticket opens the turnstiles on its night. See you then!', buy: false };
    case 'no-length':
      return { line: 'This ticket is not set up yet. Please ask the park for help.', buy: false };
    case 'offline':
      return { line: 'The turnstiles could not reach the park. Try again in a moment.', buy: false };
  }
}

/** What opening a ticket link did (`tickets` is this device's wallet afterwards; null when the link no longer works). */
/** What the park says when a ticket link names a ticket already in use (OP-174), for the owner's approval. */
export const LINK_WORDS = {
  inUse: 'That ticket is already in use by another owl, so it stays with them. Each ticket lets in one owl.',
} as const;

export function linkToast(kind: TicketLink['kind'], tickets: WalletEntry[] | 'in-use' | null): string {
  // OP-174: a ticket stays with the owl it let in, so a forwarded link cannot let in a second one.
  if (tickets === 'in-use') return LINK_WORDS.inUse;
  if (tickets === null) {
    return kind === 'claim' ? 'That ticket link no longer works. The newest email from the store has the one that does.' : 'That ticket was already taken, or its link was replaced by a newer one.';
  }
  const live = tickets.filter((t) => t.status === 'unused' || t.status === 'active' || t.status === 'held');
  if (!live.length) return 'The tickets on that link were refunded or have run out.';
  if (kind === 'take') return 'A ticket was passed on to you. It is in your wallet: walk through the turnstiles to use it.';
  return live.length === 1 ? 'Your ticket is in your wallet. Walk through the turnstiles to use it.' : 'Your tickets are in your wallet. Walk through the turnstiles to use one.';
}

const CSS = `
#hud .ticket-card{position:absolute;z-index:11;left:50%;top:20%;transform:translateX(-50%) perspective(700px) rotateX(88deg);transform-origin:50% 100%;opacity:0;pointer-events:none;
  background:linear-gradient(160deg,#F6F1E3,#EADFC3);color:#0C1E36;border-radius:14px;padding:14px 22px;width:min(320px,86vw);text-align:center;display:flex;flex-direction:column;gap:4px;
  box-shadow:0 0 0 2px #C9A227,0 0 30px rgba(201,162,39,.8),0 10px 30px rgba(0,0,0,.45);transition:transform .5s cubic-bezier(.2,.9,.3,1.25),opacity .25s}
#hud .ticket-card.up{transform:translateX(-50%) perspective(700px) rotateX(0);opacity:1}
#hud .ticket-card .kind{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
#hud .ticket-card .tid{font:700 22px/1.25 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em}
#hud .ticket-card .line{font-size:14px;font-weight:600}
@media (prefers-reduced-motion:reduce){#hud .ticket-card{transition:opacity .25s}}
`;

export interface TicketCard {
  show(card: GateCard, ms?: number): void;
}

/**
 * The ticket card, shown for a moment as the turnstiles take the ticket: the one place the ticket's
 * status shows in the lobby (OP-180; the status card on the plaza before them is gone).
 */
export function createTicketCard(root: HTMLElement): TicketCard {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'ticket-card';
  el.setAttribute('role', 'status');
  el.dataset['ticketCard'] = '';
  const kind = document.createElement('span');
  kind.className = 'kind';
  const id = document.createElement('strong');
  id.className = 'tid';
  const line = document.createElement('span');
  line.className = 'line';
  el.append(kind, id, line);
  root.appendChild(el);
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    show(card, ms = 2600) {
      kind.textContent = card.kind;
      id.textContent = card.id;
      line.textContent = card.line;
      // Restart the flip when a card is still up.
      el.classList.remove('up');
      void el.offsetWidth;
      el.classList.add('up');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('up'), ms);
    },
  };
}

const PASS_CSS = `
#hud .free-pass{position:absolute;z-index:11;left:50%;top:20%;transform:translateX(-50%);width:min(340px,90vw);display:none;flex-direction:column;align-items:center;gap:10px;padding:16px 18px;border-radius:16px;text-align:center;pointer-events:auto;
  background:linear-gradient(160deg,#F6F1E3,#EADFC3);color:#0C1E36;box-shadow:0 0 0 2px #C9A227,0 0 30px rgba(201,162,39,.7),0 10px 30px rgba(0,0,0,.45)}
#hud .free-pass.open{display:flex}
#hud .free-pass p{margin:0;font-size:16px;font-weight:700}
#hud .free-pass .row{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
#hud .free-pass button{min-height:44px;color:#0C1E36;border-color:rgba(12,30,54,.3)}
#hud .free-pass button.claim{padding:8px 22px;font-weight:800}
`;

/** How often, and how long, the page looks for the pass once the owl has gone to claim it. */
const PASS_LOOK_MS = 4_000;
const PASS_LOOK_FOR_MS = 20 * 60_000;

export interface FreePassOffer {
  /** The store's cart link with the pass, the night's code and the ticket it comes from. */
  link: string;
  /** Whether the pass has come (the ticket it came from says so in the wallet). */
  claimed(): Promise<boolean>;
  /**
   * Whose words: an Opening Night Ticket's (C42, `night`), or a Day Ticket just bought at the gate
   * (OP-180, `day`).
   */
  words: 'night' | 'day';
  /**
   * The opener the card before the store handed out with the Day Ticket's purchase (OP-180): the
   * card asked once, right before that purchase, so the pass opens without asking again. Without it
   * (opening night's offer, which no purchase came before), the button asks first (OP-153).
   */
  open?: Opener;
}

export interface FreePassCard {
  show(offer: FreePassOffer): void;
  hide(): void;
}

/** Ticket IDs whose pass was offered on this page, and where this browser keeps them. */
const OFFERED_KEY = 'owl-park:pass-offered';
const offeredHere = new Set<string>();

/** Somewhere to keep the IDs (the page's own storage; tests give another). */
export interface OfferedStore {
  get(): string | null;
  set(value: string): void;
}

const pageStore: OfferedStore = {
  get: () => {
    try {
      return globalThis.localStorage?.getItem(OFFERED_KEY) ?? null;
    } catch {
      return null;
    }
  },
  set: (v) => {
    try {
      globalThis.localStorage?.setItem(OFFERED_KEY, v);
    } catch {
      // Storage refused (a private window): this page still remembers.
    }
  },
};

/**
 * The pass is offered once per ticket (OP-180): true the first time for a ticket, false after. The
 * page remembers the last few tickets it offered for, in memory and in the browser where it may.
 */
export function offerOnce(id: string, store: OfferedStore = pageStore): boolean {
  if (offeredHere.has(id)) return false;
  let kept: string[] = [];
  try {
    const v: unknown = JSON.parse(store.get() ?? '[]');
    if (Array.isArray(v)) kept = v.filter((x): x is string => typeof x === 'string');
  } catch {
    kept = [];
  }
  offeredHere.add(id);
  if (kept.includes(id)) return false;
  store.set(JSON.stringify([...kept, id].slice(-20)));
  return true;
}

/** Forget the tickets offered on this page (tests). */
export function forgetOffers(): void {
  offeredHere.clear();
}

/**
 * The half-price annual pass, offered after the ticket card on opening night (C42: "Your pass is
 * half price tonight." and Claim it) or right after a Day Ticket bought at the gate comes (OP-180).
 * Its button opens the store's checkout in a new tab with the pass, its code and the ticket: after
 * the card before the store (OP-153), unless that card already asked right before the Day Ticket's
 * purchase. The page then looks for the pass in the wallet for a while, and says when it has come.
 */
export function createFreePassCard(root: HTMLElement, toast: (message: string) => void, ask: AskStore): FreePassCard {
  const style = document.createElement('style');
  style.textContent = PASS_CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'free-pass';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Annual pass');
  el.dataset['freePass'] = '';
  const p = document.createElement('p');
  const row = document.createElement('div');
  row.className = 'row';
  const claim = document.createElement('button');
  claim.className = 'claim';
  claim.dataset['claim'] = '';
  const close = document.createElement('button');
  close.className = 'ghost';
  close.dataset['passClose'] = '';
  row.append(claim, close);
  el.append(p, row);
  root.appendChild(el);
  let offer: FreePassOffer | null = null;
  let looking: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (looking) clearInterval(looking);
    looking = null;
  };
  const watch = (claimed: () => Promise<boolean>) => {
    stop();
    const until = Date.now() + PASS_LOOK_FOR_MS;
    const id = setInterval(() => {
      if (Date.now() > until) return stop();
      void claimed().then((yes) => {
        if (!yes || looking !== id) return;
        stop();
        el.classList.remove('open');
        toast(OPENING_WORDS.claimed);
      }, () => undefined);
    }, PASS_LOOK_MS);
    looking = id;
  };
  close.addEventListener('click', () => el.classList.remove('open'));
  claim.addEventListener('click', () => {
    const o = offer;
    if (!o) return;
    if (o.open) {
      // OP-180: the card asked right before the Day Ticket's purchase; the pass opens in this click.
      el.classList.remove('open');
      o.open(o.link, '_blank', 'noopener');
      watch(o.claimed);
      return;
    }
    ask({ link: o.link, then: () => watch(o.claimed) }, claim);
  });
  return {
    show(o) {
      offer = o;
      const day = o.words === 'day';
      p.textContent = day ? PASS_WORDS.offer : OPENING_WORDS.offer;
      claim.textContent = day ? PASS_WORDS.get : OPENING_WORDS.claim;
      close.textContent = day ? PASS_WORDS.close : 'Close';
      el.dataset['freePass'] = o.words;
      el.classList.add('open');
    },
    hide() {
      el.classList.remove('open');
    },
  };
}
