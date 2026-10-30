import Phaser from 'phaser';
import {
  COPY_ROOM,
  COPY_SPOT,
  FISHING_REACH,
  FISHING_ROOM,
  FISHING_SPOT,
  KIND_RULES,
  LANTERN_FLOOR,
  LANTERN_REACH_X,
  LANTERN_ROOM,
  LANTERNS,
  NPC_TALK_RADIUS,
  PICKUP_CLIENT_RADIUS,
  QUIZ_ROOM,
  QUIZ_ZONES,
  SPRITES,
  interactablesIn,
  type Rect,
  type RoomDef,
  type Vec2,
} from '@owl-park/shared';

/**
 * The fit overlay (OP-127, `?boxes=1`): everything the park checks a tap or a step against, drawn
 * over the room so the fit can be judged by eye on a phone and a computer. Pink: a spot's trigger
 * (where the owl must stand); gold: a doorway's; cyan circles: how near an owl must be; green: tap
 * areas; cream: what a sprite draws; yellow: the object itself without its glow; red dots and ticks:
 * visual centres, worn-item anchors and where a marker stands; red shading: floor shut for now;
 * lime: a perch's top as an owl on it is drawn (its area lifted by its height), and faintly where
 * that is on the floor plan (OP-084).
 *
 * TODO-DOCS (OP-127): docs/PLAYBOOK.md (or the QA notes) explains `?boxes=1`: dev builds, or a build
 * with VITE_BOXES=on; what each colour means; re-run it whenever a style set adds wearables.
 */
const C = { spot: 0xff2aa1, doorway: 0xc9a227, reach: 0x00e5ff, tap: 0x7be0c8, drawn: 0xf6f1e3, solid: 0xffd36a, mark: 0xff5a5a, perch: 0x9cff57 };

/** An NPC owl as the overlay sees it: where it stands, its tap area and where its marker's foot is (room pixels). */
export interface NpcFit {
  pos: Vec2;
  tap: Rect;
  mark: Vec2;
}

/** An owl's anchors and worn items, in room pixels. */
export interface OwlFit {
  feet: Vec2;
  head: Vec2;
  eyes: Vec2;
  neck: Vec2;
  crown: number;
  worn: Rect[];
}

/** What the overlay draws, asked for each frame (owls walk, pieces arrive). */
export interface FitSubjects {
  room: RoomDef;
  /** Floor owls are kept off for now (behind a closed realm's blockade). */
  shut(): Iterable<Rect>;
  npcs(): Iterable<NpcFit>;
  owls(): Iterable<OwlFit>;
  /** Sprites placed in the room, by art key: set pieces, furniture. */
  sprites(): Iterable<{ key: string; image: Phaser.GameObjects.Image }>;
}

