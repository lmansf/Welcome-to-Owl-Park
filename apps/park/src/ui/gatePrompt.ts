/**
 * The turnstiles' question (OP-198). With spectators on (OP-191), an owl that walks into a turnstile
 * without a ticket that works no longer walks straight on in: it stops in the turnstile and this card
 * asks first, with two choices. Buy a Day Ticket steps the owl back out and opens the turnstiles' own
 * sale (gateSale.ts: the card before the store, which also offers the Annual Pass, then checkout); the
 * ticket then takes the owl through the turnstiles by itself (OP-190). Enter as a guest walks it on in
 * as a spectator, as before. Escape, or a tap beside the card, is neither: the owl steps back out, and
 * the turnstiles ask again the next time it walks in.
 *
 * This card opens nothing off the park: buying goes on through the card before the store
 * (storeCard.ts), the one place that does. Both buttons are 44 px or more, in the Menu's base theme,
 * and the card takes the focus as it opens (not a button, so a stray key never chooses).
 *
 * The words are drafts for the owner's approval (SPECTATOR_WORDS, spectator.ts).
 *
 * TODO-DOCS (OP-198): the turnstiles' question in docs/ARCHITECTURE.md (the purchase path) and
 * docs/PLAYBOOK.md section 7.
 */
import { createModal } from './modal';
import { MENU_THEMES, themeAt, tokenStyle } from './menuTheme';
import { SPECTATOR_WORDS } from './spectator';

export interface GateAsk {
  /** What the card says above its buttons. */
  lines: readonly string[];
  /** Buy a Day Ticket: runs after the card has closed, in the same click. */
  buy: () => void;
  /** Enter as a guest: the owl walks on in as a spectator. */
  guest: () => void;
  /** Neither (Escape, a tap beside the card, another screen opening): the owl steps back out. */
  stay: () => void;
}

export interface GatePrompt {
  ask(a: GateAsk): void;
  close(): void;
  isOpen(): boolean;
}

/** Which choice the card's close came with; `null` is neither, and the owl stays out. */
export type GateChoice = 'buy' | 'guest' | null;

/** What the card's close does: the chosen way, or staying out when the visitor chose neither. */
export function settle(a: Pick<GateAsk, 'buy' | 'guest' | 'stay'>, choice: GateChoice): void {
  if (choice === 'buy') a.buy();
  else if (choice === 'guest') a.guest();
  else a.stay();
}

const CSS = `
#hud .layer .modal.gate-ask{width:min(360px,calc(100vw - 32px));align-items:center;text-align:center;gap:14px;padding:22px 18px 18px;background-color:var(--m-surface);background-image:var(--m-grain);background-size:360px 150px;color:var(--m-text);border:2px solid var(--m-frame);border-radius:var(--m-radius);box-shadow:var(--m-shadow);font-size:var(--m-body);line-height:1.4}
#hud .modal.gate-ask:focus{outline:none}
#hud .gate-ask .say{margin:0;font-size:var(--m-heading);font-weight:800}
#hud .gate-ask .note{margin:0;font-size:calc(var(--m-body) * .88);opacity:.9}
#hud .gate-ask .row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
#hud .gate-ask .row > button{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:var(--m-target);min-width:max(var(--m-target),140px);margin:0;padding:10px 20px;border-radius:999px;font:inherit;font-size:var(--m-body);font-weight:800;box-shadow:none;text-shadow:none;cursor:pointer}
#hud .gate-ask .row > .buy{background:var(--m-accent);color:var(--m-on-accent);border:2px solid var(--m-accent)}
#hud .gate-ask .row > .guest{background:transparent;color:var(--m-text);border:2px solid var(--m-frame)}
#hud .gate-ask :focus-visible{outline:3px solid var(--m-focus);outline-offset:2px}
`;

let styled = false;

/** The turnstiles' question: one for the whole park. */
export function createGatePrompt(root: HTMLElement): GatePrompt {
  const modal = createModal(root, { name: 'gate-ask', label: SPECTATOR_WORDS.askLabel, layout: 'card', sheet: false });
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const box = modal.box;
  box.tabIndex = -1;
  box.dataset['gateAsk'] = '';
  const says = document.createElement('div');
  says.dataset['gateAsk'] = 'say';
  const row = document.createElement('div');
  row.className = 'row';
  const button = (cls: string, text: string, which: Exclude<GateChoice, null>) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.dataset['gateAsk'] = which;
    b.textContent = text;
    b.addEventListener('click', () => {
      if (!current) return;
      choice = which;
      modal.close();
    });
    return b;
  };
  row.append(button('buy', SPECTATOR_WORDS.buy, 'buy'), button('guest', SPECTATOR_WORDS.guest, 'guest'));
  const note = document.createElement('p');
  note.className = 'note';
  note.dataset['gateAsk'] = 'note';
  note.textContent = SPECTATOR_WORDS.guestNote;
  box.append(says, row, note);
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.code !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    modal.close();
  });

  let current: GateAsk | null = null;
  let choice: GateChoice = null;
  modal.onClose(() => {
    const a = current;
    const c = choice;
    current = null;
    choice = null;
    if (a) settle(a, c);
  });

  return {
    ask(a) {
      // A question still open is answered as neither first: its owl steps back out.
      if (modal.isOpen()) modal.close();
      current = a;
      choice = null;
      says.innerHTML = '';
      for (const text of a.lines) {
        const p = document.createElement('p');
        p.className = 'say';
        p.textContent = text;
        says.appendChild(p);
      }
      box.setAttribute('style', tokenStyle(MENU_THEMES[themeAt(new Date())]));
      modal.open(null);
      box.focus({ preventScroll: true });
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
  };
}
