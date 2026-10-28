/**
 * Collectible art, drawn once per variant onto canvases that serve both the game (as Phaser
 * textures) and the HUD (as icons). Real art is `art/item-<id>` (svg, then 2x/1x webp or png,
 * like every other key, asked for only as the build ships it); until it exists every wearable and pet has a drawn placeholder, so the
 * whole mechanic works before the art pipeline delivers. Colourways rotate the hue of the art
 * (pixels.ts: by hand, because Safari's canvas has no `filter`).
 *
 * Canvas conventions (owl canvas units; the art pipeline fits real art the same way):
 *  - head 140 x 100: the hat's bottom-centre (100% down, 50% across) sits on the crown;
 *  - face 120 x 60: centred on the eye line, lenses about 52 apart;
 *  - neck 130 x 80: the band runs across the top fifth, centred on the top of the chest;
 *  - pet 90 x 90: feet on the bottom edge, centred, facing right.
 */
import { CATALOGUE, parseVariant, type ItemDef } from '@owl-park/shared';
import { rotateHue } from '../collect/pixels';
import { rasterCandidates } from './artFiles';
import { PUBLISHED_ART, versioned } from './publishedArt';

export type ItemSlot = 'head' | 'face' | 'neck' | 'pet';

export const ITEM_SIZES: Record<ItemSlot, { w: number; h: number }> = {
  head: { w: 140, h: 100 },
  face: { w: 120, h: 60 },
  neck: { w: 130, h: 80 },
  pet: { w: 90, h: 90 },
};

export function slotOfItem(item: ItemDef): ItemSlot | null {
  if (item.kind === 'pet') return 'pet';
  if (item.kind === 'wear' && item.slot) return item.slot;
  return null;
}

/** Every collectible art key with its logical size (separate from the ART table the art tools parse). */
export const ITEM_ART: Readonly<Record<string, { w: number; h: number; kind: 'item'; slot: ItemSlot }>> = Object.freeze(
  Object.fromEntries(
    CATALOGUE.flatMap((item) => {
      const slot = slotOfItem(item);
      return slot && item.art ? [[item.art, { ...ITEM_SIZES[slot], kind: 'item' as const, slot }]] : [];
    }),
  ),
);

