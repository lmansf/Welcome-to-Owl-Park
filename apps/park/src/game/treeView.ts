import Phaser from 'phaser';
import type { Barrier, DoorDef, Polygon, RoomDef } from '@owl-park/shared';

/**
 * What makes a room of the tree (map 2) read at a glance (OP-173): what an owl can stand on, what is in
 * front of it, and what it can use.
 *
 * - The playfield is drawn a step quieter (a multiply tint), so what the game draws over it stands out.
 * - Every ledge has the same bright, simple edge along its top, the one look for "an owl can stand here",
 *   on a level painted as one picture. A level painted in six layers has its platforms painted on their
 *   own, so the platform's own edge says it and no line is drawn over it (a cream line there read as a
 *   white bar floating over the painting).
 * - Shapes of the playfield painted in front of the path (`fronts`, a lamp post, a post in front of a
 *   stall) are drawn again over the owls, so an owl passes behind them. A raised one (a stair's banister,
 *   which the floor runs in front of) is drawn between the owls on ledges and the owls on the floor: the
 *   owls draw a ledge-stander a band further back (Owl.setRaisedBand), so a climbing owl passes behind
 *   the banister and one walking by on the floor stays in front of it.
 * - Painted glows that do nothing yet (`shades`) are shaded darker, so they do not read as things to use:
 *   each shade follows the painted shape and fades in over its edge, so it reads as shadow, not a box.
 * - A doorway to another room has a mark over its arch (`markAt`): the bright, simple sign of a way
 *   through, in the colours of the '!' over an owl to talk to (OP-114). A stair's mark points the way it
 *   goes, up or down (`way`, OP-220).
 * - What shuts a way not open yet (`barriers`, OP-220) is drawn by the game, never painted: a locked gate,
 *   a rope across, a fallen branch or boards over an arch, each with its sign (an approved phrase) and a
 *   warm glow behind it that says shut for now, not for good.
 * - Where a stair's doorway stands and the painting shows no stair (`landings`, OP-220), the game draws
 *   a stairhead going down through the boardwalk.
 *
 * TODO-DOCS (OP-173): docs/MAP.md (the tree's style sheet): the one look for ledges (the bright edge,
 * drawn by the game), fronts and shades in the room data and what each is for, the doorway mark, and the
 * rule for painting the next levels in layers (back scenery, platforms, front props, overlay, with
 * interactive things as their own sprites); that an owl on a ledge is drawn behind the floor's (behind
 * an owl on the floor) and what a raised front is for; docs/ARCHITECTURE.md's rooms table gains
 * `fronts` (and `raised`), `shades` and a door's `markAt`.
 */

/**
 * How far back (depth) the tree's rooms draw an owl standing on a ledge: owls are drawn by their place on
 * the plan (about the ground line, 770), so one on a ledge goes behind every owl on the floor, still over
 * the playfield and its dressing (under 0); the raised fronts lie between the two (OP-173).
 */
export const TREE_RAISED_BAND = 400;

/** The quieter playfield: a multiply tint on the tree's 1x tiles and on their fronts alike. */
export const TREE_PLAY_TINT = 0xdedede;

/** How far a shade's edge fades in (room px, the canvas's shadow blur): soft enough that it reads as shadow. */
const SHADE_SOFT = 12;

/** A ledge's edge: a soft warm glow under a crisp cream line. */
const LIP = { glow: 0xffe9a8, glowAlpha: 0.28, glowWidth: 12, line: 0xfff4d2, lineAlpha: 0.95, lineWidth: 4 } as const;

/** The doorway mark: a dark pill with a cream outline, a cream arch and a gold dot (the '!''s colours). */
const MARK = { w: 40, h: 50, pill: 0x0c1e36, pillAlpha: 0.9, cream: 0xf6f1e3, gold: 0xffd36a, bob: 4, bobMs: 1000 } as const;

export interface TreeDepths {
  /** Over the playfield, under the owls. */
  shade: number;
  lip: number;
  /** A barrier and a stairhead, over the playfield and its glows, under the owls (OP-220). */
  barrier: number;
  /** Over the owls, under the overlay. */
  front: number;
  /** Over the owls on ledges (drawn a band back), under the owls on the floor. */
  raised: number;
  mark: number;
}

