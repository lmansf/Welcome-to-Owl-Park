/**
 * A room whose floor is an oval bowl seen from almost straight above (RoomDef.bowl: the Great Hollow,
 * Nov 8, the owner's word: "It's still flat"). Drawn so the room reads as a space and not a flat
 * painting, the camera tipped a little toward the viewer:
 *
 * - the far wall shows its face, tallest at the very back and nothing at the two ends, lit at its top
 *   and darkening to its foot, its planks running down it;
 * - the wall's top runs all the way round, and at the front only the near wall's top shows, wider;
 * - the floor darkens toward the rim (the wall's shade at its foot), deepest under the near wall, which
 *   casts its shadow in over the front of the floor, and a little toward the back, so it recedes;
 * - the floor is the tree's heartwood: its growth rings bunch up toward the back and spread toward the
 *   front, and cracks run out across them, so the floor recedes under the owl wherever it stands;
 * - each Commons' colour pools softly on the floor by its ways, and the light falls brightest at the heart.
 *
 * Everything past the rim is covered, so the floor's texture never shows outside the oval. It is all one
 * canvas, painted once, a third of the room's size (it is soft shading: the wall's crisp lines are drawn
 * over it at full size), and drawn under the room's pieces and owls: an owl stands in front of the wall.
 */
import type Phaser from 'phaser';
import { KIT_ART, type RoomBowl, type RoomDef } from '@owl-park/shared';

/** The canvas is painted at this fraction of the room's size. */
export const BOWL_SCALE = 1 / 3;
/** How thick the wall's top is, round the rim (room px), and how much more it shows at the very front. */
export const CAP = 46;

/** The dark of the tree's wood past the wall, round the whole oval: what a camera drawn back past the room's edges shows too (townView.ts). */
export const BOWL_BEYOND = '#140d08';

/** The palette: the tree's inner wood, warm where lit. */
const C = {
  beyond: BOWL_BEYOND,
  capLit: '#8c6640',
  capShade: '#5a3d24',
  faceTop: '#6b4a2e',
  faceFoot: '#21150c',
  plank: 'rgba(12, 7, 3, 0.45)',
  plankLit: 'rgba(210, 170, 120, 0.18)',
  shade: [8, 5, 16] as const,
  wood: 'rgba(122, 85, 50, 0.26)',
  ring: 0x2a1708,
} as const;

/** The rim at angle `t` (0 east, clockwise on screen), and its outward normal. */
function rim(b: RoomBowl, t: number): { x: number; y: number } {
  return { x: b.cx + b.rx * Math.cos(t), y: b.cy + b.ry * Math.sin(t) };
}
function normal(b: RoomBowl, t: number): { x: number; y: number } {
  const nx = Math.cos(t) / b.rx;
  const ny = Math.sin(t) / b.ry;
  const l = Math.hypot(nx, ny);
  return { x: nx / l, y: ny / l };
}

/** How much of the wall's face shows at angle `t`: all of it at the very back, none from the ends round the front. */
export function faceAt(b: RoomBowl, t: number): number {
  return b.face * Math.max(0, -Math.sin(t));
}

/** The wall top's inner edge at `t`: over the face's top at the back, on the rim at the front. */
export function capInner(b: RoomBowl, t: number): { x: number; y: number } {
  const p = rim(b, t);
  return { x: p.x, y: p.y - faceAt(b, t) };
}

/** The wall top's outer edge at `t`: the cap's thickness out from its inner edge, thicker at the front. */
export function capOuter(b: RoomBowl, t: number): { x: number; y: number } {
  const p = capInner(b, t);
  const n = normal(b, t);
  const k = CAP + b.lip * Math.max(0, Math.sin(t));
  return { x: p.x + n.x * k, y: p.y + n.y * k };
}

const STEPS = 360;
const angles = (from = 0, to = 2 * Math.PI, steps = STEPS) => Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);

