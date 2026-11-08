import type Phaser from 'phaser';

/** Phaser's Canvas renderer (Phaser.CANVAS), which draws no tint: setTint is WebGL-only. */
const CANVAS_RENDERER = 1;

type Textures = Pick<Phaser.Textures.TextureManager, 'exists' | 'get' | 'createCanvas'>;
type TintScene = { renderer: { type: number }; textures: Textures };

/** Whether the scene draws on the Canvas renderer (no WebGL on this device), where tints must be baked. */
export function onCanvas(scene: TintScene): boolean {
  return scene.renderer.type === CANVAS_RENDERER;
}

/** A colour as `#rrggbb`. */
export function hexOf(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** A copy of a white texture multiplied by a colour (`#rrggbb`), for renderers without tint support; made once per colour. */
export function tintedTexture(scene: TintScene, key: string, hex: string): string {
  const out = `${key}:${hex.toLowerCase()}`;
  if (scene.textures.exists(out)) return out;
  if (!scene.textures.exists(key)) return key;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = scene.textures.createCanvas(out, src.width, src.height);
  if (!canvas) return key;
  const ctx = canvas.context;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  canvas.refresh();
  return out;
}

type Tintable = { setTexture(key: string): unknown; setTint(color: number): unknown };

/**
 * An image in a colour on either renderer (OP-300): WebGL tints it; Canvas, which can't, shows a copy
 * of its texture with the colour baked in. Returns the image.
 */
export function tintImage<T extends Tintable>(scene: TintScene, img: T, key: string, color: number): T {
  if (onCanvas(scene)) img.setTexture(tintedTexture(scene, key, hexOf(color)));
  else {
    img.setTexture(key);
    img.setTint(color);
  }
  return img;
}