function artBase(): string {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  const b = env?.BASE_URL ?? '/';
  return `${b.endsWith('/') ? b : `${b}/`}art/`;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const realArt = new Map<string, Promise<HTMLImageElement | null>>();

/** The shipped art for a key at a scale, if any (each key is fetched once per scale). */
function loadRealArt(key: string, scale: number): Promise<HTMLImageElement | null> {
  const id = `${key}@${scale}`;
  let p = realArt.get(id);
  if (!p) {
    p = (async () => {
      const base = artBase();
      for (const url of [...(PUBLISHED_ART.has(`${key}.svg`) ? [`${base}${versioned(`${key}.svg`)}`] : []), ...rasterCandidates(base, key, scale, PUBLISHED_ART)]) {
        const img = await loadImage(url);
        if (img) return img;
      }
      return null;
    })();
    realArt.set(id, p);
  }
  return p;
}

/**
 * The painted collection icon of an effect or emote (`art/icon-<id>`, white with grey shading so it
 * can be tinted), or null while none has shipped: callers keep their drawn symbol then.
 */
export function iconArt(id: string, scale = 1): Promise<HTMLImageElement | null> {
  return loadRealArt(`icon-${id}`, scale);
}

const canvases = new Map<string, Promise<HTMLCanvasElement>>();

/** A variant's art at `scale` texture pixels per logical pixel (cached). */
export function itemCanvas(variant: string, scale = 1): Promise<HTMLCanvasElement> {
  const id = `${variant}@${scale}`;
  let p = canvases.get(id);
  if (!p) {
    p = drawVariant(variant, scale);
    canvases.set(id, p);
  }
  return p;
}

async function drawVariant(variant: string, scale: number): Promise<HTMLCanvasElement> {
  const v = parseVariant(variant);
  const slot = v ? slotOfItem(v.item) : null;
  const size = slot ? ITEM_SIZES[slot] : { w: 64, h: 64 };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.w * scale));
  canvas.height = Math.max(1, Math.round(size.h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !v || !slot) return canvas;
  const real = v.item.art ? await loadRealArt(v.item.art, scale) : null;
  if (real) ctx.drawImage(real, 0, 0, canvas.width, canvas.height);
  else {
    ctx.save();
    ctx.scale(scale, scale);
    drawPlaceholder(ctx, v.item, size.w, size.h);
    ctx.restore();
  }
  const hue = v.colour?.hue ?? 0;
  if (hue) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    rotateHue(img.data, hue);
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

// ---------- placeholders ----------

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function fill(ctx: Ctx, colour: string, path: () => void): void {
  ctx.beginPath();
  path();
  ctx.fillStyle = colour;
  ctx.fill();
}
function stroke(ctx: Ctx, colour: string, width: number, path: () => void): void {
  ctx.beginPath();
  path();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
const ell = (ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => () => ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
const poly = (ctx: Ctx, pts: number[]) => () => {
  ctx.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.closePath();
};
const OUT = 'rgba(12,30,54,0.85)';

function star(ctx: Ctx, cx: number, cy: number, r: number, points = 5, inner = 0.45) {
  return () => {
    for (let i = 0; i < points * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      const rr = i % 2 ? r * inner : r;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
}
function heart(ctx: Ctx, cx: number, cy: number, s: number) {
  return () => {
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.3, cy + s * 0.1, cx - s * 0.9, cy - s * 0.9, cx, cy - s * 0.35);
    ctx.bezierCurveTo(cx + s * 0.9, cy - s * 0.9, cx + s * 1.3, cy + s * 0.1, cx, cy + s * 0.9);
    ctx.closePath();
  };
}
function dome(ctx: Ctx, cx: number, base: number, w: number, h: number) {
  return () => {
    ctx.moveTo(cx - w / 2, base);
    ctx.bezierCurveTo(cx - w / 2, base - h * 1.2, cx + w / 2, base - h * 1.2, cx + w / 2, base);
    ctx.closePath();
  };
}
function brim(ctx: Ctx, colour: string, cx: number, y: number, w: number, h = 9) {
  fill(ctx, colour, ell(ctx, cx, y, w / 2, h / 2));
}
function cone(ctx: Ctx, colour: string, cx: number, base: number, w: number, h: number, tipX = 0) {
  fill(ctx, colour, poly(ctx, [cx - w / 2, base, cx + tipX, base - h, cx + w / 2, base]));
}
function leafRing(ctx: Ctx, cx: number, cy: number, rx: number, colours: string[], n = 11, size = 11) {
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * rx * 0.35;
    fill(ctx, colours[i % colours.length]!, ell(ctx, x, y, size, size * 0.55, a + Math.PI / 2));
  }
}

const HEAD: Record<string, (ctx: Ctx) => void> = {
  // The climb's gift: a thin ring of leaded glass panes, worn like a halo that sits on the crown.
  'glass-circlet': (c) => {
    stroke(c, 'rgba(159,208,255,0.35)', 12, ell(c, 70, 70, 44, 14));
    stroke(c, '#9FD0FF', 4, ell(c, 70, 70, 44, 14));
    for (const [x, y, w, h, col] of [[32, 60, 14, 10, '#FF8AD0'], [58, 54, 16, 9, '#FFD36A'], [84, 56, 14, 9, '#7BE0C8'], [106, 64, 12, 10, '#CDB0FF']] as const) {
      fill(c, col, () => c.rect(x, y, w, h));
      stroke(c, '#2A3B63', 2, () => c.rect(x, y, w, h));
    }
  },
  'witch-hat': (c) => {
    cone(c, '#3B2A5A', 70, 88, 64, 82, 14);
    fill(c, '#C9A227', poly(c, [40, 86, 100, 86, 98, 76, 42, 76]));
    brim(c, '#2E2046', 70, 90, 128, 14);
  },
  'top-hat': (c) => {
    fill(c, '#222A3A', poly(c, [44, 88, 96, 88, 92, 18, 48, 18]));
    fill(c, '#B23A48', poly(c, [45, 80, 95, 80, 94.5, 70, 45.5, 70]));
    brim(c, '#1A2030', 70, 90, 110, 12);
  },
  'wizard-hat': (c) => {
    cone(c, '#2F4FA8', 70, 88, 70, 92, -10);
    fill(c, '#FFD36A', star(c, 66, 52, 8));
    fill(c, '#FFD36A', star(c, 78, 72, 5));
    brim(c, '#24408C', 70, 90, 126, 14);
  },
  beanie: (c) => {
    fill(c, '#C0392B', dome(c, 70, 92, 104, 58));
    fill(c, '#A93226', poly(c, [18, 94, 122, 94, 120, 78, 20, 78]));
  },
  crown: (c) => {
    fill(c, '#E5B83B', poly(c, [30, 92, 110, 92, 116, 38, 96, 64, 84, 30, 70, 62, 56, 30, 44, 64, 24, 38]));
    for (const [x, col] of [[44, '#E0115F'], [70, '#4FA3FF'], [96, '#7BC950']] as const) fill(c, col, ell(c, x, 80, 6, 6));
  },
  'flower-crown': (c) => {
    leafRing(c, 70, 88, 52, ['#5E8C4A', '#6FA35A']);
    for (const [x, col] of [[28, '#FF8CC6'], [50, '#FFD36A'], [70, '#F6F1E3'], [90, '#FF8CC6'], [112, '#FFD36A']] as const) {
      fill(c, col, ell(c, x, 74 + Math.abs(70 - x) * 0.18, 9, 9));
      fill(c, '#C9A227', ell(c, x, 74 + Math.abs(70 - x) * 0.18, 3, 3));
    }
  },
  'leaf-crown': (c) => leafRing(c, 70, 88, 54, ['#7BC950', '#4E8A3A', '#5E9C45'], 13, 13),
  'propeller-cap': (c) => {
    fill(c, '#4FA3FF', dome(c, 70, 92, 100, 50));
    fill(c, '#FFD36A', poly(c, [20, 92, 120, 92, 118, 84, 22, 84]));
    stroke(c, '#5C4033', 3, () => (c.moveTo(70, 50), c.lineTo(70, 36)));
    fill(c, '#E0115F', ell(c, 54, 34, 18, 5, -0.15));
    fill(c, '#E0115F', ell(c, 86, 34, 18, 5, 0.15));
  },
  'chef-hat': (c) => {
    fill(c, '#F6F1E3', () => {
      c.arc(46, 46, 22, 0, TAU);
      c.arc(70, 34, 26, 0, TAU);
      c.arc(94, 46, 22, 0, TAU);
    });
    fill(c, '#E8E0CC', poly(c, [34, 92, 106, 92, 106, 56, 34, 56]));
    fill(c, '#F6F1E3', poly(c, [36, 92, 104, 92, 104, 62, 36, 62]));
  },
  'party-hat': (c) => {
    cone(c, '#FF2AA1', 70, 92, 58, 82);
    c.save();
    c.beginPath();
    poly(c, [41, 92, 70, 10, 99, 92])();
    c.clip();
    for (let y = 20; y < 92; y += 16) fill(c, '#FFD36A', poly(c, [20, y, 120, y - 10, 120, y - 4, 20, y + 6]));
    c.restore();
    fill(c, '#00E5FF', ell(c, 70, 12, 8, 8));
  },
  beret: (c) => {
    fill(c, '#B23A48', ell(c, 66, 80, 56, 18, -0.12));
    fill(c, '#8E2C39', ell(c, 70, 90, 40, 6));
    stroke(c, '#8E2C39', 4, () => (c.moveTo(62, 62), c.lineTo(64, 54)));
  },
  'cowboy-hat': (c) => {
    fill(c, '#8B5A2B', dome(c, 70, 84, 72, 48));
    fill(c, '#5C4033', poly(c, [36, 84, 104, 84, 103, 76, 37, 76]));
    fill(c, '#A0693A', () => {
      c.moveTo(4, 74);
      c.quadraticCurveTo(70, 104, 136, 74);
      c.quadraticCurveTo(70, 92, 4, 74);
      c.closePath();
    });
  },
  tricorn: (c) => {
    fill(c, '#2E2A3A', poly(c, [10, 70, 70, 50, 130, 70, 104, 94, 36, 94]));
    stroke(c, '#C9A227', 3, poly(c, [10, 70, 70, 50, 130, 70, 104, 94, 36, 94]));
  },
  'horned-helmet': (c) => {
    fill(c, '#F2E1C1', () => (c.moveTo(26, 78), c.quadraticCurveTo(2, 50, 14, 20), c.quadraticCurveTo(24, 52, 40, 66), c.closePath()));
    fill(c, '#F2E1C1', () => (c.moveTo(114, 78), c.quadraticCurveTo(138, 50, 126, 20), c.quadraticCurveTo(116, 52, 100, 66), c.closePath()));
    fill(c, '#9AA3AE', dome(c, 70, 94, 92, 56));
    fill(c, '#7D8692', poly(c, [24, 94, 116, 94, 114, 84, 26, 84]));
  },
  halo: (c) => {
    stroke(c, 'rgba(255,211,106,0.35)', 12, ell(c, 70, 52, 40, 10));
    stroke(c, '#FFD36A', 5, ell(c, 70, 52, 40, 10));
  },
  'mushroom-cap': (c) => {
    fill(c, '#D9443C', dome(c, 70, 90, 128, 60));
    for (const [x, y, r] of [[44, 64, 9], [74, 50, 11], [100, 70, 8], [60, 82, 6]] as const) fill(c, '#F6F1E3', ell(c, x, y, r, r * 0.8));
  },
  'acorn-cap': (c) => {
    fill(c, '#8B5A2B', dome(c, 70, 92, 104, 44));
    c.save();
    c.beginPath();
    dome(c, 70, 92, 104, 44)();
    c.clip();
    for (let x = 16; x < 130; x += 12) stroke(c, '#6E4520', 2, () => (c.moveTo(x, 40), c.lineTo(x + 20, 96)));
    c.restore();
    stroke(c, '#5C4033', 5, () => (c.moveTo(70, 42), c.quadraticCurveTo(74, 30, 84, 28)));
  },
  'ribbon-bow': (c) => {
    fill(c, '#FF6FA5', poly(c, [70, 74, 34, 54, 30, 94]));
    fill(c, '#FF6FA5', poly(c, [70, 74, 106, 54, 110, 94]));
    fill(c, '#E0457F', ell(c, 70, 74, 9, 9));
  },
  'bobble-hat': (c) => {
    fill(c, '#2F7DCC', dome(c, 70, 92, 104, 56));
    for (const y of [70, 58]) fill(c, '#F6F1E3', poly(c, [22, y + 6, 118, y + 6, 116, y, 24, y]));
    fill(c, '#F6F1E3', ell(c, 70, 26, 13, 13));
  },
  'pith-helmet': (c) => {
    fill(c, '#D9C7A5', dome(c, 70, 84, 88, 52));
    fill(c, '#C2AE8A', poly(c, [26, 84, 114, 84, 113, 78, 27, 78]));
    brim(c, '#CBB894', 70, 88, 132, 14);
  },
  'jester-hat': (c) => {
    fill(c, '#9B2D9B', () => (c.moveTo(30, 90), c.quadraticCurveTo(20, 40, 4, 30), c.quadraticCurveTo(50, 30, 70, 88), c.closePath()));
    fill(c, '#2DB36B', () => (c.moveTo(110, 90), c.quadraticCurveTo(120, 40, 136, 30), c.quadraticCurveTo(90, 30, 70, 88), c.closePath()));
    fill(c, '#FFD36A', ell(c, 6, 30, 7, 7));
    fill(c, '#FFD36A', ell(c, 134, 30, 7, 7));
    fill(c, '#C9A227', poly(c, [26, 94, 114, 94, 112, 84, 28, 84]));
  },
  'laurel-wreath': (c) => leafRing(c, 70, 88, 52, ['#C9A227', '#E5B83B'], 13, 11),
  'sailor-cap': (c) => {
    fill(c, '#F6F1E3', ell(c, 70, 70, 52, 16));
    fill(c, '#1E2B4D', poly(c, [30, 94, 110, 94, 108, 76, 32, 76]));
    fill(c, '#C9A227', ell(c, 70, 85, 6, 4));
  },
  mortarboard: (c) => {
    fill(c, '#2A3142', poly(c, [40, 92, 100, 92, 98, 72, 42, 72]));
    fill(c, '#1E2433', poly(c, [70, 48, 134, 64, 70, 80, 6, 64]));
    stroke(c, '#C9A227', 3, () => (c.moveTo(70, 64), c.lineTo(112, 70), c.lineTo(112, 92)));
    fill(c, '#C9A227', ell(c, 112, 94, 4, 6));
  },
  'bucket-hat': (c) => {
    fill(c, '#6B8E4E', poly(c, [38, 90, 102, 90, 94, 50, 46, 50]));
    fill(c, '#5A7A40', poly(c, [12, 96, 128, 96, 106, 86, 34, 86]));
  },
  tiara: (c) => {
    stroke(c, '#C7CEDA', 5, () => c.arc(70, 120, 46, Math.PI * 1.15, Math.PI * 1.85));
    fill(c, '#C7CEDA', poly(c, [70, 52, 80, 78, 60, 78]));
    fill(c, '#4FA3FF', ell(c, 70, 72, 6, 7));
  },
  'pumpkin-hat': (c) => {
    for (const [x, w] of [[46, 34], [94, 34], [70, 40]] as const) fill(c, '#E67E22', ell(c, x, 72, w / 1.3, 24));
    stroke(c, '#C0631A', 2, () => (c.moveTo(56, 52), c.quadraticCurveTo(52, 72, 56, 94), c.moveTo(84, 52), c.quadraticCurveTo(88, 72, 84, 94)));
    fill(c, '#5C4033', poly(c, [66, 52, 74, 52, 76, 38, 68, 38]));
    fill(c, '#5E8C4A', ell(c, 84, 42, 10, 5, -0.4));
  },
  'snowflake-crown': (c) => {
    fill(c, '#BFE9FF', poly(c, [26, 94, 114, 94, 112, 82, 28, 82]));
    for (const x of [36, 70, 104]) {
      const top = x === 70 ? 40 : 56;
      stroke(c, '#E8F7FF', 4, () => {
        c.moveTo(x, 84);
        c.lineTo(x, top);
        c.moveTo(x - 9, top + 8);
        c.lineTo(x + 9, top + 18);
        c.moveTo(x + 9, top + 8);
        c.lineTo(x - 9, top + 18);
      });
    }
  },
  'candle-crown': (c) => {
    fill(c, '#C9A227', poly(c, [24, 94, 116, 94, 114, 80, 26, 80]));
    for (const x of [38, 70, 102]) {
      fill(c, '#F6F1E3', poly(c, [x - 6, 82, x + 6, 82, x + 6, 50, x - 6, 50]));
      fill(c, '#FF7A1A', ell(c, x, 42, 5, 9));
      fill(c, '#FFD36A', ell(c, x, 44, 2.5, 5));
    }
  },
  'moon-circlet': (c) => {
    stroke(c, '#C7CEDA', 3, () => c.arc(70, 126, 52, Math.PI * 1.15, Math.PI * 1.85));
    fill(c, '#FFD36A', () => {
      c.arc(70, 62, 14, 0, TAU);
      c.moveTo(80, 56);
      c.arc(76, 58, 12, 0, TAU, true);
    });
  },
};

const lens = (c: Ctx, x: number, y: number, r: number, frame: string, glass = 'rgba(191,233,255,0.35)') => {
  fill(c, glass, ell(c, x, y, r, r));
  stroke(c, frame, 4, ell(c, x, y, r, r));
};

const FACE: Record<string, (ctx: Ctx) => void> = {
  'round-glasses': (c) => {
    lens(c, 34, 30, 18, '#3A2A1E');
    lens(c, 86, 30, 18, '#3A2A1E');
    stroke(c, '#3A2A1E', 4, () => (c.moveTo(52, 28), c.quadraticCurveTo(60, 22, 68, 28)));
  },
  'star-shades': (c) => {
    fill(c, '#FF2AA1', star(c, 34, 30, 22));
    fill(c, '#FF2AA1', star(c, 86, 30, 22));
    fill(c, 'rgba(12,30,54,0.85)', star(c, 34, 31, 14));
    fill(c, 'rgba(12,30,54,0.85)', star(c, 86, 31, 14));
  },
  'heart-glasses': (c) => {
    fill(c, '#E0115F', heart(c, 34, 30, 17));
    fill(c, '#E0115F', heart(c, 86, 30, 17));
    fill(c, 'rgba(255,140,180,0.6)', heart(c, 34, 30, 11));
    fill(c, 'rgba(255,140,180,0.6)', heart(c, 86, 30, 11));
    stroke(c, '#E0115F', 4, () => (c.moveTo(50, 26), c.lineTo(70, 26)));
  },
  monocle: (c) => {
    lens(c, 86, 30, 19, '#C9A227');
    stroke(c, '#C9A227', 2, () => (c.moveTo(100, 44), c.quadraticCurveTo(110, 56, 118, 58)));
  },
  'aviator-goggles': (c) => {
    stroke(c, '#5C4033', 8, () => (c.moveTo(0, 28), c.lineTo(120, 28)));
    lens(c, 36, 30, 20, '#8B5A2B', 'rgba(255,211,106,0.45)');
    lens(c, 84, 30, 20, '#8B5A2B', 'rgba(255,211,106,0.45)');
  },
  'masquerade-mask': (c) => {
    fill(c, '#6E3AFF', () => {
      c.moveTo(4, 22);
      c.quadraticCurveTo(30, 4, 60, 22);
      c.quadraticCurveTo(90, 4, 116, 22);
      c.quadraticCurveTo(112, 52, 84, 46);
      c.quadraticCurveTo(70, 44, 60, 36);
      c.quadraticCurveTo(50, 44, 36, 46);
      c.quadraticCurveTo(8, 52, 4, 22);
      c.closePath();
    });
    fill(c, 'rgba(12,30,54,0.9)', ell(c, 34, 30, 11, 8));
    fill(c, 'rgba(12,30,54,0.9)', ell(c, 86, 30, 11, 8));
    stroke(c, '#C9A227', 2, () => (c.moveTo(4, 22), c.quadraticCurveTo(30, 4, 60, 22), c.quadraticCurveTo(90, 4, 116, 22)));
  },
  'cat-eye-glasses': (c) => {
    for (const [x, s] of [[34, -1], [86, 1]] as const) {
      fill(c, 'rgba(191,233,255,0.35)', ell(c, x, 32, 18, 13));
      // The outer corner sweeps up: right lens to the right, left lens to the left.
      stroke(c, '#B23A48', 5, () => (c.moveTo(x - 18 * s, 34), c.quadraticCurveTo(x, 12, x + 22 * s, 12), c.moveTo(x - 18, 34), c.quadraticCurveTo(x, 50, x + 18, 34)));
    }
    stroke(c, '#B23A48', 4, () => (c.moveTo(52, 30), c.lineTo(68, 30)));
  },
  'brass-goggles': (c) => {
    stroke(c, '#5C4033', 8, () => (c.moveTo(0, 30), c.lineTo(120, 30)));
    for (const x of [34, 86]) {
      fill(c, '#B8862E', ell(c, x, 30, 22, 22));
      fill(c, 'rgba(0,229,255,0.55)', ell(c, x, 30, 14, 14));
      stroke(c, '#E5B83B', 2, ell(c, x, 30, 18, 18));
    }
  },
  'pixel-shades': (c) => {
    fill(c, '#111111', poly(c, [8, 20, 112, 20, 112, 28, 104, 28, 104, 44, 68, 44, 68, 32, 52, 32, 52, 44, 16, 44, 16, 28, 8, 28]));
    fill(c, '#F6F1E3', poly(c, [24, 28, 32, 28, 32, 32, 24, 32]));
    fill(c, '#F6F1E3', poly(c, [76, 28, 84, 28, 84, 32, 76, 32]));
  },
  'half-moon-specs': (c) => {
    for (const x of [36, 84]) {
      fill(c, 'rgba(191,233,255,0.35)', () => (c.moveTo(x - 17, 30), c.arc(x, 30, 17, 0, Math.PI)));
      stroke(c, '#C9A227', 3, () => (c.moveTo(x - 17, 30), c.arc(x, 30, 17, Math.PI, 0, true), c.lineTo(x - 17, 30)));
    }
    stroke(c, '#C9A227', 3, () => (c.moveTo(53, 30), c.quadraticCurveTo(60, 24, 67, 30)));
  },
};

const NECK: Record<string, (ctx: Ctx) => void> = {
  'knit-scarf': (c) => {
    fill(c, '#C0392B', poly(c, [8, 6, 122, 6, 120, 24, 10, 24]));
    fill(c, '#C0392B', poly(c, [78, 18, 100, 18, 104, 72, 82, 74]));
    for (const y of [36, 52]) fill(c, '#F6F1E3', poly(c, [80, y, 102, y, 102.5, y + 5, 80.5, y + 5]));
    for (let x = 14; x < 120; x += 10) stroke(c, '#A93226', 2, () => (c.moveTo(x, 8), c.lineTo(x + 3, 22)));
  },
  'bow-tie': (c) => {
    fill(c, '#B23A48', poly(c, [65, 18, 30, 4, 30, 34]));
    fill(c, '#B23A48', poly(c, [65, 18, 100, 4, 100, 34]));
    fill(c, '#8E2C39', ell(c, 65, 18, 7, 8));
  },
  bandana: (c) => {
    fill(c, '#2F7DCC', poly(c, [6, 4, 124, 4, 65, 62]));
    for (const [x, y] of [[30, 12], [65, 14], [100, 12], [50, 30], [80, 30], [65, 46]] as const) fill(c, '#F6F1E3', ell(c, x, y, 3, 3));
  },
  'moon-pendant': (c) => {
    stroke(c, '#C7CEDA', 2, () => (c.moveTo(14, 4), c.quadraticCurveTo(65, 46, 116, 4)));
    fill(c, '#FFD36A', () => {
      c.arc(65, 40, 11, 0, TAU);
      c.moveTo(73, 36);
      c.arc(70, 37, 9, 0, TAU, true);
    });
  },
  'flower-lei': (c) => {
    const cols = ['#FF8CC6', '#FFD36A', '#FF7A1A', '#F6F1E3', '#C8A2FF'];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = 10 + t * 110;
      const y = 6 + Math.sin(t * Math.PI) * 30;
      fill(c, cols[i % cols.length]!, ell(c, x, y, 8, 8));
      fill(c, '#C9A227', ell(c, x, y, 2.5, 2.5));
    }
  },
  'bell-collar': (c) => {
    fill(c, '#C0392B', poly(c, [10, 6, 120, 6, 118, 18, 12, 18]));
    fill(c, '#E5B83B', ell(c, 65, 30, 11, 11));
    stroke(c, '#8B6914', 2, () => (c.moveTo(56, 32), c.lineTo(74, 32)));
  },
  cape: (c) => {
    fill(c, '#5A2D82', () => (c.moveTo(14, 8), c.lineTo(116, 8), c.quadraticCurveTo(130, 50, 124, 78), c.lineTo(6, 78), c.quadraticCurveTo(0, 50, 14, 8), c.closePath()));
    fill(c, '#C9A227', ell(c, 65, 10, 8, 8));
  },
  'ruffle-collar': (c) => {
    for (let i = 0; i < 9; i++) fill(c, i % 2 ? '#F6F1E3' : '#E8E0CC', ell(c, 14 + i * 12.75, 14, 9, 11));
  },
  'pearl-necklace': (c) => {
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      fill(c, '#F6F1E3', ell(c, 10 + t * 110, 6 + Math.sin(t * Math.PI) * 26, 5, 5));
    }
  },
  'medal-ribbon': (c) => {
    fill(c, '#2F4FA8', poly(c, [48, 2, 60, 2, 66, 40, 58, 40]));
    fill(c, '#B23A48', poly(c, [82, 2, 70, 2, 64, 40, 72, 40]));
    fill(c, '#E5B83B', ell(c, 65, 52, 15, 15));
    fill(c, '#FFD36A', star(c, 65, 52, 9));
  },
};

const legs = (c: Ctx, colour: string, xs: number[], top: number, bottom = 88) => {
  for (const x of xs) stroke(c, colour, 3, () => (c.moveTo(x, top), c.lineTo(x + (x < 45 ? -4 : 4), bottom)));
};
const eye = (c: Ctx, x: number, y: number, r = 3) => {
  fill(c, '#F6F1E3', ell(c, x, y, r, r));
  fill(c, '#0C1E36', ell(c, x + r * 0.25, y, r * 0.55, r * 0.55));
};

const PET: Record<string, (ctx: Ctx) => void> = {
  mouse: (c) => {
    stroke(c, '#C99A9A', 3, () => (c.moveTo(20, 76), c.quadraticCurveTo(2, 60, 10, 48)));
    fill(c, '#9AA0A6', ell(c, 42, 72, 24, 16));
    fill(c, '#9AA0A6', ell(c, 64, 66, 14, 12));
    fill(c, '#F2B8C6', ell(c, 60, 54, 8, 8));
    fill(c, '#F2B8C6', ell(c, 76, 66, 3, 3));
    eye(c, 66, 63);
    legs(c, '#7D848A', [34, 50], 82);
  },
  snake: (c) => {
    stroke(c, '#4E8A3A', 11, () => (c.moveTo(8, 80), c.bezierCurveTo(24, 56, 38, 92, 52, 72), c.quadraticCurveTo(60, 58, 70, 60)));
    fill(c, '#5E9C45', ell(c, 74, 58, 12, 9));
    eye(c, 78, 55);
    stroke(c, '#E0115F', 2, () => (c.moveTo(86, 60), c.lineTo(92, 60)));
  },
  grasshopper: (c) => {
    fill(c, '#7BC950', ell(c, 44, 66, 28, 9, -0.12));
    fill(c, '#6AB13F', ell(c, 72, 60, 10, 9));
    stroke(c, '#4E8A3A', 3, () => (c.moveTo(36, 66), c.lineTo(26, 44), c.lineTo(18, 86)));
    legs(c, '#4E8A3A', [50, 60], 72);
    stroke(c, '#4E8A3A', 2, () => (c.moveTo(76, 54), c.quadraticCurveTo(86, 36, 88, 30)));
    eye(c, 75, 58);
  },
  ladybug: (c) => {
    fill(c, '#1A1A1A', ell(c, 66, 70, 11, 10));
    fill(c, '#D9443C', dome(c, 44, 86, 58, 30));
    stroke(c, '#1A1A1A', 2, () => (c.moveTo(44, 54), c.lineTo(44, 86)));
    for (const [x, y] of [[30, 76], [38, 64], [52, 66], [58, 78]] as const) fill(c, '#1A1A1A', ell(c, x, y, 4, 4));
    eye(c, 70, 68, 2.5);
  },
  beetle: (c) => {
    fill(c, '#2B4A5E', ell(c, 70, 70, 10, 9));
    fill(c, '#1F5C4A', ell(c, 42, 70, 26, 16));
    fill(c, 'rgba(255,255,255,0.25)', ell(c, 36, 64, 10, 4, -0.3));
    legs(c, '#1A1A1A', [28, 42, 56], 80);
    eye(c, 74, 68, 2.5);
  },
  snail: (c) => {
    fill(c, '#C9B28A', () => (c.moveTo(8, 86), c.quadraticCurveTo(50, 80, 82, 86), c.quadraticCurveTo(88, 70, 76, 62), c.lineTo(70, 84), c.lineTo(8, 88), c.closePath()));
    fill(c, '#A0693A', ell(c, 40, 62, 24, 24));
    stroke(c, '#7A4D26', 3, () => (c.moveTo(40, 62), c.arc(40, 62, 8, 0, Math.PI * 1.6), c.arc(40, 62, 16, Math.PI * 1.6, Math.PI * 3.1)));
    stroke(c, '#C9B28A', 2, () => (c.moveTo(78, 64), c.lineTo(84, 50), c.moveTo(80, 64), c.lineTo(90, 52)));
  },
  moth: (c) => {
    fill(c, '#D9C7A5', ell(c, 30, 52, 24, 16, -0.5));
    fill(c, '#D9C7A5', ell(c, 60, 52, 24, 16, 0.5));
    fill(c, '#BFA987', ell(c, 34, 70, 14, 10, -0.6));
    fill(c, '#BFA987', ell(c, 56, 70, 14, 10, 0.6));
    fill(c, '#8B7355', ell(c, 45, 62, 6, 18));
    stroke(c, '#8B7355', 2, () => (c.moveTo(43, 44), c.lineTo(36, 34), c.moveTo(47, 44), c.lineTo(54, 34)));
  },
  firefly: (c) => {
    fill(c, 'rgba(255,211,106,0.35)', ell(c, 30, 66, 22, 22));
    fill(c, '#FFD36A', ell(c, 32, 66, 12, 10));
    fill(c, '#3A2A1E', ell(c, 54, 62, 16, 10));
    fill(c, 'rgba(191,233,255,0.6)', ell(c, 54, 48, 12, 7, -0.4));
    eye(c, 66, 60, 2.5);
  },
  frog: (c) => {
    fill(c, '#5E9C45', ell(c, 45, 70, 30, 18));
    fill(c, '#7BC950', ell(c, 45, 76, 18, 10));
    fill(c, '#5E9C45', ell(c, 32, 52, 9, 9));
    fill(c, '#5E9C45', ell(c, 58, 52, 9, 9));
    eye(c, 32, 51, 5);
    eye(c, 58, 51, 5);
    stroke(c, '#3E6B30', 2, () => (c.moveTo(36, 70), c.quadraticCurveTo(45, 76, 54, 70)));
  },
  bat: (c) => {
    fill(c, '#3A2A4A', () => (c.moveTo(45, 60), c.quadraticCurveTo(20, 30, 2, 52), c.quadraticCurveTo(14, 56, 16, 66), c.quadraticCurveTo(28, 60, 45, 70), c.closePath()));
    fill(c, '#3A2A4A', () => (c.moveTo(45, 60), c.quadraticCurveTo(70, 30, 88, 52), c.quadraticCurveTo(76, 56, 74, 66), c.quadraticCurveTo(62, 60, 45, 70), c.closePath()));
    fill(c, '#4A3A5A', ell(c, 45, 64, 10, 13));
    fill(c, '#4A3A5A', poly(c, [38, 54, 40, 42, 44, 52]));
    fill(c, '#4A3A5A', poly(c, [52, 54, 50, 42, 46, 52]));
    eye(c, 41, 60, 2.5);
    eye(c, 49, 60, 2.5);
  },
  hedgehog: (c) => {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI * 0.95;
      fill(c, '#5C4033', poly(c, [40 + Math.cos(a) * 18, 70 + Math.sin(a) * 14, 40 + Math.cos(a) * 34, 70 + Math.sin(a) * 30, 40 + Math.cos(a + 0.25) * 18, 70 + Math.sin(a + 0.25) * 14]));
    }
    fill(c, '#7A5A40', dome(c, 40, 86, 60, 30));
    fill(c, '#D9C7A5', ell(c, 70, 76, 14, 10));
    fill(c, '#1A1A1A', ell(c, 83, 76, 3, 3));
    eye(c, 70, 72, 2.5);
  },
  caterpillar: (c) => {
    for (let i = 0; i < 6; i++) fill(c, i % 2 ? '#6AB13F' : '#7BC950', ell(c, 14 + i * 12, 76 - Math.sin(i * 0.9) * 4, 9, 9));
    fill(c, '#5E9C45', ell(c, 84, 66, 10, 10));
    eye(c, 86, 64, 3);
    stroke(c, '#3E6B30', 2, () => (c.moveTo(82, 56), c.lineTo(78, 46), c.moveTo(88, 56), c.lineTo(92, 46)));
  },
  cricket: (c) => {
    fill(c, '#6E4A2A', ell(c, 42, 68, 26, 9, -0.1));
    fill(c, '#5C3D22', ell(c, 70, 62, 10, 8));
    stroke(c, '#5C3D22', 3, () => (c.moveTo(34, 68), c.lineTo(22, 46), c.lineTo(14, 86)));
    stroke(c, '#5C3D22', 1.5, () => (c.moveTo(76, 56), c.quadraticCurveTo(90, 20, 70, 6), c.moveTo(74, 56), c.quadraticCurveTo(80, 24, 56, 12)));
    legs(c, '#5C3D22', [48, 58], 74);
    eye(c, 73, 60, 2.5);
  },
  butterfly: (c) => {
    fill(c, '#FF8C69', ell(c, 28, 46, 22, 18, -0.5));
    fill(c, '#FF8C69', ell(c, 62, 46, 22, 18, 0.5));
    fill(c, '#FFD36A', ell(c, 32, 68, 14, 11, -0.6));
    fill(c, '#FFD36A', ell(c, 58, 68, 14, 11, 0.6));
    fill(c, '#3A2A1E', ell(c, 45, 58, 4, 18));
    for (const x of [26, 64]) fill(c, '#F6F1E3', ell(c, x, 44, 5, 5));
  },
  spider: (c) => {
    for (let i = 0; i < 4; i++) {
      const y = 62 + i * 6;
      stroke(c, '#3A2A3A', 3, () => (c.moveTo(45, y), c.quadraticCurveTo(26, y - 14, 14 - i * 2, y + 18), c.moveTo(45, y), c.quadraticCurveTo(64, y - 14, 76 + i * 2, y + 18)));
    }
    fill(c, '#4A3A4A', ell(c, 45, 70, 18, 16));
    eye(c, 39, 66, 4);
    eye(c, 51, 66, 4);
  },
  dragonfly: (c) => {
    fill(c, 'rgba(191,233,255,0.6)', ell(c, 34, 46, 22, 7, -0.25));
    fill(c, 'rgba(191,233,255,0.6)', ell(c, 34, 58, 20, 6, 0.25));
    fill(c, 'rgba(191,233,255,0.6)', ell(c, 56, 46, 22, 7, 0.25));
    fill(c, 'rgba(191,233,255,0.6)', ell(c, 56, 58, 20, 6, -0.25));
    stroke(c, '#2F7DCC', 6, () => (c.moveTo(14, 54), c.lineTo(70, 52)));
    fill(c, '#00A3CC', ell(c, 74, 52, 8, 7));
    eye(c, 77, 50, 3);
  },
  salamander: (c) => {
    stroke(c, '#E67E22', 9, () => (c.moveTo(6, 74), c.quadraticCurveTo(30, 62, 50, 76), c.quadraticCurveTo(62, 82, 72, 72)));
    fill(c, '#E67E22', ell(c, 76, 70, 11, 8));
    for (const x of [30, 52]) stroke(c, '#C0631A', 3, () => (c.moveTo(x, 72), c.lineTo(x - 6, 86), c.moveTo(x, 72), c.lineTo(x + 6, 86)));
    for (const x of [24, 40, 58]) fill(c, '#FFD36A', ell(c, x, 70, 2.5, 2.5));
    eye(c, 79, 67, 2.5);
  },
  mole: (c) => {
    fill(c, '#3A3240', dome(c, 42, 88, 64, 34));
    fill(c, '#F2B8C6', ell(c, 76, 78, 7, 5));
    fill(c, '#F2B8C6', ell(c, 24, 86, 8, 4));
    fill(c, '#F2B8C6', ell(c, 58, 86, 8, 4));
    fill(c, '#0C1E36', ell(c, 62, 70, 2, 2));
  },
  'tiny-dragon': (c) => {
    fill(c, '#2DB3A0', () => (c.moveTo(40, 58), c.quadraticCurveTo(24, 24, 10, 34), c.quadraticCurveTo(22, 44, 26, 60), c.closePath()));
    stroke(c, '#2DB3A0', 7, () => (c.moveTo(24, 78), c.quadraticCurveTo(8, 80, 6, 66)));
    fill(c, '#3CCFB8', ell(c, 42, 70, 20, 15));
    fill(c, '#3CCFB8', ell(c, 64, 54, 13, 11));
    fill(c, '#F2E1C1', poly(c, [58, 44, 60, 34, 64, 44]));
    fill(c, '#FFD36A', ell(c, 44, 76, 10, 7));
    legs(c, '#2DB3A0', [36, 50], 80);
    eye(c, 68, 52, 3);
  },
  'star-beetle': (c) => {
    fill(c, '#3A2A1E', ell(c, 70, 70, 10, 9));
    fill(c, '#E5B83B', ell(c, 42, 70, 26, 16));
    for (const [x, y] of [[32, 66], [48, 64], [40, 76]] as const) fill(c, '#F6F1E3', star(c, x, y, 5));
    legs(c, '#3A2A1E', [28, 42, 56], 80);
    eye(c, 74, 68, 2.5);
  },
};

/** A recognisable stand-in for an item until its painted art ships. */
export function drawPlaceholder(ctx: Ctx, item: ItemDef, w: number, h: number): void {
  const table = item.kind === 'pet' ? PET : item.slot === 'head' ? HEAD : item.slot === 'face' ? FACE : NECK;
  const draw = table[item.id];
  if (draw) {
    ctx.shadowColor = OUT;
    ctx.shadowBlur = 0;
    draw(ctx);
    return;
  }
  fill(ctx, '#C9A227', ell(ctx, w / 2, h / 2, w / 3, h / 3));
}
