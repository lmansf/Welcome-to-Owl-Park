import Phaser from 'phaser';
import type { Movers } from '@owl-park/shared';
import { ART, loadArtKey } from './art';
import { MOVER_ART, streamerSpots } from './movers';
import { PUBLISHED_ART } from './publishedArt';
import { artStatus, boxLabel, labelColour, paintSizeBox } from './sizeBoxes';

/**
 * A room's movers, drawn (OP-287, movers.ts): a knot hole's mouth where a downdraft sinks into the floor
 * and where a tunnel begins, the column of sinking air over the hole, and a glide lane's streamers along
 * its line at the height it holds a glide. Made only on a page with the `movers` flag.
 *
 * None of the three pieces is painted yet. Each is drawn as a box with its name and the size to make it
 * at (the owner's rule for new art, sizeBoxes.ts), with no need of `?sizes=1`: the movers are not for
 * visitors until they have art. A file delivered under a piece's key is drawn in the box's place by
 * itself, and the label goes.
 */

/** A piece of a mover as it is drawn: its art's key, its box on the room's plan, and whether art or a box is drawn. */
export interface MoverPiece {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  art: boolean;
}

/** How far below a mouth's own spot its foot stands (room px): the hatch's art stood so on its doorway. */
const MOUTH_FOOT = 50;
/** Over every owl and floor thing: a label is read, not walked behind. */
const LABEL_DEPTH = 100_000;
const LABEL_FONT_PX = 12;

function boxTexture(scene: Phaser.Scene, key: string): string {
  const name = `box:${key}`;
  if (scene.textures.exists(name)) return name;
  const spec = ART[key]!;
  const tex = scene.textures.createCanvas(name, spec.w, spec.h);
  if (!tex) return name;
  paintSizeBox(tex.getContext(), key, spec);
  tex.refresh();
  return name;
}

export class MoversView {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly drawn: MoverPiece[] = [];
  private scaleNow = 0;
  private gone = false;

  /** `scale` is the screen's pixel ratio, for a delivered piece's sharp copy. */
  constructor(
    private readonly scene: Phaser.Scene,
    movers: Movers,
    scale: number,
  ) {
    for (const d of movers.downdrafts ?? []) {
      // The mouth lies in the floor under the owls; the column stands on it, behind an owl inside it.
      this.piece(MOVER_ART.mouth, d.pos.x, d.pos.y + MOUTH_FOOT, d.pos.y - 70, 0, scale, true);
      this.piece(MOVER_ART.column, d.pos.x, d.pos.y, d.pos.y - 2, 0, scale, true);
    }
    for (const t of movers.tunnels ?? []) this.piece(MOVER_ART.mouth, t.mouth.x, t.mouth.y + MOUTH_FOOT, t.mouth.y - 70, 0, scale, true);
    for (const l of movers.lanes ?? []) {
      const spec = ART[MOVER_ART.streamers]!;
      const turn = Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x);
      // End to end along the line, at the height the lane holds a glide (drawn that far up the screen), behind an owl riding it.
      streamerSpots(l, spec.w).forEach((s, i) => this.piece(MOVER_ART.streamers, s.at.x, s.at.y - l.z + spec.h / 2, s.at.y - 1, turn, scale, i === 0, s.length));
    }
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
  }

  /** One piece, its foot (the middle of its bottom edge) at `x`, `y`: the box now, and its art in the box's place once it has loaded. */
  private piece(key: string, x: number, y: number, depth: number, turn: number, scale: number, labelled: boolean, width?: number): void {
    const spec = ART[key]!;
    const w = width ?? spec.w;
    const img = this.scene.add.image(x, y, boxTexture(this.scene, key)).setOrigin(0.5, 1).setDisplaySize(w, spec.h).setRotation(turn).setDepth(depth);
    this.images.push(img);
    const piece: MoverPiece = { key, x: x - w / 2, y: y - spec.h, w, h: spec.h, art: false };
    this.drawn.push(piece);
    let label: Phaser.GameObjects.Text | null = null;
    if (labelled) {
      label = this.scene.add
        .text(piece.x + 4, piece.y + 4, boxLabel(key, spec), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: `${LABEL_FONT_PX * 2}px`,
          fontStyle: 'bold',
          color: labelColour(key, spec),
          backgroundColor: 'rgba(7, 18, 42, 0.78)',
          padding: { x: 6, y: 3 },
        })
        .setDepth(LABEL_DEPTH);
      this.labels.push(label);
    }
    // Delivered art takes the box's place (a file under the key, published with the build).
    if (artStatus(key, PUBLISHED_ART) === 'none') return;
    void loadArtKey(this.scene, key, scale).then((ok) => {
      if (!ok || this.gone || !img.active) return;
      img.setTexture(key).setDisplaySize(w, spec.h);
      piece.art = true;
      label?.setVisible(false);
    });
  }

  /** Every piece drawn, for the tests and the debug state. */
  pieces(): MoverPiece[] {
    return this.drawn.map((p) => ({ ...p }));
  }

  /** The labels keep their size on the screen as the camera draws back and comes in. */
  private update(): void {
    const s = 1 / (2 * this.scene.cameras.main.zoom);
    if (s === this.scaleNow) return;
    this.scaleNow = s;
    for (const t of this.labels) t.setScale(s);
  }

  destroy(): void {
    this.gone = true;
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    for (const o of [...this.images, ...this.labels]) o.destroy();
    this.images.length = 0;
    this.labels.length = 0;
  }
}
