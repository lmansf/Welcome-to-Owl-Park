export interface BoothInfo {
  /** Where tickets are sold (the store's ticket page); null until tickets go on sale. */
  ticketsUrl: string | null;
  /** `ticket` once the park admits ticket-holders only; `open` lets everyone through the turnstiles. */
  gate: 'open' | 'ticket';
  /** This visitor's pass lets them through the turnstiles. */
  admitted: boolean;
}

export interface BoothPanel {
  open(info: BoothInfo): void;
  close(): void;
  isOpen(): boolean;
}

/** What the booth window says, from what the visitor can do at the gate and whether tickets sell yet. */
export function boothText(info: BoothInfo): { say: string; buy: boolean } {
  if (info.gate === 'ticket' && info.admitted) return { say: 'Your ticket is ready. Walk through the turnstiles to enter the park.', buy: info.ticketsUrl !== null };
  if (info.gate === 'ticket') {
    return info.ticketsUrl
      ? { say: 'The park is open to ticket-holders. Get your ticket here, then walk through the turnstiles.', buy: true }
      : { say: 'The park is open to ticket-holders. Tickets will be back on sale soon.', buy: false };
  }
  return info.ticketsUrl
    ? { say: 'Tickets and passes are on sale here. Until the park needs them, the turnstiles let everyone through.', buy: true }
    : { say: 'Tickets and passes are coming soon. Until then the turnstiles let everyone through, so go on in and explore.', buy: false };
}

/**
 * The ticket booth's window in the lobby. Tickets sell in the store (a new tab); the booth says
 * whether they are on sale yet and what the gate needs.
 */
export function createBoothPanel(root: HTMLElement, onOpen: () => void): BoothPanel {
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
    panel.append(header, p);
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
