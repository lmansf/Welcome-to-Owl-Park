/**
 * Tickets in the lobby (C35), in words: a wallet line per ticket, the card that flips up when the
 * turnstiles scan one, what the turnstiles say when a ticket cannot go through, and what opening
 * a ticket link did. The words are pure functions, so they are unit-tested.
 */
import type { Entry, ScanRefusal, ScanReply, WalletEntry } from '../net';
import type { TicketLink } from '../net/ticketLinks';

export const KIND_LABEL: Readonly<Record<WalletEntry['kind'], string>> = { day: 'Day ticket', night: 'Night ticket', annual: 'Annual pass', event: 'Event ticket', 'opening-night': 'Opening Night Ticket' };

/**
 * Opening night's words (C42, the owner's): the booth's line, the pass offer and its button, and the
 * pass come. The pass is half price on the night (OP-062; it was free at first).
 */
export const OPENING_WORDS = {
  booth: 'Opening night: every pass is half price',
  offer: 'Your pass is half price tonight.',
  claim: 'Claim it',
  claimed: 'Your annual pass is in your wallet',
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

/** One ticket in the booth's wallet: what it is, what it can do now, and today's vote. */
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

/** Running, then ready, then waiting on the store: the ticket the home line and the gate's status card are about. */
const RANK: Partial<Record<WalletEntry['status'], number>> = { active: 3, unused: 2, held: 1 };
/** Time left for ordering: none given sorts with the longest. */
const leftOf = (t: WalletEntry) => t.msLeft ?? Number.MAX_SAFE_INTEGER;

/** The ticket on this device that matters most (a running one, the longest first), or null when none can get in. */
export function bestTicket(tickets: readonly WalletEntry[]): WalletEntry | null {
  return tickets.filter((t) => RANK[t.status] !== undefined).sort((a, b) => RANK[b.status]! - RANK[a.status]! || leftOf(b) - leftOf(a))[0] ?? null;
}

/** The words of the ticket status card at the turnstiles (OP-172), for the owner's approval. */
export const GATE_STATUS_WORDS = {
  none: 'No ticket yet: the ticket booth is along the plaza',
  /** A running annual pass goes by its name and that it runs: its days left are in the booth's wallet. */
  running: 'Running',
} as const;

/**
 * The ticket status card while the owl stands on the plaza in front of the turnstiles (OP-172): the
 * best ticket in walletLine's words ("Day ticket: Ready, its time starts when the turnstiles scan it",
 * "Annual pass: Running"), or where the booth is when there is none. Only while the gate takes
 * tickets: an open gate (null) has nothing to say, nor does one that lets this visitor through
 * already (admitted) when the device holds no ticket.
 * TODO-DOCS (OP-172): docs/ARCHITECTURE.md (the lobby): the status card on the plaza before the
 * turnstiles (the lobby's `gate-approach` zone; RoomDef gains `zones`), not shown to an owl just out of
 * the park until it walks off and back; docs/PLAYBOOK.md section 7: where a visitor sees a ticket now
 * (that card, the home line only when it changes what the owl does, Settings' closed Tickets row above
 * Leaving with the IDs, and one toast in the park at 15 minutes left on a Day or Night ticket).
 */
export function gateStatus(tickets: readonly WalletEntry[], entry: Entry, now: number, date: (ms: number) => string = shortDate): string | null {
  if (entry.gate !== 'ticket') return null;
  const best = bestTicket(tickets);
  if (!best) return entry.admitted ? null : GATE_STATUS_WORDS.none;
  const w = walletLine(best, now, date);
  // One colon to a line: the status's own becomes a comma.
  const status = best.status === 'active' && best.kind === 'annual' ? GATE_STATUS_WORDS.running : w.status.replace(': ', ', ');
  return `${w.title}: ${status}`;
}

/**
 * Where the owl stands against the plaza in front of the turnstiles (OP-172): in it or not, whether
 * walking in shows the status card (armed), and whether it shows. An owl that starts in it (it has
 * just come out of the park) or has gone through the turnstiles is not shown it until it walks out of
 * the plaza and back.
 */
export interface GateApproach {
  inside: boolean;
  armed: boolean;
  shown: boolean;
}

/** The owl placed in the room: inside the plaza already, walking in does not count until it walks out. */
export function approachStart(inside: boolean): GateApproach {
  return { inside, armed: !inside, shown: false };
}

/** The owl moved: in or out of the plaza. */
export function approachMove(a: GateApproach, inside: boolean): GateApproach {
  if (inside === a.inside) return a;
  return inside ? { inside, armed: a.armed, shown: a.armed } : { inside, armed: true, shown: false };
}

/** The owl stepped into the turnstiles: the scan card (or the refusal) takes over until it walks out and back. */
export function approachThrough(a: GateApproach): GateApproach {
  return { ...a, armed: false, shown: false };
}

/** A Day or Night ticket the turnstiles just took, for the one toast in the park as its time runs low (OP-172). */
export interface TicketRun {
  kind: 'day' | 'night';
  /** When its time runs out (ms). */
  until: number;
  /** The toast has been shown this visit. */
  warned: boolean;
}

/** How long before a Day or Night ticket runs out the park says so, once a visit. */
export const LOW_TIME_MS = 15 * MIN;

/** The visit a scan starts: a Day or Night ticket with an end gets the low-time toast; anything else none. */
export function ticketRun(scan: Extract<ScanReply, { ok: true }>): TicketRun | null {
  return (scan.kind === 'day' || scan.kind === 'night') && scan.validUntil !== null ? { kind: scan.kind, until: scan.validUntil, warned: false } : null;
}

/** In how many ms the low-time toast is due (0: now), or null when none is (none this visit, shown already, or run out). */
export function lowTimeDue(run: TicketRun | null, now: number): number | null {
  if (!run || run.warned || run.until <= now) return null;
  return Math.max(0, run.until - LOW_TIME_MS - now);
}

/** The quiet toast as a running Day or Night ticket gets low (OP-172), for the owner's approval. */
export function lowTimeToast(kind: TicketRun['kind'], msLeft: number): string {
  const min = Math.max(1, Math.round(msLeft / MIN));
  return `Your ${KIND_LABEL[kind]} has ${min} ${min === 1 ? 'minute' : 'minutes'} left.`;
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

/** What the turnstiles say when a ticket does not go through (`kind`: the ticket's, when it is this device's). */
export function gateRefusal(reason: ScanRefusal, kind?: WalletEntry['kind']): string {
  switch (reason) {
    case 'none':
    case 'unknown':
    case 'elsewhere':
      return 'The park is open to ticket-holders. The ticket booth is along the plaza.';
    case 'held':
      return 'Your ticket is waiting on a quick check from the store. It works as soon as that is done.';
    case 'used':
      return "This ticket's time has run out. The ticket booth is along the plaza.";
    case 'expired':
      return 'This ticket expired unused. The ticket booth is along the plaza.';
    case 'revoked':
      return 'This ticket was refunded, so the turnstiles cannot take it.';
    case 'not-yet':
      return kind === 'opening-night' ? 'Your Opening Night Ticket opens the turnstiles on opening night. See you then!' : 'Your event ticket opens the turnstiles on its night. See you then!';
    case 'no-length':
      return 'This ticket is not set up yet. Please ask the park for help.';
    case 'offline':
      return 'The turnstiles could not reach the park. Try again in a moment.';
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
  return live.length === 1 ? 'Your ticket is in your wallet. Walk through the turnstiles to use it.' : 'Your tickets are in your wallet. Pass the extra ones on from the ticket booth.';
}

const CSS = `
#hud .ticket-card{position:absolute;z-index:11;left:50%;top:20%;transform:translateX(-50%) perspective(700px) rotateX(88deg);transform-origin:50% 100%;opacity:0;pointer-events:none;
  background:linear-gradient(160deg,#F6F1E3,#EADFC3);color:#0C1E36;border-radius:14px;padding:14px 22px;width:min(320px,86vw);text-align:center;display:flex;flex-direction:column;gap:4px;
  box-shadow:0 0 0 2px #C9A227,0 0 30px rgba(201,162,39,.8),0 10px 30px rgba(0,0,0,.45);transition:transform .5s cubic-bezier(.2,.9,.3,1.25),opacity .25s}
#hud .ticket-card.up{transform:translateX(-50%) perspective(700px) rotateX(0);opacity:1}
#hud .ticket-card .kind{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
#hud .ticket-card .tid{font:700 22px/1.25 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em}
#hud .ticket-card .line{font-size:14px;font-weight:600}
#hud .ticket-card.status{transform:translateX(-50%);transition:opacity .35s ease}
#hud .ticket-card.status .kind,#hud .ticket-card.status .tid{display:none}
@media (prefers-reduced-motion:reduce){#hud .ticket-card{transition:opacity .25s}}
`;

export interface TicketCard {
  show(card: GateCard, ms?: number): void;
  /**
   * The ticket status at the turnstiles (OP-172), in the scan card's place and style: fades in with
   * `line`, out with null. A scan card takes the place over; null never hides one.
   */
  status(line: string | null): void;
}

/** The ticket card, shown for a moment as the turnstiles take the ticket, and the status card before them. */
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
      // The scan card replaces the status card: one card in this place, never two.
      el.classList.remove('status');
      delete el.dataset['ticketStatus'];
      // Restart the flip when a card is still up.
      el.classList.remove('up');
      void el.offsetWidth;
      el.classList.add('up');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('up'), ms);
    },
    status(text) {
      if (text === null) {
        if (!el.classList.contains('status')) return;
        delete el.dataset['ticketStatus'];
        el.classList.remove('up');
        return;
      }
      // A scan card still up keeps its moment.
      if (el.classList.contains('up') && !el.classList.contains('status')) return;
      if (timer) clearTimeout(timer);
      timer = null;
      line.textContent = text;
      el.dataset['ticketStatus'] = '';
      el.classList.add('status');
      void el.offsetWidth;
      el.classList.add('up');
    },
  };
}

