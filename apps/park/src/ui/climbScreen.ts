import { BAND_COUNT, BAND_NAMES, type ClimbInput, type ClimbTier } from '@owl-park/shared';
import type { PreviewRect } from '../game/BuilderScene';
import { createJoystick, type Joystick } from './joystick';
import { createModal } from './modal';

/**
 * The climb screen (designs/the-stained-glass-climb.md): the whole screen over the room while a
 * climb is played, the field drawn by game/ClimbScene.ts in the middle. It owns its controls: a
 * stick on the left and a jump button on the right for thumbs, the arrow keys (or A and D) and
 * the space bar for a keyboard, all read as a held state each frame. Its header, hints and cards
 * are its own elements: the HUD's `covered` state hides the HUD's.
 */

/** The run as the screen shows it when it opens. */
export interface ClimbView {
  tier: ClimbTier;
  /** The run's night key (the header names a special night). */
  night: string;
  banked: number;
  remainingCap: number;
  cap: number;
  bestBandToday: number;
  resumed: boolean;
  previousForgotten: boolean;
}

/** A band reached and answered: what it paid, or why not. */
export interface ClimbBandView {
  band: number;
  added: number;
  why?: 'capped' | 'paid-today' | 'item-already-given';
}

/** The run over: at the clouds, or lost to the room. */
export interface ClimbResultView {
  line: string;
  /** Feathers this run added (null when the room never took it). */
  feathers: number | null;
  /** The item line (the first ascent's gift, or that it was given before). */
  item?: string;
  /** The run reference a visitor can quote (absent when there is none). */
  ref?: string;
  note?: string;
}

export interface ClimbHandlers {
  /** Where the field goes on the screen (CSS pixels); null when the screen closes. */
  frame(rect: PreviewRect | null): void;
  /** Start (or carry on with) the climb from its card. */
  start(): void;
}

/** The touch targets are at least this wide (CSS pixels). */
export const PAD_TARGET_PX = 44;

export interface ClimbScreen {
  open(view: ClimbView, handlers: ClimbHandlers): void;
  /** The held state of the stick, the button and the keys right now; `jumpPressed` is reported once per press. */
  input(): ClimbInput;
  /** The header as the run goes: the banked band and the feathers from games left today. */
  header(banked: number, remainingCap: number): void;
  /** A band reached and answered. */
  band(b: ClimbBandView): void;
  /** Teach one verb at a time; an empty line clears it. */
  hint(line: string): void;
  result(r: ClimbResultView): void;
  close(): void;
  isOpen(): boolean;
  onClose(cb: () => void): void;
}

const TIER_NAMES: Readonly<Record<ClimbTier, string>> = { easy: 'A gentle night', medium: 'A brisk night', hard: 'A wild night' };

const CSS = `
#hud .climb-layer .scrim{background:transparent}
#hud .climb{display:flex;flex-direction:column;--glass:#9FD0FF}
#hud .climb .c-stage{position:relative;flex:1;min-height:0;touch-action:none;user-select:none;-webkit-user-select:none}
#hud .climb .c-stage:focus,#hud .climb .c-stage:focus-visible{outline:none}
#hud .climb .c-head{position:absolute;top:max(8px,env(safe-area-inset-top));left:12px;right:12px;display:flex;align-items:center;gap:8px;pointer-events:none}
#hud .climb .c-head h2{margin:0;font-size:18px;color:var(--glass);text-shadow:0 0 12px var(--glass)}
#hud .climb .c-head .c-sub{flex:1;font-size:13px;opacity:.9;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#hud .climb .c-head button{pointer-events:auto;min-height:40px;padding:6px 14px}
#hud .climb .c-band,#hud .climb .c-hint{position:absolute;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(5,6,13,.7);border:1px solid var(--glass);white-space:nowrap;pointer-events:none;font-weight:700}
#hud .climb .c-band{top:64px;color:var(--glass)}
#hud .climb .c-hint{bottom:max(14px,env(safe-area-inset-bottom));opacity:.9}
#hud .climb .c-band:empty,#hud .climb .c-hint:empty{display:none}
#hud .climb .c-stick{position:absolute;left:max(12px,env(safe-area-inset-left));bottom:max(56px,calc(env(safe-area-inset-bottom) + 44px));width:128px;height:128px;display:none}
#hud .climb .c-jump{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(72px,calc(env(safe-area-inset-bottom) + 60px));width:84px;height:84px;min-height:${PAD_TARGET_PX}px;min-width:${PAD_TARGET_PX}px;padding:0;border-radius:50%;display:none;align-items:center;justify-content:center;color:#F6F1E3;background:rgba(12,30,54,.32);border:2px solid var(--glass);box-shadow:inset 0 0 18px rgba(0,0,0,.25),0 0 12px rgba(159,208,255,.35);touch-action:none;-webkit-tap-highlight-color:transparent;font-weight:800}
#hud .climb .c-jump.on{background:rgba(159,208,255,.35)}
@media (pointer:coarse){#hud .climb.playing .c-stick,#hud .climb.playing .c-jump{display:flex}}
#hud .climb .c-card{position:absolute;left:12px;right:12px;top:30%;margin:0 auto;max-width:420px;display:none;flex-direction:column;gap:8px;align-items:center;padding:16px;border-radius:20px;background:rgba(12,30,54,.95);border:1px solid var(--glass);box-shadow:0 0 30px rgba(0,0,0,.6);text-align:center}
#hud .climb .c-card.show{display:flex}
#hud .climb .c-line{font-size:20px;font-weight:800}
#hud .climb .c-item{color:var(--glass);font-weight:800;text-shadow:0 0 10px var(--glass)}
#hud .climb .c-ref{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;opacity:.85}
#hud .climb .c-note{font-size:13px;opacity:.85}
#hud .climb .c-card div:empty{display:none}
#hud .climb .c-buttons{display:flex;gap:10px}
#hud .climb .c-buttons button{min-height:44px;padding:8px 22px}
`;