export class FitOverlay {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly subjects: FitSubjects,
  ) {
    const top = subjects.room.size.h + 300;
    this.g = scene.add.graphics().setDepth(top);
    for (const d of subjects.room.doors) {
      this.labels.push(scene.add.text(d.rect.x + 2, d.rect.y - 16, d.id, { fontSize: '13px', color: '#F6F1E3', backgroundColor: '#0C1E36' }).setDepth(top + 1));
    }
    for (const p of subjects.room.perches ?? []) {
      const at = p.area[0];
      if (at) this.labels.push(scene.add.text(at.x + 2, at.y - p.top - 16, `${p.id} ${p.top}`, { fontSize: '13px', color: '#9CFF57', backgroundColor: '#0C1E36' }).setDepth(top + 1));
    }
  }

  draw(): void {
    const g = this.g.clear();
    const room = this.subjects.room;
    for (const d of room.doors) {
      g.lineStyle(2, d.to ? C.doorway : C.spot, 0.95).strokeRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
      if (d.marker) this.dot(d.marker, C.mark);
    }
    for (const r of this.subjects.shut()) g.fillStyle(C.mark, 0.22).fillRect(r.x, r.y, r.w, r.h);
    for (const p of room.perches ?? []) {
      g.lineStyle(1, C.perch, 0.35).strokePoints(p.area, true);
      g.lineStyle(2, C.perch, 0.95).strokePoints(p.area.map((v) => ({ x: v.x, y: v.y - p.top })), true);
    }
    // Things up on a perch (OP-084) have their reach drawn up there, where an owl on that perch is drawn.
    for (const def of interactablesIn(room.id)) g.lineStyle(2, C.reach, 0.8).strokeCircle(def.pos.x, def.pos.y - (def.top ?? 0), KIND_RULES[def.kind].reach);
    for (const s of room.spots ?? []) g.lineStyle(1, C.reach, 0.35).strokeCircle(s.x, s.y - (s.top ?? 0), PICKUP_CLIENT_RADIUS);
    if (room.id === LANTERN_ROOM) {
      this.rect(LANTERN_FLOOR, C.spot);
      for (const l of LANTERNS) g.lineStyle(1, C.reach, 0.6).lineBetween(l.pos.x - LANTERN_REACH_X, LANTERN_FLOOR.y, l.pos.x + LANTERN_REACH_X, LANTERN_FLOOR.y);
    }
    if (room.id === QUIZ_ROOM) for (const z of Object.values(QUIZ_ZONES)) this.rect(z, C.spot);
    if (room.id === FISHING_ROOM) g.lineStyle(2, C.reach, 0.8).strokeCircle(FISHING_SPOT.x, FISHING_SPOT.y, FISHING_REACH);
    if (room.id === COPY_ROOM) this.rect(COPY_SPOT, C.spot);
    for (const n of this.subjects.npcs()) {
      g.lineStyle(2, C.reach, 0.8).strokeCircle(n.pos.x, n.pos.y, NPC_TALK_RADIUS);
      this.rect(n.tap, C.tap);
      this.tick(n.mark);
    }
    for (const { key, image } of this.subjects.sprites()) this.sprite(key, image);
    for (const o of this.subjects.owls()) {
      for (const r of o.worn) this.rect(r, C.drawn, 1);
      this.dot(o.head, C.mark);
      this.dot(o.eyes, C.mark);
      this.dot(o.neck, C.mark);
      g.lineStyle(1, C.mark, 0.9).lineBetween(o.feet.x - 18, o.feet.y + o.crown, o.feet.x + 18, o.feet.y + o.crown);
    }
  }

  /** A sprite's frame (faint), what it draws, the object itself, its centre and its tap area. */
  private sprite(key: string, image: Phaser.GameObjects.Image): void {
    if (!image.active || !image.visible) return;
    const fit = SPRITES[key];
    const frame = image.getBounds();
    this.g.lineStyle(1, C.drawn, 0.3).strokeRect(frame.x, frame.y, frame.width, frame.height);
    if (fit?.drawn) this.rect(boxIn(image, fit.size, fit.drawn), C.drawn);
    if (fit?.solid) this.rect(boxIn(image, fit.size, fit.solid), C.solid);
    if (fit?.centre) {
      const c = boxIn(image, fit.size, [fit.centre[0], fit.centre[1], 0, 0]);
      this.dot({ x: c.x, y: c.y }, C.mark);
    }
    const hit = image.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    if (image.input && hit instanceof Phaser.Geom.Rectangle) {
      const m = image.getWorldTransformMatrix();
      const a = m.transformPoint(hit.x - image.displayOriginX, hit.y - image.displayOriginY);
      const b = m.transformPoint(hit.right - image.displayOriginX, hit.bottom - image.displayOriginY);
      this.rect({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, C.tap);
    }
  }

  private rect(r: Rect, colour: number, width = 2): void {
    this.g.lineStyle(width, colour, 0.9).strokeRect(r.x, r.y, r.w, r.h);
  }

  private dot(p: Vec2, colour: number): void {
    this.g.fillStyle(colour, 1).fillCircle(p.x, p.y, 4);
  }

  /** A marker's foot: a short level tick with a dot. */
  private tick(p: Vec2): void {
    this.g.lineStyle(2, C.mark, 1).lineBetween(p.x - 12, p.y, p.x + 12, p.y);
    this.dot(p, C.mark);
  }

  destroy(): void {
    this.g.destroy();
    for (const l of this.labels) l.destroy();
  }
}

/** A box in a sprite's own logical pixels (`size` its logical frame) in room pixels, as the image is placed now. */
export function boxIn(image: Phaser.GameObjects.Image, size: readonly [number, number], box: readonly [number, number, number, number]): Rect {
  const sx = image.displayWidth / size[0];
  const sy = image.displayHeight / size[1];
  const ox = image.originX * size[0];
  const oy = image.originY * size[1];
  const flip = image.flipX ? -1 : 1;
  const x0 = image.x + (box[0] - ox) * sx * flip;
  const x1 = image.x + (box[0] + box[2] - ox) * sx * flip;
  return { x: Math.min(x0, x1), y: image.y + (box[1] - oy) * sy, w: Math.abs(x1 - x0), h: box[3] * sy };
}
