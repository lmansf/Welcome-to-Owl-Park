/**
 * The busy ribbon (OP-075): a thin banner across the top of the home screen and every room, with the
 * keepers' words (or the ribbon's own) while they have it on, and on its own while the park has a
 * line. An owl may hide it for the rest of its visit; new words bring it back.
 */

/** Every word the ribbon shows beside the keepers' (for the owner's approval). */
export const RIBBON_UI_WORDS = {
  /** The hide button's label, for screen readers (the button shows a cross). */
  hide: 'Hide this note',
} as const;

/** The words this tab hid, so the same note stays hidden for the visit. */
const HIDDEN_KEY = 'owl-park:ribbon-hidden';

export interface Ribbon {
  /** The ribbon's words now; null takes it away. */
  set(words: string | null): void;
  /** The words it shows (null while it is off or hidden). */
  shown(): string | null;
}

// In the HUD's flow right under the top bar, so what follows (the welcome card, the activity cards on a
// phone) moves down for it and a wrapped bar on a phone is never covered; over the home screen it is the
// first thing at the top. The 2 s notices at the top move below it while it shows (--ribbon-bottom). On
// a wide screen, where the activity cards stand at the top right, it keeps to the left of them.
const CSS = `
#hud .ribbon{position:relative;z-index:6;margin:8px auto 0;width:max-content;max-width:min(92vw,560px);display:flex;align-items:center;gap:8px;
  padding:5px 5px 5px 14px;border-radius:999px;background:rgba(255,211,106,.95);color:#0C1E36;font-size:14px;font-weight:700;line-height:1.3;
  box-shadow:0 3px 12px rgba(0,0,0,.35);pointer-events:auto;animation:hud-in .25s ease-out}
#hud .ribbon[hidden]{display:none}
#hud .ribbon span{overflow-wrap:anywhere}
#hud .ribbon button{flex:none;min-height:32px;width:32px;padding:0;border-radius:50%;background:rgba(12,30,54,.12);color:#0C1E36;box-shadow:none;font-size:18px;line-height:1}
@media (min-width:761px){#hud .ribbon{margin:8px 0 0;max-width:min(560px,calc(100vw - 452px))}}
#hud.at-home .ribbon{margin:0 auto;max-width:min(92vw,560px)}
#hud.covered .ribbon{visibility:hidden}
#hud.ribbon-on .notices{top:calc(var(--ribbon-bottom) + 6px)}
`;

function readHidden(): string | null {
  try {
    return sessionStorage.getItem(HIDDEN_KEY);
  } catch {
    return null;
  }
}

function saveHidden(words: string): void {
  try {
    sessionStorage.setItem(HIDDEN_KEY, words);
  } catch {
    /* hidden until this page closes */
  }
}

export function createRibbon(root: HTMLElement): Ribbon {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'ribbon';
  el.dataset['ribbon'] = '';
  el.setAttribute('role', 'status');
  el.hidden = true;
  const text = document.createElement('span');
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.textContent = '×';
  hide.setAttribute('aria-label', RIBBON_UI_WORDS.hide);
  el.append(text, hide);
  const bar = root.querySelector('.bar');
  if (bar) bar.after(el);
  else root.prepend(el);

  // Where the ribbon ends, for the notices to start below it: again whenever it or the bar changes size
  // (the bar comes and goes with the home screen, and wraps on a narrow phone), and once it has slid in.
  const place = () => {
    root.classList.toggle('ribbon-on', !el.hidden);
    if (!el.hidden) root.style.setProperty('--ribbon-bottom', `${Math.round(el.getBoundingClientRect().bottom)}px`);
  };
  const watch = new ResizeObserver(place);
  watch.observe(el);
  if (bar) watch.observe(bar);
  window.addEventListener('resize', place);
  el.addEventListener('animationend', place);

  let words: string | null = null;
  let hidden = readHidden();
  const draw = () => {
    const show = words !== null && words !== hidden;
    text.textContent = show ? words : '';
    el.hidden = !show;
    place();
  };
  hide.addEventListener('click', () => {
    if (words === null) return;
    hidden = words;
    saveHidden(words);
    draw();
  });
  return {
    set(next) {
      words = next && next.trim() ? next : null;
      draw();
    },
    shown: () => (el.hidden ? null : words),
  };
}
