/**
 * The level assembler's rules (OP-234): how a room built from the art kit (RoomDef.kit) is drawn and
 * what it must hold to. The park draws `kitDrawPlan` with Phaser (apps/park/src/game/kitView.ts), the
 * greybox tool rasterizes the same plan (tools/kit/greybox.mjs), and the tests hold every kit room to
 * the barrier rule (`kitProblems`). Everything here is pure: room data in, pieces out.
 *
 * - A surface is a rectangle filled with a seamless texture, repeated from the room's origin, so two
 *   surfaces of one texture side by side read as one.
 * - A path or a ledge is a run from x0 to x1 at a height: its cap along the top (what says "stand
 *   here"), its mid under that, a slope at each end, and a trim hung along its front. A ledge is the
 *   room's perch of the same id (kitPerches); a stair draws its ledges as treads on posts instead.
 * - A doorway's piece stands centred on its trigger, its foot at the doorway's height; a barrier, a
 *   prop or a decal stands where it is placed.
 * - The backdrops are the room's tiles (kitRoom), so their parallax and fades are a painted room's.
 */
import { pointInPolygon } from './geometry';
import { KIT_ART, kitGroup, type KitTile } from './kitArt';
import type { Perch } from './perches';
import { ROOM_W, type KitBackdrop, type KitRun, type RoomDef, type RoomKit, type RoomTile } from './room';
import { perchTiers } from './routes';

/** How deep a ledge's mid is drawn when the ledge does not say (room px). */
export const KIT_LEDGE_DEPTH = 36;
/** Half the depth of a perch's strip on the floor plan, as the tree's ledges have it. */
export const KIT_STRIP = 4;
/** How far past the end of where an owl walks a drawn path may run before it must end at a barrier or a doorway (room px). */
export const KIT_PATH_SLACK = 16;
/** How near the end of a walk a barrier (or a doorway) must stand to close it (room px). */
export const KIT_BARRIER_REACH = 48;

/** Where a kit room draws a piece, from back to front (the park's depths, kitView.ts). */
export type KitLayer = 'back' | 'play' | 'piece' | 'front';

/** One piece as the room draws it: its art, its box in room pixels and how it fills that box. */
export interface KitDraw {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * `none`: the piece stretched to its box. Otherwise the piece at its own size, repeated across the
   * box on the axes it repeats on, counted from the room's origin, so neighbours line up.
   */
  tile: KitTile;
  layer: KitLayer;
  flip?: boolean;
  alpha?: number;
  /** What it is drawn for, and that thing's id (the greybox shades by it, the tests count by it). */
  role: 'surface' | 'path' | 'ledge' | 'stair' | 'door' | 'barrier' | 'prop' | 'decal';
  id: string;
}

/** One image of a drawn piece: where it stands (room px, at the piece's own size) and the part of the piece it shows (piece px). */
export interface KitCell {
  x: number;
  y: number;
  w: number;
  h: number;
  crop: { x: number; y: number; w: number; h: number };
}

/** The ledges of a kit room as perches: each one stood on, a strip of the floor plan along the ground line. */
export function kitPerches(kit: RoomKit): Perch[] {
  return (kit.ledges ?? [])
    .filter((l) => l.perch !== false)
    .map((l) => ({
      id: l.id,
      top: l.top,
      area: [
        { x: l.x0, y: kit.ground - KIT_STRIP },
        { x: l.x1, y: kit.ground - KIT_STRIP },
        { x: l.x1, y: kit.ground + KIT_STRIP },
        { x: l.x0, y: kit.ground + KIT_STRIP },
      ],
      ...(l.solid ? { solid: true } : {}),
    }));
}

/** A kit's backdrops as the room's tiles: one per screen each, those behind the owls and those in front. */
export function kitTiles(kit: RoomKit): { backgrounds: RoomTile[]; foregrounds: RoomTile[] } {
  const tiles = (list: KitBackdrop[]) =>
    list.flatMap((b) => {
      const out: RoomTile[] = [];
      for (let s = b.screens[0]; s <= b.screens[1]; s++) out.push({ key: b.key, x: s * ROOM_W, y: 0, ...(b.rate === 1 ? {} : { rate: b.rate }), ...(b.fade ? { fade: b.fade } : {}) });
      return out;
    });
  const all = kit.backdrops ?? [];
  return { backgrounds: tiles(all.filter((b) => !b.front)), foregrounds: tiles(all.filter((b) => b.front)) };
}

