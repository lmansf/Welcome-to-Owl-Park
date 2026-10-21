import { NEST_SPOTS, NEST_WORDS, getNestSpot, type NestLayout, type NestSpotId } from '@owl-park/shared';
import { piecesFor, spotNumber, stepSpot } from '../game/nestPlan';

/** The owner's nest as the Decorate sheet shows it. */
export interface DecorateView {
  layout: NestLayout;
  owned: readonly string[];
  open: boolean;
  /** Today's furniture gift: still there to take, or taken; null when the park could not say. */
  gift: { taken: boolean } | null;
}

/** What the sheet asks of the room. Each change resolves once the nest has it, or has refused it. */
export interface DecorateActions {
  /** Put a piece in a spot, or with null take the spot's piece away. */
  place(spot: NestSpotId, item: string | null): Promise<void>;
  setOpen(open: boolean): Promise<void>;
  claimGift(): Promise<void>;
  /** The sheet chose a spot: the room marks it and looks at it. */
  select(spot: NestSpotId): void;
  /** Done (or Escape). */
  done(): void;
  /** A small picture of a piece's art, or null. */
  thumb(art: string): string | null;
  /** How much of the screen the sheet covers from the bottom, in CSS pixels (0 once it closes). */
  resize(px: number): void;
}

export interface DecorateSheet {
  open(view: DecorateView, spot: NestSpotId): void;
  /** The nest changed (a piece placed, the gift taken): show it as it now is. */
  update(view: DecorateView): void;
  /** The room picked a spot (a tap on its ring). */
  select(spot: NestSpotId): void;
  close(): void;
  isOpen(): boolean;
}

/** The heading for a spot: its number of the twelve and where it is. */
export function spotHeading(spot: NestSpotId): { n: number; of: number; where: string } {
  return { n: spotNumber(spot), of: NEST_SPOTS.length, where: getNestSpot(spot)?.place === 'wall' ? NEST_WORDS.onTheWall : NEST_WORDS.onTheFloor };
}

/** The gift button: what it says and whether it can be pressed; null hides it (the park could not say). */
export function giftButton(gift: DecorateView['gift']): { label: string; ready: boolean } | null {
  if (!gift) return null;
  return gift.taken ? { label: NEST_WORDS.nextGift, ready: false } : { label: NEST_WORDS.furnitureGift, ready: true };
}

const CSS = `
#hud.decorating .bottom,#hud.decorating .hints{display:none}
#hud .decorate{bottom:max(10px,env(safe-area-inset-bottom));width:min(640px,calc(100vw - 20px));max-height:min(48vh,360px);gap:8px;padding:12px 12px 10px}
#hud .decorate header .sub{font-size:13px}
#hud .decorate .spot{display:flex;align-items:center;gap:8px;min-width:0}
#hud .decorate .spot .step{min-height:40px;min-width:44px;padding:4px 10px;font-size:20px;line-height:1}
#hud .decorate .pieces{display:flex;gap:8px;overflow-x:auto;flex:1;min-width:0;padding:2px;scroll-snap-type:x proximity;overscroll-behavior-x:contain}
#hud .decorate .pieces button{position:relative;flex:0 0 auto;width:92px;min-height:0;padding:6px 4px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:3px;background:rgba(246,241,227,.08);color:#F6F1E3;border:1px solid rgba(246,241,227,.18);box-shadow:none;font-size:12px;font-weight:600;line-height:1.2;scroll-snap-align:start}
#hud .decorate .pieces button[aria-pressed=true]{background:rgba(201,162,39,.28);border-color:#C9A227;box-shadow:inset 0 0 0 2px #C9A227}
#hud .decorate .pieces img{width:72px;height:60px;object-fit:contain;pointer-events:none}
#hud .decorate .pieces .at{position:absolute;top:4px;right:4px;min-width:20px;height:20px;border-radius:10px;background:#F6F1E3;color:#0C1E36;font:800 12px/20px system-ui,sans-serif;font-style:normal;text-align:center}
#hud .decorate .pieces button[aria-pressed=true] .at{background:#C9A227}
#hud .decorate .empty{flex:1;font-size:13px;opacity:.85;margin:0}
#hud .decorate .tools{display:flex;gap:8px;flex-wrap:wrap}
#hud .decorate .tools button{min-height:40px;padding:8px 14px;font-size:13px}
#hud .decorate .tools [data-open][aria-pressed=false]{background:rgba(246,241,227,.12);color:#F6F1E3;border:1px solid rgba(246,241,227,.25)}
#hud .decorate button:disabled{opacity:.55;cursor:default}
`;

/**
 * The Decorate sheet for the owner's own nest, along the bottom of the screen so the room stays in
 * view above it: which spot (step through them, or tap one in the room), the pieces the owner owns
 * that fit it, Take away, open or closed to visitors, and today's furniture gift.
 */
