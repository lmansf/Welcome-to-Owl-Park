/**
 * The screens the Menu opens (the menu itself, quests, settings, the emote wheel, the owl builder)
 * share this: a layer over the park that dims it and takes its taps, with the screen in the middle
 * (a card; a sheet from the bottom on a phone) or over all of it. One is open at a time, the HUD sees
 * to that; Escape closes it (the keyboard module asks the HUD), and so does a tap on the dimmed park.
 */

export interface ModalOptions {
  /** A class for the layer and the box, for each screen's own styles. */
  name: string;
  /** What a screen reader calls it. */
  label: string;
  /** A card in the middle of the screen, or the whole screen. */
  layout: 'card' | 'full';
  /** On a narrow screen a card rises from the bottom as a sheet, unless this is false. */
  sheet?: boolean;
}

export interface Modal {
  /** The screen itself: its content goes in here. */
  readonly box: HTMLElement;
  /** Show it; `opener` gets the focus back when it closes. */
  open(opener?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  /** Called after it closes, whichever way. */
  onClose(cb: () => void): void;
}

const CSS = `
#hud .layer{position:fixed;inset:0;z-index:20;display:none;pointer-events:auto;align-items:center;justify-content:center}
#hud .layer.open{display:flex}
#hud .layer .scrim{position:absolute;inset:0;background:rgba(6,14,28,.58);animation:modal-fade .18s ease-out}
#hud .modal{position:relative;display:flex;flex-direction:column;gap:12px;width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;padding:16px;background:rgba(12,30,54,.97);border:1px solid rgba(246,241,227,.18);border-radius:22px;box-shadow:0 18px 60px rgba(0,0,0,.6);color:#F6F1E3;animation:modal-pop .2s ease-out;overscroll-behavior:contain}
#hud .layer.full .modal{width:100vw;height:100dvh;max-height:none;border-radius:0;border:0;padding:0;overflow:hidden;background:transparent;box-shadow:none;animation:modal-fade .18s ease-out}
#hud .modal > header{display:flex;align-items:center;gap:10px;min-height:44px}
#hud .modal > header h2{margin:0;font-size:19px;letter-spacing:.01em}
#hud .modal > header .sub{flex:1;font-size:13px;opacity:.8;min-width:0}
#hud .modal > header .sub:empty{display:none}
#hud .modal > header .grow{flex:1}
#hud .modal .back,#hud .modal .x{min-height:40px;padding:6px 14px}
#hud .modal .x{margin-left:auto}
#hud .modal :focus-visible{outline:3px solid #FFD36A;outline-offset:2px}
#hud .modal nav.tabs{display:flex;gap:6px;flex-wrap:wrap}
#hud .modal nav.tabs button{min-height:40px;padding:6px 14px;background:rgba(246,241,227,.08);color:#F6F1E3;border:1px solid rgba(246,241,227,.18);box-shadow:none}
#hud .modal nav.tabs button[aria-selected=true]{background:#C9A227;color:#0C1E36;border-color:#C9A227}
@keyframes modal-fade{from{opacity:0}to{opacity:1}}
@keyframes modal-pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@media (max-width:600px){
  #hud .layer.rise{align-items:flex-end}
  #hud .layer.rise .modal{width:100vw;max-height:88dvh;border-radius:22px 22px 0 0;padding:16px 14px max(16px,env(safe-area-inset-bottom));animation:modal-rise .22s ease-out}
}
@keyframes modal-rise{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){#hud .modal,#hud .layer .scrim{animation:none}}
`;

let styled = false;

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

export function createModal(root: HTMLElement, opts: ModalOptions): Modal {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const layer = document.createElement('div');
  layer.className = `layer ${opts.name}-layer${opts.layout === 'full' ? ' full' : opts.sheet === false ? '' : ' rise'}`;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const box = document.createElement('section');
  box.className = `modal ${opts.name}`;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', opts.label);
  layer.append(scrim, box);
  root.appendChild(layer);

  let back: HTMLElement | null = null;
  const closers: Array<() => void> = [];
  const close = () => {
    if (!layer.classList.contains('open')) return;
    layer.classList.remove('open');
    // The callbacks first: the owl builder uncovers the HUD, so the button that opened it can take the focus.
    for (const cb of closers) cb();
    if (back?.isConnected) back.focus({ preventScroll: true });
    back = null;
  };
  scrim.addEventListener('click', close);
  // Keep Tab inside the open screen.
  layer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  return {
    box,
    open(opener) {
      back = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      layer.classList.add('open');
      // The first control takes the focus, so the keyboard works in the screen at once.
      requestAnimationFrame(() => {
        if (!layer.classList.contains('open') || box.contains(document.activeElement)) return;
        box.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
      });
    },
    close,
    isOpen: () => layer.classList.contains('open'),
    onClose(cb) {
      closers.push(cb);
    },
  };
}

/** A screen's top line: back to the Menu (when it came from there), its title, a short status, Close. */
export function modalHeader(title: string, opts: { sub?: string; onBack?: (() => void) | null; onClose: () => void; closeLabel: string }): HTMLElement {
  const h = document.createElement('header');
  if (opts.onBack) {
    const b = document.createElement('button');
    b.className = 'ghost back';
    b.dataset['back'] = '';
    b.setAttribute('aria-label', 'Back to the menu');
    b.textContent = '‹ Menu';
    b.addEventListener('click', opts.onBack);
    h.appendChild(b);
  }
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.dataset['sub'] = '';
  sub.textContent = opts.sub ?? '';
  const x = document.createElement('button');
  x.className = 'ghost x';
  x.dataset['close'] = '';
  x.setAttribute('aria-label', opts.closeLabel);
  x.textContent = 'Close';
  x.addEventListener('click', opts.onClose);
  h.append(h2, sub, x);
  return h;
}
