import Phaser from 'phaser';
import { DEFAULT_ANCHORS, measureAnchors, type Mask, type OwlAnchors } from '../collect/pixels';
import { itemCanvas } from './itemArt';

/** The texture key a variant is drawn with at a scale (textures are shared by every scene). */
export function variantKey(variant: string, scale: number): string {
  return `item:${variant}@${scale}`;
}

const pending = new Map<string, Promise<string>>();

/** Make sure a variant has a texture (real art or placeholder, colourway applied); resolves to its key. */
export function ensureVariantTexture(scene: Phaser.Scene, variant: string, scale: number): Promise<string> {
  const key = variantKey(variant, scale);
  if (scene.textures.exists(key)) return Promise.resolve(key);
  let p = pending.get(key);
  if (!p) {
    p = itemCanvas(variant, scale).then((canvas) => {
      if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
      pending.delete(key);
      return key;
    });
    pending.set(key, p);
  }
  return p;
}

/** Item textures want the owls' resolution: the device ratio, capped at 2. */
export function itemScale(pixelRatio: number): number {
  return Math.max(1, Math.round(Math.min(pixelRatio, 2) * 2) / 2);
}

function maskOf(scene: Phaser.Scene, key: string): Mask | null {
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = src.width;
  const h = src.height;
  if (!w || !h) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
  return { width: w, height: h, alpha };
}

const cached = new Map<string, { source: unknown; anchors: OwlAnchors }>();

/**
 * Where hats, glasses and collars sit on an owl's layers (the great horned owl's unless another
 * species' keys are given), measured once per set of textures: the placeholder SVG owl and the
 * painted owls differ a lot.
 */
export function owlAnchors(scene: Phaser.Scene, layers: readonly string[] = ['owl-body', 'owl-belly', 'owl-accent', 'owl-face']): OwlAnchors {
  const [bodyKey = 'owl-body', bellyKey = 'owl-belly', , faceKey = 'owl-face'] = layers;
  const source = scene.textures.exists(bodyKey) ? scene.textures.get(bodyKey).getSourceImage() : null;
  const hit = cached.get(bodyKey);
  if (hit && hit.source === source) return hit.anchors;
  let anchors = DEFAULT_ANCHORS;
  try {
    const body = maskOf(scene, bodyKey);
    const face = maskOf(scene, faceKey);
    const belly = maskOf(scene, bellyKey);
    if (body && face && belly) anchors = measureAnchors(body, face, belly);
  } catch {
    anchors = DEFAULT_ANCHORS; // a tainted canvas or an odd texture: the defaults fit the placeholder owl
  }
  cached.set(bodyKey, { source, anchors });
  return anchors;
}