export function createDecorateSheet(root: HTMLElement, actions: DecorateActions, onOpen: () => void, onClose: () => void): DecorateSheet {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const panel = document.createElement('section');
  panel.className = 'sheet decorate';
  panel.setAttribute('aria-label', NEST_WORDS.decorate);
  panel.innerHTML = `
    <header><h2>${NEST_WORDS.decorate}</h2><span class="sub" data-where></span><button class="x" data-done>${NEST_WORDS.done}</button></header>
    <div class="spot">
      <button class="ghost step" data-step="-1" aria-label="Previous spot">‹</button>
      <div class="pieces" role="group" data-pieces></div>
      <button class="ghost step" data-step="1" aria-label="Next spot">›</button>
    </div>
    <div class="tools">
      <button class="ghost" data-take>${NEST_WORDS.takeAway}</button>
      <button data-open aria-pressed="true"></button>
      <button data-gift></button>
    </div>`;
  root.appendChild(panel);

  const $ = <T extends Element>(sel: string) => panel.querySelector(sel) as T;
  const where = $<HTMLElement>('[data-where]');
  const pieces = $<HTMLElement>('[data-pieces]');
  const take = $<HTMLButtonElement>('[data-take]');
  const openBtn = $<HTMLButtonElement>('[data-open]');
  const gift = $<HTMLButtonElement>('[data-gift]');
  let view: DecorateView = { layout: {}, owned: [], open: true, gift: null };
  let spot: NestSpotId = 'f1';
  let busy = false;

  const render = () => {
    const h = spotHeading(spot);
    where.textContent = `${h.n} / ${h.of} · ${h.where}`;
    pieces.setAttribute('aria-label', `Pieces for spot ${h.n}`);
    pieces.textContent = '';
    const choices = piecesFor(spot, view.owned, view.layout);
    if (!choices.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = NEST_WORDS.noPieces;
      pieces.appendChild(p);
    }
    for (const { piece, at } of choices) {
      const b = document.createElement('button');
      b.dataset['piece'] = piece.id;
      b.setAttribute('aria-pressed', String(at === spot));
      b.setAttribute('aria-label', at && at !== spot ? `${piece.name}, now in spot ${spotNumber(at)}` : piece.name);
      b.disabled = busy;
      const src = actions.thumb(piece.art);
      if (src) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = src;
        b.appendChild(img);
      }
      b.append(piece.name);
      if (at) {
        const badge = document.createElement('i');
        badge.className = 'at';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = String(spotNumber(at));
        b.appendChild(badge);
      }
      b.addEventListener('click', () => {
        if (at !== spot) void run(() => actions.place(spot, piece.id));
      });
      pieces.appendChild(b);
    }
    take.disabled = busy || !view.layout[spot];
    openBtn.textContent = view.open ? NEST_WORDS.openToVisitors : NEST_WORDS.closedToVisitors;
    openBtn.setAttribute('aria-pressed', String(view.open));
    openBtn.disabled = busy;
    const g = giftButton(view.gift);
    gift.hidden = g === null;
    if (g) {
      gift.textContent = g.label;
      gift.disabled = busy || !g.ready;
    }
  };

  /** One change at a time: the buttons wait until the nest has answered. */
  const run = async (change: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    render();
    try {
      await change();
    } finally {
      busy = false;
      render();
    }
  };

  const choose = (to: NestSpotId) => {
    spot = to;
    render();
    pieces.scrollLeft = 0;
    actions.select(spot);
  };
  for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-step]')) b.addEventListener('click', () => choose(stepSpot(spot, Number(b.dataset['step']))));
  take.addEventListener('click', () => void run(() => actions.place(spot, null)));
  openBtn.addEventListener('click', () => void run(() => actions.setOpen(!view.open)));
  gift.addEventListener('click', () => void run(() => actions.claimGift()));
  $<HTMLButtonElement>('[data-done]').addEventListener('click', () => actions.done());

  // The arrow keys step through the spots while the sheet is open (the owl stays put meanwhile).
  const onKey = (e: KeyboardEvent) => {
    if (!panel.classList.contains('open') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') actions.done();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      choose(stepSpot(spot, e.key === 'ArrowLeft' ? -1 : 1));
    }
  };
  window.addEventListener('keydown', onKey);

  const report = () => actions.resize(panel.classList.contains('open') ? Math.max(0, window.innerHeight - panel.getBoundingClientRect().top) : 0);
  const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(report) : null;
  watcher?.observe(panel);
  window.addEventListener('resize', report);

  const close = () => {
    if (!panel.classList.contains('open')) return;
    panel.classList.remove('open');
    actions.resize(0);
    onClose();
  };

  return {
    open(v, at) {
      view = v;
      spot = at;
      onOpen();
      panel.classList.add('open');
      render();
      report();
      actions.select(spot);
    },
    update(v) {
      view = v;
      if (panel.classList.contains('open')) render();
    },
    select(at) {
      if (at === spot) return;
      spot = at;
      render();
      pieces.scrollLeft = 0;
    },
    close,
    isOpen: () => panel.classList.contains('open'),
  };
}
