import { describe, expect, it } from 'vitest';
import { hexOf, onCanvas, tintImage, tintedTexture } from './canvasTint';

/** A scene's renderer and textures, as far as the tints use them; it records what is drawn. */
function fakeScene(type: number) {
  const made = new Map<string, string[]>();
  const have = new Set(['leaf']);
  const scene = {
    renderer: { type },
    textures: {
      exists: (k: string) => have.has(k) || made.has(k),
      get: () => ({ getSourceImage: () => ({ width: 8, height: 6 }) }),
      createCanvas: (k: string) => {
        const ops: string[] = [];
        made.set(k, ops);
        const context = {
          drawImage: () => ops.push('draw'),
          fillRect: () => ops.push(`fill ${context.fillStyle} ${context.globalCompositeOperation}`),
          fillStyle: '',
          globalCompositeOperation: 'source-over',
        };
        return { context, refresh: () => ops.push('refresh') };
      },
    },
  };
  return { scene: scene as unknown as Parameters<typeof tintImage>[0], made };
}

function fakeImage() {
  const calls: string[] = [];
  return { calls, setTexture: (k: string) => calls.push(`texture ${k}`), setTint: (c: number) => calls.push(`tint ${hexOf(c)}`) };
}

describe('colours on either renderer (OP-300)', () => {
  it('tints on WebGL, as before', () => {
    const { scene, made } = fakeScene(2);
    expect(onCanvas(scene)).toBe(false);
    const img = fakeImage();
    expect(tintImage(scene, img, 'leaf', 0xb5452a)).toBe(img);
    expect(img.calls).toEqual(['texture leaf', 'tint #b5452a']);
    expect(made.size).toBe(0);
  });

  it('bakes the colour into a copy of the texture on Canvas, once per colour, and never tints', () => {
    const { scene, made } = fakeScene(1);
    expect(onCanvas(scene)).toBe(true);
    const a = fakeImage();
    const b = fakeImage();
    tintImage(scene, a, 'leaf', 0xb5452a);
    tintImage(scene, b, 'leaf', 0xb5452a);
    expect(a.calls).toEqual(['texture leaf:#b5452a']);
    expect(b.calls).toEqual(['texture leaf:#b5452a']);
    expect([...made.keys()]).toEqual(['leaf:#b5452a']);
    expect(made.get('leaf:#b5452a')).toEqual(['draw', 'fill #b5452a multiply', 'draw', 'refresh']);
    // Black (a pile's shadow) is a colour like any other.
    tintImage(scene, fakeImage(), 'leaf', 0x000000);
    expect(made.has('leaf:#000000')).toBe(true);
  });

  it('leaves a texture that is not loaded as it is', () => {
    const { scene, made } = fakeScene(1);
    expect(tintedTexture(scene, 'missing', '#ffffff')).toBe('missing');
    expect(made.size).toBe(0);
  });

  it('writes colours as #rrggbb', () => {
    expect(hexOf(0)).toBe('#000000');
    expect(hexOf(0xf2c14e)).toBe('#f2c14e');
    expect(hexOf(0x0a0b0c)).toBe('#0a0b0c');
  });
});
