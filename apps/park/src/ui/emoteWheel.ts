import { CATALOGUE, EMOTE_IDS, type ItemDef } from '@owl-park/shared';
import type { CollectionState } from '../collect/state';
import { variantIcon } from './itemIcon';
import { createModal, type Modal } from './modal';

/** Emotes on one turn of the wheel; more turn the page. */
export const WHEEL_SLOTS = 8;

/** Where slot `i` sits on a ring of radius `r` around its middle: slot 0 at the top, then clockwise. */
export function wheelSpot(i: number, r: number, slots = WHEEL_SLOTS): { x: number; y: number } {
  const a = (i / slots) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.round(Math.cos(a) * r * 100) / 100, y: Math.round(Math.sin(a) * r * 100) / 100 };
}

/** The items on page `page` (kept in range), and how many pages there are (always at least one). */
export function wheelPage<T>(items: readonly T[], page: number, per = WHEEL_SLOTS): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / per));
  const p = Math.min(pages - 1, Math.max(0, Math.floor(page)));
  return { items: items.slice(p * per, p * per + per), page: p, pages };
}

/** The owl's emotes in the wheel's order: the first eight are its first page, and keys 1 to 8. */
export function wheelEmotes(state: CollectionState): ItemDef[] {
  return CATALOGUE.filter((i) => i.kind === 'emote' && state.owns(i.id));
}

export interface EmoteWheel {
  open(opener?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  /** Called after it closes, whichever way. */
  onClose(cb: () => void): void;
  /** Key `n` (1 to 8): play that slot of the page shown. */
  press(n: number): void;
}

const CSS = `
#hud .layer .modal.wheel{width:auto;max-height:none;overflow:visible;padding:0;background:transparent;border:0;box-shadow:none;align-items:center;gap:14px}
#hud .wheel .ring{--r:132px;position:relative;width:calc(var(--r) * 2 + 96px);height:calc(var(--r) * 2 + 96px);border-radius:50%;background:radial-gradient(circle,rgba(12,30,54,.94) 0 46%,rgba(12,30,54,.86) 47% 100%);border:1px solid rgba(246,241,227,.2);box-shadow:0 18px 60px rgba(0,0,0,.55),inset 0 0 0 10px rgba(246,241,227,.04)}
#hud .wheel .slot{position:absolute;left:50%;top:50%;width:80px;height:80px;min-height:0;margin:-40px 0 0 -40px;padding:6px 4px 4px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:rgba(246,241,227,.08);color:#F6F1E3;border:1px solid rgba(246,241,227,.22);box-shadow:none;font-size:11px;font-weight:700;line-height:1.1;transition:transform .12s ease-out,background .12s}
#hud .wheel .slot canvas{width:36px;height:36px;pointer-events:none}
#hud .wheel .slot span{max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}
#hud .wheel .slot:focus-visible{background:rgba(201,162,39,.32);border-color:#FFD36A;transform:scale(1.08)}
@media (hover:hover){#hud .wheel .slot:hover{background:rgba(201,162,39,.32);border-color:#FFD36A;transform:scale(1.08)}}
#hud .wheel .slot kbd{position:absolute;top:2px;right:6px;margin:0;font-size:10px}
#hud .wheel .slot.empty{background:transparent;border-style:dashed;opacity:.35;pointer-events:none}
#hud .wheel .hub{position:absolute;left:50%;top:50%;width:150px;margin-left:-75px;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
#hud .wheel .hub b{font-size:17px}
#hud .wheel .hub [data-name]{font-size:13px;min-height:16px;color:#FFD36A}
#hud .wheel .pager{display:flex;align-items:center;gap:6px;font-size:12px}
#hud .wheel .pager button{min-height:34px;min-width:34px;padding:0;font-size:18px;line-height:1}
#hud .wheel .note{max-width:min(360px,calc(100vw - 32px));text-align:center;font-size:13px;line-height:1.35;background:rgba(12,30,54,.86);border:1px solid rgba(246,241,227,.15);border-radius:12px;padding:8px 12px}
#hud .wheel .note:empty{display:none}
#hud .wheel [data-close]{min-height:40px}
@media (max-width:420px),(max-height:520px){#hud .wheel .ring{--r:108px}#hud .wheel .slot{width:70px;height:70px;margin:-35px 0 0 -35px}#hud .wheel .slot canvas{width:30px;height:30px}}
`;

/**
 * The emote wheel: the owl's emotes round a ring, eight at a time, a tap (or 1 to 8 on a keyboard,
 * through `press`) plays one and closes the wheel. More than eight turn the page with the arrows
 * (or ← and →).
 */
export function createEmoteWheel(root: HTMLElement, state: CollectionState, play: (emote: string) => void): EmoteWheel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const modal: Modal = createModal(root, { name: 'wheel', label: 'Emotes', layout: 'card', sheet: false });
  const box = modal.box;
  box.innerHTML = `
    <div class="ring" data-ring>
      <div class="hub">
        <b>Emotes</b>
        <span data-name aria-live="polite"></span>
        <div class="pager" data-pager>
          <button class="ghost" data-page="-1" aria-label="Previous emotes">‹</button>
          <span data-page-label></span>
          <button class="ghost" data-page="1" aria-label="More emotes">›</button>
        </div>
      </div>
    </div>
    <p class="note" data-note></p>
    <button class="ghost" data-close aria-label="Close emotes">Close</button>`;
  const $ = <T extends Element>(sel: string) => box.querySelector(sel) as T;
  const ring = $<HTMLElement>('[data-ring]');
  const nameEl = $<HTMLElement>('[data-name]');
  const pager = $<HTMLElement>('[data-pager]');
  const pageLabel = $<HTMLElement>('[data-page-label]');
  const note = $<HTMLElement>('[data-note]');
  let page = 0;
  let slots: HTMLButtonElement[] = [];