/** What was drawn, for the page's debug state and its tests. */
export interface TreeDress {
  fronts: number;
  /** Of the fronts, how many are raised (over the owls on ledges only). */
  raised: number;
  shades: number;
  lips: number;
  marks: number;
  /** The barriers drawn over closed doorways and the ways that lead nowhere yet (OP-220). */
  barriers: number;
  /** The stairheads drawn where a stair's doorway has no painted stair (OP-220). */
  landings: number;
}

/** The dressing of a room, and how to cut its fronts again when a tile's picture is swapped for a sharper one. */
export interface TreeDressing extends TreeDress {
  /** Where the raised fronts are drawn (depth): an owl drawn under it is behind them. */
  raisedDepth: number;
  recut(key: string): void;
}

export interface TreeDressOptions {
  /** The ground line (room px): a ledge's top is drawn this far up from it. */
  ground: number;
  depths: TreeDepths;
  /** Whether a doorway leads anywhere for this owl now (one into a closed realm shows no mark). */
  open: (door: DoorDef) => boolean;
  /** Calm motion: the marks stand still. */
  calm: boolean;
  /** A tap on a doorway's mark. */
  onMarkTap?: (door: DoorDef) => void;
}

const xsOf = (poly: Polygon) => poly.map((p) => p.x);

/** The tile image (one of `tiles`, the room's 1x playfield) a shape lies in: the one holding the middle of its box. */
function tileFor(tiles: readonly Phaser.GameObjects.Image[], poly: Polygon): Phaser.GameObjects.Image | undefined {
  const xs = xsOf(poly);
  const ys = poly.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return tiles.find((img) => cx >= img.x && cx < img.x + img.displayWidth && cy >= img.y && cy < img.y + img.displayHeight);
}

