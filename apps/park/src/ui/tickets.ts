/**
 * Tickets in the lobby (C35), in words: a wallet line per ticket, the card that flips up when the
 * turnstiles scan one, what the turnstiles say when a ticket cannot go through, and what opening
 * a ticket link did. The words are pure functions, so they are unit-tested.
 */
import type { ScanRefusal, ScanReply, WalletEntry } from '../net';
import type { TicketLink } from '../net/ticketLinks';

export const KIND_LABEL: Readonly<Record<WalletEntry['kind'], string>> = { day: 'Day ticket', night: 'Night ticket', annual: 'Annual pass', event: 'Event ticket' };

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
}

/** One ticket in the booth's wallet: what it is, what it can do now, and today's vote. */
export function walletLine(t: WalletEntry, now: number, date: (ms: number) => string = shortDate): WalletLine {
  const title = KIND_LABEL[t.kind];
  const vote = t.status !== 'active' ? null : t.voteToday === 'used' ? "Today's vote: cast" : "Today's vote: ready at a realm's idol";
  switch (t.status) {
    case 'held':
      return { title, status: 'Waiting on a quick check from the store; it works as soon as that is done', vote, share: false };
    case 'unused':
      if (t.kind === 'event') {
        const status = t.validFrom !== null && t.validFrom > now ? `For ${date(t.validFrom)}` : 'Its night is on: walk through the turnstiles';
        return { title, status, vote, share: true };
      }
      return { title, status: 'Ready: its time starts when the turnstiles scan it', vote, share: true };
    case 'active':
      return { title, status: t.msLeft === null ? 'Running' : `Running: ${timeLeft(t.msLeft)} left`, vote, share: false };
    case 'used':
      return { title, status: 'Used', vote, share: false };
    case 'expired':
      return { title, status: t.kind === 'event' ? 'Its night has passed' : 'Expired unused', vote, share: false };
    case 'revoked':
      return { title, status: 'Refunded', vote, share: false };
  }
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
  if (scan.kind === 'event') line = scan.started ? 'Your night starts now' : 'Welcome back';
  else if (scan.started) line = left === null ? 'Your visit starts now' : `Your visit starts now: ${timeLeft(left)}`;
  else line = left === null ? 'Welcome back' : `Welcome back: ${timeLeft(left)} left`;
  return { kind: KIND_LABEL[scan.kind], id: scan.id, line };
}

/** What the turnstiles say when a ticket does not go through. */
export function gateRefusal(reason: ScanRefusal): string {
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
      return 'Your event ticket opens the turnstiles on its night. See you then!';
    case 'no-length':
      return 'This ticket is not set up yet. Please ask the park for help.';
    case 'offline':
      return 'The turnstiles could not reach the park. Try again in a moment.';
  }
}

/** What opening a ticket link did (`tickets` is this device's wallet afterwards; null when the link no longer works). */
export function linkToast(kind: TicketLink['kind'], tickets: WalletEntry[] | null): string {
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
@media (prefers-reduced-motion:reduce){#hud .ticket-card{transition:opacity .25s}}
`;

/** The ticket card, shown for a moment as the turnstiles take the ticket. */
export function createTicketCard(root: HTMLElement): { show(card: GateCard, ms?: number): void } {
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