/** A closed curve as a path. */
function trace(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<{ x: number; y: number }>): void {
  pts.forEach((p, i) => {
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
}

const shade = (a: number) => `rgba(${C.shade[0]}, ${C.shade[1]}, ${C.shade[2]}, ${a})`;
const hex = (c: number, a: number) => `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;

/** Paints the bowl on a canvas of the room's size times `scale` (room px in, the context scaled). */
export function paintBowl(ctx: CanvasRenderingContext2D, room: Pick<RoomDef, 'size'>, b: RoomBowl, scale = BOWL_SCALE): void {
  const ts = angles();
  const floor = ts.map((t) => rim(b, t));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, room.size.w, room.size.h);

  // Beyond the wall: the tree's dark inside.
  ctx.fillStyle = C.beyond;
  ctx.fillRect(0, 0, room.size.w, room.size.h);

  // The wall's top, all the way round: lit along its inner edge, shaded toward its outer.
  ctx.beginPath();
  trace(
    ctx,
    ts.map((t) => capOuter(b, t)),
  );
  ctx.fillStyle = C.capShade;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  trace(
    ctx,
    ts.map((t) => capOuter(b, t)),
  );
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.capLit;
  ctx.lineWidth = CAP * 0.9;
  ctx.beginPath();
  trace(
    ctx,
    ts.map((t) => capInner(b, t)),
  );
  ctx.stroke();
  ctx.restore();

  // The far wall's face, between the cap and the rim: a strip down it at each step, lit at its top and
  // darkening to its foot, a plank's edge every few steps.
  const back = angles(Math.PI, 2 * Math.PI, 240);
  for (let i = 0; i + 1 < back.length; i++) {
    const [t0, t1] = [back[i]!, back[i + 1]!];
    const a0 = capInner(b, t0);
    const a1 = capInner(b, t1);
    const f0 = rim(b, t0);
    const f1 = rim(b, t1);
    if (f0.y - a0.y < 1 && f1.y - a1.y < 1) continue;
    const g = ctx.createLinearGradient(0, Math.min(a0.y, a1.y), 0, Math.max(f0.y, f1.y));
    g.addColorStop(0, C.faceTop);
    g.addColorStop(0.7, '#3a2716');
    g.addColorStop(1, C.faceFoot);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y - 1);
    ctx.lineTo(a1.x + 1, a1.y - 1);
    ctx.lineTo(f1.x + 1, f1.y + 2);
    ctx.lineTo(f0.x, f0.y + 2);
    ctx.closePath();
    ctx.fill();
    if (i % 5 === 0) {
      ctx.lineWidth = 7;
      ctx.strokeStyle = C.plank;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(f0.x, f0.y);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.plankLit;
      ctx.beginPath();
      ctx.moveTo(a0.x + 6, a0.y);
      ctx.lineTo(f0.x + 6, f0.y);
      ctx.stroke();
    }
  }

  // Openings in the near wall's top where a way goes out at the front: dark, the way beyond.
  for (const gap of b.gaps ?? []) {
    const t = Math.atan2((gap.y - b.cy) / b.ry, (gap.x - b.cx) / b.rx);
    const n = normal(b, t);
    const k = CAP + b.lip * Math.max(0, Math.sin(t));
    ctx.fillStyle = 'rgba(6, 3, 2, 0.92)';
    ctx.beginPath();
    ctx.ellipse(gap.x + (n.x * k) / 2, gap.y + (n.y * k) / 2, gap.w / 2, k / 2 + 6, Math.atan2(n.y, n.x) + Math.PI / 2, 0, 2 * Math.PI);
    ctx.fill();
  }

  // The floor shows through: cut it out of everything above.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  trace(ctx, floor);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Over the floor, kept inside it.
  ctx.save();
  ctx.beginPath();
  trace(ctx, floor);
  ctx.clip();

  // The floor is the tree's own heartwood under the leaf litter: a warm wash over it all.
  ctx.fillStyle = C.wood;
  ctx.fillRect(b.cx - b.rx, b.cy - b.ry, 2 * b.rx, 2 * b.ry);

  // It recedes: darker toward the back, lighter toward the front.
  const depth = ctx.createLinearGradient(0, b.cy - b.ry, 0, b.cy + b.ry);
  depth.addColorStop(0, shade(0.42));
  depth.addColorStop(0.45, shade(0.1));
  depth.addColorStop(1, shade(0));
  ctx.fillStyle = depth;
  ctx.fillRect(b.cx - b.rx, b.cy - b.ry, 2 * b.rx, 2 * b.ry);

  // Each Commons' colour pooled by its ways, and the warm light at the heart.
  ctx.globalCompositeOperation = 'lighter';
  for (const p of b.pools ?? []) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, hex(p.color, 0.16));
    g.addColorStop(0.6, hex(p.color, 0.06));
    g.addColorStop(1, hex(p.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(p.x - p.r, p.y - p.r, 2 * p.r, 2 * p.r);
  }
  ctx.globalCompositeOperation = 'source-over';

  // The wall's shade at its foot, all round: rings in from the rim, each a little darker.
  ctx.lineJoin = 'round';
  for (const [w, a] of [
    [420, 0.08],
    [260, 0.1],
    [150, 0.12],
    [70, 0.16],
    [24, 0.22],
  ] as const) {
    ctx.lineWidth = w;
    ctx.strokeStyle = shade(a);
    ctx.beginPath();
    trace(ctx, floor);
    ctx.stroke();
  }
  // The near wall's shadow, cast in over the front of the floor: deepest under it, gone by the middle.
  const front = angles(0, Math.PI, 180).map((t) => rim(b, t));
  for (const [w, a] of [
    [520, 0.1],
    [300, 0.12],
    [140, 0.16],
  ] as const) {
    ctx.lineWidth = w;
    ctx.strokeStyle = shade(a);
    ctx.beginPath();
    front.forEach((p, i) => {
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
  }
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** How much deeper an owl's shadow is drawn in a bowl room (Owl.setShadowDepth). */
export const BOWL_SHADOW = 2.4;

/** Where each of the bowl's layers is drawn: its canvas over the floor's texture, the grain over that, its lines over all. */
export const BOWL_DEPTH = { paint: -0.92, grain: -0.915, lines: -0.91 } as const;
/**
 * Where the shadows at the feet of what stands on the floor are drawn (OP-348): over a painting of the
 * whole room (artTrial.ts, between the lines and the floor's litter) and over the plaza rings, under
 * the pieces themselves. They were drawn with the grain, and the Great Hollow's painting covered them:
 * every root, doorway and idol stood on the floor with nothing under it.
 */
export const FOOT_SHADOW_DEPTH = -0.89;

/** How many growth rings cross the floor from the heart to the rim. */
export const RINGS = 14;
/** How many cracks (checks) run out across the rings, the way old wood splits from its heart. */
export const CHECKS = 30;
/**
 * How far the rings' middles rise toward the back as they shrink (a share of the oval's half height),
 * the way rings seen tipped away bunch up at the far side and spread at the near: the floor recedes
 * wherever an owl stands, not only by the walls.
 */
export const RING_RISE = 0.28;

/** A point on the floor's ring `k` (0 the heart, 1 the rim) at angle `t`, seen tipped away. */
export function ringPoint(b: RoomBowl, k: number, t: number): { x: number; y: number } {
  return { x: b.cx + k * b.rx * Math.cos(t), y: b.cy - (1 - k) * RING_RISE * b.ry + k * b.ry * Math.sin(t) };
}

/** A small, steady wobble so the rings read as grown wood and not a target (the same every time). */
function wobble(k: number, t: number): number {
  return 1 + 0.012 * Math.sin(5 * t + k * 7) + 0.008 * Math.sin(11 * t + k * 3);
}

/** Steady pseudo-random numbers in [0, 1), so the cracks are the same on every device. */
function steady(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The shadow each piece standing on the floor casts at its foot (a doorway, a root), soft-edged: it
 * stands up off the floor and does not lie painted on it.
 */
function drawFootShadows(g: Phaser.GameObjects.Graphics, pieces: RoomDef['pieces']): void {
  for (const p of pieces ?? []) {
    const art = KIT_ART[p.key];
    if (!art) continue;
    footShadow(g, p.x, p.y, ((art.right ?? art.w) - (art.left ?? 0)) * (p.scale ?? 1) * 0.9);
  }
}

/** One foot shadow: under something `w` wide whose foot stands at (x, y), soft-edged, on the floor. */
export function footShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number): void {
  const h = Math.min(70, w * 0.22);
  for (const [k, a] of [
    [1.25, 0.08],
    [1, 0.12],
    [0.7, 0.16],
  ] as const)
    g.fillStyle(0x000000, a).fillEllipse(x, y - h * 0.15, w * k, h * k);
}

/** The heartwood's grain over the floor, crisp at full size: its growth rings and the cracks across them. */
function drawGrain(g: Phaser.GameObjects.Graphics, b: RoomBowl): void {
  const ts = angles(0, 2 * Math.PI, 240);
  for (let i = 1; i <= RINGS; i++) {
    const k = (i - 0.35) / RINGS;
    const at = (dk: number) => ts.map((t) => ringPoint(b, k * wobble(k, t) + dk, t));
    // A shallow groove, soft at its edges, so it reads as grain and never as a step to jump.
    g.lineStyle(16, C.ring, 0.05).strokePoints(at(0), true, true);
    g.lineStyle(5, C.ring, 0.16).strokePoints(at(0), true, true);
  }
  for (let j = 0; j < CHECKS; j++) {
    const t = (j / CHECKS) * 2 * Math.PI + (steady(j) - 0.5) * 0.18;
    const k0 = 0.12 + steady(j + 50) * 0.35;
    const k1 = Math.min(0.94, k0 + 0.18 + steady(j + 90) * 0.4);
    const pts = Array.from({ length: 13 }, (_, i) => {
      const k = k0 + ((k1 - k0) * i) / 12;
      return ringPoint(b, k, t + 0.012 * Math.sin(i * 1.7 + j));
    });
    g.lineStyle(5, C.ring, 0.24).strokePoints(pts, false, false);
  }
}

/** Draws a bowl room's wall and shading (nothing for any other room); what it drew. */
export function drawBowl(
  scene: Phaser.Scene,
  room: RoomDef,
): { image: Phaser.GameObjects.Image; lines: Phaser.GameObjects.Graphics } | null {
  const b = room.bowl;
  if (!b) return null;
  const key = `bowl-${room.id}`;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, Math.ceil(room.size.w * BOWL_SCALE), Math.ceil(room.size.h * BOWL_SCALE));
    if (!tex) return null;
    paintBowl(tex.getContext(), room, b);
    tex.refresh();
  }
  const image = scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(room.size.w, room.size.h).setDepth(BOWL_DEPTH.paint);
  const grain = scene.add.graphics().setDepth(BOWL_DEPTH.grain);
  drawGrain(grain, b);
  drawFootShadows(scene.add.graphics().setDepth(FOOT_SHADOW_DEPTH), room.pieces);
  // The wall's edges, crisp at full size: the lit lip of its top, the dark line of its foot along the back.
  const ts = angles(0, 2 * Math.PI, 240);
  const lines = scene.add.graphics().setDepth(BOWL_DEPTH.lines);
  lines.lineStyle(4, 0xe0bf8c, 0.6).strokePoints(
    ts.map((t) => capInner(b, t)),
    true,
    true,
  );
  lines.lineStyle(3, 0x0d0805, 0.7).strokePoints(
    ts.map((t) => capOuter(b, t)),
    true,
    true,
  );
  lines.lineStyle(5, 0x0d0805, 0.55).strokePoints(
    angles(Math.PI, 2 * Math.PI, 160).map((t) => rim(b, t)),
    false,
    false,
  );
  return { image, lines };
}
