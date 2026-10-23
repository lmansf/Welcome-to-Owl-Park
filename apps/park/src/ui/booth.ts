import type { WalletEntry } from '../net';
import { shareLink } from '../net/ticketLinks';
import { OPENING_WORDS, walletLine } from './tickets';

export interface BoothInfo {
  /** Where tickets are sold (the store's ticket page); null until tickets go on sale. */
  ticketsUrl: string | null;
  /** `ticket` once the park admits ticket-holders only; `open` lets everyone through the turnstiles. */
  gate: 'open' | 'ticket';
  /** This visitor's pass lets them through the turnstiles. */
  admitted: boolean;
  /** The tickets on this device; absent without the park's server, which keeps them. */
  wallet?: WalletEntry[] | null;
  /** Makes a share link's secret for one ticket on this device. */
  share?: (id: string) => Promise<string | null>;
  /** Opening night is on (C42): the booth says every pass is free. */
  openingNight?: boolean;
  /** Opening night's free pass: the store's cart link for each Opening Night Ticket that may claim one now. */
  passLinks?: Record<string, string>;
  /** The owl went to claim the free pass of this ticket: the page looks for the pass and says when it comes. */
  watchPass?: (id: string) => void;
}

export interface BoothPanel {
  open(info: BoothInfo): void;
  close(): void;
  isOpen(): boolean;
}

/** What the booth window says, from what the visitor can do at the gate and whether tickets sell yet. */
export function boothText(info: BoothInfo): { say: string; buy: boolean } {
  const holds = info.wallet?.some((t) => t.status === 'unused' || t.status === 'active') ?? false;
  if (holds || (info.gate === 'ticket' && info.admitted)) return { say: 'Your ticket is ready. Walk through the turnstiles to enter the park.', buy: info.ticketsUrl !== null };
  if (info.gate === 'ticket') {
    return info.ticketsUrl
      ? { say: 'The park is open to ticket-holders. Get your ticket here, then walk through the turnstiles.', buy: true }
      : { say: 'The park is open to ticket-holders. Tickets will be back on sale soon.', buy: false };
  }
  return info.ticketsUrl
    ? { say: 'Tickets and passes are on sale here. Until the park needs them, the turnstiles let everyone through.', buy: true }
    : { say: 'Tickets and passes are coming soon. Until then the turnstiles let everyone through, so go on in and explore.', buy: false };
}

const CSS = `
#hud .booth .wallet{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
#hud .booth .wallet li{display:flex;flex-direction:column;gap:3px;background:rgba(246,241,227,.06);border:1px solid rgba(246,241,227,.14);border-radius:12px;padding:10px 12px}
#hud .booth .wallet .tid{font:700 15px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.05em}
#hud .booth .wallet .kind{font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
#hud .booth .wallet .st,#hud .booth .wallet .vote{font-size:13px;opacity:.92}
#hud .booth .wallet button{align-self:flex-start;min-height:36px;padding:6px 12px;font-size:13px;margin-top:4px}
#hud .booth .wallet .shared{font-size:12px;opacity:.88;word-break:break-all;user-select:all}
#hud .booth .opening{margin:0;padding:8px 12px;border-radius:12px;background:rgba(201,162,39,.18);border:1px solid #C9A227;color:#FFD36A;font-weight:800;text-align:center}
#hud .booth .wallet .pass{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#FFD36A}
#hud .booth .wallet .pass a{display:inline-flex;align-items:center;min-height:36px;padding:6px 14px;border-radius:999px;background:#C9A227;color:#0C1E36;font-weight:800;text-decoration:none}
`;

/** The page's address for share links, on the park's own address. */
const here = () => globalThis.location?.origin ?? '';

/** Hands a share link on: the phone's share sheet where there is one, else the clipboard. */
async function handOn(link: string): Promise<'shared' | 'copied' | 'shown'> {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'An Owl Park ticket', url: link });
      return 'shared';
    }
    await navigator.clipboard.writeText(link);
    return 'copied';
  } catch {
    return 'shown';
  }
}