/** Dresses a room of the tree as above. `playTiles` are the images of its 1x playfield, already placed. */
export function dressTreeRoom(scene: Phaser.Scene, room: RoomDef, playTiles: readonly Phaser.GameObjects.Image[], opts: TreeDressOptions): TreeDressing {
  // Quieted: the playfield, or on a level painted in six layers its back scenery alone (its platforms are plain).
  for (const img of playTiles) if (!img.getData('plain')) img.setTint(TREE_PLAY_TINT);

  let shades = 0;
  for (const s of room.shades ?? []) {
    const tile = tileFor(playTiles, s.poly);
    const tex = tile && shadeTexture(scene, `${tile.texture.key}:shade:${s.id}`, s.poly, s.alpha);
    if (!tex) continue;
    scene.add.image(tex.x, tex.y, tex.key).setOrigin(0).setDepth(opts.depths.shade);
    shades++;
  }

  const lips = scene.add.graphics().setDepth(opts.depths.lip);
  // A level painted in layers (its platforms plain) shows its ledges in the painting: no line over them.
  const painted = playTiles.some((img) => img.getData('plain'));
  const perches = painted ? [] : (room.perches ?? []);
  for (const p of perches) {
    const xs = xsOf(p.area);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y = opts.ground - p.top;
    lips.lineStyle(LIP.glowWidth, LIP.glow, LIP.glowAlpha).lineBetween(x0, y + 2, x1, y + 2);
    lips.lineStyle(LIP.lineWidth, LIP.line, LIP.lineAlpha).lineBetween(x0 + 2, y, x1 - 2, y);
  }

  // Each front is cut from its tile's picture once (a small texture of just that shape), so drawing it
  // costs a small image, not the tile again through a mask.
  const cuts: Array<{ img: Phaser.GameObjects.Image; tile: Phaser.GameObjects.Image; id: string; poly: Polygon; raised: boolean }> = [];
  for (const f of room.fronts ?? []) {
    const tile = tileFor(playTiles, f.poly);
    if (!tile) continue;
    const img = cutFront(scene, tile, f.id, f.poly);
    if (!img) continue;
    if (!tile.getData('plain')) img.setTint(TREE_PLAY_TINT);
    cuts.push({ img: img.setDepth(f.raised ? opts.depths.raised : opts.depths.front), tile, id: f.id, poly: f.poly, raised: !!f.raised });
  }

  let marks = 0;
  for (const door of room.doors) {
    if (!door.to || !door.markAt || !opts.open(door)) continue;
    const { w, h } = MARK;
    const pill = scene.add.graphics();
    pill.fillStyle(MARK.pill, MARK.pillAlpha).fillRoundedRect(-w / 2, -h / 2, w, h, w / 2);
    pill.lineStyle(2, MARK.cream, 0.6).strokeRoundedRect(-w / 2, -h / 2, w, h, w / 2);
    // An arch, the way through, and its gold dot.
    pill.lineStyle(3.2, MARK.cream, 1);
    pill.beginPath();
    pill.moveTo(-8, 13);
    pill.lineTo(-8, -3);
    pill.arc(0, -3, 8, Math.PI, 0, false);
    pill.lineTo(8, 13);
    pill.strokePath();
    if (door.way) {
      // A stair's mark points the way it goes (OP-220): a chevron in the arch, up or down.
      const d = door.way === 'up' ? -1 : 1;
      pill.lineStyle(3, MARK.gold, 1);
      pill.beginPath();
      pill.moveTo(-4.5, 4 - d * 2.5);
      pill.lineTo(0, 4 + d * 2.5);
      pill.lineTo(4.5, 4 - d * 2.5);
      pill.strokePath();
    } else pill.fillStyle(MARK.gold, 1).fillCircle(0, 4, 3.4);
    const mark = scene.add.container(door.markAt.x, door.markAt.y, [pill]).setDepth(opts.depths.mark);
    if (opts.onMarkTap) {
      const tap = opts.onMarkTap;
      mark.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
      mark.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => tap(door));
    }
    if (!opts.calm) scene.tweens.add({ targets: mark, y: door.markAt.y - MARK.bob, duration: MARK.bobMs / 2, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    marks++;
  }

  const shut = scene.add.graphics().setDepth(opts.depths.barrier);
  for (const l of room.landings ?? []) drawLanding(shut, l.x, l.w, opts.ground);
  for (const b of room.barriers ?? []) {
    const glow = scene.add.image(b.x + b.w / 2, opts.ground - 70, 'fx-glow').setTint(BARRIER.glow).setAlpha(BARRIER.glowAlpha).setScale(Math.max(0.9, b.w / 150), 1);
    glow.setDepth(opts.depths.barrier - 0.01).setBlendMode(Phaser.BlendModes.ADD);
    if (!opts.calm) scene.tweens.add({ targets: glow, alpha: BARRIER.glowAlpha * 1.6, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    drawBarrier(shut, b, opts.ground);
    const sign = scene.add
      .text(b.x + b.w / 2, opts.ground - BARRIER.signY, b.sign, { fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#2B1C12', backgroundColor: '#F6F1E3', padding: { x: 9, y: 5 } })
      .setOrigin(0.5)
      .setDepth(opts.depths.barrier + 0.01);
    sign.setName(`barrier-sign:${b.id}`);
  }

  return {
    fronts: cuts.length,
    raised: cuts.filter((c) => c.raised).length,
    raisedDepth: opts.depths.raised,
    shades,
    lips: perches.length,
    marks,
    barriers: room.barriers?.length ?? 0,
    landings: room.landings?.length ?? 0,
    // A tile sharpened (sharpenArt swaps its texture): its fronts are cut again from the sharper picture.
    recut(key: string) {
      for (const c of cuts) {
        if (c.tile.texture.key !== key) continue;
        const fresh = cutTexture(scene, c.tile, c.id, c.poly);
        if (fresh) c.img.setTexture(fresh.key).setDisplaySize(fresh.w, fresh.h);
      }
    },
  };
}

/**
 * A shade as a texture of its own (named under its tile's key, so releasing the room's art lets it go):
 * `poly` filled at `alpha`, its edge fading in over SHADE_SOFT. The shape is drawn off the canvas and
 * only its blurred shadow lands on it, which softens an edge in every browser (a canvas filter does not).
 */
function shadeTexture(scene: Phaser.Scene, key: string, poly: Polygon, alpha: number): { key: string; x: number; y: number } | null {
  const pad = SHADE_SOFT * 2;
  const xs = xsOf(poly);
  const ys = poly.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)) - pad;
  const y0 = Math.floor(Math.min(...ys)) - pad;
  const w = Math.ceil(Math.max(...xs)) + pad - x0;
  const h = Math.ceil(Math.max(...ys)) + pad - y0;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const off = w + pad;
  ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
  ctx.shadowBlur = SHADE_SOFT;
  ctx.shadowOffsetX = off;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x - x0 - off, p.y - y0));
  ctx.closePath();
  ctx.fill();
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return { key, x: x0, y: y0 };
}

/** The texture of front `id` cut from `tile`'s picture as it is now: the shape's box, clear outside the shape. */
function cutTexture(scene: Phaser.Scene, tile: Phaser.GameObjects.Image, id: string, poly: Polygon): { key: string; w: number; h: number } | null {
  const src = scene.textures.get(tile.texture.key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  if (!src?.width) return null;
  const xs = poly.map((p) => p.x - tile.x);
  const ys = poly.map((p) => p.y - tile.y);
  const x0 = Math.floor(Math.min(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const w = Math.ceil(Math.max(...xs)) - x0;
  const h = Math.ceil(Math.max(...ys)) - y0;
  if (w <= 0 || h <= 0) return null;
  // Room px to the picture's own px: a sharper copy is bigger than the tile is drawn.
  const kx = src.width / tile.displayWidth;
  const ky = src.height / tile.displayHeight;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * kx));
  canvas.height = Math.max(1, Math.round(h * ky));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (p.x - tile.x - x0) * kx, (p.y - tile.y - y0) * ky));
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(src, x0 * kx, y0 * ky, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  // Named under the tile's key, so releasing the room's art (releaseArt) lets it go too.
  const key = `${tile.texture.key}:front:${id}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return { key, w, h };
}

/** Front `id` drawn where it lies over `tile`, from its own small texture. */
function cutFront(scene: Phaser.Scene, tile: Phaser.GameObjects.Image, id: string, poly: Polygon): Phaser.GameObjects.Image | null {
  const tex = cutTexture(scene, tile, id, poly);
  if (!tex) return null;
  const x0 = Math.floor(Math.min(...poly.map((p) => p.x)));
  const y0 = Math.floor(Math.min(...poly.map((p) => p.y)));
  return scene.add.image(x0, y0, tex.key).setOrigin(0).setDisplaySize(tex.w, tex.h);
}

/** A barrier's look (OP-220): wood, cream rope, gold lock, and the warm glow behind that says not for ever. */
const BARRIER = { wood: 0x5c4632, dark: 0x2b1c12, rope: 0xf6f1e3, gold: 0xc9a227, leaf: 0x3e5a3a, glow: 0xffd36a, glowAlpha: 0.22, signY: 140 } as const;

/** Draws barrier `b` standing on the floor at `ground` (room px), its sign drawn apart. */
function drawBarrier(g: Phaser.GameObjects.Graphics, b: Barrier, ground: number): void {
  const x0 = b.x;
  const x1 = b.x + b.w;
  const post = (x: number, h: number) => {
    g.fillStyle(BARRIER.dark, 1).fillRect(x - 6, ground - h, 12, h);
    g.fillStyle(BARRIER.wood, 1).fillRect(x - 4, ground - h + 2, 8, h - 2);
    g.fillStyle(BARRIER.gold, 1).fillCircle(x, ground - h, 5);
  };
  switch (b.kind) {
    case 'gate': {
      // Two low gate leaves between posts, a chain across and a padlock at the middle.
      post(x0, 110);
      post(x1, 110);
      g.lineStyle(5, BARRIER.wood, 1);
      for (let x = x0 + 12; x < x1 - 6; x += 12) g.lineBetween(x, ground - 96, x, ground - 4);
      g.lineStyle(6, BARRIER.dark, 1).lineBetween(x0, ground - 92, x1, ground - 92).lineBetween(x0, ground - 20, x1, ground - 20);
      g.lineStyle(3, BARRIER.gold, 1).lineBetween(x0, ground - 60, x1, ground - 56);
      const mx = (x0 + x1) / 2;
      g.fillStyle(BARRIER.gold, 1).fillRoundedRect(mx - 9, ground - 62, 18, 16, 3);
      g.lineStyle(3, BARRIER.gold, 1).strokeCircle(mx, ground - 64, 6);
      break;
    }
    case 'rope': {
      // A rope slung between two posts, sagging, a second one under it.
      post(x0, 96);
      post(x1, 96);
      for (const [y, sag] of [[86, 18], [50, 12]] as const) {
        const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(x0, ground - y), new Phaser.Math.Vector2((x0 + x1) / 2, ground - y + sag * 2), new Phaser.Math.Vector2(x1, ground - y));
        g.lineStyle(5, BARRIER.rope, 0.95);
        curve.draw(g, 24);
      }
      break;
    }
    case 'branch': {
      // A fallen branch lying across the way, propped on a stump, a twig and a few leaves up from it.
      g.fillStyle(BARRIER.dark, 1).fillRect(x0 + 6, ground - 34, 18, 34);
      g.fillStyle(BARRIER.dark, 1).fillTriangle(x0 - 10, ground - 36, x1 + 12, ground - 70, x1 + 12, ground - 52);
      g.fillStyle(BARRIER.dark, 1).fillTriangle(x0 - 10, ground - 36, x1 + 12, ground - 52, x0 - 6, ground - 22);
      g.lineStyle(10, BARRIER.wood, 1).lineBetween(x0 - 8, ground - 30, x1 + 10, ground - 62);
      g.lineStyle(5, BARRIER.wood, 1).lineBetween((x0 + x1) / 2, ground - 46, (x0 + x1) / 2 + 14, ground - 104);
      const mx = (x0 + x1) / 2;
      g.fillStyle(BARRIER.leaf, 1);
      for (const [lx, ly] of [[mx + 14, 104], [mx + 22, 96], [mx + 6, 96], [x0 - 10, 40], [x1 + 8, 74]] as const) g.fillEllipse(lx, ground - ly, 16, 10);
      break;
    }
    case 'boards': {
      // Planks nailed across the arch, crossing, with gaps the glow shows through.
      const h = 150;
      g.fillStyle(BARRIER.dark, 0.55).fillRect(x0, ground - h, b.w, h);
      for (const [y, tilt] of [[h - 22, -10], [h - 62, 8], [h - 104, -6], [32, 6]] as const) {
        g.fillStyle(BARRIER.dark, 1).fillPoints([{ x: x0 - 6, y: ground - y - 9 + tilt }, { x: x1 + 6, y: ground - y - 9 - tilt }, { x: x1 + 6, y: ground - y + 9 - tilt }, { x: x0 - 6, y: ground - y + 9 + tilt }], true);
        g.fillStyle(BARRIER.wood, 1).fillPoints([{ x: x0 - 4, y: ground - y - 7 + tilt }, { x: x1 + 4, y: ground - y - 7 - tilt }, { x: x1 + 4, y: ground - y + 7 - tilt }, { x: x0 - 4, y: ground - y + 7 + tilt }], true);
        g.fillStyle(BARRIER.gold, 1).fillCircle(x0 + 6, ground - y + tilt, 2.5).fillCircle(x1 - 6, ground - y - tilt, 2.5);
      }
      break;
    }
  }
}

/** A stairhead going down through the boardwalk from x to x + w (OP-220): the opening, its first treads, a post each side and a rail. */
function drawLanding(g: Phaser.GameObjects.Graphics, x: number, w: number, ground: number): void {
  g.fillStyle(0x07122a, 0.92).fillRect(x + 8, ground - 2, w - 16, 64);
  g.fillStyle(BARRIER.wood, 1);
  for (let i = 0; i < 4; i++) g.fillRect(x + 12 + i * 12, ground + 6 + i * 14, w - 24 - i * 24, 6);
  for (const px of [x + 4, x + w - 4]) {
    g.fillStyle(BARRIER.dark, 1).fillRect(px - 5, ground - 64, 10, 64);
    g.fillStyle(BARRIER.gold, 1).fillCircle(px, ground - 66, 5);
  }
  g.lineStyle(5, BARRIER.wood, 1).lineBetween(x + 4, ground - 58, x + w - 4, ground - 58);
}