/** A room drawn from its kit: its backdrops become its tiles (its `background` the first of them), the rest of it as given. */
export function kitRoom(def: Omit<RoomDef, 'background' | 'backgrounds' | 'foregrounds' | 'foreground' | 'kit'> & { kit: RoomKit }): RoomDef {
  const { backgrounds, foregrounds } = kitTiles(def.kit);
  return { ...def, background: backgrounds[0]?.key ?? 'kit-back-sky-ground', backgrounds, ...(foregrounds.length ? { foregrounds } : {}) };
}

/** A piece's logical size (its catalogue size; a key outside the catalogue counts as 64 square). */
function sizeOf(key: string): { w: number; h: number; tile: KitTile } {
  return KIT_ART[key] ?? { w: 64, h: 64, tile: 'none' };
}

/** A run's pieces: the mid, the cap over it, the trim under the cap's lip, and the slopes at its ends. */
function runDraws(run: KitRun, ground: number, depth: number, role: 'path' | 'ledge', out: KitDraw[]): void {
  const y = ground - run.top;
  const w = run.x1 - run.x0;
  const cap = run.cap ? sizeOf(run.cap) : null;
  const capH = cap?.h ?? 0;
  if (run.mid && depth > capH) out.push({ key: run.mid, x: run.x0, y: y + capH, w, h: depth - capH, tile: sizeOf(run.mid).tile, layer: 'play', role, id: run.id });
  if (run.cap && cap) out.push({ key: run.cap, x: run.x0, y, w, h: cap.h, tile: cap.tile, layer: 'play', role, id: run.id });
  if (run.trim) {
    const t = sizeOf(run.trim);
    out.push({ key: run.trim, x: run.x0, y: y + capH, w, h: t.h, tile: t.tile, layer: 'play', role, id: run.id });
  }
  if (run.slope) {
    const s = sizeOf(run.slope);
    out.push({ key: run.slope, x: run.x0 - s.w, y, w: s.w, h: s.h, tile: 'none', layer: 'play', role, id: run.id });
    out.push({ key: run.slope, x: run.x1, y, w: s.w, h: s.h, tile: 'none', layer: 'play', flip: true, role, id: run.id });
  }
}

/** Every piece a kit room draws, back to front (backdrops aside: they are the room's tiles). Empty for a painted room. */
export function kitDrawPlan(room: Pick<RoomDef, 'kit' | 'doors' | 'size'>): KitDraw[] {
  const kit = room.kit;
  if (!kit) return [];
  const out: KitDraw[] = [];
  const g = kit.ground;
  for (const s of kit.surfaces ?? []) out.push({ key: s.texture, ...s.rect, tile: sizeOf(s.texture).tile, layer: 'back', role: 'surface', id: s.id });
  for (const p of kit.paths ?? []) runDraws(p, g, p.depth ?? room.size.h - (g - p.top), 'path', out);
  const treads = new Map<string, { stair: string; tread: string | undefined; post: string | undefined }>();
  for (const st of kit.stairs ?? []) for (const id of st.treads) treads.set(id, { stair: st.id, tread: st.tread, post: st.post });
  for (const l of kit.ledges ?? []) {
    const st = treads.get(l.id);
    if (!st) {
      runDraws(l, g, l.depth ?? KIT_LEDGE_DEPTH, 'ledge', out);
      continue;
    }
    // A tread: its post down to the ground from under its middle, then the tread over it.
    const y = g - l.top;
    const tread = st.tread ? sizeOf(st.tread) : null;
    if (st.post && l.top > 0) {
      const p = sizeOf(st.post);
      out.push({ key: st.post, x: Math.round((l.x0 + l.x1) / 2 - p.w / 2), y: y + (tread?.h ?? 0), w: p.w, h: l.top - (tread?.h ?? 0), tile: p.tile, layer: 'play', role: 'stair', id: st.stair });
    }
    if (st.tread && tread) out.push({ key: st.tread, x: l.x0, y, w: l.x1 - l.x0, h: tread.h, tile: tread.tile, layer: 'play', role: 'stair', id: st.stair });
  }
  for (const d of kit.doors ?? []) {
    const door = room.doors.find((x) => x.id === d.door);
    if (!door) continue;
    const s = sizeOf(d.piece);
    const foot = g - (door.top ?? 0);
    out.push({ key: d.piece, x: Math.round(door.rect.x + door.rect.w / 2 - s.w / 2), y: foot - s.h, w: s.w, h: s.h, tile: 'none', layer: 'piece', role: 'door', id: d.door });
  }
  for (const b of kit.barriers ?? []) {
    const s = sizeOf(b.piece);
    const foot = g - b.top;
    out.push({ key: b.piece, x: b.x0, y: foot - s.h, w: b.x1 - b.x0, h: s.h, tile: s.tile === 'x' || s.tile === 'xy' ? 'x' : 'none', layer: 'piece', role: 'barrier', id: b.id });
  }
  for (const p of kit.props ?? []) {
    const s = sizeOf(p.piece);
    out.push({ key: p.piece, x: Math.round(p.x - s.w / 2), y: g - p.top - s.h, w: s.w, h: s.h, tile: 'none', layer: p.front ? 'front' : 'piece', ...(p.flip ? { flip: true } : {}), role: 'prop', id: p.id });
  }
  for (const [i, d] of (kit.decals ?? []).entries()) {
    const s = sizeOf(d.piece);
    out.push({ key: d.piece, x: Math.round(d.x - s.w / 2), y: Math.round(d.y - s.h / 2), w: s.w, h: s.h, tile: 'none', layer: d.front ? 'front' : 'piece', ...(d.alpha === undefined ? {} : { alpha: d.alpha }), role: 'decal', id: `${d.piece}-${i}` });
  }
  return out;
}