let styled = false;

const feathers = (n: number) => `${n} feather${n === 1 ? '' : 's'}`;

/** The header's second line: the storey the run stands on and the feathers from games left today. */
export function climbSubline(banked: number, remainingCap: number, cap: number): string {
  const storey = banked >= BAND_COUNT ? 'At the clouds' : banked > 0 ? `${BAND_NAMES[banked - 1]} banked` : 'At the foot';
  return `${storey} · ${remainingCap} of ${cap} feathers left from games today`;
}

/** The line for a band reached, as the screen shows it over the field for a moment. */
export function bandLineFor(b: ClimbBandView): string {
  const name = BAND_NAMES[b.band - 1] ?? `Storey ${b.band}`;
  if (b.added > 0) return `${name}: +${feathers(b.added)}`;
  if (b.why === 'paid-today') return `${name}: paid today already`;
  if (b.why === 'capped') return `${name}: no more feathers from games today`;
  return `${name}`;
}

export function createClimbScreen(root: HTMLElement): ClimbScreen {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const modal = createModal(root, { name: 'climb', label: 'The climb', layout: 'full' });
  const box = modal.box;
  box.innerHTML = `
    <div class="c-stage" data-stage>
      <div class="c-head">
        <h2 data-title>The climb</h2>
        <span class="c-sub" data-sub></span>
        <button class="ghost" data-stop aria-label="Stop climbing">Stop</button>
      </div>
      <div class="c-band" data-band aria-live="polite"></div>
      <div class="c-hint" data-hint></div>
      <div class="c-stick" data-stick></div>
      <button class="c-jump" data-jump aria-label="Jump">Jump</button>
      <div class="c-card" data-start>
        <div class="c-line" data-start-line></div>
        <div data-start-sub></div>
        <div class="c-note" data-start-note></div>
        <div class="c-buttons"><button data-go>Start</button><button class="ghost" data-start-close>Close</button></div>
      </div>
      <div class="c-card" data-result aria-live="polite">
        <div class="c-line" data-line></div>
        <div data-paid></div>
        <div class="c-item" data-item></div>
        <div class="c-ref" data-ref></div>
        <div class="c-note" data-note></div>
        <div class="c-buttons"><button data-done>Close</button></div>
      </div>
    </div>`;
  const $ = <T extends Element>(sel: string) => box.querySelector(sel) as T;
  const stage = $<HTMLElement>('[data-stage]');
  const subEl = $<HTMLElement>('[data-sub]');
  const bandEl = $<HTMLElement>('[data-band]');
  const hintEl = $<HTMLElement>('[data-hint]');
  const jumpBtn = $<HTMLButtonElement>('[data-jump]');
  const startCard = $<HTMLElement>('[data-start]');
  const resultCard = $<HTMLElement>('[data-result]');
  let view: ClimbView | null = null;
  let handlers: ClimbHandlers | null = null;
  let stick: Joystick | null = null;
  let bandTimer: ReturnType<typeof setTimeout> | null = null;
  // The held state: the keys by their place, the jump button's pointer, and a press not yet reported.
  const held = new Set<string>();
  let jumpPointer: number | null = null;
  let pressed = false;
  let playing = false;

  const press = () => {
    pressed = true;
  };
  const release = () => {
    held.clear();
    jumpPointer = null;
    jumpBtn.classList.remove('on');
  };
  const onHide = () => {
    if (document.visibilityState !== 'visible') release();
  };
  // The keys, taken ahead of the park's own listeners while the screen is up (the room is blocked anyway).
  const onKeyDown = (e: KeyboardEvent) => {
    if (!modal.isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
      if ((e.target as Element | null)?.closest?.('button')) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !held.has('jump')) press();
      held.add('jump');
    } else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
      e.preventDefault();
      e.stopPropagation();
      held.add(code);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!modal.isOpen()) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') held.delete('jump');
    else held.delete(e.code);
    if (e.key === 'Meta') held.clear();
  };
  const onBlur = () => release();
  const listen = () => {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onHide);
  };
  const unlisten = () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onHide);
  };

  jumpBtn.addEventListener('pointerdown', (e) => {
    if (jumpPointer !== null) return;
    jumpPointer = e.pointerId;
    try {
      jumpBtn.setPointerCapture(e.pointerId);
    } catch {
      /* the up event still arrives while the thumb stays on the button */
    }
    jumpBtn.classList.add('on');
    press();
    e.preventDefault();
  });
  const jumpUp = (e: PointerEvent) => {
    if (e.pointerId !== jumpPointer) return;
    jumpPointer = null;
    jumpBtn.classList.remove('on');
  };
  jumpBtn.addEventListener('pointerup', jumpUp);
  jumpBtn.addEventListener('pointercancel', jumpUp);
  jumpBtn.addEventListener('lostpointercapture', jumpUp);
  // A tap anywhere else on the field jumps too (a phone held in one hand).
  stage.addEventListener('pointerdown', (e) => {
    if (!playing || (e.target as Element).closest('button, .c-stick, .c-card')) return;
    e.preventDefault();
    press();
  });
  $<HTMLButtonElement>('[data-stop]').addEventListener('click', () => modal.close());
  $<HTMLButtonElement>('[data-start-close]').addEventListener('click', () => modal.close());
  $<HTMLButtonElement>('[data-done]').addEventListener('click', () => modal.close());
  $<HTMLButtonElement>('[data-go]').addEventListener('click', () => {
    startCard.classList.remove('show');
    playing = true;
    box.classList.add('playing');
    handlers?.start();
    requestAnimationFrame(() => stage.focus({ preventScroll: true }));
  });

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
    playing = false;
    box.classList.remove('playing');
    release();
    unlisten();
    stick?.detach();
    stick = null;
    if (bandTimer) clearTimeout(bandTimer);
    bandTimer = null;
  });

  return {
    open(v, h) {
      view = v;
      handlers = h;
      release();
      pressed = false;
      playing = false;
      box.classList.remove('playing');
      resultCard.classList.remove('show');
      bandEl.textContent = '';
      hintEl.textContent = '';
      $<HTMLElement>('[data-title]').textContent = v.night === v.tier ? 'The climb' : `The climb · ${v.night}`;
      subEl.textContent = climbSubline(v.banked, v.remainingCap, v.cap);
      $<HTMLElement>('[data-start-line]').textContent = v.resumed ? 'Your climb is where you left it.' : TIER_NAMES[v.tier];
      const best = v.bestBandToday > 0 ? `Highest today: ${BAND_NAMES[v.bestBandToday - 1]}.` : '';
      $<HTMLElement>('[data-start-sub]').textContent = v.resumed ? `${BAND_NAMES[v.banked - 1] ?? 'The foot'} banked. ${best}`.trim() : `Six storeys to the clouds. ${best}`.trim();
      $<HTMLElement>('[data-start-note]').textContent = v.previousForgotten ? 'Your last climb was left too long and is forgotten; this is a fresh one.' : v.remainingCap <= 0 ? 'No more feathers from games today: this climb is for the view.' : '';
      $<HTMLButtonElement>('[data-go]').textContent = v.resumed ? 'Carry on' : 'Start';
      startCard.classList.add('show');
      stick ??= createJoystick($<HTMLElement>('[data-stick]'), 'climb');
      listen();
      if (!modal.isOpen()) modal.open();
      stage.tabIndex = -1;
      requestAnimationFrame(() => $<HTMLButtonElement>('[data-go]').focus({ preventScroll: true }));
      frame();
    },
    input() {
      const dir = stick?.direction() ?? null;
      const left = held.has('ArrowLeft') || held.has('KeyA') || (dir !== null && dir.x < -0.5);
      const right = held.has('ArrowRight') || held.has('KeyD') || (dir !== null && dir.x > 0.5);
      const jumpHeld = held.has('jump') || jumpPointer !== null;
      const jumpPressed = pressed;
      pressed = false;
      return { left, right, jumpPressed, jumpHeld };
    },
    header(banked, remainingCap) {
      if (view) subEl.textContent = climbSubline(banked, remainingCap, view.cap);
    },
    band(b) {
      bandEl.textContent = bandLineFor(b);
      if (bandTimer) clearTimeout(bandTimer);
      bandTimer = setTimeout(() => {
        bandEl.textContent = '';
        bandTimer = null;
      }, 2600);
    },
    hint(line) {
      hintEl.textContent = line;
    },
    result(r) {
      $<HTMLElement>('[data-line]').textContent = r.line;
      $<HTMLElement>('[data-paid]').textContent = r.feathers === null ? '' : r.feathers > 0 ? `+${feathers(r.feathers)} this climb` : '';
      $<HTMLElement>('[data-item]').textContent = r.item ?? '';
      $<HTMLElement>('[data-ref]').textContent = r.ref ? `Climb ${r.ref}` : '';
      $<HTMLElement>('[data-note]').textContent = r.note ?? '';
      bandEl.textContent = '';
      hintEl.textContent = '';
      playing = false;
      box.classList.remove('playing');
      release();
      resultCard.classList.add('show');
      requestAnimationFrame(() => $<HTMLButtonElement>('[data-done]').focus({ preventScroll: true }));
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
    onClose: (cb) => modal.onClose(cb),
  };
}
