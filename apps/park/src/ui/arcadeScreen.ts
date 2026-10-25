import { FIELD_H, FIELD_W } from '../arcade/field';
import type { PreviewRect } from '../game/BuilderScene';
import { createModal, modalHeader } from './modal';

/** A game as its screen shows it: its name and colour, how to play, and the owl's best today. */
export interface ArcadeView {
  game: 'crossing' | 'flight' | 'sling';
  name: string;
  /** CSS colour of the game's neon. */
  colour: string;
  hint: string;
  /** Today's best on the wall (null: no score yet today), and the owl's own. */
  top: number | null;
  best: number | null;
}

/** A run over: its line, and what it paid when the room took it. */
export interface ArcadeResultView {
  line: string;
  /** Feathers paid (null when the room did not take the run). */
  feathers: number | null;
  /** The run beat the owl's own best today. */
  newBest: boolean;
  best: number | null;
  /** Something more to say: the day's feathers from games used up, or the room not answering. */
  note?: string;
}

/** What the player does on the field, in field pixels where it matters. */
export type ArcadeInput = { kind: 'tap' } | { kind: 'aim'; dx: number; dy: number } | { kind: 'release' } | { kind: 'nudge'; angle: number; power: number };

export interface ArcadeHandlers {
  input(i: ArcadeInput): void;
  /** Where the field goes on the screen (CSS pixels); null when the screen closes. */
  frame(rect: PreviewRect | null): void;
  /** Play again, at the same cabinet. */
  again(): void;
}

export interface ArcadeScreen {
  open(view: ArcadeView, handlers: ArcadeHandlers): void;
  /** The score and the line of the moment ("Cleared in 2 shots!"), as the run goes. */
  playing(score: number, banner: string): void;
  result(r: ArcadeResultView): void;
  close(): void;
  isOpen(): boolean;
  onClose(cb: () => void): void;
}

const CSS = `
#hud .arcade-layer .scrim{background:transparent}
#hud .arcade{display:flex;flex-direction:column;--neon:#00E5FF}
#hud .arcade > header{padding:max(8px,env(safe-area-inset-top)) 12px 0}
#hud .arcade > header h2{color:var(--neon);text-shadow:0 0 12px var(--neon)}
#hud .arcade .a-stage{position:relative;flex:1;min-height:0;touch-action:none;cursor:pointer}
#hud .arcade .a-stage:focus,#hud .arcade .a-stage:focus-visible{outline:none}
#hud .arcade .a-score{position:absolute;top:8px;left:50%;transform:translateX(-50%);font-size:40px;font-weight:800;color:#F6F1E3;text-shadow:0 0 14px var(--neon);pointer-events:none}
#hud .arcade .a-banner,#hud .arcade .a-hint{position:absolute;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(5,6,13,.7);border:1px solid var(--neon);white-space:nowrap;pointer-events:none;font-weight:700}
#hud .arcade .a-banner{top:64px;color:var(--neon)}
#hud .arcade .a-hint{bottom:14px;opacity:.9}
#hud .arcade .a-banner:empty,#hud .arcade .a-hint:empty{display:none}
#hud .arcade .a-result{position:absolute;left:12px;right:12px;top:38%;margin:0 auto;max-width:420px;display:none;flex-direction:column;gap:8px;align-items:center;padding:16px;border-radius:20px;background:rgba(12,30,54,.95);border:1px solid var(--neon);box-shadow:0 0 30px rgba(0,0,0,.6)}
#hud .arcade.over .a-result{display:flex}
#hud .arcade.over .a-hint{display:none}
#hud .arcade .a-line{font-size:20px;font-weight:800;text-align:center}
#hud .arcade .a-new{color:var(--neon);font-weight:800;text-shadow:0 0 10px var(--neon)}
#hud .arcade .a-new:empty,#hud .arcade .a-note:empty{display:none}
#hud .arcade .a-note{font-size:13px;opacity:.85;text-align:center}
#hud .arcade .a-buttons{display:flex;gap:10px}
#hud .arcade .a-buttons button{min-height:44px;padding:8px 22px}
`;

let styled = false;

/**
 * The arcade's game screen (C40): the whole screen over the room, the field drawn by the game itself
 * (game/ArcadeScene.ts) in the middle. It shows the game's name, the score as the run goes and how to
 * play, takes the taps, the pull and the keys, and when the run is over says how it ended and what
 * it paid, with Play to go again.
 */
