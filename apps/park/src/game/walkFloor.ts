/**
 * Where an owl can walk in a room seen from above, drawn plainly (the owner's ask, Nov 7: no clear line
 * between walkable and blocked ground in the top-down rooms). Everything off the floor is veiled darker,
 * the floor's edge is drawn as a soft bright line, and a solid perch (a stump, a planter: hop up, never
 * walk through) is veiled and edged in amber. It is drawn from the very shapes the owl's walk is held to
 * (the room's walkable floor and its perches), so what shows and what stops the owl never differ.
 *
 * With size boxes on (`?sizes=1`) the floor is tinted too and the edges are stronger, since the boxes
 * show no painting of a floor to read.
 */
import type Phaser from 'phaser';
import type { Polygon, RoomDef } from '@owl-park/shared';

/** How strongly each part is drawn, with the painting under it or with size boxes. */
export function floorLook(boxes: boolean): {
  veil: string;
  floor: string | null;
  edge: string;
  edgePx: number;
  solid: string;
  solidEdge: string;
} {
  return boxes
    ? {
        veil: 'rgba(4, 8, 18, 0.62)',
        floor: 'rgba(120, 220, 140, 0.16)',
        edge: 'rgba(157, 255, 176, 0.95)',
        edgePx: 6,
        solid: 'rgba(4, 8, 18, 0.5)',
        solidEdge: 'rgba(255, 190, 90, 0.95)',
      }
    : {
        veil: 'rgba(6, 12, 28, 0.38)',
        floor: null,
        edge: 'rgba(255, 244, 214, 0.55)',
        edgePx: 5,
        solid: 'rgba(6, 12, 28, 0.22)',
        solidEdge: 'rgba(255, 200, 120, 0.6)',
      };
}

/** The canvas is drawn at half the room's size: the veil is soft, and a wide room costs a quarter of its pixels. */
const SCALE = 0.5;

/** Paints the floor plan on a canvas of the room's size times SCALE. */
export function paintFloor(ctx: CanvasRenderingContext2D, room: Pick<RoomDef, 'size' | 'walkable' | 'perches'>, boxes: boolean): void {
  const look = floorLook(boxes);
  const w = room.size.w * SCALE;
  const h = room.size.h * SCALE;
  const trace = (poly: Polygon) => {
    poly.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x * SCALE, p.y * SCALE);
      else ctx.lineTo(p.x * SCALE, p.y * SCALE);
    });
    ctx.closePath();
  };
  ctx.clearRect(0, 0, w, h);
  // The veil: the whole room less its floor (even-odd: the floor's shapes cut holes in it).
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  for (const poly of room.walkable) trace(poly);
  ctx.fillStyle = look.veil;
  ctx.fill('evenodd');
  if (look.floor) {
    ctx.beginPath();
    for (const poly of room.walkable) trace(poly);
    ctx.fillStyle = look.floor;
    ctx.fill('nonzero');
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = look.edgePx * SCALE;
  ctx.strokeStyle = look.edge;
  ctx.beginPath();
  for (const poly of room.walkable) trace(poly);
  ctx.stroke();
  // Solid perches: in the floor's way, hopped up onto.
  const solids = (room.perches ?? []).filter((p) => p.solid);
  if (solids.length) {
    ctx.beginPath();
    for (const p of solids) trace(p.area);
    ctx.fillStyle = look.solid;
    ctx.fill('nonzero');
    ctx.strokeStyle = look.solidEdge;
    ctx.stroke();
  }
}

/** Draws the floor plan over the room's painting, under its pieces and owls. Returns the image, or null where it cannot. */
export function drawWalkFloor(scene: Phaser.Scene, room: RoomDef, boxes: boolean, depth: number): Phaser.GameObjects.Image | null {
  if (!room.walkable.length) return null;
  const key = `walk-floor-${room.id}${boxes ? '-boxes' : ''}`;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, Math.ceil(room.size.w * SCALE), Math.ceil(room.size.h * SCALE));
    if (!tex) return null;
    paintFloor(tex.getContext(), room, boxes);
    tex.refresh();
  }
  return scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(room.size.w, room.size.h).setDepth(depth);
}
