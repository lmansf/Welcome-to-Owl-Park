import { createModal, modalHeader } from './modal';

/** The screens the Menu leads to, its two ways out (C43): home to the owl's nest and out of the park, and the home screen (OP-065). */
export type MenuScreenId = 'say' | 'owl' | 'quests' | 'settings' | 'feedback' | 'home' | 'leave' | 'title';

export interface MenuEntry {
  id: MenuScreenId;
  title: string;
  /** Its key on a keyboard. */
  key: string;
  /** A line under the title: how things stand (things collected, quests under way...). */
  sub(): string;
  /** Picked out in gold, to be noticed. */
  highlight?: boolean;
  /** Whether it is offered where the owl is (always, without this). */
  shown?(): boolean;
  /** A dot on the tile: news there not seen yet (quests). */
  badge?(): boolean;
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
  say: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 10h22a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5H19l-7 6v-6H9a5 5 0 0 1-5-5v-9a5 5 0 0 1 5-5z" fill="#F6F1E3"/><path d="M27 31h8l6 5v-5h1a4 4 0 0 0 4-4v-7a4 4 0 0 0-4-4h-4" fill="#C9A227"/><path d="M11 17h18M11 22h12" stroke="#0C1E36" stroke-width="2.4" stroke-linecap="round" opacity=".75"/></svg>',
  owl: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 14l6 5h16l6-5v18c0 7-6 11-14 11S10 39 10 32z" fill="#C9A227"/><ellipse cx="24" cy="33" rx="8" ry="8.5" fill="#F6F1E3"/><circle cx="18.5" cy="22" r="5" fill="#F6F1E3"/><circle cx="29.5" cy="22" r="5" fill="#F6F1E3"/><circle cx="18.5" cy="22" r="2.4" fill="#0C1E36"/><circle cx="29.5" cy="22" r="2.4" fill="#0C1E36"/><path d="M22.5 26l1.5 3 1.5-3z" fill="#E07A5F"/></svg>',
  quests:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="11" y="8" width="26" height="32" rx="4" fill="#F6F1E3"/><path d="M11 12h26M11 36h26" stroke="#C9A227" stroke-width="4"/><path d="M17 19h14M17 24h14M17 29h9" stroke="#0C1E36" stroke-width="2.2" stroke-linecap="round" opacity=".7"/><circle cx="36" cy="34" r="8" fill="#FFD36A"/><path d="M36 29.5v5.5" stroke="#0C1E36" stroke-width="2.6" stroke-linecap="round"/><circle cx="36" cy="38.3" r="1.5" fill="#0C1E36"/></svg>',
  settings:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 7l3.4 4.6 5.6-1.3 1.3 5.6 4.6 3.4-2.6 5.1 2.6 5.1-4.6 3.4-1.3 5.6-5.6-1.3L24 41l-3.4-4.6-5.6 1.3-1.3-5.6-4.6-3.4 2.6-5.1-2.6-5.1 4.6-3.4 1.3-5.6 5.6 1.3z" fill="#C9A227"/><circle cx="24" cy="24" r="7" fill="#0C1E36"/><circle cx="24" cy="24" r="3.2" fill="#F6F1E3"/></svg>',
  feedback:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 9h28a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H23l-9 7v-7h-4a5 5 0 0 1-5-5V14a5 5 0 0 1 5-5z" fill="#FFD36A"/><circle cx="16" cy="21" r="2.6" fill="#0C1E36"/><circle cx="24" cy="21" r="2.6" fill="#0C1E36"/><circle cx="32" cy="21" r="2.6" fill="#0C1E36"/></svg>',
  home: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 24L24 10l16 14" fill="none" stroke="#C9A227" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 22v17h22V22" fill="#F6F1E3"/><circle cx="24" cy="29" r="5" fill="#0C1E36"/><path d="M19 39h10" stroke="#C9A227" stroke-width="3" stroke-linecap="round"/></svg>',
  leave:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 8h17v32H11z" fill="#F6F1E3"/><circle cx="23" cy="25" r="2" fill="#0C1E36"/><path d="M28 24h13m-5-6 6 6-6 6" fill="none" stroke="#C9A227" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  title:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="9" width="36" height="26" rx="5" fill="#F6F1E3"/><circle cx="19" cy="21" r="5" fill="#C9A227"/><circle cx="29" cy="21" r="5" fill="#C9A227"/><circle cx="19" cy="21" r="2.2" fill="#0C1E36"/><circle cx="29" cy="21" r="2.2" fill="#0C1E36"/><path d="M17 41h14M24 35v6" stroke="#C9A227" stroke-width="4" stroke-linecap="round"/></svg>',
};

const CSS = `
#hud .layer .modal.menu{width:min(520px,calc(100vw - 24px))}
#hud .menu .tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#hud .menu .tile:last-child:nth-child(odd){grid-column:1 / -1}
#hud .menu .tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:118px;padding:14px;border-radius:18px;text-align:left;background:rgba(246,241,227,.07);color:#F6F1E3;border:1px solid rgba(246,241,227,.16);box-shadow:none;font-weight:400}
#hud .menu .tile:focus-visible{background:rgba(201,162,39,.2);border-color:#C9A227}
@media (hover:hover){#hud .menu .tile:hover{background:rgba(201,162,39,.2);border-color:#C9A227}}
#hud .menu .tile svg{width:42px;height:42px;margin-bottom:2px}
#hud .menu .tile b{font-size:16px}
#hud .menu .tile small{font-size:12.5px;opacity:.82;line-height:1.3}
#hud .menu .tile kbd{position:absolute;top:12px;right:12px;margin:0}
#hud .menu .tile .badge{top:10px;right:auto;left:46px}
#hud .menu .tile[hidden]{display:none}
#hud .menu .tile.hi{background:linear-gradient(135deg,rgba(201,162,39,.32),rgba(201,162,39,.1));border-color:rgba(255,211,106,.75);box-shadow:0 0 18px rgba(255,211,106,.2)}
#hud .menu .tile.hi:focus-visible{background:rgba(201,162,39,.38);border-color:#FFD36A}
@media (hover:hover){#hud .menu .tile.hi:hover{background:rgba(201,162,39,.38);border-color:#FFD36A}}
#hud .menu .tile.hi b{color:#FFD36A}
`;

/**
 * The Menu: what the bottom bar's Menu button opens. A tile for each screen (Say, your owl, quests,
 * settings, feedback), each with a line saying how things stand; choosing one opens it in the
 * menu's place. Below them the ways out: "Go home" to the owl's own nest, and "Leave the park"
 * inside the park, each shown only where it leads somewhere; and back to the home screen.
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
  const tilesById = new Map<MenuScreenId, HTMLButtonElement>();
  const dots = new Map<MenuScreenId, HTMLElement>();
  for (const e of entries) {
    const b = document.createElement('button');
    b.className = e.highlight ? 'tile hi' : 'tile';
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
    tilesById.set(e.id, b);
    if (e.badge) {
      const dot = document.createElement('span');
      dot.className = 'badge';
      dot.dataset['dot'] = e.id;
      dot.hidden = true;
      b.appendChild(dot);
      dots.set(e.id, dot);
    }
    b.addEventListener('click', () => choose(e.id));
    tiles.appendChild(b);
  }
  const refresh = () => {
    for (const e of entries) {
      subs.get(e.id)!.textContent = e.sub();
      tilesById.get(e.id)!.hidden = e.shown ? !e.shown() : false;
      const dot = dots.get(e.id);
      if (dot) dot.hidden = !e.badge?.();
    }
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