  const render = () => {
    // Turning the page with the keyboard keeps the focus on a slot.
    const focused = slots.indexOf(document.activeElement as HTMLButtonElement);
    for (const s of slots) s.remove();
    slots = [];
    const all = wheelEmotes(state);
    const view = wheelPage(all, page);
    page = view.page;
    const r = parseFloat(getComputedStyle(ring).getPropertyValue('--r')) || 132;
    for (let i = 0; i < WHEEL_SLOTS; i++) {
      const item = view.items[i];
      const b = document.createElement('button');
      b.className = item ? 'slot' : 'slot empty';
      const p = wheelSpot(i, r);
      b.style.transform = '';
      b.style.left = `calc(50% + ${p.x}px)`;
      b.style.top = `calc(50% + ${p.y}px)`;
      if (item) {
        b.dataset['emote'] = item.id;
        b.setAttribute('aria-label', item.name);
        b.setAttribute('aria-keyshortcuts', String(i + 1));
        const k = document.createElement('kbd');
        k.setAttribute('aria-hidden', 'true');
        k.textContent = String(i + 1);
        const label = document.createElement('span');
        label.textContent = item.name;
        b.append(variantIcon(item.id, 36, 36), label, k);
        const id = item.id;
        b.addEventListener('click', () => {
          modal.close();
          play(id);
        });
        const show = () => (nameEl.textContent = item.name);
        b.addEventListener('pointerenter', show);
        b.addEventListener('focus', show);
      } else {
        b.disabled = true;
        b.tabIndex = -1;
        b.setAttribute('aria-hidden', 'true');
      }
      ring.appendChild(b);
      slots.push(b);
    }
    if (focused >= 0) slots[Math.min(focused, view.items.length - 1)]?.focus({ preventScroll: true });
    nameEl.textContent = '';
    pager.style.visibility = view.pages > 1 ? 'visible' : 'hidden';
    pageLabel.textContent = `${view.page + 1} / ${view.pages}`;
    note.textContent = !state.inv
      ? 'Loading your emotes…'
      : all.length < EMOTE_IDS.length
        ? `${all.length} of ${EMOTE_IDS.length} emotes. Earn more on quests, or find them in the feather shop.`
        : '';
  };

  for (const b of box.querySelectorAll<HTMLButtonElement>('[data-page]')) {
    b.addEventListener('click', () => {
      page += Number(b.dataset['page']);
      render();
    });
  }
  $<HTMLButtonElement>('[data-close]').addEventListener('click', () => modal.close());
  // The arrows turn the page. (1 to 8 and Escape are the HUD's, from the keyboard module.)
  window.addEventListener('keydown', (e) => {
    if (!modal.isOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      page += e.code === 'ArrowLeft' ? -1 : 1;
      render();
    }
  });
  state.onChange(() => {
    if (modal.isOpen()) render();
  });

  return {
    open(opener) {
      page = 0;
      modal.open(opener);
      render();
      if (!state.inv) void state.refresh();
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
    onClose: (cb) => modal.onClose(cb),
    press(n) {
      if (modal.isOpen()) slots[n - 1]?.click();
    },
  };
}
