/**
 * Where an owl can walk in a room seen from above, drawn plainly (the owner's ask, Nov 7: no clear line
 * between walkable and blocked ground in the top-down rooms). The floor's edge is drawn as a soft bright
 * line, and a solid perch (a stump, a planter: hop up, never walk through) is edged in amber. It is drawn
 * from the very shapes the owl's walk is held to (the room's walkable floor and its perches), so what
 * shows and what stops the owl never differ.
 *
 * With the painting the edges are lines and nothing more (drawFloorEdges): a veil over the whole screen
 * costs a slow device a frame's worth of drawing, and slowed the park's timed games in CI. With size
 * boxes on (`?sizes=1`), a tool for laying out the map, everything off the floor is veiled darker, the
 * floor is tinted and the edges are stronger, since the boxes show no painting of a floor to read.
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

/** A colour as rgba() in floorLook, as Phaser takes it: the colour and its alpha. */
export function rgba(css: string): { color: number; alpha: number } {
  const [r = 0, g = 0, b = 0, a = 1] = (css.match(/[\d.]+/g) ?? []).map(Number);
  return { color: (r << 16) | (g << 8) | b, alpha: a };
}

/**
 * The floor's edge in a room whose painting has a wall all the way round its floor (RoomDef.bowl, the
 * Great Hollow). The wall's foot already shows where the floor ends, and the cream line drawn along it
 * read there as an outline left in by mistake (the owner's audit of Nov 12, OP-370: "bright polygon
 * lines"). So in such a room the edge is a worn groove at the wall's foot: a dark line with a soft
 * shade round it, still there to see where the owl stops (the owner's ask of Nov 7) and never brighter
 * than the floor it lies on.
 *
 * TODO-DOCS (OP-370): docs/ARCHITECTURE.md's note on the floor's edge line says it is cream in every
 * room seen from above; in a room with a bowl it is this groove.
 */
export const BOWL_EDGE = { line: 'rgba(46, 24, 8, 0.4)', linePx: 4, shade: 'rgba(46, 24, 8, 0.13)', shadePx: 14 } as const;

/** Draws the floor's edges as lines over the painting: the floor's in cream (a groove where a wall stands all round it), a solid perch's in amber. */
export function drawFloorEdges(scene: Phaser.Scene, room: RoomDef, depth: number): Phaser.GameObjects.Graphics {
  const look = floorLook(false);
  const g = scene.add.graphics().setDepth(depth);
  if (room.bowl) {
    const shade = rgba(BOWL_EDGE.shade);
    g.lineStyle(BOWL_EDGE.shadePx, shade.color, shade.alpha);
    for (const poly of room.walkable) g.strokePoints(poly, true, true);
    const line = rgba(BOWL_EDGE.line);
    g.lineStyle(BOWL_EDGE.linePx, line.color, line.alpha);
  } else {
    const edge = rgba(look.edge);
    g.lineStyle(look.edgePx, edge.color, edge.alpha);
  }
  for (const poly of room.walkable) g.strokePoints(poly, true, true);
  const solid = rgba(look.solidEdge);
  g.lineStyle(look.edgePx, solid.color, solid.alpha);
  for (const p of (room.perches ?? []).filter((x) => x.solid)) {
    // A perch its own art stands on (a root of the Great Hollow) is shown by that art and the shadow
    // at its foot: an amber box drawn round its strip of floor read as a mark left in by mistake (OP-348).
    if (standsOwnArt(room, p.id)) footprint(g, p.area);
    else g.strokePoints(p.area, true, true);
  }
  return g;
}

/** The floor under a perch that has its own art: darkened a little, so what cannot be walked through is still there to see. */
export const FOOTPRINT = { color: 0x140a04, alpha: 0.2 } as const;

/** A perch's strip of floor as a soft shadow: its box with rounded ends, and a smaller one inside it, darker. */
function footprint(g: Phaser.GameObjects.Graphics, area: Polygon): void {
  const xs = area.map((q) => q.x);
  const ys = area.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  g.fillStyle(FOOTPRINT.color, FOOTPRINT.alpha).fillRoundedRect(x - 6, y - 2, w + 12, h + 6, Math.min(h / 2 + 3, (w + 12) / 2));
  g.fillStyle(FOOTPRINT.color, FOOTPRINT.alpha * 0.7).fillRoundedRect(x + 8, y + 4, Math.max(0, w - 16), Math.max(0, h - 6), Math.max(0, Math.min((h - 6) / 2, (w - 16) / 2)));
}

/** Whether a perch has a piece of the room's own standing on it (the same id): its art is what shows it. */
export function standsOwnArt(room: Pick<RoomDef, 'pieces'>, perchId: string): boolean {
  return (room.pieces ?? []).some((p) => p.id === perchId);
}

/**
 * Draws the floor plan over the room, under its pieces and owls: its edges alone over the painting, the
 * whole plan with size boxes on. Returns what it drew, or null where the room has no floor.
 */
export function drawWalkFloor(
  scene: Phaser.Scene,
  room: RoomDef,
  boxes: boolean,
  depth: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics | null {
  if (!room.walkable.length) return null;
  if (!boxes) return drawFloorEdges(scene, room, depth);
  const key = `walk-floor-${room.id}${boxes ? '-boxes' : ''}`;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, Math.ceil(room.size.w * SCALE), Math.ceil(room.size.h * SCALE));
    if (!tex) return null;
    paintFloor(tex.getContext(), room, boxes);
    tex.refresh();
  }
  return scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(room.size.w, room.size.h).setDepth(depth);
}