function walletList(info: BoothInfo): HTMLElement {
  const ul = document.createElement('ul');
  ul.className = 'wallet';
  ul.dataset['booth'] = 'wallet';
  const now = Date.now();
  for (const t of info.wallet ?? []) {
    const line = walletLine(t, now);
    const li = document.createElement('li');
    li.dataset['ticket'] = t.id;
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = line.title;
    const id = document.createElement('span');
    id.className = 'tid';
    id.textContent = t.id;
    const st = document.createElement('span');
    st.className = 'st';
    st.textContent = line.status;
    li.append(kind, id, st);
    // Opening night (C42): the free pass, to claim tonight, or come.
    const link = info.passLinks?.[t.id];
    if ((line.freePass === 'ready' && link) || line.freePass === 'claimed') {
      const pass = document.createElement('span');
      pass.className = 'pass';
      pass.dataset['booth'] = 'free-pass';
      if (line.freePass === 'claimed') pass.textContent = OPENING_WORDS.claimed;
      else {
        const a = document.createElement('a');
        a.textContent = OPENING_WORDS.claim;
        a.href = link!;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.addEventListener('click', () => info.watchPass?.(t.id));
        pass.append(OPENING_WORDS.offer, a);
      }
      li.appendChild(pass);
    }
    if (line.vote) {
      const v = document.createElement('span');
      v.className = 'vote';
      v.textContent = line.vote;
      li.appendChild(v);
    }
    const share = info.share;
    if (line.share && share) {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = 'Pass it on';
      b.dataset['booth'] = 'share';
      b.addEventListener('click', async () => {
        b.disabled = true;
        const note = document.createElement('span');
        note.className = 'shared';
        const secret = await share(t.id).catch(() => null);
        if (!secret) {
          note.textContent = 'This ticket cannot be passed on right now.';
          b.disabled = false;
        } else {
          const link = shareLink(here(), secret);
          const how = await handOn(link);
          note.textContent = how === 'shown' ? `Send this link to whoever gets the ticket (it works once): ${link}` : how === 'copied' ? 'Link copied. Whoever opens it first gets this ticket.' : 'Whoever opens the link first gets this ticket.';
          note.dataset['link'] = link;
        }
        li.querySelector('.shared')?.remove();
        li.appendChild(note);
      });
      li.appendChild(b);
    }
    ul.appendChild(li);
  }
  return ul;
}

/**
 * The ticket booth's window in the lobby. Tickets sell in the store (a new tab); the booth says
 * whether they are on sale yet and what the gate needs, and shows the tickets on this device.
 */
export function createBoothPanel(root: HTMLElement, onOpen: () => void): BoothPanel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const panel = document.createElement('section');
  panel.className = 'sheet booth';
  panel.setAttribute('aria-label', 'Ticket booth');
  root.appendChild(panel);

  const render = (info: BoothInfo) => {
    panel.innerHTML = '';
    const header = document.createElement('header');
    const h2 = document.createElement('h2');
    h2.textContent = 'Ticket booth';
    const sub = document.createElement('span');
    sub.className = 'sub';
    const close = document.createElement('button');
    close.className = 'ghost x';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close the ticket booth');
    close.addEventListener('click', () => panel.classList.remove('open'));
    header.append(h2, sub, close);
    const { say, buy } = boothText(info);
    const p = document.createElement('p');
    p.className = 'say';
    p.dataset['booth'] = 'say';
    p.textContent = say;
    panel.append(header);
    if (info.openingNight) {
      const o = document.createElement('p');
      o.className = 'opening';
      o.dataset['booth'] = 'opening';
      o.textContent = OPENING_WORDS.booth;
      panel.append(o);
    }
    panel.append(p);
    if (info.wallet?.length) {
      const h3 = document.createElement('h3');
      h3.textContent = 'Your tickets';
      panel.append(h3, walletList(info));
    }
    if (buy && info.ticketsUrl) {
      const b = document.createElement('button');
      b.textContent = 'Get a ticket';
      b.dataset['booth'] = 'buy';
      const url = info.ticketsUrl;
      b.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      panel.appendChild(b);
    }
  };

  return {
    open(info) {
      onOpen();
      render(info);
      panel.classList.add('open');
    },
    close() {
      panel.classList.remove('open');
    },
    isOpen: () => panel.classList.contains('open'),
  };
}
