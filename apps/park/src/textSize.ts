/**
 * Text size (OP-386, Dec 1 plan D8): the HUD, the Menu and every panel drawn 100, 150 or 200% as large,
 * from Settings. It takes the place of pinch zoom, which stays off (OP-104: a page zoomed over a panel
 * could not be zoomed back out once the panel closed, and OP-104 named a text-size setting as the way).
 *
 * How: the HUD (#hud) is drawn with CSS zoom, so every screen lays itself out again at the larger size,
 * wrapping its words rather than spilling off the screen. Its styles size things by the screen
 * (`100vw`, `70dvh`) as `calc(100vw/var(--vz,1))`: where a browser zooms those too, `--vz` is the zoom,
 * so a panel still fits the screen; where it does not, `--vz` stays 1. The thumbstick, the controller
 * pad and the doorway hints keep their own size: they sit at points of the park or
 * under a thumb, and the gameplay's touch handling is as it was.
 */
import { TEXT_SIZES, type TextSize } from './settings';

export const TEXT_WORDS = {
  title: 'Text size',
  note: 'Menus, panels and buttons larger. Pinch zoom stays off.',
  size: (n: TextSize) => `${n}%`,
} as const;

/** What keeps its own size while the rest of the HUD is larger. */
export const TEXT_KEEPS = ['.stick', '.controller-pad', '.hints'] as const;

export const TEXT_CSS = `
${TEXT_KEEPS.map((s) => `#hud ${s}`).join(',')}{zoom:var(--unzoom,1)}
`;

/** The zoom for a text size. */
export function textZoom(size: TextSize): number {
  return size / 100;
}

/**
 * How much this browser grows a length of `100vw` inside an element zoomed `zoom`: `zoom` where it
 * zooms screen units too, 1 where it does not. `measured` is that length's drawn width, `screen` the
 * window's. Anything in between (a scrollbar, rounding) counts as the nearer of the two.
 */
export function viewportZoom(measured: number, screen: number, zoom: number): number {
  if (!(screen > 0) || !(measured > 0) || zoom === 1) return 1;
  const k = measured / screen;
  return Math.abs(k - zoom) < Math.abs(k - 1) ? zoom : 1;
}

let styled = false;

/** Draws the HUD at the text size set, now and whenever it changes. Returns a function that stops. */
export function keepHudText(hud: HTMLElement, size: () => TextSize, onChange: (cb: () => void) => () => void): () => void {
  if (!styled) {
    const st = document.createElement('style');
    st.textContent = TEXT_CSS;
    document.head.appendChild(st);
    styled = true;
  }
  let shown: TextSize | null = null;
  const apply = () => {
    const s = size();
    if (s === shown) return;
    shown = s;
    const z = textZoom(s);
    hud.style.setProperty('zoom', z === 1 ? '' : String(z));
    hud.style.setProperty('--unzoom', String(1 / z));
    hud.style.setProperty('--vz', '1');
    if (z !== 1) {
      // Does this browser zoom screen units too? A probe the width of the screen says.
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:0;top:0;width:100vw;height:1px;visibility:hidden;pointer-events:none';
      hud.appendChild(probe);
      hud.style.setProperty('--vz', String(viewportZoom(probe.getBoundingClientRect().width, window.innerWidth, z)));
      probe.remove();
    }
    hud.dataset['text'] = String(s);
  };
  apply();
  return onChange(apply);
}

export { TEXT_SIZES };