const PASS_CSS = `
#hud .free-pass{position:absolute;z-index:11;left:50%;top:20%;transform:translateX(-50%);width:min(340px,90vw);display:none;flex-direction:column;align-items:center;gap:10px;padding:16px 18px;border-radius:16px;text-align:center;pointer-events:auto;
  background:linear-gradient(160deg,#F6F1E3,#EADFC3);color:#0C1E36;box-shadow:0 0 0 2px #C9A227,0 0 30px rgba(201,162,39,.7),0 10px 30px rgba(0,0,0,.45)}
#hud .free-pass.open{display:flex}
#hud .free-pass p{margin:0;font-size:16px;font-weight:700}
#hud .free-pass .row{display:flex;gap:10px}
#hud .free-pass a{display:inline-flex;align-items:center;min-height:44px;padding:8px 22px;border-radius:999px;background:#C9A227;color:#0C1E36;font-weight:800;text-decoration:none}
#hud .free-pass button{min-height:44px;color:#0C1E36;border-color:rgba(12,30,54,.3)}
`;

/** How often, and how long, the page looks for the pass once the owl has gone to claim it. */
const PASS_LOOK_MS = 4_000;
const PASS_LOOK_FOR_MS = 20 * 60_000;

export interface FreePassOffer {
  /** The store's cart link with the pass and the night's code. */
  link: string;
  /** Whether the pass has come (the wallet's Opening Night Ticket says so). */
  claimed(): Promise<boolean>;
}

