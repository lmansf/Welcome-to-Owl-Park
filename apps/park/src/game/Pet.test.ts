import { describe, expect, it, vi } from 'vitest';
import { ITEM_SIZES } from './itemArt';
import { OWL_SCALE } from './Owl';
import { Pet } from './Pet';

// The pet only drives the image the scene hands it; no Phaser runs here.
vi.mock('phaser', () => ({ default: { Math: { DegToRad: (d: number) => (d * Math.PI) / 180 } } }));
vi.mock('./Owl', () => ({ OWL_SCALE: 0.5 }));
vi.mock('./items', () => ({ ensurePetArtTexture: () => new Promise(() => {}) }));

/** An image as the pet sees it: a plain record of its texture, size and origin. */
function fakeScene() {
  const img = {
    texture: { key: '' },
    display: null as null | { w: number; h: number },
    origin: { x: 0.5, y: 0.5 },
    visible: true,
    alpha: 1,
    setTexture(key: string) {
      this.texture.key = key;
      return this;
    },
    setOrigin(x: number, y: number) {
      this.origin = { x, y };
      return this;
    },
    setDisplaySize(w: number, h: number) {
      this.display = { w, h };
      return this;
    },
    setPosition() {
      return this;
    },
    setFlipX() {
      return this;
    },
    setDepth() {
      return this;
    },
    setAlpha() {
      return this;
    },
    setRotation() {
      return this;
    },
    destroy() {},
  };
  const scene = {
    add: {
      image: (_x: number, _y: number, key: string) => {
        img.texture.key = key;
        return img;
      },
    },
  };
  return { scene: scene as never, img };
}

describe('pet size (OP-433)', () => {
  it('draws a newly made pet at the owls’ scale, not at its full canvas', () => {
    for (const size of [1, 0.8, 1.25]) {
      const { scene, img } = fakeScene();
      new Pet(scene, 'variant-mouse~0', { x: 100, y: 200 }, 'item-mouse', size, 2);
      expect(img.display, `size ${size}`).toEqual({ w: ITEM_SIZES.pet.w * OWL_SCALE * size, h: ITEM_SIZES.pet.h * OWL_SCALE * size });
    }
  });

  it('keeps the pet under half a great horned owl’s 200-wide canvas, at any owl size', () => {
    const { scene, img } = fakeScene();
    new Pet(scene, 'variant-mouse~0', { x: 100, y: 200 }, 'item-mouse', 1.25);
    expect(img.display!.w).toBeLessThan(200 * OWL_SCALE * 1.25 * 0.5);
  });

  it('sizes again when its owl wears another pet', () => {
    const { scene, img } = fakeScene();
    const pet = new Pet(scene, 'variant-mouse~0', { x: 100, y: 200 }, 'item-mouse', 1);
    img.display = null;
    pet.setTexture('variant-hedgehog~0', 'item-hedgehog');
    expect(img.display).toEqual({ w: ITEM_SIZES.pet.w * OWL_SCALE, h: ITEM_SIZES.pet.h * OWL_SCALE });
  });
});
