import { colourwaysFor, parseVariant, type ItemDef } from '@owl-park/shared';
import { multiplyTint } from '../collect/pixels';
import { iconArt, itemCanvas } from '../game/itemArt';
import { symbolCanvas, type SymbolName } from '../game/symbols';

/** Icons for collectibles in the HUD: the owl builder, the emote wheel and the feather shop. */

const FX_SYMBOL: Record<string, SymbolName> = {
  aura: 'dot',
  sparkle: 'star4',
  'eye-flames': 'flame',
  'ember-trail': 'flame',
  'frost-breath': 'puff',
  snowfall: 'flake',
  fireflies: 'dot',
  hearts: 'heart',
  'music-notes': 'note',
  'star-halo': 'star5',
  'moon-halo': 'crescent',
  'leaf-swirl': 'leaf',
  'petal-swirl': 'petal',
  bubbles: 'bubble',
  'smoke-wisps': 'puff',
  'rainbow-trail': 'star4',
  lightning: 'bolt',
  'neon-outline': 'ring',
  'shadow-aura': 'puff',
  sunbeam: 'spark',
  confetti: 'square',
  'comet-tail': 'star4',
  'rune-ring': 'diamond',
  glitch: 'square',
};
const EMOTE_SYMBOL: Record<string, SymbolName> = {
  hoot: 'ring',
  flap: 'leaf',
  heart: 'heart',
  dance: 'note',
  sleep: 'bubble',
  surprise: 'bang',
  shiver: 'flake',
  sneeze: 'puff',
  stomp: 'puff',
  twirl: 'star4',
  flip: 'star5',
  wink: 'star4',
};

/** An icon for any variant, drawn on a canvas (async for item art). */
export function variantIcon(variant: string, w = 64, h = 48): HTMLCanvasElement {
  const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  const v = parseVariant(variant);
  if (!ctx || !v) return canvas;
  const glow = (tint: string, s: number) => {
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, s * 0.6);
    g.addColorStop(0, `${tint}cc`);
    g.addColorStop(1, `${tint}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
  const symbol = (name: SymbolName, tint: string, withGlow: boolean) => {
    const s = Math.min(canvas.width, canvas.height) * 0.8;
    if (withGlow) glow(tint, s);
    // Tint the white symbol: draw it, then colour it in with source-atop.
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = Math.round(s);
    const t = tmp.getContext('2d');
    if (!t) return;
    t.drawImage(symbolCanvas(name), 0, 0, tmp.width, tmp.height);
    t.globalCompositeOperation = 'source-atop';
    t.fillStyle = tint;
    t.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(tmp, (canvas.width - s) / 2, (canvas.height - s) / 2);
  };
  // A painted icon replaces the symbol once it loads: white art multiplied by the tint keeps its shading.
  const painted = (art: HTMLImageElement, tint: string, withGlow: boolean) => {
    const s = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) * 0.9));
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = s;
    const t = tmp.getContext('2d', { willReadFrequently: true });
    if (!t) return;
    t.drawImage(art, 0, 0, s, s);
    const px = t.getImageData(0, 0, s, s);
    multiplyTint(px.data, tint);
    t.putImageData(px, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (withGlow) glow(tint, s * 0.9);
    ctx.drawImage(tmp, (canvas.width - s) / 2, (canvas.height - s) / 2);
  };
  if (v.item.kind === 'fx' || v.item.kind === 'emote') {
    const isFx = v.item.kind === 'fx';
    const tint = isFx ? (v.colour?.tint ?? '#C9A227') : '#4FA3FF';
    symbol((isFx ? FX_SYMBOL : EMOTE_SYMBOL)[v.item.id] ?? 'star4', tint, isFx);
    void iconArt(v.item.id, dpr).then((art) => {
      if (art) painted(art, tint, isFx);
    });
  } else {
    void itemCanvas(variant, dpr).then((art) => {
      const k = Math.min(canvas.width / art.width, canvas.height / art.height);
      const dw = art.width * k;
      const dh = art.height * k;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(art, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    });
  }
  return canvas;
}

/** The dot colour hinting at a colourway (effects show their tint; art shows a hue). */
export function dotColour(item: ItemDef, n: number): string {
  const c = colourwaysFor(item.kind)[n];
  if (!c) return '#F6F1E3';
  if (c.tint) return c.tint;
  return n === 0 ? '#F6F1E3' : `hsl(${(45 + (c.hue ?? 0)) % 360} 70% 62%)`;
}