export interface FreePassCard {
  show(offer: FreePassOffer): void;
  hide(): void;
  /** Look for the pass for a while (the owl went to claim it from here or from the booth), and say when it has come. */
  watch(claimed: () => Promise<boolean>): void;
}

/**
 * Opening night's pass offer (C42): after the ticket card, "Your pass is half price tonight." and
 * Claim it, which opens the store's checkout in a new tab with the pass, its code and the ticket. The
 * page then looks for the pass in the wallet for a while, and says when it has come.
 */
export function createFreePassCard(root: HTMLElement, toast: (message: string) => void): FreePassCard {
  const style = document.createElement('style');
  style.textContent = PASS_CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'free-pass';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Opening night');
  el.dataset['freePass'] = '';
  const p = document.createElement('p');
  p.textContent = OPENING_WORDS.offer;
  const row = document.createElement('div');
  row.className = 'row';
  const claim = document.createElement('a');
  claim.textContent = OPENING_WORDS.claim;
  claim.target = '_blank';
  claim.rel = 'noopener noreferrer';
  const close = document.createElement('button');
  close.className = 'ghost';
  close.textContent = 'Close';
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
    if (offer) watch(offer.claimed);
  });
  return {
    show(o) {
      offer = o;
      claim.href = o.link;
      el.classList.add('open');
    },
    hide() {
      el.classList.remove('open');
    },
    watch,
  };
}
