/**
 * Drawing for the party game's screens (OP-314) on a 2D canvas: size boxes, the look every piece of the
 * map's art has until its art comes (sizeBoxes.ts: a pale gold box with its name and size on it), and
 * a simple owl in an owl's own colours, since owls keep their own look.
 */
import type { PartyLook } from '@owl-park/shared';

export const BOX_FILL = 'rgba(255,211,106,.10)';
export const BOX_EDGE = '#ffd36a';

/** A size box: the piece's name and, under it, its size (`w×h` unless `dims` says otherwise). */
export function sizeBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, name: string, o: { fill?: string; edge?: string; font?: number; dims?: string } = {}): void {
  ctx.fillStyle = o.fill ?? BOX_FILL;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = o.edge ?? BOX_EDGE;
  ctx.lineWidth = Math.max(1, Math.min(3, w / 40));
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const size = o.font ?? 12;
  ctx.fillStyle = o.edge ?? BOX_EDGE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px system-ui,sans-serif`;
  const cx = x + w / 2;
  ctx.fillText(name, cx, y + h / 2 - size * 0.55, w - 4);
  ctx.font = `500 ${Math.max(8, size * 0.85)}px system-ui,sans-serif`;
  ctx.fillText(o.dims ?? `${Math.round(w)}×${Math.round(h)}`, cx, y + h / 2 + size * 0.6, w - 4);
}

/** A simple owl, facing out: its body, belly, eyes and beak in its own colours; `ring` marks the owl whose turn it is. */
export function drawOwl(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, look: PartyLook, ring = false): void {
  ctx.save();
  if (ring) {
    ctx.strokeStyle = '#FFD36A';
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Ear tufts.
  ctx.fillStyle = look.body;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * r * 0.55, y - r * 0.55);
    ctx.lineTo(x + s * r * 0.75, y - r * 1.15);
    ctx.lineTo(x + s * r * 0.2, y - r * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.belly;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.3, r * 0.55, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#F6F1E3';
    ctx.beginPath();
    ctx.arc(x + s * r * 0.33, y - r * 0.3, r * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0C1E36';
    ctx.beginPath();
    ctx.arc(x + s * r * 0.33, y - r * 0.28, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = look.accent;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.12, y - r * 0.1);
  ctx.lineTo(x + r * 0.12, y - r * 0.1);
  ctx.lineTo(x, y + r * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
