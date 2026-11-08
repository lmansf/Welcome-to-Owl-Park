import { distance, type DoorDef, type Vec2 } from '@owl-park/shared';
import Phaser from 'phaser';
import { doorSpot, trailPoints } from './featherTrail';
import { type SymbolName, symbolCanvas } from './symbols';

/** A feather this near the owl has done its work and fades (room px). */
export const TRAIL_PASSED_PX = 70;
/** Gold, like the doorway chips at the screen's edge: it reads on a pale floor and a dark one alike. */
const FEATHER_TINT = '#ffd36a';
const FEATHER_ALPHA = 0.85;
/** A feather about as long as an owl's foot to its knee: big enough to spot on a phone (the symbol is 32 px). */
const FEATHER_SCALE = 1.5;
/** A dark edge under each feather and glint, so gold still reads on a pale floor (a flat bright shape vanishes there). */
const EDGE_TINT = '#2b1d08';
const EDGE_ALPHA = 0.55;
/** The glint: a four-pointed sparkle over the doorway, gold like the feathers (the symbol is 32 px). */
const GLINT_TINT = '#ffe08a';
const GLINT_SCALE = 1.4;

type Shape = Phaser.GameObjects.Container;

/**
 * A symbol drawn in one colour, as its own texture: a tint is lost where the browser falls back to
 * drawing without WebGL (older phones, some tablets), and the trail has to read there too.
 */
function coloured(scene: Phaser.Scene, name: SymbolName, hex: string): string {
  const key = `trail-${name}-${hex.slice(1)}`;
  if (scene.textures.exists(key)) return key;
  const src = symbolCanvas(name);
  const tex = scene.textures.createCanvas(key, src.width, src.height);
  if (!tex) return key;
  const ctx = tex.context;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalCompositeOperation = 'source-over';
  tex.refresh();
  return key;
}

/** A gold symbol with its dark edge beneath it, as one thing to place, fade and float. */
function edged(scene: Phaser.Scene, x: number, y: number, name: SymbolName, hex: string, scale: number): Shape {
  const edge = scene.add.image(0, 0, coloured(scene, name, EDGE_TINT)).setAlpha(EDGE_ALPHA).setScale(scale * 1.25);
  const top = scene.add.image(0, 0, coloured(scene, name, hex)).setScale(scale);
  return scene.add.container(x, y, [edge, top]);
}

/** The trail and the glints drawn in one room. */
export class FeatherTrail {
  private feathers: Shape[] = [];
  private readonly glints = new Map<string, Shape>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly calm: () => boolean,
  ) {}

  /** A glint over each doorway not tried yet; one tried since loses its glint. */
  glint(doors: readonly DoorDef[]): void {
    const want = new Set(doors.map((d) => d.id));
    for (const [id, g] of this.glints) {
      if (want.has(id)) continue;
      g.destroy();
      this.glints.delete(id);
    }
    for (const d of doors) {
      if (this.glints.has(d.id)) continue;
      const m = doorSpot(d);
      const g = edged(this.scene, m.x, m.y - 30, 'star4', GLINT_TINT, GLINT_SCALE).setDepth(m.y + 2);
      if (!this.calm()) this.scene.tweens.add({ targets: g, scale: 0.6, angle: 45, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (d.rect.x % 7) * 120 });
      this.glints.set(d.id, g);
    }
  }

  /** Lays the feathers along `way` (from the owl to a doorway), the old trail gone. */
  lay(way: readonly Vec2[]): void {
    this.clear();
    trailPoints(way).forEach((p, i) => {
      const f = edged(this.scene, p.x, p.y - 18, 'feather', FEATHER_TINT, FEATHER_SCALE).setAlpha(0).setDepth(p.y + 1).setRotation(((i % 3) - 1) * 0.35);
      this.scene.tweens.add({ targets: f, alpha: FEATHER_ALPHA, duration: 500, delay: i * 140 });
      if (!this.calm()) this.scene.tweens.add({ targets: f, y: p.y - 26, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 140 });
      this.feathers.push(f);
    });
  }

  /** What is out now, for the page's state (tests and the QA bots): where each feather lies and which doorways glint. */
  debug(): { feathers: Vec2[]; glints: string[] } {
    return { feathers: this.feathers.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y) })), glints: [...this.glints.keys()] };
  }

  /** Whether any feather is still out. */
  get showing(): boolean {
    return this.feathers.length > 0;
  }

  /** Each frame: a feather the owl has come up to fades away. */
  tick(owl: Vec2): void {
    if (this.feathers.length === 0) return;
    this.feathers = this.feathers.filter((f) => {
      if (distance(owl, { x: f.x, y: f.y + 18 }) > TRAIL_PASSED_PX) return true;
      this.scene.tweens.killTweensOf(f);
      this.scene.tweens.add({ targets: f, alpha: 0, y: f.y - 30, duration: 400, onComplete: () => f.destroy() });
      return false;
    });
  }

  /** The feathers gone at once (the glints stay). */
  clear(): void {
    for (const f of this.feathers) f.destroy();
    this.feathers = [];
  }

  destroy(): void {
    this.clear();
    for (const g of this.glints.values()) g.destroy();
    this.glints.clear();
  }
}
