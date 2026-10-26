import type { Vec2 } from '@owl-park/shared';

/**
 * The thumbstick on touch screens: a see-through stick in the bottom-right corner that walks the
 * owl while held, the way WASD does on a keyboard, so a thumb never has to tap the floor between the
 * buttons. It points one of eight ways, like the keys.
 */

const D = Math.SQRT1_2;
/** Right, down-right, down, down-left, left, up-left, up, up-right (screen y points down). */
export const STICK_WAYS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: D, y: D },
  { x: 0, y: 1 },
  { x: -D, y: D },
  { x: -1, y: 0 },
  { x: -D, y: -D },
  { x: 0, y: -1 },
  { x: D, y: -D },
];
/** The stick rests within this share of its radius. */
const DEAD_ZONE = 0.25;
/** A way is kept this far past the edge of its sector, so a thumb on a boundary does not flip between two. */
const HOLD_RAD = (10 * Math.PI) / 180;

/** The way (index into STICK_WAYS) for a knob pushed (dx, dy) on a stick of `radius`; `prev` is the way it points now. */
export function stickWay(dx: number, dy: number, radius: number, prev: number | null): number | null {
  if (Math.hypot(dx, dy) < radius * DEAD_ZONE) return null;
  const a = Math.atan2(dy, dx);
  if (prev !== null) {
    let off = Math.abs(a - (prev * Math.PI) / 4) % (2 * Math.PI);
    if (off > Math.PI) off = 2 * Math.PI - off;
    if (off <= Math.PI / 8 + HOLD_RAD) return prev;
  }
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}

export interface Joystick {
  /** Where the stick points: one of eight unit vectors, or null while it rests. */
  direction(): Vec2 | null;
  detach(): void;
}

const css = (prefix: string) => `
#hud .${prefix}-stick{position:absolute;right:0;bottom:0;width:128px;height:128px;border-radius:50%;display:none;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;background:rgba(12,30,54,.28);border:2px solid rgba(246,241,227,.32);box-shadow:inset 0 0 18px rgba(0,0,0,.25)}
#hud .${prefix}-stick i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(246,241,227,.4);border:2px solid rgba(246,241,227,.5);box-shadow:0 2px 8px rgba(0,0,0,.3);transition:transform .12s ease-out}
#hud .${prefix}-stick.on{background:rgba(12,30,54,.38);border-color:rgba(255,211,106,.55)}
#hud .${prefix}-stick.on i{transition:none;background:rgba(255,211,106,.5)}
@media (pointer:coarse){
  #hud .${prefix}-stick{display:block}
}
`;
/** The HUD's own stick sits in the bottom bar's corner and makes room for the buttons beside it. */
const HUD_CSS = `
@media (pointer:coarse){
  #hud .bottom .left{max-width:calc(100% - 140px)}
  #hud .bottom .actions{position:absolute;right:0;bottom:140px;flex-direction:column;align-items:flex-end}
}
`;

/**
 * Put a thumbstick in `parent` (it shows on touch screens only): the HUD's bottom bar, or the climb
 * screen's own corner. `prefix` scopes its class (`hud-stick`, `climb-stick`) so each screen styles its own.
 */
export function createJoystick(parent: HTMLElement, prefix = 'hud'): Joystick {
  const style = document.createElement('style');
  style.textContent = css(prefix) + (prefix === 'hud' ? HUD_CSS : '');
  document.head.appendChild(style);

  const stick = document.createElement('div');
  stick.className = `${prefix}-stick`;
  // Keyboards walk with WASD; the stick is for thumbs.
  stick.setAttribute('aria-hidden', 'true');
  const knob = document.createElement('i');
  stick.appendChild(knob);
  parent.appendChild(stick);

  let pointer: number | null = null;
  let way: number | null = null;

  const aim = (e: PointerEvent) => {
    const r = stick.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = e.clientX - (r.left + radius);
    let dy = e.clientY - (r.top + radius);
    const reach = radius - 16;
    const len = Math.hypot(dx, dy);
    if (len > reach) {
      dx *= reach / len;
      dy *= reach / len;
    }
    knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    way = stickWay(dx, dy, radius, way);
  };
  const rest = () => {
    pointer = null;
    way = null;
    knob.style.transform = '';
    stick.classList.remove('on');
  };
  const onDown = (e: PointerEvent) => {
    if (pointer !== null) return;
    pointer = e.pointerId;
    try {
      stick.setPointerCapture(e.pointerId);
    } catch {
      /* the move and up events still arrive while the thumb stays on the stick */
    }
    stick.classList.add('on');
    aim(e);
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId === pointer) aim(e);
  };
  const onEnd = (e: PointerEvent) => {
    if (e.pointerId === pointer) rest();
  };
  const onHide = () => {
    if (document.visibilityState !== 'visible') rest();
  };
  stick.addEventListener('pointerdown', onDown);
  stick.addEventListener('pointermove', onMove);
  stick.addEventListener('pointerup', onEnd);
  stick.addEventListener('pointercancel', onEnd);
  stick.addEventListener('lostpointercapture', onEnd);
  window.addEventListener('blur', rest);
  document.addEventListener('visibilitychange', onHide);

  return {
    direction: () => (way === null ? null : STICK_WAYS[way]!),
    detach() {
      window.removeEventListener('blur', rest);
      document.removeEventListener('visibilitychange', onHide);
      stick.remove();
      style.remove();
    },
  };
}