/**
 * The images a drawn piece takes: one for a piece stretched to its box; for a repeating one, a cell
 * per repeat the box covers, counted from the room's origin, each cropped to the box.
 */
export function kitCells(d: KitDraw): KitCell[] {
  const s = sizeOf(d.key);
  if (d.tile === 'none') return [{ x: d.x, y: d.y, w: d.w, h: d.h, crop: { x: 0, y: 0, w: s.w, h: s.h } }];
  const across = d.tile === 'x' || d.tile === 'xy';
  const down = d.tile === 'y' || d.tile === 'xy';
  // Along an axis it does not repeat on, a piece is anchored to the box and drawn its own size.
  const cw = across ? s.w : d.w;
  const ch = down ? s.h : d.h;
  const x0 = across ? Math.floor(d.x / s.w) * s.w : d.x;
  const y0 = down ? Math.floor(d.y / s.h) * s.h : d.y;
  const cells: KitCell[] = [];
  for (let y = y0; y < d.y + d.h; y += ch) {
    for (let x = x0; x < d.x + d.w; x += cw) {
      const ix0 = Math.max(x, d.x);
      const iy0 = Math.max(y, d.y);
      const ix1 = Math.min(x + cw, d.x + d.w);
      const iy1 = Math.min(y + ch, d.y + d.h);
      if (ix1 <= ix0 || iy1 <= iy0) continue;
      // Crop in the piece's own pixels: a cell stretched along an axis it does not repeat on scales its crop.
      const kx = s.w / cw;
      const ky = s.h / ch;
      cells.push({ x, y, w: cw, h: ch, crop: { x: (ix0 - x) * kx, y: (iy0 - y) * ky, w: (ix1 - ix0) * kx, h: (iy1 - iy0) * ky } });
    }
  }
  return cells;
}

/** Every art key a kit room draws: its pieces and its backdrops, once each. */
export function kitArtKeys(room: Pick<RoomDef, 'kit' | 'doors' | 'size'>): string[] {
  if (!room.kit) return [];
  return [...new Set([...kitDrawPlan(room).map((d) => d.key), ...(room.kit.backdrops ?? []).map((b) => b.key)])];
}

/** What drawing a kit room costs: its images (the draw's objects), its textures and their decoded bytes at `scale` texture px per room px. */
export function kitCost(room: Pick<RoomDef, 'kit' | 'doors' | 'size'>, scale: number): { images: number; textures: number; bytes: number } {
  const plan = kitDrawPlan(room);
  const keys = kitArtKeys(room);
  const tiles = room.kit ? kitTiles(room.kit) : { backgrounds: [], foregrounds: [] };
  const images = plan.reduce((n, d) => n + kitCells(d).length, 0) + tiles.backgrounds.length + tiles.foregrounds.length;
  const bytes = keys.reduce((n, k) => n + Math.ceil(sizeOf(k).w * scale) * Math.ceil(sizeOf(k).h * scale) * 4, 0);
  return { images, textures: keys.length, bytes };
}

/** The stretches of a height an owl walks along x: the floor's (top 0) across its walkable polygons at the ground line, a perch's its own. */
export function walkedAt(room: Pick<RoomDef, 'walkable' | 'perches'>, ground: number, top: number, x0: number, x1: number): Array<[number, number]> {
  const inside =
    top === 0
      ? (x: number) => room.walkable.some((poly) => pointInPolygon({ x, y: ground }, poly))
      : (x: number) => (room.perches ?? []).some((p) => p.top === top && pointInPolygon({ x, y: ground }, p.area));
  const runs: Array<[number, number]> = [];
  let from: number | null = null;
  let last = x0;
  // Sampled every 2 px: a run's ends are found to within that.
  for (let x = Math.floor(x0); x <= x1; x += 2) {
    const on = inside(x);
    if (on && from === null) from = x;
    if (!on && from !== null) {
      runs.push([from, last]);
      from = null;
    }
    last = x;
  }
  if (from !== null) runs.push([from, last]);
  return runs;
}

