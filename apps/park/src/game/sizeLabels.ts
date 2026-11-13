/**
 * The labels over a room's size boxes (`?sizes=1`, sizeBoxes.ts): one small line per piece per room, its
 * name and the size to make it at, on the biggest of its boxes, the same size on any screen. A piece drawn
 * many times (a shelf, a tiled floor) is labelled once, so the labels stay few and apart (the owner's ask,
 * Nov 7: simpler boxes).
 */
import Phaser from 'phaser';
import { ART, drawnAsSizeBox } from './art';
import { boxLabel, labelColour } from './sizeBoxes';

/** Room pixels per screen pixel now: what keeps a label the same size on any screen. */
type Scale = () => number;

interface Box {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A placed label's rectangle, in room pixels at the scale it was placed at. */
interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The label's size on screen, in CSS pixels. */
const FONT_PX = 12;

/**
 * Where a piece's label goes: the biggest of its boxes, at the first of its corners where it overlaps no
 * label placed before it (top left, bottom left, top right, bottom right), else top left.
 */
export function placeLabels(
  boxes: readonly Box[],
  measure: (key: string) => { w: number; h: number },
): Array<{ key: string; x: number; y: number }> {
  const biggest = new Map<string, Box>();
  for (const b of boxes) {
    const had = biggest.get(b.key);
    if (!had || b.w * b.h > had.w * had.h) biggest.set(b.key, b);
  }
  // Small pieces first, so a big screen's label never takes the one corner a small piece has.
  const order = [...biggest.values()].sort((a, b) => a.w * a.h - b.w * b.h);
  const taken: Spot[] = [];
  const out: Array<{ key: string; x: number; y: number }> = [];
  for (const b of order) {
    const m = measure(b.key);
    const pad = 3 * (m.h / (FONT_PX * 1.4));
    const corners = [
      { x: b.x + pad, y: b.y + pad },
      { x: b.x + pad, y: b.y + b.h - m.h - pad },
      { x: b.x + b.w - m.w - pad, y: b.y + pad },
      { x: b.x + b.w - m.w - pad, y: b.y + b.h - m.h - pad },
    ];
    const free = corners.find((c) => taken.every((t) => !overlaps(t, { ...c, w: m.w, h: m.h })));
    const at = free ?? corners[0]!;
    taken.push({ ...at, w: m.w, h: m.h });
    out.push({ key: b.key, ...at });
  }
  return out;
}

function overlaps(a: Spot, b: Spot): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export class SizeLabels {
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private dirty = true;
  private scaleNow = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    private readonly scale: Scale,
  ) {
    // Pieces can come in after the room is built (a sharper copy, a decoration): look again next frame.
    const again = (obj: Phaser.GameObjects.GameObject) => {
      if (!this.labels.size || !(obj instanceof Phaser.GameObjects.Text)) this.dirty = true;
    };
    scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, again);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, again);
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    });
  }

  /** The keys labelled now: one per boxed piece in the room. */
  keys(): string[] {
    return [...this.labels.keys()];
  }

  private update(): void {
    const s = this.scale();
    if (!this.dirty && s === this.scaleNow) return;
    this.dirty = false;
    this.scaleNow = s;
    const boxes = this.boxes();
    for (const key of boxes.map((b) => b.key)) {
      if (this.labels.has(key)) continue;
      const spec = ART[key]!;
      const text = this.scene.add
        .text(0, 0, boxLabel(key, spec), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: `${FONT_PX * 2}px`,
          fontStyle: 'bold',
          color: labelColour(key, spec),
          backgroundColor: 'rgba(7, 18, 42, 0.78)',
          padding: { x: 6, y: 3 },
        })
        .setDepth(this.depth);
      this.labels.set(key, text);
    }
    // Drawn at twice the size and scaled down by half, so the words stay sharp when the camera zooms in.
    for (const t of this.labels.values()) t.setScale(s / 2);
    const spots = placeLabels(boxes, (key) => {
      const t = this.labels.get(key)!;
      return { w: t.displayWidth, h: t.displayHeight };
    });
    for (const p of spots) this.labels.get(p.key)!.setPosition(p.x, p.y);
  }

  /** Every boxed piece drawn in the room now, where it is drawn. */
  private boxes(): Box[] {
    const out: Box[] = [];
    for (const obj of this.scene.children.list) {
      if (!(obj instanceof Phaser.GameObjects.Image || obj instanceof Phaser.GameObjects.TileSprite) || !obj.visible) continue;
      const key = obj.texture?.key;
      if (!key || !drawnAsSizeBox(key)) continue;
      const r = obj.getBounds();
      if (r.width < 1 || r.height < 1) continue;
      out.push({ key, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    return out;
  }
}
