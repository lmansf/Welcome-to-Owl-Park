import { WAY_OUT_WORDS } from '@owl-park/shared';
import { createModal } from './modal';

export interface LeaveCard {
  open(opener?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
}

const CSS = `
#hud .layer .modal.leave{width:min(360px,calc(100vw - 32px));align-items:center;text-align:center;gap:14px;padding:20px 18px}
#hud .leave .ask{margin:0;font-size:17px;line-height:1.35}
#hud .leave .row{display:flex;gap:10px;justify-content:center}
#hud .leave .row button{min-height:44px;min-width:104px;padding:8px 20px}
`;

let styled = false;

/**
 * "Leave the park" asks first (C43): a small card saying the ticket keeps running, with Stay and
 * Leave. Leave takes the owl to the lobby, outside the gate; Stay (or Escape, or a tap beside the
 * card) keeps it where it is. Stay comes first and takes the focus, so a stray key never leaves.
 */
export function createLeaveCard(root: HTMLElement, leave: () => void): LeaveCard {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const modal = createModal(root, { name: 'leave', label: WAY_OUT_WORDS.leave, layout: 'card', sheet: false });
  const ask = document.createElement('p');
  ask.className = 'ask';
  ask.dataset['leaveAsk'] = '';
  ask.textContent = WAY_OUT_WORDS.ask;
  const row = document.createElement('div');
  row.className = 'row';
  const stay = document.createElement('button');
  stay.className = 'ghost';
  stay.dataset['leave'] = 'stay';
  stay.textContent = WAY_OUT_WORDS.no;
  stay.addEventListener('click', () => modal.close());
  const go = document.createElement('button');
  go.dataset['leave'] = 'leave';
  go.textContent = WAY_OUT_WORDS.yes;
  go.addEventListener('click', () => {
    modal.close();
    leave();
  });
  row.append(stay, go);
  modal.box.append(ask, row);
  return {
    open: (opener) => modal.open(opener),
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
  };
}