export function createArcadeScreen(root: HTMLElement): ArcadeScreen {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const modal = createModal(root, { name: 'arcade', label: 'Arcade game', layout: 'full' });
  const box = modal.box;
  box.innerHTML = `
    <div class="a-stage" data-stage>
      <div class="a-score" data-score aria-label="Score" aria-live="off"></div>
      <div class="a-banner" data-banner aria-live="polite"></div>
      <div class="a-hint" data-hint></div>
      <div class="a-result" data-result aria-live="polite">
        <div class="a-line" data-line></div>
        <div data-paid></div>
        <div class="a-new" data-new></div>
        <div data-best></div>
        <div class="a-note" data-note></div>
        <div class="a-buttons"><button data-again>Play</button><button class="ghost" data-done>Close</button></div>
      </div>
    </div>`;
  const $ = <T extends Element>(sel: string) => box.querySelector(sel) as T;
  const stage = $<HTMLElement>('[data-stage]');
  const scoreEl = $<HTMLElement>('[data-score]');
  const bannerEl = $<HTMLElement>('[data-banner]');
  const hintEl = $<HTMLElement>('[data-hint]');
  let view: ArcadeView | null = null;
  let handlers: ArcadeHandlers | null = null;
  let drag: { x: number; y: number } | null = null;
  let shown = { score: -1, banner: '' };
  $<HTMLButtonElement>('[data-again]').addEventListener('click', () => handlers?.again());
  $<HTMLButtonElement>('[data-done]').addEventListener('click', () => modal.close());

  /** The stage's rectangle, and the field fitted in its middle. */
  const fit = () => {
    const r = stage.getBoundingClientRect();
    const k = Math.min(r.width / FIELD_W, r.height / FIELD_H);
    return { r, k, x0: r.left + (r.width - FIELD_W * k) / 2, y0: r.top + (r.height - FIELD_H * k) / 2 };
  };
  const frame = () => {
    if (!modal.isOpen()) return;
    const r = stage.getBoundingClientRect();
    handlers?.frame({ x: r.left, y: r.top, w: r.width, h: r.height });
  };
  const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(frame) : null;
  watcher?.observe(stage);
  window.addEventListener('resize', frame);
  modal.onClose(() => {
    handlers?.frame(null);
    handlers = null;
    view = null;
  });

  const over = () => box.classList.contains('over');
  stage.addEventListener('pointerdown', (e) => {
    if (!view || over() || (e.target as Element).closest('button')) return;
    e.preventDefault();
    if (view.game !== 'sling') return handlers?.input({ kind: 'tap' });
    const f = fit();
    drag = { x: (e.clientX - f.x0) / f.k, y: (e.clientY - f.y0) / f.k };
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const f = fit();
    handlers?.input({ kind: 'aim', dx: (e.clientX - f.x0) / f.k - drag.x, dy: (e.clientY - f.y0) / f.k - drag.y });
  });
  const letGo = () => {
    if (!drag) return;
    drag = null;
    handlers?.input({ kind: 'release' });
  };
  stage.addEventListener('pointerup', letGo);
  stage.addEventListener('pointercancel', () => (drag = null));
  // The keys: a hop or a flap; for the slingshot, aim higher or lower, more or less power, and let go.
  box.addEventListener('keydown', (e) => {
    if (!view || over() || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as Element).closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key.toLowerCase();
    let input: ArcadeInput | null = null;
    if (view.game === 'sling') {
      if (k === 'arrowup' || k === 'w') input = { kind: 'nudge', angle: 2, power: 0 };
      else if (k === 'arrowdown' || k === 's') input = { kind: 'nudge', angle: -2, power: 0 };
      else if (k === 'arrowright' || k === 'd') input = { kind: 'nudge', angle: 0, power: 0.04 };
      else if (k === 'arrowleft' || k === 'a') input = { kind: 'nudge', angle: 0, power: -0.04 };
      else if (k === ' ' || k === 'enter') input = { kind: 'release' };
    } else if (k === ' ' || k === 'arrowup' || k === 'w' || k === 'enter') input = { kind: 'tap' };
    if (!input) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat || input.kind === 'nudge') handlers?.input(input);
  });

  return {
    open(v, h) {
      view = v;
      handlers = h;
      drag = null;
      shown = { score: -1, banner: '' };
      box.classList.remove('over');
      box.style.setProperty('--neon', v.colour);
      box.querySelector(':scope > header')?.remove();
      const sub = [v.top !== null ? `Today's best ${v.top}` : '', v.best !== null ? `Your best ${v.best}` : ''].filter(Boolean).join(' · ');
      box.prepend(modalHeader(v.name, { sub, onClose: () => modal.close(), closeLabel: `Close ${v.name}` }));
      hintEl.textContent = v.hint;
      bannerEl.textContent = '';
      scoreEl.textContent = '0';
      if (!modal.isOpen()) modal.open();
      // The field takes the keys: the stage holds the focus while the run goes.
      stage.tabIndex = -1;
      requestAnimationFrame(() => stage.focus({ preventScroll: true }));
      frame();
    },
    playing(score, banner) {
      if (score !== shown.score) {
        scoreEl.textContent = String(score);
        // The first point means the owl knows how to play: the hint has done its job.
        if (score > 0) hintEl.textContent = '';
      }
      if (banner !== shown.banner) bannerEl.textContent = banner;
      shown = { score, banner };
    },
    result(r) {
      $<HTMLElement>('[data-line]').textContent = r.line;
      $<HTMLElement>('[data-paid]').textContent = r.feathers === null ? '' : r.feathers > 0 ? `+${r.feathers} feather${r.feathers === 1 ? '' : 's'}` : '';
      $<HTMLElement>('[data-new]').textContent = r.newBest ? 'New best!' : '';
      $<HTMLElement>('[data-best]').textContent = r.best !== null ? `Your best ${r.best}` : '';
      $<HTMLElement>('[data-note]').textContent = r.note ?? '';
      bannerEl.textContent = '';
      box.classList.add('over');
      requestAnimationFrame(() => $<HTMLButtonElement>('[data-again]').focus({ preventScroll: true }));
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
    onClose: (cb) => modal.onClose(cb),
  };
}