/**
 * What is wrong with a kit room, as sentences (none for a room that holds to the rules, or a painted
 * room). The barrier rule: a drawn ledge or path that an owl cannot reach, or that leads nowhere, has
 * a barrier piece at its foot.
 *
 * - A ledge an owl cannot stand on (`perch: false`), or whose perch no route from the floor reaches
 *   (perchTiers), has a barrier under or on it, across part of its span.
 * - A path drawn past the end of where an owl walks along it (by more than KIT_PATH_SLACK) leads
 *   nowhere there unless a doorway at that height stands at the end: a barrier at that height stands
 *   within KIT_BARRIER_REACH of the end. A path no owl walks at all has a barrier across it.
 *
 * Also: every key is a kit key of the catalogue, every stair's treads, doorway's door and perch are
 * the room's, and every stretch of floor an owl walks is drawn (a path at top 0 covers it).
 */
export function kitProblems(room: RoomDef): string[] {
  const kit = room.kit;
  if (!kit) return [];
  const out: string[] = [];
  const g = kit.ground;
  const barriers = kit.barriers ?? [];
  const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
  const barrierAt = (x0: number, x1: number, maxTop: number, minTop = 0) => barriers.some((b) => overlaps(b.x0, b.x1, x0, x1) && b.top <= maxTop && b.top >= minTop);

  for (const key of [...kitArtKeys(room)]) {
    if (!kitGroup(key)) out.push(`${key} is not a kit key (kit-<group>-<name>)`);
    else if (!KIT_ART[key]) out.push(`${key} is not in the kit's catalogue (KIT_ART)`);
  }
  const ledgeIds = new Set((kit.ledges ?? []).map((l) => l.id));
  for (const st of kit.stairs ?? []) for (const t of st.treads) if (!ledgeIds.has(t)) out.push(`stair ${st.id}'s tread ${t} is no ledge`);
  for (const d of kit.doors ?? []) if (!room.doors.some((x) => x.id === d.door)) out.push(`door piece ${d.piece} stands at ${d.door}, which is no doorway of the room`);

  // Ledges: stood on and reached, or barred.
  const tiers = perchTiers(room);
  for (const l of kit.ledges ?? []) {
    const perch = (room.perches ?? []).find((p) => p.id === l.id);
    if (l.perch !== false && !perch) {
      out.push(`ledge ${l.id} is drawn but the room has no perch ${l.id}`);
      continue;
    }
    const reached = l.perch !== false && tiers[l.id] !== null && tiers[l.id] !== undefined;
    if (!reached && !barrierAt(l.x0, l.x1, l.top)) out.push(`ledge ${l.id} is drawn where no owl reaches it, with no barrier at its foot`);
  }

  // Paths: walked to their ends, or ending at a doorway or a barrier.
  const doorAt = (x: number, top: number) =>
    room.doors.some((d) => (d.top ?? 0) === top && d.rect.x - KIT_BARRIER_REACH <= x && x <= d.rect.x + d.rect.w + KIT_BARRIER_REACH);
  const closed = (x: number, top: number) => doorAt(x, top) || barriers.some((b) => b.top === top && overlaps(b.x0, b.x1, x - KIT_BARRIER_REACH, x + KIT_BARRIER_REACH));
  for (const p of kit.paths ?? []) {
    const walked = walkedAt(room, g, p.top, p.x0, p.x1);
    if (!walked.length) {
      if (!barrierAt(p.x0, p.x1, p.top)) out.push(`path ${p.id} is drawn where no owl walks, with no barrier at its foot`);
      continue;
    }
    for (const [a, b] of walked) {
      if (a - p.x0 > KIT_PATH_SLACK && !closed(a, p.top)) out.push(`path ${p.id} leads nowhere west of x ${a}: no barrier or doorway at the end of the walk`);
      if (p.x1 - b > KIT_PATH_SLACK && !closed(b, p.top)) out.push(`path ${p.id} leads nowhere east of x ${b}: no barrier or doorway at the end of the walk`);
    }
  }

  // The floor an owl walks is drawn.
  const floorPaths = (kit.paths ?? []).filter((p) => p.top === 0);
  for (const [a, b] of walkedAt(room, g, 0, 0, room.size.w)) {
    for (let x = a; x <= b; x += 8) {
      if (!floorPaths.some((p) => p.x0 <= x && x <= p.x1)) {
        out.push(`the floor at x ${x} is walked but not drawn`);
        break;
      }
    }
  }
  return out;
}
