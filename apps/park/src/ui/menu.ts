import { createModal, modalHeader } from './modal';

/** The screens the Menu leads to. */
export type MenuScreenId = 'emotes' | 'owl' | 'quests' | 'settings';

export interface MenuEntry {
  id: MenuScreenId;
  title: string;
  /** Its key on a keyboard. */
  key: string;
  /** A line under the title: how things stand (emotes owned, quests under way...). */
  sub(): string;
}

export interface Menu {
  open(opener?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  /** Redraw the lines under the titles (the collection or the quests changed). */
  refresh(): void;
  onClose(cb: () => void): void;
}

/** Small line drawings for the tiles, in the park's gold and cream. */
const ICONS: Record<MenuScreenId, string> = {
  emotes:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="none" stroke="#FFD36A" stroke-width="3" stroke-dasharray="8 5.4"/><circle cx="24" cy="24" r="7.5" fill="#FFD36A"/><path d="M20.5 25.5q3.5 3 7 0" stroke="#0C1E36" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="21.5" cy="22" r="1.4" fill="#0C1E36"/><circle cx="26.5" cy="22" r="1.4" fill="#0C1E36"/></svg>',
  owl: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 14l6 5h16l6-5v18c0 7-6 11-14 11S10 39 10 32z" fill="#C9A227"/><ellipse cx="24" cy="33" rx="8" ry="8.5" fill="#F6F1E3"/><circle cx="18.5" cy="22" r="5" fill="#F6F1E3"/><circle cx="29.5" cy="22" r="5" fill="#F6F1E3"/><circle cx="18.5" cy="22" r="2.4" fill="#0C1E36"/><circle cx="29.5" cy="22" r="2.4" fill="#0C1E36"/><path d="M22.5 26l1.5 3 1.5-3z" fill="#E07A5F"/></svg>',
  quests:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="11" y="8" width="26" height="32" rx="4" fill="#F6F1E3"/><path d="M11 12h26M11 36h26" stroke="#C9A227" stroke-width="4"/><path d="M17 19h14M17 24h14M17 29h9" stroke="#0C1E36" stroke-width="2.2" stroke-linecap="round" opacity=".7"/><circle cx="36" cy="34" r="8" fill="#FFD36A"/><path d="M36 29.5v5.5" stroke="#0C1E36" stroke-width="2.6" stroke-linecap="round"/><circle cx="36" cy="38.3" r="1.5" fill="#0C1E36"/></svg>',
  settings:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 7l3.4 4.6 5.6-1.3 1.3 5.6 4.6 3.4-2.6 5.1 2.6 5.1-4.6 3.4-1.3 5.6-5.6-1.3L24 41l-3.4-4.6-5.6 1.3-1.3-5.6-4.6-3.4 2.6-5.1-2.6-5.1 4.6-3.4 1.3-5.6 5.6 1.3z" fill="#C9A227"/><circle cx="24" cy="24" r="7" fill="#0C1E36"/><circle cx="24" cy="24" r="3.2" fill="#F6F1E3"/></svg>',
};

const CSS = `
#hud .layer .modal.menu{width:min(520px,calc(100vw - 24px))}
#hud .menu .tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#hud .menu .tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:118px;padding:14px;border-radius:18px;text-align:left;background:rgba(246,241,227,.07);color:#F6F1E3;border:1px solid rgba(246,241,227,.16);box-shadow:none;font-weight:400}
#hud .menu .tile:hover,#hud .menu .tile:focus-visible{background:rgba(201,162,39,.2);border-color:#C9A227}
#hud .menu .tile svg{width:42px;height:42px;margin-bottom:2px}
#hud .menu .tile b{font-size:16px}
#hud .menu .tile small{font-size:12.5px;opacity:.82;line-height:1.3}
#hud .menu .tile kbd{position:absolute;top:12px;right:12px;margin:0}
`;

/**
 * The Menu: what the bottom bar's one button opens. A tile for each screen (emotes, your owl, quests,
 * settings), each with a line saying how things stand; choosing one opens it in the menu's place.
 */
export function createMenu(root: HTMLElement, entries: readonly MenuEntry[], choose: (id: MenuScreenId) => void): Menu {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const modal = createModal(root, { name: 'menu', label: 'Menu', layout: 'card' });
  modal.box.appendChild(modalHeader('Menu', { onClose: () => modal.close(), closeLabel: 'Close the menu' }));
  const tiles = document.createElement('div');
  tiles.className = 'tiles';
  modal.box.appendChild(tiles);
  const subs = new Map<MenuScreenId, HTMLElement>();
  for (const e of entries) {
    const b = document.createElement('button');
    b.className = 'tile';
    b.dataset['screen'] = e.id;
    b.innerHTML = `${ICONS[e.id]}<b></b><small></small>`;
    b.querySelector('b')!.textContent = e.title;
    if (e.key) {
      b.setAttribute('aria-keyshortcuts', e.key);
      const k = document.createElement('kbd');
      k.setAttribute('aria-hidden', 'true');
      k.textContent = e.key;
      b.appendChild(k);
    }
    subs.set(e.id, b.querySelector('small')!);
    b.addEventListener('click', () => choose(e.id));
    tiles.appendChild(b);
  }
  const refresh = () => {
    for (const e of entries) subs.get(e.id)!.textContent = e.sub();
  };

  return {
    open(opener) {
      refresh();
      modal.open(opener);
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
    refresh() {
      if (modal.isOpen()) refresh();
    },
    onClose: (cb) => modal.onClose(cb),
  };
}
